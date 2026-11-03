import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PIXEL } from '../../../lib/oracleTheme';
import type { PublicEvent } from '../../../lib/poker/types';
import type { TableShow } from '../../../lib/poker/client/display';
import { ORACLE_COLOR } from '../../../lib/poker/client/cosmetics';
import { fmt, type Lang } from '../../../lib/poker/client/format';
import { blindsText, theName, whoName } from '../../../lib/poker/client/narrate';
import type { SpeechItem } from '../../../lib/poker/client/useDirector';

// "Anteriormente em O Grande Blefe…" (05 rodada 2; SPEC §7.8): ao retomar, um
// cartão de série de TV por 3 s resume a mesa — os 4 cacifes em barras, quem
// carrega o prêmio, o nível e quando sobe, os 2 últimos fatos marcantes e uma
// linha do Raposo em voz em off. Um toque fecha. O leitor de tela lê como resumo.

const ORDER = ['human', 'bogart', 'fincher', 'cypher'];

const RecapCard: React.FC<{
  table: TableShow;
  tail: PublicEvent[];
  prizeName: string | null;
  line: SpeechItem | null;
  lang: Lang;
  reduced: boolean;
  onClose: () => void;
}> = ({ table, tail, prizeName, line, lang, reduced, onClose }) => {
  const { t } = useTranslation();
  useEffect(() => {
    const id = window.setTimeout(onClose, reduced ? 6000 : 3600);
    return () => window.clearTimeout(id);
  }, [onClose, reduced]);

  const facts = useMemo(() => {
    const out: string[] = [];
    for (let i = tail.length - 1; i >= 0 && out.length < 2; i--) {
      const e = tail[i];
      if (e.t === 'eliminated' && e.byId)
        out.push(t('poker.recap.eliminated', { hand: e.handNumber, who: theName(t, e.byId), victim: theName(t, e.playerId) }));
      else if (e.t === 'prizeMoved') out.push(t('poker.recap.prizeMoved', { hand: e.handNumber, who: theName(t, e.toId), prize: prizeName ?? '' }));
      else if (e.t === 'prizeCaptured') out.push(t('poker.recap.captured', { hand: e.handNumber, prize: prizeName ?? '' }));
    }
    return out;
  }, [tail, t, prizeName]);

  const seats = ORDER.map((id) => table.seats.find((s) => s.id === id)).filter(Boolean) as TableShow['seats'];
  const max = Math.max(1, ...seats.map((s) => s.stack));
  const lv = table.level;
  const holder = table.prize && !table.prize.captured ? table.prize.holderId : null;

  return (
    <div className="pk-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('poker.recap.title')}>
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-[360px] rounded-[16px] p-4"
        style={{ background: '#050505', boxShadow: '0 0 0 1.5px #F4C454, inset 0 0 0 5px #050505, inset 0 0 0 6px rgba(244,196,84,0.5)' }}
      >
        <h2 className="pk-display text-center text-[17px] font-bold mb-3" style={{ color: '#FFE8A3' }}>
          {t('poker.recap.title')}
        </h2>
        <ul className="grid gap-1.5 mb-3">
          {seats.map((s) => (
            <li key={s.id} className="grid items-center gap-2" style={{ gridTemplateColumns: '64px 1fr 56px' }}>
              <span className="text-[12.5px] truncate" style={{ ...PIXEL, color: ORACLE_COLOR[s.id] }}>{whoName(t, s.id)}</span>
              <span className="h-[8px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }} aria-hidden>
                <span className="block h-full rounded-full" style={{ width: `${(s.stack / max) * 100}%`, background: s.status === 'eliminated' ? '#6b6680' : ORACLE_COLOR[s.id] }} />
              </span>
              <span className="pk-num text-[12.5px] text-right" style={{ color: '#F3EAD3' }}>
                {s.status === 'eliminated' ? t('poker.table.out', s.place ? { place: s.place, count: s.place, ordinal: true } : { place: '' }) : fmt(s.stack, lang)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-center" style={{ color: '#D9D2EA' }}>
          {t('poker.recap.level', { blinds: blindsText(t, lang, lv.sb, lv.bb, lv.ante), count: lv.handsLeft })}
        </p>
        {holder && prizeName && (
          <p className="text-[13px] text-center mt-1" style={{ color: '#D9D2EA' }}>
            {t('poker.recap.holder', { who: theName(t, holder, 'The'), prize: prizeName })}
          </p>
        )}
        {facts.length > 0 && (
          <ul className="mt-3 grid gap-1 text-[13px]" style={{ color: '#F3EAD3' }}>
            {facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        {line && (
          <figure className="mt-3 text-center">
            <blockquote className="text-[13.5px] italic leading-snug" style={{ color: '#FFE8A3' }}>{line.text}</blockquote>
            <figcaption className="mt-1 text-[11.5px]" style={{ ...PIXEL, color: ORACLE_COLOR.fincher }}>{whoName(t, 'fincher')}</figcaption>
          </figure>
        )}
        <p className="mt-3 text-center text-[11.5px]" style={{ color: '#9b94b5' }}>{t('poker.table.tapToSkip')}</p>
      </motion.div>
    </div>
  );
};

export default RecapCard;
