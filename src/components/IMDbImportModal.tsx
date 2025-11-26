import React, { useState, useCallback } from 'react';
import { X, FileUp, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
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
      
      // Split into lines and remove empty ones
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      
      // Process the CSV content
      let movies: IMDbMovie[] = [];
      
      // Find the header line and get column indices
      const headerLine = lines.find(line => 
        line.toLowerCase().includes('title') && 
        line.toLowerCase().includes('your rating')
      );
      
      if (!headerLine) {
        throw new Error(t('common.error'));
      }

      // Split headers and clean them
      const headers = headerLine
        .split(',')
        .map(header => header.trim().replace(/^"(.*)"$/, '$1').toLowerCase());

      // Get column indices
      const titleIndex = headers.findIndex(h => h.includes('title'));
      const ratingIndex = headers.findIndex(h => h.includes('your rating'));
      const yearIndex = headers.findIndex(h => h.includes('year'));
      const imdbIdIndex = headers.findIndex(h => h === 'const');

      // Validate required columns exist
      if (titleIndex === -1 || ratingIndex === -1) {
        throw new Error(t('common.error'));
      }

      // Process each line after the header
      const dataLines = lines.slice(lines.indexOf(headerLine) + 1);
      
      for (const line of dataLines) {
        // Skip empty lines
        if (!line.trim()) continue;

        // Split the line handling quoted values
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
          .map(value => value.trim().replace(/^"(.*)"$/, '$1'));

        // Extract values
        const title = values[titleIndex];
        const ratingStr = values[ratingIndex];
        const rating = parseInt(ratingStr);
        
        // Skip invalid entries
        if (!title || !rating || rating < 1 || rating > 10) continue;

        // Create movie object with available data
        const movie: IMDbMovie = {
          title,
          rating,
          year: yearIndex !== -1 ? parseInt(values[yearIndex]) || 0 : 0,
          imdbId: imdbIdIndex !== -1 ? values[imdbIdIndex].replace('tt', '') : ''
        };

        movies.push(movie);
      }

      if (movies.length === 0) {
        throw new Error(t('common.error'));
      }

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
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const movies: IMDbMovie[] = [];

      for (const row of jsonData as any[]) {
        const id = row['ID'];
        const title = row['Título'];
        const rating = row['Nota'];

        if (id && title) {
          movies.push({
            title,
            year: 0,
            rating: rating || 0,
            imdbId: String(id)
          });
        }
      }

      if (movies.length === 0) {
        throw new Error('Nenhum filme encontrado na planilha');
      }

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
      if (importMethod === 'cineoracle' && (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls'))) {
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
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      setFile(droppedFile);
      parseCSV(droppedFile);
    } else {
      toast.error(t('common.error'));
    }
  }, []);

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
            // For CineOracle, use ID directly
            const movieId = parseInt(movie.imdbId);

            // Check database for media_type
            const { data: dbMovie } = await supabase
              .from('movies')
              .select('media_type')
              .eq('id', movieId)
              .maybeSingle();

            const mediaType = dbMovie?.media_type || 'movie';
            movieDetails = await getMovieDetails(movieId, mediaType);
          } else {
            // For IMDb, search by title
            const searchResults = await searchMovies(movie.title);
            const bestMatch = searchResults.find(result =>
              result.title.toLowerCase() === movie.title.toLowerCase() &&
              (!movie.year || new Date(result.release_date).getFullYear() === movie.year)
            ) || searchResults[0];

            if (!bestMatch) {
              throw new Error(t('common.error'));
            }

            movieDetails = await getMovieDetails(bestMatch.id);
          }
          
          // Store movie metadata
          const { error: movieError } = await supabase
            .from('movies')
            .upsert({
              id: movieDetails.id,
              title: movieDetails.title,
              release_date: movieDetails.release_date,
              genres: movieDetails.genres.map(g => g.name),
              director: movieDetails.credits?.crew?.find(person => person.job === 'Director')?.name,
              media_type: movieDetails.media_type || 'movie',
              number_of_seasons: movieDetails.media_type === 'tv' ? movieDetails.number_of_seasons : null
            });

          if (movieError) throw movieError;

          // Check if the movie already exists in user's library
          const { data: existingMovie, error: existingError } = await supabase
            .from('user_movies')
            .select('rating')
            .eq('movie_id', movieDetails.id)
            .eq('user_id', session.user.id)
            .single();

          if (existingError && existingError.code !== 'PGRST116') { // PGRST116 is "not found"
            throw existingError;
          }

          // If movie exists and rating is different, update it
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
            // Add new movie to user's library
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
        } catch (error) {
          console.error(`Error processing movie "${movie.title}":`, error);
          stats.failed++;
          stats.errors.push({
            title: movie.title,
            error: error.message || t('common.error')
          });
        }

        stats.processed++;
        setSyncStats({ ...stats });
      }

      if (stats.succeeded > 0) {
        toast.success(t('common.success'));
        if (onSuccess) {
          onSuccess();
        }
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
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={handleClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-4xl bg-white dark:bg-gray-800 rounded-xl shadow-xl transform transition-all">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {importMethod === 'select' ? t('common.import') : importMethod === 'imdb' ? t('library.importFromImdb') : 'Importar do CineOracle'}
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {importMethod === 'select' && (
            <div className="p-6 space-y-6">
              <p className="text-gray-600 dark:text-gray-400">
                Escolha o método de importação:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setImportMethod('imdb')}
                  className="flex flex-col items-center justify-center p-8 bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 border-2 border-yellow-300 dark:border-yellow-700 rounded-lg hover:shadow-lg transition-all"
                >
                  <div className="w-16 h-16 bg-yellow-400 rounded-full flex items-center justify-center mb-4">
                    <FileUp className="w-8 h-8 text-black" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    IMDb
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    Importar suas avaliações do IMDb usando arquivo CSV
                  </p>
                </button>

                <button
                  onClick={() => setImportMethod('cineoracle')}
                  className="flex flex-col items-center justify-center p-8 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-2 border-blue-300 dark:border-blue-700 rounded-lg hover:shadow-lg transition-all"
                >
                  <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mb-4">
                    <FileUp className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    CineOracle
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    Importar usando planilha exportada do CineOracle
                  </p>
                </button>
              </div>
            </div>
          )}

          {importMethod !== 'select' && (
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              {importMethod === 'imdb' && (
                <>
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-bold">1</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        Login no IMDb
                      </h3>
                      <p className="mt-1 text-gray-600 dark:text-gray-400">
                        Faça login no site do IMDb e acesse a página "Your Ratings".
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-bold">2</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        Download the .CSV
                      </h3>
                      <p className="mt-1 text-gray-600 dark:text-gray-400">
                        Clique no botão "Export", acesse a página de exportações e baixe o arquivo .CSV com suas notas.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {importMethod === 'cineoracle' && (
                <>
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-bold">1</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        Exportar sua Biblioteca
                      </h3>
                      <p className="mt-1 text-gray-600 dark:text-gray-400">
                        Vá em "Minha Biblioteca" → "Editar" → Clique no botão de "Exportar" para baixar sua planilha do CineOracle.
                      </p>
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 dark:text-blue-400 font-bold">{importMethod === 'cineoracle' ? '2' : '3'}</span>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Upload the File
                  </h3>
                  <p className="mt-1 text-gray-600 dark:text-gray-400">
                    Faça o upload do arquivo {importMethod === 'cineoracle' ? '.xlsx' : '.csv'} aqui em baixo.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 dark:text-blue-400 font-bold">{importMethod === 'cineoracle' ? '3' : '4'}</span>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Sincronizar
                  </h3>
                  <p className="mt-1 text-gray-600 dark:text-gray-400">
                    Clique no botão verde "Sincronizar" para atualizar sua biblioteca.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <div
                className={`flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-colors ${
                  dragActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="space-y-3 text-center">
                  <FileUp className={`mx-auto h-12 w-12 ${
                    dragActive ? 'text-blue-500' : 'text-gray-400'
                  }`} />
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                    >
                      <span>{t('common.upload')}</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        accept=".csv"
                        className="sr-only"
                        onChange={handleFileChange}
                      />
                    </label>
                    <p className="pl-1">{t('common.dragAndDrop')}</p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    CSV {t('common.filesOnly')}
                  </p>
                </div>
              </div>
            </div>

            {uploading && (
              <div className="flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            )}

            {parsedMovies.length > 0 && !syncStats && (
              <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  {t('library.importFromImdb')} ({parsedMovies.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          {t('common.title')}
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          {t('movies.year')}
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          {t('movies.yourRating')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {parsedMovies.slice(0, 10).map((movie, index) => (
                        <tr key={movie.imdbId || index} className={index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {movie.title}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {movie.year}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center text-yellow-500">
                              <Star className="w-4 h-4 fill-current" />
                              <span className="ml-1">{movie.rating}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedMovies.length > 10 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 text-center">
                      {t('common.showing')} 10 {t('common.of')} {parsedMovies.length} {t('community.films')}
                    </p>
                  )}
                </div>

                <div className="mt-6 flex justify-center">
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {syncing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        {t('common.syncing')}
                      </>
                    ) : (
                      "Sincronizar"
                    )}
                  </button>
                  {syncing && (
                    <div className="ml-4 flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-600 dark:bg-green-500 transition-all duration-300"
                        style={{ width: `${syncProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {syncStats && (
              <div className="mt-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  {t('common.syncResults')}
                </h3>
                <div className="space-y-2">
                  <p className="text-green-600 dark:text-green-400">
                    ✓ {t('common.successfully')} {t('common.synced')} {syncStats.succeeded} {t('community.films')}
                  </p>
                  {syncStats.failed > 0 && (
                    <>
                      <p className="text-red-600 dark:text-red-400">
                        ✗ {t('common.failed')} {t('common.toSync')} {syncStats.failed} {t('community.films')}
                      </p>
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                          {t('common.error')}:
                        </h4>
                        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                          {syncStats.errors.map((error, index) => (
                            <li key={index}>
                              • {error.title}: {error.error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {importMethod === 'imdb' && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-yellow-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      {t('common.importantNote')}
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                      <p>
                        {t('common.importNote')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {importMethod !== 'select' && (
            <div className="flex justify-start p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setImportMethod('select');
                  setFile(null);
                  setParsedMovies([]);
                  setSyncStats(null);
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('common.back')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IMDbImportModal;