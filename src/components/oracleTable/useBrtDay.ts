import { useEffect, useState } from 'react';
import { brtDay } from '../../lib/mesa/day';

// A virada do dia de Brasília com a Mesa aberta (SPEC §2.16), 05/11/2026:
// confere a cada 60 s e a cada volta da aba (visibilitychange/focus) se o dia
// do aparelho em Brasília já passou do `day` da tiragem. Não recarrega nada:
// só avisa (a faixa "Uma nova tiragem já está na mesa").
export function useBrtDay(payloadDay: string | null): boolean {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!payloadDay) {
      setStale(false);
      return;
    }
    const check = () => setStale(brtDay() > payloadDay);
    check();
    const id = window.setInterval(check, 60_000);
    const onVis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', check);
    };
  }, [payloadDay]);
  return stale;
}
