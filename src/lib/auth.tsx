import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isPremium: boolean;
  isLifetimePremium: boolean;
  signIn: (email: string, password: string, options?: { storeSession: 'localStorage' | 'sessionStorage' }) => Promise<any>;
  signUp: (email: string, password: string, username: string) => Promise<any>;
  signOut: () => Promise<void>;
  resendVerificationEmail: (email: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  checkPremiumStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [isLifetimePremium, setIsLifetimePremium] = useState(false);

  useEffect(() => {
    console.log("🔄 Auth: Initializing...");
    let mounted = true;
    
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      
      if (error) {
        console.error("❌ Auth: Error getting session", error);
        handleSessionError(error);
        return;
      }
      
      if (data.session) {
        console.log("✅ Auth: Session restored");
        setSession(data.session);
        setUser(data.session.user);
        checkPremiumStatus(data.session.user.id);
      } else {
        console.log("ℹ️ Auth: No session found");
        setSession(null);
        setUser(null);
        setIsPremium(false);
      }
      
      setLoading(false);
    });
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        console.log(`🔔 Auth: Event "${event}" occurred`, { currentSession });
        
        if (event === 'PASSWORD_RECOVERY') {
          console.log('🔑 Auth: Password recovery flow detected');
          return;
        }
        
        if (event === 'TOKEN_REFRESHED') {
          console.log('✅ Auth: Token successfully refreshed');
        }

        if (event === 'TOKEN_REFRESH_FAILED') {
          console.log('❌ Auth: Token refresh failed');
          clearAuthState();
          window.location.href = '/auth?error=session_expired';
          return;
        }
        
        if (event === 'SIGNED_OUT') {
          console.log('ℹ️ Auth: User signed out');
          clearAuthState();
        } else if (currentSession) {
          setSession(currentSession);
          setUser(currentSession.user);
          
          if (event === 'SIGNED_IN') {
            checkPremiumStatus(currentSession.user.id);
          }
        }
        
        setLoading(false);
      }
    );

    return () => {
      console.log("🧹 Auth: Cleaning up subscription");
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const clearAuthState = () => {
    setSession(null);
    setUser(null);
    setIsPremium(false);
    setIsLifetimePremium(false);

    try {
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('supabase.auth.refreshToken');
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
  };

  const handleSessionError = (error: any) => {
    console.error("❌ Auth: Session error", error);
    clearAuthState();
    setLoading(false);
  };

  const checkPremiumStatus = async (userId?: string) => {
    const id = userId ?? user?.id;
    if (!id) return;

    try {
      console.log("🔍 Checking premium status...");

      const [premiumResult, lifetimeResult] = await Promise.all([
        supabase.rpc('get_user_premium_status', { user_id_input: id }),
        supabase.rpc('is_lifetime_premium', { user_id_input: id })
      ]);

      if (premiumResult.error) {
        console.error('Error getting premium status:', premiumResult.error);
      } else {
        const isPremiumUser = premiumResult.data || false;
        setIsPremium(isPremiumUser);
        console.log(`Premium status: ${isPremiumUser ? 'Premium' : 'Free'}`);
      }

      if (lifetimeResult.error) {
        console.error('Error getting lifetime status:', lifetimeResult.error);
      } else {
        const isLifetime = lifetimeResult.data || false;
        setIsLifetimePremium(isLifetime);
        if (isLifetime) {
          console.log('User has LIFETIME premium');
        }
      }
    } catch (error) {
      console.error('Error checking premium status:', error);
      const { data } = await supabase
        .from('profiles')
        .select('plan_type, lifetime_premium')
        .eq('id', id)
        .single();

      setIsPremium(data?.plan_type === 'premium');
      setIsLifetimePremium(data?.lifetime_premium || false);
    }
  };

  async function signIn(
    email: string,
    password: string,
    options: { storeSession: 'localStorage' | 'sessionStorage' } = { storeSession: 'localStorage' }
  ) {
    try {
      setLoading(true);
      console.log("🔑 Auth: Signing in...");
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      }, {
        storeSession: options.storeSession
      });

      if (error) throw error;

      if (!data.user.email_confirmed_at) {
        console.log("❌ Auth: Email not verified");
        await supabase.auth.signOut();
        throw new Error('Email not verified');
      }
      
      await refreshSession();
      await checkPremiumStatus();

      return data;
    } catch (error: any) {
      console.error('❌ Auth: Sign in error', error);
      
      if (error.message === 'Invalid login credentials') {
        return { error: { message: 'Invalid email or password' } };
      } else if (error.message !== 'Email not verified') {
        return { error: { message: 'Failed to sign in. Please try again.' } };
      }
      
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function signUp(email: string, password: string, username: string) {
    try {
      setLoading(true);
      console.log("🔑 Auth: Signing up...", { email, username });

      // Validate username
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        throw new Error('Username must be 3-20 characters and can only contain letters, numbers, and underscores');
      }

      // Check username availability
      const { data: existingUser, error: checkError } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username)
        .maybeSingle();

      if (checkError) throw checkError;
      if (existingUser) throw new Error('Username is already taken');

      // Create user with metadata
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username
          },
          emailRedirectTo: `${window.location.origin}/auth?verified=true`
        }
      });

      if (signUpError) {
        if (signUpError.message === 'User already registered') {
          throw new Error('This email is already registered. Please sign in.');
        }
        throw signUpError;
      }

      if (!data.user) throw new Error('Failed to create account');

      console.log("✅ Auth: Sign up successful");
      
      return data;
    } catch (error: any) {
      console.error('❌ Auth: Sign up error', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    try {
      setLoading(true);
      console.log("🔑 Auth: Signing out...");
      
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      clearAuthState();
      
      console.log("✅ Auth: Sign out successful");
    } catch (error: any) {
      console.error('❌ Auth: Sign out error', error);
      clearAuthState();
    } finally {
      setLoading(false);
    }
  }

  async function refreshSession() {
    try {
      console.log("🔄 Auth: Refreshing session...");
      
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error("❌ Auth: Error refreshing session", error);
        if (error.message?.includes('Refresh Token Not Found')) {
          handleSessionError(error);
        }
        return;
      }
      
      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        await checkPremiumStatus();
        console.log("✅ Auth: Session refreshed successfully");
      } else {
        if (session) {
          console.log("ℹ️ Auth: Session lost during refresh");
          clearAuthState();
        } else {
          console.log("ℹ️ Auth: No session found during refresh");
        }
      }
    } catch (error) {
      console.error("❌ Auth: Error refreshing session", error);
      handleSessionError(error);
    }
  }

  async function resendVerificationEmail(email: string) {
    try {
      setLoading(true);
      console.log("📧 Auth: Resending verification email...");
      
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth?verified=true`,
        },
      });

      if (error) {
        throw error;
      }
    } catch (error: any) {
      console.error('❌ Auth: Error sending verification email', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(email: string) {
    try {
      setLoading(true);
      console.log("🔑 Auth: Sending password reset email...");
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset`,
      });

      if (error) throw error;

      console.log("✅ Auth: Password reset email sent");
    } catch (error: any) {
      console.error('❌ Auth: Error sending password reset email', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function updatePassword(password: string) {
    try {
      setLoading(true);
      console.log("🔑 Auth: Updating password...");
      
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      console.log("✅ Auth: Password updated");
    } catch (error: any) {
      console.error('❌ Auth: Error updating password', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  const value = {
    session,
    user,
    loading,
    isPremium,
    isLifetimePremium,
    signIn,
    signUp,
    signOut,
    resendVerificationEmail,
    refreshSession,
    resetPassword,
    updatePassword,
    checkPremiumStatus
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}