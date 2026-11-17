import React from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Check, Hand, RotateCcw, RotateCw } from 'lucide-react';
import { FOCUS_RING, INK, MIST, PAPER, PIXEL } from '../../lib/oracleTheme';
import type { Portrait } from './draw';
import type { ItemId } from './studio';

// O inventário do "Arrumar o estúdio" (17/11/2026). Pedido do Bruno: "Adicione
// um inventário quando clicamos em arrumar estúdio, para que seja possível
// revisar os itens que temos, trocá-los e inseri-los [...] Adicione uma opção
// para poder girar os objetos do estúdio também."
//
// Embaixo da cena, arrumando: o passo de agora, os objetos que a pessoa tem
// (na sala, com o número do lugar, ou guardados), o que fazer com o objeto
// pego (girar, guardar, soltar), os fixos do cinema e os botões de sempre
// (Salvar, Cancelar, Voltar ao padrão). Pegar funciona dos dois jeitos: na
// cena ou aqui. Com um objeto guardado na mão, tocar num lugar da sala põe
// ele ali (num lugar ocupado, quem estava vai para o inventário).
//
// Cada objeto aparece no próprio desenho do estúdio (studioPortrait), no
// sentido em que está, ampliado em escala inteira como a cena.

export interface InventoryItem {
  id: ItemId;
  // o número do lugar na sala (1, 2…), ou null quando está guardado
  place: number | null;
  turned: boolean;
  storable: boolean;
  portrait: Portrait | null;
}

interface Props {
  items: InventoryItem[];
  picked: ItemId | null;
  // o que está fixo no cinema (não sai do lugar): os nomes, já escritos
  fixed: string[];
  // um aviso curto (ex.: a máquina não vai para o inventário)
  notice: string | null;
  saving: boolean;
  onPick: (id: ItemId) => void;
  onTurn: () => void;
  onStore: () => void;
  onDrop: () => void;
  onSave: () => void;
  onCancel: () => void;
  onReset: () => void;
}

const GOLD = '#F4C454';
const GHOST = `inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition disabled:opacity-50 ${FOCUS_RING}`;
const SMALL = `inline-flex items-center justify-center gap-1.5 h-10 min-h-0 px-3.5 rounded-xl text-[13px] font-semibold transition disabled:opacity-40 ${FOCUS_RING}`;

// a maior escala inteira em que o desenho cabe na caixa da peça
const fitScale = (portrait: Portrait, boxW: number, boxH: number) => Math.max(1, Math.min(3, Math.floor(Math.min(boxW / portrait.w, boxH / portrait.h))));

const StudioInventory: React.FC<Props> = ({ items, picked, fixed, notice, saving, onPick, onTurn, onStore, onDrop, onSave, onCancel, onReset }) => {
  const { t } = useTranslation();
  const name = (id: ItemId) => t(`studio.inventory.names.${id}`);
  const pickedItem = items.find((item) => item.id === picked) ?? null;
  const stored = items.filter((item) => item.place === null).length;
  const step = pickedItem
    ? pickedItem.place === null
      ? t('studio.arrange.stepPlaceStored', { item: t(`studio.items.${pickedItem.id}`) })
      : t('studio.arrange.stepPlace', { item: t(`studio.items.${pickedItem.id}`) })
    : t('studio.arrange.stepPick');

  return (
    <div className="rounded-2xl p-3.5 sm:p-4 space-y-4" style={{ background: 'rgba(244,196,84,0.08)', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.45)' }}>
      <p className="text-[14px] leading-snug" style={{ color: PAPER }} aria-live="polite">
        {step}
      </p>

      {/* o objeto na mão: girar, guardar, soltar */}
      {pickedItem && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onTurn} className={SMALL} style={{ background: GOLD, color: INK }}>
            <RotateCw className="w-4 h-4" aria-hidden />
            {t('studio.inventory.turn')}
          </button>
          {pickedItem.place !== null && pickedItem.storable && (
            <button type="button" onClick={onStore} className={SMALL} style={{ color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.3)' }}>
              <Archive className="w-4 h-4 text-violet-300" aria-hidden />
              {t('studio.inventory.store')}
            </button>
          )}
          <button type="button" onClick={onDrop} className={SMALL} style={{ color: MIST }}>
            <Hand className="w-4 h-4" aria-hidden />
            {t('studio.inventory.drop')}
          </button>
          {pickedItem.place !== null && !pickedItem.storable && (
            <span className="text-xs leading-snug" style={{ color: MIST }}>
              {t('studio.inventory.keep')}
            </span>
          )}
        </div>
      )}
      {notice && (
        <p className="text-xs leading-snug" style={{ color: '#FDE68A' }} role="status">
          {notice}
        </p>
      )}

      {/* o inventário */}
      <section aria-labelledby="studio-inventory-title">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="studio-inventory-title" style={{ ...PIXEL, color: PAPER }} className="text-[15px] leading-none">
            {t('studio.inventory.title')}
          </h3>
          <span className="text-xs tabular-nums" style={{ color: MIST }}>
            {t('studio.inventory.objects', { count: items.length })}
            {stored > 0 && ` · ${t('studio.inventory.storedCount', { count: stored })}`}
          </span>
        </div>
        <ul className="mt-2.5 grid grid-cols-3 min-[420px]:grid-cols-4 sm:grid-cols-6 gap-2">
          {items.map((item) => {
            const active = item.id === picked;
            const scale = item.portrait ? fitScale(item.portrait, 88, 80) : 1;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onPick(item.id)}
                  aria-pressed={active}
                  className={`relative w-full h-full flex flex-col items-center justify-end gap-1 rounded-xl px-1 pt-2 pb-1.5 text-center transition ${FOCUS_RING}`}
                  style={{
                    background: active ? 'rgba(244,196,84,0.18)' : item.place === null ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.05)',
                    boxShadow: active ? `inset 0 0 0 2px ${GOLD}` : item.place === null ? 'inset 0 0 0 1px rgba(243,234,211,0.2)' : 'inset 0 0 0 1px rgba(243,234,211,0.08)',
                  }}
                >
                  <span className="grid place-items-end justify-center h-[80px] w-full" aria-hidden>
                    {item.portrait && (
                      <img
                        src={item.portrait.src}
                        alt=""
                        width={item.portrait.w * scale}
                        height={item.portrait.h * scale}
                        style={{ imageRendering: 'pixelated', opacity: item.place === null && !active ? 0.75 : 1 }}
                      />
                    )}
                  </span>
                  <span className="block w-full text-[12px] font-semibold leading-tight line-clamp-2" style={{ color: PAPER }}>
                    {name(item.id)}
                  </span>
                  <span className="block text-[11px] leading-tight" style={{ color: item.place === null ? '#C4B5FD' : MIST }}>
                    {item.place === null ? t('studio.inventory.stored') : t('studio.inventory.place', { no: item.place })}
                    {item.turned && <span className="sr-only">, {t('studio.inventory.turned')}</span>}
                  </span>
                  {item.turned && (
                    <RotateCw className="absolute top-1.5 right-1.5 w-3 h-3" style={{ color: MIST }} aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {fixed.length > 0 && (
          <p className="mt-2.5 text-xs leading-relaxed" style={{ color: MIST }}>
            <span className="font-semibold" style={{ color: PAPER }}>
              {t('studio.inventory.fixed')}
            </span>{' '}
            {fixed.join(', ')}
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold transition disabled:opacity-60 ${FOCUS_RING}`}
          style={{ background: GOLD, color: INK }}
        >
          <Check className="w-[18px] h-[18px]" aria-hidden />
          {saving ? t('studio.arrange.saving') : t('studio.arrange.save')}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={GHOST} style={{ color: PAPER }}>
          {t('studio.arrange.cancel')}
        </button>
        <button type="button" onClick={onReset} disabled={saving} className={GHOST} style={{ color: PAPER }}>
          <RotateCcw className="w-[16px] h-[16px] text-violet-300" aria-hidden />
          {t('studio.arrange.reset')}
        </button>
      </div>
    </div>
  );
};

export default StudioInventory;
