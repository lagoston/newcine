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
import { mixHex } from './mentorArt';

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
// 25/11/2026 (o Acervo como salão dos mentores; pedido do Bruno: a pegada
// "mitológica, hotel habboolística, da dungeons and dragons", e "As ordens das
// prateleiras devem se adaptar"):
//   • a ordem agora é a do MENTOR escolhido para esta pessoa (a primeira runa
//     é a prateleira que ele veste; lib/oracleAffinity.ts). Quem monta a ordem
//     é a página; sem a resposta do banco, continua a ordem da Persona;
//   • cada casa virou uma pedra de runa: cantos cortados, a borda na cor da
//     prateleira e a letra entalhada. O tamanho, o lugar e o que cada toque
//     faz são os mesmos de antes.
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

// A pedra de runa: duas camadas com os cantos cortados (a borda e a face). O
// corte fica nas camadas, e não no botão, para o anel de foco do teclado não
// ser cortado junto.
const cut = (n: number) =>
  `polygon(${n}px 0, calc(100% - ${n}px) 0, 100% ${n}px, 100% calc(100% - ${n}px), calc(100% - ${n}px) 100%, ${n}px 100%, 0 calc(100% - ${n}px), 0 ${n}px)`;
const STONE_EDGE = cut(5);
const STONE_FACE = cut(4);

const Stone: React.FC<{ edge: string; face: string }> = ({ edge, face }) => (
  <>
    <span aria-hidden className="absolute inset-0 transition-colors duration-150" style={{ background: edge, clipPath: STONE_EDGE }} />
    <span
      aria-hidden
      className="absolute inset-[2px] transition-colors duration-150"
      style={{ background: face, clipPath: STONE_FACE, boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.3), inset 0 2px 0 rgba(255,255,255,0.07)' }}
    />
  </>
);

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
      className={`relative grid place-items-center ${LETTER_SIZE} shrink-0 rounded-[8px] transition-[box-shadow,transform,opacity] duration-150 ${FOCUS_RING} ${
        active ? '' : 'hover:-translate-y-0.5 hover:opacity-100 motion-reduce:hover:translate-y-0'
      }`}
      style={{
        ...PIXEL,
        color: mood.color,
        opacity: off ? 0.55 : 1,
        // a runa escolhida acende
        boxShadow: active ? `0 0 16px -5px ${withAlpha(mood.color, 0.9)}` : undefined,
      }}
    >
      <Stone edge={active ? mood.color : mixHex(VELVET, mood.color, off ? 0.26 : 0.42)} face={active ? mixHex(VELVET, mood.color, 0.26) : VELVET} />
      <span aria-hidden className="relative text-[24px] sm:text-[26px] leading-none" style={{ textShadow: '0 2px 0 rgba(0,0,0,0.45)' }}>
        {mood.glyph}
      </span>
    </button>
  );
};

// A casa de uma letra que ainda não chegou (a ordem vem do servidor).
const EmptySlot: React.FC = () => (
  <span aria-hidden className={`relative ${LETTER_SIZE} shrink-0`} style={{ opacity: 0.45 }}>
    <Stone edge={VELVET} face={VELVET} />
  </span>
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
      className={`relative grid place-items-center ${LETTER_SIZE} shrink-0 rounded-[8px] transition-[box-shadow,transform] duration-150 ${FOCUS_RING} ${
        on || open ? '' : 'hover:-translate-y-0.5 motion-reduce:hover:translate-y-0'
      }`}
      style={on ? { color: INK, boxShadow: '0 6px 18px -10px rgba(243,234,211,0.7)' } : { color: PAPER }}
    >
      {/* a mesma pedra das runas, em papel (é a casa das ocasiões, não uma prateleira) */}
      <Stone edge={on ? PAPER : mixHex(VELVET, PAPER, open ? 0.6 : 0.3)} face={on ? PAPER : open ? mixHex(VELVET, PAPER, 0.12) : VELVET} />
      <Icon className="relative w-5 h-5 sm:w-[22px] sm:h-[22px]" aria-hidden />
      <ChevronDown
        className={`absolute bottom-[4px] right-[5px] w-2.5 h-2.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
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
