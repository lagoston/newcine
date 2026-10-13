-- Conexão entre cinéfilos (13/10/2026).
--
-- A compatibilidade deixa de ser calculada no navegador (modelo por faixas
-- de nota, que media mais o "jeito de dar nota" de cada um do que o gosto em
-- comum) e passa a morar no banco, calculada para todos os pares e guardada.
--
-- Fórmula (validada com dados reais — ver o doc "Conexão" do projeto):
--   para cada pessoa u: μ = média das notas, σ = max(1, desvio-padrão);
--   z = (nota − μ)/σ  (a nota ajustada ao jeito de avaliar da pessoa).
--   Nos n títulos que os dois avaliaram:
--     C = Σ za·zb / √(Σza²·Σzb²)                     — ordenam igual?
--     E = (amam juntos + detestam juntos − choques) / títulos extremos
--         (amar: z ≥ +0,5; detestar: z ≤ −0,5)        — amam/detestam o mesmo?
--     L = max(−1, 1 − média|ra − rb| / 2,5)           — notas próximas?
--     R = 0,4·C + 0,3·E + 0,3·L
--     S = (n·R + 20·0,25) / (n + 20)                  — puxado para o par típico
--     % = 100 / (1 + e^(−(S − 0,25)/0,15)), entre 1 e 99
--   Confiança: n < 5 → sem número; 5–14 baixa; 15–39 média; ≥ 40 alta.
--
-- Guardado nos dois sentidos em user_compatibility (uma linha por pessoa e
-- outra pessoa). Atualização: um gatilho em user_movies põe quem mudou na
-- fila (compat_dirty) e um cron a cada 10 min recalcula essas pessoas contra
-- todo mundo (hoje ~60 ms por pessoa). Nada aqui apaga linhas: par que deixou
-- de existir vira active = false; a fila marca processed_at.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.user_taste_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  n integer not null,
  mu real not null,
  sigma real not null,
  updated_at timestamptz not null default now()
);
alter table public.user_taste_stats enable row level security;

create table if not exists public.user_compatibility (
  user_id uuid not null references public.profiles(id) on delete cascade,
  other_id uuid not null references public.profiles(id) on delete cascade,
  shared_count integer not null,
  raw real not null,
  score real not null,
  pct smallint not null,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  loved_both integer not null default 0,
  hated_both integer not null default 0,
  clashes integer not null default 0,
  active boolean not null default true,
  computed_at timestamptz not null default now(),
  primary key (user_id, other_id)
);
create index if not exists user_compatibility_rank_idx on public.user_compatibility (user_id, score desc) where active;
create index if not exists user_compatibility_other_idx on public.user_compatibility (other_id);
alter table public.user_compatibility enable row level security;

create table if not exists public.compat_dirty (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  queued_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists compat_dirty_pending_idx on public.compat_dirty (queued_at) where processed_at is null;
alter table public.compat_dirty enable row level security;

-- Quem não quer aparecer em "Cinéfilos com o seu gosto".
alter table public.profiles add column if not exists discoverable boolean not null default true;

-- ---------------------------------------------------------------------------
-- A conta (uma só, usada pelo cálculo em lote e pelo cálculo ao vivo)
-- ---------------------------------------------------------------------------

create or replace function public.compat_score(
  p_n integer, p_c double precision, p_ll integer, p_hh integer, p_x integer, p_ext integer, p_mad double precision,
  out raw double precision, out score double precision, out pct integer, out confidence text)
language sql
immutable
set search_path = public
as $$
  select b.r, b.s,
         least(99, greatest(1, round(100 / (1 + exp(-(b.s - 0.25) / 0.15)))))::integer,
         case when p_n >= 40 then 'high' when p_n >= 15 then 'medium' else 'low' end
  from (
    select a.r, (p_n * a.r + 20 * 0.25) / (p_n + 20) as s
    from (
      select 0.4 * coalesce(p_c, 0)
           + 0.3 * ((coalesce(p_ll, 0) + coalesce(p_hh, 0) - coalesce(p_x, 0))::double precision / greatest(coalesce(p_ext, 0), 1))
           + 0.3 * greatest(-1, 1 - coalesce(p_mad, 0) / 2.5) as r
    ) a
  ) b;
$$;

-- Média e desvio de cada pessoa (o "jeito de dar nota").
create or replace function public.refresh_taste_stats(p_users uuid[])
returns integer
language sql
volatile
security definer
set search_path = public
as $$
  with s as (
    select user_id, count(*)::integer n, avg(rating)::real mu, greatest(1, coalesce(stddev_pop(rating), 0))::real sigma
    from public.user_movies um
    where um.user_id = any(p_users) and um.rating is not null
      and exists (select 1 from public.profiles p where p.id = um.user_id)
    group by um.user_id
  ),
  up as (
    insert into public.user_taste_stats (user_id, n, mu, sigma, updated_at)
    select user_id, n, mu, sigma, now() from s
    on conflict (user_id) do update set n = excluded.n, mu = excluded.mu, sigma = excluded.sigma, updated_at = now()
    returning 1
  )
  select count(*)::integer from up;
$$;

-- Uma pessoa contra todas as outras (pares com 5+ títulos em comum).
create or replace function public.compute_compatibility_for(p_user uuid)
returns table (other_id uuid, shared_count integer, raw double precision, score double precision, pct integer,
               confidence text, loved_both integer, hated_both integer, clashes integer)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select mu, sigma from public.user_taste_stats where user_id = p_user
  ),
  mine as (
    select um.movie_id, um.media_type, um.rating::double precision r, (um.rating - me.mu) / me.sigma z
    from public.user_movies um cross join me
    where um.user_id = p_user and um.rating is not null
  ),
  pr as (
    select o.user_id, m.r ra, m.z za, o.rating::double precision rb, (o.rating - s.mu) / s.sigma zb
    from mine m
    join public.user_movies o on o.movie_id = m.movie_id and o.media_type = m.media_type and o.user_id <> p_user and o.rating is not null
    join public.user_taste_stats s on s.user_id = o.user_id
  ),
  agg as (
    select user_id, count(*)::integer n,
           coalesce(sum(za * zb) / nullif(sqrt(sum(za * za) * sum(zb * zb)), 0), 0) c,
           (count(*) filter (where za >= 0.5 and zb >= 0.5))::integer ll,
           (count(*) filter (where za <= -0.5 and zb <= -0.5))::integer hh,
           (count(*) filter (where (za >= 0.5 and zb <= -0.5) or (za <= -0.5 and zb >= 0.5)))::integer x,
           (count(*) filter (where abs(za) >= 0.5 or abs(zb) >= 0.5))::integer ext,
           avg(abs(ra - rb)) mad
    from pr
    group by user_id
    having count(*) >= 5
  )
  select a.user_id, a.n, s.raw, s.score, s.pct, s.confidence, a.ll, a.hh, a.x
  from agg a
  cross join lateral public.compat_score(a.n, a.c, a.ll, a.hh, a.x, a.ext, a.mad) s;
$$;

-- Grava os pares de uma pessoa (nos dois sentidos); par que sumiu fica inativo.
create or replace function public.refresh_compatibility_for(p_user uuid)
returns integer
language sql
volatile
security definer
set search_path = public
as $$
  with c as materialized (
    select * from public.compute_compatibility_for(p_user)
  ),
  ins as (
    insert into public.user_compatibility as uc
      (user_id, other_id, shared_count, raw, score, pct, confidence, loved_both, hated_both, clashes, active, computed_at)
    select p_user, c.other_id, c.shared_count, c.raw, c.score, c.pct, c.confidence, c.loved_both, c.hated_both, c.clashes, true, now() from c
    union all
    select c.other_id, p_user, c.shared_count, c.raw, c.score, c.pct, c.confidence, c.loved_both, c.hated_both, c.clashes, true, now() from c
    on conflict (user_id, other_id) do update set
      shared_count = excluded.shared_count, raw = excluded.raw, score = excluded.score, pct = excluded.pct,
      confidence = excluded.confidence, loved_both = excluded.loved_both, hated_both = excluded.hated_both,
      clashes = excluded.clashes, active = true, computed_at = now()
    returning 1
  ),
  gone as (
    update public.user_compatibility uc set active = false, computed_at = now()
    where uc.active
      and ((uc.user_id = p_user and not exists (select 1 from c where c.other_id = uc.other_id))
        or (uc.other_id = p_user and not exists (select 1 from c where c.other_id = uc.user_id)))
    returning 1
  )
  select (select count(*) from c)::integer + 0 * (select count(*) from ins)::integer + 0 * (select count(*) from gone)::integer;
$$;

-- Fila: o cron processa quem avaliou algo desde a última passada.
create or replace function public.process_compat_dirty(p_limit integer default 50)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_users uuid[];
  u uuid;
begin
  -- uma passada por vez (sem trancar as linhas da fila: quem avalia um filme
  -- enquanto o cron roda não fica esperando)
  if not pg_try_advisory_xact_lock(hashtext('process_compat_dirty')) then
    return 0;
  end if;
  select array_agg(d.user_id) into v_users
  from (
    select user_id from public.compat_dirty
    where processed_at is null
    order by queued_at
    limit greatest(1, p_limit)
  ) d;
  if v_users is null then
    return 0;
  end if;
  perform public.refresh_taste_stats(v_users);
  foreach u in array v_users loop
    perform public.refresh_compatibility_for(u);
  end loop;
  update public.compat_dirty set processed_at = clock_timestamp()
  where user_id = any(v_users) and processed_at is null and queued_at <= v_started;
  return array_length(v_users, 1);
end;
$$;

-- Gatilhos: por comando (não por linha), porque os bots gravam em lote. Se
-- algo der errado aqui, a nota da pessoa é salva do mesmo jeito (a fila é
-- só um aviso para o cron).
create or replace function public.compat_mark_dirty_new()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.compat_dirty (user_id, queued_at, processed_at)
    select distinct n.user_id, clock_timestamp(), null::timestamptz
    from new_rows n
    where n.user_id is not null and exists (select 1 from public.profiles p where p.id = n.user_id)
    on conflict (user_id) do update set queued_at = excluded.queued_at, processed_at = null;
  exception when others then
    null;
  end;
  return null;
end;
$$;

create or replace function public.compat_mark_dirty_old()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.compat_dirty (user_id, queued_at, processed_at)
    select distinct o.user_id, clock_timestamp(), null::timestamptz
    from old_rows o
    where o.user_id is not null and exists (select 1 from public.profiles p where p.id = o.user_id)
    on conflict (user_id) do update set queued_at = excluded.queued_at, processed_at = null;
  exception when others then
    null;
  end;
  return null;
end;
$$;

create or replace trigger compat_dirty_ins
  after insert on public.user_movies
  referencing new table as new_rows
  for each statement execute function public.compat_mark_dirty_new();

create or replace trigger compat_dirty_upd
  after update on public.user_movies
  referencing new table as new_rows
  for each statement execute function public.compat_mark_dirty_new();

create or replace trigger compat_dirty_del
  after delete on public.user_movies
  referencing old table as old_rows
  for each statement execute function public.compat_mark_dirty_old();

-- ---------------------------------------------------------------------------
-- Leitura pelo site (sempre de quem está logado, respeitando a privacidade)
-- ---------------------------------------------------------------------------

-- A conexão com várias pessoas de uma vez (chips em listas e cartões).
create or replace function public.get_connection_scores(p_ids uuid[])
returns table (other_id uuid, pct integer, confidence text, shared_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.other_id, c.pct::integer, c.confidence, c.shared_count
  from public.user_compatibility c
  where auth.uid() is not null
    and c.user_id = auth.uid()
    and c.active
    and c.other_id = any(p_ids[1:300])
    and c.other_id <> auth.uid()
    and public.can_view_user_content(c.other_id);
$$;

-- A conexão com uma pessoa, calculada na hora (sempre atual), com os
-- títulos que explicam o número.
create or replace function public.get_connection(p_other uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_result jsonb;
begin
  if v_me is null or p_other is null or p_other = v_me then
    return null;
  end if;
  if not public.can_view_user_content(p_other) then
    return null;
  end if;

  with st as (
    select user_id, avg(rating)::double precision mu, greatest(1, coalesce(stddev_pop(rating), 0))::double precision sigma
    from public.user_movies
    where user_id in (v_me, p_other) and rating is not null
    group by user_id
  ),
  pr as (
    select a.movie_id, a.media_type, a.rating ra, b.rating rb,
           (a.rating - sa.mu) / sa.sigma za, (b.rating - sb.mu) / sb.sigma zb
    from public.user_movies a
    join public.user_movies b on b.user_id = p_other and b.movie_id = a.movie_id and b.media_type = a.media_type and b.rating is not null
    join st sa on sa.user_id = v_me
    join st sb on sb.user_id = p_other
    where a.user_id = v_me and a.rating is not null
  ),
  agg as (
    select count(*)::integer n,
           coalesce(sum(za * zb) / nullif(sqrt(sum(za * za) * sum(zb * zb)), 0), 0) c,
           (count(*) filter (where za >= 0.5 and zb >= 0.5))::integer ll,
           (count(*) filter (where za <= -0.5 and zb <= -0.5))::integer hh,
           (count(*) filter (where (za >= 0.5 and zb <= -0.5) or (za <= -0.5 and zb >= 0.5)))::integer x,
           (count(*) filter (where abs(za) >= 0.5 or abs(zb) >= 0.5))::integer ext,
           avg(abs(ra - rb)) mad
    from pr
  ),
  sc as (
    select a.*, s.pct, s.confidence, s.score from agg a cross join lateral public.compat_score(a.n, a.c, a.ll, a.hh, a.x, a.ext, a.mad) s
  ),
  t as (
    select pr.movie_id, pr.media_type, pr.ra, pr.rb,
           mc.title_pt, mc.title_en, mc.poster_path, mc.poster_path_pt, mc.backdrop_path, left(mc.release_date::text, 4) as year
    from pr
    left join public.movie_cache mc on mc.tmdb_id = pr.movie_id and mc.media_type = pr.media_type
  )
  select jsonb_build_object(
    'shared_count', sc.n,
    'pct', case when sc.n >= 5 then sc.pct end,
    'score', case when sc.n >= 5 then round(sc.score::numeric, 4) end,
    'confidence', case when sc.n >= 5 then sc.confidence else 'none' end,
    'loved_both', sc.ll,
    'hated_both', sc.hh,
    'clashes', sc.x,
    'loves', coalesce((
      select jsonb_agg(to_jsonb(lv.*) order by least(lv.rating_me, lv.rating_other) desc, lv.rating_me + lv.rating_other desc)
      from (
        select t.movie_id, t.media_type, t.title_pt, t.title_en, t.poster_path, t.poster_path_pt, t.backdrop_path, t.year,
               t.ra rating_me, t.rb rating_other
        from t where t.ra >= 8 and t.rb >= 8
        order by least(t.ra, t.rb) desc, t.ra + t.rb desc
        limit 12
      ) lv), '[]'::jsonb),
    'hates', coalesce((
      select jsonb_agg(to_jsonb(ht.*) order by greatest(ht.rating_me, ht.rating_other) asc)
      from (
        select t.movie_id, t.media_type, t.title_pt, t.title_en, t.poster_path, t.poster_path_pt, t.year,
               t.ra rating_me, t.rb rating_other
        from t where t.ra <= 4 and t.rb <= 4
        order by greatest(t.ra, t.rb) asc, t.ra + t.rb asc
        limit 6
      ) ht), '[]'::jsonb),
    'debates', coalesce((
      select jsonb_agg(to_jsonb(db.*) order by abs(db.rating_me - db.rating_other) desc)
      from (
        select t.movie_id, t.media_type, t.title_pt, t.title_en, t.poster_path, t.poster_path_pt, t.year,
               t.ra rating_me, t.rb rating_other
        from t where abs(t.ra - t.rb) >= 3
        order by abs(t.ra - t.rb) desc, greatest(t.ra, t.rb) desc
        limit 4
      ) db), '[]'::jsonb),
    'calibrate', coalesce((
      select jsonb_agg(to_jsonb(cb.*) order by cb.vote_count desc nulls last)
      from (
        select o.movie_id, o.media_type, mc.title_pt, mc.title_en, mc.poster_path, mc.poster_path_pt,
               left(mc.release_date::text, 4) as year, mc.vote_count, o.rating rating_other
        from public.user_movies o
        join public.movie_cache mc on mc.tmdb_id = o.movie_id and mc.media_type = o.media_type
        where o.user_id = p_other and o.rating is not null
          and not exists (
            select 1 from public.user_movies m
            where m.user_id = v_me and m.movie_id = o.movie_id and m.media_type = o.media_type and m.rating is not null
          )
        order by mc.vote_count desc nulls last
        limit 8
      ) cb), '[]'::jsonb)
  ) into v_result
  from sc;

  return v_result;
end;
$$;

-- Ranking: seus amigos por conexão ('friends') ou cinéfilos que ainda não
-- são seus amigos, com gosto parecido ('community' — só quem aceita aparecer,
-- com confiança média ou alta e sem pedido pendente).
create or replace function public.get_my_connections(p_scope text default 'friends', p_limit integer default 20)
returns table (user_id uuid, username text, avatar_url text, avatar_frame text, is_premium boolean, top_moods text[],
               pct integer, confidence text, shared_count integer, is_friend boolean, posters text[])
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as id
  ),
  friends as (
    select case when f.requester_id = me.id then f.addressee_id else f.requester_id end as fid
    from public.friendships f, me
    where f.status = 'accepted' and (f.requester_id = me.id or f.addressee_id = me.id)
  ),
  pending as (
    select case when f.requester_id = me.id then f.addressee_id else f.requester_id end as pid
    from public.friendships f, me
    where f.status = 'pending' and (f.requester_id = me.id or f.addressee_id = me.id)
  ),
  cand as (
    select p.id, p.username, p.avatar_url, p.avatar_frame,
           (p.plan_type = 'premium' or coalesce(p.lifetime_premium, false)) as is_premium,
           p.persona_scores, p.persona_counted,
           c.pct, c.confidence, c.shared_count, c.score,
           exists (select 1 from friends where friends.fid = p.id) as is_friend
    from public.profiles p
    cross join me
    left join public.user_compatibility c on c.user_id = me.id and c.other_id = p.id and c.active
    where me.id is not null
      and p.id <> me.id
      and public.can_view_user_content(p.id)
      and case
            when p_scope = 'friends' then exists (select 1 from friends where friends.fid = p.id)
            else not exists (select 1 from friends where friends.fid = p.id)
                 and not exists (select 1 from pending where pending.pid = p.id)
                 and coalesce(p.discoverable, true)
                 and c.confidence in ('medium', 'high')
          end
  )
  select cand.id, cand.username, cand.avatar_url, cand.avatar_frame, cand.is_premium,
         case when coalesce(cand.persona_counted, 0) >= 10 then (
           select array_agg(e.value ->> 'mood_key' order by e.ord)
           from (
             select value, ord from jsonb_array_elements(coalesce(cand.persona_scores, '[]'::jsonb)) with ordinality as j(value, ord)
             where coalesce((value ->> 'films')::numeric, 0) > 0
             order by ord
             limit 3
           ) e
         ) end,
         cand.pct::integer, cand.confidence, cand.shared_count, cand.is_friend,
         (
           select array_agg(x.poster order by x.lo desc, x.su desc)
           from (
             select coalesce(mc.poster_path, mc.poster_path_pt) as poster, least(a.rating, b.rating) lo, a.rating + b.rating su
             from public.user_movies a
             join public.user_movies b on b.user_id = cand.id and b.movie_id = a.movie_id and b.media_type = a.media_type and b.rating >= 8
             join public.movie_cache mc on mc.tmdb_id = a.movie_id and mc.media_type = a.media_type
             cross join me
             where a.user_id = me.id and a.rating >= 8 and coalesce(mc.poster_path, mc.poster_path_pt) is not null
             order by least(a.rating, b.rating) desc, a.rating + b.rating desc
             limit 3
           ) x
         )
  from cand
  order by cand.score desc nulls last, cand.shared_count desc nulls last, cand.username
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- ---------------------------------------------------------------------------
-- Privacidade: a lista antiga de títulos em comum (ainda usada pelo app
-- instalado) passa a respeitar perfil privado / só amigos.
-- ---------------------------------------------------------------------------

create or replace function public.get_user_compatibility(p_user_a uuid, p_user_b uuid)
returns table (movie_id integer, media_type text, rating_a integer, rating_b integer, vote_average numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_caller_is(p_user_a);
  if not public.can_view_user_content(p_user_b) then
    return;
  end if;
  return query select * from public.get_user_compatibility__impl(p_user_a, p_user_b);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------

revoke all on function public.compat_score(integer, double precision, integer, integer, integer, integer, double precision) from public, anon, authenticated;
revoke all on function public.refresh_taste_stats(uuid[]) from public, anon, authenticated;
revoke all on function public.compute_compatibility_for(uuid) from public, anon, authenticated;
revoke all on function public.refresh_compatibility_for(uuid) from public, anon, authenticated;
revoke all on function public.process_compat_dirty(integer) from public, anon, authenticated;
revoke all on function public.compat_mark_dirty_new() from public, anon, authenticated;
revoke all on function public.compat_mark_dirty_old() from public, anon, authenticated;

revoke all on function public.get_connection_scores(uuid[]) from public, anon;
revoke all on function public.get_connection(uuid) from public, anon;
revoke all on function public.get_my_connections(text, integer) from public, anon;
grant execute on function public.get_connection_scores(uuid[]) to authenticated;
grant execute on function public.get_connection(uuid) to authenticated;
grant execute on function public.get_my_connections(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Primeira carga e o cron
-- ---------------------------------------------------------------------------

select public.refresh_taste_stats(array(select distinct user_id from public.user_movies where rating is not null));
select public.refresh_compatibility_for(u.user_id)
from (select distinct user_id from public.user_movies where rating is not null) u;

select cron.schedule('compat-refresh', '*/10 * * * *', $$select public.process_compat_dirty(50)$$);
