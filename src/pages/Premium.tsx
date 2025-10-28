import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Crown, Star, BrainCircuit, History, Beaker, Palette, Medal, BarChart3, Check, Settings, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { createCheckoutSession, createPortalSession } from '../lib/stripe';
import { toast } from 'sonner';
import { products } from '../stripe-config';
import { useTranslation } from 'react-i18next';

interface FeatureProps {
  icon: React.ElementType;
  title: string;
  description: string;
}

const Feature = ({ icon: Icon, title, description }: FeatureProps) => (
  <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
    <div className="shrink-0">
      <Icon className="w-6 h-6 text-yellow-500" />
    </div>
    <div>
      <h3 className="font-medium text-gray-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
    </div>
  </div>
);

interface PlanCardProps {
  type: 'monthly' | 'yearly';
  price: number;
  period: string;
  savings?: string | null;
  onSubscribe: () => void;
  isLoading: boolean;
}

const PlanCard = ({ 
  type, 
  price, 
  period, 
  savings = null,
  onSubscribe,
  isLoading
}: PlanCardProps) => (
  <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
    {type === 'yearly' && (
      <div className="absolute top-0 right-0 bg-gradient-to-r from-yellow-400 to-yellow-500 text-black text-sm font-medium px-4 py-1 rounded-bl-lg">
        {period === 'year' ? 'Best Value' : period}
      </div>
    )}
    <div className="p-6 sm:p-8">
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        {type === 'monthly' ? 'Premium Monthly' : 'Premium Yearly'}
      </h3>
      <div className="flex items-baseline mb-2">
        <span className="text-4xl font-bold text-gray-900 dark:text-white">${price}</span>
        <span className="text-gray-500 dark:text-gray-400 ml-2">/{period}</span>
      </div>
      {savings && (
        <p className="text-green-600 dark:text-green-400 text-sm mb-4">
          Save {savings}
        </p>
      )}
      <button
        onClick={onSubscribe}
        disabled={isLoading}
        className={`w-full h-12 rounded-lg font-medium transition-colors flex items-center justify-center ${
          type === 'yearly'
            ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-black hover:from-yellow-500 hover:to-yellow-600'
            : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Processing...
          </>
        ) : (
          'Subscribe Now'
        )}
      </button>
    </div>
  </div>
);

export default function Premium() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, isPremium, refreshSession, checkPremiumStatus } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState({
    monthly: false,
    yearly: false,
    portal: false
  });

  useEffect(() => {
    // Check for success URL param
    if (searchParams.get('success') === 'true') {
      // Remove success param from URL
      window.history.replaceState({}, '', '/premium');
      
      // Refresh session to update premium status
      refreshSession().then(() => {
        // Also explicitly check premium status
        checkPremiumStatus().then(() => {
          // Redirect to success page
          navigate('/premium/success', { 
            state: { 
              plan: searchParams.get('plan') || 'monthly',
              session_id: searchParams.get('session_id')
            } 
          });
        });
      });
    }
    
    // Check for portal return
    if (searchParams.get('portal_return') === 'true') {
      toast.success('Subscription settings updated');
      window.history.replaceState({}, '', '/premium');
      refreshSession();
    }
  }, [searchParams, refreshSession, navigate, checkPremiumStatus]);

  const handleSubscribe = async (plan: 'monthly' | 'yearly') => {
    if (!session?.user) {
      toast.error('Please sign in to subscribe');
      return;
    }

    try {
      setLoading(prev => ({ ...prev, [plan]: true }));
      const priceId = plan === 'monthly' ? products.premium.priceId : products.premiumYearly.priceId;
      
      const checkoutUrl = await createCheckoutSession({
        priceId,
        userId: session.user.id,
        email: session.user.email || '',
      });

      if (checkoutUrl) {
        // Store the plan type in sessionStorage to use on success page
        sessionStorage.setItem('premium_plan_type', plan);
        // Redirect to Stripe Checkout
        window.location.href = checkoutUrl;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast.error('Failed to start checkout process. Please try again.');
    } finally {
      setLoading(prev => ({ ...prev, [plan]: false }));
    }
  };

  const handleManageSubscription = async () => {
    if (!session?.user) {
      toast.error('Please sign in to manage subscription');
      return;
    }

    try {
      setLoading(prev => ({ ...prev, portal: true }));
      const portalUrl = await createPortalSession(session.user.id);
      if (portalUrl) {
        window.location.href = portalUrl;
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast.error('Failed to open subscription management. Please try again.');
    } finally {
      setLoading(prev => ({ ...prev, portal: false }));
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-12">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {isPremium ? t('premium.settings') : t('premium.title')}
          </h1>
        </div>

        {isPremium ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-16">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Crown className="w-8 h-8 text-yellow-500" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {t('premium.subscription')}
                </h2>
              </div>
              <button
                onClick={handleManageSubscription}
                disabled={loading.portal}
                className="flex items-center px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed h-10"
              >
                {loading.portal ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    <Settings className="w-5 h-5 mr-2" />
                    {t('premium.manageSubscription')}
                  </>
                )}
              </button>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {t('premium.thanks')}
            </p>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-8 mb-16">
              <PlanCard
                type="monthly"
                price={products.premium.price}
                period="month"
                onSubscribe={() => handleSubscribe('monthly')}
                isLoading={loading.monthly}
              />
              <PlanCard
                type="yearly"
                price={products.premiumYearly.price}
                period="year"
                savings="$9.89 (17%)"
                onSubscribe={() => handleSubscribe('yearly')}
                isLoading={loading.yearly}
              />
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-16">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8 flex items-center gap-3">
                <Crown className="w-8 h-8 text-yellow-500" />
                {t('premium.benefits')}
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                <Feature
                  icon={Star}
                  title={t('premium.moreTickets')}
                  description={t('premium.ticketsDesc')}
                />
                <Feature
                  icon={BrainCircuit}
                  title={t('premium.oracle2')}
                  description={t('premium.oracle2Desc')}
                />
                <Feature
                  icon={History}
                  title={t('premium.history')}
                  description={t('premium.historyDesc')}
                />
                <Feature
                  icon={Beaker}
                  title={t('premium.experimental')}
                  description={t('premium.experimentalDesc')}
                />
                <Feature
                  icon={Palette}
                  title={t('premium.customize')}
                  description={t('premium.customizeDesc')}
                />
                <Feature
                  icon={Medal}
                  title={t('premium.badge')}
                  description={t('premium.badgeDesc')}
                />
                <Feature
                  icon={BarChart3}
                  title={t('premium.stats')}
                  description={t('premium.statsDesc')}
                />
              </div>
            </div>
          </>
        )}

        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          {t('premium.questions')} <a href="mailto:support@cineoracle.com" className="text-blue-600 dark:text-blue-400 hover:underline">{t('premium.support')}</a>
        </div>
      </div>
    </div>
  );
}