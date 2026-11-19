-- 18/11/2026 — Protocolo Reborn, onda 2 do banco (achado A3 de
-- claude/otimizacao/banco.md, parte 1 de 2: o que roda a cada nota salva).
--
-- O que a auditoria chamou de "espectrograma recalculado do zero a cada nota"
-- não roda mais: os gatilhos spectrogram_recalc_* de user_movies estão
-- desligados desde 28/09/2026 (o sistema E/I/C/S/R foi aposentado na migração
-- new_persona_system_84; pontos_e..pontos_r estão congelados). O que roda a
-- cada nota é a Persona (refresh_user_persona), e era ela o gatilho mais caro
-- de salvar uma nota: 10–48 ms com a conexão quente e 62 ms com a conexão
-- fria, porque montava a lista inteira das prateleiras (11.688 linhas, com
-- DISTINCT) para depois cruzar com as notas da pessoa.
--
-- Agora o caminho é o contrário: parte das notas da pessoa e busca, pelo
-- índice pool_titles_title (media_type, tmdb_id), só as prateleiras desses
-- títulos. Continua sendo um recálculo completo (não um "soma a diferença"):
-- com isso não existe estado para sair de sincronia, e o resultado é o mesmo
-- por construção — as prateleiras de títulos que a pessoa não avaliou nunca
-- somaram nada (o LEFT JOIN com as notas dava nulo). O ensaio roda a função
-- antiga e a nova para todas as contas com nota e exige persona_scores,
-- persona_counted e o código idênticos.
--
-- Só o trecho "curated" é trocado; o resto da função (regra dos 10 pontos,
-- a muda em persona_molts) fica como está no banco.

create or replace function pg_temp.swap_n(p_def text, p_old text, p_new text, p_times integer, p_label text)
returns text
language plpgsql
as $f$
begin
  if (length(p_def) - length(replace(p_def, p_old, ''))) / length(p_old) <> p_times then
    raise exception '%: o trecho não aparece % vez(es)', p_label, p_times;
  end if;
  return replace(p_def, p_old, p_new);
end;
$f$;

do $do$
declare
  v_def text := pg_get_functiondef('public.refresh_user_persona(uuid)'::regprocedure);
begin
  if position('join pool_titles pt' in v_def) > 0 then
    raise exception 'refresh_user_persona: já parte da biblioteca da pessoa';
  end if;

  v_def := pg_temp.swap_n(v_def,
$s$  curated as (
    select distinct st.mood_key, st.media_type, st.tmdb_id
      from shelf_titles() st
     where st.mood_key <> 'random-surprise'
  ),
$s$,
$s$  -- 18/11/2026 (Reborn): só as prateleiras dos títulos que a pessoa avaliou,
  -- pelo índice de pool_titles (antes: as 11.688 linhas de todas as prateleiras)
  curated as materialized (
    select distinct pt.mood_key, pt.media_type, pt.tmdb_id
      from rated r
      join pool_titles pt on pt.media_type = r.media_type and pt.tmdb_id = r.movie_id
     where pt.mood_key <> 'random-surprise'
  ),
$s$, 1, 'refresh_user_persona curated');

  execute v_def;
end;
$do$;
