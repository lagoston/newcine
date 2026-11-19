// Plugin do PostCSS (18/11/2026, Protocolo Reborn, onda 2a — bateria).
//
// O QUE FAZ. Para cada bloco
//     @media (prefers-reduced-motion: reduce) { .x { animation: none } }
// do CSS do site (os nossos arquivos e as classes motion-reduce: do Tailwind),
// acrescenta logo depois uma cópia que vale dentro de .co-still:
//     .x:where(.co-still, .co-still *) { animation: none }
//
// PARA QUE. .co-still no <html> é o MODO ECONOMIA (src/lib/motion.ts); num
// elemento só, é a moldura de avatar parada nas listas (UserAvatar). Com a
// cópia, os dois mostram exatamente o que "reduzir movimento" já mostra — os
// repousos que cada peça já tem desenhados — sem escrever (e manter) uma
// segunda lista de regras à mão. Animação nova: basta o bloco de "reduzir
// movimento" de sempre (o `npm run check:motion` avisa quando falta).
//
// COMO. O :where() não soma especificidade e a cópia fica colada no bloco
// original: na cascata ela vale exatamente o que o @media vale. A marca entra
// no PRIMEIRO pedaço do seletor (".a .b::before" vira
// ".a:where(.co-still, .co-still *) .b::before"): o elemento é .co-still ou
// está dentro de um.
const FEATURE = /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i;
const SCOPE = ':where(.co-still, .co-still *)';
const LEGACY_PSEUDO_ELEMENTS = /^:(before|after|first-line|first-letter)\b/i;

// Onde termina o primeiro pedaço do seletor (antes do primeiro combinador) e,
// se ele tiver pseudo-elemento (::before), onde o pseudo-elemento começa.
export function scopeSelector(selector) {
  const sel = selector.trim();
  let depth = 0;
  let quote = null;
  let end = sel.length;
  let pseudoAt = -1;
  for (let i = 0; i < sel.length; i += 1) {
    const ch = sel[i];
    if (ch === '\\') {
      i += 1; // caractere escapado (classes do Tailwind: .sm\:x)
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (depth !== 0) continue;
    if (ch === ':' && pseudoAt < 0 && (sel[i + 1] === ':' || LEGACY_PSEUDO_ELEMENTS.test(sel.slice(i)))) pseudoAt = i;
    if (ch === ' ' || ch === '>' || ch === '+' || ch === '~' || ch === '\n' || ch === '\t') {
      end = i;
      break;
    }
  }
  if (end === 0) return null; // começa por combinador: não é um seletor comum
  const cut = pseudoAt >= 0 && pseudoAt < end ? pseudoAt : end;
  return `${sel.slice(0, cut)}${SCOPE}${sel.slice(cut)}`;
}

const insideKeyframes = (rule) => {
  for (let p = rule.parent; p; p = p.parent) if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return true;
  return false;
};

export default function stillMotion() {
  return {
    postcssPlugin: 'cineoracle-still-motion',
    OnceExit(root, { result }) {
      const blocks = [];
      root.walkAtRules('media', (atRule) => {
        if (FEATURE.test(atRule.params)) blocks.push(atRule);
      });
      for (const atRule of blocks) {
        const copy = atRule.clone();
        let skipped = false;
        copy.walkRules((rule) => {
          if (insideKeyframes(rule)) return;
          const scoped = rule.selectors.map(scopeSelector);
          if (scoped.includes(null)) {
            skipped = true;
            rule.remove();
            return;
          }
          rule.selectors = scoped;
        });
        if (skipped) result.warn('still-motion: seletor que começa por combinador ficou fora da cópia', { node: atRule });
        const rest = atRule.params.replace(FEATURE, '').trim();
        if (rest === '') {
          // só a condição de movimento: a cópia vale sempre (sem @media)
          atRule.after(copy.nodes ?? []);
        } else {
          // havia outra condição junto (ex.: largura): ela continua valendo
          copy.params = atRule.params.replace(FEATURE, '(min-width: 0px)');
          atRule.after(copy);
        }
      }
    },
  };
}
stillMotion.postcss = true;
