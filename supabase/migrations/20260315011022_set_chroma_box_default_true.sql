/*
  # Set chroma_box_enabled default to true

  Changes the default value of chroma_box_enabled in profiles table from false to true,
  so new users get Chroma Box enabled by default.
  Existing users with false keep their setting.
*/

ALTER TABLE profiles
  ALTER COLUMN chroma_box_enabled SET DEFAULT true;
