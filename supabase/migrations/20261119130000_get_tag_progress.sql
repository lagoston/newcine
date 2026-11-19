-- 19/11/2026 — Protocolo Reborn, onda 3 do banco (rede.md, A6): as tags
-- calculadas no servidor, parte 1 de 2 (o progresso).
--
-- Hoje o aparelho calcula as tags (src/lib/tagProgress.ts, fetchTagProgress):
-- 11 idas a cada 15 min na Home e a cada abertura do modal de Tags e do
-- Personalizar — todos os títulos avaliados, as 30 prateleiras inteiras,
-- special_tags, diretor e país de cada título, o progresso de todas as séries.
--
-- get_tag_progress() devolve, para quem está logado, o MESMO objeto
-- TagProgress que o fetchTagProgress monta (ratedCount, followers, basic,
-- theme, oracle, specialTags, gameTags, pokerUpcomingTags), regra por regra:
--   • só títulos com nota; humores e curadorias casam por tipo (filme/série);
--   • CineHater = notas de 0 a 3; Golden Reel = notas 10;
--   • Director's Cut, Nowhere e World Tour só olham títulos com linha no
--     movie_cache (o primeiro país de origem; o continente pela tabela abaixo);
--   • Scribbler/Screenwriter/Memoirist = resenhas escritas; as do oráculo
--     (From Beyond…) = resenhas de IA;
--   • Sofa Sleeper = alguma série encerrada com todos os episódios lançados
--     vistos (a mesma conta de get_tv_progress_batch);
--   • temáticas = filmes da franquia com nota;
--   • especiais e de Jogos: as que a pessoa tem ou que estão no ar, na ordem
--     da tabela (especiais) e na ordem da lista de Jogos do site.
--
-- As definições (nomes, metas, franquias, continentes) moram em
-- src/lib/tags.ts e src/lib/continents.ts. Para o banco calcular, elas
-- precisam existir aqui: tag_rules e country_continents, preenchidas por esta
-- migração a partir dos dois arquivos (geradas por script, não digitadas; o
-- emoji vai como códigos hexadecimais, 1f9da-200d-2642-fe0f, remontados com
-- chr(): texto puro, que nenhuma ferramenta altera no caminho). ATENÇÃO: tag
-- nova ou meta mudada em tags.ts pede uma migração que atualize tag_rules —
-- senão o banco e a tela discordam.
--
-- RPC NOVA (só acréscimo); fetchTagProgress continua valendo (APK antigo e
-- perfil de outras pessoas). SECURITY DEFINER porque pool_titles e as duas
-- tabelas novas não são abertas à tela; não recebe usuário: é sempre
-- auth.uid(). Só lê dados da própria pessoa e catálogos.

create table if not exists public.tag_rules (
  category text    not null,
  tag_key  text    not null,   -- o nome (básicas, comunidade) ou o id (temáticas, oráculo, jogos)
  name     text,               -- null = igual a tag_key
  emoji    text,
  kind     text    not null,   -- rated, rating, mood, director, countries, continents, review_count,
                               -- completed_series, franchise, friends, curated_pool, ai_review_count, game
  goal     integer,            -- a meta (minMovies, count, minFollowers)
  param    text,               -- humor, oráculo ou jogo
  ids      integer[],          -- os filmes da franquia
  sort     integer not null,   -- a ordem em tags.ts
  primary key (category, tag_key)
);

create table if not exists public.country_continents (
  code      text primary key,
  continent text not null
);

comment on table public.tag_rules is
  '19/11/2026: cópia das definições de tags de src/lib/tags.ts (PROGRESSION_TAGS, THEME_TAGS + FRANCHISE_MOVIES, COMMUNITY_TAGS, ORACLE_TAGS, a ordem de GAME_TAGS). Mudou tags.ts? Atualize aqui por migração.';
comment on table public.country_continents is
  '19/11/2026: cópia de CONTINENT_BY_COUNTRY (src/lib/continents.ts).';

alter table public.tag_rules enable row level security;
alter table public.country_continents enable row level security;
revoke all on public.tag_rules from anon, authenticated;
revoke all on public.country_continents from anon, authenticated;

insert into public.tag_rules (category, tag_key, name, emoji, kind, goal, param, ids, sort)
select r ->> 0, r ->> 1, r ->> 2,
       (select string_agg(chr(('x' || lpad(h.cp, 8, '0'))::bit(32)::int), '' order by h.ord)
          from regexp_split_to_table(r ->> 3, '-') with ordinality h(cp, ord)),
       r ->> 4, (r ->> 5)::integer, r ->> 6,
       case when jsonb_typeof(r -> 7) = 'array' then array(select (jsonb_array_elements_text(r -> 7))::integer) end,
       (r ->> 8)::integer
  from jsonb_array_elements($json$[
["basic","Balcony Regular",null,"1f3ac","rated",1,null,null,0],
["basic","Seat Warmer",null,"1fa91","rated",20,null,null,1],
["basic","Popcorn Pro",null,"1f37f","rated",50,null,null,2],
["basic","Reel Addict",null,"1f39e-fe0f","rated",100,null,null,3],
["basic","Cine Elite",null,"1f3c6","rated",200,null,null,4],
["basic","Projectionist Supreme",null,"1f4fd-fe0f","rated",500,null,null,5],
["basic","Cinematic Guru",null,"1f9d9","rated",1000,null,null,6],
["basic","CineHater",null,"1f44e","rating",20,null,null,7],
["basic","Golden Reel",null,"1f31f","rating",20,null,null,8],
["basic","Enigmatic",null,"1f9e9","mood",50,"mind-blowing",null,9],
["basic","Bloody Mary",null,"1fa78","mood",50,"dark-and-scary",null,10],
["basic","Dreamwalker",null,"1f36d","mood",50,"drug-trip",null,11],
["basic","Trailblazer",null,"1f93f","mood",50,"adventures",null,12],
["basic","Soul Collector",null,"262f-fe0f","mood",50,"catharsis",null,13],
["basic","Daredevil",null,"1f9e8","mood",50,"adrenaline",null,14],
["basic","Cine Cupid",null,"1f495","mood",50,"romantic",null,15],
["basic","Peter Pan",null,"1f9da-200d-2642-fe0f","mood",50,"family-time",null,16],
["basic","Punchliner",null,"1f602","mood",50,"laugh-out-loud",null,17],
["basic","Director's Cut",null,"1f3a5","director",10,null,null,18],
["basic","Nowhere",null,"1f4cd","countries",30,null,null,19],
["basic","World Tour",null,"1f30e","continents",5,null,null,20],
["basic","Scribbler",null,"270f-fe0f","review_count",1,null,null,21],
["basic","Screenwriter",null,"1f58b-fe0f","review_count",10,null,null,22],
["basic","Memoirist",null,"1f4d3","review_count",30,null,null,23],
["basic","Sofa Sleeper",null,"1f6cb-fe0f","completed_series",1,null,null,24],
["theme","mockingjay-victor","Mockingjay Victor","1f3f9","franchise",5,"Hunger Games",[70160,101299,131631,131634,695721],0],
["theme","lucky-player","Lucky Player","1f3b2","franchise",2,"Jumanji-Zathura",[8844,6795],1],
["theme","death-dodger","Death Dodger","1f480","franchise",5,"Final Destination",[9532,9358,9286,19912,55779],2],
["theme","hogwarts-graduate","Hogwarts Graduate","1f9d9-200d-2642-fe0f","franchise",8,"Harry Potter",[671,672,673,674,675,767,12444,12445],3],
["theme","force-founder","Force Founder","2694-fe0f","franchise",3,"Star Wars Original",[11,1891,1892],4],
["theme","don-of-cinema","Don of Cinema","1f3a9","franchise",3,"The Godfather",[238,240,242],5],
["theme","trap-builder","Trap Builder","1f3e0","franchise",2,"Home Alone",[771,772],6],
["theme","red-pill-adept","Red-Pill Adept","1f48a","franchise",3,"The Matrix",[603,604,605],7],
["theme","flux-capacitor-fan","Flux-Capacitor Fan","26a1","franchise",3,"Back to the Future",[105,165,196],8],
["theme","ring-expert","Ring Expert","1f48d","franchise",3,"The Lord of the Rings",[120,121,122],9],
["theme","toy-collector","Toy Collector","1f9f8","franchise",4,"Toy Story",[862,863,10193,301528],10],
["theme","whip-crack-scholar","Whip-Crack Scholar","1f920","franchise",4,"Indiana Jones",[85,89,90,91],11],
["theme","sailor","Sailor","1f3f4-200d-2620-fe0f","franchise",5,"Pirates",[22,58,285,1865,166426],12],
["theme","senior-mechanic","Senior Mechanic","1f3ce-fe0f","franchise",10,"Fast Saga",[9799,584,9615,13804,51497,82992,168259,337339,385128,385687],13],
["theme","cybertron-sentinel","Cybertron Sentinel","1f916","franchise",7,"Transformers",[424783,1858,91314,667538,335988,8373,38356],14],
["theme","swamp-royalty","Swamp Royalty","1f479","franchise",4,"Shrek",[808,809,810,10192],15],
["theme","dino-tamer","Dino Tamer","1f996","franchise",6,"Jurassic",[329,330,331,135397,351286,507086],16],
["theme","banana-boss","Banana Boss","1f34c","franchise",5,"Minions",[39538,93456,324852,211672,438148],17],
["theme","baba-yaga","Baba Yaga","1f52b","franchise",4,"John Wick",[245891,324552,458156,603692],18],
["theme","casual-drinker","Casual Drinker","1f37a","franchise",3,"Hangover",[18785,45243,109439],19],
["theme","sweetie-pie","Sweetie Pie","1f967","franchise",4,"American Pie",[2105,2770,8273,71552],20],
["theme","visceral-gamer","Visceral Gamer","1f3ae","franchise",10,"Saw",[176,215,214,663,11917,22804,41439,298250,602734,951491],21],
["theme","nuts","Nuts","1f43f-fe0f","franchise",6,"Ice Age",[425,950,8355,57800,278154,774825],22],
["theme","dark-spirit","Dark Spirit","1f987","franchise",3,"Dark Knight",[272,155,49026],23],
["theme","infinity-gauntlet","Infinity Gauntlet","1f9e4","franchise",4,null,[24428,299536,99861,299534],24],
["theme","sharp-canine","Sharp Canine","1f9db","franchise",5,"Twilight",[122,121,240,50619,50620],25],
["theme","primal-essence","Primal Essence","1f98d","franchise",4,"Apes Reboot",[61791,119450,281338,653346],26],
["community","Spotlight Spark",null,"2728","friends",1,null,null,0],
["community","Rising Star",null,"2b50","friends",10,null,null,1],
["community","Red-Carpet Regular",null,"1f3ad","friends",25,null,null,2],
["community","Festival Favorite",null,"1f3aa","friends",50,null,null,3],
["community","Blockbuster",null,"1f4a5","friends",100,null,null,4],
["community","Cult Legend",null,"1f451","friends",200,null,null,5],
["oracle","lagooner","Lagooner","1f6a4","curated_pool",50,"bogart",null,0],
["oracle","fly-eater","Bug-eater","1f99f","curated_pool",100,"bogart",null,1],
["oracle","quick-tongue","Quick Tongue","1f438","curated_pool",200,"bogart",null,2],
["oracle","tape-colector","Tape Colector","1f4fc","curated_pool",50,"fincher",null,3],
["oracle","cine-smoker","Cine Smoker","1f6ac","curated_pool",100,"fincher",null,4],
["oracle","keen-sense","Keen Sense","1f98a","curated_pool",200,"fincher",null,5],
["oracle","crawler","Crawler","1f687","curated_pool",50,"cypher",null,6],
["oracle","poison-taster","Poison Taster","1f9ea","curated_pool",100,"cypher",null,7],
["oracle","underworld-king","Underworld King","1f40d","curated_pool",200,"cypher",null,8],
["oracle","from-beyond","From Beyond","2709-fe0f","ai_review_count",1,null,null,9],
["oracle","non-reflective","Ghost Writer","1f47b","ai_review_count",10,null,null,10],
["oracle","third-eye-open","Third Eye Open","1f441-fe0f","ai_review_count",50,null,null,11],
["games","jackpot-gambler",null,null,"game",null,"jackpot",null,0],
["games","jackpot-high-roller",null,null,"game",null,"jackpot",null,1],
["games","jackpot-lucky-charm",null,null,"game",null,"jackpot",null,2],
["games","jackpot-jackpot",null,null,"game",null,"jackpot",null,3],
["games","jackpot-shiny-hunter",null,null,"game",null,"jackpot",null,4],
["games","jackpot-croupier",null,null,"game",null,"jackpot",null,5],
["games","jackpot-curator",null,null,"game",null,"jackpot",null,6],
["games","jackpot-black-market",null,null,"game",null,"jackpot",null,7],
["games","jackpot-alchemist",null,null,"game",null,"jackpot",null,8],
["games","poker-first-win",null,null,"game",null,"poker",null,9],
["games","poker-fox-hunter",null,null,"game",null,"poker",null,10],
["games","poker-clean-sweep",null,null,"game",null,"poker",null,11],
["games","poker-oscar-bluff",null,null,"game",null,"poker",null,12],
["games","poker-seven-nights",null,null,"game",null,"poker",null,13],
["games","poker-high-stakes",null,null,"game",null,"poker",null,14],
["games","poker-royal-flush",null,null,"game",null,"poker",null,15],
["games","poker-full-house",null,null,"game",null,"poker",null,16],
["games","poker-card-shark",null,null,"game",null,"poker",null,17]
]$json$::jsonb) r
on conflict (category, tag_key) do update
   set name = excluded.name, emoji = excluded.emoji, kind = excluded.kind, goal = excluded.goal,
       param = excluded.param, ids = excluded.ids, sort = excluded.sort;

insert into public.country_continents (code, continent)
select c.code, e.key
  from jsonb_each_text($json${"América":"AR BB BM BO BR BS BZ CA CL CO CR CU DM DO EC GD GT GY HN JM KN LC MX NI PA PE PR PY SR SV TT US UY VC VE","Europa":"AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM SU UA VA","África":"AO BF BI BJ BW CD CG CI CM CV DJ DZ EG ER ET GA GH GM GN GW KE LR LS LY MA MG ML MR MU MW MZ NA NE NG RW SD SL SN SO SS SZ TD TG TN TZ UG ZA ZM ZW","Ásia":"AE AF AM AZ BD BH BN BT CN GE HK ID IL IN IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE","Oceania":"AU FJ FM GU KI MH NC NR NZ PF PG PW SB TO TV VU WS"}$json$::jsonb) e
  cross join lateral regexp_split_to_table(e.value, ' ') c(code)
on conflict (code) do update set continent = excluded.continent;

create or replace function public.get_tag_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_rated integer; v_hater integer; v_golden integer; v_tv integer[];
  v_followers integer; v_real integer; v_ai integer;
  v_director integer; v_countries integer; v_continents integer;
  v_sofa integer := 0;
  v_basic jsonb; v_theme jsonb; v_oracle jsonb;
  v_special jsonb; v_games jsonb; v_upcoming jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select count(*), count(*) filter (where um.rating <= 3), count(*) filter (where um.rating = 10),
         array_agg(um.movie_id) filter (where um.media_type = 'tv')
    into v_rated, v_hater, v_golden, v_tv
    from user_movies um
   where um.user_id = v_uid and um.rating is not null;

  select count(*) into v_followers
    from friendships f
   where f.status = 'accepted' and (f.requester_id = v_uid or f.addressee_id = v_uid);

  select count(*) filter (where rv.is_ai_generated = false), count(*) filter (where rv.is_ai_generated = true)
    into v_real, v_ai
    from reviews rv
   where rv.user_id = v_uid;

  -- diretor, países e continentes: só títulos com linha no movie_cache
  with cached as (
    select nullif(mc.director, '') as director, nullif(mc.origin_country[1], '') as country
      from user_movies um
      join movie_cache mc on mc.tmdb_id = um.movie_id and mc.media_type = um.media_type
     where um.user_id = v_uid and um.rating is not null
  )
  select coalesce((select max(d.n) from (select count(*) as n from cached c where c.director is not null group by c.director) d), 0),
         (select count(distinct c.country) from cached c),
         (select count(distinct cc.continent) from cached c join country_continents cc on cc.code = upper(c.country))
    into v_director, v_countries, v_continents;

  -- série completa: encerrada, com episódios lançados, todos vistos
  if v_tv is not null then
    select case when exists (
             select 1
               from get_tv_progress_batch__impl(v_uid, v_tv) p
               join movie_cache mc on mc.media_type = 'tv' and mc.tmdb_id = p.tmdb_id
              where mc.status in ('Ended', 'Canceled') and p.aired_count > 0 and p.watched_count >= p.aired_count)
           then 1 else 0 end
      into v_sofa;
  end if;

  select jsonb_object_agg(r.tag_key,
           case r.kind
             when 'rating' then case r.tag_key when 'CineHater' then v_hater when 'Golden Reel' then v_golden else 0 end
             when 'mood' then (select count(*) from user_movies um
                                where um.user_id = v_uid and um.rating is not null
                                  and exists (select 1 from pool_titles pt
                                               where pt.mood_key = r.param and pt.media_type = um.media_type and pt.tmdb_id = um.movie_id))
             when 'director' then v_director
             when 'countries' then v_countries
             when 'continents' then v_continents
             when 'review_count' then v_real
             when 'completed_series' then v_sofa
             else 0
           end)
    into v_basic
    from tag_rules r
   where r.category = 'basic' and r.kind <> 'rated';

  select jsonb_object_agg(r.tag_key,
           (select count(*) from unnest(r.ids) i
             where exists (select 1 from user_movies um
                            where um.user_id = v_uid and um.rating is not null and um.media_type = 'movie' and um.movie_id = i)))
    into v_theme
    from tag_rules r
   where r.category = 'theme' and r.kind = 'franchise' and r.ids is not null;

  select jsonb_object_agg(r.tag_key,
           case r.kind
             when 'curated_pool' then (select count(*) from user_movies um
                                        where um.user_id = v_uid and um.rating is not null
                                          and exists (select 1 from pool_titles pt
                                                       where pt.card_type = r.param and pt.media_type = um.media_type and pt.tmdb_id = um.movie_id))
             else v_ai
           end)
    into v_oracle
    from tag_rules r
   where r.category = 'oracle' and ((r.kind = 'curated_pool' and r.param is not null) or r.kind = 'ai_review_count');

  -- especiais e de Jogos: o que a pessoa tem + o que está no ar
  with tags as (
    select st.ctid as pos,
           jsonb_build_object(
             'id', st.id, 'name', st.name, 'emoji', st.emoji, 'description', st.description,
             'requirement_description', st.requirement_description, 'description_pt', st.description_pt,
             'requirement_description_pt', st.requirement_description_pt, 'starts_at', st.starts_at, 'ends_at', st.ends_at,
             'category', case when st.category = 'games' then 'games' else 'special' end,
             'requirement_data', st.requirement_data,
             'is_unlocked', (ut.tag_id is not null),
             'is_currently_active', ((st.starts_at is null or st.starts_at <= now()) and (st.ends_at is null or st.ends_at > now())))
           || case when ut.tag_id is not null then jsonb_build_object('unlocked_at', ut.unlocked_at) else '{}'::jsonb end as obj,
           coalesce(st.category = 'games', false) as is_game,
           (ut.tag_id is not null) as mine,
           ((st.starts_at is null or st.starts_at <= now()) and (st.ends_at is null or st.ends_at > now())) as active,
           coalesce(g.sort, (select count(*) from tag_rules x where x.category = 'games')) as game_sort,
           case when st.requirement_data ->> 'source' in ('jackpot', 'poker') then st.requirement_data ->> 'source' else g.param end as game
      from special_tags st
      left join user_special_tags ut on ut.user_id = v_uid and ut.tag_id = st.id
      left join tag_rules g on g.category = 'games' and g.tag_key = st.id
  )
  select coalesce(jsonb_agg(t.obj order by t.pos) filter (where not t.is_game and (t.mine or t.active)), '[]'::jsonb),
         coalesce(jsonb_agg(t.obj order by t.game_sort, t.pos) filter (where t.is_game and (t.mine or t.active)), '[]'::jsonb),
         coalesce(jsonb_agg(t.obj order by t.game_sort, t.pos) filter (where t.is_game and not t.mine and not t.active and t.game = 'poker'), '[]'::jsonb)
    into v_special, v_games, v_upcoming
    from tags t;

  return jsonb_build_object(
    'ratedCount', v_rated, 'followers', v_followers,
    'basic', coalesce(v_basic, '{}'::jsonb), 'theme', coalesce(v_theme, '{}'::jsonb), 'oracle', coalesce(v_oracle, '{}'::jsonb),
    'specialTags', v_special, 'gameTags', v_games, 'pokerUpcomingTags', v_upcoming);
end;
$function$;

revoke all on function public.get_tag_progress() from public, anon;
grant execute on function public.get_tag_progress() to authenticated, service_role;

comment on function public.get_tag_progress() is
  '19/11/2026 (Reborn): o progresso de todas as tags de quem está logado, no formato TagProgress de src/lib/tagProgress.ts (uma ida no lugar de 11). SECURITY DEFINER com auth.uid() fixo; definições em tag_rules.';
