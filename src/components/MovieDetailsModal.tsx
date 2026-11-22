import React, { useState, useEffect, useId, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X, ChevronRight } from 'lucide-react';
import { Movie, getMovieDetailsFromDB } from '../lib/tmdb';
import { useAuth } from '../lib/auth';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useOpenedOnce } from '../hooks/useOpenedOnce';
import { useEvent } from '../hooks/useEvent';
import { LayerScope, useLayerEntry, zFromClass } from '../overlays';
import RecommendModal from './RecommendModal';
import ReviewsModal from './ReviewsModal';
import QuickAddMenu from './QuickAddMenu';
import ConfirmationModal from './ConfirmationModal';
import PersonPageSheet, { type PersonSeed } from './PersonPageSheet';
import OracleDnaSheet from './oracleDna/OracleDnaSheet';
import DnaHelix from './oracleDna/DnaHelix';
import { GENE_COLORS } from '../lib/oracleDna';
import {
  NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING, withAlpha,
} from '../lib/oracleTheme';
import { SECTION_CLASS, mediaTypeOf, type TitleMovie } from './movieDetails/shared';
import { useTitleRelation } from './movieDetails/useTitleRelation';
import { useTitleMood } from './movieDetails/useTitleMood';
import { useOracleComments } from './movieDetails/useOracleComments';
import { useTitleEpisodes } from './movieDetails/useTitleEpisodes';
import TitleBackdrop from './movieDetails/TitleBackdrop';
import TitlePoster from './movieDetails/TitlePoster';
import TitleHeading from './movieDetails/TitleHeading';
import TitleGenres from './movieDetails/TitleGenres';
import TitleScoreboard from './movieDetails/TitleScoreboard';
import TitleQuickActions from './movieDetails/TitleQuickActions';
import TitleSeasonsButton from './movieDetails/TitleSeasonsButton';
import TitleSynopsis from './movieDetails/TitleSynopsis';
import TitleWhereToWatch from './movieDetails/TitleWhereToWatch';
import TitleCredits from './movieDetails/TitleCredits';
import TitleCast from './movieDetails/TitleCast';
import TitleFooter from './movieDetails/TitleFooter';
import TrailerLayer from './movieDetails/TrailerLayer';
import SeasonsLayer from './movieDetails/SeasonsLayer';

// Detalhes de um filme/série — "a ficha na mesa do oráculo".
//   • Topo: o fundo (backdrop) do filme se dissolvendo na noite, o pôster
//     (toque = trailer) com os selos dos oráculos e as bolhas dos amigos,
//     título, ficha rápida e gêneros (texto corrido, sem cápsulas), o placar
//     (a sua nota ou a prevista, a chance de virar 10 e a do público: número
//     grande e nome embaixo) e as ações rápidas (trailer, sussurrar, story:
//     ícone em cima, nome embaixo, sem contorno).
//   • Corpo: sinopse, onde assistir, direção (com o Top 10) e elenco.
//   • Rodapé fixo: adicionar à biblioteca / já na biblioteca, e resenhas.
// No celular abre como gaveta de baixo pra cima; no desktop, centralizado.
// Fecha no X, no fundo escuro e no Esc (o Esc fecha primeiro o trailer ou
// as temporadas, se estiverem abertos).
//
// 18/11/2026 (Protocolo Reborn, render.md A4): este arquivo é a CASCA do menu.
// Eram 3 mil linhas e 47 estados num componente só: cada resposta do banco
// (21 chamadas ao abrir) re-renderizava a ficha inteira, 7 a 11 vezes por
// abertura. Agora cada parte da ficha é uma seção memorizada em
// src/components/movieDetails/, com o próprio dado (previsão no placar,
// amigos nas bolhas, classificação no cabeçalho, orçamento na direção, fotos
// no elenco, saga na sinopse...), e só ela re-renderiza quando ele chega.
// Aqui ficam: as camadas (trailer, temporadas, resenhas, pessoa, DNA, outro
// filme por cima) e o que mais de uma seção usa (a biblioteca e a nota de quem
// olha, a prateleira do título, os selos dos oráculos, os episódios vistos).
// Mesma aparência, mesmo comportamento, mesmas props e o mesmo `export default`.
//
// 19/11/2026 (Protocolo Reborn, onda 2b): o menu entra na pilha de camadas do
// app (src/overlays), como as gavetas já tinham entrado na 2a. Saíram daqui a
// trava de rolagem e o ouvinte de Esc próprios; o z-index vem da pilha (a prop
// zIndexClass virou o piso) e o voltar do navegador fecha o menu também quando
// ele está direto na página (antes trocava de página com o menu aberto). O
// jeito novo de abrir é `overlays.open('title', …)` (src/overlays/title.ts);
// montar o componente no lugar continua funcionando.

interface MovieDetailsModalProps {
  movie: Movie;
  isOpen: boolean;
  onClose: () => void;
  isOtherUserProfile?: boolean;
  // Sobrescreve o z-index padrão (z-[9999]) — necessário quando esse
  // modal é aberto DE DENTRO de outro modal que já tem um z-index alto
  // (como os modais de review, em z-[10000]), garantindo que este fique
  // por cima do modal que o abriu, não escondido atrás dele.
  zIndexClass?: string;
  // ID do dono do perfil sendo visitado — quando presente junto com
  // isOtherUserProfile, os episódios exibidos como assistidos são os
  // DELE, não os de quem está olhando, e os botões de marcação somem
  // por completo (não se marca episódio na conta de outra pessoa).
  profileUserId?: string;
  onAddToLibrary?: () => void;
  onEpisodeToggle?: () => void;
  // Regra geral contra empilhamento infinito: quando ESTA instância já é
  // aninhada dentro de outra (aberta pelo Top 10 do diretor, por exemplo),
  // ela não abre uma TERCEIRA camada por conta própria — em vez disso pede
  // pra quem a abriu (o modal-pai) TROCAR o filme exibido no lugar dela.
  isNested?: boolean;
  onReplaceMovie?: (movie: Movie) => void;
}

const MovieDetailsModal: React.FC<MovieDetailsModalProps> = ({
  movie,
  isOpen,
  onClose,
  isOtherUserProfile = false,
  zIndexClass = 'z-[9999]',
  profileUserId,
  onAddToLibrary,
  onEpisodeToggle,
  isNested = false,
  onReplaceMovie
}) => {
  const { session } = useAuth();
  const { t } = useTranslation();
  const userId = session?.user?.id ?? null;
  const loggedIn = !!session?.user;
  const mediaType = mediaTypeOf(movie);
  const isTvShow = movie.media_type === 'tv';

  // O que mais de uma seção usa mora aqui; o resto mora na própria seção.
  //  • a biblioteca e a nota de quem olha: placar, rodapé, temporadas, resenhas;
  //  • a prateleira do título: a linha de gêneros e o placar;
  //  • os oráculos com selo: os selos sobre o pôster e o selo do orçamento;
  //  • as temporadas e os episódios vistos: o botão e a gaveta das temporadas.
  const relation = useTitleRelation(movie.id, mediaType, userId, onAddToLibrary);
  const { isInLibrary, userRating, userRatingLoaded } = relation;
  const { moodKey, moodLoaded } = useTitleMood(movie.id, mediaType, userId);
  const oracle = useOracleComments(movie.id, mediaType);
  const episodes = useTitleEpisodes({ movie, userId, userRating, isOtherUserProfile, profileUserId, onEpisodeToggle });

  const [showRecommendModal, setShowRecommendModal] = useState(false);
  const [showSeasonsModal, setShowSeasonsModal] = useState(false);
  // Vazio por padrão — todas as temporadas nascem recolhidas, mostrando
  // só o cabeçalho (pôster, nome, contagem de episódios). Um clique na
  // seta expande e revela a lista de episódios daquela temporada.
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const titleId = useId();
  const seasonsTitleId = useId();

  // Outro filme aberto por cima deste (saga, página da pessoa). Numa camada
  // aninhada, troca o filme dela em vez de abrir outra.
  const [nestedMovie, setNestedMovie] = useState<Movie | null>(null);
  const [loadingNestedMovieId, setLoadingNestedMovieId] = useState<number | null>(null);
  // Página da pessoa (ator) aberta por cima deste menu — PersonPageSheet.
  const [personSheet, setPersonSheet] = useState<PersonSeed | null>(null);
  // Oracle DNA (18/11/2026): a gaveta dos parentes do título em todas as
  // prateleiras. dnaRefresh muda quando o menu de um parente (aberto por
  // cima da gaveta) fecha: o DNA é lido de novo, sem apagar a tela.
  const [showDna, setShowDna] = useState(false);
  const [dnaRefresh, setDnaRefresh] = useState(0);

  // 18/11/2026 (otimização): os modais filhos (indicar, adicionar, confirmar,
  // DNA, página da pessoa) só montam depois da primeira vez que abrem. Antes
  // os 8 ficavam montados fechados e re-renderizavam a cada um dos 7–8
  // commits da abertura (80 renders de componente → 14 na prévia).
  const recommendMounted = useOpenedOnce(showRecommendModal);
  const quickAddMounted = useOpenedOnce(showQuickAdd);
  const deleteConfirmMounted = useOpenedOnce(showDeleteConfirmation);
  const dnaMounted = useOpenedOnce(showDna);
  const personMounted = useOpenedOnce(!!personSheet);

  // Necessário desde que o aninhamento passou a REAPROVEITAR a mesma
  // instância do modal (troca de filme via onReplaceMovie) em vez de criar
  // uma instância nova do zero a cada clique: a página da pessoa do filme
  // anterior não pode ficar para trás.
  useEffect(() => {
    setPersonSheet(null);
    setShowDna(false);
  }, [movie.id]);

  // Fechou o menu: a página da pessoa e o DNA fecham junto.
  useEffect(() => {
    if (!isOpen) {
      setPersonSheet(null);
      setShowDna(false);
    }
  }, [isOpen]);

  // 19–20/11/2026 (Reborn): a rolagem da página e o touch-action do <body>
  // (que este menu sempre ligou: sem ele o iPhone arrasta a página por trás do
  // fundo escuro) são da pilha de camadas, a única que escreve essas travas.
  // Esc e voltar: a pilha chama isto quando este menu é a camada de cima. O
  // trailer e as temporadas são camadas próprias (fecham antes); a ordem fica
  // aqui também, por garantia. Com um modal filho aberto (resenhas, nota,
  // indicar, confirmação, pessoa, DNA, outro filme), a camada de cima é ele.
  const childModalOpen = showReviewsModal || showQuickAdd || showDeleteConfirmation || showRecommendModal || !!nestedMovie || !!personSheet || showDna;
  const layer = useLayerEntry(
    isOpen,
    () => {
      if (showTrailerModal) return setShowTrailerModal(false);
      if (showSeasonsModal) return setShowSeasonsModal(false);
      if (childModalOpen) return;
      onClose();
    },
    { z: zFromClass(zIndexClass), touchNone: true },
  );

  // Abre outro filme por cima deste (saga, página da pessoa, Oracle DNA). Da
  // saga e da pessoa são sempre filmes (as listas vêm dos créditos de filme do
  // TMDB); o DNA também traz séries. O tipo vai sempre explícito — sem a
  // consulta à tabela movies, que erra quando um filme e uma série têm o
  // mesmo número.
  //
  // Clona no interesse: o título aberto entra no movie_cache se ainda não
  // estiver lá (getMovieDetailsFromDB → cache-title). Só o que a pessoa
  // abre — não os 10 da lista — e quem atualiza o que já existe é o
  // servidor.
  const openNestedMovie = useEvent(async (movieId: number, mediaType: 'movie' | 'tv' = 'movie') => {
    setLoadingNestedMovieId(movieId);
    try {
      const details = { ...(await getMovieDetailsFromDB(movieId, mediaType)), media_type: mediaType };
      if (isNested && onReplaceMovie) {
        // Já estamos numa camada aninhada — pede pro pai trocar o filme
        // exibido aqui, em vez de abrir mais uma camada por baixo (a página
        // da pessoa, se aberta, fecha com a troca de filme).
        onReplaceMovie(details);
      } else {
        setNestedMovie(details);
      }
    } catch (err) {
      console.error('Error loading director movie:', err);
      toast.error(t('common.error'));
    } finally {
      setLoadingNestedMovieId(null);
    }
  });

  // Ações passadas às seções: nunca mudam de identidade, para o React.memo
  // das seções valer (um `onClick` novo a cada render anularia o memo).
  const openTrailer = useCallback(() => setShowTrailerModal(true), []);
  const closeTrailer = useCallback(() => setShowTrailerModal(false), []);
  const openRecommend = useCallback(() => setShowRecommendModal(true), []);
  const openReviews = useCallback(() => setShowReviewsModal(true), []);
  const openQuickAdd = useCallback(() => setShowQuickAdd(true), []);
  const openDeleteConfirmation = useCallback(() => setShowDeleteConfirmation(true), []);
  const openPerson = useCallback((person: PersonSeed) => setPersonSheet(person), []);
  const closeSeasons = useCallback(() => setShowSeasonsModal(false), []);
  const { ensureSeasons } = episodes;
  const openSeasons = useCallback(() => {
    setShowSeasonsModal(true);
    // busca os episódios se o título ainda não os trouxe
    ensureSeasons();
  }, [ensureSeasons]);
  const toggleExpandedSeason = useCallback((seasonNumber: number) => {
    setExpandedSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(seasonNumber)) next.delete(seasonNumber);
      else next.add(seasonNumber);
      return next;
    });
  }, []);

  if (!isOpen) return null;

  // Nota 0 ("Crime Cinematográfico") também é nota — por isso a checagem
  // é por null, não por "falsy" como antes.
  const hasRated = userRating !== null && userRating !== undefined;

  const releaseSource = movie.release_date || movie.first_air_date || '';
  // Ano lido direto do texto "AAAA-MM-DD": new Date() interpretaria como
  // meia-noite UTC e, no Brasil, um filme de 1º de janeiro viraria do ano
  // anterior.
  const releaseYearNumber = parseInt(releaseSource.slice(0, 4), 10);
  const year = Number.isNaN(releaseYearNumber) ? null : releaseYearNumber;
  const seasonCount = movie.number_of_seasons || 0;
  const backdropPath = (movie as TitleMovie).backdrop_path || null;
  const stillAiring = movie.in_production === true || movie.status === 'Returning Series';
  // De quem são os pôsteres equipados (Poster Jackpot): o dono da biblioteca
  // visitada ou quem está olhando.
  const posterOwnerId = isOtherUserProfile && profileUserId ? profileUserId : session?.user?.id;

  // Renderizado via Portal, direto no <body> — não como filho de onde o
  // componente foi chamado. Sem isso, quando o modal é aberto de dentro de
  // uma página cujo container raiz é um motion.div (Framer Motion aplica
  // transform via style inline), o modal ficava preso no contexto de
  // empilhamento desse container e a navbar passava por cima dele.
  return createPortal(
    <LayerScope layer={layer}>
    <div {...layer.rootProps} className={`fixed inset-0 ${zIndexClass}`} style={layer.style} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/75"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-end sm:items-center justify-center sm:p-6 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto relative w-full sm:max-w-4xl max-h-[94dvh] sm:max-h-[calc(100dvh-5rem)] flex flex-col rounded-t-2xl sm:rounded-2xl ring-1 ring-white/10 shadow-2xl overflow-hidden"
          style={{ background: NIGHT }}
        >
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className={`absolute top-3 right-3 z-30 grid place-items-center w-11 h-11 rounded-full ring-1 ring-white/15 bg-black/45 hover:bg-black/60 transition ${FOCUS_RING}`}
            style={{ background: 'rgba(18,13,34,0.6)', color: PAPER }}
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {/* ---------- Topo: fundo do filme + pôster + título ---------- */}
            <div className="relative">
              <TitleBackdrop backdropPath={backdropPath} />

              <div className="relative px-5 sm:px-8 pt-14 sm:pt-12 pb-8 md:grid md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[264px_minmax(0,1fr)] md:gap-8">
                {/* Coluna do pôster */}
                <div>
                  <TitlePoster
                    movie={movie}
                    posterOwnerId={posterOwnerId}
                    userId={userId}
                    oracle={oracle}
                    onOpenTrailer={openTrailer}
                    onOpenReviews={openReviews}
                  />

                  <div className="hidden md:block mt-8">
                    <TitleWhereToWatch watchProviders={movie.watchProviders} releaseDate={movie.release_date} />
                  </div>
                </div>

                {/* Coluna das informações */}
                <div className="mt-6 md:mt-0 min-w-0">
                  <TitleHeading movie={movie} titleId={titleId} />

                  <TitleGenres genres={movie.genres} moodKey={moodKey} moodLoaded={moodLoaded} loggedIn={loggedIn} />

                  {/* Placar (lugar reservado desde a abertura) */}
                  <TitleScoreboard
                    movieId={movie.id}
                    mediaType={mediaType}
                    voteAverage={movie.vote_average}
                    userId={userId}
                    loggedIn={loggedIn}
                    userRating={userRating}
                    userRatingLoaded={userRatingLoaded}
                    isInLibrary={isInLibrary}
                    moodKey={moodKey}
                    moodLoaded={moodLoaded}
                  />

                  {/* Ações rápidas */}
                  <TitleQuickActions
                    movieId={movie.id}
                    title={movie.title}
                    posterPath={movie.poster_path}
                    mediaType={mediaType}
                    releaseDate={movie.release_date || movie.first_air_date}
                    userId={userId}
                    loggedIn={loggedIn}
                    onOpenTrailer={openTrailer}
                    onRecommend={openRecommend}
                  />

                  {/* Oracle DNA: os parentes do título em todas as prateleiras. */}
                  {session?.user && (
                    <button
                      type="button"
                      onClick={() => setShowDna(true)}
                      aria-haspopup="dialog"
                      className={`group mt-5 w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl ring-1 ring-white/10 hover:ring-fuchsia-300/40 text-left transition ${FOCUS_RING}`}
                      style={{ background: `linear-gradient(100deg, ${withAlpha('#E879F9', 0.13)} 0%, ${VELVET} 58%)` }}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <span className="grid place-items-center w-10 h-10 shrink-0 rounded-lg overflow-hidden" style={{ background: withAlpha('#E879F9', 0.14) }}>
                          <DnaHelix size="icon" bases={GENE_COLORS.slice(0, 4)} className="w-9 h-9" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[17px] leading-tight" style={{ ...PIXEL, color: PAPER }}>{t('oracleDna.title')}</span>
                          <span className="block mt-0.5 text-sm truncate" style={{ color: MIST }}>{t('oracleDna.cardHint')}</span>
                        </span>
                      </span>
                      <ChevronRight className="w-5 h-5 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: MIST }} aria-hidden />
                    </button>
                  )}

                  {isTvShow && (
                    <TitleSeasonsButton
                      loggedIn={loggedIn}
                      seasonCount={seasonCount}
                      hasRated={hasRated}
                      watchedCount={episodes.watchedEpisodes.size}
                      onOpen={openSeasons}
                    />
                  )}

                  {/* ---------- Corpo ---------- */}
                  <div className="text-left">
                    <TitleSynopsis
                      movieId={movie.id}
                      rawMediaType={movie.media_type}
                      overview={movie.overview}
                      onOpenMovie={openNestedMovie}
                      loadingMovieId={loadingNestedMovieId}
                    />

                    <section className={`md:hidden ${SECTION_CLASS}`}>
                      <TitleWhereToWatch watchProviders={movie.watchProviders} releaseDate={movie.release_date} />
                    </section>

                    <TitleCredits movie={movie} oracleSources={oracle.sources} onOpenPerson={openPerson} />

                    <TitleCast movie={movie} onOpenPerson={openPerson} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- Rodapé fixo ---------- */}
          {session?.user && (
            <TitleFooter isInLibrary={isInLibrary} onAdd={openQuickAdd} onRemove={openDeleteConfirmation} onReviews={openReviews} />
          )}
        </motion.div>
      </div>

      {recommendMounted && (
      <RecommendModal
        isOpen={showRecommendModal}
        onClose={() => setShowRecommendModal(false)}
        movieId={movie.id}
        movieTitle={movie.title}
        moviePoster={movie.poster_path}
        mediaType={movie.media_type}
      />
      )}

      {quickAddMounted && (
      <QuickAddMenu
        movieTitle={movie.title}
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onAdd={relation.add}
      />
      )}

      {deleteConfirmMounted && (
      <ConfirmationModal
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={relation.remove}
        title={t('common.delete')}
        message={t('library.movieRemoved')}
      />
      )}

      {/* ---------- Trailer ---------- */}
      <AnimatePresence>
        {showTrailerModal && (
          <TrailerLayer movieId={movie.id} rawMediaType={movie.media_type} title={movie.title} onClose={closeTrailer} />
        )}
      </AnimatePresence>

      {/* ---------- Temporadas e episódios ---------- */}
      <AnimatePresence>
        {showSeasonsModal && (
          <SeasonsLayer
            titleId={seasonsTitleId}
            title={movie.title}
            stillAiring={stillAiring}
            seasons={episodes.seasons}
            loadingSeasons={episodes.loadingSeasons}
            hasRated={hasRated}
            isOtherUserProfile={isOtherUserProfile}
            loggedIn={loggedIn}
            watchedEpisodes={episodes.watchedEpisodes}
            pendingEpisodes={episodes.pendingEpisodes}
            expandedSeasons={expandedSeasons}
            onToggleExpanded={toggleExpandedSeason}
            onToggleSeason={episodes.toggleSeason}
            onToggleEpisode={episodes.toggleEpisode}
            onClose={closeSeasons}
          />
        )}
      </AnimatePresence>

      {showReviewsModal && (
        <ReviewsModal
          movie={movie}
          onClose={() => setShowReviewsModal(false)}
          userRating={userRating}
        />
      )}

      {session?.user && dnaMounted && (
        <OracleDnaSheet
          open={showDna}
          zIndexClass={zIndexClass}
          onClose={() => setShowDna(false)}
          titleId={movie.id}
          mediaType={isTvShow ? 'tv' : 'movie'}
          title={movie.title}
          year={year}
          onOpenTitle={(id, mediaType) => openNestedMovie(id, mediaType)}
          loadingId={loadingNestedMovieId}
          escapeEnabled={!nestedMovie}
          refreshKey={dnaRefresh}
        />
      )}

      {/* 18/11/2026 (modais.md F2): pessoa e DNA no mesmo z deste menu (abertos
          depois, ficam por cima). Com o menu vindo do Jackpot (z-[10010]) ou
          das Resenhas (z-[10001]) eles abriam escondidos atrás em z-[9999]. */}
      {personMounted && (
      <PersonPageSheet
        zIndexClass={zIndexClass}
        person={personSheet}
        onClose={() => setPersonSheet(null)}
        currentMovieId={movie.media_type === 'tv' ? undefined : movie.id}
        onOpenMovie={openNestedMovie}
        loadingMovieId={loadingNestedMovieId}
        escapeEnabled={!nestedMovie}
      />
      )}

      {nestedMovie && (
        <MovieDetailsModal
          movie={nestedMovie}
          isOpen={true}
          onClose={() => {
            setNestedMovie(null);
            if (showDna) setDnaRefresh((n) => n + 1);
          }}
          zIndexClass={zIndexClass}
          isNested={true}
          onReplaceMovie={setNestedMovie}
        />
      )}
    </div>
    </LayerScope>,
    document.body
  );
};

export default MovieDetailsModal;
