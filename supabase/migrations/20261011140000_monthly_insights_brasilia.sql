-- Insights do mês com o mês de Brasília (11/10/2026).
--
-- get_monthly_insights cortava o mês com datas puras (make_date), que o
-- banco compara em UTC: o mês terminava às 21h do último dia, no horário de
-- Brasília. O Alien: O Oitavo Passageiro do Bruno, avaliado em 30/09 às
-- 21h58 (01/10 00h58 em UTC), caía em outubro em vez de setembro. Agora o
-- mês vai da meia-noite do dia 1 à meia-noite do mês seguinte em
-- America/Sao_Paulo, para as notas e para os episódios assistidos — o mesmo
-- relógio dos eventos sazonais e das listas do dia.

do $$
declare
  d text;
begin
  d := pg_get_functiondef('public.get_monthly_insights(uuid,integer,integer)'::regprocedure);
  if position('v_start date := make_date(p_year, p_month, 1);' in d) = 0
     or position('v_end date := (make_date(p_year, p_month, 1) + interval ''1 month'')::date;' in d) = 0 then
    raise exception 'trechos de v_start/v_end não encontrados em get_monthly_insights';
  end if;
  d := replace(d, 'v_start date := make_date(p_year, p_month, 1);',
    'v_start timestamptz := make_date(p_year, p_month, 1)::timestamp at time zone ''America/Sao_Paulo'';');
  d := replace(d, 'v_end date := (make_date(p_year, p_month, 1) + interval ''1 month'')::date;',
    'v_end timestamptz := (make_date(p_year, p_month, 1) + interval ''1 month'')::timestamp at time zone ''America/Sao_Paulo'';');
  execute d;
end $$;
