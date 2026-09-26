import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Star, Users, Wand2, Clapperboard } from 'lucide-react';
import { Movie } from '../lib/tmdb';
import OptimizedPoster from './OptimizedPoster';
import GlassLoader from './GlassLoader';
import OracleCardFan from './OracleCardFan';
import { VELVET, PAPER, INK, MIST, PIXEL, ORACLES } from '../lib/oracleTheme';

// Home de quem ainda não tem conta — o "cartão de visitas" do CineOracle.
// Toda a identidade sai das cartas dos oráculos (arte própria do app, em
// pixel art): o herói é uma mão de três cartas em leque, os títulos usam
// uma fonte pixelada que ecoa o letreiro das cartas, e cada oráculo tem
// a sua cor (sapo, raposa, cobra) usada como informação, não enfeite.
// Um único momento animado: as cartas se abrem em leque ao carregar.

interface GuestLandingProps {
  movies: Movie[];
  loading: boolean;
  onMovieClick: (movie: Movie) => void;
  onMovieHover: (movie: Movie) => void;
  onViewAll: () => void;
}

const SignUpButton: React.FC<{ tone: 'night' | 'paper' }> = ({ tone }) => {
  const { t } = useTranslation();
  return tone === 'night' ? (
    <Link
      to="/auth?signup=true"
      className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl text-base font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 shadow-lg shadow-fuchsia-950/50 hover:brightness-110 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
    >
      {t('guestHome.ctaSignUp')}
    </Link>
  ) : (
    <Link
      to="/auth?signup=true"
      className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl text-base font-semibold hover:opacity-90 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
      style={{ background: INK, color: PAPER }}
    >
      {t('guestHome.ctaSignUp')}
    </Link>
  );
};

// Pôster real em alta com a nota prevista escondida — mostra, sem inventar
// dado nenhum, o diferencial do app: a nota do público é uma, a sua pode
// ser outra.
const PredictedTeaser: React.FC<{ movie?: Movie }> = ({ movie }) => {
  const { t, i18n } = useTranslation();
  const score = movie?.vote_average
    ? movie.vote_average.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : null;

  return (
    <figure className="w-full max-w-[280px]">
      <div className="relative aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10" style={{ background: VELVET }}>
        {movie?.poster_path && (
          <OptimizedPoster
            src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
            alt={movie.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full bg-violet-600/95 text-white shadow-lg ring-1 ring-white/20">
          <Wand2 className="w-4 h-4" aria-hidden />
          <span style={PIXEL} className="text-lg leading-none" aria-label={t('guestHome.teaserHidden')}>?</span>
        </div>
        {movie && (
          <div className="absolute inset-x-0 bottom-0 p-4 pt-12 bg-gradient-to-t from-black/90 via-black/55 to-transparent">
            <p className="text-white font-semibold leading-snug line-clamp-2">{movie.title}</p>
            {score && (
              <p className="mt-1 text-sm text-white/80 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" aria-hidden />
                {t('guestHome.teaserPublic', { score })}
              </p>
            )}
          </div>
        )}
      </div>
      <figcaption className="mt-4 text-sm leading-relaxed" style={{ color: MIST }}>
        <span className="font-semibold" style={{ color: PAPER }}>{t('guestHome.teaserTitle')}</span>{' '}
        {t('guestHome.teaserHint')}
      </figcaption>
    </figure>
  );
};

const TrendingRow: React.FC<Omit<GuestLandingProps, 'onViewAll'> & { onViewAll: () => void }> = ({
  movies, loading, onMovieClick, onMovieHover, onViewAll,
}) => {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollStartRef = useRef(0);
  const dragDistanceRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - scrollRef.current.offsetLeft;
    scrollStartRef.current = scrollRef.current.scrollLeft;
    dragDistanceRef.current = 0;
    scrollRef.current.style.cursor = 'grabbing';
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    dragDistanceRef.current = Math.abs(x - startXRef.current);
    scrollRef.current.scrollLeft = scrollStartRef.current - (x - startXRef.current) * 2;
  };
  const handleMouseUp = () => {
    isDraggingRef.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
  };

  if (!loading && movies.length === 0) return null;

  return (
    <section className="py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 flex items-end justify-between gap-4">
        <h2 style={{ ...PIXEL, color: PAPER }} className="text-3xl sm:text-4xl leading-tight">
          {t('guestHome.trendingTitle')}
        </h2>
        {!loading && (
          <button
            onClick={onViewAll}
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium border border-white/15 hover:border-white/35 hover:bg-white/5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
            style={{ color: PAPER }}
          >
            {t('common.view_all')}
          </button>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><GlassLoader size="md" /></div>
      ) : (
        <div
          ref={scrollRef}
          className="mt-8 overflow-x-auto cursor-grab select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {/* O padding lateral acompanha a margem do conteúdo, mas a faixa
              rola de ponta a ponta da tela — dá pra ver que tem mais. */}
          <ol className="flex gap-4 px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))] pb-2">
            {movies.map((movie, index) => (
              <motion.li
                key={movie.id}
                className="relative flex-shrink-0 w-[132px] sm:w-[156px] aspect-[2/3] rounded-xl overflow-hidden cursor-pointer group ring-1 ring-white/10 shadow-xl"
                style={{ background: VELVET }}
                onClick={() => { if (dragDistanceRef.current > 5) return; onMovieClick(movie); }}
                onMouseEnter={() => onMovieHover(movie)}
                whileHover={{ y: -6 }}
                whileTap={{ scale: 0.97 }}
              >
                <OptimizedPoster
                  src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                  alt={movie.title}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <span
                  style={{ ...PIXEL, background: 'rgba(18,13,34,0.82)', color: PAPER }}
                  className="absolute top-2 left-2 min-w-[1.9rem] text-center px-1.5 py-0.5 rounded-md text-sm ring-1 ring-white/15"
                >
                  {index + 1}
                </span>
                <div className="absolute inset-x-0 bottom-0 p-2.5 pt-10 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white text-sm font-semibold leading-snug line-clamp-2">{movie.title}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
};

const GuestLanding: React.FC<GuestLandingProps> = ({ movies, loading, onMovieClick, onMovieHover, onViewAll }) => {
  const { t } = useTranslation();

  const steps = [
    { title: 'guestHome.step1Title', desc: 'guestHome.step1Desc' },
    { title: 'guestHome.step2Title', desc: 'guestHome.step2Desc' },
    { title: 'guestHome.step3Title', desc: 'guestHome.step3Desc' },
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* ---------- Herói ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 sm:pt-10 lg:pt-14 pb-16 sm:pb-20 lg:pb-24 grid lg:grid-cols-12 items-center gap-8 lg:gap-6">
        <div className="order-2 lg:order-1 lg:col-span-6">
          <h1
            style={{ ...PIXEL, color: PAPER }}
            className="text-[2.6rem] leading-[1.04] sm:text-6xl lg:text-[3.5rem] xl:text-[4.1rem] font-semibold"
          >
            {t('guestHome.heroTitle')}
          </h1>
          <p className="mt-6 text-base sm:text-lg leading-relaxed max-w-[34rem]" style={{ color: MIST }}>
            {t('guestHome.heroSubtitle')}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <SignUpButton tone="night" />
            <Link
              to="/auth"
              className="inline-flex items-center justify-center px-5 py-3.5 rounded-xl text-base font-medium border border-white/15 hover:border-white/35 hover:bg-white/5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
              style={{ color: PAPER }}
            >
              {t('guestHome.ctaSignIn')}
            </Link>
          </div>
          <p className="mt-4 text-sm" style={{ color: MIST }}>{t('guestHome.ctaNote')}</p>
        </div>
        <div className="order-1 lg:order-2 lg:col-span-6">
          <OracleCardFan />
        </div>
      </section>

      {/* ---------- Os três oráculos ---------- */}
      <section className="border-t border-white/[0.07]">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
          <h2 style={{ ...PIXEL, color: PAPER }} className="text-3xl sm:text-4xl lg:text-[2.75rem] leading-tight max-w-[24ch]">
            {t('guestHome.oraclesTitle')}
          </h2>
          <ul className="mt-10 sm:mt-14 grid gap-9 md:grid-cols-3 md:gap-10">
            {ORACLES.map((oracle) => (
              <li key={oracle.id} className="flex md:flex-col items-start gap-5 md:gap-7">
                <img
                  src={oracle.img}
                  alt={t(`guestHome.${oracle.id}Alt`)}
                  width={1696}
                  height={2528}
                  loading="lazy"
                  decoding="async"
                  className="w-[96px] sm:w-[112px] md:w-[150px] lg:w-[170px] flex-shrink-0 rounded-[5px] ring-1 ring-white/10"
                  style={{ boxShadow: `0 22px 44px -18px ${oracle.color}80` }}
                />
                <div>
                  <p style={{ ...PIXEL, color: oracle.color }} className="text-2xl sm:text-3xl leading-none">{oracle.name}</p>
                  <p className="mt-2.5 text-lg font-semibold" style={{ color: PAPER }}>{t(`guestHome.${oracle.id}Line`)}</p>
                  <p className="mt-1.5 text-sm sm:text-base leading-relaxed max-w-[30ch]" style={{ color: MIST }}>
                    {t(`guestHome.${oracle.id}Desc`)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- Como funciona (sequência real: 1 → 2 → 3) ---------- */}
      <section className="border-t border-white/[0.07]">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24 grid lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          <div className="lg:col-span-7">
            <h2 style={{ ...PIXEL, color: PAPER }} className="text-3xl sm:text-4xl lg:text-[2.75rem] leading-tight">
              {t('guestHome.howTitle')}
            </h2>
            <ol className="mt-10">
              {steps.map((step, i) => (
                <li key={step.title} className="relative pl-16 pb-9 last:pb-0">
                  {i < steps.length - 1 && (
                    <span aria-hidden className="absolute left-[21px] top-12 bottom-1 w-px bg-white/15" />
                  )}
                  <span
                    aria-hidden
                    style={{ ...PIXEL, color: PAPER, background: VELVET }}
                    className="absolute left-0 top-0 w-11 h-11 rounded-full grid place-items-center text-xl ring-1 ring-violet-300/30"
                  >
                    {i + 1}
                  </span>
                  <h3 className="text-lg sm:text-xl font-semibold pt-2" style={{ color: PAPER }}>{t(step.title)}</h3>
                  <p className="mt-1.5 text-sm sm:text-base leading-relaxed max-w-[38rem]" style={{ color: MIST }}>{t(step.desc)}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <PredictedTeaser movie={movies[0]} />
          </div>
        </div>
      </section>

      {/* ---------- Melhor com amigos ---------- */}
      <section className="border-t border-white/[0.07]">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">
          <h2 style={{ ...PIXEL, color: PAPER }} className="text-3xl sm:text-4xl leading-tight">
            {t('guestHome.friendsTitle')}
          </h2>
          <div className="mt-9 grid sm:grid-cols-2 gap-8 sm:gap-12 max-w-4xl">
            {[
              { icon: Clapperboard, title: 'guestHome.friendsMatchTitle', desc: 'guestHome.friendsMatchDesc' },
              { icon: Users, title: 'guestHome.friendsBubblesTitle', desc: 'guestHome.friendsBubblesDesc' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4">
                <span className="w-11 h-11 shrink-0 rounded-xl grid place-items-center ring-1 ring-violet-300/30 text-violet-200" style={{ background: VELVET }}>
                  <Icon className="w-5 h-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: PAPER }}>{t(title)}</h3>
                  <p className="mt-1 text-sm sm:text-base leading-relaxed" style={{ color: MIST }}>{t(desc)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Em alta esta semana ---------- */}
      <div className="border-t border-white/[0.07]">
        <TrendingRow movies={movies} loading={loading} onMovieClick={onMovieClick} onMovieHover={onMovieHover} onViewAll={onViewAll} />
      </div>

      {/* ---------- Faixa final: as cartas "na mesa" ---------- */}
      <section style={{ background: PAPER }}>
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24 flex flex-col lg:flex-row lg:items-center gap-10 lg:gap-16">
          <div aria-hidden className="flex justify-center lg:justify-start shrink-0 pl-6">
            {ORACLES.map((oracle, i) => (
              <img
                key={oracle.id}
                src={oracle.altImg}
                alt=""
                width={774}
                height={1141}
                loading="lazy"
                decoding="async"
                className="w-[92px] sm:w-[112px] -ml-6 rounded-[5px] shadow-[0_18px_36px_-14px_rgba(34,27,54,0.55)]"
                style={{ transform: `rotate(${(i - 1) * 8}deg) translateY(${i === 1 ? '-6px' : '4px'})` }}
              />
            ))}
          </div>
          <div>
            <h2 style={{ ...PIXEL, color: INK }} className="text-3xl sm:text-4xl lg:text-[2.75rem] leading-tight max-w-[20ch]">
              {t('guestHome.finalTitle')}
            </h2>
            <p className="mt-4 text-base sm:text-lg leading-relaxed max-w-[36rem]" style={{ color: `${INK}CC` }}>
              {t('guestHome.finalSubtitle')}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
              <SignUpButton tone="paper" />
              <Link to="/auth" className="text-base font-semibold underline underline-offset-4 decoration-2 hover:opacity-80" style={{ color: INK }}>
                {t('guestHome.ctaSignIn')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default GuestLanding;