/*
  # Inicializar Arquétipos para Usuários Existentes

  Atribuir arquétipos básicos para usuários que já têm avaliações
*/

DO $$
DECLARE
  user_count integer := 0;
BEGIN
  -- Atualizar arquétipos para usuários que têm avaliações mas não têm arquétipos
  UPDATE profiles p
  SET 
    arquetipo_primario = COALESCE(p.arquetipo_primario, 'E'),
    arquetipo_secundario = COALESCE(p.arquetipo_secundario, 'E'),
    arquetipo_id = COALESCE(p.arquetipo_id, 'EE'),
    pontos_e = COALESCE(p.pontos_e, 1),
    pontos_i = COALESCE(p.pontos_i, 1),
    pontos_c = COALESCE(p.pontos_c, 1),
    pontos_s = COALESCE(p.pontos_s, 1),
    pontos_r = COALESCE(p.pontos_r, 1),
    updated_at = NOW()
  WHERE p.id IN (
    SELECT DISTINCT um.user_id 
    FROM user_movies um 
    WHERE um.rating IS NOT NULL
  )
  AND (p.arquetipo_primario IS NULL OR p.arquetipo_secundario IS NULL);

  GET DIAGNOSTICS user_count = ROW_COUNT;
  
  RAISE NOTICE '=== Inicialização de Arquétipos ===';
  RAISE NOTICE 'Processados % usuários com arquétipos básicos', user_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Usuários existentes agora possuem arquétipos iniciais!';
  RAISE NOTICE 'Os arquétipos serão recalculados automaticamente quando avaliarem novos filmes.';
END $$;
