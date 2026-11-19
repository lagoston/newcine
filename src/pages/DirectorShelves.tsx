import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Search, X, ArrowRightLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import DirectorPage from '../components/director/DirectorPage';
import { BRASS, PANEL, useDirectorLang } from '../lib/directorUi';
import DirectorMfaCard from '../components/director/DirectorMfaCard';
import { useDirector } from '../contexts/DirectorContext';
import { MOODS, MOOD_BY_KEY, type MoodKey } from '../lib/moods';
import { ORACLES, ORACLE_BY_ID, NIGHT, PAPER, MIST, VELVET, FOCUS_RING, type OracleId } from '../lib/oracleTheme';
import { tmdbImage } from '../lib/tmdbImage';
import type { TitleType } from '../lib/tmdb';
import {
  directorErrorText,
  ensureTitleInDb,
  fetchShelves,
  fetchTitleCards,
  fetchTitleInfo,
  poolAdd,
  poolMove,
  poolRemove,
  searchTitles,
  titleKey,
  type SearchHit,
  type Shelf,
  type TitleCard,
  type TitleInfo,
} from '../lib/directorTools';

// Prateleiras dos oráculos (/diretor/prateleiras, 16/11/2026).
//
// Pedido do Bruno: pôr filmes nas pools pelo próprio site. Escolhe-se o oráculo
// e o humor; a prateleira aparece com os títulos; dá para buscar um título no
// TMDB e pôr aqui, mudar um título de prateleira ou tirar. Antes de mudar, a
// tela diz onde o título já está e quantas pessoas de verdade já deram nota (a
// Persona delas é recalculada). Tudo vai pelo banco (director_pool_*), que
// confere o código do app autenticador e grava no diário, com desfazer.

const IMG = (path: string | null, size = 'w92') => (path ? tmdbImage(path, size) : null);

const COPY = {
  pt: {
    title: 'Prateleiras dos oráculos',
    lead: 'Cada oráculo tem nove prateleiras, uma por humor. O que entra aqui vale na hora para todo mundo: recomendações, Acervo, previsão, Persona e tags.',
    movies: 'Filmes',
    series: 'Séries',
    movieOne: 'Filme',
    seriesOne: 'Série',
    filter: 'Filtrar esta prateleira',
    add: 'Pôr um título nesta prateleira',
    searchPh: 'Nome do filme ou da série',
    putHere: 'Pôr aqui',
    already: 'Já está nesta prateleira',
    where: (n: number) => (n === 0 ? 'Ainda em nenhuma prateleira.' : `Já está em ${n} prateleira${n > 1 ? 's' : ''}:`),
    raters: (n: number) => (n === 1 ? '1 pessoa já deu nota (a Persona dela é recalculada).' : `${n} pessoas já deram nota (a Persona delas é recalculada).`),
    reason: 'Motivo (opcional, vai para o diário)',
    confirmAdd: 'Confirmar',
    cancel: 'Cancelar',
    move: 'Mudar',
    moveTo: 'Mudar para',
    remove: 'Tirar',
    removeConfirm: 'Tocar de novo tira',
    added: 'Título posto na prateleira.',
    moved: 'Título mudou de prateleira.',
    removed: 'Título tirado da prateleira.',
    noChange: 'Nada mudou: já estava assim.',
    empty: 'Nenhum título com esse filtro.',
    needMfa: 'Mudar as prateleiras pede o código do app autenticador.',
    notInDb: 'Não deu para trazer este título para o banco agora.',
    loadError: 'Não deu para carregar as prateleiras.',
  },
  en: {
    title: 'Oracle shelves',
    lead: 'Each oracle has nine shelves, one per mood. What goes in here counts right away for everyone: recommendations, the Archive, predictions, Persona and tags.',
    movies: 'Movies',
    series: 'Series',
    movieOne: 'Movie',
    seriesOne: 'Series',
    filter: 'Filter this shelf',
    add: 'Add a title to this shelf',
    searchPh: 'Movie or series name',
    putHere: 'Add here',
    already: 'Already on this shelf',
    where: (n: number) => (n === 0 ? 'Not on any shelf yet.' : `Already on ${n} shelf${n > 1 ? 'ves' : ''}:`),
    raters: (n: number) => (n === 1 ? '1 person already rated it (their Persona is recalculated).' : `${n} people already rated it (their Persona is recalculated).`),
    reason: 'Reason (optional, goes to the diary)',
    confirmAdd: 'Confirm',
    cancel: 'Cancel',
    move: 'Move',
    moveTo: 'Move to',
    remove: 'Remove',
    removeConfirm: 'Tap again to remove',
    added: 'Title added to the shelf.',
    moved: 'Title moved.',
    removed: 'Title removed from the shelf.',
    noChange: 'Nothing changed: it was already like that.',
    empty: 'No title with this filter.',
    needMfa: 'Changing the shelves asks for the authenticator code.',
    notInDb: "Couldn't bring this title into the database right now.",
    loadError: "Couldn't load the shelves.",
  },
} as const;

type Pending = { hit: SearchHit; info: TitleInfo | null; reason: string; busy: boolean };

export default function DirectorShelves() {
  const lang = useDirectorLang();
  const c = COPY[lang];
  const { t } = useTranslation();
  const director = useDirector();
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [oracle, setOracle] = useState<OracleId>('bogart');
  const [mood, setMood] = useState<MoodKey>('catharsis');
  const [media, setMedia] = useState<TitleType>('movie');
  const [cards, setCards] = useState<Map<string, TitleCard>>(new Map());
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const moodLabel = (key: MoodKey) => t(MOOD_BY_KEY[key]?.labelKey ?? key);
  const shelfName = (card: OracleId, key: MoodKey) => `${ORACLE_BY_ID[card].name} · ${moodLabel(key)}`;

  const load = useCallback(async () => {
    try {
      setFailed(false);
      setShelves(await fetchShelves());
    } catch (error) {
      console.error('Director shelves:', error);
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    if (director.isDirector) load();
  }, [director.isDirector, load]);

  const shelf = useMemo(() => shelves?.find((s) => s.card === oracle && s.mood === mood) ?? null, [shelves, oracle, mood]);
  const ids = useMemo(() => (shelf ? (media === 'movie' ? shelf.movieIds : shelf.tvIds) : []), [shelf, media]);

  // nomes e pôsteres dos títulos da prateleira (cada um pedido uma vez só)
  const requested = useRef<Set<string>>(new Set());
  useEffect(() => {
    const missing = ids.filter((id) => !requested.current.has(titleKey(media, id))).map((id) => ({ id, media }));
    if (missing.length === 0) return;
    missing.forEach((ref) => requested.current.add(titleKey(ref.media, ref.id)));
    fetchTitleCards(missing, lang)
      .then((found) => setCards((current) => new Map([...current, ...found])))
      .catch((error) => console.error('Director titles:', error));
  }, [ids, media, lang]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return ids
      .slice()
      .reverse()
      .map((id) => cards.get(titleKey(media, id)) ?? { id, media, title: `#${id}`, year: null, poster: null })
      .filter((card) => !f || card.title.toLowerCase().includes(f));
  }, [ids, cards, media, filter]);

  // busca no TMDB (espera a pessoa parar de digitar)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchTitles(q)
        .then((found) => alive && setHits(found))
        .catch((error) => console.error('Director search:', error))
        .finally(() => alive && setSearching(false));
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const fail = (error: unknown) => {
    console.error('Director shelves action:', error);
    toast.error(directorErrorText(error, lang));
    director.refresh();
  };

  const choose = async (hit: SearchHit) => {
    setPending({ hit, info: null, reason: '', busy: true });
    try {
      const inDb = await ensureTitleInDb(hit.media, hit.id);
      if (!inDb) {
        toast.error(c.notInDb);
        setPending(null);
        return;
      }
      const info = await fetchTitleInfo(hit.media, hit.id);
      setPending({ hit, info, reason: '', busy: false });
    } catch (error) {
      fail(error);
      setPending(null);
    }
  };

  const confirmAdd = async () => {
    if (!pending || !shelf) return;
    setPending({ ...pending, busy: true });
    try {
      const result = await poolAdd(shelf.card, shelf.mood, pending.hit.media, pending.hit.id, pending.reason);
      toast.success(result.changed ? c.added : c.noChange);
      setMedia(pending.hit.media);
      setPending(null);
      setQuery('');
      setHits([]);
      await load();
    } catch (error) {
      fail(error);
      setPending((current) => (current ? { ...current, busy: false } : null));
    }
  };

  const move = async (card: TitleCard, to: string) => {
    if (!shelf) return;
    const [toCard, toMood] = to.split('/') as [OracleId, MoodKey];
    setBusyKey(titleKey(card.media, card.id));
    try {
      const result = await poolMove({ card: shelf.card, mood: shelf.mood }, { card: toCard, mood: toMood }, card.media, card.id);
      toast.success(result.changed ? c.moved : c.noChange);
      setMoving(null);
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setBusyKey(null);
    }
  };

  const remove = async (card: TitleCard) => {
    if (!shelf) return;
    const key = titleKey(card.media, card.id);
    if (removing !== key) {
      setRemoving(key);
      return;
    }
    setBusyKey(key);
    try {
      const result = await poolRemove(shelf.card, shelf.mood, card.media, card.id);
      toast.success(result.changed ? c.removed : c.noChange);
      setRemoving(null);
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setBusyKey(null);
    }
  };

  const canChange = director.mfa;
  const canRemove = director.recent;
  const chip = (selected: boolean): React.CSSProperties =>
    selected ? { background: PAPER, color: NIGHT, border: '1px solid transparent' } : { background: VELVET, color: MIST, border: '1px solid rgba(243,234,211,0.12)' };

  return (
    <DirectorPage title={c.title} lead={c.lead}>
      {(!director.mfa || !director.recent) && (
        <DirectorMfaCard lang={lang} need={director.mfa ? 3 : 2} className="mt-6" style={PANEL} />
      )}

      {failed && (
        <p className="mt-6 text-sm" style={{ color: '#FCA5A5' }}>
          {c.loadError}
        </p>
      )}

      {/* ---------- Oráculo e humor ---------- */}
      <section className="mt-6 rounded-2xl p-4 sm:p-5" style={PANEL} aria-label={lang === 'pt' ? 'Escolher a prateleira' : 'Pick a shelf'}>
        <div role="radiogroup" aria-label={lang === 'pt' ? 'Oráculo' : 'Oracle'} className="flex flex-wrap gap-2">
          {ORACLES.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={oracle === o.id}
              onClick={() => setOracle(o.id)}
              className={`inline-flex items-center gap-2 h-11 px-4 rounded-full text-sm font-semibold ${FOCUS_RING}`}
              style={chip(oracle === o.id)}
            >
              <span aria-hidden className="w-2.5 h-2.5 rounded-full" style={{ background: o.color }} />
              {o.name}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label={lang === 'pt' ? 'Humor' : 'Mood'} className="mt-3 flex flex-wrap gap-2">
          {MOODS.map((m) => {
            const s = shelves?.find((x) => x.card === oracle && x.mood === m.key);
            const count = s ? s.movieIds.length + s.tvIds.length : null;
            return (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={mood === m.key}
                onClick={() => setMood(m.key)}
                className={`inline-flex items-center gap-2 h-10 min-h-0 px-3 rounded-full text-sm ${FOCUS_RING}`}
                style={chip(mood === m.key)}
              >
                <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                {moodLabel(m.key)}
                {count !== null && <span className="tabular-nums opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------- Pôr um título ---------- */}
      {shelf && (
        <section className="mt-6 rounded-2xl p-4 sm:p-5" style={{ ...PANEL, borderColor: 'rgba(245,196,81,0.25)' }} aria-labelledby="shelf-add">
          <h2 id="shelf-add" className="text-base font-semibold" style={{ color: PAPER }}>
            {c.add}: <span style={{ color: BRASS }}>{shelfName(shelf.card, shelf.mood)}</span>
          </h2>
          {!canChange && (
            <p className="mt-1 text-xs" style={{ color: MIST }}>
              {c.needMfa}
            </p>
          )}
          <label className="mt-3 flex items-center gap-2 h-11 px-3 rounded-xl" style={{ background: VELVET, border: '1px solid rgba(243,234,211,0.12)' }}>
            <Search className="w-4 h-4 shrink-0" style={{ color: MIST }} aria-hidden />
            <span className="sr-only">{c.searchPh}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={c.searchPh}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm"
              style={{ color: PAPER }}
            />
            {searching && <Loader2 className="w-4 h-4 animate-spin" style={{ color: MIST }} aria-hidden />}
          </label>

          {hits.length > 0 && !pending && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {hits.map((hit) => {
                const onShelf = (hit.media === 'movie' ? shelf.movieIds : shelf.tvIds).includes(hit.id);
                return (
                  <li key={titleKey(hit.media, hit.id)} className="flex items-center gap-3 rounded-xl p-2" style={{ background: 'rgba(18,13,34,0.6)' }}>
                    {IMG(hit.poster) ? (
                      <img src={IMG(hit.poster)!} alt="" loading="lazy" className="w-10 rounded object-cover shrink-0" style={{ height: 60 }} />
                    ) : (
                      <span className="w-10 rounded shrink-0" style={{ height: 60, background: VELVET }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: PAPER }}>{hit.title}</p>
                      <p className="text-xs" style={{ color: MIST }}>
                        {hit.media === 'movie' ? c.movieOne : c.seriesOne} {hit.year ? `· ${hit.year}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!canChange || onShelf}
                      onClick={() => choose(hit)}
                      className={`shrink-0 inline-flex items-center gap-1 h-10 min-h-0 px-3 rounded-full text-xs font-semibold disabled:opacity-40 ${FOCUS_RING}`}
                      style={{ background: BRASS, color: NIGHT }}
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden />
                      {onShelf ? c.already : c.putHere}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {pending && (
            <div className="mt-3 rounded-xl p-4" style={{ background: 'rgba(18,13,34,0.7)', border: '1px solid rgba(245,196,81,0.3)' }}>
              <div className="flex items-start gap-3">
                {IMG(pending.hit.poster, 'w154') && <img src={IMG(pending.hit.poster, 'w154')!} alt="" className="w-16 rounded" />}
                <div className="min-w-0">
                  <p className="font-semibold" style={{ color: PAPER }}>
                    {pending.hit.title} {pending.hit.year && <span style={{ color: MIST }}>({pending.hit.year})</span>}
                  </p>
                  {pending.info ? (
                    <>
                      <p className="mt-1 text-xs" style={{ color: MIST }}>
                        {c.where(pending.info.shelves.length)}{' '}
                        {pending.info.shelves.map((s) => shelfName(s.card, s.mood)).join(', ')}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: MIST }}>{c.raters(pending.info.raters)}</p>
                    </>
                  ) : (
                    <Loader2 className="mt-2 w-4 h-4 animate-spin" style={{ color: MIST }} aria-hidden />
                  )}
                </div>
              </div>
              <label className="mt-3 block text-xs" style={{ color: MIST }}>
                {c.reason}
                <input
                  value={pending.reason}
                  onChange={(event) => setPending({ ...pending, reason: event.target.value })}
                  maxLength={300}
                  className={`mt-1 w-full h-10 px-3 rounded-lg text-sm ${FOCUS_RING}`}
                  style={{ background: VELVET, color: PAPER, border: '1px solid rgba(243,234,211,0.12)' }}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending.busy || !pending.info}
                  onClick={confirmAdd}
                  className={`inline-flex items-center gap-2 h-11 px-4 rounded-full text-sm font-semibold disabled:opacity-50 ${FOCUS_RING}`}
                  style={{ background: BRASS, color: NIGHT }}
                >
                  {pending.busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                  {c.confirmAdd}: {shelfName(shelf.card, shelf.mood)}
                </button>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className={`inline-flex items-center gap-2 h-11 px-4 rounded-full text-sm ${FOCUS_RING}`}
                  style={{ color: MIST, border: '1px solid rgba(243,234,211,0.14)' }}
                >
                  <X className="w-4 h-4" aria-hidden />
                  {c.cancel}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---------- A prateleira ---------- */}
      {shelf && (
        <section className="mt-6" aria-label={shelfName(shelf.card, shelf.mood)}>
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label={lang === 'pt' ? 'Tipo' : 'Type'} className="flex gap-2">
              {(['movie', 'tv'] as TitleType[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={media === m}
                  onClick={() => setMedia(m)}
                  className={`h-10 min-h-0 px-4 gap-1.5 rounded-full text-sm ${FOCUS_RING}`}
                  style={chip(media === m)}
                >
                  {m === 'movie' ? c.movies : c.series} <span className="tabular-nums opacity-70">{m === 'movie' ? shelf.movieIds.length : shelf.tvIds.length}</span>
                </button>
              ))}
            </div>
            <label className="ml-auto flex items-center gap-2 h-10 px-3 rounded-full w-full sm:w-64" style={{ background: VELVET, border: '1px solid rgba(243,234,211,0.12)' }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: MIST }} aria-hidden />
              <span className="sr-only">{c.filter}</span>
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={c.filter}
                className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                style={{ color: PAPER }}
              />
            </label>
          </div>

          {shown.length === 0 ? (
            <p className="mt-6 text-sm" style={{ color: MIST }}>{c.empty}</p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {shown.map((card) => {
                const key = titleKey(card.media, card.id);
                const busy = busyKey === key;
                return (
                  <li key={key} className="rounded-xl p-2 flex items-center gap-3" style={PANEL}>
                    {IMG(card.poster) ? (
                      <img src={IMG(card.poster)!} alt="" loading="lazy" className="w-10 rounded object-cover shrink-0" style={{ height: 60 }} />
                    ) : (
                      <span className="w-10 rounded shrink-0" style={{ height: 60, background: VELVET }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: PAPER }} title={card.title}>{card.title}</p>
                      <p className="text-xs" style={{ color: MIST }}>{card.year ?? ''}</p>
                      {moving === key ? (
                        <label className="mt-1 flex items-center gap-1 text-xs" style={{ color: MIST }}>
                          <span className="sr-only">{c.moveTo}</span>
                          <select
                            autoFocus
                            defaultValue=""
                            disabled={busy}
                            onChange={(event) => event.target.value && move(card, event.target.value)}
                            className={`h-9 rounded-lg px-2 text-xs max-w-full ${FOCUS_RING}`}
                            style={{ background: VELVET, color: PAPER, border: '1px solid rgba(243,234,211,0.14)' }}
                          >
                            <option value="" disabled>{c.moveTo}…</option>
                            {ORACLES.flatMap((o) =>
                              MOODS.filter((m) => !(o.id === shelf.card && m.key === shelf.mood)).map((m) => (
                                <option key={`${o.id}/${m.key}`} value={`${o.id}/${m.key}`}>
                                  {shelfName(o.id, m.key)}
                                </option>
                              )),
                            )}
                          </select>
                          <button type="button" onClick={() => setMoving(null)} aria-label={c.cancel} className={`h-9 w-9 min-h-0 min-w-0 rounded-lg ${FOCUS_RING}`}>
                            <X className="w-4 h-4" aria-hidden />
                          </button>
                        </label>
                      ) : (
                        <div className="mt-1 flex gap-1">
                          <button
                            type="button"
                            disabled={!canChange || busy}
                            onClick={() => setMoving(key)}
                            className={`inline-flex items-center gap-1 h-8 min-h-0 px-2 rounded-lg text-xs disabled:opacity-40 ${FOCUS_RING}`}
                            style={{ color: PAPER, background: 'rgba(243,234,211,0.06)' }}
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden />
                            {c.move}
                          </button>
                          <button
                            type="button"
                            disabled={!canRemove || busy}
                            onClick={() => remove(card)}
                            onBlur={() => removing === key && setRemoving(null)}
                            className={`inline-flex items-center gap-1 h-8 min-h-0 px-2 rounded-lg text-xs disabled:opacity-40 ${FOCUS_RING}`}
                            style={removing === key ? { color: '#fff', background: '#DC2626' } : { color: '#FCA5A5', background: 'rgba(248,113,113,0.08)' }}
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Trash2 className="w-3.5 h-3.5" aria-hidden />}
                            {removing === key ? c.removeConfirm : c.remove}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {!shelves && !failed && (
        <div className="mt-10 grid place-items-center">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: MIST }} aria-label="…" />
        </div>
      )}
    </DirectorPage>
  );
}
