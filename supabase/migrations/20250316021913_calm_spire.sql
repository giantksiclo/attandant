/*
  # Fix Profiles Insert Policy

  1. Changes
    - Drop existing insert policy if it exists to avoid conflicts
    - Create new insert policy with correct permissions
    - Ensure authenticated users can create their own profile

  2. Security
    - Users can only insert their own profile (id must match auth.uid())
    - Maintains existing security model
*/

DO $$ 
BEGIN
    -- Drop existing insert policy if it exists
    DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
END $$;

-- Create new insert policy with correct permissions
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Ensure RLS is enabled
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;