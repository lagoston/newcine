-- Personalidades: duas letras novas e um personagem novo.
--
-- 1. Letras: Sombrio e Assustador passa de D para X e Adrenalina passa de
--    X para Z. Os códigos das 84 personalidades e o código de cada perfil
--    acompanham (ex.: MDX → MXZ). A ordem das letras no código continua a
--    ordem das prateleiras (sort_order), então nenhum código muda de lugar.
-- 2. MAC (Mind-Blowing + Aventuras + Catarse): sai Cooper (Interestelar) —
--    já havia quatro filmes do Nolan entre as 84 — e entra Ellie Arroway,
--    de Contato (1997).

-- 1a. Letras das prateleiras (X → Z primeiro, pra letra ficar livre) ------
update public.cine_moods set letter = 'Z' where mood_key = 'adrenaline';
update public.cine_moods set letter = 'X' where mood_key = 'dark-and-scary';

-- 1b. Códigos das personalidades. translate() troca as duas letras de uma
-- vez (D→X e X→Z). Passa por minúsculas pra que nenhum código novo colida
-- com um código antigo ainda não atualizado (ex.: MDR→MXR enquanto o MXR
-- antigo ainda não virou MZR).
alter table public.cine_personas drop constraint cine_personas_code_check;
update public.cine_personas set code = lower(translate(code, 'DX', 'XZ'));
update public.cine_personas set code = upper(code);
alter table public.cine_personas add constraint cine_personas_code_check check (code ~ '^[A-Z]{3}$');

-- 2. MAC: Ellie Arroway, de Contato ------------------------------------------
update public.cine_personas
   set title_pt      = 'Ouvinte das Estrelas',
       title_en      = 'Listener of the Stars',
       character_pt  = 'Ellie Arroway',
       character_en  = 'Ellie Arroway',
       film_title_pt = 'Contato',
       film_title_en = 'Contact',
       film_year     = 1997,
       tmdb_id       = 686,
       poster_path   = '/bCpMIywuNZeWt3i5UMLEIc0VSwM.jpg',
       blurb_pt      = 'Radioastrônoma que capta uma mensagem vinda das estrelas e atravessa o cosmos atrás de uma resposta — e do pai.',
       blurb_en      = 'A radio astronomer who picks up a message from the stars and crosses the cosmos in search of an answer — and of her father.'
 where code = 'MAC';

-- 3. Recalcula o código de todo mundo com as letras novas ------------------
do $$
declare
  r record;
begin
  for r in select id from public.profiles loop
    perform public.refresh_user_persona(r.id);
  end loop;
end;
$$;
