import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, Crown, Calendar, CreditCard, Gift, ArrowRight, Sparkles, Zap, Shield, PartyPopper } from 'lucide-react';
import Logo from '../components/Logo';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { products } from '../stripe-config';
import { motion } from 'framer-motion';

interface SubscriptionDetails {
  planName: string;
  price: string;
  startDate: string;
  nextBillingDate: string;
  transactionId: string;
}

export default function PremiumSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { refreshSession, checkPremiumStatus } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    async function loadSubscriptionDetails() {
      try {
        setLoading(true);

        const plan = location.state?.plan || sessionStorage.getItem('premium_plan_type') || 'monthly';
        const sessionId = location.state?.session_id || '';

        // Refresh session to update premium status (non-blocking)
        Promise.all([
          refreshSession(),
          checkPremiumStatus()
        ]).catch(err => console.error('Error refreshing session:', err));

        // Get subscription details
        const { data: subscriptionData, error } = await supabase
          .from('stripe_user_subscriptions')
          .select('*')
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching subscription details:', error);
        }

        if (subscriptionData) {
          const startDate = subscriptionData.current_period_start
            ? new Date(subscriptionData.current_period_start * 1000).toLocaleDateString()
            : new Date().toLocaleDateString();

          const nextBillingDate = subscriptionData.current_period_end
            ? new Date(subscriptionData.current_period_end * 1000).toLocaleDateString()
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString();

          setSubscription({
            planName: 'Premium Monthly',
            price: `$${products.premium.price}`,
            startDate,
            nextBillingDate,
            transactionId: subscriptionData.subscription_id || sessionId || 'Pending'
          });
        } else {
          setSubscription({
            planName: 'Premium Monthly',
            price: `$${products.premium.price}`,
            startDate: new Date().toLocaleDateString(),
            nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
            transactionId: sessionId || 'Pending'
          });
        }
      } catch (error) {
        console.error('Error in subscription loading:', error);
      } finally {
        setLoading(false);
      }
    }

    loadSubscriptionDetails();

    // Countdown timer
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/profile');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      sessionStorage.removeItem('premium_plan_type');
    };
  }, [navigate, refreshSession, checkPremiumStatus, location.state]);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-yellow-50 via-orange-50 to-yellow-100 dark:from-gray-900 dark:via-yellow-900/10 dark:to-gray-900 p-4">
      <motion.div
        className="max-w-2xl w-full"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden border-2 border-yellow-400/50 dark:border-yellow-600/50">
          {/* Animated Header */}
          <div className="relative bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-500 p-8 sm:p-12 text-center overflow-hidden">
            {/* Animated particles */}
            <div className="absolute inset-0 overflow-hidden">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 bg-white rounded-full"
                  initial={{
                    x: Math.random() * 100 + '%',
                    y: '100%',
                    opacity: 0
                  }}
                  animate={{
                    y: '-20%',
                    opacity: [0, 1, 0]
                  }}
                  transition={{
                    duration: 2 + Math.random() * 2,
                    repeat: Infinity,
                    delay: Math.random() * 2
                  }}
                />
              ))}
            </div>

            <div className="relative z-10">
              <motion.div
                className="inline-block mb-4"
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 10, -10, 0]
                }}
                transition={{ duration: 0.6, times: [0, 0.5, 0.8, 1] }}
              >
                <div className="relative">
                  <CheckCircle className="w-24 h-24 text-white drop-shadow-lg" />
                  <motion.div
                    className="absolute -top-2 -right-2"
                    animate={{
                      scale: [1, 1.3, 1],
                      rotate: [0, 180, 360]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Crown className="w-12 h-12 text-yellow-200" />
                  </motion.div>
                </div>
              </motion.div>

              <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-3 drop-shadow-md">
                Welcome to Premium!
              </h1>
              <p className="text-xl text-white/90 font-medium">
                Your subscription is now active
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="w-12 h-12 text-yellow-500 mb-4" />
                </motion.div>
                <p className="text-gray-600 dark:text-gray-400">Setting up your premium account...</p>
              </div>
            ) : (
              <>
                {/* Quick Benefits */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  <motion.div
                    className="text-center p-4 rounded-2xl bg-gradient-to-br from-yellow-100 to-orange-100 dark:from-yellow-900/20 dark:to-orange-900/20"
                    whileHover={{ scale: 1.05 }}
                  >
                    <Zap className="w-8 h-8 text-yellow-600 dark:text-yellow-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">3000</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Tickets</p>
                  </motion.div>
                  <motion.div
                    className="text-center p-4 rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20"
                    whileHover={{ scale: 1.05 }}
                  >
                    <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">Pro</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Features</p>
                  </motion.div>
                  <motion.div
                    className="text-center p-4 rounded-2xl bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20"
                    whileHover={{ scale: 1.05 }}
                  >
                    <PartyPopper className="w-8 h-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">VIP</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Support</p>
                  </motion.div>
                </div>

                {/* Subscription Details */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-6 mb-6">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                    <Gift className="w-5 h-5 text-purple-500 mr-2" />
                    Subscription Details
                  </h2>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-600">
                      <div className="flex items-center text-gray-600 dark:text-gray-400">
                        <Crown className="w-4 h-4 text-yellow-500 mr-2" />
                        <span className="text-sm font-medium">Plan</span>
                      </div>
                      <div className="text-gray-900 dark:text-white font-semibold">
                        {subscription?.planName}
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-600">
                      <div className="flex items-center text-gray-600 dark:text-gray-400">
                        <CreditCard className="w-4 h-4 text-blue-500 mr-2" />
                        <span className="text-sm font-medium">Price</span>
                      </div>
                      <div className="text-gray-900 dark:text-white font-semibold">
                        {subscription?.price}
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-600">
                      <div className="flex items-center text-gray-600 dark:text-gray-400">
                        <Calendar className="w-4 h-4 text-green-500 mr-2" />
                        <span className="text-sm font-medium">Started</span>
                      </div>
                      <div className="text-gray-900 dark:text-white font-semibold">
                        {subscription?.startDate}
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center text-gray-600 dark:text-gray-400">
                        <Calendar className="w-4 h-4 text-orange-500 mr-2" />
                        <span className="text-sm font-medium">Next Billing</span>
                      </div>
                      <div className="text-gray-900 dark:text-white font-semibold">
                        {subscription?.nextBillingDate}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Premium Benefits */}
                <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border border-yellow-200 dark:border-yellow-800/30 rounded-2xl p-6 mb-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                    <Sparkles className="w-5 h-5 text-yellow-500 mr-2" />
                    Your Premium Benefits
                  </h3>
                  <ul className="space-y-3">
                    {[
                      '3000 Oracle tickets every month',
                      'Enhanced predictions with Oracle 2.0',
                      'Complete prediction & recommendation history',
                      'Exclusive profile frames and banners',
                      'Priority customer support'
                    ].map((benefit, index) => (
                      <motion.li
                        key={index}
                        className="flex items-start"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <CheckCircle className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700 dark:text-gray-300">{benefit}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>

                {/* CTA */}
                <div className="text-center space-y-4">
                  <button
                    onClick={() => navigate('/profile')}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-500 text-white rounded-xl hover:from-yellow-500 hover:to-orange-500 transition-all duration-300 shadow-lg hover:shadow-xl font-bold text-lg transform hover:scale-105"
                  >
                    Explore Your Profile
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </button>

                  <motion.p
                    className="text-sm text-gray-500 dark:text-gray-400"
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    Redirecting in {countdown} seconds...
                  </motion.p>
                </div>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
