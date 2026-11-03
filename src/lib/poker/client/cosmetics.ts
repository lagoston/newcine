/**
 * Manifesto dos personagens na mesa (SPEC §7.3, 05 §1.2): a arte de cada estilo de
 * carta, o recorte do retrato e as âncoras onde os tells aparecem (boca, olhos,
 * topo), em % do retrato. Um rival novo entra com mais uma linha, sem código novo.
 */
import { ORACLE_BY_ID, oracleCardImage, type OracleCardStyle, type OracleId } from '../../oracleTheme';
import type { RivalId } from '../types.ts';

export interface PortraitCrop {
  /** object-position da arte. */
  focus: string;
  zoom: number;
}
export interface Anchors {
  mouth: [x: number, y: number];
  eyes: [x: number, y: number];
  top: [x: number, y: number];
}
export interface CharacterManifest {
  id: RivalId;
  color: string;
  avatar: string;
  crop: Record<OracleCardStyle, PortraitCrop>;
  anchors: Record<OracleCardStyle, Anchors>;
}

const CROP_DEFAULT: PortraitCrop = { focus: '50% 62%', zoom: 1.6 };
const CROP_YUGIOH: PortraitCrop = { focus: '50% 28%', zoom: 1.7 };

const base = (id: OracleId, anchors: Anchors, yugi: Anchors): CharacterManifest => ({
  id,
  color: ORACLE_BY_ID[id].color,
  avatar: ORACLE_BY_ID[id].avatar,
  crop: { default: CROP_DEFAULT, horror: CROP_DEFAULT, yugioh: CROP_YUGIOH },
  anchors: { default: anchors, horror: anchors, yugioh: yugi },
});

export const CHARACTERS: Record<string, CharacterManifest> = {
  bogart: base('bogart', { mouth: [50, 62], eyes: [50, 30], top: [50, 4] }, { mouth: [52, 44], eyes: [52, 36], top: [50, 6] }),
  fincher: base('fincher', { mouth: [50, 74], eyes: [50, 44], top: [50, 2] }, { mouth: [50, 48], eyes: [50, 38], top: [50, 6] }),
  cypher: base('cypher', { mouth: [50, 40], eyes: [50, 24], top: [50, 4] }, { mouth: [50, 44], eyes: [50, 34], top: [50, 6] }),
};

export function normalizeStyle(style: string | null | undefined): OracleCardStyle {
  return style === 'yugioh' || style === 'horror' ? style : 'default';
}

export function cardArt(id: RivalId, style: string | null | undefined): string {
  if (id === 'bogart' || id === 'fincher' || id === 'cypher') return oracleCardImage(id as OracleId, normalizeStyle(style));
  return '';
}

export function characterOf(id: RivalId): CharacterManifest | null {
  return CHARACTERS[id] ?? null;
}

export const ORACLE_COLOR: Record<string, string> = {
  bogart: '#7BC25A',
  cypher: '#E2C84A',
  fincher: '#EE7A3E',
  human: '#F3EAD3',
};
