import React, { useState, useCallback } from 'react';
import { X, FileUp, AlertCircle, Loader2, ArrowLeft, Star, Film, Database } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { searchMovies, getMovieDetails } from '../lib/tmdb';
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
  failed: number;
  errors: Array<{ title: string; error: string }>;
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

  const parseCSV = async (file: File) => {
    try {
      setUploading(true);
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      let movies: IMDbMovie[] = [];

      const headerLine = lines.find(line =>
        line.toLowerCase().includes('title') &&
        line.toLowerCase().includes('your rating')
      );

      if (!headerLine) throw new Error(t('common.error'));

      const headers = headerLine
        .split(',')
        .map(header => header.trim().replace(/^"(.*)"$/, '$1').toLowerCase());

      const titleIndex = headers.findIndex(h => h.includes('title'));
      const ratingIndex = headers.findIndex(h => h.includes('your rating'));
      const yearIndex = headers.findIndex(h => h.includes('year'));
      const imdbIdIndex = headers.findIndex(h => h === 'const');

      if (titleIndex === -1 || ratingIndex === -1) throw new Error(t('common.error'));

      const dataLines = lines.slice(lines.indexOf(headerLine) + 1);

      for (const line of dataLines) {
        if (!line.trim()) continue;
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
          .map(value => value.trim().replace(/^"(.*)"$/, '$1'));

        const title = values[titleIndex];
        const ratingStr = values[ratingIndex];
        const rating = parseInt(ratingStr);

        if (!title || !rating || rating < 1 || rating > 10) continue;

        movies.push({
          title,
          rating,
          year: yearIndex !== -1 ? parseInt(values[yearIndex]) || 0 : 0,
          imdbId: imdbIdIndex !== -1 ? values[imdbIdIndex].replace('tt', '') : ''
        });
      }

      if (movies.length === 0) throw new Error(t('common.error'));

      setParsedMovies(movies);
      setSyncStats(null);
      toast.success(t('common.success'));
    } catch (error) {
      console.error('Error parsing CSV:', error);
      toast.error(t('common.error'));
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
      toast.success(`${movies.length} filmes/séries encontrados`);
    } catch (error) {
      console.error('Error parsing CineOracle file:', error);
      toast.error('Erro ao processar arquivo CineOracle');
      setParsedMovies([]);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      if (importMethod === 'cineoracle' && (selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls'))) {
        parseCineOracleFile(selectedFile);
      } else if (importMethod === 'imdb' && selectedFile.name.endsWith('.csv')) {
        parseCSV(selectedFile);
      } else {
        toast.error(t('common.error'));
      }
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const fileName = droppedFile.name.toLowerCase();
      setFile(droppedFile);

      if (importMethod === 'cineoracle' && (fileName.endsWith('.csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls'))) {
        parseCineOracleFile(droppedFile);
      } else if (importMethod === 'imdb' && fileName.endsWith('.csv')) {
        parseCSV(droppedFile);
      } else {
        toast.error(t('common.error'));
      }
    }
  }, [importMethod]);

  const handleSync = async () => {
    if (!session?.user?.id || parsedMovies.length === 0) return;

    setSyncing(true);
    const stats: SyncStats = {
      total: parsedMovies.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    try {
      for (const movie of parsedMovies) {
        try {
          let movieDetails;

          if (importMethod === 'cineoracle') {
            const movieId = parseInt(movie.imdbId);
            const { data: dbMovie } = await supabase
              .from('movies')
              .select('media_type')
              .eq('id', movieId)
              .maybeSingle();

            const mediaType = dbMovie?.media_type || 'movie';
            movieDetails = await getMovieDetails(movieId, mediaType);
          } else {
            const searchResults = await searchMovies(movie.title);
            const bestMatch = searchResults.find(result =>
              result.title.toLowerCase() === movie.title.toLowerCase() &&
              (!movie.year || new Date(result.release_date).getFullYear() === movie.year)
            ) || searchResults[0];

            if (!bestMatch) throw new Error(t('common.error'));

            movieDetails = await getMovieDetails(bestMatch.id);
          }

          const { error: movieError } = await supabase
            .from('movies')
            .upsert({
              id: movieDetails.id,
              title: movieDetails.title,
              release_date: movieDetails.release_date,
              genres: movieDetails.genres.map((g: any) => g.name),
              director: movieDetails.credits?.crew?.find((person: any) => person.job === 'Director')?.name,
              media_type: movieDetails.media_type || 'movie',
              number_of_seasons: movieDetails.media_type === 'tv' ? movieDetails.number_of_seasons : null
            });

          if (movieError) throw movieError;

          const { data: existingMovie, error: existingError } = await supabase
            .from('user_movies')
            .select('rating')
            .eq('movie_id', movieDetails.id)
            .eq('user_id', session.user.id)
            .maybeSingle();

          if (existingError) throw existingError;

          if (existingMovie) {
            if (existingMovie.rating !== movie.rating) {
              const { error: updateError } = await supabase
                .from('user_movies')
                .update({ rating: movie.rating })
                .eq('movie_id', movieDetails.id)
                .eq('user_id', session.user.id);

              if (updateError) throw updateError;
              stats.succeeded++;
            }
          } else {
            const { error: insertError } = await supabase
              .from('user_movies')
              .insert({
                movie_id: movieDetails.id,
                user_id: session.user.id,
                rating: movie.rating
              });

            if (insertError) throw insertError;
            stats.succeeded++;
          }
        } catch (error: any) {
          console.error(`Error processing movie "${movie.title}":`, error);
          stats.failed++;
          stats.errors.push({ title: movie.title, error: error.message || t('common.error') });
        }

        stats.processed++;
        setSyncStats({ ...stats });
      }

      if (stats.succeeded > 0) {
        toast.success(t('common.success'));
        if (onSuccess) onSuccess();
      }
    } catch (error) {
      console.error('Error during sync:', error);
      toast.error(t('common.error'));
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  const syncProgress = syncStats ? (syncStats.processed / syncStats.total) * 100 : 0;

  const handleClose = () => {
    setImportMethod('select');
    setFile(null);
    setParsedMovies([]);
    setSyncStats(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={handleClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-4xl bg-white/90 dark:bg-gray-800/90 rounded-2xl shadow-2xl backdrop-blur-xl border border-white/20 dark:border-gray-700/50 transform transition-all">

          <div className="flex items-center justify-between p-6 border-b border-gray-200/50 dark:border-gray-700/50">
            <div className="flex items-center gap-3">
              {importMethod !== 'select' && (
                <button
                  onClick={() => { setImportMethod('select'); setFile(null); setParsedMovies([]); setSyncStats(null); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {importMethod === 'select' ? t('common.import') : importMethod === 'imdb' ? 'Importar do IMDb' : 'Importar do CineOracle'}
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
              className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {importMethod === 'select' && (
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Escolha o método de importação:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setImportMethod('imdb')}
                  className="group flex flex-col items-center justify-center p-8 bg-white/50 dark:bg-gray-700/30 border border-white/60 dark:border-gray-600/50 rounded-xl hover:bg-yellow-50/60 dark:hover:bg-yellow-900/20 hover:border-yellow-400/50 dark:hover:border-yellow-600/50 transition-all duration-200 shadow-sm hover:shadow-md"
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
                  className="group flex flex-col items-center justify-center p-8 bg-white/50 dark:bg-gray-700/30 border border-white/60 dark:border-gray-600/50 rounded-xl hover:bg-blue-50/60 dark:hover:bg-blue-900/20 hover:border-blue-400/50 dark:hover:border-blue-600/50 transition-all duration-200 shadow-sm hover:shadow-md"
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
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 gap-3">
                {importMethod === 'imdb' && (
                  <>
                    <StepItem number={1} title="Login no IMDb" description='Faça login no site do IMDb e acesse a página "Your Ratings".' />
                    <StepItem number={2} title='Download do .CSV' description='Clique em "Export", acesse as exportações e baixe o arquivo .CSV com suas notas.' />
                  </>
                )}
                {importMethod === 'cineoracle' && (
                  <StepItem number={1} title="Exportar sua Biblioteca" description='Vá em "Minha Biblioteca" → "Editar" → Clique em "Exportar" para baixar sua planilha.' />
                )}
                <StepItem
                  number={importMethod === 'cineoracle' ? 2 : 3}
                  title="Upload do arquivo"
                  description="Faça o upload do arquivo abaixo arrastando ou clicando na área."
                />
                <StepItem
                  number={importMethod === 'cineoracle' ? 3 : 4}
                  title="Sincronizar"
                  description='Clique no botão "Sincronizar" para atualizar sua biblioteca.'
                />
              </div>

              <div
                className={`relative flex justify-center px-6 pt-8 pb-8 border-2 border-dashed rounded-xl transition-all duration-200 ${
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
                    <FileUp className={`w-6 h-6 ${
                      file ? 'text-green-500' : dragActive ? 'text-blue-500' : 'text-gray-400'
                    }`} />
                  </div>
                  {file ? (
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">{file.name}</p>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors"
                      >
                        <span>Clique para selecionar</span>
                        <input
                          id="file-upload"
                          name="file-upload"
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

              {uploading && (
                <div className="flex items-center justify-center gap-3 py-2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">Processando arquivo...</span>
                </div>
              )}

              {parsedMovies.length > 0 && !syncStats && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Pré-visualização
                    </h3>
                    <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-full font-medium">
                      {parsedMovies.length} {parsedMovies.length === 1 ? 'item' : 'itens'} encontrados
                    </span>
                  </div>

                  <div className="rounded-xl border border-gray-200/60 dark:border-gray-700/50 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200/60 dark:divide-gray-700/50">
                      <thead className="bg-gray-50/70 dark:bg-gray-700/40">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {t('common.title')}
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {t('movies.year')}
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Nota
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white/50 dark:bg-gray-800/30 divide-y divide-gray-200/40 dark:divide-gray-700/30">
                        {parsedMovies.slice(0, 10).map((movie, index) => (
                          <tr key={movie.imdbId || index} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                              {movie.title}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                              {movie.year || '—'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 text-amber-500">
                                <Star className="w-3.5 h-3.5 fill-current" />
                                <span className="text-sm font-semibold">{movie.rating}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedMovies.length > 10 && (
                      <div className="px-4 py-3 bg-gray-50/50 dark:bg-gray-700/20 text-center">
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Mostrando 10 de {parsedMovies.length} itens
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSync}
                      disabled={syncing}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-sm font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                    >
                      {syncing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t('common.syncing')}
                        </>
                      ) : (
                        <>
                          <Film className="w-4 h-4" />
                          Sincronizar
                        </>
                      )}
                    </button>
                    {syncing && syncStats && (
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">{syncStats.processed} / {syncStats.total}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{Math.round(syncProgress)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-300"
                            style={{ width: `${syncProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {syncStats && !syncing && (
                <div className="rounded-xl border border-gray-200/60 dark:border-gray-700/50 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50/70 dark:bg-gray-700/40 border-b border-gray-200/50 dark:border-gray-700/50">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {t('common.syncResults')}
                    </h3>
                  </div>
                  <div className="p-4 space-y-2 bg-white/50 dark:bg-gray-800/30">
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <span className="text-xs font-bold">✓</span>
                      </div>
                      <span>{syncStats.succeeded} {syncStats.succeeded === 1 ? 'item sincronizado' : 'itens sincronizados'}</span>
                    </div>
                    {syncStats.failed > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-red-500 dark:text-red-400">
                          <div className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <span className="text-xs font-bold">✗</span>
                          </div>
                          <span>{syncStats.failed} {syncStats.failed === 1 ? 'erro' : 'erros'}</span>
                        </div>
                        <div className="pl-7 space-y-1">
                          {syncStats.errors.slice(0, 5).map((error, index) => (
                            <p key={index} className="text-xs text-gray-500 dark:text-gray-400">
                              • {error.title}
                            </p>
                          ))}
                          {syncStats.errors.length > 5 && (
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              e mais {syncStats.errors.length - 5} erros...
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {importMethod === 'imdb' && (
                <div className="flex items-start gap-3 p-4 bg-amber-50/60 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-700/30 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-0.5">
                      {t('common.importantNote')}
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                      {t('common.importNote')}
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
