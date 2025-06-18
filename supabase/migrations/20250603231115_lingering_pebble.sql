/*
  # Create schema and tables for Tassinary SaaS

  1. Schema Creation
    - Create new schema `tassinary_saas`
  
  2. New Tables
    - `clients`
      - `id` (uuid, primary key)
      - `name` (text)
      - `email` (text)
      - `phone` (text) 
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `appointments`
      - `id` (uuid, primary key)
      - `client_id` (uuid, foreign key)
      - `service` (text)
      - `date` (date)
      - `time` (time)
      - `status` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  3. Security
    - Enable RLS on both tables
    - Add policies for authenticated users
*/

-- Create schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS tassinary_saas;

-- Set the search path
SET search_path TO tassinary_saas;

-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  service text NOT NULL,
  date date NOT NULL,
  time time NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Create policies for clients table
CREATE POLICY "Enable read access for authenticated users" ON clients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON clients
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON clients
  FOR UPDATE TO authenticated USING (true);

-- Create policies for appointments table
CREATE POLICY "Enable read access for authenticated users" ON appointments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON appointments
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON appointments
  FOR UPDATE TO authenticated USING (true);