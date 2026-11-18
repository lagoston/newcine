import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import stillMotion from './scripts/postcss-still-motion.mjs';

// 18/11/2026 (Protocolo Reborn, bateria): o terceiro plugin copia as regras de
// "reduzir movimento" para o modo economia e para as molduras paradas
// (.co-still). Ver scripts/postcss-still-motion.mjs e src/lib/motion.ts.
export default {
  plugins: [tailwindcss(), autoprefixer(), stillMotion()],
};
