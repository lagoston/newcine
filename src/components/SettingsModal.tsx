import React, { useState, useEffect, useId } from 'react';
import { Crown, Send, AlertTriangle, Infinity as InfinityIcon, Settings, Globe2, Users, ChevronDown, Mail, Clock, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import OracleSheet from './OracleSheet';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING } from '../lib/oracleTheme';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const APP_VERSION = 'Beta 4.6';

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { session, isPremium, isLifetimePremium, signOut } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'friends_only'>('public');
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastFeedbackTime, setLastFeedbackTime] = useState<Date | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const feedbackId = useId();
  const deleteInputId = useId();

  useEffect(() => {
    if (isOpen && session?.user?.id) {
      fetchSettings();
      checkFeedbackCooldown();
    }
    if (!isOpen) {
      // Fechar sempre "desarma" a exclusão de conta.
      setDangerOpen(false);
      setDeleteConfirmation('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, session?.user?.id]);

  useEffect(() => {
    if (lastFeedbackTime) {
      const interval = setInterval(() => {
        updateCooldownTimer();
      }, 1000);

      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastFeedbackTime]);

  const checkFeedbackCooldown = async () => {
    if (!session?.user?.id) return;

    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        const lastTime = new Date(data.created_at);
        const now = new Date();
        const hoursSince = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60);

        if (hoursSince < 24) {
          setLastFeedbackTime(lastTime);
          updateCooldownTimer(lastTime);
        }
      }
    } catch (error) {
      console.error('Error checking feedback cooldown:', error);
    }
  };

  const updateCooldownTimer = (feedbackTime?: Date) => {
    const lastTime = feedbackTime || lastFeedbackTime;
    if (!lastTime) return;

    const now = new Date();
    const cooldownEnd = new Date(lastTime.getTime() + 24 * 60 * 60 * 1000);
    const remaining = cooldownEnd.getTime() - now.getTime();

    if (remaining <= 0) {
      setLastFeedbackTime(null);
      setCooldownRemaining(null);
    } else {
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      setCooldownRemaining(t('settings.feedbackCooldown', { hours, minutes }));
    }
  };

  const fetchSettings = async () => {
    if (!session?.user?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.from('profiles').select('profile_visibility').eq('id', session.user.id).single();

      if (error) throw error;

      if (data?.profile_visibility) {
        setProfileVisibility(data.profile_visibility);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVisibilityChange = async (visibility: 'public' | 'friends_only') => {
    if (!session?.user?.id || visibility === profileVisibility) return;

    try {
      const { error } = await supabase.from('profiles').update({ profile_visibility: visibility }).eq('id', session.user.id);

      if (error) throw error;

      setProfileVisibility(visibility);
      toast.success(t('settings.visibilityUpdated'));
    } catch (error) {
      console.error('Error updating visibility:', error);
      toast.error(t('settings.visibilityError'));
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!session?.user?.id || !feedback.trim()) return;

    if (lastFeedbackTime) {
      toast.error(t('settings.feedbackCooldownActive'));
      return;
    }

    try {
      setSubmitting(true);

      const now = new Date();
      const { error } = await supabase.from('feedback').insert({
        user_id: session.user.id,
        message: feedback.trim(),
        created_at: now.toISOString(),
      });

      if (error) throw error;

      toast.success(t('settings.feedbackSent'));
      setFeedback('');
      setLastFeedbackTime(now);
      updateCooldownTimer(now);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast.error(t('settings.feedbackError'));
    } finally {
      setSubmitting(false);
    }
  };

  // "pt-BR" também é português — antes só "pt" exato pedia EXCLUIR, e quem
  // estava em pt-BR via o texto pedindo EXCLUIR mas precisava digitar DELETE.
  const expectedDeleteText = i18n.language.startsWith('pt') ? 'EXCLUIR' : 'DELETE';
  const deleteMatches = deleteConfirmation.trim().toUpperCase() === expectedDeleteText;

  const handleDeleteAccount = async () => {
    if (!session?.user?.id) return;

    if (!deleteMatches) {
      toast.error(t('settings.confirmationRequired'));
      return;
    }

    try {
      setIsDeleting(true);

      const { data, error } = await supabase.rpc('delete_user_account', {
        user_id_param: session.user.id,
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(t('settings.accountDeleted'));

        await supabase.auth.signOut();

        onClose();
        navigate('/auth');
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (error: unknown) {
      console.error('Error deleting account:', error);
      toast.error(t('settings.deleteAccountError'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Sair da conta — no celular é o único lugar (o menu do topo saiu).
  const [signingOut, setSigningOut] = useState(false);
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      onClose();
      navigate('/auth');
    } catch (error) {
      console.error('Error during sign out:', error);
      setSigningOut(false);
    }
  };

  const isFeedbackDisabled = !!lastFeedbackTime || !feedback.trim() || submitting;
  const isDeleteDisabled = !deleteMatches || isDeleting;

  const sectionTitle = (text: string) => (
    <h3 style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">
      {text}
    </h3>
  );

  const visibilityOptions: { value: 'public' | 'friends_only'; icon: typeof Globe2; label: string; desc: string }[] = [
    { value: 'public', icon: Globe2, label: t('settings.public'), desc: t('settings.publicDescription') },
    { value: 'friends_only', icon: Users, label: t('settings.friendsOnly'), desc: t('settings.friendsOnlyDescription') },
  ];

  return (
    <OracleSheet
      open={isOpen}
      onClose={onClose}
      title={t('settings.title')}
      leading={
        <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-violet-500/15 ring-1 ring-violet-400/30">
          <Settings className="w-5 h-5 text-violet-300" aria-hidden />
        </span>
      }
      size="lg"
      bodyClassName="px-5 sm:px-7 py-6 space-y-8"
    >
      {/* Conta */}
      <section className="rounded-2xl ring-1 ring-white/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4" style={{ background: VELVET }}>
        <div className="flex-1 min-w-0">
          <p className="text-sm" style={{ color: MIST }}>
            {t('settings.email')}
          </p>
          <p className="mt-0.5 font-medium truncate" style={{ color: PAPER }}>
            {session?.user?.email || t('settings.noEmail')}
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1">
          <p className="text-sm" style={{ color: MIST }}>
            {t('settings.accountStatus')}
          </p>
          {isLifetimePremium ? (
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30 text-emerald-200 text-sm font-semibold">
              <InfinityIcon className="w-4 h-4" aria-hidden />
              {t('premium.lifetimePremium')}
            </span>
          ) : isPremium ? (
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-amber-500/15 ring-1 ring-amber-400/30 text-amber-200 text-sm font-semibold">
              <Crown className="w-4 h-4" aria-hidden />
              {t('settings.premium')}
            </span>
          ) : (
            <span className="inline-flex items-center h-8 px-3 rounded-full bg-white/10 ring-1 ring-white/15 text-sm font-semibold" style={{ color: PAPER }}>
              {t('settings.free')}
            </span>
          )}
        </div>
      </section>

      {!isLifetimePremium && (
        <button
          onClick={() => {
            navigate('/premium');
            onClose();
          }}
          className={`-mt-5 w-full h-12 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-[#221B36] text-sm font-semibold shadow-lg shadow-amber-900/30 gap-2 transition ${FOCUS_RING}`}
        >
          <Crown className="w-[18px] h-[18px]" aria-hidden />
          {t('settings.manageSubscription')}
        </button>
      )}

      {/* Privacidade */}
      <section>
        {sectionTitle(t('settings.profileVisibility'))}
        <div role="radiogroup" aria-label={t('settings.profileVisibility')} aria-busy={loading || undefined} className="mt-3 grid sm:grid-cols-2 gap-2.5">
          {visibilityOptions.map(({ value, icon: Icon, label, desc }) => {
            const selected = profileVisibility === value;
            return (
              <button
                key={value}
                role="radio"
                aria-checked={selected}
                disabled={loading}
                onClick={() => handleVisibilityChange(value)}
                className={`w-full justify-start items-start gap-3 p-3.5 rounded-xl text-left ring-1 transition disabled:opacity-60 ${FOCUS_RING} ${
                  selected ? 'ring-2 ring-violet-400/70 bg-violet-500/15' : 'ring-white/10 hover:ring-white/25'
                }`}
                style={{ background: selected ? undefined : VELVET }}
              >
                <span className={`grid place-items-center w-9 h-9 shrink-0 rounded-lg ${selected ? 'bg-violet-600 text-white' : 'bg-white/10 text-violet-300'}`}>
                  <Icon className="w-[18px] h-[18px]" aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold" style={{ color: PAPER }}>
                    {label}
                  </span>
                  <span className="block mt-0.5 text-xs leading-snug" style={{ color: MIST }}>
                    {desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Suporte */}
      <section>
        {sectionTitle(t('settings.feedback'))}
        <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>
          {t('settings.feedbackDescription')}
        </p>
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm" style={{ color: MIST }}>
          <Mail className="w-4 h-4 shrink-0" aria-hidden />
          <a href="mailto:support@cineoracle.com" className="min-h-0 min-w-0 underline underline-offset-4 hover:text-[#F3EAD3]">
            support@cineoracle.com
          </a>
        </p>

        {cooldownRemaining && (
          <p className="mt-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 bg-amber-500/10 ring-1 ring-amber-400/25 text-sm text-amber-200">
            <Clock className="w-4 h-4 shrink-0" aria-hidden />
            {cooldownRemaining}
          </p>
        )}

        <label htmlFor={feedbackId} className="sr-only">
          {t('settings.feedbackPlaceholder')}
        </label>
        <textarea
          id={feedbackId}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={t('settings.feedbackPlaceholder')}
          rows={4}
          disabled={!!lastFeedbackTime}
          className="mt-3 w-full px-4 py-3 rounded-xl ring-1 ring-white/15 focus:ring-2 focus:ring-fuchsia-300/70 outline-none resize-none text-[15px] leading-relaxed placeholder:text-[#BDB4D6]/70 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: VELVET, color: PAPER }}
        />
        <div className="mt-2.5 flex justify-end">
          <button
            onClick={handleFeedbackSubmit}
            disabled={isFeedbackDisabled}
            className={`gap-2 h-11 px-5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold shadow-lg shadow-fuchsia-900/30 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none ${FOCUS_RING}`}
          >
            <Send className="w-4 h-4" aria-hidden />
            {submitting ? t('settings.sending') : t('settings.sendFeedback')}
          </button>
        </div>
      </section>

      {/* Sair da conta */}
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className={`w-full gap-2 h-12 rounded-xl ring-1 ring-white/15 hover:ring-white/30 hover:bg-white/5 text-sm font-semibold transition disabled:opacity-50 ${FOCUS_RING}`}
        style={{ color: PAPER }}
      >
        <LogOut className="w-[18px] h-[18px]" aria-hidden />
        {t('settings.signOut')}
      </button>

      {/* Zona de perigo — fechada por padrão */}
      <section className="border-t border-white/[0.07] pt-6">
        <button
          onClick={() => setDangerOpen((v) => !v)}
          aria-expanded={dangerOpen}
          className={`w-full justify-between gap-3 px-1 rounded-xl text-left text-red-300 hover:text-red-200 transition ${FOCUS_RING}`}
        >
          <span className="inline-flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-[18px] h-[18px]" aria-hidden />
            {t('settings.deleteAccount')}
          </span>
          <ChevronDown className={`w-5 h-5 transition-transform ${dangerOpen ? 'rotate-180' : ''}`} aria-hidden />
        </button>

        {dangerOpen && (
          <div className="mt-3 rounded-2xl p-4 sm:p-5 ring-1 ring-red-400/30 bg-red-500/[0.07] space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-red-200">{t('common.warningPermanent')}</p>
              <p className="text-sm leading-relaxed text-red-200/80">{t('settings.deleteAccountWarning')}</p>
            </div>
            <div>
              <label htmlFor={deleteInputId} className="block text-sm mb-1.5 text-red-100">
                {t('settings.deleteAccountConfirm')}
              </label>
              <input
                id={deleteInputId}
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder={t('settings.typeDelete')}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="w-full h-12 px-4 rounded-xl ring-1 ring-red-400/40 focus:ring-2 focus:ring-red-400 outline-none text-[15px] tracking-wide placeholder:text-red-200/40"
                style={{ background: 'rgba(18,13,34,0.75)', color: PAPER }}
              />
            </div>
            <button
              onClick={handleDeleteAccount}
              disabled={isDeleteDisabled}
              className={`w-full gap-2 h-12 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`}
            >
              <AlertTriangle className="w-[18px] h-[18px]" aria-hidden />
              {isDeleting ? t('common.loading') : t('settings.deleteAccountButton')}
            </button>
          </div>
        )}
      </section>

      <p className="text-center text-xs" style={{ color: MIST }}>
        {t('settings.appVersion')} · <span style={PIXEL}>{APP_VERSION}</span>
      </p>
    </OracleSheet>
  );
};

export default SettingsModal;
