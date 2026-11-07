import { useEffect, useRef } from 'react';
import type { Seat } from '../../lib/mesa/types';

// Os atalhos da Mesa no computador (SPEC §2.15), 05/11/2026: 1, 2, 3 focam e
// viram cada carta (4 a quarta), P abre as perguntas e L o Livro. Desligados
// quando há um campo com foco ou uma camada aberta (gaveta, régua, modal). O
// Esc é da pilha de camadas (MesaLayer).
export function useMesaKeyboard(opts: {
  isEnabled: () => boolean;
  onSeat: (seat: Seat) => void;
  onAsk: () => void;
  onBook: () => void;
}) {
  const ref = useRef(opts);
  ref.current = opts;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const o = ref.current;
      if (!o.isEnabled() || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      // A régua (radiogroup) usa as próprias teclas.
      if (el?.closest('[role="radiogroup"]')) return;
      const seats: Record<string, Seat> = { '1': 'bogart', '2': 'fincher', '3': 'cypher', '4': 'espelho' };
      if (seats[e.key]) {
        e.preventDefault();
        o.onSeat(seats[e.key]);
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        o.onAsk();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        o.onBook();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
