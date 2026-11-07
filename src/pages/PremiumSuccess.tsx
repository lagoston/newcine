import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { products } from '../stripe-config';
import { PAPER, MIST, PIXEL, VELVET, glassPanel } from '../lib/oracleTheme';
import { TicketFan, PREMIUM_GOLD } from '../components/premium/parts';
import { GOLD_BUTTON } from '../components/premium/PremiumTicket';
import '../components/premium/premium.css';

// Boas-vindas depois do pagamento (/premium/success). 04/11/2026: só o
// visual mudou, para conversar com a página Premium nova (o ingresso
// dourado, as cartas Yu-Gi-Oh! saindo de trás) — os textos eram fixos em
// inglês e a tela prometia "Pro" e "VIP", que não existem. A lógica (buscar
// a assinatura, atualizar o status Premium, ir para o perfil em 10 s)
// continua a mesma de antes.

interface SubscriptionDetails {
  planName: string;
  price: string;
  // Datas guardadas como Date e formatadas na tela no idioma do site (antes
  // saíam no formato do navegador, ex.: 11/4/2026 num site em português).
  startDate: Date;
  nextBillingDate: Date;
  transactionId: string;
}

// O que já está ligado na conta (o mesmo inventário de pages/Premium.tsx).
// 05/11/2026: saiu "Prateleiras inteiras" — a Mesa dos Oráculos e o Acervo
// são iguais e completos para todo mundo (decisão do Bruno), então não é
// mais benefício do Premium.
const INCLUDED = [
  'premium.page.oracles.review.title',
  'premium.page.member.go.duel.title',
  'premium.page.member.go.chip.title',
  'premium.page.member.go.profile.title',
];

export default function PremiumSuccess() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshSession, checkPremiumStatus } = useAuth();
  const reduceMotion = useReducedMotion();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    async function loadSubscriptionDetails() {
      try {
        setLoading(true);

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
            ? new Date(subscriptionData.current_period_start * 1000)
            : new Date();

          const nextBillingDate = subscriptionData.current_period_end
            ? new Date(subscriptionData.current_period_end * 1000)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

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
            startDate: new Date(),
            nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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

  // Linhas do quadro da assinatura (o nome do plano agora vem traduzido).
  const details = subscription
    ? [
        { label: t('premium.page.success.plan'), value: t('premium.page.success.planName') },
        { label: t('premium.page.success.price'), value: `${subscription.price}${t('premium.page.ticket.perMonth')}` },
        { label: t('premium.page.success.started'), value: subscription.startDate.toLocaleDateString(i18n.language) },
        { label: t('premium.page.success.next'), value: subscription.nextBillingDate.toLocaleDateString(i18n.language) },
      ]
    : [];

  return (
    <div className="prm-root min-h-[calc(100vh-4rem)] flex items-start sm:items-center justify-center px-4 py-8">
      <motion.div
        className="w-full max-w-xl"
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        {/* As cartas Yu-Gi-Oh! saindo de trás do quadro, como no ingresso. */}
        <div className="relative pt-[112px] sm:pt-[128px]">
          <TicketFan />
          <div
            className="relative z-10 rounded-3xl px-5 py-8 sm:px-10 sm:py-10"
            style={{
              background: `radial-gradient(110% 60% at 50% 0%, rgba(244,196,84,0.2), transparent 62%), ${VELVET}`,
              boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.45), 0 30px 60px -36px rgba(0,0,0,0.9), 0 0 40px -20px rgba(244,196,84,0.45)',
            }}
          >
            <div className="text-center">
              <h1 style={{ ...PIXEL, color: PAPER }} className="text-[34px] sm:text-[46px] leading-[1.02]">
                {t('premium.page.success.title')}
              </h1>
              <p className="mt-3 text-base sm:text-lg" style={{ color: MIST }}>
                {t('premium.page.success.subtitle')}
              </p>
            </div>

            {loading ? (
              <p role="status" className="mt-10 mb-4 flex items-center justify-center gap-2.5 text-[15px]" style={{ color: MIST }}>
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
                {t('premium.page.success.loading')}
              </p>
            ) : (
              <>
                <section aria-labelledby="prm-success-details" className="mt-8 rounded-2xl p-5" style={glassPanel('#F4C454')}>
                  <h2 id="prm-success-details" style={{ ...PIXEL, color: PREMIUM_GOLD }} className="text-[17px] leading-none tracking-[0.1em] uppercase">
                    {t('premium.page.success.details')}
                  </h2>
                  <dl className="mt-3 divide-y divide-white/10">
                    {details.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-4 py-2.5 text-[15px]">
                        <dt style={{ color: MIST }}>{row.label}</dt>
                        <dd className="font-semibold text-right" style={{ color: PAPER }}>
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section aria-labelledby="prm-success-included" className="mt-4 rounded-2xl p-5" style={glassPanel('#F0ABFC')}>
                  <h2 id="prm-success-included" style={{ ...PIXEL, color: PAPER }} className="text-[17px] leading-none tracking-[0.1em] uppercase">
                    {t('premium.page.success.included')}
                  </h2>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {INCLUDED.map((key) => (
                      <li key={key} className="flex items-center gap-2.5 text-[15px]" style={{ color: PAPER }}>
                        <span aria-hidden className="grid place-items-center w-5 h-5 rounded-full shrink-0" style={{ background: 'rgba(244,196,84,0.18)' }}>
                          <Check className="w-3.5 h-3.5" style={{ color: PREMIUM_GOLD }} />
                        </span>
                        {t(key)}
                      </li>
                    ))}
                  </ul>
                </section>

                <div className="mt-7 text-center">
                  <button type="button" onClick={() => navigate('/profile')} className={`${GOLD_BUTTON} sm:w-auto sm:px-8`}>
                    {t('premium.page.success.explore')}
                    <ArrowRight className="w-5 h-5" aria-hidden />
                  </button>
                  <p className="mt-3 text-sm" style={{ color: MIST }}>
                    {t('premium.page.success.redirect', { count: countdown })}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
