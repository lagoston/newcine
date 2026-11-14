-- Persona viva · Fase 1: a base no banco (13/11/2026, noite)
--
-- Pedido do Bruno (13/11, 20h40): repensar "Sua Persona" como algo vivo, "o
-- Tamagotchi dos filmes", em que "cada filme adicionado conte" e a pessoa veja
-- "no que está se metamorfoseando". Plano em claude/persona-viva.md. Decisões
-- dele (13/11, 22h09): a cabine com a mariposa ("adorei a junção") e a regra
-- dos 10 pontos ("Pode").
--
-- O que este arquivo faz (só acrescenta; nada é apagado):
--
--   1. persona_molts — as "mudas": toda vez que o código da Persona muda,
--      fica guardado de qual para qual e em que nota. Até hoje não havia
--      histórico nenhum.
--
--   2. A regra dos 10 pontos (histerese) em refresh_user_persona. Medido nas
--      contas reais: pela regra antiga (as 3 prateleiras com mais pontos, sem
--      margem) só 39% das mudanças de Persona duravam 10 notas e 27% eram vai
--      e volta, porque a diferença entre a 3ª e a 4ª prateleira costuma ser
--      menor que um filme. Agora a prateleira de fora só entra no trio quando
--      abre UMA NOTA 10 INTEIRA (10 pontos) sobre a mais fraca do trio. Antes
--      disso o site mostra o casulo ("está se transformando").
--      • No dia da troca ninguém muda de código: o trio de hoje é o top 3, e
--        o 4º nunca está 10 pontos à frente do 3º.
--      • Quem ainda não tem Persona nasce pelo top 3, como sempre.
--      • persona_scores continua bruto (os 9 humores, do mais forte ao mais
--        fraco). get_user_persona não muda de formato (o APK antigo segue
--        funcionando); mesa_top3 e o catálogo das 84 leem o mesmo código e
--        ganham a mesma firmeza.
--
--   3. persona_replay(uid) — refaz a história de uma conta nota a nota (pelas
--      prateleiras de hoje) e devolve as mudas que a regra nova teria dado.
--      Serve para preencher persona_molts para trás. Se o trio final do
--      replay não é o código vivo da pessoa, entra uma última muda até ele,
--      datada da última vez em que o top 3 virou o código de hoje.
--
--   4. get_persona_world(uid) — tudo o que a cena da cabine precisa, numa
--      chamada: os últimos 30 títulos de prateleira (as asas da mariposa), as
--      notas recentes de cada prateleira (as tampas das latas), os títulos de
--      nota 9 e 10 (os olhos da asa), as notas 10 (os pôsteres da parede), os
--      mais bem avaliados de cada prateleira, os últimos títulos, quantos
--      ficam fora das prateleiras (o Arquivo), as mudas e a Persona
--      (get_user_persona). Respeita a visibilidade do perfil
--      (can_view_user_content).
--
-- Bots: têm Persona como qualquer conta e aparecem como gente comum, então
-- também têm mudas (não é prêmio; é história).

-- ---------------------------------------------------------------------------
-- 1. As mudas
-- ---------------------------------------------------------------------------

create table if not exists public.persona_molts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  molted_at timestamptz not null default now(),
  from_code text,                    -- null = a Persona nasceu
  to_code text not null,
  rating_no integer,                 -- em que nota (contando todas as avaliadas)
  backfilled boolean not null default false   -- true = refeita pelo replay em 13/11/2026
);

create index if not exists persona_molts_user_idx on public.persona_molts (user_id, molted_at, id);

alter table public.persona_molts enable row level security;
revoke all on public.persona_molts from anon, authenticated;

comment on table public.persona_molts is
  'Mudas da Persona: cada troca do código de 3 letras (de, para, quando, em que nota). Escrita por refresh_user_persona; lida por get_persona_world. Sem política: acesso só pelas funções.';

-- ---------------------------------------------------------------------------
-- 2. A regra dos 10 pontos
-- ---------------------------------------------------------------------------

-- Dado o código de hoje e os pontos das 9 prateleiras (persona_scores, já em
-- ordem de força), devolve o código que vale agora.
create or replace function public.persona_with_margin(p_old text, p_scores jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_trio text[];
  v_w record;
  v_c record;
  v_guard integer := 0;
begin
  select array_agg(m.mood_key order by m.sort_order) into v_trio
    from cine_moods m
   where position(m.letter in coalesce(p_old, '')) > 0;
  if v_trio is null or cardinality(v_trio) <> 3 then
    return null;
  end if;

  loop
    v_guard := v_guard + 1;
    exit when v_guard > 4;

    -- o mais fraco do trio
    select s.mood_key, s.score, s.films into v_w
      from (select e ->> 'mood_key' as mood_key, (e ->> 'score')::numeric as score, (e ->> 'films')::integer as films, ord
              from jsonb_array_elements(coalesce(p_scores, '[]'::jsonb)) with ordinality x(e, ord)) s
     where s.mood_key = any (v_trio)
     order by s.ord desc
     limit 1;
    if not found then
      return null;
    end if;

    -- o desafiante: a prateleira de fora mais forte (com algum título)
    select s.mood_key, s.score, s.films into v_c
      from (select e ->> 'mood_key' as mood_key, (e ->> 'score')::numeric as score, (e ->> 'films')::integer as films, ord
              from jsonb_array_elements(coalesce(p_scores, '[]'::jsonb)) with ordinality x(e, ord)) s
     where not (s.mood_key = any (v_trio))
       and s.films > 0
     order by s.ord
     limit 1;
    exit when not found;

    -- entra quando abre 10 pontos (ou quando a do trio ficou sem título nenhum)
    if v_w.films = 0 or v_c.score - v_w.score >= 10 then
      v_trio := array_remove(v_trio, v_w.mood_key) || v_c.mood_key;
    else
      exit;
    end if;
  end loop;

  return (select string_agg(m.letter, '' order by m.sort_order) from cine_moods m where m.mood_key = any (v_trio));
end;
$$;

revoke all on function public.persona_with_margin(text, jsonb) from public, anon, authenticated;

create or replace function public.refresh_user_persona(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scores jsonb;
  v_counted integer;
  v_moods_used integer;
  v_raw text;    -- o top 3 bruto (a regra antiga)
  v_old text;    -- o código de agora
  v_code text;   -- o código que passa a valer
begin
  with rated as (
    select um.media_type, um.movie_id, um.rating::numeric as rating
      from user_movies um
     where um.user_id = p_user_id
       and um.rating is not null
       and um.media_type in ('movie', 'tv')
  ),
  curated as (
    select distinct st.mood_key, st.media_type, st.tmdb_id
      from shelf_titles() st
     where st.mood_key <> 'random-surprise'
  ),
  per_mood as (
    select m.mood_key, m.letter, m.sort_order,
           coalesce(sum(r.rating), 0) as score,
           count(r.movie_id) as films
      from cine_moods m
      left join curated c on c.mood_key = m.mood_key
      left join rated r on r.movie_id = c.tmdb_id and r.media_type = c.media_type
     group by m.mood_key, m.letter, m.sort_order
  ),
  ranked as (
    select pm.*, row_number() over (order by pm.score desc, pm.films desc, pm.sort_order) as rk
      from per_mood pm
  )
  select jsonb_agg(jsonb_build_object('mood_key', mood_key, 'score', score, 'films', films) order by rk),
         coalesce(sum(films), 0)::integer,
         (count(*) filter (where films > 0))::integer,
         string_agg(letter, '' order by sort_order) filter (where rk <= 3 and films > 0)
    into v_scores, v_counted, v_moods_used, v_raw
    from ranked;

  select p.personalidade_completa into v_old from profiles p where p.id = p_user_id;

  if v_counted < 10 or v_moods_used < 3 or length(coalesce(v_raw, '')) <> 3 then
    v_code := null;
  elsif v_old is null or length(v_old) <> 3 then
    -- a Persona nasce pelo top 3
    v_code := v_raw;
  else
    -- 13/11/2026: a regra dos 10 pontos
    v_code := coalesce(persona_with_margin(v_old, v_scores), v_raw);
  end if;

  update profiles
     set personalidade_completa = v_code,
         persona_scores = v_scores,
         persona_counted = v_counted,
         persona_updated_at = now()
   where id = p_user_id
     and (personalidade_completa is distinct from v_code
          or persona_scores is distinct from v_scores
          or persona_counted is distinct from v_counted);

  -- a muda: fica guardado de qual forma para qual
  if found and v_code is not null and v_code is distinct from v_old then
    insert into persona_molts (user_id, from_code, to_code, rating_no)
    values (p_user_id, v_old, v_code,
            (select count(*)::integer from user_movies um
              where um.user_id = p_user_id and um.rating is not null and um.media_type in ('movie', 'tv')));
  end if;

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. O replay (para preencher as mudas para trás)
-- ---------------------------------------------------------------------------

create or replace function public.persona_replay(p_user_id uuid)
returns table (kind text, rating_no integer, molted_at timestamptz, from_code text, to_code text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_letters text[];
  v_keys text[];
  s numeric[] := array_fill(0::numeric, array[9]);
  n integer[] := array_fill(0, array[9]);
  v_trio integer[];
  v_raw integer[];
  v_raw_code text;
  v_raw_prev text;
  v_raw_at timestamptz;
  v_raw_no integer;
  v_from text;
  v_code text;
  r record;
  i integer;
  v_cnt integer;
  v_used integer;
  w integer;
  c integer;
  v_changed boolean;
  v_guard integer;
begin
  select array_agg(m.letter order by m.sort_order), array_agg(m.mood_key order by m.sort_order)
    into v_letters, v_keys
    from cine_moods m;

  for r in
    select um.created_at, um.rating::numeric as rating, array_position(v_keys, st.mood_key) as idx,
           (row_number() over (order by um.created_at, um.id))::integer as no
      from user_movies um
      left join (select distinct x.mood_key, x.media_type, x.tmdb_id from shelf_titles() x where x.mood_key <> 'random-surprise') st
        on st.tmdb_id = um.movie_id and st.media_type = um.media_type
     where um.user_id = p_user_id and um.rating is not null and um.media_type in ('movie', 'tv')
     order by um.created_at, um.id
  loop
    if r.idx is null then continue; end if;
    s[r.idx] := s[r.idx] + r.rating;
    n[r.idx] := n[r.idx] + 1;
    v_cnt := 0; v_used := 0;
    for i in 1..9 loop
      v_cnt := v_cnt + n[i];
      if n[i] > 0 then v_used := v_used + 1; end if;
    end loop;
    if v_cnt < 10 or v_used < 3 then continue; end if;

    -- o top 3 bruto (a regra antiga), para saber quando ele virou o de hoje
    select array_agg(x.i order by x.rk) into v_raw
      from (select g.i, row_number() over (order by s[g.i] desc, n[g.i] desc, g.i) as rk
              from generate_series(1, 9) g(i) where n[g.i] > 0) x
     where x.rk <= 3;
    select string_agg(v_letters[q.i], '' order by q.i) into v_raw_code from unnest(v_raw) q(i);
    if v_raw_code is distinct from v_raw_prev then
      v_raw_prev := v_raw_code; v_raw_at := r.created_at; v_raw_no := r.no;
    end if;

    if v_trio is null then
      v_trio := v_raw;
      kind := 'molt'; rating_no := r.no; molted_at := r.created_at; from_code := null; to_code := v_raw_code;
      return next;
    else
      select string_agg(v_letters[q.i], '' order by q.i) into v_from from unnest(v_trio) q(i);
      v_changed := false; v_guard := 0;
      loop
        v_guard := v_guard + 1;
        exit when v_guard > 4;
        select x.i into w from unnest(v_trio) x(i) order by s[x.i], n[x.i], x.i desc limit 1;
        select g.i into c from generate_series(1, 9) g(i)
         where n[g.i] > 0 and not (g.i = any (v_trio))
         order by s[g.i] desc, n[g.i] desc, g.i limit 1;
        exit when c is null;
        if s[c] - s[w] >= 10 then
          v_trio := array_remove(v_trio, w) || c;
          v_changed := true;
        else
          exit;
        end if;
      end loop;
      if v_changed then
        select string_agg(v_letters[q.i], '' order by q.i) into v_code from unnest(v_trio) q(i);
        if v_code is distinct from v_from then
          kind := 'molt'; rating_no := r.no; molted_at := r.created_at; from_code := v_from; to_code := v_code;
          return next;
        end if;
      end if;
    end if;
  end loop;

  kind := 'raw_last'; rating_no := v_raw_no; molted_at := v_raw_at; from_code := null; to_code := v_raw_prev;
  return next;
end;
$$;

revoke all on function public.persona_replay(uuid) from public, anon, authenticated;

-- Preenche as mudas para trás, uma vez.
do $$
declare
  p record;
  m record;
  v_last text;
  v_last_at timestamptz;
  v_last_no integer;
begin
  if exists (select 1 from public.persona_molts where backfilled) then
    return;
  end if;
  for p in select pr.id, pr.personalidade_completa as code, pr.persona_updated_at
             from public.profiles pr where pr.personalidade_completa is not null
  loop
    v_last := null; v_last_at := null; v_last_no := null;
    for m in select * from public.persona_replay(p.id) loop
      if m.kind = 'molt' then
        insert into public.persona_molts (user_id, molted_at, from_code, to_code, rating_no, backfilled)
        values (p.id, m.molted_at, m.from_code, m.to_code, m.rating_no, true);
        v_last := m.to_code; v_last_at := m.molted_at; v_last_no := m.rating_no;
      elsif v_last is distinct from p.code then
        -- o replay terminou noutra forma: a última muda leva até o código vivo
        insert into public.persona_molts (user_id, molted_at, from_code, to_code, rating_no, backfilled)
        values (p.id,
                greatest(case when m.to_code = p.code then m.molted_at else coalesce(p.persona_updated_at, now()) end,
                         coalesce(v_last_at, '-infinity'::timestamptz) + interval '1 second'),
                v_last, p.code,
                case when m.to_code = p.code then greatest(coalesce(m.rating_no, 0), coalesce(v_last_no, 0)) end,
                true);
      end if;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. O que a cena precisa
-- ---------------------------------------------------------------------------

create or replace function public.get_persona_world(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
  v_out jsonb;
begin
  if p_user_id is null then
    return null;
  end if;
  select p.personalidade_completa into v_code from profiles p where p.id = p_user_id;
  if not found or not can_view_user_content(p_user_id) then
    return null;
  end if;

  with st as (
    select distinct x.mood_key, x.media_type, x.tmdb_id from shelf_titles() x where x.mood_key <> 'random-surprise'
  ),
  r as materialized (
    select um.rating::numeric as rating, um.media_type, um.movie_id, m.letter,
           (row_number() over (order by um.created_at, um.id))::integer as no
      from user_movies um
      left join st on st.tmdb_id = um.movie_id and st.media_type = um.media_type
      left join cine_moods m on m.mood_key = st.mood_key
     where um.user_id = p_user_id and um.rating is not null and um.media_type in ('movie', 'tv')
  ),
  shelf as materialized (
    select r.*,
           row_number() over (order by r.no desc) as back,
           row_number() over (partition by r.letter order by r.no desc) as mback,
           row_number() over (partition by r.letter order by r.rating desc, r.no desc) as mbest
      from r
     where r.letter is not null
  ),
  cnt as (
    select count(*)::integer as rated,
           (count(*) filter (where letter is null))::integer as out_n,
           (count(*) filter (where letter is not null))::integer as counted
      from r
  ),
  -- os títulos que a cena mostra pelo nome (poucos): nome e pôster do cache
  eyes as (
    select s.* from shelf s, cnt
     where s.rating >= 9 and (cnt.counted < 45 or s.back <= 30)
     order by s.no desc limit 6
  ),
  tens as (select r.* from r where r.rating >= 10 order by r.no desc limit 4),
  best as (select s.* from shelf s where s.mbest <= 4),
  lastn as (select r.* from r order by r.no desc limit 6)
  select jsonb_build_object(
    'v', 1,
    'rated', cnt.rated,
    'out', cnt.out_n,
    'counted', cnt.counted,
    -- as asas: os últimos 30 títulos de prateleira, do mais antigo ao mais novo: [letra, nota]
    'window', (select coalesce(jsonb_agg(jsonb_build_array(s.letter, s.rating) order by s.no), '[]'::jsonb) from shelf s where s.back <= 30),
    -- as tampas: as notas dos últimos 9 títulos de cada prateleira
    'recent', (select coalesce(jsonb_object_agg(q.letter, q.arr), '{}'::jsonb)
                 from (select s.letter, jsonb_agg(s.rating order by s.no) as arr from shelf s where s.mback <= 9 group by s.letter) q),
    -- a lagarta: as prateleiras dos primeiros 12 títulos (só antes de a Persona nascer)
    'first', case when v_code is null
                  then (select coalesce(jsonb_agg(f.letter order by f.no), '[]'::jsonb)
                          from (select s.letter, s.no from shelf s order by s.no limit 12) f)
                  else '[]'::jsonb end,
    'eyes', (select coalesce(jsonb_agg(jsonb_build_object('id', e.movie_id, 'type', e.media_type, 'r', e.rating, 'm', e.letter,
                      'title_pt', mc.title_pt, 'title_en', mc.title_en, 'poster', coalesce(mc.poster_path_pt, mc.poster_path)) order by e.no desc), '[]'::jsonb)
               from eyes e left join movie_cache mc on mc.tmdb_id = e.movie_id and mc.media_type = e.media_type),
    'tens', (select coalesce(jsonb_agg(jsonb_build_object('id', e.movie_id, 'type', e.media_type, 'r', e.rating, 'm', e.letter,
                      'title_pt', mc.title_pt, 'title_en', mc.title_en, 'poster', coalesce(mc.poster_path_pt, mc.poster_path)) order by e.no desc), '[]'::jsonb)
               from tens e left join movie_cache mc on mc.tmdb_id = e.movie_id and mc.media_type = e.media_type),
    'last', (select coalesce(jsonb_agg(jsonb_build_object('id', e.movie_id, 'type', e.media_type, 'r', e.rating, 'm', e.letter,
                      'title_pt', mc.title_pt, 'title_en', mc.title_en, 'poster', coalesce(mc.poster_path_pt, mc.poster_path)) order by e.no desc), '[]'::jsonb)
               from lastn e left join movie_cache mc on mc.tmdb_id = e.movie_id and mc.media_type = e.media_type),
    'best', (select coalesce(jsonb_object_agg(q.letter, q.arr), '{}'::jsonb)
               from (select e.letter, jsonb_agg(jsonb_build_object('id', e.movie_id, 'type', e.media_type, 'r', e.rating, 'm', e.letter,
                              'title_pt', mc.title_pt, 'title_en', mc.title_en, 'poster', coalesce(mc.poster_path_pt, mc.poster_path)) order by e.mbest) as arr
                       from best e left join movie_cache mc on mc.tmdb_id = e.movie_id and mc.media_type = e.media_type
                      group by e.letter) q),
    'molts', (select coalesce(jsonb_agg(jsonb_build_object('at', pm.molted_at, 'from', pm.from_code, 'to', pm.to_code, 'no', pm.rating_no) order by pm.molted_at, pm.id), '[]'::jsonb)
                from (select * from persona_molts x where x.user_id = p_user_id order by x.molted_at desc, x.id desc limit 24) pm),
    'persona', get_user_persona(p_user_id)
  )
    into v_out
    from cnt;

  return v_out;
end;
$$;

revoke all on function public.get_persona_world(uuid) from public;
grant execute on function public.get_persona_world(uuid) to anon, authenticated;
