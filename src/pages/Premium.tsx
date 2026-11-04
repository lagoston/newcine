import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Crown, ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { createCheckoutSession, createPortalSession } from '../lib/stripe';
import { WEB_CHECKOUT_AVAILABLE } from '../lib/platform';
import { toast } from 'sonner';
import { products } from '../stripe-config';
import { Trans, useTranslation } from 'react-i18next';
import { PAPER, MIST, PIXEL, FOCUS_RING, VELVET } from '../lib/oracleTheme';
import PremiumTicket, { GOLD_BUTTON } from '../components/premium/PremiumTicket';
import PremiumOracles from '../components/premium/PremiumOracles';
import PremiumCollection from '../components/premium/PremiumCollection';
import PremiumProfile from '../components/premium/PremiumProfile';
import PremiumCompare from '../components/premium/PremiumCompare';
import PremiumMember from '../components/premium/PremiumMember';
import { OracleFaces, PREMIUM_GOLD } from '../components/premium/parts';
import '../components/premium/premium.css';

// Página Premium (/premium) — redesenhada em 04/11/2026: "a versão estendida
// do CineOracle". Vende o Premium de hoje com as peças do próprio produto
// (cartas dos oráculos, ficha especial, pôsteres com efeito, molduras e
// banners), em capítulos ("rolos"): primeiro os oráculos e as prateleiras,
// depois a coleção, depois o perfil, e uma tabela só com o que tem número.
//
// Inventário do que o Premium dá HOJE (conferido no código e no banco em
// 04/11/2026 — se algo mudar, mude aqui e nos textos premium.page.*):
//   1. Biblioteca dos Oráculos inteira — OracleLibraries.tsx: sem Premium,
//      20 títulos por prateleira (FREE_LIMIT); com Premium, todos.
//   2. Resenha do Oráculo no seu estilo — Edge Function generate-ai-review:
//      Premium + 10 resenhas reais; 1 por dia + 1 nova tentativa.
//   3. Duelo de Watchlist — Edge Function watchlist-duel: só Premium, sem
//      limite (entra pela Watchlist da Biblioteca).
//   4. Sussurros — get_user_indication_limit: 20 por dia (5 sem Premium).
//   5. Ficha especial semanal do Poster Jackpot — get_jackpot_state: 1 por
//      semana, não acumula, sempre com efeito.
//   6. Molduras e banners Premium (11 + 11), cartas Yu-Gi-Oh! e Horror e os
//      3 efeitos no nome — cosmetic_requirements / lib/frames, banners,
//      textEffects; as temáticas pedem também a tag do tema.
//   7. Avatar animado (GIF/WebP até 2 MB) — Profile.tsx.
//   8. A coroa ao lado do nome — ProfileIdentityCard, Comunidade.
// Saíram da página por não existirem mais (ou nunca terem existido):
// "Duelos ilimitados" do Duelo do Oráculo (sem porta no site desde
// 02/11/2026), "20 tickets por dia" (o sistema de tickets saiu do site),
// "Suporte prioritário", "Mais recursos" e o "Pro/VIP" do PremiumSuccess.
//
// O checkout, o portal do Stripe, o preço e os planos continuam exatamente
// como eram (lib/stripe.ts, stripe-config.ts); aqui mudou só a apresentação.

// Selo do topo ("CineOracle Premium", "Premium ativo").
const Eyebrow: React.FC<{ label: string }> = ({ label }) => (
  <p
    className="inline-flex items-center gap-2 h-9 my-1 px-3.5 rounded-full text-sm font-semibold"
    style={{ color: PREMIUM_GOLD, background: 'rgba(244,196,84,0.1)', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.4)' }}
  >
    <Crown className="w-4 h-4" aria-hidden />
    {label}
  </p>
);

export default function Premium() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, isPremium, isLifetimePremium } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState({
    monthly: false,
    portal: false,
  });

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      // 04/11/2026: a rota da tela de boas-vindas é /premium/success (App.tsx);
      // o caminho antigo (/premium-success) não existia e caía na home pelo
      // "*". Leva junto o plano e a sessão que o Stripe devolve na URL.
      navigate('/premium/success', {
        replace: true,
        state: { plan: searchParams.get('plan') || undefined, session_id: searchParams.get('session_id') || undefined },
      });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    if (!session) {
      navigate('/auth');
    }
  }, [session, navigate]);

  const handleSubscribe = async () => {
    if (!session?.user) {
      toast.error(t('premium.page.ticket.signIn'));
      navigate('/auth');
      return;
    }

    try {
      setLoading((prev) => ({ ...prev, monthly: true }));

      const checkoutUrl = await createCheckoutSession({
        priceId: products.premium.priceId,
      });

      if (checkoutUrl) {
        sessionStorage.setItem('premium_plan_type', 'monthly');
        window.location.href = checkoutUrl;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      // 04/11/2026: os avisos de erro eram fixos em inglês.
      toast.error(t('premium.page.ticket.checkoutError'));
    } finally {
      setLoading((prev) => ({ ...prev, monthly: false }));
    }
  };

  const handleManageSubscription = async () => {
    if (!session?.user) {
      toast.error(t('premium.page.ticket.signIn'));
      return;
    }

    try {
      setLoading((prev) => ({ ...prev, portal: true }));
      const portalUrl = await createPortalSession();
      if (portalUrl) {
        window.location.href = portalUrl;
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast.error(t('premium.page.ticket.portalError'));
    } finally {
      setLoading((prev) => ({ ...prev, portal: false }));
    }
  };

  // O preço continua vindo do stripe-config (o mesmo $2.99 de antes).
  const priceLabel = `$${products.premium.price.toFixed(2)}`;

  return (
    <div className="prm-root min-h-[calc(100vh-4rem)]">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-8 pt-4 sm:pt-6 pb-8">
        {/* Voltar: no celular e no tablet fica na mesma linha do selo do topo
            (assim o botão de assinar aparece sem rolar num celular comum);
            no computador, o texto vai à esquerda e o botão volta ao fluxo. */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className={`absolute left-4 sm:left-8 top-4 sm:top-6 lg:static z-20 grid place-items-center w-11 h-11 rounded-xl ring-1 ring-white/15 hover:ring-white/35 hover:bg-white/5 transition ${FOCUS_RING}`}
          style={{ color: PAPER }}
        >
          <ArrowLeft className="w-5 h-5" aria-hidden />
        </button>

        {isPremium ? (
          <>
            <section aria-labelledby="prm-title" className="grid gap-4 lg:gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center pt-1 lg:pt-4 pb-4 lg:pb-8">
              <div className="text-center lg:text-left">
                <Eyebrow label={isLifetimePremium ? t('premium.page.member.kickerLifetime') : t('premium.page.member.kicker')} />
                <h1 id="prm-title" style={{ ...PIXEL, color: PAPER }} className="mt-4 text-[36px] sm:text-[56px] lg:text-[64px] leading-[0.98]">
                  <Trans i18nKey="premium.page.member.title" components={{ gold: <span style={{ color: PREMIUM_GOLD }} /> }} />
                </h1>
                <p className="mt-4 sm:mt-5 text-base sm:text-lg leading-relaxed max-w-xl mx-auto lg:mx-0" style={{ color: MIST }}>
                  {t('premium.page.member.lead')}
                </p>
              </div>
              {/* No app das lojas o portal do Stripe não abre (a cobrança lá é
                  da loja); no vitalício não há assinatura para gerenciar. */}
              <PremiumTicket
                mode="member"
                lifetime={isLifetimePremium}
                canManage={!isLifetimePremium && WEB_CHECKOUT_AVAILABLE}
                managing={loading.portal}
                onManage={handleManageSubscription}
              />
            </section>
            <PremiumMember />
          </>
        ) : (
          <>
            <section aria-labelledby="prm-title" className="grid gap-4 lg:gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center pt-1 lg:pt-4 pb-4 lg:pb-8">
              <div className="text-center lg:text-left">
                <Eyebrow label={t('premium.page.eyebrow')} />
                <h1 id="prm-title" style={{ ...PIXEL, color: PAPER }} className="mt-4 text-[38px] sm:text-[60px] lg:text-[68px] leading-[0.96]">
                  <Trans i18nKey="premium.page.title" components={{ gold: <span style={{ color: PREMIUM_GOLD }} /> }} />
                </h1>
                <p className="mt-4 sm:mt-5 text-base sm:text-lg leading-relaxed max-w-xl mx-auto lg:mx-0" style={{ color: MIST }}>
                  {t('premium.page.lead')}
                </p>
                {/* Atalhos para os capítulos (do tablet para cima: no celular
                    o ingresso vem logo depois do texto). */}
                <nav aria-label={t('premium.page.jumpAria')} className="hidden sm:block mt-7">
                  <ul className="flex flex-wrap gap-2 justify-center lg:justify-start">
                    {(['oracles', 'collection', 'profile', 'compare'] as const).map((key) => (
                      <li key={key}>
                        <a
                          href={`#prm-${key}`}
                          className={`inline-flex items-center h-11 px-4 rounded-full text-sm font-medium ring-1 ring-white/15 hover:ring-[color:var(--prm-gold-line)] hover:bg-white/5 transition ${FOCUS_RING}`}
                          style={{ color: PAPER }}
                        >
                          {t(`premium.page.jump.${key}`)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
              <PremiumTicket
                mode="offer"
                priceLabel={priceLabel}
                checkoutAvailable={WEB_CHECKOUT_AVAILABLE}
                loading={loading.monthly}
                onSubscribe={handleSubscribe}
              />
            </section>

            <PremiumOracles />
            <PremiumCollection />
            <PremiumProfile />
            <PremiumCompare />

            {/* Fecho: o mesmo botão, para quem leu até o fim. */}
            <section aria-labelledby="prm-closing" className="py-12 sm:py-16">
              <div
                className="rounded-3xl px-6 py-10 sm:px-12 sm:py-14 text-center"
                style={{
                  background: `radial-gradient(90% 120% at 50% 0%, rgba(244,196,84,0.18), transparent 60%), ${VELVET}`,
                  boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.4), 0 30px 60px -40px rgba(244,196,84,0.6)',
                }}
              >
                <OracleFaces size={44} className="justify-center" />
                <h2 id="prm-closing" style={{ ...PIXEL, color: PAPER }} className="mt-5 text-[30px] sm:text-[44px] leading-[1.04]">
                  {t('premium.page.closing.title')}
                </h2>
                <p className="mt-3 text-[15px] sm:text-base" style={{ color: MIST }}>
                  <span style={{ ...PIXEL, color: PAPER }} className="text-[22px]">
                    {priceLabel}
                  </span>
                  {t('premium.page.ticket.perMonth')} · {t('premium.page.ticket.renews')}
                </p>
                <div className="mt-7 mx-auto max-w-[320px]">
                  {WEB_CHECKOUT_AVAILABLE ? (
                    <button type="button" onClick={handleSubscribe} disabled={loading.monthly} aria-busy={loading.monthly || undefined} className={GOLD_BUTTON}>
                      {loading.monthly ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
                          {t('premium.page.ticket.opening')}
                        </>
                      ) : (
                        <>
                          <Crown className="w-5 h-5" aria-hidden />
                          {t('premium.page.ticket.subscribe')}
                        </>
                      )}
                    </button>
                  ) : (
                    <p className="rounded-xl px-4 py-3 text-sm leading-snug ring-1 ring-white/15 bg-white/5" style={{ color: PAPER }}>
                      {t('premium.page.ticket.inApp')}
                    </p>
                  )}
                </div>
                {WEB_CHECKOUT_AVAILABLE && (
                  <p className="mt-4 inline-flex items-center gap-1.5 text-[13px]" style={{ color: MIST }}>
                    <ShieldCheck className="w-4 h-4" aria-hidden />
                    {t('premium.page.ticket.secure')}
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
