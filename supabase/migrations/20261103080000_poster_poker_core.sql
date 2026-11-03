-- 03/11/2026 (tarde) — Pôster Poker, pacote F: o núcleo do torneio da semana.
--
-- Pedido do Bruno: os prêmios do pôquer viram pôsteres exclusivos (fora da
-- roleta), um por semana, sempre com o efeito "gold" e intrável; entrada com
-- fichas ou com um pôster da coleção apostado.
--
--   - poster_items.exclusive ('poker'): os 9 pôsteres do Pôster Poker, com
--     número de colecionador "redondo" informado no insert e is_active = false
--     (fora do sorteio do Jackpot). O gatilho de número passa a pular os
--     números já tomados (o próximo pôster do Jackpot pega o primeiro livre
--     depois do maior número não exclusivo da raridade).
--   - user_posters.effect aceita 'gold' (a única troca de restrição autorizada).
--   - poker_settings: entrada por raridade, chance do item da Cobra, efeitos
--     (vazio = padrões do motor), âncora do ciclo, min_proto = 2.
--   - poker_items.cobra_pool: o catálogo da Cobra (vazio por enquanto).
--   - poker_prizes: effect_id e tournament_slot; os 9 prêmios novos; os antigos
--     saem de rotação (nada é apagado).
--   - poker_tournament_weeks: o pôster de cada semana (gravado uma vez).
--   - poker_bounty_matches: semana, efeito, aposta, item da Cobra, recompensas.
--   - poker_prize_grants.week: no máximo um pôster de torneio por semana.

-- A função de número foi lida em produção (pg_get_functiondef) em 03/11/2026;
-- se mudou desde então, a migração não aplica.
do $$
begin
  if md5(pg_get_functiondef('public.poster_items_assign_serial()'::regprocedure)) <> '625d33cae71770cbb521544707ef4ab7' then
    raise exception 'poster_items_assign_serial mudou em produção: releia antes de aplicar';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pôsteres exclusivos e o efeito gold
-- ---------------------------------------------------------------------------

alter table public.poster_items
  add column if not exists exclusive text check (exclusive is null or exclusive = 'poker');
comment on column public.poster_items.exclusive is
  'Pôster exclusivo de outro jogo (''poker'' = Pôster Poker). Fica com is_active = false: o Jackpot nunca sorteia, conta nem troca.';

-- Única exceção autorizada à regra de não usar DROP (03/11/2026): trocar a
-- restrição do efeito numa instrução só. jackpot_scheduled_pulls fica como está.
alter table public.user_posters
  drop constraint user_posters_effect_check,
  add constraint user_posters_effect_check check (effect = any (array['none', 'holo', 'negative', 'ultra_red', 'gold']));

-- Número de colecionador: o informado no insert vale (os pôsteres do pôquer
-- têm números redondos). Sem número, o primeiro livre depois do maior número
-- não exclusivo da raridade (pula os do pôquer: 070, 075, 080…).
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
    select coalesce(max(serial), 0) + 1 into v_n
      from poster_items
     where rarity = new.rarity and exclusive is null and id is distinct from new.id;
    while exists (select 1 from poster_items where rarity = new.rarity and serial = v_n and id is distinct from new.id) loop
      v_n := v_n + 1;
    end loop;
    new.serial := v_n;
  end if;
  return new;
end;
$function$;

-- Os 9 pôsteres (arquivos conferidos no TMDB pelo tmdb-proxy em 03/11/2026;
-- The Color of Money = tmdb 11873, gravado no movie_cache pela cache-title).
insert into public.poster_items (media_type, tmdb_id, rarity, file_path, is_active, serial, exclusive) values
  ('movie', 8065, 'common', '/bZdfpXmTOGKpVNNP1lximCo9Lfq.jpg', false, 70, 'poker'),     -- Quebrando a Banca (21)
  ('movie', 11873, 'common', '/wgnduoIofLovoWsfW2ziosfmQYE.jpg', false, 75, 'poker'),    -- A Cor do Dinheiro
  ('movie', 9277, 'common', '/ho0bLp3w1ZBphrhaZDdRJZqvbF4.jpg', false, 80, 'poker'),     -- Golpe de Mestre
  ('movie', 380, 'rare', '/6Ou94c5bAzWguHu03pLFFKNhF5H.jpg', false, 40, 'poker'),        -- Rain Man
  ('movie', 524, 'rare', '/zFa5k1XomqXniHLJqL1AoLRQiLA.jpg', false, 45, 'poker'),        -- Cassino
  ('movie', 10220, 'rare', '/osc2XRp6TFLvIP8itEt1j6oh46y.jpg', false, 50, 'poker'),      -- Cartas na Mesa
  ('movie', 161, 'epic', '/pfdabSiUVW6WqO9Dq4nyebkbHVv.jpg', false, 30, 'poker'),        -- Onze Homens e um Segredo
  ('movie', 473033, 'epic', '/1o12GnGlFNW4qYlfGgXIKLaFAjF.jpg', false, 35, 'poker'),     -- Joias Brutas
  ('movie', 36557, 'legendary', '/v6az3cLRIJ9MR3jllvf1NLv7b3X.jpg', false, 20, 'poker')  -- 007: Cassino Royale
on conflict (file_path) do nothing;

-- ---------------------------------------------------------------------------
-- Ajustes
-- ---------------------------------------------------------------------------

alter table public.poker_settings
  add column if not exists entry_chips jsonb not null default '{"common":1,"rare":1,"epic":2,"legendary":3}',
  add column if not exists cobra_chance numeric not null default 0.2 check (cobra_chance between 0 and 1),
  add column if not exists effects jsonb not null default '{}',
  add column if not exists tournament_anchor date not null default '2026-10-29';
comment on column public.poker_settings.entry_chips is 'Pôster Poker: fichas da entrada do torneio pela raridade do pôster da semana.';
comment on column public.poker_settings.cobra_chance is 'Pôster Poker: chance de a Cobra trazer um item secreto (só se houver item que a pessoa não tem).';
comment on column public.poker_settings.effects is 'Pôster Poker: Partial<Record<PosterEffectId, Partial<EffectParams>>>; {} = DEFAULT_EFFECTS do motor.';
comment on column public.poker_settings.tournament_anchor is 'Pôster Poker: a quinta-feira do slot 0 do ciclo de pôsteres.';
comment on column public.poker_settings.max_attempts is 'Entradas no torneio por dia de Brasília.';

-- O protocolo 2 (torneio com aposta) é o mínimo a partir de agora.
update public.poker_settings set min_proto = 2, max_attempts = 3 where id and (min_proto < 2 or max_attempts <> 3);

-- ---------------------------------------------------------------------------
-- O catálogo da Cobra (itens secretos; vazio até o Bruno decidir)
-- ---------------------------------------------------------------------------

alter table public.poker_items add column if not exists cobra_pool boolean not null default false;
comment on column public.poker_items.cobra_pool is
  'Pôster Poker: a Cobra pode trazer este item para a mesa (secreto até o fim). O Noir e o Meia-Noite ficam fora.';

-- ---------------------------------------------------------------------------
-- Prêmios: os 9 do torneio; os antigos saem de rotação
-- ---------------------------------------------------------------------------

alter table public.poker_prizes
  add column if not exists effect_id text check (effect_id is null or effect_id in
    ('early_flop', 'double_pot', 'blackjack', 'hand_bounty', 'eight_aces', 'reveal_one', 'sixth_card', 'opal', 'tell')),
  add column if not exists tournament_slot smallint check (tournament_slot is null or tournament_slot between 0 and 99);
create unique index if not exists poker_prizes_tournament_slot on public.poker_prizes (tournament_slot) where tournament_slot is not null;
comment on column public.poker_prizes.effect_id is 'Pôster Poker: o efeito que o pôster lança na mesa (PosterEffectId).';
comment on column public.poker_prizes.tournament_slot is 'Pôster Poker: posição no ciclo semanal (0 = semana de tournament_anchor).';

update public.poker_prize_kinds
   set note = 'pôster: {"item_id":int,"effect":"none|holo|negative|ultra_red|gold"}; entra sem troca (gold = Pôster Poker)'
 where kind = 'poster';

-- Ordem do ciclo (BRIEF2): Golpe de Mestre → Cartas na Mesa → A Cor do Dinheiro →
-- Onze Homens → Rain Man → Quebrando a Banca → Cassino → Joias Brutas → Cassino Royale.
insert into public.poker_prizes (id, kind, payload, rarity, repeatable, name_pt, name_en, article_pt, blurb_pt, blurb_en,
                                 in_rotation, weight, effect_id, tournament_slot)
select v.id, 'poster', jsonb_build_object('item_id', pi.id, 'effect', 'gold'), pi.rarity, false,
       v.name_pt, v.name_en, 'o', v.blurb_pt, v.blurb_en, false, 1, v.effect_id, v.slot
  from (values
    ('pp-the-sting', '/ho0bLp3w1ZBphrhaZDdRJZqvbF4.jpg', 'Golpe de Mestre', 'The Sting', 'early_flop', 0,
     'O telegrama: o flop vira antes das apostas.', 'The wire: the flop turns before the betting.'),
    ('pp-rounders', '/osc2XRp6TFLvIP8itEt1j6oh46y.jpg', 'Cartas na Mesa', 'Rounders', 'reveal_one', 1,
     'A leitura: uma carta de cada jogador vira para todos.', 'The read: one card from each player turns face up.'),
    ('pp-color-of-money', '/wgnduoIofLovoWsfW2ziosfmQYE.jpg', 'A Cor do Dinheiro', 'The Color of Money', 'double_pot', 2,
     'Dinheiro dobrado: a casa dobra o pote da mão.', 'Double money: the house doubles the pot.'),
    ('pp-oceans-eleven', '/pfdabSiUVW6WqO9Dq4nyebkbHVv.jpg', 'Onze Homens e um Segredo', 'Ocean''s Eleven', 'sixth_card', 3,
     'Um a mais no plano: o river vem com duas cartas.', 'One more in the crew: the river comes with two cards.'),
    ('pp-rain-man', '/6Ou94c5bAzWguHu03pLFFKNhF5H.jpg', 'Rain Man', 'Rain Man', 'hand_bounty', 4,
     'A conta do Raymond: quem fechar a jogada sorteada primeiro ganha fichas.', 'Raymond''s count: first to make the drawn hand wins chips.'),
    ('pp-21', '/bZdfpXmTOGKpVNNP1lximCo9Lfq.jpg', 'Quebrando a Banca', '21', 'blackjack', 5,
     '21: no fim da mão, quem estiver mais perto de 21 ganha fichas.', '21: at the end of the hand, closest to 21 wins chips.'),
    ('pp-casino', '/zFa5k1XomqXniHLJqL1AoLRQiLA.jpg', 'Cassino', 'Casino', 'eight_aces', 6,
     'Os ases do Ace: oito ases a mais no baralho.', 'Ace''s aces: eight extra aces in the deck.'),
    ('pp-uncut-gems', '/1o12GnGlFNW4qYlfGgXIKLaFAjF.jpg', 'Joias Brutas', 'Uncut Gems', 'opal', 7,
     'A opala negra: quem levar um pote com a carta marcada ganha fichas.', 'The black opal: win a pot holding the marked card and earn chips.'),
    ('pp-casino-royale', '/v6az3cLRIJ9MR3jllvf1NLv7b3X.jpg', '007: Cassino Royale', 'Casino Royale', 'tell', 8,
     'O tique de Le Chiffre: por três mãos, cada aposta dos oráculos se entrega.', 'Le Chiffre''s tell: for three hands, every oracle bet gives itself away.')
  ) v(id, file_path, name_pt, name_en, effect_id, slot, blurb_pt, blurb_en)
  join public.poster_items pi on pi.file_path = v.file_path and pi.exclusive = 'poker'
on conflict (id) do nothing;

-- Os prêmios antigos (pôsteres do Jackpot, fichas, Noir, Meia-Noite) saem de
-- rotação. Nada é apagado; o Noir e o Meia-Noite ficam guardados (fora da Cobra).
update public.poker_prizes set in_rotation = false where in_rotation and tournament_slot is null;

-- ---------------------------------------------------------------------------
-- O pôster de cada semana
-- ---------------------------------------------------------------------------

create table if not exists public.poker_tournament_weeks (
  week date primary key check (extract(isodow from week) = 4),   -- a quinta-feira (Brasília) em que a semana começa
  prize_id text not null references public.poker_prizes(id),
  slot smallint,
  source text not null default 'cycle' check (source in ('cycle', 'agenda')),
  note text,
  created_at timestamptz not null default now()
);
alter table public.poker_tournament_weeks enable row level security;
revoke all on public.poker_tournament_weeks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Partidas e concessões
-- ---------------------------------------------------------------------------

alter table public.poker_bounty_matches
  add column if not exists week date,                                    -- null = partida da fase 1 (prêmio do dia)
  add column if not exists effect_id text,
  add column if not exists stake_kind text check (stake_kind is null or stake_kind in ('chips', 'poster')),
  add column if not exists stake_chips smallint check (stake_chips is null or stake_chips between 0 and 10),
  add column if not exists stake_item_id integer references public.poster_items(id),
  add column if not exists stake_effect text,
  add column if not exists stake_status text check (stake_status is null or stake_status in ('held', 'returned', 'lost', 'spent')),
  add column if not exists cobra_item_id text references public.poker_items(id),   -- secreto: nunca sai antes do fim
  add column if not exists rewards jsonb,
  add column if not exists start_idem uuid;
create index if not exists poker_bounty_by_week on public.poker_bounty_matches (user_id, week) where week is not null;
create unique index if not exists poker_bounty_start_idem on public.poker_bounty_matches (user_id, start_idem) where start_idem is not null;

alter table public.poker_prize_grants add column if not exists week date;
create unique index if not exists poker_one_tournament_prize_per_week on public.poker_prize_grants (user_id, week) where week is not null;
