// O orçamento de movimento do app (18/11/2026, Protocolo Reborn, onda 2a).
//
// Um lugar só decide se o que é ENFEITE pode se mexer: animações que rodam
// sozinhas (anéis, brilhos, molduras, banners), o estúdio em pixel art e o
// trailer da porta. Antes cada componente decidia por conta própria (51
// arquivos olham "reduzir movimento", cada laço tinha o próprio observador) e
// nada sabia do app em segundo plano. A auditoria mediu o prêmio: a home
// parada gastava 380–500 ms de CPU por segundo e, com tudo parado, ~0
// (claude/otimizacao/bateria.md, 4.1 e 4.5).
//
// O que este arquivo publica:
//   • no <html>, para o CSS:
//       .co-still / data-eco   → MODO ECONOMIA ligado (ver abaixo)
//       data-app-bg            → app em segundo plano (tudo pausado)
//   • para o React:  useMotion(), useCalm(), useAmbient(ref)
//   • para laços fora do React:  getMotion(), subscribeMotion(), ambientInterval()
//
// MODO ECONOMIA. Chave em Configurações: automático / ligado / desligado
// (guardada no aparelho, não na conta: é uma propriedade do aparelho).
// No automático ele só liga com um sinal claro, nunca "por palpite":
//   1. bateria em 20% ou menos e fora da tomada (sai aos 25% ou ao carregar),
//      quando o navegador informa (Chrome e o app Android; o iPhone não informa);
//   2. "Economia de dados" do sistema ligada (o navegador avisa: Save-Data);
//   3. aparelho fraco: até 2 GB de memória E até 4 núcleos (os dois juntos).
// Sem nenhum desses sinais (ou sem o navegador informar), fica desligado.
// Ligado, o CSS se comporta como em "reduzir movimento" (as mesmas regras, ver
// scripts/postcss-still-motion.mjs e src/styles/motion.css), o estúdio da
// Persona desenha na metade dos quadros e o trailer da porta não toca.
//
// A classe .co-still também serve num elemento só: é o que deixa parada a
// moldura do avatar nas listas (UserAvatar, prop `still`).
import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import '../styles/motion.css';

export type EcoSetting = 'auto' | 'on' | 'off';
export type EcoReason = 'manual' | 'battery' | 'save-data' | 'weak-device';

export interface MotionState {
  /** o que a pessoa escolheu em Configurações */
  ecoSetting: EcoSetting;
  /** o modo economia está valendo agora */
  eco: boolean;
  /** por que está valendo (null = não está) */
  ecoReason: EcoReason | null;
  /** aba visível e app em primeiro plano */
  foreground: boolean;
  /** "reduzir movimento" do sistema */
  reduced: boolean;
  /** uma camada (gaveta, busca, story) cobre a página. Quem liga é o host de
      camadas, na onda 2b (setCovered); até lá é sempre false. */
  covered: boolean;
}

const ECO_KEY = 'cineoracle:eco';
// bateria: entra aos 20%, sai aos 25% (sem ficar ligando e desligando no limite)
const BATTERY_ON = 0.2;
const BATTERY_OFF = 0.25;
// aparelho fraco: os DOIS sinais juntos (só memória pegaria celulares de 3 GB
// com 8 núcleos, que rodam bem; só núcleos pegaria todo iPhone antigo)
const WEAK_MEMORY_GB = 2;
const WEAK_CORES = 4;

const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined';

function readSetting(): EcoSetting {
  try {
    const saved = window.localStorage.getItem(ECO_KEY);
    return saved === 'on' || saved === 'off' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

// ----- os sinais (cada um muda só pela sua função) -----
let ecoSetting: EcoSetting = hasWindow ? readSetting() : 'auto';
let batteryLow = false;
let saveData = false;
let weakDevice = false;
let appActive = true; // o app nativo avisa (nativeShell.ts); no site vale a aba
let pageHidden = hasWindow ? document.hidden : false;
let reduced = false;
let covered = false;

function compute(): MotionState {
  let ecoReason: EcoReason | null = null;
  if (ecoSetting === 'on') ecoReason = 'manual';
  else if (ecoSetting === 'auto') ecoReason = batteryLow ? 'battery' : saveData ? 'save-data' : weakDevice ? 'weak-device' : null;
  return { ecoSetting, eco: ecoReason !== null, ecoReason, foreground: appActive && !pageHidden, reduced, covered };
}

let state: MotionState = compute();
const listeners = new Set<() => void>();

function paintDom() {
  if (!hasWindow) return;
  const html = document.documentElement;
  html.classList.toggle('co-still', state.eco);
  if (state.eco) html.dataset.eco = state.ecoReason ?? '1';
  else delete html.dataset.eco;
  if (state.foreground) delete html.dataset.appBg;
  else html.dataset.appBg = '1';
}

function refresh() {
  const next = compute();
  const same = (Object.keys(next) as (keyof MotionState)[]).every((key) => next[key] === state[key]);
  if (same) return;
  state = next;
  paintDom();
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('motion:', error);
    }
  });
}

// ----- leitura -----
export function getMotion(): MotionState {
  return state;
}

export function subscribeMotion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const isEco = () => state.eco;

// ----- quem muda -----
/** A chave das Configurações. Fica guardada neste aparelho. */
export function setEcoSetting(next: EcoSetting) {
  ecoSetting = next;
  try {
    if (next === 'auto') window.localStorage.removeItem(ECO_KEY);
    else window.localStorage.setItem(ECO_KEY, next);
  } catch {
    // sem armazenamento: vale até fechar o app
  }
  refresh();
}

/** O app nativo avisa quando vai para o fundo e quando volta (nativeShell.ts). */
export function setAppActive(active: boolean) {
  appActive = active;
  refresh();
}

/** Uma camada cobre a página (onda 2b: o host de camadas chama isto). */
export function setCovered(value: boolean) {
  covered = value;
  refresh();
}

// ----- os sinais do navegador -----
interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener: (type: string, listener: () => void) => void;
}
interface ConnectionLike {
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
}
type NavigatorSignals = Navigator & {
  getBattery?: () => Promise<BatteryLike>;
  connection?: ConnectionLike;
  deviceMemory?: number;
};

function watchSignals() {
  const nav = navigator as NavigatorSignals;

  document.addEventListener('visibilitychange', () => {
    pageHidden = document.hidden;
    refresh();
  });

  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (media) {
    reduced = media.matches;
    const onMedia = () => {
      reduced = media.matches;
      refresh();
    };
    // Safari antigo só tem addListener
    if (media.addEventListener) media.addEventListener('change', onMedia);
    else media.addListener?.(onMedia);
  }

  // aparelho fraco: só quando o navegador informa os dois números
  const memory = nav.deviceMemory;
  const cores = nav.hardwareConcurrency;
  weakDevice = typeof memory === 'number' && typeof cores === 'number' && memory <= WEAK_MEMORY_GB && cores <= WEAK_CORES;

  // "Economia de dados" do sistema
  const connection = nav.connection;
  if (connection) {
    saveData = connection.saveData === true;
    connection.addEventListener?.('change', () => {
      saveData = connection.saveData === true;
      refresh();
    });
  }

  // bateria (o iPhone e o Firefox não informam: lá este gatilho não existe)
  try {
    nav
      .getBattery?.()
      .then((battery) => {
        const read = () => {
          if (typeof battery.level !== 'number') return;
          if (!battery.charging && battery.level <= BATTERY_ON) batteryLow = true;
          else if (battery.charging || battery.level >= BATTERY_OFF) batteryLow = false;
          refresh();
        };
        read();
        battery.addEventListener('levelchange', read);
        battery.addEventListener('chargingchange', read);
      })
      .catch(() => undefined);
  } catch {
    // navegador sem a API (ou bloqueada): sem este gatilho
  }
}

if (hasWindow) {
  watchSignals();
  state = compute();
  paintDom();
}

// ----- React -----
export function useMotion(): MotionState {
  return useSyncExternalStore(subscribeMotion, getMotion, getMotion);
}

/** "Menos movimento": o sistema pediu OU o modo economia está ligado. É o que
    um componente deve olhar no lugar do useReducedMotion do framer-motion. */
export function useCalm(): boolean {
  const motion = useMotion();
  return motion.reduced || motion.eco;
}

/** O enfeite pode se mexer agora? Só com o app na frente, a página descoberta,
    sem "menos movimento" e (se vier um ref) com o elemento na tela. */
export function useAmbient(ref?: RefObject<Element | null>): boolean {
  const motion = useMotion();
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref?.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => setInView(entries.some((entry) => entry.isIntersecting)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return motion.foreground && !motion.covered && !motion.reduced && !motion.eco && inView;
}

// ----- laços fora do React -----
/** Um laço de quadros "de enfeite" (o estúdio da Persona): chama `frame` a cada
    `ms` só enquanto o elemento está na tela, o app na frente e a página
    descoberta. Fora disso o temporizador NÃO EXISTE (antes ele acordava 8 vezes
    por segundo para descobrir que não era hora). No modo economia, metade dos
    quadros: `frame` recebe 2 (o relógio da cena anda dois passos por desenho,
    então o ritmo é o mesmo). Devolve a função que desliga tudo. */
export function ambientInterval(el: Element | null, frame: (steps: number) => void, ms: number): () => void {
  let inView = true;
  let timer: number | null = null;
  let steps = 1;
  const stop = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };
  const sync = () => {
    const motion = getMotion();
    if (!inView || !motion.foreground || motion.covered) {
      stop();
      return;
    }
    const wanted = motion.eco ? 2 : 1;
    if (timer !== null && wanted === steps) return;
    stop();
    steps = wanted;
    timer = window.setInterval(() => frame(steps), ms * steps);
  };
  const observer =
    el && typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
          inView = entries.some((entry) => entry.isIntersecting);
          sync();
        })
      : null;
  if (el) observer?.observe(el);
  const unsubscribe = subscribeMotion(sync);
  sync();
  return () => {
    unsubscribe();
    observer?.disconnect();
    stop();
  };
}
