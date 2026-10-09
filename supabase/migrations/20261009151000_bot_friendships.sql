-- Amizades entre bots (09/10/2026).
--
-- Cada bot fica amigo dos p_top bots de gosto mais parecido (correlação das
-- notas nos títulos que os dois avaliaram, encolhida pelo número de títulos
-- em comum: r · n / (n + 10)) e de mais p_random bots sorteados — a rede
-- fica com "tribos" de gosto e algumas pontes entre elas. Como cada bot
-- escolhe os seus, todo bot termina com pelo menos p_top amigos. Amizades
-- já existentes (em qualquer direção) são mantidas. A data da amizade é
-- sorteada nos últimos 90 dias.

create or replace function curation.link_bot_friends(p_top integer default 3, p_random integer default 1)
returns integer
language plpgsql
security definer
set search_path to 'curation', 'public'
as $$
declare
  v_n integer;
begin
  with bots as (
    select user_id from public.bot_accounts
  ),
  r as (
    select um.user_id, um.movie_id, um.media_type, um.rating::float rating
    from public.user_movies um join bots b on b.user_id = um.user_id
    where um.rating is not null
  ),
  pairs as (
    select a.user_id ua, b.user_id ub, count(*) n, coalesce(corr(a.rating, b.rating), 0) c
    from r a join r b on b.movie_id = a.movie_id and b.media_type = a.media_type and b.user_id <> a.user_id
    group by a.user_id, b.user_id
  ),
  scored as (
    select x.user_id ua, y.user_id ub,
           coalesce(p.c * p.n / (p.n + 10.0), 0) + random() * 0.001 score
    from bots x cross join bots y
    left join pairs p on p.ua = x.user_id and p.ub = y.user_id
    where x.user_id <> y.user_id
  ),
  top_pick as (
    select ua, ub from (
      select ua, ub, row_number() over (partition by ua order by score desc) rk from scored
    ) z where rk <= p_top
  ),
  random_pick as (
    select ua, ub from (
      select s.ua, s.ub, row_number() over (partition by s.ua order by random()) rk
      from scored s where not exists (select 1 from top_pick t where t.ua = s.ua and t.ub = s.ub)
    ) z where rk <= p_random
  ),
  chosen as (
    select distinct least(ua, ub) a, greatest(ua, ub) b from (select * from top_pick union all select * from random_pick) z
  ),
  dated as (
    select a, b, now() - random() * interval '90 days' t from chosen
  ),
  ins as (
    insert into public.friendships (requester_id, addressee_id, status, created_at, updated_at)
    select c.a, c.b, 'accepted', c.t, c.t
    from dated c
    where not exists (
      select 1 from public.friendships f
      where (f.requester_id = c.a and f.addressee_id = c.b) or (f.requester_id = c.b and f.addressee_id = c.a)
    )
    returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end $$;

revoke all on function curation.link_bot_friends(integer, integer) from public, anon, authenticated;
