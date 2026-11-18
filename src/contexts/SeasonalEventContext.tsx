import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { emit } from '../lib/bus';
import { Q, applyRules, invalidate, refetchIfStale, useCached, useOwner } from '../lib/data';
import { useDirector } from './DirectorContext';
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
// O estado vem de get_seasonal_event_state(), guardado pela camada de dados
// (src/lib/data, chave ['seasonal']): vale 5 minutos, é refeito ao voltar para
// o app depois disso, quando alguém pede (requestSeasonalRefresh) e, se algo o
// marcou como "talvez mudou", na próxima troca de página. Quando uma tag do
// evento é conquistada, a comemoração aparece aqui, em qualquer página.

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
const seenKey = (userId: string) => `cineoracle:seasonalSeen:${userId}`;
// O ensaio da Conta Diretor (17/11/2026) comemora à parte, e de novo a cada
// "Recomeçar": nada do ensaio entra na lista do evento de verdade.
const trialSeenKey = (userId: string, event: SeasonalEventState) =>
  `cineoracle:seasonalTrialSeen:${userId}:${event.id}:${event.edition}:${event.trial_started_at ?? ''}`;

// Pede uma atualização do evento agora (depois de sussurrar, de recomeçar o
// ensaio…). 18/11/2026 (Reborn, onda 2a): virou um aviso do barramento
// ('seasonal:stale'); a camada de dados escuta e refaz a consulta. O aviso
// antigo de window ('cineoracle:seasonal-refresh') continua saindo junto.
export const requestSeasonalRefresh = () => {
  emit('seasonal:stale', {});
};

// "O evento pode ter mudado" (a pessoa avaliou algo), sem pedir nada na hora:
// a consulta fica marcada como vencida e é refeita na próxima troca de página
// ou volta ao app. 18/11/2026 (Reborn, onda 2a): a marca saiu de uma variável
// deste arquivo e foi para a camada de dados. É o mesmo efeito que o aviso
// 'title:rated' do barramento tem no evento sazonal e no estado do Jackpot;
// quando o menu do título e a Biblioteca passarem a emitir 'title:rated' (2b),
// esta função some.
export const markSeasonalStale = () => {
  applyRules([
    [['seasonal'], 'later'],
    [['jackpot', 'state'], 'later'],
  ]);
};

// Sair de uma destas páginas refaz a consulta: nelas se avalia por caminhos que
// ainda não avisam ninguém (Adicionar filmes, listas, edição em lote). Sai
// daqui quando todos emitirem 'title:rated' (2b).
const RATING_PAGES = ['/library', '/add-movies', '/lists'];
// A resposta sem o relógio do servidor (`now` muda a cada chamada): duas
// respostas iguais aqui são o mesmo estado do evento.
const eventSignature = (event: SeasonalEventState | null) => (event ? JSON.stringify({ ...event, now: null }) : 'null');
const sameEvent = (a: SeasonalEventState | null, b: SeasonalEventState | null) => eventSignature(a) === eventSignature(b);

// Prévia de um evento fora da época. Desde 16/11/2026 (Conta Diretor) é só do
// diretor: o banco ignora p_preview de qualquer outra conta. ?evento=natal liga
// a prévia na tela do diretor (guardada no aparelho, como a escolha feita no
// painel /diretor); ?evento=off desliga. Para os outros, o parâmetro não faz nada.
function previewFromUrl(search: string): SeasonalEventId | null | undefined {
  const raw = new URLSearchParams(search).get('evento');
  if (raw === null) return undefined;
  return PREVIEW_ALIASES[raw.toLowerCase()] ?? null;
}

export const SeasonalEventProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const location = useLocation();

  const director = useDirector();
  const preview = director.isDirector ? director.prefs.eventPreview : null;
  const [celebration, setCelebration] = useState<SeasonalStep[]>([]);
  const seenInMemory = useRef<string[]>([]);
  const trialSeenInMemory = useRef<Record<string, string[]>>({});

  const { isDirector, setPref } = director;
  useEffect(() => {
    // a prévia antiga ficava na aba, para qualquer um: some
    try {
      sessionStorage.removeItem(PREVIEW_KEY);
    } catch {
      // sem armazenamento
    }
    const wanted = previewFromUrl(location.search);
    if (wanted !== undefined && isDirector) setPref('eventPreview', wanted);
  }, [location.search, isDirector, setPref]);

  // 18/11/2026 (Reborn, onda 2a): o estado do evento é uma consulta da camada
  // de dados. Medido na prévia de rede: a abertura pedia o evento 2× (uma antes
  // de o login chegar, descartada) e agora pede 1×; a resposta fica guardada 5
  // min (e no aparelho: ao reabrir o app a decoração já vem, sem esperar a
  // rede). Resposta igual à guardada devolve o MESMO objeto: quem consome não
  // redesenha.
  const owner = useOwner();
  const query = useCached<SeasonalEventState | null>(
    Q.seasonal(owner, preview ?? null),
    async () => {
      const { data, error } = await supabase.rpc('get_seasonal_event_state', { p_preview: preview });
      if (error) throw error;
      const raw = data as SeasonalEventState | null;
      return raw && isSeasonalEventId(raw.id) ? raw : null;
    },
    { keep: sameEvent },
  );
  const event = query.data ?? null;
  // carregando até a primeira resposta (ou o primeiro erro)
  const loading = query.isPending && !query.error;

  const refresh = useCallback(() => invalidate(['seasonal']), []);

  // Trocou de página: atualiza se a pessoa pode ter avaliado (saiu da
  // Biblioteca, de Adicionar filmes ou das listas) ou se a resposta venceu
  // (5 min, ou marcada por markSeasonalStale / 'title:rated').
  const previousPath = useRef<string | null>(null);
  useEffect(() => {
    const from = previousPath.current;
    previousPath.current = location.pathname;
    if (from === null) return;
    const leftRatingPage = RATING_PAGES.some((page) => from === page || from.startsWith(`${page}/`));
    if (leftRatingPage) void invalidate(['seasonal']);
    else void refetchIfStale(['seasonal']);
  }, [location.pathname]);

  // Tags do evento conquistadas nesta edição e ainda não comemoradas
  // neste aparelho. No ensaio do diretor, as missões feitas no ensaio.
  useEffect(() => {
    if (!event || !userId) return;
    const trial = Boolean(event.is_trial);
    if (event.is_preview && !trial) return;
    const startsAt = new Date(trial ? (event.trial_started_at ?? event.now) : event.starts_at).getTime();
    const unlocked = event.steps.filter((step) => step.unlocked && step.unlocked_at && new Date(step.unlocked_at).getTime() >= startsAt);
    if (unlocked.length === 0) return;

    const storeKey = trial ? trialSeenKey(userId, event) : seenKey(userId);
    let seen = trial ? (trialSeenInMemory.current[storeKey] ?? []) : seenInMemory.current;
    try {
      const stored = JSON.parse(localStorage.getItem(storeKey) || '[]');
      if (Array.isArray(stored)) seen = [...new Set([...seen, ...stored.filter((tag): tag is string => typeof tag === 'string')])];
    } catch {
      // sem armazenamento: só o que já foi comemorado nesta visita
    }
    const fresh = unlocked.filter((step) => !seen.includes(step.tag));
    if (fresh.length === 0) return;

    const nextSeen = [...new Set([...seen, ...fresh.map((step) => step.tag)])];
    if (trial) trialSeenInMemory.current[storeKey] = nextSeen;
    else seenInMemory.current = nextSeen;
    try {
      localStorage.setItem(storeKey, JSON.stringify(nextSeen));
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
  const { isDirector } = useDirector();
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
  // Conta Diretor (16/11/2026): veste a tag sem tê-la para ver a decoração no próprio perfil
  if (isOwn && isDirector) return wanted;
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

