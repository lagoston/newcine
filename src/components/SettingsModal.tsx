import React, { useState, useEffect } from 'react';
import { X, Crown, Send, AlertTriangle, Infinity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { session, isPremium, isLifetimePremium } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'followers_only'>('public');
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastFeedbackTime, setLastFeedbackTime] = useState<Date | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen && session?.user?.id) {
      fetchSettings();
      checkFeedbackCooldown();
    }
  }, [isOpen, session?.user?.id]);

  useEffect(() => {
    if (lastFeedbackTime) {
      const interval = setInterval(() => {
        updateCooldownTimer();
      }, 1000);

      return () => clearInterval(interval);
    }
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
      const { data, error } = await supabase
        .from('profiles')
        .select('profile_visibility')
        .eq('id', session.user.id)
        .single();

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

  const handleVisibilityChange = async (visibility: 'public' | 'followers_only') => {
    if (!session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ profile_visibility: visibility })
        .eq('id', session.user.id);

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
      const { error } = await supabase
        .from('feedback')
        .insert({
          user_id: session.user.id,
          message: feedback.trim(),
          created_at: now.toISOString()
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

  const handleDeleteAccount = async () => {
    if (!session?.user?.id) return;

    const expectedText = i18n.language === 'pt' ? 'EXCLUIR' : 'DELETE';

    if (deleteConfirmation !== expectedText) {
      toast.error(t('settings.confirmationRequired'));
      return;
    }

    try {
      setIsDeleting(true);

      const { data, error } = await supabase.rpc('delete_user_account', {
        user_id_param: session.user.id
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(t('settings.accountDeleted'));

        // Sign out
        await supabase.auth.signOut();

        // Close modal and redirect
        onClose();
        navigate('/auth');
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast.error(t('settings.deleteAccountError'));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  const isFeedbackDisabled = !!lastFeedbackTime || !feedback.trim() || submitting;
  const expectedDeleteText = i18n.language === 'pt' ? 'EXCLUIR' : 'DELETE';
  const isDeleteDisabled = deleteConfirmation !== expectedDeleteText || isDeleting;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {t('settings.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t('settings.appVersion')}
            </h3>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              Beta 4.6
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('settings.privacy')}
            </h3>

            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  {t('settings.email')}
                </h4>
                <p className="text-gray-900 dark:text-white">
                  {session?.user?.email || t('settings.noEmail')}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  {t('settings.profileVisibility')}
                </h4>
                {loading ? (
                  <div className="text-gray-500 dark:text-gray-400">{t('settings.loading')}</div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleVisibilityChange('public')}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                        profileVisibility === 'public'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                      }`}
                    >
                      {t('settings.public')}
                    </button>
                    <button
                      onClick={() => handleVisibilityChange('followers_only')}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                        profileVisibility === 'followers_only'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                      }`}
                    >
                      {t('settings.followersOnly')}
                    </button>
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {profileVisibility === 'public'
                    ? t('settings.publicDescription')
                    : t('settings.followersOnlyDescription')}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('settings.subscription')}
            </h3>

            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    {t('settings.accountStatus')}
                  </h4>
                  <div className="flex items-center gap-2">
                    {isLifetimePremium ? (
                      <>
                        <Infinity className="w-5 h-5 text-emerald-500" />
                        <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-500">
                          {t('premium.lifetimePremium')}
                        </span>
                      </>
                    ) : isPremium ? (
                      <>
                        <Crown className="w-5 h-5 text-yellow-500" />
                        <span className="text-lg font-semibold text-yellow-600 dark:text-yellow-500">
                          {t('settings.premium')}
                        </span>
                      </>
                    ) : (
                      <span className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                        {t('settings.free')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!isLifetimePremium && (
                <button
                  onClick={() => {
                    navigate('/premium');
                    onClose();
                  }}
                  className="w-full px-4 py-3 bg-gradient-to-r from-yellow-400 to-yellow-500 text-black rounded-lg hover:from-yellow-500 hover:to-yellow-600 transition-all font-semibold shadow-md hover:shadow-lg"
                >
                  {t('settings.manageSubscription')}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('settings.feedback')}
            </h3>

            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('settings.feedbackDescription')}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                {t('settings.feedbackEmailAlternative')}
              </p>

              {cooldownRemaining && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                    {cooldownRemaining}
                  </p>
                </div>
              )}

              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={t('settings.feedbackPlaceholder')}
                rows={4}
                disabled={!!lastFeedbackTime}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              />

              <button
                onClick={handleFeedbackSubmit}
                disabled={isFeedbackDisabled}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold shadow-md hover:shadow-lg"
              >
                <Send className="w-5 h-5" />
                {submitting ? t('settings.sending') : t('settings.sendFeedback')}
              </button>
            </div>
          </div>

          {/* Delete Account Section */}
          <div className="space-y-4 pt-6 border-t border-red-200 dark:border-red-900">
            <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {t('settings.deleteAccount')}
            </h3>

            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 space-y-4 border-2 border-red-200 dark:border-red-800">
              <div className="space-y-2">
                <p className="text-sm text-red-800 dark:text-red-200 font-semibold">
                  ⚠️ {t('common.warningPermanent')}
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  {t('settings.deleteAccountWarning')}
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-red-800 dark:text-red-200">
                  {t('settings.deleteAccountConfirm')}
                </label>
                <input
                  type="text"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder={t('settings.typeDelete')}
                  className="w-full px-4 py-2 rounded-lg border-2 border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-red-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <button
                onClick={handleDeleteAccount}
                disabled={isDeleteDisabled}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold shadow-md hover:shadow-lg"
              >
                <AlertTriangle className="w-5 h-5" />
                {isDeleting ? t('common.loading') : t('settings.deleteAccountButton')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
