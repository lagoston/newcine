import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Lock, Spade } from 'lucide-react';
import { FOCUS_RING, MIST, PAPER, VELVET } from '../../../lib/oracleTheme';
import { equipPokerItem, fetchPokerHome } from '../jackpot/entryApi';
import { CardBack, DeckFan, FeltSwatch } from './CosmeticPreviews';
import { DEFAULT_DECK_ID, DEFAULT_TABLE_ID } from './looks';
import '../../../styles/pokerEntry.css';

// O Grande Blefe no Personalizar perfil (03/11/2026): o verso do baralho e o
// feltro da mesa livre, na aba Cartas (ao lado do estilo das cartas dos
// oráculos, que também aparece na mesa). Os itens e a posse vêm do
// get_poker_home; equipar chama poker_equip (o servidor confere a posse).
// Pôquer fechado para a conta, servidor antigo ou erro: nada aparece.

type Slot = 'deck' | 'table';
interface Item {
  id: string;
  kind: Slot;
  namePt: string;
  nameEn: string;
  owned: boolean;
}
type Row = Record<string, unknown>;

function parseHome(value: unknown): { items: Item[]; loadout: Record<Slot, string> } | null {
  const raw = value && typeof value === 'object' ? (value as Row) : null;
  if (!raw || raw.enabled !== true) return null;
  const items: Item[] = (Array.isArray(raw.items) ? raw.items : [])
    .map((entry) => (entry && typeof entry === 'object' ? (entry as Row) : null))
    .filter((r): r is Row => !!r && typeof r.id === 'string' && (r.kind === 'deck' || r.kind === 'table'))
    .map((r) => ({
      id: r.id as string,
      kind: r.kind as Slot,
      namePt: typeof r.name_pt === 'string' ? r.name_pt : (r.id as string),
      nameEn: typeof r.name_en === 'string' ? r.name_en : (r.id as string),
      owned: r.owned === true || r.is_default === true,
    }));
  const loadout = raw.loadout && typeof raw.loadout === 'object' ? (raw.loadout as Row) : {};
  return {
    items,
    loadout: {
      deck: typeof loadout.deck === 'string' ? loadout.deck : DEFAULT_DECK_ID,
      table: typeof loadout.table === 'string' ? loadout.table : DEFAULT_TABLE_ID,
    },
  };
}

const PokerCosmeticsSection: React.FC<{ open: boolean }> = ({ open }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const [data, setData] = useState<{ items: Item[]; loadout: Record<Slot, string> } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchPokerHome()
      .then((value) => alive && setData(parseHome(value)))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [open]);

  if (!data || !data.items.length) return null;

  const equip = async (item: Item) => {
    if (saving || !item.owned || data.loadout[item.kind] === item.id) return;
    setSaving(item.id);
    try {
      await equipPokerItem(item.kind, item.id);
      setData((prev) => (prev ? { ...prev, loadout: { ...prev.loadout, [item.kind]: item.id } } : prev));
      toast.success(item.kind === 'deck' ? t('pokerEntry.cosmetics.deckUpdated') : t('pokerEntry.cosmetics.tableUpdated'));
    } catch (error) {
      console.error('Poker equip:', error);
      toast.error(t('pokerEntry.cosmetics.equipError'));
    } finally {
      setSaving(null);
    }
  };

  const group = (slot: Slot) => {
    const list = data.items.filter((item) => item.kind === slot);
    if (!list.length) return null;
    return (
      <div className="mt-4">
        <h4 className="text-[14px] font-semibold" style={{ color: PAPER }}>
          {slot === 'deck' ? t('pokerEntry.cosmetics.deck') : t('pokerEntry.cosmetics.table')}
        </h4>
        {slot === 'table' && (
          <p className="mt-0.5 text-[12.5px]" style={{ color: MIST }}>
            {t('pokerEntry.cosmetics.tableHint')}
          </p>
        )}
        <ul className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {list.map((item) => {
            const selected = data.loadout[slot] === item.id;
            const locked = !item.owned;
            const name = isPt ? item.namePt : item.nameEn;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => equip(item)}
                  aria-disabled={locked || undefined}
                  aria-pressed={selected}
                  aria-busy={saving === item.id || undefined}
                  aria-label={[name, selected ? t('customize.inUse') : null, locked ? t('pokerEntry.cosmetics.locked') : null].filter(Boolean).join(' — ')}
                  className={`relative w-full h-full flex flex-col items-stretch justify-start gap-2.5 rounded-2xl p-2 pb-3 text-left ring-1 transition ${FOCUS_RING} ${
                    selected && !locked ? 'ring-2 ring-violet-400/80 bg-violet-500/15' : locked ? 'ring-white/[0.07] cursor-not-allowed' : 'ring-white/10 hover:ring-white/30'
                  }`}
                  style={selected && !locked ? undefined : { background: VELVET }}
                >
                  {slot === 'deck' ? (
                    <FeltSwatch tableId={data.loadout.table} className={`aspect-[4/3] rounded-xl ${locked ? 'opacity-55 saturate-50' : ''} ${saving === item.id ? 'animate-pulse' : ''}`}>
                      <DeckFan deckId={item.id} className="absolute inset-x-[18%] inset-y-[10%]" />
                    </FeltSwatch>
                  ) : (
                    <FeltSwatch tableId={item.id} className={`aspect-[4/3] rounded-xl ${locked ? 'opacity-55 saturate-50' : ''} ${saving === item.id ? 'animate-pulse' : ''}`}>
                      <CardBack deckId={data.loadout.deck} className="absolute left-1/2 top-1/2 w-[26%] -translate-x-[95%] -translate-y-1/2 -rotate-6" />
                      <CardBack deckId={data.loadout.deck} className="absolute left-1/2 top-1/2 w-[26%] -translate-x-[5%] -translate-y-[46%] rotate-6" />
                    </FeltSwatch>
                  )}
                  <span className="px-1 text-[13px] font-medium truncate" style={{ color: PAPER }}>
                    {name}
                  </span>
                  {locked && (
                    <span className="px-1 inline-flex items-center gap-1.5 text-[11px] leading-tight" style={{ color: MIST }}>
                      <Lock className="w-3 h-3 shrink-0" aria-hidden />
                      {t('pokerEntry.cosmetics.locked')}
                    </span>
                  )}
                  {selected && !locked && (
                    <span className="absolute top-3 right-3 z-20 grid place-items-center w-6 h-6 rounded-full bg-violet-500 text-white shadow" aria-hidden>
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <section className="mt-7 pt-5 border-t border-white/[0.07]" aria-labelledby="pe-cosmetics-title">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center w-9 h-9 rounded-xl" style={{ background: 'rgba(244,196,84,0.12)', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.4)' }} aria-hidden>
          <Spade className="w-[18px] h-[18px]" style={{ color: '#FFE8A3' }} />
        </span>
        <div className="min-w-0">
          <h3 id="pe-cosmetics-title" className="text-[16px] font-semibold leading-tight" style={{ color: PAPER }}>
            {t('pokerEntry.name')}
          </h3>
          <p className="text-[12.5px] leading-snug" style={{ color: MIST }}>
            {t('pokerEntry.cosmetics.hint')}
          </p>
        </div>
      </div>
      {group('deck')}
      {group('table')}
    </section>
  );
};

export default PokerCosmeticsSection;
