import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, Crown, Calendar, CreditCard, Gift, RotateCw, ArrowRight } from 'lucide-react';
import Logo from '../components/Logo';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { products } from '../stripe-config';

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
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    async function loadSubscriptionDetails() {
      try {
        setLoading(true);
        
        // Get plan from location state or session storage
        const plan = location.state?.plan || sessionStorage.getItem('premium_plan_type') || 'monthly';
        const sessionId = location.state?.session_id || '';
        
        // Refresh session to update premium status
        await refreshSession();
        await checkPremiumStatus();
        
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
            : plan === 'yearly'
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString()
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString();
            
          // Get price info based on price_id
          const isYearly = subscriptionData.price_id === products.premiumYearly.priceId || plan === 'yearly';
          
          setSubscription({
            planName: isYearly ? 'Premium Yearly' : 'Premium Monthly',
            price: isYearly ? `$${products.premiumYearly.price}` : `$${products.premium.price}`,
            startDate,
            nextBillingDate,
            transactionId: subscriptionData.subscription_id || sessionId || 'Pending'
          });
        } else {
          // Create a fallback subscription object with basic info
          const isYearly = plan === 'yearly';
          setSubscription({
            planName: isYearly ? 'Premium Yearly' : 'Premium Monthly',
            price: isYearly ? `$${products.premiumYearly.price}` : `$${products.premium.price}`,
            startDate: new Date().toLocaleDateString(),
            nextBillingDate: isYearly 
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString()
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
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
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
      <div className="max-w-lg w-full mx-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          {/* Header with animation */}
          <div className="text-center mb-8">
            <div className="flex justify-center">
              <Logo size="large" className="mb-4" />
            </div>
            <div className="inline-flex items-center justify-center relative mb-4">
              <div className="absolute inset-0 rounded-full bg-green-100 dark:bg-green-900/30 animate-ping opacity-75"></div>
              <div className="relative bg-white dark:bg-gray-800 rounded-full p-2">
                <div className="relative">
                  <CheckCircle className="w-16 h-16 text-green-500" />
                  <Crown className="w-8 h-8 text-yellow-500 absolute -top-2 -right-2" />
                </div>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome to Premium!
            </h1>
            <p className="text-xl text-green-600 dark:text-green-400 font-medium">
              Your subscription has been successfully activated!
            </p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <RotateCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
              <p className="text-gray-600 dark:text-gray-400">Loading subscription details...</p>
            </div>
          ) : (
            <>
              {/* Subscription details */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                  <Gift className="w-5 h-5 text-purple-500 mr-2" />
                  Subscription Details
                </h2>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-gray-600 dark:text-gray-400">Plan</div>
                    <div className="text-gray-900 dark:text-white font-medium flex items-center">
                      <Crown className="w-4 h-4 text-yellow-500 mr-1" />
                      {subscription?.planName}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="text-gray-600 dark:text-gray-400">Price</div>
                    <div className="text-gray-900 dark:text-white font-medium">
                      {subscription?.price}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-gray-600 dark:text-gray-400">Start Date</div>
                    <div className="text-gray-900 dark:text-white font-medium flex items-center">
                      <Calendar className="w-4 h-4 text-blue-500 mr-1" />
                      {subscription?.startDate}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="text-gray-600 dark:text-gray-400">Next Billing</div>
                    <div className="text-gray-900 dark:text-white font-medium flex items-center">
                      <CreditCard className="w-4 h-4 text-red-500 mr-1" />
                      {subscription?.nextBillingDate}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="text-gray-600 dark:text-gray-400">Transaction ID</div>
                    <div className="text-gray-900 dark:text-white font-medium text-sm truncate max-w-[200px]">
                      {subscription?.transactionId}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Premium benefits */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/30 rounded-xl p-6 mb-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                  <Crown className="w-5 h-5 text-yellow-500 mr-2" />
                  Your Premium Benefits
                </h3>
                <ul className="space-y-2">
                  <li className="flex items-start">
                    <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700 dark:text-gray-300">3000 tickets per month</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700 dark:text-gray-300">Enhanced predictions with Oracle 2.0</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700 dark:text-gray-300">Complete prediction history</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700 dark:text-gray-300">Exclusive profile customization options</span>
                  </li>
                </ul>
              </div>
              
              <div className="text-center">
                <button
                  onClick={() => navigate('/profile')}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Go to Profile
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Redirecting in {countdown} seconds...
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}