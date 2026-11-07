import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MovieDetailsModal from '../MovieDetailsModal';
import PersonalityCompletionModal from '../PersonalityCompletionModal';
import { getFullTitle } from '../../lib/titleCards';
import { ORACLE_BY_ID, withAlpha } from '../../lib/oracleTheme';
import type { Movie } from '../../lib/tmdb';
import { isMesaSoundOn, setMediaPref, setMesaSound, touchUseDay } from '../../lib/mesa/prefs';
import { primeMesaAudio } from '../../lib/mesa/sound';
import type { MediaFilter, Seat } from '../../lib/mesa/types';
import type { Speaker } from '../../lib/mesa/dialogue/types';
import { useDialogFocus, useLayerStack, useMesaLayerEntry } from './MesaLayer';
import { useMesa, ORACLE_SEATS } from './useMesa';
import { useBrtDay } from './useBrtDay';
import { useMesaKeyboard } from './useMesaKeyboard';
import MesaTopBar from './MesaTopBar';
import MirrorLine from './MirrorLine';
import MesaStage from './MesaStage';
import MesaSpeechBand from './MesaSpeechBand';
import CardReading from './CardReading';
import AskHand from './AskHand';
import AskDrawer from './AskDrawer';
import BookDrawer from './BookDrawer';
import HowSheet from './HowSheet';
import NewDayBanner from './NewDayBanner';
import MesaEntrance from './MesaEntrance';
import MesaCard from './MesaCard';
import { askName } from './mesaText';

// A Mesa inteira (SPEC §2 e §7.2), 05/11/2026: topo, Espelho, palco, faixa de
// fala, leitura e a mão de perguntas, mais as camadas por cima (Todas, Livro,
// Como funciona, a ficha do título, a revelação da Persona). No celular tudo
// numa coluna, com a mão fixa no pé; no computador o palco à esquerda e a
// leitura numa coluna fixa de 380 px à direita.

interface ScreenProps {
  initialAsk: string | null;
  initialMedia: MediaFilter;
  desktop: boolean;
  reduced: boolean;
  ritual: boolean;
  onRitualStart: () => void;
}

const MesaScreen: React.FC<ScreenProps> = ({ initialAsk, initialMedia, desktop, reduced, ritual, onRitualStart }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const stack = useLayerStack();
  const [entering, setEntering] = useState(ritual);
  const mesa = useMesa({ initialAsk, initialMedia, desktop, reduced, stageReady: !entering });
  const p = mesa.payload;
  const cardStyle = p?.me.card_style ?? 'default';
  const newDay = useBrtDay(p?.day ?? null);

  const [askOpen, setAskOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [sound, setSound] = useState(isMesaSoundOn());
  const [useDays] = useState(() => touchUseDay());
  const [modal, setModal] = useState<{ movie: Movie; cardId: string | null; opener: HTMLElement | null } | null>(null);

  useEffect(() => {
    if (ritual) onRitualStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Cartas: refs, foco e rabicho da faixa -------------------------------------
  const cardEls = useRef<Partial<Record<Seat, HTMLButtonElement | null>>>({});
  const bandRef = useRef<HTMLDivElement>(null);
  const readingRef = useRef<HTMLDivElement>(null);
  const registerCard = useCallback((seat: Seat, el: HTMLButtonElement | null) => {
    cardEls.current[seat] = el;
  }, []);
  const tailFor = useCallback(
    (who: Speaker): string | null => {
      if (who === 'espelho') return null;
      const el = cardEls.current[who];
      const band = bandRef.current;
      if (!el || !band) return { bogart: '17%', fincher: '50%', cypher: '83%' }[who];
      const a = el.getBoundingClientRect();
      const b = band.getBoundingClientRect();
      if (!b.width) return '50%';
      const x = ((a.left + a.width / 2 - b.left) / b.width) * 100;
      return `${Math.max(4, Math.min(96, x))}%`;
    },
    []
  );
  // Re-render no resize para o rabicho acompanhar.
  const [, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((n) => n + 1);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // Quando uma carta é trocada, o foco vai para a carta nova.
  const seenFlipIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    mesa.flipOnMount.forEach((id) => {
      if (seenFlipIds.current.has(id)) return;
      seenFlipIds.current.add(id);
      const seat = p?.cards.find((c) => c.id === id)?.seat;
      if (seat) window.setTimeout(() => cardEls.current[seat]?.focus({ preventScroll: true }), 620);
    });
  }, [mesa.flipOnMount, p]);

  const focusReadingOnMobile = () => {
    if (desktop) return;
    window.setTimeout(() => {
      const el = readingRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top > window.innerHeight - 160) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }, reduced ? 0 : 560);
  };

  // ---- Ficha completa (MovieDetailsModal, z 9999) -------------------------------------
  const openDetails = useCallback((ref: { id: number; media_type: 'movie' | 'tv' }, cardId: string | null, opener: HTMLElement | null) => {
    getFullTitle(ref).then(
      (movie) => setModal({ movie, cardId, opener }),
      () => undefined
    );
  }, []);
  const closeModal = useCallback(() => {
    setModal((m) => {
      if (m) {
        window.setTimeout(() => m.opener?.focus({ preventScroll: true }), 30);
        void mesa.afterDetails(m.cardId);
      }
      return null;
    });
  }, [mesa]);
  useMesaLayerEntry(!!modal, closeModal, { ownEscape: true, modal: true });
  useMesaLayerEntry(!!mesa.reveal, mesa.closeReveal, { ownEscape: true, modal: true });
  useDialogFocus(!!mesa.reveal);

  // ---- Ativar uma carta ---------------------------------------------------------------
  const activate = useCallback(
    (seat: Seat) => {
      primeMesaAudio();
      const card = mesa.cardAt(seat);
      if (!card) return;
      if (card.state === 'down') {
        void mesa.flip(seat);
        if (!(seat === 'cypher' && mesa.seal === 'locked')) focusReadingOnMobile();
        return;
      }
      if (mesa.focusSeat === seat) openDetails({ id: card.title.tmdb_id, media_type: card.title.media_type }, card.id, cardEls.current[seat] ?? null);
      else {
        mesa.setFocusSeat(seat);
        focusReadingOnMobile();
      }
    },
    [mesa, openDetails] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const seatsInOrder = (): Seat[] => [...ORACLE_SEATS, 'espelho' as Seat].filter((s) => mesa.cardAt(s) || mesa.passedAt(s));
  const onCardKey = (seat: Seat, e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const list = seatsInOrder();
    const i = list.indexOf(seat);
    const next = list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
    cardEls.current[next]?.focus();
  };

  useMesaKeyboard({
    isEnabled: () => !entering && stack.depth() === 0,
    onSeat: (seat) => {
      if (!mesa.cardAt(seat)) return;
      cardEls.current[seat]?.focus();
      activate(seat);
    },
    onAsk: () => setAskOpen(true),
    onBook: () => setBookOpen(true),
  });

  // ---- Ações da leitura -------------------------------------------------------------
  const seat = mesa.focusSeat;
  const focused = seat ? mesa.cardAt(seat) : null;
  const reading = focused && focused.state !== 'down' ? focused : null;
  const recon = p?.mode === 'recon';
  const allPassed = !!p && p.cards.filter((c) => c.seat !== 'espelho').length === 0 && p.passed.length > 0;
  const currentAskMedia = p?.ask?.media ?? null;
  // A pergunta na mesa é a do payload (o servidor pode ter aberto com ela).
  const askKey = mesa.loading ? mesa.ask : p?.ask?.key ?? mesa.ask;
  const readingColor = reading ? (reading.seat === 'espelho' ? '#B9A6FF' : ORACLE_BY_ID[reading.title.oracle].color) : '#B9A6FF';

  const ask = (key: string) => {
    primeMesaAudio();
    setAskOpen(false);
    if (key === askKey) return;
    mesa.setAsk(key);
  };
  const clearAsk = () => {
    setAskOpen(false);
    if (askKey) mesa.setAsk(null);
  };
  const exit = () => navigate('/');
  // Para o Acervo (pedido do WP-ACERVO): o "← Mesa" de lá faz navigate(-1) com
  // state.fromMesa. Antes de sair, a pergunta da vez vai para a URL desta
  // entrada do histórico (replaceState, sem renderizar de novo), e a Mesa
  // reabre na mesma pergunta quando a pessoa volta.
  const goAcervo = (path: string) => {
    try {
      const url = new URL(window.location.href);
      if (askKey) url.searchParams.set('ask', askKey);
      else url.searchParams.delete('ask');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* sem a URL atualizada, a volta abre a tiragem do dia */
    }
    navigate(path, { state: { fromMesa: true, ask: askKey } });
  };

  // ---- O 4º assento no celular: ao lado da frase do Espelho --------------------------
  const espelhoCard = !desktop ? mesa.cardAt('espelho') : null;
  const espelhoSide = espelhoCard ? (
    <div className="shrink-0 flex flex-col items-center" style={{ width: 62 }}>
      <div className="relative w-[46px]" style={{ aspectRatio: '196 / 292' }}>
        <div className="absolute inset-0">
          <MesaCard
            seat="espelho"
            card={espelhoCard}
            cardStyle={cardStyle}
            focused={mesa.focusSeat === 'espelho'}
            seal={null}
            shakeN={0}
            seenRating={mesa.seenFlash[espelhoCard.id] ?? null}
            desktop={false}
            reduced={reduced}
            compact
            flipOnMount={mesa.flipOnMount.has(espelhoCard.id)}
            onFlipMounted={() => mesa.consumeFlipOnMount(espelhoCard.id)}
            onActivate={() => activate('espelho')}
            tabIndex={-1}
            btnRef={(el) => registerCard('espelho', el)}
            onKeyDown={(e) => onCardKey('espelho', e)}
            espelhoLabel={espelhoCard.kind === 'reveal' ? t('mesa.card.reveal') : t('mesa.card.espelho4')}
          />
        </div>
      </div>
      <p className="mt-1 text-[10px] leading-[11px] text-center line-clamp-2" style={{ color: '#B9A6FF' }}>
        {espelhoCard.kind === 'reveal' ? t('mesa.card.reveal') : t('mesa.card.espelho4')}
      </p>
    </div>
  ) : null;

  const mirror = (
    <MirrorLine
      line={mesa.mirror}
      loading={mesa.loading}
      desktop={desktop}
      reduced={reduced}
      recon={recon && p ? { counted: p.me.persona_progress.counted } : null}
      side={espelhoSide}
    />
  );
  const stage = (
    <MesaStage mesa={mesa} desktop={desktop} reduced={reduced} cardStyle={cardStyle} onActivate={activate} registerCard={registerCard} onCardKey={onCardKey} />
  );
  const band = (
    <div ref={bandRef}>
      <MesaSpeechBand current={mesa.speech.current} last={mesa.speech.last} onSkip={mesa.speech.skip} reduced={reduced} tailFor={tailFor} loading={mesa.loading} />
    </div>
  );
  const readingEl = (
    <div ref={readingRef} className="scroll-mt-16">
      <CardReading
        card={reading}
        recon={recon}
        desktop={desktop}
        reduced={reduced}
        error={mesa.error}
        loading={mesa.loading}
        rulerOpen={!!seat && mesa.ruler === seat}
        saving={!!seat && mesa.saving === seat}
        busy={!!seat && (mesa.busy === seat || mesa.saving === seat)}
        sealPending={mesa.seal === 'locked'}
        anyDown={!!p?.cards.some((c) => c.state === 'down')}
        onRetry={mesa.retry}
        onWant={() => seat && void mesa.want(seat)}
        onSeen={() => seat && mesa.setRuler(seat)}
        onRate={(n) => seat && void mesa.rate(seat, n)}
        onCancelRuler={() => mesa.setRuler(null)}
        onRefuse={() => seat && void mesa.refuse(seat)}
        onNotSeen={() => seat && void mesa.notSeen(seat)}
        onDetails={(e) => reading && openDetails({ id: reading.title.tmdb_id, media_type: reading.title.media_type }, reading.id, e.currentTarget)}
        onMore={() => reading && goAcervo(`/oracle/acervo?oracle=${reading.title.oracle}&mood=${reading.title.mood}&type=${reading.title.media_type}`)}
        onAnchor={(ref) => openDetails(ref, null, document.activeElement as HTMLElement | null)}
      />
    </div>
  );
  const hand = (
    <AskHand asks={p?.asks ?? null} current={askKey} desktop={desktop} highlight={allPassed} onAsk={ask} onAll={() => setAskOpen(true)} />
  );

  return (
    <div className="ms-root relative min-h-full flex flex-col" onPointerDownCapture={primeMesaAudio}>
      <MesaTopBar
        desktop={desktop}
        askLabel={askKey ? askName(t, askKey) : null}
        onBack={exit}
        onClearAsk={clearAsk}
        onBook={() => setBookOpen(true)}
        media={mesa.media}
        onMedia={(m) => {
          setMediaPref(m);
          mesa.setMedia(m);
        }}
        sound={sound}
        onSound={(on) => {
          setMesaSound(on);
          setSound(on);
          if (on) primeMesaAudio();
        }}
        showFlipAll={useDays >= 3 && !!p?.cards.some((c) => c.seat !== 'espelho' && c.state === 'down')}
        onFlipAll={() => void mesa.flipAll()}
        onAcervo={() => goAcervo('/oracle/acervo')}
        onHow={() => setHowOpen(true)}
      >
        <NewDayBanner show={newDay && !entering} onShow={mesa.reloadToday} reduced={reduced} />
      </MesaTopBar>

      {desktop ? (
        // Ordem do Tab (§2.15): topo → Espelho → cartas → leitura → mão. A mão
        // fica embaixo do palco na tela, mas depois da leitura no DOM.
        <main className="flex-1 w-full max-w-[1200px] mx-auto px-6 pb-6 grid gap-x-10" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px', gridTemplateRows: 'auto 1fr' }}>
          <div className="min-w-0 pt-3 flex flex-col" style={{ gridColumn: 1, gridRow: 1 }}>
            {mirror}
            <div className="mt-1">{stage}</div>
            <div className="mt-7">{band}</div>
          </div>
          <aside className="pt-4 self-start sticky top-[64px]" style={{ gridColumn: 2, gridRow: '1 / span 2' }}>
            {/* A coluna da leitura: a luz do abajur cai na cor de quem trouxe a carta. */}
            <div
              className="ms-reading-col rounded-[18px] px-6 py-6 min-h-[540px] transition-[background] duration-300"
              style={{
                background: `radial-gradient(120% 60% at 0% 0%, ${withAlpha(readingColor, 0.13)}, transparent 62%), linear-gradient(180deg, rgba(243,234,211,0.04), rgba(243,234,211,0.012) 60%, transparent)`,
              }}
            >
              {readingEl}
            </div>
          </aside>
          <div className="min-w-0 mt-6" style={{ gridColumn: 1, gridRow: 2 }}>
            {hand}
          </div>
        </main>
      ) : (
        <>
          <main className="flex-1 w-full max-w-[560px] mx-auto px-4 pt-2 pb-4">
            {mirror}
            <div className="mt-1">{stage}</div>
            <div className="mt-5">{band}</div>
            <div className="mt-3 min-h-[300px]">{readingEl}</div>
          </main>
          {/* A mão: fundo NIGHT sólido (o rótulo e as fichas nunca ficam por
              cima do texto que rola) e um degradê curto acima dela (QA M6). */}
          <div className="sticky bottom-0 z-20 pt-2 pb-[max(10px,env(safe-area-inset-bottom))]" style={{ background: '#120D22' }}>
            <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-full h-4" style={{ background: 'linear-gradient(0deg, #120D22, rgba(18,13,34,0))' }} />
            <div className="max-w-[560px] mx-auto px-4">{hand}</div>
          </div>
        </>
      )}

      {entering && <MesaEntrance dataReady={!mesa.loading} desktop={desktop} onDone={() => setEntering(false)} />}

      <AskDrawer open={askOpen} asks={p?.asks ?? null} current={askKey} currentMedia={currentAskMedia} onClose={() => setAskOpen(false)} onAsk={ask} onClear={clearAsk} />
      <BookDrawer open={bookOpen} onClose={() => setBookOpen(false)} reduced={reduced} modalOpen={!!modal} onOpenTitle={(ref) => openDetails(ref, null, document.activeElement as HTMLElement | null)} />
      <HowSheet open={howOpen} onClose={() => setHowOpen(false)} desktop={desktop} />
      {modal && <MovieDetailsModal movie={modal.movie} isOpen onClose={closeModal} />}
      {mesa.reveal && (
        <PersonalityCompletionModal
          isOpen
          onClose={mesa.closeReveal}
          persona={mesa.reveal.persona}
          changed={mesa.reveal.mode === 'changed'}
          recast={mesa.reveal.mode === 'recast'}
        />
      )}
    </div>
  );
};

export default MesaScreen;
