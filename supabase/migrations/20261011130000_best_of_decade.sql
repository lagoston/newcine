-- "Melhores da Década" (11/10/2026, pedido do Bruno): Top 100 e Por década
-- viram uma organização só. O Top 100 (lista, Organizar e Duelo) sai.
--
--   • Uma prateleira por década, com a cor da era e a média, como era o Por
--     década; dentro dela, os títulos pela nota da pessoa, e ela pode mudar a
--     ordem (library_decade_order). Título avaliado depois entra pela nota,
--     antes do primeiro da ordem salva que tem nota menor.
--   • Só com a tag 🏆 Cine Elite (200 títulos avaliados). Perdeu a tag
--     (tirou notas e ficou abaixo de 200), a organização volta para Notas —
--     igual às molduras e banners (reconcile_user_cosmetics). A ordem de cada
--     década fica guardada para quando a tag voltar.
--   • profiles.library_layout continua aceitando 'top100' só por
--     compatibilidade: vira 'decades' na hora de gravar.
--   • library_top100 fica sem uso (não foi apagada).

-- 1. As tags de quantidade de títulos avaliados também valem no banco
--    (antes só o app calculava: Cine Elite = 200+ títulos com nota, filmes e
--    séries, a mesma conta de src/lib/tagProgress.ts).
create or replace function public.is_progression_tag_unlocked(p_user_id uuid, p_tag_name text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
  v_mood text;
begin
  v_mood := case p_tag_name
    when 'Enigmatic' then 'mind-blowing'
    when 'Bloody Mary' then 'dark-and-scary'
    when 'Dreamwalker' then 'drug-trip'
    when 'Trailblazer' then 'adventures'
    when 'Soul Collector' then 'catharsis'
    when 'Daredevil' then 'adrenaline'
    when 'Cine Cupid' then 'romantic'
    when 'Peter Pan' then 'family-time'
    when 'Punchliner' then 'laugh-out-loud'
    else null
  end;

  if v_mood is not null then
    select count(distinct um.movie_id) into v_count
      from user_movies um
     where um.user_id = p_user_id
       and um.rating is not null
       and um.media_type = 'movie'
       and exists (
         select 1
           from recommendation_pools rp
          where rp.mood_key = v_mood
            and rp.movie_ids @> to_jsonb(um.movie_id)
       );
    return v_count >= 50;
  end if;

  if p_tag_name in ('Balcony Regular', 'Seat Warmer', 'Popcorn Pro', 'Reel Addict', 'Cine Elite', 'Projectionist Supreme', 'Cinematic Guru') then
    select count(*) into v_count
      from user_movies
     where user_id = p_user_id and rating is not null;
    return v_count >= (case p_tag_name
      when 'Balcony Regular' then 1
      when 'Seat Warmer' then 20
      when 'Popcorn Pro' then 50
      when 'Reel Addict' then 100
      when 'Cine Elite' then 200
      when 'Projectionist Supreme' then 500
      else 1000
    end);
  end if;

  if p_tag_name = 'CineHater' then
    select count(*) into v_count
      from user_movies
     where user_id = p_user_id and rating is not null and rating <= 3;
    return v_count >= 20;
  end if;

  if p_tag_name in ('Scribbler', 'Screenwriter', 'Memoirist') then
    select count(*) into v_count
      from reviews
     where user_id = p_user_id and is_ai_generated = false;
    return v_count >= (case p_tag_name when 'Scribbler' then 1 when 'Screenwriter' then 10 else 30 end);
  end if;

  return false;
end;
$function$;

-- 2. A ordem de cada década. decade = 1990, 2000...; 0 = sem data.
--    item_keys = 'movie:105' / 'tv:105' na ordem escolhida (vazio = pela nota).
create table if not exists public.library_decade_order (
  user_id uuid not null references auth.users (id) on delete cascade,
  decade smallint not null,
  item_keys text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, decade)
);

alter table public.library_decade_order enable row level security;

-- Quem pode ver a biblioteca da pessoa vê a ordem dela (perfil da comunidade).
create policy "Ordem das décadas segue a visibilidade da biblioteca"
  on public.library_decade_order for select
  using (public.can_view_user_content(user_id));

create policy "Dono cria a ordem das próprias décadas"
  on public.library_decade_order for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Dono atualiza a ordem das próprias décadas"
  on public.library_decade_order for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.library_decade_order to authenticated;
grant select on public.library_decade_order to anon;

comment on table public.library_top100 is
  'Sem uso desde 11/10/2026: o Top 100 virou "Melhores da Década" (library_decade_order).';

-- 3. Gravar a organização: 'top100' vira 'decades'; 'decades' sem a Cine
--    Elite vira 'notes'.
create or replace function public.enforce_library_layout()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.library_layout = 'top100' then
    new.library_layout := 'decades';
  end if;
  if new.library_layout = 'decades' and not public.is_progression_tag_unlocked(new.id, 'Cine Elite') then
    new.library_layout := 'notes';
  end if;
  return new;
end;
$function$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'enforce_library_layout' and tgrelid = 'public.profiles'::regclass) then
    create trigger enforce_library_layout
      before insert or update of library_layout on public.profiles
      for each row execute function public.enforce_library_layout();
  end if;
end $$;

-- 4. Perdeu a Cine Elite: a organização volta para Notas. Roda junto com a
--    conferência das molduras e banners (gatilho em user_movies, ao apagar
--    um título ou mudar/tirar a nota).
create or replace function public.reconcile_user_cosmetics(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile record;
begin
  select avatar_frame, banner, card_style, text_effect, library_layout into v_profile
  from profiles where id = p_user_id;

  if not found then return; end if;

  if v_profile.avatar_frame is not null and v_profile.avatar_frame != 'default'
     and not is_cosmetic_unlocked(p_user_id, 'frame', v_profile.avatar_frame) then
    update profiles set avatar_frame = 'default' where id = p_user_id;
  end if;

  if v_profile.banner is not null and v_profile.banner != 'default'
     and not is_cosmetic_unlocked(p_user_id, 'banner', v_profile.banner) then
    update profiles set banner = 'default' where id = p_user_id;
  end if;

  if v_profile.card_style is not null and v_profile.card_style != 'default'
     and not is_cosmetic_unlocked(p_user_id, 'card', v_profile.card_style) then
    update profiles set card_style = 'default' where id = p_user_id;
  end if;

  if v_profile.text_effect is not null and v_profile.text_effect != 'default'
     and not is_cosmetic_unlocked(p_user_id, 'text_effect', v_profile.text_effect) then
    update profiles set text_effect = 'default' where id = p_user_id;
  end if;

  if v_profile.library_layout in ('decades', 'top100')
     and not is_progression_tag_unlocked(p_user_id, 'Cine Elite') then
    update profiles set library_layout = 'notes' where id = p_user_id;
  end if;
end;
$function$;

-- 5. Quem estava no Top 100 ou no Por década: vai para Melhores da Década
--    se tiver a Cine Elite; senão, Notas (o gatilho decide).
update public.profiles set library_layout = library_layout
where library_layout in ('top100', 'decades');

-- 6. A ordem do Top 100 vira a ordem das décadas, só onde ela era diferente
--    da ordem das notas (duelos e mudanças à mão). Nas outras décadas, vale
--    a nota, que se ajusta sozinha quando a pessoa reavalia.
insert into public.library_decade_order (user_id, decade, item_keys)
select x.user_id, x.decade, x.keys
from (
  select k.user_id, k.decade,
         array_agg(k.key order by k.ord) keys,
         array_agg(k.key order by k.rating desc, k.created_at desc) by_rating
  from (
    select t.user_id, u.key, u.ord, um.rating, um.created_at,
           coalesce((floor(extract(year from mc.release_date) / 10) * 10)::smallint, 0::smallint) decade
    from public.library_top100 t
    cross join lateral unnest(t.item_keys) with ordinality u(key, ord)
    join public.user_movies um
      on um.user_id = t.user_id
     and um.rating is not null
     and um.movie_id = split_part(u.key, ':', 2)::int
     and coalesce(um.media_type, 'movie') = split_part(u.key, ':', 1)
    left join public.movie_cache mc
      on mc.tmdb_id = um.movie_id
     and mc.media_type = coalesce(um.media_type, 'movie')
    where cardinality(t.item_keys) > 0
  ) k
  group by k.user_id, k.decade
) x
where x.keys <> x.by_rating
on conflict (user_id, decade) do nothing;
