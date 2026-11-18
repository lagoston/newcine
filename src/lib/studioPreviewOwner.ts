// Conta Diretor (16/11/2026): "estúdio completo" na tela do diretor mostra, só
// na cena da própria conta e só neste aparelho, o estúdio no nível máximo (ver
// withStudioPreview em lib/personaWorld.ts). Aqui fica só de quem é a prévia.
//
// 18/11/2026 (Protocolo Reborn, pacote.md A1.4): este estado morava dentro do
// lib/personaWorld.ts. O DirectorContext, que abre junto com o app, importava
// de lá só o `setStudioPreviewOwner` e com isso levava o catálogo inteiro do
// estúdio (5,3 KB, que muda a cada móvel novo) para o código comum da
// abertura. Num arquivo pequeno, o catálogo só é baixado por quem desenha o
// estúdio, e mexer nele não troca mais o pedaço comum.
let studioPreviewOwner: string | null = null;

export function setStudioPreviewOwner(userId: string | null): void {
  studioPreviewOwner = userId;
}

export function isStudioPreviewOwner(userId: string): boolean {
  return studioPreviewOwner === userId;
}
