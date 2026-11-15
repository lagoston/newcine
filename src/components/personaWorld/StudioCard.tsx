import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';
import { PersonaCode } from '../PersonaBits';
import DoorArrow from '../home/DoorArrow';
import { MOOD_BY_KEY, MOOD_BY_LETTER, type Mood } from '../../lib/moods';
import { personaText, topMoodKeys, PERSONA_THRESHOLD } from '../../lib/persona';
import { levelText, worldState, type PersonaWorld } from '../../lib/personaWorld';
import { FOCUS_RING, MIST, PAPER, PIXEL, withAlpha } from '../../lib/oracleTheme';
import { PersonaScene } from './PersonaScene';
import { RH, RW } from './draw';
import type { StudioDoors } from './useStudioDoors';

// O cartão do estúdio: a versão reduzida do "Sua Persona", a mesma na home e
// no perfil (15/11/2026).
//
// Pedido do Bruno: "Vamos unificar o 'Sua Persona' da home e o 'Sua Persona'
// do profile, que estão um pouco dissonantes entre si […] A versão reduzida no
// profile deve ser parecida com a versão reduzida da home."
//
// Até aqui eram dois desenhos. Na home, o cartão do estúdio (home/StudioDoor):
// o nome, o código e o título, a cena e a dica. No perfil, um bloco maior
// (profile/EssenceRing): o estúdio, as plaquinhas das nove prateleiras com a
// leitura de cada uma, a mariposa grande, o começo da revelação, os atalhos e
// os temas. Agora o desenho é este arquivo, usado pelos dois; o que só o bloco
// do perfil tinha (as prateleiras com os dados, a mariposa, os temas, as
// explicações) foi para dentro do modal completo, que também é um só.
//
// O desenho, como era o da home:
//   • celular e tablet: o nome em cima (um botão, com a seta), a cena e a dica
//     embaixo. No celular a cena fica em 2× e o cartão quase encosta nas
//     bordas da tela, para ela caber inteira em 360 px;
//   • computador: a cena à esquerda e, ao lado, quem é a pessoa (o código, o
//     título, as três prateleiras do código, o nível do estúdio) e o botão de abrir. A
//     cena fica em 3× quando a janela tem altura para isso (780 px), senão 2×.
// Só se toca no que brilha na cena (useStudioDoors); o nome e o botão abrem o
// modal completo.

const DEFAULT_TINTS = ['#A78BFA', '#F0ABFC', '#38BDF8'];

// A escala da cena e o desenho do cartão (lado a lado no computador).
// `roomy`: o cartão não precisa caber na primeira tela (o do perfil, que fica
// mais abaixo na página): a cena vai a 3× sempre que a largura deixa.
function useCardLayout(ref: React.RefObject<HTMLDivElement>, roomy: boolean): { side: boolean; k: number } {
  const compute = useCallback(
    (width: number) => {
      const side = window.matchMedia('(min-width: 1024px)').matches;
      if (side) return { side, k: width - 32 - RW * 3 >= 190 && (roomy || window.innerHeight >= 780) ? 3 : 2 };
      // de 316 a 359 px a cena de 2× passa um pouco da borda (só as pontas das paredes são cortadas)
      return { side, k: width >= RW * 3 ? 3 : width + 44 >= RW * 2 ? 2 : 1 };
    },
    [roomy],
  );
  // antes da primeira medida: um palpite pela largura da janela
  const [layout, setLayout] = useState(() => compute(window.innerWidth >= 1024 ? (Math.min(window.innerWidth, 1152) - 64) * 0.72 : window.innerWidth - 16));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const next = compute(el.clientWidth);
      setLayout((current) => (current.side === next.side && current.k === next.k ? current : next));
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [ref, compute]);
  return layout;
}

interface StudioCardProps {
  // o estúdio (null = ainda chegando, ou não veio)
  world: PersonaWorld | null;
  failed: boolean;
  onRetry?: () => void;
  // o que se toca na cena
  doors: StudioDoors;
  // abre o modal completo
  onOpen: () => void;
  isOwn: boolean;
  // "@fulano", no estúdio de outra pessoa
  ownerName?: string | null;
  // o cartão não precisa caber na primeira tela (perfil): a cena cresce sempre que a largura deixa
  roomy?: boolean;
}

const StudioCard: React.FC<StudioCardProps> = ({ world, failed, onRetry, doors, onOpen, isOwn, ownerName = null, roomy = false }) => {
  const { t, i18n } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const { side, k } = useCardLayout(cardRef, roomy);

  const persona = world?.persona ?? null;
  const st = useMemo(() => (world ? worldState(world) : null), [world]);
  const hasPersona = Boolean(persona?.code && persona.persona);
  const moods: Mood[] = useMemo(() => (persona?.code ? persona.code.split('').map((letter) => MOOD_BY_LETTER[letter]).filter(Boolean) : []), [persona?.code]);
  const tints = moods.length === 3 ? moods.map((mood) => mood.color) : DEFAULT_TINTS;
  const text = hasPersona && persona?.persona ? personaText(persona.persona, i18n.language) : null;
  const threshold = persona?.threshold || PERSONA_THRESHOLD;
  const counted = Math.min(persona?.counted ?? 0, threshold);
  // as três prateleiras do código, com a força de cada uma (a mais forte = barra cheia)
  const codeKeys = topMoodKeys(persona);
  const topScores = hasPersona && persona ? persona.scores.filter((score) => codeKeys.includes(score.moodKey)) : [];
  const topMax = Math.max(1, ...topScores.map((score) => score.score));

  const name = isOwn ? t('home.persona.title') : t('personaWorld.titleOf', { name: ownerName ?? '' });
  const emptyHint = isOwn ? t('home.persona.hintEmpty', { count: threshold }) : t('profile.essenceEmptyOther', { username: (ownerName ?? '').replace(/^@/, '') });
  const openAria = hasPersona && persona?.code && text ? `${name}: ${persona.code}, ${text.title}` : isOwn ? t('home.persona.doorAriaEmpty') : name;

  const cardStyle: React.CSSProperties = {
    background: [
      `radial-gradient(58% 52% at ${side ? '36%' : '50%'} 64%, ${withAlpha(tints[0], 0.17)}, transparent 72%)`,
      `radial-gradient(70% 120% at 100% 0%, ${withAlpha(tints[1], 0.13)}, transparent 60%)`,
      'linear-gradient(135deg, #1a1030, #0f0a1c 55%, #170c26)',
    ].join(', '),
    boxShadow: `inset 0 0 0 1px ${withAlpha(tints[0], 0.3)}, 0 18px 40px -26px ${withAlpha(tints[1], 0.6)}`,
  };
  const sceneHeight = RH * k;

  // O nome em degradê das três cores.
  const title = (size: string) => (
    <span
      style={{
        ...PIXEL,
        backgroundImage: `linear-gradient(95deg, ${tints[0]}, ${PAPER} 45%, ${tints[2]})`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        filter: `drop-shadow(0 0 12px ${withAlpha(tints[1], 0.45)})`,
      }}
      className={`block leading-[1.05] break-words ${size}`}
    >
      {name}
    </span>
  );
  const subtitle = (className: string) =>
    hasPersona && persona?.code && text ? (
      <span className={className} style={{ color: '#CFC6EC' }}>
        <PersonaCode code={persona.code} className="mr-1.5 text-[15px] leading-none tracking-[0.08em]" />
        {text.title}
      </span>
    ) : (
      <span className={className} style={{ color: '#CFC6EC' }}>
        {emptyHint}
      </span>
    );

  // o fio com as três cores, no alto do cartão
  const thread = (
    <span aria-hidden className="pointer-events-none absolute left-5 right-5 top-0 z-[1] flex h-[2px] overflow-hidden rounded-full opacity-80">
      {tints.map((color, index) => (
        <span key={index} className="flex-1" style={{ background: color, boxShadow: `0 0 10px 1px ${withAlpha(color, 0.6)}` }} />
      ))}
    </span>
  );

  const scene =
    world && st ? (
      <PersonaScene world={world} state={st} scale={k} extras={doors.extras} hotspots={doors.hotspots} label={st.code ? t('personaWorld.sceneLabel', { code: st.code }) : t('personaWorld.sceneLabelEmpty')} />
    ) : failed ? (
      <div className="grid place-items-center px-5 text-center" style={{ height: sceneHeight }}>
        <div>
          <p className="text-[15px]" style={{ color: MIST }}>
            {t('personaWorld.loadError')}
          </p>
          {onRetry && (
            <button type="button" onClick={onRetry} className={`mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-medium transition hover:border-white/35 hover:bg-white/5 ${FOCUS_RING}`} style={{ color: PAPER }}>
              <RotateCw className="h-[18px] w-[18px] text-violet-300" aria-hidden />
              {t('personaWorld.retry')}
            </button>
          )}
        </div>
      </div>
    ) : (
      <div className="animate-pulse rounded-xl bg-white/[0.04]" style={{ height: sceneHeight }} aria-busy="true" aria-label={t('personaWorld.loading')} />
    );

  return (
    // Lado a lado, a cena e a coluna do nome ficam juntas no meio do cartão: na
    // home a coluna ocupa o que sobra; no perfil, que é mais largo, ela para
    // em 340 px e o conjunto fica centrado, sem um vazio à direita.
    <div ref={cardRef} className={`relative h-full overflow-hidden rounded-2xl max-[359px]:rounded-none ${side ? 'flex items-stretch justify-center gap-4 p-4' : ''}`} style={cardStyle}>
      {thread}
      {side ? (
        <>
          <div className="shrink-0 self-center" style={{ width: RW * k }}>
            {scene}
          </div>
          <div className="flex min-w-0 max-w-[340px] flex-1 flex-col py-2 pr-2">
            {title(k === 3 ? 'text-[26px]' : 'text-[30px]')}
            {subtitle('mt-2.5 block text-sm leading-snug')}

            {hasPersona ? (
              <div className="mt-5 grid max-w-[260px] grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-[7px]">
                {topScores.map((row) => {
                  const mood = MOOD_BY_KEY[row.moodKey];
                  if (!mood) return null;
                  return (
                    <React.Fragment key={row.moodKey}>
                      <span className="grid h-[16px] w-[16px] place-items-center rounded-[4px] text-[10px] leading-none" style={{ ...PIXEL, color: mood.color, background: withAlpha(mood.color, 0.18), boxShadow: `inset 0 0 0 1px ${withAlpha(mood.color, 0.45)}` }} aria-hidden>
                        {mood.letter}
                      </span>
                      <span className="max-w-[8.5rem] truncate text-[12px] font-semibold leading-none" style={{ color: mood.color }}>
                        {t(mood.labelKey)}
                      </span>
                      <span className="block h-[3px] overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (row.score / topMax) * 100)}%`, background: mood.color, boxShadow: `0 0 6px ${withAlpha(mood.color, 0.6)}` }} />
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            ) : (
              world && (
                <div className="mt-5 flex max-w-[240px] items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                    <span className="block h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400" style={{ width: `${(counted / threshold) * 100}%` }} />
                  </span>
                  <span style={{ ...PIXEL, color: PAPER }} className="text-sm leading-none tabular-nums">
                    {counted}/{threshold}
                  </span>
                </div>
              )
            )}

            {/* o nível do estúdio: quantos títulos já foram avaliados e quantos o próximo nível pede */}
            {st && st.level > 0 && (
              <div className="mt-5 max-w-[260px]" role="img" aria-label={`${levelText(t, st)}. ${st.nextAt ? t('personaWorld.level.count', { rated: st.rated, next: st.nextAt }) : t('personaWorld.level.total', { rated: st.rated })}`}>
                <p style={{ ...PIXEL, color: PAPER }} className="whitespace-nowrap text-[13px] leading-none">
                  {levelText(t, st)}
                </p>
                <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${st.nextAt ? Math.max(3, Math.round(st.levelBar * 100)) : 100}%`, background: `linear-gradient(90deg, ${tints[0]}, ${tints[2]})` }} />
                </div>
                <p className="mt-1.5 text-[12px] leading-none tabular-nums" style={{ color: MIST }}>
                  {st.nextAt ? t('personaWorld.level.toward', { rated: st.rated, next: st.nextAt }) : t('personaWorld.level.total', { rated: st.rated })}
                </p>
              </div>
            )}

            <p className="mt-auto pt-5 text-[13px] leading-snug" style={{ color: MIST }}>
              {t('studio.hint')}
            </p>
            <button type="button" onClick={onOpen} className={`group mt-3 inline-flex items-center gap-2 self-start rounded-xl text-sm font-semibold ${FOCUS_RING}`} style={{ color: PAPER }} aria-label={openAria}>
              {t('studio.open')}
              <DoorArrow colors={tints} />
            </button>
          </div>
        </>
      ) : (
        <>
          <button type="button" onClick={onOpen} className={`group flex w-full items-center justify-start gap-3 px-4 pb-1 pt-4 text-left sm:px-5 ${FOCUS_RING}`} aria-label={openAria}>
            <span className="min-w-0 flex-1">
              {title('text-[22px] sm:text-[28px]')}
              {subtitle('mt-1.5 block text-[13px] sm:text-sm leading-snug')}
            </span>
            <DoorArrow colors={tints} />
          </button>
          {scene}
          <p className="px-4 pb-3.5 pt-0.5 text-center text-[13px] leading-snug sm:px-5" style={{ color: MIST }}>
            {t('studio.hint')}
          </p>
        </>
      )}
    </div>
  );
};

export default StudioCard;
