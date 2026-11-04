import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wand2 } from 'lucide-react';
import { FOCUS_RING, INK, MIST, PAPER, PIXEL, VELVET, POSTER_TITLE } from '../../lib/oracleTheme';
import { MOOD_BY_KEY } from '../../lib/moods';
import { titleName, titlePoster, type LandingTitle } from './landingData';

// Peças pequenas da home de visitante (04/11/2026), repetidas entre as
// seções: os botões de conta, o cabeçalho de seção, o selo "Exemplo" e o
// pôster de prateleira com a nota prevista escondida.

// Os dois caminhos de conta, sempre os mesmos do site: /auth?signup=true para
// criar e /auth para entrar. O convite (?convite=) não precisa ir na URL: o
// main.tsx guarda o código no navegador ao abrir qualquer página e a tela de
// cadastro lê de lá (lib/invite).
export const SIGNUP_PATH = '/auth?signup=true';
export const SIGNIN_PATH = '/auth';

export const SignUpButton: React.FC<{ tone?: 'night' | 'paper'; className?: string }> = ({ tone = 'night', className = '' }) => {
  const { t } = useTranslation();
  return (
    <Link
      to={SIGNUP_PATH}
      className={`inline-flex items-center justify-center min-h-[48px] px-7 rounded-xl text-base font-semibold transition ${FOCUS_RING} ${
        tone === 'night'
          ? 'text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 shadow-lg shadow-fuchsia-950/50 hover:brightness-110'
          : 'hover:opacity-90 focus-visible:outline-violet-700'
      } ${className}`}
      style={tone === 'paper' ? { background: INK, color: PAPER } : undefined}
    >
      {t('guestHome.ctaSignUp')}
    </Link>
  );
};

export const SignInButton: React.FC<{ tone?: 'night' | 'paper'; className?: string }> = ({ tone = 'night', className = '' }) => {
  const { t } = useTranslation();
  return tone === 'night' ? (
    <Link
      to={SIGNIN_PATH}
      className={`inline-flex items-center justify-center min-h-[48px] px-5 rounded-xl text-base font-medium border border-white/15 hover:border-white/35 hover:bg-white/5 transition ${FOCUS_RING} ${className}`}
      style={{ color: PAPER }}
    >
      {t('guestHome.ctaSignIn')}
    </Link>
  ) : (
    // Na faixa de papel: link sublinhado, mas com 48 px de altura de toque.
    <Link
      to={SIGNIN_PATH}
      className={`inline-flex items-center justify-center min-h-[48px] px-2 text-base font-semibold underline underline-offset-4 decoration-2 hover:opacity-80 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 ${className}`}
      style={{ color: INK }}
    >
      {t('guestHome.ctaSignIn')}
    </Link>
  );
};

// Cabeçalho de seção: a etiqueta em pixel (o "letreiro" da seção), o título
// e uma frase. `accent` pinta a etiqueta.
export const SectionHeading: React.FC<{
  eyebrow: string;
  title: string;
  subtitle?: string;
  accent?: string;
  id?: string;
  className?: string;
}> = ({ eyebrow, title, subtitle, accent = '#F0ABFC', id, className = '' }) => (
  <div className={className}>
    <p style={{ ...PIXEL, color: accent }} className="text-sm sm:text-[15px] leading-none tracking-[0.14em] uppercase">
      {eyebrow}
    </p>
    <h2 id={id} style={{ ...PIXEL, color: PAPER }} className="mt-3 text-[1.9rem] sm:text-4xl lg:text-[2.75rem] leading-[1.08] max-w-[22ch]">
      {title}
    </h2>
    {subtitle && (
      <p className="mt-4 text-base sm:text-lg leading-relaxed max-w-[40rem]" style={{ color: MIST }}>
        {subtitle}
      </p>
    )}
  </div>
);

// "Exemplo": marca o que é ilustração (uma nota prevista, um amigo) — a
// página nunca apresenta número de mentira como se fosse de alguém.
export const ExampleTag: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-semibold leading-none tracking-wide uppercase ${className}`}
      style={{ color: MIST, background: 'rgba(18,13,34,0.78)', boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.18)' }}
    >
      {t('guestHome.example')}
    </span>
  );
};

// O selo violeta da nota prevista (o mesmo PredictedPill do site), com "?"
// no lugar do número: a sua nota só aparece quando você cria a conta.
export const HiddenPill: React.FC<{ className?: string; size?: 'sm' | 'lg' }> = ({ className = '', size = 'sm' }) => {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-violet-600/95 text-white shadow-lg ring-1 ring-white/20 ${
        size === 'lg' ? 'pl-2.5 pr-3 py-1.5' : 'pl-1.5 pr-2 py-0.5'
      } ${className}`}
    >
      <Wand2 className={size === 'lg' ? 'w-4 h-4' : 'w-3 h-3'} aria-hidden />
      <span className="sr-only">{t('guestHome.teaserHidden')}</span>
      <span style={PIXEL} className={`${size === 'lg' ? 'text-xl' : 'text-sm'} leading-none`} aria-hidden>
        ?
      </span>
    </span>
  );
};

// Um pôster de prateleira, como nas prateleiras dos oráculos: o selo da nota
// prevista no alto, a barra na cor do oráculo no pé, e embaixo a prateleira
// (letra e nome do humor) e o título. Abre o menu do título de verdade.
export const ShelfPoster: React.FC<{
  title: LandingTitle;
  oracleColor: string;
  onOpen: (title: LandingTitle) => void;
}> = ({ title, oracleColor, onOpen }) => {
  const { t, i18n } = useTranslation();
  const name = titleName(title, i18n.language);
  const mood = MOOD_BY_KEY[title.mood];
  return (
    <button
      type="button"
      onClick={() => onOpen(title)}
      className={`group block w-full text-left rounded-xl ${FOCUS_RING}`}
      aria-label={t('guestHome.openTitle', { title: name })}
    >
      <span
        className="relative block aspect-[2/3] rounded-lg overflow-hidden ring-1 ring-white/10 transition-transform duration-200 group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
        style={{ background: VELVET, boxShadow: `0 16px 26px -18px ${oracleColor}` }}
      >
        <img
          src={`https://image.tmdb.org/t/p/w185${titlePoster(title, i18n.language)}`}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <HiddenPill className="absolute top-1.5 left-1.5" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1" style={{ background: oracleColor }} />
      </span>
      {mood && (
        <span className="mt-2 flex items-center gap-1 text-[11px] font-semibold leading-none" style={{ color: mood.color }}>
          <span style={PIXEL} aria-hidden>{mood.letter}</span>
          <span className="truncate">{t(mood.labelKey)}</span>
        </span>
      )}
      <span className={`mt-1 text-xs sm:text-[13px] font-medium ${POSTER_TITLE}`} style={{ color: PAPER }}>
        {name}
      </span>
    </button>
  );
};
