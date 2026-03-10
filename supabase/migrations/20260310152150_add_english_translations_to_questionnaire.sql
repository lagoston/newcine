/*
  # Add English Translations to Questionnaire

  1. Changes
    - `subcategory_questions`: add `question_text_en` column with English translations
    - `subcategory_question_options`: add `option_text_en` column with English translations
    - Update `start_subcategory_questionnaire` to accept a `p_language` param and return the correct text
    - Update `get_tiebreaker_question` to accept a `p_language` param and return the correct text

  2. Notes
    - Default language is 'pt' to preserve backward compatibility
    - All 12 regular questions and 1 tiebreaker question are translated
    - All 30 options are translated
*/

-- Add English column to questions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subcategory_questions' AND column_name = 'question_text_en'
  ) THEN
    ALTER TABLE subcategory_questions ADD COLUMN question_text_en text;
  END IF;
END $$;

-- Add English column to options
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subcategory_question_options' AND column_name = 'option_text_en'
  ) THEN
    ALTER TABLE subcategory_question_options ADD COLUMN option_text_en text;
  END IF;
END $$;

-- Populate English question translations
UPDATE subcategory_questions SET question_text_en = 'After a long and tiring day, you want to watch a movie. What is your main goal?' WHERE id = 1;
UPDATE subcategory_questions SET question_text_en = 'You are choosing a movie based on the poster and title. What sparks your curiosity most?' WHERE id = 2;
UPDATE subcategory_questions SET question_text_en = 'A film''s soundtrack is crucial. Which approach do you prefer?' WHERE id = 3;
UPDATE subcategory_questions SET question_text_en = 'Which type of protagonist attracts you most?' WHERE id = 4;
UPDATE subcategory_questions SET question_text_en = 'You are browsing a streaming catalog. What grabs your attention most in the synopsis of an unknown film?' WHERE id = 5;
UPDATE subcategory_questions SET question_text_en = 'A book you love is being adapted for the cinema. What news would excite you most?' WHERE id = 6;
UPDATE subcategory_questions SET question_text_en = 'You are watching a scene. What impresses you most technically?' WHERE id = 7;
UPDATE subcategory_questions SET question_text_en = 'Think about a film''s ending. What satisfies you most?' WHERE id = 8;
UPDATE subcategory_questions SET question_text_en = 'You are going to the cinema with friends. How do you describe the kind of film you want to see?' WHERE id = 9;
UPDATE subcategory_questions SET question_text_en = 'How do you prefer a film''s central theme to be presented?' WHERE id = 10;
UPDATE subcategory_questions SET question_text_en = 'What frustrates you most in a film?' WHERE id = 11;
UPDATE subcategory_questions SET question_text_en = 'Think about a screenplay''s dialogues. Which style appeals to you most?' WHERE id = 12;
UPDATE subcategory_questions SET question_text_en = 'Your soul is a prism in perfect balance. To tune the focus, you must choose the film that best defines your cinematic journey.' WHERE id = 13;

-- Populate English option translations
UPDATE subcategory_question_options SET option_text_en = 'To feel better, lighter and with a more optimistic view of the world.' WHERE id = 1;
UPDATE subcategory_question_options SET option_text_en = 'To dive into an intense and thought-provoking atmosphere, even if uncomfortable.' WHERE id = 2;
UPDATE subcategory_question_options SET option_text_en = 'Dark tones and an enigmatic title suggesting a deep mystery or psychological thriller.' WHERE id = 3;
UPDATE subcategory_question_options SET option_text_en = 'Vibrant colors and a title suggesting adventure, romance or overcoming obstacles.' WHERE id = 4;
UPDATE subcategory_question_options SET option_text_en = 'Atmospheric and dissonant soundscapes that build tension and a feeling of strangeness or melancholy.' WHERE id = 5;
UPDATE subcategory_question_options SET option_text_en = 'Memorable melodies and musical themes that elevate emotions and underscore moments of triumph and joy.' WHERE id = 6;
UPDATE subcategory_question_options SET option_text_en = 'Someone who, despite difficulties, overcomes obstacles with resilience and achieves redemption or happiness.' WHERE id = 7;
UPDATE subcategory_question_options SET option_text_en = 'An anti-hero or tragic figure whose flaws and questionable choices lead to an inevitably dark fate.' WHERE id = 8;
UPDATE subcategory_question_options SET option_text_en = 'The promise of an exciting story with a perfectly executed narrative structure.' WHERE id = 9;
UPDATE subcategory_question_options SET option_text_en = 'The description of a visual or narrative approach that "challenges the conventions of cinema".' WHERE id = 10;
UPDATE subcategory_question_options SET option_text_en = 'The director promised to be extremely faithful to the original material, honoring the work''s structure.' WHERE id = 11;
UPDATE subcategory_question_options SET option_text_en = 'The director announced they will use the book as a starting point for a radical and unexpected reinterpretation.' WHERE id = 12;
UPDATE subcategory_question_options SET option_text_en = 'A balanced camera composition and fluid editing that serve the story invisibly and elegantly.' WHERE id = 13;
UPDATE subcategory_question_options SET option_text_en = 'Unusual camera angles and bold editing that calls attention to itself as part of the artistic expression.' WHERE id = 14;
UPDATE subcategory_question_options SET option_text_en = 'An ambiguous or open ending that subverts expectations and leaves you thinking about what really happened.' WHERE id = 15;
UPDATE subcategory_question_options SET option_text_en = 'A conclusive ending that ties up all loose ends and resolves the characters'' arcs clearly.' WHERE id = 16;
UPDATE subcategory_question_options SET option_text_en = 'Something fun and easy to follow, so we can relax and have a few laughs.' WHERE id = 17;
UPDATE subcategory_question_options SET option_text_en = 'Something that sparks debate and makes us talk about theories and meanings after the session.' WHERE id = 18;
UPDATE subcategory_question_options SET option_text_en = 'Through metaphors and subtext, with layers of meaning that only reveal themselves with attention and reflection.' WHERE id = 19;
UPDATE subcategory_question_options SET option_text_en = 'In a clear and direct way, with a message that is easily understood by everyone.' WHERE id = 20;
UPDATE subcategory_question_options SET option_text_en = 'An overly complicated plot filled with symbolism that requires enormous effort to decipher.' WHERE id = 21;
UPDATE subcategory_question_options SET option_text_en = 'A shallow and predictable story with characters whose motivations are too simple.' WHERE id = 22;
UPDATE subcategory_question_options SET option_text_en = 'Philosophical and introspective dialogues that explore the characters'' psychology and the film''s themes in depth.' WHERE id = 23;
UPDATE subcategory_question_options SET option_text_en = 'Agile, witty dialogues that advance the story in an objective manner.' WHERE id = 24;
UPDATE subcategory_question_options SET option_text_en = 'The Shawshank Redemption' WHERE id = 25;
UPDATE subcategory_question_options SET option_text_en = 'Se7en' WHERE id = 26;
UPDATE subcategory_question_options SET option_text_en = 'The Godfather' WHERE id = 27;
UPDATE subcategory_question_options SET option_text_en = 'Everything Everywhere All at Once' WHERE id = 28;
UPDATE subcategory_question_options SET option_text_en = 'Inside Out' WHERE id = 29;
UPDATE subcategory_question_options SET option_text_en = 'Blade Runner 2049' WHERE id = 30;

-- Update start_subcategory_questionnaire to support language
CREATE OR REPLACE FUNCTION start_subcategory_questionnaire(p_language text DEFAULT 'pt')
RETURNS TABLE (
  question_id integer,
  question_text text,
  options jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.id as question_id,
    CASE WHEN p_language = 'en' AND q.question_text_en IS NOT NULL THEN q.question_text_en ELSE q.question_text END as question_text,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'option_id', o.id,
          'option_text', CASE WHEN p_language = 'en' AND o.option_text_en IS NOT NULL THEN o.option_text_en ELSE o.option_text END,
          'option_order', o.option_order
        ) ORDER BY o.option_order
      )
      FROM subcategory_question_options o
      WHERE o.question_id = q.id
    ) as options
  FROM subcategory_questions q
  WHERE q.is_tiebreaker = false
  ORDER BY RANDOM();
END;
$$;

-- Update get_tiebreaker_question to support language
CREATE OR REPLACE FUNCTION get_tiebreaker_question(p_tied_categories text[], p_language text DEFAULT 'pt')
RETURNS TABLE (
  question_id integer,
  question_text text,
  options jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.id as question_id,
    CASE WHEN p_language = 'en' AND q.question_text_en IS NOT NULL THEN q.question_text_en ELSE q.question_text END as question_text,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'option_id', o.id,
          'option_text', CASE WHEN p_language = 'en' AND o.option_text_en IS NOT NULL THEN o.option_text_en ELSE o.option_text END,
          'subcategory_id', o.subcategory_id,
          'option_order', o.option_order
        ) ORDER BY o.option_order
      )
      FROM subcategory_question_options o
      WHERE o.question_id = q.id
      AND o.subcategory_id = ANY(p_tied_categories)
    ) as options
  FROM subcategory_questions q
  WHERE q.is_tiebreaker = true;
END;
$$;
