// Quando mostrar a revelação da personalidade (o modal grande): uma vez por
// personalidade — na primeira vez que ela surge e sempre que mudar. Saiu da
// Central dos Oráculos (extinta em 02/11/2026) e agora roda na porta da
// Persona, na home.
//
// A marca da última revelação vista. Desde 21/10/2026 guarda o código e o
// filme do personagem ("v3:MAL:607"): quando o Oráculo troca o personagem de
// um código, quem tem esse código vê a revelação de novo. Marcas "v2:" (só o
// código) valem como vistas, menos nos códigos que trocaram de personagem em
// 21/10. Em 28/09 duas letras mudaram (Sombrio e Assustador D → X e
// Adrenalina X → Z): códigos de antes disso (texto puro, sem prefixo) são
// traduzidos, pra ninguém ver uma "Nova revelação" só por causa da letra.

const RECAST_1021 = new Set(['MXA', 'MPF', 'MAL', 'MZL', 'MRL', 'XCR', 'XZF', 'PAL', 'MPR', 'XPF', 'PZF']);
const seenKey = (userId: string) => `cineoracle:persona-seen:${userId}`;

type SeenMark = { code: string; film: number | null };
export type RevealMode = 'first' | 'changed' | 'recast';

const readSeen = (userId: string): SeenMark | null => {
  try {
    const raw = window.localStorage.getItem(seenKey(userId));
    if (!raw) return null;
    if (raw.startsWith('v3:')) {
      const [, code = '', film = ''] = raw.split(':');
      return { code, film: Number(film) || null };
    }
    if (raw.startsWith('v2:')) return { code: raw.slice(3), film: null };
    return { code: raw.replace(/[DX]/g, (letter) => (letter === 'D' ? 'X' : 'Z')), film: null };
  } catch {
    return null;
  }
};

export const markRevealSeen = (userId: string, code: string, film: number | null) => {
  try {
    window.localStorage.setItem(seenKey(userId), `v3:${code}:${film ?? ''}`);
  } catch {
    /* sem armazenamento local: a revelação só volta a aparecer */
  }
};

export const revealModeFor = (userId: string, code: string, film: number | null): RevealMode | null => {
  const seen = readSeen(userId);
  if (!seen) return 'first';
  if (seen.code !== code) return 'changed';
  if (seen.film === null) return RECAST_1021.has(code) ? 'recast' : null;
  return film !== null && seen.film !== film ? 'recast' : null;
};
