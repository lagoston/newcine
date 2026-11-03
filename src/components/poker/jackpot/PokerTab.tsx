import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Spade } from 'lucide-react';
import { FOCUS_RING, MIST, PAPER } from '../../../lib/oracleTheme';
import { loadJackpotFont, type PokerTeaser } from '../../../lib/posterJackpot';
import { ChipFace } from '../../posterJackpot/Chips';
import { OracleTrio } from './CarrierFace';
import PrizeCard from './PrizeCard';
import { useBountyLaunch } from './useBountyLaunch';
import { BLEFE_ROUTES, titleProgress } from './pokerMeta';
import '../../../styles/posterJackpot.css';
import '../../../styles/pokerEntry.css';

// A aba Pôquer da gaveta do Jackpot (03/11/2026; SPEC §7.1 item 1): um
// mini lobby do Grande Blefe. O cartão do prêmio de hoje (veludo vinho, com
// quem o carrega e a dificuldade em estrelas), [Valendo o prêmio · 1 ficha],
// a mesa livre de feltro com [Jogar grátis], os três números do placar e
// [Abrir o salão]. Tudo vem do resumo que o get_jackpot_state já trouxe.

const PokerTab: React.FC<{ teaser: PokerTeaser; tickets: number; onGoMissions: () => void }> = ({ teaser, tickets, onGoMissions }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { launch, gateElement } = useBountyLaunch(teaser);

  useEffect(() => {
    loadJackpotFont();
  }, []);

  const { current } = titleProgress(teaser.wins);
  const used = Math.max(0, teaser.attemptsUsed);
  const max = Math.max(1, teaser.maxAttempts);
  const limit = !teaser.active && used >= max;
  const noChips = !teaser.active && !teaser.wonToday && !limit && tickets < 1;
  const rate = teaser.matches > 0 ? Math.round((teaser.wins / teaser.matches) * 100) : 0;

  const status = teaser.wonToday
    ? t('pokerEntry.panel.wonBody')
    : teaser.active
      ? t('pokerEntry.panel.activeBody')
      : limit
        ? t('pokerEntry.panel.limitBody', { max })
        : t('pokerEntry.panel.attempt', { n: used + 1, max });

  let cta: React.ReactNode;
  if (teaser.wonToday) {
    cta = (
      <p className="pe-cinzel text-center text-[20px] font-black leading-none pj-gold-text" role="status">
        {t('pokerEntry.panel.won')}
      </p>
    );
  } else if (limit) {
    cta = (
      <p className="text-center text-[14px] font-semibold" style={{ color: '#FFE8A3' }} role="status">
        {t('pokerEntry.panel.limit')}
      </p>
    );
  } else if (noChips) {
    cta = (
      <div className="text-center">
        <p className="text-[13.5px] leading-snug" style={{ color: PAPER }}>
          {t('pokerEntry.panel.noChips')}
        </p>
        <button type="button" onClick={onGoMissions} className={`pe-ghost mt-2.5 w-full h-11 rounded-full text-[14px] font-semibold ${FOCUS_RING}`}>
          {t('pokerEntry.panel.seeMissions')}
        </button>
      </div>
    );
  } else {
    cta = (
      <>
        <button
          type="button"
          onClick={launch}
          aria-label={teaser.active ? undefined : t('pokerEntry.panel.entryAria')}
          className={`pj-spin pj-ready w-full inline-flex items-center justify-center gap-2 h-[52px] rounded-full text-[15px] font-bold ${FOCUS_RING}`}
        >
          <span className="relative">
            {teaser.active ? t('pokerEntry.panel.continue') : used > 0 ? t('pokerEntry.panel.retry') : t('pokerEntry.panel.playBounty')}
          </span>
          {!teaser.active && (
            <span className="relative inline-flex items-center gap-1 rounded-full pl-1 pr-2 h-7 text-[13px] tabular-nums" style={{ background: 'rgba(58,33,0,0.16)' }} aria-hidden>
              <ChipFace className="w-5 h-5" />1
            </span>
          )}
        </button>
        {!teaser.active && (
          <p className="mt-2 text-center text-[12.5px]" style={{ color: '#F6DCE2' }}>
            {t('pokerEntry.panel.youHave', { count: tickets })}
          </p>
        )}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-3.5">
      {/* O letreiro da aba: os três na ordem da mesa e o título da pessoa. */}
      <header className="flex items-center gap-3 px-0.5">
        <OracleTrio carrier={teaser.prize ? teaser.carrier : null} size={30} />
        <div className="min-w-0">
          <h3 className="pe-cinzel pj-gold-text text-[22px] sm:text-[26px] font-black leading-none">{t('pokerEntry.name')}</h3>
          <p className="mt-1.5 text-[12.5px]" style={{ color: MIST }}>
            {t('pokerEntry.panel.yourTitle', { title: t(`pokerEntry.titles.${current.id}`) })}
          </p>
        </div>
      </header>

      {teaser.prize ? (
        <PrizeCard prize={teaser.prize} carrier={teaser.carrier} stars={teaser.stars} status={status} compact headingId="pe-tab-prize">
          {cta}
        </PrizeCard>
      ) : (
        <p className="rounded-2xl px-4 py-3 text-[13.5px]" style={{ color: MIST, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)' }}>
          {t('pokerEntry.panel.noPrize')}
        </p>
      )}

      {/* A mesa livre: grátis, no aparelho, quantas vezes quiser. */}
      <section className="pe-felt relative flex items-center gap-3 rounded-[18px] pl-4 pr-3 py-3" aria-labelledby="pe-tab-free">
        <Spade className="w-5 h-5 shrink-0" style={{ color: '#D9F2E4' }} aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 id="pe-tab-free" className="text-[14.5px] font-semibold leading-tight" style={{ color: PAPER }}>
            {t('pokerEntry.panel.freeTitle')}
          </h3>
          <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: '#D9F2E4' }}>
            {t('pokerEntry.panel.freeBody')}
          </p>
        </div>
        <button type="button" onClick={() => navigate(BLEFE_ROUTES.free)} className={`pe-paper shrink-0 h-11 px-4 rounded-full text-[14px] font-bold ${FOCUS_RING}`}>
          {t('pokerEntry.panel.playFree')}
        </button>
      </section>

      {/* Os três números do placar; tocar abre o placar inteiro. */}
      <Link
        to={BLEFE_ROUTES.scoreboard}
        className={`flex items-center gap-2 rounded-2xl px-4 py-3 transition hover:bg-white/[0.04] ${FOCUS_RING}`}
        style={{ boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.28)' }}
        aria-label={t('pokerEntry.panel.scoreAria', { wins: teaser.wins, matches: teaser.matches, pct: rate })}
      >
        <span className="grid flex-1 grid-cols-3 text-center" aria-hidden>
          {[
            { value: teaser.wins, label: t('pokerEntry.panel.wins', { count: teaser.wins }) },
            { value: teaser.matches, label: t('pokerEntry.panel.matches', { count: teaser.matches }) },
            { value: `${rate}%`, label: t('pokerEntry.panel.winRate') },
          ].map((item, i) => (
            <span key={i} className={`block ${i > 0 ? 'border-l border-white/10' : ''}`}>
              <span className="block text-[19px] font-bold leading-none" style={{ color: PAPER }}>
                {item.value}
              </span>
              <span className="block mt-1 text-[11.5px]" style={{ color: MIST }}>
                {item.label}
              </span>
            </span>
          ))}
        </span>
        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#FFE8A3' }} aria-hidden />
      </Link>

      <Link to={BLEFE_ROUTES.lobby} className={`pe-ghost flex items-center justify-center h-11 rounded-full text-[14px] font-semibold ${FOCUS_RING}`}>
        {t('pokerEntry.panel.openSalon')}
      </Link>

      <p className="text-center text-[12px] leading-relaxed" style={{ color: MIST }}>
        {t('pokerEntry.noRealMoney')}
      </p>
      {gateElement}
    </div>
  );
};

export default PokerTab;
