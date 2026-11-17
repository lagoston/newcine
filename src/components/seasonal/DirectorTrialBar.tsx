import React, { useState } from 'react';
import { Clapperboard, Loader2, RotateCcw, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { requestSeasonalRefresh } from '../../contexts/SeasonalEventContext';
import { FOCUS_RING, MIST, PAPER, withAlpha } from '../../lib/oracleTheme';
import { BRASS, useDirectorLang } from '../../lib/directorUi';
import type { SeasonalEventState, SeasonalStep, SeasonalTheme } from '../../lib/seasonalEvents';

// O ensaio dos eventos da Conta Diretor (17/11/2026). Pedido do Bruno: "não
// consigo completar a missão de Natal para testar porque não posso ter amigos
// com ele [...] Tentei avaliar um filme para completar a primeira missão de
// Halloween e também não funcionou".
//
// Com a prévia de um evento fora do ar, o banco devolve o estado do ensaio
// (is_trial): avaliar, resenhar e pôr na Watchlist filmes da lista conta só ali
// e a comemoração aparece, sem tag nenhuma gravada. Aqui ficam os dois botões
// que só o diretor vê no painel do evento:
//   • "Marcar como feita", na missão em andamento. É o caminho do sussurro do
//     Natal: a conta escondida não tem amigos (um sussurro a revelaria);
//   • "Recomeçar o ensaio", no pé do painel: tudo volta para o zero.
// Os textos ficam aqui, em pt e en, como nas outras telas do diretor.

const COPY = {
  pt: {
    badge: 'Ensaio',
    mark: 'Marcar como feita',
    markWhisper: 'Sussurrar pede um amigo, e esta conta não tem: marque à mão.',
    reset: 'Recomeçar o ensaio',
    resetConfirm: 'Tocar de novo recomeça',
    note: 'Ensaio do diretor: o que você faz com os filmes da lista vale só aqui, nesta conta, e nenhuma tag é concedida. A comemoração aparece como no evento de verdade.',
    errors: {
      event_live: 'O evento está no ar: vale o evento de verdade.',
      not_director: 'Só a Conta Diretor faz o ensaio.',
      default: 'Não deu certo. Tente de novo.',
    } as Record<string, string>,
  },
  en: {
    badge: 'Rehearsal',
    mark: 'Mark as done',
    markWhisper: 'Whispering needs a friend, and this account has none: mark it by hand.',
    reset: 'Restart the rehearsal',
    resetConfirm: 'Tap again to restart',
    note: "Director's rehearsal: what you do with films from the list counts only here, on this account, and no tag is granted. The celebration shows up just like in the real event.",
    errors: {
      event_live: 'The event is live: the real event counts.',
      not_director: 'Only the Director account can rehearse.',
      default: "That didn't work. Try again.",
    } as Record<string, string>,
  },
} as const;

type Lang = keyof typeof COPY;

async function runTrial(action: 'mark' | 'reset', event: SeasonalEventState, step?: number): Promise<void> {
  const { error } = await supabase.rpc('director_event_trial', { p_action: action, p_event: event.id, p_step: step ?? null });
  if (error) throw error;
  requestSeasonalRefresh();
}

const errorText = (error: unknown, lang: Lang): string => {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
  const key = Object.keys(COPY[lang].errors).find((k) => message.includes(k));
  return COPY[lang].errors[key ?? 'default'];
};

export const TrialBadge: React.FC = () => {
  const lang = useDirectorLang();
  return (
    <span className="ml-1 inline-flex items-center gap-1 px-1.5 rounded text-[10px] font-semibold" style={{ background: withAlpha(BRASS, 0.2), color: BRASS }}>
      <Clapperboard className="w-3 h-3" aria-hidden />
      {COPY[lang].badge}
    </span>
  );
};

// Na missão em andamento: marcar à mão (com o porquê, quando é o sussurro).
export const TrialMarkButton: React.FC<{ event: SeasonalEventState; step: SeasonalStep; theme: SeasonalTheme }> = ({ event, step, theme }) => {
  const lang = useDirectorLang();
  const c = COPY[lang];
  const [busy, setBusy] = useState(false);
  const mark = async () => {
    setBusy(true);
    try {
      await runTrial('mark', event, step.index);
    } catch (error) {
      console.error('Director trial:', error);
      toast.error(errorText(error, lang));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <button
        type="button"
        onClick={mark}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 h-10 min-h-0 px-3.5 rounded-full text-xs font-semibold transition hover:brightness-110 disabled:opacity-60 ${FOCUS_RING}`}
        style={{ background: withAlpha(BRASS, 0.16), color: BRASS, boxShadow: `inset 0 0 0 1px ${withAlpha(BRASS, 0.5)}` }}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Check className="w-3.5 h-3.5" aria-hidden />}
        {c.mark}
      </button>
      {step.kind === 'whisper' && (
        <span className="text-xs leading-snug" style={{ color: withAlpha(theme.accentText, 0.85) }}>
          {c.markWhisper}
        </span>
      )}
    </div>
  );
};

// No pé do painel: o que é o ensaio e o recomeçar (toque duplo, como o desfazer do Diário).
export const TrialNote: React.FC<{ event: SeasonalEventState }> = ({ event }) => {
  const lang = useDirectorLang();
  const c = COPY[lang];
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      await runTrial('reset', event);
      setArmed(false);
    } catch (error) {
      console.error('Director trial:', error);
      toast.error(errorText(error, lang));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 px-5 sm:px-8 flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="flex-1 min-w-[220px] flex items-start gap-2 text-xs leading-relaxed" style={{ color: MIST }}>
        <Clapperboard className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: BRASS }} aria-hidden />
        <span>{c.note}</span>
      </p>
      <button
        type="button"
        onClick={reset}
        onBlur={() => setArmed(false)}
        disabled={busy}
        className={`shrink-0 inline-flex items-center gap-1.5 h-10 min-h-0 px-3.5 rounded-full text-xs font-semibold transition disabled:opacity-60 ${FOCUS_RING}`}
        style={armed ? { background: '#DC2626', color: '#fff' } : { color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.25)' }}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />}
        {armed ? c.resetConfirm : c.reset}
      </button>
    </div>
  );
};
