// Text Effects — nova categoria de customizáveis, aplicada ao texto do
// "cidadão" no banner do perfil: nome de usuário e bio. Diferente de
// frames/banners (que só exigem Premium + às vezes 1 tag temática),
// cada Text Effect aqui é desbloqueado individualmente por Premium + UMA
// tag de resenha específica — não as 3 juntas:
//   Typewriter     ↔ Scribbler     (>= 1 resenha real)
//   Technicolor    ↔ Screenwriter  (>= 10 resenhas reais)
//   Marquee Lights ↔ Memoirist     (>= 30 resenhas reais)
// Os números vêm direto de lib/tags.ts (minMovies de cada tag) — não são
// escolhidos à parte.

export const textEffects = {
  // Sem nenhum efeito: mantém o mesmo texto neutro que o site sempre
  // usou fora de qualquer banner especial (o antigo caso 'auto' de
  // getBannerTextClass) — cor fixa, não depende mais do banner por trás.
  default: {
    id: 'default',
    name: 'Default',
    isPremium: false,
    requiredTag: null as string | null,
    requiredReviewCount: 0,
    // Tons do padrão noite (PAPER / MIST) — o site inteiro é escuro agora.
    nameClassName: 'text-[#F3EAD3]',
    secondaryClassName: 'text-[#BDB4D6]',
  },
  // "Literalmente uma fonte nova" — Courier Prime, a fonte monoespaçada
  // que é o padrão real da indústria pra roteiros de cinema (todo
  // roteiro profissional de Hollywood é formatado em Courier 12pt).
  // Cursor piscando no final do nome simula datilografia ao vivo — a
  // borda direita (não um caractere ▌) porque escapar Unicode dentro de
  // uma classe arbitrária do Tailwind é frágil entre builds.
  typewriter: {
    id: 'typewriter',
    name: 'Typewriter',
    isPremium: true,
    requiredTag: 'Scribbler',
    requiredReviewCount: 1,
    nameClassName: "font-['Courier_Prime',monospace] tracking-tight pr-[3px] border-r-2 border-current animate-typewriter-cursor-blink",
    secondaryClassName: "font-['Courier_Prime',monospace] tracking-tight",
  },
  // O processo Technicolor clássico de Hollywood (O Mágico de Oz): as cores
  // deslizam pelo texto, sempre em movimento. Tons claros, pra continuarem
  // legíveis no fundo noite; a bio usa a mesma faixa um pouco mais suave.
  technicolor: {
    id: 'technicolor',
    name: 'Technicolor',
    isPremium: true,
    requiredTag: 'Screenwriter',
    requiredReviewCount: 10,
    nameClassName: "bg-[length:300%_auto] bg-[linear-gradient(90deg,#FCA5A5,#FDE68A,#86EFAC,#93C5FD,#D8B4FE,#FCA5A5)] bg-clip-text text-transparent animate-technicolor-shift",
    secondaryClassName: "bg-[length:300%_auto] bg-[linear-gradient(90deg,#FECACA,#FEF3C7,#BBF7D0,#BFDBFE,#E9D5FF,#FECACA)] bg-clip-text text-transparent animate-technicolor-shift",
  },
  // Efeito de texto no mesmo espírito animado dos efeitos de frame —
  // brilho neon pulsante em tom âmbar/vermelho, como as lâmpadas de uma
  // marquise de cinema antiga acendendo e apagando.
  marqueeLights: {
    id: 'marqueeLights',
    name: 'Marquee Lights',
    isPremium: true,
    requiredTag: 'Memoirist',
    requiredReviewCount: 30,
    nameClassName: 'text-amber-200 animate-marquee-glow',
    // Na bio, só a cor quente — o brilho pulsando num parágrafo cansa.
    secondaryClassName: 'text-amber-100/85',
  },
} as const;

export type TextEffectId = keyof typeof textEffects;

// Verifica se o usuário atende ao requisito DESSE efeito específico —
// reaproveitado tal qual em CustomizeModal (pra decidir cadeado de cada
// card individualmente) e Profile (pra decidir se aplica o efeito salvo
// ou cai no texto padrão, caso o usuário tenha perdido acesso por algum
// motivo, ex.: downgrade de plano).
export function meetsTextEffectRequirement(effectId: string, isPremium: boolean, realReviewCount: number): boolean {
  const effect = textEffects[effectId as TextEffectId];
  if (!effect) return false;
  if (!effect.isPremium) return true;
  return isPremium && realReviewCount >= effect.requiredReviewCount;
}

export function getTextEffectNameClass(effectId: string = 'default', isPremium: boolean = false, realReviewCount: number = 0): string {
  const effect = textEffects[effectId as TextEffectId];
  if (!effectId || !effect || !meetsTextEffectRequirement(effectId, isPremium, realReviewCount)) {
    return textEffects.default.nameClassName;
  }
  return effect.nameClassName;
}

export function getTextEffectSecondaryClass(effectId: string = 'default', isPremium: boolean = false, realReviewCount: number = 0): string {
  const effect = textEffects[effectId as TextEffectId];
  if (!effectId || !effect || !meetsTextEffectRequirement(effectId, isPremium, realReviewCount)) {
    return textEffects.default.secondaryClassName;
  }
  return effect.secondaryClassName;
}