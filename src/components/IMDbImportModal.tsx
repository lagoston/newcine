import React, { useState, useCallback } from 'react';
import { X, FileUp, AlertCircle, Loader2, ArrowLeft, Star, Film, Database, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { searchMovies, getMovieDetails, findByImdbId, ensureMovieCached } from '../lib/tmdb';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';

interface IMDbImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface IMDbMovie {
  title: string;
  year: number;
  rating: number;
  imdbId: string;
}

interface SyncStats {
  total: number;
  processed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  errors: Array<{ title: string; reason: string }>;
}

const IMDbImportModal: React.FC<IMDbImportModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [importMethod, setImportMethod] = useState<'select' | 'imdb' | 'cineoracle'>('select');
  const [file, setFile] = useState<File | null>(null);
  const [parsedMovies, setParsedMovies] = useState<IMDbMovie[]>([]);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<SyncStats | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const { session } = useAuth();

  const parseIMDbCSV = async (file: File) => {
    try {
      setUploading(true);
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const movies: IMDbMovie[] = [];

      const headerLine = lines.find(line =>
        line.toLowerCase().includes('title') &&
        line.toLowerCase().includes('your rating')
      );

      if (!headerLine) throw new Error('Formato de arquivo IMDb inválido. Certifique-se de exportar via "Your Ratings".');

      const headers = headerLine
        .split(',')
        .map(h => h.trim().replace(/^"(.*)"$/, '$1').toLowerCase());

      const titleIndex = headers.findIndex(h => h.includes('title'));
      const ratingIndex = headers.findIndex(h => h.includes('your rating'));
      const yearIndex = headers.findIndex(h => h.includes('year'));
      const constIndex = headers.findIndex(h => h === 'const');
      const titleTypeIndex = headers.findIndex(h => h === 'title type');

      if (titleIndex === -1 || ratingIndex === -1) {
        throw new Error('Colunas obrigatórias não encontradas no arquivo CSV do IMDb.');
      }

      const dataLines = lines.slice(lines.indexOf(headerLine) + 1);

      for (const line of dataLines) {
        if (!line.trim()) continue;

        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
          .map(v => v.trim().replace(/^"(.*)"$/, '$1'));

        const title = values[titleIndex];
        const ratingStr = values[ratingIndex];
        const rating = parseInt(ratingStr);

        if (!title || isNaN(rating) || rating < 1 || rating > 10) continue;

        const rawConst = constIndex !== -1 ? values[constIndex] : '';
        const imdbId = rawConst.startsWith('tt') ? rawConst : '';

        const titleType = titleTypeIndex !== -1 ? values[titleTypeIndex]?.toLowerCase() : '';
        const isTV = titleType.includes('tv') || titleType.includes('series') || titleType.includes('episode');

        movies.push({
          title,
          rating,
          year: yearIndex !== -1 ? parseInt(values[yearIndex]) || 0 : 0,
          imdbId: imdbId || `search:${title}:${isTV ? 'tv' : 'movie'}`
        });
      }

      if (movies.length === 0) throw new Error('Nenhum título com avaliação encontrado no arquivo.');

      setParsedMovies(movies);
      setSyncStats(null);
      toast.success(`${movies.length} títulos encontrados no arquivo`);
    } catch (error: any) {
      console.error('Error parsing IMDb CSV:', error);
      toast.error(error.message || 'Erro ao processar arquivo CSV');
      setParsedMovies([]);
    } finally {
      setUploading(false);
    }
  };

  const parseCineOracleFile = async (file: File) => {
    try {
      setUploading(true);
      let jsonData: any[];

      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) throw new Error('Arquivo CSV vazio ou inválido');

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1'));
        jsonData = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/^"(.*)"$/, '$1'));
          const row: any = {};
          headers.forEach((header, index) => { row[header] = values[index] || ''; });
          jsonData.push(row);
        }
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        jsonData = XLSX.utils.sheet_to_json(worksheet);
      }

      const movies: IMDbMovie[] = [];
      for (const row of jsonData) {
        const id = row['ID'];
        const title = row['Título'];
        const rating = row['Nota'];
        if (id && title) {
          movies.push({ title, year: 0, rating: rating || 0, imdbId: String(id) });
        }
      }

      if (movies.length === 0) throw new Error('Nenhum filme encontrado no arquivo');

      setParsedMovies(movies);
      setSyncStats(null);
      toast.success(`${movies.length} títulos encontrados`);
    } catch (error: any) {
      console.error('Error parsing CineOracle file:', error);
      toast.error(error.message || 'Erro ao processar arquivo CineOracle');
      setParsedMovies([]);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    const name = selectedFile.name.toLowerCase();
    if (importMethod === 'cineoracle' && (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls'))) {
      parseCineOracleFile(selectedFile);
    } else if (importMethod === 'imdb' && name.endsWith('.csv')) {
      parseIMDbCSV(selectedFile);
    } else {
      toast.error('Formato de arquivo inválido para este método de importação');
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files[0];
    if (!droppedFile) return;
    const name = droppedFile.name.toLowerCase();
    setFile(droppedFile);
    if (importMethod === 'cineoracle' && (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls'))) {
      parseCineOracleFile(droppedFile);
    } else if (importMethod === 'imdb' && name.endsWith('.csv')) {
      parseIMDbCSV(droppedFile);
    } else {
      toast.error('Formato de arquivo inválido');
    }
  }, [importMethod]);

  const resolveImdbItem = async (movie: IMDbMovie): Promise<{ id: number; media_type: 'movie' | 'tv' } | null> => {
    if (importMethod === 'cineoracle') {
      const movieId = parseInt(movie.imdbId);
      if (isNaN(movieId)) return null;
      const { data: dbMovie } = await supabase
        .from('movies')
        .select('media_type')
        .eq('id', movieId)
        .maybeSingle();
      return { id: movieId, media_type: (dbMovie?.media_type as 'movie' | 'tv') || 'movie' };
    }

    if (movie.imdbId.startsWith('tt')) {
      const found = await findByImdbId(movie.imdbId);
      if (found) return found;
    }

    if (movie.imdbId.startsWith('search:')) {
      const parts = movie.imdbId.split(':');
      const searchTitle = parts[1] || movie.title;
      const hintType = parts[2] as 'movie' | 'tv' | undefined;
      const results = await searchMovies(searchTitle);
      if (results.length === 0) return null;

      const yearMatch = results.find(r =>
        r.title?.toLowerCase() === searchTitle.toLowerCase() &&
        movie.year > 0 &&
        Math.abs(new Date(r.release_date || '').getFullYear() - movie.year) <= 1
      );
      const exactMatch = results.find(r => r.title?.toLowerCase() === searchTitle.toLowerCase());
      const typeMatch = hintType ? results.find(r => r.media_type === hintType) : null;
      const best = yearMatch || exactMatch || typeMatch || results[0];
      return { id: best.id, media_type: best.media_type || 'movie' };
    }

    const results = await searchMovies(movie.title);
    if (results.length === 0) return null;
    const best = results.find(r => r.title?.toLowerCase() === movie.title.toLowerCase()) || results[0];
    return { id: best.id, media_type: best.media_type || 'movie' };
  };

  const handleSync = async () => {
    if (!session?.user?.id || parsedMovies.length === 0) return;

    setSyncing(true);
    const stats: SyncStats = {
      total: parsedMovies.length,
      processed: 0,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };
    setSyncStats({ ...stats });

    const BATCH_SIZE = 5;

    for (let i = 0; i < parsedMovies.length; i += BATCH_SIZE) {
      const batch = parsedMovies.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (movie) => {
        try {
          const resolved = await resolveImdbItem(movie);
          if (!resolved) {
            stats.failed++;
            stats.errors.push({ title: movie.title, reason: 'Título não encontrado no TMDB' });
            return;
          }

          const { id: tmdbId, media_type } = resolved;

          await ensureMovieCached(tmdbId, media_type);

          const movieDetails = await getMovieDetails(tmdbId, media_type);

          const { error: movieError } = await supabase
            .from('movies')
            .upsert({
              id: movieDetails.id,
              title: movieDetails.title,
              release_date: movieDetails.release_date,
              genres: movieDetails.genres?.map((g: any) => g.name) || [],
              director: movieDetails.credits?.crew?.find((p: any) => p.job === 'Director')?.name || null,
              media_type,
              number_of_seasons: media_type === 'tv' ? movieDetails.number_of_seasons : null
            });

          if (movieError) throw movieError;

          const { data: existing, error: existingError } = await supabase
            .from('user_movies')
            .select('rating')
            .eq('movie_id', tmdbId)
            .eq('user_id', session.user.id)
            .maybeSingle();

          if (existingError) throw existingError;

          if (existing) {
            if (movie.rating > 0 && existing.rating !== movie.rating) {
              const { error: updateError } = await supabase
                .from('user_movies')
                .update({ rating: movie.rating })
                .eq('movie_id', tmdbId)
                .eq('user_id', session.user.id);
              if (updateError) throw updateError;
              stats.succeeded++;
            } else {
              stats.skipped++;
            }
          } else {
            const { error: insertError } = await supabase
              .from('user_movies')
              .insert({
                movie_id: tmdbId,
                user_id: session.user.id,
                rating: movie.rating > 0 ? movie.rating : null
              });
            if (insertError) throw insertError;
            stats.succeeded++;
          }
        } catch (error: any) {
          console.error(`Error processing "${movie.title}":`, error);
          stats.failed++;
          stats.errors.push({ title: movie.title, reason: error.message || 'Erro desconhecido' });
        } finally {
          stats.processed++;
          setSyncStats({ ...stats });
        }
      }));
    }

    if (stats.succeeded > 0) {
      toast.success(`${stats.succeeded} ${stats.succeeded === 1 ? 'título importado' : 'títulos importados'} com sucesso!`);
      if (onSuccess) onSuccess();
    } else if (stats.failed === stats.total) {
      toast.error('Nenhum título pôde ser importado. Verifique os erros abaixo.');
    }

    setSyncing(false);
  };

  if (!isOpen) return null;

  const syncProgress = syncStats && syncStats.total > 0
    ? Math.round((syncStats.processed / syncStats.total) * 100)
    : 0;

  const handleClose = () => {
    if (syncing) return;
    setImportMethod('select');
    setFile(null);
    setParsedMovies([]);
    setSyncStats(null);
    onClose();
  };

  const handleBack = () => {
    if (syncing) return;
    setImportMethod('select');
    setFile(null);
    setParsedMovies([]);
    setSyncStats(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={handleClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-3xl bg-white/90 dark:bg-gray-800/90 rounded-2xl shadow-2xl backdrop-blur-xl border border-white/20 dark:border-gray-700/50 transform transition-all">

          <div className="flex items-center justify-between p-6 border-b border-gray-200/50 dark:border-gray-700/50">
            <div className="flex items-center gap-3">
              {importMethod !== 'select' && (
                <button
                  onClick={handleBack}
                  disabled={syncing}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {importMethod === 'select' ? 'Importar Biblioteca' : importMethod === 'imdb' ? 'Importar do IMDb' : 'Importar do CineOracle'}
                </h2>
                {importMethod !== 'select' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {importMethod === 'imdb' ? 'Sincronize suas avaliações do IMDb' : 'Restaure sua biblioteca do CineOracle'}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={syncing}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {importMethod === 'select' && (
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Escolha o método de importação:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setImportMethod('imdb')}
                  className="group flex flex-col items-center justify-center p-8 bg-white/50 dark:bg-gray-700/30 border border-white/60 dark:border-gray-600/50 rounded-xl hover:bg-yellow-50/60 dark:hover:bg-yellow-900/20 hover:border-yellow-400/50 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-105 transition-transform">
                    <Star className="w-8 h-8 text-black fill-current" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">IMDb</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center leading-relaxed">
                    Importe suas avaliações do IMDb usando arquivo CSV exportado
                  </p>
                </button>

                <button
                  onClick={() => setImportMethod('cineoracle')}
                  className="group flex flex-col items-center justify-center p-8 bg-white/50 dark:bg-gray-700/30 border border-white/60 dark:border-gray-600/50 rounded-xl hover:bg-blue-50/60 dark:hover:bg-blue-900/20 hover:border-blue-400/50 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-105 transition-transform">
                    <Database className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">CineOracle</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center leading-relaxed">
                    Restaure sua biblioteca usando planilha exportada do CineOracle
                  </p>
                </button>
              </div>
            </div>
          )}

          {importMethod !== 'select' && (
            <div className="p-6 space-y-5">
              {!syncStats && (
                <div className="grid grid-cols-1 gap-3">
                  {importMethod === 'imdb' && (
                    <>
                      <StepItem number={1} title='Acesse "Your Ratings" no IMDb' description='Faça login no imdb.com e acesse a seção "Your Ratings" no seu perfil.' />
                      <StepItem number={2} title='Exporte o arquivo CSV' description='Clique em "Export" e aguarde o download do arquivo ratings.csv.' />
                    </>
                  )}
                  {importMethod === 'cineoracle' && (
                    <StepItem number={1} title="Exporte sua Biblioteca" description='Vá em "Minha Biblioteca" → "Editar" → "Exportar" para baixar sua planilha.' />
                  )}
                  <StepItem
                    number={importMethod === 'cineoracle' ? 2 : 3}
                    title="Faça o upload do arquivo"
                    description="Arraste o arquivo para a área abaixo ou clique para selecionar."
                  />
                  <StepItem
                    number={importMethod === 'cineoracle' ? 3 : 4}
                    title='Clique em "Sincronizar"'
                    description="O sistema buscará cada título no TMDB e adicionará à sua biblioteca automaticamente."
                  />
                </div>
              )}

              {!syncing && !syncStats && (
                <div
                  className={`relative flex justify-center px-6 py-8 border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer ${
                    dragActive
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20'
                      : file
                      ? 'border-green-400/60 bg-green-50/30 dark:bg-green-900/10'
                      : 'border-gray-200 dark:border-gray-600/50 bg-white/30 dark:bg-gray-700/20 hover:border-blue-400/50 hover:bg-blue-50/20 dark:hover:bg-blue-900/10'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <div className="space-y-3 text-center">
                    <div className={`mx-auto w-12 h-12 rounded-xl flex items-center justify-center ${
                      file ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700/50'
                    }`}>
                      <FileUp className={`w-6 h-6 ${file ? 'text-green-500' : dragActive ? 'text-blue-500' : 'text-gray-400'}`} />
                    </div>
                    {file ? (
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">{file.name}</p>
                    ) : (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        <label htmlFor="file-upload" className="cursor-pointer font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors">
                          <span>Clique para selecionar</span>
                          <input
                            id="file-upload"
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            className="sr-only"
                            onChange={handleFileChange}
                          />
                        </label>
                        <span> ou arraste o arquivo aqui</span>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {importMethod === 'imdb' ? 'Apenas .CSV' : '.CSV, .XLSX ou .XLS'}
                    </p>
                  </div>
                </div>
              )}

              {uploading && (
                <div className="flex items-center justify-center gap-3 py-2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">Processando arquivo...</span>
                </div>
              )}

              {parsedMovies.length > 0 && !syncStats && !uploading && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Pré-visualização</h3>
                    <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-full font-medium">
                      {parsedMovies.length} {parsedMovies.length === 1 ? 'título' : 'títulos'} encontrados
                    </span>
                  </div>

                  <div className="rounded-xl border border-gray-200/60 dark:border-gray-700/50 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200/60 dark:divide-gray-700/50">
                      <thead className="bg-gray-50/70 dark:bg-gray-700/40">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Título</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ano</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nota</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white/50 dark:bg-gray-800/30 divide-y divide-gray-200/40 dark:divide-gray-700/30">
                        {parsedMovies.slice(0, 8).map((movie, index) => (
                          <tr key={index} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                            <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-white font-medium truncate max-w-[240px]">{movie.title}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">{movie.year || '—'}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1 text-amber-500">
                                <Star className="w-3.5 h-3.5 fill-current" />
                                <span className="text-sm font-semibold">{movie.rating}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedMovies.length > 8 && (
                      <div className="px-4 py-2.5 bg-gray-50/50 dark:bg-gray-700/20 text-center">
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          e mais {parsedMovies.length - 8} títulos...
                        </p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleSync}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-sm font-semibold rounded-xl transition-all duration-200 shadow-md hover:shadow-lg"
                  >
                    <Film className="w-4 h-4" />
                    Sincronizar {parsedMovies.length} títulos
                  </button>
                </div>
              )}

              {syncing && syncStats && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200/60 dark:border-gray-700/50 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50/70 dark:bg-gray-700/40 border-b border-gray-200/50 dark:border-gray-700/50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sincronizando...</span>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                        {syncStats.processed} / {syncStats.total}
                      </span>
                    </div>
                    <div className="p-4 bg-white/50 dark:bg-gray-800/30 space-y-3">
                      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-300"
                          style={{ width: `${syncProgress}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          {syncStats.succeeded} importados
                        </span>
                        {syncStats.skipped > 0 && (
                          <span className="text-gray-400 font-medium">
                            {syncStats.skipped} já existiam
                          </span>
                        )}
                        {syncStats.failed > 0 && (
                          <span className="text-red-500 dark:text-red-400 font-medium">
                            {syncStats.failed} falhou
                          </span>
                        )}
                        <span className="ml-auto text-gray-400">{syncProgress}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!syncing && syncStats && syncStats.processed === syncStats.total && (
                <div className="rounded-xl border border-gray-200/60 dark:border-gray-700/50 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50/70 dark:bg-gray-700/40 border-b border-gray-200/50 dark:border-gray-700/50">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Resultado da Sincronização</h3>
                  </div>
                  <div className="p-4 bg-white/50 dark:bg-gray-800/30 space-y-2">
                    <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full" style={{ width: `${syncProgress}%` }} />
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        {syncStats.succeeded} {syncStats.succeeded === 1 ? 'título importado' : 'títulos importados'}
                      </span>
                    </div>
                    {syncStats.skipped > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-600 flex-shrink-0" />
                        <span className="text-gray-500 dark:text-gray-400">
                          {syncStats.skipped} já estavam na biblioteca
                        </span>
                      </div>
                    )}
                    {syncStats.failed > 0 && (
                      <div className="space-y-2 mt-1">
                        <div className="flex items-center gap-2 text-sm">
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          <span className="text-red-500 dark:text-red-400 font-medium">
                            {syncStats.failed} {syncStats.failed === 1 ? 'título não encontrado' : 'títulos não encontrados'}
                          </span>
                        </div>
                        <div className="pl-6 max-h-32 overflow-y-auto space-y-1">
                          {syncStats.errors.map((err, i) => (
                            <p key={i} className="text-xs text-gray-500 dark:text-gray-400">
                              • <span className="font-medium">{err.title}</span>
                              {err.reason !== 'Título não encontrado no TMDB' && (
                                <span className="text-gray-400"> — {err.reason}</span>
                              )}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {importMethod === 'imdb' && !syncing && !syncStats && (
                <div className="flex items-start gap-3 p-4 bg-amber-50/60 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-700/30 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-0.5">Filmes e Séries</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                      A importação suporta filmes e séries avaliados no IMDb. Títulos não encontrados no TMDB serão listados ao final.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface StepItemProps {
  number: number;
  title: string;
  description: string;
}

const StepItem: React.FC<StepItemProps> = ({ number, title, description }) => (
  <div className="flex items-start gap-3">
    <div className="flex-shrink-0 w-7 h-7 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center">
      <span className="text-xs font-bold">{number}</span>
    </div>
    <div>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{description}</p>
    </div>
  </div>
);

export default IMDbImportModal;
