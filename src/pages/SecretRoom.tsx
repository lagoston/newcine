import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Lock, Skull } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import type { Movie } from '../lib/tmdb';
import { getFullTitle } from '../lib/titleCards';
import MovieDetailsModal from '../components/MovieDetailsModal';
import UserAvatar from '../components/UserAvatar';
import GlassLoader from '../components/GlassLoader';
import { useSeasonalEvent } from '../contexts/SeasonalEventContext';
import { PIXEL, FOCUS_RING } from '../lib/oracleTheme';
import {
  TERROR_CLUB,
  cardKey,
  cardPoster,
  cardTitle,
  fetchSecretRoom,
  fetchSecretRoomPredictions,
  pick,
  type RoomCard,
  type SecretRoomData,
  type SecretRoomPredictions,
} from '../lib/secretRooms';
import SecretRoomEntrance from '../components/secretRoom/SecretRoomEntrance';
import {
  BannedCard,
  HeartbeatRule,
  MemberLeading,
  OwnerRating,
  PosterTile,
  RankChip,
  RealPersonCard,
  RecMark,
  ShelfFrame,
  TwistTile,
  type TileContext,
} from '../components/secretRoom/RoomShelves';
import { ASH, BLOOD_TEXT, BONE, CANDLE, CoffinMark, CRYPT, CRYPT_BACKGROUND, CRYPT_RAISED, OXBLOOD } from '../components/secretRoom/terrorTheme';

// Sala secreta (/sala/clube-do-terror). Por enquanto só existe o Clube do
// Terror: Sombrio e Assustador dos três oráculos, dissecado em prateleiras
// (os mais assustadores segundo os batimentos, os proibidos, os monstros
// reais, as viradas, zumbis, vampiros…), as estantes sombrias de quem
// também tem a chave e as notas previstas de quem está olhando.
//
// Quem entra: ver lib/secretRooms.ts. ?via=<username> é a entrada pelo
// portal do perfil de alguém.

const ROOMS = new Set([TERROR_CLUB]);

const BUTTON = `inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-sm font-semibold transition ${FOCUS_RING}`;

export default function SecretRoom() {
  const { roomKey = '' } = useParams();
  const [searchParams] = useSearchParams();
  const via = searchParams.get('via');
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const pt = i18n.language.startsWith('pt');

  const [data, setData] = useState<SecretRoomData | null>(null);
  const [error, setError] = useState(false);
  const [predictions, setPredictions] = useState<SecretRoomPredictions | null>(null);
  const [selected, setSelected] = useState<Movie | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const room = await fetchSecretRoom(roomKey, via);
      setData(room);
    } catch (e) {
      console.error('secret room', e);
      setError(true);
    }
  }, [roomKey, via]);

  const loadPredictions = useCallback(async () => {
    try {
      setPredictions(await fetchSecretRoomPredictions(roomKey, via));
    } catch (e) {
      console.error('secret room predictions', e);
    }
  }, [roomKey, via]);

  useEffect(() => {
    if (!userId || !ROOMS.has(roomKey)) return;
    load();
  }, [userId, roomKey, load]);

  const granted = Boolean(data?.access?.granted);
  useEffect(() => {
    if (granted) loadPredictions();
  }, [granted, loadPredictions]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [roomKey]);

  const ctx: TileContext = useMemo(
    () => ({
      pt,
      predicted: (card) => predictions?.pred[cardKey(card)] ?? card.predicted ?? null,
      seen: (card) => {
        const map = predictions?.seen;
        if (!map) return undefined;
        const key = cardKey(card);
        return key in map ? map[key] : undefined;
      },
      onOpen: async (card) => {
        try {
          setSelected(await getFullTitle({ id: card.id, media_type: card.type }));
        } catch {
          setSelected({
            id: card.id,
            title: cardTitle(card, pt),
            poster_path: (pt ? card.p_pt || card.p_en : card.p_en || card.p_pt) || '',
            overview: '',
            release_date: card.y ? `${card.y}-01-01` : '',
            vote_average: 0,
            runtime: 0,
            genres: [],
            media_type: card.type,
          });
        }
      },
    }),
    [pt, predictions]
  );

  if (!ROOMS.has(roomKey)) return <Navigate to="/oracle" replace />;

  const label = t('secretRoom.terror.name');

  if (error) {
    return (
      <RoomShell>
        <div className="mx-auto max-w-xl px-5 pt-24 text-center">
          <p style={{ color: ASH }}>{t('secretRoom.loadError')}</p>
          <button onClick={load} className={`${BUTTON} mt-5`} style={{ color: BONE, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.2)' }}>
            <RefreshCw className="w-4 h-4" aria-hidden />
            {t('common.retry')}
          </button>
        </div>
      </RoomShell>
    );
  }

  if (!data) {
    return (
      <RoomShell>
        <div className="pt-32 flex justify-center">
          <GlassLoader size="lg" label={t('common.loading')} />
        </div>
      </RoomShell>
    );
  }

  if (!granted) return <LockedRoom data={data} via={via} />;

  const shelves = data.shelves ?? [];
  const members = data.members;
  const me = data.me;
  const access = data.access;
  const midnight = predictions?.midnight ?? null;
  const haunt = predictions?.haunt ?? [];
  const shelfTitle = (s: { title_pt: string; title_en: string }) => pick(pt, s.title_pt, s.title_en);
  const shelfHint = (s: { hint_pt: string | null; hint_en: string | null }) => pick(pt, s.hint_pt, s.hint_en);
  // Ordem da sala: o que só existe aqui (batimentos, proibidos, monstros
  // reais, viradas) vem antes do ritual; os subgêneros, depois.
  const SIGNATURE = ['science', 'banned', 'real', 'twists'];
  const firstShelves = shelves.filter((s) => SIGNATURE.includes(s.key));
  const restShelves = shelves.filter((s) => !SIGNATURE.includes(s.key));

  const renderShelf = (shelf: (typeof shelves)[number]) => {
    if (shelf.kind === 'real') {
      return (
        <ShelfFrame key={shelf.key} id={shelf.key} title={shelfTitle(shelf)} hint={shelfHint(shelf)}>
          {(wasDrag) => shelf.items.map((item) => <RealPersonCard key={item.person.name} person={item.person} titles={item.titles} ctx={ctx} wasDrag={wasDrag} />)}
        </ShelfFrame>
      );
    }
    if (shelf.kind === 'banned') {
      return (
        <ShelfFrame key={shelf.key} id={shelf.key} title={shelfTitle(shelf)} hint={shelfHint(shelf)} accent={BLOOD_TEXT}>
          {(wasDrag) => shelf.items.map((card) => <BannedCard key={cardKey(card)} card={card} ctx={ctx} wasDrag={wasDrag} />)}
        </ShelfFrame>
      );
    }
    if (shelf.kind === 'twist') {
      return (
        <ShelfFrame key={shelf.key} id={shelf.key} title={shelfTitle(shelf)} hint={shelfHint(shelf)} accent={CANDLE}>
          {(wasDrag) => shelf.items.map((card) => <TwistTile key={cardKey(card)} card={card} ctx={ctx} wasDrag={wasDrag} />)}
        </ShelfFrame>
      );
    }
    if (shelf.kind === 'science') {
      const top = shelf.items.find((c) => c.bpm);
      return (
        <ShelfFrame
          key={shelf.key}
          id={shelf.key}
          title={shelfTitle(shelf)}
          hint={shelfHint(shelf)}
          decoration={
            <>
              <HeartbeatRule />
              {top?.bpm && (
                <p className="mt-1 text-sm" style={{ color: BLOOD_TEXT }}>
                  {t('secretRoom.science.topLine', { title: cardTitle(top, pt), from: top.bpm.from, to: top.bpm.to, peak: top.bpm.peak })}
                </p>
              )}
            </>
          }
        >
          {(wasDrag) => shelf.items.map((card) => <PosterTile key={cardKey(card)} card={card} ctx={ctx} wasDrag={wasDrag} overlay={card.rank ? <RankChip rank={card.rank} /> : null} />)}
        </ShelfFrame>
      );
    }
    return (
      <ShelfFrame key={shelf.key} id={shelf.key} title={shelfTitle(shelf)} hint={shelfHint(shelf)}>
        {(wasDrag) => shelf.items.map((card) => <PosterTile key={cardKey(card)} card={card} ctx={ctx} wasDrag={wasDrag} overlay={shelf.key === 'found-footage' ? <RecMark /> : null} />)}
      </ShelfFrame>
    );
  };

  return (
    <RoomShell>
      <SecretRoomEntrance room={roomKey} ready label={label} />

      {/* ---------- Cabeçalho ---------- */}
      <header className="mx-auto max-w-6xl px-5 sm:px-8 pt-5 sm:pt-9">
        <div className="flex items-center justify-between gap-3">
          {/* No celular a volta fica só com a seta, pra caber os rostos. */}
          <Link
            to="/oracle"
            aria-label={t('oracle.title')}
            className={`-ml-2 shrink-0 inline-flex items-center gap-1.5 h-11 px-2 rounded-xl hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
            style={{ color: ASH }}
          >
            <ArrowLeft className="w-[18px] h-[18px]" aria-hidden />
            <span className="hidden sm:inline">{t('oracle.title')}</span>
          </Link>
          {members && members.count > 0 && <MemberStack members={members} />}
        </div>

        {access.mode === 'portal' && access.via && (
          <p className="mt-4 inline-flex items-center gap-2.5 rounded-full pl-1 pr-4 py-1 text-sm" style={{ background: CRYPT_RAISED, color: BONE, boxShadow: 'inset 0 0 0 1px rgba(255,181,71,0.3)' }}>
            <UserAvatar user={access.via} size={30} plain />
            {t('secretRoom.viaPortal', { username: access.via.username })}
          </p>
        )}

        <div className="mt-6 flex items-start gap-4 sm:gap-5">
          <CoffinMark className="w-11 h-[70px] sm:w-14 sm:h-[90px] shrink-0 mt-1" />
          <div className="min-w-0">
            <h1 style={{ ...PIXEL, color: BONE }} className="text-[2.6rem] sm:text-6xl leading-[0.95]">
              {label}
            </h1>
            <p className="mt-3 text-[15px] sm:text-base max-w-xl leading-relaxed" style={{ color: ASH }}>
              {t('secretRoom.terror.tagline')}
            </p>
          </div>
        </div>

        {me && <FearMeter me={me} isGuest={access.mode === 'portal'} />}
      </header>

      {/* ---------- Sessão da meia-noite ---------- */}
      <MidnightSession card={midnight} loading={!predictions} pt={pt} onOpen={ctx.onOpen} />

      {/* ---------- Para te assombrar ---------- */}
      {haunt.length > 0 && (
        <ShelfFrame id="haunt" title={t('secretRoom.haunt.title')} hint={t('secretRoom.haunt.hint')} accent={CANDLE}>
          {(wasDrag) => haunt.map((card) => <PosterTile key={cardKey(card)} card={card} ctx={ctx} wasDrag={wasDrag} />)}
        </ShelfFrame>
      )}

      {firstShelves.map(renderShelf)}

      {/* ---------- O ritual do ano ---------- */}
      {data.ritual && data.ritual.items.length > 0 && (
        <ShelfFrame
          id="ritual"
          title={t('secretRoom.ritual.title', { edition: data.ritual.edition })}
          hint={data.ritual.live ? t('secretRoom.ritual.hintLive') : t('secretRoom.ritual.hintPast')}
          accent="#FF8A1F"
        >
          {(wasDrag) => data.ritual!.items.map((card) => <PosterTile key={cardKey(card)} card={card} ctx={ctx} wasDrag={wasDrag} />)}
        </ShelfFrame>
      )}

      {restShelves.map(renderShelf)}

      {/* ---------- As criptas de quem tem a chave ---------- */}
      {(data.member_shelves ?? []).map(({ user, items }) => (
        <ShelfFrame
          key={user.id}
          id={`member-${user.id}`}
          leading={<MemberLeading user={user} />}
          title={t('secretRoom.members.cryptOf', { username: user.username })}
          hint={user.is_via ? t('secretRoom.members.hintVia', { username: user.username }) : t('secretRoom.members.hint', { username: user.username })}
          accent={CANDLE}
        >
          {(wasDrag) =>
            items.map((card) => (
              <PosterTile
                key={cardKey(card)}
                card={card}
                ctx={ctx}
                wasDrag={wasDrag}
                overlay={typeof card.rating === 'number' ? <OwnerRating rating={card.rating} username={user.username} /> : null}
              />
            ))
          }
        </ShelfFrame>
      ))}

      <HowToEnter live={Boolean(access.event_live)} tagName={access.tag?.name ?? 'Deadly Sleeping'} />

      {selected && <MovieDetailsModal movie={selected} isOpen onClose={() => setSelected(null)} isOtherUserProfile={false} />}
    </RoomShell>
  );
}

// O fundo da cripta, por cima do fundo do site.
const RoomShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative min-h-screen pb-20 isolate overflow-x-clip" style={{ background: CRYPT_BACKGROUND, color: BONE }}>
    {children}
  </div>
);

// Os rostos de quem tem a chave.
const MemberStack: React.FC<{ members: NonNullable<SecretRoomData['members']> }> = ({ members }) => {
  const { t } = useTranslation();
  const shown = members.people.slice(0, 6);
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <ul className="flex -space-x-2.5" aria-label={t('secretRoom.members.aria')}>
        {shown.map((p, i) => (
          <li key={p.id} className={i >= 4 ? 'hidden sm:block' : undefined}>
            <Link to={`/profile/${p.username}`} className={`block rounded-full ${FOCUS_RING}`} title={`@${p.username}`} style={{ boxShadow: `0 0 0 2px ${CRYPT}` }}>
              <UserAvatar user={p} size={32} plain />
            </Link>
          </li>
        ))}
      </ul>
      <span className="text-sm whitespace-nowrap" style={{ color: ASH }}>
        {t('secretRoom.members.count', { count: members.count })}
      </span>
    </div>
  );
};

// O medômetro: quanto de Sombrio e Assustador a pessoa já encarou.
const FearMeter: React.FC<{ me: NonNullable<SecretRoomData['me']>; isGuest: boolean }> = ({ me, isGuest }) => {
  const { t, i18n } = useTranslation();
  const share = me.x_total > 0 ? Math.min(1, me.x_rated / me.x_total) : 0;
  const avg = typeof me.x_avg === 'number' ? Number(me.x_avg).toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;
  const ahead = me.rank ? me.rank - 1 : null;
  return (
    <div className="mt-7 max-w-2xl">
      <p className="text-[15px] leading-snug" style={{ color: BONE }}>
        {me.x_rated === 0 ? t('secretRoom.meter.none', { total: me.x_total }) : t('secretRoom.meter.faced', { count: me.x_rated, total: me.x_total })}
        {avg && me.x_rated > 0 ? ` ${t('secretRoom.meter.average', { avg })}` : ''}
      </p>
      <div
        className="mt-2.5 h-2 rounded-full overflow-hidden"
        style={{ background: 'rgba(142,27,43,0.35)' }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={me.x_total}
        aria-valuenow={me.x_rated}
        aria-label={t('secretRoom.meter.aria')}
      >
        <span className="block h-full rounded-full" style={{ width: `${Math.max(share * 100, me.x_rated > 0 ? 1.5 : 0)}%`, background: `linear-gradient(90deg, ${OXBLOOD}, ${CANDLE})` }} />
      </div>
      {!isGuest && ahead !== null && me.x_rated > 0 && (
        <p className="mt-2 text-sm" style={{ color: ASH }}>
          {ahead === 0 ? t('secretRoom.meter.first') : t('secretRoom.meter.ahead', { count: ahead })}
        </p>
      )}
    </div>
  );
};

// A Sessão da meia-noite: o filme sombrio de hoje, escolhido para quem
// está olhando.
const MidnightSession: React.FC<{ card: RoomCard | null; loading: boolean; pt: boolean; onOpen: (card: RoomCard) => void }> = ({ card, loading, pt, onOpen }) => {
  const { t } = useTranslation();
  if (!loading && !card) return null;
  const backdrop = card?.b ? `https://image.tmdb.org/t/p/w1280${card.b}` : null;
  const poster = card ? cardPoster(card, pt, 'w342') : null;
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8 mt-9" aria-labelledby="room-midnight">
      <div className="relative overflow-hidden rounded-3xl min-h-[260px] sm:min-h-[340px]" style={{ background: CRYPT_RAISED, boxShadow: 'inset 0 0 0 1px rgba(255,181,71,0.18), 0 30px 60px -36px rgba(0,0,0,0.9)' }}>
        {loading ? (
          <span className="absolute inset-0 poster-skeleton" aria-hidden />
        ) : (
          <>
            {backdrop && <img src={backdrop} alt="" aria-hidden decoding="async" className="absolute inset-0 w-full h-full object-cover opacity-55" />}
            <span
              aria-hidden
              className="absolute inset-0"
              style={{ background: `linear-gradient(90deg, ${CRYPT} 8%, rgba(15,8,17,0.82) 45%, rgba(15,8,17,0.35)), linear-gradient(0deg, ${CRYPT}, transparent 55%)` }}
            />
          </>
        )}
        <div className="relative flex items-end gap-5 p-5 sm:p-8 min-h-[260px] sm:min-h-[340px]">
          {poster && card && (
            <button type="button" onClick={() => onOpen(card)} className={`hidden sm:block w-[150px] shrink-0 rounded-xl overflow-hidden shadow-2xl ${FOCUS_RING}`} aria-label={cardTitle(card, pt)}>
              <img src={poster} alt="" className="block w-full h-auto" decoding="async" />
            </button>
          )}
          <div className="min-w-0 max-w-xl">
            <h2 id="room-midnight" style={{ ...PIXEL, color: CANDLE }} className="text-xl sm:text-2xl leading-none">
              {t('secretRoom.midnight.title')}
            </h2>
            {card ? (
              <>
                <p style={{ ...PIXEL, color: BONE }} className="mt-3 text-3xl sm:text-5xl leading-[1.02]">
                  {cardTitle(card, pt)}
                </p>
                <p className="mt-2.5 text-sm sm:text-[15px]" style={{ color: ASH }}>
                  {card.y ? `${card.y}. ` : ''}
                  {typeof card.predicted === 'number' ? t('secretRoom.midnight.predicted', { rating: card.predicted }) : ''}
                </p>
                <p className="mt-1 text-sm" style={{ color: ASH }}>
                  {t('secretRoom.midnight.hint')}
                </p>
                <button type="button" onClick={() => onOpen(card)} className={`${BUTTON} mt-5`} style={{ background: CANDLE, color: CRYPT }}>
                  {t('secretRoom.midnight.open')}
                </button>
              </>
            ) : (
              <p className="mt-3 text-sm" style={{ color: ASH }}>
                {t('secretRoom.midnight.loading')}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const HowToEnter: React.FC<{ live: boolean; tagName: string }> = ({ live, tagName }) => {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8 mt-10">
      <div className="max-w-2xl rounded-2xl p-5" style={{ background: CRYPT_RAISED, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.08)' }}>
        <h2 style={{ ...PIXEL, color: BONE }} className="text-xl leading-tight">
          {t('secretRoom.rules.title')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: ASH }}>
          {live ? t('secretRoom.rules.live', { tag: tagName }) : t('secretRoom.rules.after', { tag: tagName })}
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: ASH }}>
          {t('secretRoom.rules.portal', { tag: tagName })}
        </p>
      </div>
    </section>
  );
};

// A porta fechada: por que e como abrir.
const LockedRoom: React.FC<{ data: SecretRoomData; via: string | null }> = ({ data, via }) => {
  const { t } = useTranslation();
  const { event } = useSeasonalEvent();
  const access = data.access;
  const tagName = access.tag?.name ?? 'Deadly Sleeping';
  const step = event?.id === access.event ? event?.steps.find((s) => s.base_tag === access.tag?.base) : undefined;
  const reason = access.reason ?? 'closed';

  const message = (() => {
    switch (reason) {
      case 'need_tag':
        return t('secretRoom.locked.needTag', { tag: tagName });
      case 'need_tag_in_use':
        return t('secretRoom.locked.needTagInUse', { tag: tagName });
      case 'portal_closed':
        return t('secretRoom.locked.portalClosed', { username: via ?? '' });
      case 'login':
        return t('secretRoom.locked.login');
      default:
        return t('secretRoom.locked.closed', { tag: tagName });
    }
  })();

  return (
    <RoomShell>
      <div className="mx-auto max-w-xl px-5 sm:px-8 pt-8 sm:pt-14">
        <Link
          to="/oracle"
          className={`-ml-2 inline-flex items-center gap-1.5 h-11 px-2 rounded-xl hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
          style={{ color: ASH }}
        >
          <ArrowLeft className="w-[18px] h-[18px]" aria-hidden />
          {t('oracle.title')}
        </Link>
        <div className="mt-8 flex flex-col items-center text-center">
          <span className="relative">
            <CoffinMark className="w-20 h-32" color={OXBLOOD} fill={CRYPT_RAISED} strokeWidth={2.4} />
            <span className="absolute inset-0 grid place-items-center pt-2">
              <Lock className="w-6 h-6" style={{ color: CANDLE }} aria-hidden />
            </span>
          </span>
          <h1 style={{ ...PIXEL, color: BONE }} className="mt-6 text-4xl sm:text-5xl leading-none">
            {t('secretRoom.terror.name')}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: ASH }}>
            {message}
          </p>

          {reason === 'need_tag' && step && (
            <div className="mt-6 w-full rounded-2xl p-4 text-left" style={{ background: CRYPT_RAISED, boxShadow: 'inset 0 0 0 1px rgba(255,181,71,0.2)' }}>
              <p className="text-sm font-semibold" style={{ color: BONE }}>
                {step.emoji} {t(`events.halloween.steps.${step.base_tag}.task`, { defaultValue: step.name })}
              </p>
              <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(142,27,43,0.35)' }}>
                <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (step.progress / Math.max(1, step.count)) * 100)}%`, background: CANDLE }} />
              </div>
              <p className="mt-2 text-sm" style={{ color: ASH }}>
                {t('secretRoom.locked.progress', { progress: Math.min(step.progress, step.count), count: step.count })}
              </p>
            </div>
          )}

          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            {reason === 'need_tag' && (
              <Link to="/oracle/libraries?oracle=bogart&mood=dark-and-scary" className={BUTTON} style={{ background: CANDLE, color: CRYPT }}>
                <Skull className="w-4 h-4" aria-hidden />
                {t('secretRoom.locked.openDark')}
              </Link>
            )}
            {reason === 'need_tag_in_use' && (
              <Link to="/profile" className={BUTTON} style={{ background: CANDLE, color: CRYPT }}>
                {t('secretRoom.locked.openProfile')}
              </Link>
            )}
            {reason === 'login' && (
              <Link to="/auth" className={BUTTON} style={{ background: CANDLE, color: CRYPT }}>
                {t('secretRoom.locked.signIn')}
              </Link>
            )}
            <Link to="/" className={BUTTON} style={{ color: BONE, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.2)' }}>
              {t('secretRoom.locked.home')}
            </Link>
          </div>
        </div>
      </div>
    </RoomShell>
  );
};
