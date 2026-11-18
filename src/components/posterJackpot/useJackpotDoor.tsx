import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../lib/auth';
import {
  claimDailyChip,
  loadJackpotFont,
  markJackpotGiftSeen,
  patchJackpotState,
  refreshJackpotState,
  useJackpotState,
  type DailyReward,
  type JackpotState,
} from '../../lib/posterJackpot';
import { primeJackpotAudio } from '../../lib/jackpotSound';
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
  // 18/11/2026 (Reborn, onda 2a): o estado vem da camada de dados (uma consulta
  // para a Home, o Perfil e a gaveta; antes cada montagem pedia a sua). A ficha
  // voadora ('jackpot:chips') refaz a consulta pelo mapa de eventos da camada:
  // este arquivo não escuta mais o aviso de window.
  const { data, error: stateError } = useJackpotState();
  const state: JackpotState | null = userId ? (data ?? null) : null;
  useEffect(() => {
    if (stateError) console.error('Poster Jackpot state:', stateError);
  }, [stateError]);
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

  // Lê de novo agora (a gaveta pede ao abrir).
  const reload = useCallback(() => {
    if (!userId) return;
    void refreshJackpotState();
  }, [userId]);

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
    // o estado fica guardado por 1 min: sem isto, voltar à Home nesse meio
    // tempo mostraria o aviso de novo
    patchJackpotState({ gift: null });
  }, [gift, t]);

  const enabled = !!state?.enabled;
  useEffect(() => {
    if (enabled) loadJackpotFont();
  }, [enabled]);

  const patch = useCallback((value: Partial<JackpotState>) => patchJackpotState(value), []);

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
  // O Giro da Sorte guardado só conta como "esperando" quando há ficha para
  // usá-lo (desde 18/11/2026 ele é o bônus de um giro com ficha).
  const waiting = state && enabled ? claimable + (state.tickets > 0 || state.specialAvailable ? state.luckySpins : 0) : 0;

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
