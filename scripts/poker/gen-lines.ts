/**
 * Gera o banco de falas do poker a partir das fontes do roteirista (SPEC §6.1 e §6.5).
 *
 *   node scripts/poker/gen-lines.ts            → src/lib/poker/dialogue/{lines.pt,lines.en,quips}.ts
 *                                                e scripts/poker/marks.sql.txt
 *   node scripts/poker/gen-lines.ts --md DIR   → também banco-v1.md, banco-v1.en.md e tutorial.md em DIR
 *                                                (a versão de leitura do roteirista)
 *   node scripts/poker/gen-lines.ts --check    → só valida e mostra as contagens
 *
 * Fontes: scripts/poker/falas-src/*.txt (uma entrada por linha; o formato está no topo de
 * cada seção abaixo). O roteirista edita só as fontes e roda este script; os .ts gerados
 * nunca são editados à mão.
 *
 * Formato (o mesmo do gerador original do roteirista, gen_falas.py):
 *   # Título pt || Title en            (cabeçalho; nº de # = nível + 1)
 *   % parágrafo pt || paragraph en
 *   ID | who | EVENT | ctx | cue | P | flags | pt | en
 *   =ID | EVENT | ctx | P | flags | título pt | title en      (troca atômica)
 *   > who | pt | en      ou      > who | @ID                  (balão da troca)
 *   // comentário
 *
 * O EVENT e o ctx (texto livre do roteirista) viram gatilho, papel e variantes pela tabela
 * `classify` abaixo. Um par EVENT+ctx desconhecido é erro: acrescente a regra aqui.
 * Para casos pontuais, as marcas aceitam ainda: role=…, on=…, v=a+b, emote=…, weight=…
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure, MAX_CHARS, SHORT_CHARS } from '../../src/lib/poker/dialogue/render.ts';
import type { Cue } from '../../src/lib/poker/types.ts';
import type { Emote, Exchange, Line, LineRequires, Role, Trigger } from '../../src/lib/poker/dialogue/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SRC = join(HERE, 'falas-src');
const OUT_DIALOGUE = join(ROOT, 'src', 'lib', 'poker', 'dialogue');
const OUT_MARKS = join(HERE, 'marks.sql.txt');
const FILES = ['01-bogart.txt', '02-cypher.txt', '03-fincher.txt', '04-trocas.txt', '05-novo.txt', '06-tutorial.txt'];
const ALL_CUES: Cue[] = ['confiante', 'nervoso', 'calado', 'neutro'];
const BOT_ACTION: Trigger[] = ['limp', 'call', 'fold', 'bet', 'bigBet', 'overbet', 'checkRaise', '3bet', 'isolate', 'allIn', 'foldToPlayer'];

// ---------------------------------------------------------------------------
// Leitura das fontes
// ---------------------------------------------------------------------------

interface Entry { id: string; who: string; ev: string; ctx: string; cue: string; P: string; flags: string; pt: string; en: string; where: string }
interface XPart { who: string; pt: string; en: string; ref?: string }
interface XEntry { id: string; ev: string; ctx: string; P: string; flags: string; tpt: string; ten: string; parts: XPart[]; where: string }
type Item =
  | { k: 'h'; lvl: number; pt: string; en: string }
  | { k: 'p'; pt: string; en: string }
  | { k: 'e'; e: Entry }
  | { k: 'x'; x: XEntry };

const errors: string[] = [];
const items: Item[] = [];
const entries = new Map<string, Entry>();

for (const fn of FILES) {
  const lines = readFileSync(join(SRC, fn), 'utf8').split('\n');
  lines.forEach((raw, idx) => {
    const s = raw.replace(/\r$/, '');
    if (!s.trim() || s.startsWith('//')) return;
    const where = `${fn}:${idx + 1}`;
    if (s.startsWith('#')) {
      const lvl = s.length - s.replace(/^#+/, '').length;
      const [pt, en] = s.replace(/^#+/, '').split('||').map((x) => x.trim());
      items.push({ k: 'h', lvl, pt, en });
    } else if (s.startsWith('%')) {
      const [pt, en] = s.slice(1).split('||').map((x) => x.trim());
      items.push({ k: 'p', pt, en });
    } else if (s.startsWith('=')) {
      const f = s.slice(1).split(' | ').map((x) => x.trim());
      if (f.length !== 7) { errors.push(`${where}: troca com ${f.length} campos`); return; }
      items.push({ k: 'x', x: { id: f[0], ev: f[1], ctx: f[2], P: f[3], flags: f[4], tpt: f[5], ten: f[6], parts: [], where } });
    } else if (s.startsWith('>')) {
      const f = s.slice(1).split(' | ').map((x) => x.trim());
      const last = items[items.length - 1];
      if (!last || last.k !== 'x') { errors.push(`${where}: balão fora de troca`); return; }
      if (f.length === 2 && f[1].startsWith('@')) last.x.parts.push({ who: f[0], pt: '', en: '', ref: f[1].slice(1) });
      else if (f.length === 3) last.x.parts.push({ who: f[0], pt: f[1], en: f[2] });
      else errors.push(`${where}: balão de troca malformado`);
    } else {
      const f = s.split(' | ').map((x) => x.trim());
      if (f.length !== 9) { errors.push(`${where}: entrada com ${f.length} campos: ${s.slice(0, 60)}`); return; }
      const e: Entry = { id: f[0], who: f[1], ev: f[2], ctx: f[3], cue: f[4], P: f[5], flags: f[6], pt: f[7], en: f[8], where };
      if (entries.has(e.id)) errors.push(`${where}: id duplicado ${e.id}`);
      entries.set(e.id, e);
      items.push({ k: 'e', e });
    }
  });
}

const allX = items.filter((it): it is { k: 'x'; x: XEntry } => it.k === 'x').map((it) => it.x);
for (const x of allX) {
  for (const p of x.parts) {
    if (!p.ref) continue;
    const r = entries.get(p.ref);
    if (!r) { errors.push(`${x.id}: ref ${p.ref} inexistente`); continue; }
    p.pt = r.pt; p.en = r.en;
  }
}
{
  const seen = new Set<string>();
  for (const x of allX) {
    if (seen.has(x.id) || entries.has(x.id)) errors.push(`troca com id repetido ${x.id}`);
    seen.add(x.id);
  }
}

// ---------------------------------------------------------------------------
// Marcas e normalização
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/`/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

interface Flags { list: string[]; once?: 'match' | 'session' | 'life'; story?: string; vez: boolean; solo: boolean;
  role?: Role; on?: Trigger; v?: string[]; emote?: Emote; weight?: number }

/** "dívida-1" → "arc.divida.1"; chaves de story precisam casar com ^[a-z0-9_.:-]{1,40}$ (poker_mark_story). */
function storyKey(raw: string): string {
  const k = norm(raw).replace(/[^a-z0-9-]/g, '').replace(/-(\d+)$/, '.$1');
  return `arc.${k}`;
}

function parseFlags(raw: string): Flags {
  const list = raw === '-' ? [] : raw.split(',').map((x) => x.trim()).filter(Boolean);
  const f: Flags = { list, vez: false, solo: false };
  for (const it of list) {
    const [k, v] = it.split('=');
    if (k === 'once') f.once = v as Flags['once'];
    else if (k === 'story') f.story = storyKey(v);
    else if (k === 'vez') f.vez = true;
    else if (k === 'solo') f.solo = true;
    else if (k === 'role') f.role = v as Role;
    else if (k === 'on') f.on = v as Trigger;
    else if (k === 'v') f.v = v.split('+');
    else if (k === 'emote') f.emote = v as Emote;
    else if (k === 'weight') f.weight = Number(v);
    else errors.push(`marca desconhecida: ${it}`);
  }
  return f;
}

// ---------------------------------------------------------------------------
// EVENT + ctx → gatilho, papel e variantes
// ---------------------------------------------------------------------------

interface Klass { on: Trigger; role: Role; variant: string[]; requires?: LineRequires; between?: Exchange['between'];
  quip?: boolean; mark?: boolean }

const VS: Record<string, string> = { sapo: 'vsSapo', cobra: 'vsCobra', raposo: 'vsRaposo' };
const ID_OF: Record<string, string> = { sapo: 'bogart', cobra: 'cypher', raposo: 'fincher' };
const KINDS = ['tickets', 'special_tickets', 'poster', 'avatar_frame', 'banner', 'tag', 'deck', 'table', 'rival', 'poker_quip'];
const TITLES: Record<string, string> = { duble: 'duble', estrela: 'estrela', coadjuvante: 'coadjuvante',
  'lenda da sessao': 'lenda', protagonista: 'protagonista', figurante: 'figurante' };

/** Nome de oráculo no fim do contexto ("ele tirou a Cobra" → 'cobra'). */
function oracleIn(c: string): string | null {
  const m = c.match(/\b(sapo|cobra|raposo)\b/);
  return m ? m[1] : null;
}

/** Contexto de troca: "requires=dívida-1, ≥20 partidas" e afins. */
function exchangeRequires(c: string): LineRequires | undefined {
  const r: LineRequires = {};
  const m = c.match(/requires=([a-z0-9-]+)/);
  if (m) r.storyHas = storyKey(m[1]);
  const n = c.match(/≥\s*(\d+) partidas/);
  if (n) r.minMatches = Number(n[1]);
  return Object.keys(r).length ? r : undefined;
}

function classify(ev: string, who: string, ctxRaw: string, isExchange: boolean): Klass | string {
  const c = norm(ctxRaw);
  const none = c === '-' || c === '';
  const K = (on: Trigger, role: Role, variant: string[] = [], extra: Partial<Klass> = {}): Klass => ({ on, role, variant, ...extra });
  switch (ev) {
    case 'FIRST_VISIT': return K('firstVisit', 'any');
    case 'MATCH_START': {
      if (none) return K('matchStart', 'any');
      const map: Record<string, string[]> = {
        volta: ['volta'], fregues: ['fregues'], madrugada: ['madrugada'], serie: ['serie'], nemesis: ['nemesis'],
        'mesa livre': ['livre'], 'mesa valendo': ['valendo'],
        'memoria: blefador': ['memoria', 'blefador'], 'memoria: pedra': ['memoria', 'pedra'],
        'memoria: paga-tudo': ['memoria', 'pagaTudo'],
      };
      return map[c] ? K('matchStart', 'any', map[c]) : `MATCH_START: contexto "${ctxRaw}"`;
    }
    case 'PRIZE_INTRO': {
      if (isExchange) {
        const o = c.match(/portadora? = (sapo|cobra|raposo)/);
        return o ? K('bountyIntro', 'any', [`h.${ID_OF[o[1]]}`]) : `PRIZE_INTRO: "${ctxRaw}"`;
      }
      if (c === 'qualquer tipo') return K('bountyIntro', 'carrier');
      if (c === 'comum') return K('bountyIntro', 'carrier', ['common']);
      if (c === 'lendario') return K('bountyIntro', 'carrier', ['legendary']);
      if (KINDS.includes(c)) return K('bountyIntro', 'carrier', [c]);
      return `PRIZE_INTRO: "${ctxRaw}"`;
    }
    case 'PRIZE_AT_RISK': return K('bountyAtRisk', 'carrier');
    case 'PRIZE_CAPTURED': return K('bountyWon', 'carrier');
    case 'PRIZE_KEPT': return K('bountyLost', 'carrier');
    case 'PRIZE_MOVED': {
      if (isExchange) {
        const m = c.match(/o (sapo|cobra|raposo) tirou (?:o|a) (sapo|cobra|raposo)/);
        return m ? K('bountySteal', 'any', [`a.${ID_OF[m[1]]}`, `v.${ID_OF[m[2]]}`]) : `PRIZE_MOVED: "${ctxRaw}"`;
      }
      if (/tirou o portador/.test(c)) return K('bountySteal', 'actor');
      const o = oracleIn(c);
      return o ? K('bountySteal', 'actor', [VS[o]]) : `PRIZE_MOVED: "${ctxRaw}"`;
    }
    case 'PRIZE_TAUNT': {
      const o = oracleIn(c);
      return o ? K('bountyTaunt', 'bystander', [VS[o]]) : `PRIZE_TAUNT: "${ctxRaw}"`;
    }
    case 'CALL': return K('call', 'actor', c === 'comprometido' ? ['comprometido'] : []);
    case 'LIMP': return K('limp', 'actor');
    case 'BET': return K('bet', 'actor', ['pequeno']);
    case 'BIG_BET': return K('bigBet', 'actor');
    case 'CHECK_RAISE': return K('checkRaise', 'actor');
    case 'OVERBET': return K('overbet', 'actor');
    case 'RAISE_3BET': return K('3bet', 'actor');
    case 'ISOLATE': return K('isolate', 'actor', oracleIn(c) ? [VS[oracleIn(c)!]] : []);
    case 'ALL_IN': return K('allIn', 'actor', c === 'curto' ? ['curto'] : []);
    case 'FOLD': {
      if (none) return K('fold', 'actor');
      if (c === 'do blind') return K('fold', 'actor', ['blind']);
      const o = oracleIn(c);
      return o ? K('fold', 'actor', [VS[o]]) : `FOLD: "${ctxRaw}"`;
    }
    case 'FOLD_TO_HUMAN': return K('foldToPlayer', 'actor');
    case 'HUMAN_BIG_BET': {
      if (none) return K('playerBigBet', 'any');
      const m = c.match(/= (pedra|solto|paga-tudo|blefador)/);
      return m ? K('playerBigBet', 'any', [m[1] === 'paga-tudo' ? 'pagaTudo' : m[1]]) : `HUMAN_BIG_BET: "${ctxRaw}"`;
    }
    case 'HUMAN_ALL_IN': return K('playerAllIn', 'any', /30 bb/.test(c) ? ['enorme'] : []);
    case 'HUMAN_FOLD': return K('playerFold', 'victim');
    case 'HUMAN_BLUFF_SHOWN': {
      if (isExchange) {
        const o = oracleIn(c);
        return o ? K('playerBluffShown', 'any', [`v.${ID_OF[o]}`]) : `HUMAN_BLUFF_SHOWN: "${ctxRaw}"`;
      }
      // Quem largou para o blefe reclama; a Cobra comenta de fora (roteirista).
      if (/contra o raposo/.test(c) || who === 'bogart') return K('playerBluffShown', 'victim');
      return K('playerBluffShown', 'any');
    }
    case 'BLUFF_CAUGHT': return K('playerBluffCaught', 'any');
    case 'CATCH_BLUFF': return K('catchBluff', 'winner');
    case 'VALUE_SHOWN': return K('valueShown', 'winner', /calado/.test(c) ? ['calado'] : []);
    case 'BLUFF_SHOWN': return K('bluffShown', 'actor');
    case 'HERO_FOLD_SHOWN': return K('heroFoldShown', 'actor');
    case 'POT_WON': {
      if (isExchange) {
        const o = oracleIn(c);
        return o ? K('potWon', 'any', [`a.${ID_OF[o]}`, ...(/30 bb/.test(c) ? ['enorme'] : [])]) : `POT_WON: "${ctxRaw}"`;
      }
      if (none) return K('potWon', 'winner');
      if (c === 'pequeno') return K('potWon', 'winner', ['pequeno']);
      if (c === 'grande') return K('potWon', 'winner', ['grande']);
      if (/^sorte/.test(c)) return K('potWon', 'winner', ['sorte']);
      const o = oracleIn(c);
      return o ? K('potWon', 'winner', [VS[o]]) : `POT_WON: "${ctxRaw}"`;
    }
    case 'POT_LOST': return K('potLostToPlayer', 'loser');
    case 'HAND_END': {
      if (c === 'voce ganhou um pote grande apostando alto') return K('potLostToPlayer', 'any', ['grande', 'agressor']);
      const m = c.match(/seu all-in pago pelo (sapo|cobra|raposo); (o (?:sapo|cobra|raposo)|voce) venceu/);
      if (m) {
        const caller = ID_OF[m[1]];
        return m[2] === 'voce'
          ? K('potLostToPlayer', 'any', ['allinHumano'], { requires: { caller } })
          : K('potWon', 'any', ['allinHumano', `a.${caller}`], { requires: { caller } });
      }
      return `HAND_END: "${ctxRaw}"`;
    }
    case 'SHOWDOWN': return K('showdown', 'any', /mostra primeiro/.test(c) ? ['humanFirst'] : []);
    case 'RATE_MOVE': return K('rateMove', 'any', [/baixa/.test(c) ? 'baixa' : 'alta']);
    case 'BEAUTIFUL_ERROR': return K('beautifulError', 'any');
    case 'BAD_BEAT': {
      if (isExchange) {
        const o = oracleIn(c);
        return o ? K('badBeatAgainstMe', 'any', [`v.${ID_OF[o]}`]) : `BAD_BEAT: "${ctxRaw}"`;
      }
      if (c === 'vitima') return K('badBeatAgainstMe', 'victim');
      if (c === 'vencedor' || c === 'vencedora') return K('badBeatForMe', 'winner');
      if (c === 'voce foi a vitima') return K('playerBadBeat', 'any');
      return `BAD_BEAT: "${ctxRaw}"`;
    }
    case 'TILT_START': {
      if (isExchange) {
        const o = c.match(/perdeu para o (sapo|cobra|raposo)/);
        return o ? K('tiltStart', 'any', ['a.cypher', `v.${ID_OF[o[1]]}`]) : `TILT_START: "${ctxRaw}"`;
      }
      if (c === 'emburrado') return K('tiltStart', 'actor');
      if (/perdeu para o/.test(c)) return K('tiltStart', 'actor', [VS[oracleIn(c)!]]);
      if (/cacife/.test(c)) return K('tiltStart', 'actor', ['cacife']);
      if (/blefe/.test(c)) return K('tiltStart', 'actor', ['blefe']);
      return `TILT_START: "${ctxRaw}"`;
    }
    case 'TILT_END': return K('tiltEnd', 'actor');
    case 'PRIDE': return K('prideStart', 'actor');
    case 'ELIMINATION': {
      if (isExchange) {
        const o = oracleIn(c);
        return o ? K('eliminated', 'any', [`v.${ID_OF[o]}`]) : `ELIMINATION: "${ctxRaw}"`;
      }
      if (c === 'ele caiu' || c === 'ela caiu') return K('eliminated', 'victim');
      const o = oracleIn(c);
      return o && /tirou/.test(c) ? K('eliminatesOracle', 'actor', [VS[o]]) : `ELIMINATION: "${ctxRaw}"`;
    }
    case 'ORACLE_OUT': {
      const o = oracleIn(c);
      return o ? K('oracleOut', 'bystander', [VS[o]]) : `ORACLE_OUT: "${ctxRaw}"`;
    }
    case 'HUMAN_SLOW': return /^25/.test(c) ? K('idle', 'any', ['t25']) : /^60/.test(c) ? K('idle', 'any', ['t60']) : `HUMAN_SLOW: "${ctxRaw}"`;
    case 'WIN_STREAK': return K('playerStreak', 'any');
    case 'STYLE_READ': {
      if (/leitura errada/.test(c)) return K('readPlayer', 'any');
      const m = c.match(/^(pedra|solto|paga-tudo|blefador)/);
      if (!m) return `STYLE_READ: "${ctxRaw}"`;
      const label = m[1] === 'paga-tudo' ? 'pagaTudo' : m[1];
      return K('readPlayer', isExchange ? 'any' : 'actor', [label]);
    }
    case 'BLINDS_UP': return K('blindsUp', 'any', /ante/.test(c) ? ['ante'] : []);
    case 'HEADS_UP': return K('headsUp', 'actor');
    case 'DEAL': return K('deal', 'any');
    case 'FLOP': return K('flop', 'any', /mesmo naipe/.test(c) ? ['monotone'] : []);
    case 'BANTER': return K('banter', 'any', [], { requires: exchangeRequires(c), between: 'afterHumanFold' });
    case 'HUMAN_OUT': {
      const o = oracleIn(c);
      return o ? K('eliminatesPlayer', 'any', [`a.${ID_OF[o]}`], { between: 'any' }) : `HUMAN_OUT: "${ctxRaw}"`;
    }
    case 'MATCH_END': return /voce venceu/.test(c) ? K('playerWinsMatch', 'any') : `MATCH_END: "${ctxRaw}"`;
    case 'CREDITS': {
      if (/levou a mesa/.test(c)) return K('tableWinner', 'winner');
      if (/voce perdeu/.test(c)) return K('playerLosesMatch', 'any');
      return `CREDITS: "${ctxRaw}"`;
    }
    case 'REMATCH': return K('rematch', 'any');
    case 'HUMAN_LEAVES': return K('playerLeaves', 'any');
    case 'RANK_UP': return TITLES[c] ? K('rankUp', 'any', [TITLES[c]], { between: 'any' }) : `RANK_UP: "${ctxRaw}"`;
    case 'SECRET_TELL': return K('secretTell', 'any', [], { requires: exchangeRequires(c) });
    case 'LESSON': {
      const map: Record<string, string> = { blefe: 'blefe', 'preco do call': 'odds', posicao: 'posicao', 'cacife curto': 'curto' };
      return map[c] ? K('lesson', 'any', [map[c]]) : `LESSON: "${ctxRaw}"`;
    }
    case 'LOAN': {
      if (c === 'abertura') return K('sapoLoan', isExchange ? 'any' : 'actor');
      if (c === 'testemunha') return K('sapoLoan', 'bystander');
      if (/levou o premio/.test(c)) return K('loanCredits', 'any', ['premio']);
      if (/voce perdeu/.test(c)) return K('loanCredits', 'any', ['perdeu']);
      return `LOAN: "${ctxRaw}"`;
    }
    case 'QUIP': return { on: 'quipAnswer', role: 'any', variant: [], quip: true };
    case 'QUIP_REPLY': return /^r\d$/.test(c) ? K('quipAnswer', 'any', [c.toUpperCase()]) : `QUIP_REPLY: "${ctxRaw}"`;
    case 'INTERVAL_INVITE': return K('intervalInvite', 'any');
    case 'INTERVAL_RETURN': return K('intervalReturn', 'any');
    case 'RECAP': {
      const map: Record<string, string[]> = { geral: [], 'voce liderava': ['lider'], 'voce estava curto': ['curto'],
        'um oraculo liderava': ['oraculoLider'], 'partida valendo': ['valendo'], 'um oraculo ja caiu': ['caiu'] };
      return map[c] ? K('recap', 'any', map[c]) : `RECAP: "${ctxRaw}"`;
    }
    case 'TIP': {
      const part = /\(a[,)]/.test(c) ? 'a' : /\(b[,)]/.test(c) ? 'b' : null;
      let kind: string | null = null;
      if (/all-in/.test(c)) kind = 'allin';
      else if (/pote paralelo/.test(c)) kind = 'sidepot';
      else if (/subida de blind/.test(c)) kind = 'blinds';
      else if (/ante/.test(c)) kind = 'ante';
      else if (/aposta grande/.test(c)) kind = 'bigbet';
      else if (/corte final/.test(c)) kind = 'headsup';
      if (!kind) return `TIP: "${ctxRaw}"`;
      return K('contextTip', 'any', part ? [kind, part] : [kind]);
    }
    case 'MILESTONE': return { on: 'tutorial', role: 'any', variant: [], mark: true };
    case 'TUTORIAL': return K('tutorial', 'any');
    default: return `evento desconhecido ${ev}`;
  }
}

// ---------------------------------------------------------------------------
// cue: '-' | '*' | lista, com 'fora'
// ---------------------------------------------------------------------------

/**
 * Regras de tell (veredito, divergência 1; cabeçalho do banco):
 * - fala de ator do Sapo nunca aceita `calado` (com calado ele se cala);
 * - o Raposo nunca fala com o anel (`confiante`);
 * - a Cobra é teatro: aceita todos.
 */
function speakerCues(who: string): Cue[] {
  if (who === 'bogart') return ['confiante', 'nervoso', 'neutro'];
  if (who === 'fincher') return ['nervoso', 'neutro'];
  return [...ALL_CUES];
}

function parseCue(raw: string, who: string, on: Trigger, role: Role): { cue?: Cue[]; out?: 'also' | 'only' } {
  const isBotAction = BOT_ACTION.includes(on) && role === 'actor';
  if (raw === '-' || raw === '') return isBotAction ? { cue: speakerCues(who) } : {};
  // '*' = qualquer cue (teatro), e também com o falante fora da mão.
  if (raw === '*') return isBotAction ? { cue: speakerCues(who) } : { cue: speakerCues(who), out: 'also' };
  const parts = raw.split(',').map((x) => x.trim());
  const cues = parts.filter((p) => p !== 'fora') as Cue[];
  for (const c of cues) if (!ALL_CUES.includes(c)) errors.push(`cue desconhecido "${c}"`);
  const hasOut = parts.includes('fora');
  if (cues.length === 0) return hasOut ? { out: 'only' } : {};
  return hasOut ? { cue: cues, out: 'also' } : { cue: cues };
}

// ---------------------------------------------------------------------------
// Selos (emotes) padrão — poucos, para não poluir (§7.5, "três juízes")
// ---------------------------------------------------------------------------

function defaultEmote(on: Trigger, who: string, variant: string[], cue?: Cue[]): Emote | undefined {
  if (on === 'rateMove') return 'note';                       // Nota do Sapo
  if (on === 'beautifulError') return 'heart';                // Coração da Cobra
  if (on === 'playerBluffShown' && who === 'fincher') return 'hat';   // Chapéu do Raposo
  if (on === 'tiltStart') return who === 'cypher' ? 'vein' : who === 'bogart' ? 'dots' : undefined;
  if (on === 'badBeatAgainstMe' || on === 'eliminated') return 'broken';
  if (on === 'idle' && variant.includes('t60') && who === 'bogart') return 'zzz';
  if (who === 'bogart' && cue && cue.length === 1 && cue[0] === 'nervoso') return 'sweat';
  if (who === 'bogart' && (on === 'catchBluff' || on === 'allIn' || on === 'playerAllIn')) return 'excl';
  if (on === 'potWon' && who === 'bogart') return 'star';
  return undefined;
}

// ---------------------------------------------------------------------------
// Validação de texto
// ---------------------------------------------------------------------------

function checkText(tag: string, text: string, vez: boolean, lang: 'pt' | 'en'): void {
  const n = measure(text, lang);
  if (n > MAX_CHARS) errors.push(`${tag} [${lang}] ${n} > ${MAX_CHARS}: ${text}`);
  if (vez && n > SHORT_CHARS) errors.push(`${tag} [${lang}] fala da vez com ${n} > ${SHORT_CHARS}: ${text}`);
  if (/\{(player|nome)\}|@/.test(text)) errors.push(`${tag}: nome de usuário proibido: ${text}`);
}

// ---------------------------------------------------------------------------
// Conversão
// ---------------------------------------------------------------------------

const LINES: Line[] = [];
const QUIP_LINES: Line[] = [];
const EXCHANGES: Exchange[] = [];
const EN: Record<string, string | string[]> = {};
const QUIPS: { id: string; pt: string; en: string }[] = [];
const MARKS: { id: string; who: string; ctx: string; pt: string; en: string }[] = [];

function prio(P: string, tag: string): 1 | 2 | 3 {
  const n = Number(P.replace(/^P/, ''));
  if (n === 1 || n === 2 || n === 3) return n;
  errors.push(`${tag}: prioridade "${P}"`);
  return 3;
}

for (const e of entries.values()) {
  const fl = parseFlags(e.flags);
  const k = classify(e.ev, e.who, e.ctx, false);
  checkText(e.id, e.pt, fl.vez, 'pt');
  checkText(e.id, e.en, fl.vez, 'en');
  if (typeof k === 'string') { errors.push(`${e.where} (${e.id}): sem regra para ${k}`); continue; }
  if (k.quip) { QUIPS.push({ id: e.id, pt: e.pt, en: e.en }); continue; }
  if (k.mark) { MARKS.push({ id: e.id, who: e.who, ctx: e.ctx, pt: e.pt, en: e.en }); continue; }
  const on = fl.on ?? k.on;
  const role = fl.role ?? k.role;
  const variant = [...k.variant, ...(fl.v ?? [])];
  const { cue, out } = parseCue(e.cue, e.who, on, role);
  const line: Line = { id: e.id, speaker: e.who, on, role, priority: prio(e.P, e.id), pt: e.pt };
  if (variant.length) line.variant = variant;
  if (cue) line.cue = cue;
  if (out) line.out = out;
  if (measure(e.pt, 'pt') <= SHORT_CHARS) line.curta = true;
  if (fl.once) line.once = fl.once;
  const requires: LineRequires = { ...(k.requires ?? {}) };
  if (fl.story) line.story = fl.story;
  // Toda fala "uma vez na vida" ganha uma chave de story, que vale em qualquer aparelho.
  if (fl.once === 'life') {
    if (!line.story) line.story = on === 'contextTip' ? `tip.${variant[0]}` : `once.${e.id.toLowerCase()}`;
    requires.storyNot = line.story;
  }
  if (Object.keys(requires).length) line.requires = requires;
  if (fl.weight) line.weight = fl.weight;
  const emote = fl.emote ?? defaultEmote(on, e.who, variant, cue);
  if (emote) line.emote = emote;
  (on === 'quipAnswer' ? QUIP_LINES : LINES).push(line);
  EN[e.id] = e.en;
}

for (const x of allX) {
  const fl = parseFlags(x.flags);
  const k = classify(x.ev, '', x.ctx, true);
  x.parts.forEach((p, i) => {
    if (!p.ref) { checkText(`${x.id}.${i + 1}`, p.pt, false, 'pt'); checkText(`${x.id}.${i + 1}`, p.en, false, 'en'); }
  });
  if (typeof k === 'string') { errors.push(`${x.where} (${x.id}): sem regra para ${k}`); continue; }
  const farewell = x.ev === 'HUMAN_OUT';
  if (!farewell && (x.parts.length < 2 || x.parts.length > 3)) errors.push(`${x.id}: troca com ${x.parts.length} balões`);
  if (farewell && (x.parts.length < 1 || x.parts.length > 3)) errors.push(`${x.id}: despedida com ${x.parts.length} balões`);
  const ex: Exchange = {
    id: x.id,
    on: farewell ? 'eliminatesPlayer' : (fl.on ?? k.on),
    priority: prio(x.P, x.id),
    between: farewell ? 'any' : (k.between ?? 'hands'),
    parts: x.parts.map((p) => ({ speaker: p.who, pt: p.pt })),
  };
  const variant = [...k.variant, ...(fl.v ?? [])];
  if (farewell) ex.farewell = true;
  if (variant.length) ex.variant = variant;
  if (fl.once) ex.once = fl.once;
  const requires: LineRequires = { ...(k.requires ?? {}) };
  if (fl.story) ex.story = fl.story;
  if (fl.once === 'life') {
    if (!ex.story) ex.story = ex.on === 'firstVisit' ? 'first_visit' : `once.${x.id.toLowerCase()}`;
    requires.storyNot = ex.story;
  }
  if (Object.keys(requires).length) ex.requires = requires;
  EXCHANGES.push(ex);
  EN[x.id] = x.parts.map((p) => p.en);
}

// Referências cruzadas mínimas.
for (const l of [...LINES, ...QUIP_LINES]) {
  if (!['bogart', 'cypher', 'fincher'].includes(l.speaker)) errors.push(`${l.id}: falante "${l.speaker}"`);
  if (l.role === 'actor' && BOT_ACTION.includes(l.on) && (!l.cue || l.cue.length === 0)) errors.push(`${l.id}: ator sem cue`);
  if (l.speaker === 'bogart' && l.role === 'actor' && l.cue?.includes('calado')) errors.push(`${l.id}: Sapo ator com calado`);
}
for (const s of [...LINES, ...EXCHANGES]) {
  const key = s.story ?? s.requires?.storyNot ?? s.requires?.storyHas;
  if (key && !/^[a-z0-9_.:-]{1,40}$/.test(key)) errors.push(`${s.id}: chave de story inválida "${key}"`);
}
if (QUIPS.length !== 4) errors.push(`esperava 4 réplicas, achei ${QUIPS.length}`);
if (MARKS.length !== 5) errors.push(`esperava 5 marcos, achei ${MARKS.length}`);

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

const HEADER = (what: string): string =>
  `// GERADO por scripts/poker/gen-lines.ts a partir de scripts/poker/falas-src/ (${what}).\n` +
  '// Não edite à mão: mude as fontes e rode `node scripts/poker/gen-lines.ts`.\n';

function lit(v: unknown): string {
  return JSON.stringify(v);
}

function objLiteral(o: Record<string, unknown>, order: string[]): string {
  const keys = order.filter((k) => o[k] !== undefined);
  return `{ ${keys.map((k) => `${k}: ${lit(o[k])}`).join(', ')} }`;
}

const LINE_ORDER = ['id', 'speaker', 'on', 'role', 'variant', 'cue', 'out', 'curta', 'once', 'requires', 'story', 'priority', 'weight', 'emote', 'pt'];
const X_ORDER = ['id', 'on', 'variant', 'once', 'requires', 'story', 'priority', 'between', 'farewell', 'parts'];

function emitPt(): string {
  return [
    HEADER('texto pt e metadados'),
    "import type { Exchange, Line } from './types.ts';",
    '',
    'export const LINES: Line[] = [',
    ...LINES.map((l) => `  ${objLiteral(l as unknown as Record<string, unknown>, LINE_ORDER)},`),
    '];',
    '',
    'export const EXCHANGES: Exchange[] = [',
    ...EXCHANGES.map((x) => `  ${objLiteral(x as unknown as Record<string, unknown>, X_ORDER)},`),
    '];',
    '',
  ].join('\n');
}

function emitEn(): string {
  const ids = Object.keys(EN);
  return [
    HEADER('texto en por id; trocas = um texto por balão'),
    "import type { EnglishBank } from './types.ts';",
    '',
    'export const EN: EnglishBank = {',
    ...ids.map((id) => `  ${lit(id)}: ${lit(EN[id])},`),
    '};',
    '',
  ].join('\n');
}

function emitQuips(): string {
  return [
    HEADER('Réplicas da visita, §7.8'),
    "import type { Line, QuipPack } from './types.ts';",
    '',
    '/** Pacotes de Réplicas por id do item (`poker_items`). O padrão é `quips-padrao`. */',
    'export const QUIP_PACKS: Record<string, QuipPack> = {',
    `  'quips-padrao': { id: 'quips-padrao', quips: [`,
    ...QUIPS.map((q) => `    ${objLiteral(q as unknown as Record<string, unknown>, ['id', 'pt', 'en'])},`),
    '  ] },',
    '};',
    '',
    '/** Respostas dos oráculos (gatilho `quipAnswer`, variante = id da réplica). Todas curtas. */',
    'export const QUIP_LINES: Line[] = [',
    ...QUIP_LINES.map((l) => `  ${objLiteral(l as unknown as Record<string, unknown>, LINE_ORDER)},`),
    '];',
    '',
  ].join('\n');
}

function sql(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** As 5 tags dos marcos (§2.9), para o pacote C aplicar. Descrição na voz do oráculo. */
function emitMarks(): string {
  const META: Record<string, { tag: string; name: string; emoji: string; mark: string; req: string; reqPt: string }> = {
    M1: { tag: 'poker-first-win', name: 'Opening Night', emoji: '🃏', mark: 'first_win',
      req: 'Finish 1st in a prize match for the first time', reqPt: 'Fique em 1º lugar numa partida valendo prêmio pela primeira vez' },
    M2: { tag: 'poker-fox-hunter', name: 'Fox Hunter', emoji: '🦊', mark: 'fox_hunter',
      req: 'Knock out the Fox in a prize match', reqPt: 'Elimine o Raposo numa partida valendo prêmio' },
    M3: { tag: 'poker-clean-sweep', name: 'Clean Sweep', emoji: '🧹', mark: 'clean_sweep',
      req: 'Knock out all three oracles in the same prize match', reqPt: 'Elimine os três oráculos na mesma partida valendo prêmio' },
    M4: { tag: 'poker-oscar-bluff', name: 'Oscar Bluff', emoji: '🏆', mark: 'oscar_bluff',
      req: 'Win a pot of 20+ big blinds without showdown while someone who folded had the better hand',
      reqPt: 'Leve um pote de 20 BB ou mais sem showdown, com alguém que desistiu tendo mão melhor' },
    M5: { tag: 'poker-seven-nights', name: 'Seven Nights', emoji: '🌙', mark: 'seven_nights',
      req: 'Finish a prize match on 7 days in a row', reqPt: 'Termine uma partida valendo prêmio em 7 dias seguidos' },
  };
  const rows = MARKS.map((m) => {
    const meta = META[m.id];
    if (!meta) { errors.push(`marco sem metadados: ${m.id}`); return ''; }
    return `  (${sql(meta.tag)}, ${sql(meta.name)}, ${sql(meta.emoji)},\n` +
      `   ${sql(m.en)},\n   ${sql(m.pt)},\n` +
      `   ${sql(meta.req)},\n   ${sql(meta.reqPt)},\n` +
      `   null, 'custom', ${sql(JSON.stringify({ source: 'poker', mark: meta.mark }))}::jsonb)`;
  });
  return [
    '-- GERADO por scripts/poker/gen-lines.ts (fontes: scripts/poker/falas-src/05-novo.txt, seção 13).',
    '-- As 5 tags dos marcos do poker (SPEC §2.9 e §5.5, item 5). Pacote B escreve; o pacote C aplica',
    '-- dentro da migração dele. `description` (en) e `description_pt` estão na voz do oráculo do marco;',
    '-- `requirement_description*` é a regra em texto simples. starts_at fica com o padrão da tabela.',
    '-- Idempotente: on conflict (id) do nothing (não sobrescreve um texto já ajustado à mão).',
    '',
    'insert into public.special_tags',
    '  (id, name, emoji, description, description_pt, requirement_description, requirement_description_pt,',
    '   ends_at, requirement_type, requirement_data)',
    'values',
    rows.join(',\n'),
    'on conflict (id) do nothing;',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Markdown de leitura (porte do gen_falas.py do roteirista)
// ---------------------------------------------------------------------------

const NAMES: Record<'pt' | 'en', Record<string, string>> = {
  pt: { bogart: 'Sapo', cypher: 'Cobra', fincher: 'Raposo', visita: 'Visita' },
  en: { bogart: 'Frog', cypher: 'Snake', fincher: 'Fox', visita: 'Guest' },
};

function countsMd(lang: 'pt' | 'en'): string {
  const nm = NAMES[lang];
  const whos = ['bogart', 'cypher', 'fincher', 'visita'];
  const short = (t: string): boolean => measure(t, lang) <= SHORT_CHARS;
  const all = [...entries.values()];   // como no gen_falas.py: os textos dos marcos também contam
  const head = lang === 'pt'
    ? '| Quem | Falas soltas | Em trocas | Total | Curtas (≤44) |\n|---|---|---|---|---|\n'
    : '| Who | Single lines | In exchanges | Total | Short (≤44) |\n|---|---|---|---|---|\n';
  let tSolo = 0; let tX = 0; let tSh = 0;
  const rows = whos.map((w) => {
    const solo = all.filter((e) => e.who === w);
    const xs = allX.flatMap((x) => x.parts).filter((p) => !p.ref && p.who === w);
    const sh = solo.filter((e) => short(e[lang])).length + xs.filter((p) => short(p[lang])).length;
    tSolo += solo.length; tX += xs.length; tSh += sh;
    return `| ${nm[w]} | ${solo.length} | ${xs.length} | ${solo.length + xs.length} | ${sh} |`;
  });
  rows.push(`| **Total** | ${tSolo} | ${tX} | **${tSolo + tX}** | ${tSh} |`);
  const ex = allX.filter((x) => x.parts.length >= 2).length;
  const solo = allX.length - ex;
  const tail = lang === 'pt'
    ? `\n\n**${ex} trocas atômicas** (2 ou 3 balões), mais ${solo} despedidas de um balão só. Falas reaproveitadas por referência (\`@id\`) não contam duas vezes.`
    : `\n\n**${ex} atomic exchanges** (2 or 3 balloons), plus ${solo} single-balloon farewells. Lines reused by reference (\`@id\`) are not counted twice.`;
  return head + rows.join('\n') + tail;
}

function esc(t: string): string {
  return t.replace(/\|/g, '\\|');
}

function renderMd(lang: 'pt' | 'en'): string {
  const nm = NAMES[lang];
  const out: string[] = [];
  const table: string[] = [];
  const flush = (): void => { if (table.length) { out.push(...table, ''); table.length = 0; } };
  const head = lang === 'pt'
    ? ['| id | oráculo | evento | contexto | cue | P | marcas | fala | car. |', '|---|---|---|---|---|---|---|---|---|']
    : ['| id | oracle | event | context | cue | P | flags | line | chars |', '|---|---|---|---|---|---|---|---|---|'];
  for (const it of items) {
    if (it.k === 'e') {
      const e = it.e;
      if (!table.length) table.push(...head);
      const text = e[lang];
      const n = measure(text, lang);
      const fl = e.flags === '-' ? [] : e.flags.split(',').filter((f) => f && f !== '-');
      if (n <= SHORT_CHARS) fl.unshift(lang === 'pt' ? 'curta' : 'short');
      table.push(`| ${e.id} | ${nm[e.who]} | \`${e.ev}\` | ${esc(e.ctx)} | ${e.cue} | ${e.P} | ${fl.join(', ') || '—'} | ${esc(text)} | ${n} |`);
      continue;
    }
    flush();
    if (it.k === 'h') out.push(`${'#'.repeat(it.lvl + 1)} ${lang === 'pt' ? it.pt : it.en}`, '');
    else if (it.k === 'p') out.push(lang === 'pt' ? it.pt : it.en, '');
    else {
      const x = it.x;
      const fl = x.flags === '-' ? [] : x.flags.split(',').filter((f) => f && f !== '-');
      const meta = [`\`${x.ev}\``, ...(x.ctx !== '-' ? [x.ctx] : []), x.P, lang === 'pt' ? 'atômica' : 'atomic', ...fl].join(' · ');
      out.push(`**${x.id} · ${lang === 'pt' ? x.tpt : x.ten}** — ${meta}`, '');
      x.parts.forEach((p, i) => {
        const t = p[lang];
        const n = measure(t, lang);
        const sh = n <= SHORT_CHARS ? (lang === 'pt' ? ' · curta' : ' · short') : '';
        out.push(`${i + 1}. **${nm[p.who]}:** ${t} *(${n}${sh})${p.ref ? ` (= ${p.ref})` : ''}*`);
      });
      out.push('');
    }
  }
  flush();
  return out.join('\n');
}

function tutorialMd(lang: 'pt' | 'en'): string {
  const tpl = readFileSync(join(SRC, `tutorial.${lang}.tpl`), 'utf8');
  return tpl.replace(/\{\{([A-Z0-9-]+)\}\}/g, (_m, id: string) => {
    const e = entries.get(id);
    if (!e) { errors.push(`tutorial: ${id} inexistente`); return id; }
    return `**${NAMES[lang][e.who]}:** ${e[lang]} \`${id}\``;
  });
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const mdDir = args.includes('--md') ? args[args.indexOf('--md') + 1] : null;
const checkOnly = args.includes('--check');

const outputs: [string, string][] = [
  [join(OUT_DIALOGUE, 'lines.pt.ts'), emitPt()],
  [join(OUT_DIALOGUE, 'lines.en.ts'), emitEn()],
  [join(OUT_DIALOGUE, 'quips.ts'), emitQuips()],
  [OUT_MARKS, emitMarks()],
];
if (mdDir) {
  const ptHead = readFileSync(join(SRC, 'header.pt.md'), 'utf8');
  const enHead = readFileSync(join(SRC, 'header.en.md'), 'utf8');
  outputs.push([join(mdDir, 'banco-v1.md'), ptHead.replace('{{COUNTS}}', countsMd('pt')) + '\n' + renderMd('pt')]);
  outputs.push([join(mdDir, 'banco-v1.en.md'), enHead.replace('{{COUNTS}}', countsMd('en')) + '\n' + renderMd('en') + '\n' + tutorialMd('en')]);
  outputs.push([join(mdDir, 'tutorial.md'), tutorialMd('pt')]);
}

if (errors.length) {
  console.error('ERROS:\n' + errors.join('\n'));
  process.exit(1);
}
if (!checkOnly) {
  for (const [path, body] of outputs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body, 'utf8');
  }
}

const by = (who: string): number => LINES.filter((l) => l.speaker === who).length + QUIP_LINES.filter((l) => l.speaker === who).length;
const inX = (who: string): number => EXCHANGES.flatMap((x) => x.parts).filter((p) => p.speaker === who).length;
console.log(countsMd('pt'));
console.log('');
console.log(`Gerado: ${LINES.length} falas + ${QUIP_LINES.length} respostas de réplica, ${EXCHANGES.length} trocas ` +
  `(${EXCHANGES.filter((x) => x.farewell).length} despedidas), ${QUIPS.length} réplicas, ${MARKS.length} marcos.`);
console.log(`Por oráculo (soltas + réplicas | balões em trocas): Sapo ${by('bogart')} | ${inX('bogart')}, ` +
  `Cobra ${by('cypher')} | ${inX('cypher')}, Raposo ${by('fincher')} | ${inX('fincher')}.`);
if (checkOnly) console.log('(--check: nada foi gravado)');
