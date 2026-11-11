-- 11/11/2026 — Os itens da Cobra chegam à roleta e ao pôquer (pedido do Bruno).
--
-- Roleta (Poster Jackpot): cinco KITS (moldura + banner) — Motoqueiro Fantasma,
-- Game of Thrones, Rick and Morty, Família Soprano e The Walking Dead — que só
-- saem com a FICHA ESPECIAL, em 20% dos giros (poster_jackpot_settings.kit_chance).
-- O kit vem JUNTO com o pôster do giro, não no lugar dele: o giro em si
-- (jackpot_pull) não é tocado; quem sorteia é um gatilho em jackpot_pulls,
-- como o das tags de Jogos. Sai sempre um kit que a pessoa ainda não tem; com
-- os cinco, a Cobra não traz nada. O erro do gatilho nunca desfaz um giro.
--
-- Kit ganho vale para sempre, com ou sem Premium: a posse fica em
-- user_cosmetic_unlocks (a mesma dos prêmios do pôquer), que is_cosmetic_unlocked
-- já consulta primeiro. Nos requisitos, os kits ficam sem Premium e com a
-- "tag" 'cobra-kit', que is_required_tag_met nunca dá por cumprida.
--
-- A tag 🏍️ Spirit of Vengeance (hell-rider), que liberava a moldura e o banner
-- do Motoqueiro Fantasma, sai: o Motoqueiro vira o primeiro kit.
--
-- Pôquer: o baralho e a mesa Breaking Bad entram no catálogo da Cobra
-- (poker_items.cobra_pool), como dois itens separados; o sorteio de 20% dos
-- torneios (poker_cobra_draw) já existia.
--
-- Nada é apagado.

-- ---------------------------------------------------------------------------
-- 1. A tag Spirit of Vengeance sai das contas de desbloqueio
-- ---------------------------------------------------------------------------

create or replace function public.is_franchise_tag_unlocked(p_user_id uuid, p_tag_id text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_movie_ids integer[];
  v_required_count integer;
  v_watched_count integer;
begin
  -- 11/11/2026: 'hell-rider' (Spirit of Vengeance) saiu; o Motoqueiro virou kit da Cobra.
  case p_tag_id
    when 'red-pill-adept'     then v_movie_ids := array[603,604,605];                                  v_required_count := 3;
    when 'visceral-gamer'     then v_movie_ids := array[176,215,214,663,11917,22804,41439,298250,602734,951491]; v_required_count := 10;
    when 'nuts'               then v_movie_ids := array[425,950,8355,57800,278154,774825];              v_required_count := 6;
    when 'flux-capacitor-fan' then v_movie_ids := array[105,165,196];                                   v_required_count := 3;
    when 'hogwarts-graduate'  then v_movie_ids := array[671,672,673,674,675,767,12444,12445];           v_required_count := 8;
    when 'cybertron-sentinel' then v_movie_ids := array[424783,1858,91314,667538,335988,8373,38356];    v_required_count := 7;
    when 'death-dodger'       then v_movie_ids := array[9532,9358,9286,19912,55779];                    v_required_count := 5;
    when 'casual-drinker'     then v_movie_ids := array[18785,45243,109439];                            v_required_count := 3;
    when 'infinity-gauntlet'  then v_movie_ids := array[24428,299536,99861,299534];                     v_required_count := 4;
    else return false;
  end case;

  select count(*) into v_watched_count
  from user_movies
  where user_id = p_user_id and rating is not null and movie_id = any(v_movie_ids);

  return v_watched_count >= v_required_count;
end;
$function$;

create or replace function public.is_required_tag_met(p_user_id uuid, p_required_tag text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if p_required_tag is null then return true; end if;
  -- 11/11/2026: os kits da Cobra só se ganham na roleta (user_cosmetic_unlocks);
  -- nenhuma tag os libera.
  if p_required_tag = 'cobra-kit' then return false; end if;
  if p_required_tag in ('red-pill-adept','visceral-gamer','nuts','flux-capacitor-fan','hogwarts-graduate','cybertron-sentinel','death-dodger','casual-drinker','infinity-gauntlet') then
    return is_franchise_tag_unlocked(p_user_id, p_required_tag);
  end if;
  return is_progression_tag_unlocked(p_user_id, p_required_tag);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. O catálogo dos kits
-- ---------------------------------------------------------------------------

create table if not exists public.cobra_kits (
  id text primary key check (id ~ '^[a-z0-9-]{2,32}$'),
  name_pt text not null,
  name_en text not null,
  frame_id text not null,
  banner_id text not null,
  sort integer not null default 0,
  is_active boolean not null default true
);
comment on table public.cobra_kits is 'Kits da Cobra (moldura + banner) que saem na roleta com a ficha especial (11/11/2026).';
alter table public.cobra_kits enable row level security;
revoke all on public.cobra_kits from anon, authenticated;

insert into public.cobra_kits (id, name_pt, name_en, frame_id, banner_id, sort) values
  ('ghost-rider',     'Motoqueiro Fantasma', 'Ghost Rider',      'ghostRider',   'hellrider',    1),
  ('game-of-thrones', 'Game of Thrones',     'Game of Thrones',  'got',          'got',          2),
  ('rick-and-morty',  'Rick and Morty',      'Rick and Morty',   'rick-morty',   'rick-morty',   3),
  ('sopranos',        'Família Soprano',     'The Sopranos',     'sopranos',     'sopranos',     4),
  ('walking-dead',    'The Walking Dead',    'The Walking Dead', 'walking-dead', 'walking-dead', 5)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Requisitos: sem Premium, e só quem ganhou usa
-- ---------------------------------------------------------------------------

update public.cosmetic_requirements
   set is_premium = false, required_tag = 'cobra-kit'
 where (category, cosmetic_id) in (('frame', 'ghostRider'), ('banner', 'hellrider'));

insert into public.cosmetic_requirements (category, cosmetic_id, is_premium, required_tag)
select v.category, v.cosmetic_id, false, 'cobra-kit'
  from (values ('frame', 'got'), ('banner', 'got'),
               ('frame', 'rick-morty'), ('banner', 'rick-morty'),
               ('frame', 'sopranos'), ('banner', 'sopranos'),
               ('frame', 'walking-dead'), ('banner', 'walking-dead')) as v(category, cosmetic_id)
 where not exists (select 1 from public.cosmetic_requirements c where c.category = v.category and c.cosmetic_id = v.cosmetic_id);

-- ---------------------------------------------------------------------------
-- 4. A chance e o registro de quem ganhou
-- ---------------------------------------------------------------------------

alter table public.poster_jackpot_settings
  add column if not exists kit_chance numeric not null default 0.2 check (kit_chance between 0 and 1);
comment on column public.poster_jackpot_settings.kit_chance is
  'Chance de um giro com ficha especial trazer um kit da Cobra (moldura + banner) que a pessoa ainda não tem.';

create table if not exists public.cobra_kit_drops (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kit_id text not null references public.cobra_kits(id),
  pull_id bigint,
  created_at timestamptz not null default now(),
  -- a revelação já apareceu para a pessoa (null = ainda não viu)
  seen_at timestamptz,
  unique (user_id, kit_id)
);
comment on table public.cobra_kit_drops is 'Kits da Cobra ganhos na roleta: um por pessoa e kit; seen_at marca a revelação vista.';
alter table public.cobra_kit_drops enable row level security;
revoke all on public.cobra_kit_drops from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. O sorteio: depois de cada giro com ficha especial
-- ---------------------------------------------------------------------------

create or replace function public.trigger_cobra_kit_on_pull()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_chance numeric;
  v_kit public.cobra_kits%rowtype;
begin
  if coalesce(new.voided, false) or new.kind is distinct from 'special' then
    return null;
  end if;
  begin
    if exists (select 1 from bot_accounts b where b.user_id = new.user_id) then
      return null;
    end if;
    select s.kit_chance into v_chance from poster_jackpot_settings s limit 1;
    if random() >= coalesce(v_chance, 0.2) then
      return null;
    end if;
    -- um kit que a pessoa ainda não tem (nem ganho, nem com as duas peças já liberadas)
    select k.* into v_kit
      from cobra_kits k
     where k.is_active
       and not exists (select 1 from cobra_kit_drops d where d.user_id = new.user_id and d.kit_id = k.id)
       and not (exists (select 1 from user_cosmetic_unlocks u where u.user_id = new.user_id and u.category = 'frame' and u.cosmetic_id = k.frame_id)
                and exists (select 1 from user_cosmetic_unlocks u where u.user_id = new.user_id and u.category = 'banner' and u.cosmetic_id = k.banner_id))
     order by random()
     limit 1;
    if not found then
      return null;
    end if;
    insert into user_cosmetic_unlocks (user_id, category, cosmetic_id, source)
    values (new.user_id, 'frame', v_kit.frame_id, 'cobra-kit'),
           (new.user_id, 'banner', v_kit.banner_id, 'cobra-kit')
    on conflict do nothing;
    insert into cobra_kit_drops (user_id, kit_id, pull_id)
    values (new.user_id, v_kit.id, new.id)
    on conflict (user_id, kit_id) do nothing;
  exception when others then
    raise warning 'cobra kit (jackpot_pulls): %', sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function public.trigger_cobra_kit_on_pull() from public, anon, authenticated;

create or replace trigger cobra_kit_on_pull
  after insert on public.jackpot_pulls
  for each row when (new.kind = 'special')
  execute function public.trigger_cobra_kit_on_pull();

-- ---------------------------------------------------------------------------
-- 6. O que o site chama
-- ---------------------------------------------------------------------------

-- Os kits (com "tenho"), a chance e as revelações que a pessoa ainda não viu.
create or replace function public.get_cobra_kits()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'chance', (select s.kit_chance from poster_jackpot_settings s limit 1),
    'kits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.id,
               'name_pt', k.name_pt,
               'name_en', k.name_en,
               'frame_id', k.frame_id,
               'banner_id', k.banner_id,
               'owned', exists (select 1 from user_cosmetic_unlocks u where u.user_id = auth.uid() and u.category = 'frame' and u.cosmetic_id = k.frame_id)
                    and exists (select 1 from user_cosmetic_unlocks u where u.user_id = auth.uid() and u.category = 'banner' and u.cosmetic_id = k.banner_id),
               'won_at', (select d.created_at from cobra_kit_drops d where d.user_id = auth.uid() and d.kit_id = k.id)
             ) order by k.sort)
        from cobra_kits k
       where k.is_active), '[]'::jsonb),
    'unseen', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'kit_id', d.kit_id, 'created_at', d.created_at) order by d.created_at)
        from cobra_kit_drops d
       where d.user_id = auth.uid() and d.seen_at is null), '[]'::jsonb)
  );
$function$;

-- A revelação foi vista (não aparece de novo).
create or replace function public.ack_cobra_kit_drops(p_ids bigint[])
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update cobra_kit_drops
     set seen_at = now()
   where user_id = auth.uid() and id = any(p_ids) and seen_at is null;
$function$;

-- Usar o kit: moldura e banner de uma vez, conferindo a posse no servidor.
create or replace function public.equip_cobra_kit(p_kit text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_kit public.cobra_kits%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_kit from cobra_kits where id = p_kit and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not is_cosmetic_unlocked(v_uid, 'frame', v_kit.frame_id) or not is_cosmetic_unlocked(v_uid, 'banner', v_kit.banner_id) then
    return jsonb_build_object('ok', false, 'error', 'not_owned');
  end if;
  update profiles set avatar_frame = v_kit.frame_id, banner = v_kit.banner_id, updated_at = now() where id = v_uid;
  return jsonb_build_object('ok', true, 'frame_id', v_kit.frame_id, 'banner_id', v_kit.banner_id);
end;
$function$;

revoke all on function public.get_cobra_kits() from public, anon;
revoke all on function public.ack_cobra_kit_drops(bigint[]) from public, anon;
revoke all on function public.equip_cobra_kit(text) from public, anon;
grant execute on function public.get_cobra_kits() to authenticated;
grant execute on function public.ack_cobra_kit_drops(bigint[]) to authenticated;
grant execute on function public.equip_cobra_kit(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Pôquer: o conjunto Breaking Bad no catálogo da Cobra (itens separados)
-- ---------------------------------------------------------------------------

insert into public.poker_items (id, kind, name_pt, name_en, is_default, sort, is_active, cobra_pool) values
  ('deck-breaking-bad',  'deck',  'Baralho Breaking Bad', 'Breaking Bad Deck',  false, 2, true, true),
  ('table-breaking-bad', 'table', 'Mesa Breaking Bad',    'Breaking Bad Table', false, 2, true, true)
on conflict (id) do nothing;
