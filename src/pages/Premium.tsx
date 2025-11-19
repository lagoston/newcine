import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Crown, Star, BrainCircuit, History, Palette, Check, Settings, Loader2, Zap, Shield, Sparkles, TrendingUp } from 'lucide-react';
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
  <motion.div
    className="flex items-start gap-4 p-6 rounded-2xl bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/10 dark:to-orange-900/10 border border-yellow-200/50 dark:border-yellow-800/30"
    whileHover={{ scale: 1.02, translateY: -4 }}
    transition={{ duration: 0.2 }}
  >
    <div className="shrink-0 p-3 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg">
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
    </div>
  </motion.div>
);

interface PlanCardProps {
  type: 'monthly' | 'yearly';
  price: number;
  period: string;
  savings?: string | null;
  onSubscribe: () => void;
  isLoading: boolean;
  popular?: boolean;
}

const PlanCard = ({
  type,
  price,
  period,
  savings = null,
  onSubscribe,
  isLoading,
  popular = false
}: PlanCardProps) => (
  <motion.div
    className={`relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden border-2 ${
      popular ? 'border-yellow-400 dark:border-yellow-500' : 'border-transparent'
    }`}
    whileHover={{ scale: 1.03, translateY: -8 }}
    transition={{ duration: 0.3 }}
  >
    {popular && (
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-500 text-white text-sm font-bold px-4 py-2 text-center">
        <Sparkles className="w-4 h-4 inline-block mr-2" />
        BEST VALUE
      </div>
    )}
    <div className={`p-8 ${popular ? 'pt-16' : 'pt-8'}`}>
      <div className="text-center mb-6">
        <Crown className={`w-16 h-16 mx-auto mb-4 ${
          popular ? 'text-yellow-500' : 'text-gray-400'
        }`} />
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {type === 'monthly' ? 'Monthly' : 'Yearly'}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {type === 'monthly' ? 'Perfect to start' : 'Maximum savings'}
        </p>
      </div>

      <div className="text-center mb-6">
        <div className="flex items-baseline justify-center mb-2">
          <span className="text-5xl font-extrabold bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">
            ${price}
          </span>
          <span className="text-gray-500 dark:text-gray-400 ml-2 text-lg">/{period}</span>
        </div>
        {savings && (
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-medium">
            <TrendingUp className="w-4 h-4 mr-1" />
            Save {savings}
          </div>
        )}
      </div>

      <ul className="space-y-3 mb-8">
        {[
          '3000 Tickets Monthly',
          'Exclusive Customization',
          'Priority Support',
          'Cancel Anytime',
          'More Features'
        ].map((feature, index) => (
          <li key={index} className="flex items-center text-gray-700 dark:text-gray-300">
            <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
            <span className="text-sm">{feature}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onSubscribe}
        disabled={isLoading}
        className={`w-full h-14 rounded-xl font-bold text-lg transition-all duration-300 transform flex items-center justify-center shadow-lg ${
          popular
            ? 'bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-500 text-white hover:shadow-2xl hover:scale-105'
            : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 hover:shadow-xl'
        } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Processing...
          </>
        ) : (
          <>
            <Zap className="w-5 h-5 mr-2" />
            Get Premium
          </>
        )}
      </button>
    </div>
  </motion.div>
);

export default function Premium() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, isPremium, refreshSession, checkPremiumStatus } = useAuth();
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
        priceId: products.premium.priceId,
        userId: session.user.id,
        email: session.user.email || ''
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
      const portalUrl = await createPortalSession(session.user.id);
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
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-gray-50 via-yellow-50/20 to-orange-50/20 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white/50 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {isPremium ? (
          /* Premium User View */
          <motion.div
            className="bg-gradient-to-br from-white to-yellow-50/50 dark:from-gray-800 dark:to-yellow-900/10 rounded-3xl shadow-2xl p-8 sm:p-12 border border-yellow-200/50 dark:border-yellow-800/30"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-center mb-8">
              <motion.div
                className="inline-block p-4 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full mb-4"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <Crown className="w-16 h-16 text-white" />
              </motion.div>
              <h2 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-2">
                You're Premium!
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-400">
                Thank you for supporting CrystalBall
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-6 mb-8">
              <div className="bg-white dark:bg-gray-700/50 rounded-2xl p-6 text-center">
                <Zap className="w-8 h-8 text-yellow-500 mx-auto mb-3" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">3000</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Tickets/Month</p>
              </div>
              <div className="bg-white dark:bg-gray-700/50 rounded-2xl p-6 text-center">
                <BrainCircuit className="w-8 h-8 text-blue-500 mx-auto mb-3" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">Oracle 2.0</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Enhanced AI</p>
              </div>
              <div className="bg-white dark:bg-gray-700/50 rounded-2xl p-6 text-center">
                <Shield className="w-8 h-8 text-green-500 mx-auto mb-3" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">Active</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Subscription</p>
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={handleManageSubscription}
                disabled={loading.portal}
                className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-xl hover:from-gray-800 hover:to-gray-900 transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg"
              >
                {loading.portal ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Settings className="w-5 h-5 mr-2" />
                    Manage Subscription
                  </>
                )}
              </button>
            </div>
          </motion.div>
        ) : (
          /* Non-Premium User View */
          <>
            {/* Hero Section */}
            <motion.div
              className="text-center mb-16"
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
                <Crown className="w-20 h-20 text-yellow-500 mx-auto" />
              </motion.div>
              <h1 className="text-5xl sm:text-6xl font-extrabold mb-4">
                <span className="bg-gradient-to-r from-yellow-500 via-orange-500 to-yellow-600 bg-clip-text text-transparent">
                  Upgrade to Premium
                </span>
              </h1>
              <p className="text-xl sm:text-2xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
                Unlock the full power of CrystalBall's AI Oracle
              </p>
            </motion.div>

            {/* Pricing Card */}
            <div className="flex justify-center mb-16">
              <motion.div
                className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden border-2 border-yellow-400 dark:border-yellow-500 max-w-md w-full"
                whileHover={{ scale: 1.03, translateY: -8 }}
                transition={{ duration: 0.3 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-500 text-white text-sm font-bold px-4 py-2 text-center">
                  <Sparkles className="w-4 h-4 inline-block mr-2" />
                  PREMIUM PLAN
                </div>
                <div className="p-8 pt-16">
                  <div className="text-center mb-6">
                    <Crown className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      Monthly
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      Full access to premium features
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
                      '3000 Tickets Monthly',
                      'Exclusive Customization',
                      'Priority Support',
                      'Cancel Anytime',
                      'More Features'
                    ].map((feature, index) => (
                      <motion.li
                        key={index}
                        className="flex items-center gap-3 text-gray-700 dark:text-gray-300"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <Check className="w-5 h-5 text-green-500 shrink-0" />
                        <span>{feature}</span>
                      </motion.li>
                    ))}
                  </ul>

                  <button
                    onClick={handleSubscribe}
                    disabled={loading.monthly}
                    className="w-full py-4 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-yellow-500 via-orange-500 to-yellow-600 hover:from-yellow-600 hover:via-orange-600 hover:to-yellow-700 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                  >
                    {loading.monthly ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Crown className="w-5 h-5" />
                        Subscribe Now
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>

            {/* Features Grid */}
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
                What's Included
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <Feature
                  icon={Zap}
                  title="3000 Tickets Monthly"
                  description="10x more tickets to explore predictions and recommendations without limits"
                />
                <Feature
                  icon={Palette}
                  title="Exclusive Customization"
                  description="Unlock premium frames, banners, and profile customization options"
                />
                <Feature
                  icon={Star}
                  title="Priority Support"
                  description="Get help faster with dedicated premium customer support"
                />
                <Feature
                  icon={Shield}
                  title="Cancel Anytime"
                  description="No commitments - manage or cancel your subscription at any time"
                />
                <Feature
                  icon={Sparkles}
                  title="More Features"
                  description="Access to exclusive features and updates as they become available"
                />
              </div>
            </div>

            {/* Trust Indicators */}
            <div className="mt-16 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                <Shield className="w-4 h-4 inline-block mr-1" />
                Secure payment powered by Stripe
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Your subscription will automatically renew. Cancel anytime from your settings.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
