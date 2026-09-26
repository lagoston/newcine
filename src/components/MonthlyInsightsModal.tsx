import React, { useState, useEffect } from 'react';
import { Loader2, Star, Film, Download, Share2, Check, Instagram } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import OptimizedPoster from './OptimizedPoster';
import OracleSheet from './OracleSheet';
import { NIGHT, VELVET, PAPER, MIST, PIXEL } from '../lib/oracleTheme';

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
}

const SITE_ICON_URL = '/assets/Symbal512.webp';

// ============================================================
// IMAGEM PARA OS STORIES (1080×1920)
//
// Desenhada direto num <canvas> com a Canvas API — o mesmo mecanismo que
// já funciona em produção no compartilhamento do MovieDetailsModal. Cada
// imagem remota é baixada (fetch → blob → blob URL → Image), o que evita
// problemas de CORS no drawImage. Visual no padrão novo: fundo noite com
// brilho violeta, títulos em Pixelify Sans, texto em papel/névoa.
// ============================================================

const PIXEL_FONT = '"CineOracle Five", "Pixelify Sans", ui-monospace, monospace';
const SANS_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const C_PAPER = '#F3EAD3';
const C_MIST = '#BDB4D6';
const C_VELVET = '#1C1433';
const C_NIGHT = '#120D22';
const C_AMBER = '#FCD34D';

// A ligadura "fi" da Pixelify faz "filme" parecer "Alme" — no canvas não dá
// pra desligar ligaduras, então um separador invisível (ZWNJ) impede a junção.
const noLig = (text: string) => text.replace(/f(?=[il])/g, 'f‌');

interface ImageLoadResult {
  img: HTMLImageElement | null;
  error?: string;
}

async function loadImageFromUrl(url: string): Promise<ImageLoadResult> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return { img: null, error: `HTTP ${response.status}` };
    const blob = await response.blob();
    if (blob.size === 0) return { img: null, error: 'blob vazio' };
    const blobUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Image decode failed'));
        image.src = blobUrl;
      });
      return { img };
    } catch (decodeErr) {
      return { img: null, error: `decode: ${(decodeErr as Error)?.message || 'falha'}` };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch (fetchErr) {
    const err = fetchErr as Error;
    return { img: null, error: `${err?.name || 'Error'}: ${err?.message || 'falha desconhecida'}` };
  }
}

// ctx.roundRect() chegou tarde no Safari — path manual via arcTo funciona em qualquer versão.
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated.trimEnd() + '…';
}

// "Título ★ nota" em texto corrido dentro de uma área de altura FIXA; quando
// o espaço acaba, mostra "+N" com o que ficou de fora.
function drawAlsoRatedFlow(
  ctx: CanvasRenderingContext2D,
  movies: OtherMovie[],
  area: { x: number; y: number; width: number; height: number },
  lineHeight: number,
  moreLabel: (n: number) => string
) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const titleFont = `500 24px ${SANS_FONT}`;
  const ratingFont = `700 24px ${SANS_FONT}`;
  const itemGap = 28;
  const starGap = 7;
  const maxY = area.y + area.height;
  let x = area.x;
  let y = area.y + lineHeight / 2;

  for (let i = 0; i < movies.length; i++) {
    const m = movies[i];
    ctx.font = titleFont;
    const titleWidth = ctx.measureText(m.title).width;
    const starWidth = ctx.measureText('★').width;
    ctx.font = ratingFont;
    const ratingWidth = ctx.measureText(String(m.rating)).width;
    const itemWidth = titleWidth + starGap + starWidth + starGap + ratingWidth;

    if (x !== area.x && x + itemWidth > area.x + area.width) {
      x = area.x;
      y += lineHeight;
    }
    if (y + lineHeight / 2 > maxY) {
      ctx.font = `600 24px ${SANS_FONT}`;
      ctx.fillStyle = C_MIST;
      ctx.fillText(moreLabel(movies.length - i), area.x, y);
      break;
    }

    ctx.font = titleFont;
    ctx.fillStyle = C_MIST;
    ctx.fillText(m.title, x, y);
    x += titleWidth + starGap;
    ctx.fillStyle = C_AMBER;
    ctx.fillText('★', x, y);
    x += starWidth + starGap;
    ctx.font = ratingFont;
    ctx.fillStyle = C_PAPER;
    ctx.fillText(String(m.rating), x, y);
    x += ratingWidth + itemGap;
  }

  ctx.textAlign = 'center';
}

interface ShareCopy {
  title: string;
  stats: { value: string; label: [string, string] }[];
  topTitle: string;
  genresTitle: string;
  alsoRatedTitle: string;
  more: (n: number) => string;
}

async function generateShareImage(data: MonthlyData, profile: ProfileInfo, copy: ShareCopy): Promise<{ dataUrl: string; blob: Blob }> {
  const W = 1080;
  const H = 1920;
  const topMovies = data.top_movies.slice(0, 3);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  // A Pixelify já está carregada na página; isto garante que o canvas a use.
  // O texto de exemplo inclui o "5" pra baixar também a fonte do 5 redesenhado.
  try {
    await Promise.all([
      document.fonts.load(`400 40px ${PIXEL_FONT}`, 'Aa5'),
      document.fonts.load(`600 80px ${PIXEL_FONT}`, 'Aa5'),
    ]);
  } catch {
    // sem a fonte, cai no monoespaçado — a imagem continua legível
  }

  const [avatarResult, iconResult, ...posterResults] = await Promise.all([
    profile.avatar_url ? loadImageFromUrl(profile.avatar_url) : Promise.resolve<ImageLoadResult>({ img: null }),
    loadImageFromUrl(SITE_ICON_URL),
    ...topMovies.map((m) => loadImageFromUrl(`https://image.tmdb.org/t/p/w500${m.poster_path}`)),
  ]);
  [avatarResult, iconResult, ...posterResults].forEach((r, i) => {
    if (r.error) console.error(`[Insights] imagem ${i} não carregou:`, r.error);
  });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Fundo noite + brilhos
  ctx.fillStyle = C_NIGHT;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.78, 0, 0, W * 0.78, 0, W * 0.85);
  glow.addColorStop(0, 'rgba(139,92,246,0.34)');
  glow.addColorStop(1, 'rgba(139,92,246,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const glow2 = ctx.createRadialGradient(0, H, 0, 0, H, W * 0.7);
  glow2.addColorStop(0, 'rgba(192,38,211,0.16)');
  glow2.addColorStop(1, 'rgba(192,38,211,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Marca
  const brandY = 100;
  ctx.font = `600 42px ${PIXEL_FONT}`;
  const brandText = 'CineOracle';
  const brandWidth = ctx.measureText(brandText).width;
  const iconSize = 56;
  const brandTotal = (iconResult.img ? iconSize + 16 : 0) + brandWidth;
  let brandX = W / 2 - brandTotal / 2;
  if (iconResult.img) {
    ctx.save();
    roundRectPath(ctx, brandX, brandY - iconSize / 2, iconSize, iconSize, 14);
    ctx.clip();
    ctx.drawImage(iconResult.img, brandX, brandY - iconSize / 2, iconSize, iconSize);
    ctx.restore();
    brandX += iconSize + 16;
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = C_PAPER;
  ctx.fillText(brandText, brandX, brandY + 2);
  ctx.textAlign = 'center';

  // Avatar
  const avatarCx = W / 2;
  const avatarCy = 272;
  const avatarR = 88;
  const ring = ctx.createLinearGradient(avatarCx - avatarR, avatarCy - avatarR, avatarCx + avatarR, avatarCy + avatarR);
  ring.addColorStop(0, '#7c3aed');
  ring.addColorStop(1, '#c026d3');
  ctx.beginPath();
  ctx.arc(avatarCx, avatarCy, avatarR + 9, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
  ctx.clip();
  if (avatarResult.img) {
    const img = avatarResult.img;
    const scale = Math.max((avatarR * 2) / img.width, (avatarR * 2) / img.height);
    ctx.drawImage(img, avatarCx - (img.width * scale) / 2, avatarCy - (img.height * scale) / 2, img.width * scale, img.height * scale);
  } else {
    ctx.fillStyle = C_VELVET;
    ctx.fillRect(avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2);
    ctx.fillStyle = C_PAPER;
    ctx.font = `600 84px ${PIXEL_FONT}`;
    ctx.fillText(profile.username.charAt(0).toUpperCase(), avatarCx, avatarCy + 4);
  }
  ctx.restore();

  ctx.fillStyle = C_MIST;
  ctx.font = `600 34px ${SANS_FONT}`;
  ctx.fillText(`@${profile.username}`, W / 2, 412);

  // Título
  let titleSize = 84;
  const title = noLig(copy.title);
  ctx.font = `600 ${titleSize}px ${PIXEL_FONT}`;
  while (ctx.measureText(title).width > W - 140 && titleSize > 48) {
    titleSize -= 2;
    ctx.font = `600 ${titleSize}px ${PIXEL_FONT}`;
  }
  ctx.fillStyle = C_PAPER;
  ctx.fillText(title, W / 2, 510);

  // Números do mês
  const statsY = 650;
  const colW = W / 3;
  copy.stats.forEach((s, i) => {
    const cx = colW * i + colW / 2;
    ctx.fillStyle = C_PAPER;
    ctx.font = `600 100px ${PIXEL_FONT}`;
    ctx.fillText(s.value, cx, statsY);
    ctx.fillStyle = C_MIST;
    ctx.font = `500 26px ${SANS_FONT}`;
    s.label.forEach((line, li) => ctx.fillText(line, cx, statsY + 82 + li * 34));
    if (i > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(colW * i, statsY - 50, 2, 170);
    }
  });

  // Melhores do mês
  const topTitleY = 868;
  ctx.fillStyle = C_PAPER;
  ctx.font = `600 44px ${PIXEL_FONT}`;
  ctx.fillText(noLig(copy.topTitle), W / 2, topTitleY);

  const posterW = 280;
  const posterH = 420;
  const posterGap = 34;
  const postersX = (W - (posterW * topMovies.length + posterGap * (topMovies.length - 1))) / 2;
  const postersY = topTitleY + 46;

  topMovies.forEach((m, i) => {
    const x = postersX + i * (posterW + posterGap);
    const img = posterResults[i]?.img;

    roundRectPath(ctx, x, postersY, posterW, posterH, 18);
    if (img) {
      ctx.save();
      ctx.clip();
      const scale = Math.max(posterW / img.width, posterH / img.height);
      ctx.drawImage(img, x + (posterW - img.width * scale) / 2, postersY + (posterH - img.height * scale) / 2, img.width * scale, img.height * scale);
      ctx.restore();
    } else {
      ctx.fillStyle = C_VELVET;
      ctx.fill();
    }
    roundRectPath(ctx, x, postersY, posterW, posterH, 18);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // posição no ranking
    roundRectPath(ctx, x + 16, postersY + 16, 58, 50, 10);
    ctx.fillStyle = 'rgba(18,13,34,0.86)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = C_PAPER;
    ctx.font = `600 32px ${PIXEL_FONT}`;
    ctx.fillText(String(i + 1), x + 45, postersY + 42);

    ctx.fillStyle = C_PAPER;
    ctx.font = `600 25px ${SANS_FONT}`;
    ctx.fillText(truncateToWidth(ctx, m.title, posterW - 8), x + posterW / 2, postersY + posterH + 40);

    ctx.font = `700 26px ${SANS_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = C_AMBER;
    ctx.fillText('★', x + posterW / 2 - 4, postersY + posterH + 80);
    ctx.textAlign = 'left';
    ctx.fillStyle = C_PAPER;
    ctx.fillText(String(m.rating), x + posterW / 2 + 4, postersY + posterH + 80);
    ctx.textAlign = 'center';
  });

  // Gêneros do mês
  const afterPosters = topMovies.length > 0 ? postersY + posterH + 150 : topTitleY + 60;
  const genres = data.top_genres.slice(0, 4);
  let cursorY = afterPosters;
  if (genres.length > 0) {
    ctx.fillStyle = C_PAPER;
    ctx.font = `600 38px ${PIXEL_FONT}`;
    ctx.fillText(noLig(copy.genresTitle), W / 2, cursorY);
    const pillY = cursorY + 42;
    const pillH = 62;
    ctx.font = `600 27px ${SANS_FONT}`;
    const widths = genres.map((g) => ctx.measureText(g.name).width + 60);
    const gap = 16;
    const total = widths.reduce((a, b) => a + b, 0) + gap * (genres.length - 1);
    let px = (W - total) / 2;
    genres.forEach((g, i) => {
      roundRectPath(ctx, px, pillY, widths[i], pillH, pillH / 2);
      ctx.fillStyle = C_VELVET;
      ctx.fill();
      ctx.strokeStyle = 'rgba(167,139,250,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = C_PAPER;
      ctx.fillText(g.name, px + widths[i] / 2, pillY + pillH / 2 + 1);
      px += widths[i] + gap;
    });
    cursorY = pillY + pillH + 76;
  }

  // Também avaliou
  const footerY = H - 80;
  const areaBottom = footerY - 70;
  if (data.other_movies.length > 0 && cursorY < areaBottom - 60) {
    ctx.fillStyle = C_PAPER;
    ctx.font = `600 38px ${PIXEL_FONT}`;
    ctx.fillText(noLig(copy.alsoRatedTitle), W / 2, cursorY);
    drawAlsoRatedFlow(ctx, data.other_movies, { x: 90, y: cursorY + 40, width: W - 180, height: areaBottom - (cursorY + 40) }, 44, copy.more);
  }

  // Rodapé
  ctx.font = `600 34px ${PIXEL_FONT}`;
  ctx.fillStyle = '#DDD6FE';
  ctx.fillText('cineoracle.com', W / 2, footerY);

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  if (!blob) throw new Error('Failed to export canvas to PNG');
  return { dataUrl, blob };
}

// ============================================================
// Modal
// ============================================================

const MonthlyInsightsModal: React.FC<Props> = ({ isOpen, onClose, userId }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const [shareImageBlob, setShareImageBlob] = useState<Blob | null>(null);
  const [sharing, setSharing] = useState(false);
  const [done, setDone] = useState(false);

  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = lastMonthDate.getFullYear();
  const month = lastMonthDate.getMonth() + 1;
  const monthName = lastMonthDate.toLocaleDateString(lang.startsWith('pt') ? 'pt-BR' : 'en-US', { month: 'long' });
  const title = t('insights.title', { month: monthName });

  useEffect(() => {
    if (!isOpen || !userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: profile }, { data: insights, error }] = await Promise.all([
          supabase.from('public_profiles').select('username, avatar_url').eq('id', userId).maybeSingle(),
          supabase.rpc('get_monthly_insights', { p_user_id: userId, p_year: year, p_month: month }),
        ]);
        if (error) throw error;
        if (cancelled) return;
        setProfileInfo(profile as ProfileInfo | null);
        setMonthlyData(insights as MonthlyData);
      } catch (err) {
        console.error('Error fetching monthly insights:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, userId, year, month]);

  useEffect(() => {
    if (!isOpen) {
      setShowShare(false);
      setDone(false);
      setShareImageUrl(null);
      setShareImageBlob(null);
    }
  }, [isOpen]);

  const fileName = `cineoracle-insights-${year}-${String(month).padStart(2, '0')}.png`;
  const isEmpty = !!monthlyData && monthlyData.movies_rated_count === 0 && monthlyData.episodes_watched_count === 0;

  const stats = monthlyData
    ? [
        { value: String(monthlyData.movies_rated_count ?? 0), label: t('insights.statRated', { count: monthlyData.movies_rated_count ?? 0 }) },
        { value: String(monthlyData.episodes_watched_count ?? 0), label: t('insights.statEpisodes', { count: monthlyData.episodes_watched_count ?? 0 }) },
        { value: `${monthlyData.total_hours_watched ?? 0}h`, label: t('insights.statHours') },
      ]
    : [];

  const handleOpenShare = async () => {
    if (!monthlyData || !profileInfo) return;
    setShowShare(true);
    setGeneratingPreview(true);
    try {
      const { dataUrl, blob } = await generateShareImage(monthlyData, profileInfo, {
        title,
        stats: [
          { value: String(monthlyData.movies_rated_count ?? 0), label: [t('insights.imgRated1'), t('insights.imgRated2')] },
          { value: String(monthlyData.episodes_watched_count ?? 0), label: [t('insights.imgEpisodes1'), t('insights.imgEpisodes2')] },
          { value: `${monthlyData.total_hours_watched ?? 0}h`, label: [t('insights.imgHours1'), t('insights.imgHours2')] },
        ],
        topTitle: t('insights.topTitle'),
        genresTitle: t('insights.genresTitle'),
        alsoRatedTitle: t('insights.alsoRatedTitle'),
        more: (n) => t('insights.more', { count: n }),
      });
      setShareImageUrl(dataUrl);
      setShareImageBlob(blob);
    } catch (err) {
      console.error('Error generating share image:', err);
      toast.error(t('insights.generateError'));
      setShowShare(false);
    } finally {
      setGeneratingPreview(false);
    }
  };

  const downloadBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (!shareImageBlob) return;
    setSharing(true);
    try {
      const file = new File([shareImageBlob], fileName, { type: 'image/png' });
      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: t('insights.shareText', { month: monthName }) });
      } else {
        downloadBlob(shareImageBlob);
        toast.success(t('insights.savedForStories'));
      }
      setDone(true);
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') toast.error(t('insights.shareError'));
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = () => {
    if (!shareImageBlob) return;
    try {
      downloadBlob(shareImageBlob);
      setDone(true);
      toast.success(t('insights.downloaded'));
    } catch {
      toast.error(t('insights.downloadError'));
    }
  };

  const busy = sharing || generatingPreview || !shareImageBlob;

  return (
    <>
      <OracleSheet
        open={isOpen}
        onClose={onClose}
        title={title}
        subtitle={t('insights.subtitle')}
        size="md"
        escapeEnabled={!showShare}
        footer={
          !loading && monthlyData && !isEmpty ? (
            <button
              onClick={handleOpenShare}
              className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
            >
              <Instagram className="w-4 h-4" aria-hidden />
              {t('insights.generate')}
            </button>
          ) : undefined
        }
      >
        {loading ? (
          <div className="flex justify-center py-14">
            <Loader2 className="w-7 h-7 animate-spin text-fuchsia-400" />
          </div>
        ) : !monthlyData || isEmpty ? (
          <div className="py-12 text-center">
            <span className="mx-auto w-14 h-14 rounded-2xl grid place-items-center ring-1 ring-white/10 text-violet-200" style={{ background: VELVET }}>
              <Film className="w-6 h-6" aria-hidden />
            </span>
            <p className="mt-5 text-sm leading-relaxed max-w-xs mx-auto" style={{ color: MIST }}>{t('insights.empty')}</p>
          </div>
        ) : (
          <div className="space-y-8">
            <dl className="grid grid-cols-3 divide-x divide-white/[0.08] text-center">
              {stats.map((s) => (
                <div key={s.label} className="px-2">
                  <dt className="sr-only">{s.label}</dt>
                  <dd style={{ ...PIXEL, color: PAPER }} className="text-4xl leading-none">{s.value}</dd>
                  <dd className="mt-2 text-xs sm:text-sm leading-snug" style={{ color: MIST }}>{s.label}</dd>
                </div>
              ))}
            </dl>

            {monthlyData.top_movies.length > 0 && (
              <section>
                <h3 style={{ ...PIXEL, color: PAPER }} className="text-xl">{t('insights.topTitle')}</h3>
                <ol className="mt-4 grid grid-cols-3 gap-3.5">
                  {monthlyData.top_movies.slice(0, 3).map((m, i) => (
                    <li key={`${m.media_type}:${m.movie_id}`} className="min-w-0">
                      <div className="relative aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10" style={{ background: VELVET }}>
                        <OptimizedPoster
                          src={`https://image.tmdb.org/t/p/w342${m.poster_path}`}
                          alt={m.title}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        <span
                          style={{ ...PIXEL, background: 'rgba(18,13,34,0.85)', color: PAPER }}
                          className="absolute top-2 left-2 min-w-[1.8rem] text-center px-1.5 py-0.5 rounded-md text-sm ring-1 ring-white/15"
                        >
                          {i + 1}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium leading-snug line-clamp-2" style={{ color: PAPER }}>{m.title}</p>
                      <p className="mt-0.5 text-sm inline-flex items-center gap-1" style={{ color: PAPER }}>
                        <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" aria-hidden />
                        {m.rating}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {monthlyData.top_genres.length > 0 && (
              <section>
                <h3 style={{ ...PIXEL, color: PAPER }} className="text-xl">{t('insights.genresTitle')}</h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {monthlyData.top_genres.map((g) => (
                    <li key={g.name} className="px-3.5 py-1.5 rounded-full text-sm ring-1 ring-violet-300/30" style={{ background: VELVET, color: PAPER }}>
                      {g.name}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {monthlyData.other_movies.length > 0 && (
              <section>
                <h3 style={{ ...PIXEL, color: PAPER }} className="text-xl">{t('insights.alsoRatedTitle')}</h3>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                  {monthlyData.other_movies.map((m, idx) => (
                    <li key={idx} className="inline-flex items-center gap-1" style={{ color: MIST }}>
                      {m.title}
                      <Star className="w-3 h-3 fill-amber-300 text-amber-300 shrink-0" aria-hidden />
                      <span className="font-semibold" style={{ color: PAPER }}>{m.rating}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </OracleSheet>

      <OracleSheet
        open={showShare}
        onClose={() => setShowShare(false)}
        title={t('insights.shareTitle')}
        subtitle={t('insights.shareSubtitle')}
        size="md"
        footer={
          <div className="flex gap-2.5">
            <button
              onClick={handleDownload}
              disabled={busy}
              className="flex-1 h-12 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold border border-white/15 hover:border-white/35 hover:bg-white/5 transition disabled:opacity-50"
              style={{ color: PAPER }}
            >
              {done ? <Check className="w-4 h-4" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}
              {t('insights.download')}
            </button>
            <button
              onClick={handleShare}
              disabled={busy}
              className="flex-1 h-12 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 transition disabled:opacity-50"
            >
              {sharing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Share2 className="w-4 h-4" aria-hidden />}
              {t('insights.share')}
            </button>
          </div>
        }
      >
        <div className="flex items-center justify-center min-h-[320px]">
          {generatingPreview ? (
            <div className="flex flex-col items-center gap-3" style={{ color: MIST }}>
              <Loader2 className="w-8 h-8 animate-spin text-fuchsia-400" />
              <p className="text-sm">{t('insights.generating')}</p>
            </div>
          ) : shareImageUrl ? (
            <img
              src={shareImageUrl}
              alt={t('insights.previewAlt')}
              className="w-[240px] sm:w-[270px] aspect-[9/16] rounded-2xl ring-1 ring-white/10 shadow-2xl"
              style={{ background: NIGHT }}
            />
          ) : null}
        </div>
      </OracleSheet>
    </>
  );
};

export default MonthlyInsightsModal;