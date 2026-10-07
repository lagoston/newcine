// Molduras de avatar. O desenho de cada uma mora em src/styles/cosmetics.css
// (classes .co-frame--<id>): um aro em gradiente por cima da borda da foto,
// um detalhe temático fino sobre a foto e um brilho externo na cor do tema.
// Aqui ficam só os metadados — nome, se é Premium e qual tag desbloqueia —
// e a classe que o wrapper redondo do avatar recebe (ele já tem
// rounded-full + overflow-hidden).
//
// requiredTag precisa bater com is_required_tag_met() no banco, que é quem
// valida o desbloqueio de verdade (set_user_cosmetic).

export const frames = {
  gold: {
    id: 'gold',
    name: 'Gold Frame',
    isPremium: true,
    requiredTag: null,
    className: 'co-frame co-frame--gold',
  },
  matrix: {
    id: 'matrix',
    name: 'Matrix Frame',
    isPremium: true,
    requiredTag: 'red-pill-adept',
    className: 'co-frame co-frame--matrix',
  },
  saw: {
    id: 'saw',
    name: 'Saw Frame',
    isPremium: true,
    requiredTag: 'visceral-gamer',
    className: 'co-frame co-frame--saw',
  },
  ice: {
    id: 'ice',
    name: 'Ice Age Frame',
    isPremium: true,
    requiredTag: 'nuts',
    className: 'co-frame co-frame--ice',
  },
  bttf: {
    id: 'bttf',
    name: 'Back to the Future Frame',
    isPremium: true,
    requiredTag: 'flux-capacitor-fan',
    className: 'co-frame co-frame--bttf',
  },
  potter: {
    id: 'potter',
    name: 'Harry Potter Frame',
    isPremium: true,
    requiredTag: 'hogwarts-graduate',
    className: 'co-frame co-frame--potter',
  },
  transformers: {
    id: 'transformers',
    name: 'Transformers Frame',
    isPremium: true,
    requiredTag: 'cybertron-sentinel',
    className: 'co-frame co-frame--transformers',
  },
  'death-dodger': {
    id: 'death-dodger',
    name: 'Death Dodger Frame',
    isPremium: true,
    requiredTag: 'death-dodger',
    className: 'co-frame co-frame--death-dodger',
  },
  'casual-drinker': {
    id: 'casual-drinker',
    name: 'Casual Drinker Frame',
    isPremium: true,
    requiredTag: 'casual-drinker',
    className: 'co-frame co-frame--casual-drinker',
  },
  avengers: {
    id: 'avengers',
    name: 'Avengers Frame',
    isPremium: true,
    requiredTag: 'infinity-gauntlet',
    className: 'co-frame co-frame--avengers',
  },
  default: {
    id: 'default',
    name: 'Default',
    isPremium: false,
    requiredTag: null,
    // Sem moldura: quem renderiza troca 'ring-0' por um contorno neutro.
    className: 'ring-0',
  },
  // Motoqueiro Fantasma — precisa de duas faces reais (frente = foto, verso =
  // caveira flamejante) e giro 3D, então é um componente próprio
  // (GhostRiderFrame). renderType:'component' avisa quem renderiza avatar
  // pra usar o componente em vez de aplicar className num wrapper. A classe
  // abaixo é a mesma que o componente usa nas duas faces e serve de reserva
  // caso algum lugar ainda aplique só a classe.
  ghostRider: {
    id: 'ghostRider',
    name: 'Ghost Rider Frame',
    isPremium: true,
    requiredTag: 'hell-rider',
    renderType: 'component',
    component: 'GhostRiderFrame',
    className: 'co-frame co-frame--ghost-rider',
  },
} as const;

export type FrameId = keyof typeof frames;

// Frames com renderType:'component' precisam de tratamento especial em
// qualquer lugar que renderiza avatar+frame — checar isso ANTES de decidir
// se aplica getFrameClass() num wrapper simples ou renderiza um componente
// dedicado. Ver GhostRiderFrame.tsx.
export function frameUsesComponent(frameId: string = 'default', isPremium: boolean = false): string | null {
  const frame = frames[frameId as FrameId];
  if (!frame || (frame.isPremium && !isPremium)) return null;
  return 'renderType' in frame && frame.renderType === 'component' ? frame.component : null;
}

export function getFrameClass(frameId: string = 'default', isPremium: boolean = false): string {
  const frame = frameId ? frames[frameId as FrameId] : undefined;
  if (!frame || (frame.isPremium && !isPremium)) {
    return frames.default.className;
  }
  return frame.className;
}
