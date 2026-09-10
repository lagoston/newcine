import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, Star, Film, Download, Share2, Check, Instagram } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useProfileData } from '../hooks/useProfileData';
import ArchetypeSymbol from './ArchetypeSymbol';
import OptimizedPoster from './OptimizedPoster';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

interface TopMovie {
  movie_id: number;
  media_type: string;
  title: string;
  poster_path: string;
  rating: number;
}

interface OtherMovie {
  title: string;
  rating: number;
}

interface MonthlyData {
  year: number;
  month: number;
  movies_rated_count: number;
  episodes_watched_count: number;
  total_movies_rated_alltime: number;
  total_hours_watched: number;
  top_movies: TopMovie[];
  other_movies: OtherMovie[];
  top_genres: { name: string }[];
}

interface ProfileInfo {
  username: string;
  avatar_url: string | null;
  avatar_frame: string | null;
  plan_type: string;
}

const SITE_ICON_URL = '/assets/Symbal512.webp';

// Espera todo <img> dentro do container terminar de carregar antes de
// deixar o html2canvas rodar. Diferente do PersonaShareModal (que não
// tinha nenhuma imagem externa, só SVG/CSS), esse card carrega avatar
// e pôsteres reais do TMDB — sem esperar o carregamento, html2canvas
// captura essas áreas em branco, já que roda de forma síncrona sobre o
// estado atual do DOM.
const waitForImages = (container: HTMLElement): Promise<void> => {
  const imgs = Array.from(container.querySelectorAll('img'));
  return Promise.all(
    imgs.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });
    })
  ).then(() => undefined);
};

// Versão funcional — o modal em si mostra só as estatísticas mensais
// (sem avatar/nome/essência, que agora vivem exclusivamente na imagem
// gerada pra compartilhar). Reaproveita useProfileData (mesmo hook de
// Profile.tsx) pros dados TOTAIS/personalidade, usados só no card de
// compartilhamento — e get_monthly_insights pros números do mês.
const MonthlyInsightsModal: React.FC<Props> = ({ isOpen, onClose, userId }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const { ratedMoviesCount, essencePersonality, loading: profileLoading } = useProfileData(userId, i18n.language);

  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShareCard, setShowShareCard] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = lastMonthDate.getFullYear();
  const month = lastMonthDate.getMonth() + 1;
  const monthName = lastMonthDate.toLocaleDateString(isPt ? 'pt-BR' : 'en-US', { month: 'long' });

  useEffect(() => {
    if (!isOpen || !userId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [{ data: profile }, { data: insights, error }] = await Promise.all([
          supabase.from('profiles').select('username, avatar_url, avatar_frame, plan_type').eq('id', userId).maybeSingle(),
          supabase.rpc('get_monthly_insights', { p_user_id: userId, p_year: year, p_month: month }),
        ]);

        if (error) throw error;
        setProfileInfo(profile);
        setMonthlyData(insights as MonthlyData);
      } catch (err) {
        console.error('Error fetching monthly insights:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, userId, year, month]);

  useEffect(() => {
    if (!isOpen) {
      setShowShareCard(false);
      setDone(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const archetypeId = essencePersonality?.personalidade_completa?.slice(0, 2);
  const subcategoryId = essencePersonality?.personalidade_completa?.slice(2, 3);
  const isLoading = loading || profileLoading;

  const generateBlob = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    await waitForImages(cardRef.current);
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: null,
      scale: 0.66,
      useCORS: true,
      logging: false,
    });
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  };

  const fileName = `cineoracle-insights-${year}-${String(month).padStart(2, '0')}.png`;

  const handleShare = async () => {
    setGenerating(true);
    try {
      const blob = await generateBlob();
      if (!blob) throw new Error('Falha ao gerar imagem');
      const file = new File([blob], fileName, { type: 'image/png' });

      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: t('home.panels.monthlyInsights', { defaultValue: 'Insights Mensais' }),
          text: isPt
            ? `Meus Insights de ${monthName} no CineOracle!`
            : `My ${monthName} Insights on CineOracle!`,
        });
        setDone(true);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDone(true);
        toast.success(isPt ? 'Imagem baixada! Compartilhe nos seus stories.' : 'Image saved! Share it on your stories.');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error(isPt ? 'Não foi possível gerar a imagem.' : 'Could not generate image.');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const blob = await generateBlob();
      if (!blob) throw new Error();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDone(true);
      toast.success(isPt ? 'Imagem baixada!' : 'Image downloaded!');
    } catch {
      toast.error(isPt ? 'Falha ao baixar.' : 'Download failed.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-3xl bg-white dark:bg-gray-800 shadow-2xl"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white capitalize">
              {t('home.panels.monthlyInsights', { defaultValue: 'Insights Mensais' })} — {monthName}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
              </div>
            ) : (
              <>
                {/* Só as estatísticas mensais aqui dentro — avatar, nome
                    e essência cinematográfica agora só aparecem na
                    imagem gerada pra compartilhar, mais abaixo. */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-2xl bg-violet-500/10">
                    <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{monthlyData?.movies_rated_count ?? 0}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('home.panels.moviesThisMonth', { defaultValue: 'Filmes no mês' })}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-fuchsia-500/10">
                    <p className="text-2xl font-bold text-fuchsia-600 dark:text-fuchsia-400">{monthlyData?.episodes_watched_count ?? 0}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('home.panels.episodesThisMonth', { defaultValue: 'Episódios' })}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-amber-500/10">
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{monthlyData?.total_hours_watched ?? 0}h</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('home.panels.hoursThisMonth', { defaultValue: 'Horas assistidas' })}</p>
                  </div>
                </div>

                {monthlyData && monthlyData.top_movies.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">
                      {t('home.panels.topMoviesThisMonth', { defaultValue: 'Melhores do mês' })}
                    </h3>
                    <div className="flex gap-3">
                      {monthlyData.top_movies.map((m) => (
                        <div key={m.movie_id} className="flex-1 min-w-0">
                          <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-md mb-1">
                            <OptimizedPoster
                              src={`https://image.tmdb.org/t/p/w300${m.poster_path}`}
                              alt={m.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{m.title}</p>
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{m.rating}/10</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {monthlyData && monthlyData.top_genres.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">
                      {t('home.panels.topGenresThisMonth', { defaultValue: 'Gêneros do mês' })}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {monthlyData.top_genres.map((g) => (
                        <span key={g.name} className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200">
                          {g.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Também avaliou — agora com estrela + nota junto de
                    cada título, não só o nome solto. */}
                {monthlyData && monthlyData.other_movies.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5">
                      {t('home.panels.otherMoviesThisMonth', { defaultValue: 'Também avaliou' })}
                    </h3>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {monthlyData.other_movies.map((m, idx) => (
                        <span key={idx} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          {m.title}
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                          <span className="font-semibold text-gray-600 dark:text-gray-300">{m.rating}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {monthlyData && monthlyData.movies_rated_count === 0 && monthlyData.episodes_watched_count === 0 && (
                  <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                    <Film className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">{t('home.panels.noInsightsThisMonth', { defaultValue: 'Nenhuma atividade registrada nesse mês.' })}</p>
                  </div>
                )}

                <button
                  onClick={() => setShowShareCard(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white text-sm font-bold shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Instagram className="w-4 h-4" />
                  {t('home.panels.generateInstagramImage', { defaultValue: 'Gerar imagem para o Instagram' })}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Modal de compartilhamento — mesmo padrão já usado em
          PersonaShareModal: preview em escala reduzida do card real
          (1080x1920), com Baixar/Compartilhar. */}
      {showShareCard && monthlyData && profileInfo && (
        <motion.div
          key="share-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-3"
          onClick={() => setShowShareCard(false)}
        >
          <motion.div
            initial={{ y: 30, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl bg-gradient-to-br from-gray-900 to-black border border-white/10 shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-base font-bold text-white">
                {isPt ? 'Compartilhar Insights' : 'Share Insights'}
              </h3>
              <button onClick={() => setShowShareCard(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-5 bg-gradient-to-b from-gray-950 to-black flex items-center justify-center">
              <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ width: 270, height: 480, transform: 'translateZ(0)' }}>
                <div style={{ width: 270, height: 480, transform: 'scale(0.25)', transformOrigin: 'top left' }}>
                  <div style={{ width: 1080, height: 1920 }}>
                    <InsightsShareCard
                      refEl={cardRef}
                      monthlyData={monthlyData}
                      profileInfo={profileInfo}
                      archetypeId={archetypeId}
                      subcategoryId={subcategoryId}
                      personaCode={essencePersonality?.personalidade_completa}
                      monthName={monthName}
                      isPt={isPt}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 pt-2 flex gap-2 border-t border-white/10 bg-gray-950/40">
              <button
                onClick={handleDownload}
                disabled={generating}
                className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                {isPt ? 'Baixar' : 'Download'}
              </button>
              <button
                onClick={handleShare}
                disabled={generating}
                className="flex-1 py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-lg bg-gradient-to-r from-violet-500 to-fuchsia-500"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                {isPt ? 'Compartilhar' : 'Share'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// O card real (1080x1920) usado pelo html2canvas — só aqui aparecem
// avatar, nome e essência cinematográfica, exatamente como pedido:
// essas informações são exclusivas da imagem de compartilhamento, não
// do modal em tela.
const InsightsShareCard: React.FC<{
  refEl: React.RefObject<HTMLDivElement>;
  monthlyData: MonthlyData;
  profileInfo: ProfileInfo;
  archetypeId?: string;
  subcategoryId?: string;
  personaCode?: string | null;
  monthName: string;
  isPt: boolean;
}> = ({ refEl, monthlyData, profileInfo, archetypeId, subcategoryId, personaCode, monthName, isPt }) => {
  const color = '#a855f7'; // violeta — identidade visual já estabelecida do recurso Insights
  const topMovies = monthlyData.top_movies.slice(0, 3);

  return (
    <div
      ref={refEl}
      style={{
        width: 1080,
        height: 1920,
        position: 'relative',
        background: `radial-gradient(circle at 50% 20%, ${color}44 0%, transparent 55%), linear-gradient(180deg, #0a0a0f 0%, #000000 100%)`,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#fff',
        overflow: 'hidden',
      }}
    >
      {/* Grid decorativo, mesmo recurso visual do PersonaShareModal */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(${color}10 1px, transparent 1px), linear-gradient(90deg, ${color}10 1px, transparent 1px)`,
          backgroundSize: '120px 120px',
          opacity: 0.4,
        }}
      />

      {/* Brilhos decorativos nos cantos, ecoando o painel de Insights na Home */}
      <div style={{ position: 'absolute', top: -100, right: -100, width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle, ${color}33 0%, transparent 70%)` }} />
      <div style={{ position: 'absolute', bottom: 100, left: -150, width: 450, height: 450, borderRadius: '50%', background: 'radial-gradient(circle, #f0abfc22 0%, transparent 70%)' }} />

      {/* Marca no topo */}
      <div style={{ position: 'absolute', top: 64, left: 0, right: 0, textAlign: 'center', fontSize: 26, fontWeight: 600, letterSpacing: 7, color: '#9ca3af', textTransform: 'uppercase' }}>
        Cine Oracle
      </div>

      {/* Cabeçalho do usuário — avatar + nome + essência, EXCLUSIVO
          dessa imagem, nunca exibido no modal em tela. */}
      <div style={{ position: 'absolute', top: 140, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <div
          style={{
            width: 168, height: 168, borderRadius: '50%', overflow: 'hidden',
            border: `4px solid ${color}`, boxShadow: `0 0 50px ${color}70`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(135deg, ${color}, #ec4899)`,
          }}
        >
          {profileInfo.avatar_url ? (
            <img src={profileInfo.avatar_url} alt={profileInfo.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} crossOrigin="anonymous" />
          ) : (
            <span style={{ fontSize: 64, fontWeight: 800, color: '#fff' }}>{profileInfo.username.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, color: '#fff' }}>@{profileInfo.username}</div>
        {archetypeId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}>
            <ArchetypeSymbol archetypeId={archetypeId} subcategoryId={subcategoryId || null} size={36} animated={false} />
            <span style={{ fontSize: 30, fontWeight: 700, color, letterSpacing: 2 }}>{personaCode}</span>
          </div>
        )}
      </div>

      {/* Título do relatório do mês */}
      <div style={{ position: 'absolute', top: 500, left: 60, right: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 600, color: '#9ca3af', letterSpacing: 4, textTransform: 'uppercase', marginBottom: 8 }}>
          {isPt ? 'Insights de' : 'Insights for'}
        </div>
        <div style={{ fontSize: 68, fontWeight: 900, color: '#fff', textTransform: 'capitalize', lineHeight: 1.05 }}>
          {monthName}
        </div>
      </div>

      {/* Números grandes — estilo "Wrapped" */}
      <div style={{ position: 'absolute', top: 660, left: 60, right: 60, display: 'flex', justifyContent: 'space-between' }}>
        {[
          { value: monthlyData.movies_rated_count, label: isPt ? 'filmes\navaliados' : 'movies\nrated' },
          { value: monthlyData.episodes_watched_count, label: isPt ? 'episódios\nassistidos' : 'episodes\nwatched' },
          { value: `${monthlyData.total_hours_watched}h`, label: isPt ? 'horas\nassistidas' : 'hours\nwatched' },
        ].map((stat, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <div style={{ fontSize: 88, fontWeight: 900, color: i === 1 ? '#f0abfc' : color, lineHeight: 1, textShadow: `0 0 40px ${color}50` }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#d1d5db', textAlign: 'center', whiteSpace: 'pre-line', marginTop: 12, lineHeight: 1.3 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Top 3 filmes do mês, com poster + nota */}
      {topMovies.length > 0 && (
        <div style={{ position: 'absolute', top: 960, left: 60, right: 60 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 24, textAlign: 'center' }}>
            {isPt ? 'Melhores do mês' : 'Best of the month'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
            {topMovies.map((m) => (
              <div key={m.movie_id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 280 }}>
                <div style={{ width: 280, height: 420, borderRadius: 20, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.15)' }}>
                  <img
                    src={`https://image.tmdb.org/t/p/w500${m.poster_path}`}
                    alt={m.title}
                    crossOrigin="anonymous"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, padding: '6px 18px', borderRadius: 999, background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)' }}>
                  <Star style={{ width: 22, height: 22, color: '#fbbf24', fill: '#fbbf24' }} />
                  <span style={{ fontSize: 26, fontWeight: 800, color: '#fbbf24' }}>{m.rating}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gêneros do mês */}
      {monthlyData.top_genres.length > 0 && (
        <div style={{ position: 'absolute', top: 1530, left: 60, right: 60, display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          {monthlyData.top_genres.map((g) => (
            <div
              key={g.name}
              style={{
                padding: '16px 36px', borderRadius: 999, background: 'rgba(255,255,255,0.07)',
                border: `1px solid ${color}50`, fontSize: 30, fontWeight: 700, color: '#e5e7eb',
              }}
            >
              {g.name}
            </div>
          ))}
        </div>
      )}

      {/* Rodapé — favicon do site + domínio */}
      <div style={{ position: 'absolute', bottom: 90, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <img src={SITE_ICON_URL} alt="" crossOrigin="anonymous" style={{ width: 48, height: 48, borderRadius: 12 }} />
        <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: 3, color }}>cineoracle.com</span>
      </div>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
    </div>
  );
};

export default MonthlyInsightsModal;