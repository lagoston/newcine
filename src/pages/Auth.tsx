import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Loader2, Mail, LogIn, UserPlus, Lock, ArrowLeft, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import Logo from '../components/Logo';

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
    };
  }, []);
  
  // Redirect if user is already logged in
  useEffect(() => {
    if (user && location.pathname === '/auth') {
      console.log('🔑 User already logged in, redirecting from auth page');
      const destination = location.state?.from?.pathname || '/library';
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
            const destination = location.state?.from?.pathname || '/library';
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
  
  // Show verification message screen
  if (showVerificationMessage) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full mx-4 text-center">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
            <div className="flex justify-center mb-4">
              <Logo size="large" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Check your email
            </h2>
            <div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
              <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-gray-600 dark:text-gray-300">
              We sent a verification link to <strong>{email}</strong>.<br />
              Please check your inbox and spam folder to verify your account.
            </p>
            <div className="pt-4">
              <button
                onClick={handleResendEmail}
                disabled={loading || resendCooldown > 0}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Sending...
                  </div>
                ) : resendCooldown > 0 ? (
                  `Wait ${resendCooldown}s to resend`
                ) : (
                  "Didn't receive the email? Click to resend"
                )}
              </button>
            </div>
            <div className="pt-2">
              <button
                onClick={() => {
                  setShowVerificationMessage(false);
                  setMode('signin');
                }}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                Back to sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Main auth form
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
        <div className="flex flex-col items-center">
          <Logo size="large" className="mb-4" />
          <h2 className="text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            {mode === 'forgot-password'
              ? 'Reset Your Password'
              : mode === 'signup'
              ? 'Create Your Account'
              : 'Sign In to CineOracle'}
          </h2>
          
          {mode === 'forgot-password' && (
            <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
              Enter your email and we'll send you instructions to reset your password.
            </p>
          )}
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm space-y-4">
            {mode === 'signup' && (
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserPlus className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    className="appearance-none rounded-lg relative block w-full pl-10 px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                    placeholder="Enter username (letters, numbers, underscores)"
                    pattern="^[a-zA-Z0-9_]+$"
                    minLength={3}
                    maxLength={20}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isSubmitting || loading}
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="appearance-none rounded-lg relative block w-full pl-10 px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting || loading}
                />
              </div>
            </div>

            {mode !== 'forgot-password' && (
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    className="appearance-none rounded-lg relative block w-full pl-10 px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting || loading}
                    minLength={6}
                  />
                </div>
              </div>
            )}
          </div>

          {mode === 'signin' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                  Remember me
                </label>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-4 py-3 flex items-start">
              <AlertCircle className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isSubmitting || loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting || loading ? (
                <div className="flex items-center">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  {mode === 'forgot-password'
                    ? 'Sending reset link...'
                    : mode === 'signup'
                    ? 'Creating account...'
                    : 'Signing in...'}
                </div>
              ) : (
                <>
                  {mode === 'signin' && <LogIn className="w-5 h-5 mr-2" />}
                  {mode === 'signup' && <UserPlus className="w-5 h-5 mr-2" />}
                  {mode === 'forgot-password'
                    ? 'Send Reset Link'
                    : mode === 'signup'
                    ? 'Create Account'
                    : 'Sign In'}
                </>
              )}
            </button>
          </div>

          <div className="flex flex-col space-y-2 text-center text-sm">
            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => changeMode('forgot-password')}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                disabled={isSubmitting || loading}
              >
                Forgot your password?
              </button>
            )}
            
            {mode === 'forgot-password' && (
              <button
                type="button"
                onClick={() => changeMode('signin')}
                className="flex items-center justify-center text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                disabled={isSubmitting || loading}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to sign in
              </button>
            )}
            
            {(mode === 'signin' || mode === 'signup') && (
              <button
                type="button"
                onClick={() => changeMode(mode === 'signin' ? 'signup' : 'signin')}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                disabled={isSubmitting || loading}
              >
                {mode === 'signin'
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}