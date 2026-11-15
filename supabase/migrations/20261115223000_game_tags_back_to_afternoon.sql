-- Tags de Jogos: de volta às metas da tarde (15/11/2026, noite).
--
-- Pedido do Bruno (18h46): "Eu me confundi, volte para a raridade anterior
-- das tags, pois como eu as estava portando, não percebi a mudança".
--
-- O que aconteceu no dia:
--   • à tarde as metas subiram (20261115191000_game_tags_harder.sql), mas
--     quem já tinha as tags continuou com elas, e o Bruno, que tinha oito,
--     não viu diferença;
--   • às 18h11 ele pediu tags "bem mais raras" e as regras mudaram de novo
--     (20261115213000_game_tags_rare.sql);
--   • às 18h39 pediu para tirar as tags de quem não as merecia
--     (20261115220000_game_tags_recheck.sql), e aí viu a regra.
--
-- Esta migração devolve as metas, as regras e os textos da tarde, iguais aos
-- de 20261115191000_game_tags_harder.sql. Quem perdeu a tag às 18h42 continua
-- sem ela: ninguém cumpria também as metas da tarde (o Bruno tem 34 giros, 5
-- lendários, 2 contratos e 3 vitórias no pôquer).
--
-- Ficam no banco, sem uso por nenhuma tag, as contagens que a regra da noite
-- criou (lucky_legendary_streak, poster_items, trade_partners e as quatro do
-- pôquer), a tabela game_tag_trade_partners (que continua anotando os
-- parceiros de troca) e as funções poker_summary_perfect_allin e
-- poker_summary_fox_final. Não pesam e servem se as regras da noite voltarem.
--
-- Os mesmos números e textos voltaram a src/lib/tags.ts (GAME_TAGS) e às
-- regras das marcas do pôquer nos arquivos de texto.

-- ---------------------------------------------------------------------------
-- As metas e os textos da tarde (a métrica vai explícita: a regra da noite
-- tinha trocado a de Lucky Charm, Croupier, Curator e das cinco do pôquer)
-- ---------------------------------------------------------------------------
update public.special_tags set
  requirement_data = requirement_data || '{"metric": "spins", "goal": 50}'::jsonb,
  requirement_description = 'Spin the Poster Jackpot wheel 50 times (with a regular or special chip)',
  requirement_description_pt = 'Dê 50 giros na roleta do Poster Jackpot (com ficha comum ou especial)',
  description = 'Fifty spins on the wheel. The machine knows your name now.',
  description_pt = 'Cinquenta giros na roleta. A máquina já sabe o seu nome.'
 where id = 'jackpot-gambler';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "spins", "goal": 200}'::jsonb,
  requirement_description = 'Spin the wheel 200 times (with a regular or special chip)',
  requirement_description_pt = 'Dê 200 giros na roleta (com ficha comum ou especial)',
  description = 'Two hundred spins. At this table, the chips never cool down.',
  description_pt = 'Duzentos giros. Nesta mesa, a ficha nunca esfria.'
 where id = 'jackpot-high-roller';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "lucky_spins", "goal": 10}'::jsonb,
  requirement_description = 'Use 10 Lucky Spins',
  requirement_description_pt = 'Use 10 Giros da Sorte',
  description = 'Filled the bar ten times and spun for free. Luck likes the stubborn.',
  description_pt = 'Encheu a barra dez vezes e girou de graça. A sorte gosta de quem insiste.'
 where id = 'jackpot-lucky-charm';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "legendary_pulls", "goal": 10}'::jsonb,
  requirement_description = 'Pull 10 legendary posters on the wheel',
  requirement_description_pt = 'Tire 10 pôsteres lendários na roleta',
  description = 'The wheel stopped on gold ten times. That is no longer luck.',
  description_pt = 'A roleta parou no dourado dez vezes. Isso já não é sorte.'
 where id = 'jackpot-jackpot';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "effect_posters", "goal": 20}'::jsonb,
  requirement_description = 'Have 20 posters with an effect',
  requirement_description_pt = 'Tenha 20 pôsteres com efeito',
  description = 'Twenty posters with an effect. The collection glows in the dark.',
  description_pt = 'Vinte pôsteres com efeito. A coleção brilha no escuro.'
 where id = 'jackpot-shiny-hunter';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "trades", "goal": 25}'::jsonb,
  requirement_description = 'Make 25 poster trades with friends',
  requirement_description_pt = 'Faça 25 trocas de pôster com amigos',
  description = 'Twenty-five trades with friends. Now you''re the one dealing.',
  description_pt = 'Vinte e cinco trocas com amigos. Agora quem distribui é você.'
 where id = 'jackpot-croupier';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "posters", "goal": 100}'::jsonb,
  requirement_description = 'Have 100 posters in your collection',
  requirement_description_pt = 'Tenha 100 pôsteres na coleção',
  description = 'A hundred posters in the collection. Time to open a museum.',
  description_pt = 'Cem pôsteres na coleção. Já dá para abrir um museu.'
 where id = 'jackpot-curator';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "contracts", "goal": 5}'::jsonb,
  requirement_description = 'Close 5 contracts at the Cobra''s Black Market (in the Poster Jackpot)',
  requirement_description_pt = 'Feche 5 contratos no Mercado Negro da Cobra (no Poster Jackpot)',
  description = 'Five contracts signed with the Cobra. No questions, no receipts.',
  description_pt = 'Cinco contratos assinados com a Cobra. Sem perguntas, sem recibo.'
 where id = 'jackpot-black-market';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "contract_legendaries", "goal": 3}'::jsonb,
  requirement_description = 'Forge 3 legendary posters in Black Market contracts',
  requirement_description_pt = 'Consiga 3 pôsteres lendários em contratos do Mercado Negro',
  description = 'Three times, six epics in and one legend out. The Cobra almost smiled.',
  description_pt = 'Três vezes entraram seis épicos e saiu um lendário. A Cobra quase sorriu.'
 where id = 'jackpot-alchemist';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poker_wins", "goal": 5}'::jsonb,
  requirement_description = 'Win 5 Poster Poker tournaments',
  requirement_description_pt = 'Vença 5 torneios do Pôster Poker',
  description = 'Five tournaments won. I gave it a 10. Don''t tell anyone.',
  description_pt = 'Cinco torneios vencidos. Dei nota 10. Não conta pra ninguém.'
 where id = 'poker-first-win';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poker_fox", "goal": 5}'::jsonb,
  requirement_description = 'Knock out the Fox in 5 tournaments',
  requirement_description_pt = 'Elimine o Raposo em 5 torneios',
  description = 'Took me off the table in five tournaments. Few can say that. Say it.',
  description_pt = 'Me tirou da mesa em cinco torneios. Poucos podem dizer isso. Diga.'
 where id = 'poker-fox-hunter';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poker_sweeps", "goal": 3}'::jsonb,
  requirement_description = 'Knock out all three oracles in the same tournament, 3 times',
  requirement_description_pt = 'Elimine os três oráculos no mesmo torneio, 3 vezes',
  description = 'Knocked out all three in one tournament, three times over. A gorgeous massacre. I''m jealous.',
  description_pt = 'Eliminou os três no mesmo torneio, três vezes. Que massacre lindo. Fiquei com inveja.'
 where id = 'poker-clean-sweep';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poker_stake_wins", "goal": 5}'::jsonb,
  requirement_description = 'Win 5 tournaments with a poster from your collection as the stake',
  requirement_description_pt = 'Vença 5 torneios apostando um pôster da sua coleção',
  description = 'Five times you put a poster on the table and walked out with two. Nerve pays.',
  description_pt = 'Cinco vezes apostou um pôster da coleção e saiu da mesa com dois. Coragem paga.'
 where id = 'poker-high-stakes';

update public.special_tags set
  requirement_data = requirement_data || '{"metric": "poker_wins", "goal": 20}'::jsonb,
  requirement_description = 'Win 20 tournaments',
  requirement_description_pt = 'Vença 20 torneios',
  description = 'Twenty tournaments won. The table smells you coming.',
  description_pt = 'Vinte torneios vencidos. A mesa já sente o cheiro de longe.'
 where id = 'poker-card-shark';

-- ---------------------------------------------------------------------------
-- As tags do pôquer, no fim do torneio: a função da tarde
-- ---------------------------------------------------------------------------
create or replace function public.poker_award_marks(p_uid uuid, p_match_id uuid, p_summary jsonb)
 returns text[]
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  m poker_bounty_matches;
  s jsonb := coalesce(p_summary, '{}'::jsonb);
  v_tags text[] := '{}';
  v_new text[];
  v_won boolean;
  v_wins int;
  v_need int;
begin
  select * into m from poker_bounty_matches where id = p_match_id and user_id = p_uid;
  if not found or m.week is null then
    return '{}';
  end if;
  v_won := m.status = 'won' and m.place = 1;
  -- as vitórias em torneio, com a deste (a linha já está como vencida)
  select count(*) into v_wins from poker_bounty_matches x where x.user_id = p_uid and x.week is not null and x.status = 'won';

  -- All-in: 5 vitórias em torneio (até 15/11/2026, a 1ª; das 18h11 às 18h46
  -- desse dia, vencer sem perder nenhum all-in).
  if v_won and v_wins >= 5 then
    v_tags := array_append(v_tags, 'poker-first-win');
  end if;
  -- Outfoxed: eliminou o Raposo em 5 torneios (até 15/11/2026, em 1). Este torneio
  -- vale pelo resumo que chegou; os outros, pelo resumo guardado.
  if poker_summary_fox(s)
     and (select count(*) from poker_bounty_matches x
           where x.user_id = p_uid and x.week is not null and x.id <> p_match_id and poker_summary_fox(x.summary)) + 1 >= 5 then
    v_tags := array_append(v_tags, 'poker-fox-hunter');
  end if;
  -- Clean Sweep: eliminou os três oráculos no mesmo torneio, em 3 torneios (até 15/11/2026, em 1).
  if poker_summary_sweep(s)
     and (select count(*) from poker_bounty_matches x
           where x.user_id = p_uid and x.week is not null and x.id <> p_match_id and poker_summary_sweep(x.summary)) + 1 >= 3 then
    v_tags := array_append(v_tags, 'poker-clean-sweep');
  end if;
  -- Poker Face: apurado pelo motor no servidor (informação privada).
  if (s -> 'marks' -> 'oscarBluff') = 'true'::jsonb then
    v_tags := array_append(v_tags, 'poker-oscar-bluff');
  end if;
  -- Seven Nights: torneio terminado em 7 dias seguidos de Brasília.
  if (select count(distinct x.day) from poker_bounty_matches x
       where x.user_id = p_uid and x.week is not null and x.status in ('won', 'lost', 'forfeit', 'abandoned')
         and x.day between m.day - 6 and m.day) = 7 then
    v_tags := array_append(v_tags, 'poker-seven-nights');
  end if;
  if v_won then
    -- High Stakes: 5 vitórias apostando um pôster da coleção (até 15/11/2026, 1).
    if m.stake_kind = 'poster'
       and (select count(*) from poker_bounty_matches x
             where x.user_id = p_uid and x.week is not null and x.status = 'won' and x.stake_kind = 'poster') >= 5 then
      v_tags := array_append(v_tags, 'poker-high-stakes');
    end if;
    -- Royal Flush: venceu um torneio de pôster lendário.
    if m.rarity = 'legendary' then
      v_tags := array_append(v_tags, 'poker-royal-flush');
    end if;
    -- Full House: tem os 9 pôsteres do Pôster Poker (o desta vitória já foi concedido).
    select count(*) into v_need from poster_items where exclusive = 'poker';
    if v_need > 0 and (select count(distinct up.item_id) from user_posters up join poster_items pi on pi.id = up.item_id
                        where up.user_id = p_uid and up.reset_at is null and up.effect = 'gold' and pi.exclusive = 'poker') >= v_need then
      v_tags := array_append(v_tags, 'poker-full-house');
    end if;
    -- Card Shark: 20 vitórias em torneio (até 15/11/2026, 10).
    if v_wins >= 20 then
      v_tags := array_append(v_tags, 'poker-card-shark');
    end if;
  end if;

  -- Só tags que existem e estão na janela (lançadas) — ou, antes do lançamento, para os
  -- testadores do Pôster Poker (pedido do Bruno, 03/11: "hoje só você vê e pode ganhar");
  -- o gatilho de aviso continua calado até o lançamento. Quem já tem não ganha de novo.
  with ins as (
    insert into user_special_tags (user_id, tag_id, is_permanent)
    select p_uid, t, true from unnest(v_tags) t
     where exists (select 1 from special_tags st
                    where st.id = t
                      and (st.starts_at is null or st.starts_at <= now()
                           or p_uid = any (coalesce((select testers from poker_settings limit 1), '{}')))
                      and (st.ends_at is null or st.ends_at > now()))
    on conflict do nothing
    returning tag_id
  )
  select coalesce(array_agg(tag_id), '{}') into v_new from ins;
  return v_new;
end;
$function$;
