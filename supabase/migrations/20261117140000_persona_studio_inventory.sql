-- 17/11/2026 (pedido do Bruno): o inventário e o giro dos objetos do estúdio.
--
-- "Adicione um inventário quando clicamos em arrumar estúdio, para que seja
-- possível revisar os itens que temos, trocá-los e inseri-los [...] Adicione
-- uma opção para poder girar os objetos do estúdio também."
--
-- O arranjo passa a ser { v: 2, at, off, rot }:
--   • at: objeto → lugar (como antes);
--   • off: os objetos guardados no inventário (não aparecem na sala);
--   • rot: objeto → quartos de volta (o site usa 0 e 1; 0 não é guardado).
-- O app antigo (APK) manda só o `at` e lê só o `at`: quando ele salva, o
-- inventário e o giro que estavam guardados continuam (menos o que ele pôs na
-- sala), e um objeto guardado aparece no lugar de costume para quem usa o APK
-- antigo. get_persona_world devolve o arranjo inteiro, então nada muda lá.
create or replace function public.set_persona_studio_layout(p_layout jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_at jsonb;
  v_clean jsonb;
  v_out jsonb;
  -- 17/11/2026: o inventário e o giro
  v_prev jsonb;
  v_off jsonb;
  v_rot jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  v_at := p_layout -> 'at';
  if v_at is null or jsonb_typeof(v_at) <> 'object' then
    raise exception 'bad_layout' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_each(v_at)) > 24
     or exists (
       select 1 from jsonb_each(v_at) e
        where e.key !~ '^[a-z]{2,16}$'
           or jsonb_typeof(e.value) <> 'number'
           or (e.value #>> '{}') !~ '^[0-9]{1,2}$'
           or (e.value #>> '{}')::int > 31
     )
     or (select count(*) from jsonb_each(v_at)) <> (select count(distinct (e.value #>> '{}')) from jsonb_each(v_at) e) then
    raise exception 'bad_layout' using errcode = '22023';
  end if;
  select coalesce(jsonb_object_agg(e.key, (e.value #>> '{}')::int), '{}'::jsonb) into v_clean from jsonb_each(v_at) e;

  select l.layout into v_prev from persona_studio_layouts l where l.user_id = v_uid;

  -- os guardados: o que veio, ou (app antigo) o que já estava
  if p_layout ? 'off' then
    v_off := p_layout -> 'off';
    if jsonb_typeof(v_off) <> 'array' or jsonb_array_length(v_off) > 24
       or exists (select 1 from jsonb_array_elements(v_off) x
                   where jsonb_typeof(x) <> 'string' or (x #>> '{}') !~ '^[a-z]{2,16}$') then
      raise exception 'bad_layout' using errcode = '22023';
    end if;
  else
    v_off := case when jsonb_typeof(v_prev -> 'off') = 'array' then v_prev -> 'off' else '[]'::jsonb end;
  end if;
  -- sem repetidos e sem o que está na sala
  select coalesce(jsonb_agg(distinct x #>> '{}'), '[]'::jsonb) into v_off
    from jsonb_array_elements(v_off) x
   where jsonb_typeof(x) = 'string' and not (v_clean ? (x #>> '{}'));

  -- os girados: o que veio, ou (app antigo) o que já estava
  if p_layout ? 'rot' then
    v_rot := p_layout -> 'rot';
    if jsonb_typeof(v_rot) <> 'object' or (select count(*) from jsonb_each(v_rot)) > 24
       or exists (select 1 from jsonb_each(v_rot) e
                   where e.key !~ '^[a-z]{2,16}$' or jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}') !~ '^[0-3]$') then
      raise exception 'bad_layout' using errcode = '22023';
    end if;
  else
    v_rot := case when jsonb_typeof(v_prev -> 'rot') = 'object' then v_prev -> 'rot' else '{}'::jsonb end;
  end if;
  -- só fica o que está girado
  select coalesce(jsonb_object_agg(e.key, (e.value #>> '{}')::int), '{}'::jsonb) into v_rot
    from jsonb_each(v_rot) e
   where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}') ~ '^[1-3]$';

  v_out := jsonb_build_object('v', 2, 'at', v_clean, 'off', v_off, 'rot', v_rot);

  insert into persona_studio_layouts (user_id, layout, updated_at)
  values (v_uid, v_out, now())
  on conflict (user_id) do update set layout = excluded.layout, updated_at = now();
  return v_out;
end;
$function$;
