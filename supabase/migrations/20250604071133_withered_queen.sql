/*
  # Create Evolution Instances table

  1. New Tables
    - `evolution_instances`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `instance_name` (text)
      - `qr_code` (text)
      - `status` (text)
      - `created_at` (timestamp with time zone)
      - `updated_at` (timestamp with time zone)

  2. Security
    - Enable RLS on `evolution_instances` table
    - Add policies for authenticated users to read their own instances
*/

CREATE TABLE IF NOT EXISTS evolution_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  instance_name text NOT NULL,
  qr_code text,
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE evolution_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own evolution instances"
  ON evolution_instances
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own evolution instances"
  ON evolution_instances
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create trigger for updating updated_at
CREATE TRIGGER update_evolution_instances_updated_at
  BEFORE UPDATE ON evolution_instances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();