/*
  # Create message templates table
  
  1. New Tables
    - `message_templates`
      - `id` (uuid, primary key)
      - `type` (text) - Type of message (confirmation, reminder_24h, reminder_1h, cancellation)
      - `content` (text) - Message template content
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
  
  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

CREATE TABLE IF NOT EXISTS message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_type CHECK (type IN ('confirmation', 'reminder_24h', 'reminder_1h', 'cancellation'))
);

-- Enable RLS
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated users to read message templates"
  ON message_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to update message templates"
  ON message_templates
  FOR UPDATE
  TO authenticated
  USING (true);

-- Create trigger for updating updated_at
CREATE TRIGGER update_message_templates_updated_at
  BEFORE UPDATE ON message_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Insert default templates
INSERT INTO message_templates (type, content) VALUES
  ('confirmation', 'Olá {name}! 

Seu agendamento foi confirmado:
Serviço: {service}
Data: {date}
Horário: {time}

Aguardamos você!'),
  ('reminder_24h', 'Olá {name}! 

Lembrando do seu agendamento amanhã:
Serviço: {service}
Data: {date}
Horário: {time}

Até lá!'),
  ('reminder_1h', 'Olá {name}! 

Seu agendamento é daqui 1 hora:
Serviço: {service}
Data: {date}
Horário: {time}

Estamos te aguardando!'),
  ('cancellation', 'Olá {name}! 

Seu agendamento foi cancelado:
Serviço: {service}
Data: {date}
Horário: {time}

Se precisar, pode reagendar através do nosso sistema.');