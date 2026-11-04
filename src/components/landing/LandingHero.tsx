import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import type { Movie } from '../../lib/tmdb';
import OracleCardFan from '../OracleCardFan';
import { FOCUS_RING, INK, MIST, PAPER, PIXEL, VELVET } from '../../lib/oracleTheme';
import { getInvitePreview, getPendingInvite, INVITE_REWARD } from '../../lib/invite';
import { HiddenPill, SignInButton, SignUpButton } from './LandingBits';
import { asMovie, formatScore, ORACLE_SHELF, titlePoster } from './landingData';

// O herói da home de visitante (04/11/2026). Antes era "Tire uma carta" — a
// mão de cartas sozinha vendia um jogo. Agora a frase vende o que o
// CineOracle faz por um cinéfilo (a nota prevista) e a cena junta a marca e
// o produto: a mão das três cartas dos oráculos atrás e, na frente, um
// INGRESSO de cinema do filme nº 1 da semana, com a nota do público de um
// lado e, no canhoto, a sua nota — o "?" que só aparece com a conta.
// Movimento: as cartas abrem em leque (OracleCardFan) e o ingresso sobe logo
// depois; com "reduzir movimento", tudo já aparece no lugar.

// Quem chegou por um link de convite vê quem convidou (o mesmo aviso da tela
// de cadastro). O código já foi guardado pelo main.tsx; aqui só lemos.
const InviteBanner: React.FC = () => {
  const { t } = useTranslation();
  const [inviter, setInviter] = useState<{ username: string; avatar_url: string | null } | null>(null);
  useEffect(() => {
    const code = getPendingInvite();
    if (!code) return;
    let alive = true;
    getInvitePreview(code).then((preview) => alive && setInviter(preview));
    return () => {
      alive = false;
    };
  }, []);
  if (!inviter) return null;
  return (
    <div
      className="mb-6 flex items-center gap-3 rounded-2xl px-3.5 py-3 max-w-[34rem]"
      style={{ background: 'linear-gradient(135deg, rgba(75,31,122,0.55), rgba(28,42,120,0.55))', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.45)' }}
    >
      {inviter.avatar_url ? (
        <img src={inviter.avatar_url} alt="" className="w-10 h-10 shrink-0 rounded-full object-cover ring-2 ring-amber-200/60" />
      ) : (
        <span className="grid place-items-center w-10 h-10 shrink-0 rounded-full text-sm font-bold" style={{ background: VELVET, color: PAPER }}>
          {inviter.username.slice(0, 1).toUpperCase()}
        </span>
      )}
      <p className="text-sm leading-snug" style={{ color: PAPER }}>
        {t('invite.signupBanner', { name: inviter.username, count: INVITE_REWARD })}
      </p>
    </div>
  );
};

// O ingresso: papel creme das cartas, picote e meia-lua dos dois lados do
// canhoto (landing.css). Abre o menu do título (sinopse, elenco, onde ver).
const AdmitTicket: React.FC<{ movie?: Movie; loading: boolean; onOpen: (movie: Movie) => void }> = ({ movie, loading, onOpen }) => {
  const { t, i18n } = useTranslation();
  // Sem a lista da semana (TMDB fora do ar), o ingresso fica com um título
  // fixo das prateleiras do Bogart, para a cena nunca ficar vazia.
  const fallback = ORACLE_SHELF.bogart[0];
  const shown: Movie | null = movie ?? (loading ? null : asMovie(fallback, i18n.language));
  const poster = movie ? movie.poster_path : titlePoster(fallback, i18n.language);
  const title = shown ? shown.title || shown.name || '' : '';
  const score = shown?.vote_average ? formatScore(shown.vote_average, i18n.language) : null;

  const body = (
    <span className="lp-ticket relative grid grid-cols-[auto_minmax(0,1fr)_var(--lp-stub)] items-center gap-3 pl-3 py-3 text-left">
      <span className="relative block w-[52px] sm:w-[60px] aspect-[2/3] rounded-md overflow-hidden shrink-0" style={{ background: `${INK}22` }}>
        {shown && poster && (
          <img src={`https://image.tmdb.org/t/p/w185${poster}`} alt="" decoding="async" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
        )}
      </span>
      <span className="min-w-0 py-0.5">
        <span style={{ ...PIXEL, color: '#6D28D9' }} className="block text-xs leading-none tracking-[0.12em] uppercase">
          {movie ? t('guestHome.ticketTrending') : t('guestHome.ticketShelf')}
        </span>
        {shown ? (
          <span className="mt-1.5 block text-[15px] sm:text-base font-semibold leading-snug line-clamp-2" style={{ color: INK }}>
            {title}
          </span>
        ) : (
          <span className="mt-2 block h-4 w-4/5 rounded" style={{ background: `${INK}1F` }} aria-hidden />
        )}
        <span className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium" style={{ color: `${INK}B8` }}>
          <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-600" aria-hidden />
          {score ? t('guestHome.ticketAudience', { score }) : <span className="block h-3 w-16 rounded" style={{ background: `${INK}1A` }} aria-hidden />}
        </span>
      </span>
      {/* O canhoto: a sua nota. */}
      <span className="flex flex-col items-center justify-center gap-1.5 px-2 text-center">
        <span style={{ ...PIXEL, color: INK }} className="text-[11px] sm:text-xs leading-tight tracking-[0.1em] uppercase">
          {t('guestHome.ticketYou')}
        </span>
        <HiddenPill size="lg" />
      </span>
      <span aria-hidden className="lp-ticket-perf" />
    </span>
  );

  return shown ? (
    <button
      type="button"
      onClick={() => onOpen(shown)}
      className={`lp-ticket-wrap block w-full rounded-[14px] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${FOCUS_RING}`}
      aria-label={t('guestHome.ticketAria', { title, score: score ?? '—' })}
    >
      {body}
    </button>
  ) : (
    <div className="lp-ticket-wrap" aria-busy="true">
      {body}
    </div>
  );
};

const LandingHero: React.FC<{ movies: Movie[]; loading: boolean; onMovieClick: (movie: Movie) => void }> = ({ movies, loading, onMovieClick }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const top = movies.find((m) => m.poster_path);

  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-4 sm:pt-8 lg:pt-12 pb-14 sm:pb-20 lg:pb-24 grid lg:grid-cols-12 items-center gap-7 lg:gap-8">
      <div className="min-w-0 order-2 lg:order-1 lg:col-span-6">
        <InviteBanner />
        <h1 style={{ ...PIXEL, color: PAPER }} className="text-[2.55rem] leading-[1.04] sm:text-6xl lg:text-[3.6rem] xl:text-[4.2rem] max-w-[13ch]">
          {t('guestHome.heroTitle')}
        </h1>
        <p className="mt-5 sm:mt-6 text-base sm:text-lg leading-relaxed max-w-[34rem]" style={{ color: MIST }}>
          {t('guestHome.heroSubtitle')}
        </p>
        <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <SignUpButton />
          <SignInButton />
        </div>
        <p className="mt-4 text-sm" style={{ color: MIST }}>{t('guestHome.ctaNote')}</p>
      </div>

      <div className="min-w-0 order-1 lg:order-2 lg:col-span-6 flex flex-col items-center">
        <OracleCardFan className="max-w-[300px] sm:max-w-[430px] lg:max-w-[520px]" />
        <motion.div
          className="relative z-10 -mt-9 sm:-mt-12 w-full max-w-[350px] sm:max-w-[410px]"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 140, damping: 18, delay: reduceMotion ? 0 : 0.7 }}
        >
          {/* Só o ingresso fica torto, como se tivesse sido largado na mesa;
              a frase embaixo fica reta, para ler sem esforço. */}
          <div className="-rotate-[1.5deg]">
            <AdmitTicket movie={top} loading={loading} onOpen={onMovieClick} />
          </div>
          <p className="mt-3 text-center text-[13px] leading-snug" style={{ color: MIST }}>
            {t('guestHome.ticketHint')}
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default LandingHero;
