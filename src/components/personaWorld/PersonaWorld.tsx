import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'framer-motion';
import { Film, Share2 } from 'lucide-react';
import { MOOD_BY_LETTER } from '../../lib/moods';
import { personaText } from '../../lib/persona';
import { worldState, type PersonaWorld as World, type WorldState, type WorldTitle } from '../../lib/personaWorld';
import { FOCUS_RING, INK, MIST, PAPER, PIXEL, VELVET, ratingTone } from '../../lib/oracleTheme';
import { PersonaCard, PersonaCode } from '../PersonaBits';
import { MothCloseUp, PersonaScene, type Hotspot } from './PersonaScene';
import type { StudioDoors } from './useStudioDoors';
import type { SpotKind } from './studio';
import EvolutionBar, { type EvolutionBarProps } from './EvolutionBar';
import { GOLD } from './draw';

// O corpo do modal "Sua Persona": o estúdio, a Persona e a mariposa.
//
// 14/11/2026 (noite), correção do Bruno: "Dentro do modal 'Sua Persona' não
// deve haver uma separação 'sempre, agora e por vir'." Saíram as três abas. O
// modal agora é uma página só, nesta ordem:
//   1. o estúdio (a cena, com tudo o que brilha tocável);
//   2. a Persona: a carta, o código, o título, o personagem e o texto dela; no
//      canto, o botão de compartilhar (só no seu);
//   3. a mariposa de perto (os olhos da asa abrem os títulos de nota 9 e 10),
//      com a bitola embaixo;
//   4. as barras: "Sempre" (tudo o que foi avaliado), "Agora" (os últimos 30
//      títulos) e "Evolução", a barra que volta no tempo (EvolutionBar);
//   5. os títulos dos olhos e os últimos títulos.
// Saíram daqui: a frase "As estantes dizem MAC. As asas, hoje, puxam para…",
// os botões Revelação e Como funciona, as nove prateleiras com o gráfico, a
// legenda das latas e a forma vizinha (foram para o guia do estúdio, o livro
// da estante, junto com as personalidades) e os títulos de nota 10 (os quadros
// da parede agora são os pôsteres do Jackpot).
//
// Quando a barra da Evolução sai da ponta direita, `world` é o estúdio como
// ele estava naquela nota: tudo aqui mostra aquele momento.

const STAGE_BG = '#0D0919';

const fmtRating = (rating: number): string => (Number.isInteger(rating) ? String(rating) : rating.toFixed(1));

const Heading: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <h3 style={{ ...PIXEL, color: PAPER }} className={`text-lg leading-tight ${className}`}>
    {children}
  </h3>
);
const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[13px] leading-relaxed" style={{ color: MIST }}>
    {children}
  </p>
);

// a letra do humor num quadradinho (o "+" creme é o Arquivo, os títulos de fora)
const Tile: React.FC<{ letter: string | null; small?: boolean }> = ({ letter, small = false }) => {
  const color = letter ? (MOOD_BY_LETTER[letter]?.color ?? MIST) : PAPER;
  return (
    <span
      aria-hidden
      className={`grid place-items-center shrink-0 leading-none ${small ? 'w-[22px] h-[22px] rounded-[5px] text-[13px]' : 'w-7 h-7 rounded-[7px] text-[17px]'}`}
      style={{ ...PIXEL, color, background: '#130D24', boxShadow: `inset 0 0 0 1.5px ${color}` }}
    >
      {letter ?? '+'}
    </span>
  );
};

const Bar: React.FC<{ value: number; color?: string; tall?: boolean; label?: string }> = ({ value, color = GOLD, tall = false, label }) => (
  <span
    className={`block flex-1 overflow-hidden rounded-[3px] ${tall ? 'h-3' : 'h-2'}`}
    style={{ background: 'rgba(243,234,211,0.1)' }}
    role={label ? 'progressbar' : undefined}
    aria-valuemin={label ? 0 : undefined}
    aria-valuemax={label ? 100 : undefined}
    aria-valuenow={label ? Math.floor(value * 100) : undefined}
    aria-label={label}
  >
    <span className="block h-full" style={{ width: `${Math.floor(value * 100)}%`, background: color }} />
  </span>
);

interface PersonaWorldProps {
  world: World;
  onOpenTitle: (title: WorldTitle) => void;
  // o título que está abrindo (o pôster dele pisca)
  openingKey?: string | null;
  // o que pode ser tocado na cena (useStudioDoors): a máquina, a mesa, o guia, a caixa, os quadros, a estante
  doors?: StudioDoors;
  // a barra da Evolução (só no seu estúdio)
  evolution?: Omit<EvolutionBarProps, 'label'> | null;
  // compartilhar a Persona (só no seu, com Persona)
  onShare?: () => void;
}

const PersonaWorldView: React.FC<PersonaWorldProps> = ({ world, onOpenTitle, openingKey = null, doors, evolution = null, onShare }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const st: WorldState = useMemo(() => worldState(world), [world]);
  const personaRef = useRef<HTMLElement>(null);
  const mothRef = useRef<HTMLElement>(null);
  const pt = i18n.language.startsWith('pt');

  const entry = st.hasTrio ? (world.persona?.persona ?? null) : null;
  const text = entry ? personaText(entry, i18n.language) : null;
  const moodName = (letter: string | null) => (letter && MOOD_BY_LETTER[letter] ? t(MOOD_BY_LETTER[letter].labelKey) : '');
  const titleName = (title: WorldTitle) => (pt ? title.titlePt || title.titleEn : title.titleEn || title.titlePt) || t('personaWorld.untitled');
  const gaugeName = (key: string | null) => (key ? t(`personaWorld.gauges.${key}`) : '');

  // Na cena daqui, a tela e a mariposa descem até a Persona e a mariposa de perto.
  const hotspots = useMemo(() => {
    const go = (ref: React.RefObject<HTMLElement>) => () => ref.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    const mine: Partial<Record<SpotKind, Hotspot>> = {
      ...(doors?.hotspots ?? {}),
      screen: { label: t('personaWorld.spots.persona'), onClick: go(personaRef) },
      moth: { label: st.hasTrio ? t('personaWorld.spots.moth') : world.rated === 0 ? t('personaWorld.spots.egg') : t('personaWorld.spots.larva'), onClick: go(mothRef) },
    };
    return mine;
  }, [doors?.hotspots, reduceMotion, t, st.hasTrio, world.rated]);

  // um pôster pequeno que abre o título, com a nota no canto
  const thumb = (title: WorldTitle) => {
    const tone = ratingTone(Math.round(title.rating));
    const name = titleName(title);
    return (
      <button
        type="button"
        onClick={() => onOpenTitle(title)}
        className={`group relative block w-full aspect-[2/3] min-w-0 min-h-0 rounded-lg overflow-hidden ring-1 ring-white/10 hover:ring-white/30 transition ${FOCUS_RING}`}
        style={{ background: VELVET }}
        aria-label={`${name}, ${fmtRating(title.rating)}`}
        title={name}
      >
        {title.poster ? (
          <img src={`https://image.tmdb.org/t/p/w185${title.poster}`} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
            <Film className="w-5 h-5" aria-hidden />
          </span>
        )}
        <span
          className="absolute bottom-1 right-1 h-5 min-w-[20px] px-1 grid place-items-center rounded-md text-[12px] leading-none"
          style={{ ...PIXEL, background: 'rgba(18,13,34,0.86)', color: tone.color, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
        >
          {fmtRating(title.rating)}
        </span>
        {openingKey === `${title.type}:${title.id}` && <span className="absolute inset-0 bg-black/50 animate-pulse" />}
      </button>
    );
  };

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
  return (
    <div className="space-y-6">
      {/* 1. O estúdio. No celular a cena vai de borda a borda da gaveta (o -mx-5
          desfaz o px-5 do corpo da OracleSheet): numa tela de 320 px ela ainda
          cabe em escala 2; com a margem, cairia para escala 1 e ficaria miúda. */}
      <div className="-mx-5 sm:mx-0 sm:rounded-2xl py-1.5" style={{ background: STAGE_BG }}>
        <PersonaScene world={world} state={st} label={st.hasTrio ? t('personaWorld.sceneLabel', { code: st.code }) : t('personaWorld.sceneLabelEmpty')} extras={doors?.extras} hotspots={hotspots} />
      </div>

      {/* 2. A Persona: quem é */}
      <section ref={personaRef} className="scroll-mt-3 space-y-3">
        <div className="flex items-center gap-3.5 min-w-0">
          {entry && st.code && text ? (
            <>
              <span className="block shrink-0 w-[54px]">
                <PersonaCard persona={entry} code={st.code} compact eager className="w-full" />
              </span>
              <div className="min-w-0 flex-1">
                <PersonaCode code={st.code} className="block text-[2.5rem] leading-[0.95] tracking-[0.04em]" />
                <p className="text-lg font-semibold leading-snug" style={{ color: PAPER }}>
                  {text.title}
                </p>
                <p className="text-[13px] leading-snug" style={{ color: MIST }}>
                  {text.sameAsFilm ? text.filmWithYear : t('oracle.persona.characterIn', { character: text.character, film: text.filmWithYear })}
                </p>
              </div>
              {onShare && (
                <button
                  type="button"
                  onClick={onShare}
                  className={`grid place-items-center w-11 h-11 shrink-0 self-start rounded-full border border-white/15 transition hover:border-white/35 hover:bg-white/5 ${FOCUS_RING}`}
                  style={{ color: PAPER }}
                  aria-label={t('oracle.hub.share')}
                  title={t('oracle.hub.share')}
                >
                  <Share2 className="w-[18px] h-[18px]" aria-hidden />
                </button>
              )}
            </>
          ) : (
            <>
              <span style={{ ...PIXEL, color: 'rgba(243,234,211,0.25)' }} className="shrink-0 text-[2.5rem] leading-[0.95] tracking-[0.04em]" aria-hidden>
                ???
              </span>
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-snug" style={{ color: PAPER }}>
                  {world.rated === 0 ? t('personaWorld.plate.egg') : t('personaWorld.plate.larva')}
                </p>
                <p className="text-[13px] leading-snug" style={{ color: MIST }}>
                  {st.counted >= threshold ? t('personaWorld.plate.needShelves') : t('personaWorld.plate.progress', { counted: st.counted, threshold })}
                </p>
              </div>
            </>
          )}
        </div>
        {text?.blurb && (
          <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
            {text.blurb}
          </p>
        )}
        {!st.hasTrio && <Bar value={Math.min(1, st.counted / threshold)} tall label={t('oracle.intro.progressLabel')} />}
      </section>

      {/* 3. A mariposa de perto, com a bitola */}
      <section ref={mothRef} className="scroll-mt-3 space-y-3">
        <div className="rounded-2xl p-2" style={{ background: STAGE_BG }}>
          <MothCloseUp world={world} state={st} onOpenTitle={onOpenTitle} label={creatureLabel} />
        </div>
        {!st.hasTrio && <Note>{world.rated === 0 ? t('personaWorld.now.egg') : t('personaWorld.now.larva')}</Note>}
        {st.hasTrio && (
          <div className="flex items-center gap-2.5">
            <span style={{ ...PIXEL, background: PAPER, color: INK }} className="shrink-0 px-2 py-[5px] rounded-md text-[13px] leading-none">
              {gaugeName(st.gaugeKey)}
            </span>
            {st.nextGaugeKey && (
              <>
                <Bar value={st.gaugeBar} label={t('personaWorld.plate.gaugeAria', { pct: Math.floor(st.gaugeBar * 100), next: gaugeName(st.nextGaugeKey) })} />
                <span style={{ ...PIXEL, color: MIST }} className="shrink-0 text-[13px] leading-none">
                  {gaugeName(st.nextGaugeKey)}
                </span>
              </>
            )}
          </div>
        )}

        {/* 4. As barras: sempre, agora e a evolução desde o início */}
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

      {/* 5. Os títulos dos olhos e os últimos títulos */}
      {st.hasTrio && world.eyes.length > 0 && (
        <section className="space-y-2">
          <Note>{t('personaWorld.now.eyes')}</Note>
          <ul className="grid grid-cols-6 gap-2 max-w-[440px]">
            {world.eyes.map((title) => (
              <li key={`${title.type}:${title.id}`} className="min-w-0">
                {thumb(title)}
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
    </div>
  );
};

export default PersonaWorldView;
