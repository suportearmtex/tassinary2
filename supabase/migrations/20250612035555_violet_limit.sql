/*
  # Add price field to appointments table

  1. Changes
    - Add price column to appointments table (decimal type for currency)
    - Set default value to 0.00

  2. Security
    - No changes to RLS policies needed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'price'
  ) THEN
    ALTER TABLE appointments ADD COLUMN price decimal(10,2) DEFAULT 0.00;
  END IF;
END $$;