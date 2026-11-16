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

export const DirectorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  // o nível do app autenticador muda o token, não o usuário
  const token = session?.access_token ?? null;
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
    // userId e token: a resposta é sobre a sessão que pediu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
