-- Personalização: cartas Yu-Gi-Oh! dependem da Trailblazer, e a moldura e o
-- banner dos Vingadores (Infinity Gauntlet).
--
--   • A carta Yu-Gi-Oh! passa a exigir a tag Trailblazer (50 filmes da
--     prateleira Aventuras), do mesmo jeito que a Horror exige a Bloody
--     Mary. Quem está usando a Yu-Gi-Oh! sem a tag volta para a carta
--     padrão agora (reconcile_user_cosmetics, o mesmo que já roda quando a
--     biblioteca muda).
--   • O CHECK de profiles.card_style só aceitava 'default' e 'yugioh': a
--     carta Horror nunca conseguia ser gravada. Passa a aceitar 'horror'.
--   • Moldura e banner 'avengers' (Premium), liberados pela Infinity
--     Gauntlet: os 4 filmes dos Vingadores (2012, Era de Ultron, Guerra
--     Infinita e Ultimato).

-- Carta Horror: o CHECK passa a conhecer a carta
alter table public.profiles drop constraint if exists profiles_card_style_check;
alter table public.profiles
  add constraint profiles_card_style_check
  check (card_style = any (array['default'::text, 'yugioh'::text, 'horror'::text]));

-- Carta Yu-Gi-Oh! ← Trailblazer
update public.cosmetic_requirements
set required_tag = 'Trailblazer'
where category = 'card' and cosmetic_id = 'yugioh';

-- Moldura e banner dos Vingadores ← Infinity Gauntlet
insert into public.cosmetic_requirements (category, cosmetic_id, is_premium, required_tag)
values
  ('frame', 'avengers', true, 'infinity-gauntlet'),
  ('banner', 'avengers', true, 'infinity-gauntlet')
on conflict (category, cosmetic_id) do update
set is_premium = excluded.is_premium, required_tag = excluded.required_tag;

create or replace function public.is_franchise_tag_unlocked(p_user_id uuid, p_tag_id text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_movie_ids integer[];
  v_required_count integer;
  v_watched_count integer;
begin
  case p_tag_id
    when 'red-pill-adept'     then v_movie_ids := array[603,604,605];                                  v_required_count := 3;
    when 'visceral-gamer'     then v_movie_ids := array[176,215,214,663,11917,22804,41439,298250,602734,951491]; v_required_count := 10;
    when 'nuts'               then v_movie_ids := array[425,950,8355,57800,278154,774825];              v_required_count := 6;
    when 'flux-capacitor-fan' then v_movie_ids := array[105,165,196];                                   v_required_count := 3;
    when 'hogwarts-graduate'  then v_movie_ids := array[671,672,673,674,675,767,12444,12445];           v_required_count := 8;
    when 'cybertron-sentinel' then v_movie_ids := array[424783,1858,91314,667538,335988,8373,38356];    v_required_count := 7;
    when 'death-dodger'       then v_movie_ids := array[9532,9358,9286,19912,55779];                    v_required_count := 5;
    when 'casual-drinker'     then v_movie_ids := array[18785,45243,109439];                            v_required_count := 3;
    when 'hell-rider'         then v_movie_ids := array[1250,71676];                                    v_required_count := 2;
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
stable
security definer
set search_path to 'public'
as $function$
begin
  if p_required_tag is null then return true; end if;
  if p_required_tag in ('red-pill-adept','visceral-gamer','nuts','flux-capacitor-fan','hogwarts-graduate','cybertron-sentinel','death-dodger','casual-drinker','hell-rider','infinity-gauntlet') then
    return is_franchise_tag_unlocked(p_user_id, p_required_tag);
  end if;
  return is_progression_tag_unlocked(p_user_id, p_required_tag);
end;
$function$;

-- Quem usa a Yu-Gi-Oh! sem a Trailblazer volta para a carta padrão.
do $$
declare
  u record;
begin
  for u in select p.id from public.profiles p where p.card_style = 'yugioh' loop
    perform public.reconcile_user_cosmetics(u.id);
  end loop;
end;
$$;
