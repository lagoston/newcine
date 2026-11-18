-- 17/11/2026 (pedido do Bruno, 21h34): no cartão dos móveis dos humores,
-- "Troque 'Seu Favorito da Prateleira' por 'Sua Recomendação'. Adicione um
-- botão para o usuário escolher um título avaliado dessa prateleira."
--
-- A recomendação de cada humor: a pessoa escolhe um título que ela avaliou e
-- que mora naquela prateleira. Sem escolha, o cartão mostra o mais bem
-- avaliado (como antes). Quem visita o estúdio vê a recomendação do dono.
--   • persona_mood_picks: uma linha por pessoa e humor. Só as funções mexem.
--   • set_persona_mood_pick: grava a escolha de quem chama (o título tem de
--     estar avaliado por ela e na prateleira).
--   • get_my_mood_titles: os títulos avaliados de uma prateleira, para
--     escolher (só os da própria pessoa).
--   • get_persona_world ganha `picks` (letra → título), só com escolhas que
--     ainda valem (o título continua avaliado e na prateleira). Só acrescenta:
--     o app antigo não lê.

create table if not exists public.persona_mood_picks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  mood_key text not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  picked_at timestamptz not null default now(),
  primary key (user_id, mood_key)
);
alter table public.persona_mood_picks enable row level security;
revoke all on table public.persona_mood_picks from anon, authenticated;

create or replace function public.set_persona_mood_pick(p_mood text, p_media_type text, p_tmdb_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_mood is null or p_mood = 'random-surprise' or not exists (select 1 from cine_moods m where m.mood_key = p_mood) then
    raise exception 'bad_mood' using errcode = '22023';
  end if;
  if p_media_type is null or p_media_type not in ('movie', 'tv') or p_tmdb_id is null then
    raise exception 'bad_title' using errcode = '22023';
  end if;
  -- o título é da pessoa (avaliado) e mora na prateleira
  if not exists (select 1 from user_movies um
                  where um.user_id = v_uid and um.movie_id = p_tmdb_id and um.media_type = p_media_type and um.rating is not null)
     or not exists (select 1 from shelf_titles() st
                     where st.tmdb_id = p_tmdb_id and st.media_type = p_media_type and st.mood_key = p_mood) then
    raise exception 'not_on_shelf' using errcode = '22023';
  end if;
  insert into persona_mood_picks (user_id, mood_key, media_type, tmdb_id, picked_at)
  values (v_uid, p_mood, p_media_type, p_tmdb_id, now())
  on conflict (user_id, mood_key) do update
    set media_type = excluded.media_type, tmdb_id = excluded.tmdb_id, picked_at = now();
  return jsonb_build_object('mood', p_mood, 'type', p_media_type, 'id', p_tmdb_id);
end;
$function$;
revoke all on function public.set_persona_mood_pick(text, text, integer) from public, anon;
grant execute on function public.set_persona_mood_pick(text, text, integer) to authenticated;

-- os títulos avaliados de uma prateleira, da maior nota para a menor (os mais
-- recentes primeiro no empate), com o nome e o pôster do cache
create or replace function public.get_my_mood_titles(p_mood text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.movie_id, 'type', q.media_type, 'r', q.rating,
                    'title_pt', mc.title_pt, 'title_en', mc.title_en, 'poster', coalesce(mc.poster_path_pt, mc.poster_path))
                  order by q.rating desc, q.created_at desc, q.movie_id), '[]'::jsonb)
    from (select distinct on (um.media_type, um.movie_id) um.movie_id, um.media_type, um.rating::numeric as rating, um.created_at
            from user_movies um
            join shelf_titles() st on st.tmdb_id = um.movie_id and st.media_type = um.media_type
           where um.user_id = auth.uid()
             and um.rating is not null
             and um.media_type in ('movie', 'tv')
             and st.mood_key = p_mood
             and p_mood <> 'random-surprise'
           order by um.media_type, um.movie_id, um.created_at desc) q
    left join movie_cache mc on mc.tmdb_id = q.movie_id and mc.media_type = q.media_type;
$function$;
revoke all on function public.get_my_mood_titles(text) from public, anon;
grant execute on function public.get_my_mood_titles(text) to authenticated;

-- get_persona_world: `picks` entra logo antes de `pets`. Parte da definição
-- que está no banco (não de um arquivo), confere que o trecho existe uma vez
-- só e troca.
do $do$
declare
  v_def text := pg_get_functiondef('public.get_persona_world(uuid)'::regprocedure);
  v_old text := $snip$    'pets', jsonb_build_object($snip$;
  v_new text := $snip$    -- 17/11/2026: a recomendação de cada humor que a pessoa escolheu (letra →
    -- título), só se o título continua avaliado e na prateleira
    'picks', (select coalesce(jsonb_object_agg(m.letter, jsonb_build_object('id', pk.tmdb_id, 'type', pk.media_type, 'r', ur.rating, 'm', m.letter,
                       'title_pt', mc.title_pt, 'title_en', mc.title_en, 'poster', coalesce(mc.poster_path_pt, mc.poster_path))), '{}'::jsonb)
                from persona_mood_picks pk
                join cine_moods m on m.mood_key = pk.mood_key
                join lateral (select x.rating::numeric as rating from user_movies x
                               where x.user_id = pk.user_id and x.movie_id = pk.tmdb_id and x.media_type = pk.media_type and x.rating is not null
                               order by x.created_at desc limit 1) ur on true
                left join movie_cache mc on mc.tmdb_id = pk.tmdb_id and mc.media_type = pk.media_type
               where pk.user_id = p_user_id
                 and exists (select 1 from st where st.mood_key = pk.mood_key and st.tmdb_id = pk.tmdb_id and st.media_type = pk.media_type)),
    'pets', jsonb_build_object($snip$;
begin
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'get_persona_world: o trecho de pets não aparece uma vez só';
  end if;
  if position('''picks''' in v_def) > 0 then
    raise exception 'get_persona_world: picks já existe';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$do$;
