// Login de mentira para o build de teste (scripts/perf/vite.smoke.config.ts).
// localStorage.measure_guest = '1' → visitante; senão, uma pessoa logada (u1),
// Premium. Mesmas exportações de src/lib/auth.tsx.
import React from 'react';

const guest = () => localStorage.getItem('measure_guest') === '1';
const value = () => {
  const user = guest() ? null : ({ id: 'u1', email: 'x@y.z' } as never);
  const session = user ? ({ user, access_token: 't' } as never) : null;
  const noop = async () => undefined as never;
  return { session, user, loading: false, isPremium: true, isLifetimePremium: false, signIn: noop, signUp: noop, signOut: noop, resendVerificationEmail: noop, refreshSession: noop, resetPassword: noop, updatePassword: noop, checkPremiumStatus: noop };
};
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export const useAuth = () => value();
