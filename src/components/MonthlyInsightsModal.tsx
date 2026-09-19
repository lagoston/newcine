import React, { useState, useEffect, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  X, Loader2, Star, Film, Download, Share2, Check, Instagram,
  Heart, Flame, Eye, Sparkles, BrainCircuit, Shield, Lightbulb, Compass,
  Target, Crown, Zap, Infinity as InfinityIcon, Hexagon, CircleDashed,
  Triangle, Gem, Aperture, Orbit, Dna, Fingerprint,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useProfileData } from '../hooks/useProfileData';
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

// ============================================================
// GERAÇÃO DA IMAGEM DE COMPARTILHAMENTO — reescrita do zero.
//
// A versão anterior usava html2canvas pra "fotografar" um card HTML/CSS
// escondido no DOM. Depois de várias tentativas de correção (lineHeight,
// vertical-align, troca de biblioteca), o problema de fundo continuava:
// html2canvas precisa REIMPLEMENTAR em JavaScript como o navegador
// calcularia o layout de qualquer HTML/CSS arbitrário — e essa
// reimplementação tem bugs conhecidos e nunca corrigidos oficialmente,
// exatamente com texto ao lado de ícones e dentro de elementos com
// fundo colorido (issue #2937 do próprio repositório da lib).
//
// A abordagem nova elimina essa camada de tradução por completo: a
// imagem é desenhada diretamente como SVG, onde a posição de cada
// texto é um número explícito (x, y) que o navegador não precisa
// "adivinhar" a partir de CSS — e SVG é convertido pra <canvas> usando
// a própria engine nativa de renderização do navegador (o mesmo
// caminho que desenha qualquer <img> na tela), não uma reimplementação
// em JS. Isso resolve o alinhamento pela raiz, não por tentativa e erro
// de CSS.
//
// Também elimina o outro bug (pôsteres pretos): toda imagem externa
// (avatar, pôsteres, favicon) é baixada e convertida em base64 ANTES de
// entrar no SVG — a imagem final não faz nenhuma requisição de rede no
// momento da conversão pra canvas, então não há CORS, não há cache
// misto, não há "canvas contaminado".
//
// E, importante: a MESMA imagem gerada aqui é usada tanto na prévia
// quanto no download/compartilhamento — não existem mais duas
// renderizações separadas que podem divergir uma da outra.
// ============================================================

const ARCHETYPE_ICON_MAP: Record<string, React.ComponentType<any>> = {
  EI: Heart, EC: Flame, ES: Eye, ER: Sparkles,
  IE: BrainCircuit, IC: Shield, IS: Lightbulb, IR: Hexagon,
  CE: Orbit, CI: Crown, CS: Gem, CR: Compass,
  SE: Aperture, SI: Fingerprint, SC: CircleDashed, SR: Triangle,
  RE: Target, RI: Zap, RC: InfinityIcon, RS: Dna,
};

const SUBCATEGORY_COLORS: Record<string, string> = {
  A: '#F59E0B', B: '#8B5CF6', K: '#EF4444', X: '#3B82F6', D: '#FFFFFF', L: '#10B981',
};

function getArchetypeColor(subcategoryId?: string | null): string {
  return (subcategoryId && SUBCATEGORY_COLORS[subcategoryId]) || '#9CA3AF';
}

// Renderiza o ícone lucide correspondente pra uma string SVG estática —
// mesmo mapeamento de ArchetypeSymbol.tsx, mas sem o wrapper de animação
// (framer-motion não serializa, e aqui a imagem é estática de qualquer
// forma).
function getArchetypeIconMarkup(archetypeId: string | undefined, subcategoryId: string | undefined, size: number): string {
  const IconComponent = (archetypeId && ARCHETYPE_ICON_MAP[archetypeId]) || CircleDashed;
  const color = getArchetypeColor(subcategoryId);
  return renderToStaticMarkup(<IconComponent size={size} color={color} strokeWidth={1.5} />);
}

// Baixa uma imagem e converte pra data URL — depois disso ela não
// depende mais de nenhuma requisição de rede, então nunca mais pode
// "contaminar" o canvas por CORS. Falha de rede em UMA imagem não
// derruba a geração inteira: retorna null e o SVG simplesmente omite
// aquele <image>.
async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Corta um título longo pra caber na largura de um pôster (110px) sem
// medir texto de verdade (SVG não tem "text-overflow: ellipsis" nativo
// confiável entre navegadores) — uma aproximação por contagem de
// caracteres é suficiente pra um título de filme numa fonte de ~13px.
function truncateForPoster(text: string, maxChars = 16): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1).trimEnd() + '…';
}

interface GenerateImageParams {
  monthlyData: MonthlyData;
  profileInfo: ProfileInfo;
  archetypeId?: string;
  subcategoryId?: string;
  personaCode?: string | null;
  monthName: string;
  isPt: boolean;
}

async function generateShareImage(params: GenerateImageParams): Promise<{ dataUrl: string; blob: Blob }> {
  const { monthlyData, profileInfo, archetypeId, subcategoryId, personaCode, monthName, isPt } = params;
  const color = '#a855f7';
  const topMovies = monthlyData.top_movies.slice(0, 3);

  const [avatarDataUrl, faviconDataUrl, ...posterDataUrls] = await Promise.all([
    profileInfo.avatar_url ? loadImageAsDataUrl(profileInfo.avatar_url) : Promise.resolve(null),
    loadImageAsDataUrl(SITE_ICON_URL),
    ...topMovies.map((m) => loadImageAsDataUrl(`https://image.tmdb.org/t/p/w500${m.poster_path}`)),
  ]);

  const archetypeIconMarkup = archetypeId ? getArchetypeIconMarkup(archetypeId, subcategoryId, 40) : '';

  const W = 1080;
  const H = 1920;

  const posterW = 300;
  const posterH = 450;
  const posterGap = 40;
  const postersStartX = (W - (posterW * 3 + posterGap * 2)) / 2;
  const postersY = 1050;

  const genreLabels = monthlyData.top_genres.slice(0, 4).map((g) => g.name);
  let genreX = 90;
  const genreY = 1670;
  const genrePillsMarkup = genreLabels
    .map((name) => {
      const textWidth = name.length * 17 + 72;
      const pill = `
        <rect x="${genreX}" y="${genreY}" width="${textWidth}" height="72" rx="36" fill="rgba(255,255,255,0.07)" stroke="${color}50" stroke-width="1.5" />
        <text x="${genreX + textWidth / 2}" y="${genreY + 36}" font-size="30" font-weight="700" fill="#e5e7eb" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">${escapeXml(name)}</text>
      `;
      genreX += textWidth + 20;
      return pill;
    })
    .join('');

  const postersMarkup = topMovies
    .map((m, i) => {
      const x = postersStartX + i * (posterW + posterGap);
      const dataUrl = posterDataUrls[i];
      const clipId = `posterClip${i}`;
      const imageOrPlaceholder = dataUrl
        ? `<image href="${dataUrl}" x="${x}" y="${postersY}" width="${posterW}" height="${posterH}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice" />`
        : `<rect x="${x}" y="${postersY}" width="${posterW}" height="${posterH}" rx="20" fill="#1f2937" />`;
      return `
        <clipPath id="${clipId}"><rect x="${x}" y="${postersY}" width="${posterW}" height="${posterH}" rx="20" /></clipPath>
        ${imageOrPlaceholder}
        <rect x="${x}" y="${postersY}" width="${posterW}" height="${posterH}" rx="20" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2" />
        <circle cx="${x + 44}" cy="${postersY + 44}" r="30" fill="url(#numberBadgeGradient)" />
        <text x="${x + 44}" y="${postersY + 44}" font-size="30" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">${i + 1}</text>
        <text x="${x + posterW / 2}" y="${postersY + posterH + 40}" font-size="24" font-weight="600" fill="#e5e7eb" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">${escapeXml(truncateForPoster(m.title))}</text>
        <path d="M ${x + posterW / 2 - 65} ${postersY + posterH + 78} l 5 -10 l 5 10 l 11 1.5 l -8 8 l 2 11 l -10 -5.5 l -10 5.5 l 2 -11 l -8 -8 z" fill="#fbbf24" transform="translate(-2, 0)" />
        <text x="${x + posterW / 2 + 5}" y="${postersY + posterH + 80}" font-size="26" font-weight="800" fill="#fbbf24" text-anchor="start" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">${m.rating}</text>
      `;
    })
    .join('');

  const hasArchetypeBadge = !!(archetypeId && personaCode);
  const statLabels = [
    { value: monthlyData.movies_rated_count, label: isPt ? 'Filmes\navaliados' : 'Movies\nrated' },
    { value: monthlyData.episodes_watched_count, label: isPt ? 'Episódios\nassistidos' : 'Episodes\nwatched' },
    { value: `${monthlyData.total_hours_watched}h`, label: isPt ? 'Horas\nassistidas' : 'Hours\nwatched' },
  ];
  // Sobe pra preencher o espaço do badge quando ele não existe (usuário
  // ainda sem essência cinematográfica definida) — sem isso, sobra um
  // vão vazio desproporcional entre "Insights de [mês]" e os números.
  const statsY = hasArchetypeBadge ? 760 : 660;
  const statColW = W / 3;
  const statsMarkup = statLabels
    .map((s, i) => {
      const cx = statColW * i + statColW / 2;
      const labelLines = s.label.split('\n');
      const labelTspans = labelLines
        .map((line, li) => `<tspan x="${cx}" dy="${li === 0 ? 0 : 34}">${escapeXml(line)}</tspan>`)
        .join('');
      return `
        <text x="${cx}" y="${statsY}" font-size="88" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">${s.value}</text>
        <text x="${cx}" y="${statsY + 76}" font-size="24" font-weight="600" fill="#d1d5db" text-anchor="middle" dominant-baseline="hanging" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">${labelTspans}</text>
      `;
    })
    .join('');

  const avatarSize = 200;
  const avatarCx = W / 2;
  const avatarCy = 300;
  const avatarMarkup = avatarDataUrl
    ? `<clipPath id="avatarClip"><circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarSize / 2}" /></clipPath>
       <image href="${avatarDataUrl}" x="${avatarCx - avatarSize / 2}" y="${avatarCy - avatarSize / 2}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" />`
    : `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarSize / 2}" fill="url(#avatarFallbackGradient)" />
       <text x="${avatarCx}" y="${avatarCy}" font-size="64" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">${escapeXml(profileInfo.username.charAt(0).toUpperCase())}</text>`;
  const avatarRing = `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarSize / 2 + 6}" fill="none" stroke="${color}" stroke-width="4" opacity="0.6" />`;

  const archetypeBadgeY = 560;
  let archetypeBadgeMarkup = '';
  if (hasArchetypeBadge) {
    const badgeW = 320;
    const badgeH = 90;
    const badgeX = W / 2 - badgeW / 2;
    archetypeBadgeMarkup = `
      <rect x="${badgeX}" y="${archetypeBadgeY}" width="${badgeW}" height="${badgeH}" rx="45" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" stroke-width="1.5" />
      <g transform="translate(${badgeX + 50}, ${archetypeBadgeY + badgeH / 2 - 20})">${archetypeIconMarkup}</g>
      <text x="${badgeX + 120}" y="${archetypeBadgeY + badgeH / 2}" font-size="30" font-weight="700" fill="${color}" letter-spacing="2" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">${escapeXml(personaCode)}</text>
    `;
  }

  const footerY = H - 90;
  const faviconSize = 48;
  const footerText = 'cineoracle.com';
  const footerTextWidth = footerText.length * 19;
  const footerTotalWidth = faviconSize + 16 + footerTextWidth;
  const footerStartX = W / 2 - footerTotalWidth / 2;
  const footerMarkup = `
    ${faviconDataUrl ? `<image href="${faviconDataUrl}" x="${footerStartX}" y="${footerY - faviconSize / 2}" width="${faviconSize}" height="${faviconSize}" rx="12" />` : ''}
    <text x="${footerStartX + faviconSize + 16}" y="${footerY}" font-size="32" font-weight="700" letter-spacing="3" fill="${color}" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">${escapeXml(footerText)}</text>
  `;

  const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bgTopGlow" cx="50%" cy="20%" r="55%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.27" />
      <stop offset="100%" stop-color="${color}" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="bgBase" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0a0f" />
      <stop offset="100%" stop-color="#000000" />
    </linearGradient>
    <radialGradient id="cornerGlow1" cx="100%" cy="0%" r="40%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.15" />
      <stop offset="100%" stop-color="${color}" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="cornerGlow2" cx="0%" cy="100%" r="35%">
      <stop offset="0%" stop-color="#f0abfc" stop-opacity="0.13" />
      <stop offset="100%" stop-color="#f0abfc" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="numberBadgeGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f43f5e" />
      <stop offset="100%" stop-color="#ec4899" />
    </linearGradient>
    <linearGradient id="avatarFallbackGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color}" />
      <stop offset="100%" stop-color="#ec4899" />
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bgBase)" />
  <rect width="${W}" height="${H}" fill="url(#bgTopGlow)" />
  <rect width="${W}" height="${H}" fill="url(#cornerGlow1)" />
  <rect width="${W}" height="${H}" fill="url(#cornerGlow2)" />

  <text x="${W / 2}" y="90" font-size="26" font-weight="600" letter-spacing="7" fill="#9ca3af" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">CINE ORACLE</text>

  ${avatarRing}
  ${avatarMarkup}

  <text x="${W / 2}" y="440" font-size="40" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">@${escapeXml(profileInfo.username)}</text>

  <text x="${W / 2}" y="500" font-size="26" font-weight="600" letter-spacing="4" fill="#9ca3af" text-anchor="middle" dominant-baseline="central" text-transform="uppercase" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">${isPt ? `INSIGHTS DE ${monthName.toUpperCase()}` : `${monthName.toUpperCase()} INSIGHTS`}</text>

  ${archetypeBadgeMarkup}

  ${statsMarkup}

  <text x="${W / 2}" y="970" font-size="28" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">${isPt ? 'MELHORES DO MÊS' : 'TOP OF THE MONTH'}</text>

  ${postersMarkup}

  ${genrePillsMarkup}

  ${footerMarkup}
</svg>
  `.trim();

  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.width = W;
    img.height = H;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load generated SVG'));
      img.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(img, 0, 0, W, H);

    const dataUrl = canvas.toDataURL('image/png');
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
    if (!blob) throw new Error('Failed to export canvas to PNG');

    return { dataUrl, blob };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

// ============================================================
// Componente principal — a UI normal do modal (estatísticas, pôsteres,
// gêneros) permanece exatamente como já funcionava; só a geração e
// exibição da imagem de compartilhamento foram reescritas.
// ============================================================

const MonthlyInsightsModal: React.FC<Props> = ({ isOpen, onClose, userId }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const { essencePersonality, loading: profileLoading } = useProfileData(userId, i18n.language);

  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShareCard, setShowShareCard] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const [shareImageBlob, setShareImageBlob] = useState<Blob | null>(null);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);

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
      if (shareImageUrl) URL.revokeObjectURL(shareImageUrl);
      setShareImageUrl(null);
      setShareImageBlob(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const archetypeId = essencePersonality?.personalidade_completa?.slice(0, 2);
  const subcategoryId = essencePersonality?.personalidade_completa?.slice(2, 3);
  const isLoading = loading || profileLoading;

  const fileName = `cineoracle-insights-${year}-${String(month).padStart(2, '0')}.png`;

  const handleOpenShare = async () => {
    if (!monthlyData || !profileInfo) return;
    setShowShareCard(true);
    setGeneratingPreview(true);
    try {
      const { dataUrl, blob } = await generateShareImage({
        monthlyData, profileInfo, archetypeId, subcategoryId,
        personaCode: essencePersonality?.personalidade_completa, monthName, isPt,
      });
      setShareImageUrl(dataUrl);
      setShareImageBlob(blob);
    } catch (err) {
      console.error('Error generating share image:', err);
      toast.error(isPt ? 'Não foi possível gerar a imagem.' : 'Could not generate image.');
      setShowShareCard(false);
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleShare = async () => {
    if (!shareImageBlob) return;
    setGenerating(true);
    try {
      const file = new File([shareImageBlob], fileName, { type: 'image/png' });

      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: t('home.panels.monthlyInsights', { defaultValue: 'Insights Mensais' }),
          text: isPt ? `Meus Insights de ${monthName} no CineOracle!` : `My ${monthName} Insights on CineOracle!`,
        });
        setDone(true);
      } else {
        const url = URL.createObjectURL(shareImageBlob);
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
        toast.error(isPt ? 'Não foi possível compartilhar a imagem.' : 'Could not share image.');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!shareImageBlob) return;
    try {
      const url = URL.createObjectURL(shareImageBlob);
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
                  onClick={handleOpenShare}
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

      {/* Popup de compartilhamento — a prévia mostrada aqui é literalmente
          a mesma imagem PNG que será baixada/compartilhada (mesmo
          dataUrl), não uma renderização HTML separada tentando imitar
          o resultado final. Não existe mais como prévia e resultado
          divergirem. */}
      {showShareCard && (
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

            <div className="px-4 py-5 bg-gradient-to-b from-gray-950 to-black flex items-center justify-center min-h-[300px]">
              {generatingPreview ? (
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm">{isPt ? 'Gerando imagem...' : 'Generating image...'}</p>
                </div>
              ) : shareImageUrl ? (
                <img
                  src={shareImageUrl}
                  alt="Insights preview"
                  style={{ width: 270, height: 480, objectFit: 'contain', borderRadius: 16 }}
                  className="shadow-2xl"
                />
              ) : null}
            </div>

            <div className="px-5 pb-5 pt-2 flex gap-2 border-t border-white/10 bg-gray-950/40">
              <button
                onClick={handleDownload}
                disabled={generating || generatingPreview || !shareImageBlob}
                className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                {isPt ? 'Baixar' : 'Download'}
              </button>
              <button
                onClick={handleShare}
                disabled={generating || generatingPreview || !shareImageBlob}
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

export default MonthlyInsightsModal;