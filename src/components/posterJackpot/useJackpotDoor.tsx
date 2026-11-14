import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../lib/auth';
import { claimDailyChip, fetchJackpotState, loadJackpotFont, markJackpotGiftSeen, type DailyReward, type JackpotState } from '../../lib/posterJackpot';
import { primeJackpotAudio } from '../../lib/jackpotSound';
import { JACKPOT_CHIPS_EVENT } from '../../lib/flyingChip';
import { ChipFace } from './Chips';
import { JACKPOT_TOAST_STYLE } from './jackpotToast';
import PosterJackpotSheet, { type JackpotTab } from './PosterJackpotSheet';
import '../../styles/posterJackpot.css';
import '../../styles/flyingChip.css';

// A entrada do Poster Jackpot na home, sem a porta (14/11/2026).
//
// Pedido do Bruno: a porta do Jackpot saiu da home e virou um objeto do
// estúdio da pessoa, a máquina caça-níquel. Tudo o que a porta fazia continua
// aqui, igual (veio de PosterJackpotDoor, que foi apagado):
//   • o estado da roleta (se está liberada, as fichas, as missões);
//   • a gaveta, e a abertura dela de fora (sussurros, stories:
//     navigate('/', { state: { openJackpot: 'trades' } }));
//   • o que está esperando a pessoa (missões prontas + Giros da Sorte): o
//     número que ficava na seta da porta agora fica na máquina;
//   • a ficha grátis do dia (o balão), que agora sai da máquina;
//   • o aviso do presente da sexta-feira 13;
//   • as fichas voadoras atualizando o saldo.
// Quem usa decide onde desenhar a máquina e o balão; a gaveta (sheet) é
// montada uma vez, em qualquer lugar da tela.

export interface JackpotDoor {
  // null enquanto carrega
  state: JackpotState | null;
  // a roleta está liberada para esta pessoa
  enabled: boolean;
  // missões prontas para resgatar + Giros da Sorte guardados
  waiting: number;
  // a ficha grátis de hoje ainda está esperando
  dailyChip: boolean;
  claimingDaily: boolean;
  sheetOpen: boolean;
  open: (tab?: JackpotTab) => void;
  claimDaily: () => void;
  sheet: React.ReactNode;
}

export function useJackpotDoor(): JackpotDoor {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [state, setState] = useState<JackpotState | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<JackpotTab>('machine');
  const location = useLocation();
  const navigate = useNavigate();
  // Aberto de fora (sussurros: o convite do lançamento e as trocas; stories).
  const requested = (location.state as { openJackpot?: JackpotTab } | null)?.openJackpot;
  useEffect(() => {
    if (!requested) return;
    setInitialTab(requested);
    setSheetOpen(true);
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
  // Uma ficha voadora pega em qualquer lugar do site atualiza as fichas.
  useEffect(() => {
    window.addEventListener(JACKPOT_CHIPS_EVENT, reload);
    return () => window.removeEventListener(JACKPOT_CHIPS_EVENT, reload);
  }, [reload]);

  // O presente da sexta-feira 13: quem está usando a Scary Clown ganha 3 fichas
  // especiais; na primeira vez que a home abre depois disso, um aviso conta de
  // onde vieram (uma vez só: o servidor marca como visto).
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

  const enabled = !!state?.enabled;
  useEffect(() => {
    if (enabled) loadJackpotFont();
  }, [enabled]);

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
        setSheetOpen(true);
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

  const open = useCallback((tab: JackpotTab = 'machine') => {
    setInitialTab(tab);
    setSheetOpen(true);
  }, []);

  const claimable = state ? state.missions.filter((m) => !m.claimed && m.progress >= m.target).length : 0;
  const waiting = state && enabled ? claimable + state.luckySpins : 0;

  const sheet =
    state && enabled ? (
      <PosterJackpotSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setDailyReward(null);
        }}
        state={state}
        onState={patch}
        onReload={reload}
        initialTab={initialTab}
        dailyReward={dailyReward}
      />
    ) : null;

  return { state, enabled, waiting, dailyChip: enabled && !!state?.dailyChip, claimingDaily, sheetOpen, open, claimDaily, sheet };
}
