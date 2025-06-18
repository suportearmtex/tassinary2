/*
  # Add user_id to tables and update RLS policies

  1. Changes
    - Add user_id column to services, clients, and appointments tables
    - Update RLS policies to scope data by user_id
    - Add foreign key constraints to auth.users
    - Add cascading deletes for related tables

  2. Security
    - Enable RLS on all tables
    - Update policies to filter by auth.uid()
*/

-- Add user_id to services table
ALTER TABLE services
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update services RLS policies
DROP POLICY IF EXISTS "Allow authenticated users to insert services" ON services;
DROP POLICY IF EXISTS "Allow authenticated users to read services" ON services;
DROP POLICY IF EXISTS "Allow authenticated users to update services" ON services;

CREATE POLICY "Users can manage own services"
ON services
USING (auth.uid() = user_id);

-- Add user_id to clients table
ALTER TABLE clients
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update clients RLS policies
DROP POLICY IF EXISTS "Allow authenticated users to insert clients" ON clients;
DROP POLICY IF EXISTS "Allow authenticated users to read clients" ON clients;
DROP POLICY IF EXISTS "Allow authenticated users to update clients" ON clients;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON clients;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON clients;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON clients;

CREATE POLICY "Users can manage own clients"
ON clients
USING (auth.uid() = user_id);

-- Add user_id to appointments table
ALTER TABLE appointments
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update appointments RLS policies
DROP POLICY IF EXISTS "Allow authenticated users to delete appointments" ON appointments;
DROP POLICY IF EXISTS "Allow authenticated users to insert appointments" ON appointments;
DROP POLICY IF EXISTS "Allow authenticated users to read appointments" ON appointments;
DROP POLICY IF EXISTS "Allow authenticated users to update appointments" ON appointments;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON appointments;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON appointments;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON appointments;

CREATE POLICY "Users can manage own appointments"
ON appointments
USING (auth.uid() = user_id);