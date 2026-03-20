/*
  # Remove 5 Redundant Same-Letter Archetypes

  ## Summary
  The Cinematic Essence system originally defined 25 archetypes as a 5×5 cross of the
  five spectrums (Emocional, Intelectual, Cultural, Sensorial, Recreativo). However, the
  five "same-letter" combinations (EE, II, CC, SS, RR) are structurally impossible to
  assign: the `update_user_archetypes` function always picks the top-2 DISTINCT spectrum
  indexes using a ROW_NUMBER tiebreaker, so primary and secondary are always different
  letters. These 5 entries have never been assigned to any user.

  ## Changes
  1. Removes the 5 never-reachable rows from `cinematic_archetypes`:
     - EE (Alma Sensível)
     - II (Arquiteto da Lógica)
     - CC (Patrono da História)
     - SS (Arquiteto dos Sentidos)
     - RR (Espírito Livre)

  ## Safety
  - Confirmed via query: zero users currently hold any of these 5 archetype IDs.
  - The `get_archetype_id()` function already returns NULL for IDs not found in the table,
    so the system degrades gracefully even if somehow the same-letter case were reached.
  - No data loss to existing user profiles.
*/

DELETE FROM cinematic_archetypes
WHERE id IN ('EE', 'II', 'CC', 'SS', 'RR');
