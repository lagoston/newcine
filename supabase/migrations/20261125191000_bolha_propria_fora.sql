-- Menu do título: a própria pessoa nunca vira bolha na capa (25/11/2026).
--
-- Pedido do Bruno: "Notei que uma bolha do meu próprio usuário aparece em filmes
-- cujos quais possuem uma resenha escrita minha, isso não deveria acontecer. Um
-- próprio usuário nunca pode ver sua bolha na capa."
--
-- A causa: get_title_social monta as bolhas em três níveis (amigos; resenhas com
-- título de outras pessoas; amigos de amigos) e guarda em v_used quem já entrou,
-- para ninguém repetir. O nível 2 pega "resenhas de quem ainda não apareceu", e
-- a lista de quem já apareceu começava vazia: a resenha da própria pessoa
-- passava. (O hook antigo do site tinha a mesma falha, corrigida no mesmo dia.)
--
-- A correção: a lista começa com a própria pessoa. Vale para os três níveis.
-- O formato da resposta não muda (o APK que já chama a função ganha a correção).
--
-- A definição parte da que está no banco: só a linha da lista muda, e ela
-- precisa aparecer exatamente uma vez.
do $mig$
declare
  v_old text := $old$  v_used uuid[] := '{}';$old$;
  v_new text := $new$  -- 25/11/2026 (pedido do Bruno): a própria pessoa já entra como "usada",
  -- para nunca virar bolha (o nível 2 trazia a resenha dela mesma)
  v_used uuid[] := array[auth.uid()];$new$;
  v_def text;
  v_before text;
  v_after text;
begin
  v_def := pg_get_functiondef('public.get_title_social(integer,text,integer)'::regprocedure);
  select prosrc into v_before from pg_proc where oid = 'public.get_title_social(integer,text,integer)'::regprocedure;
  if (length(v_before) - length(replace(v_before, v_old, ''))) <> length(v_old) then
    raise exception 'get_title_social: a linha de v_used não aparece exatamente uma vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select prosrc into v_after from pg_proc where oid = 'public.get_title_social(integer,text,integer)'::regprocedure;
  if v_after is distinct from replace(v_before, v_old, v_new) then
    raise exception 'get_title_social: o resultado não é a definição antiga com só a linha trocada';
  end if;
end
$mig$;
