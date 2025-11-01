/*
  # Recálculo Completo do Sistema - FINAL

  ## Objetivo
  Recalcular TODOS os usuários do zero para garantir consistência total do sistema.
*/

-- Recalcular TODOS os usuários
DO $$
DECLARE
  user_record RECORD;
  total_users integer := 0;
  successful integer := 0;
  failed integer := 0;
  result json;
  start_time timestamp;
  execution_ms integer;
BEGIN
  start_time := clock_timestamp();
  
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  RECÁLCULO COMPLETO DO SISTEMA';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '';
  
  SELECT COUNT(DISTINCT user_id) INTO total_users
  FROM user_movies WHERE rating IS NOT NULL;
  
  RAISE NOTICE 'Usuários a recalcular: %', total_users;
  RAISE NOTICE '';
  
  FOR user_record IN
    SELECT DISTINCT p.id, p.username
    FROM profiles p
    INNER JOIN user_movies um ON um.user_id = p.id
    WHERE um.rating IS NOT NULL
    ORDER BY p.username
  LOOP
    BEGIN
      RAISE NOTICE '[%/%] %', successful + failed + 1, total_users, user_record.username;
      
      result := recalculate_user_spectrogram_with_cache(user_record.id);
      successful := successful + 1;
      
      RAISE NOTICE '  ✓ % avaliações', result->>'processed_ratings';
      
    EXCEPTION WHEN OTHERS THEN
      failed := failed + 1;
      RAISE WARNING '  ✗ Erro: %', SQLERRM;
    END;
  END LOOP;
  
  execution_ms := EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000;
  
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE 'RESULTADO: %/% sucesso (%%%)', 
    successful, total_users,
    ROUND((successful::numeric / total_users * 100), 1);
  RAISE NOTICE 'Tempo: % ms', execution_ms;
  RAISE NOTICE '════════════════════════════════════════';
  
  INSERT INTO genre_rebalance_log (
    reason,
    users_affected,
    users_successful,
    users_failed,
    execution_time_ms
  ) VALUES (
    'RECÁLCULO COMPLETO: Correção de inconsistências',
    total_users,
    successful,
    failed,
    execution_ms
  );
END $$;
