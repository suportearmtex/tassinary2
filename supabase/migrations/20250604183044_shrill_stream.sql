/*
  # Add Google Calendar Integration

  1. New Tables
    - `user_google_tokens`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `access_token` (text)
      - `refresh_token` (text)
      - `expires_at` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `user_google_tokens` table
    - Add policy for users to manage their own tokens
*/

DO $$ BEGIN
  -- Create table if it doesn't exist
  CREATE TABLE IF NOT EXISTS user_google_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );

  -- Enable RLS
  ALTER TABLE user_google_tokens ENABLE ROW LEVEL SECURITY;

  -- Create policy if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_google_tokens' 
    AND policyname = 'Users can manage own google tokens'
  ) THEN
    CREATE POLICY "Users can manage own google tokens"
      ON user_google_tokens
      USING (auth.uid() = user_id);
  END IF;

  -- Create trigger if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_user_google_tokens_updated_at'
  ) THEN
    CREATE TRIGGER update_user_google_tokens_updated_at
      BEFORE UPDATE ON user_google_tokens
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;