import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import {
  DEFAULT_PREFS,
  NO_DIRECTOR,
  fetchDirectorState,
  readDirectorPrefs,
  writeDirectorPrefs,
  type DirectorPrefs,
  type DirectorState,
} from '../lib/director';
import { setStudioPreviewOwner } from '../lib/personaWorld';

// Conta Diretor (16/11/2026): o estado do papel para a tela (ver lib/director.ts).
// Pergunta ao banco ao entrar e a cada troca de sessão; para quem não é diretor
// a resposta é sempre "não", e nada muda no site.

interface DirectorContextValue extends DirectorState {
  isDirector: boolean;
  loading: boolean;
  prefs: DirectorPrefs;
  setPref: <K extends keyof DirectorPrefs>(key: K, value: DirectorPrefs[K]) => void;
  refresh: () => Promise<void>;
}

const DirectorContext = createContext<DirectorContextValue>({
  ...NO_DIRECTOR,
  isDirector: false,
  loading: false,
  prefs: DEFAULT_PREFS,
  setPref: () => {},
  refresh: async () => {},
});

// 18/11/2026 (otimização): o que importa do token para o papel de diretor é o
// nível de autenticação (aal) e o último código digitado (amr), que mudam ao
// passar pelo app autenticador. Antes a consulta dependia do token inteiro e
// era refeita a cada renovação automática (de hora em hora), piscando
// `loading` para os 13 consumidores sem nada ter mudado. Token ilegível: volta
// ao comportamento antigo (o próprio token).
function authLevelKey(token: string | null): string | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    const amr = Array.isArray(json.amr) ? json.amr : [];
    const lastCode = amr.reduce((max: number, entry: { timestamp?: number }) => Math.max(max, Number(entry?.timestamp) || 0), 0);
    return `${json.aal ?? ''}:${lastCode}`;
  } catch {
    return token;
  }
}

export const DirectorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  // o nível do app autenticador muda o token, não o usuário
  const token = session?.access_token ?? null;
  const authLevel = useMemo(() => authLevelKey(token), [token]);
  const [state, setState] = useState<DirectorState>(NO_DIRECTOR);
  const [loading, setLoading] = useState(Boolean(userId));
  const [prefs, setPrefs] = useState<DirectorPrefs>(DEFAULT_PREFS);

  const refresh = useCallback(async () => {
    if (!userId) {
      setState(NO_DIRECTOR);
      setLoading(false);
      return;
    }
    setLoading(true);
    const next = await fetchDirectorState();
    setState(next);
    setLoading(false);
    // userId e nível de autenticação: a resposta é sobre a sessão que pediu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, authLevel]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // O nível 3 ("código há menos de 15 minutos") vence sozinho, sem o token
  // mudar: confere de novo quando ele vence (antes isso só acontecia na
  // renovação do token, até 1 h depois). Só para quem é diretor.
  useEffect(() => {
    if (!state.recent) return;
    const id = window.setTimeout(() => {
      refresh();
    }, 15 * 60 * 1000 + 5000);
    return () => window.clearTimeout(id);
  }, [state.recent, refresh]);

  useEffect(() => {
    setPrefs(userId && state.director ? readDirectorPrefs(userId) : DEFAULT_PREFS);
  }, [userId, state.director]);

  // o estúdio completo vale só para a cena da própria conta (lib/personaWorld.ts)
  useEffect(() => {
    setStudioPreviewOwner(state.director && prefs.studioAll ? userId : null);
  }, [state.director, prefs.studioAll, userId]);

  const setPref = useCallback(
    <K extends keyof DirectorPrefs>(key: K, value: DirectorPrefs[K]) => {
      if (!userId) return;
      setPrefs((current) => {
        const next = { ...current, [key]: value };
        writeDirectorPrefs(userId, next);
        return next;
      });
    },
    [userId],
  );

  const value = useMemo(
    () => ({ ...state, isDirector: state.director, loading, prefs, setPref, refresh }),
    [state, loading, prefs, setPref, refresh],
  );

  return <DirectorContext.Provider value={value}>{children}</DirectorContext.Provider>;
};

export const useDirector = () => useContext(DirectorContext);
