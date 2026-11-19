// O trailer da porta roda agora? (19/11/2026, Reborn, onda 2b)
//
// Esta conta morava dentro de components/oracleHub/DoorTrailer.tsx. Saiu para
// um arquivo pequeno porque a partida da Home (lib/appBoot.ts) precisa da MESMA
// resposta antes de o trailer montar: os candidatos do trailer só entram no
// pedido único da Home (get_app_bootstrap) nos dias em que o trailer vai mesmo
// tentar rodar — uma tentativa por dia, nunca com "reduzir movimento", modo
// economia, economia de dados ou dados móveis (regras de 18/11/2026).
import { isEco } from './motion';

const DAY_KEY = 'cineoracle:door-trailer-day';
// Conexões que gastam o pacote de dados (quando o navegador conta qual é).
const METERED = new Set(['cellular', 'wimax', 'bluetooth']);
// Sem armazenamento local: vale ao menos para esta aba.
let triedInThisTab = false;

// O dia de hoje no fuso de quem está olhando ("2026-11-18").
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function doorTrailerWanted(): boolean {
  if (triedInThisTab) return false;
  try {
    if (localStorage.getItem(DAY_KEY) === today()) return false;
  } catch {
    // sem localStorage: vale a marca desta aba (triedInThisTab)
  }
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  // 18/11/2026 (Reborn, bateria): no modo economia o trailer não toca (vídeo é
  // o que mais gasta bateria e dados na home). A porta fica como sempre.
  if (isEco()) return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; type?: string } }).connection;
  if (conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return false;
  if (conn?.type && METERED.has(conn.type)) return false;
  return true;
}

// Marca a tentativa de hoje (antes de buscar os candidatos), dê certo ou não.
export function markDoorTrailerTried(): void {
  triedInThisTab = true;
  try {
    localStorage.setItem(DAY_KEY, today());
  } catch {
    // ignora
  }
}
