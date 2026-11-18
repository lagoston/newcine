import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'framer-motion';
import { Armchair } from 'lucide-react';
import { MOOD_BY_LETTER } from '../../lib/moods';
import { FURNITURE, levelText, worldState, type PersonaWorld as World, type StudioArrangement, type WorldState, type WorldTitle } from '../../lib/personaWorld';
import type { ThemeReading } from '../../lib/personaThemes';
import { FOCUS_RING, INK, MIST, PAPER, PIXEL, ratingTone } from '../../lib/oracleTheme';
import { MothCloseUp, PersonaScene, type Hotspot, type SceneArrange } from './PersonaScene';
import type { StudioDoors } from './useStudioDoors';
import { canStore, hasPet, placeItem, storeItem, turnItem, type ArrangeState, type ItemId, type SpotKind } from './studio';
import { COBRA_RIFLE, hasCobraItem } from './cobraItems';
import StudioInventory, { type InventoryItem } from './StudioInventory';
import EvolutionBar, { type EvolutionBarProps } from './EvolutionBar';
import ShelfPots from './ShelfPots';
import PersonaExplained from './PersonaExplained';
import { Bar, Heading, Note, Tile, TitleThumb } from './bits';
import { STAGE_BG, fmtRating, studioArrange, studioPortrait } from './draw';

// O corpo do modal "Sua Persona", o mesmo na home e no perfil.
//
// 15/11/2026, pedido do Bruno: "Vamos unificar o 'Sua Persona' da home e o
// 'Sua Persona' do profile, que estão um pouco dissonantes entre si […] Vamos
// adaptar e fundir funções dos dois." A ordem que ele deu para o modal
// completo, "que deve ser idêntico para os dois":
//   1. o estúdio, como já estava;
//   2. a barra de progresso do nível do estúdio ("Estúdio nível 4"; até
//      15/11 à tarde era a bitola: "Super 16" etc.);
//   3. os "potinhos" das prateleiras, que eram do bloco do perfil: tocar num
//      mostra quantos títulos, a nota média, os mais bem avaliados e os temas
//      com a média de cada um (ShelfPots);
//   4. a mariposa, com as barras Sempre, Agora e Evolução (a Evolução também
//      muda os potinhos);
//   5. os filmes dos olhos das asas e o histórico (os últimos títulos);
//   6. por último, a Persona, com as explicações (PersonaExplained).
//
// Na véspera (14/11, noite) a ordem era o estúdio, a Persona, a mariposa com a
// bitola embaixo, as barras e os títulos; os potinhos, os temas e as
// explicações só existiam no bloco do perfil.
//
// Quando a barra da Evolução sai da ponta direita, `world` é o estúdio como
// ele estava naquela nota e `themes` são os temas daquele ponto: tudo aqui
// mostra aquele momento.
//
// 15/11/2026 (tarde), correções do Bruno:
//   • o nível do estúdio é "número real": "Estúdio nível 4", quantos títulos
//     foram avaliados e quantos faltam para o próximo nível (saíram a
//     envergadura e as bitolas);
//   • "deixe o usuário posicionar os itens que ele já tem": embaixo da cena,
//     no seu estúdio, o botão "Arrumar o estúdio". Arrumando, toca-se num
//     objeto para pegá-lo e depois num lugar do chão (num lugar ocupado, os
//     dois trocam). Salvar grava; Cancelar desfaz.
//
// 17/11/2026: arrumando, embaixo da cena aparece o inventário (StudioInventory):
// os objetos que a pessoa tem, na sala ou guardados, com girar e guardar.

// Arrumar o estúdio: o que a gaveta entrega para a página (PersonaWorldSheet).
export interface ArrangeControls {
  active: boolean;
  saving: boolean;
  onStart: () => void;
  // o arranjo depois de uma mudança: o lugar de cada objeto, os guardados e os girados
  onChange: (next: StudioArrangement) => void;
  onSave: () => void;
  onCancel: () => void;
  // todos os objetos de volta ao lugar de costume
  onReset: () => void;
}

interface PersonaWorldProps {
  world: World;
  isOwn: boolean;
  // "@fulano", no estúdio de outra pessoa
  ownerName: string | null;
  onOpenTitle: (title: WorldTitle) => void;
  // o título que está abrindo (o pôster dele pisca)
  openingKey?: string | null;
  // o que pode ser tocado na cena (useStudioDoors): a máquina, a mesa, o guia, a caixa, os quadros, a estante
  doors?: StudioDoors;
  // a barra da Evolução (só no seu estúdio)
  evolution?: Omit<EvolutionBarProps, 'label'> | null;
  // os temas das prateleiras (null = ainda chegando)
  themes: ThemeReading | null;
  themesFailed: boolean;
  // compartilhar a Persona (só no seu, com Persona)
  onShare?: () => void;
  onOpenGuide?: () => void;
  // sair do modal (ao seguir um link para outra página)
  onLeave?: () => void;
  // arrumar o estúdio (só no seu, e com a barra da Evolução em hoje)
  arrange?: ArrangeControls | null;
}

const GHOST = `inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition disabled:opacity-50 ${FOCUS_RING}`;

const PersonaWorldView: React.FC<PersonaWorldProps> = ({ world, isOwn, ownerName, onOpenTitle, openingKey = null, doors, evolution = null, themes, themesFailed, onShare, onOpenGuide, onLeave, arrange = null }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const st: WorldState = useMemo(() => worldState(world), [world]);
  const personaRef = useRef<HTMLElement>(null);
  const mothRef = useRef<HTMLElement>(null);
  const pt = i18n.language.startsWith('pt');

  const moodName = (letter: string | null) => (letter && MOOD_BY_LETTER[letter] ? t(MOOD_BY_LETTER[letter].labelKey) : '');
  const titleName = (title: WorldTitle) => (pt ? title.titlePt || title.titleEn : title.titleEn || title.titlePt) || t('personaWorld.untitled');
  const whole = (value: number) => value.toLocaleString(pt ? 'pt-BR' : 'en-US');

  // ---- arrumar o estúdio: o objeto pego e o que cada toque faz ----
  const arranging = Boolean(arrange?.active);
  const [picked, setPicked] = useState<ItemId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!arranging) {
      setPicked(null);
      setNotice(null);
    }
  }, [arranging]);
  const extras = doors?.extras;
  // o arranjo de agora (com os lugares de costume já resolvidos) e o inventário
  const resolved = useMemo(() => (arranging ? studioArrange(world, st, extras) : null), [arranging, world, st, extras]);
  const arrangeState = useMemo((): ArrangeState | null => (resolved ? { at: resolved.at, off: world.stored, rot: world.turn } : null), [resolved, world.stored, world.turn]);
  // aplica uma mudança; null = não pode (quem estava no lugar não vai para o inventário)
  const commit = (next: ArrangeState | null): boolean => {
    if (!arrange || !next) {
      if (arrange) setNotice(t('studio.inventory.cantStore'));
      return false;
    }
    setNotice(null);
    arrange.onChange({ at: next.at as Record<string, number>, off: next.off, rot: next.rot });
    return true;
  };
  const sceneArrange = useMemo((): SceneArrange | null => {
    if (!arrange?.active || !resolved || !arrangeState) return null;
    const itemName = (id: ItemId) => t(`studio.items.${id}`);
    const send = (next: ArrangeState | null) => {
      if (!next) {
        setNotice(t('studio.inventory.cantStore'));
        return false;
      }
      setNotice(null);
      arrange.onChange({ at: next.at as Record<string, number>, off: next.off, rot: next.rot });
      return true;
    };
    return {
      picked: picked !== null && resolved.at[picked] !== undefined ? picked : null,
      // o objeto na mão está guardado: os lugares acendem como para um objeto da sala
      carrying: picked !== null,
      onItem: (id) => {
        if (picked === null) setPicked(id);
        else if (picked === id) setPicked(null);
        else {
          // tocar em outro objeto com um na mão: os dois trocam (vindo do inventário, o outro é guardado)
          const to = resolved.at[id];
          if (to !== undefined && send(placeItem(arrangeState, picked, to))) setPicked(null);
        }
      },
      onPlace: (place) => {
        if (picked === null) return;
        if (send(placeItem(arrangeState, picked, place))) setPicked(null);
      },
      itemLabel: (id, mine) => t(mine ? 'studio.arrange.itemPicked' : picked ? 'studio.arrange.itemSwap' : 'studio.arrange.itemPick', { item: itemName(id) }),
      placeLabel: (place, free) => t(free ? 'studio.arrange.placeFree' : 'studio.arrange.placeTaken', { no: place + 1 }),
    };
  }, [arrange, resolved, arrangeState, picked, t]);
  // as peças do inventário: o que a pessoa tem, na ordem da sala, os guardados por último
  const inventory = useMemo((): InventoryItem[] => {
    if (!resolved) return [];
    const items = resolved.owned.map((id) => {
      const turned = (world.turn[id] ?? 0) % 2 === 1;
      const place = resolved.at[id];
      return { id, place: place === undefined ? null : place + 1, turned, storable: canStore(id), portrait: studioPortrait(world, st, extras ?? { jackpot: 'on', poker: false }, id, turned) };
    });
    return [...items.filter((item) => item.place !== null), ...items.filter((item) => item.place === null)];
  }, [resolved, world, st, extras]);
  // o que é do cinema e não sai do lugar (e o sapo, que anda solto)
  const fixedNames = useMemo(() => {
    if (!arranging) return [];
    const list: string[] = [];
    if (st.level >= 1) list.push('projector');
    if (st.level >= 3) list.push('rug');
    if (st.level >= 4) list.push('lamp');
    if (st.level >= 7) list.push('curtain');
    if (st.level >= 9) list.push('bigScreen');
    if (st.level >= 10) list.push('marquee');
    if (hasPet(world, 'frog')) list.push('frog');
    // o rifle de parede (móvel da Cobra, 17/11/2026) mora fixo na parede
    if (hasCobraItem(world, COBRA_RIFLE)) list.push('rifle');
    return list.map((id) => t(`studio.inventory.names.${id}`));
  }, [arranging, st.level, world, t]);

  // Na cena daqui, a tela desce até a Persona (no fim) e a mariposa, até a mariposa de perto.
  const hotspots = useMemo(() => {
    const go = (ref: React.RefObject<HTMLElement>) => () => ref.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    const mine: Partial<Record<SpotKind, Hotspot>> = {
      ...(doors?.hotspots ?? {}),
      screen: { label: t('personaWorld.spots.persona'), onClick: go(personaRef) },
      moth: { label: st.hasTrio ? t('personaWorld.spots.moth') : world.rated === 0 ? t('personaWorld.spots.egg') : t('personaWorld.spots.larva'), onClick: go(mothRef) },
    };
    return mine;
  }, [doors?.hotspots, reduceMotion, t, st.hasTrio, world.rated]);

  // as duas faixas (sempre × agora) na mesma ordem, a de força das prateleiras
  const strip = (dist: Record<string, number>, label: string) => {
    const list = st.rank.filter((l) => dist[l] > 0.005);
    const spoken = list
      .slice()
      .sort((a, b) => dist[b] - dist[a])
      .slice(0, 4)
      .map((l) => `${moodName(l)} ${Math.round(dist[l] * 100)}%`)
      .join(', ');
    return (
      <div className="grid grid-cols-[68px_minmax(0,1fr)] items-center gap-2.5">
        <span style={{ ...PIXEL, color: MIST }} className="text-[13px] leading-none">
          {label}
        </span>
        <span className="flex h-[22px] gap-[2px] rounded overflow-hidden" role="img" aria-label={`${label}: ${spoken}`}>
          {list.map((l) => (
            <span
              key={l}
              className="grid place-items-center min-w-0 text-[12px] leading-none"
              style={{ ...PIXEL, flex: `${dist[l]} 1 0%`, background: MOOD_BY_LETTER[l].color, color: '#1A1230' }}
              title={`${moodName(l)} ${Math.round(dist[l] * 100)}%`}
            >
              {dist[l] >= 0.09 ? l : ''}
            </span>
          ))}
        </span>
      </div>
    );
  };

  const threshold = world.persona?.threshold || 10;
  const creatureLabel = st.hasTrio ? t('personaWorld.mothLabel') : world.rated === 0 ? t('personaWorld.eggLabel') : t('personaWorld.larvaLabel');
  // a linha embaixo da barra do nível: quantos títulos, quantos faltam e o que o próximo nível traz
  const levelLine =
    st.stage === 0
      ? t('personaWorld.now.egg')
      : st.stage === 1
        ? st.counted >= threshold
          ? t('personaWorld.plate.needShelves')
          : t('personaWorld.plate.progress', { counted: st.counted, threshold })
        : st.nextAt
          ? t('personaWorld.level.line', { count: st.toNext, rated: whole(st.rated), left: whole(st.toNext), next: st.level + 1, item: t(`personaWorld.furniture.${FURNITURE[st.level + 1]}`) })
          : t('personaWorld.level.max', { rated: whole(st.rated) });

  return (
    <div className="space-y-6">
      {/* 1. O estúdio. No celular a cena vai de borda a borda da gaveta (o -mx-5
          desfaz o px-5 do corpo da OracleSheet): numa tela de 320 px ela ainda
          cabe em escala 2; com a margem, cairia para escala 1 e ficaria miúda. */}
      <div className="space-y-2.5">
        <div className="-mx-5 sm:mx-0 sm:rounded-2xl py-1.5" style={{ background: STAGE_BG }}>
          <PersonaScene world={world} state={st} label={st.hasTrio ? t('personaWorld.sceneLabel', { code: st.code }) : t('personaWorld.sceneLabelEmpty')} extras={extras} hotspots={hotspots} arrange={sceneArrange} />
        </div>
        {/* Arrumar o estúdio: o convite e, arrumando, o passo de agora e os botões */}
        {arrange &&
          (arranging ? (
            <StudioInventory
              items={inventory}
              picked={picked}
              fixed={fixedNames}
              notice={notice}
              saving={arrange.saving}
              onPick={(id) => {
                setNotice(null);
                setPicked((current) => (current === id ? null : id));
              }}
              onTurn={() => {
                if (picked && arrangeState) commit(turnItem(arrangeState, picked));
              }}
              onStore={() => {
                if (picked && arrangeState && commit(storeItem(arrangeState, picked))) setPicked(null);
              }}
              onDrop={() => setPicked(null)}
              onSave={arrange.onSave}
              onCancel={arrange.onCancel}
              onReset={() => {
                setPicked(null);
                setNotice(null);
                arrange.onReset();
              }}
            />
          ) : (
            <div className="flex justify-end">
              <button type="button" onClick={arrange.onStart} className={GHOST} style={{ color: PAPER }}>
                <Armchair className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                {t('studio.arrange.start')}
              </button>
            </div>
          ))}
      </div>

      {/* 2. O nível do estúdio: o de agora, a barra e o próximo */}
      <section className="space-y-1.5" aria-label={t('personaWorld.level.label')}>
        <div className="flex items-center gap-2.5">
          <span style={{ ...PIXEL, background: PAPER, color: INK }} className="shrink-0 px-2 py-[5px] rounded-md text-[13px] leading-none">
            {levelText(t, st)}
          </span>
          {(st.nextAt || st.level === 0) && (
            <>
              <Bar value={st.levelBar} tall label={t('personaWorld.level.aria', { pct: Math.floor(st.levelBar * 100), next: st.level + 1 })} />
              <span style={{ ...PIXEL, color: MIST }} className="shrink-0 text-[13px] leading-none">
                {t('personaWorld.level.short', { n: st.level + 1 })}
              </span>
            </>
          )}
        </div>
        <Note>{levelLine}</Note>
      </section>

      {/* 3. Os potinhos: as nove prateleiras e os dados de cada uma */}
      <ShelfPots world={world} st={st} isOwn={isOwn} ownerName={ownerName} themes={themes} themesFailed={themesFailed} onOpenTitle={onOpenTitle} openingKey={openingKey} onLeave={onLeave} />

      {/* 4. A mariposa de perto, com as barras: sempre, agora e a evolução desde o início */}
      <section ref={mothRef} className="scroll-mt-3 space-y-3">
        <div className="rounded-2xl p-2" style={{ background: STAGE_BG }}>
          <MothCloseUp world={world} state={st} onOpenTitle={onOpenTitle} label={creatureLabel} />
        </div>
        {!st.hasTrio && <Note>{world.rated === 0 ? t('personaWorld.now.egg') : t('personaWorld.now.larva')}</Note>}
        {(st.hasTrio || evolution) && (
          <div className="grid gap-1.5 pt-1">
            {st.hasTrio &&
              (st.phaseAvailable ? (
                <>
                  {strip(st.essence, t('personaWorld.now.stripAlways'))}
                  {strip(st.now, t('personaWorld.now.stripNow'))}
                </>
              ) : (
                strip(st.now, t('personaWorld.now.stripWings'))
              ))}
            {evolution && <EvolutionBar label={t('personaWorld.replay.label')} {...evolution} />}
          </div>
        )}
      </section>

      {/* 5. Os títulos dos olhos e o histórico (os últimos títulos) */}
      {st.hasTrio && world.eyes.length > 0 && (
        <section className="space-y-2">
          <Note>{t('personaWorld.now.eyes')}</Note>
          <ul className="grid grid-cols-6 gap-2 max-w-[440px]">
            {world.eyes.map((title) => (
              <li key={`${title.type}:${title.id}`} className="min-w-0">
                <TitleThumb title={title} name={titleName(title)} onOpen={onOpenTitle} opening={openingKey === `${title.type}:${title.id}`} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {world.last.length > 0 && (
        <section className="space-y-1">
          <Heading>{t('personaWorld.now.last')}</Heading>
          <ol>
            {world.last.map((title) => (
              <li key={`${title.type}:${title.id}`}>
                <button
                  type="button"
                  onClick={() => onOpenTitle(title)}
                  className={`w-full flex items-center justify-start gap-2.5 text-left px-2 -mx-2 rounded-lg transition hover:bg-white/[0.05] ${FOCUS_RING}`}
                >
                  <span style={{ ...PIXEL, color: ratingTone(Math.round(title.rating)).color }} className="w-7 shrink-0 text-right text-[15px] leading-none tabular-nums">
                    {fmtRating(title.rating)}
                  </span>
                  <span className="flex-1 min-w-0 text-[14px] leading-snug break-words" style={{ color: PAPER }}>
                    {titleName(title)}
                  </span>
                  <Tile letter={title.letter} small />
                  <span className="sr-only">{title.letter ? moodName(title.letter) : t('personaWorld.archive')}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 6. A Persona, com as explicações */}
      <PersonaExplained ref={personaRef} world={world} st={st} isOwn={isOwn} onShare={onShare} onOpenGuide={onOpenGuide} />
    </div>
  );
};

export default PersonaWorldView;
