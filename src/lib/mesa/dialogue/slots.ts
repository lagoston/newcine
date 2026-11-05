/**
 * Os slots das falas (SPEC §3.4): os nomes que o servidor não manda prontos.
 *
 * O Diretor roda fora do React (e no node, nos testes), então não usa o i18n do
 * site: os nomes dos humores e das ocasiões estão copiados aqui dos locales
 * (`oracle.moods.*`) e do §4.2. Se um nome mudar lá, mude aqui também (05/11/2026).
 */
import type { Lang } from './types.ts';

export const MOOD_NAME: Record<Lang, Record<string, string>> = {
  pt: {
    'mind-blowing': 'Mind-Blowing', 'dark-and-scary': 'Sombrio e Assustador', 'drug-trip': 'Psicodélico',
    adventures: 'Aventuras', catharsis: 'Catarse', adrenaline: 'Adrenalina', romantic: 'Romântico',
    'family-time': 'Família', 'laugh-out-loud': 'Muitas Risadas',
  },
  en: {
    'mind-blowing': 'Mind-Blowing', 'dark-and-scary': 'Dark & Scary', 'drug-trip': 'Psychedelic',
    adventures: 'Adventures', catharsis: 'Catharsis', adrenaline: 'Adrenaline', romantic: 'Romantic',
    'family-time': 'Family Time', 'laugh-out-loud': 'Laugh Out Loud',
  },
};

/** As 12 ocasiões e as duas da época (§4.2, §4.3). As chaves são as do banco. */
export const OCCASION_NAME: Record<Lang, Record<string, string>> = {
  pt: {
    chuva: 'Só eu e a chuva', amor: 'Com quem eu amo', familia: 'Domingo em família', galera: 'Com a galera',
    noventa: 'Tenho 90 minutos', episodio: 'Só um episódio', maratona: 'Maratona de fim de semana',
    chorar: 'Quero chorar', rir: 'Quero rir alto', susto: 'Quero levar um susto', no: 'Um nó na cabeça',
    colo: 'Dia ruim, quero colo', halloween: 'Noite de Halloween', christmas: 'Clima de Natal',
  },
  en: {
    chuva: 'Just me and the rain', amor: 'With the one I love', familia: 'Family Sunday', galera: 'With the crew',
    noventa: "I've got 90 minutes", episodio: 'Just one episode', maratona: 'Weekend binge',
    chorar: 'I want a good cry', rir: 'Make me laugh out loud', susto: 'Scare me', no: 'Twist my brain',
    colo: 'Bad day, comfort me', halloween: 'Halloween night', christmas: 'Christmas mood',
  },
};
export const OCCASION_IDS = Object.keys(OCCASION_NAME.pt);

export const WEEKDAY_NAME: Record<Lang, string[]> = {
  pt: ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
export const WEEKDAY_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * `{de_pais}`: as origens mais comuns do acervo, com a contração pronta. Fora da
 * tabela, a fala que usa o slot fica inelegível (o Diretor sorteia outra).
 */
export const DE_PAIS: Record<Lang, Record<string, string>> = {
  pt: {
    US: 'dos Estados Unidos', BR: 'do Brasil', KR: 'da Coreia do Sul', JP: 'do Japão', FR: 'da França',
    IT: 'da Itália', DE: 'da Alemanha', ES: 'da Espanha', GB: 'do Reino Unido', IN: 'da Índia', CN: 'da China',
    HK: 'de Hong Kong', TW: 'de Taiwan', MX: 'do México', AR: 'da Argentina', CL: 'do Chile', CO: 'da Colômbia',
    CA: 'do Canadá', AU: 'da Austrália', NZ: 'da Nova Zelândia', IE: 'da Irlanda', SE: 'da Suécia',
    DK: 'da Dinamarca', NO: 'da Noruega', FI: 'da Finlândia', IS: 'da Islândia', PL: 'da Polônia',
    RU: 'da Rússia', SU: 'da União Soviética', CZ: 'da República Tcheca', XC: 'da Tchecoslováquia',
    HU: 'da Hungria', RO: 'da Romênia', GR: 'da Grécia', TR: 'da Turquia', IR: 'do Irã', IL: 'de Israel',
    EG: 'do Egito', BE: 'da Bélgica', NL: 'da Holanda', CH: 'da Suíça', AT: 'da Áustria', PT: 'de Portugal',
    TH: 'da Tailândia', ID: 'da Indonésia', PH: 'das Filipinas', ZA: 'da África do Sul', NG: 'da Nigéria',
    SN: 'do Senegal', LB: 'do Líbano', VN: 'do Vietnã', PE: 'do Peru', CU: 'de Cuba', UY: 'do Uruguai',
  },
  en: {
    US: 'from the United States', BR: 'from Brazil', KR: 'from South Korea', JP: 'from Japan', FR: 'from France',
    IT: 'from Italy', DE: 'from Germany', ES: 'from Spain', GB: 'from the UK', IN: 'from India', CN: 'from China',
    HK: 'from Hong Kong', TW: 'from Taiwan', MX: 'from Mexico', AR: 'from Argentina', CL: 'from Chile',
    CO: 'from Colombia', CA: 'from Canada', AU: 'from Australia', NZ: 'from New Zealand', IE: 'from Ireland',
    SE: 'from Sweden', DK: 'from Denmark', NO: 'from Norway', FI: 'from Finland', IS: 'from Iceland',
    PL: 'from Poland', RU: 'from Russia', SU: 'from the Soviet Union', CZ: 'from the Czech Republic',
    XC: 'from Czechoslovakia', HU: 'from Hungary', RO: 'from Romania', GR: 'from Greece', TR: 'from Turkey',
    IR: 'from Iran', IL: 'from Israel', EG: 'from Egypt', BE: 'from Belgium', NL: 'from the Netherlands',
    CH: 'from Switzerland', AT: 'from Austria', PT: 'from Portugal', TH: 'from Thailand', ID: 'from Indonesia',
    PH: 'from the Philippines', ZA: 'from South Africa', NG: 'from Nigeria', SN: 'from Senegal',
    LB: 'from Lebanon', VN: 'from Vietnam', PE: 'from Peru', CU: 'from Cuba', UY: 'from Uruguay',
  },
};

/** Apelido que o Fincher dá à pessoa: "estreante" até 30 notas, "colega" depois. */
export function estreante(rated: number, lang: Lang): string {
  if (lang === 'pt') return rated >= 30 ? 'colega' : 'estreante';
  return rated >= 30 ? 'partner' : 'kid';
}

export function formatInt(n: number, lang: Lang): string {
  const s = String(Math.round(Math.abs(n)));
  return (n < 0 ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'pt' ? '.' : ',');
}

/** 5,1 em pt; 5.1 em en. */
export function formatDecimal(n: number, lang: Lang): string {
  const s = (Math.round(n * 10) / 10).toFixed(1);
  return lang === 'pt' ? s.replace('.', ',') : s;
}

/** 167 → "2h47"; 58 → "58 min". */
export function formatRuntime(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** "1970s" → "anos 70" / "the '70s"; "2000s" → "anos 2000" / "the 2000s". */
export function formatDecade(decade: string | null, lang: Lang): string | null {
  const m = decade ? /^(\d{4})s?$/.exec(decade.trim()) : null;
  if (!m) return null;
  const y = Number(m[1]);
  if (y >= 2000) return lang === 'pt' ? `anos ${y}` : `the ${y}s`;
  const yy = String(y).slice(2);
  return lang === 'pt' ? `anos ${yy}` : `the '${yy}s`;
}

/** `{titulo}`: até 32 caracteres, com corte e "…". */
export function truncateTitle(t: string, max = 32): string {
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/[\s,:;.-]+$/, '') + '…';
}

/** Dia da semana (0 = domingo) de uma data "AAAA-MM-DD" (sem fuso: é só o calendário). */
export function weekdayOfIso(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const w = d.getUTCDay();
  return Number.isFinite(w) ? w : null;
}

/** Diferença em dias entre duas datas "AAAA-MM-DD" (b − a). */
export function dayDiff(a: string, b: string): number {
  const pa = /^(\d{4})-(\d{2})-(\d{2})/.exec(a);
  const pb = /^(\d{4})-(\d{2})-(\d{2})/.exec(b);
  if (!pa || !pb) return Number.POSITIVE_INFINITY;
  const ta = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]));
  const tb = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]));
  return Math.round((tb - ta) / 86400000);
}
