import { NIGHT_BACKGROUND } from '../lib/oracleTheme';

// Fundo único do app inteiro: noite com o brilho violeta no canto superior.
// Fica fixo atrás de todas as páginas (z negativo), então nenhuma página
// precisa desenhar o próprio fundo — e o html tem a mesma cor-base (ver
// index.css), o que faz o fundo parecer infinito ao puxar a página além do
// topo ou do fim.
export default function PageBackground() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{ background: NIGHT_BACKGROUND }}
    />
  );
}