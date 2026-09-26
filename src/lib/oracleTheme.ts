import type React from 'react';

// Sistema visual do CineOracle — fonte única de verdade para cores, fonte
// e os três oráculos. Toda tela redesenhada importa daqui, pra que o site
// inteiro fale a mesma língua visual da home de visitante.
//
// Origem de cada cor: o papel creme e as cores dos bichos vêm direto das
// cartas dos oráculos (arte própria do app); o fundo é um violeta-noite
// (não preto) pra combinar com o violeta/fúcsia da marca.

export const NIGHT = '#120D22';   // fundo das páginas
export const VELVET = '#1C1433';  // superfícies elevadas (campos, pôsteres, selos)
export const PAPER = '#F3EAD3';   // texto principal no escuro / faixas "papel"
export const INK = '#221B36';     // texto sobre papel
export const MIST = '#BDB4D6';    // texto secundário no escuro

// Fundo padrão de página: noite com um brilho violeta no canto superior.
export const NIGHT_BACKGROUND = `radial-gradient(ellipse 80% 50% at 75% 0%, rgba(139,92,246,0.16), transparent 60%), ${NIGHT}`;

// Pixelify Sans é carregada no index.html; o fallback monoespaçado mantém
// o ar "blocado" enquanto a fonte não chega. Ligaduras desligadas: a
// ligadura "fi" dessa fonte faz "filme" ser lido como "Alme".
export const PIXEL: React.CSSProperties = {
  fontFamily: '"Pixelify Sans", ui-monospace, "SF Mono", Menlo, monospace',
  fontVariantLigatures: 'none',
  fontFeatureSettings: '"liga" 0, "clig" 0',
};

export type OracleId = 'bogart' | 'fincher' | 'cypher';

export interface OracleCard {
  id: OracleId;
  name: string;
  img: string;     // carta pixel art (creme)
  altImg: string;  // carta estilo Yu-Gi-Oh
  color: string;   // cor do bicho, usada como informação (nome, brilho)
}

export const ORACLES: OracleCard[] = [
  { id: 'bogart', name: 'Bogart', img: '/assets/BOGART.webp', altImg: '/assets/BOGART2.webp', color: '#7BC25A' },
  { id: 'fincher', name: 'Fincher', img: '/assets/FINCHER.webp', altImg: '/assets/FINCHER2.webp', color: '#EE7A3E' },
  { id: 'cypher', name: 'Cypher', img: '/assets/CYPHER.webp', altImg: '/assets/CYPHER2.webp', color: '#E2C84A' },
];