-- 20/11/2026 (Protocolo Reborn, fecho; pedido do Bruno, 01h36: "finalize os
-- 10%"): fecha o furo das tags aceitas pela palavra do aparelho.
--
-- As duas funções que registram tags (sync_unlocked_tags_from_home, da Home, e
-- sync_unlocked_tags_and_notify, do modal de Tags) recebem do aparelho a lista
-- do que a pessoa "desbloqueou" e só conferiam as tags de Jogos. Qualquer
-- conta logada podia se dar uma tag básica, temática, de comunidade, de
-- oráculo ou especial, com o sussurro e o story de conquista que vêm junto,
-- mandando o nome certo (achado da auditoria de 19/11).
--
-- Desde 19/11 o banco sabe calcular as tags de quem está logado
-- (get_tag_progress + tag_pins_from_progress). As duas funções passam a lista
-- por normalize_synced_tags, e é ali, num lugar só, que a conferência entra:
-- uma tag que não é de Jogos só passa se o próprio banco também a calcula
-- para quem chama. O emoji gravado passa a ser o do banco (não o que veio).
--   • Formato intocado: mesmos parâmetros e mesmo retorno. O site novo já
--     usa sync_my_tags (lista calculada no banco) e não sente nada.
--   • APK antigo: continua funcionando. Só deixa de registrar e anunciar uma
--     tag que o banco não confirma (regra antiga do aparelho, tag retirada).
--   • Nada é apagado: quem já tem a tag registrada continua com ela.
--   • As de Jogos seguem como estavam (conferidas em user_special_tags).
--   • Chamada sem pessoa logada (servidor, painel SQL) segue sem filtro: só
--     quem tem a chave de serviço chega ali.
--   • O progresso só é calculado quando a lista traz alguma tag que não é de
--     Jogos.
-- A definição é a do banco, com dois trechos conferidos (uma vez cada).

create function pg_temp.swap_once(p_def text, p_old text, p_new text, p_label text)
returns text
language plpgsql
as $f$
begin
  if (length(p_def) - length(replace(p_def, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: o trecho não aparece uma vez só', p_label;
  end if;
  return replace(p_def, p_old, p_new);
end;
$f$;

do $do$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.normalize_synced_tags(uuid,jsonb)'::regprocedure);

  v_def := pg_temp.swap_once(v_def,
$s$    from jsonb_array_elements(case when jsonb_typeof(p_tags) = 'array' then p_tags else '[]'::jsonb end) as t
  )
$s$,
$s$    from jsonb_array_elements(case when jsonb_typeof(p_tags) = 'array' then p_tags else '[]'::jsonb end) as t
  ),
  -- 20/11/2026: o que o próprio banco calcula para quem chama
  server as (
    select (s->>'category') as category, (s->>'name') as tag_name, (s->>'emoji') as tag_emoji
    from jsonb_array_elements(
      case when auth.uid() is not null and auth.uid() = p_user_id
                and exists (select 1 from raw x where x.category is distinct from 'games')
           then public.tag_pins_from_progress(public.get_tag_progress())
           else '[]'::jsonb end) as s
  )
$s$, 'normalize_synced_tags (a lista do banco)');

  v_def := pg_temp.swap_once(v_def,
$s$  select r.category, r.tag_name, r.tag_emoji
  from raw r
  where r.category is distinct from 'games'
    and not (r.category = 'special'
             and exists (select 1 from special_tags g where g.category = 'games' and g.name = r.tag_name))
$s$,
$s$  select r.category, r.tag_name, coalesce(s.tag_emoji, r.tag_emoji)
  from raw r
  left join server s on s.category = r.category and s.tag_name = r.tag_name
  where r.category is distinct from 'games'
    and not (r.category = 'special'
             and exists (select 1 from special_tags g where g.category = 'games' and g.name = r.tag_name))
    -- 20/11/2026: só passa o que o banco confirma (sem pessoa logada = servidor)
    and (s.tag_name is not null or auth.uid() is null)
$s$, 'normalize_synced_tags (o filtro)');

  execute v_def;
end;
$do$;
