-- A Mesa dos Oráculos · pré-cálculo no pg_cron (SPEC §5.13) · 05/11/2026
--
-- Horários em UTC, longe das agendas atuais das 02h–04h e das 07h30:
--   03:20 de Brasília  catálogo (mesa_build_titles)
--   03:40 de Brasília  aquecimento dos vetores e da tiragem do dia
--   03:50 de Brasília  limpeza
--   a cada 10 min      fila do vetor (só de quem já tem vetor) e catálogo sujo
-- As agendas rodam como postgres (dono das funções internas). No pg_cron 1.6,
-- cron.schedule com um nome que já existe atualiza a agenda: rodar de novo
-- não duplica nada.

select cron.schedule('mesa-build-titles', '20 6 * * *', 'select public.mesa_build_titles();');
select cron.schedule('mesa-prepare-day',  '40 6 * * *', 'select public.mesa_prepare_day();');
select cron.schedule('mesa-dirty',        '*/10 * * * *', 'select public.process_mesa_dirty(5);');
select cron.schedule('mesa-cleanup',      '50 6 * * *', 'select public.mesa_cleanup();');
