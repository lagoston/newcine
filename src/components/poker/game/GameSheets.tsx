import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import type { PokerHome } from '../../../lib/poker/client/apiTypes';
import { pokerApi } from '../../../lib/poker/client/api';
import { setPokerSettings, SPEEDS, usePokerSettings, type PokerSettingsLocal } from '../../../lib/poker/client/settings';
import { invalidatePokerHome } from '../../../lib/poker/client/usePokerHome';
import { BLEFE_ROUTES } from '../jackpot/pokerMeta';
import { CardBack, FeltSwatch } from '../cosmetics/CosmeticPreviews';
import HandRanking from '../cards/HandRanking';
import { Sheet } from '../table/Overlays';
import Layer from './PpLayer';
import '../../../styles/poker.css';

// As folhas da tela título do Pôster Poker (03/11/2026): Configurações (velocidade,
// falas, sons, vibração e, para quem tem, o baralho e a mesa) e Como jogar (as 3
// mãos de treino que já existiam e o ranking das mãos).

// As folhas ficam no body, por cima da barra do celular (PpLayer, 03/11/2026, fase 3).

export const SettingsSheet: React.FC<{ home: PokerHome; reduced: boolean; onClose: () => void }> = ({ home, reduced, onClose }) => {
  const { t } = useTranslation();
  const settings = usePokerSettings();
  const [loadout, setLoadout] = useState(home.loadout ?? { deck: 'deck-classico', table: 'table-feltro-verde', quips: 'quips-padrao' });
  const [equipping, setEquipping] = useState<string | null>(null);
  const owned = new Set(['deck-classico', 'table-feltro-verde', ...(home.owned_items ?? [])]);
  const decks = ['deck-classico', 'deck-noir'].filter((id) => owned.has(id));
  const tables = ['table-feltro-verde', 'table-meia-noite'].filter((id) => owned.has(id));

  const equip = async (slot: 'deck' | 'table', id: string) => {
    setEquipping(id);
    try {
      await pokerApi.equip(slot, id);
      setLoadout((l) => ({ ...l, [slot]: id }));
      invalidatePokerHome();
    } catch {
      toast.error(t('poker.credits.equipFailed'));
    } finally {
      setEquipping(null);
    }
  };

  const sw = (key: keyof PokerSettingsLocal, label: string, hint?: string) => (
    <div className="pk-row">
      <span className="min-w-0">
        <span className="block text-[14.5px]">{label}</span>
        {hint && <span className="block text-[12px]" style={{ color: '#B9B1D3' }}>{hint}</span>}
      </span>
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

  return (
    <Layer>
      <Sheet title={t('poker.game.settings')} onClose={onClose} reduced={reduced}>
        <div className="pk-row pk-row-stack">
          <span className="text-[14.5px]">{t('poker.settings.speed')}</span>
          <span className="pk-seg pk-seg-full" role="group" aria-label={t('poker.settings.speed')}>
            {SPEEDS.map((k) => (
              <button key={k} type="button" aria-pressed={settings.speed === k} onClick={() => setPokerSettings({ speed: k })}>
                {t(`poker.settings.${k}`)}
              </button>
            ))}
          </span>
          <span className="text-[12px]" style={{ color: '#B9B1D3' }}>{t(`poker.game.speedHint.${settings.speed}`)}</span>
        </div>
        <div className="pk-row pk-row-stack">
          <span className="text-[14.5px]">{t('poker.settings.talk')}</span>
          <span className="pk-seg pk-seg-full" role="group" aria-label={t('poker.settings.talk')}>
            {(['all', 'important', 'none'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={settings.talk === k} onClick={() => setPokerSettings({ talk: k })}>
                {t(`poker.settings.talk${k === 'all' ? 'All' : k === 'important' ? 'Important' : 'None'}`)}
              </button>
            ))}
          </span>
        </div>
        {sw('effects', t('poker.game.sounds'))}
        {sw('voices', t('poker.settings.voices'))}
        {sw('vibration', t('poker.settings.vibration'))}
        {sw('thermo', t('poker.settings.thermo'))}
        {sw('fourColor', t('poker.settings.fourColor'))}
        {sw('bigCards', t('poker.settings.bigCards'))}
        {sw('leftHanded', t('poker.settings.leftHanded'))}

        {/* Baralho e mesa: só quando a pessoa tem mais de um (o Noir e o Meia-Noite estão guardados). */}
        {(decks.length > 1 || tables.length > 1) && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[...(decks.length > 1 ? decks.map((id) => ['deck', id] as const) : []), ...(tables.length > 1 ? tables.map((id) => ['table', id] as const) : [])].map(([slot, id]) => {
              const on = (slot === 'deck' ? loadout.deck : loadout.table) === id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={on || !!equipping}
                  onClick={() => equip(slot, id)}
                  className="rounded-[14px] p-3 grid gap-2 justify-items-center text-[13.5px] font-bold"
                  style={{ background: 'rgba(255,255,255,0.05)', boxShadow: on ? 'inset 0 0 0 2px #F4C454' : 'inset 0 0 0 1px rgba(243,234,211,0.2)' }}
                  aria-pressed={on}
                >
                  {slot === 'deck' ? <CardBack deckId={id} className="w-[46%]" /> : <FeltSwatch tableId={id} className="w-full aspect-[4/3] rounded-[10px]" />}
                  <span>{t(`poker.items.${id}`)}</span>
                  <span className="text-[12px] font-normal" style={{ color: '#c9c2e0' }}>
                    {equipping === id ? <Loader2 className="w-4 h-4 animate-spin" /> : on ? t('poker.lobby.inUse') : t('poker.credits.equip')}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-[12.5px]" style={{ color: '#B9B1D3' }}>{t('poker.game.settingsNote')}</p>
      </Sheet>
    </Layer>
  );
};

export const HowToSheet: React.FC<{ reduced: boolean; onClose: () => void }> = ({ reduced, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Layer>
      <Sheet title={t('poker.lobby.howTo')} onClose={onClose} reduced={reduced}>
        <p className="text-[14px] mb-2" style={{ color: '#D9D2EA' }}>{t('poker.game.howToBody')}</p>
        <p className="text-[14px] mb-3" style={{ color: '#D9D2EA' }}>{t('poker.game.howToModes')}</p>
        <button type="button" className="pk-cta-paper mb-4" onClick={() => navigate(BLEFE_ROUTES.training)}>
          {t('poker.lobby.teachMe')}
        </button>
        <HandRanking />
      </Sheet>
    </Layer>
  );
};
