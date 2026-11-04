-- 04/11/2026 — Abre o Mercado Negro da Cobra (o contrato do Poster Jackpot,
-- 20261104090000_jackpot_contracts.sql) junto com a tela nova do site, e as duas
-- tags do contrato (🕶️ Black Market e ⚗️ Alchemist) começam a valer.
update public.poster_jackpot_settings set contract_open = true where id;
update public.special_tags set starts_at = now() where id in ('jackpot-black-market', 'jackpot-alchemist');
