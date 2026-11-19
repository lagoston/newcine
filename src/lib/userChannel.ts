// O canal ao vivo da pessoa (19/11/2026, Protocolo Reborn, onda 3).
//
// O banco avisa cada sussurro novo por Broadcast privado no tópico
// `user:<id>` (migração 20261119190000_sussurros_ao_vivo: o mesmo caminho do
// pôquer com amigos). Aqui a tela escuta esse tópico e repassa o aviso ao
// barramento ('whispers:new'); o sino relê o número e, se a gaveta dos
// sussurros estiver aberta, ela relê a lista. O aviso não traz conteúdo, só o
// tipo: nada de dado pessoal passa pelo websocket.
//
// Bateria (o motivo de a assinatura antiga ter saído na Onda 1): um websocket
// manda uma batida a cada ~25 s. Por isso este canal só existe
//   • com alguém logado;
//   • com o app na frente: 30 s no fundo e ele é fechado (sem outro canal
//     aberto, a biblioteca derruba o websocket junto); na volta, reabre, e o
//     sino já relê o número por conta própria (WhispersContext);
//   • fora do modo economia por bateria fraca, "economia de dados" ou escolha
//     da pessoa (aparelho fraco não conta: o custo aqui é rádio, não CPU).
// Sem o canal, tudo continua funcionando como antes dele: o número é relido
// quando a pessoa volta para o app.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { emit } from './bus';
import { getMotion, subscribeMotion } from './motion';

// uma olhada rápida em outro app não derruba a conexão
const HIDDEN_GRACE_MS = 30_000;
// Quando o canal falha (sem rede, servidor fora, entrada recusada), ele é
// fechado e só tenta de novo depois de um descanso que cresce: 10 s, 1 min e
// daí em diante 5 min. Deixada sozinha, a biblioteca tentaria a cada poucos
// segundos para sempre (acordando o rádio à toa) ou, numa entrada recusada,
// nunca mais (canal morto até recarregar). Entrou, o contador zera.
const REST_MS = [10_000, 60_000, 5 * 60_000];

let userId: string | null = null;
let channel: RealtimeChannel | null = null;
let failures = 0;
let resting = false;
let restTimer: number | undefined;
let hiddenLong = false;
let hideTimer: number | undefined;
let unsubscribeMotion: (() => void) | null = null;

// Declarada antes por causa do ciclo: abrir → falhar → descansar →
// sincronizar → abrir.
let sync: () => void = () => undefined;

function ecoQuiet(): boolean {
  const motion = getMotion();
  return motion.eco && motion.ecoReason !== 'weak-device';
}

function close() {
  if (!channel) return;
  const old = channel;
  channel = null;
  void supabase.removeChannel(old);
}

function open(uid: string) {
  const next = supabase
    .channel(`user:${uid}`, { config: { private: true } })
    .on('broadcast', { event: 'ping' }, ({ payload }) => {
      const ping = (payload ?? {}) as { kind?: unknown; type?: unknown };
      if (ping.kind === 'whisper') {
        emit('whispers:new', { type: typeof ping.type === 'string' ? ping.type : undefined });
      }
    });
  channel = next;
  // 19/11/2026 (achado em produção, no mesmo dia em que o canal estreou): o
  // pedido de entrada num canal privado leva o token que a biblioteca tem na
  // mão NAQUELA hora, e até a primeira batida do websocket (25 s) esse token é
  // a chave pública do site, não o login da pessoa. O servidor recusava todas
  // as entradas ("Unauthorized", 17 nos registros). setAuth() antes de entrar
  // busca o token de quem está logado; é o passo que a documentação pede.
  supabase.realtime
    .setAuth()
    .catch(() => undefined)
    .then(() => {
      // fechado ou trocado enquanto o token era buscado
      if (channel !== next) return;
      next.subscribe((status) => {
        // um aviso atrasado de um canal que já foi trocado não conta
        if (channel !== next) return;
        if (status === 'SUBSCRIBED') {
          failures = 0;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          failures += 1;
          resting = true;
          close();
          window.clearTimeout(restTimer);
          restTimer = window.setTimeout(() => {
            resting = false;
            sync();
          }, REST_MS[Math.min(failures, REST_MS.length) - 1]);
        }
      });
    });
}

sync = () => {
  const wanted = userId !== null && !resting && !hiddenLong && !ecoQuiet();
  if (wanted && !channel && userId) open(userId);
  else if (!wanted && channel) close();
};

function onMotion() {
  const foreground = getMotion().foreground;
  window.clearTimeout(hideTimer);
  if (foreground) {
    hiddenLong = false;
  } else if (!hiddenLong) {
    hideTimer = window.setTimeout(() => {
      hiddenLong = true;
      sync();
    }, HIDDEN_GRACE_MS);
  }
  sync();
}

/** Liga o canal desta pessoa (trocar de conta fecha o da anterior). */
export function startUserChannel(uid: string) {
  if (userId !== uid) {
    close();
    failures = 0;
    resting = false;
    window.clearTimeout(restTimer);
  }
  userId = uid;
  if (!unsubscribeMotion) unsubscribeMotion = subscribeMotion(onMotion);
  onMotion();
}

/** Desliga (logout). */
export function stopUserChannel() {
  userId = null;
  window.clearTimeout(hideTimer);
  window.clearTimeout(restTimer);
  hiddenLong = false;
  resting = false;
  failures = 0;
  unsubscribeMotion?.();
  unsubscribeMotion = null;
  close();
}
