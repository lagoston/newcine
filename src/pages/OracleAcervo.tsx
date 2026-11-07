import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import MesaLayer, { useLayerStack, useMesaLayerEntry } from '../components/oracleTable/MesaLayer';
import AcervoTabs from '../components/oracleAcervo/AcervoTabs';
import MoodPicker from '../components/oracleAcervo/MoodPicker';
import AcervoGrid from '../components/oracleAcervo/AcervoGrid';
import { posterOf, titleOf } from '../components/oracleAcervo/titles';
import { isAcervoMood, useAcervo, useDefaultMood } from '../components/oracleAcervo/useAcervo';
import OracleProfileSheet from '../components/oracleHub/OracleProfileSheet';
import MovieDetailsModal from '../components/MovieDetailsModal';
import { getFullTitle } from '../lib/titleCards';
import type { Movie } from '../lib/tmdb';
import { isAcervoMedia, isAcervoOracle, type AcervoItem, type AcervoMedia } from '../lib/mesa/acervoApi';
import type { OracleSlot } from '../lib/mesa/types';
import { MOOD_BY_KEY } from '../lib/moods';
import { FOCUS_RING, MIST, NIGHT, ORACLE_BY_ID, PAPER, PIXEL, withAlpha } from '../lib/oracleTheme';

// O Acervo dos oráculos (/oracle/acervo?oracle=&mood=&type=), 05/11/2026 —
// SPEC §2.13. Substitui a Biblioteca dos Oráculos (OracleLibraries.tsx, que
// empilhava nove fileiras de lado e cortava cada uma em 20 títulos para quem
// não assinava). Aqui é UMA prateleira por vez, inteira e igual para todos,
// escolhida por oráculo × humor × filmes/séries, numa grade calma que cresce
// de 30 em 30. Mora na mesma camada da Mesa (MesaLayer: o feltro, z 9980), e
// "← Mesa" volta para ela.
//
// A URL manda: ?oracle (bogart|fincher|cypher; padrão bogart), ?mood (uma das
// 9 chaves; padrão o humor mais forte da pessoa) e ?type (movie|tv; padrão
// movie). Trocar a prateleira reescreve a URL sem empilhar histórico: o
// voltar do aparelho sai do Acervo de uma vez.

type ShelfParams = { oracle: OracleSlot; mood: string | null; media: AcervoMedia };

// Um Movie mínimo, para o menu abrir mesmo se os detalhes completos falharem.
const fallbackMovie = (item: AcervoItem, lang: string): Movie => ({
  id: item.tmdb_id,
  title: titleOf(item, lang),
  poster_path: posterOf(item, lang) || '',
  overview: '',
  release_date: item.year ? `${item.year}-01-01` : '',
  vote_average: 0,
  runtime: 0,
  genres: [],
  media_type: item.media_type,
});

const AcervoScreen: React.FC<ShelfParams & { onShelf: (next: Partial<ShelfParams>) => void; onBack: () => void }> = ({
  oracle,
  mood,
  media,
  onShelf,
  onBack,
}) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'pt';
  const { user } = useAuth();
  const userId = user?.id;
  const { scrollRef } = useLayerStack();
  const { shelf, loadMore, retry, removeItem, setWatchlist } = useAcervo(oracle, mood, media);

  const [profileOracle, setProfileOracle] = useState<OracleSlot | null>(null);
  const [selected, setSelected] = useState<{ movie: Movie; item: AcervoItem } | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  // Estilo de carta do Personalizar perfil, para o perfil do oráculo.
  const [cardStyle, setCardStyle] = useState('default');

  // O foco entra na camada ao abrir: sem isso o primeiro Tab ia para a barra
  // do site, que fica por baixo da MesaLayer (o contêiner não desenha anel).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    supabase
      .from('profiles')
      .select('card_style')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data?.card_style) setCardStyle(String(data.card_style));
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  // As gavetas entram na pilha de camadas da MesaLayer: o Esc e o voltar do
  // aparelho fecham uma de cada vez (perfil / menu do título → Acervo → Mesa).
  const closeProfile = useCallback(() => setProfileOracle(null), []);
  useMesaLayerEntry(profileOracle !== null, closeProfile, { ownEscape: true });

  // O botão que abriu o menu: o foco volta para ele ao fechar (SPEC §2.15).
  const openerRef = useRef<HTMLElement | null>(null);
  // Fechou o menu do título: se a pessoa deu nota, ele sai da prateleira (o
  // Acervo só mostra o que falta avaliar); se mexeu na Watchlist, a marca muda.
  const closeDetails = useCallback(() => {
    const closing = selected?.item;
    setSelected(null);
    const opener = openerRef.current;
    openerRef.current = null;
    window.requestAnimationFrame(() => {
      // Se o título saiu da grade (ganhou nota), o foco fica na camada.
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      else rootRef.current?.focus({ preventScroll: true });
    });
    if (!closing || !userId) return;
    supabase
      .from('user_movies')
      .select('rating')
      .eq('user_id', userId)
      .eq('movie_id', closing.tmdb_id)
      .eq('media_type', closing.media_type)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return;
        const row = data as { rating: number | null } | null;
        if (row && row.rating !== null && row.rating !== undefined) {
          removeItem(closing.tmdb_id, closing.media_type);
          // O pôster focado saiu da grade: o foco não pode cair no <body>.
          window.requestAnimationFrame(() => {
            if (!document.activeElement || document.activeElement === document.body) rootRef.current?.focus({ preventScroll: true });
          });
        } else setWatchlist(closing.tmdb_id, closing.media_type, Boolean(row));
      });
  }, [selected, userId, removeItem, setWatchlist]);
  useMesaLayerEntry(selected !== null, closeDetails, { ownEscape: true });

  const openItem = useCallback(
    async (item: AcervoItem) => {
      const key = `${item.media_type}:${item.tmdb_id}`;
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpeningKey(key);
      try {
        const movie = await getFullTitle({ id: item.tmdb_id, media_type: item.media_type });
        setSelected({ movie, item });
      } catch {
        setSelected({ movie: fallbackMovie(item, lang), item });
      } finally {
        setOpeningKey((current) => (current === key ? null : current));
      }
    },
    [lang]
  );

  // Trocou de prateleira: a grade nova começa do alto (se a pessoa tinha
  // descido, volta até os seletores).
  const shelfId = `${oracle}|${mood}|${media}`;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollTop > 0) el.scrollTo({ top: 0 });
  }, [shelfId, scrollRef]);

  const current = ORACLE_BY_ID[oracle];
  const moodInfo = mood ? MOOD_BY_KEY[mood] : null;
  const moodName = moodInfo ? t(moodInfo.labelKey) : '';
  const MoodIcon = moodInfo?.icon;
  const panelId = 'acervo-shelf';

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="min-h-full flex flex-col outline-none"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)' }}
    >
      {/* Topo: "← Mesa" e o nome. Fica preso no alto enquanto a grade rola. */}
      {/* Fundo quase opaco (os pôsteres não aparecem por trás do nome ao
          rolar) e só os últimos 10 px esmaecem, para a borda não ficar dura. */}
      <header
        className="sticky top-0 z-10 pb-2.5"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          background: `linear-gradient(180deg, ${withAlpha(NIGHT, 0.97)} 0%, ${withAlpha(NIGHT, 0.95)} calc(100% - 10px), ${withAlpha(NIGHT, 0)} 100%)`,
        }}
      >
        <div className="mx-auto max-w-[1200px] h-[52px] sm:h-14 px-2 sm:px-6 grid grid-cols-[1fr_auto_1fr] items-center">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('acervo.backAria')}
            className={`justify-self-start inline-flex items-center gap-1.5 h-11 pl-2 pr-3 rounded-xl text-sm font-medium hover:bg-white/[0.06] transition-colors ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            <ArrowLeft className="w-[18px] h-[18px]" aria-hidden />
            {t('acervo.back')}
          </button>
          <h1 style={{ ...PIXEL, color: PAPER }} className="text-[20px] sm:text-[24px] leading-none whitespace-nowrap">
            {t('acervo.title')}
          </h1>
          <span aria-hidden />
        </div>
      </header>

      {/* div, e não <main>: o <main> do site continua por baixo da camada. */}
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 flex-1">
        <p className="text-center lg:text-left text-[13px] sm:text-sm leading-snug [text-wrap:balance]" style={{ color: MIST }}>
          {t('acervo.lead')}
        </p>

        <div className="mt-4 sm:mt-5">
          <AcervoTabs active={oracle} panelId={panelId} onSelect={(next) => onShelf({ oracle: next })} onOpenProfile={setProfileOracle} />
        </div>

        <div className="mt-4 sm:mt-5">
          <MoodPicker active={mood ?? ''} onSelect={(next) => onShelf({ mood: next })} media={media} onMedia={(next) => onShelf({ media: next })} />
        </div>

        <section id={panelId} role="tabpanel" aria-labelledby={`acervo-tab-${oracle}`} className="mt-6 sm:mt-8">
          {/* O nome da prateleira e quantos títulos faltam (altura reservada:
              nada pula quando o número chega). */}
          <div className="mb-4 sm:mb-5 min-h-[52px]">
            <h2 style={PIXEL} className="flex items-center gap-2 text-[21px] sm:text-[26px] leading-tight min-w-0">
              <span style={{ color: current.color }} className="shrink-0">
                {current.name}
              </span>
              <span aria-hidden style={{ color: MIST }} className="shrink-0">
                ·
              </span>
              <span className="truncate" style={{ color: PAPER }}>
                {moodName}
              </span>
              {MoodIcon && <MoodIcon className="w-5 h-5 shrink-0" style={{ color: moodInfo?.color }} aria-hidden />}
            </h2>
            <p className="mt-1 text-sm h-5" style={{ color: MIST }} aria-live="polite">
              {shelf?.status === 'ready' && shelf.unrated > 0 ? t('acervo.count', { count: shelf.unrated }) : ' '}
            </p>
          </div>

          {shelf ? (
            <AcervoGrid
              shelf={shelf}
              media={media}
              userId={userId}
              openingKey={openingKey}
              onOpen={openItem}
              onLoadMore={loadMore}
              onRetry={retry}
              scrollRoot={scrollRef}
            />
          ) : (
            // Ainda escolhendo o humor padrão (uma consulta curta): esqueleto.
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-5 sm:gap-x-4" aria-busy="true">
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className="block aspect-[2/3] rounded-lg poster-skeleton" aria-hidden />
              ))}
            </div>
          )}
        </section>

        {/* No pé: a mesma prateleira como pergunta para a Mesa. */}
        {mood && moodInfo && (
          <div className="mt-10 sm:mt-12 flex justify-center">
            <Link
              to={`/oracle/mesa?ask=mood:${mood}`}
              className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full text-sm sm:text-[15px] font-semibold transition hover:bg-white/[0.06] ${FOCUS_RING}`}
              style={{ color: PAPER, boxShadow: `inset 0 0 0 1.5px ${withAlpha(moodInfo.color, 0.55)}` }}
            >
              <span style={{ ...PIXEL, color: moodInfo.color }} className="text-[18px] leading-none" aria-hidden>
                {moodInfo.letter}
              </span>
              {t('acervo.askMood', { mood: moodName })}
              <ChevronRight className="w-4 h-4" aria-hidden />
            </Link>
          </div>
        )}
      </div>

      <OracleProfileSheet oracleId={profileOracle} cardStyle={cardStyle} onClose={closeProfile} />
      {selected && <MovieDetailsModal movie={selected.movie} isOpen={true} onClose={closeDetails} isOtherUserProfile={false} />}
    </div>
  );
};

export default function OracleAcervo() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const oracleParam = params.get('oracle');
  const typeParam = params.get('type');
  const moodParam = params.get('mood');
  const oracle: OracleSlot = isAcervoOracle(oracleParam) ? oracleParam : 'bogart';
  const media: AcervoMedia = isAcervoMedia(typeParam) ? typeParam : 'movie';
  const validMood = isAcervoMood(moodParam) ? moodParam : null;
  const defaultMood = useDefaultMood(user?.id, validMood === null);
  const mood = validMood ?? defaultMood;

  // A URL sempre diz a prateleira que está na tela (o humor padrão e os
  // valores corrigidos entram nela), sem criar entrada nova no histórico.
  useEffect(() => {
    if (!mood) return;
    if (oracleParam === oracle && typeParam === media && moodParam === mood) return;
    const next = new URLSearchParams(params);
    next.set('oracle', oracle);
    next.set('mood', mood);
    next.set('type', media);
    setParams(next, { replace: true, state: location.state });
  }, [mood, oracle, media, oracleParam, typeParam, moodParam, params, setParams, location.state]);

  const onShelf = useCallback(
    (change: Partial<ShelfParams>) => {
      const next = new URLSearchParams(params);
      next.set('oracle', change.oracle ?? oracle);
      next.set('type', change.media ?? media);
      const nextMood = change.mood ?? mood;
      if (nextMood) next.set('mood', nextMood);
      setParams(next, { replace: true, state: location.state });
    },
    [params, oracle, media, mood, setParams, location.state]
  );

  // "← Mesa": quem veio da Mesa (ela manda state.fromMesa no link) volta para
  // a mesma pergunta; quem chegou por outra porta vai à tiragem do dia.
  const fromMesa = Boolean((location.state as { fromMesa?: boolean } | null)?.fromMesa);
  const goMesa = useCallback(() => {
    if (fromMesa && window.history.length > 1) navigate(-1);
    else navigate('/oracle/mesa');
  }, [fromMesa, navigate]);

  return (
    <MesaLayer label={t('acervo.title')} onExit={goMesa}>
      <AcervoScreen oracle={oracle} mood={mood} media={media} onShelf={onShelf} onBack={goMesa} />
    </MesaLayer>
  );
}
