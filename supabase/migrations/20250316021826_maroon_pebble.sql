/*
  # Fix Profiles RLS Policy

  1. Changes
    - Add policy to allow authenticated users to insert their own profile
    - This is needed to allow new users to create their profile during signup

  2. Security
    - Users can only insert their own profile (id must match auth.uid())
    - Maintains existing policies for viewing and updating profiles
*/

-- Add insert policy for profiles
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);