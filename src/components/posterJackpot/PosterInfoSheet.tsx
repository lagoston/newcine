import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2, Maximize2 } from 'lucide-react';
import OracleSheet from '../OracleSheet';
import PosterArt, { EffectTag, RarityTag } from './PosterArt';
import { SerialLine } from './CollectorMark';
import TablePrizeSeal from '../poker/jackpot/TablePrizeSeal';
import { getMovieDetails, type Movie } from '../../lib/tmdb';
import { MIST, FOCUS_RING } from '../../lib/oracleTheme';
import { titleOf, type PosterEffect, type PosterItem } from '../../lib/posterJackpot';

// O menu expandido de um pôster: o pôster grande (com o efeito animado), o
// título e o ano, o número de colecionador, a raridade, o efeito e o selo de
// prêmio da mesa. Tocar no pôster abre o menu do título (sinopse, notas…).
//
// Nasceu no detalhe da coleção. 15/11/2026 (pedido do Bruno: "No modal de
// troca de pôsteres entre usuários, é necessário que de alguma forma o menu
// expandido dos pôsteres com as informações apareçam, para propiciar uma
// troca justa sem enganação"): virou peça própria e passou a abrir também
// nas trocas — ao escolher os pôsteres de uma proposta (a escolha agora é
// feita aqui dentro, depois de ver tudo) e nos dois lados de cada troca,
// inclusive nas propostas recebidas, antes de aceitar.

// O menu do título, carregado sob demanda: o MovieDetailsModal também mostra
// pôsteres do Jackpot, e assim os dois módulos não se puxam na carga.
const MovieDetailsModal = lazy(() => import('../MovieDetailsModal'));

export type InfoPoster = PosterItem & { effect: PosterEffect; tradeable?: boolean };

interface PosterInfoSheetProps {
  // null = fechado
  poster: InfoPoster | null;
  onClose: () => void;
  // uma linha curta acima do pôster ("Você recebe", "O pôster de Ana")
  caption?: React.ReactNode;
  // as ações embaixo das informações (equipar, escolher para a troca…)
  children?: React.ReactNode;
  // avisa quem está por baixo que há uma camada aberta (o Esc fecha só ela)
  onLayer?: (open: boolean) => void;
}

const PosterInfoSheet: React.FC<PosterInfoSheetProps> = ({ poster, onClose, caption, children, onLayer }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const [movie, setMovie] = useState<Movie | null>(null);
  const [loadingMovie, setLoadingMovie] = useState(false);
  // o último pôster aberto fica na gaveta enquanto ela sai (sem piscar vazia)
  const last = useRef<InfoPoster | null>(poster);
  if (poster) last.current = poster;
  const shown = poster ?? last.current;

  // Só avisa quando a própria gaveta abre ou fecha: num lugar com várias
  // (os cartões das trocas), uma que monta fechada não pode dizer "nenhuma
  // camada aberta" enquanto outra está aberta.
  const reported = useRef(false);
  useEffect(() => {
    const isOpen = !!poster;
    if (isOpen === reported.current) return;
    reported.current = isOpen;
    onLayer?.(isOpen);
  }, [poster, onLayer]);
  useEffect(
    () => () => {
      if (!reported.current) return;
      reported.current = false;
      onLayer?.(false);
    },
    [onLayer],
  );

  const openTitle = async (item: InfoPoster) => {
    if (loadingMovie) return;
    setLoadingMovie(true);
    try {
      setMovie(await getMovieDetails(item.tmdb_id, item.media_type));
    } catch (error) {
      console.error('Poster info open title:', error);
      toast.error(t('common.error'));
    } finally {
      setLoadingMovie(false);
    }
  };

  return (
    <>
      <OracleSheet
        open={!!poster}
        onClose={onClose}
        title={shown ? titleOf(shown, isPt) : ''}
        subtitle={shown?.year ? String(shown.year) : undefined}
        size="md"
        zIndexClass="z-[10005]"
        escapeEnabled={!movie}
      >
        {shown && (
          <div className="text-center">
            {caption && (
              <p className="-mt-1 mb-3 text-[12.5px] font-semibold" style={{ color: '#FFE8A3' }}>
                {caption}
              </p>
            )}
            <button
              type="button"
              onClick={() => openTitle(shown)}
              aria-label={t('jackpot.collection.openTitle', { title: titleOf(shown, isPt) })}
              className={`group relative mx-auto block w-44 sm:w-52 rounded-2xl transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98] ${FOCUS_RING}`}
            >
              {/* 04/11/2026: o w342 da grade (já no cache) fica por baixo
                  enquanto o w500 carrega — o detalhe abria com o quadro vazio
                  e o pôster "pipocava" depois. */}
              <PosterArt
                filePath={shown.file_path}
                effect={shown.effect}
                alt=""
                size="w500"
                placeholderSize="w342"
                loading="eager"
                className="aspect-[2/3] rounded-2xl shadow-[0_22px_44px_-20px_rgba(0,0,0,0.95)]"
                mark={{ rarity: shown.rarity, serial: shown.serial, size: 'md' }}
              />
              <span
                aria-hidden
                className="absolute top-2 right-2 z-10 grid place-items-center w-8 h-8 rounded-full text-white transition-transform duration-200 group-hover:scale-110"
                style={{ background: 'rgba(10,14,44,0.78)', boxShadow: 'inset 0 0 0 1px rgba(255,232,163,0.4), 0 6px 14px -6px rgba(0,0,0,0.8)' }}
              >
                {loadingMovie ? <Loader2 className="w-4 h-4 animate-spin" /> : <Maximize2 className="w-4 h-4" />}
              </span>
            </button>
            <p className="mt-2 text-[11.5px]" style={{ color: MIST }}>{t('jackpot.collection.openHint')}</p>
            <SerialLine rarity={shown.rarity} serial={shown.serial} gem={false} className="mt-3 text-[15px]" />
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
              <RarityTag rarity={shown.rarity} />
              <EffectTag effect={shown.effect} />
              {shown.tradeable === false && <TablePrizeSeal />}
            </div>
            {shown.tradeable === false && (
              <p className="mt-1.5 text-[12px]" style={{ color: MIST }}>
                {t('pokerEntry.trades.sealHint')}
              </p>
            )}
            {children}
          </div>
        )}
      </OracleSheet>

      {movie && (
        <Suspense fallback={null}>
          <MovieDetailsModal movie={movie} isOpen onClose={() => setMovie(null)} zIndexClass="z-[10010]" />
        </Suspense>
      )}
    </>
  );
};

export default PosterInfoSheet;
