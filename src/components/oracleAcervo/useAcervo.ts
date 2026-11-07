import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MOODS, MOOD_BY_KEY } from '../../lib/moods';
import { mesaAcervo, type AcervoItem, type AcervoMedia } from '../../lib/mesa/acervoApi';
import { getCachedPayload } from '../../lib/mesa/api';
import { brtDay } from '../../lib/mesa/day';
import type { OracleSlot, PredLabel } from '../../lib/mesa/types';

// Estado do Acervo (SPEC §2.13), 05/11/2026: UMA prateleira por vez
// (oráculo × humor × filmes/séries), que cresce de 30 em 30 conforme a grade
// chega ao fim. Nada de nove fileiras empilhadas como na Biblioteca antiga:
// uma chamada por página, e a prateleira inteira para todos.

export interface AcervoShelf {
  key: string;
  status: 'loading' | 'ready' | 'error';
  items: AcervoItem[];
  // Títulos da prateleira (com os já avaliados) e os que faltam avaliar.
  total: number;
  unrated: number;
  nextOffset: number | null;
  predLabel: PredLabel;
  loadingMore: boolean;
  // A página seguinte falhou: a grade fica, e o fim mostra "Tentar de novo".
  moreError: boolean;
}

export const shelfKey = (oracle: OracleSlot, mood: string, media: AcervoMedia) => `${oracle}|${mood}|${media}`;

const itemKey = (item: { tmdb_id: number; media_type: string }) => `${item.media_type}:${item.tmdb_id}`;

// Guardado da sessão: voltar a uma prateleira já vista (trocar de humor e
// voltar, ir à Mesa e voltar) reabre na hora. Vale 5 minutos — depois disso a
// pessoa pode ter avaliado títulos em outra tela e a prateleira é refeita.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 12;
const shelfCache = new Map<string, { at: number; shelf: AcervoShelf }>();

const readCache = (key: string): AcervoShelf | null => {
  const hit = shelfCache.get(key);
  if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return null;
  return hit.shelf;
};

const writeCache = (shelf: AcervoShelf) => {
  if (shelf.status !== 'ready') return;
  shelfCache.delete(shelf.key);
  // O que fica no guardado nunca está "carregando mais" nem com erro de página.
  shelfCache.set(shelf.key, { at: Date.now(), shelf: { ...shelf, loadingMore: false, moreError: false } });
  while (shelfCache.size > CACHE_MAX) {
    const oldest = shelfCache.keys().next().value;
    if (oldest === undefined) break;
    shelfCache.delete(oldest);
  }
};

const loadingShelf = (key: string): AcervoShelf => ({
  key,
  status: 'loading',
  items: [],
  total: 0,
  unrated: 0,
  nextOffset: null,
  predLabel: 'number',
  loadingMore: false,
  moreError: false,
});

export function useAcervo(oracle: OracleSlot, mood: string | null, media: AcervoMedia) {
  const key = mood ? shelfKey(oracle, mood, media) : null;
  const [shelf, setShelf] = useState<AcervoShelf | null>(() => (key ? readCache(key) ?? loadingShelf(key) : null));
  // Cada busca leva um número: a resposta de uma prateleira que a pessoa já
  // trocou (atrasada) é descartada em vez de ocupar a grade nova.
  const tokenRef = useRef(0);
  const shelfRef = useRef(shelf);
  shelfRef.current = shelf;
  const moreInFlight = useRef(false);

  const loadFirst = useCallback(
    (force = false) => {
      if (!key || !mood) return;
      const token = ++tokenRef.current;
      moreInFlight.current = false;
      const cached = force ? null : readCache(key);
      if (cached) {
        setShelf(cached);
        return;
      }
      setShelf(loadingShelf(key));
      mesaAcervo(oracle, mood, media, 0)
        .then((page) => {
          if (token !== tokenRef.current) return;
          const next: AcervoShelf = {
            key,
            status: 'ready',
            items: page.items,
            total: page.total,
            unrated: page.unrated_total,
            nextOffset: page.next_offset,
            predLabel: page.pred_label,
            loadingMore: false,
            moreError: false,
          };
          writeCache(next);
          setShelf(next);
        })
        .catch((error) => {
          if (token !== tokenRef.current) return;
          console.error(`Acervo ${key}:`, error);
          setShelf({ ...loadingShelf(key), status: 'error' });
        });
    },
    [key, oracle, mood, media]
  );

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  // A próxima página (30), quando o fim da grade entra na tela.
  const loadMore = useCallback(() => {
    const current = shelfRef.current;
    if (!current || !mood || current.status !== 'ready' || current.nextOffset === null || moreInFlight.current) return;
    moreInFlight.current = true;
    const token = tokenRef.current;
    const forKey = current.key;
    const offset = current.nextOffset;
    setShelf((prev) => (prev && prev.key === forKey ? { ...prev, loadingMore: true, moreError: false } : prev));
    mesaAcervo(oracle, mood, media, offset)
      .then((page) => {
        if (token !== tokenRef.current) return;
        moreInFlight.current = false;
        setShelf((prev) => {
          if (!prev || prev.key !== forKey) return prev;
          // Sem repetir título (uma nota dada no meio do caminho desloca a lista do servidor).
          const seen = new Set(prev.items.map(itemKey));
          const fresh = page.items.filter((item) => !seen.has(itemKey(item)));
          const next: AcervoShelf = {
            ...prev,
            items: [...prev.items, ...fresh],
            total: page.total,
            unrated: page.unrated_total,
            nextOffset: page.next_offset,
            loadingMore: false,
            moreError: false,
          };
          writeCache(next);
          return next;
        });
      })
      .catch((error) => {
        if (token !== tokenRef.current) return;
        moreInFlight.current = false;
        console.error(`Acervo ${forKey} @${offset}:`, error);
        setShelf((prev) => (prev && prev.key === forKey ? { ...prev, loadingMore: false, moreError: true } : prev));
      });
  }, [oracle, mood, media]);

  // A pessoa deu nota pelo menu do título: ele sai da prateleira (o servidor já
  // não o devolve), e a próxima página começa uma posição antes.
  const removeItem = useCallback((tmdbId: number, mediaType: 'movie' | 'tv') => {
    setShelf((prev) => {
      if (!prev || prev.status !== 'ready') return prev;
      const target = `${mediaType}:${tmdbId}`;
      if (!prev.items.some((item) => itemKey(item) === target)) return prev;
      const next: AcervoShelf = {
        ...prev,
        items: prev.items.filter((item) => itemKey(item) !== target),
        unrated: Math.max(0, prev.unrated - 1),
        nextOffset: prev.nextOffset === null ? null : Math.max(0, prev.nextOffset - 1),
      };
      writeCache(next);
      return next;
    });
  }, []);

  // Entrou ou saiu da Watchlist pelo menu do título: só a marca muda.
  const setWatchlist = useCallback((tmdbId: number, mediaType: 'movie' | 'tv', inWatchlist: boolean) => {
    setShelf((prev) => {
      if (!prev || prev.status !== 'ready') return prev;
      const target = `${mediaType}:${tmdbId}`;
      let changed = false;
      const items = prev.items.map((item) => {
        if (itemKey(item) !== target || item.in_watchlist === inWatchlist) return item;
        changed = true;
        return { ...item, in_watchlist: inWatchlist };
      });
      if (!changed) return prev;
      const next = { ...prev, items };
      writeCache(next);
      return next;
    });
  }, []);

  const retry = useCallback(() => loadFirst(true), [loadFirst]);

  // Enquanto a chave muda (antes do efeito rodar), não mostra a prateleira velha.
  const visible = shelf && key && shelf.key === key ? shelf : key ? readCache(key) ?? loadingShelf(key) : null;
  return { shelf: visible, loadMore, retry, removeItem, setWatchlist };
}

// ---------------------------------------------------------------------------
// O humor padrão (SPEC §2.13): sem ?mood=, vale o humor mais forte da pessoa
// (o primeiro da ordem de favoritos calculada no servidor, a mesma que a
// Biblioteca antiga usava para ordenar as prateleiras), ou "mind-blowing".
// Guardado na sessão por pessoa: a segunda abertura não espera nada.
// ---------------------------------------------------------------------------

export const FALLBACK_MOOD = 'mind-blowing';
const TOP_MOOD_KEY = (uid: string) => `cineoracle:acervo:topMood:${uid}`;
// Sem resposta nesse tempo, abre no padrão (a prateleira não fica esperando).
const TOP_MOOD_TIMEOUT_MS = 2500;

// Quem veio da Mesa já tem o payload do dia na memória: o humor mais forte
// vem de lá (me.top_moods[0]), sem consulta nenhuma.
const topMoodFromMesa = (): string | null => {
  const day = brtDay();
  for (const media of ['all', 'movie', 'tv'] as const) {
    const top = getCachedPayload(null, media, day)?.me.top_moods?.[0];
    if (top && MOOD_BY_KEY[top]) return top;
  }
  return null;
};

const readTopMood = (uid: string): string | null => {
  const fromMesa = topMoodFromMesa();
  if (fromMesa) return fromMesa;
  try {
    const saved = window.sessionStorage.getItem(TOP_MOOD_KEY(uid));
    return saved && MOOD_BY_KEY[saved] ? saved : null;
  } catch {
    return null;
  }
};

export function useDefaultMood(uid: string | undefined, needed: boolean): string | null {
  const [mood, setMood] = useState<string | null>(() => (uid ? readTopMood(uid) : null));
  useEffect(() => {
    if (!needed || mood) return;
    if (!uid) {
      setMood(FALLBACK_MOOD);
      return;
    }
    const saved = readTopMood(uid);
    if (saved) {
      setMood(saved);
      return;
    }
    let done = false;
    const finish = (value: string) => {
      if (done) return;
      done = true;
      setMood(value);
    };
    const timer = window.setTimeout(() => finish(FALLBACK_MOOD), TOP_MOOD_TIMEOUT_MS);
    Promise.resolve(supabase.rpc('get_user_favorite_moods_order', { p_user_id: uid }))
      .then(({ data, error }) => {
        const rows = !error && Array.isArray(data) ? (data as { mood_key: string; score?: number }[]) : [];
        // Só humores das 9 prateleiras (o "random-surprise" do banco fica de fora)
        // e com alguma nota (score > 0); sem nenhum, vale o padrão.
        const top = rows.find((row) => MOOD_BY_KEY[row.mood_key] && (row.score === undefined || row.score > 0))?.mood_key ?? FALLBACK_MOOD;
        try {
          window.sessionStorage.setItem(TOP_MOOD_KEY(uid), top);
        } catch {
          // sem armazenamento: vale só nesta visita
        }
        finish(top);
      })
      .catch(() => finish(FALLBACK_MOOD))
      .finally(() => window.clearTimeout(timer));
    return () => {
      done = true;
      window.clearTimeout(timer);
    };
  }, [uid, needed, mood]);
  return needed ? mood : null;
}

export const isAcervoMood = (value: string | null | undefined): value is string => Boolean(value && MOODS.some((m) => m.key === value));
