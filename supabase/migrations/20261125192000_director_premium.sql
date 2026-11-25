-- Conta Diretor: dar e tirar o Premium Vitalício (25/11/2026).
--
-- Pedido do Bruno: "Faça com que a conta diretor possa dar e remover o Premium
-- Vitalício para usuários."
--
-- Até aqui o vitalício só era dado pelo console do banco (grant_lifetime_premium,
-- que só o servidor pode chamar). As funções abaixo abrem isso para a conta
-- diretor, com as mesmas travas das outras ferramentas: o papel conferido no
-- banco, o código do app autenticador, o limite por hora e o Diário.
--
-- O que entra (só acrescenta):
--
--   * director_premium_people(busca): quem tem o vitalício hoje e, com um nome,
--     as contas que batem com ele. Só leitura (nível 1).
--   * director_premium_set(pessoa, ligar, motivo): dá ou tira. Nível 3 (o
--     código do app digitado nos últimos 15 minutos) nos dois sentidos: é a
--     ferramenta que dá o que as pessoas pagam para ter. Por dentro chama as
--     funções de sempre (grant_lifetime_premium / revoke_lifetime_premium), que
--     já acertam o plano: quem tem assinatura ativa continua Premium ao perder
--     o vitalício. Bots não recebem. Fica no Diário, com desfazer.
--   * director_undo aprende a desfazer as duas ações. Ao perder o Premium, as
--     peças Premium que a pessoa usava saem do perfil sozinhas (gatilho
--     reconcile_cosmetics_on_plan_change, que já existia); o desfazer de um
--     "tirar" devolve também essas peças, se a pessoa não as trocou depois.

-- ---------------------------------------------------------------------------
-- Uma pessoa, como a tela mostra
-- ---------------------------------------------------------------------------
create or replace function director.premium_person(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
           'id', p.id,
           'username', p.username,
           'avatar_url', nullif(p.avatar_url, ''),
           'lifetime', coalesce(p.lifetime_premium, false),
           -- Premium ativo hoje por qualquer caminho (vitalício ou assinatura)
           'premium', coalesce(public.is_premium_active(p.id), false),
           'bot', exists (select 1 from public.bot_accounts b where b.user_id = p.id))
    from public.profiles p
   where p.id = p_id;
$function$;

revoke all on function director.premium_person(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Quem tem o vitalício e a busca por nome
-- ---------------------------------------------------------------------------
create or replace function public.director_premium_people(p_query text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := director.require(1);
  -- o @ da frente é só jeito de escrever; %, _ e \ valem como letra na busca
  v_q text := nullif(btrim(ltrim(btrim(coalesce(p_query, '')), '@')), '');
  v_like text;
  v_holders jsonb;
  v_hits jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(director.premium_person(p.id) order by lower(p.username)), '[]'::jsonb)
    into v_holders
    from profiles p
   where p.lifetime_premium;

  if v_q is not null and length(v_q) >= 2 then
    v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
    select coalesce(jsonb_agg(director.premium_person(h.id) order by h.pos, lower(h.username)), '[]'::jsonb)
      into v_hits
      from (select p.id, p.username,
                   case when lower(p.username) = lower(v_q) then 0
                        when p.username ilike v_like || '%' then 1
                        else 2 end as pos
              from profiles p
             where p.username ilike '%' || v_like || '%'
             order by 3, lower(p.username)
             limit 12) h;
  end if;

  return jsonb_build_object('holders', v_holders, 'hits', v_hits);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Dar e tirar
-- ---------------------------------------------------------------------------
create or replace function public.director_premium_set(p_user uuid, p_on boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := director.require(3);
  v_before public.profiles;
  v_after public.profiles;
  v_res json;
  v_audit bigint;
begin
  perform director.rate(case when p_on then 'premium.grant' else 'premium.revoke' end, 30, interval '1 hour');
  if p_user is null or p_on is null then
    raise exception 'bad_args' using errcode = '22023';
  end if;
  select * into v_before from profiles where id = p_user for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  -- bots não recebem nada (tirar de um bot que já tem, pode)
  if p_on and exists (select 1 from bot_accounts b where b.user_id = p_user) then
    raise exception 'is_bot' using errcode = '42501';
  end if;
  if coalesce(v_before.lifetime_premium, false) = p_on then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  if p_on then
    v_res := grant_lifetime_premium(p_user);
  else
    v_res := revoke_lifetime_premium(p_user);
  end if;
  if coalesce((v_res ->> 'success')::boolean, false) is not true then
    raise exception 'premium_failed' using errcode = 'P0001';
  end if;

  select * into v_after from profiles where id = p_user;
  -- o antes e o depois guardam o plano e as peças do perfil: ao tirar, o gatilho
  -- do plano devolve ao padrão as peças Premium em uso, e o desfazer as repõe
  v_audit := director.log(
    case when p_on then 'premium.grant' else 'premium.revoke' end, 'premium', p_user::text,
    jsonb_build_object('user_id', p_user, 'username', v_before.username,
                       'lifetime_premium', coalesce(v_before.lifetime_premium, false), 'plan_type', v_before.plan_type,
                       'avatar_frame', v_before.avatar_frame, 'banner', v_before.banner,
                       'card_style', v_before.card_style, 'text_effect', v_before.text_effect),
    jsonb_build_object('user_id', p_user, 'username', v_after.username,
                       'lifetime_premium', coalesce(v_after.lifetime_premium, false), 'plan_type', v_after.plan_type,
                       'avatar_frame', v_after.avatar_frame, 'banner', v_after.banner,
                       'card_style', v_after.card_style, 'text_effect', v_after.text_effect),
    p_reason, true);
  return jsonb_build_object('ok', true, 'changed', true, 'audit_id', v_audit,
                            'premium', coalesce(is_premium_active(p_user), false));
end;
$function$;

-- As peças do perfil de antes de "tirar" voltam no desfazer: cada uma só se a
-- pessoa continua com o que o gatilho deixou (não escolheu outra depois) e se
-- ela pode usar a peça de novo.
create or replace function director.premium_restore_look(p_user uuid, p_before jsonb, p_after jsonb)
returns void
language sql
security definer
set search_path to ''
as $function$
  update public.profiles p set
    avatar_frame = case when p.avatar_frame is not distinct from (p_after ->> 'avatar_frame')
                         and (p_before ->> 'avatar_frame') is not null
                         and public.is_cosmetic_unlocked(p.id, 'frame', p_before ->> 'avatar_frame')
                        then p_before ->> 'avatar_frame' else p.avatar_frame end,
    banner = case when p.banner is not distinct from (p_after ->> 'banner')
                   and (p_before ->> 'banner') is not null
                   and public.is_cosmetic_unlocked(p.id, 'banner', p_before ->> 'banner')
                  then p_before ->> 'banner' else p.banner end,
    card_style = case when p.card_style is not distinct from (p_after ->> 'card_style')
                       and (p_before ->> 'card_style') is not null
                       and public.is_cosmetic_unlocked(p.id, 'card', p_before ->> 'card_style')
                      then p_before ->> 'card_style' else p.card_style end,
    text_effect = case when p.text_effect is not distinct from (p_after ->> 'text_effect')
                        and (p_before ->> 'text_effect') is not null
                        and public.is_cosmetic_unlocked(p.id, 'text_effect', p_before ->> 'text_effect')
                       then p_before ->> 'text_effect' else p.text_effect end
  where p.id = p_user;
$function$;

revoke all on function director.premium_restore_look(uuid, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- O desfazer aprende as duas ações novas
-- ---------------------------------------------------------------------------
-- A definição parte da que está no banco: o ramo novo entra antes do "isto não
-- se desfaz" final, que precisa aparecer exatamente uma vez.
do $mig$
declare
  v_old text := $old$
  else
    raise exception 'not_undoable' using errcode = 'P0001';
  end if;

  v_new := director.log('undo',$old$;
  v_new text := $new$
  elsif a.target_kind = 'premium' then
    -- 25/11/2026: dar e tirar o Premium Vitalício. Só desfaz se a pessoa
    -- continua como a ação deixou; pede o código recente nos dois sentidos.
    perform director.require(3);
    perform 1 from public.profiles p
      where p.id = a.target_id::uuid
        and coalesce(p.lifetime_premium, false) = (a.after ->> 'lifetime_premium')::boolean
      for update;
    if not found then
      raise exception 'changed_since' using errcode = 'P0001';
    end if;
    if (a.before ->> 'lifetime_premium')::boolean then
      perform public.grant_lifetime_premium(a.target_id::uuid);
      perform director.premium_restore_look(a.target_id::uuid, a.before, a.after);
    else
      perform public.revoke_lifetime_premium(a.target_id::uuid);
    end if;

  else
    raise exception 'not_undoable' using errcode = 'P0001';
  end if;

  v_new := director.log('undo',$new$;
  v_def text;
  v_before text;
  v_after text;
begin
  v_def := pg_get_functiondef('public.director_undo(bigint)'::regprocedure);
  select prosrc into v_before from pg_proc where oid = 'public.director_undo(bigint)'::regprocedure;
  if (length(v_before) - length(replace(v_before, v_old, ''))) <> length(v_old) then
    raise exception 'director_undo: o fim dos ramos não aparece exatamente uma vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select prosrc into v_after from pg_proc where oid = 'public.director_undo(bigint)'::regprocedure;
  if v_after is distinct from replace(v_before, v_old, v_new) then
    raise exception 'director_undo: o resultado não é a definição antiga com só o ramo novo';
  end if;
end
$mig$;

revoke all on function public.director_premium_people(text) from public, anon;
revoke all on function public.director_premium_set(uuid, boolean, text) from public, anon;
grant execute on function public.director_premium_people(text) to authenticated;
grant execute on function public.director_premium_set(uuid, boolean, text) to authenticated;
