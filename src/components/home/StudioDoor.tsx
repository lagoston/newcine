import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';
import PersonalityCompletionModal from '../PersonalityCompletionModal';
import { PersonaCode } from '../PersonaBits';
import DoorArrow from './DoorArrow';
import { MOOD_BY_KEY, MOOD_BY_LETTER, type Mood } from '../../lib/moods';
import { personaText, topMoodKeys, PERSONA_THRESHOLD } from '../../lib/persona';
import { markRevealSeen, revealModeFor, type RevealMode } from '../../lib/personaReveal';
import { fetchPersonaWorld, worldState, type PersonaWorld } from '../../lib/personaWorld';
import { FOCUS_RING, MIST, PAPER, PIXEL, withAlpha } from '../../lib/oracleTheme';
import { PersonaScene } from '../personaWorld/PersonaScene';
import { RH, RW } from '../personaWorld/draw';
import { useStudioDoors, type StudioJackpot } from '../personaWorld/useStudioDoors';
import { rememberPatronus } from '../patronus/patronus';
import { useJackpotDoor } from '../posterJackpot/useJackpotDoor';
import { DailyChipBalloon } from '../posterJackpot/DailyChip';

// O estúdio, na home (14/11/2026).
//
// Pedido do Bruno: "O botão da home 'Sua Persona' deve refletir completamente
// o 'estúdio' do usuário, inclusive em tamanho, pois tomará o espaço dos
// botões do jackpot e poker, que agora se tornarão objetos dentro do 'estúdio'
// do usuário: uma máquina caça-níquel e uma mesa. [...] Os itens devem ser
// clicáveis para acessar os jogos."
//
// Antes eram três portas e um ingresso lado a lado (a do Jackpot, a da Persona
// e o ingresso do Pôquer). Agora é uma coisa só: o estúdio da pessoa, vivo, do
// tamanho das três juntas. Nele:
//   • a máquina caça-níquel abre o Poster Jackpot (a luz pisca e um número
//     aparece quando há algo esperando; o balão da ficha do dia sai dela);
//   • a mesa leva ao Pôster Poker (só para quem tem o pôquer liberado);
//   • o aquário leva à Watchlist, o livro abre a história da mariposa e a
//     caixa de papelão (para quem tem a tag) leva ao Clube do Terror;
//   • tocar em qualquer outro ponto abre a gaveta "Sua Persona".
// A porta da Biblioteca dos Oráculos continua ao lado, como estava.
//
// O desenho:
//   • celular e tablet: o nome em cima (um botão, com a seta), a cena e a dica
//     embaixo. No celular a cena fica em 2× e o cartão quase encosta nas
//     bordas da tela, para ela caber inteira em 360 px;
//   • computador: a cena à esquerda e, ao lado, quem é a pessoa (o código, o
//     título, as três prateleiras do código, a bitola) e o botão de abrir. A
//     cena fica em 3× quando a janela tem altura para isso (780 px), senão 2×.
//
// Tudo o que as portas antigas faziam continua: a revelação da Persona (uma
// vez por personalidade), a abertura de fora (navigate('/', { state: {
// openPersona: true } }) e openJackpot), o presente da sexta-feira 13, as
// fichas voadoras.

const DEFAULT_TINTS = ['#A78BFA', '#F0ABFC', '#38BDF8'];

// A gaveta e o livro só são baixados quando alguém abre.
const PersonaWorldSheet = lazy(() => import('../personaWorld/PersonaWorldSheet'));
const EvolutionBook = lazy(() => import('../personaWorld/EvolutionBook'));

// A escala da cena e o desenho do cartão (lado a lado no computador).
function useDoorLayout(ref: React.RefObject<HTMLDivElement>): { side: boolean; k: number } {
  const compute = useCallback((width: number) => {
    const side = window.matchMedia('(min-width: 1024px)').matches;
    if (side) return { side, k: width - 32 - RW * 3 >= 190 && window.innerHeight >= 780 ? 3 : 2 };
    // de 316 a 359 px a cena de 2× passa um pouco da borda (só as pontas das paredes são cortadas)
    return { side, k: width >= RW * 3 ? 3 : width + 44 >= RW * 2 ? 2 : 1 };
  }, []);
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

const StudioDoor: React.FC<{ userId: string; username: string | null }> = ({ userId, username }) => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [world, setWorld] = useState<PersonaWorld | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  // a gaveta fica montada depois da primeira abertura (para a saída animar)
  const [sheetMounted, setSheetMounted] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [reveal, setReveal] = useState<RevealMode | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { side, k } = useDoorLayout(cardRef);

  const load = useCallback(() => {
    setFailed(false);
    fetchPersonaWorld(userId)
      .then((value) => {
        if (!value) {
          setFailed(true);
          return;
        }
        setWorld(value);
        // a mariposa de luz do menu dos títulos (o Patrono) é a desta cena
        rememberPatronus(userId, value);
        const persona = value.persona;
        if (persona?.code && persona.persona) {
          const mode = revealModeFor(userId, persona.code, persona.persona.tmdbId);
          if (mode) setReveal(mode);
        }
      })
      .catch((error) => {
        console.error('Studio door:', error);
        setFailed(true);
      });
  }, [userId]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (open) setSheetMounted(true);
  }, [open]);

  // Aberta de fora (perfil, links antigos da Central).
  const requested = (location.state as { openPersona?: boolean } | null)?.openPersona;
  useEffect(() => {
    if (!requested) return;
    setOpen(true);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [requested, navigate, location.pathname, location.search]);

  const persona = world?.persona ?? null;
  const closeReveal = () => {
    if (persona?.code) markRevealSeen(userId, persona.code, persona.persona?.tmdbId ?? null);
    setReveal(null);
  };

  // ---- a máquina do Jackpot: tudo o que a porta fazia ----
  const jackpot = useJackpotDoor();
  const { enabled, waiting, dailyChip, claimingDaily, sheetOpen, open: openJackpot, claimDaily } = jackpot;
  const studioJackpot: StudioJackpot = useMemo(
    () => ({
      enabled,
      waiting,
      alert: waiting > 0 || dailyChip,
      onOpen: () => openJackpot('machine'),
      // o balão da ficha do dia sai de cima da máquina e cresce para a esquerda (o rabicho aponta para ela)
      above: <DailyChipBalloon show={dailyChip && !sheetOpen} claiming={claimingDaily} onClaim={claimDaily} className="pj-daily-left bottom-[10px] -right-[29px]" />,
    }),
    [enabled, waiting, dailyChip, sheetOpen, claimingDaily, claimDaily, openJackpot],
  );
  const openBook = useCallback(() => setBookOpen(true), []);
  const doors = useStudioDoors({ world, isOwn: true, ownerUsername: username, onOpenBook: openBook, jackpot: studioJackpot });
  // dentro da gaveta a máquina fecha a gaveta antes de abrir o Jackpot, e o balão fica só aqui na home
  const sheetJackpot: StudioJackpot = useMemo(
    () => ({
      enabled,
      waiting,
      alert: waiting > 0 || dailyChip,
      onOpen: () => {
        setOpen(false);
        openJackpot('machine');
      },
    }),
    [enabled, waiting, dailyChip, openJackpot],
  );

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

  const cardStyle: React.CSSProperties = {
    background: [
      `radial-gradient(58% 52% at ${side ? '36%' : '50%'} 64%, ${withAlpha(tints[0], 0.17)}, transparent 72%)`,
      `radial-gradient(70% 120% at 100% 0%, ${withAlpha(tints[1], 0.13)}, transparent 60%)`,
      'linear-gradient(135deg, #1a1030, #0f0a1c 55%, #170c26)',
    ].join(', '),
    boxShadow: `inset 0 0 0 1px ${withAlpha(tints[0], 0.3)}, 0 18px 40px -26px ${withAlpha(tints[1], 0.6)}`,
  };
  const sceneHeight = RH * k;
  const openSheet = () => setOpen(true);
  const doorAria = hasPersona && persona?.code && text ? t('home.persona.doorAria', { code: persona.code, title: text.title }) : t('home.persona.doorAriaEmpty');

  // O título em degradê das três cores (o mesmo da porta antiga).
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
      className={`block leading-none ${size}`}
    >
      {t('home.persona.title')}
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
        {t('home.persona.hintEmpty', { count: threshold })}
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
      <PersonaScene
        world={world}
        state={st}
        scale={k}
        onPick={openSheet}
        extras={doors.extras}
        hotspots={doors.hotspots}
        label={st.code ? t('personaWorld.sceneLabel', { code: st.code }) : t('personaWorld.sceneLabelEmpty')}
      />
    ) : failed ? (
      <div className="grid place-items-center px-5 text-center" style={{ height: sceneHeight }}>
        <div>
          <p className="text-[15px]" style={{ color: MIST }}>
            {t('personaWorld.loadError')}
          </p>
          <button type="button" onClick={load} className={`mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-medium transition hover:border-white/35 hover:bg-white/5 ${FOCUS_RING}`} style={{ color: PAPER }}>
            <RotateCw className="h-[18px] w-[18px] text-violet-300" aria-hidden />
            {t('personaWorld.retry')}
          </button>
        </div>
      </div>
    ) : (
      <div className="animate-pulse rounded-xl bg-white/[0.04]" style={{ height: sceneHeight }} aria-busy="true" aria-label={t('personaWorld.loading')} />
    );

  return (
    <>
      <div ref={cardRef} className={`relative h-full overflow-hidden rounded-2xl max-[359px]:rounded-none ${side ? 'flex items-stretch gap-4 p-4' : ''}`} style={cardStyle}>
        {thread}
        {side ? (
          <>
            <div className="shrink-0 self-center" style={{ width: RW * k }}>
              {scene}
            </div>
            <div className="flex min-w-0 flex-1 flex-col py-2 pr-2">
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
                <div className="mt-5 flex max-w-[240px] items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                    <span className="block h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400" style={{ width: `${(counted / threshold) * 100}%` }} />
                  </span>
                  <span style={{ ...PIXEL, color: PAPER }} className="text-sm leading-none tabular-nums">
                    {counted}/{threshold}
                  </span>
                </div>
              )}

              {/* a bitola: onde a mariposa está e o que vem depois */}
              {st && st.stage >= 2 && (
                <div className="mt-5 max-w-[260px]" role="img" aria-label={st.nextGaugeKey ? `${t(`personaWorld.gauges.${st.gaugeKey}`)}. ${t('personaWorld.plate.gaugeAria', { pct: Math.round(st.gaugeBar * 100), next: t(`personaWorld.gauges.${st.nextGaugeKey}`) })}` : t(`personaWorld.gauges.${st.gaugeKey}`)}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px] leading-none">
                    <span style={{ ...PIXEL, color: PAPER }}>{t(`personaWorld.gauges.${st.gaugeKey}`)}</span>
                    {st.nextGaugeKey && <span style={{ ...PIXEL, color: MIST }}>{t(`personaWorld.gauges.${st.nextGaugeKey}`)}</span>}
                  </div>
                  <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${st.nextGaugeKey ? Math.max(3, Math.round(st.gaugeBar * 100)) : 100}%`, background: `linear-gradient(90deg, ${tints[0]}, ${tints[2]})` }} />
                  </div>
                </div>
              )}

              <p className="mt-auto pt-5 text-[13px] leading-snug" style={{ color: MIST }}>
                {t('studio.hint')}
              </p>
              <button type="button" onClick={openSheet} className={`group mt-3 inline-flex items-center gap-2 self-start rounded-xl text-sm font-semibold ${FOCUS_RING}`} style={{ color: PAPER }} aria-label={doorAria}>
                {t('studio.open')}
                <DoorArrow colors={tints} />
              </button>
            </div>
          </>
        ) : (
          <>
            <button type="button" onClick={openSheet} className={`group flex w-full items-center justify-start gap-3 px-4 pb-1 pt-4 text-left sm:px-5 ${FOCUS_RING}`} aria-label={doorAria}>
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

      {jackpot.sheet}

      {sheetMounted && (
        <Suspense fallback={null}>
          <PersonaWorldSheet
            open={open}
            onClose={() => {
              setOpen(false);
              load();
            }}
            ownerId={userId}
            isOwn
            persona={persona}
            initialWorld={world}
            viewerId={userId}
            username={username}
            onUserClick={(name) => navigate(`/profile/${name}`)}
            jackpot={sheetJackpot}
          />
        </Suspense>
      )}

      {bookOpen && world && (
        <Suspense fallback={null}>
          <EvolutionBook world={world} isOwn ownerName={null} extras={doors.extras} onClose={() => setBookOpen(false)} />
        </Suspense>
      )}

      {reveal && persona && <PersonalityCompletionModal isOpen onClose={closeReveal} persona={persona} changed={reveal === 'changed'} recast={reveal === 'recast'} />}
    </>
  );
};

export default StudioDoor;
