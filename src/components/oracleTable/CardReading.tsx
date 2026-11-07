import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { INK, MIST, PAPER, PIXEL, FOCUS_RING, ORACLE_BY_ID, withAlpha } from '../../lib/oracleTheme';
import type { MesaCard } from '../../lib/mesa/types';
import PredMark from './PredMark';
import ReasonLine from './ReasonLine';
import RatingRuler from './RatingRuler';
import SignedBalloon from './SignedBalloon';
import { EyeMark } from './MesaArt';
import { cardTitle, metaLine, moodName } from './mesaText';

// A leitura (SPEC §2.4), 05/11/2026: a carta aberta. A ordem começa pela voz do
// oráculo: o retrato e "FINCHER · a descoberta"; o comentário selado no balão
// assinado do dono; o título e a meta (o selo pequeno da nota por último); o
// porquê com as provas; as ações; os links. No celular aparece embaixo da
// faixa; no computador, na coluna da direita. A altura mínima é reservada.

interface ReadingProps {
  card: MesaCard | null;
  recon: boolean;
  desktop: boolean;
  reduced: boolean;
  error: boolean;
  loading: boolean;
  rulerOpen: boolean;
  saving: boolean;
  busy: boolean;
  onRetry: () => void;
  onWant: () => void;
  onSeen: () => void;
  onRate: (n: number) => void;
  onCancelRuler: () => void;
  onRefuse: () => void;
  onNotSeen: () => void;
  onDetails: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMore: () => void;
  onAnchor: (ref: { id: number; media_type: 'movie' | 'tv' }) => void;
  sealPending: boolean;
  anyDown: boolean;
}

// Botão de ação da leitura. Desligado, ele parece desligado (QA m7): 45% e
// sem cursor de toque; o "Na sua lista ✓" (done) é um estado, não um botão
// apagado, e fica inteiro.
const Btn = React.forwardRef<HTMLButtonElement, { primary?: boolean; disabled?: boolean; onClick?: () => void; children: React.ReactNode; color: string; done?: boolean }>(({ primary, disabled, onClick, children, color, done }, ref) => (
  <button
    ref={ref}
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`h-11 px-1 rounded-lg text-[13px] font-semibold leading-[1.15] transition-[filter,background-color,opacity] ${FOCUS_RING} disabled:cursor-default ${disabled && !done ? 'opacity-45' : ''}`}
    style={
      primary
        ? { background: PAPER, color: INK, boxShadow: `0 3px 0 ${withAlpha(color, 0.9)}` }
        : done
          ? { background: 'rgba(56,189,248,0.14)', color: '#7DD3FC', boxShadow: 'inset 0 0 0 1px rgba(125,211,252,0.4)' }
          : { background: 'rgba(18,13,34,0.55)', color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.2)' }
    }
  >
    {children}
  </button>
));
Btn.displayName = 'MesaActionButton';

const ReadingBody: React.FC<ReadingProps & { card: MesaCard; lang: string }> = ({ card, lang, desktop, reduced, rulerOpen, saving, busy, ...h }) => {
  const { t } = useTranslation();
  const isEspelho = card.seat === 'espelho';
  const owner = ORACLE_BY_ID[card.title.oracle];
  const headColor = isEspelho ? '#B9A6FF' : owner.color;
  const comment = (lang.startsWith('pt') ? card.comment.pt || card.comment.en : card.comment.en || card.comment.pt) ?? '';
  const title = cardTitle(card.title, lang);
  const role = isEspelho ? (card.kind === 'reveal' ? t('mesa.card.reveal') : t('mesa.card.espelho4')) : t(`mesa.roles.${card.seat}`);
  // "Não vi" (not_seen) só vale nas cartas de reconhecimento e da revelação
  // (o banco recusa nas outras). Uma pergunta feita no modo reconhecimento traz
  // cartas normais, com as ações normais.
  const reconCard = card.kind === 'recon' || card.kind === 'reveal';
  const seenRating = card.my.rating;
  // "Na sua lista ✓" só depois do "Quero ver" desta carta (state 'want'): uma
  // carta que veio da Watchlist ainda pode registrar o "want" (QA m7).
  const inList = card.state === 'want';
  // Esc (ou Cancelar) na régua devolve o foco ao "Já vi" (QA m2).
  const seenBtn = useRef<HTMLButtonElement>(null);
  const wasRuler = useRef(rulerOpen);
  useEffect(() => {
    if (wasRuler.current && !rulerOpen && !saving) window.setTimeout(() => seenBtn.current?.focus({ preventScroll: true }), 0);
    wasRuler.current = rulerOpen;
  }, [rulerOpen, saving]);
  const moreKey = `mesa.actions.more.${card.title.oracle}`;

  return (
    <div className="space-y-3">
      {/* 1. Quem traz a carta. */}
      <div className="flex items-center gap-2 flex-wrap">
        {isEspelho ? <EyeMark size={22} /> : <img src={owner.avatar} alt="" aria-hidden className="w-6 h-6 rounded-full object-cover" style={{ boxShadow: `0 0 0 1.5px ${withAlpha(owner.color, 0.7)}` }} />}
        <p className="text-[13px]">
          <span style={{ ...PIXEL, color: headColor, letterSpacing: '0.04em' }}>{isEspelho ? t('mesa.espelho.name').toUpperCase() : owner.name.toUpperCase()}</span>
          <span style={{ color: MIST }}> · {role}</span>
        </p>
        {reconCard && (
          <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full" style={{ ...PIXEL, color: INK, background: '#86E3CC' }}>
            {t('mesa.card.recon')}
          </span>
        )}
        {card.second_opinion && !reconCard && (
          <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full" style={{ color: MIST, boxShadow: 'inset 0 0 0 1px rgba(189,180,214,0.35)' }}>
            {t('mesa.card.second')}
          </span>
        )}
      </div>

      {/* 2. O comentário selado, no balão do dono (a voz da carta). */}
      {comment && (
        <div>
          {isEspelho && (
            <p className="mb-1.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: MIST }}>
              <img src={owner.avatar} alt="" aria-hidden className="w-4 h-4 rounded-full object-cover" />
              <span style={{ color: owner.color, ...PIXEL }}>{owner.name}</span> {t('mesa.card.ownerSays')}
            </p>
          )}
          <SignedBalloon who={card.title.oracle} text={comment} variant="reading" reduced={reduced} />
        </div>
      )}

      {/* 3. Título e meta, com o selo pequeno por último. */}
      <div>
        <h2 className="leading-[1.1]" style={{ ...PIXEL, color: PAPER, fontSize: desktop ? 24 : 21 }}>
          {title}
        </h2>
        <p className="mt-1 flex items-center gap-2 flex-wrap text-[13px]" style={{ color: MIST }}>
          <span>{metaLine(card.title, t)}</span>
          {seenRating === null && <PredMark pred={card.pred} />}
        </p>
      </div>

      {/* 4. O porquê. */}
      <ReasonLine reason={card.reason} evidence={card.evidence} onAnchor={h.onAnchor} />

      {/* 5. As ações, ou a régua. */}
      {rulerOpen ? (
        <RatingRuler title={title} saving={saving} suggest={card.pred.value} onPick={h.onRate} onCancel={h.onCancelRuler} />
      ) : seenRating !== null ? (
        <p className="text-[14px]" style={{ color: PAPER }}>
          {t('mesa.reading.yourRating', { n: seenRating })}
        </p>
      ) : reconCard ? (
        <div className="grid grid-cols-3 gap-2">
          <Btn ref={seenBtn} primary color={headColor} onClick={h.onSeen} disabled={busy}>
            {t('mesa.actions.seen')}
          </Btn>
          <Btn color={headColor} onClick={h.onWant} disabled={busy || inList} done={inList}>
            {inList ? (
              <span className="inline-flex items-center gap-1">
                {t('mesa.actions.wantDone')} <Check className="w-3.5 h-3.5" aria-hidden />
              </span>
            ) : (
              t('mesa.actions.want')
            )}
          </Btn>
          <Btn color={headColor} onClick={h.onNotSeen} disabled={busy}>
            {t('mesa.actions.notSeen')}
          </Btn>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Btn primary={!inList} done={inList} color={headColor} onClick={h.onWant} disabled={busy || inList}>
            {inList ? (
              <span className="inline-flex items-center gap-1">
                {t('mesa.actions.wantDone')} <Check className="w-3.5 h-3.5" aria-hidden />
              </span>
            ) : (
              t('mesa.actions.want')
            )}
          </Btn>
          <Btn ref={seenBtn} color={headColor} onClick={h.onSeen} disabled={busy}>
            {t('mesa.actions.seen')}
          </Btn>
          <Btn color={headColor} onClick={h.onRefuse} disabled={busy || inList}>
            {t('mesa.actions.refuse')}
          </Btn>
        </div>
      )}

      {/* 6. Os links. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
        <button type="button" onClick={h.onDetails} className={`inline-flex items-center gap-0.5 min-h-[32px] hover:underline underline-offset-4 ${FOCUS_RING}`} style={{ color: PAPER }}>
          {t('mesa.actions.details')} <ChevronRight className="w-3.5 h-3.5" aria-hidden />
        </button>
        <button type="button" onClick={h.onMore} className={`inline-flex items-center gap-0.5 min-h-[32px] hover:underline underline-offset-4 ${FOCUS_RING}`} style={{ color: MIST }}>
          {t(moreKey, { mood: moodName(t, card.title.mood) })} <ChevronRight className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
};

const CardReading: React.FC<ReadingProps> = (props) => {
  const { card, recon, desktop, reduced, error, loading, rulerOpen, saving, busy } = props;
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  if (error) {
    return (
      <div className="pt-4 flex flex-col items-start gap-3">
        <button type="button" onClick={props.onRetry} className={`h-11 px-5 rounded-lg font-semibold ${FOCUS_RING}`} style={{ background: PAPER, color: INK }}>
          {t('mesa.error.retry')}
        </button>
      </div>
    );
  }

  return (
    <section role="region" aria-live="polite" aria-label={t('mesa.reading.aria')} className="relative">
      <AnimatePresence mode="wait" initial={false}>
        {!card ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className={desktop ? 'pt-1' : 'pt-3 text-center'}>
            {desktop && (
              <div className="flex items-center gap-2 mb-5" aria-hidden>
                {(['bogart', 'fincher', 'cypher'] as const).map((o) => (
                  <img key={o} src={ORACLE_BY_ID[o].avatar} alt="" className="w-9 h-9 rounded-full object-cover" style={{ boxShadow: `0 0 0 1.5px ${withAlpha(ORACLE_BY_ID[o].color, 0.7)}`, opacity: loading ? 0.5 : 1 }} />
                ))}
              </div>
            )}
            <p className={desktop ? 'text-[19px] leading-snug' : 'text-[15px]'} style={{ ...(desktop ? PIXEL : {}), color: PAPER, opacity: loading ? 0.6 : 0.92 }}>
              {props.anyDown || loading ? t('mesa.reading.empty') : t('mesa.reading.pick')}
            </p>
            <p className="mt-1.5 text-[13px] leading-snug" style={{ color: MIST }}>
              {t('mesa.reading.midnight')}
            </p>
            {props.sealPending && (
              <p className="mt-1.5 text-[13px] leading-snug" style={{ color: MIST }}>
                {t('mesa.reading.sealNext')}
              </p>
            )}
            {desktop && (
              <p className="mt-8 text-[12px]" style={{ ...PIXEL, color: MIST, opacity: 0.8 }}>
                {t('mesa.kbd')}
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key={card.id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <ReadingBody {...props} card={card} recon={recon} lang={lang} rulerOpen={rulerOpen} saving={saving} busy={busy} desktop={desktop} reduced={reduced} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default CardReading;
