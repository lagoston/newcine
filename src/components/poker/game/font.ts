// Limelight (art déco de letreiro), a letra do Pôster Poker (03/11/2026). Só os
// títulos usam; carrega uma vez, quando a primeira tela do jogo abre.
let requested = false;

export function loadPosterPokerFont() {
  if (requested || typeof document === 'undefined') return;
  requested = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Limelight&display=swap';
  document.head.appendChild(link);
}
