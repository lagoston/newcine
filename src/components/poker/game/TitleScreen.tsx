import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { ChipFace } from '../../posterJackpot/Chips';
import PosterArt from '../../posterJackpot/PosterArt';
import type { PokerHome } from '../../../lib/poker/client/apiTypes';
import { savedFreeHand } from '../../../lib/poker/client/freeStore';
import { fmt, langOf, timeLeft } from '../../../lib/poker/client/format';
import { invalidatePokerHome } from '../../../lib/poker/client/usePokerHome';
import { ENTRY_CHIPS, posterTitle, tournamentOf, weekEndsAt, weekOf, weekPrizeOf } from '../../../lib/poker/client/tournament';
import AgeGate from '../age/AgeGate';
import { BLEFE_ROUTES } from '../jackpot/pokerMeta';
import { HowToSheet, SettingsSheet } from './GameSheets';
import { loadPosterPokerFont } from './font';
import '../../../styles/posterJackpot.css';
import '../../../styles/poker.css';
import '../../../styles/posterPoker.css';

// A tela título do Pôster Poker (03/11/2026): o palco, o logo, o pôster da semana
// flutuando no foco e o menu em ingressos — Jogar (→ Torneio · Casual), Coleção,
// Placar, Configurações, Como jogar — e a seta de sair. Um momento forte só: o
// pôster no foco; o resto quieto.

export const Stage: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <main className={`pp-stage ${className}`}>
    <div className="pp-curtain is-left" aria-hidden />
    <div className="pp-curtain is-right" aria-hidden />
    <div className="pp-spotlight" aria-hidden />
    <div className="pp-stage-inner">{children}</div>
  </main>
);

export const ChipsPill: React.FC<{ count: number | null }> = ({ count }) => {
  const { t, i18n } = useTranslation();
  if (count === null) return <span />;
  return (
    <span className="pp-chips" aria-label={t('poker.lobby.youHave', { count })}>
      <ChipFace className="w-5 h-5" />
      <span className="pk-num">{fmt(count, langOf(i18n.language))}</span>
    </span>
  );
};

const TitleScreen: React.FC<{ home: PokerHome; offline: boolean }> = ({ home, offline }) => {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const navigate = useNavigate();
  const reduce = !!useReducedMotion();
  const [panel, setPanel] = useState<'menu' | 'modes'>('menu');
  const [sheet, setSheet] = useState<null | 'settings' | 'how'>(null);
  const [age, setAge] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tour = offline ? null : tournamentOf(home);
  const prize = weekPrizeOf(home);
  const title = posterTitle(prize, lang);
  const endsAt = tour?.ends_at ?? weekEndsAt(weekOf());
  const chips = tour?.chips ?? home.tickets ?? null;
  const freeHand = savedFreeHand();
  const firstVisit = !home.player?.tutorial_done && (home.player?.lifetime_matches ?? 0) === 0;

  useEffect(() => {
    loadPosterPokerFont();
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // A linha do Torneio no seletor de modo: o estado que importa antes de entrar.
  const tourneyLine = (() => {
    if (!tour) return offline ? t('poker.game.tourneyOffline') : t('poker.game.tourneySoon');
    if (tour.active_match) return t('poker.game.tourneyActive');
    if (tour.owned) return t('poker.tourney.ownedTitle');
    if (tour.won_this_week) return t('poker.tourney.wonTitle');
    if (tour.attempts_used >= tour.max_attempts) return t('poker.tourney.limitTitle');
    return t('poker.game.tourneyEntry', { count: tour.entry_chips ?? ENTRY_CHIPS[tour.prize.rarity], rarity: t(`poker.rarity.${tour.prize.rarity}`).toLowerCase() });
  })();

  // Com casino_age_gate ligado no servidor, a folha 18+ vem antes de qualquer partida (§7.8).
  const goCasual = () => {
    if (home.player?.age_gate_all && !home.player.age_confirmed) setAge(BLEFE_ROUTES.free);
    else navigate(BLEFE_ROUTES.free);
  };

  return (
    <Stage>
      <header className="pp-topbar">
        <button
          type="button"
          className="pp-icon-btn"
          onClick={() => (panel === 'modes' ? setPanel('menu') : navigate('/'))}
          aria-label={panel === 'modes' ? t('poker.game.back') : t('poker.game.exit')}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <ChipsPill count={chips} />
      </header>

      <h1 className="pp-logo" aria-label={t('poker.name')}>
        <span className="is-top pp-font pp-gold-letters" aria-hidden>{t('poker.tourney.logoTop')}</span>
        <span className="is-bottom pp-font pp-gold-letters" aria-hidden>{t('poker.tourney.logoBottom')}</span>
      </h1>

      {/* O pôster da semana no foco. */}
      <figure className="pp-hero-poster" aria-label={t('poker.game.weekPosterAria', { title })}>
        <span className="pp-float">
          <PosterArt filePath={prize.file_path} effect="gold" size="w342" animated={!reduce} loading="eager" mark={{ rarity: prize.rarity, serial: prize.serial, size: 'sm' }} />
        </span>
      </figure>
      <p className="pp-caption">
        {t('poker.game.weekCaption')} <b>{title}</b>
        <span className="block mt-0.5 pk-num" style={{ fontWeight: 600, color: '#c9b3ae' }}>
          {t('poker.tourney.changesIn', { time: timeLeft(endsAt, now, lang) })}
        </span>
      </p>

      <AnimatePresence mode="wait" initial={false}>
        {panel === 'menu' ? (
          <motion.nav
            key="menu"
            className="pp-menu"
            aria-label={t('poker.game.menuAria')}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button type="button" className="pp-ticket is-gold pp-font" onClick={() => setPanel('modes')}>
              {t('poker.game.play')}
            </button>
            <div className="pp-menu-grid">
              <button type="button" className="pp-ticket" onClick={() => navigate(BLEFE_ROUTES.collection)}>{t('poker.game.collection')}</button>
              <button type="button" className="pp-ticket" onClick={() => navigate(BLEFE_ROUTES.scoreboard)}>{t('poker.game.scoreboard')}</button>
              <button type="button" className="pp-ticket" onClick={() => setSheet('settings')}>{t('poker.game.settings')}</button>
              <button type="button" className="pp-ticket" onClick={() => setSheet('how')}>{t('poker.game.howTo')}</button>
            </div>
            {firstVisit && <p className="pp-foot" style={{ marginTop: 6 }}>{t('poker.game.firstVisit')}</p>}
          </motion.nav>
        ) : (
          <motion.div
            key="modes"
            className="pp-menu"
            role="group"
            aria-label={t('poker.game.pickMode')}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button type="button" className="pp-mode is-tourney" onClick={() => navigate(BLEFE_ROUTES.tournament)} disabled={!tour && !offline ? false : !tour}>
              <span className="pp-mode-art" aria-hidden>
                <PosterArt filePath={prize.file_path} effect="gold" size="w185" animated={false} className="absolute inset-0 rounded-[6px]" />
              </span>
              <span className="min-w-0">
                <h3 className="pp-font pp-gold-letters">{t('poker.game.tourney')}</h3>
                <p>{tourneyLine}</p>
              </span>
            </button>
            <button type="button" className="pp-mode is-casual" onClick={goCasual}>
              <span className="pp-mode-art grid place-items-center" aria-hidden>
                <span className="pp-mode-cards">
                  <i data-r="A" />
                  <i data-r="K" className="is-red" />
                </span>
              </span>
              <span className="min-w-0">
                <h3 className="pp-font" style={{ color: '#F5EBD3' }}>{t('poker.game.casual')}</h3>
                <p>{freeHand ? t('poker.lobby.continue', { hand: freeHand }) : t('poker.game.casualLine')}</p>
              </span>
            </button>
            <button type="button" className="pp-ticket" onClick={() => setPanel('menu')}>{t('poker.game.back')}</button>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="pp-foot">{t('poker.noRealMoney')}</p>

      {sheet === 'settings' && <SettingsSheet home={home} reduced={reduce} onClose={() => setSheet(null)} />}
      {sheet === 'how' && <HowToSheet reduced={reduce} onClose={() => setSheet(null)} />}
      <AgeGate
        open={!!age}
        onClose={() => setAge(null)}
        onConfirmed={() => {
          const to = age;
          setAge(null);
          invalidatePokerHome();
          if (to) navigate(to);
        }}
      />
    </Stage>
  );
};

export default TitleScreen;
