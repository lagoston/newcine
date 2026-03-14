import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Loader2, Mail, LogIn, UserPlus, Lock, ArrowLeft, AlertCircle, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import Logo from '../components/Logo';
import { motion, AnimatePresence } from 'framer-motion';
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
            toast.success('Password updated successfully! You can now sign in');
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

          toast.success('Email verified successfully! Please sign in');
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
    if (searchParams.get('signup') !== 'true') {
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
            throw new Error('Please enter your email address');
          }
          
          await resetPassword(email);
          toast.success('Password reset email sent! Please check your inbox and spam folder.');
          setMode('signin');
          break;
          
        case 'signup':
          if (!username.trim() || !email.trim() || !password.trim()) {
            throw new Error('All fields are required');
          }

          // Validate username format
          if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            throw new Error('Username must be 3-20 characters and can only contain letters, numbers, and underscores');
          }

          // Additional validation for password strength
          if (password.length < 6) {
            throw new Error('Password must be at least 6 characters long');
          }
          
          console.log('Starting signup process...', { email, username });
          const result = await signUp(email, password, username);
          console.log('Signup result:', result);

          if (result?.error) {
            // Enhanced error handling
            console.error('Signup error details:', result.error);
            
            // Handle specific error cases
            if (result.error.message.includes('Username')) {
              throw new Error('This username is already taken. Please choose another one.');
            } else if (result.error.message.includes('Email')) {
              throw new Error('This email is already registered. Please sign in or use a different email.');
            } else if (result.error.message.includes('Database error')) {
              console.error('Database error details:', result.error);
              throw new Error('There was an error creating your account. Please try again later.');
            } else {
              throw new Error(result.error.message || 'An unexpected error occurred during signup');
            }
          }

          // If we get here, signup was successful
          setShowVerificationMessage(true);
          break;
          
        case 'signin':
        default:
          if (!email.trim() || !password.trim()) {
            throw new Error('Email and password are required');
          }
          
          const signInResult = await signIn(email, password, {
            storeSession: rememberMe ? 'localStorage' : 'sessionStorage'
          });

          if (signInResult?.error) {
            console.error('Sign in error:', signInResult.error);
            throw new Error(signInResult.error.message || 'Failed to sign in');
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
        setError('Unable to create account at this time. Please try again later.');
        console.error('Database error details:', error);
      } else {
        setError(error.message || 'An error occurred during authentication');
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
      toast.success('Verification email sent! Please check your inbox.');
    } catch (error: any) {
      console.error('Error resending verification email:', error);
      
      // Parse cooldown time from error message if available
      if (error.message?.includes('wait')) {
        const match = error.message.match(/wait (\d+) seconds/);
        if (match) {
          setResendCooldown(parseInt(match[1], 10));
        }
      }
      setError(error.message);
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
  
  if (showVerificationMessage) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-blue-950/90 to-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-500/15 to-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-80 h-80 bg-gradient-to-br from-pink-500/12 to-rose-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute bottom-40 left-1/3 w-72 h-72 bg-gradient-to-br from-cyan-500/10 to-blue-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>

        <motion.div
          className="relative rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden max-w-md w-full mx-4"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-500/15 to-cyan-400/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-pink-500/10 to-blue-400/10 rounded-full blur-3xl" />
          </div>
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
            backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '20px 20px'
          }}></div>

          <div className="relative z-10 p-8 text-center">
            <motion.div
              className="flex justify-center mb-6"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <motion.div
                animate={{
                  filter: [
                    'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 10px rgba(255, 255, 255, 0.3)) drop-shadow(0 0 20px rgba(59, 130, 246, 0.3))',
                    'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 14px rgba(59, 130, 246, 0.5)) drop-shadow(0 0 28px rgba(59, 130, 246, 0.4))',
                    'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 10px rgba(255, 255, 255, 0.3)) drop-shadow(0 0 20px rgba(59, 130, 246, 0.3))',
                  ]
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Logo size="large" />
              </motion.div>
            </motion.div>

            <motion.h2
              className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {t('auth.checkEmailTitle')}
            </motion.h2>

            <motion.div
              className="mx-auto w-16 h-16 mb-6 bg-blue-500/15 rounded-2xl flex items-center justify-center border border-blue-400/20"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
            >
              <Mail className="w-8 h-8 text-blue-400" />
            </motion.div>

            <motion.p
              className="text-gray-300/80 mb-6 text-sm leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {t('auth.checkEmailSent')} <strong className="text-white">{email}</strong>.<br />
              {t('auth.checkEmailInbox')}
            </motion.p>

            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-5"></div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <button
                onClick={handleResendEmail}
                disabled={loading || resendCooldown > 0}
                className="text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {t('auth.sending')}
                  </div>
                ) : resendCooldown > 0 ? (
                  t('auth.resendCooldown', { seconds: resendCooldown })
                ) : (
                  t('auth.resendEmail')
                )}
              </button>
            </motion.div>

            <motion.div
              className="mt-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <p className="text-xs text-gray-500 mb-3 flex items-center justify-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                {t('auth.waitingConfirmation')}
              </p>
              <button
                onClick={() => {
                  setShowVerificationMessage(false);
                  setMode('signin');
                }}
                className="w-full py-3 px-4 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-400/20 text-blue-400 hover:text-blue-300 text-sm font-medium transition-all duration-200"
              >
                {t('auth.alreadyConfirmed')}
              </button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    );
  }
  
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-blue-950/90 to-slate-900 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-500/15 to-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-80 h-80 bg-gradient-to-br from-pink-500/12 to-rose-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-40 left-1/3 w-72 h-72 bg-gradient-to-br from-cyan-500/10 to-blue-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-20 right-1/4 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-indigo-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '3s' }}></div>
      </div>

      <motion.div
        className="relative rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden max-w-md w-full"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-500/15 to-cyan-400/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-pink-500/10 to-blue-400/10 rounded-full blur-3xl" />
        </div>
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}></div>

        <div className="relative z-10 p-8">
          <div className="flex flex-col items-center mb-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <motion.div
                className="mb-4"
                animate={{
                  filter: [
                    'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 10px rgba(255, 255, 255, 0.3)) drop-shadow(0 0 20px rgba(59, 130, 246, 0.3))',
                    'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 14px rgba(59, 130, 246, 0.5)) drop-shadow(0 0 28px rgba(59, 130, 246, 0.4))',
                    'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 10px rgba(255, 255, 255, 0.3)) drop-shadow(0 0 20px rgba(59, 130, 246, 0.3))',
                  ]
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Logo size="large" />
              </motion.div>
            </motion.div>
            <motion.h2
              className="text-center text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {mode === 'forgot-password'
                ? t('auth.resetYourPassword')
                : mode === 'signup'
                ? t('auth.createAccountTitle')
                : t('auth.signInTitle')}
            </motion.h2>

            {mode === 'forgot-password' && (
              <motion.p
                className="mt-2 text-center text-sm text-gray-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                {t('auth.resetPasswordDesc')}
              </motion.p>
            )}
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <AnimatePresence mode="wait">
                {mode === 'signup' && (
                  <motion.div
                    key="username"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-1.5">
                      {t('auth.username')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <UserPlus className="h-5 w-5 text-gray-500" />
                      </div>
                      <input
                        id="username"
                        name="username"
                        type="text"
                        required
                        className="appearance-none rounded-xl relative block w-full pl-11 pr-3 py-3 border border-white/10 placeholder-gray-500 text-white bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all sm:text-sm"
                        placeholder={t('auth.usernamePlaceholder')}
                        pattern="^[a-zA-Z0-9_]+$"
                        minLength={3}
                        maxLength={20}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        disabled={isSubmitting || loading}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
                  {t('auth.emailAddress')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-500" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className="appearance-none rounded-xl relative block w-full pl-11 pr-3 py-3 border border-white/10 placeholder-gray-500 text-white bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all sm:text-sm"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting || loading}
                  />
                </div>
              </div>

              <AnimatePresence mode="wait">
                {mode !== 'forgot-password' && (
                  <motion.div
                    key="password"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
                      {t('auth.password')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-gray-500" />
                      </div>
                      <input
                        id="password"
                        name="password"
                        type="password"
                        required
                        className="appearance-none rounded-xl relative block w-full pl-11 pr-3 py-3 border border-white/10 placeholder-gray-500 text-white bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all sm:text-sm"
                        placeholder={t('auth.passwordPlaceholder')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isSubmitting || loading}
                        minLength={6}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait">
              {mode === 'signin' && (
                <motion.div
                  className="flex items-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex items-center">
                    <input
                      id="remember-me"
                      name="remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 text-blue-500 focus:ring-blue-500 border-white/20 rounded bg-white/5"
                    />
                    <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-400">
                      {t('auth.rememberMe')}
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-start"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <AlertCircle className="w-5 h-5 text-red-400 mr-3 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-300">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <button
                type="submit"
                disabled={isSubmitting || loading}
                className="group relative w-full flex justify-center py-3.5 px-4 text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 hover:shadow-lg hover:shadow-blue-500/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                {isSubmitting || loading ? (
                  <div className="flex items-center relative z-10">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    {mode === 'forgot-password'
                      ? t('auth.sendingResetLink')
                      : mode === 'signup'
                      ? t('auth.creatingAccount')
                      : t('auth.signingIn')}
                  </div>
                ) : (
                  <span className="flex items-center relative z-10">
                    {mode === 'signin' && <LogIn className="w-5 h-5 mr-2" />}
                    {mode === 'signup' && <UserPlus className="w-5 h-5 mr-2" />}
                    {mode === 'forgot-password'
                      ? t('auth.sendResetLink')
                      : mode === 'signup'
                      ? t('auth.createAccountBtn')
                      : t('auth.signInBtn')}
                  </span>
                )}
              </button>
            </motion.div>

            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-2"></div>

            <div className="flex flex-col space-y-2 text-center text-sm">
              <AnimatePresence mode="wait">
                {mode === 'signin' && (
                  <motion.button
                    key="forgot-btn"
                    type="button"
                    onClick={() => changeMode('forgot-password')}
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                    disabled={isSubmitting || loading}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {t('auth.forgotPasswordLink')}
                  </motion.button>
                )}

                {mode === 'forgot-password' && (
                  <motion.button
                    key="back-btn"
                    type="button"
                    onClick={() => changeMode('signin')}
                    className="flex items-center justify-center text-blue-400 hover:text-blue-300 transition-colors"
                    disabled={isSubmitting || loading}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {t('auth.backToSignIn')}
                  </motion.button>
                )}

                {(mode === 'signin' || mode === 'signup') && (
                  <motion.button
                    key="toggle-btn"
                    type="button"
                    onClick={() => changeMode(mode === 'signin' ? 'signup' : 'signin')}
                    className="text-gray-400 hover:text-white transition-colors"
                    disabled={isSubmitting || loading}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {mode === 'signin'
                      ? t('auth.noAccountSignUp')
                      : t('auth.haveAccountSignIn')}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}