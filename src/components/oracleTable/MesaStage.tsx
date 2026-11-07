import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MIST, PIXEL, ORACLE_BY_ID, withAlpha } from '../../lib/oracleTheme';
import type { MesaCard as MesaCardT, OracleSlot, Seat } from '../../lib/mesa/types';
import MesaCard from './MesaCard';
import { EyeMark } from './MesaArt';
import type { MesaApi } from './useMesa';

// O palco (SPEC §2.2): os assentos (retrato, nome na cor do bicho, papel em
// MIST), as cartas e o brilho de cada cor embaixo delas (10%; 22% na carta em
// foco). As cartas são dadas a partir do assento (280 ms, 90 ms entre elas) e
// recolhidas para ele (240 ms) quando a pergunta muda. No computador, a quarta
// carta do Espelho ganha um 4º assento depois da Cypher; no celular ela mora ao
// lado da frase do Espelho (MirrorLine).

export const OracleSeat: React.FC<{ seat: OracleSlot; desktop: boolean; dim?: boolean }> = ({ seat, desktop, dim = false }) => {
  const { t } = useTranslation();
  const o = ORACLE_BY_ID[seat];
  return (
    <div className={`flex items-center justify-center ${desktop ? 'gap-2.5 h-[48px]' : 'gap-1.5 h-[38px] flex-wrap content-center'}`} style={{ opacity: dim ? 0.55 : 1 }}>
      <img
        src={o.avatar}
        alt=""
        aria-hidden
        className="shrink-0 rounded-full object-cover"
        style={{ width: desktop ? 36 : 22, height: desktop ? 36 : 22, boxShadow: `0 0 0 1.5px ${withAlpha(o.color, 0.7)}` }}
        decoding="async"
      />
      <div className={desktop ? 'text-left' : 'text-center leading-none'}>
        <p style={{ ...PIXEL, color: o.color, fontSize: desktop ? 18 : 14, lineHeight: 1.05 }}>{o.name}</p>
        {desktop && (
          <p className="text-[12px] leading-tight mt-0.5" style={{ color: MIST }}>
            {t(`mesa.roles.${seat}`)}
          </p>
        )}
      </div>
      {!desktop && (
        <p className="basis-full text-center text-[11px] leading-[13px] -mt-[1px]" style={{ color: MIST }}>
          {t(`mesa.roles.${seat}`)}
        </p>
      )}
    </div>
  );
};

const EspelhoSeat: React.FC<{ kindLabel: string }> = ({ kindLabel }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-2.5 h-[48px]">
      <EyeMark size={30} />
      <div className="text-left">
        <p style={{ ...PIXEL, color: '#B9A6FF', fontSize: 18, lineHeight: 1.05 }}>{t('mesa.espelho.name')}</p>
        <p className="text-[12px] leading-tight mt-0.5" style={{ color: MIST }}>
          {kindLabel}
        </p>
      </div>
    </div>
  );
};

interface StageProps {
  mesa: MesaApi;
  desktop: boolean;
  reduced: boolean;
  cardStyle: string;
  onActivate: (seat: Seat) => void;
  registerCard: (seat: Seat, el: HTMLButtonElement | null) => void;
  onCardKey: (seat: Seat, e: React.KeyboardEvent<HTMLButtonElement>) => void;
}

const SEATS: OracleSlot[] = ['bogart', 'fincher', 'cypher'];

const MesaStage: React.FC<StageProps> = ({ mesa, desktop, reduced, cardStyle, onActivate, registerCard, onCardKey }) => {
  const { t } = useTranslation();
  const espelho = desktop ? mesa.cardAt('espelho') : null;
  const seats: Seat[] = espelho ? [...SEATS, 'espelho'] : SEATS;
  const focusable = mesa.focusSeat ?? seats.find((s) => mesa.cardAt(s)) ?? 'bogart';
  const cols = espelho ? 'repeat(3, minmax(0, var(--ms-cw))) minmax(0, var(--ms-cw4))' : 'repeat(3, minmax(0, var(--ms-cw)))';

  return (
    <div className="ms-stage relative" style={{ contain: 'layout paint' }}>
      <div className="grid justify-center items-start" style={{ gridTemplateColumns: cols, columnGap: 'var(--ms-gap)' }}>
        {seats.map((seat, i) => {
          const card: MesaCardT | null = mesa.cardAt(seat);
          const passed = seat !== 'espelho' && !!mesa.passedAt(seat);
          const color = seat === 'espelho' ? '#B9A6FF' : ORACLE_BY_ID[seat].color;
          const focused = mesa.focusSeat === seat && !!card;
          const faceUp = !!card && card.state !== 'down';
          const kindLabel = card?.kind === 'reveal' ? t('mesa.card.reveal') : t('mesa.card.espelho4');
          return (
            <div key={seat} className="flex flex-col items-center min-w-0">
              {seat === 'espelho' ? <EspelhoSeat kindLabel={kindLabel} /> : <OracleSeat seat={seat} desktop={desktop} dim={passed} />}
              <div className={`relative w-full ${desktop ? 'mt-3' : 'mt-2'}`}>
                {/* O brilho embaixo do assento: luz e informação. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 transition-opacity duration-300"
                  style={{
                    width: '150%',
                    height: desktop ? 70 : 44,
                    bottom: desktop ? -38 : -24,
                    background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${withAlpha(color, focused || faceUp ? 0.22 : 0.1)}, transparent 72%)`,
                  }}
                />
                <div className="relative w-full" style={{ aspectRatio: '196 / 292' }}>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={card ? `${card.id}` : passed ? `passed-${seat}` : `empty-${seat}-${mesa.loading ? 'l' : 'e'}`}
                      className="absolute inset-0"
                      initial={reduced ? false : { opacity: 0, y: -26, scale: 0.94 }}
                      animate={mesa.collecting && !reduced ? { opacity: 0, y: -22, scale: 0.92 } : { opacity: 1, y: 0, scale: 1 }}
                      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -22, scale: 0.92, transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } }}
                      transition={{ duration: mesa.collecting ? 0.24 : 0.28, ease: [0.22, 1, 0.36, 1], delay: mesa.collecting || reduced ? 0 : i * 0.09 }}
                    >
                      {card || passed || mesa.loading || mesa.error ? (
                        <MesaCard
                          seat={seat}
                          card={card}
                          cardStyle={cardStyle}
                          passed={passed}
                          loading={mesa.loading && !card}
                          dim={mesa.error && !card}
                          focused={focused}
                          seal={seat === 'cypher' ? mesa.seal : null}
                          shakeN={mesa.shake?.seat === seat ? mesa.shake.n : 0}
                          seenRating={card ? mesa.seenFlash[card.id] ?? null : null}
                          desktop={desktop}
                          reduced={reduced}
                          flipOnMount={!!card && mesa.flipOnMount.has(card.id)}
                          onFlipMounted={() => card && mesa.consumeFlipOnMount(card.id)}
                          onActivate={() => onActivate(seat)}
                          tabIndex={seat === focusable ? 0 : -1}
                          btnRef={(el) => registerCard(seat, el)}
                          onKeyDown={(e) => onCardKey(seat, e)}
                          espelhoLabel={kindLabel}
                        />
                      ) : null}
                    </motion.div>
                  </AnimatePresence>
                </div>
                {seat === 'cypher' && (
                  <p
                    role="status"
                    className="absolute inset-x-0 text-center text-[12px] transition-opacity duration-200 pointer-events-none"
                    style={{ ...PIXEL, top: 'calc(100% + 6px)', color: '#E2C84A', opacity: mesa.sealHint ? 1 : 0 }}
                  >
                    {mesa.sealHint ? t('mesa.card.sealHint') : ''}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MesaStage;
