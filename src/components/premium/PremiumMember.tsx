import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles } from 'lucide-react';
import { PAPER, INK, MIST, PIXEL, NIGHT, FOCUS_RING, glassPanel } from '../../lib/oracleTheme';
import { frames } from '../../lib/frames';
import { ChipFace } from '../posterJackpot/Chips';
import { ChapterHeader, H3_CLASS, OracleFaces } from './parts';
import './premium.css';

// Para quem já é Premium (04/11/2026): em vez de vender de novo, a página
// mostra onde cada benefício mora no site, com o atalho direto para ele.
// Os atalhos usam as mesmas portas que o resto do site já usa:
//   • /oracle/libraries — a Biblioteca dos Oráculos (porta da home);
//   • '/' com state { openJackpot: 'machine' } — abre a gaveta do Poster
//     Jackpot na máquina (PosterJackpotDoor lê esse state);
//   • /library com state { openWatchlistDuel: true } — a Biblioteca abre o
//     Duelo de Watchlist sozinha se houver 4 títulos na Watchlist;
//   • /profile — o Personalizar perfil fica no cartão do perfil.
// A Resenha do Oráculo não tem porta própria: mora na tela de resenhas de
// cada título avaliado, por isso aqui é só o caminho, sem link.

type Shortcut = {
  key: 'shelves' | 'chip' | 'duel' | 'profile';
  to: string;
  state?: Record<string, unknown>;
  accent: string;
  art: React.ReactNode;
};

// items-stretch/justify-start: o index.css centraliza todo <a> (alvo de toque
// de 44px com flex + items-center), o que centralizava o conteúdo do cartão.
const CARD = `group rounded-2xl p-5 flex flex-col items-stretch justify-start text-left min-h-[180px] transition hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 ${FOCUS_RING}`;

const PremiumMember: React.FC = () => {
  const { t } = useTranslation();

  const shortcuts: Shortcut[] = [
    { key: 'shelves', to: '/oracle/libraries?oracle=bogart', accent: '#F0ABFC', art: <OracleFaces size={40} /> },
    {
      key: 'chip',
      to: '/',
      state: { openJackpot: 'machine' },
      accent: '#B23AAE',
      art: <ChipFace kind="special" className="!w-11 !h-11" />,
    },
    {
      key: 'duel',
      to: '/library',
      state: { openWatchlistDuel: true },
      accent: '#38BDF8',
      art: (
        <span style={{ ...PIXEL, color: PAPER }} className="grid place-items-center w-11 h-11 rounded-xl text-[17px] ring-1 ring-sky-400/45 bg-sky-400/10">
          VS
        </span>
      ),
    },
    {
      key: 'profile',
      to: '/profile',
      accent: '#FBBF24',
      art: (
        <span className={`relative block w-11 h-11 rounded-full overflow-hidden ${frames.gold.className}`} style={{ background: NIGHT }}>
          <img src="/avatar-raposa.webp" alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        </span>
      ),
    },
  ];

  return (
    <section aria-labelledby="prm-where" className="py-12 sm:py-16">
      <ChapterHeader id="prm-where" reel={t('premium.page.member.whereKicker')} title={t('premium.page.member.where')} />

      <ul className="mt-8 grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map((s) => (
          <li key={s.key} className="flex">
            <Link to={s.to} state={s.state} className={`${CARD} w-full`} style={glassPanel(s.accent)}>
              <span aria-hidden className="h-11 flex items-center">
                {s.art}
              </span>
              <span style={{ ...PIXEL, color: PAPER }} className={`mt-4 block ${H3_CLASS}`}>
                {t(`premium.page.member.go.${s.key}.title`)}
              </span>
              <span className="mt-1.5 block text-sm leading-relaxed" style={{ color: MIST }}>
                {t(`premium.page.member.go.${s.key}.body`)}
              </span>
              <span className="mt-auto pt-4 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--prm-gold)' }}>
                {t(`premium.page.member.go.${s.key}.cta`)}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          </li>
        ))}

        {/* A Resenha do Oráculo: só o caminho (não há porta própria). */}
        <li className="flex sm:col-span-2 lg:col-span-2">
          <div className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 w-full min-h-[180px]" style={glassPanel('#F472B6')}>
            <span aria-hidden className="shrink-0 rounded-xl px-3.5 py-3 max-w-[260px] shadow-lg" style={{ background: PAPER, color: INK }}>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                {t('premium.page.oracles.review.sampleTag')}
              </span>
              <span className="mt-1.5 block text-sm font-semibold leading-snug">{t('premium.page.oracles.review.sampleTitle')}</span>
            </span>
            <span className="min-w-0">
              <span style={{ ...PIXEL, color: PAPER }} className={`block ${H3_CLASS}`}>
                {t('premium.page.oracles.review.title')}
              </span>
              <span className="mt-1.5 block text-sm leading-relaxed" style={{ color: MIST }}>
                {t('premium.page.member.go.review')}
              </span>
            </span>
          </div>
        </li>
      </ul>
    </section>
  );
};

export default PremiumMember;
