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
    nameClassName: 'text-gray-900 dark:text-white',
    secondaryClassName: 'text-gray-600 dark:text-gray-300',
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
  // Cor específica — gradiente de 5 cores saturadas deslizando pelo
  // texto, remetendo ao processo Technicolor clássico de Hollywood (as
  // cores extremamente vívidas de filmes como O Mágico de Oz). Uma
  // única direção de gradiente sempre em movimento, nunca uma cor fixa.
  technicolor: {
    id: 'technicolor',
    name: 'Technicolor',
    isPremium: true,
    requiredTag: 'Screenwriter',
    requiredReviewCount: 10,
    nameClassName: "bg-[length:300%_auto] bg-[linear-gradient(90deg,#ef4444,#facc15,#22c55e,#3b82f6,#a855f7,#ef4444)] bg-clip-text text-transparent animate-technicolor-shift",
    secondaryClassName: "bg-[length:300%_auto] bg-[linear-gradient(90deg,#ef4444,#facc15,#22c55e,#3b82f6,#a855f7,#ef4444)] bg-clip-text text-transparent animate-technicolor-shift opacity-80",
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
    nameClassName: 'text-amber-300 animate-marquee-glow',
    secondaryClassName: 'text-amber-100/90 animate-marquee-glow',
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