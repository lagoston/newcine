/*
  # Create movies table for storing movie metadata

  1. New Tables
    - `movies` table to store movie information
      - `id` (integer, primary key)
      - `title` (text)
      - `release_date` (date)
      - `genres` (text array)
      - `director` (text)

  2. Security
    - Enable RLS on movies table
    - Allow public read access
    - Only allow authenticated users to insert/update
*/

-- Drop existing table if it exists
DROP TABLE IF EXISTS movies CASCADE;

CREATE TABLE movies (
  id integer PRIMARY KEY,
  title text NOT NULL,
  release_date date,
  genres text[],
  director text
);

ALTER TABLE movies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Movies are viewable by everyone" 
  ON movies
  FOR SELECT 
  TO public
  USING (true);

CREATE POLICY "Only authenticated users can insert movies" 
  ON movies
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Only authenticated users can update movies" 
  ON movies
  FOR UPDATE 
  TO authenticated
  USING (true)
  WITH CHECK (true);