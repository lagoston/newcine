import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Film, Theater, Tv } from 'lucide-react';
import { FOCUS_RING, INK, MIST, PAPER, PIXEL, VELVET, withAlpha } from '../../lib/oracleTheme';
import { MOOD_BY_KEY } from '../../lib/moods';
import type { AcervoMedia, AcervoOccasion } from '../../lib/mesa/types';
import { OCCASION_ICON } from './occasions';
import OccasionPanel from './OccasionPanel';
import { useLayerEntry } from './layerStack';

// As 9 letras de humor do Acervo (05/11/2026): a mesma letra e a mesma cor do
// código da Persona. No celular, 2 linhas (5 + 5, com Filmes | Séries no fim
// da segunda); no computador, tudo numa linha. Só a letra aparece; o nome do
// humor vem no título da prateleira e no nome acessível de cada botão.
// 09/11/2026: com uma ocasião ligada a grade junta todos os humores, então
// nenhuma letra fica marcada e todas esmaecem um pouco (`off`); tocar numa
// letra tira a ocasião e abre aquela prateleira.
//
// 13/11/2026, pedidos do Bruno:
//   • "a ordem com que aparecem as 9 categorias para que fiquem na ordem da
//     personalidade do usuário": a ordem vem de useMoodOrder (as três letras
//     do código da Persona, depois as outras da mais usada para a menos);
//     enquanto a primeira resposta não chega, as casas ficam vazias;
//   • "No espaço vazio que teria a décima categoria, adicione um botão que
//     deve conter todos os 'só eu e a chuva', 'Em família' etc.": a décima casa
//     é o botão das ocasiões (a sala de cinema, cortina e poltronas; a pipoca
//     parecia uma lixeira nesse tamanho. Com uma ocasião ligada, o ícone dela,
//     em papel). Ele abre, logo abaixo das letras, o painel com todas as fichas
//     (OccasionPanel), que antes ficavam numa fileira à parte.
//
// Larguras conferidas no celular (5 casas + Filmes | Séries na 2ª linha):
//   • 412 px ou mais (380 úteis): casas de 44 → 5 × 44 + 4 × 6 = 244, mais a
//     chave com texto (~122) e o vão de 6;
//   • de 390 a 411 px: casas de 40 → 224 + 6 + 122 = 352 em 358;
//   • abaixo de 390 px: casas de 40 e a chave só com os ícones (~72).
// (Os botões da chave não seguem o mínimo de 44 px de altura do index.css: a
// chave inteira é que tem a altura de uma casa.)

// O min-w/min-h 0 desfaz, só no celular estreito, o mínimo de 44 px que o
// index.css dá a todo botão (senão a casa de 40 continuaria com 44).
const LETTER_SIZE = 'w-11 h-11 max-[411px]:w-10 max-[411px]:h-10 max-[411px]:min-w-0 max-[411px]:min-h-0 sm:w-12 sm:h-12';

interface MoodPickerProps {
  // A ordem das 9 letras (null: ainda chegando).
  order: string[] | null;
  active: string | null;
  // Uma ocasião está ligada: nenhuma letra marcada.
  off: boolean;
  onSelect: (mood: string) => void;
  // A chave Filmes | Séries mora na mesma faixa (fim da 2ª linha no celular).
  media: AcervoMedia;
  onMedia: (media: AcervoMedia) => void;
  // As ocasiões (o botão da décima casa e o painel dele).
  occasions: AcervoOccasion[];
  occasion: string | null;
  onOccasion: (id: string | null) => void;
}

const LetterButton: React.FC<{ moodKey: string; active: boolean; off: boolean; onSelect: (mood: string) => void }> = ({ moodKey, active, off, onSelect }) => {
  const { t } = useTranslation();
  const mood = MOOD_BY_KEY[moodKey];
  if (!mood) return null;
  const name = t(mood.labelKey);
  return (
    <button
      type="button"
      onClick={() => onSelect(mood.key)}
      aria-pressed={active}
      aria-label={t('acervo.moodAria', { mood: name })}
      title={name}
      className={`relative grid place-items-center ${LETTER_SIZE} shrink-0 rounded-[10px] sm:rounded-xl transition-[background-color,box-shadow,transform,opacity] duration-150 ${FOCUS_RING} ${
        active ? '' : 'hover:-translate-y-0.5 hover:opacity-100 motion-reduce:hover:translate-y-0'
      }`}
      style={{
        ...PIXEL,
        color: mood.color,
        opacity: off ? 0.55 : 1,
        background: active ? withAlpha(mood.color, 0.2) : VELVET,
        boxShadow: active
          ? `inset 0 0 0 2px ${mood.color}, 0 0 18px -6px ${withAlpha(mood.color, 0.8)}`
          : `inset 0 0 0 1.5px ${withAlpha(mood.color, off ? 0.22 : 0.35)}`,
      }}
    >
      <span aria-hidden className="text-[24px] sm:text-[26px] leading-none">
        {mood.letter}
      </span>
    </button>
  );
};

// A casa de uma letra que ainda não chegou (a ordem vem do servidor).
const EmptySlot: React.FC = () => (
  <span aria-hidden className={`${LETTER_SIZE} shrink-0 rounded-[10px] sm:rounded-xl`} style={{ background: VELVET, opacity: 0.45 }} />
);

export const MediaToggle: React.FC<{ media: AcervoMedia; onMedia: (media: AcervoMedia) => void }> = ({ media, onMedia }) => {
  const { t } = useTranslation();
  const options: { value: AcervoMedia; label: string; Icon: typeof Film }[] = [
    { value: 'movie', label: t('acervo.movies'), Icon: Film },
    { value: 'tv', label: t('acervo.series'), Icon: Tv },
  ];
  return (
    <div
      role="group"
      aria-label={`${t('acervo.movies')} | ${t('acervo.series')}`}
      className="ml-auto inline-flex items-center h-11 max-[411px]:h-10 sm:h-12 p-1 rounded-xl shrink-0"
      style={{ boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.16)' }}
    >
      {options.map(({ value, label, Icon }) => {
        const on = media === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onMedia(value)}
            aria-pressed={on}
            aria-label={label}
            title={label}
            className={`inline-flex items-center gap-1.5 h-full min-h-0 max-[389px]:min-w-0 px-2 max-[411px]:px-[7px] sm:px-3 rounded-lg text-[13px] sm:text-sm font-medium whitespace-nowrap transition-colors ${FOCUS_RING} ${on ? '' : 'hover:bg-white/[0.06]'}`}
            style={{ color: on ? PAPER : MIST, background: on ? 'rgba(243,234,211,0.12)' : undefined }}
          >
            {/* Ícone abaixo de 390 px (lá a chave é só ícone) e do tablet para
                cima; no meio, só o texto. */}
            <Icon className="hidden max-[389px]:block sm:block w-4 h-4 shrink-0" aria-hidden />
            <span className="max-[389px]:hidden">{label}</span>
          </button>
        );
      })}
    </div>
  );
};

// O botão das ocasiões, na décima casa.
const OccasionsButton = React.forwardRef<
  HTMLButtonElement,
  { open: boolean; occasion: string | null; panelId: string; onToggle: (fromKeyboard: boolean) => void }
>(({ open, occasion, panelId, onToggle }, ref) => {
  const { t } = useTranslation();
  const ActiveIcon = occasion ? OCCASION_ICON[occasion] : null;
  const Icon = ActiveIcon ?? Theater;
  const on = Boolean(occasion);
  const label = occasion ? t('acervo.occasionsButtonActive', { name: t(`mesa.occasions.${occasion}.name`) }) : t('acervo.occasionsLabel');
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => onToggle(e.detail === 0)}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      aria-label={label}
      title={label}
      className={`relative grid place-items-center ${LETTER_SIZE} shrink-0 rounded-[10px] sm:rounded-xl transition-[background-color,box-shadow,transform] duration-150 ${FOCUS_RING} ${
        on || open ? '' : 'hover:-translate-y-0.5 motion-reduce:hover:translate-y-0'
      }`}
      style={
        on
          ? { background: PAPER, color: INK, boxShadow: '0 6px 18px -10px rgba(243,234,211,0.7)' }
          : {
              background: open ? 'rgba(243,234,211,0.1)' : VELVET,
              color: PAPER,
              boxShadow: `inset 0 0 0 1.5px rgba(243,234,211,${open ? 0.55 : 0.24})`,
            }
      }
    >
      <Icon className="w-5 h-5 sm:w-[22px] sm:h-[22px]" aria-hidden />
      <ChevronDown
        className={`absolute bottom-[3px] right-[3px] w-2.5 h-2.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        style={{ color: on ? INK : MIST, opacity: 0.8 }}
        aria-hidden
      />
    </button>
  );
});
OccasionsButton.displayName = 'OccasionsButton';

const PANEL_ID = 'acervo-occasions';

const MoodPicker: React.FC<MoodPickerProps> = ({ order, active, off, onSelect, media, onMedia, occasions, occasion, onOccasion }) => {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusPanel = useRef(false);

  // Fecha o painel; se o foco estava nele, volta para o botão.
  const close = useCallback(() => {
    const inside = panelRef.current?.contains(document.activeElement) ?? false;
    setOpen(false);
    if (inside) buttonRef.current?.focus({ preventScroll: true });
  }, []);

  // O Esc fecha o painel antes de sair do Acervo (pilha de camadas). Sem
  // entrada no histórico: o painel é parte da página, não uma gaveta, e a
  // troca de filtro reescreve a URL na mesma hora em que ele fecha.
  useLayerEntry(open, close, { history: false });

  // Tocar fora (numa letra, num pôster) fecha.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Aberto pelo teclado: o foco entra na ficha ligada (ou na primeira).
  useEffect(() => {
    if (!open || !focusPanel.current) return;
    focusPanel.current = false;
    const id = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      const target = panel?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? panel?.querySelector<HTMLElement>('button');
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const toggle = (fromKeyboard: boolean) => {
    if (open) {
      setOpen(false);
      return;
    }
    focusPanel.current = fromKeyboard;
    setOpen(true);
  };

  const choose = (id: string | null) => {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
    onOccasion(id);
  };

  const slots: React.ReactNode[] = order
    ? order.map((key) => <LetterButton key={key} moodKey={key} active={!off && key === active} off={off} onSelect={onSelect} />)
    : Array.from({ length: 9 }, (_, i) => <EmptySlot key={`empty:${i}`} />);

  return (
    <div ref={wrapRef}>
      <div className="flex flex-col gap-1.5 sm:gap-2 lg:flex-row lg:items-center">
        <div className="flex gap-1.5 sm:gap-2">{slots.slice(0, 5)}</div>
        <div className="flex items-center gap-1.5 sm:gap-2 lg:flex-1">
          {slots.slice(5)}
          <OccasionsButton ref={buttonRef} open={open} occasion={occasion} panelId={PANEL_ID} onToggle={toggle} />
          <MediaToggle media={media} onMedia={onMedia} />
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="occasions"
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div ref={panelRef} className="pt-3">
              <OccasionPanel id={PANEL_ID} occasions={occasions} active={occasion} onSelect={choose} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MoodPicker;
