import { createMesaDirector } from '../../lib/mesa/dialogue/director';
import type { MesaDirector } from '../../lib/mesa/dialogue/types';

// O Diretor de falas da Mesa (SPEC §3.8), 05/11/2026: quem escreve e escolhe
// as falas é o WP-FALAS (src/lib/mesa/dialogue/). A Mesa só pede a fala certa
// em cada tempo; um Diretor por aba (a memória LRU fica no localStorage).
let instance: MesaDirector | null = null;
export function getMesaDirector(): MesaDirector {
  instance ??= createMesaDirector();
  return instance;
}
