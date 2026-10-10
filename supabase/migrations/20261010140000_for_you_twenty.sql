-- "Filmes Para Você" e "Séries Para Você" com 20 títulos cada (10/10/2026,
-- pedido do Bruno; eram 10). As combinações do dia dobram e continuam as
-- mesmas proporções (Bogart / Fincher / Cypher):
--   8/8/4 · 8/6/6 · 10/10/0 · 12/6/2 · 4/4/12
-- A lista guardada (for_you_cache) ganha ":20" na impressão digital, então
-- as listas de 10 já guardadas são refeitas na próxima visita.
-- Feito sobre as funções da migração 20261010100000_for_you_daily_mix.sql.

do $$
declare
  d text;
begin
  d := pg_get_functiondef('public.get_for_you_titles__impl(uuid,text,integer)'::regprocedure);
  if position('array[4,4,2, 4,3,3, 5,5,0, 6,3,1, 2,2,6]' in d) = 0 then
    raise exception 'combinações não encontradas em get_for_you_titles__impl';
  end if;
  d := replace(d, 'array[4,4,2, 4,3,3, 5,5,0, 6,3,1, 2,2,6]', 'array[8,8,4, 8,6,6, 10,10,0, 12,6,2, 4,4,12]');
  d := replace(d, '-- (Bogart, Fincher, Cypher) — cada combinação soma 10', '-- (Bogart, Fincher, Cypher) — cada combinação soma 20');
  execute d;

  d := pg_get_functiondef('public.get_for_you_titles(text,integer)'::regprocedure);
  if position('least(greatest(coalesce(p_limit, 10), 1), 10)' in d) = 0
     or position('get_for_you_titles__impl(uid, p_media_type, 10)' in d) = 0
     or position('''America/Sao_Paulo'')::date)::text;' in d) = 0 then
    raise exception 'trechos não encontrados em get_for_you_titles';
  end if;
  d := replace(d, 'least(greatest(coalesce(p_limit, 10), 1), 10)', 'least(greatest(coalesce(p_limit, 20), 1), 20)');
  d := replace(d, 'get_for_you_titles__impl(uid, p_media_type, 10)', 'get_for_you_titles__impl(uid, p_media_type, 20)');
  d := replace(d, '''America/Sao_Paulo'')::date)::text;', '''America/Sao_Paulo'')::date)::text || '':20'';');
  execute d;
end $$;
