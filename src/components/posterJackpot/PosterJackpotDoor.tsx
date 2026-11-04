import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../lib/auth';
import { FOCUS_RING } from '../../lib/oracleTheme';
import { claimDailyChip, fetchJackpotCatalog, fetchJackpotState, loadJackpotFont, markJackpotGiftSeen, type CatalogPoster, type DailyReward, type JackpotState, type PosterEffect } from '../../lib/posterJackpot';
import { primeJackpotAudio } from '../../lib/jackpotSound';
import PosterArt from './PosterArt';
import { JACKPOT_CHIPS_EVENT } from '../../lib/flyingChip';
import { DOOR_ART, DOOR_BODY, DOOR_CLASS, DOOR_CTA, DOOR_CTA_LABEL, DOOR_FAN, DOOR_HINT } from '../home/doorLayout';
import JackpotArrow from './JackpotArrow';
import { ChipFace } from './Chips';
import { JACKPOT_TOAST_STYLE } from './jackpotToast';
import { DailyChipBalloon } from './DailyChip';
import PosterJackpotSheet, { type JackpotTab } from './PosterJackpotSheet';
import '../../styles/posterJackpot.css';
import '../../styles/flyingChip.css';

// A porta do Poster Jackpot (na home desde 02/11/2026, com a Central dos
// Oráculos extinta; mesma geometria das outras portas, em home/doorLayout):
// o mesmo céu estrelado e o ouro da
// roleta, com três pôsteres do catálogo em leque (o do meio holográfico,
// para mostrar o efeito), o título e a frase. Desde 02/11/2026 (noite) está
// mais limpa: o saldo de fichas e as etiquetas de "Giro da Sorte pronto" e
// "missão pronta" saíram; à direita, a seta de letreiro (JackpotArrow), com
// o número do que está esperando a pessoa (missões prontas + Giros da Sorte).
// Só aparece
// para quem a roleta está liberada (poster_jackpot_settings).
// Desde 02/11/2026, enquanto a ficha grátis do dia não foi pega, um balão
// sai da porta ("Ficha grátis!", DailyChip.tsx). Tocar nele pega a ficha e
// abre a gaveta na aba Missões, com a recompensa no topo e as missões logo
// embaixo.
const FAN: { rotate: number; x: number; effect: PosterEffect; z: number }[] = [
  { rotate: -11, x: -30, effect: 'none', z: 1 },
  { rotate: 11, x: 30, effect: 'none', z: 1 },
  { rotate: 0, x: 0, effect: 'holo', z: 2 },
];

// 04/11/2026 (pedido do Bruno): o leque volta a ser o do começo, os três pôsteres de
// Breaking Bad (o épico à esquerda, o raro à direita, o lendário no meio). Os dois
// laterais nunca mudam; o do meio troca todo dia (dia de Brasília) e passa por todos
// os lendários da roleta, na ordem do número de colecionador. O rodízio começa em
// 04/11/2026 com o Breaking Bad lendário (Lendário 001); quando entra um lendário
// novo, ele simplesmente passa a fazer parte da volta.
const BREAKING_BAD_TV_ID = 1396;
const FAN_ROTATION_START = Date.UTC(2026, 10, 4);
const DAY_MS = 86_400_000;

// Quantos dias de Brasília se passaram desde o começo do rodízio.
function brasiliaDayIndex(now: Date = new Date()): number {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - FAN_ROTATION_START) / DAY_MS);
}

// [esquerda, direita, meio] — a ordem de FAN.
function pickFan(catalog: CatalogPoster[], day: number): CatalogPoster[] {
  const breakingBad = (rarity: CatalogPoster['rarity']) =>
    catalog.find((p) => p.media_type === 'tv' && p.tmdb_id === BREAKING_BAD_TV_ID && p.rarity === rarity);
  const legendaries = catalog
    .filter((p) => p.rarity === 'legendary')
    .sort((a, b) => (a.serial ?? Number.MAX_SAFE_INTEGER) - (b.serial ?? Number.MAX_SAFE_INTEGER) || a.id - b.id);
  const center = legendaries.length ? legendaries[((day % legendaries.length) + legendaries.length) % legendaries.length] : breakingBad('legendary');
  const picks = [breakingBad('epic'), breakingBad('rare'), center];
  if (picks.every(Boolean)) return picks as CatalogPoster[];
  // Sem algum Breaking Bad no catálogo (tirado da roleta, por exemplo): o primeiro da
  // raridade, como antes, para a porta nunca ficar sem leque.
  const by = (rarity: CatalogPoster['rarity']) => catalog.find((p) => p.rarity === rarity);
  const fallback = [picks[0] ?? by('epic'), picks[1] ?? by('rare'), picks[2] ?? by('legendary')].filter(Boolean) as CatalogPoster[];
  return fallback.length === 3 ? fallback : [];
}

const PosterJackpotDoor: React.FC = () => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [state, setState] = useState<JackpotState | null>(null);
  const [catalog, setCatalog] = useState<CatalogPoster[]>([]);
  const [open, setOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<JackpotTab>('machine');
  const location = useLocation();
  const navigate = useNavigate();
  // Aberto de fora (sussurros: o convite do lançamento e as trocas; stories):
  // navigate('/', { state: { openJackpot: 'trades' } }).
  const requested = (location.state as { openJackpot?: JackpotTab } | null)?.openJackpot;
  useEffect(() => {
    if (!requested) return;
    setInitialTab(requested);
    setOpen(true);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [requested, navigate, location.pathname, location.search]);

  const reload = useCallback(() => {
    if (!userId) return;
    fetchJackpotState()
      .then(setState)
      .catch((error) => console.error('Poster Jackpot state:', error));
  }, [userId]);

  // O presente da sexta-feira 13 (02/11/2026): quem tem a Scary Clown ganha 3
  // fichas especiais à meia-noite do dia; na primeira vez que a home abre
  // depois disso, um aviso conta de onde vieram (uma vez só: o servidor marca
  // como visto).
  const giftShown = useRef(false);
  const gift = state?.gift;
  useEffect(() => {
    if (!gift || giftShown.current) return;
    giftShown.current = true;
    toast(
      <span className="fc-toast">
        <span className="fc-toast-title">{t('jackpot.gift.friday13Title')}</span>
        <span className="fc-toast-body">{t('jackpot.gift.friday13Body', { count: gift.amount })}</span>
      </span>,
      { id: 'jackpot-gift', icon: <ChipFace kind="special" className="fc-toast-chip" />, style: JACKPOT_TOAST_STYLE, duration: 7000 },
    );
    markJackpotGiftSeen().catch(() => undefined);
  }, [gift, t]);
  useEffect(() => {
    reload();
  }, [reload]);
  // Uma ficha voadora pega em qualquer lugar do site atualiza as fichas da
  // porta (e da gaveta, se estiver aberta).
  useEffect(() => {
    window.addEventListener(JACKPOT_CHIPS_EVENT, reload);
    return () => window.removeEventListener(JACKPOT_CHIPS_EVENT, reload);
  }, [reload]);

  const enabled = !!state?.enabled;
  useEffect(() => {
    if (!enabled) return;
    loadJackpotFont();
    fetchJackpotCatalog()
      .then(setCatalog)
      .catch(() => undefined);
  }, [enabled]);

  // Breaking Bad épico e raro dos lados; no meio, o lendário do dia (pickFan).
  const fan = useMemo(() => pickFan(catalog, brasiliaDayIndex()), [catalog]);

  const patch = useCallback((value: Partial<JackpotState>) => setState((prev) => (prev ? { ...prev, ...value } : prev)), []);

  // A ficha do dia: o balão estoura (~0,4 s) enquanto o banco registra a
  // ficha; depois a gaveta abre em Missões com a recompensa.
  const [dailyReward, setDailyReward] = useState<DailyReward | null>(null);
  const [claimingDaily, setClaimingDaily] = useState(false);
  const claimDaily = useCallback(async () => {
    if (claimingDaily) return;
    setClaimingDaily(true);
    primeJackpotAudio();
    const started = Date.now();
    try {
      const res = await claimDailyChip();
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, 420 - (Date.now() - started))));
      if (res.ok && res.tickets !== null) {
        patch({ tickets: res.tickets, dailyChip: false });
        setDailyReward({ tickets: res.tickets, at: Date.now() });
        setInitialTab('missions');
        setOpen(true);
      } else {
        // Já pega hoje (outro aparelho) ou o Jackpot fechou: o balão some.
        patch(res.tickets !== null ? { tickets: res.tickets, dailyChip: false } : { dailyChip: false });
        if (res.reason === 'already') {
          toast(t('jackpot.daily.already'), { id: 'jackpot-daily', icon: <ChipFace className="fc-toast-chip" />, style: JACKPOT_TOAST_STYLE, duration: 3500 });
        }
      }
    } catch (error) {
      console.error('Poster Jackpot daily chip:', error);
      toast.error(t('jackpot.daily.error'));
    } finally {
      setClaimingDaily(false);
    }
  }, [claimingDaily, patch, t]);

  // Carregando: o lugar da porta já fica reservado (as três portas não pulam).
  if (!state) {
    return <span className={`${DOOR_CLASS} pointer-events-none animate-pulse`} style={{ background: 'rgba(15,22,69,0.6)', minHeight: 120 }} aria-hidden />;
  }
  if (!state.enabled) return null;
  const claimable = state.missions.filter((m) => !m.claimed && m.progress >= m.target).length;
  // O número no canto da seta: missões prontas para resgatar + Giros da Sorte.
  const waiting = claimable + state.luckySpins;

  return (
    // relative: o balão da ficha do dia sai por cima da porta (que recorta
    // o que passa da borda).
    <div className="relative h-full">
      <button
        type="button"
        onClick={() => {
          setInitialTab('machine');
          setOpen(true);
        }}
        className={`${DOOR_CLASS} ${FOCUS_RING}`}
        style={{
          background: 'radial-gradient(80% 120% at 12% 0%, rgba(80,96,220,0.4), transparent 65%), linear-gradient(135deg, #0f1645, #0a0e2c 55%, #1a0b3a)',
          boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.5), 0 18px 40px -26px rgba(244,196,84,0.45)',
        }}
      >
        <span className="pj-stars" aria-hidden />
        {/* Leque de pôsteres */}
        <span className={DOOR_ART} aria-hidden>
          <span className={DOOR_FAN}>
          {fan.length === 3 &&
            fan.map((poster, i) => (
              <span
                key={poster.id}
                className="absolute left-1/2 top-1/2 w-[52px] sm:w-[62px] transition-transform duration-300"
                style={{
                  transform: `translate(calc(-50% + ${FAN[i].x}px), -50%) rotate(${FAN[i].rotate}deg)`,
                  zIndex: FAN[i].z,
                }}
              >
                <PosterArt
                  filePath={poster.file_path}
                  effect={FAN[i].effect}
                  size="w185"
                  className="aspect-[2/3] rounded-lg shadow-[0_10px_20px_-8px_rgba(0,0,0,0.9)]"
                />
              </span>
            ))}
          <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-0 h-0 z-[3]" style={{ borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '10px solid #F4C454', filter: 'drop-shadow(0 0 5px rgba(255,214,120,0.9))' }} />
          </span>
        </span>
        <span className={DOOR_BODY}>
          <span className="pj-display pj-gold-text block text-[22px] sm:text-[28px] font-black leading-none">Poster Jackpot</span>
          <span className={DOOR_HINT} style={{ color: '#CFC6EC' }}>
            {t('jackpot.door.hint')}
          </span>
          {/* O que está esperando a pessoa, para quem lê a tela (o número
              aparece no canto da seta). */}
          {waiting > 0 && <span className="sr-only">{t('jackpot.door.waitingAria', { count: waiting })}</span>}
        </span>
        <span className={DOOR_CTA} style={{ color: '#FFE8A3' }}>
          <span className={DOOR_CTA_LABEL}>{t('oracle.hub.play')}</span>
          <JackpotArrow badge={waiting} />
        </span>
      </button>
      {/* No canto de cima à direita, metade para fora da porta: no celular,
          uma pílula montada na borda, quase toda acima dela (só o rabicho
          entra, à direita do título — cabe até em 360 px); no
          tablet, em cima do "Jogar"; no computador, ao lado do leque. */}
      <DailyChipBalloon
        show={state.dailyChip && !open}
        claiming={claimingDaily}
        onClaim={claimDaily}
        className="right-2 -top-[25px] sm:right-4 sm:-top-6 lg:-top-7"
      />
      <PosterJackpotSheet
        open={open}
        onClose={() => {
          setOpen(false);
          setDailyReward(null);
        }}
        state={state}
        onState={patch}
        onReload={reload}
        initialTab={initialTab}
        dailyReward={dailyReward}
      />
    </div>
  );
};

export default PosterJackpotDoor;
