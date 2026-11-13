import { useCallback, useEffect, useRef, useState } from 'react';
import { AcervoError, mesaAcervo, type AcervoQuery } from '../../lib/mesa/acervoApi';
import type { AcervoItem, AcervoMedia, AcervoOccasion, AcervoPage, OracleSlot, PredLabel } from '../../lib/mesa/types';
import { MOODS } from '../../lib/moods';

// Estado do Acervo (05/11/2026; v2 em 09/11/2026): UMA prateleira por vez —
// oráculo × humor × filmes/séries, ou oráculo × ocasião (todos os humores) —
// que cresce de 30 em 30 conforme a grade chega ao fim.
//
// O que mudou na v2, por causa do erro das ocasiões da Mesa (a resposta
// demorava, e uma resposta velha ou um erro tomava a tela):
//   - cada filtro novo CANCELA o pedido anterior (AbortController); resposta
//     atrasada nunca ocupa a grade;
//   - enquanto o filtro novo carrega, a grade anterior fica na tela, apagada
//     (`stale`), em vez de virar esqueleto a cada toque;
//   - o humor padrão (o mais forte da pessoa) vem do próprio servidor: sem
//     humor no endereço, o pedido sai com p_mood null e a resposta diz qual
//     foi; a página grava na URL e o guardado já responde por ela.

export interface AcervoShelf {
  key: string;
  status: 'loading' | 'ready' | 'error';
  items: AcervoItem[];
  // Os títulos na tela são de outro filtro (o novo ainda está carregando).
  stale: boolean;
  // O que o servidor resolveu (humor padrão, mídia de uma ocasião de um tipo só).
  oracle: OracleSlot;
  mood: string | null;
  occasion: string | null;
  media: AcervoMedia;
  total: number;
  unrated: number;
  nextOffset: number | null;
  predLabel: PredLabel;
  passed: boolean;
  loadingMore: boolean;
  // A página seguinte falhou: a grade fica, e o fim mostra "Tentar de novo".
  moreError: boolean;
}

export const shelfKey = (q: Pick<AcervoQuery, 'oracle' | 'mood' | 'occasion' | 'media'>) =>
  `${q.oracle}|${q.occasion ? '' : q.mood ?? '*'}|${q.occasion ?? ''}|${q.media}`;

const itemKey = (item: { tmdb_id: number; media_type: string }) => `${item.media_type}:${item.tmdb_id}`;

// 13/11/2026 (Bruno: "Mude a ordem com que filmes com a mesma nota prevista
// aparecem … para não ficar tudo sempre na mesma ordem"). O servidor já sorteia
// os empates por pessoa e por dia (20261113121000_acervo_tie_shuffle); aqui,
// a cada vez que o Acervo abre, os títulos de mesma nota que chegam juntos
// numa página trocam de lugar entre si. Só nas prateleiras de humor (numa
// ocasião, quem encaixa melhor nela vem antes, e isso fica) e só com nota à
// mostra (sem o selo, a ordem do servidor é a única pista).
const newSeed = () => Math.floor(Math.random() * 0x7fffffff);

const tieRank = (seed: number, key: string) => {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
};

export function shuffleTies(items: AcervoItem[], seed: number): AcervoItem[] {
  const out: AcervoItem[] = [];
  let i = 0;
  while (i < items.length) {
    const pred = items[i].pred;
    let j = i + 1;
    if (typeof pred === 'number') while (j < items.length && items[j].pred === pred) j += 1;
    const run = items.slice(i, j);
    if (run.length > 1) run.sort((a, b) => tieRank(seed, itemKey(a)) - tieRank(seed, itemKey(b)));
    out.push(...run);
    i = j;
  }
  return out;
}

// Guardado da sessão: voltar a um filtro já visto reabre na hora. Vale 5
// minutos — depois disso a pessoa pode ter avaliado títulos em outra tela.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 16;
const shelfCache = new Map<string, { at: number; shelf: AcervoShelf }>();

// A última lista de ocasiões que o servidor mandou (só a 1ª página traz).
let lastOccasions: AcervoOccasion[] | null = null;

const readCache = (key: string): AcervoShelf | null => {
  const hit = shelfCache.get(key);
  if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return null;
  return { ...hit.shelf, key };
};

const writeCache = (key: string, shelf: AcervoShelf) => {
  if (shelf.status !== 'ready' || shelf.stale) return;
  shelfCache.delete(key);
  // O que fica no guardado nunca está "carregando mais" nem com erro de página.
  shelfCache.set(key, { at: Date.now(), shelf: { ...shelf, key, loadingMore: false, moreError: false } });
  while (shelfCache.size > CACHE_MAX) {
    const oldest = shelfCache.keys().next().value;
    if (oldest === undefined) break;
    shelfCache.delete(oldest);
  }
};

const fromPage = (key: string, page: AcervoPage, seed: number): AcervoShelf => ({
  key,
  status: 'ready',
  items: page.occasion ? page.items : shuffleTies(page.items, seed),
  stale: false,
  oracle: page.oracle,
  mood: page.mood,
  occasion: page.occasion,
  media: page.media,
  total: page.total,
  unrated: page.unrated_total,
  nextOffset: page.next_offset,
  predLabel: page.pred_label,
  passed: page.passed,
  loadingMore: false,
  moreError: false,
});

const emptyShelf = (key: string, q: AcervoQuery, status: AcervoShelf['status']): AcervoShelf => ({
  key,
  status,
  items: [],
  stale: false,
  oracle: q.oracle,
  mood: q.occasion ? null : q.mood,
  occasion: q.occasion,
  media: q.media,
  total: 0,
  unrated: 0,
  nextOffset: null,
  predLabel: 'number',
  passed: false,
  loadingMore: false,
  moreError: false,
});

export function useAcervo(query: AcervoQuery) {
  const { oracle, mood, occasion, media } = query;
  const key = shelfKey({ oracle, mood, occasion, media });
  const [shelf, setShelf] = useState<AcervoShelf>(() => readCache(key) ?? emptyShelf(key, query, 'loading'));
  const [occasions, setOccasions] = useState<AcervoOccasion[] | null>(lastOccasions);
  const shelfRef = useRef(shelf);
  shelfRef.current = shelf;
  // A semente desta visita ao Acervo (a ordem dos empates).
  const seedRef = useRef(0);
  if (!seedRef.current) seedRef.current = newSeed() || 1;
  // O pedido em voo (primeira página ou seguinte): trocar de filtro cancela.
  const firstCtl = useRef<AbortController | null>(null);
  const moreCtl = useRef<AbortController | null>(null);

  const loadFirst = useCallback(
    (force = false) => {
      firstCtl.current?.abort();
      moreCtl.current?.abort();
      const q: AcervoQuery = { oracle, mood: occasion ? null : mood, occasion, media, offset: 0 };
      const cached = force ? null : readCache(key);
      if (cached) {
        firstCtl.current = null;
        setShelf(cached);
        return;
      }
      const ctl = new AbortController();
      firstCtl.current = ctl;
      // A grade anterior fica na tela, apagada, até a nova chegar.
      setShelf((prev) =>
        prev.items.length && !prev.passed
          ? { ...prev, key, status: 'loading', stale: true, loadingMore: false, moreError: false }
          : emptyShelf(key, q, 'loading')
      );
      mesaAcervo(q, ctl.signal)
        .then((page) => {
          if (ctl.signal.aborted) return;
          firstCtl.current = null;
          const next = fromPage(key, page, seedRef.current);
          writeCache(key, next);
          // O mesmo resultado responde pelo filtro resolvido (humor padrão,
          // mídia da ocasião), que a página grava na URL logo em seguida.
          const resolved = shelfKey({ oracle: page.oracle, mood: page.mood, occasion: page.occasion, media: page.media });
          if (resolved !== key) writeCache(resolved, next);
          if (page.occasions) {
            lastOccasions = page.occasions;
            setOccasions(page.occasions);
          }
          setShelf(next);
        })
        .catch((error: unknown) => {
          if (ctl.signal.aborted || (error instanceof AcervoError && error.code === 'aborted')) return;
          firstCtl.current = null;
          console.error(`Acervo ${key}:`, error);
          setShelf(emptyShelf(key, q, 'error'));
        });
    },
    [key, oracle, mood, occasion, media]
  );

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  // Saiu do Acervo: nada fica em voo.
  useEffect(
    () => () => {
      firstCtl.current?.abort();
      moreCtl.current?.abort();
    },
    []
  );

  // A próxima página (30), quando o fim da grade entra na tela. Usa o filtro
  // que o servidor resolveu (o humor padrão já vem preenchido).
  const loadMore = useCallback(() => {
    const current = shelfRef.current;
    if (current.status !== 'ready' || current.stale || current.nextOffset === null || moreCtl.current) return;
    const ctl = new AbortController();
    moreCtl.current = ctl;
    const forKey = current.key;
    const offset = current.nextOffset;
    setShelf((prev) => (prev.key === forKey ? { ...prev, loadingMore: true, moreError: false } : prev));
    mesaAcervo({ oracle: current.oracle, mood: current.mood, occasion: current.occasion, media: current.media, offset }, ctl.signal)
      .then((page) => {
        if (ctl.signal.aborted) return;
        moreCtl.current = null;
        setShelf((prev) => {
          if (prev.key !== forKey) return prev;
          // Sem repetir título (uma nota dada no meio do caminho desloca a lista do servidor).
          const seen = new Set(prev.items.map(itemKey));
          const unseen = page.items.filter((item) => !seen.has(itemKey(item)));
          const fresh = prev.occasion ? unseen : shuffleTies(unseen, seedRef.current);
          const next: AcervoShelf = {
            ...prev,
            items: [...prev.items, ...fresh],
            total: page.total,
            unrated: page.unrated_total,
            nextOffset: page.next_offset,
            loadingMore: false,
            moreError: false,
          };
          writeCache(forKey, next);
          return next;
        });
      })
      .catch((error: unknown) => {
        if (ctl.signal.aborted || (error instanceof AcervoError && error.code === 'aborted')) return;
        moreCtl.current = null;
        console.error(`Acervo ${forKey} @${offset}:`, error);
        setShelf((prev) => (prev.key === forKey ? { ...prev, loadingMore: false, moreError: true } : prev));
      });
  }, []);

  // A pessoa deu nota pelo menu do título: ele sai da grade (o servidor já não
  // o devolve), e a próxima página começa uma posição antes. Some também dos
  // outros filtros guardados (o mesmo título pode estar numa ocasião).
  const removeItem = useCallback((tmdbId: number, mediaType: AcervoMedia) => {
    const target = `${mediaType}:${tmdbId}`;
    shelfCache.forEach((entry, cacheKey) => {
      if (entry.shelf.items.some((item) => itemKey(item) === target)) shelfCache.delete(cacheKey);
    });
    setShelf((prev) => {
      if (prev.status !== 'ready' || !prev.items.some((item) => itemKey(item) === target)) return prev;
      const next: AcervoShelf = {
        ...prev,
        items: prev.items.filter((item) => itemKey(item) !== target),
        unrated: Math.max(0, prev.unrated - 1),
        nextOffset: prev.nextOffset === null ? null : Math.max(0, prev.nextOffset - 1),
      };
      writeCache(prev.key, next);
      return next;
    });
  }, []);

  // Entrou ou saiu da Watchlist pelo menu do título: só a marca muda.
  const setWatchlist = useCallback((tmdbId: number, mediaType: AcervoMedia, inWatchlist: boolean) => {
    setShelf((prev) => {
      if (prev.status !== 'ready') return prev;
      const target = `${mediaType}:${tmdbId}`;
      let changed = false;
      const items = prev.items.map((item) => {
        if (itemKey(item) !== target || item.in_watchlist === inWatchlist) return item;
        changed = true;
        return { ...item, in_watchlist: inWatchlist };
      });
      if (!changed) return prev;
      const next = { ...prev, items };
      writeCache(prev.key, next);
      return next;
    });
  }, []);

  const retry = useCallback(() => loadFirst(true), [loadFirst]);

  // No render em que o filtro acabou de mudar (antes de o efeito rodar), a
  // grade nunca se passa pela do filtro anterior: vem do guardado, ou apagada.
  const visible: AcervoShelf =
    shelf.key === key
      ? shelf
      : readCache(key) ??
        (shelf.items.length && !shelf.passed
          ? { ...shelf, key, status: 'loading', stale: true, loadingMore: false, moreError: false }
          : emptyShelf(key, { oracle, mood: occasion ? null : mood, occasion, media }, 'loading'));

  return { shelf: visible, occasions, loadMore, retry, removeItem, setWatchlist };
}

export const isAcervoMood = (value: string | null | undefined): value is string => Boolean(value && MOODS.some((m) => m.key === value));
