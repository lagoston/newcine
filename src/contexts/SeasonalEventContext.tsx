import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  SEASONAL_THEMES,
  PREVIEW_ALIASES,
  decorationForActiveTag,
  isSeasonalEventId,
  type SeasonalEventId,
  type SeasonalEventState,
  type SeasonalStep,
  type SeasonalTheme,
  type TagDecoration,
} from '../lib/seasonalEvents';
import SeasonalCelebration from '../components/seasonal/SeasonalCelebration';

// Evento sazonal no ar (Halloween em outubro, Natal em dezembro…), um só
// para o site inteiro: a home mostra o painel do evento, o fundo e a barra
// do topo ganham a decoração do tema. A decoração dos perfis depende da tag
// em uso (useTagDecoration), não do evento.
//
// O estado vem de get_seasonal_event_state() e é atualizado ao trocar de
// página, ao voltar para a aba e quando alguém pede (requestSeasonalRefresh,
// por exemplo ao fechar o modal de um filme). Quando uma tag do evento é
// conquistada, a comemoração aparece aqui, em qualquer página.

interface SeasonalEventContextValue {
  event: SeasonalEventState | null;
  theme: SeasonalTheme | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SeasonalEventContext = createContext<SeasonalEventContextValue>({
  event: null,
  theme: null,
  loading: true,
  refresh: async () => {},
});

const PREVIEW_KEY = 'cineoracle:eventPreview';
const REFRESH_EVENT = 'cineoracle:seasonal-refresh';
const seenKey = (userId: string) => `cineoracle:seasonalSeen:${userId}`;

// Pede uma atualização do evento (depois de avaliar, sussurrar…).
export const requestSeasonalRefresh = () => {
  window.dispatchEvent(new Event(REFRESH_EVENT));
};

// ?evento=natal liga a prévia (guardada na aba); ?evento=off desliga.
function readPreview(search: string): SeasonalEventId | null {
  const raw = new URLSearchParams(search).get('evento');
  const wanted = raw === null ? undefined : PREVIEW_ALIASES[raw.toLowerCase()] ?? null;
  try {
    if (wanted === null) {
      sessionStorage.removeItem(PREVIEW_KEY);
      return null;
    }
    if (wanted) {
      sessionStorage.setItem(PREVIEW_KEY, wanted);
      return wanted;
    }
    const stored = sessionStorage.getItem(PREVIEW_KEY);
    return isSeasonalEventId(stored) ? stored : null;
  } catch {
    return wanted ?? null;
  }
}

export const SeasonalEventProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const location = useLocation();

  const [preview, setPreview] = useState<SeasonalEventId | null>(() => readPreview(location.search));
  const [event, setEvent] = useState<SeasonalEventState | null>(null);
  const [loading, setLoading] = useState(true);
  const [celebration, setCelebration] = useState<SeasonalStep[]>([]);
  const lastFetch = useRef(0);
  const requestId = useRef(0);
  const seenInMemory = useRef<string[]>([]);

  useEffect(() => {
    setPreview(readPreview(location.search));
  }, [location.search]);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    lastFetch.current = Date.now();
    const { data, error } = await supabase.rpc('get_seasonal_event_state', { p_preview: preview });
    if (id !== requestId.current) return;
    if (!error) {
      const next = data as SeasonalEventState | null;
      setEvent(next && isSeasonalEventId(next.id) ? next : null);
    }
    setLoading(false);
    // userId: a sessão do supabase muda junto e o estado é de outra pessoa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Trocou de página: atualiza (a pessoa pode ter avaliado na Biblioteca).
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.current > 30_000) refresh();
    };
    const onRequest = () => {
      refresh();
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener(REFRESH_EVENT, onRequest);
    return () => {
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener(REFRESH_EVENT, onRequest);
    };
  }, [refresh]);

  // Tags do evento conquistadas nesta edição e ainda não comemoradas
  // neste aparelho.
  useEffect(() => {
    if (!event || !userId || event.is_preview) return;
    const startsAt = new Date(event.starts_at).getTime();
    const unlocked = event.steps.filter((step) => step.unlocked && step.unlocked_at && new Date(step.unlocked_at).getTime() >= startsAt);
    if (unlocked.length === 0) return;

    let seen = seenInMemory.current;
    try {
      const stored = JSON.parse(localStorage.getItem(seenKey(userId)) || '[]');
      if (Array.isArray(stored)) seen = [...new Set([...seen, ...stored.filter((tag): tag is string => typeof tag === 'string')])];
    } catch {
      // sem armazenamento: só o que já foi comemorado nesta visita
    }
    const fresh = unlocked.filter((step) => !seen.includes(step.tag));
    if (fresh.length === 0) return;

    const nextSeen = [...new Set([...seen, ...fresh.map((step) => step.tag)])];
    seenInMemory.current = nextSeen;
    try {
      localStorage.setItem(seenKey(userId), JSON.stringify(nextSeen));
    } catch {
      // segue sem guardar
    }
    setCelebration((current) => [...current, ...fresh.filter((step) => !current.some((c) => c.tag === step.tag))]);
  }, [event, userId]);

  const theme = event ? SEASONAL_THEMES[event.id] : null;
  const value = useMemo(() => ({ event, theme, loading, refresh }), [event, theme, loading, refresh]);

  return (
    <SeasonalEventContext.Provider value={value}>
      {children}
      {event && theme && userId && celebration.length > 0 && (
        <SeasonalCelebration
          steps={celebration}
          event={event}
          theme={theme}
          userId={userId}
          onClose={() => setCelebration([])}
        />
      )}
    </SeasonalEventContext.Provider>
  );
};

export const useSeasonalEvent = () => useContext(SeasonalEventContext);

// Decoração do perfil: aparece o ano inteiro em quem estiver USANDO a
// última tag de um evento (🎃 Headless Horseman → Halloween, 🎅 Ho Ho Ho → Natal).
// Para quem está logado, confere no banco se o dono tem mesmo a tag (a tag
// em uso é gravada pelo navegador); visitantes, que não leem as tags, veem
// a tag em uso. No seu próprio perfil, a prévia (?evento=natal) também mostra.
export function useTagDecoration(
  profileUserId: string | null | undefined,
  activeTag: { name?: string; category?: string } | null | undefined,
  isOwn: boolean,
): SeasonalEventId | null {
  const { event } = useSeasonalEvent();
  const { session } = useAuth();
  const signedIn = Boolean(session?.user?.id);
  const decoration = decorationForActiveTag(activeTag);
  const wanted = decoration?.eventId ?? null;
  const wantedTagId = decoration?.tagId ?? null;
  const key = `${profileUserId ?? ''}:${wantedTagId ?? ''}`;
  const [verified, setVerified] = useState<{ key: string; owned: boolean } | null>(null);

  useEffect(() => {
    if (!wantedTagId || !profileUserId || !signedIn) return;
    let cancelled = false;
    supabase
      .from('user_special_tags')
      .select('tag_id')
      .eq('user_id', profileUserId)
      .eq('tag_id', wantedTagId)
      .maybeSingle()
      .then(({ data, error }) => {
        // erro de leitura: na dúvida, mostra (é só enfeite)
        if (!cancelled) setVerified({ key, owned: Boolean(error) || Boolean(data) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, wantedTagId, profileUserId, signedIn]);

  if (isOwn && event?.is_preview) return event.id;
  if (!wanted) return null;
  if (!signedIn) return wanted;
  return verified?.key === key && verified.owned ? wanted : null;
}

// Mini perfis (cartões da Comunidade): a mesma regra da decoração do perfil,
// com uma consulta só para todos os cartões da página.
export function useTagDecorations(
  profiles: { id: string; active_tag?: { name?: string; category?: string } | null }[],
): Record<string, SeasonalEventId> {
  const candidates = profiles
    .map((profile) => ({ id: profile.id, deco: decorationForActiveTag(profile.active_tag) }))
    .filter((c): c is { id: string; deco: TagDecoration } => c.deco !== null);
  const key = candidates
    .map((c) => `${c.id}:${c.deco.tagId}`)
    .sort()
    .join(',');
  const [owned, setOwned] = useState<{ key: string; pairs: Set<string> } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const wanted = key.split(',').map((pair) => {
      const [userId, tagId] = pair.split(':');
      return { userId, tagId };
    });
    supabase
      .from('user_special_tags')
      .select('user_id, tag_id')
      .in('user_id', [...new Set(wanted.map((w) => w.userId))])
      .in('tag_id', [...new Set(wanted.map((w) => w.tagId))])
      .then(({ data, error }) => {
        if (cancelled) return;
        // erro de leitura: na dúvida, mostra (é só enfeite)
        const rows = error ? wanted.map((w) => ({ user_id: w.userId, tag_id: w.tagId })) : ((data ?? []) as { user_id: string; tag_id: string }[]);
        setOwned({ key, pairs: new Set(rows.map((row) => `${row.user_id}:${row.tag_id}`)) });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const result: Record<string, SeasonalEventId> = {};
  if (owned?.key === key) {
    candidates.forEach((c) => {
      if (owned.pairs.has(`${c.id}:${c.deco.tagId}`)) result[c.id] = c.deco.eventId;
    });
  }
  return result;
}

