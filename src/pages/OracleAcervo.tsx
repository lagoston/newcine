import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Inbox, PartyPopper } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import AcervoLayer from '../components/oracleAcervo/AcervoLayer';
import { useLayerEntry, useLayerStack } from '../components/oracleAcervo/layerStack';
import AcervoTabs from '../components/oracleAcervo/AcervoTabs';
import MoodPicker from '../components/oracleAcervo/MoodPicker';
import OccasionChips from '../components/oracleAcervo/OccasionChips';
import AcervoGrid, { AcervoErrorBox, GRID, SkeletonTile } from '../components/oracleAcervo/AcervoGrid';
import { BASE_OCCASIONS, OCCASION_ICON } from '../components/oracleAcervo/occasions';
import { posterOf, titleOf } from '../components/oracleAcervo/titles';
import { isAcervoMood, shelfKey, useAcervo } from '../components/oracleAcervo/useAcervo';
import { readAcervoParams } from '../components/oracleAcervo/acervoTarget';
import OracleProfileSheet from '../components/oracleHub/OracleProfileSheet';
import MovieDetailsModal from '../components/MovieDetailsModal';
import { getFullTitle } from '../lib/titleCards';
import type { Movie } from '../lib/tmdb';
import type { AcervoItem, AcervoMedia, OracleSlot } from '../lib/mesa/types';
import { MOOD_BY_KEY } from '../lib/moods';
import { FOCUS_RING, MIST, NIGHT, ORACLE_BY_ID, PAPER, PIXEL, VELVET, withAlpha } from '../lib/oracleTheme';

// O Acervo dos oráculos — desde 09/11/2026, a página única da Mesa dos
// Oráculos (/oracle/acervo; /oracle/mesa e /oracle/libraries caem aqui).
//
// O Bruno testou a Mesa de três cartas (06/11) e decidiu: as cartas saem; o
// Acervo fica, com o que ele gostou da Mesa — as ocasiões ("Com a galera",
// "Só eu e a chuva"…) como fichas de filtro e o porquê de cada título numa
// linha embaixo do pôster. Pouco texto: o nome, as escolhas e a grade.
//
// A URL manda:
//   ?oracle   bogart | fincher | cypher (padrão bogart)
//   ?mood     uma das 9 chaves; sem ela, o servidor escolhe o humor mais
//             forte da pessoa e a página grava na URL
//   ?ocasiao  uma ocasião (galera, chuva…): a grade junta todos os humores do
//             oráculo; a ocasião vence o humor
//   ?type     movie | tv (padrão movie; uma ocasião de um tipo só, como
//             "Só um episódio", passa por cima)
//   ?ask      o formato antigo da Mesa (occ:<id>, mood:<chave>,
//             season:<id>), traduzido para os de cima
// Trocar o filtro reescreve a URL sem empilhar histórico: o voltar do
// aparelho sai do Acervo de uma vez.

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

interface Filter {
  oracle: OracleSlot;
  mood: string | null;
  occasion: string | null;
  media: AcervoMedia;
}

const AcervoScreen: React.FC<{ filter: Filter; onFilter: (next: Filter) => void; onExit: () => void }> = ({ filter, onFilter, onExit }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'pt';
  const { user } = useAuth();
  const userId = user?.id;
  const { scrollRef } = useLayerStack();
  const { shelf, occasions, loadMore, retry, removeItem, setWatchlist } = useAcervo(filter);
  const chipList = occasions ?? BASE_OCCASIONS;

  // A URL sempre diz o filtro que está na tela: o humor padrão escolhido pelo
  // servidor, a mídia de uma ocasião de um tipo só e os valores corrigidos
  // entram nela (sem criar entrada nova no histórico). Só quando a grade na
  // tela é a do filtro pedido — nunca a de um toque anterior.
  const filterKey = shelfKey(filter);
  useEffect(() => {
    if (shelf.key !== filterKey || shelf.status !== 'ready' || shelf.stale) return;
    onFilter({ oracle: shelf.oracle, media: shelf.media, occasion: shelf.occasion, mood: shelf.occasion ? null : shelf.mood });
  }, [shelf, filterKey, onFilter]);

  const [profileOracle, setProfileOracle] = useState<OracleSlot | null>(null);
  const [selected, setSelected] = useState<{ movie: Movie; item: AcervoItem } | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  // Estilo de carta do Personalizar perfil, para o perfil do oráculo.
  const [cardStyle, setCardStyle] = useState('default');

  // O foco entra na camada ao abrir: sem isso o primeiro Tab ia para a barra
  // do site, que fica por baixo da AcervoLayer (o contêiner não desenha anel).
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

  // As gavetas entram na pilha de camadas: o Esc e o voltar do aparelho
  // fecham uma de cada vez (perfil / menu do título → Acervo → fora).
  const closeProfile = useCallback(() => setProfileOracle(null), []);
  useLayerEntry(profileOracle !== null, closeProfile, { ownEscape: true });

  // O botão que abriu o menu: o foco volta para ele ao fechar.
  const openerRef = useRef<HTMLElement | null>(null);
  // Fechou o menu do título: se a pessoa deu nota, ele sai da grade (o
  // Acervo só mostra o que falta avaliar); se mexeu na Watchlist, a marca muda.
  const closeDetails = useCallback(() => {
    const closing = selected?.item;
    setSelected(null);
    const opener = openerRef.current;
    openerRef.current = null;
    window.requestAnimationFrame(() => {
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
  useLayerEntry(selected !== null, closeDetails, { ownEscape: true });

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

  // Trocou de filtro com a grade já rolada para baixo: volta até o nome da
  // prateleira (os seletores ficam logo acima).
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    const section = sectionRef.current;
    if (!el || !section) return;
    const top = section.getBoundingClientRect().top - el.getBoundingClientRect().top;
    if (top < 0) el.scrollTo({ top: Math.max(0, el.scrollTop + top - 72) });
  }, [shelf.key, scrollRef]);

  // O humor de antes da ocasião: tirar a ocasião volta para ele.
  const lastMood = useRef<string | null>(filter.mood);
  if (filter.mood) lastMood.current = filter.mood;

  const selectOccasion = (id: string | null) => {
    if (!id) {
      onFilter({ ...filter, occasion: null, mood: lastMood.current });
      return;
    }
    const occ = chipList.find((o) => o.id === id);
    onFilter({ ...filter, occasion: id, mood: null, media: occ?.media ?? filter.media });
  };
  const selectMedia = (media: AcervoMedia) => {
    if (media === filter.media) return;
    const occ = filter.occasion ? chipList.find((o) => o.id === filter.occasion) : null;
    // A ocasião é de um tipo só ("Só um episódio"): trocar o tipo tira a ocasião.
    if (occ?.media && occ.media !== media) onFilter({ ...filter, media, occasion: null, mood: lastMood.current });
    else onFilter({ ...filter, media });
  };

  const current = ORACLE_BY_ID[filter.oracle];
  const occasionId = filter.occasion ?? null;
  const moodKey = occasionId ? null : filter.mood ?? shelf.mood;
  const moodInfo = moodKey ? MOOD_BY_KEY[moodKey] : null;
  const OccIcon = occasionId ? OCCASION_ICON[occasionId] : null;
  const MoodIcon = moodInfo?.icon;
  const shelfName = occasionId ? t(`mesa.occasions.${occasionId}.name`) : moodInfo ? t(moodInfo.labelKey) : '';
  const panelId = 'acervo-shelf';
  const ready = shelf.status === 'ready' && !shelf.stale;

  let body: React.ReactNode;
  if (shelf.status === 'error') {
    body = <AcervoErrorBox onRetry={retry} />;
  } else if (shelf.status === 'loading' && !shelf.items.length) {
    body = (
      <ol className={GRID} aria-busy="true" aria-label={t('common.loading')}>
        {Array.from({ length: 12 }, (_, i) => (
          <SkeletonTile key={i} />
        ))}
      </ol>
    );
  } else if (ready && shelf.passed) {
    body = (
      <p className="flex items-center gap-3 rounded-xl px-4 py-5 text-[15px] leading-snug ring-1 ring-white/10" style={{ background: VELVET, color: PAPER }}>
        <img src={current.avatar} alt="" aria-hidden className="w-8 h-8 rounded-full object-cover shrink-0" style={{ boxShadow: `0 0 0 1.5px ${current.color}` }} />
        {t('acervo.passed', { oracle: current.name, occasion: shelfName })}
      </p>
    );
  } else if (ready && shelf.items.length === 0) {
    const noTitles = shelf.total === 0;
    body = (
      <p className="flex items-center gap-3 rounded-xl px-4 py-5 text-[15px] leading-snug ring-1 ring-white/10" style={{ background: VELVET, color: PAPER }}>
        {noTitles ? <Inbox className="w-5 h-5 shrink-0" style={{ color: MIST }} aria-hidden /> : <PartyPopper className="w-5 h-5 shrink-0 text-amber-300" aria-hidden />}
        {noTitles ? t(occasionId ? 'acervo.emptyOccasion' : shelf.media === 'tv' ? 'acervo.noSeries' : 'acervo.noMovies') : t('acervo.allDone')}
      </p>
    );
  } else {
    body = (
      <AcervoGrid
        shelf={shelf}
        userId={userId}
        moodShelf={!occasionId}
        openingKey={openingKey}
        onOpen={openItem}
        onLoadMore={loadMore}
        scrollRoot={scrollRef}
      />
    );
  }

  return (
    <div ref={rootRef} tabIndex={-1} className="min-h-full flex flex-col outline-none" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)' }}>
      {/* Topo: sair e o nome. Fica preso no alto enquanto a grade rola; fundo
          quase opaco, e só os últimos 10 px esmaecem. */}
      <header
        className="sticky top-0 z-10 pb-2"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          background: `linear-gradient(180deg, ${withAlpha(NIGHT, 0.97)} 0%, ${withAlpha(NIGHT, 0.95)} calc(100% - 10px), ${withAlpha(NIGHT, 0)} 100%)`,
        }}
      >
        <div className="mx-auto max-w-[1200px] h-[52px] sm:h-14 px-2 sm:px-6 grid grid-cols-[1fr_auto_1fr] items-center">
          <button
            type="button"
            onClick={onExit}
            aria-label={t('acervo.exitAria')}
            className={`justify-self-start grid place-items-center w-11 h-11 rounded-xl hover:bg-white/[0.06] transition-colors ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            <ArrowLeft className="w-5 h-5" aria-hidden />
          </button>
          <h1 style={{ ...PIXEL, color: PAPER }} className="text-[20px] sm:text-[24px] leading-none whitespace-nowrap">
            {t('acervo.title')}
          </h1>
          <span aria-hidden />
        </div>
      </header>

      {/* div, e não <main>: o <main> do site continua por baixo da camada. */}
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 flex-1">
        <div className="mt-2">
          <AcervoTabs
            active={filter.oracle}
            panelId={panelId}
            onSelect={(oracle) => onFilter({ ...filter, oracle })}
            onOpenProfile={setProfileOracle}
          />
        </div>

        <div className="mt-5">
          <MoodPicker
            active={moodKey}
            off={!!occasionId}
            onSelect={(mood) => onFilter({ ...filter, mood, occasion: null })}
            media={filter.media}
            onMedia={selectMedia}
          />
        </div>

        <div className="mt-3 sm:mt-4">
          <OccasionChips occasions={chipList} active={occasionId} onSelect={selectOccasion} />
        </div>

        <section ref={sectionRef} id={panelId} role="tabpanel" aria-labelledby={`acervo-tab-${filter.oracle}`} className="mt-6 sm:mt-8">
          {/* O nome da prateleira e quantos títulos faltam (altura reservada:
              nada pula quando o número chega). */}
          <div className="mb-4 sm:mb-5 min-h-[50px]">
            <h2 style={PIXEL} className="flex items-center gap-2 text-[21px] sm:text-[26px] leading-tight min-w-0">
              <span style={{ color: current.color }} className="shrink-0">
                {current.name}
              </span>
              {shelfName && (
                <>
                  <span aria-hidden style={{ color: MIST }} className="shrink-0">
                    ·
                  </span>
                  <span className="truncate" style={{ color: PAPER }}>
                    {shelfName}
                  </span>
                </>
              )}
              {OccIcon ? (
                <OccIcon className="w-5 h-5 shrink-0" style={{ color: MIST }} aria-hidden />
              ) : (
                MoodIcon && <MoodIcon className="w-5 h-5 shrink-0" style={{ color: moodInfo?.color }} aria-hidden />
              )}
            </h2>
            <p className="mt-1 text-sm h-5" style={{ color: MIST }} aria-live="polite">
              {ready && shelf.unrated > 0
                ? occasionId
                  ? `${t('acervo.count', { count: shelf.unrated })} · ${t('acervo.allMoods')}`
                  : t('acervo.count', { count: shelf.unrated })
                : ' '}
            </p>
          </div>
          {body}
        </section>
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
  const [params, setParams] = useSearchParams();

  // O filtro pedido pela URL (com o ?ask= antigo traduzido).
  const asked = useMemo(() => readAcervoParams(params), [params]);
  const filter: Filter = useMemo(
    () => ({ oracle: asked.oracle, media: asked.media, occasion: asked.occasion, mood: asked.occasion ? null : asked.mood }),
    [asked]
  );

  const writeFilter = useCallback(
    (next: Filter) => {
      const out = new URLSearchParams();
      out.set('oracle', next.oracle);
      if (next.occasion) out.set('ocasiao', next.occasion);
      else if (next.mood && isAcervoMood(next.mood)) out.set('mood', next.mood);
      out.set('type', next.media);
      if (out.toString() === params.toString()) return;
      setParams(out, { replace: true, state: location.state });
    },
    [params, setParams, location.state]
  );

  // Sair: volta para a tela de onde a pessoa veio dentro do site; quem entrou
  // direto pelo endereço (um link no WhatsApp, o favorito) vai para a home, e
  // não para fora do site. O React Router numera as entradas do histórico
  // (state.idx): 0 é a primeira tela do site nesta aba. As trocas de filtro
  // usam replace e não mudam o número.
  const exit = useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  }, [navigate]);

  return (
    <AcervoLayer label={t('acervo.title')} onExit={exit}>
      <AcervoScreen filter={filter} onFilter={writeFilter} onExit={exit} />
    </AcervoLayer>
  );
}
