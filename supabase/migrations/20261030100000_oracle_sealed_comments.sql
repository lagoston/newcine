-- O comentário do oráculo fica selado em cada título (30/10/2026, pedido do
-- Bruno). Até aqui, o balão do oráculo no menu do filme sorteava uma frase do
-- banco (src/lib/oracleFlavorPhrases.ts) a cada abertura: o mesmo filme
-- mostrava uma frase diferente cada vez.
--
-- Agora:
--   - oracle_flavor_phrases: o banco de frases, no banco de dados, por
--     oráculo, humor e tipo (as de filme vêm do arquivo do site; as de série
--     são novas, porque as de filme falam em "filme");
--   - title_oracle_comments: o comentário de cada título das prateleiras,
--     um por (oráculo, humor, tipo, título). source = 'custom' (escrito para
--     aquela obra) ou 'bank' (sorteado do banco);
--   - título que entra numa prateleira ganha na hora uma frase sorteada do
--     banco, que fica selada (gatilho em recommendation_pools);
--   - get_title_oracle_comments(id, tipo): os oráculos do título com o
--     comentário selado (o site usa esta; get_title_oracle_mood_sources
--     continua igual para os apps antigos).

create table if not exists public.oracle_flavor_phrases (
  id serial primary key,
  card_type text not null check (card_type in ('bogart', 'fincher', 'cypher')),
  mood_key text not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  pt text not null,
  en text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists oracle_flavor_phrases_pick on public.oracle_flavor_phrases (card_type, mood_key, media_type) where is_active;
alter table public.oracle_flavor_phrases enable row level security;
revoke all on public.oracle_flavor_phrases from anon, authenticated;

create table if not exists public.title_oracle_comments (
  card_type text not null,
  mood_key text not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  pt text not null,
  en text not null,
  source text not null check (source in ('bank', 'custom')),
  phrase_id integer references public.oracle_flavor_phrases(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (card_type, mood_key, media_type, tmdb_id)
);
create index if not exists title_oracle_comments_title on public.title_oracle_comments (media_type, tmdb_id);
alter table public.title_oracle_comments enable row level security;
revoke all on public.title_oracle_comments from anon, authenticated;

-- Sela uma frase sorteada do banco para o título (se ainda não tiver).
create or replace function public.seal_title_oracle_comment(p_card text, p_mood text, p_media text, p_id integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if p_mood is null or p_mood = 'random-surprise' then
    return false;
  end if;
  if exists (select 1 from title_oracle_comments c
              where c.card_type = p_card and c.mood_key = p_mood and c.media_type = p_media and c.tmdb_id = p_id) then
    return false;
  end if;
  select f.id, f.pt, f.en into v
    from oracle_flavor_phrases f
   where f.card_type = p_card and f.mood_key = p_mood and f.media_type = p_media and f.is_active
   order by random()
   limit 1;
  if not found then
    return false;
  end if;
  insert into title_oracle_comments (card_type, mood_key, media_type, tmdb_id, pt, en, source, phrase_id)
  values (p_card, p_mood, p_media, p_id, v.pt, v.en, 'bank', v.id)
  on conflict do nothing;
  return true;
end;
$$;

-- Sela o que estiver sem comentário nas prateleiras (rede de segurança).
create or replace function public.seal_missing_oracle_comments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select s.card_type, s.mood_key, s.media_type, s.tmdb_id
      from public.shelf_titles() s
     where s.mood_key <> 'random-surprise'
       and not exists (select 1 from title_oracle_comments c
                        where c.card_type = s.card_type and c.mood_key = s.mood_key
                          and c.media_type = s.media_type and c.tmdb_id = s.tmdb_id)
  loop
    if public.seal_title_oracle_comment(r.card_type, r.mood_key, r.media_type, r.tmdb_id) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- Título novo numa prateleira: frase sorteada e selada na hora.
create or replace function public.trigger_seal_new_shelf_titles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id integer;
begin
  if new.mood_key is null or new.mood_key = 'random-surprise' then
    return new;
  end if;
  for v_id in
    select x::int from jsonb_array_elements_text(coalesce(new.movie_ids, '[]'::jsonb)) x
     where tg_op = 'INSERT' or not coalesce(old.movie_ids, '[]'::jsonb) @> to_jsonb(x::int)
  loop
    perform public.seal_title_oracle_comment(new.card_type, new.mood_key, 'movie', v_id);
  end loop;
  for v_id in
    select x::int from jsonb_array_elements_text(coalesce(new.tv_ids, '[]'::jsonb)) x
     where tg_op = 'INSERT' or not coalesce(old.tv_ids, '[]'::jsonb) @> to_jsonb(x::int)
  loop
    perform public.seal_title_oracle_comment(new.card_type, new.mood_key, 'tv', v_id);
  end loop;
  return new;
exception when others then
  -- nunca impede a mudança na prateleira
  return new;
end;
$$;

create or replace trigger pools_seal_oracle_comments
  after insert or update of movie_ids, tv_ids on public.recommendation_pools
  for each row execute function public.trigger_seal_new_shelf_titles();

-- Para o menu do filme: em que oráculo/humor o título está e o comentário
-- selado de cada um.
create or replace function public.get_title_oracle_comments(p_id integer, p_media_type text default 'movie')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('card_type', rp.card_type, 'mood_key', rp.mood_key, 'pt', c.pt, 'en', c.en)
                            order by rp.card_type, rp.mood_key), '[]'::jsonb)
    from recommendation_pools rp
    left join title_oracle_comments c
      on c.card_type = rp.card_type and c.mood_key = rp.mood_key
     and c.media_type = (case when p_media_type = 'tv' then 'tv' else 'movie' end) and c.tmdb_id = p_id
   where rp.mood_key <> 'random-surprise'
     and (case when p_media_type = 'tv' then rp.tv_ids else rp.movie_ids end) @> to_jsonb(array[p_id]);
$$;

revoke all on function public.get_title_oracle_comments(integer, text) from public;
grant execute on function public.get_title_oracle_comments(integer, text) to anon, authenticated;
revoke all on function public.seal_title_oracle_comment(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.seal_missing_oracle_comments() from public, anon, authenticated;
