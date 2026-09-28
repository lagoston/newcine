import React, { useState, useCallback } from 'react';
import { FileUp, AlertCircle, Loader2, ArrowLeft, Star, Film, Database, CheckCircle2, XCircle, MinusCircle, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { searchMovies, getMovieDetails, findByImdbId, ensureMovieCached } from '../lib/tmdb';
import OracleSheet from './OracleSheet';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING } from '../lib/oracleTheme';

// Importar biblioteca — do IMDb (CSV de "Your Ratings") ou de uma planilha
// exportada do próprio CineOracle (Biblioteca → Ajustes → Exportar).
// Três telas na mesma gaveta: escolher a origem → passo a passo + arquivo +
// prévia → sincronização (progresso e resultado).

interface IMDbImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ImportItem {
  title: string;
  year: number;
  rating: number;
  // "tt…" do IMDb, "search:título:tipo" quando não há id, ou o id do TMDB
  // (planilha do CineOracle).
  imdbId: string;
}

interface SyncStats {
  total: number;
  processed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  errors: Array<{ title: string; reason: string | null }>;
}

type Method = 'select' | 'imdb' | 'cineoracle';

const IMDbImportModal: React.FC<IMDbImportModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [importMethod, setImportMethod] = useState<Method>('select');
  const [file, setFile] = useState<File | null>(null);
  const [parsedMovies, setParsedMovies] = useState<ImportItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<SyncStats | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const parseIMDbCSV = async (source: File) => {
    try {
      setUploading(true);
      const text = await source.text();
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      const movies: ImportItem[] = [];

      const headerLine = lines.find((line) => line.toLowerCase().includes('title') && line.toLowerCase().includes('your rating'));
      if (!headerLine) throw new Error(t('importer.errInvalidImdb'));

      const headers = headerLine.split(',').map((h) => h.trim().replace(/^"(.*)"$/, '$1').toLowerCase());
      const titleIndex = headers.findIndex((h) => h.includes('title'));
      const ratingIndex = headers.findIndex((h) => h.includes('your rating'));
      const yearIndex = headers.findIndex((h) => h.includes('year'));
      const constIndex = headers.findIndex((h) => h === 'const');
      const titleTypeIndex = headers.findIndex((h) => h === 'title type');
      if (titleIndex === -1 || ratingIndex === -1) throw new Error(t('importer.errMissingColumns'));

      for (const line of lines.slice(lines.indexOf(headerLine) + 1)) {
        if (!line.trim()) continue;
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((v) => v.trim().replace(/^"(.*)"$/, '$1'));
        const title = values[titleIndex];
        const rating = parseInt(values[ratingIndex]);
        if (!title || isNaN(rating) || rating < 1 || rating > 10) continue;

        const rawConst = constIndex !== -1 ? values[constIndex] : '';
        const imdbId = rawConst.startsWith('tt') ? rawConst : '';
        const titleType = titleTypeIndex !== -1 ? values[titleTypeIndex]?.toLowerCase() ?? '' : '';
        const isTV = titleType.includes('tv') || titleType.includes('series') || titleType.includes('episode');

        movies.push({
          title,
          rating,
          year: yearIndex !== -1 ? parseInt(values[yearIndex]) || 0 : 0,
          imdbId: imdbId || `search:${title}:${isTV ? 'tv' : 'movie'}`,
        });
      }

      if (movies.length === 0) throw new Error(t('importer.errNoRated'));
      setParsedMovies(movies);
      setSyncStats(null);
      toast.success(t('importer.toastFound', { count: movies.length }));
    } catch (error: unknown) {
      console.error('Error parsing IMDb CSV:', error);
      toast.error((error as Error)?.message || t('importer.errParse'));
      setParsedMovies([]);
    } finally {
      setUploading(false);
    }
  };

  const parseCineOracleFile = async (source: File) => {
    try {
      setUploading(true);
      let rows: Record<string, unknown>[];

      if (source.name.toLowerCase().endsWith('.csv')) {
        const text = await source.text();
        const lines = text.split('\n').filter((line) => line.trim());
        if (lines.length < 2) throw new Error(t('importer.errEmpty'));
        const headers = lines[0].split(',').map((h) => h.trim().replace(/^"(.*)"$/, '$1'));
        rows = lines.slice(1).map((line) => {
          const values = line.split(',').map((v) => v.trim().replace(/^"(.*)"$/, '$1'));
          const row: Record<string, unknown> = {};
          headers.forEach((header, index) => { row[header] = values[index] || ''; });
          return row;
        });
      } else {
        const workbook = XLSX.read(await source.arrayBuffer(), { type: 'array' });
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      }

      const movies: ImportItem[] = [];
      for (const row of rows) {
        const id = row['ID'];
        const title = row['Título'];
        const rating = Number(row['Nota']) || 0;
        if (id && title) movies.push({ title: String(title), year: 0, rating, imdbId: String(id) });
      }

      if (movies.length === 0) throw new Error(t('importer.errNoMovies'));
      setParsedMovies(movies);
      setSyncStats(null);
      toast.success(t('importer.toastFound', { count: movies.length }));
    } catch (error: unknown) {
      console.error('Error parsing CineOracle file:', error);
      toast.error((error as Error)?.message || t('importer.errParse'));
      setParsedMovies([]);
    } finally {
      setUploading(false);
    }
  };

  const readFile = (selected: File) => {
    const name = selected.name.toLowerCase();
    if (importMethod === 'cineoracle' && (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls'))) {
      setFile(selected);
      parseCineOracleFile(selected);
    } else if (importMethod === 'imdb' && name.endsWith('.csv')) {
      setFile(selected);
      parseIMDbCSV(selected);
    } else {
      toast.error(t('importer.errWrongFormat'));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) readFile(selected);
    e.target.value = '';
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) readFile(dropped);
  };

  const resolveItem = async (movie: ImportItem): Promise<{ id: number; media_type: 'movie' | 'tv' } | null> => {
    if (importMethod === 'cineoracle') {
      const movieId = parseInt(movie.imdbId);
      if (isNaN(movieId)) return null;
      const { data: dbMovie } = await supabase.from('movies').select('media_type').eq('id', movieId).limit(1).maybeSingle();
      return { id: movieId, media_type: (dbMovie?.media_type as 'movie' | 'tv') || 'movie' };
    }

    if (movie.imdbId.startsWith('tt')) {
      const found = await findByImdbId(movie.imdbId);
      if (found) return found;
    }

    const [searchTitle, hintType] = movie.imdbId.startsWith('search:')
      ? [movie.imdbId.split(':')[1] || movie.title, movie.imdbId.split(':')[2] as 'movie' | 'tv' | undefined]
      : [movie.title, undefined];
    const results = await searchMovies(searchTitle);
    if (results.length === 0) return null;
    const lower = searchTitle.toLowerCase();
    const yearMatch = results.find((r) =>
      r.title?.toLowerCase() === lower && movie.year > 0 && Math.abs(new Date(r.release_date || '').getFullYear() - movie.year) <= 1);
    const exactMatch = results.find((r) => r.title?.toLowerCase() === lower);
    const typeMatch = hintType ? results.find((r) => r.media_type === hintType) : null;
    const best = yearMatch || exactMatch || typeMatch || results[0];
    return { id: best.id, media_type: best.media_type || 'movie' };
  };

  const handleSync = async () => {
    if (!session?.user?.id || parsedMovies.length === 0) return;
    const userId = session.user.id;

    setSyncing(true);
    const stats: SyncStats = { total: parsedMovies.length, processed: 0, succeeded: 0, skipped: 0, failed: 0, errors: [] };
    setSyncStats({ ...stats });

    const BATCH_SIZE = 5;
    for (let i = 0; i < parsedMovies.length; i += BATCH_SIZE) {
      const batch = parsedMovies.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (movie) => {
        try {
          const resolved = await resolveItem(movie);
          if (!resolved) {
            stats.failed++;
            stats.errors.push({ title: movie.title, reason: null });
            return;
          }
          const { id: tmdbId, media_type } = resolved;

          await ensureMovieCached(tmdbId, media_type);
          const details = await getMovieDetails(tmdbId, media_type);

          const { error: movieError } = await supabase.from('movies').upsert({
            id: details.id,
            title: details.title,
            release_date: details.release_date,
            genres: details.genres?.map((g) => g.name) || [],
            director: details.credits?.crew?.find((p) => p.job === 'Director')?.name || null,
            media_type,
            number_of_seasons: media_type === 'tv' ? details.number_of_seasons : null,
          }, { onConflict: 'id,media_type' });
          if (movieError) throw movieError;

          const { data: existing, error: existingError } = await supabase
            .from('user_movies')
            .select('rating')
            .eq('movie_id', tmdbId)
            .eq('media_type', media_type)
            .eq('user_id', userId)
            .maybeSingle();
          if (existingError) throw existingError;

          if (existing) {
            if (movie.rating > 0 && existing.rating !== movie.rating) {
              const { error: updateError } = await supabase
                .from('user_movies')
                .update({ rating: movie.rating })
                .eq('movie_id', tmdbId)
                .eq('media_type', media_type)
                .eq('user_id', userId);
              if (updateError) throw updateError;
              stats.succeeded++;
            } else {
              stats.skipped++;
            }
          } else {
            const { error: insertError } = await supabase.from('user_movies').insert({
              movie_id: tmdbId,
              media_type,
              user_id: userId,
              rating: movie.rating > 0 ? movie.rating : null,
            });
            if (insertError) throw insertError;
            stats.succeeded++;
          }
        } catch (error: unknown) {
          console.error(`Error processing "${movie.title}":`, error);
          stats.failed++;
          stats.errors.push({ title: movie.title, reason: (error as Error)?.message || null });
        } finally {
          stats.processed++;
          setSyncStats({ ...stats });
        }
      }));
    }

    if (stats.succeeded > 0) {
      toast.success(t('importer.toastImported', { count: stats.succeeded }));
      onSuccess?.();
    } else if (stats.failed === stats.total) {
      toast.error(t('importer.toastNone'));
    }
    setSyncing(false);
  };

  const reset = () => {
    setImportMethod('select');
    setFile(null);
    setParsedMovies([]);
    setSyncStats(null);
  };

  const handleClose = () => {
    if (syncing) return;
    reset();
    onClose();
  };

  const handleBack = () => {
    if (syncing) return;
    reset();
  };

  const syncProgress = syncStats && syncStats.total > 0 ? Math.round((syncStats.processed / syncStats.total) * 100) : 0;
  const finished = !syncing && !!syncStats && syncStats.processed === syncStats.total;

  const title = importMethod === 'imdb'
    ? t('importer.imdbHeading')
    : importMethod === 'cineoracle'
      ? t('importer.cineoracleHeading')
      : t('importer.title');
  const subtitle = importMethod === 'imdb'
    ? t('importer.imdbSubtitle')
    : importMethod === 'cineoracle'
      ? t('importer.cineoracleSubtitle')
      : t('importer.chooseMethod');

  const steps = importMethod === 'imdb'
    ? [
      [t('importer.imdbStep1Title'), t('importer.imdbStep1Desc')],
      [t('importer.imdbStep2Title'), t('importer.imdbStep2Desc')],
      [t('importer.uploadTitle'), t('importer.uploadDesc')],
      [t('importer.syncTitle'), t('importer.syncDesc')],
    ]
    : [
      [t('importer.coStep1Title'), t('importer.coStep1Desc')],
      [t('importer.uploadTitle'), t('importer.uploadDesc')],
      [t('importer.syncTitle'), t('importer.syncDesc')],
    ];

  const methodCard = (method: 'imdb' | 'cineoracle', icon: React.ReactNode, color: string, name: string, desc: string) => (
    <li>
      <button
        onClick={() => setImportMethod(method)}
        className={`group w-full h-full flex justify-start items-center gap-4 p-4 sm:p-5 rounded-2xl ring-1 ring-white/10 hover:ring-white/25 hover:bg-white/[0.03] text-left transition ${FOCUS_RING}`}
        style={{ background: VELVET }}
      >
        <span className="grid place-items-center w-12 h-12 shrink-0 rounded-xl ring-1" style={{ background: `${color}26`, color, ['--tw-ring-color' as string]: `${color}55` } as React.CSSProperties}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold" style={{ color: PAPER }}>{name}</span>
          <span className="block mt-0.5 text-sm leading-snug" style={{ color: MIST }}>{desc}</span>
        </span>
        <ChevronRight className="w-5 h-5 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: MIST }} aria-hidden />
      </button>
    </li>
  );

  const backButton = importMethod !== 'select' ? (
    <button
      onClick={handleBack}
      disabled={syncing}
      aria-label={t('common.back')}
      className={`grid place-items-center w-11 h-11 shrink-0 rounded-xl ring-1 ring-white/10 hover:bg-white/5 transition disabled:opacity-40 ${FOCUS_RING}`}
      style={{ color: PAPER }}
    >
      <ArrowLeft className="w-5 h-5" aria-hidden />
    </button>
  ) : (
    <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-amber-500/15 ring-1 ring-amber-400/30">
      <FileUp className="w-5 h-5 text-amber-300" aria-hidden />
    </span>
  );

  let footer: React.ReactNode;
  if (parsedMovies.length > 0 && !syncStats && !uploading) {
    footer = (
      <button
        onClick={handleSync}
        className={`w-full gap-2 h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`}
      >
        <Film className="w-[18px] h-[18px]" aria-hidden />
        {t('importer.sync', { count: parsedMovies.length })}
      </button>
    );
  } else if (finished) {
    footer = (
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleBack}
          className={`h-12 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-semibold transition ${FOCUS_RING}`}
          style={{ color: PAPER }}
        >
          {t('importer.another')}
        </button>
        <button
          onClick={handleClose}
          className={`h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`}
        >
          {t('importer.done')}
        </button>
      </div>
    );
  }

  return (
    <OracleSheet
      open={isOpen}
      onClose={handleClose}
      title={title}
      subtitle={subtitle}
      leading={backButton}
      size="lg"
      escapeEnabled={!syncing}
      bodyClassName="px-5 sm:px-7 py-6 space-y-5"
      footer={footer}
    >
      {importMethod === 'select' && (
        <ul className="grid gap-3">
          {methodCard('imdb', <Star className="w-6 h-6 fill-current" aria-hidden />, '#FCD34D', 'IMDb', t('importer.imdbDesc'))}
          {methodCard('cineoracle', <Database className="w-6 h-6" aria-hidden />, '#7DD3FC', 'CineOracle', t('importer.cineoracleDesc'))}
        </ul>
      )}

      {importMethod !== 'select' && (
        <>
          {!syncStats && (
            <ol className="space-y-3">
              {steps.map(([stepTitle, stepDesc], i) => (
                <li key={stepTitle} className="flex items-start gap-3">
                  <span style={{ ...PIXEL, color: '#C4B5FD' }} className="grid place-items-center w-7 h-7 shrink-0 rounded-lg bg-violet-500/15 ring-1 ring-violet-400/30 text-base leading-none">
                    {i + 1}
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className="block text-sm font-semibold" style={{ color: PAPER }}>{stepTitle}</span>
                    <span className="block mt-0.5 text-sm leading-relaxed" style={{ color: MIST }}>{stepDesc}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {!syncing && !syncStats && (
            <label
              className={`relative flex flex-col items-center justify-center gap-3 px-6 py-8 rounded-2xl border-2 border-dashed cursor-pointer text-center transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-fuchsia-300 ${
                dragActive
                  ? 'border-fuchsia-300/70 bg-fuchsia-500/10'
                  : file
                    ? 'border-emerald-400/50 bg-emerald-500/[0.06]'
                    : 'border-white/15 hover:border-white/35 hover:bg-white/[0.03]'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept={importMethod === 'imdb' ? '.csv' : '.csv,.xlsx,.xls'}
                className="sr-only"
                onChange={handleFileChange}
              />
              <span className={`grid place-items-center w-12 h-12 rounded-xl ring-1 ${file ? 'bg-emerald-500/15 ring-emerald-400/30 text-emerald-300' : 'bg-white/5 ring-white/10 text-violet-300'}`}>
                {uploading ? <Loader2 className="w-6 h-6 animate-spin" aria-hidden /> : <FileUp className="w-6 h-6" aria-hidden />}
              </span>
              {uploading ? (
                <span className="text-sm" style={{ color: MIST }}>{t('importer.processing')}</span>
              ) : file ? (
                <span className="text-sm font-semibold break-all text-emerald-200">{file.name}</span>
              ) : (
                <span className="text-sm" style={{ color: MIST }}>
                  <span className="font-semibold text-violet-200 underline underline-offset-4">{t('importer.dropChoose')}</span>{' '}
                  {t('importer.dropOr')}
                </span>
              )}
              <span className="text-xs" style={{ color: MIST }}>
                {importMethod === 'imdb' ? t('importer.formatsImdb') : t('importer.formatsCineoracle')}
              </span>
            </label>
          )}

          {parsedMovies.length > 0 && !syncStats && !uploading && (
            <section>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold" style={{ color: PAPER }}>{t('importer.preview')}</h3>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-500/15 ring-1 ring-violet-400/30 text-violet-200">
                  {t('importer.found', { count: parsedMovies.length })}
                </span>
              </div>
              <div className="mt-3 rounded-xl ring-1 ring-white/10 overflow-hidden" style={{ background: VELVET }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider" style={{ color: MIST }}>
                      <th scope="col" className="px-4 py-2.5 font-semibold">{t('importer.colTitle')}</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold w-16">{t('importer.colYear')}</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold w-16">{t('importer.colRating')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {parsedMovies.slice(0, 8).map((movie, index) => (
                      <tr key={index}>
                        <td className="px-4 py-2.5 font-medium max-w-0 w-full truncate" style={{ color: PAPER }}>{movie.title}</td>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: MIST }}>{movie.year || '—'}</td>
                        <td className="px-4 py-2.5">
                          {movie.rating > 0 ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-200">
                              <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" aria-hidden />
                              {movie.rating}
                            </span>
                          ) : (
                            <span style={{ color: MIST }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedMovies.length > 8 && (
                  <p className="px-4 py-2.5 text-xs text-center border-t border-white/[0.06]" style={{ color: MIST }}>
                    {t('importer.more', { count: parsedMovies.length - 8 })}
                  </p>
                )}
              </div>
            </section>
          )}

          {syncStats && (
            <section className="rounded-2xl ring-1 ring-white/10 p-4 sm:p-5" style={{ background: VELVET }} aria-live="polite">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-semibold" style={{ color: PAPER }}>
                  {syncing && <Loader2 className="w-4 h-4 animate-spin text-violet-300" aria-hidden />}
                  {syncing ? t('importer.syncing') : t('importer.resultTitle')}
                </h3>
                <span style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none tabular-nums">
                  {syncStats.processed}/{syncStats.total}
                </span>
              </div>
              <div
                className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={syncProgress}
                aria-label={t('importer.syncing')}
              >
                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-[width] duration-300" style={{ width: `${syncProgress}%` }} />
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex items-center gap-2 text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-300" aria-hidden />
                  {t('importer.imported', { count: syncStats.succeeded })}
                </li>
                {syncStats.skipped > 0 && (
                  <li className="flex items-center gap-2" style={{ color: MIST }}>
                    <MinusCircle className="w-4 h-4 shrink-0" aria-hidden />
                    {t('importer.skipped', { count: syncStats.skipped })}
                  </li>
                )}
                {syncStats.failed > 0 && (
                  <li className="text-red-200">
                    <span className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 shrink-0 text-red-300" aria-hidden />
                      {t('importer.failed', { count: syncStats.failed })}
                    </span>
                    {finished && (
                      <ul className="mt-2 ml-6 max-h-40 overflow-y-auto space-y-1 text-xs" style={{ color: MIST }}>
                        {syncStats.errors.map((err, i) => (
                          <li key={i}>
                            <span className="font-medium" style={{ color: PAPER }}>{err.title}</span>
                            {' — '}
                            {err.reason ?? t('importer.notFoundReason')}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )}
              </ul>
            </section>
          )}

          {importMethod === 'imdb' && !syncing && !syncStats && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/[0.08] ring-1 ring-amber-400/25">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-300" aria-hidden />
              <p className="text-sm leading-relaxed" style={{ color: MIST }}>
                <span className="font-semibold text-amber-200">{t('importer.seriesNoteTitle')}.</span>{' '}
                {t('importer.seriesNoteText')}
              </p>
            </div>
          )}
        </>
      )}
    </OracleSheet>
  );
};

export default IMDbImportModal;
