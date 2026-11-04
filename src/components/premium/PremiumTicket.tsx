import React from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, Loader2, Settings, ShieldCheck } from 'lucide-react';
import { PAPER, MIST, PIXEL, FOCUS_RING } from '../../lib/oracleTheme';
import { TicketFan } from './parts';
import './premium.css';

// O ingresso do Premium (04/11/2026): o preço e o botão de assinar num
// ingresso de cinema dourado, com o canhoto picotado e as cartas Yu-Gi-Oh!
// dos oráculos saindo de trás. Para quem já assina, o mesmo ingresso
// aparece carimbado ("Ativo" ou "Vitalício"), com o botão do portal do
// Stripe no lugar do de assinar.
//
// Aqui só mora a apresentação: quem chama (pages/Premium.tsx) continua
// sendo o dono do checkout, do portal e dos estados de carregamento.

// Botão dourado, alto o bastante para o toque (52px).
export const GOLD_BUTTON = `prm-cta inline-flex w-full items-center justify-center gap-2 min-h-[52px] px-6 rounded-xl text-base font-bold ${FOCUS_RING}`;

interface OfferProps {
  mode: 'offer';
  priceLabel: string;
  checkoutAvailable: boolean;
  loading: boolean;
  onSubscribe: () => void;
}

interface MemberProps {
  mode: 'member';
  lifetime: boolean;
  // Sem portal no app das lojas e no Premium vitalício (não há assinatura).
  canManage: boolean;
  managing: boolean;
  onManage: () => void;
}

type PremiumTicketProps = (OfferProps | MemberProps) & { className?: string };

const PremiumTicket: React.FC<PremiumTicketProps> = (props) => {
  const { t } = useTranslation();
  const { className = '' } = props;

  return (
    <div className={`relative mx-auto w-full max-w-[360px] pt-[112px] sm:pt-[128px] ${className}`}>
      <TicketFan />

      <div className="prm-ticket relative z-10">
        <div className="prm-ticket-main px-6 pt-6 pb-7 sm:px-7">
          <p className="flex items-center justify-center gap-2" style={{ color: 'var(--prm-gold)' }}>
            <Crown className="w-5 h-5" aria-hidden />
            <span style={PIXEL} className="text-[17px] leading-none tracking-[0.14em] uppercase">
              {t('premium.page.ticket.label')}
            </span>
          </p>

          {props.mode === 'offer' ? (
            <>
              <p className="mt-2 text-center text-sm" style={{ color: MIST }}>
                {t('premium.page.ticket.plan')}
              </p>
              <p className="mt-4 flex items-baseline justify-center gap-1.5" aria-label={t('premium.page.ticket.priceAria', { price: props.priceLabel })}>
                <span style={{ ...PIXEL, color: PAPER }} className="text-[60px] leading-none" aria-hidden>
                  {props.priceLabel}
                </span>
                <span className="text-lg" style={{ color: MIST }} aria-hidden>
                  {t('premium.page.ticket.perMonth')}
                </span>
              </p>

              <div className="mt-6">
                {/* Dentro do app das lojas o checkout do site não pode abrir: a
                    assinatura por lá vai ser cobrada pela própria loja (em breve). */}
                {props.checkoutAvailable ? (
                  <button
                    type="button"
                    onClick={props.onSubscribe}
                    disabled={props.loading}
                    aria-busy={props.loading || undefined}
                    className={GOLD_BUTTON}
                  >
                    {props.loading ? (
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
                  <p className="rounded-xl px-4 py-3 text-center text-sm leading-snug ring-1 ring-white/15 bg-white/5" style={{ color: PAPER }}>
                    {t('premium.page.ticket.inApp')}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="mt-6 flex justify-center">
                <span style={PIXEL} className="prm-stamp inline-block rounded-lg px-4 py-2 text-[30px] leading-none uppercase tracking-wider">
                  {props.lifetime ? t('premium.page.member.statusLifetime') : t('premium.page.member.status')}
                </span>
              </p>
              <p className="mt-5 text-center text-sm" style={{ color: MIST }}>
                {props.lifetime ? t('premium.page.member.planLifetime') : t('premium.page.ticket.plan')}
              </p>
              {props.canManage && (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={props.onManage}
                    disabled={props.managing}
                    aria-busy={props.managing || undefined}
                    className={`inline-flex w-full items-center justify-center gap-2 min-h-[48px] px-5 rounded-xl text-[15px] font-semibold ring-1 ring-[color:var(--prm-gold-line)] hover:bg-[color:var(--prm-gold-soft)] disabled:opacity-70 disabled:cursor-progress transition ${FOCUS_RING}`}
                    style={{ color: PAPER }}
                  >
                    {props.managing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
                        {t('common.loading')}
                      </>
                    ) : (
                      <>
                        <Settings className="w-5 h-5" aria-hidden />
                        {t('premium.page.member.manage')}
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="prm-ticket-stub px-6 py-4 sm:px-7 text-center">
          {props.mode === 'offer' ? (
            <>
              <p className="text-[13px] leading-snug" style={{ color: PAPER }}>
                {t('premium.page.ticket.renews')}
              </p>
              {/* No app das lojas não há pagamento pelo site (nem Stripe). */}
              {props.checkoutAvailable && (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px]" style={{ color: MIST }}>
                  <ShieldCheck className="w-4 h-4" aria-hidden />
                  {t('premium.page.ticket.secure')}
                </p>
              )}
            </>
          ) : (
            <p className="text-[13px] leading-snug" style={{ color: MIST }}>
              {props.canManage
                ? t('premium.page.member.manageHint')
                : props.lifetime
                  ? t('premium.page.member.thanksLifetime')
                  : t('premium.page.member.thanks')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PremiumTicket;
