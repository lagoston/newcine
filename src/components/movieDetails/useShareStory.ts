import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { useEvent } from '../../hooks/useEvent';
import type { ShareStoryTitle } from './shareTitleStory';

// O botão "Story" do menu de um título (TitleQuickActions): a imagem
// 1080×1920 da pessoa com o título, para compartilhar nos stories.
//
// 22/11/2026 (pedido do Bruno): a imagem era montada aqui mesmo, em cima de
// onze fundos prontos por nota (public/assets/cineN.webp e cinequero.webp, com
// a logo antiga), só com o pôster e o título em Arial; sem a resenha, sem o @ e
// sem o pôster equipado. Agora o desenho mora em lib/titleStory.ts (a mesma
// família dos stories da Conexão e do estúdio) e as buscas em
// ./shareTitleStory. Os arquivos cineN.webp continuam em public/assets: o site
// antigo em cache e o APK antigo ainda os pedem.
//
// Aqui fica só a casca: o toque, o "carregando" e os avisos. Tudo o mais é
// baixado no toque, por import(): o pedaço do menu do título não cresce (ficou
// menor do que era).
export function useShareStory(title: ShareStoryTitle, userId: string | null) {
  const { t, i18n } = useTranslation();
  const { isPremium } = useAuth();
  const [isSharing, setIsSharing] = useState(false);

  const share = useEvent(async () => {
    if (!userId || isSharing) return;
    setIsSharing(true);
    try {
      const { shareTitleStory } = await import('./shareTitleStory');
      const route = await shareTitleStory({ title, userId, isPremium, language: i18n.language, t });
      if (route === 'download') toast.success(t('movieModal.story.downloaded'));
      else if (route !== 'cancelled') toast.success(t('movieModal.story.sharedToast'));
    } catch (error) {
      console.error('Error sharing story:', error);
      toast.error(t('movieModal.story.error'));
    } finally {
      setIsSharing(false);
    }
  });

  return { isSharing, share };
}
