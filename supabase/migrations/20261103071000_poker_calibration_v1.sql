-- 03/11/2026 — O Grande Blefe: calibração v1 dos bots (simulador, pacote A3).
--
-- Estrutura: dois níveis mais fundos (10/20 e 20/40) antes de 25/50; o resto igual,
-- 5 mãos por nível, ante = BB/4 a partir de 50/100. Com 40 BB de saída, quem empurra
-- toda mão vencia 18% (meta < 15%) e a partida durava 23 mãos (meta 30–40).
-- Dificuldade por raridade (multiplicador do erro ε e atraso de adaptação do Raposo):
-- comum 2,4/18, raro 1,7/15, épico 1,0/12, lendário 0,3/6.
-- Parâmetros dos bots: scripts/poker/params/v1.json (o mesmo que já vai embutido no
-- app em src/lib/poker/bots/calibrated.ts; o banco continua podendo sobrepor).
-- Resultado (2.000 partidas por perfil): iniciante vence 22%, médio 30%, bom 35%;
-- all-in sempre 13%, maníaco 13%, mediana de 34 mãos.

update public.poker_settings
   set levels = '[[10,20,0],[20,40,0],[25,50,0],[35,70,0],[50,100,25],[70,140,35],[100,200,50],[150,300,75],[200,400,100],[300,600,150],[400,800,200],[600,1200,300],[800,1600,400],[1200,2400,600]]'::jsonb,
       hands_per_level = 5,
       difficulty = '{"free":{"stars":0,"epsilonMul":1.0,"adaptDelay":12},"common":{"stars":1,"epsilonMul":2.4,"adaptDelay":18},"rare":{"stars":2,"epsilonMul":1.7,"adaptDelay":15},"epic":{"stars":3,"epsilonMul":1.0,"adaptDelay":12},"legendary":{"stars":4,"epsilonMul":0.3,"adaptDelay":6}}'::jsonb
 where id;

update public.poker_bot_params set params = '{"epsilon":0.36,"epsilonFloor":0.1,"noise":0.15,"stinginess":0.9,"preflop":{"entry":{"CO":10,"BTN":15,"SB":20},"limpShare":0.8,"callOpenPct":10,"foldBBvsSteal":0.95},"post":{"cbetHU":0.2,"barrelTurn":0.12,"riverAfterTwo":0.2,"raiseValueFreq":0.06,"callMarginPP":{"pairPlus":-16,"committed":-20,"draw":0,"air":2}},"bounty":{"carrier":{"vpipDelta":6,"allInMarginPP":-4},"hunterMarginPP":5}}'::jsonb, version = version + 1, updated_at = now() where rival_id = 'bogart';
update public.poker_bot_params set params = '{"epsilon":0.24,"epsilonFloor":0.07,"noise":0.09,"preflop":{"threeBetPct":22,"callOpenPct":24,"limpShare":0},"post":{"barrelTurn":0.75,"riverAfterTwo":0.75,"semibluffFreq":0.9,"raiseValueFreq":0.8,"checkRaise":0.2,"callMarginPP":{"pairPlus":-12,"committed":-12,"draw":-10,"air":-5},"cbetHU":0.95,"riverBluffShare":0.5},"callAllIn":{"topPct":22},"tells":{"bluffBet":{"nervoso":0.5,"confiante":0.1,"calado":0,"neutro":0.4},"valueBet":{"nervoso":0.4,"confiante":0.4,"calado":0,"neutro":0.2}},"bounty":{"hunterMarginPP":3},"sizings":{"riverThin":0.66,"riverPolar":1}}'::jsonb, version = version + 1, updated_at = now() where rival_id = 'cypher';
update public.poker_bot_params set params = '{"epsilon":0.13,"epsilonFloor":0.03,"noise":0.04,"preflop":{"entry":{"CO":25,"BTN":42,"SB":36},"callOpenPct":12},"post":{"cbetHU":0.85,"barrelTurn":0.7,"riverAfterTwo":0.65,"semibluffFreq":0.5,"raiseValueFreq":0.7,"checkRaise":0.15,"callMarginPP":{"pairPlus":-8,"committed":-8,"draw":-5,"air":-2}},"tells":{"rest":{"confiante":0.00015,"nervoso":0.25,"neutro":0.74985,"calado":0},"riverNuts":{"confiante":0.4,"nervoso":0.2,"neutro":0.4,"calado":0}},"bounty":{"carrier":{"vpipDelta":-6,"allInMarginPP":12},"hunterMarginPP":3},"sizings":{"flopWet":0.5,"turn":0.5,"riverPolar":0.75},"model":{"cbet":{"min":0.5,"max":0.95},"callMarginPP":15}}'::jsonb, version = version + 1, updated_at = now() where rival_id = 'fincher';
