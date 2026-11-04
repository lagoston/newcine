import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Movie } from '../../lib/tmdb';
import { MIST, ORACLES, PAPER, PIXEL, withAlpha } from '../../lib/oracleTheme';
import { SectionHeading, ShelfPoster } from './LandingBits';
import { asMovie, ORACLE_SHELF, type LandingTitle } from './landingData';

// Os três oráculos (04/11/2026). O texto antigo ("vê o que você ama / o que
// está escondido / o que você evita") já não batia com a curadoria: hoje
// cada oráculo é um corredor com época e perfil próprios (ver
// oracle.libraries.*FunctionDesc): Bogart, de 2000 para cá, populares e bem
// avaliados; Fincher, antes de 2000, populares e cults; Cypher, pouco
// conhecidos, de qualquer época. Cada coluna mostra a carta, o que o oráculo
// guarda e três títulos que estão mesmo nas prateleiras dele (landingData),
// com a nota prevista escondida — tocar abre o menu do título de verdade.

const LandingOracles: React.FC<{ onMovieClick: (movie: Movie) => void }> = ({ onMovieClick }) => {
  const { t, i18n } = useTranslation();
  const open = (title: LandingTitle) => onMovieClick(asMovie(title, i18n.language));

  return (
    <section className="border-t border-white/[0.07]" aria-labelledby="lp-oracles">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-24">
        <SectionHeading
          id="lp-oracles"
          eyebrow={t('guestHome.oraclesEyebrow')}
          title={t('guestHome.oraclesTitle')}
          subtitle={t('guestHome.oraclesSubtitle')}
          accent="#86EFAC"
        />
        {/* Celular: um oráculo embaixo do outro. Tablet (sm–lg): cada oráculo
            numa faixa, a carta e o texto à esquerda e a prateleira à direita.
            Computador (lg): as três colunas lado a lado. */}
        <ul className="mt-10 sm:mt-14 grid gap-5 lg:grid-cols-3">
          {ORACLES.map((oracle) => (
            <li
              key={oracle.id}
              className="relative flex flex-col sm:grid sm:grid-cols-2 sm:gap-6 sm:items-center lg:flex lg:gap-0 lg:items-stretch rounded-2xl p-4 sm:p-5 overflow-hidden"
              style={{
                background: [
                  `radial-gradient(80% 60% at 0% 0%, ${withAlpha(oracle.color, 0.16)}, transparent 70%)`,
                  'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.01) 60%)',
                  'rgba(28,20,51,0.5)',
                ].join(', '),
                boxShadow: `inset 0 0 0 1px ${withAlpha(oracle.color, 0.24)}`,
              }}
            >
              {/* O fio de neon na cor do bicho, como nas portas da home. */}
              <span aria-hidden className="absolute left-5 right-5 top-0 h-[2px] rounded-full" style={{ background: oracle.color, boxShadow: `0 0 10px 1px ${withAlpha(oracle.color, 0.5)}` }} />
              <div className="flex items-start gap-4">
                <img
                  src={oracle.img}
                  alt={t(`guestHome.${oracle.id}Alt`)}
                  width={1696}
                  height={2528}
                  loading="lazy"
                  decoding="async"
                  className="w-[76px] sm:w-[88px] flex-shrink-0 rounded-[5px] ring-1 ring-white/10"
                  style={{ boxShadow: `0 18px 34px -16px ${withAlpha(oracle.color, 0.6)}` }}
                />
                <div className="min-w-0 pt-0.5">
                  <h3 style={{ ...PIXEL, color: oracle.color }} className="text-[26px] sm:text-[28px] leading-none">{oracle.name}</h3>
                  <p className="mt-2 text-base font-semibold leading-snug" style={{ color: PAPER }}>{t(`guestHome.${oracle.id}Line`)}</p>
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: MIST }}>{t(`guestHome.${oracle.id}Desc`)}</p>
                </div>
              </div>
              {/* mt-auto: as três prateleiras ficam na mesma altura, mesmo
                  quando o texto de um oráculo ocupa uma linha a mais. */}
              <div className="mt-auto pt-5 sm:pt-0 lg:pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: MIST }}>
                  {t('guestHome.shelfOf', { name: oracle.name })}
                </p>
                <ul className="mt-2.5 grid grid-cols-3 gap-2.5">
                  {ORACLE_SHELF[oracle.id].map((title) => (
                    <li key={title.id} className="min-w-0">
                      <ShelfPoster title={title} oracleColor={oracle.color} onOpen={open} />
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm leading-relaxed max-w-[44rem]" style={{ color: MIST }}>
          {t('guestHome.oraclesFoot')}
        </p>
      </div>
    </section>
  );
};

export default LandingOracles;
