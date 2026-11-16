-- Conta Diretor, etapa C: as ferramentas que mudam o site para todos (16/11/2026).
--
-- Pedido do Bruno: "Seria interessante poder adicionar manualmente por ela filmes
-- nas pools, novos pôsteres a serem sorteados na roleta entre outros". Aqui ficam:
--
--   * director_title_info: onde um título está (prateleiras, pôsteres), se já está
--     no banco e quantas pessoas de verdade já deram nota (quem a mudança atinge);
--   * prateleiras dos oráculos: pôr (nível 2), mudar de prateleira (nível 2, num
--     UPDATE só, para a Persona de quem avaliou ser recalculada uma vez, já com o
--     título no lugar novo) e tirar (nível 3). A Surpresa (random-surprise) é
--     montada sozinha e fica de fora;
--   * pôsteres da roleta: entram como rascunho (fora do sorteio), no lote do dia;
--     pôr no sorteio é nível 2; tirar do sorteio um pôster que alguém já tem é
--     nível 3. Exclusivos do Pôster Poker não passam por aqui;
--   * diário: a lista do que o diretor fez (só ele lê) e o desfazer, que só
--     desfaz se nada mudou depois, e nunca apaga pôster que alguém já teve (as
--     chaves estrangeiras recusam).
--
-- Níveis (ver 20261116150000_director_foundation.sql): 2 = código do app
-- autenticador nesta sessão; 3 = código digitado nos últimos 15 minutos. Cada
-- mudança vai para director.audit_log com o antes e o depois, e há limite por hora.

-- ---------------------------------------------------------------------------
-- Ajudantes internos (não expostos ao site)
-- ---------------------------------------------------------------------------
create or replace function director.pool_id(p_card text, p_mood text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select rp.id from public.recommendation_pools rp
   where rp.card_type = p_card and rp.mood_key = p_mood and p_mood <> 'random-surprise';
$$;
revoke all on function director.pool_id(text, text) from public;

-- a lista sem o id, na mesma ordem
create or replace function director.ids_without(p_ids jsonb, p_id int)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.v order by x.n), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_ids, '[]'::jsonb)) with ordinality x(v, n)
   where x.v <> to_jsonb(p_id);
$$;
revoke all on function director.ids_without(jsonb, int) from public;

-- a lista com o id no fim (se ainda não estiver)
create or replace function director.ids_with(p_ids jsonb, p_id int)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_ids, '[]'::jsonb) @> to_jsonb(p_id) then coalesce(p_ids, '[]'::jsonb)
              else coalesce(p_ids, '[]'::jsonb) || to_jsonb(p_id) end;
$$;
revoke all on function director.ids_with(jsonb, int) from public;

create or replace function director.check_title(p_media text, p_tmdb_id int)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_media is null or p_media not in ('movie', 'tv') or coalesce(p_tmdb_id, 0) <= 0 then
    raise exception 'bad_args' using errcode = '22023';
  end if;
  -- regra da casa: as prateleiras e a roleta só leem do banco
  if not exists (select 1 from public.movie_cache mc where mc.tmdb_id = p_tmdb_id and mc.media_type = p_media) then
    raise exception 'not_in_db' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function director.check_title(text, int) from public;

-- o retrato de uma prateleira para o diário
create or replace function director.pool_snapshot(p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(rp.id::text, jsonb_build_object('movie_ids', rp.movie_ids, 'tv_ids', coalesce(rp.tv_ids, '[]'::jsonb))), '{}'::jsonb)
    from public.recommendation_pools rp where rp.id = any(p_ids);
$$;
revoke all on function director.pool_snapshot(uuid[]) from public;

-- ---------------------------------------------------------------------------
-- Um título: onde está e quem a mudança atinge (nível 1, só leitura)
-- ---------------------------------------------------------------------------
create or replace function public.director_title_info(p_media text, p_tmdb_id int)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := director.require(1);
begin
  if p_media is null or p_media not in ('movie', 'tv') or coalesce(p_tmdb_id, 0) <= 0 then
    raise exception 'bad_args' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'in_db', exists (select 1 from public.movie_cache mc where mc.tmdb_id = p_tmdb_id and mc.media_type = p_media),
    'shelves', (select coalesce(jsonb_agg(jsonb_build_object('card', rp.card_type, 'mood', rp.mood_key) order by rp.card_type, rp.mood_key), '[]'::jsonb)
                  from public.recommendation_pools rp
                 where rp.mood_key <> 'random-surprise'
                   and (case when p_media = 'tv' then coalesce(rp.tv_ids, '[]'::jsonb) else rp.movie_ids end) @> to_jsonb(p_tmdb_id)),
    -- pessoas de verdade que já deram nota (a Persona delas é recalculada na mudança)
    'raters', (select count(*) from public.user_movies um
                where um.movie_id = p_tmdb_id and um.media_type = p_media and um.rating is not null
                  and not exists (select 1 from public.bot_accounts b where b.user_id = um.user_id)
                  and not exists (select 1 from director.accounts a where a.user_id = um.user_id)),
    'posters', (select coalesce(jsonb_agg(jsonb_build_object('id', pi.id, 'rarity', pi.rarity, 'serial', pi.serial, 'file_path', pi.file_path,
                                                             'is_active', pi.is_active, 'exclusive', pi.exclusive) order by pi.id), '[]'::jsonb)
                  from public.poster_items pi where pi.tmdb_id = p_tmdb_id and pi.media_type = p_media)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Prateleiras dos oráculos
-- ---------------------------------------------------------------------------
create or replace function public.director_pool_add(p_card text, p_mood text, p_media text, p_tmdb_id int, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := director.require(2);
  v_id uuid;
  v_before jsonb;
  v_audit bigint;
begin
  perform director.rate('pool.add', 60, interval '1 hour');
  perform director.check_title(p_media, p_tmdb_id);
  v_id := director.pool_id(p_card, p_mood);
  if v_id is null then
    raise exception 'pool_not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.recommendation_pools where id = v_id for update;
  v_before := director.pool_snapshot(array[v_id]);
  if (v_before -> v_id::text -> (case when p_media = 'tv' then 'tv_ids' else 'movie_ids' end)) @> to_jsonb(p_tmdb_id) then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  update public.recommendation_pools
     set movie_ids = case when p_media = 'movie' then director.ids_with(movie_ids, p_tmdb_id) else movie_ids end,
         tv_ids = case when p_media = 'tv' then director.ids_with(tv_ids, p_tmdb_id) else tv_ids end
   where id = v_id;
  v_audit := director.log('pool.add', 'recommendation_pools', p_media || ':' || p_tmdb_id,
    jsonb_build_object('rows', v_before),
    jsonb_build_object('rows', director.pool_snapshot(array[v_id]), 'to', p_card || '/' || p_mood),
    p_reason, true);
  return jsonb_build_object('ok', true, 'changed', true, 'audit_id', v_audit);
end;
$$;

create or replace function public.director_pool_remove(p_card text, p_mood text, p_media text, p_tmdb_id int, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := director.require(3);
  v_id uuid;
  v_before jsonb;
  v_audit bigint;
begin
  perform director.rate('pool.remove', 30, interval '1 hour');
  if p_media is null or p_media not in ('movie', 'tv') or coalesce(p_tmdb_id, 0) <= 0 then
    raise exception 'bad_args' using errcode = '22023';
  end if;
  v_id := director.pool_id(p_card, p_mood);
  if v_id is null then
    raise exception 'pool_not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.recommendation_pools where id = v_id for update;
  v_before := director.pool_snapshot(array[v_id]);
  if not ((v_before -> v_id::text -> (case when p_media = 'tv' then 'tv_ids' else 'movie_ids' end)) @> to_jsonb(p_tmdb_id)) then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  update public.recommendation_pools
     set movie_ids = case when p_media = 'movie' then director.ids_without(movie_ids, p_tmdb_id) else movie_ids end,
         tv_ids = case when p_media = 'tv' then director.ids_without(tv_ids, p_tmdb_id) else tv_ids end
   where id = v_id;
  v_audit := director.log('pool.remove', 'recommendation_pools', p_media || ':' || p_tmdb_id,
    jsonb_build_object('rows', v_before),
    jsonb_build_object('rows', director.pool_snapshot(array[v_id]), 'from', p_card || '/' || p_mood),
    p_reason, true);
  return jsonb_build_object('ok', true, 'changed', true, 'audit_id', v_audit);
end;
$$;

-- Mudar de prateleira: um UPDATE só nas duas linhas (os gatilhos de Persona rodam
-- no fim do comando e já veem o título no lugar novo).
create or replace function public.director_pool_move(p_from_card text, p_from_mood text, p_to_card text, p_to_mood text,
                                                     p_media text, p_tmdb_id int, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := director.require(2);
  v_from uuid;
  v_to uuid;
  v_before jsonb;
  v_audit bigint;
begin
  perform director.rate('pool.move', 60, interval '1 hour');
  perform director.check_title(p_media, p_tmdb_id);
  v_from := director.pool_id(p_from_card, p_from_mood);
  v_to := director.pool_id(p_to_card, p_to_mood);
  if v_from is null or v_to is null then
    raise exception 'pool_not_found' using errcode = 'P0002';
  end if;
  if v_from = v_to then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  perform 1 from public.recommendation_pools where id in (v_from, v_to) order by id for update;
  v_before := director.pool_snapshot(array[v_from, v_to]);
  if not ((v_before -> v_from::text -> (case when p_media = 'tv' then 'tv_ids' else 'movie_ids' end)) @> to_jsonb(p_tmdb_id)) then
    raise exception 'not_on_shelf' using errcode = 'P0002';
  end if;
  update public.recommendation_pools p
     set movie_ids = case when p_media <> 'movie' then p.movie_ids
                          when p.id = v_from then director.ids_without(p.movie_ids, p_tmdb_id)
                          else director.ids_with(p.movie_ids, p_tmdb_id) end,
         tv_ids = case when p_media <> 'tv' then p.tv_ids
                       when p.id = v_from then director.ids_without(p.tv_ids, p_tmdb_id)
                       else director.ids_with(p.tv_ids, p_tmdb_id) end
   where p.id in (v_from, v_to);
  v_audit := director.log('pool.move', 'recommendation_pools', p_media || ':' || p_tmdb_id,
    jsonb_build_object('rows', v_before),
    jsonb_build_object('rows', director.pool_snapshot(array[v_from, v_to]),
                       'from', p_from_card || '/' || p_from_mood, 'to', p_to_card || '/' || p_to_mood),
    p_reason, true);
  return jsonb_build_object('ok', true, 'changed', true, 'audit_id', v_audit);
end;
$$;

-- ---------------------------------------------------------------------------
-- Pôsteres da roleta
-- ---------------------------------------------------------------------------
-- Entra como rascunho (fora do sorteio), no lote do dia (meia-noite de Brasília:
-- os pôsteres postos no mesmo dia formam um lote na curadoria). O número sai do
-- gatilho de sempre (poster_items_assign_serial).
create or replace function public.director_poster_create(p_media text, p_tmdb_id int, p_rarity text, p_file_path text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := director.require(2);
  v_row public.poster_items;
  v_audit bigint;
begin
  perform director.rate('poster.create', 30, interval '1 hour');
  perform director.check_title(p_media, p_tmdb_id);
  if p_rarity is null or p_rarity not in ('common', 'rare', 'epic', 'legendary') then
    raise exception 'bad_rarity' using errcode = '22023';
  end if;
  if p_file_path is null or p_file_path !~ '^/[A-Za-z0-9_-]{5,64}\.(jpg|jpeg|png)$' then
    raise exception 'bad_image' using errcode = '22023';
  end if;
  if exists (select 1 from public.poster_items pi where pi.file_path = p_file_path) then
    raise exception 'duplicate_image' using errcode = '23505';
  end if;
  insert into public.poster_items (media_type, tmdb_id, rarity, file_path, is_active, created_at)
  values (p_media, p_tmdb_id, p_rarity, p_file_path, false,
          date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
  returning * into v_row;
  v_audit := director.log('poster.create', 'poster_items', v_row.id::text, null, to_jsonb(v_row), p_reason, true);
  return jsonb_build_object('ok', true, 'id', v_row.id, 'serial', v_row.serial, 'audit_id', v_audit);
end;
$$;

-- Pôr no sorteio ou tirar dele. Tirar um pôster que alguém já tem é nível 3.
create or replace function public.director_poster_set_active(p_id int, p_active boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := director.require(2);
  v_before public.poster_items;
  v_after public.poster_items;
  v_audit bigint;
begin
  perform director.rate('poster.active', 60, interval '1 hour');
  if p_id is null or p_active is null then
    raise exception 'bad_args' using errcode = '22023';
  end if;
  select * into v_before from public.poster_items where id = p_id for update;
  if not found then
    raise exception 'poster_not_found' using errcode = 'P0002';
  end if;
  if v_before.exclusive is not null then
    raise exception 'exclusive' using errcode = '42501';
  end if;
  if v_before.is_active = p_active then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  if not p_active and exists (select 1 from public.user_posters up where up.item_id = p_id) then
    perform director.require(3);
  end if;
  update public.poster_items set is_active = p_active where id = p_id returning * into v_after;
  v_audit := director.log(case when p_active then 'poster.activate' else 'poster.deactivate' end, 'poster_items', p_id::text,
    to_jsonb(v_before), to_jsonb(v_after), p_reason, true);
  return jsonb_build_object('ok', true, 'changed', true, 'audit_id', v_audit);
end;
$$;

-- ---------------------------------------------------------------------------
-- O diário e o desfazer
-- ---------------------------------------------------------------------------
-- Só o resumo (sem as listas inteiras das prateleiras), do mais novo ao mais velho.
create or replace function public.director_audit_list(p_before_id bigint default null, p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := director.require(1);
begin
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', l.id, 'at', l.at, 'action', l.action, 'kind', l.target_kind, 'target', l.target_id,
             'reason', l.reason, 'reversible', l.reversible, 'undone_at', l.undone_at, 'undone_by', l.undone_by,
             'meta', case when l.target_kind = 'recommendation_pools' then coalesce(l.after, '{}'::jsonb) - 'rows'
                          else coalesce(l.after, l.before) end)
           order by l.id desc), '[]'::jsonb)
      from (select * from director.audit_log a
             where a.actor = v_uid and (p_before_id is null or a.id < p_before_id)
             order by a.id desc
             limit least(greatest(coalesce(p_limit, 50), 1), 200)) l
  );
end;
$$;

create or replace function public.director_undo(p_audit_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := director.require(2);
  a director.audit_log;
  r record;
  v_poster public.poster_items;
  v_new bigint;
begin
  perform director.rate('undo', 60, interval '1 hour');
  select * into a from director.audit_log where id = p_audit_id and actor = v_uid for update;
  if not found or not a.reversible or a.undone_at is not null then
    raise exception 'not_undoable' using errcode = 'P0001';
  end if;

  if a.target_kind = 'recommendation_pools' then
    perform 1 from public.recommendation_pools
     where id in (select k::uuid from jsonb_object_keys(a.after -> 'rows') k) order by id for update;
    -- só desfaz se nada mudou depois (senão apagaria a mudança seguinte)
    for r in select key, value from jsonb_each(a.after -> 'rows') loop
      if not exists (select 1 from public.recommendation_pools rp
                      where rp.id = r.key::uuid
                        and rp.movie_ids = r.value -> 'movie_ids'
                        and coalesce(rp.tv_ids, '[]'::jsonb) = r.value -> 'tv_ids') then
        raise exception 'changed_since' using errcode = 'P0001';
      end if;
    end loop;
    if a.action in ('pool.add', 'pool.move') then
      -- desfazer um "pôr" tira títulos: mesma exigência de tirar
      perform director.require(3);
    end if;
    update public.recommendation_pools rp
       set movie_ids = b.value -> 'movie_ids', tv_ids = b.value -> 'tv_ids'
      from jsonb_each(a.before -> 'rows') b
     where rp.id = b.key::uuid;

  elsif a.target_kind = 'poster_items' then
    select * into v_poster from public.poster_items where id = a.target_id::int for update;
    if a.action = 'poster.create' then
      if not found then
        raise exception 'changed_since' using errcode = 'P0001';
      end if;
      begin
        delete from public.poster_items where id = v_poster.id;
      exception when foreign_key_violation then
        -- alguém já teve, apostou ou trocou: nunca se apaga; tire do sorteio
        raise exception 'in_use' using errcode = 'P0001';
      end;
    elsif a.action in ('poster.activate', 'poster.deactivate') then
      if not found or v_poster.is_active is distinct from (a.after ->> 'is_active')::boolean then
        raise exception 'changed_since' using errcode = 'P0001';
      end if;
      if a.action = 'poster.activate' and exists (select 1 from public.user_posters up where up.item_id = v_poster.id) then
        perform director.require(3);
      end if;
      update public.poster_items set is_active = (a.before ->> 'is_active')::boolean where id = v_poster.id;
    else
      raise exception 'not_undoable' using errcode = 'P0001';
    end if;

  else
    raise exception 'not_undoable' using errcode = 'P0001';
  end if;

  v_new := director.log('undo', a.target_kind, a.target_id, a.after, a.before, 'desfaz #' || a.id, false);
  update director.audit_log set undone_at = now(), undone_by = v_new where id = a.id;
  return jsonb_build_object('ok', true, 'audit_id', v_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- Quem pode chamar: só contas logadas (cada função confere o papel e o nível)
-- ---------------------------------------------------------------------------
revoke all on function public.director_title_info(text, int) from public, anon;
revoke all on function public.director_pool_add(text, text, text, int, text) from public, anon;
revoke all on function public.director_pool_remove(text, text, text, int, text) from public, anon;
revoke all on function public.director_pool_move(text, text, text, text, text, int, text) from public, anon;
revoke all on function public.director_poster_create(text, int, text, text, text) from public, anon;
revoke all on function public.director_poster_set_active(int, boolean, text) from public, anon;
revoke all on function public.director_audit_list(bigint, int) from public, anon;
revoke all on function public.director_undo(bigint) from public, anon;
grant execute on function public.director_title_info(text, int) to authenticated;
grant execute on function public.director_pool_add(text, text, text, int, text) to authenticated;
grant execute on function public.director_pool_remove(text, text, text, int, text) to authenticated;
grant execute on function public.director_pool_move(text, text, text, text, text, int, text) to authenticated;
grant execute on function public.director_poster_create(text, int, text, text, text) to authenticated;
grant execute on function public.director_poster_set_active(int, boolean, text) to authenticated;
grant execute on function public.director_audit_list(bigint, int) to authenticated;
grant execute on function public.director_undo(bigint) to authenticated;
