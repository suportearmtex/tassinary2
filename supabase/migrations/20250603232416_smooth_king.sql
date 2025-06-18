/*
  # Add services table and update appointments

  1. New Tables
    - `services`
      - `id` (uuid, primary key)
      - `name` (text)
      - `duration` (interval)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Changes
    - Add service_id to appointments table
    - Add Google Calendar sync fields to appointments

  3. Security
    - Enable RLS on services table
    - Add policies for authenticated users
*/

-- Create services table
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  duration interval NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add service_id to appointments
ALTER TABLE appointments
ADD COLUMN service_id uuid REFERENCES services(id),
ADD COLUMN google_event_id text,
ADD COLUMN is_synced_to_google boolean DEFAULT false;

-- Enable RLS
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- Create policies for services
CREATE POLICY "Allow authenticated users to read services"
  ON services
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert services"
  ON services
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update services"
  ON services
  FOR UPDATE
  TO authenticated
  USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();