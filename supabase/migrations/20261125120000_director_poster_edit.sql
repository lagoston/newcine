-- Conta Diretor: apagar rascunho, editar pôster e ver as capas do título (25/11/2026).
--
-- Pedido do Bruno: "Na parte de criação de pôsteres do modo diretor não é possível
-- apagar um rascunho de um pôster criado, corrija. Adicione também quando uma obra
-- for selecionada quais são os pôsteres já em uso em português e em inglês, para
-- que a seleção seja de um pôster realmente novo. Faça com que seja possível
-- alterar raridade e inclusive a imagem de pôsteres já em uso na roleta, alterando
-- para os usuários que o possuem."
--
-- O que entra (só acrescenta; nada muda de formato para quem já chama):
--
--   * director_poster_delete: apaga um pôster que está FORA do sorteio e que
--     ninguém nunca teve, girou, trocou ou apostou (as chaves estrangeiras
--     recusam o resto: aí o caminho continua sendo deixar fora do sorteio).
--     Nível 2, como criar. Até aqui o único jeito era "Desfazer" a criação no
--     Diário, e a tela dos pôsteres não tinha botão nenhum.
--   * director_poster_update: troca a raridade e/ou a arte de um pôster da
--     roleta. A coleção de cada pessoa aponta para o pôster pelo id
--     (user_posters.item_id), então a mudança vale na hora para quem o tem: na
--     coleção, no pôster equipado, nas trocas. O histórico não é reescrito
--     (jackpot_pulls.rarity e jackpot_contracts guardam a raridade do dia do
--     giro, e é por eles que as tags de Jogos contam). Trocar a raridade dá um
--     número novo ao pôster na raridade nova (o gatilho poster_items_serial).
--     Nível 2 se ninguém tem o pôster; nível 3 (código nos últimos 15 minutos)
--     se alguém tem ou já teve, como tirar do sorteio. Exclusivos do Pôster
--     Poker continuam de fora.
--   * director_undo: aprende a desfazer as duas ações novas. A edição volta à
--     raridade e à arte de antes (e ao número de antes, se ainda estiver
--     livre); o pôster apagado volta como rascunho, com o mesmo id.
--   * director_title_info: devolve também as capas que o site já mostra para o
--     título (covers.pt e covers.en, de movie_cache) e quantas pessoas têm cada
--     pôster dele (owners), para a tela marcar o que já está em uso.
--
-- As três funções que já existiam partem da definição que estava no banco.

-- ---------------------------------------------------------------------------
-- Onde o título está: + as capas do site e os donos de cada pôster
-- ---------------------------------------------------------------------------
create or replace function public.director_title_info(p_media text, p_tmdb_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
    -- 25/11/2026: as capas que o site já mostra para o título (pt = a brasileira,
    -- quando existe; en = a original). Um pôster da roleta igual à capa não muda
    -- nada para quem o equipa.
    'covers', (select jsonb_build_object('pt', mc.poster_path_pt, 'en', mc.poster_path)
                 from public.movie_cache mc where mc.tmdb_id = p_tmdb_id and mc.media_type = p_media),
    'posters', (select coalesce(jsonb_agg(jsonb_build_object('id', pi.id, 'rarity', pi.rarity, 'serial', pi.serial, 'file_path', pi.file_path,
                                                             'is_active', pi.is_active, 'exclusive', pi.exclusive,
                                                             -- 25/11/2026: quem a edição atinge (a mesma conta da curadoria)
                                                             'owners', (select count(distinct up.user_id) from public.user_posters up
                                                                         where up.item_id = pi.id and up.reset_at is null
                                                                           and not public.is_hidden_account(up.user_id))) order by pi.id), '[]'::jsonb)
                  from public.poster_items pi where pi.tmdb_id = p_tmdb_id and pi.media_type = p_media)
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Apagar um rascunho
-- ---------------------------------------------------------------------------
create or replace function public.director_poster_delete(p_id integer, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := director.require(2);
  v_row public.poster_items;
  v_audit bigint;
begin
  perform director.rate('poster.delete', 30, interval '1 hour');
  if p_id is null then
    raise exception 'bad_args' using errcode = '22023';
  end if;
  select * into v_row from public.poster_items where id = p_id for update;
  if not found then
    raise exception 'poster_not_found' using errcode = 'P0002';
  end if;
  if v_row.exclusive is not null then
    raise exception 'exclusive' using errcode = '42501';
  end if;
  -- só o que está fora do sorteio: um pôster no ar sai primeiro do sorteio
  if v_row.is_active then
    raise exception 'in_draw' using errcode = 'P0001';
  end if;
  begin
    delete from public.poster_items where id = p_id;
  exception when foreign_key_violation then
    -- alguém já teve, girou, trocou ou apostou: nunca se apaga; fica fora do sorteio
    raise exception 'in_use' using errcode = 'P0001';
  end;
  v_audit := director.log('poster.delete', 'poster_items', p_id::text, to_jsonb(v_row), null, p_reason, true);
  return jsonb_build_object('ok', true, 'audit_id', v_audit);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Editar a raridade e/ou a arte
-- ---------------------------------------------------------------------------
create or replace function public.director_poster_update(p_id integer, p_rarity text default null, p_file_path text default null, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := director.require(2);
  v_before public.poster_items;
  v_after public.poster_items;
  v_audit bigint;
begin
  perform director.rate('poster.update', 60, interval '1 hour');
  if p_id is null or (p_rarity is null and p_file_path is null) then
    raise exception 'bad_args' using errcode = '22023';
  end if;
  if p_rarity is not null and p_rarity not in ('common', 'rare', 'epic', 'legendary') then
    raise exception 'bad_rarity' using errcode = '22023';
  end if;
  if p_file_path is not null and p_file_path !~ '^/[A-Za-z0-9_-]{5,64}\.(jpg|jpeg|png)$' then
    raise exception 'bad_image' using errcode = '22023';
  end if;
  select * into v_before from public.poster_items where id = p_id for update;
  if not found then
    raise exception 'poster_not_found' using errcode = 'P0002';
  end if;
  if v_before.exclusive is not null then
    raise exception 'exclusive' using errcode = '42501';
  end if;
  if coalesce(p_rarity, v_before.rarity) = v_before.rarity and coalesce(p_file_path, v_before.file_path) = v_before.file_path then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  if p_file_path is not null and p_file_path <> v_before.file_path
     and exists (select 1 from public.poster_items pi where pi.file_path = p_file_path and pi.id <> p_id) then
    raise exception 'duplicate_image' using errcode = '23505';
  end if;
  -- alguém tem (ou já teve) este pôster: a mudança aparece na coleção dessas
  -- pessoas na hora; pede o código recente, como tirar do sorteio
  if exists (select 1 from public.user_posters up where up.item_id = p_id) then
    perform director.require(3);
  end if;
  update public.poster_items
     set rarity = coalesce(p_rarity, rarity), file_path = coalesce(p_file_path, file_path)
   where id = p_id
  returning * into v_after;
  v_audit := director.log('poster.update', 'poster_items', p_id::text, to_jsonb(v_before), to_jsonb(v_after), p_reason, true);
  return jsonb_build_object('ok', true, 'changed', true, 'serial', v_after.serial, 'audit_id', v_audit);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Desfazer: + a edição e o apagar
-- ---------------------------------------------------------------------------
create or replace function public.director_undo(p_audit_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    elsif a.action = 'poster.update' then
      -- 25/11/2026: a edição volta à raridade e à arte de antes
      if not found
         or v_poster.rarity is distinct from (a.after ->> 'rarity')
         or v_poster.file_path is distinct from (a.after ->> 'file_path') then
        raise exception 'changed_since' using errcode = 'P0001';
      end if;
      if exists (select 1 from public.user_posters up where up.item_id = v_poster.id) then
        perform director.require(3);
      end if;
      -- a arte de antes pode ter ido para outro pôster nesse meio-tempo
      if (a.before ->> 'file_path') <> v_poster.file_path
         and exists (select 1 from public.poster_items pi where pi.file_path = a.before ->> 'file_path' and pi.id <> v_poster.id) then
        raise exception 'duplicate_image' using errcode = '23505';
      end if;
      update public.poster_items
         set rarity = a.before ->> 'rarity', file_path = a.before ->> 'file_path'
       where id = v_poster.id;
      -- ao trocar a raridade o gatilho dá um número novo; o de antes volta se
      -- ainda estiver livre
      if (a.before ->> 'rarity') is distinct from (a.after ->> 'rarity')
         and (a.before ->> 'serial') is not null
         and not exists (select 1 from public.poster_items pi
                          where pi.rarity = a.before ->> 'rarity' and pi.serial = (a.before ->> 'serial')::int and pi.id <> v_poster.id) then
        update public.poster_items set serial = (a.before ->> 'serial')::int where id = v_poster.id;
      end if;
    elsif a.action = 'poster.delete' then
      -- 25/11/2026: o pôster apagado volta como era (rascunho), com o mesmo id
      -- e, se ainda estiver livre, o mesmo número
      if found then
        raise exception 'changed_since' using errcode = 'P0001';
      end if;
      if exists (select 1 from public.poster_items pi where pi.file_path = a.before ->> 'file_path') then
        raise exception 'duplicate_image' using errcode = '23505';
      end if;
      insert into public.poster_items (id, media_type, tmdb_id, rarity, file_path, is_active, created_at, serial, exclusive)
      select b.id, b.media_type, b.tmdb_id, b.rarity, b.file_path, false, b.created_at,
             case when exists (select 1 from public.poster_items pi where pi.rarity = b.rarity and pi.serial = b.serial) then null else b.serial end,
             b.exclusive
        from jsonb_populate_record(null::public.poster_items, a.before) b;
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
$function$;

revoke all on function public.director_poster_delete(int, text) from public, anon;
revoke all on function public.director_poster_update(int, text, text, text) from public, anon;
grant execute on function public.director_poster_delete(int, text) to authenticated;
grant execute on function public.director_poster_update(int, text, text, text) to authenticated;
