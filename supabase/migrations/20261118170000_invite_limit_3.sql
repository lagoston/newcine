-- 18/11/2026 (pedido do Bruno, 12h58): "o convite de amigos que dá 3 fichas
-- especiais deve ser limitado a 3 convites possíveis por usuário."
--
-- Antes: quem convidava ganhava por até 10 amigos a cada 30 dias (e o amigo
-- ganhava sempre). Agora cada pessoa tem 3 convites, para sempre: depois de 3
-- amigos que entraram e renderam as fichas, o código dela deixa de valer —
-- nem ela nem o amigo novo ganham, e a tela de cadastro não promete mais as
-- fichas para esse código (get_invite_preview devolve nulo, como um código
-- que não existe).
--   • jackpot_apply_invite: devolve 'limit' no 4º convite. Uma trava por quem
--     convida faz dois cadastros simultâneos passarem um de cada vez.
--   • get_my_invite: ganha `limit` (3) e `left` (quantos convites sobram); o
--     app antigo não lê esses campos.
-- As definições são as do banco, com trechos conferidos (uma vez cada).

create function pg_temp.swap_once(p_def text, p_old text, p_new text, p_label text)
returns text
language plpgsql
as $f$
begin
  if (length(p_def) - length(replace(p_def, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: o trecho não aparece uma vez só', p_label;
  end if;
  return replace(p_def, p_old, p_new);
end;
$f$;

do $do$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.jackpot_apply_invite(uuid,text)'::regprocedure);
  v_def := pg_temp.swap_once(v_def,
$s$  v_rewarded := (select count(*) from invite_redemptions
                  where inviter_id = v_inviter and inviter_rewarded and created_at > now() - interval '30 days') < 10;
$s$,
$s$  -- 18/11/2026: 3 convites por pessoa, para sempre (antes: 10 a cada 30 dias)
  perform pg_advisory_xact_lock(hashtext('invite:' || v_inviter::text));
  if (select count(*) from invite_redemptions where inviter_id = v_inviter and inviter_rewarded) >= 3 then
    return 'limit';
  end if;
  v_rewarded := true;
$s$, 'jackpot_apply_invite');
  execute v_def;

  v_def := pg_get_functiondef('public.get_my_invite()'::regprocedure);
  v_def := pg_temp.swap_once(v_def,
$s$    'reward', 3,
$s$,
$s$    'reward', 3,
    -- 18/11/2026: 3 convites por pessoa
    'limit', 3,
    'left', greatest(0, 3 - (select count(*) from invite_redemptions where inviter_id = v_uid and inviter_rewarded)),
$s$, 'get_my_invite');
  execute v_def;

  v_def := pg_get_functiondef('public.get_invite_preview(text)'::regprocedure);
  v_def := pg_temp.swap_once(v_def,
$s$                       and not public.is_hidden_account(ic.user_id);$s$,
$s$                       and (select count(*) from invite_redemptions r where r.inviter_id = ic.user_id and r.inviter_rewarded) < 3  -- 18/11/2026: os 3 convites acabaram = código sem efeito
                       and not public.is_hidden_account(ic.user_id);$s$, 'get_invite_preview');
  execute v_def;
end;
$do$;
