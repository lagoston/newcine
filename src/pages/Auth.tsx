import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Loader2, Mail, Lock, User, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthShell, AuthHeading, AuthTabs, AuthField, AuthError, AuthSubmit, AuthTextButton } from '../components/AuthUI';
import { VELVET, PAPER, MIST } from '../lib/oracleTheme';
import { useTranslation } from 'react-i18next';

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { 
    signIn, 
    signUp, 
    loading, 
    resendVerificationEmail, 
    resetPassword,
    user, 
    refreshSession 
  } = useAuth();
  const { t } = useTranslation();

  // Erros do Supabase chegam crus e em inglês ("Invalid login credentials").
  // Traduz só na hora de EXIBIR — a lógica abaixo ainda compara algumas
  // mensagens originais ('Email not verified', 'wait N seconds').
  const translateAuthError = (message?: string): string => {
    const m = (message || '').toLowerCase();
    if (!m) return t('auth.errGeneric');
    // Mensagens do Supabase E as que o lib/auth.tsx já reescreve antes de
    // chegar aqui ("Invalid email or password", "Username is already taken"...).
    if (m.includes('invalid login credentials') || m.includes('invalid email or password')) return t('auth.errInvalidCredentials');
    if (m.includes('already registered')) return t('auth.errEmailTaken');
    if (m.includes('username') && m.includes('taken')) return t('auth.errUsernameTaken');
    if (m.includes('username must be')) return t('auth.errUsernameFormat');
    if (m.includes('failed to create account')) return t('auth.errCreateAccount');
    if (m.includes('failed to sign in')) return t('auth.errGeneric');
    if (m.includes('rate limit') || m.includes('too many') || m.includes('for security purposes')) return t('auth.errRateLimit');
    if (m.includes('invalid format') || m.includes('unable to validate email')) return t('auth.errEmailInvalid');
    if (m.includes('password should be at least')) return t('auth.errPasswordLength');
    if (m.includes('failed to fetch') || m.includes('network')) return t('auth.errNetwork');
    return message as string;
  };
  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  // Authentication flow states
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot-password'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [rememberMe, setRememberMe] = useState(() => {
    const saved = localStorage.getItem('rememberMe');
    return saved ? JSON.parse(saved) : true;
  });
  
  // UI states
  const [error, setError] = useState('');
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State tracking refs
  const processedVerifiedParam = useRef(false);
  const resendTimeoutRef = useRef<number>();
  const pollingIntervalRef = useRef<number>();

  useEffect(() => {
    localStorage.setItem('rememberMe', JSON.stringify(rememberMe));
  }, [rememberMe]);
  
  // Check URL for verification parameters and location state
  useEffect(() => {
    const checkUrlAndState = async () => {
      try {
        // Handle location state (from redirects)
        if (location.state) {
          if (location.state.recoveryFailed) {
            console.log('Password recovery failed, showing forgot password form');
            setMode('forgot-password');
          } else if (location.state.resetSuccess) {
            toast.success(t('auth.toastPasswordUpdated'));
          }
        }

        // Check for signup mode parameter
        const signup = searchParams.get('signup');
        if (signup === 'true') {
          setMode('signup');
          // Clean URL without reloading
          window.history.replaceState({}, '', location.pathname);
        }

        // Check for verification parameter
        const verified = searchParams.get('verified');
        if (verified === 'true' && !processedVerifiedParam.current) {
          console.log('🔑 Email verification detected from URL params');
          processedVerifiedParam.current = true;

          // Clean URL without reloading
          window.history.replaceState({}, '', location.pathname);

          toast.success(t('auth.toastEmailVerified'));
          setMode('signin');
          await refreshSession();
        }
      } catch (error) {
        console.error('Error processing URL parameters:', error);
      }
    };
    
    checkUrlAndState();
  }, [searchParams, location, refreshSession]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (resendTimeoutRef.current) {
        clearTimeout(resendTimeoutRef.current);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Reset verification screen when user navigates back to /auth (e.g. via Navbar "Entrar" button)
  useEffect(() => {
    setShowVerificationMessage(false);
    // Não volta pro "Entrar" quando a navegação veio de um link de
    // redefinição inválido/expirado: nesse caso o efeito acima já abriu o
    // "Esqueceu a senha?" e este reset (que roda depois) o sobrescrevia.
    if (searchParams.get('signup') !== 'true' && !(location.state as { recoveryFailed?: boolean } | null)?.recoveryFailed) {
      setMode('signin');
    }
    setError('');
  }, [location.key, searchParams]);

  // Poll for session while on verification screen (handles same-browser tab confirmation + cross-device)
  useEffect(() => {
    if (!showVerificationMessage) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = undefined;
      }
      return;
    }

    pollingIntervalRef.current = window.setInterval(async () => {
      await refreshSession();
    }, 4000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = undefined;
      }
    };
  }, [showVerificationMessage, refreshSession]);
  
  // Redirect if user is already logged in
  useEffect(() => {
    if (user && location.pathname === '/auth') {
      console.log('🔑 User already logged in, redirecting from auth page');
      const destination = location.state?.from?.pathname || '/';
      navigate(destination, { replace: true });
    }
  }, [user, navigate, location]);
  
  // Handle cooldown timer for resend button
  useEffect(() => {
    if (resendCooldown > 0) {
      resendTimeoutRef.current = window.setTimeout(() => {
        setResendCooldown(prev => prev - 1);
      }, 1000);
    }
    return () => {
      if (resendTimeoutRef.current) clearTimeout(resendTimeoutRef.current);
    };
  }, [resendCooldown]);
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || loading) return;
    
    setError('');
    setIsSubmitting(true);
    
    try {
      switch (mode) {
        case 'forgot-password':
          if (!email.trim()) {
            throw new Error(t('auth.errEmailRequired'));
          }
          if (!isValidEmail(email)) {
            throw new Error(t('auth.errEmailInvalid'));
          }
          
          await resetPassword(email);
          toast.success(t('auth.toastResetSent'));
          setMode('signin');
          break;
          
        case 'signup':
          if (!username.trim() || !email.trim() || !password.trim()) {
            throw new Error(t('auth.errAllFields'));
          }

          // Validate username format
          if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            throw new Error(t('auth.errUsernameFormat'));
          }

          if (!isValidEmail(email)) {
            throw new Error(t('auth.errEmailInvalid'));
          }

          // Additional validation for password strength
          if (password.length < 6) {
            throw new Error(t('auth.errPasswordLength'));
          }
          
          console.log('Starting signup process...', { email, username });
          const result = await signUp(email, password, username);
          console.log('Signup result:', result);

          if (result?.error) {
            // Enhanced error handling
            console.error('Signup error details:', result.error);
            
            // Handle specific error cases
            if (result.error.message.includes('Username')) {
              throw new Error(t('auth.errUsernameTaken'));
            } else if (result.error.message.includes('Email')) {
              throw new Error(t('auth.errEmailTaken'));
            } else if (result.error.message.includes('Database error')) {
              console.error('Database error details:', result.error);
              throw new Error(t('auth.errCreateAccount'));
            } else {
              throw new Error(result.error.message || t('auth.errGeneric'));
            }
          }

          // If we get here, signup was successful
          setShowVerificationMessage(true);
          break;
          
        case 'signin':
        default:
          if (!email.trim() || !password.trim()) {
            throw new Error(t('auth.errEmailPasswordRequired'));
          }
          
          const signInResult = await signIn(email, password, {
            storeSession: rememberMe ? 'localStorage' : 'sessionStorage'
          });

          if (signInResult?.error) {
            console.error('Sign in error:', signInResult.error);
            throw new Error(signInResult.error.message || t('auth.errGeneric'));
          }

          if (signInResult?.session) {
            const destination = location.state?.from?.pathname || '/';
            navigate(destination, { replace: true });
          }
          break;
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      
      // Enhanced error handling with more specific messages
      if (error.message === 'Email not verified') {
        setShowVerificationMessage(true);
      } else if (error.message.includes('Database error')) {
        setError(t('auth.errCreateAccount'));
        console.error('Database error details:', error);
      } else {
        setError(translateAuthError(error.message));
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle resending verification email
  const handleResendEmail = async () => {
    if (resendCooldown > 0 || loading || !email) return;
    
    try {
      await resendVerificationEmail(email);
      setResendCooldown(20); // Supabase typically has a 20 second cooldown
      toast.success(t('auth.toastVerificationResent'));
    } catch (error: any) {
      console.error('Error resending verification email:', error);
      
      // Parse cooldown time from error message if available
      if (error.message?.includes('wait')) {
        const match = error.message.match(/wait (\d+) seconds/);
        if (match) {
          setResendCooldown(parseInt(match[1], 10));
        }
      }
      setError(translateAuthError(error.message));
    }
  };

  // Reset all form state when changing modes
  const changeMode = (newMode: 'signin' | 'signup' | 'forgot-password') => {
    setMode(newMode);
    setError('');
    // Only reset fields if not going to/from recovery to preserve email
    if (!(
      (mode === 'forgot-password' && newMode === 'signin') || 
      (mode === 'signin' && newMode === 'forgot-password')
    )) {
      setPassword('');
      if (newMode === 'signin') {
        setUsername('');
      }
    }
  };
  
  const busy = isSubmitting || loading;

  // Tela "Verifique seu e-mail" — o ponto pulsante não é enfeite: indica
  // que a sessão está sendo verificada a cada 4s (confirmação em outra aba
  // ou outro aparelho entra sozinha).
  if (showVerificationMessage) {
    return (
      <AuthShell>
        <span className="w-14 h-14 rounded-2xl grid place-items-center ring-1 ring-violet-300/30 mb-6 text-violet-200" style={{ background: VELVET }}>
          <Mail className="w-7 h-7" aria-hidden />
        </span>
        <AuthHeading title={t('auth.checkEmailTitle')} />
        <p className="mt-4 text-base leading-relaxed" style={{ color: MIST }}>
          {t('auth.checkEmailSent')}{' '}
          <strong className="font-semibold [overflow-wrap:anywhere]" style={{ color: PAPER }}>{email}</strong>.{' '}
          {t('auth.checkEmailInbox')}
        </p>
        <p className="mt-6 flex items-center gap-2.5 text-sm" style={{ color: MIST }} aria-live="polite">
          <span className="relative flex w-2.5 h-2.5" aria-hidden>
            <span className="absolute inset-0 rounded-full bg-violet-400 animate-ping opacity-60" />
            <span className="relative w-2.5 h-2.5 rounded-full bg-violet-400" />
          </span>
          {t('auth.waitingConfirmation')}
        </p>
        <div className="mt-8 flex flex-col items-start gap-4">
          <button
            type="button"
            onClick={handleResendEmail}
            disabled={loading || resendCooldown > 0}
            className="w-full h-12 rounded-xl text-base font-semibold ring-1 ring-white/15 hover:ring-white/30 hover:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
            style={{ color: PAPER }}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                {t('auth.sending')}
              </span>
            ) : resendCooldown > 0 ? (
              t('auth.resendCooldown', { seconds: resendCooldown })
            ) : (
              t('auth.resendShort')
            )}
          </button>
          <AuthTextButton
            onClick={() => {
              setShowVerificationMessage(false);
              setMode('signin');
            }}
          >
            {t('auth.alreadyConfirmed')}
          </AuthTextButton>
        </div>
        {error && <div className="mt-5"><AuthError message={error} /></div>}
      </AuthShell>
    );
  }

  const title = mode === 'signup' ? t('auth.signUpHeading') : mode === 'forgot-password' ? t('auth.forgotPassword') : t('auth.signInHeading');
  const subtitle = mode === 'signup' ? t('auth.signUpSub') : mode === 'forgot-password' ? t('auth.resetPasswordDesc') : t('auth.signInSub');
  const submitLabel = mode === 'signup' ? t('auth.createAccountBtn') : mode === 'forgot-password' ? t('auth.sendResetLink') : t('auth.signInBtn');
  const submitLoadingLabel = mode === 'signup' ? t('auth.creatingAccount') : mode === 'forgot-password' ? t('auth.sendingResetLink') : t('auth.signingIn');

  return (
    <AuthShell>
      {mode === 'forgot-password' ? (
        <AuthTextButton onClick={() => changeMode('signin')} disabled={busy} className="inline-flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" aria-hidden />
          {t('auth.backToSignIn')}
        </AuthTextButton>
      ) : (
        <AuthTabs value={mode} onChange={changeMode} disabled={busy} />
      )}

      <div className="mt-7">
        <AuthHeading title={title} subtitle={subtitle} />
      </div>

      {/* noValidate: as mensagens de erro são as do app (traduzidas), não os
          balões nativos do navegador. */}
      <form className="mt-7 space-y-5" onSubmit={handleSubmit} noValidate>
        {mode === 'signup' && (
          <AuthField
            id="username"
            label={t('auth.username')}
            icon={User}
            value={username}
            onChange={setUsername}
            placeholder={t('auth.usernamePlaceholderShort')}
            autoComplete="username"
            helper={t('auth.usernameHelp')}
            minLength={3}
            maxLength={20}
            pattern="^[a-zA-Z0-9_]+$"
            disabled={busy}
          />
        )}

        <AuthField
          id="email"
          type="email"
          label={t('auth.emailAddress')}
          icon={Mail}
          value={email}
          onChange={setEmail}
          placeholder={t('auth.emailPlaceholderShort')}
          autoComplete="email"
          disabled={busy}
        />

        {mode !== 'forgot-password' && (
          <AuthField
            id="password"
            type="password"
            label={t('auth.password')}
            icon={Lock}
            value={password}
            onChange={setPassword}
            placeholder={t('auth.passwordPlaceholder')}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            helper={mode === 'signup' ? t('auth.passwordHelp') : undefined}
            minLength={6}
            disabled={busy}
          />
        )}

        {mode === 'signin' && (
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="remember-me" className="inline-flex items-center gap-2.5 text-sm cursor-pointer select-none" style={{ color: MIST }}>
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded accent-violet-500"
              />
              {t('auth.rememberMe')}
            </label>
            <AuthTextButton onClick={() => changeMode('forgot-password')} disabled={busy}>
              {t('auth.forgotPasswordLink')}
            </AuthTextButton>
          </div>
        )}

        {error && <AuthError message={error} />}

        <AuthSubmit label={submitLabel} loadingLabel={submitLoadingLabel} loading={busy} />
      </form>
    </AuthShell>
  );
}