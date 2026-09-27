import React, { useState, useEffect, useId } from 'react';
import { Download, Loader2, Check, RotateCcw, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { getMovieDetails } from '../lib/tmdb';
import OracleSheet from './OracleSheet';
import ConfirmationModal from './ConfirmationModal';
import { RATING_LABELS } from './RatingSliderSheet';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING, ratingTone } from '../lib/oracleTheme';

// Ajustes da Biblioteca: como os avaliados aparecem, nomes das
// prateleiras, ordem das séries, Chroma Box, exportar e zerar a coleção.

type TvOrder = 'auto' | 'first' | 'last';

interface LibraryEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReset: () => void;
  // Prateleira que já vem selecionada no campo de renomear (null = Watchlist).
  rating: number | null;
  alternateNames: Record<string, string>;
  onAlternateNameChange: (rating: number | null, name: string) => void;
  ratedLayout: 'notes' | 'onegrid';
  onRatedLayoutChange: (layout: 'notes' | 'onegrid') => void;
  // Opcionais: quando passados, a Biblioteca aplica a mudança na hora; sem
  // eles, a página recarrega pra aplicar (comportamento antigo).
  onTvOrderChange?: (order: TvOrder) => void;
  onChromaBoxChange?: (enabled: boolean) => void;
}

const RENAME_TARGETS: (number | 'unrated')[] = ['unrated', 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

const LibraryEditModal: React.FC<LibraryEditModalProps> = ({
  isOpen,
  onClose,
  onReset,
  rating,
  alternateNames,
  onAlternateNameChange,
  ratedLayout,
  onRatedLayoutChange,
  onTvOrderChange,
  onChromaBoxChange,
}) => {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const renameSelectId = useId();
  const renameInputId = useId();
  const chromaLabelId = useId();

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [renameTarget, setRenameTarget] = useState<number | 'unrated'>(rating === null ? 'unrated' : rating);
  const [alternateName, setAlternateName] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [tvOrder, setTvOrder] = useState<TvOrder>('auto');
  const [chromaBoxEnabled, setChromaBoxEnabled] = useState(false);
  const [savingPref, setSavingPref] = useState<'tv' | 'chroma' | null>(null);

  useEffect(() => {
    setAlternateName(alternateNames[String(renameTarget)] || '');
  }, [alternateNames, renameTarget]);

  useEffect(() => {
    const loadPreferences = async () => {
      if (!session?.user?.id) return;

      const { data } = await supabase
        .from('profiles')
        .select('tv_order, chroma_box_enabled')
        .eq('id', session.user.id)
        .single();

      if (data) {
        setTvOrder(data.tv_order || 'auto');
        // Mesmo padrão da Biblioteca: sem valor salvo, a Chroma Box vem ligada.
        setChromaBoxEnabled(data.chroma_box_enabled ?? true);
      }
    };

    if (isOpen) {
      loadPreferences();
    }
  }, [isOpen, session?.user?.id]);

  const targetLabel = (target: number | 'unrated') => {
    if (target === 'unrated') return t('library.watchList');
    const label = RATING_LABELS[target] ? (isPt ? RATING_LABELS[target].pt : RATING_LABELS[target].en) : '';
    return `${t('library.rating', { value: target })}${label ? ` — ${label}` : ''}`;
  };

  const handleResetLibrary = async () => {
    if (!session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('user_movies')
        .delete()
        .eq('user_id', session.user.id);

      if (error) throw error;

      onReset();
      onClose();
      toast.success(t('library.resetSuccess'));
    } catch (error) {
      console.error('Error resetting library:', error);
      toast.error(t('common.error'));
    }
  };

  const handleAlternateNameSave = () => {
    onAlternateNameChange(renameTarget === 'unrated' ? null : renameTarget, alternateName);
    toast.success(t('common.success'));
  };

  const handleAlternateNameReset = () => {
    setAlternateName('');
    onAlternateNameChange(renameTarget === 'unrated' ? null : renameTarget, '');
  };

  const handleTvOrderChange = async (newOrder: TvOrder) => {
    if (!session?.user?.id || newOrder === tvOrder || savingPref) return;

    try {
      setSavingPref('tv');
      const { error } = await supabase
        .from('profiles')
        .update({ tv_order: newOrder })
        .eq('id', session.user.id);

      if (error) throw error;

      setTvOrder(newOrder);
      if (onTvOrderChange) {
        onTvOrderChange(newOrder);
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error updating tv_order:', error);
      toast.error(t('common.error'));
    } finally {
      setSavingPref(null);
    }
  };

  const handleChromaBoxToggle = async () => {
    if (!session?.user?.id || savingPref) return;

    try {
      setSavingPref('chroma');
      const newValue = !chromaBoxEnabled;
      const { error } = await supabase
        .from('profiles')
        .update({ chroma_box_enabled: newValue })
        .eq('id', session.user.id);

      if (error) throw error;

      setChromaBoxEnabled(newValue);
      if (onChromaBoxChange) {
        onChromaBoxChange(newValue);
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error updating chroma_box_enabled:', error);
      toast.error(t('common.error'));
    } finally {
      setSavingPref(null);
    }
  };

  const handleDownloadLibrary = async () => {
    if (!session?.user?.id) return;

    try {
      setIsDownloading(true);

      // Fetch ALL movies (rated and watchlist)
      const { data: userMoviesData, error } = await supabase
        .from('user_movies')
        .select('movie_id, rating, created_at')
        .eq('user_id', session.user.id);

      if (error) throw error;

      if (!userMoviesData || userMoviesData.length === 0) {
        toast.error(t('library.noMovies'));
        return;
      }

      // Fetch movie details and determine media_type
      const moviesWithDetails = await Promise.all(
        userMoviesData.map(async (movie) => {
          try {
            // First check database for media_type
            const { data: dbMovie } = await supabase
              .from('movies')
              .select('media_type')
              .eq('id', movie.movie_id)
              .maybeSingle();

            const mediaType = dbMovie?.media_type || 'movie';
            const details = await getMovieDetails(movie.movie_id, mediaType);

            return {
              id: movie.movie_id,
              title: details.title,
              rating: movie.rating,
              mediaType: mediaType,
              created_at: movie.created_at
            };
          } catch {
            console.warn(`Failed to fetch details for movie ${movie.movie_id}`);
            return {
              id: movie.movie_id,
              title: 'Título não disponível',
              rating: movie.rating,
              mediaType: 'movie',
              created_at: movie.created_at
            };
          }
        })
      );

      // Sort: rated movies first (by rating desc), then watchlist (by date added)
      const ratedMovies = moviesWithDetails
        .filter((m) => m.rating !== null)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0));

      const watchlistMovies = moviesWithDetails
        .filter((m) => m.rating === null)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      const sortedMovies = [...ratedMovies, ...watchlistMovies];

      // Create CSV data
      const csvData = sortedMovies.map((movie, index) => ({
        '#': index + 1,
        'Título': movie.title,
        'Tipo': movie.mediaType === 'tv' ? 'Série' : 'Filme',
        'Nota': movie.rating !== null && movie.rating !== undefined ? movie.rating : '',
        'ID': movie.id
      }));

      // Convert to CSV format
      const worksheet = XLSX.utils.json_to_sheet(csvData);
      const csv = XLSX.utils.sheet_to_csv(worksheet);

      // Create blob and download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'cineoracle_biblioteca.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(t('library.downloadSuccess'));
    } catch (error) {
      console.error('Error downloading library:', error);
      toast.error(t('common.error'));
    } finally {
      setIsDownloading(false);
    }
  };

  const sectionTitle = (text: string, hint?: string) => (
    <div className="mb-3">
      <h3 style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">{text}</h3>
      {hint && <p className="mt-1.5 text-sm" style={{ color: MIST }}>{hint}</p>}
    </div>
  );

  const optionCard = (active: boolean) =>
    `w-full rounded-xl p-3.5 text-left ring-1 transition ${FOCUS_RING} ${
      active ? 'ring-2 ring-violet-400/70 bg-violet-500/15' : 'ring-white/10 hover:ring-white/25'
    }`;

  const tvOptions: { value: TvOrder; title: string; desc: string }[] = [
    { value: 'auto', title: t('library.orderAutomatic'), desc: t('library.orderAutomaticDesc') },
    { value: 'first', title: t('library.orderSeriesFirst'), desc: t('library.orderSeriesFirstDesc') },
    { value: 'last', title: t('library.orderSeriesLast'), desc: t('library.orderSeriesLastDesc') },
  ];

  const previewTone = renameTarget === 'unrated' ? null : ratingTone(renameTarget);

  return (
    <>
      <OracleSheet
        open={isOpen}
        onClose={onClose}
        title={t('library.settingsTitle')}
        subtitle={t('library.settingsSubtitle')}
        size="lg"
        escapeEnabled={!showResetConfirm}
        bodyClassName="px-5 sm:px-7 py-6 space-y-8"
      >
        {/* Organização dos avaliados */}
        <section>
          {sectionTitle(t('library.ratedLayoutTitle'), t('library.ratedLayoutDesc'))}
          <div className="grid grid-cols-2 gap-2.5">
            {([
              { value: 'notes', label: t('library.ratedLayoutNotes') },
              { value: 'onegrid', label: t('library.ratedLayoutOneGrid') },
            ] as const).map((opt) => {
              const active = ratedLayout === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onRatedLayoutChange(opt.value)}
                  aria-pressed={active}
                  className={`${optionCard(active)} flex-col items-stretch justify-start gap-3`}
                  style={{ background: active ? undefined : VELVET }}
                >
                  {/* Miniatura do layout */}
                  <span className="flex flex-col gap-1.5 w-full" aria-hidden>
                    {opt.value === 'notes' ? (
                      [10, 8, 6].map((r, i) => (
                        <span key={r} className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: ratingTone(r).color }} />
                          <span className="h-2 rounded-full bg-white/20" style={{ width: `${85 - i * 20}%` }} />
                        </span>
                      ))
                    ) : (
                      <span className="grid grid-cols-5 gap-1">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <span key={i} className="aspect-[2/3] rounded-[3px] bg-white/20" />
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold" style={{ color: PAPER }}>
                    {opt.label}
                    {active && <Check className="w-4 h-4 text-violet-300" aria-hidden />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Nomes das prateleiras */}
        <section className="pt-7 border-t border-white/[0.07]">
          {sectionTitle(t('library.renameTitle'), t('library.renameDesc'))}
          <div className="space-y-2.5">
            <label htmlFor={renameSelectId} className="sr-only">{t('library.renameWhich')}</label>
            <div className="relative">
              <select
                id={renameSelectId}
                value={String(renameTarget)}
                onChange={(e) => setRenameTarget(e.target.value === 'unrated' ? 'unrated' : Number(e.target.value))}
                className="w-full h-12 pl-11 pr-4 rounded-xl ring-1 ring-white/10 focus:ring-2 focus:ring-fuchsia-300/70 outline-none text-[15px] appearance-none"
                style={{ background: VELVET, color: PAPER }}
              >
                {RENAME_TARGETS.map((target) => (
                  <option key={String(target)} value={String(target)}>
                    {targetLabel(target)}
                    {alternateNames[String(target)] ? ` · “${alternateNames[String(target)]}”` : ''}
                  </option>
                ))}
              </select>
              <span
                aria-hidden
                className="absolute left-3 top-1/2 -translate-y-1/2 grid place-items-center w-6 h-6 rounded-md text-sm leading-none"
                style={{ ...PIXEL, background: 'rgba(18,13,34,0.7)', color: previewTone ? previewTone.color : '#7DD3FC' }}
              >
                {renameTarget === 'unrated' ? 'W' : renameTarget}
              </span>
            </div>
            <div className="flex gap-2">
              <label htmlFor={renameInputId} className="sr-only">{t('library.renameNewName')}</label>
              <input
                type="text"
                id={renameInputId}
                value={alternateName}
                onChange={(e) => setAlternateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAlternateNameSave(); }}
                maxLength={30}
                placeholder={t('library.renamePlaceholder')}
                className="flex-1 min-w-0 h-12 px-4 rounded-xl ring-1 ring-white/10 focus:ring-2 focus:ring-fuchsia-300/70 outline-none text-[15px] placeholder:text-[#BDB4D6]/70"
                style={{ background: VELVET, color: PAPER }}
              />
              <button
                onClick={handleAlternateNameSave}
                className={`shrink-0 h-12 px-5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold transition ${FOCUS_RING}`}
              >
                {t('common.save')}
              </button>
            </div>
            {alternateNames[String(renameTarget)] && (
              <button
                onClick={handleAlternateNameReset}
                className={`-ml-2 inline-flex justify-start items-center gap-1.5 px-2 rounded-lg text-sm hover:bg-white/5 transition ${FOCUS_RING}`}
                style={{ color: MIST }}
              >
                <RotateCcw className="w-4 h-4" aria-hidden />
                {t('library.renameRestore')}
              </button>
            )}
          </div>
        </section>

        {/* Ordem das séries — só no layout por notas */}
        {ratedLayout === 'notes' && (
          <section className="pt-7 border-t border-white/[0.07]">
            {sectionTitle(t('library.tvSeriesOrder'), t('library.tvSeriesOrderDesc'))}
            <div className="grid gap-2" role="radiogroup" aria-label={t('library.tvSeriesOrder')}>
              {tvOptions.map((opt) => {
                const active = tvOrder === opt.value;
                return (
                  <button
                    key={opt.value}
                    role="radio"
                    aria-checked={active}
                    onClick={() => handleTvOrderChange(opt.value)}
                    disabled={savingPref !== null}
                    className={`${optionCard(active)} justify-between gap-3 disabled:opacity-70`}
                    style={{ background: active ? undefined : VELVET }}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold" style={{ color: PAPER }}>{opt.title}</span>
                      <span className="block mt-0.5 text-xs" style={{ color: MIST }}>{opt.desc}</span>
                    </span>
                    <span
                      aria-hidden
                      className={`shrink-0 grid place-items-center w-5 h-5 rounded-full ring-2 ${active ? 'ring-violet-400' : 'ring-white/25'}`}
                    >
                      {savingPref === 'tv' && active ? null : active && <span className="w-2.5 h-2.5 rounded-full bg-violet-400" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Chroma Box */}
        <section className="pt-7 border-t border-white/[0.07]">
          {sectionTitle(t('library.chromaBox'), t('library.chromaBoxDesc'))}
          <div className="flex items-center justify-between gap-4 rounded-xl p-3.5 ring-1 ring-white/10" style={{ background: VELVET }}>
            <span className="min-w-0">
              <span id={chromaLabelId} className="block text-sm font-semibold" style={{ color: PAPER }}>{t('library.enableChromaBox')}</span>
              <span className="mt-2 flex items-center gap-1" aria-hidden>
                {[10, 8, 5, 2, 0].map((r) => (
                  <span key={r} className="w-5 h-2 rounded-full" style={{ background: ratingTone(r).color, opacity: chromaBoxEnabled ? 1 : 0.3 }} />
                ))}
              </span>
            </span>
            <button
              role="switch"
              aria-checked={chromaBoxEnabled}
              aria-labelledby={chromaLabelId}
              onClick={handleChromaBoxToggle}
              disabled={savingPref !== null}
              className={`shrink-0 relative ${FOCUS_RING} rounded-full`}
            >
              <span
                aria-hidden
                className={`relative block w-12 h-7 rounded-full transition-colors ${chromaBoxEnabled ? 'bg-violet-500' : 'bg-white/15'}`}
              >
                <span
                  className={`absolute top-1 left-1 grid place-items-center w-5 h-5 rounded-full bg-white shadow transition-transform ${chromaBoxEnabled ? 'translate-x-5' : ''}`}
                >
                  {savingPref === 'chroma' && <Loader2 className="w-3 h-3 animate-spin text-violet-600" />}
                </span>
              </span>
            </button>
          </div>
        </section>

        {/* Exportar */}
        <section className="pt-7 border-t border-white/[0.07]">
          {sectionTitle(t('common.export'), t('library.exportDesc'))}
          <button
            onClick={handleDownloadLibrary}
            disabled={isDownloading}
            className={`w-full gap-2 h-12 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 font-medium transition disabled:opacity-60 disabled:cursor-wait ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            {isDownloading ? <Loader2 className="w-5 h-5 animate-spin text-violet-300" aria-hidden /> : <Download className="w-5 h-5 text-violet-300" aria-hidden />}
            {isDownloading ? t('library.downloading') : t('library.exportLibrary')}
          </button>
        </section>

        {/* Zona de perigo */}
        <section className="pt-7 border-t border-white/[0.07]">
          {sectionTitle(t('library.dangerZone'))}
          <div className="rounded-xl p-4 ring-1 ring-red-400/25 bg-red-500/[0.07]">
            <p className="flex items-start gap-2.5 text-sm text-red-100/85">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-300" aria-hidden />
              {t('library.resetDesc')}
            </p>
            <button
              onClick={() => setShowResetConfirm(true)}
              className={`mt-3 w-full h-11 rounded-xl border border-red-400/40 text-red-200 hover:bg-red-500/15 text-sm font-semibold transition ${FOCUS_RING}`}
            >
              {t('library.resetLibrary')}
            </button>
          </div>
        </section>
      </OracleSheet>

      <ConfirmationModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleResetLibrary}
        title={t('library.resetConfirmTitle')}
        message={t('library.resetConfirmMessage')}
        confirmLabel={t('library.resetLibrary')}
      />
    </>
  );
};

export default LibraryEditModal;
