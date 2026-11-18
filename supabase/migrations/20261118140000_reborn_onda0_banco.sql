-- 18/11/2026 — Protocolo Reborn, onda 0 do banco. Autorizada pelo Bruno às
-- 11h19 ("Aplique tudo, inicie o PROTOCOLO REBORN"), depois da auditoria de
-- desempenho (claude/otimizacao.md, claude/otimizacao/banco.md, achados A2 e A9).
--
-- O banco estava em 428 MB de 500 MB do plano grátis (acima disso o projeto
-- fica somente leitura: ninguém salva nota, sussurro nem giro).
--   1. net._http_response ocupava 161 MB com 2 linhas vivas: sobra das
--      respostas grandes do TMDB que a curadoria automática puxava pelo pg_net
--      (desligada desde 09/10). O pg_net já apaga as respostas em 6 h e
--      nenhuma tela lê essa tabela; o TRUNCATE devolve o espaço na hora.
--   2. cron.job_run_details nunca era limpo: ~60 mil linhas, +3,6 mil por dia
--      (79% do poker-friends-sweep, a cada 30 s). Passa a guardar 7 dias, com
--      uma limpeza diária às 07:17 UTC (04:17 em Brasília, fora do uso).
--   3. Os cinco jobs de 10 em 10 minutos rodavam todos no mesmo minuto (:00,
--      :10…), somando picos; agora cada um tem o seu minuto.

truncate net._http_response;

delete from cron.job_run_details where end_time < now() - interval '7 days';

select cron.schedule(
  'limpeza-historico-cron',
  '17 7 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);

select cron.alter_job(j.jobid, schedule := s.schedule)
  from cron.job j
  join (values
    ('compat-refresh', '1-59/10 * * * *'),
    ('bot-friend-requests', '3-59/10 * * * *'),
    ('poker-friends-housekeeping', '4-59/10 * * * *'),
    ('poker-recover-expire', '6-59/10 * * * *'),
    ('mesa-dirty', '8-59/10 * * * *')
  ) as s(jobname, schedule) on s.jobname = j.jobname
 where j.schedule = '*/10 * * * *';
