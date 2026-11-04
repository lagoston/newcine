import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../../lib/auth';
import { FOCUS_RING } from '../../../lib/oracleTheme';
import type { PokerHome } from '../../../lib/poker/client/apiTypes';
import { peekPokerHome, sharedHome } from '../../../lib/poker/client/usePokerHome';
import { langOf } from '../../../lib/poker/client/format';
import { posterTitle, weekPrizeOf } from '../../../lib/poker/client/tournament';
import PosterArt from '../../posterJackpot/PosterArt';
import { BLEFE_ROUTES } from '../jackpot/pokerMeta';
import { loadPosterPokerFont } from './font';
import '../../../styles/posterJackpot.css';
import '../../../styles/posterPoker.css';

// O ingresso do Pôster Poker na home (04/11/2026; antes, desde 03/11, um botão
// do porte das portas). Pedido do Bruno: quatro portas do mesmo tamanho eram
// demais e davam cara de site de jogos à home. O pôquer virou um ingresso de
// cinema — o mesmo recorte meia-lua e o mesmo picote dos ingressos do menu do
// jogo (.pp-ticket) —, menor que as portas e por último na fila:
//   • celular e tablet: deitado, logo abaixo da Persona — a cortina, o pôster
//     da semana dourado entre duas cartas, o letreiro e o torneio; depois do
//     picote, o canhoto com a seta de ouro;
//   • computador: em pé, estreito, ao lado da Persona, da altura das portas
//     (o canhoto fica embaixo, com a seta na altura dos convites delas).
// Só para quem tem o pôquer liberado (get_poker_home: enabled e open).
// Enquanto não sabe, não desenha nada (o item da home some com empty:hidden,
// sem empurrar nada).

const isOpen = (h: PokerHome | null) => !!h && h.enabled && h.open !== false;

const PosterPokerButton: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const reduce = useReducedMotion();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [home, setHome] = useState<PokerHome | null>(() => peekPokerHome());

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    sharedHome().then(
      (h) => alive && setHome(h),
      () => {}, // sem rede: fica a cópia local (o Casual abre offline)
    );
    return () => {
      alive = false;
    };
  }, [uid]);

  const open = isOpen(home);
  useEffect(() => {
    if (open) loadPosterPokerFont();
  }, [open]);
  if (!open) return null;

  const prize = weekPrizeOf(home);
  const title = posterTitle(prize, lang);

  return (
    // h-full: no computador o ingresso estica até a altura das portas.
    <motion.div className="h-full" initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.15 }}>
      <Link to={BLEFE_ROUTES.title} className={`pp-pass group ${FOCUS_RING}`} aria-label={t('pokerEntry.doorAria', { title })}>
        {/* O papel do ingresso (o veludo, o fio de ouro e os recortes) fica
            numa camada de trás: a máscara dos recortes cortaria o anel de
            foco se estivesse no próprio link. */}
        <span className="pp-pass-paper" aria-hidden />
        <span className="pp-pass-main">
          <span className="pp-pass-art" aria-hidden>
            <i data-r="A" />
            <i data-r="K" className="is-red" />
            <span className="pp-pass-poster">
              <PosterArt filePath={prize.file_path} effect="gold" size="w185" animated={!reduce} />
            </span>
          </span>
          <span className="pp-pass-text">
            <span className="pp-pass-title pp-font pp-gold-letters">{t('pokerEntry.name')}</span>
            <span className="pp-pass-hint">
              {t('pokerEntry.doorHint')} <b>{title}</b>
            </span>
          </span>
        </span>
        <span className="pp-pass-stub" aria-hidden>
          <span className="pp-pass-arrow">
            <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2.4} />
          </span>
        </span>
      </Link>
    </motion.div>
  );
};

export default PosterPokerButton;
