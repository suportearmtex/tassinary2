/*
  # Add message tracking to appointments

  1. Changes
    - Add message tracking columns to appointments table
    - Add default values for message tracking

  2. Security
    - No changes to security policies needed
*/

ALTER TABLE appointments
ADD COLUMN messages_sent jsonb DEFAULT '{"confirmation": false, "reminder": false, "cancellation": false}'::jsonb;