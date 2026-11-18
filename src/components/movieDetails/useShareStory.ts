import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { shareImageFile } from '../../lib/shareImage';
import { useEvent } from '../../hooks/useEvent';

// "Story": monta a imagem 1080×1920 (o fundo da nota, o pôster e o título) e
// entrega para compartilhar. Usado só pelas ações rápidas (TitleQuickActions).
export function useShareStory(movieId: number, title: string, posterPath: string | null | undefined, userId: string | null) {
  const { t } = useTranslation();
  const [isSharing, setIsSharing] = useState(false);

  const share = useEvent(async () => {
    if (!userId || isSharing) return;

    setIsSharing(true);

    try {
      // Obter a nota do usuário
      const { data: userMovie, error: ratingError } = await supabase
        .from('user_movies')
        .select('rating')
        .eq('user_id', userId)
        .eq('movie_id', movieId)
        .maybeSingle();

      if (ratingError) throw ratingError;

      const userRating = userMovie?.rating !== undefined ? userMovie.rating : null;

      // Criar canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      canvas.width = 1080;
      canvas.height = 1920;

      // Carregar fundo baseado na nota
      let backgroundPath = '/assets/cinequero.webp';
      if (userRating !== null) {
        backgroundPath = `/assets/cine${Math.round(userRating)}.webp`;
      }

      const background = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = backgroundPath;
      });

      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

      // Carregar e desenhar poster do filme (CENTRALIZADO)
      if (posterPath) {
        try {
          const posterUrl = `https://image.tmdb.org/t/p/w500${posterPath}`;
          const response = await fetch(posterUrl, { cache: 'no-store' });
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);

          const posterImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = blobUrl;
          });

          // Poster CENTRALIZADO e maior
          const posterWidth = 450;
          const posterHeight = 675;
          const posterX = (canvas.width - posterWidth) / 2;
          const posterY = 550;

          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 10;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(posterImg, posterX, posterY, posterWidth, posterHeight);

          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;

          URL.revokeObjectURL(blobUrl);
        } catch (error) {
          console.error('Erro ao carregar poster:', error);
        }
      }

      // Desenhar título do filme (ABAIXO DO POSTER, centralizado)
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 52px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const titleY = 1280;
      const maxWidth = 900;

      // Quebrar título em linhas
      const words = title.split(' ');
      let line = '';
      let currentY = titleY;

      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line.trim(), canvas.width / 2, currentY);
          line = words[i] + ' ';
          currentY += 65;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim(), canvas.width / 2, currentY);

      // Compartilhar via lib/shareImage (13/10/2026): no app Android abre a
      // folha de compartilhar do sistema (antes o download não fazia nada
      // lá); no navegador, Web Share com o arquivo ou download.
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        toast.error('Erro ao gerar imagem');
        return;
      }
      const route = await shareImageFile(blob, 'cine-oracle-story.png', {
        title: `${title} - Cine Oracle`,
        text: userRating !== null ? `Assisti ${title} e dei nota ${userRating}/10! 🎬` : `Assisti ${title}! 🎬`,
        dialogTitle: t('movieModal.shareStory'),
      });
      if (route === 'download') toast.success('Imagem baixada! Compartilhe no Instagram Stories.');
      else if (route !== 'cancelled') toast.success('Compartilhado com sucesso!');
    } catch (error) {
      console.error('Error sharing to Instagram:', error);
      toast.error('Erro ao compartilhar. Tente novamente.');
    } finally {
      setIsSharing(false);
    }
  });

  return { isSharing, share };
}
