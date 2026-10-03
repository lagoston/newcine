-- Eventos sazonais, segunda rodada (03/10/2026).
--
-- 1. Três listas de 20 filmes por evento, alternando a cada ano:
--    a edição 2026 usa a 1ª, 2027 a 2ª, 2028 a 3ª, 2029 volta à 1ª…
--    (seasonal_events.movie_lists + first_edition; seasonal_event_list()).
-- 2. Missões do Natal, em sequência:
--    🎁 Secret Friend: sussurrar 1 filme da lista para um amigo;
--    🎄 Spark of Grace: avaliar 1 filme da lista;
--    🎅 Ho Ho Ho: escrever uma resenha de um filme da lista que você avaliou.
-- 3. Quem já viu quase a lista toda antes do evento ganha missões de
--    presente: 18 filmes da lista avaliados antes → a 1ª missão está feita;
--    19 → as duas primeiras; 20 → as três. (Em geral: o que passar de
--    tamanho da lista − número de missões.) Vale para o Halloween e o Natal.
-- 4. Só a PRIMEIRA nota de um filme conta como "avaliou no evento" (mudar a
--    nota de um filme visto antes não conta mais) — quem já tinha visto é
--    compensado pela regra do item 3.
-- 5. Resenhas (tabela reviews) entram como ação "review".

-- ---------------------------------------------------------------------------
-- 1. Listas por edição
-- ---------------------------------------------------------------------------

alter table public.seasonal_events add column if not exists movie_lists jsonb not null default '[]'::jsonb;
alter table public.seasonal_events add column if not exists first_edition int not null default 2026;

-- Halloween
--   2026 (no ar): a seleção atual.
--   2027: Halloween (2018), O Iluminado, A Noiva Cadáver, Arraste-me Para o
--         Inferno, Os Caça-Fantasmas, Aterrorizante (o palhaço), Deixa Ela
--         Entrar (o caixão), Gasparzinho, Invocação do Mal, A Hora do
--         Pesadelo, O Lamento, ParaNorman, Um Lobisomem Americano em Londres,
--         Dia dos Mortos, Todo Mundo Quase Morto, Entrevista com o Vampiro,
--         Os Inocentes, A Casa do Terror, Poltergeist, Ju-on.
--   2028: Psicose, A Noite dos Mortos-Vivos, Hotel Transilvânia, Bom Menino,
--         Os Garotos Perdidos, A Freira, O Mal que Nos Habita, Festa no Céu,
--         Cemitério Maldito, Fome Animal, Abigail, E.T., Cronos, Zumbilândia,
--         O Jovem Frankenstein, A Bolha Assassina, Annabelle, O Corvo,
--         A Ponta de um Crime, Onibaba.
update public.seasonal_events
set movie_lists = jsonb_build_array(
      movie_ids,
      '[424139, 694, 3933, 16871, 620, 420634, 13310, 8839, 138843, 377, 293670, 77174, 814, 8408, 747, 628, 16372, 517116, 609, 11838]'::jsonb,
      '[539, 10331, 76492, 1422096, 1547, 439079, 744857, 228326, 8913, 763, 1111873, 601, 11655, 19908, 3034, 9599, 250546, 9495, 9270, 3763]'::jsonb),
    first_edition = 2026
where id = 'halloween';

-- Natal
--   2026: a seleção atual.
--   2027: Os Fantasmas Contra-Atacam, Meu Papai é Noel, Papai Noel às
--         Avessas, Os Fantasmas de Scrooge, Milagre na Rua 34, O Amor Não
--         Tira Férias, Na Mira do Chefe, Uma Noite Mágica, Trocando as
--         Bolas, Carol, Máquina Mortífera, Perigo Próximo, Um Toque de
--         Felicidade, Adoráveis Mulheres (2019), Enquanto Você Dormia,
--         Frozen, A Mais Louca Sexta-Feira em Apuros, De Olhos Bem Fechados,
--         Beijos e Tiros, A Proposta.
--   2028: Escrito nas Estrelas, O Natal Maluco de Harold e Kumar, Sexo,
--         Drogas e Jingle Bells, Sintonia de Amor, Mens@gem para Você,
--         Adoráveis Mulheres (1994), Feriados em Família, Babe, Uma Babá
--         Milagrosa, Prenda-Me se For Capaz, A Caça, Despertar de um
--         Pesadelo, Harry & Sally, A Lenda do Cavaleiro Verde, Brazil, Vamos
--         Nessa, A Condenação, Elle, A Fantástica Fábrica de Chocolate,
--         Jack Frost (1997).
update public.seasonal_events
set movie_lists = jsonb_build_array(
      movie_ids,
      '[9647, 11395, 10147, 17979, 10510, 1581, 8321, 9745, 1621, 258480, 941, 406994, 81182, 331482, 2064, 109445, 10426, 345, 5236, 16608]'::jsonb,
      '[9778, 55465, 296100, 858, 9489, 9587, 9089, 9598, 50506, 640, 103663, 11412, 639, 559907, 68, 9430, 45094, 337674, 252, 27318]'::jsonb),
    first_edition = 2026
where id = 'christmas';

-- Lista de uma edição (sem listas cadastradas, vale movie_ids).
create or replace function public.seasonal_event_list(p_event_id text, p_edition int)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when jsonb_array_length(se.movie_lists) > 0 then
      se.movie_lists -> ((((p_edition - se.first_edition) % jsonb_array_length(se.movie_lists)) + jsonb_array_length(se.movie_lists)) % jsonb_array_length(se.movie_lists))
    else se.movie_ids
  end
  from public.seasonal_events se
  where se.id = p_event_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. Resenha como ação; missões novas do Natal
-- ---------------------------------------------------------------------------

alter table public.seasonal_event_actions drop constraint if exists seasonal_event_actions_kind_check;
alter table public.seasonal_event_actions
  add constraint seasonal_event_actions_kind_check check (kind in ('rate', 'watchlist', 'whisper', 'review'));

update public.seasonal_events
set steps = '[{"tag": "secret-friend", "kind": "whisper", "count": 1},
              {"tag": "spark-of-grace", "kind": "rate", "count": 1},
              {"tag": "ho-ho-ho", "kind": "review", "count": 1}]'::jsonb
where id = 'christmas';

update public.special_tags set
  description = 'Gave a Christmas film to a friend',
  description_pt = 'Presenteou um amigo com um filme de Natal',
  requirement_description = 'Whisper a film from the Christmas list to a friend in December',
  requirement_description_pt = 'Sussurre um filme da lista de Natal para um amigo em dezembro',
  requirement_data = '{"event": "christmas", "step": 1}'
where id = 'secret-friend';

update public.special_tags set
  description = 'Lit up the Christmas tree with a film from the list',
  description_pt = 'Acendeu a árvore de Natal com um filme da lista',
  requirement_description = 'Rate a film from the Christmas list in December',
  requirement_description_pt = 'Avalie um filme da lista de Natal em dezembro',
  requirement_data = '{"event": "christmas", "step": 2}'
where id = 'spark-of-grace';

update public.special_tags set
  description = 'Completed Christmas night — worn on the profile, it dresses the profile for Christmas',
  description_pt = 'Completou a noite de Natal — em uso no perfil, veste o perfil para o Natal',
  requirement_description = 'Write a review of a film from the Christmas list that you rated, in December',
  requirement_description_pt = 'Escreva uma resenha de um filme da lista de Natal que você avaliou, em dezembro',
  requirement_data = '{"event": "christmas", "step": 3}'
where id = 'ho-ho-ho';

update public.special_tags set
  description = 'Completed the Halloween ritual — worn on the profile, it dresses the profile for Halloween',
  description_pt = 'Completou o ritual de Halloween — em uso no perfil, veste o perfil para o Halloween'
where id = 'pumpkin-head';

-- ---------------------------------------------------------------------------
-- 3. Progresso, missões de presente e concessão
-- ---------------------------------------------------------------------------

-- Quanto da etapa a pessoa fez nesta edição (sem as missões de presente).
--   rate / whisper: filmes da lista avaliados pela 1ª vez / sussurrados;
--   review: resenhas de filmes da lista que a pessoa avaliou;
--   watchlist: filmes da lista guardados na edição ou que já estão na Watchlist.
create or replace function public.seasonal_step_progress(p_user_id uuid, p_event_id text, p_edition int, p_kind text)
returns int
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p_kind = 'watchlist' then (
      select count(*)::int from (
        select a.movie_id
        from public.seasonal_event_actions a
        where a.user_id = p_user_id and a.event_id = p_event_id and a.edition = p_edition and a.kind = 'watchlist'
        union
        select um.movie_id
        from public.user_movies um
        where um.user_id = p_user_id
          and coalesce(um.media_type, 'movie') = 'movie'
          and um.rating is null
          and public.seasonal_event_list(p_event_id, p_edition) @> to_jsonb(um.movie_id)
      ) z)
    when p_kind = 'review' then (
      select count(*)::int
      from public.seasonal_event_actions a
      where a.user_id = p_user_id and a.event_id = p_event_id and a.edition = p_edition and a.kind = 'review'
        and exists (
          select 1 from public.user_movies um
          where um.user_id = p_user_id and um.movie_id = a.movie_id
            and coalesce(um.media_type, 'movie') = 'movie' and um.rating is not null))
    else (
      select count(*)::int
      from public.seasonal_event_actions a
      where a.user_id = p_user_id and a.event_id = p_event_id and a.edition = p_edition and a.kind = p_kind)
  end;
$$;

-- Filmes da lista que a pessoa já tinha avaliado antes do evento (avaliados
-- e sem a "1ª nota" registrada nesta edição).
create or replace function public.seasonal_pre_rated(p_user_id uuid, p_event_id text, p_edition int)
returns int
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(distinct um.movie_id)::int
  from jsonb_array_elements(public.seasonal_event_list(p_event_id, p_edition)) v
  join public.user_movies um
    on um.user_id = p_user_id
   and um.movie_id = (v #>> '{}')::int
   and coalesce(um.media_type, 'movie') = 'movie'
   and um.rating is not null
  where not exists (
    select 1 from public.seasonal_event_actions a
    where a.user_id = p_user_id and a.event_id = p_event_id and a.edition = p_edition
      and a.kind = 'rate' and a.movie_id = um.movie_id);
$$;

-- Situação de cada etapa para uma pessoa (p_user_id null = visitante).
--   credited: missão de presente (quem já tinha visto quase a lista toda);
--   progress: o que fez + o que veio de presente em etapas do mesmo tipo
--             (no Halloween, com 18 vistos, a 2ª etapa pede só 1 filme novo);
--   done: missão cumprida (de presente ou pelo progresso).
create or replace function public.seasonal_step_states(p_user_id uuid, p_event_id text, p_edition int)
returns table(idx int, tag text, kind text, cnt int, progress int, credited boolean, owned_at timestamptz, done boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  e public.seasonal_events%rowtype;
  list_size int;
  n int;
  pre int := 0;
  credit int;
  st jsonb;
  i int := 0;
  offsets jsonb := '{}'::jsonb;
  k text;
  c int;
  raw int;
begin
  select * into e from public.seasonal_events se where se.id = p_event_id;
  if not found then
    return;
  end if;
  list_size := jsonb_array_length(public.seasonal_event_list(p_event_id, p_edition));
  n := jsonb_array_length(e.steps);
  if p_user_id is not null then
    pre := public.seasonal_pre_rated(p_user_id, p_event_id, p_edition);
  end if;
  credit := greatest(0, least(n, pre - (list_size - n)));

  for st in select value from jsonb_array_elements(e.steps) loop
    i := i + 1;
    k := st->>'kind';
    c := (st->>'count')::int;
    idx := i;
    tag := st->>'tag';
    kind := k;
    cnt := c;
    credited := i <= credit;
    if credited then
      offsets := offsets || jsonb_build_object(k, greatest(coalesce((offsets->>k)::int, 0), c));
    end if;
    raw := case when p_user_id is null then 0 else public.seasonal_step_progress(p_user_id, p_event_id, p_edition, k) end;
    progress := least(c, raw + coalesce((offsets->>k)::int, 0));
    owned_at := null;
    if p_user_id is not null then
      select ust.unlocked_at into owned_at
      from public.user_special_tags ust
      where ust.user_id = p_user_id and ust.tag_id = st->>'tag';
    end if;
    done := credited or progress >= c;
    return next;
  end loop;
end;
$$;

-- Concede as tags cumpridas, em ordem (para na primeira que falta).
create or replace function public.grant_seasonal_tags(p_user_id uuid, p_event_id text, p_edition int)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  if p_user_id is null then
    return;
  end if;
  for r in select * from public.seasonal_step_states(p_user_id, p_event_id, p_edition) s order by s.idx loop
    if r.owned_at is not null then
      continue;
    end if;
    if not r.done then
      exit;
    end if;
    insert into public.user_special_tags (user_id, tag_id, unlocked_at, is_permanent)
    values (p_user_id, r.tag, now(), true)
    on conflict (user_id, tag_id) do nothing;
  end loop;
end;
$$;

-- Registra a ação num filme da lista da edição no ar e concede o que couber.
create or replace function public.record_seasonal_action(p_user_id uuid, p_kind text, p_movie_id int)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ev record;
  w record;
begin
  for ev in select se.id from public.seasonal_events se where se.enabled loop
    select * into w from public.seasonal_event_window(ev.id);
    if w.is_active and public.seasonal_event_list(ev.id, w.edition) @> to_jsonb(p_movie_id) then
      insert into public.seasonal_event_actions (user_id, event_id, edition, kind, movie_id)
      values (p_user_id, ev.id, w.edition, p_kind, p_movie_id)
      on conflict do nothing;
      perform public.grant_seasonal_tags(p_user_id, ev.id, w.edition);
    end if;
  end loop;
end;
$$;

-- Nota: só a primeira (filme sem nota → com nota). Entrada nova sem nota = Watchlist.
create or replace function public.trigger_seasonal_event_on_movie()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(new.media_type, 'movie') <> 'movie' then
    return null;
  end if;
  begin
    if new.rating is not null and (tg_op = 'INSERT' or old.rating is null) then
      perform public.record_seasonal_action(new.user_id, 'rate', new.movie_id);
    elsif new.rating is null and tg_op = 'INSERT' then
      perform public.record_seasonal_action(new.user_id, 'watchlist', new.movie_id);
    end if;
  exception when others then
    raise warning 'seasonal event (user_movies): %', sqlerrm;
  end;
  return null;
end;
$$;

-- Resenha nova de um filme.
create or replace function public.trigger_seasonal_event_on_review()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(new.media_type, 'movie') <> 'movie' or new.user_id is null or new.movie_id is null then
    return null;
  end if;
  begin
    perform public.record_seasonal_action(new.user_id, 'review', new.movie_id);
  exception when others then
    raise warning 'seasonal event (reviews): %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger seasonal_event_on_review
  after insert on public.reviews
  for each row execute function public.trigger_seasonal_event_on_review();

-- Estado do evento para o site (agora com a lista da edição, as missões de
-- presente e quantos filmes da lista a pessoa já tinha visto).
create or replace function public.get_seasonal_event_state(p_preview text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  e public.seasonal_events%rowtype;
  w record;
  chosen boolean := false;
  lst jsonb;
  steps_out jsonb;
  items jsonb;
  actions jsonb;
  pre int := 0;
begin
  if p_preview is not null then
    select * into e from public.seasonal_events se where se.id = p_preview and se.enabled;
    if found then
      chosen := true;
      select * into w from public.seasonal_event_window(e.id);
    end if;
  end if;

  if not chosen then
    for e in select * from public.seasonal_events se where se.enabled order by se.created_at, se.id loop
      select * into w from public.seasonal_event_window(e.id);
      if w.is_active then
        chosen := true;
        exit;
      end if;
    end loop;
  end if;

  if not chosen then
    return null;
  end if;

  if w.is_active then
    if uid is not null then
      perform public.grant_seasonal_tags(uid, e.id, w.edition);
    end if;
    update public.special_tags t
    set starts_at = w.starts_at, ends_at = w.ends_at
    where t.id in (select s.value->>'tag' from jsonb_array_elements(e.steps) s)
      and (t.starts_at is distinct from w.starts_at or t.ends_at is distinct from w.ends_at);
  end if;

  lst := public.seasonal_event_list(e.id, w.edition);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.mid,
           'oracle', (select rp.card_type from public.recommendation_pools rp
                      where rp.mood_key <> 'random-surprise' and rp.movie_ids @> to_jsonb(x.mid)
                      order by rp.card_type limit 1)
         ) order by x.ord), '[]'::jsonb)
  into items
  from (
    select (v #>> '{}')::int mid, ord
    from jsonb_array_elements(lst) with ordinality as t(v, ord)
  ) x;

  select coalesce(jsonb_object_agg(k.kind, k.ids), '{}'::jsonb)
  into actions
  from (
    select a.kind, jsonb_agg(a.movie_id order by a.created_at) ids
    from public.seasonal_event_actions a
    where uid is not null and a.user_id = uid and a.event_id = e.id and a.edition = w.edition
    group by a.kind
  ) k;

  if uid is not null then
    pre := public.seasonal_pre_rated(uid, e.id, w.edition);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'index', z.idx,
           'tag', z.tag,
           'name', z.tag_name,
           'emoji', z.tag_emoji,
           'kind', z.kind,
           'count', z.cnt,
           'progress', z.progress,
           'credited', z.credited,
           'unlocked', z.owned_at is not null,
           'unlocked_at', z.owned_at,
           -- liberada: todas as anteriores já conquistadas
           'available', coalesce(z.prev_owned, true)
         ) order by z.idx), '[]'::jsonb)
  into steps_out
  from (
    select s.*, t.name tag_name, t.emoji tag_emoji,
           bool_and(s.owned_at is not null) over (order by s.idx rows between unbounded preceding and 1 preceding) prev_owned
    from public.seasonal_step_states(uid, e.id, w.edition) s
    left join public.special_tags t on t.id = s.tag
  ) z;

  return jsonb_build_object(
    'id', e.id,
    'edition', w.edition,
    'starts_at', w.starts_at,
    'ends_at', w.ends_at,
    'is_active', w.is_active,
    'is_preview', not w.is_active,
    'now', now(),
    'items', items,
    'actions', actions,
    'steps', steps_out,
    'pre_rated', pre,
    'list_size', jsonb_array_length(lst),
    'decoration_tag', e.decoration_tag,
    'decoration_unlocked', uid is not null and exists (
      select 1 from public.user_special_tags ust where ust.user_id = uid and ust.tag_id = e.decoration_tag)
  );
end;
$$;

revoke all on function public.seasonal_event_list(text, int) from public, anon, authenticated;
revoke all on function public.seasonal_step_progress(uuid, text, int, text) from public, anon, authenticated;
revoke all on function public.seasonal_pre_rated(uuid, text, int) from public, anon, authenticated;
revoke all on function public.seasonal_step_states(uuid, text, int) from public, anon, authenticated;
revoke all on function public.grant_seasonal_tags(uuid, text, int) from public, anon, authenticated;
revoke all on function public.record_seasonal_action(uuid, text, int) from public, anon, authenticated;
revoke all on function public.trigger_seasonal_event_on_movie() from public, anon, authenticated;
revoke all on function public.trigger_seasonal_event_on_review() from public, anon, authenticated;
revoke all on function public.get_seasonal_event_state(text) from public;
grant execute on function public.get_seasonal_event_state(text) to anon, authenticated;
