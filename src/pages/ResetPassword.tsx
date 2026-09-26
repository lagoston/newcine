import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import GlassLoader from '../components/GlassLoader';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import { AuthShell, AuthHeading, AuthField, AuthError, AuthSubmit } from '../components/AuthUI';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
          // BUG corrigido: o cliente do Supabase é criado com o padrão
          // detectSessionInUrl: true — ao iniciar, ele mesmo lê os tokens do
          // #hash, cria a sessão de recuperação e LIMPA a URL. Como esta
          // página é carregada sob demanda (lazy), ela quase sempre monta
          // depois disso e não encontrava mais token nenhum: o usuário via
          // "link inválido", ia pro /auth e, já logado pela sessão de
          // recuperação, era jogado na home sem nunca trocar a senha.
          // Agora, sem tokens na URL, conferimos se a sessão já existe.
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            console.log('Recovery session already established by the Supabase client');
            setSessionEstablished(true);
          } else {
            throw new Error('No recovery tokens found in URL');
          }
        }
      } catch (error: any) {
        console.error('Error processing recovery tokens:', error);
        toast.error(t('auth.toastRecoveryInvalid'));
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
      setError(t('auth.errPasswordLength'));
      return;
    }
    
    if (password !== confirmPassword) {
      setError(t('auth.errPasswordsMismatch'));
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await updatePassword(password);
      // Sem toast aqui: o /auth já mostra "Senha atualizada" ao receber
      // resetSuccess — antes apareciam dois avisos iguais em sequência.
      navigate('/auth', { state: { resetSuccess: true } });
    } catch (error: any) {
      console.error('Error updating password:', error);
      setError(error.message?.toLowerCase().includes('should be different') ? t('auth.errSamePassword') : t('auth.errGeneric'));
      
      // If session error, redirect to forgot password
      if (error.message?.includes('Auth session missing')) {
        toast.error(t('auth.toastRecoveryExpired'));
        navigate('/auth', { state: { recoveryFailed: true } });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <GlassLoader fullPage size="lg" label={t('auth.validatingResetLink', { defaultValue: 'Validating your reset link...' })} />;
  }

  return (
    <AuthShell>
      <AuthHeading title={t('auth.newPasswordHeading')} subtitle={t('auth.newPasswordSub')} />

      {sessionEstablished ? (
        <form className="mt-7 space-y-5" onSubmit={handleSubmit} noValidate>
          <AuthField
            id="password"
            type="password"
            label={t('auth.newPassword')}
            icon={Lock}
            value={password}
            onChange={setPassword}
            placeholder={t('auth.newPasswordPlaceholder')}
            autoComplete="new-password"
            helper={t('auth.passwordHelp')}
            minLength={6}
            disabled={isSubmitting}
          />
          <AuthField
            id="confirmPassword"
            type="password"
            label={t('auth.confirmNewPassword')}
            icon={Lock}
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder={t('auth.confirmNewPasswordPlaceholder')}
            autoComplete="new-password"
            minLength={6}
            disabled={isSubmitting}
          />
          {error && <AuthError message={error} />}
          <AuthSubmit label={t('auth.savePassword')} loadingLabel={t('auth.savingPassword')} loading={isSubmitting} />
        </form>
      ) : (
        <div className="mt-7 space-y-5">
          <AuthError message={t('auth.recoveryFailed')} />
          <button
            type="button"
            onClick={() => navigate('/auth', { state: { recoveryFailed: true } })}
            className="w-full h-12 rounded-xl text-base font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
          >
            {t('auth.requestNewLink')}
          </button>
        </div>
      )}
    </AuthShell>
  );
}