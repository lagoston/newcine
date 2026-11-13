-- 13/11/2026 — O presente da sexta-feira 13 só para quem está USANDO a Scary Clown.
--
-- Pedido do Bruno (13/11, 11h48, na própria sexta-feira 13): "O site concedeu
-- créditos para usuários que não estão utilizando a tag 'scary clown'.
-- Corrija."
--
-- Como era (20261102020000_trades_expiry_friday13): ganhava as 3 fichas
-- especiais quem TINHA a tag (user_special_tags, qualquer edição). A regra
-- certa é a das salas secretas: ter a tag E estar com ela no perfil agora
-- (profiles.active_tag = "Scary Clown", "Scary Clown II"…), o mesmo teste de
-- secret_room_tag_in_use.
--
-- Três partes:
--   1. jackpot_scary_clown_in_use(uid): o teste.
--   2. jackpot_grant_friday13_on: só quem está usando. Quem não estava à 00:05
--      e põe a tag no perfil durante a sexta-feira 13 ganha ao abrir o Jackpot
--      (get_jackpot_state já chama jackpot_grant_friday13 para a pessoa) — e
--      quem teve o presente retirado (parte 3) também, se puser a tag.
--   3. A correção de hoje (13/11/2026): de quem ganhou sem estar usando a tag
--      agora, as 3 fichas voltam — só o que ainda está no porta-fichas, nunca
--      saldo negativo (quem já girou com elas fica com o que saiu). O
--      presente fica marcado como retirado (revoked_at, revoked_amount) e como
--      visto (o aviso "Sua Scary Clown deixou 3 fichas" não aparece mais).
--      Nada é apagado: as linhas ficam, com a marca.
--      Limite: o banco não guarda quem estava com a tag à 00:05; vale quem
--      está com ela no momento em que este arquivo roda.
--
-- get_jackpot_state não muda: friday13_perk continua sendo "tem a tag" (a
-- gaveta lembra a próxima sexta-feira 13), e o texto do site passou a dizer
-- "usando a Scary Clown no perfil".

-- ---------------------------------------------------------------------------
-- 1. O teste
-- ---------------------------------------------------------------------------

create or replace function public.jackpot_scary_clown_in_use(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from profiles p
            where p.id = p_uid
              and coalesce(p.active_tag ->> 'name', '') ~ '^Scary Clown( [IVXLCDM]+)?$')
     and exists (
           select 1 from user_special_tags t
            where t.user_id = p_uid
              and (t.tag_id = 'scary-clown' or t.tag_id ~ '^scary-clown-[0-9]+$'));
$$;

revoke all on function public.jackpot_scary_clown_in_use(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. O presente: só quem está usando a tag
-- ---------------------------------------------------------------------------

alter table public.jackpot_gifts
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_amount integer;

create or replace function public.jackpot_grant_friday13_on(p_day date, p_uid uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_day is null or not jackpot_is_friday13(p_day) then
    return 0;
  end if;

  with holders as (
    select p.id as user_id
      from profiles p
     where (p_uid is null or p.id = p_uid)
       -- 13/11/2026: a tag no perfil agora (não basta ter)
       and coalesce(p.active_tag ->> 'name', '') ~ '^Scary Clown( [IVXLCDM]+)?$'
       and exists (select 1 from user_special_tags t
                    where t.user_id = p.id
                      and (t.tag_id = 'scary-clown' or t.tag_id ~ '^scary-clown-[0-9]+$'))
       and not exists (select 1 from bot_accounts b where b.user_id = p.id)
       and jackpot_enabled(p.id)
  ), fresh as (
    insert into jackpot_gifts (user_id, kind, day, amount)
    select h.user_id, 'friday13', p_day, 3 from holders h
    -- Um presente por pessoa por dia; o retirado (13/11) volta se a pessoa
    -- puser a tag no perfil no mesmo dia.
    on conflict (user_id, kind, day) do update
       set amount = excluded.amount,
           created_at = now(),
           seen_at = null,
           revoked_at = null,
           revoked_amount = null
     where jackpot_gifts.revoked_at is not null
    returning user_id, amount
  ), credited as (
    insert into jackpot_wallets (user_id, special_tickets)
    select f.user_id, f.amount from fresh f
    on conflict (user_id) do update
      set special_tickets = jackpot_wallets.special_tickets + excluded.special_tickets,
          updated_at = now()
    returning user_id
  )
  select count(*) into v_count from credited;

  return v_count;
end;
$$;

revoke all on function public.jackpot_grant_friday13_on(date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. A correção da sexta-feira 13 de novembro de 2026
-- ---------------------------------------------------------------------------

with wrong as (
  select g.user_id, g.day,
         least(coalesce(w.special_tickets, 0), g.amount) as take
    from jackpot_gifts g
    left join jackpot_wallets w on w.user_id = g.user_id
   where g.kind = 'friday13'
     and g.day = date '2026-11-13'
     and g.revoked_at is null
     and not jackpot_scary_clown_in_use(g.user_id)
), taken as (
  update jackpot_wallets w
     set special_tickets = w.special_tickets - wr.take,
         updated_at = now()
    from wrong wr
   where w.user_id = wr.user_id
     and wr.take > 0
  returning w.user_id
)
update jackpot_gifts g
   set revoked_at = now(),
       revoked_amount = wr.take,
       seen_at = coalesce(g.seen_at, now())
  from wrong wr
 where g.user_id = wr.user_id
   and g.kind = 'friday13'
   and g.day = wr.day;
