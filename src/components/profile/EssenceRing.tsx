import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowUpRight, Film, Info, Scroll, X } from 'lucide-react';
import { MOOD_BY_KEY, withMoodAlpha } from '../../lib/moods';
import { personaText, topMoodKeys, PERSONA_THRESHOLD, type UserPersona } from '../../lib/persona';
import { PAPER, MIST, PIXEL, VELVET, FOCUS_RING, glassPanel, ratingTone } from '../../lib/oracleTheme';
import { getMovieDetailsFromDB, type Movie } from '../../lib/tmdb';
import type { Affinity, MoodSlice } from '../../lib/tasteStats';
import type { MovieWithRating } from '../../hooks/useProfileData';
import { PersonaCode, PersonaPoster } from '../PersonaBits';
import { PersonaRevelationSheet, PersonaHowItWorksSheet } from '../PersonaSheets';
import MovieDetailsModal from '../MovieDetailsModal';
import MoodGrid from './MoodGrid';
import KeywordCloud from './KeywordCloud';
import { ModuleTitle, formatOne } from './observatoryKit';

// Personalidade cinematográfica + as 9 prateleiras, num bloco só (13/10/2026,
// terceira versão — sem círculo).
//
// À esquerda, a grade 3×3 de frascos (MoodGrid): cada humor com o líquido
// no nível da parte dos filmes da pessoa nele; os 3 do código numerados.
// À direita, a personalidade: pôster, código, título e o começo da revelação
// (tocar abre a Revelação completa) e os temas que a pessoa mais ama
// (KeywordCloud: tamanho = nota média, poucos de cada vez, alternando).
//
// Tocar num frasco troca o painel pela leitura daquele humor: a %, quantos
// filmes, a média, o que ele revela, os títulos mais bem avaliados ali
// (pôsteres que abrem o filme), os temas dele e a prateleira. O X volta
// para a personalidade. O "i" do canto abre o Como funciona.

interface EssenceRingProps {
  slices: MoodSlice[];
  counted: number;
  persona: UserPersona | null;
  personaLoading?: boolean;
  topKeywords: Affinity[];
  isOwn: boolean;
  // "@fulano" no perfil de outra pessoa
  ownerName?: string;
}

// Celular estreito: frascos mais baixos e menos palavras por vez.
function useCompact() {
  const query = '(max-width: 639px)';
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return compact;
}

const EssenceRing: React.FC<EssenceRingProps> = ({ slices, counted, persona, personaLoading = false, topKeywords, isOwn, ownerName }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const compact = useCompact();
  const panelRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showRevelation, setShowRevelation] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [opening, setOpening] = useState<number | null>(null);

  const bySlice = useMemo(() => new Map(slices.map((s) => [s.key, s])), [slices]);
  const codeKeys = useMemo(() => topMoodKeys(persona), [persona]);
  const hasPersona = Boolean(persona?.code && persona.persona);
  const text = hasPersona && persona?.persona ? personaText(persona.persona, i18n.language) : null;

  const selectedMood = selected ? MOOD_BY_KEY[selected] : null;
  const selectedSlice = selected ? bySlice.get(selected as MoodSlice['key']) : undefined;
  const accent = selectedMood?.color ?? (codeKeys[0] ? MOOD_BY_KEY[codeKeys[0]]?.color : undefined) ?? '#8B5CF6';
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const avgText = (avg: number | null | undefined) => (typeof avg === 'number' ? formatOne(avg, i18n.language) : '–');
  const username = ownerName?.replace(/^@/, '');

  const toggle = (key: string) => setSelected((prev) => (prev === key ? null : key));

  // No celular o painel fica embaixo da grade: ao escolher um humor, traz o
  // painel para a tela se ele estiver escondido.
  useEffect(() => {
    if (!selected || !compact || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    if (rect.top > window.innerHeight - 160) panelRef.current.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  }, [selected, compact, reduceMotion]);

  const openMovie = async (item: MovieWithRating) => {
    setOpening(item.id);
    try {
      setMovie(await getMovieDetailsFromDB(item.id, item.media_type === 'tv' ? 'tv' : 'movie'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setOpening(null);
    }
  };

  if (counted === 0 && !hasPersona && !personaLoading) {
    return (
      <section className="h-full rounded-3xl p-5 sm:p-7" style={glassPanel('#8B5CF6')}>
        <ModuleTitle title={isOwn ? t('oracle.cinematicEssenceLabel') : t('profile.essenceOf', { username })} hint={isOwn ? t('home.desk.essenceEmptyDesc') : t('profile.essenceEmptyOther', { username })} />
        {isOwn && (
          <Link to="/oracle" className={`mt-4 inline-flex items-center justify-start gap-1.5 text-sm font-medium rounded ${FOCUS_RING}`} style={{ color: '#F0ABFC' }}>
            {t('oracle.discoverYourEssence')}
            <ArrowUpRight className="w-4 h-4" aria-hidden />
          </Link>
        )}
      </section>
    );
  }

  const sectionLabel = (label: string) => (
    <p className="text-[12px] font-medium" style={{ color: MIST }}>
      {label}
    </p>
  );

  // ---------- painel: personalidade ----------
  const personaPanel = (() => {
    const themes = (
      <div className="mt-5 pt-4 border-t border-white/[0.07]">
        {sectionLabel(ownerName ? t('profile.observatory.keywordsTitleOf', { name: ownerName }) : t('profile.observatory.keywordsTitle'))}
        <div className="mt-2">
          <KeywordCloud words={topKeywords} perGroup={compact ? 4 : 5} accent={accent} emptyText={t('profile.observatory.keywordsEmpty')} compact={compact} />
        </div>
      </div>
    );

    if (personaLoading) {
      return (
        <div className="flex gap-4" aria-busy="true">
          <span className="w-[84px] aspect-[2/3] rounded-lg bg-white/10 animate-pulse" />
          <span className="flex-1 space-y-3">
            <span className="block h-9 w-28 rounded-lg bg-white/10 animate-pulse" />
            <span className="block h-4 w-full rounded bg-white/10 animate-pulse" />
            <span className="block h-4 w-2/3 rounded bg-white/10 animate-pulse" />
          </span>
        </div>
      );
    }
    if (!hasPersona || !persona?.persona || !text) {
      const threshold = persona?.threshold || PERSONA_THRESHOLD;
      const missing = Math.max(0, threshold - (persona?.counted ?? counted));
      return (
        <div>
          <p className="font-semibold" style={{ color: PAPER }}>
            {isOwn ? t('home.desk.essenceEmptyTitle') : t('profile.essenceEmptyOther', { username })}
          </p>
          <div className="mt-3 h-1.5 rounded-full bg-white/[0.07] overflow-hidden" aria-hidden>
            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, ((threshold - missing) / threshold) * 100)}%`, background: 'linear-gradient(90deg,#8B5CF6,#F0ABFC)' }} />
          </div>
          <p className="mt-2 text-[13px]" style={{ color: MIST }}>
            {t('profile.observatory.personaProgress', { counted: threshold - missing, threshold })}
          </p>
          {isOwn && (
            <Link to="/oracle" className={`mt-4 inline-flex items-center justify-start gap-1.5 text-sm font-medium rounded ${FOCUS_RING}`} style={{ color: '#F0ABFC' }}>
              {t('oracle.discoverYourEssence')}
              <ArrowUpRight className="w-4 h-4" aria-hidden />
            </Link>
          )}
          {themes}
        </div>
      );
    }
    return (
      <div>
        <button
          type="button"
          onClick={() => setShowRevelation(true)}
          className={`group w-full flex items-start justify-start gap-4 text-left rounded-2xl p-2 -m-2 transition hover:bg-white/[0.04] ${FOCUS_RING}`}
          aria-label={`${t('oracle.revelation')}: ${text.title}`}
        >
          <PersonaPoster path={persona.persona.posterPath} alt="" className="w-[72px] sm:w-[84px] shrink-0 rounded-lg" />
          <span className="min-w-0 flex flex-col">
            <PersonaCode code={persona.code as string} className="text-4xl sm:text-[44px] leading-none" />
            <span className="mt-1.5 text-lg font-semibold leading-snug" style={{ color: PAPER }}>
              {text.title}
            </span>
            <span className="mt-0.5 text-[13px]" style={{ color: MIST }}>
              {text.sameAsFilm ? text.filmWithYear : t('oracle.persona.characterIn', { character: text.character, film: text.filmWithYear })}
            </span>
          </span>
        </button>
        {text.blurb && (
          <p className="mt-3 text-[14px] leading-relaxed line-clamp-3" style={{ color: 'rgba(243,234,211,0.82)' }}>
            {text.blurb}
          </p>
        )}
        <button
          type="button"
          onClick={() => setShowRevelation(true)}
          className={`mt-1.5 inline-flex items-center justify-start gap-1.5 text-[13px] font-medium rounded ${FOCUS_RING}`}
          style={{ color: '#F9A8D4' }}
        >
          <Scroll className="w-4 h-4" aria-hidden />
          {t('profile.observatory.readRevelation')}
        </button>
        {themes}
      </div>
    );
  })();

  // ---------- painel: humor escolhido ----------
  const moodPanel = selectedMood ? (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="grid place-items-center w-14 h-14 shrink-0 rounded-2xl text-3xl leading-none"
            style={{ ...PIXEL, color: selectedMood.color, background: withMoodAlpha(selectedMood, 0.14), boxShadow: `inset 0 0 0 1px ${withMoodAlpha(selectedMood, 0.4)}` }}
            aria-hidden
          >
            {selectedMood.letter}
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-semibold leading-snug" style={{ color: PAPER }}>
              {t(selectedMood.labelKey)}
            </span>
            {codeKeys.includes(selectedMood.key) && (
              <span className="block text-[12px]" style={{ color: selectedMood.color }}>
                {t('profile.observatory.codeRank', { rank: codeKeys.indexOf(selectedMood.key) + 1 })}
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSelected(null)}
          className={`grid place-items-center w-11 h-11 shrink-0 -mr-2 -mt-1 rounded-full transition hover:bg-white/[0.06] ${FOCUS_RING}`}
          aria-label={hasPersona ? t('profile.observatory.backToPersona') : t('common.close')}
          title={hasPersona ? t('profile.observatory.backToPersona') : t('common.close')}
        >
          <X className="w-[18px] h-[18px]" style={{ color: MIST }} aria-hidden />
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: t('profile.observatory.moodShareLabel'), value: pct(selectedSlice?.share ?? 0), color: PAPER },
          { label: t('profile.observatory.moodFilmsLabel'), value: String(selectedSlice?.films ?? 0), color: PAPER },
          {
            label: isOwn ? t('profile.observatory.moodAvgLabel') : t('profile.observatory.moodAvgLabelOf'),
            value: avgText(selectedSlice?.avg),
            color: typeof selectedSlice?.avg === 'number' ? ratingTone(Math.round(selectedSlice.avg)).color : MIST,
          },
        ].map((cell) => (
          <div key={cell.label} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <dd style={{ ...PIXEL, color: cell.color }} className="text-2xl leading-none tabular-nums">
              {cell.value}
            </dd>
            <dt className="mt-1 text-[11px] leading-tight" style={{ color: MIST }}>
              {cell.label}
            </dt>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-[14px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
        {t(selectedMood.readingKey)}
      </p>

      {selectedSlice && selectedSlice.top.length > 0 && (
        <div className="mt-4">
          {sectionLabel(isOwn ? t('profile.observatory.moodTop') : t('profile.observatory.moodTopOf', { name: ownerName }))}
          <ul className="mt-2 grid grid-cols-4 gap-2 max-w-[320px]">
            {selectedSlice.top.map((item) => {
              const tone = ratingTone(item.userRating);
              return (
                <li key={`${item.media_type}:${item.id}`} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => openMovie(item)}
                    className={`group relative block w-full aspect-[2/3] rounded-lg overflow-hidden ring-1 ring-white/10 hover:ring-white/30 transition ${FOCUS_RING}`}
                    style={{ background: VELVET }}
                    aria-label={`${item.title}${typeof item.userRating === 'number' ? ` · ${item.userRating}` : ''}`}
                    title={item.title}
                  >
                    {item.poster_path ? (
                      <img src={`https://image.tmdb.org/t/p/w185${item.poster_path}`} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300" />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                        <Film className="w-5 h-5" aria-hidden />
                      </span>
                    )}
                    {typeof item.userRating === 'number' && (
                      <span
                        className="absolute bottom-1 right-1 h-5 min-w-[20px] px-1 grid place-items-center rounded-md text-[12px] leading-none"
                        style={{ ...PIXEL, background: 'rgba(18,13,34,0.86)', color: tone.color, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
                      >
                        {item.userRating}
                      </span>
                    )}
                    {opening === item.id && <span className="absolute inset-0 bg-black/50 animate-pulse" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-4">
        {sectionLabel(t('profile.observatory.keywordsInMood', { mood: t(selectedMood.labelKey) }))}
        <div className="mt-2">
          <KeywordCloud words={selectedSlice?.keywords ?? []} perGroup={compact ? 4 : 5} accent={selectedMood.color} emptyText={t('profile.observatory.keywordsEmptyMood')} compact={compact} />
        </div>
      </div>

      <Link
        to={`/oracle/libraries?oracle=bogart&type=movie&mood=${selectedMood.key}`}
        className={`mt-3 inline-flex items-center justify-start gap-1.5 text-sm font-medium rounded ${FOCUS_RING}`}
        style={{ color: selectedMood.color }}
      >
        {t('profile.observatory.openShelf')}
        <ArrowUpRight className="w-4 h-4" aria-hidden />
      </Link>
    </div>
  ) : null;

  // ---------- bloco ----------
  return (
    <section className="relative h-full rounded-3xl p-5 sm:p-7 overflow-hidden" style={glassPanel(accent)}>
      <ModuleTitle
        title={isOwn ? t('oracle.cinematicEssenceLabel') : t('profile.essenceOf', { username })}
        hint={counted > 0 ? t('profile.observatory.moodsHint', { count: counted }) : undefined}
        action={
          <button
            type="button"
            onClick={() => setShowHowItWorks(true)}
            className={`grid place-items-center w-11 h-11 shrink-0 -mr-2 -mt-2 rounded-full transition hover:bg-white/[0.06] ${FOCUS_RING}`}
            aria-label={t('profile.howItWorks')}
            title={t('profile.howItWorks')}
          >
            <Info className="w-5 h-5 text-sky-300" aria-hidden />
          </button>
        }
      />

      <div className="mt-5 grid md:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-6 md:gap-10 items-start">
        <div className="min-w-0">
          <MoodGrid slices={slices} codeKeys={codeKeys} selected={selected} onToggle={toggle} compact={compact} />
          <p className="mt-3 text-[12px] leading-snug" style={{ color: MIST }}>
            {isOwn ? t('profile.observatory.gridHint') : t('profile.observatory.gridHintOf', { name: ownerName })}
          </p>
        </div>

        <div ref={panelRef} className="min-w-0 scroll-mt-24">
          <AnimatePresence mode="wait">
            <motion.div
              key={selected ?? 'persona'}
              initial={reduceMotion ? false : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.22 }}
            >
              {moodPanel ?? personaPanel}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {hasPersona && persona && <PersonaRevelationSheet open={showRevelation} onClose={() => setShowRevelation(false)} persona={persona} isOwn={isOwn} />}
      <PersonaHowItWorksSheet open={showHowItWorks} onClose={() => setShowHowItWorks(false)} persona={persona} isOwn={isOwn} />
      {movie && <MovieDetailsModal movie={movie} isOpen={true} onClose={() => setMovie(null)} />}
    </section>
  );
};

export default EssenceRing;
