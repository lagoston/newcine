-- Os temas da Persona (15/11/2026).
--
-- Pedido do Bruno: unificar o "Sua Persona" da home e o do perfil. O modal
-- completo passa a ter os "potinhos" das nove prateleiras, que até aqui só
-- existiam no bloco do perfil: tocar num deles mostra quantos títulos a
-- prateleira tem, a nota média, os mais bem avaliados e "as tags com suas notas
-- médias". E a barra da Evolução "deve alterar o conteúdo dos potinhos também
-- quando mexida".
--
-- Quantos títulos, a média e os mais bem avaliados de cada prateleira já vêm em
-- get_persona_world (e a história, nota a nota, em get_persona_history). O que
-- faltava eram os temas: no perfil eles saíam da biblioteca inteira da pessoa,
-- que a página do perfil já tinha carregado. A home não carrega isso, e a
-- gaveta tem de ser a mesma nos dois lugares.
--
-- Esta função devolve só o que a conta dos temas precisa, para qualquer pessoa
-- cujo perfil quem pede pode ver (a mesma regra de get_persona_world):
--   kw:   { "id do tema": "nome" }, só os temas que aparecem em pelo menos 2
--         títulos avaliados da pessoa (com 1 só, um tema nunca vira etiqueta:
--         a conta pede 2 numa prateleira e 3 no geral);
--   rows: [tipo, id do título, letra da prateleira ou null, nota, [ids dos temas]]
--         para cada título avaliado, em ordem de tipo e id (a ordem em que a
--         pessoa avaliou não sai daqui; a história é só dela).
-- A média de cada tema é feita no aplicativo (lib/personaThemes.ts), com a
-- mesma conta do perfil (lib/tasteStats.ts): assim a barra da Evolução refaz
-- as etiquetas para qualquer ponto da história sem voltar ao banco.

create or replace function public.get_persona_themes(p_user_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_out jsonb;
begin
  if p_user_id is null then
    return null;
  end if;
  perform 1 from profiles p where p.id = p_user_id;
  if not found or not can_view_user_content(p_user_id) then
    return null;
  end if;

  with st as (
    select distinct x.mood_key, x.media_type, x.tmdb_id from shelf_titles() x where x.mood_key <> 'random-surprise'
  ),
  -- os mesmos títulos de get_persona_world e de get_persona_history
  r as materialized (
    select um.media_type, um.movie_id, um.rating::numeric as rating, m.letter
      from user_movies um
      left join st on st.tmdb_id = um.movie_id and st.media_type = um.media_type
      left join cine_moods m on m.mood_key = st.mood_key
     where um.user_id = p_user_id and um.rating is not null and um.media_type in ('movie', 'tv')
  ),
  -- cada tema de cada título, uma vez só
  tk as materialized (
    select distinct r.media_type, r.movie_id, (k.item ->> 'id')::integer as kid, btrim(k.item ->> 'name') as name
      from r
      join movie_cache mc on mc.tmdb_id = r.movie_id and mc.media_type = r.media_type
      cross join lateral jsonb_array_elements(case when jsonb_typeof(mc.keywords) = 'array' then mc.keywords else '[]'::jsonb end) as k(item)
     where (k.item ->> 'id') ~ '^[0-9]{1,9}$' and coalesce(btrim(k.item ->> 'name'), '') <> ''
  ),
  keep as (
    select tk.kid, min(tk.name) as name from tk group by tk.kid having count(*) >= 2
  ),
  per_title as (
    select tk.media_type, tk.movie_id, jsonb_agg(tk.kid order by tk.kid) as ids
      from tk join keep on keep.kid = tk.kid
     group by tk.media_type, tk.movie_id
  )
  select jsonb_build_object(
           'v', 1,
           'kw', (select coalesce(jsonb_object_agg(keep.kid::text, keep.name), '{}'::jsonb) from keep),
           'rows', (select coalesce(jsonb_agg(jsonb_build_array(r.media_type, r.movie_id, r.letter, r.rating, coalesce(pt.ids, '[]'::jsonb))
                                              order by r.media_type, r.movie_id), '[]'::jsonb)
                      from r
                      left join per_title pt on pt.media_type = r.media_type and pt.movie_id = r.movie_id)
         )
    into v_out;

  return v_out;
end;
$function$;
