import React from 'react';
import { useTranslation } from 'react-i18next';
import { Film, Tv } from 'lucide-react';
import { FOCUS_RING, MIST, PAPER, PIXEL, VELVET, withAlpha } from '../../lib/oracleTheme';
import { MOODS } from '../../lib/moods';
import type { AcervoMedia } from '../../lib/mesa/types';

// As 9 letras de humor do Acervo (05/11/2026): a mesma letra e a mesma cor do
// código da Persona. No celular, 2 linhas (5 + 4, com Filmes | Séries no fim
// da segunda); no computador, tudo numa linha. Só a letra aparece; o nome do
// humor vem no título da prateleira e no nome acessível de cada botão.
// 09/11/2026: com uma ocasião ligada a grade junta todos os humores, então
// nenhuma letra fica marcada e todas esmaecem um pouco (`off`); tocar numa
// letra tira a ocasião e abre aquela prateleira.

interface MoodPickerProps {
  active: string | null;
  // Uma ocasião está ligada: nenhuma letra marcada.
  off: boolean;
  onSelect: (mood: string) => void;
  // A chave Filmes | Séries mora na mesma faixa (fim da 2ª linha no celular).
  media: AcervoMedia;
  onMedia: (media: AcervoMedia) => void;
}

const LetterButton: React.FC<{ moodKey: string; active: boolean; off: boolean; onSelect: (mood: string) => void }> = ({ moodKey, active, off, onSelect }) => {
  const { t } = useTranslation();
  const mood = MOODS.find((m) => m.key === moodKey)!;
  const name = t(mood.labelKey);
  return (
    <button
      type="button"
      onClick={() => onSelect(mood.key)}
      aria-pressed={active}
      aria-label={t('acervo.moodAria', { mood: name })}
      title={name}
      className={`relative grid place-items-center w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-[10px] sm:rounded-xl transition-[background-color,box-shadow,transform,opacity] duration-150 ${FOCUS_RING} ${
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
      className="inline-flex items-center h-11 sm:h-12 p-1 rounded-xl shrink-0"
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
            className={`inline-flex items-center gap-1.5 h-full px-2 sm:px-3 rounded-lg text-[13px] sm:text-sm font-medium whitespace-nowrap transition-colors ${FOCUS_RING} ${on ? '' : 'hover:bg-white/[0.06]'}`}
            style={{ color: on ? PAPER : MIST, background: on ? 'rgba(243,234,211,0.12)' : undefined }}
          >
            {/* Ícone só do tablet para cima: no celular a chave divide a linha com 4 letras. */}
            <Icon className="hidden sm:block w-4 h-4 shrink-0" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
};

const MoodPicker: React.FC<MoodPickerProps> = ({ active, off, onSelect, media, onMedia }) => {
  const first = MOODS.slice(0, 5);
  const second = MOODS.slice(5);
  // Larguras conferidas a 360 px (328 úteis): 4 letras de 44 + 3 vãos de 6 =
  // 194, e a chave sem ícones (só texto, 13 px) cabe nos 128 que sobram.
  return (
    <div className="flex flex-col gap-1.5 sm:gap-2 lg:flex-row lg:items-center">
      <div className="flex gap-1.5 sm:gap-2">
        {first.map((m) => (
          <LetterButton key={m.key} moodKey={m.key} active={!off && m.key === active} off={off} onSelect={onSelect} />
        ))}
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 lg:flex-1">
        {second.map((m) => (
          <LetterButton key={m.key} moodKey={m.key} active={!off && m.key === active} off={off} onSelect={onSelect} />
        ))}
        <span className="flex-1" aria-hidden />
        <MediaToggle media={media} onMedia={onMedia} />
      </div>
    </div>
  );
};

export default MoodPicker;
