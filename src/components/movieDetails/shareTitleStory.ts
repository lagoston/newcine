import type { TFunction } from 'i18next';
import { supabase } from '../../lib/supabase';
import { fetchMyProfile } from '../../lib/data';
import { getFrameClass } from '../../lib/frames';
import { loadEquippedPosters, posterKey, posterUrl } from '../../lib/posterJackpot';
import { tmdbImage } from '../../lib/tmdbImage';
import { shareImageFile, type ShareImageRoute } from '../../lib/shareImage';
import { formatStoryRating, renderTitleStory, titleStoryFileName, type TitleStoryCopy, type TitleStoryInput, type TitleStoryState } from '../../lib/titleStory';
import { RATING_LABELS } from '../RatingSliderSheet';
import { fetchTitleMe } from './useTitleMe';

// O que o toque no botão "Story" do menu de um título faz (22/11/2026): busca
// o que a pessoa tem com o título, monta a imagem (lib/titleStory) e entrega
// para compartilhar (lib/shareImage).
//
// Este arquivo e o desenho são baixados SÓ no toque: o useShareStory os pede
// por import(). Medido com o esbuild: com as buscas dentro do hook, o pedaço do
// menu do título (TitleLayer) crescia ~0,9 KB; assim ele fica ~1,6 KB MENOR do
// que era (o hook antigo levava o desenho do canvas dentro dele).
//
// O que é buscado, tudo ao mesmo tempo:
//   • a nota: a MESMA resposta que o menu aberto já tem (fetchTitleMe, guardada
//     por 2 minutos), então quase nunca vai ao banco. Antes a consulta era por
//     movie_id sem o tipo: um filme e uma série com o mesmo número no TMDB se
//     confundiam;
//   • a resenha da própria pessoa para o título (tabela reviews);
//   • o @, a foto e a moldura (a linha do próprio perfil, já guardada);
//   • o pôster que ela equipou no Poster Jackpot para este título, com o
//     efeito e a marca de colecionador.

export interface ShareStoryTitle {
  id: number;
  title: string;
  posterPath: string | null | undefined;
  mediaType: 'movie' | 'tv';
  // "2019-05-30" (filme: release_date; série: first_air_date)
  releaseDate?: string | null;
}

interface ReviewRow {
  title: string | null;
  content: string | null;
  has_spoilers: boolean | null;
}

// A resenha da própria pessoa. Falhou = sem resenha (registrado): o story da
// nota ainda vale.
async function loadMyReview(userId: string, movieId: number, mediaType: 'movie' | 'tv'): Promise<ReviewRow | null> {
  const { data, error } = await supabase
    .from('reviews')
    .select('title, content, has_spoilers')
    .eq('user_id', userId)
    .eq('movie_id', movieId)
    .eq('media_type', mediaType)
    .maybeSingle();
  if (error) {
    console.error('share story: review', error);
    return null;
  }
  return (data as ReviewRow | null) ?? null;
}

// O nome que a nota tem na biblioteca ("Obra-Prima", "Bom"…): o mesmo do
// seletor de nota. Nota quebrada (7,5, de importações antigas) usa o da nota
// arredondada, como os fundos antigos faziam.
const ratingName = (rating: number, language: string): string => {
  const label = RATING_LABELS[Math.round(rating)];
  if (!label) return '';
  return language.toLowerCase().startsWith('pt') ? label.pt : label.en;
};

// Os textos do desenho, no idioma do site. `hasReview`: a pessoa escreveu
// sobre o título (muda o que vai embaixo do @ quando não há nota).
export function titleStoryCopy(
  t: TFunction,
  language: string,
  opts: { state: TitleStoryState; rating: number | null; mediaType: 'movie' | 'tv'; year: string | null; hasReview: boolean },
): TitleStoryCopy {
  const kind = opts.mediaType === 'tv' ? 'tv' : 'movie';
  return {
    meta: opts.year ? t(`movieModal.story.${kind}Year`, { year: opts.year }) : t(`feed.${kind}`),
    ratingName: opts.state === 'rated' && opts.rating !== null ? ratingName(opts.rating, language) : '',
    onWatchlist: t('feed.onWatchlist'),
    // as mesmas palavras do story do Feed dos Amigos
    action:
      opts.state === 'rated'
        ? t('feed.kind.rate')
        : opts.state === 'watchlist'
          ? t('feed.kind.watchlist')
          : opts.hasReview
            ? t('movieModal.story.reviewed')
            : t('movieModal.story.shared'),
    more: t('movieModal.story.more'),
    spoilerTitle: t('movieModal.story.spoilerTitle'),
    spoilerHint: t('movieModal.story.spoilerHint'),
  };
}

// Busca, desenha e compartilha. Devolve o caminho que a imagem tomou (a folha
// do sistema, o Web Share, o download, ou 'cancelled'). Lança erro quando não
// deu para montar: quem chama mostra o aviso.
export async function shareTitleStory(opts: {
  title: ShareStoryTitle;
  userId: string;
  // as molduras Premium só valem para quem é Premium (getFrameClass)
  isPremium: boolean;
  language: string;
  t: TFunction;
}): Promise<ShareImageRoute> {
  const { title, userId, language, t } = opts;
  const { id, mediaType } = title;
  const [me, review, profile, equippedMap] = await Promise.all([
    fetchTitleMe(userId, id, mediaType),
    loadMyReview(userId, id, mediaType),
    // sem o perfil o story sai sem o @ (a marca vai para o centro do pé)
    fetchMyProfile(userId).catch(() => null),
    loadEquippedPosters(userId),
  ]);
  // null = a leitura falhou: sem saber a nota não há o que desenhar
  if (!me) throw new Error('title relation unavailable');

  const rawRating = me.relation?.rating;
  const rating = rawRating === null || rawRating === undefined || Number.isNaN(Number(rawRating)) ? null : Number(rawRating);
  const state: TitleStoryState = !me.relation ? 'none' : rating === null ? 'watchlist' : 'rated';
  const equipped = equippedMap.get(posterKey(mediaType, id)) ?? null;
  const text = (review?.content || '').trim();
  const reviewTitle = (review?.title || '').trim();
  const spoiler = Boolean(review?.has_spoilers);
  const hasReview = Boolean(review && (text || reviewTitle));

  const input: TitleStoryInput = {
    title: title.title,
    state,
    rating,
    // w780: o pôster chega a ~600 px de largura na imagem
    posterUrl: equipped ? posterUrl(equipped.file_path, 'w780') : title.posterPath ? tmdbImage(title.posterPath, 'w780') : null,
    equipped: equipped ? { effect: equipped.effect, rarity: equipped.rarity, serial: equipped.serial } : null,
    // Resenha com spoiler: o texto nem sai daqui (a imagem é pública). O
    // desenho mostra o título dela, um mosaico e o aviso.
    review: hasReview ? { title: reviewTitle || null, text: spoiler ? '' : text, spoiler } : null,
    owner: profile?.username
      ? { username: profile.username, avatarUrl: profile.avatar_url, frameClass: getFrameClass(profile.avatar_frame || undefined, opts.isPremium) }
      : null,
    language,
    copy: titleStoryCopy(t, language, { state, rating, mediaType, year: title.releaseDate?.slice(0, 4) || null, hasReview }),
  };

  const blob = await renderTitleStory(input);
  // lib/shareImage (13/10/2026): no app abre a folha de compartilhar do
  // sistema; no navegador, Web Share com o arquivo ou download.
  return shareImageFile(blob, titleStoryFileName(title.title), {
    title: t('movieModal.story.shareTitle', { title: title.title }),
    text:
      state === 'rated' && rating !== null
        ? t('movieModal.story.textRated', { title: title.title, rating: formatStoryRating(rating, language) })
        : state === 'watchlist'
          ? t('movieModal.story.textWatchlist', { title: title.title })
          : t('movieModal.story.textPlain', { title: title.title }),
    dialogTitle: t('movieModal.shareStory'),
  });
}
