-- Séries nas prateleiras dos oráculos (03/10/2026).
--
-- Por que uma coluna nova: o TMDB numera filmes e séries em listas
-- separadas, então o mesmo número pode ser um filme E uma série (105 é
-- "De Volta para o Futuro" e também "Sex and the City"). movie_ids sempre
-- foi lido como filme por tudo que usa as pools (prateleiras, Duelo,
-- Match, recomendação do dia, tags, persona). Por isso as séries moram
-- numa lista à parte, tv_ids, na MESMA linha (oráculo + humor):
--
--   movie_ids → filmes (como sempre)
--   tv_ids    → séries
--
-- Só a Biblioteca dos Oráculos (botão "Incluir séries"), a nota prevista
-- do menu do título e a Watchlist leem tv_ids. Duelo, Match, recomendação
-- do dia, tags e persona continuam só com filmes.
--
-- Pra pôr uma série numa prateleira à mão: acrescente o id do TMDB dela em
-- tv_ids da linha certa, ex.:
--   update recommendation_pools
--      set tv_ids = tv_ids || '[1396]'::jsonb
--    where card_type = 'bogart' and mood_key = 'catharsis';
-- A série precisa estar no movie_cache (media_type = 'tv') pra aparecer —
-- basta alguém abrir a série no site uma vez. Cada série deve ficar em UMA
-- linha só (um oráculo, um humor), como os filmes.

alter table public.recommendation_pools
  add column if not exists tv_ids jsonb not null default '[]'::jsonb;

comment on column public.recommendation_pools.movie_ids is 'IDs do TMDB de FILMES desta prateleira (oráculo + humor).';
comment on column public.recommendation_pools.tv_ids is 'IDs do TMDB de SÉRIES desta prateleira (oráculo + humor). Separado de movie_ids porque filmes e séries têm numerações independentes no TMDB.';

-- Em que prateleira(s) está um título, sabendo se é filme ou série. As
-- antigas get_pools_containing_movie e get_movie_oracle_mood_sources
-- continuam existindo (só filmes) pra versões antigas do app.
create or replace function public.get_pools_containing_title(p_id integer, p_media_type text default 'movie')
returns table(card_type text, mood_key text)
language sql
stable security definer
set search_path to 'public'
as $$
  select rp.card_type, rp.mood_key
  from recommendation_pools rp
  where (case when p_media_type = 'tv' then rp.tv_ids else rp.movie_ids end) @> to_jsonb(p_id);
$$;
grant execute on function public.get_pools_containing_title(integer, text) to anon, authenticated, service_role;

-- Selos de oráculo (e humores) da capa do menu do título.
create or replace function public.get_title_oracle_mood_sources(p_id integer, p_media_type text default 'movie')
returns table(card_type text, mood_key text)
language sql
stable
set search_path to 'public'
as $$
  select distinct card_type, mood_key
  from recommendation_pools
  where (case when p_media_type = 'tv' then tv_ids else movie_ids end) @> to_jsonb(array[p_id]);
$$;
grant execute on function public.get_title_oracle_mood_sources(integer, text) to anon, authenticated, service_role;

-- Ordem dos humores favoritos: só notas de FILMES contam (como na persona).
-- Antes uma série avaliada com o mesmo número de um filme da pool contava
-- como se fosse o filme.
create or replace function public.get_user_favorite_moods_order__impl(p_user_id uuid)
returns table(mood_key text, score numeric)
language sql
stable security definer
set search_path to 'public'
as $$
  with all_moods as (
    select distinct rp.mood_key
    from recommendation_pools rp
    where rp.mood_key != 'random-surprise'
  ),
  user_rated as (
    select movie_id, rating
    from user_movies
    where user_id = p_user_id and rating is not null and media_type = 'movie'
  ),
  -- movie_ids guarda números (jsonb number), não strings.
  pool_matches as (
    select distinct ur.movie_id, ur.rating, rp.mood_key
    from user_rated ur
    join recommendation_pools rp on rp.mood_key != 'random-surprise'
      and rp.movie_ids @> to_jsonb(ur.movie_id)
  )
  select
    am.mood_key,
    coalesce(sum(pm.rating), 0) as score
  from all_moods am
  left join pool_matches pm on pm.mood_key = am.mood_key
  group by am.mood_key
  order by score desc;
$$;

-- As séries que já estavam no banco (03/10/2026), cada uma num oráculo e
-- num humor. Oráculo pela mesma lógica dos filmes, com a régua de votos
-- ajustada pra séries (que recebem bem menos votos no TMDB):
--   Bogart  — estreou de 2000 em diante e tem 300+ votos (populares);
--   Fincher — estreou até 1999 e tem 100+ votos (clássicos);
--   Cypher  — o resto (pouco votadas, qualquer época).
-- Ficaram de fora: menos de 20 votos (John en Shirley, Os Homens São de
-- Marte, Foreign Correspondent, O Crime do Padre Amaro, O Crime Quase
-- Perfeito, Kyuranger, Cachorro Lobo) e os Top Gear de 1978 (programa de
-- revista) e americano (nota 6,1, 55 votos).
with s(tmdb_id, card_type, mood_key) as (values
  -- Bogart
  (1399, 'bogart', 'adventures'),        -- Game of Thrones
  (66732, 'bogart', 'dark-and-scary'),   -- Stranger Things
  (71446, 'bogart', 'adrenaline'),       -- La Casa de Papel
  (1396, 'bogart', 'catharsis'),         -- Breaking Bad
  (1402, 'bogart', 'dark-and-scary'),    -- The Walking Dead
  (63174, 'bogart', 'mind-blowing'),     -- Lucifer
  (76479, 'bogart', 'adrenaline'),       -- The Boys
  (60625, 'bogart', 'drug-trip'),        -- Rick and Morty
  (119051, 'bogart', 'mind-blowing'),    -- Wandinha
  (75006, 'bogart', 'adventures'),       -- The Umbrella Academy
  (18165, 'bogart', 'romantic'),         -- Diários de um Vampiro
  (87108, 'bogart', 'catharsis'),        -- Chernobyl
  (81356, 'bogart', 'laugh-out-loud'),   -- Sex Education
  (44217, 'bogart', 'adventures'),       -- Vikings
  (70523, 'bogart', 'mind-blowing'),     -- Dark
  (1429, 'bogart', 'adrenaline'),        -- Attack on Titan
  (100088, 'bogart', 'adventures'),      -- The Last of Us
  (94997, 'bogart', 'adventures'),       -- A Casa do Dragão
  (60059, 'bogart', 'catharsis'),        -- Better Call Saul
  (19885, 'bogart', 'mind-blowing'),     -- Sherlock
  (1412, 'bogart', 'adrenaline'),        -- Arqueiro
  (63247, 'bogart', 'mind-blowing'),     -- Westworld
  (2288, 'bogart', 'mind-blowing'),      -- Prison Break
  (1413, 'bogart', 'dark-and-scary'),    -- American Horror Story
  (1100, 'bogart', 'laugh-out-loud'),    -- How I Met Your Mother
  (1405, 'bogart', 'mind-blowing'),      -- Dexter
  (87739, 'bogart', 'catharsis'),        -- O Gambito da Rainha
  (2316, 'bogart', 'laugh-out-loud'),    -- The Office (EUA)
  (4607, 'bogart', 'mind-blowing'),      -- Lost
  (246, 'bogart', 'family-time'),        -- Avatar: A Lenda de Aang
  (70785, 'bogart', 'catharsis'),        -- Anne com um "E"
  (46648, 'bogart', 'mind-blowing'),     -- True Detective
  (124364, 'bogart', 'dark-and-scary'),  -- Origem (FROM)
  (60797, 'bogart', 'adrenaline'),       -- Scorpion
  (48891, 'bogart', 'laugh-out-loud'),   -- Brooklyn Nine-Nine
  (78191, 'bogart', 'mind-blowing'),     -- Você
  (84773, 'bogart', 'adventures'),       -- Os Anéis de Poder
  (60708, 'bogart', 'adrenaline'),       -- Gotham
  (46952, 'bogart', 'mind-blowing'),     -- Lista Negra
  (92749, 'bogart', 'adrenaline'),       -- Cavaleiro da Lua
  (1421, 'bogart', 'laugh-out-loud'),    -- Família Moderna
  (63351, 'bogart', 'catharsis'),        -- Narcos
  (1409, 'bogart', 'catharsis'),         -- Filhos da Anarquia
  (73586, 'bogart', 'adventures'),       -- Yellowstone
  (1425, 'bogart', 'mind-blowing'),      -- House of Cards
  (108978, 'bogart', 'adrenaline'),      -- Reacher
  (61222, 'bogart', 'catharsis'),        -- BoJack Horseman
  (80752, 'bogart', 'adventures'),       -- See
  (125988, 'bogart', 'mind-blowing'),    -- Silo
  (1639, 'bogart', 'adventures'),        -- Heroes
  (97546, 'bogart', 'laugh-out-loud'),   -- Ted Lasso
  (66573, 'bogart', 'laugh-out-loud'),   -- The Good Place
  (60573, 'bogart', 'laugh-out-loud'),   -- Silicon Valley
  (136315, 'bogart', 'catharsis'),       -- O Urso
  (46786, 'bogart', 'dark-and-scary'),   -- Motel Bates
  (93740, 'bogart', 'adventures'),       -- Fundação
  (76331, 'bogart', 'catharsis'),        -- Succession
  (66292, 'bogart', 'mind-blowing'),     -- Big Little Lies
  (4589, 'bogart', 'laugh-out-loud'),    -- Arrested Development
  (67136, 'bogart', 'catharsis'),        -- This Is Us
  (79788, 'bogart', 'mind-blowing'),     -- Watchmen
  (103768, 'bogart', 'adventures'),      -- Sweet Tooth
  (21510, 'bogart', 'mind-blowing'),     -- Crimes do Colarinho Branco
  (2710, 'bogart', 'laugh-out-loud'),    -- It's Always Sunny in Philadelphia
  (54344, 'bogart', 'catharsis'),        -- The Leftovers
  (222766, 'bogart', 'mind-blowing'),    -- O Dia do Chacal
  (100757, 'bogart', 'adventures'),      -- Outer Banks
  (224372, 'bogart', 'adventures'),      -- O Cavaleiro dos Sete Reinos
  (1778, 'bogart', 'family-time'),       -- Zoey 101
  (225171, 'bogart', 'mind-blowing'),    -- Pluribus
  (1600, 'bogart', 'family-time'),       -- Manual de Sobrevivência Escolar do Ned
  (2996, 'bogart', 'laugh-out-loud'),    -- The Office (Reino Unido)
  (2673, 'bogart', 'romantic'),          -- O.C.: Um Estranho no Paraíso
  (236235, 'bogart', 'laugh-out-loud'),  -- Magnatas do Crime
  (45, 'bogart', 'adventures'),          -- Top Gear (2002)
  (65495, 'bogart', 'drug-trip'),        -- Atlanta
  (1422, 'bogart', 'laugh-out-loud'),    -- The Middle
  (196322, 'bogart', 'mind-blowing'),    -- Matéria Escura
  (4605, 'bogart', 'family-time'),       -- Zack & Cody: Gêmeos em Ação
  (146176, 'bogart', 'adrenaline'),      -- Berlim
  (1428, 'bogart', 'mind-blowing'),      -- Os Caçadores de Mitos
  (116799, 'bogart', 'mind-blowing'),    -- O Poder e a Lei
  (668, 'bogart', 'family-time'),        -- X-Men: Evolution
  (278178, 'bogart', 'mind-blowing'),    -- Eu Vou Te Encontrar
  (32910, 'bogart', 'family-time'),      -- Transformers: Prime
  (7869, 'bogart', 'family-time'),       -- Os Pinguins de Madagascar
  (126506, 'bogart', 'drug-trip'),       -- Smiling Friends
  (152483, 'bogart', 'drug-trip'),       -- The Boys Apresenta: Diabólicos
  (247767, 'bogart', 'laugh-out-loud'),  -- O Estúdio
  (241609, 'bogart', 'mind-blowing'),    -- Seus Amigos e Vizinhos
  (58957, 'bogart', 'laugh-out-loud'),   -- Nathan for You
  -- Fincher
  (1668, 'fincher', 'laugh-out-loud'),   -- Friends
  (1398, 'fincher', 'catharsis'),        -- Família Soprano
  (1920, 'fincher', 'drug-trip'),        -- Twin Peaks
  (105, 'fincher', 'romantic'),          -- Sexo e a Cidade
  (4574, 'fincher', 'family-time'),      -- X-Men (1992)
  (9957, 'fincher', 'family-time'),      -- O Máskara: A Série Animada
  (1835, 'fincher', 'family-time'),      -- Kenan e Kel
  (5028, 'fincher', 'dark-and-scary'),   -- A Tempestade do Século
  (13780, 'fincher', 'romantic'),        -- Os Pássaros Feridos
  -- Cypher
  (65493, 'cypher', 'laugh-out-loud'),   -- The Ranch
  (3797, 'cypher', 'mind-blowing'),      -- Life
  (211039, 'cypher', 'catharsis'),       -- Senna
  (221079, 'cypher', 'adrenaline'),      -- A Última Fronteira
  (63510, 'cypher', 'laugh-out-loud'),   -- Attack on Titan: Junior High
  (39361, 'cypher', 'mind-blowing'),     -- Awake
  (240456, 'cypher', 'adventures'),      -- O Conde de Monte Cristo
  (43146, 'cypher', 'adrenaline'),       -- Marvel Anime: X-Men
  (7235, 'cypher', 'mind-blowing'),      -- Testemunha Ocular
  (4745, 'cypher', 'family-time'),       -- De Volta Para O Futuro (animação)
  (157747, 'cypher', 'family-time'),     -- Transformers: A Centelha da Terra
  (231100, 'cypher', 'romantic'),        -- Amor Sem Limites
  (3817, 'cypher', 'family-time'),       -- Em Busca do Vale Encantado (série)
  (286709, 'cypher', 'catharsis'),       -- Os Westies: Donos do Oeste
  (242551, 'cypher', 'romantic')         -- Rüzgarlı Tepe
)
update public.recommendation_pools rp
   set tv_ids = coalesce(
         (select jsonb_agg(s.tmdb_id order by s.tmdb_id) from s where s.card_type = rp.card_type and s.mood_key = rp.mood_key),
         '[]'::jsonb)
 where rp.mood_key <> 'random-surprise';
