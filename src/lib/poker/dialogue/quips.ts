// GERADO por scripts/poker/gen-lines.ts a partir de scripts/poker/falas-src/ (Réplicas da visita, §7.8).
// Não edite à mão: mude as fontes e rode `node scripts/poker/gen-lines.ts`.

import type { Line, QuipPack } from './types.ts';

/** Pacotes de Réplicas por id do item (`poker_items`). O padrão é `quips-padrao`. */
export const QUIP_PACKS: Record<string, QuipPack> = {
  'quips-padrao': { id: 'quips-padrao', quips: [
    { id: "R1", pt: "Pede pra sair?", en: "Feeling lucky?" },
    { id: "R2", pt: "Já vi esse filme.", en: "I've seen this movie." },
    { id: "R3", pt: "Spoiler: eu ganho.", en: "Spoiler: I win." },
    { id: "R4", pt: "Bela atuação.", en: "Nice acting." },
  ] },
};

/** Respostas dos oráculos (gatilho `quipAnswer`, variante = id da réplica). Todas curtas. */
export const QUIP_LINES: Line[] = [
  { id: "QB1a", speaker: "bogart", on: "quipAnswer", role: "any", variant: ["R1"], cue: ["confiante","nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Sair? Eu já paguei o ingresso!" },
  { id: "QB1b", speaker: "bogart", on: "quipAnswer", role: "any", variant: ["R1"], cue: ["nervoso"], out: "also", curta: true, priority: 1, emote: "sweat", pt: "Peço. Posso? Não? Tá, eu fico." },
  { id: "QB1c", speaker: "bogart", on: "quipAnswer", role: "any", variant: ["R1"], cue: ["confiante","nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Sapo não pede pra sair. Pede pipoca." },
  { id: "QC1a", speaker: "cypher", on: "quipAnswer", role: "any", variant: ["R1"], cue: ["confiante","nervoso","calado","neutro"], out: "also", curta: true, priority: 1, pt: "Eu só saio daqui arrastada." },
  { id: "QC1b", speaker: "cypher", on: "quipAnswer", role: "any", variant: ["R1"], cue: ["confiante","nervoso","calado","neutro"], out: "also", curta: true, priority: 1, pt: "Sair? Eu rastejo pra dentro." },
  { id: "QC1c", speaker: "cypher", on: "quipAnswer", role: "any", variant: ["R1"], cue: ["confiante","nervoso","calado","neutro"], out: "also", curta: true, priority: 1, pt: "Fofo. Repete mais devagar." },
  { id: "QF1a", speaker: "fincher", on: "quipAnswer", role: "any", variant: ["R1"], cue: ["nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Saio quando a fita acabar." },
  { id: "QF1b", speaker: "fincher", on: "quipAnswer", role: "any", variant: ["R1"], cue: ["nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Sento aqui desde o cinema mudo." },
  { id: "QF1c", speaker: "fincher", on: "quipAnswer", role: "any", variant: ["R1"], cue: ["nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Pergunte de novo daqui a dez mãos." },
  { id: "QB2a", speaker: "bogart", on: "quipAnswer", role: "any", variant: ["R2"], cue: ["confiante","nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Viu? E gostou? Dá nota!" },
  { id: "QB2b", speaker: "bogart", on: "quipAnswer", role: "any", variant: ["R2"], cue: ["confiante","nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Spoiler não! Eu tô no meio ainda!" },
  { id: "QB2c", speaker: "bogart", on: "quipAnswer", role: "any", variant: ["R2"], cue: ["confiante","nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Eu também vi. Dormi no meio." },
  { id: "QC2a", speaker: "cypher", on: "quipAnswer", role: "any", variant: ["R2"], cue: ["confiante","nervoso","calado","neutro"], out: "also", curta: true, priority: 1, pt: "Viu a versão com cortes. Eu sou a sem." },
  { id: "QC2b", speaker: "cypher", on: "quipAnswer", role: "any", variant: ["R2"], cue: ["confiante","nervoso","calado","neutro"], out: "also", curta: true, priority: 1, pt: "Então sabe que acaba mal. Pra você." },
  { id: "QC2c", speaker: "cypher", on: "quipAnswer", role: "any", variant: ["R2"], cue: ["confiante","nervoso","calado","neutro"], out: "also", curta: true, priority: 1, pt: "Ninguém viu esse. Foi banido." },
  { id: "QF2a", speaker: "fincher", on: "quipAnswer", role: "any", variant: ["R2"], cue: ["nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Viu. Mas não entendeu o final." },
  { id: "QF2b", speaker: "fincher", on: "quipAnswer", role: "any", variant: ["R2"], cue: ["nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Eu dirigi esse filme." },
  { id: "QF2c", speaker: "fincher", on: "quipAnswer", role: "any", variant: ["R2"], cue: ["nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Todo mundo viu. Poucos lembram." },
  { id: "QB3a", speaker: "bogart", on: "quipAnswer", role: "any", variant: ["R3"], cue: ["confiante","nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "SPOILER?! Tampa os ouvidos, gente!" },
  { id: "QB3b", speaker: "bogart", on: "quipAnswer", role: "any", variant: ["R3"], cue: ["confiante","nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Spoiler é crime. Eu sei. Fui crítico." },
  { id: "QB3c", speaker: "bogart", on: "quipAnswer", role: "any", variant: ["R3"], cue: ["confiante","nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Ganha nada. Li o roteiro. Mentira." },
  { id: "QC3a", speaker: "cypher", on: "quipAnswer", role: "any", variant: ["R3"], cue: ["confiante","nervoso","calado","neutro"], out: "also", curta: true, priority: 1, pt: "Spoiler falso. Adoro. É meu gênero." },
  { id: "QC3b", speaker: "cypher", on: "quipAnswer", role: "any", variant: ["R3"], cue: ["confiante","nervoso","calado","neutro"], out: "also", curta: true, priority: 1, pt: "O roteiro mudou. Eu reescrevi." },
  { id: "QC3c", speaker: "cypher", on: "quipAnswer", role: "any", variant: ["R3"], cue: ["confiante","nervoso","calado","neutro"], out: "also", curta: true, priority: 1, pt: "Ganha. Na versão que ninguém vai ver." },
  { id: "QF3a", speaker: "fincher", on: "quipAnswer", role: "any", variant: ["R3"], cue: ["nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Final anunciado é final ruim." },
  { id: "QF3b", speaker: "fincher", on: "quipAnswer", role: "any", variant: ["R3"], cue: ["nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Já ouvi isso. Em 1961. Ele perdeu." },
  { id: "QF3c", speaker: "fincher", on: "quipAnswer", role: "any", variant: ["R3"], cue: ["nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Veremos na última cena." },
  { id: "QB4a", speaker: "bogart", on: "quipAnswer", role: "any", variant: ["R4"], cue: ["confiante","nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Obrigado! Treino no espelho do brejo." },
  { id: "QB4b", speaker: "bogart", on: "quipAnswer", role: "any", variant: ["R4"], cue: ["nervoso"], out: "also", curta: true, priority: 1, emote: "sweat", pt: "Atuação? Isso é nervoso de verdade!" },
  { id: "QB4c", speaker: "bogart", on: "quipAnswer", role: "any", variant: ["R4"], cue: ["confiante"], out: "also", curta: true, priority: 1, pt: "Nota 10 pra mim. Concordo." },
  { id: "QC4a", speaker: "cypher", on: "quipAnswer", role: "any", variant: ["R4"], cue: ["confiante","nervoso","calado","neutro"], out: "also", curta: true, priority: 1, pt: "Atuação? Eu nem comecei." },
  { id: "QC4b", speaker: "cypher", on: "quipAnswer", role: "any", variant: ["R4"], cue: ["confiante","nervoso","calado","neutro"], out: "also", curta: true, priority: 1, pt: "Guarde os aplausos pro final." },
  { id: "QC4c", speaker: "cypher", on: "quipAnswer", role: "any", variant: ["R4"], cue: ["confiante","nervoso","calado","neutro"], out: "also", curta: true, priority: 1, pt: "Eu atuo. Você assiste. Funciona." },
  { id: "QF4a", speaker: "fincher", on: "quipAnswer", role: "any", variant: ["R4"], cue: ["nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Quarenta anos de ensaio." },
  { id: "QF4b", speaker: "fincher", on: "quipAnswer", role: "any", variant: ["R4"], cue: ["nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Ninguém atua. Todos mentem." },
  { id: "QF4c", speaker: "fincher", on: "quipAnswer", role: "any", variant: ["R4"], cue: ["nervoso","neutro"], out: "also", curta: true, priority: 1, pt: "Obrigado. A sua precisa de ensaio." },
];
