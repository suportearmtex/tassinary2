/*
  # Sistema Administrativo Completo

  1. Novas Tabelas
    - `admin_logs` - Logs de ações administrativas
    - `password_reset_tokens` - Tokens para reset de senha

  2. Funções
    - Função para verificar se usuário é admin
    - Função para registrar logs administrativos
    - Triggers para auditoria

  3. Segurança
    - RLS habilitado em todas as tabelas
    - Políticas específicas para administradores
    - Logs de auditoria para todas as ações
*/

-- Criar tabela de logs administrativos
CREATE TABLE IF NOT EXISTS admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Criar tabela de tokens de reset de senha
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Função para verificar se usuário é admin
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para registrar logs administrativos
CREATE OR REPLACE FUNCTION log_admin_action(
  admin_id uuid,
  target_id uuid,
  action_type text,
  action_details jsonb DEFAULT '{}',
  ip_addr inet DEFAULT NULL,
  user_agent_str text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO admin_logs (
    admin_user_id,
    target_user_id,
    action,
    details,
    ip_address,
    user_agent
  ) VALUES (
    admin_id,
    target_id,
    action_type,
    action_details,
    ip_addr,
    user_agent_str
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Políticas para admin_logs
CREATE POLICY "Admins can read all logs"
  ON admin_logs
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "System can insert logs"
  ON admin_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Políticas para password_reset_tokens
CREATE POLICY "Admins can manage reset tokens"
  ON password_reset_tokens
  FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()));

-- Trigger para log automático de alterações na tabela users
CREATE OR REPLACE FUNCTION log_user_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Log apenas se houve mudanças significativas
    IF OLD.role != NEW.role OR OLD.email != NEW.email OR OLD.full_name != NEW.full_name THEN
      PERFORM log_admin_action(
        auth.uid(),
        NEW.id,
        'user_updated',
        jsonb_build_object(
          'old_values', row_to_json(OLD),
          'new_values', row_to_json(NEW),
          'changed_fields', (
            SELECT jsonb_object_agg(key, value)
            FROM jsonb_each(to_jsonb(NEW))
            WHERE to_jsonb(NEW) ->> key != to_jsonb(OLD) ->> key
          )
        )
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_admin_action(
      auth.uid(),
      OLD.id,
      'user_deleted',
      jsonb_build_object('deleted_user', row_to_json(OLD))
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger para auditoria
DROP TRIGGER IF EXISTS audit_user_changes ON users;
CREATE TRIGGER audit_user_changes
  AFTER UPDATE OR DELETE ON users
  FOR EACH ROW
  EXECUTE FUNCTION log_user_changes();

-- Função para gerar token de reset de senha
CREATE OR REPLACE FUNCTION generate_password_reset_token(target_user_id uuid)
RETURNS text AS $$
DECLARE
  reset_token text;
BEGIN
  -- Verificar se o usuário atual é admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem gerar tokens de reset';
  END IF;

  -- Gerar token único
  reset_token := encode(gen_random_bytes(32), 'hex');

  -- Invalidar tokens anteriores
  UPDATE password_reset_tokens 
  SET used = true 
  WHERE user_id = target_user_id AND used = false;

  -- Inserir novo token (válido por 24 horas)
  INSERT INTO password_reset_tokens (
    user_id,
    token,
    expires_at,
    created_by
  ) VALUES (
    target_user_id,
    reset_token,
    now() + interval '24 hours',
    auth.uid()
  );

  -- Log da ação
  PERFORM log_admin_action(
    auth.uid(),
    target_user_id,
    'password_reset_token_generated',
    jsonb_build_object('token_expires_at', now() + interval '24 hours')
  );

  RETURN reset_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para validar e usar token de reset
CREATE OR REPLACE FUNCTION validate_reset_token(token_value text)
RETURNS uuid AS $$
DECLARE
  token_record password_reset_tokens;
BEGIN
  -- Buscar token válido
  SELECT * INTO token_record
  FROM password_reset_tokens
  WHERE token = token_value
    AND used = false
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token inválido ou expirado';
  END IF;

  -- Marcar token como usado
  UPDATE password_reset_tokens
  SET used = true
  WHERE id = token_record.id;

  RETURN token_record.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_user_id ON admin_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target_user_id ON admin_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);