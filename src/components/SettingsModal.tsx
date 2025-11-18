import React, { useState, useEffect } from 'react';
import { X, Crown, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { session, isPremium } = useAuth();
  const navigate = useNavigate();
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'followers_only'>('public');
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && session?.user?.id) {
      fetchSettings();
    }
  }, [isOpen, session?.user?.id]);

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
      toast.success('Visibility updated successfully');
    } catch (error) {
      console.error('Error updating visibility:', error);
      toast.error('Error updating visibility');
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!session?.user?.id || !feedback.trim()) return;

    try {
      setSubmitting(true);

      const { error } = await supabase
        .from('feedback')
        .insert({
          user_id: session.user.id,
          message: feedback.trim(),
          created_at: new Date().toISOString()
        });

      if (error) throw error;

      toast.success('Feedback sent! We\'ll respond via email.');
      setFeedback('');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast.error('Error submitting feedback');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Version */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
              App Version
            </h3>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              Beta 4.6
            </p>
          </div>

          {/* Privacy */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Privacy
            </h3>

            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Email
                </h4>
                <p className="text-gray-900 dark:text-white">
                  {session?.user?.email || 'No email found'}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Profile Visibility
                </h4>
                {loading ? (
                  <div className="text-gray-500 dark:text-gray-400">Loading...</div>
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
                      Public
                    </button>
                    <button
                      onClick={() => handleVisibilityChange('followers_only')}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                        profileVisibility === 'followers_only'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                      }`}
                    >
                      Followers Only
                    </button>
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {profileVisibility === 'public'
                    ? 'Your profile is visible to everyone in the community'
                    : 'Your profile is only visible to your followers'}
                </p>
              </div>
            </div>
          </div>

          {/* Subscription */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Subscription
            </h3>

            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Account Status
                  </h4>
                  <div className="flex items-center gap-2">
                    {isPremium ? (
                      <>
                        <Crown className="w-5 h-5 text-yellow-500" />
                        <span className="text-lg font-semibold text-yellow-600 dark:text-yellow-500">
                          Premium
                        </span>
                      </>
                    ) : (
                      <span className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                        Free
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  navigate('/premium');
                  onClose();
                }}
                className="w-full px-4 py-3 bg-gradient-to-r from-yellow-400 to-yellow-500 text-black rounded-lg hover:from-yellow-500 hover:to-yellow-600 transition-all font-semibold shadow-md hover:shadow-lg"
              >
                Manage Subscription
              </button>
            </div>
          </div>

          {/* Feedback */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Feedback
            </h3>

            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Report a bug or leave your question. Responses will be sent via email.
              </p>

              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Type your feedback here..."
                rows={4}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />

              <button
                onClick={handleFeedbackSubmit}
                disabled={!feedback.trim() || submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold shadow-md hover:shadow-lg"
              >
                <Send className="w-5 h-5" />
                {submitting ? 'Sending...' : 'Send Feedback'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
