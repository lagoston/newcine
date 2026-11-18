import React, { createContext, useContext, useEffect } from 'react';

type Theme = 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
});

// 18/11/2026 (otimização): o tema é fixo, então o valor do contexto é uma
// constante (antes era um objeto novo a cada render do provedor).
const DARK_THEME_VALUE: ThemeContextType = {
  theme: 'dark',
  toggleTheme: () => {
    // Modo escuro permanente - função vazia
  },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  }, []);

  return (
    <ThemeContext.Provider value={DARK_THEME_VALUE}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}