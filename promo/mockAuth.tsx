import React from 'react';
import { ME_ID } from './data';

// Sessão de mentira: a "conta" do comercial é a narradora.
const session = { user: { id: ME_ID, email: 'promo@cineoracle.invalid' }, access_token: 'promo' };
const noopAsync = async () => undefined;

const value = {
  session,
  user: session.user,
  loading: false,
  isPremium: false,
  isLifetimePremium: false,
  signIn: noopAsync,
  signUp: noopAsync,
  signOut: noopAsync,
  resendVerificationEmail: noopAsync,
  refreshSession: noopAsync,
  resetPassword: noopAsync,
  updatePassword: noopAsync,
  checkPremiumStatus: noopAsync,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAuth(): any {
  return value;
}
