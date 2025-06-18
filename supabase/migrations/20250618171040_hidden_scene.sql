/*
  # Atualizar campo role para usar enum

  1. Alterações
    - Criar tipo enum para roles
    - Atualizar coluna role para usar o enum
    - Manter dados existentes
    - Atualizar constraints

  2. Segurança
    - Manter políticas RLS existentes
    - Garantir integridade dos dados
*/

-- Criar tipo enum para roles
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'professional', 'receptionist');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Atualizar a coluna role para usar o enum
DO $$
BEGIN
  -- Primeiro, verificar se a coluna existe e não é já do tipo enum
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'role' 
    AND data_type = 'text'
  ) THEN
    -- Remover constraint existente se houver
    ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_role;
    
    -- Alterar o tipo da coluna para o enum
    ALTER TABLE users 
    ALTER COLUMN role TYPE user_role 
    USING role::user_role;
    
    -- Definir valor padrão
    ALTER TABLE users 
    ALTER COLUMN role SET DEFAULT 'professional'::user_role;
  END IF;
END $$;

-- Função para verificar se usuário é admin (atualizada para usar enum)
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = user_id AND role = 'admin'::user_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para fazer o primeiro usuário admin automaticamente
CREATE OR REPLACE FUNCTION make_first_user_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- Se esta é a primeira entrada na tabela users, tornar admin
  IF (SELECT COUNT(*) FROM users) = 1 THEN
    NEW.role = 'admin'::user_role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger para fazer o primeiro usuário admin (se não existir)
DROP TRIGGER IF EXISTS make_first_user_admin_trigger ON users;
CREATE TRIGGER make_first_user_admin_trigger
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION make_first_user_admin();

-- Comentários para documentação
COMMENT ON TYPE user_role IS 'Enum para definir os tipos de usuário: admin (administrador), professional (profissional), receptionist (recepcionista)';
COMMENT ON COLUMN users.role IS 'Nível de acesso do usuário no sistema';