-- 03/11/2026 — Revisão de segurança da fase 2 (achados 2 e 3).
--
-- 2. jackpot_reset_user (zerar a coleção do Jackpot, só o dono roda) também zerava os
--    pôsteres gold do Pôster Poker. Eles não são do Jackpot: o reset passa a deixá-los (e
--    os equipados deles) como estão. Antes, quem tinha vencido a semana ficava sem o pôster
--    e sem poder ganhá-lo de novo (a concessão continuava registrada).
-- 3. profiles.active_tag é gravável pelo próprio dono (RLS) e não era conferido: dava para
--    "usar" uma tag da categoria Jogos sem tê-la. Agora, para a categoria 'games', o banco
--    exige que a pessoa tenha a tag (user_special_tags + special_tags com o mesmo nome).
--    As outras categorias ficam como estavam (as básicas e de tema são calculadas no app).

create or replace function public.jackpot_reset_user(p_uid uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_posters integer;
begin
  update user_posters set reset_at = now(), left_via = 'reset'
   where user_id = p_uid and reset_at is null
     and item_id not in (select id from poster_items where exclusive is not null);
  get diagnostics v_posters = row_count;
  update jackpot_pulls set voided = true where user_id = p_uid and not voided;
  update user_poster_equips set active = false
   where user_id = p_uid and active
     and item_id not in (select id from poster_items where exclusive is not null);
  update poster_trades set status = 'void', responded_at = now() where status = 'pending' and (from_user = p_uid or to_user = p_uid);
  update jackpot_wallets set lucky_progress = 0, lucky_spins = 0, updated_at = now() where user_id = p_uid;
  return jsonb_build_object('posters_reset', v_posters);
end;
$function$;

create or replace function public.guard_games_active_tag()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.active_tag is null or coalesce(new.active_tag ->> 'category', '') <> 'games' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.active_tag is not distinct from old.active_tag then
    return new;
  end if;
  if not exists (
    select 1
      from user_special_tags ust
      join special_tags st on st.id = ust.tag_id
     where ust.user_id = new.id
       and st.category = 'games'
       and st.name = new.active_tag ->> 'name'
  ) then
    raise exception 'tag_not_owned' using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_games_active_tag() from public, anon, authenticated;

create trigger guard_games_active_tag
  before insert or update of active_tag on public.profiles
  for each row execute function public.guard_games_active_tag();
