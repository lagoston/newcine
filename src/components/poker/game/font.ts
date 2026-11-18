// Limelight (art déco de letreiro), a letra do Pôster Poker (03/11/2026). Só os
// títulos usam; carrega uma vez, quando a primeira tela do jogo abre.
// 18/11/2026 (Reborn, pacote): a fonte mora em /fonts (regras em
// src/styles/fonts.css), não mais no Google Fonts; aqui só se adianta o
// download, para o letreiro não aparecer primeiro na letra reserva.
let requested = false;

export function loadPosterPokerFont() {
  if (requested || typeof document === 'undefined') return;
  requested = true;
  document.fonts?.load("400 1em 'Limelight'").catch(() => undefined);
}
