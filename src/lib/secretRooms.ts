import { supabase } from './supabase';

// Salas secretas (19/10/2026): páginas que abrem durante um evento para quem
// conquistou uma tag e, depois dele, só para quem está USANDO a tag no
// perfil — ou para quem entra pelo portal no perfil de alguém que usa.
// A primeira é o Clube do Terror (Halloween, tag Deadly Sleeping).
//
// Quem decide a porta é o banco (get_secret_room_access); a página só
// mostra o veredito. Ver supabase/migrations/20261019180000_*.

export const TERROR_CLUB = 'clube-do-terror';

export type SecretRoomReason = 'login' | 'need_tag' | 'need_tag_in_use' | 'portal_closed' | 'closed' | 'not_found';

export interface SecretRoomPerson {
  id: string;
  username: string;
  avatar_url: string | null;
  avatar_frame: string | null;
}

export interface SecretRoomAccess {
  room?: string;
  granted: boolean;
  mode: 'member' | 'portal' | null;
  reason: SecretRoomReason | null;
  event?: string;
  event_live?: boolean;
  has_tag?: boolean;
  tag_in_use?: boolean;
  visible_in_oracle?: boolean;
  tag?: { base: string; name: string; emoji: string | null };
  via?: SecretRoomPerson | null;
}

// Um título como a sala manda: títulos e pôsteres nas duas línguas.
export interface RoomCard {
  id: number;
  type: 'movie' | 'tv';
  t_pt: string | null;
  t_en: string | null;
  p_pt: string | null;
  p_en: string | null;
  b: string | null;
  y: number | null;
  oracle: 'bogart' | 'fincher' | 'cypher' | null;
  // Medidos no coração
  rank?: number;
  bpm?: { from: number; to: number; peak: number; score: number };
  // Proibidos
  where_pt?: string;
  where_en?: string;
  note_pt?: string;
  note_en?: string;
  // Viradas
  twist?: 'genre' | 'ending';
  from_pt?: string;
  from_en?: string;
  to_pt?: string;
  to_en?: string;
  // Monstros reais
  rel?: 'inspired' | 'portrayed';
  // Estantes dos membros
  rating?: number;
  // Para te assombrar / Sessão da meia-noite
  predicted?: number;
}

export interface RealPerson {
  name: string;
  name_en?: string;
  photo: string | null;
  unknown?: boolean;
  years: string;
  place_pt: string;
  place_en: string;
  line_pt: string;
  line_en: string;
}

export type RoomShelf =
  | { key: string; kind: 'curated' | 'science' | 'banned' | 'twist'; title_pt: string; title_en: string; hint_pt: string | null; hint_en: string | null; items: RoomCard[] }
  | { key: string; kind: 'real'; title_pt: string; title_en: string; hint_pt: string | null; hint_en: string | null; items: { person: RealPerson; titles: RoomCard[] }[] };

export interface RoomMember extends SecretRoomPerson {
  in_use: boolean;
  is_friend: boolean;
  is_me: boolean;
  since: string | null;
}

export interface SecretRoomData {
  access: SecretRoomAccess;
  room?: { key: string; event: string; mood: string };
  shelves?: RoomShelf[];
  ritual?: { edition: number; live: boolean; items: RoomCard[] } | null;
  members?: { count: number; people: RoomMember[] };
  member_shelves?: { user: SecretRoomPerson & { is_via: boolean }; items: RoomCard[] }[];
  me?: { x_total: number; x_rated: number; x_avg: number | null; rank: number | null };
}

export interface SecretRoomPredictions {
  pred: Record<string, number>;
  seen: Record<string, number | null>;
  haunt: RoomCard[];
  midnight: RoomCard | null;
}

export interface SecretRoomPortal {
  room: string;
  open: boolean;
  tag: { base: string; name: string; emoji: string | null };
  event_live: boolean;
}

export async function fetchSecretRoomAccess(room: string, via?: string | null): Promise<SecretRoomAccess | null> {
  const { data, error } = await supabase.rpc('get_secret_room_access', { p_room: room, p_via: via || null });
  if (error) throw error;
  return (data as SecretRoomAccess) ?? null;
}

export async function fetchSecretRoom(room: string, via?: string | null): Promise<SecretRoomData> {
  const { data, error } = await supabase.rpc('get_secret_room', { p_room: room, p_via: via || null });
  if (error) throw error;
  return data as SecretRoomData;
}

export async function fetchSecretRoomPredictions(room: string, via?: string | null): Promise<SecretRoomPredictions | null> {
  const { data, error } = await supabase.rpc('get_secret_room_predictions', { p_room: room, p_via: via || null });
  if (error) throw error;
  return (data as SecretRoomPredictions) ?? null;
}

export async function fetchSecretRoomPortal(userId: string): Promise<SecretRoomPortal | null> {
  const { data, error } = await supabase.rpc('get_secret_room_portal', { p_user_id: userId });
  if (error) throw error;
  return (data as SecretRoomPortal) ?? null;
}

export const roomPath = (room: string, via?: string | null) => `/sala/${room}${via ? `?via=${encodeURIComponent(via)}` : ''}`;

// Campo na língua da tela (com a outra de reserva).
export const pick = (pt: boolean, ptValue?: string | null, enValue?: string | null) => (pt ? ptValue || enValue : enValue || ptValue) || '';

export const cardTitle = (card: RoomCard, pt: boolean) => pick(pt, card.t_pt, card.t_en);
export const cardPoster = (card: RoomCard, pt: boolean, size = 'w342') => {
  const path = pt ? card.p_pt || card.p_en : card.p_en || card.p_pt;
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
};
export const cardKey = (card: { id: number; type: string }) => `${card.type}:${card.id}`;
