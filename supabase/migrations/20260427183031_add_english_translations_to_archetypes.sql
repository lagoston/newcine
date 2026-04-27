/*
  # Add English Translations to Cinematic Archetypes and Subcategories

  ## Summary
  Adds English language columns to the personality/archetype tables and updates
  the `get_user_complete_personality` RPC to accept a language parameter, enabling
  proper bilingual support for the cinematic personality system.

  ## Changes

  ### Modified Tables
  - `cinematic_archetypes`
    - `name_en` (text): English archetype name
    - `description_en` (text): English archetype description
  - `antagonistic_subcategories`
    - `name_en` (text): English subcategory name
    - `description_en` (text): English subcategory description

  ### Updated Functions
  - `get_user_complete_personality(p_user_id, p_language)`: Now accepts optional
    language parameter ('pt' or 'en'), returns localized name/description columns.
    Defaults to 'pt' for backwards compatibility.

  ## Notes
  - All 20 archetypes get English names and descriptions
  - All 6 subcategories get English names and descriptions
  - Old function signature is replaced with new overloaded version (same name)
  - Frontend callers should pass language code from i18n context
*/

-- Add English columns to cinematic_archetypes
ALTER TABLE cinematic_archetypes
  ADD COLUMN IF NOT EXISTS name_en text,
  ADD COLUMN IF NOT EXISTS description_en text;

-- Add English columns to antagonistic_subcategories
ALTER TABLE antagonistic_subcategories
  ADD COLUMN IF NOT EXISTS name_en text,
  ADD COLUMN IF NOT EXISTS description_en text;

-- Seed English translations for all 20 archetypes
UPDATE cinematic_archetypes SET name_en = 'Anthropologist', description_en = 'Approaches cinema through cultural, historical, or artistic interest, finding emotion as a consequence of that immersion. Drawn to contexts, styles, and worldviews, connecting emotionally as they understand those layers. Values authenticity, identity, and originality over immediate appeal. Tends toward auteur cinema, foreign productions, and works offering a deep look at diverse cultures and perspectives.' WHERE id = 'CE';

UPDATE cinematic_archetypes SET name_en = 'Legacy Guardian', description_en = 'Starts from cultural and artistic interest but is truly satisfied when that is supported by strong ideas and intelligent construction. Values context, repertoire, and identity. Enjoys films that not only represent something but say something. Contextualizes works within the history and currents of thought. Tends toward auteur films and documentaries.' WHERE id = 'CI';

UPDATE cinematic_archetypes SET name_en = 'Storyteller', description_en = 'Approaches cinema through an interest in contexts, identities, and different worldviews, but values when this comes in an accessible and engaging way. Likes discovering new cultures without giving up the pleasure of watching, preferring stories that inform while they entertain. Leans toward literary adaptations, documentaries, fables, and legends.' WHERE id = 'CR';

UPDATE cinematic_archetypes SET name_en = 'Aesthetic Curator', description_en = 'Approaches cinema through cultural and artistic interest, but is truly enchanted when that translates into a sensory experience. Seeks authenticity, identity, and auteur vision, valuing it even more when accompanied by strong and engaging aesthetics. Appreciates films that communicate culture through form, where image and sound are as important as context. Tends toward auteur works, international cinema, and narratives with a clear signature.' WHERE id = 'CS';

UPDATE cinematic_archetypes SET name_en = 'Nostalgic Romantic', description_en = 'Engages with cinema through emotional force but finds even more value when that emotion carries identity, context, and cultural meaning. Seeks stories that touch and, at the same time, expand repertoire — whether rooted in traditions, movements, or remarkable auteur visions. Likes to feel while discovering, creating connection with different realities and sensibilities. Leans toward auteur dramas, international cinema, and works that unite emotion with cultural richness.' WHERE id = 'EC';

UPDATE cinematic_archetypes SET name_en = 'Heart Philosopher', description_en = 'Experiences cinema as an emotional impact that then unfolds into reflection. Needs to feel first — to be touched, involved, even destabilized — before seeking meaning in what was seen. Enjoys psychological dramas, moral fables, or humanist sci-fi. Craves works that challenge the mind while touching the soul, finding philosophical meaning in the emotions conveyed on screen.' WHERE id = 'EI';

UPDATE cinematic_archetypes SET name_en = 'Tragic Comedian', description_en = 'Experiences cinema as an intense emotional release combined with the pleasure of watching. Seeks stories that provoke strong feelings — attachment, tension, euphoria, or pain — within an engaging and rewarding experience. Wants to surrender to what is felt without barriers, finding in entertainment a direct channel for catharsis. Tends toward romances, dramas, and films that deliver emotion in a captivating way.' WHERE id = 'ER';

UPDATE cinematic_archetypes SET name_en = 'Visual Poet', description_en = 'Seeks in cinema an intense emotional release amplified by the senses. Wants to feel everything powerfully — a striking score, vibrant imagery, engaging rhythm — creating an experience that hits directly in the body and heart. Emotion is guided by atmosphere, energy, and sensory impact. Leans toward intense dramas, sweeping romances, and stories where form and feeling amplify each other.' WHERE id = 'ES';

UPDATE cinematic_archetypes SET name_en = 'Erudite Critic', description_en = 'Approaches cinema through thought but finds greater value when ideas are embedded in rich cultural contexts and auteur visions. Seeks to understand concepts, themes, and structures while absorbing references, styles, and diverse identities. Leans toward auteur cinema, historical works, and narratives that unite reflection and culture.' WHERE id = 'IC';

UPDATE cinematic_archetypes SET name_en = 'Visionary', description_en = 'Connects with cinema through logic, ideas, and narrative construction, finding emotion as a consequence of that understanding. Interest begins in the concept — the structure, the dilemmas, the intelligence of the work — and only then transforms into emotional impact. Values films that challenge thinking but reward with human connections. Leans toward elaborate fictions, conceptual dramas, and stories where feeling is the result of understanding.' WHERE id = 'IE';

UPDATE cinematic_archetypes SET name_en = 'Chaos Architect', description_en = 'Connects with cinema through logic, structure, and ideas but values when that transforms into an engaging and rewarding experience. Seeks well-constructed narratives and intelligent development that hold attention through execution as much as concept. Is a fan of twists and unpredictable plots. Tends toward thrillers, sharp satires, and films where reasoning drives engagement.' WHERE id = 'IR';

UPDATE cinematic_archetypes SET name_en = 'Dream Engineer', description_en = 'Connects with cinema through intellectual construction, but it is in sensory stimuli that this structure comes to life. Likes to understand how everything works — rules, logic, concept — while appreciating how that is translated into image, sound, and rhythm; cinema becomes a laboratory of imagination. Leans toward films combining singular aesthetics and creative concepts, such as elaborate sci-fi, stylized films, and works where form reinforces idea.' WHERE id = 'IS';

UPDATE cinematic_archetypes SET name_en = 'Tourist', description_en = 'Seeks entertainment above all in cinema, but takes an interest when that journey passes through different scenarios, cultures, and styles. Does not seek cultural depth for its own sake but appreciates when it arises naturally within an enjoyable experience. Likes films that function as engaging journeys, visually or thematically varied. Tends toward adventures, comedies, and stories that explore the world without heaviness.' WHERE id = 'RC';

UPDATE cinematic_archetypes SET name_en = 'Free Spirit', description_en = 'Sees cinema above all as pleasure and entertainment but connects even more when emotional moments arise throughout the experience. Does not set out in search of emotional intensity but values when it appears and adds weight to what is being experienced. Prefers narratives that flow naturally, maintaining interest while making room for emotional connection. Tends toward dynamic and engaging stories.' WHERE id = 'RE';

UPDATE cinematic_archetypes SET name_en = 'Playful Strategist', description_en = 'Enters cinema through involvement and the pleasure of the experience but stays when there is intelligence behind what is being told. Likes narratives that entertain while they challenge, offering stimuli that go beyond the superficial. Is enchanted by plots full of cunning, irony, and smart moves; laughs at sharp humor, appreciates cat-and-mouse thrillers, ingenious heist movies, and sharp dialogue.' WHERE id = 'RI';

UPDATE cinematic_archetypes SET name_en = 'Showman', description_en = 'Sees cinema above all as pure entertainment but is even more enchanted when it comes with sensory impact. Seeks accessible and exciting experiences that function as escapism but gain power with stunning scenarios: shows of color, upbeat music, iconic scenes. Likes binge-watching with friends and the collective experience. Tends toward dynamic comedies, blockbusters, and narratives that combine fun with spectacle.' WHERE id = 'RS';

UPDATE cinematic_archetypes SET name_en = 'Artist', description_en = 'Is drawn by the sensory power of cinema but finds true fascination when that aesthetic carries cultural identity and artistic intention. Values image, sound, and atmosphere as forms of auteur expression, not mere spectacle. Likes to feel the style while absorbing context, references, and language. Leans toward stylized works, meta-language, and films where form is loaded with cultural meaning.' WHERE id = 'SC';

UPDATE cinematic_archetypes SET name_en = 'Emotion Painter', description_en = 'Is attracted first by sensory impact — image, sound, rhythm — and finds in emotion a bonus that intensifies the experience. Seeks films that impress, energize, and keep the senses on alert, valuing spectacle and dynamism above all. Emotional connection emerges from physical involvement with what is on screen. Tends toward action, adventure, and visually explosive works that deliver immediate impact.' WHERE id = 'SE';

UPDATE cinematic_archetypes SET name_en = 'Illusionist', description_en = 'Is captured first by visual and sonic impact but stays for what can be extracted in terms of logic and construction. Aesthetics attract, but they do not sustain alone — there must be intelligence behind the spectacle. Values films that impress through the senses but reveal layers when analyzed. Tends toward visually striking works, long takes, well-structured narratives, and experiences where style and reasoning walk together.' WHERE id = 'SI';

UPDATE cinematic_archetypes SET name_en = 'Alchemist', description_en = 'Seeks in cinema an engaging sensory experience that is also, above all, fun. Is drawn by rhythm, aesthetics, sound, and intensity, but does not give up the immediate pleasure of watching. Likes films that hold attention through the senses while keeping entertainment flowing effortlessly, where every scene is stimulating and dynamic. Naturally gravitates toward stylized action, 3D films, IMAX, blockbusters, and works that captivate as spectacle.' WHERE id = 'SR';

-- Seed English translations for all 6 subcategories
UPDATE antagonistic_subcategories SET name_en = 'Radiant', description_en = 'Preference for luminous, inspiring, and comforting films with an optimistic tone, positive messages, and happy endings — stories of triumph, warm humor, or a refuge in cinema. Seeks joy, overcoming, and a sense of emotional elevation while watching.' WHERE id = 'A';

UPDATE antagonistic_subcategories SET name_en = 'Shadowy', description_en = 'Preference for intense works with a melancholic or tragic tone — psychological dramas, horror, uncompromising narratives that explore the difficult side of the human condition. Finds beauty in darkness and discomfort.' WHERE id = 'B';

UPDATE antagonistic_subcategories SET name_en = 'Dense', description_en = 'Preference for complex, deep, and demanding works with a slow pace, multiple layers, and strong emotional or intellectual weight. Values interpretation, ambiguity, and lasting impact.' WHERE id = 'D';

UPDATE antagonistic_subcategories SET name_en = 'Classic', description_en = 'Preference for traditional films with conventional structures, classic aesthetics, and established formulas. Values artistic security and references to cinema of the past.' WHERE id = 'K';

UPDATE antagonistic_subcategories SET name_en = 'Light', description_en = 'Preference for accessible, agile, and uncomplicated films with a light tone and fast pace. Seeks relaxing, engaging entertainment that is easy to digest emotionally.' WHERE id = 'L';

UPDATE antagonistic_subcategories SET name_en = 'Experimental', description_en = 'Preference for innovative and unconventional works with non-traditional narratives and creative techniques. Values originality, boldness, and new forms of expression.' WHERE id = 'X';

-- Drop old function and recreate with language support
DROP FUNCTION IF EXISTS get_user_complete_personality(uuid);

CREATE OR REPLACE FUNCTION get_user_complete_personality(
  p_user_id uuid,
  p_language text DEFAULT 'pt'
)
RETURNS TABLE(
  user_id uuid,
  username text,
  personalidade_completa text,
  archetype_id text,
  archetype_name text,
  archetype_description text,
  subcategory_id text,
  subcategory_name text,
  subcategory_description text,
  personality_description text,
  pontos_e numeric,
  pontos_i numeric,
  pontos_c numeric,
  pontos_s numeric,
  pontos_r numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as user_id,
    p.username,
    p.personalidade_completa,
    ca.id as archetype_id,
    CASE WHEN p_language = 'en' AND ca.name_en IS NOT NULL THEN ca.name_en ELSE ca.name END as archetype_name,
    CASE WHEN p_language = 'en' AND ca.description_en IS NOT NULL THEN ca.description_en ELSE ca.description END as archetype_description,
    sc.id as subcategory_id,
    CASE WHEN p_language = 'en' AND sc.name_en IS NOT NULL THEN sc.name_en ELSE sc.name END as subcategory_name,
    CASE WHEN p_language = 'en' AND sc.description_en IS NOT NULL THEN sc.description_en ELSE sc.description END as subcategory_description,
    CASE
      WHEN ca.name IS NOT NULL AND sc.name IS NOT NULL THEN
        CASE WHEN p_language = 'en' AND ca.name_en IS NOT NULL AND sc.name_en IS NOT NULL
          THEN ca.name_en || ' ' || sc.name_en
          ELSE ca.name || ' ' || sc.name
        END
      WHEN ca.name IS NOT NULL THEN
        CASE WHEN p_language = 'en' AND ca.name_en IS NOT NULL THEN ca.name_en ELSE ca.name END
      ELSE NULL
    END as personality_description,
    p.pontos_e,
    p.pontos_i,
    p.pontos_c,
    p.pontos_s,
    p.pontos_r
  FROM profiles p
  LEFT JOIN cinematic_archetypes ca ON p.arquetipo_id = ca.id
  LEFT JOIN antagonistic_subcategories sc ON p.subcategoria_id = sc.id
  WHERE p.id = p_user_id;
END;
$$;
