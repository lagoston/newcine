import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { PIXEL } from '../../../lib/oracleTheme';
import type { RivalId } from '../../../lib/poker/types';
import { cardArt, ORACLE_COLOR } from '../../../lib/poker/client/cosmetics';
import { setPokerSettings, SPEEDS, type PokerSettingsLocal } from '../../../lib/poker/client/settings';
import { FALLBACK_QUIPS } from '../../../lib/poker/client/useDirector';
import { langOf } from '../../../lib/poker/client/format';
import HandRanking from '../cards/HandRanking';

const RIVALS: RivalId[] = ['bogart', 'fincher', 'cypher'];

// Folha de baixo genérica da mesa (max-h com rolagem, como no resto do app).
export const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; reduced: boolean }> = ({ title, onClose, children, reduced }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <>
      <div className="pk-scrim" onClick={onClose} aria-hidden />
      <motion.div
        ref={ref}
        tabIndex={-1}
        className="pk-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={reduced ? { opacity: 0 } : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h2 className="pk-display text-[17px] font-bold" style={{ color: '#FFE8A3' }}>{title}</h2>
          <button type="button" className="pk-icon-btn" onClick={onClose} aria-label={'×'}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="pk-sheet-body">{children}</div>
      </motion.div>
    </>
  );
};

// "Estrelando…" (§7.9): as três cartas entram como créditos de abertura (2,4 s, pulável).
export const Starring: React.FC<{ cardStyle: string; onDone: () => void; reduced: boolean }> = ({ cardStyle, onDone, reduced }) => {
  const { t } = useTranslation();
  useEffect(() => {
    const id = window.setTimeout(onDone, 2400);
    return () => window.clearTimeout(id);
  }, [onDone]);
  return (
    <div className="pk-starring" onClick={onDone} role="button" tabIndex={0} aria-label={t('poker.table.skip')} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onDone()}>
      <motion.p
        className="pk-display text-[20px] font-bold"
        style={{ color: '#FFE8A3' }}
        initial={reduced ? false : { opacity: 0, letterSpacing: '0.3em' }}
        animate={{ opacity: 1, letterSpacing: '0.06em' }}
        transition={{ duration: 0.8 }}
      >
        {t('poker.table.starring')}
      </motion.p>
      <div className="pk-starring-cards">
        {RIVALS.map((id, i) => (
          <motion.figure
            key={id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: reduced ? 0 : 0.3 + i * 0.35 }}
          >
            <img src={cardArt(id, cardStyle)} alt="" />
            <figcaption style={{ ...PIXEL, color: ORACLE_COLOR[id], fontSize: 13 }}>{t(`poker.oracles.${id}.short`)}</figcaption>
          </motion.figure>
        ))}
      </div>
      <p className="text-[12.5px]" style={{ color: '#c9c2e0' }}>{t('poker.table.tapToSkip')}</p>
    </div>
  );
};

// A carta inteira ao tocar no retrato (§7.3).
export const CardViewer: React.FC<{ id: RivalId; cardStyle: string; onClose: () => void }> = ({ id, cardStyle, onClose }) => {
  const { t } = useTranslation();
  return (
    <div className="pk-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t(`poker.oracles.${id}.short`)}>
      <motion.img
        src={cardArt(id, cardStyle)}
        alt={t(`poker.oracles.${id}.short`)}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ maxHeight: '78%', maxWidth: '86%', borderRadius: 12, boxShadow: '0 0 0 2px rgba(244,196,84,0.7), 0 40px 80px -30px #000' }}
      />
    </div>
  );
};

// Confirmação em diálogo (alternativa ao "segurar" no teclado e no leitor de tela).
export const ConfirmDialog: React.FC<{ text: string; confirm: string; cancel: string; onYes: () => void; onNo: () => void }> = ({ text, confirm, cancel, onYes, onNo }) => (
  <div className="pk-overlay" role="alertdialog" aria-modal="true" aria-label={text}>
    <div className="w-full max-w-[340px] rounded-2xl p-5 text-center" style={{ background: '#121a52', boxShadow: '0 0 0 1.5px #F4C454' }}>
      <p className="text-[16px] font-bold mb-4" style={{ color: '#F3EAD3' }}>{text}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="pk-cta-ghost" onClick={onNo} autoFocus>{cancel}</button>
        <button type="button" className="pk-cta-gold" style={{ minHeight: 44 }} onClick={onYes}>{confirm}</button>
      </div>
    </div>
  </div>
);

// Réplicas da visita (§7.8): escolhe a provocação e depois o oráculo.
export const QuipPicker: React.FC<{
  onPick: (quipId: string, target: RivalId) => void;
  onClose: () => void;
  alive: RivalId[];
  reduced: boolean;
  quips?: { id: string; pt: string; en: string }[];
}> = ({ onPick, onClose, alive, reduced, quips = FALLBACK_QUIPS }) => {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const [q, setQ] = React.useState<string | null>(null);
  return (
    <Sheet title={q ? t('poker.quips.target') : t('poker.quips.pick')} onClose={onClose} reduced={reduced}>
      {!q ? (
        <div className="grid gap-2">
          {quips.map((x) => (
            <button key={x.id} type="button" className="pk-cta-ghost justify-start text-left" onClick={() => setQ(x.id)}>
              {lang === 'pt' ? x.pt : x.en}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {RIVALS.filter((r) => alive.includes(r)).map((r) => (
            <button key={r} type="button" className="pk-cta-ghost flex-col py-2" style={{ minHeight: 64 }} onClick={() => onPick(q, r)}>
              <span style={{ ...PIXEL, color: ORACLE_COLOR[r] }}>{t(`poker.oracles.${r}.short`)}</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
};

// Menu da mesa (≡): ajustes, roteiro, ranking das mãos, desistir e sair.
export const TableMenu: React.FC<{
  settings: PokerSettingsLocal;
  onClose: () => void;
  onLeave: () => void;
  onForfeit: (() => void) | null;
  log: { id: number; text: string; speaker?: string }[];
  reduced: boolean;
  initial?: 'menu' | 'script' | 'ranking';
}> = ({ settings, onClose, onLeave, onForfeit, log, reduced, initial = 'menu' }) => {
  const { t } = useTranslation();
  const [view, setView] = React.useState<'menu' | 'script' | 'ranking'>(initial);
  const sw = (key: keyof PokerSettingsLocal, label: string) => (
    <div className="pk-row">
      <span className="text-[14.5px]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={!!settings[key]}
        aria-label={label}
        className="pk-switch"
        onClick={() => setPokerSettings({ [key]: !settings[key] } as Partial<PokerSettingsLocal>)}
      />
    </div>
  );
  if (view === 'script')
    return (
      <Sheet title={t('poker.settings.script')} onClose={() => setView('menu')} reduced={reduced}>
        <div className="grid gap-1 text-[14px]" style={{ color: '#D9F2E4' }}>
          {log.length === 0 && <p style={{ color: '#c9c2e0' }}>{t('poker.table.scriptEmpty')}</p>}
          {log.slice(-60).map((l) => (
            <p key={l.id}>{l.speaker ? <b style={{ color: '#FFE8A3' }}>{l.speaker}: </b> : null}{l.text}</p>
          ))}
        </div>
      </Sheet>
    );
  if (view === 'ranking')
    return (
      <Sheet title={t('poker.settings.ranking')} onClose={() => setView('menu')} reduced={reduced}>
        <HandRanking />
      </Sheet>
    );
  return (
    <Sheet title={t('poker.table.menu')} onClose={onClose} reduced={reduced}>
      <div className="pk-row">
        <span className="text-[14.5px]">{t('poker.settings.talk')}</span>
        <span className="pk-seg" role="group" aria-label={t('poker.settings.talk')}>
          {(['all', 'important', 'none'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={settings.talk === k} onClick={() => setPokerSettings({ talk: k })}>
              {t(`poker.settings.talk${k === 'all' ? 'All' : k === 'important' ? 'Important' : 'None'}`)}
            </button>
          ))}
        </span>
      </div>
      <div className="pk-row">
        <span className="text-[14.5px]">{t('poker.settings.speed')}</span>
        <span className="pk-seg" role="group" aria-label={t('poker.settings.speed')}>
          {SPEEDS.map((k) => (
            <button key={k} type="button" aria-pressed={settings.speed === k} onClick={() => setPokerSettings({ speed: k })}>
              {t(`poker.settings.${k}`)}
            </button>
          ))}
        </span>
      </div>
      {sw('effects', t('poker.settings.effects'))}
      {sw('voices', t('poker.settings.voices'))}
      {sw('vibration', t('poker.settings.vibration'))}
      {sw('thermo', t('poker.settings.thermo'))}
      {sw('fourColor', t('poker.settings.fourColor'))}
      {sw('bigCards', t('poker.settings.bigCards'))}
      {sw('leftHanded', t('poker.settings.leftHanded'))}
      {sw('shortcuts', t('poker.settings.shortcuts'))}
      <div className="grid grid-cols-2 gap-2 mt-4">
        <button type="button" className="pk-cta-ghost" onClick={() => setView('script')}>{t('poker.settings.script')}</button>
        <button type="button" className="pk-cta-ghost" onClick={() => setView('ranking')}>{t('poker.settings.ranking')}</button>
      </div>
      <div className="grid gap-2 mt-4">
        <button type="button" className="pk-cta-paper" onClick={onLeave}>{t('poker.leave.confirm')}</button>
        {onForfeit && (
          <button type="button" className="pk-cta-ghost" style={{ color: '#FF8A8F', boxShadow: 'inset 0 0 0 1.5px #E2525C' }} onClick={onForfeit}>
            {t('poker.forfeit.menu')}
          </button>
        )}
      </div>
    </Sheet>
  );
};
