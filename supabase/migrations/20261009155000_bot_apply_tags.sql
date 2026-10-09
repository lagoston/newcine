-- Tags dos bots: aplica as regras de unlockedPinsFrom() (src/lib/tagProgress.ts) às estatísticas de bot_tag_stats(),
-- grava as liberadas em user_unlocked_tags e equipa uma ao acaso — de preferência uma que diga algo do gosto
-- (franquia, humor, curadoria, CineHater…); sem nenhuma dessas, a faixa de quantidade mais alta.
-- Gerado a partir de src/lib/tags.ts e src/lib/continents.ts em 09/10/2026.
create or replace function curation.apply_bot_tags()
returns integer
language plpgsql
security definer
set search_path to 'curation', 'public'
as $fn$
declare
  v_n integer := 0;
begin
  with defs(category, name, emoji, metric, threshold, is_tier) as (values
    ('basic', 'Balcony Regular', '🎬', 'rated', 1, true),
    ('basic', 'Seat Warmer', '🪑', 'rated', 20, true),
    ('basic', 'Popcorn Pro', '🍿', 'rated', 50, true),
    ('basic', 'Reel Addict', '🎞️', 'rated', 100, true),
    ('basic', 'Cine Elite', '🏆', 'rated', 200, true),
    ('basic', 'Projectionist Supreme', '📽️', 'rated', 500, true),
    ('basic', 'Cinematic Guru', '🧙', 'rated', 1000, true),
    ('basic', 'CineHater', '👎', 'hater', 20, false),
    ('basic', 'Golden Reel', '🌟', 'golden', 20, false),
    ('basic', 'Enigmatic', '🧩', 'mood:mind-blowing', 50, false),
    ('basic', 'Bloody Mary', '🩸', 'mood:dark-and-scary', 50, false),
    ('basic', 'Dreamwalker', '🍭', 'mood:drug-trip', 50, false),
    ('basic', 'Trailblazer', '🤿', 'mood:adventures', 50, false),
    ('basic', 'Soul Collector', '☯️', 'mood:catharsis', 50, false),
    ('basic', 'Daredevil', '🧨', 'mood:adrenaline', 50, false),
    ('basic', 'Cine Cupid', '💕', 'mood:romantic', 50, false),
    ('basic', 'Peter Pan', '🧚‍♂️', 'mood:family-time', 50, false),
    ('basic', 'Punchliner', '😂', 'mood:laugh-out-loud', 50, false),
    ('basic', 'Director''s Cut', '🎥', 'dir_max', 10, false),
    ('basic', 'Nowhere', '📍', 'countries', 30, false),
    ('basic', 'World Tour', '🌎', 'continents', 5, false),
    ('basic', 'Scribbler', '✏️', 'reviews_real', 1, false),
    ('basic', 'Screenwriter', '🖋️', 'reviews_real', 10, false),
    ('basic', 'Memoirist', '📓', 'reviews_real', 30, false),
    ('basic', 'Sofa Sleeper', '🛋️', 'never', 1, false),
    ('theme', 'Mockingjay Victor', '🏹', 'theme:mockingjay-victor', 5, false),
    ('theme', 'Lucky Player', '🎲', 'theme:lucky-player', 2, false),
    ('theme', 'Death Dodger', '💀', 'theme:death-dodger', 5, false),
    ('theme', 'Hogwarts Graduate', '🧙‍♂️', 'theme:hogwarts-graduate', 8, false),
    ('theme', 'Force Founder', '⚔️', 'theme:force-founder', 3, false),
    ('theme', 'Don of Cinema', '🎩', 'theme:don-of-cinema', 3, false),
    ('theme', 'Trap Builder', '🏠', 'theme:trap-builder', 2, false),
    ('theme', 'Red-Pill Adept', '💊', 'theme:red-pill-adept', 3, false),
    ('theme', 'Flux-Capacitor Fan', '⚡', 'theme:flux-capacitor-fan', 3, false),
    ('theme', 'Ring Expert', '💍', 'theme:ring-expert', 3, false),
    ('theme', 'Toy Collector', '🧸', 'theme:toy-collector', 4, false),
    ('theme', 'Whip-Crack Scholar', '🤠', 'theme:whip-crack-scholar', 4, false),
    ('theme', 'Sailor', '🏴‍☠️', 'theme:sailor', 5, false),
    ('theme', 'Senior Mechanic', '🏎️', 'theme:senior-mechanic', 10, false),
    ('theme', 'Cybertron Sentinel', '🤖', 'theme:cybertron-sentinel', 7, false),
    ('theme', 'Spirit of Vengeance', '🏍️', 'theme:hell-rider', 2, false),
    ('theme', 'Swamp Royalty', '👹', 'theme:swamp-royalty', 4, false),
    ('theme', 'Dino Tamer', '🦖', 'theme:dino-tamer', 6, false),
    ('theme', 'Banana Boss', '🍌', 'theme:banana-boss', 5, false),
    ('theme', 'Baba Yaga', '🔫', 'theme:baba-yaga', 4, false),
    ('theme', 'Casual Drinker', '🍺', 'theme:casual-drinker', 3, false),
    ('theme', 'Sweetie Pie', '🥧', 'theme:sweetie-pie', 4, false),
    ('theme', 'Visceral Gamer', '🎮', 'theme:visceral-gamer', 10, false),
    ('theme', 'Nuts', '🐿️', 'theme:nuts', 6, false),
    ('theme', 'Dark Spirit', '🦇', 'theme:dark-spirit', 3, false),
    ('theme', 'Infinity Gauntlet', '🧤', 'theme:infinity-gauntlet', 4, false),
    ('theme', 'Sharp Canine', '🧛', 'theme:sharp-canine', 5, false),
    ('theme', 'Primal Essence', '🦍', 'theme:primal-essence', 4, false),
    ('community', 'Spotlight Spark', '✨', 'friends', 1, false),
    ('community', 'Rising Star', '⭐', 'friends', 10, false),
    ('community', 'Red-Carpet Regular', '🎭', 'friends', 25, false),
    ('community', 'Festival Favorite', '🎪', 'friends', 50, false),
    ('community', 'Blockbuster', '💥', 'friends', 100, false),
    ('community', 'Cult Legend', '👑', 'friends', 200, false),
    ('oracle', 'Lagooner', '🚤', 'oracle:bogart', 50, false),
    ('oracle', 'Bug-eater', '🦟', 'oracle:bogart', 100, false),
    ('oracle', 'Quick Tongue', '🐸', 'oracle:bogart', 200, false),
    ('oracle', 'Tape Colector', '📼', 'oracle:fincher', 50, false),
    ('oracle', 'Cine Smoker', '🚬', 'oracle:fincher', 100, false),
    ('oracle', 'Keen Sense', '🦊', 'oracle:fincher', 200, false),
    ('oracle', 'Crawler', '🚇', 'oracle:cypher', 50, false),
    ('oracle', 'Poison Taster', '🧪', 'oracle:cypher', 100, false),
    ('oracle', 'Underworld King', '🐍', 'oracle:cypher', 200, false),
    ('oracle', 'From Beyond', '✉️', 'reviews_ai', 1, false),
    ('oracle', 'Ghost Writer', '👻', 'reviews_ai', 10, false),
    ('oracle', 'Third Eye Open', '👁️', 'reviews_ai', 50, false)
  ),
  cont(country, continent) as (values ('US', 'América'),('CA', 'América'),('MX', 'América'),('BR', 'América'),('AR', 'América'),('CL', 'América'),('CO', 'América'),('PE', 'América'),('UY', 'América'),('PY', 'América'),('BO', 'América'),('VE', 'América'),('EC', 'América'),('CR', 'América'),('PA', 'América'),('CU', 'América'),('DO', 'América'),('GT', 'América'),('HN', 'América'),('SV', 'América'),('NI', 'América'),('JM', 'América'),('PR', 'América'),('GY', 'América'),('SR', 'América'),('BZ', 'América'),('BS', 'América'),('BB', 'América'),('TT', 'América'),('GD', 'América'),('LC', 'América'),('VC', 'América'),('DM', 'América'),('KN', 'América'),('BM', 'América'),('GB', 'Europa'),('IE', 'Europa'),('FR', 'Europa'),('DE', 'Europa'),('ES', 'Europa'),('PT', 'Europa'),('IT', 'Europa'),('NL', 'Europa'),('BE', 'Europa'),('LU', 'Europa'),('CH', 'Europa'),('AT', 'Europa'),('DK', 'Europa'),('SE', 'Europa'),('NO', 'Europa'),('FI', 'Europa'),('IS', 'Europa'),('PL', 'Europa'),('CZ', 'Europa'),('SK', 'Europa'),('HU', 'Europa'),('RO', 'Europa'),('BG', 'Europa'),('GR', 'Europa'),('HR', 'Europa'),('RS', 'Europa'),('SI', 'Europa'),('BA', 'Europa'),('AL', 'Europa'),('MK', 'Europa'),('ME', 'Europa'),('MT', 'Europa'),('CY', 'Europa'),('LT', 'Europa'),('LV', 'Europa'),('EE', 'Europa'),('UA', 'Europa'),('BY', 'Europa'),('MD', 'Europa'),('RU', 'Europa'),('AD', 'Europa'),('SM', 'Europa'),('VA', 'Europa'),('LI', 'Europa'),('MC', 'Europa'),('SU', 'Europa'),('EG', 'África'),('LY', 'África'),('TN', 'África'),('DZ', 'África'),('MA', 'África'),('SD', 'África'),('SS', 'África'),('ET', 'África'),('SO', 'África'),('KE', 'África'),('UG', 'África'),('TZ', 'África'),('RW', 'África'),('BI', 'África'),('NG', 'África'),('GH', 'África'),('CI', 'África'),('SN', 'África'),('ML', 'África'),('NE', 'África'),('BF', 'África'),('TD', 'África'),('CM', 'África'),('CD', 'África'),('CG', 'África'),('GA', 'África'),('AO', 'África'),('ZM', 'África'),('ZW', 'África'),('MZ', 'África'),('MW', 'África'),('NA', 'África'),('BW', 'África'),('ZA', 'África'),('LS', 'África'),('SZ', 'África'),('MG', 'África'),('MU', 'África'),('GN', 'África'),('SL', 'África'),('LR', 'África'),('GM', 'África'),('GW', 'África'),('MR', 'África'),('TG', 'África'),('BJ', 'África'),('CV', 'África'),('DJ', 'África'),('ER', 'África'),('TR', 'Ásia'),('GE', 'Ásia'),('AM', 'Ásia'),('AZ', 'Ásia'),('IL', 'Ásia'),('PS', 'Ásia'),('LB', 'Ásia'),('JO', 'Ásia'),('SY', 'Ásia'),('IQ', 'Ásia'),('SA', 'Ásia'),('AE', 'Ásia'),('QA', 'Ásia'),('KW', 'Ásia'),('BH', 'Ásia'),('OM', 'Ásia'),('YE', 'Ásia'),('IR', 'Ásia'),('AF', 'Ásia'),('PK', 'Ásia'),('IN', 'Ásia'),('NP', 'Ásia'),('BD', 'Ásia'),('BT', 'Ásia'),('LK', 'Ásia'),('MV', 'Ásia'),('CN', 'Ásia'),('JP', 'Ásia'),('KR', 'Ásia'),('KP', 'Ásia'),('MN', 'Ásia'),('TW', 'Ásia'),('HK', 'Ásia'),('TH', 'Ásia'),('VN', 'Ásia'),('LA', 'Ásia'),('KH', 'Ásia'),('MM', 'Ásia'),('MY', 'Ásia'),('SG', 'Ásia'),('ID', 'Ásia'),('PH', 'Ásia'),('BN', 'Ásia'),('TL', 'Ásia'),('KZ', 'Ásia'),('UZ', 'Ásia'),('TM', 'Ásia'),('KG', 'Ásia'),('TJ', 'Ásia'),('AU', 'Oceania'),('NZ', 'Oceania'),('FJ', 'Oceania'),('PG', 'Oceania'),('NC', 'Oceania'),('PF', 'Oceania'),('WS', 'Oceania'),('TO', 'Oceania'),('VU', 'Oceania'),('SB', 'Oceania'),('KI', 'Oceania'),('TV', 'Oceania'),('NR', 'Oceania'),('PW', 'Oceania'),('FM', 'Oceania'),('MH', 'Oceania'),('GU', 'Oceania')),
  st as (select * from json_to_recordset(curation.bot_tag_stats()) as x(handle text, user_id uuid, rated int, hater int, golden int, dir_max int,
           countries text[], moods jsonb, oracles jsonb, theme jsonb, friends int, reviews_real int, reviews_ai int, special jsonb)),
  metric_val as (
    select st.user_id, d.category, d.name, d.emoji, d.is_tier, d.threshold,
      case
        when d.metric = 'rated' then st.rated
        when d.metric = 'hater' then st.hater
        when d.metric = 'golden' then st.golden
        when d.metric = 'dir_max' then st.dir_max
        when d.metric = 'countries' then coalesce(cardinality(st.countries), 0)
        when d.metric = 'continents' then (select count(distinct c.continent) from unnest(st.countries) u(cc) join cont c on c.country = u.cc)
        when d.metric = 'reviews_real' then st.reviews_real
        when d.metric = 'reviews_ai' then st.reviews_ai
        when d.metric = 'friends' then st.friends
        when d.metric like 'mood:%' then coalesce((st.moods->>substr(d.metric, 6))::int, 0)
        when d.metric like 'theme:%' then coalesce((st.theme->>substr(d.metric, 7))::int, 0)
        when d.metric like 'oracle:%' then coalesce((st.oracles->>substr(d.metric, 8))::int, 0)
        else 0
      end val
    from st cross join defs d
  ),
  pins as (
    select user_id, category, name, emoji, is_tier, threshold from metric_val where val >= threshold
    union all
    select st.user_id, 'special', s->>'name', s->>'emoji', false, 0 from st cross join lateral jsonb_array_elements(st.special) s
  ),
  ins as (
    insert into public.user_unlocked_tags (user_id, category, tag_name)
    select user_id, category, name from pins
    on conflict (user_id, category, tag_name) do nothing
    returning 1
  ),
  pick as (
    select distinct on (user_id) user_id, jsonb_build_object('name', name, 'emoji', emoji, 'category', category) tag
    from pins
    order by user_id, (not is_tier) desc, case when is_tier then -threshold else 0 end, random()
  ),
  upd as (
    update public.profiles p set active_tag = pick.tag from pick
    where p.id = pick.user_id
      and not (p.active_tag is not null and exists (
        select 1 from pins x where x.user_id = p.id and x.name = p.active_tag->>'name' and not x.is_tier))
    returning 1
  )
  select (select count(*) from ins) + (select count(*) from upd) into v_n;
  return v_n;
end $fn$;
revoke all on function curation.apply_bot_tags() from public, anon, authenticated;
