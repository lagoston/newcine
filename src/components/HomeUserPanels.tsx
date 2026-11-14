import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Movie } from '../lib/tmdb';
import MonthlyInsightsModal from './MonthlyInsightsModal';
import SeasonalEventPanel from './seasonal/SeasonalEventPanel';
import FriendsFeed from './feed/FriendsFeed';
import OracleLibraryDoor from './oracleHub/OracleLibraryDoor';
import StudioDoor from './home/StudioDoor';
import { useSeasonalEvent } from '../contexts/SeasonalEventContext';
import { NIGHT, PAPER, MIST, PIXEL } from '../lib/oracleTheme';

// Topo da home de quem está logado.
//   1. Os stories dos amigos.
//   2. Cabeçalho: saudação e o atalho dos Insights do mês.
//   3. A porta da Biblioteca dos Oráculos e o estúdio da pessoa.
//      De 02/11 a 14/11/2026 eram três portas (a Biblioteca, o Poster Jackpot
//      e a Sua Persona) e, para quem tem o Pôster Poker, um ingresso. Em
//      14/11/2026 (pedido do Bruno) a Persona virou o estúdio inteiro e tomou
//      o lugar do Jackpot e do Pôquer, que agora são objetos dentro dele (a
//      máquina caça-níquel e a mesa). No celular ficam um embaixo do outro;
//      no computador, lado a lado: a porta da Biblioteca em pé e o estúdio
//      com o resto da largura (home/StudioDoor).
//   4. Durante um evento sazonal (Halloween em outubro, Natal em dezembro), o
//      painel do evento logo abaixo — o do Halloween traz a entrada do Clube
//      do Terror. Fora do evento, a entrada do Clube deixou de ser uma faixa
//      aqui (14/11/2026): é a caixa de papelão no estúdio de quem tem a tag.
// A porta e o estúdio sobem em sequência ao abrir a página: o único momento
// animado do topo.

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300';

interface Props {
  userId: string;
  username: string;
  // A página só "acende" quando o topo está pronto — assim a home abre
  // inteira de uma vez, sem blocos pulando.
  visible?: boolean;
  onReady?: () => void;
  onMovieClick: (movie: Movie) => void;
}

const HomeUserPanels: React.FC<Props> = ({ userId, username, visible = true, onReady, onMovieClick }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [insightsIsNew, setInsightsIsNew] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  // Estilo das cartas dos oráculos escolhido no Personalizar perfil.
  const [cardStyle, setCardStyle] = useState('default');
  const [profileName, setProfileName] = useState<string | null>(null);

  const { event: seasonal, theme: seasonalTheme } = useSeasonalEvent();

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // As portas carregam sozinhas (cada uma com o seu esqueleto): o topo só
  // espera o perfil, que é rápido.
  useEffect(() => {
    let alive = true;
    supabase
      .from('profiles')
      .select('username, card_style')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const row = data as { username?: string | null; card_style?: string | null } | null;
        setCardStyle(row?.card_style || 'default');
        setProfileName(row?.username ?? null);
      })
      .then(
        () => alive && onReadyRef.current?.(),
        () => alive && onReadyRef.current?.()
      );
    return () => {
      alive = false;
    };
  }, [userId]);

  // O relatório do mês passado sempre existe a partir do dia 1º; o ponto
  // "novo" some depois que o usuário abre esse relatório específico.
  const lastMonth = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }, []);

  useEffect(() => {
    supabase
      .from('user_monthly_insights_seen')
      .select('id')
      .eq('user_id', userId)
      .eq('year', lastMonth.year)
      .eq('month', lastMonth.month)
      .maybeSingle()
      .then(({ data }) => setInsightsIsNew(!data));
  }, [userId, lastMonth]);

  const openInsights = () => {
    setShowInsights(true);
    if (insightsIsNew) {
      supabase
        .from('user_monthly_insights_seen')
        .insert({ user_id: userId, year: lastMonth.year, month: lastMonth.month })
        .then(() => setInsightsIsNew(false));
    }
  };

  const displayName = username || profileName || '';
  const hour = new Date().getHours();
  const greeting =
    hour >= 5 && hour < 12 ? t('home.desk.greetingMorning') : hour >= 12 && hour < 18 ? t('home.desk.greetingAfternoon') : t('home.desk.greetingEvening');

  // As portas sobem em sequência quando a página acende.
  const doorList = { hidden: {}, shown: { transition: { staggerChildren: reduceMotion ? 0 : 0.09, delayChildren: 0.05 } } };
  const doorItem = {
    hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 18 },
    shown: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } },
  };

  return (
    <>
      {/* ---------- Feed dos Amigos: os stories, no topo ---------- */}
      <FriendsFeed userId={userId} onMovieClick={onMovieClick} />

      {/* ---------- Cabeçalho ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-5 sm:pt-7">
        <div className="flex items-center justify-between gap-4">
          {/* Sem foto aqui: o seu avatar já abre a fileira de stories logo acima. */}
          <div className="min-w-0">
            <p className="text-sm sm:text-base" style={{ color: MIST }}>{greeting}</p>
            <h1 style={{ ...PIXEL, color: PAPER }} className="mt-1 text-[2rem] sm:text-5xl leading-none truncate">
              {displayName}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={openInsights}
              aria-label={t('home.desk.insights')}
              className={`relative inline-flex items-center gap-2 h-11 px-3 sm:px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${focusRing}`}
              style={{ color: PAPER }}
            >
              <BarChart3 className="w-[18px] h-[18px] text-violet-300" aria-hidden />
              <span className="hidden sm:inline">{t('home.desk.insights')}</span>
              {insightsIsNew && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-fuchsia-500 ring-2" style={{ '--tw-ring-color': NIGHT } as React.CSSProperties}>
                  <span className="sr-only">{t('home.desk.newBadge')}</span>
                </span>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* ---------- A porta da Biblioteca e o estúdio ----------
          Flex: no computador a porta fica em pé, com cerca de um quarto da
          largura, e o estúdio com o resto; as duas com a mesma altura. No
          celular o estúdio quase encosta nas bordas da tela (-mx-3), para a
          cena de 360 px caber inteira num aparelho de 360 px; em telas ainda
          menores ele encosta de vez (-mx-5) e só as pontas das paredes ficam
          de fora. */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-5 sm:pt-7" aria-label={t('home.doors.label')}>
        <motion.ul
          className="flex flex-col lg:flex-row gap-3 sm:gap-4"
          variants={doorList}
          initial="hidden"
          animate={visible ? 'shown' : 'hidden'}
        >
          <motion.li variants={doorItem} className="min-w-0 lg:flex-1">
            {/* 11/11/2026: o trailer do filme mais recomendado roda na porta no
                primeiro segundo; tocar nele abre o menu do filme. */}
            <OracleLibraryDoor cardStyle={cardStyle} active={visible} onOpenMovie={onMovieClick} />
          </motion.li>
          <motion.li variants={doorItem} className="min-w-0 -mx-5 min-[360px]:-mx-3 sm:mx-0 lg:flex-[2.6]">
            <StudioDoor userId={userId} username={displayName || null} />
          </motion.li>
        </motion.ul>
      </section>

      {/* ---------- O evento sazonal ---------- */}
      {seasonal && seasonalTheme && (
        <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 sm:pt-8">
          <SeasonalEventPanel event={seasonal} theme={seasonalTheme} onMovieClick={onMovieClick} />
        </section>
      )}

      <div className="h-6 sm:h-8" aria-hidden />

      {/* ---------- Modais ---------- */}
      <MonthlyInsightsModal isOpen={showInsights} onClose={() => setShowInsights(false)} userId={userId} />
    </>
  );
};

export default HomeUserPanels;
