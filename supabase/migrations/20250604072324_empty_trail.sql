/*
  # Add unique constraint to evolution_instances

  1. Changes
    - Add unique constraint to user_id in evolution_instances table to ensure one instance per user

  2. Security
    - No changes to RLS policies
*/

ALTER TABLE evolution_instances
ADD CONSTRAINT evolution_instances_user_id_key UNIQUE (user_id);