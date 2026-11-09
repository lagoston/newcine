import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Film, Loader2, RefreshCw } from 'lucide-react';
import OptimizedPoster from '../OptimizedPoster';
import FloatingFriendBubbles from '../FloatingFriendBubbles';
import { PosterTopBadges, WatchlistMark } from '../PredictedBadge';
import { friendKey, useFriendActivity } from '../../hooks/useFriendActivity';
import { useReveal } from '../../hooks/useLazyList';
import { prefetchFullTitle } from '../../lib/titleCards';
import { FOCUS_RING, INK, MIST, NIGHT, PAPER, PIXEL, VELVET } from '../../lib/oracleTheme';
import type { AcervoItem, PredLabel } from '../../lib/mesa/types';
import type { AcervoShelf } from './useAcervo';
import { posterOf, titleOf } from './titles';
import { pickReason } from './reasonText';
import ReasonTag from './ReasonTag';

// A grade do Acervo (05/11/2026; v2 em 09/11/2026): a prateleira inteira,
// ordenada pela nota prevista, com o selo da nota, a Watchlist e as bolhas
// dos amigos no pôster. Na v2, embaixo de cada pôster, o título e UMA linha do
// porquê ("Você deu 9 a Interestelar · mesmo diretor") — o que o Bruno gostou
// nas cartas da Mesa, sem o resto do texto delas. Duas colunas no celular
// (a linha do porquê precisa de largura para ser lida), até seis no
// computador. A próxima página (30) é pedida quando o fim da grade chega
// perto — no contêiner que rola da AcervoLayer, não na janela.

export const GRID = 'grid grid-cols-2 min-[520px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-3 gap-y-6 sm:gap-x-4 sm:gap-y-7';
// Antecedência com que a página seguinte é pedida (≈ 2 linhas de pôsteres).
const NEAR_END_PX = 700;

export const SkeletonTile: React.FC = () => (
  <li aria-hidden>
    <span className="block aspect-[2/3] rounded-lg poster-skeleton" />
    <span className="mt-2 block h-3.5 w-4/5 rounded poster-skeleton" />
    <span className="mt-2 block h-3 w-3/5 rounded poster-skeleton" />
  </li>
);

// O selo da nota no pôster. `number` é o da gramática do site (PredictedPill,
// violeta); `guess` (de 3 a 9 notas) e `hidden` (menos de 3) ficam discretos:
// "palpite 7" e "?", sem o violeta forte.
const PredMark: React.FC<{ label: PredLabel; pred: number | null; inWatchlist: boolean }> = ({ label, pred, inWatchlist }) => {
  const { t } = useTranslation();
  if (label === 'number') return <PosterTopBadges predicted={pred} inWatchlist={inWatchlist} />;
  const quiet = 'inline-flex items-center h-[18px] px-1.5 rounded-full text-[11px] leading-none ring-1 ring-white/15 shadow';
  return (
    <>
      {label === 'guess' && pred !== null ? (
        <span className="absolute top-1.5 left-1.5 pointer-events-none">
          <span className={quiet} style={{ background: `${NIGHT}E6`, color: MIST }} aria-label={t('acervo.pred.guessAria', { n: pred })}>
            <span aria-hidden>{t('acervo.pred.guess', { n: pred })}</span>
          </span>
        </span>
      ) : label === 'hidden' ? (
        <span className="absolute top-1.5 left-1.5 pointer-events-none">
          <span className={`${quiet} justify-center w-[18px] !px-0`} style={{ ...PIXEL, background: `${NIGHT}E6`, color: MIST }} aria-label={t('acervo.pred.hiddenAria')}>
            <span aria-hidden>?</span>
          </span>
        </span>
      ) : null}
      {inWatchlist && (
        <span className="absolute top-1.5 right-1.5 pointer-events-none">
          <WatchlistMark />
        </span>
      )}
    </>
  );
};

interface AcervoGridProps {
  shelf: AcervoShelf;
  userId: string | undefined;
  // A grade é uma prateleira de um humor só (as razões que só falam do humor
  // seriam iguais em todos os pôsteres e ficam de fora).
  moodShelf: boolean;
  // O título cujo menu está abrindo (mostra o giro no pôster).
  openingKey: string | null;
  onOpen: (item: AcervoItem) => void;
  onLoadMore: () => void;
  // O contêiner que rola (a AcervoLayer): é nele que o fim da grade é vigiado.
  scrollRoot: React.RefObject<HTMLElement>;
}

const AcervoGrid: React.FC<AcervoGridProps> = ({ shelf, userId, moodShelf, openingKey, onOpen, onLoadMore, scrollRoot }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'pt';
  const reveal = useReveal();
  const endRef = useRef<HTMLLIElement>(null);

  const refs = useMemo(() => shelf.items.map((item) => ({ id: item.tmdb_id, media_type: item.media_type })), [shelf.items]);
  // As bolhas dos amigos: uma consulta por leva de 30 que chega.
  const friendActivity = useFriendActivity(userId, refs);

  // Vigia o fim da grade. O observador é refeito a cada página que chega:
  // se o fim continua perto (tela alta), a próxima página vem em seguida.
  const canLoadMore = shelf.status === 'ready' && !shelf.stale && shelf.nextOffset !== null && !shelf.loadingMore && !shelf.moreError;
  useEffect(() => {
    const target = endRef.current;
    if (!canLoadMore || !target) return;
    if (typeof IntersectionObserver === 'undefined') {
      onLoadMore();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { root: scrollRoot.current ?? null, rootMargin: `0px 0px ${NEAR_END_PX}px 0px` }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [canLoadMore, shelf.items.length, onLoadMore, scrollRoot]);

  const pendingSkeletons = shelf.loadingMore ? Math.min(12, Math.max(0, shelf.unrated - shelf.items.length)) : 0;

  return (
    <>
      <ol className={`${GRID} transition-opacity duration-200 ${shelf.stale ? 'opacity-40' : ''}`} aria-busy={shelf.stale || undefined}>
        {shelf.items.map((item) => {
          const key = `${item.media_type}:${item.tmdb_id}`;
          const name = titleOf(item, lang);
          const poster = posterOf(item, lang);
          const ref = { id: item.tmdb_id, media_type: item.media_type };
          const opening = openingKey === key;
          const reason = pickReason(item.reasons, moodShelf);
          return (
            <li key={key} ref={reveal} className="reveal-tile group relative min-w-0">
              <button
                type="button"
                onClick={() => onOpen(item)}
                onPointerEnter={() => prefetchFullTitle(ref)}
                onPointerDown={() => prefetchFullTitle(ref)}
                onFocus={() => prefetchFullTitle(ref)}
                disabled={shelf.stale}
                aria-busy={opening || undefined}
                className={`block w-full text-left rounded-lg ${FOCUS_RING}`}
              >
                <span
                  className="relative isolate block aspect-[2/3] rounded-lg overflow-hidden ring-1 ring-white/10 shadow-lg transition-transform duration-200 group-hover:-translate-y-1 motion-reduce:group-hover:translate-y-0"
                  style={{ background: VELVET }}
                >
                  {poster ? (
                    <OptimizedPoster src={`https://image.tmdb.org/t/p/w342${poster}`} alt={name} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-center" style={{ color: MIST }}>
                      <Film className="w-6 h-6" aria-hidden />
                      <span className="text-[11px] leading-snug line-clamp-3" style={{ color: PAPER }}>
                        {name}
                      </span>
                    </span>
                  )}
                  <PredMark label={shelf.predLabel} pred={item.pred} inWatchlist={item.in_watchlist} />
                  <FloatingFriendBubbles movieId={item.tmdb_id} mediaType={item.media_type} friends={friendActivity[friendKey(ref)] ?? []} placement="belowBadges" />
                  {opening && (
                    <span className="absolute inset-0 grid place-items-center bg-black/45" aria-hidden>
                      <Loader2 className="w-6 h-6 animate-spin" style={{ color: PAPER }} />
                    </span>
                  )}
                </span>
                <span className="mt-2 block text-[13px] sm:text-sm font-medium leading-snug truncate" style={{ color: PAPER }} title={name}>
                  {name}
                </span>
                {reason && <ReasonTag reason={reason} />}
              </button>
            </li>
          );
        })}
        {Array.from({ length: pendingSkeletons }, (_, i) => (
          <SkeletonTile key={`more:${i}`} />
        ))}
        {/* O marcador do fim: quando chega perto, entra a página seguinte. */}
        {shelf.nextOffset !== null && <li ref={endRef} aria-hidden className="col-span-full h-px" />}
      </ol>

      {shelf.moreError && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm" style={{ color: MIST }} role="alert">
          <span>{t('acervo.error')}</span>
          <button
            type="button"
            onClick={onLoadMore}
            className={`inline-flex items-center gap-2 h-11 px-4 rounded-xl text-sm font-semibold ring-1 ring-white/20 hover:bg-white/5 transition ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            <RefreshCw className="w-4 h-4" aria-hidden />
            {t('acervo.retry')}
          </button>
        </div>
      )}
    </>
  );
};

// O estado de erro da primeira página: uma linha e o botão.
export const AcervoErrorBox: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-4 text-sm ring-1 ring-white/10" style={{ background: VELVET, color: MIST }} role="alert">
      <span className="flex-1 min-w-[12rem]">{t('acervo.error')}</span>
      <button
        type="button"
        onClick={onRetry}
        className={`inline-flex items-center gap-2 h-11 px-4 rounded-xl text-sm font-semibold transition hover:brightness-105 ${FOCUS_RING}`}
        style={{ background: PAPER, color: INK }}
      >
        <RefreshCw className="w-4 h-4" aria-hidden />
        {t('acervo.retry')}
      </button>
    </div>
  );
};

export default AcervoGrid;
