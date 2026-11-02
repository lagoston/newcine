import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { FOCUS_RING } from '../../lib/oracleTheme';
import { fetchJackpotCatalog, fetchJackpotState, loadJackpotFont, type CatalogPoster, type JackpotState, type PosterEffect } from '../../lib/posterJackpot';
import PosterArt from './PosterArt';
import { JACKPOT_CHIPS_EVENT } from '../../lib/flyingChip';
import { DOOR_ART, DOOR_BODY, DOOR_CHIPS, DOOR_CLASS, DOOR_CTA, DOOR_FAN, DOOR_HINT } from '../home/doorLayout';
import { ChipFace } from './Chips';
import { RarityGem } from './CollectorMark';
import PosterJackpotSheet, { type JackpotTab } from './PosterJackpotSheet';
import '../../styles/posterJackpot.css';

// A porta do Poster Jackpot (na home desde 02/11/2026, com a Central dos
// Oráculos extinta; mesma geometria das outras portas, em home/doorLayout):
// o mesmo céu estrelado e o ouro da
// roleta, com três pôsteres do catálogo em leque (o do meio holográfico,
// para mostrar o efeito), as fichas, o Giro da Sorte pronto e o aviso de
// missão pronta. Só aparece
// para quem a roleta está liberada (poster_jackpot_settings).
const FAN: { rotate: number; x: number; effect: PosterEffect; z: number }[] = [
  { rotate: -11, x: -30, effect: 'none', z: 1 },
  { rotate: 11, x: 30, effect: 'none', z: 1 },
  { rotate: 0, x: 0, effect: 'holo', z: 2 },
];

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

  // Lendário no meio, épico e raro dos lados (o que houver).
  const fan = useMemo(() => {
    const by = (rarity: CatalogPoster['rarity']) => catalog.find((p) => p.rarity === rarity);
    const picks = [by('epic'), by('rare'), by('legendary')].map((p, i) => p || catalog[i]).filter(Boolean) as CatalogPoster[];
    return picks.length === 3 ? picks : [];
  }, [catalog]);

  const patch = useCallback((value: Partial<JackpotState>) => setState((prev) => (prev ? { ...prev, ...value } : prev)), []);

  // Carregando: o lugar da porta já fica reservado (as três portas não pulam).
  if (!state) {
    return <span className={`${DOOR_CLASS} pointer-events-none animate-pulse`} style={{ background: 'rgba(15,22,69,0.6)', minHeight: 120 }} aria-hidden />;
  }
  if (!state.enabled) return null;
  const claimable = state.missions.filter((m) => !m.claimed && m.progress >= m.target).length;

  return (
    <>
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
          <span className={DOOR_CHIPS}>
            <span className="inline-flex items-center gap-1 rounded-full pl-1 pr-2 py-0.5 text-[12px] font-semibold" style={{ background: 'rgba(94,168,255,0.18)', color: '#CFE3FF' }}>
              <ChipFace className="w-4 h-4" />
              {t('jackpot.chips.normalAria', { count: state.tickets })}
            </span>
            {state.specialCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full pl-1 pr-2 py-0.5 text-[12px] font-semibold" style={{ background: 'rgba(255,122,217,0.18)', color: '#FFD3F1' }}>
                <ChipFace kind="special" className="w-4 h-4" />
                {t('jackpot.chips.specialAria', { count: state.specialCount })}
              </span>
            )}
            {state.luckySpins > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-0.5 text-[12px] font-semibold" style={{ background: 'rgba(244,196,84,0.18)', color: '#FFE8A3', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.5)' }}>
                <RarityGem rarity="legendary" glint className="w-3.5 h-3.5" />
                {t('jackpot.lucky.doorReady', { count: state.luckySpins })}
              </span>
            )}
            {claimable > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: '#F4C454', color: '#2A1A00' }}>
                {t('jackpot.door.claimable', { count: claimable })}
              </span>
            )}
          </span>
        </span>
        <span className={DOOR_CTA} style={{ color: '#FFE8A3' }}>
          {t('oracle.hub.play')}
          <ArrowRight className="w-4 h-4 transition group-hover:translate-x-0.5" aria-hidden />
        </span>
      </button>
      <PosterJackpotSheet open={open} onClose={() => setOpen(false)} state={state} onState={patch} onReload={reload} initialTab={initialTab} />
    </>
  );
};

export default PosterJackpotDoor;
