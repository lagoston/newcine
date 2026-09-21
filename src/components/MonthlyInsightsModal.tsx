import React, { useState, useEffect } from 'react';
import { X, Loader2, Star, Film, Download, Share2, Check, Instagram } from 'lucide-react';
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
// GERAÇÃO DA IMAGEM DE COMPARTILHAMENTO — segunda reescrita.
//
// A primeira tentativa (html2canvas) tinha um bug documentado e nunca
// corrigido de alinhamento vertical de texto. A segunda tentativa
// (montar tudo como um SVG único e converter pra canvas via um só
// Image.src) resolveu o alinhamento mas os pôsteres continuaram sem
// aparecer em produção.
//
// Esta versão segue exatamente o padrão que já funciona comprovadamente
// no próprio site (o botão de compartilhar no Instagram dentro dos
// detalhes de um filme, em MovieDetailsModal.tsx): desenhar TUDO
// direto num <canvas> nativo com a Canvas API (ctx.fillText,
// ctx.drawImage, ctx.arc...), sem nenhuma camada intermediária de
// HTML, CSS ou SVG tentando ser "fotografada" ou "convertida". Cada
// pôster é baixado (fetch → blob → blob URL → Image) e desenhado
// individualmente com ctx.drawImage — o mesmo mecanismo, chamado uma
// vez por imagem, que já é usado com sucesso em produção.
// ============================================================

interface ImageLoadResult {
  img: HTMLImageElement | null;
  // Diagnóstico temporário: depois de duas tentativas anteriores que
  // falhavam silenciosamente (retornando só null), preciso saber o
  // motivo EXATO da falha real no ambiente do usuário, não continuar
  // supondo. Isso é desenhado diretamente no lugar do pôster na imagem
  // gerada, pra dar um dado concreto de diagnóstico sem depender de
  // acesso ao console do navegador.
  error?: string;
}

// Carrega uma imagem de uma URL remota — mesmo padrão exato já usado
// com sucesso em MovieDetailsModal.tsx: fetch → blob → blob URL local
// → Image(). Uma vez que a imagem virou um blob local, desenhar ela no
// canvas com drawImage nunca esbarra em CORS (blob: é sempre
// same-origin pro navegador). Falha em UMA imagem não derruba a
// geração inteira — o layout simplesmente pula aquele desenho
// específico e mostra o motivo da falha em texto, no lugar da imagem.
async function loadImageFromUrl(url: string): Promise<ImageLoadResult> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return { img: null, error: `HTTP ${response.status}` };
    }
    const blob = await response.blob();
    if (blob.size === 0) {
      return { img: null, error: 'blob vazio' };
    }
    const blobUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Image decode failed'));
        image.src = blobUrl;
      });
      return { img };
    } catch (decodeErr: any) {
      return { img: null, error: `decode: ${decodeErr?.message || 'falha'}` };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch (fetchErr: any) {
    // Aqui é onde apareceria um bloqueio de CSP/connect-src, uma falha
    // de rede real, ou qualquer outra causa — o nome e a mensagem do
    // erro do próprio navegador dizem exatamente qual é.
    return { img: null, error: `${fetchErr?.name || 'Error'}: ${fetchErr?.message || 'falha desconhecida'}` };
  }
}

// ctx.roundRect() só chegou em navegadores mais recentes (Safari
// incluiu tarde) — um path manual via arcTo funciona em qualquer
// versão, sem depender de feature detection silenciosa.
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncateForPoster(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated.trimEnd() + '…';
}

const ALSO_RATED_FONT = '500 22px Arial, sans-serif';
const ALSO_RATED_RATING_FONT = 'bold 22px Arial, sans-serif';

// Desenha "Título ★ Nota" em fluxo (como texto corrido, quebrando linha
// pela largura disponível) dentro de uma área de altura FIXA — a
// quantidade de filmes em "também avaliou" varia muito de usuário pra
// usuário (de 0 a dezenas), e sem um limite rígido de altura a imagem
// cresceria sem controle ou os itens se sobreporiam a tudo que vem
// depois (rodapé). Assim que o espaço disponível se esgota, para de
// desenhar e mostra "+N filmes" com quantos ficaram de fora, em vez de
// arriscar quebrar o layout.
function drawAlsoRatedFlow(
  ctx: CanvasRenderingContext2D,
  movies: OtherMovie[],
  areaX: number,
  areaY: number,
  areaWidth: number,
  areaHeight: number,
  lineHeight: number,
  isPt: boolean
) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const itemGap = 26;
  const starGap = 6;
  const maxY = areaY + areaHeight;

  let x = areaX;
  let y = areaY + lineHeight / 2;
  let drawnCount = 0;

  for (let i = 0; i < movies.length; i++) {
    const m = movies[i];
    ctx.font = ALSO_RATED_FONT;
    const titleWidth = ctx.measureText(m.title).width;
    const starWidth = ctx.measureText('★').width;
    ctx.font = ALSO_RATED_RATING_FONT;
    const ratingWidth = ctx.measureText(String(m.rating)).width;
    const itemWidth = titleWidth + starGap + starWidth + starGap + ratingWidth;

    if (x !== areaX && x + itemWidth > areaX + areaWidth) {
      x = areaX;
      y += lineHeight;
    }

    if (y + lineHeight / 2 > maxY) {
      const remaining = movies.length - drawnCount;
      if (remaining > 0) {
        ctx.font = '600 22px Arial, sans-serif';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText(isPt ? `+${remaining} filme${remaining > 1 ? 's' : ''}` : `+${remaining} more`, areaX, y);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      return;
    }

    ctx.font = ALSO_RATED_FONT;
    ctx.fillStyle = '#d1d5db';
    ctx.fillText(m.title, x, y);
    x += titleWidth + starGap;

    ctx.fillStyle = '#fbbf24';
    ctx.fillText('★', x, y);
    x += starWidth + starGap;

    ctx.font = ALSO_RATED_RATING_FONT;
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText(String(m.rating), x, y);
    x += ratingWidth + itemGap;

    drawnCount++;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
}

interface GenerateImageParams {
  monthlyData: MonthlyData;
  profileInfo: ProfileInfo;
  monthName: string;
  isPt: boolean;
}

async function generateShareImage(params: GenerateImageParams): Promise<{ dataUrl: string; blob: Blob }> {
  const { monthlyData, profileInfo, monthName, isPt } = params;
  const color = '#a855f7';
  const topMovies = monthlyData.top_movies.slice(0, 3);

  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  // Carrega tudo que precisa de rede em paralelo antes de desenhar
  // qualquer coisa — cada uma pode falhar independentemente sem travar
  // as outras. O badge de essência cinematográfica (ícone + 3 letras)
  // foi removido — não tinha função nenhuma nesta imagem, só ocupava
  // espaço, então o ícone do arquétipo não precisa mais ser carregado.
  const [avatarResult, faviconResult, ...posterResults] = await Promise.all([
    profileInfo.avatar_url ? loadImageFromUrl(profileInfo.avatar_url) : Promise.resolve<ImageLoadResult>({ img: null }),
    loadImageFromUrl(SITE_ICON_URL),
    ...topMovies.map((m) => loadImageFromUrl(`https://image.tmdb.org/t/p/w500${m.poster_path}`)),
  ]);
  const avatarImg = avatarResult.img;
  const faviconImg = faviconResult.img;
  if (avatarResult.error) console.error('[Insights] avatar não carregou:', avatarResult.error);
  if (faviconResult.error) console.error('[Insights] favicon não carregou:', faviconResult.error);
  posterResults.forEach((r, i) => {
    if (r.error) console.error(`[Insights] pôster ${i + 1} (${topMovies[i]?.title}) não carregou:`, r.error);
  });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Fundo
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#0a0a0f');
  bgGrad.addColorStop(1, '#000000');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const topGlow = ctx.createRadialGradient(W / 2, H * 0.2, 0, W / 2, H * 0.2, W * 0.55);
  topGlow.addColorStop(0, 'rgba(168,85,247,0.27)');
  topGlow.addColorStop(1, 'rgba(168,85,247,0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, W, H);

  const cornerGlow1 = ctx.createRadialGradient(W, 0, 0, W, 0, W * 0.4);
  cornerGlow1.addColorStop(0, 'rgba(168,85,247,0.15)');
  cornerGlow1.addColorStop(1, 'rgba(168,85,247,0)');
  ctx.fillStyle = cornerGlow1;
  ctx.fillRect(0, 0, W, H);

  const cornerGlow2 = ctx.createRadialGradient(0, H, 0, 0, H, W * 0.35);
  cornerGlow2.addColorStop(0, 'rgba(240,171,252,0.13)');
  cornerGlow2.addColorStop(1, 'rgba(240,171,252,0)');
  ctx.fillStyle = cornerGlow2;
  ctx.fillRect(0, 0, W, H);

  // "CINE ORACLE"
  ctx.fillStyle = '#9ca3af';
  ctx.font = '600 26px Arial, sans-serif';
  ctx.fillText('C I N E   O R A C L E', W / 2, 80);

  // Avatar circular
  const avatarCx = W / 2;
  const avatarCy = 250;
  const avatarR = 90;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatarImg) {
    // cover: escala a imagem pra preencher o círculo sem distorcer
    const scale = Math.max((avatarR * 2) / avatarImg.width, (avatarR * 2) / avatarImg.height);
    const drawW = avatarImg.width * scale;
    const drawH = avatarImg.height * scale;
    ctx.drawImage(avatarImg, avatarCx - drawW / 2, avatarCy - drawH / 2, drawW, drawH);
  } else {
    const avatarGrad = ctx.createLinearGradient(avatarCx - avatarR, avatarCy - avatarR, avatarCx + avatarR, avatarCy + avatarR);
    avatarGrad.addColorStop(0, color);
    avatarGrad.addColorStop(1, '#ec4899');
    ctx.fillStyle = avatarGrad;
    ctx.fillRect(avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 58px Arial, sans-serif';
    ctx.fillText(profileInfo.username.charAt(0).toUpperCase(), avatarCx, avatarCy);
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(avatarCx, avatarCy, avatarR + 6, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // @username
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.fillText(`@${profileInfo.username}`, W / 2, 385);

  // "INSIGHTS DE [MÊS]" — é a frase que dá sentido a toda a imagem,
  // então precisa ser o elemento mais chamativo da parte de cima:
  // fonte grande, gradiente roxo-rosa (a mesma identidade visual do
  // recurso), leve brilho e uma linha decorativa reforçando embaixo —
  // bem diferente do texto cinza pequeno de antes.
  const insightsLabel = isPt ? `Insights de ${monthName}` : `${monthName} Insights`;
  let insightsFontSize = 56;
  ctx.font = `800 ${insightsFontSize}px Arial, sans-serif`;
  const maxInsightsWidth = W - 120;
  while (ctx.measureText(insightsLabel).width > maxInsightsWidth && insightsFontSize > 34) {
    insightsFontSize -= 2;
    ctx.font = `800 ${insightsFontSize}px Arial, sans-serif`;
  }
  const insightsY = 460;
  const insightsGrad = ctx.createLinearGradient(W / 2 - 260, insightsY, W / 2 + 260, insightsY);
  insightsGrad.addColorStop(0, '#c084fc');
  insightsGrad.addColorStop(0.5, '#e879f9');
  insightsGrad.addColorStop(1, '#f472b6');
  ctx.save();
  ctx.shadowColor = 'rgba(232,121,249,0.5)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = insightsGrad;
  ctx.fillText(insightsLabel, W / 2, insightsY);
  ctx.restore();

  // linha decorativa reforçando o título
  const underlineGrad = ctx.createLinearGradient(W / 2 - 90, 0, W / 2 + 90, 0);
  underlineGrad.addColorStop(0, 'rgba(192,132,252,0)');
  underlineGrad.addColorStop(0.5, 'rgba(232,121,249,0.9)');
  underlineGrad.addColorStop(1, 'rgba(244,114,182,0)');
  ctx.fillStyle = underlineGrad;
  ctx.fillRect(W / 2 - 90, insightsY + 40, 180, 4);

  // Estatísticas
  const statLabels = [
    { value: String(monthlyData.movies_rated_count), label: isPt ? ['Filmes', 'avaliados'] : ['Movies', 'rated'] },
    { value: String(monthlyData.episodes_watched_count), label: isPt ? ['Episódios', 'assistidos'] : ['Episodes', 'watched'] },
    { value: `${monthlyData.total_hours_watched}h`, label: isPt ? ['Horas', 'assistidas'] : ['Hours', 'watched'] },
  ];
  const statsY = 610;
  const statColW = W / 3;
  statLabels.forEach((s, i) => {
    const cx = statColW * i + statColW / 2;
    ctx.fillStyle = '#fff';
    ctx.font = '900 82px Arial, sans-serif';
    ctx.fillText(s.value, cx, statsY);
    ctx.fillStyle = '#d1d5db';
    ctx.font = '600 23px Arial, sans-serif';
    s.label.forEach((line, li) => {
      ctx.fillText(line, cx, statsY + 72 + li * 32);
    });
  });

  // "MELHORES DO MÊS"
  const topOfMonthY = 790;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.fillText(isPt ? 'MELHORES DO MÊS' : 'TOP OF THE MONTH', W / 2, topOfMonthY);

  // Pôsteres
  const posterW = 290;
  const posterH = 420;
  const posterGap = 35;
  const postersStartX = (W - (posterW * 3 + posterGap * 2)) / 2;
  const postersY = 850;

  topMovies.forEach((m, i) => {
    const x = postersStartX + i * (posterW + posterGap);
    const posterResult = posterResults[i];
    const posterImg = posterResult?.img;

    roundRectPath(ctx, x, postersY, posterW, posterH, 20);
    if (posterImg) {
      ctx.save();
      ctx.clip();
      const scale = Math.max(posterW / posterImg.width, posterH / posterImg.height);
      const drawW = posterImg.width * scale;
      const drawH = posterImg.height * scale;
      const drawX = x + (posterW - drawW) / 2;
      const drawY = postersY + (posterH - drawH) / 2;
      ctx.drawImage(posterImg, drawX, drawY, drawW, drawH);
      ctx.restore();
    } else {
      ctx.fillStyle = '#1f2937';
      ctx.fill();
    }

    roundRectPath(ctx, x, postersY, posterW, posterH, 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Selo numerado
    ctx.beginPath();
    ctx.arc(x + 42, postersY + 42, 28, 0, Math.PI * 2);
    const numberGrad = ctx.createLinearGradient(x + 14, postersY + 14, x + 70, postersY + 70);
    numberGrad.addColorStop(0, '#f43f5e');
    numberGrad.addColorStop(1, '#ec4899');
    ctx.fillStyle = numberGrad;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.fillText(String(i + 1), x + 42, postersY + 42);

    // Título (truncado se necessário) + estrela e nota
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '600 23px Arial, sans-serif';
    const displayTitle = truncateForPoster(ctx, m.title, posterW - 10);
    ctx.fillText(displayTitle, x + posterW / 2, postersY + posterH + 38);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 25px Arial, sans-serif';
    ctx.fillText('★', x + posterW / 2 - 5, postersY + posterH + 76);
    ctx.textAlign = 'left';
    ctx.fillText(String(m.rating), x + posterW / 2 + 5, postersY + posterH + 76);
    ctx.textAlign = 'center';
  });

  // "GÊNEROS DO MÊS" — título próprio, deixando claro que esses gêneros
  // resumem o mês inteiro e não têm relação direta com os 3 pôsteres
  // logo acima (antes, sem nenhum título, dava a entender que cada
  // gênero correspondia a um dos 3 filmes).
  const genreTitleY = postersY + posterH + 130;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillText(isPt ? 'GÊNEROS DO MÊS' : 'GENRES OF THE MONTH', W / 2, genreTitleY);

  // Pills de gênero — centralizadas como bloco (soma as larguras antes
  // de desenhar, em vez de começar sempre numa margem esquerda fixa),
  // pra ficarem visualmente equilibradas independente de quantos
  // gêneros e de que tamanho os nomes forem.
  const genreY = genreTitleY + 45;
  const genrePillHeight = 62;
  ctx.font = 'bold 27px Arial, sans-serif';
  const genresToShow = monthlyData.top_genres.slice(0, 4);
  const genrePillWidths = genresToShow.map((g) => ctx.measureText(g.name).width + 64);
  const genreGap = 18;
  const totalGenreWidth = genrePillWidths.reduce((a, b) => a + b, 0) + genreGap * (genresToShow.length - 1);
  let genreX = (W - totalGenreWidth) / 2;
  genresToShow.forEach((g, i) => {
    const pillWidth = genrePillWidths[i];
    roundRectPath(ctx, genreX, genreY, pillWidth, genrePillHeight, genrePillHeight / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.strokeStyle = `${color}50`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText(g.name, genreX + pillWidth / 2, genreY + genrePillHeight / 2);
    genreX += pillWidth + genreGap;
  });

  // "TAMBÉM AVALIOU" — lista os demais filmes do mês num fluxo de texto
  // (título ★ nota, quebrando linha conforme a largura), respeitando um
  // limite rígido de altura disponível: a quantidade de itens pode
  // variar muito (de 0 a dezenas), então em vez de deixar a imagem
  // crescer ou os itens se sobrepuserem, o desenho para assim que o
  // espaço reservado se esgota e mostra "+N filmes" com o restante.
  const alsoRatedTitleY = genreY + genrePillHeight + 65;
  const footerY = H - 70;
  const alsoRatedAreaBottom = footerY - 70;

  if (monthlyData.other_movies.length > 0 && alsoRatedTitleY < alsoRatedAreaBottom - 40) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.fillText(isPt ? 'TAMBÉM AVALIOU' : 'ALSO RATED', W / 2, alsoRatedTitleY);

    drawAlsoRatedFlow(
      ctx,
      monthlyData.other_movies,
      90,
      alsoRatedTitleY + 50,
      W - 180,
      alsoRatedAreaBottom - (alsoRatedTitleY + 50),
      42,
      isPt
    );
  }

  // Rodapé
  const faviconSize = 44;
  const footerText = 'cineoracle.com';
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px Arial, sans-serif';
  const footerTextWidth = ctx.measureText(footerText).width;
  const footerTotalWidth = (faviconImg ? faviconSize + 14 : 0) + footerTextWidth;
  let footerX = W / 2 - footerTotalWidth / 2;

  if (faviconImg) {
    roundRectPath(ctx, footerX, footerY - faviconSize / 2, faviconSize, faviconSize, 11);
    ctx.save();
    ctx.clip();
    ctx.drawImage(faviconImg, footerX, footerY - faviconSize / 2, faviconSize, faviconSize);
    ctx.restore();
    footerX += faviconSize + 14;
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  ctx.fillText(footerText, footerX, footerY);

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  if (!blob) throw new Error('Failed to export canvas to PNG');

  return { dataUrl, blob };
}

// ============================================================
// Componente principal — a UI normal do modal permanece igual; só a
// geração e exibição da imagem de compartilhamento mudou.
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
      setShareImageUrl(null);
      setShareImageBlob(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isLoading = loading || profileLoading;

  const fileName = `cineoracle-insights-${year}-${String(month).padStart(2, '0')}.png`;

  const handleOpenShare = async () => {
    if (!monthlyData || !profileInfo) return;
    setShowShareCard(true);
    setGeneratingPreview(true);
    try {
      const { dataUrl, blob } = await generateShareImage({
        monthlyData, profileInfo, monthName, isPt,
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