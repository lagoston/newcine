-- 17/11/2026 (pedido do Bruno, 21h40): "adicione móveis para a cobra dar no
-- poker - um rifle de parede (único objeto por enquanto a ficar fixo no spot
-- único na parede que sobrou), um toca discos onde futuramente o usuário
-- poderá escutar trilhas sonoras que vai ganhar em uma roleta especial
-- totalmente nova".
--
-- Os dois entram no catálogo secreto da Cobra (poker_items com cobra_pool),
-- junto com o Baralho e a Mesa Breaking Bad: em 20% dos torneios a Cobra
-- traz uma caixinha com um dos itens que a pessoa ainda não tem
-- (poker_cobra_eligible) e quem vence leva (poker_tournament_grant grava em
-- poker_owned_items). Nada muda no sorteio nem na concessão.
--   • poker_items ganha o tipo 'studio' (móvel do estúdio). As telas do pôquer
--     só mostram baralhos e mesas (filtram pelo tipo); a caixinha e os
--     créditos usam só o nome, então o app antigo segue funcionando.
--   • get_persona_world ganha `items`: os móveis do estúdio que a pessoa tem
--     vindos do pôquer (só acrescenta; o app antigo não lê).

alter table public.poker_items drop constraint if exists poker_items_kind_check;
alter table public.poker_items add constraint poker_items_kind_check
  check (kind = any (array['deck', 'table', 'rival', 'poker_quip', 'studio']));

insert into public.poker_items (id, kind, name_pt, name_en, is_default, sort, is_active, cobra_pool)
values
  ('studio-rifle', 'studio', 'Rifle de parede', 'Wall rifle', false, 40, true, true),
  ('studio-turntable', 'studio', 'Toca-discos', 'Record player', false, 41, true, true)
on conflict (id) do nothing;

-- get_persona_world: `items` entra logo antes de `pets`. Parte da definição
-- que está no banco, confere que o trecho existe uma vez só e troca.
do $do$
declare
  v_def text := pg_get_functiondef('public.get_persona_world(uuid)'::regprocedure);
  v_old text := $snip$    'pets', jsonb_build_object($snip$;
  v_new text := $snip$    -- 17/11/2026: os móveis do estúdio que a Cobra deu no pôquer (ids de poker_items)
    'items', (select coalesce(jsonb_agg(o.item_id order by o.acquired_at, o.item_id), '[]'::jsonb)
                from poker_owned_items o
                join poker_items i on i.id = o.item_id
               where o.user_id = p_user_id and i.kind = 'studio'),
    'pets', jsonb_build_object($snip$;
begin
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'get_persona_world: o trecho de pets não aparece uma vez só';
  end if;
  if position('''items''' in v_def) > 0 then
    raise exception 'get_persona_world: items já existe';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$do$;
