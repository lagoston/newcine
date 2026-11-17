-- 16/11/2026 (pedido do Bruno): novas chances do Poster Jackpot.
--   Giro com ficha: comum 56%, raro 28%, épico 13%, lendário 3% (antes 55/28/13/4).
--   Giro da Sorte:  raro 20%, épico 50%, lendário 30% (antes épico 50%, lendário 50%).
--
-- O jackpot_pull do banco tem partes que não moram neste repositório, então esta
-- migração NÃO recria a função a partir de um arquivo: lê a definição atual do
-- banco, troca só o trecho das chances (que precisa aparecer exatamente uma vez)
-- e confere que o resultado é a definição antiga com esse único trecho trocado.
-- Se o trecho tiver mudado, ela para com erro e nada muda.
--
-- No Giro da Sorte, quando o raro sorteado não tem versão nova para a pessoa,
-- o giro sobe para épico e depois lendário (nunca cai para comum).
do $mig$
declare
  v_old text := $old$    v_rarity := case when r < 0.5 then 'legendary' else 'epic' end;
    v_rorder := case v_rarity
                  when 'legendary' then array['legendary', 'epic', 'rare', 'common']
                  else array['epic', 'legendary', 'rare', 'common'] end;
  else
    v_rarity := case when r < 0.04 then 'legendary' when r < 0.17 then 'epic' when r < 0.45 then 'rare' else 'common' end;$old$;
  v_new text := $new$    -- 16/11/2026 (pedido do Bruno): raro 20%, épico 50%, lendário 30%
    v_rarity := case when r < 0.30 then 'legendary' when r < 0.80 then 'epic' else 'rare' end;
    v_rorder := case v_rarity
                  when 'legendary' then array['legendary', 'epic', 'rare', 'common']
                  when 'epic' then array['epic', 'legendary', 'rare', 'common']
                  else array['rare', 'epic', 'legendary', 'common'] end;
  else
    -- 16/11/2026 (pedido do Bruno): comum 56%, raro 28%, épico 13%, lendário 3%
    v_rarity := case when r < 0.03 then 'legendary' when r < 0.16 then 'epic' when r < 0.44 then 'rare' else 'common' end;$new$;
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
