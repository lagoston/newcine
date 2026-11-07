import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles } from 'lucide-react';
import { PAPER, INK, MIST, PIXEL, glassPanel } from '../../lib/oracleTheme';
import { BODY_CLASS, ChapterHeader, H3_CLASS, PREMIUM_GOLD } from './parts';
import './premium.css';

// Rolo 1 da página Premium (04/11/2026): o que o Premium muda nos oráculos.
// Cada benefício foi conferido no código e no banco:
//   • (05/11/2026) "Prateleiras inteiras" saiu: decisão do Bruno, nada na Mesa
//     dos Oráculos nem no Acervo é Premium — as 27 prateleiras são inteiras
//     para todos (pages/OracleAcervo.tsx). Ficam Resenha, Duelo e Sussurros:
//     duas metades numa linha e os Sussurros na linha de baixo, sem buraco.
//   • Resenha do Oráculo — Edge Function generate-ai-review: só Premium,
//     pede 10 resenhas reais, 1 por dia + 1 nova tentativa do mesmo título
//     (try_consume_oracle_generation com limite 2).
//   • Duelo de Watchlist — Edge Function watchlist-duel: só Premium, sem
//     limite; 4 títulos de cada watchlist, chave de 8; só com quem você segue.
//   • Sussurros — RPC get_user_indication_limit: 20 por dia com Premium, 5 sem.

// Uma resenha como o Oráculo entrega: título curto e um parágrafo, com as
// duas saídas que a tela real oferece (postar ou pedir outra). O exemplo é
// um dos que a própria tela mostra antes da primeira geração
// (OracleReviewSection → EXAMPLES).
const ReviewSample: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div aria-hidden className="rounded-xl p-4 shadow-lg" style={{ background: PAPER, color: INK }}>
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: 'rgba(34,27,54,0.08)' }}>
        <Sparkles className="w-3.5 h-3.5" />
        {t('premium.page.oracles.review.sampleTag')}
      </span>
      <p className="mt-2.5 font-semibold leading-snug">{t('premium.page.oracles.review.sampleTitle')}</p>
      <p className="mt-1 text-sm leading-relaxed line-clamp-3 opacity-80">{t('premium.page.oracles.review.sampleBody')}</p>
      <span className="mt-3 flex gap-2 text-[12px] font-semibold">
        <span className="rounded-lg px-3 py-1.5" style={{ background: INK, color: PAPER }}>
          {t('premium.page.oracles.review.post')}
        </span>
        <span className="rounded-lg px-3 py-1.5 ring-1 ring-[#221B36]/25">{t('premium.page.oracles.review.again')}</span>
      </span>
    </div>
  );
};

// A chave do Duelo: 8 títulos (4 seus, 4 do amigo) → 4 → 2 → 1.
const SIDES = ['is-you', 'is-friend', 'is-friend', 'is-you', 'is-you', 'is-friend', 'is-you', 'is-friend'];
const DuelBracket: React.FC = () => {
  const { t } = useTranslation();
  return (
    <figure aria-hidden>
      <div className="grid grid-cols-4 gap-[10px] mb-2 text-center" style={{ ...PIXEL, color: MIST }}>
        {[8, 4, 2, 1].map((n) => (
          <span key={n} className="text-[15px] leading-none">
            {n}
          </span>
        ))}
      </div>
      <div className="prm-bracket h-[148px]">
        <div className="prm-bracket-col">
          {SIDES.map((side, i) => (
            <span key={i} className={`prm-bracket-slot ${side}`} />
          ))}
        </div>
        <div className="prm-bracket-col">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="prm-bracket-slot is-mixed" />
          ))}
        </div>
        <div className="prm-bracket-col">
          {[0, 1].map((i) => (
            <span key={i} className="prm-bracket-slot is-mixed" />
          ))}
        </div>
        <div className="prm-bracket-col">
          <span className="prm-bracket-slot is-winner" />
        </div>
      </div>
      <figcaption className="mt-3 flex gap-4 text-[13px]" style={{ color: MIST }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[3px]" style={{ background: 'rgba(167,139,250,0.75)' }} />
          {t('premium.page.oracles.duel.you')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[3px]" style={{ background: 'rgba(56,189,248,0.7)' }} />
          {t('premium.page.oracles.duel.friend')}
        </span>
      </figcaption>
    </figure>
  );
};

// Regra curta em dourado embaixo de cada benefício ("1 por dia…").
const Rule: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-3 text-sm font-semibold leading-snug" style={{ color: PREMIUM_GOLD }}>
    {children}
  </p>
);

const PremiumOracles: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="prm-oracles" className="py-12 sm:py-16">
      <ChapterHeader
        id="prm-oracles"
        reel={t('premium.page.reel', { n: 1, label: t('premium.page.oracles.kicker') })}
        title={t('premium.page.oracles.title')}
      />

      <div className="mt-8 grid gap-4 sm:gap-5 md:grid-cols-2">
        <article className="rounded-2xl p-5 sm:p-7 flex flex-col" style={glassPanel('#F472B6')}>
          <ReviewSample />
          <h3 style={{ ...PIXEL, color: PAPER }} className={`mt-6 ${H3_CLASS}`}>
            {t('premium.page.oracles.review.title')}
          </h3>
          <p className={`mt-2 ${BODY_CLASS}`} style={{ color: MIST }}>
            {t('premium.page.oracles.review.body')}
          </p>
          <Rule>{t('premium.page.oracles.review.rule')}</Rule>
        </article>

        <article className="rounded-2xl p-5 sm:p-7 flex flex-col" style={glassPanel('#38BDF8')}>
          <DuelBracket />
          <h3 style={{ ...PIXEL, color: PAPER }} className={`mt-6 ${H3_CLASS}`}>
            {t('premium.page.oracles.duel.title')}
          </h3>
          <p className={`mt-2 ${BODY_CLASS}`} style={{ color: MIST }}>
            {t('premium.page.oracles.duel.body')}
          </p>
          <Rule>{t('premium.page.oracles.duel.rule')}</Rule>
        </article>

        {/* Sussurros: uma linha só, com os dois números. */}
        <article className="md:col-span-2 rounded-2xl px-5 py-5 sm:px-7 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6" style={glassPanel('#A78BFA')}>
          <div className="flex-1 min-w-0">
            <h3 style={{ ...PIXEL, color: PAPER }} className={H3_CLASS}>
              {t('premium.page.oracles.whispers.title')}
            </h3>
            <p className={`mt-1 ${BODY_CLASS}`} style={{ color: MIST }}>
              {t('premium.page.oracles.whispers.body')}
            </p>
          </div>
          <p className="flex items-center gap-3 shrink-0" aria-label={t('premium.page.oracles.whispers.aria')}>
            <span aria-hidden style={{ ...PIXEL, color: MIST }} className="text-[34px] leading-none">
              5
            </span>
            <ArrowRight className="w-5 h-5" style={{ color: MIST }} aria-hidden />
            <span aria-hidden style={{ ...PIXEL, color: PREMIUM_GOLD }} className="text-[44px] leading-none">
              20
            </span>
            <span aria-hidden className="text-sm" style={{ color: PAPER }}>
              {t('premium.page.oracles.whispers.perDay')}
            </span>
          </p>
        </article>
      </div>
    </section>
  );
};

export default PremiumOracles;
