import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Crown, Star, Palette, Check, Settings, Loader2, Zap, Shield, Sparkles, Infinity } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { createCheckoutSession, createPortalSession } from '../lib/stripe';
import { toast } from 'sonner';
import { products } from '../stripe-config';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

interface FeatureProps {
  icon: React.ElementType;
  title: string;
  description: string;
}

const Feature = ({ icon: Icon, title, description }: FeatureProps) => (
  <div className="flex items-start gap-4 p-5 rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-lg">
    <div className="shrink-0 p-3 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg">
      <Icon className="w-5 h-5 text-white" />
    </div>
    <div>
      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
    </div>
  </div>
);

export default function Premium() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, isPremium, isLifetimePremium } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState({
    monthly: false,
    portal: false
  });

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      navigate('/premium-success', { replace: true });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    if (!session) {
      navigate('/auth');
    }
  }, [session, navigate]);

  const handleSubscribe = async () => {
    if (!session?.user) {
      toast.error('Please sign in to subscribe');
      navigate('/auth');
      return;
    }

    try {
      setLoading(prev => ({ ...prev, monthly: true }));

      const checkoutUrl = await createCheckoutSession({
        priceId: products.premium.priceId
      });

      if (checkoutUrl) {
        sessionStorage.setItem('premium_plan_type', 'monthly');
        window.location.href = checkoutUrl;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setLoading(prev => ({ ...prev, monthly: false }));
    }
  };

  const handleManageSubscription = async () => {
    if (!session?.user) {
      toast.error('Please sign in to manage subscription');
      return;
    }

    try {
      setLoading(prev => ({ ...prev, portal: true }));
      const portalUrl = await createPortalSession();
      if (portalUrl) {
        window.location.href = portalUrl;
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast.error('Failed to open subscription management.');
    } finally {
      setLoading(prev => ({ ...prev, portal: false }));
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 py-8 px-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="fixed inset-0 bg-gradient-to-br from-gray-50 via-yellow-50/30 to-orange-50/30 dark:from-gray-900 dark:via-yellow-900/10 dark:to-orange-900/10 -z-10"></div>
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-yellow-400/20 to-orange-400/20 dark:from-yellow-600/10 dark:to-orange-600/10 rounded-full blur-3xl" />
        <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-amber-400/20 to-yellow-400/20 dark:from-amber-600/10 dark:to-yellow-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-gradient-to-br from-orange-400/15 to-rose-400/15 dark:from-orange-600/8 dark:to-rose-600/8 rounded-full blur-3xl" />
      </div>

      <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(rgba(234, 179, 8, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(234, 179, 8, 0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }} />

      <div className="max-w-5xl mx-auto relative z-10">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2.5 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm hover:bg-white/80 dark:hover:bg-gray-700/80 rounded-xl transition-colors border border-white/40 dark:border-gray-600/40"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {isPremium ? (
          <motion.div
            className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-8 sm:p-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="absolute inset-0 pointer-events-none rounded-3xl overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-yellow-400/20 to-orange-500/20 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-amber-400/20 to-yellow-500/20 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10">
              <div className="text-center mb-8">
                <motion.div
                  className={`inline-block p-4 rounded-full mb-4 shadow-xl ${
                    isLifetimePremium
                      ? 'bg-gradient-to-br from-emerald-400 to-teal-600'
                      : 'bg-gradient-to-br from-yellow-400 to-orange-500'
                  }`}
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                >
                  {isLifetimePremium ? (
                    <Infinity className="w-12 h-12 text-white" />
                  ) : (
                    <Crown className="w-12 h-12 text-white" />
                  )}
                </motion.div>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-2">
                  {isLifetimePremium ? t('premium.lifetimePremium') : t('premium.yourePremium')}
                </h2>
                <p className="text-lg text-gray-600 dark:text-gray-400">
                  {isLifetimePremium ? t('premium.lifetimeThankYou') : t('premium.thankYou')}
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-4 mb-8">
                <div className="rounded-2xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/60 dark:border-gray-600/60 p-5 text-center">
                  <Zap className="w-8 h-8 text-yellow-500 mx-auto mb-3" />
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">20</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('premium.ticketsDay')}</p>
                </div>
                <div className="rounded-2xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/60 dark:border-gray-600/60 p-5 text-center">
                  <Palette className="w-8 h-8 text-blue-500 mx-auto mb-3" />
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{t('premium.customization')}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('premium.exclusiveFrames')}</p>
                </div>
                <div className="rounded-2xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/60 dark:border-gray-600/60 p-5 text-center">
                  {isLifetimePremium ? (
                    <>
                      <Infinity className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{t('premium.lifetime')}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{t('premium.neverExpires')}</p>
                    </>
                  ) : (
                    <>
                      <Shield className="w-8 h-8 text-green-500 mx-auto mb-3" />
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{t('premium.active')}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{t('premium.subscriptionActive')}</p>
                    </>
                  )}
                </div>
              </div>

              {!isLifetimePremium && (
                <div className="text-center">
                  <button
                    onClick={handleManageSubscription}
                    disabled={loading.portal}
                    className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-xl hover:from-gray-800 hover:to-gray-900 transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg"
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
              )}
            </div>
          </motion.div>
        ) : (
          <>
            <motion.div
              className="text-center mb-12"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <motion.div
                className="inline-block mb-4"
                animate={{
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
              >
                <div className="p-4 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full shadow-xl">
                  <Crown className="w-12 h-12 text-white" />
                </div>
              </motion.div>
              <h1 className="text-4xl sm:text-5xl font-extrabold mb-4">
                <span className="bg-gradient-to-r from-yellow-500 via-orange-500 to-yellow-600 bg-clip-text text-transparent">
                  {t('premium.title')}
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                {t('premium.unlockFullPower')}
              </p>
            </motion.div>

            <div className="flex justify-center mb-12">
              <motion.div
                className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border-2 border-yellow-400/60 dark:border-yellow-500/40 shadow-2xl overflow-hidden max-w-md w-full"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-500 text-white text-sm font-bold px-4 py-2.5 text-center">
                  <Sparkles className="w-4 h-4 inline-block mr-2" />
                  {t('premium.premiumPlan')}
                </div>

                <div className="p-8 pt-16">
                  <div className="text-center mb-6">
                    <Crown className="w-14 h-14 mx-auto mb-4 text-yellow-500" />
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      {t('premium.monthly')}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      {t('premium.fullAccess')}
                    </p>
                  </div>

                  <div className="text-center mb-6">
                    <div className="flex items-baseline justify-center mb-2">
                      <span className="text-5xl font-extrabold bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">
                        $2.99
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 ml-2 text-lg">/month</span>
                    </div>
                  </div>

                  <ul className="space-y-3 mb-8">
                    {[
                      t('premium.20DailyTickets'),
                      t('premium.exclusiveCustomization'),
                      t('premium.prioritySupport'),
                      t('premium.cancelAnytime'),
                      t('premium.moreFeatures')
                    ].map((feature, index) => (
                      <li
                        key={index}
                        className="flex items-center gap-3 text-gray-700 dark:text-gray-300"
                      >
                        <div className="p-1 rounded-full bg-green-100 dark:bg-green-900/30">
                          <Check className="w-4 h-4 text-green-500" />
                        </div>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={handleSubscribe}
                    disabled={loading.monthly}
                    className="w-full py-4 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-yellow-500 via-orange-500 to-yellow-600 hover:from-yellow-600 hover:via-orange-600 hover:to-yellow-700 shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading.monthly ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {t('premium.processing')}
                      </>
                    ) : (
                      <>
                        <Crown className="w-5 h-5" />
                        {t('premium.subscribeNow')}
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>

            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-8">
                {t('premium.whatsIncluded')}
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Feature
                  icon={Zap}
                  title={t('premium.20DailyTickets')}
                  description={t('premium.20DailyTicketsDesc')}
                />
                <Feature
                  icon={Palette}
                  title={t('premium.exclusiveCustomization')}
                  description={t('premium.exclusiveCustomizationDesc')}
                />
                <Feature
                  icon={Star}
                  title={t('premium.prioritySupport')}
                  description={t('premium.prioritySupportDesc')}
                />
                <Feature
                  icon={Shield}
                  title={t('premium.cancelAnytime')}
                  description={t('premium.cancelAnytimeDesc')}
                />
              </div>
            </div>

            <div className="mt-12 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                <Shield className="w-4 h-4 inline-block mr-1" />
                {t('premium.securePayment')}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {t('premium.autoRenew')}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}