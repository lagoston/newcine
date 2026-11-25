-- Poster Jackpot: chances novas, óvnis por tamanho da coleção e número vago (25/11/2026).
--
-- Pedido do Bruno: "Diminua a chance de épico de 13% para 9%, e esses 4% extras
-- vão para o raro que agora terá 32%. A partir de 70 pôsteres na coleção a chance
-- de ovni diminui pela metade, e depois de 150 os ovnis não aparecem mais para o
-- usuário. Quando algum pôster for removido pela conta diretor, o número vago deve
-- ser do próximo pôster adicionado na raridade (atualmente temos o 017 vago no
-- épico)."
--
-- Três mudanças, nenhuma muda o formato do que o site ou o APK antigo recebem:
--
--   1. Giro com ficha: comum 56%, raro 32%, épico 9%, lendário 3% (antes
--      56/28/13/3). O Giro da Sorte não muda (raro 20%, épico 50%, lendário 30%).
--   2. Ficha voadora (o "óvni"): a chance do dia passa a depender de quantos
--      pôsteres a pessoa tem na coleção, o mesmo número que a roleta mostra
--      (os exclusivos do Pôster Poker não contam): 45% até 69 pôsteres, metade
--      (22,5%) de 70 a 149 e zero com 150 ou mais. Os três números ficam em
--      poster_jackpot_settings, para mudar sem migração.
--   3. Número de colecionador: um pôster novo (ou que muda de raridade) ganha o
--      MENOR número livre da raridade. Antes era sempre o maior + 1, e o número
--      de um pôster apagado ou que mudou de raridade ficava vago para sempre.

-- ---------------------------------------------------------------------------
-- 1. As chances do giro com ficha
-- ---------------------------------------------------------------------------
-- O jackpot_pull do banco tem partes que não moram neste repositório, então esta
-- migração NÃO recria a função a partir de um arquivo (mesmo padrão de
-- 20261116220000_jackpot_odds.sql): lê a definição atual do banco, troca só o
-- trecho das chances (que precisa aparecer exatamente uma vez) e confere que o
-- resultado é a definição antiga com esse único trecho trocado. Se o trecho
-- tiver mudado, ela para com erro e nada muda.
do $mig$
declare
  v_old text := $old$    -- 16/11/2026 (pedido do Bruno): comum 56%, raro 28%, épico 13%, lendário 3%
    v_rarity := case when r < 0.03 then 'legendary' when r < 0.16 then 'epic' when r < 0.44 then 'rare' else 'common' end;$old$;
  v_new text := $new$    -- 25/11/2026 (pedido do Bruno): comum 56%, raro 32%, épico 9%, lendário 3%
    -- (antes raro 28% e épico 13%: os 4 pontos do épico foram para o raro)
    v_rarity := case when r < 0.03 then 'legendary' when r < 0.12 then 'epic' when r < 0.44 then 'rare' else 'common' end;$new$;
  v_def text;
  v_before text;
  v_after text;
begin
  v_def := pg_get_functiondef('public.jackpot_pull(text)'::regprocedure);
  select prosrc into v_before from pg_proc where oid = 'public.jackpot_pull(text)'::regprocedure;
  if (length(v_before) - length(replace(v_before, v_old, ''))) <> length(v_old) then
    raise exception 'jackpot_pull: o trecho das chances não aparece exatamente uma vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select prosrc into v_after from pg_proc where oid = 'public.jackpot_pull(text)'::regprocedure;
  if v_after is distinct from replace(v_before, v_old, v_new) then
    raise exception 'jackpot_pull: o resultado não é a definição antiga com só as chances trocadas';
  end if;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 2. A ficha voadora: a chance do dia pelo tamanho da coleção
-- ---------------------------------------------------------------------------
alter table public.poster_jackpot_settings
  add column if not exists ufo_chance numeric not null default 0.45,
  add column if not exists ufo_half_at integer not null default 70,
  add column if not exists ufo_stop_at integer not null default 150;

comment on column public.poster_jackpot_settings.ufo_chance is
  'Ficha voadora: chance de o dia ter ficha (0 a 1) para quem tem menos de ufo_half_at pôsteres.';
comment on column public.poster_jackpot_settings.ufo_half_at is
  'Ficha voadora: a partir de quantos pôsteres na coleção a chance cai pela metade.';
comment on column public.poster_jackpot_settings.ufo_stop_at is
  'Ficha voadora: a partir de quantos pôsteres na coleção a ficha não aparece mais.';

-- A chance de hoje para uma pessoa. "Pôsteres na coleção" é a mesma conta de
-- get_jackpot_state().owned: o que ela tem agora, sem os exclusivos do pôquer.
create or replace function public.jackpot_ufo_chance(p_uid uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
           when o.n >= s.ufo_stop_at then 0
           when o.n >= s.ufo_half_at then s.ufo_chance / 2
           else s.ufo_chance
         end
    from poster_jackpot_settings s,
         lateral (select count(*) as n
                    from user_posters up
                    join poster_items pi on pi.id = up.item_id
                   where up.user_id = p_uid and up.reset_at is null and pi.exclusive is null) o
   limit 1;
$function$;

revoke all on function public.jackpot_ufo_chance(uuid) from public, anon, authenticated;

-- jackpot_ufo_status joga o dado na primeira consulta do dia. Só a linha do dado
-- muda (a definição parte da que está no banco). O dia que já foi sorteado não
-- é refeito: quem cruzar os 70 ou os 150 hoje sente a diferença amanhã.
do $mig$
declare
  v_old text := $old$    v_fly := random() < 0.45;$old$;
  v_new text := $new$    -- 25/11/2026 (pedido do Bruno): a chance cai com a coleção (jackpot_ufo_chance):
    -- 45% até 69 pôsteres, metade de 70 a 149, zero com 150 ou mais.
    v_fly := random() < coalesce(jackpot_ufo_chance(v_uid), 0.45);$new$;
  v_def text;
  v_before text;
  v_after text;
begin
  v_def := pg_get_functiondef('public.jackpot_ufo_status()'::regprocedure);
  select prosrc into v_before from pg_proc where oid = 'public.jackpot_ufo_status()'::regprocedure;
  if (length(v_before) - length(replace(v_before, v_old, ''))) <> length(v_old) then
    raise exception 'jackpot_ufo_status: a linha do dado não aparece exatamente uma vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select prosrc into v_after from pg_proc where oid = 'public.jackpot_ufo_status()'::regprocedure;
  if v_after is distinct from replace(v_before, v_old, v_new) then
    raise exception 'jackpot_ufo_status: o resultado não é a definição antiga com só o dado trocado';
  end if;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 3. O número de colecionador: o menor número livre da raridade
-- ---------------------------------------------------------------------------
-- A definição parte da que estava no banco. O que não muda: quem insere já com
-- número (os exclusivos do pôquer, o "desfazer" do Diário) fica com ele; o
-- número só é dado ao criar ou ao mudar de raridade; a trava por raridade.
-- O que muda: em vez de "o maior + 1", o primeiro número que ninguém usa. Os
-- números dos exclusivos do pôquer estão ocupados e continuam sendo pulados.
create or replace function public.poster_items_assign_serial()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_n int;
begin
  if tg_op = 'INSERT' and new.serial is not null then
    return new;
  end if;
  if tg_op = 'INSERT' or new.rarity is distinct from old.rarity then
    perform pg_advisory_xact_lock(hashtext('poster_serial:' || new.rarity));
    -- 25/11/2026 (pedido do Bruno): o número que ficou vago (um rascunho
    -- apagado, um pôster que mudou de raridade) vai para o próximo pôster da
    -- raridade. Só quando não há vago o número é o seguinte ao maior.
    v_n := 1;
    while exists (select 1 from poster_items where rarity = new.rarity and serial = v_n and id is distinct from new.id) loop
      v_n := v_n + 1;
    end loop;
    new.serial := v_n;
  end if;
  return new;
end;
$function$;
