import type { PersonaWorld, WorldState } from '../../../lib/personaWorld';
import type { MoodItemArt, MoodItemId } from './types';
import sculpture from './sculpture';
import lavalamp from './lavalamp';
import souljar from './souljar';
import kart from './kart';
import loveseat from './loveseat';
import fort from './fort';
import fridge from './fridge';

export type { MoodItemArt, MoodItemId } from './types';

// Os móveis dos humores (17/11/2026). Pedido do Bruno: "Exceto para Bloody
// Mary e trailblazer que as tags já liberam cards de oráculos, vamos dar um
// móvel do estúdio personalizado para cada mood. Pense em coisas, normais tal
// qual um puff, ou exótica como um sarcófago faraônico que remetam mesmo que
// indiretamente a ele". As escolhas dele, na mesma noite:
//   • Mind-Blowing (🧩 Enigmatic): a escultura impossível, um triângulo de
//     Penrose com um pião que gira no alto e nunca cai;
//   • Psicodélico (🍭 Dreamwalker): a luminária de lava, de chão;
//   • Catarse (☯️ Soul Collector): a redoma das almas, duas luzinhas, uma
//     clara e uma escura, girando uma em volta da outra;
//   • Adrenalina (🧨 Daredevil): um simulador de kart ("ideia melhor" que o
//     assento ejetável, que fica de reserva);
//   • Romântico (💕 Cine Cupid): a namoradeira;
//   • Família (🧚‍♂️ Peter Pan): a cabana de cobertor;
//   • Muitas Risadas (😂 Punchliner): um frigobar aberto, com latas caídas.
//
// O móvel chega junto com a tag: 50 títulos avaliados da prateleira (a mesma
// conta da tag e da Persona, is_progression_tag_unlocked; aqui ela vem pronta
// em st.films, de get_user_persona). Nada novo no banco: o app antigo segue
// igual, e a barra da Evolução, que volta no tempo, mostra o móvel chegando
// no 50º título.
//
// Tocar no móvel faz ele reagir (pixel.ts, pokeFrame) e abre um cartãozinho
// com o que a pessoa tem daquele humor (MoodObjectCard): quantos títulos, a
// média e o favorito. Ideia do Bruno: "o estúdio do usuário é pra ser uma
// representação dele, então nada mais justo que essas coisas terem ao toque
// coisas que remetam as estatísticas ou filmes do usuário".
//
// O lugar de costume de cada um evita os dois lugares diante da máquina do
// Jackpot e da estante do guia (4 e 5): com a sala cheia o móvel vai para o
// lugar livre mais perto e, sem nenhum livre, fica guardado no inventário.

export const MOOD_ITEM_GOAL = 50;

export interface MoodItem {
  id: MoodItemId;
  // a letra da prateleira (moods.ts)
  letter: string;
  // a tag que vem junto (o nome, como em lib/tags.ts)
  tag: string;
  // o lugar de costume (o número em PLACES)
  home: number;
  art: MoodItemArt;
}

// na ordem das letras da Persona (M X P A C Z R F L), sem a X e a A
export const MOOD_ITEMS: MoodItem[] = [
  { id: 'sculpture', letter: 'M', tag: 'Enigmatic', home: 3, art: sculpture },
  { id: 'lavalamp', letter: 'P', tag: 'Dreamwalker', home: 7, art: lavalamp },
  { id: 'souljar', letter: 'C', tag: 'Soul Collector', home: 0, art: souljar },
  { id: 'kart', letter: 'Z', tag: 'Daredevil', home: 11, art: kart },
  { id: 'loveseat', letter: 'R', tag: 'Cine Cupid', home: 9, art: loveseat },
  { id: 'fort', letter: 'F', tag: 'Peter Pan', home: 10, art: fort },
  { id: 'fridge', letter: 'L', tag: 'Punchliner', home: 12, art: fridge },
];
export const MOOD_ITEM_IDS: MoodItemId[] = MOOD_ITEMS.map((item) => item.id);
export const isMoodItem = (id: string): id is MoodItemId => (MOOD_ITEM_IDS as string[]).includes(id);
export const moodItemOf = (id: MoodItemId): MoodItem => MOOD_ITEMS.find((item) => item.id === id) as MoodItem;

// A pessoa tem o móvel? (o estúdio completo da Conta Diretor mostra todos)
export const hasMoodItem = (world: PersonaWorld, st: Pick<WorldState, 'films'>, item: MoodItem): boolean =>
  (st.films[item.letter] ?? 0) >= MOOD_ITEM_GOAL || Boolean(world.preview);
