import type { ItemEnv, Kit } from '../studio';
import type { Ctx } from '../pixel';

// Os móveis dos humores (17/11/2026): o que cada desenho entrega ao estúdio.
// Ver index.ts.

export type MoodItemId = 'sculpture' | 'lavalamp' | 'souljar' | 'kart' | 'loveseat' | 'fort' | 'fridge';

// O desenho parado, com o canto de trás do chão do objeto em (x, y), em
// ladrilhos. Vai para a sala uma vez (drawRoom).
export type MoodDraw = (k: Kit, ctx: Ctx, x: number, y: number, env: ItemEnv) => void;
// O que se mexe, por cima do desenho parado, a cada quadro (8 por segundo).
// still = "reduzir movimento" (ou um quadro parado: o inventário, o guia):
// desenhe o estado mais bonito, aceso, sem depender de tick.
export type MoodPaint = (k: Kit, ctx: Ctx, x: number, y: number, env: ItemEnv, tick: number, still: boolean) => void;

export interface MoodItemArt {
  // o chão que o objeto ocupa (ladrilhos; no máximo 1,3 × 1,3, o tamanho de um lugar)
  w: number;
  d: number;
  // a altura do desenho (pixels), contando o que sai para cima
  h: number;
  draw: MoodDraw;
  paint?: MoodPaint;
  // a folga do retângulo de toque (pixels)
  pad?: number;
}
