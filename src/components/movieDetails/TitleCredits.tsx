import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { PROFILE_IMAGE_BASE } from '../../lib/castPhotos';
import { getPeoplePhotos, getStoredPersonPhoto } from '../../lib/peoplePhotos';
import { budgetLevel, budgetOracle, adjustedBudget, BUDGET_LEVEL_EMOJI, BUDGET_LEVEL_LABEL, BUDGET_SAYINGS } from '../../lib/budgetTiers';
import { VELVET, PAPER, INK, MIST, PIXEL, FOCUS_RING, ORACLE_BY_ID, withAlpha } from '../../lib/oracleTheme';
import type { PersonSeed } from '../PersonPageSheet';
import { SECTION_CLASS, type TitleMovie } from './shared';
import { useTitleBudget } from './useTitleBudget';

// Linha 1: diretor (abre a página dele, aba Direção). Linha 2: orçamento |
// selo do oráculo (só filmes com orçamento conhecido). A foto do diretor e o
// orçamento chegam por conta própria e re-renderizam só esta seção.

interface TitleCreditsProps {
  movie: TitleMovie;
  // os oráculos com selo neste título (quem comenta o orçamento)
  oracleSources: string[];
  // abre a página de uma pessoa por cima do menu
  onOpenPerson: (person: PersonSeed) => void;
}

const TitleCredits: React.FC<TitleCreditsProps> = ({ movie, oracleSources, onOpenPerson }) => {
  const { t, i18n } = useTranslation();
  const isTvShow = movie.media_type === 'tv';
  const budget = useTitleBudget(movie);

  // Diretor: tocar abre a página da pessoa na aba Direção (13/10/2026 — o
  // Top 10 que abria dentro deste menu foi aposentado). Sem o id no título,
  // ele é procurado pelo nome no clique; a foto vem do banco quando há id.
  const [directorPhoto, setDirectorPhoto] = useState<string | null>(null);
  const [resolvingDirector, setResolvingDirector] = useState(false);
  useEffect(() => {
    setResolvingDirector(false);
  }, [movie.id]);

  // Foto do diretor (só do banco, e só quando o título tem o id dele).
  const directorCrew = movie.credits?.crew?.find((person) => person.job === 'Director' || person.job === 'Creator' || person.job === 'Executive Producer');
  const directorCrewId = directorCrew && directorCrew.id > 0 ? directorCrew.id : null;
  useEffect(() => {
    setDirectorPhoto(null);
    if (!directorCrewId) return;
    let cancelled = false;
    getStoredPersonPhoto(directorCrewId).then((photo) => !cancelled && setDirectorPhoto(photo));
    return () => {
      cancelled = true;
    };
  }, [directorCrewId]);

  // Balão do selo de orçamento (abre/fecha no toque, como os selos da capa).
  const [budgetBubbleOpen, setBudgetBubbleOpen] = useState(false);
  useEffect(() => {
    setBudgetBubbleOpen(false);
  }, [movie.id]);

  // Séries: Creator ou Director; filmes: Director (Executive Producer como
  // último recurso, como sempre foi).
  let director = t('movies.unknown');
  if (movie.credits?.crew) {
    const directorPerson = movie.credits.crew.find(person =>
      person.job === 'Director' || person.job === 'Creator' || person.job === 'Executive Producer'
    );
    if (directorPerson) {
      director = directorPerson.name;
    }
  }

  // "US$ 165 milhões" / "$165 million" (1 casa decimal quando precisa).
  const formatBudget = (value: number) => {
    const fmt = (n: number) => n.toLocaleString(i18n.language, { maximumFractionDigits: 1 });
    if (value >= 1e9) return t('movies.budgetBillion', { value: fmt(value / 1e9), count: value < 2e9 ? 1 : 2 });
    if (value >= 1e6) return t('movies.budgetMillion', { value: fmt(value / 1e6), count: value < 2e6 ? 1 : 2 });
    return t('movies.budgetThousand', { value: fmt(Math.max(1, Math.round(value / 1e3))) });
  };

  // Abre a página do diretor (aba Direção). O id vem do título quando ele
  // já foi atualizado pelo servidor (director_id); senão é procurado pelo
  // nome — preferindo quem é conhecido por dirigir (getPeoplePhotos guarda
  // a resposta na sessão e o proxy por 30 dias).
  const openDirectorPage = async () => {
    if (!directorCrew || resolvingDirector) return;
    if (directorCrewId) {
      onOpenPerson({ id: directorCrewId, name: directorCrew.name, profilePath: directorPhoto, role: 'director' });
      return;
    }
    setResolvingDirector(true);
    try {
      const key = `director:${directorCrew.name.toLowerCase()}`;
      const found = (await getPeoplePhotos([{ key, id: null, name: directorCrew.name, role: 'director' }])).get(key);
      if (found?.id) onOpenPerson({ id: found.id, name: directorCrew.name, profilePath: found.photo, role: 'director' });
      else toast.error(t('movies.noDirectorMoviesFound'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setResolvingDirector(false);
    }
  };

  return (
    <section className={SECTION_CLASS}>
      {/* Linha 1: diretor (abre a página dele, aba Direção). Linha 2:
          orçamento | selo do oráculo (só filmes com orçamento
          conhecido). */}
      {director !== t('movies.unknown') && directorCrew ? (
        <button
          type="button"
          onClick={openDirectorPage}
          aria-label={t('person.openDirector', { name: director })}
          className={`group flex w-[calc(100%+1rem)] -mx-2 items-center justify-start gap-3 min-w-0 px-2 py-1.5 rounded-xl text-left transition hover:bg-white/[0.06] ${FOCUS_RING}`}
        >
          <span
            aria-hidden
            className="relative grid place-items-center w-11 h-11 shrink-0 rounded-full overflow-hidden ring-1 ring-white/10 group-hover:ring-white/30 transition text-sm font-semibold"
            style={{ background: VELVET, color: MIST }}
          >
            {director.charAt(0)}
            {directorPhoto && (
              <img
                src={`${PROFILE_IMAGE_BASE}${directorPhoto}`}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => setDirectorPhoto(null)}
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm" style={{ color: MIST }}>{isTvShow ? t('movies.creator') : t('movies.director')}</span>
            <span className="block mt-0.5 text-lg font-semibold truncate group-hover:underline underline-offset-4" style={{ color: PAPER }}>{director}</span>
          </span>
          {resolvingDirector ? (
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={{ color: MIST }} aria-hidden />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: MIST }} aria-hidden />
          )}
        </button>
      ) : (
        <div className="min-w-0">
          <p className="text-sm" style={{ color: MIST }}>{t('movies.director')}</p>
          <p className="mt-0.5 text-lg font-semibold truncate" style={{ color: PAPER }}>{director}</p>
        </div>
      )}

      {!isTvShow && budget !== null && (() => {
        const isPtLang = i18n.language.startsWith('pt');
        const level = typeof budget === 'number' ? budgetLevel(budget, movie.release_date) : null;
        const oracleId = budgetOracle(movie.release_date, movie.vote_count, oracleSources);
        const oracle = ORACLE_BY_ID[oracleId];
        const saying = level ? BUDGET_SAYINGS[oracleId][level] : null;
        const levelLabel = level ? (isPtLang ? BUDGET_LEVEL_LABEL[level].pt : BUDGET_LEVEL_LABEL[level].en) : '';
        // Pra filmes antigos, o balão mostra o valor corrigido
        // pela inflação (é ele que decide o nível).
        const adjusted = typeof budget === 'number' && budget > 0 ? adjustedBudget(budget, movie.release_date) : 0;
        const showAdjusted = adjusted > 0 && adjusted / (budget as number) >= 1.15;
        return (
          // Sem quebra de linha: o selo fica sempre à direita (o
          // título dele quebra em duas linhas se precisar).
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="shrink-0">
              <p className="text-sm" style={{ color: MIST }}>{t('movies.budget')}</p>
              {budget === undefined ? (
                <span className="mt-1 block h-6 w-32 rounded-md animate-pulse" style={{ background: VELVET }} aria-hidden />
              ) : (
                <p className="mt-0.5 text-base sm:text-lg font-semibold whitespace-nowrap" style={{ color: budget > 0 ? PAPER : MIST }}>
                  {budget > 0 ? formatBudget(budget) : t('movies.budgetUnknown')}
                </p>
              )}
            </div>

            {level && saying && oracle && (
              <div className="relative min-w-0">
                <button
                  type="button"
                  onClick={() => setBudgetBubbleOpen((v) => !v)}
                  aria-expanded={budgetBubbleOpen}
                  aria-label={t('movies.budgetSealAria', { name: oracle.name, level: levelLabel, title: isPtLang ? saying.title.pt : saying.title.en })}
                  className={`flex items-center justify-start gap-2.5 pl-1.5 pr-3.5 py-1.5 rounded-full text-left transition hover:brightness-110 ${FOCUS_RING}`}
                  style={{
                    background: withAlpha(oracle.color, 0.12),
                    boxShadow: `inset 0 0 0 1px ${withAlpha(oracle.color, 0.45)}`,
                  }}
                >
                  <img
                    src={oracle.avatar}
                    alt=""
                    width={32}
                    height={32}
                    className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-full object-cover"
                    style={{ boxShadow: `0 0 0 2px ${oracle.color}` }}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs leading-tight" style={{ color: MIST }}>
                      <span aria-hidden>{BUDGET_LEVEL_EMOJI[level]}</span> {levelLabel}
                    </span>
                    <span className="block text-[13px] sm:text-sm font-semibold leading-tight break-words" style={{ color: PAPER }}>
                      {isPtLang ? saying.title.pt : saying.title.en}
                    </span>
                  </span>
                </button>
                <AnimatePresence>
                  {budgetBubbleOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.2 }}
                      className="absolute bottom-full right-0 mb-2 w-64 max-w-[calc(100vw-3rem)] z-30 cursor-pointer"
                      onClick={() => setBudgetBubbleOpen(false)}
                    >
                      <div
                        className="relative rounded-xl px-3 py-2.5 shadow-2xl"
                        style={{ background: PAPER, color: INK, borderLeft: `4px solid ${oracle.color}` }}
                      >
                        <p style={PIXEL} className="text-[13px] leading-none mb-1.5">{oracle.name}</p>
                        <p className="text-sm font-semibold leading-snug">
                          <span aria-hidden>{BUDGET_LEVEL_EMOJI[level]}</span> {isPtLang ? saying.title.pt : saying.title.en}
                        </p>
                        <p className="mt-1 text-xs italic leading-snug">“{isPtLang ? saying.text.pt : saying.text.en}”</p>
                        {showAdjusted && (
                          <p className="mt-1.5 text-[11px] leading-snug opacity-75">
                            {t('movies.budgetAdjusted', { value: formatBudget(adjusted) })}
                          </p>
                        )}
                        <span
                          aria-hidden
                          className="absolute top-full right-6 w-0 h-0 border-x-[6px] border-x-transparent border-t-[7px]"
                          style={{ borderTopColor: PAPER }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        );
      })()}

    </section>
  );
};

export default React.memo(TitleCredits);
