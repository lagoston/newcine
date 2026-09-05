import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, Crown, Calendar, CreditCard, Gift, ArrowRight, Sparkles, Zap, Shield, PartyPopper } from 'lucide-react';
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

        Promise.all([
          refreshSession(),
          checkPremiumStatus()
        ]).catch(err => console.error('Error refreshing session:', err));

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
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="fixed inset-0 bg-gradient-to-br from-gray-50 via-yellow-50/30 to-orange-50/30 dark:from-gray-900 dark:via-yellow-900/10 dark:to-orange-900/10 -z-10"></div>
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-yellow-400/20 to-orange-400/20 dark:from-yellow-600/10 dark:to-orange-600/10 rounded-full blur-3xl" />
        <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-amber-400/20 to-yellow-400/20 dark:from-amber-600/10 dark:to-yellow-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-gradient-to-br from-orange-400/15 to-rose-400/15 dark:from-orange-600/8 dark:to-rose-600/8 rounded-full blur-3xl" />
      </div>

      <motion.div
        className="max-w-2xl w-full relative z-10"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden">
          <div className="relative bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-500 p-8 sm:p-10 text-center overflow-hidden">
            <div className="absolute inset-0 overflow-hidden">
              {[...Array(15)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 bg-white/80 rounded-full"
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
                  <CheckCircle className="w-20 h-20 text-white drop-shadow-lg" />
                  <motion.div
                    className="absolute -top-2 -right-2"
                    animate={{
                      scale: [1, 1.3, 1],
                      rotate: [0, 180, 360]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Crown className="w-10 h-10 text-yellow-200" />
                  </motion.div>
                </div>
              </motion.div>

              <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2 drop-shadow-md">
                Welcome to Premium!
              </h1>
              <p className="text-lg text-white/90 font-medium">
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
                  <Sparkles className="w-10 h-10 text-yellow-500 mb-4" />
                </motion.div>
                <p className="text-gray-600 dark:text-gray-400">Setting up your premium account...</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="text-center p-4 rounded-2xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/60 dark:border-gray-600/60">
                    <Zap className="w-7 h-7 text-yellow-500 mx-auto mb-2" />
                    <p className="text-xl font-bold text-gray-900 dark:text-white">20</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Tickets/Day</p>
                  </div>
                  <div className="text-center p-4 rounded-2xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/60 dark:border-gray-600/60">
                    <Shield className="w-7 h-7 text-blue-500 mx-auto mb-2" />
                    <p className="text-xl font-bold text-gray-900 dark:text-white">Pro</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Features</p>
                  </div>
                  <div className="text-center p-4 rounded-2xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/60 dark:border-gray-600/60">
                    <PartyPopper className="w-7 h-7 text-green-500 mx-auto mb-2" />
                    <p className="text-xl font-bold text-gray-900 dark:text-white">VIP</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Support</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/60 dark:border-gray-600/60 p-5 mb-5">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                    <Gift className="w-5 h-5 text-pink-500 mr-2" />
                    Subscription Details
                  </h2>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2 border-b border-gray-200/50 dark:border-gray-600/50">
                      <div className="flex items-center text-gray-600 dark:text-gray-400">
                        <Crown className="w-4 h-4 text-yellow-500 mr-2" />
                        <span className="text-sm">Plan</span>
                      </div>
                      <div className="text-gray-900 dark:text-white font-semibold text-sm">
                        {subscription?.planName}
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2 border-b border-gray-200/50 dark:border-gray-600/50">
                      <div className="flex items-center text-gray-600 dark:text-gray-400">
                        <CreditCard className="w-4 h-4 text-blue-500 mr-2" />
                        <span className="text-sm">Price</span>
                      </div>
                      <div className="text-gray-900 dark:text-white font-semibold text-sm">
                        {subscription?.price}
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2 border-b border-gray-200/50 dark:border-gray-600/50">
                      <div className="flex items-center text-gray-600 dark:text-gray-400">
                        <Calendar className="w-4 h-4 text-green-500 mr-2" />
                        <span className="text-sm">Started</span>
                      </div>
                      <div className="text-gray-900 dark:text-white font-semibold text-sm">
                        {subscription?.startDate}
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center text-gray-600 dark:text-gray-400">
                        <Calendar className="w-4 h-4 text-orange-500 mr-2" />
                        <span className="text-sm">Next Billing</span>
                      </div>
                      <div className="text-gray-900 dark:text-white font-semibold text-sm">
                        {subscription?.nextBillingDate}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-gradient-to-br from-yellow-100/50 to-orange-100/50 dark:from-yellow-900/20 dark:to-orange-900/20 border border-yellow-200/50 dark:border-yellow-800/30 p-5 mb-6">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white mb-3 flex items-center">
                    <Sparkles className="w-5 h-5 text-yellow-500 mr-2" />
                    Your Premium Benefits
                  </h3>
                  <ul className="space-y-2">
                    {[
                      '20 Oracle tickets every day',
                      'Enhanced predictions with Oracle 2.0',
                      'Complete prediction & recommendation history',
                      'Exclusive profile frames and banners',
                      'Priority customer support'
                    ].map((benefit, index) => (
                      <li
                        key={index}
                        className="flex items-start"
                      >
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="text-center space-y-3">
                  <button
                    onClick={() => navigate('/profile')}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-500 text-white rounded-xl hover:from-yellow-500 hover:to-orange-500 transition-all duration-300 shadow-lg hover:shadow-xl font-bold"
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