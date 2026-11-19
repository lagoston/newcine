// Tempo real só com o app na frente (18/11/2026, Protocolo Reborn, bateria A10).
//
// O websocket do Supabase Realtime (hoje só as salas do pôquer com amigos)
// manda uma batida a cada ~30 s para se manter vivo. Com o app em segundo
// plano isso acorda o rádio do celular sem ninguém olhando. Aqui o socket é
// fechado quando o app vai para o fundo e reaberto na volta, com os canais que
// já existiam entrando de novo sozinhos (quem assinou não precisa fazer nada).
//
// Detalhe da biblioteca (conferido no @supabase/realtime-js 2.11.2, com um
// servidor de teste): `disconnect()` fecha o socket SEM avisar os canais, que
// continuam se achando "dentro"; e `connect()` não os põe de volta. Por isso,
// na volta, cada canal antigo recebe o mesmo aviso de erro que a biblioteca dá
// numa queda de rede ('phx_error') — é o caminho dela mesma para reentrar
// (espera 1 s, depois 2, 5, 10…). Esse aviso é interno (`_trigger`): se uma
// versão futura não o tiver, o socket simplesmente NÃO é fechado (fica como
// era antes desta mudança). O pôquer ainda tem a própria rede de segurança:
// sem aviso há 8 s com a mesa aberta, ele relê a sala.
import type { RealtimeChannel, RealtimeClient } from '@supabase/supabase-js';

type WithTrigger = RealtimeChannel & { _trigger?: (type: string, payload?: unknown) => void };

// os canais que estavam abertos quando o socket foi fechado
let parked: RealtimeChannel[] | null = null;

/** Fecha o socket (app em segundo plano). Devolve true se fechou. */
export function pauseRealtime(realtime: RealtimeClient): boolean {
  if (parked) return false;
  const channels = realtime.getChannels();
  // nada aberto: fora do pôquer o socket nem existe
  if (channels.length === 0 && !realtime.isConnected()) return false;
  // só fecha se souber reabrir
  if (channels.some((channel) => typeof (channel as WithTrigger)._trigger !== 'function')) return false;
  parked = channels.slice();
  realtime.disconnect();
  return true;
}

/** Reabre o socket e põe os canais de volta (app na frente). Devolve true se reabriu. */
export function resumeRealtime(realtime: RealtimeClient): boolean {
  if (!parked) return false;
  const before = parked;
  parked = null;
  const alive = new Set(realtime.getChannels());
  // quem saiu da sala enquanto isso não volta
  const stale = before.filter((channel) => alive.has(channel));
  if (stale.length === 0) return false;
  realtime.connect();
  stale.forEach((channel) => (channel as WithTrigger)._trigger?.('phx_error', 'app resumed'));
  return true;
}
