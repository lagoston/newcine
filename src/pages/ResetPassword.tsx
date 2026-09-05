import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import GlassLoader from '../components/GlassLoader';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import Logo from '../components/Logo';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionEstablished, setSessionEstablished] = useState(false);

  // Process tokens from URL hash or search params
  useEffect(() => {
    async function processRecoveryTokens() {
      setLoading(true);
      console.log('Processing recovery tokens...');

      try {
        // Extract tokens from URL (check both hash and search params)
        let access_token = '';
        let refresh_token = '';

        // Check URL hash (fragment)
        const hash = window.location.hash.substring(1);
        const hashParams = new URLSearchParams(hash);
        
        if (hashParams.get('type') === 'recovery') {
          access_token = hashParams.get('access_token') || '';
          refresh_token = hashParams.get('refresh_token') || '';
        }
        
        // Check query parameters if not found in hash
        if (!access_token || !refresh_token) {
          const searchParams = new URLSearchParams(window.location.search);
          if (searchParams.get('type') === 'recovery') {
            access_token = searchParams.get('access_token') || '';
            refresh_token = searchParams.get('refresh_token') || '';
          }
        }

        // If tokens found, set the session
        if (access_token && refresh_token) {
          console.log('Recovery tokens found, setting session');
          
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token
          });
          
          if (error) {
            throw new Error('Invalid or expired recovery link');
          }
          
          // Clean URL without refreshing page
          window.history.replaceState({}, document.title, window.location.pathname);
          
          console.log('Recovery session established successfully');
          setSessionEstablished(true);
        } else {
          throw new Error('No recovery tokens found in URL');
        }
      } catch (error: any) {
        console.error('Error processing recovery tokens:', error);
        toast.error(error.message || 'Invalid or expired recovery link');
        // Redirect to forgot password page
        navigate('/auth', { state: { recoveryFailed: true } });
      } finally {
        setLoading(false);
      }
    }

    processRecoveryTokens();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !sessionEstablished) return;
    
    setError('');
    
    // Validate password
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await updatePassword(password);
      toast.success('Password updated successfully');
      // Redirect to login page
      navigate('/auth', { state: { resetSuccess: true } });
    } catch (error: any) {
      console.error('Error updating password:', error);
      setError(error.message || 'Failed to update password');
      
      // If session error, redirect to forgot password
      if (error.message?.includes('Auth session missing')) {
        toast.error('Your recovery session has expired. Please request a new recovery link.');
        navigate('/auth', { state: { recoveryFailed: true } });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <GlassLoader fullPage size="lg" label="Validating your reset link..." />;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="fixed inset-0 bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-900 dark:via-blue-900/10 dark:to-purple-900/10 -z-10"></div>
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-500/15 to-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-gradient-to-tr from-pink-500/12 to-rose-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
        <div className="flex flex-col items-center">
          <Logo size="large" className="mb-4" />
          <h2 className="text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Reset Your Password
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Please enter your new password below
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Password
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
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting || !sessionEstablished}
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  className="appearance-none rounded-lg relative block w-full pl-10 px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isSubmitting || !sessionEstablished}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-4 py-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {sessionEstablished ? (
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Updating password...
                </div>
              ) : (
                'Update Password'
              )}
            </button>
          ) : (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md px-4 py-3">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                Recovery session could not be established. Please request a new password reset link.
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}