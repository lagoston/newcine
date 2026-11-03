/**
 * Mesa com amigos (03/11/2026, fase 3 — G3): quem está em cada lugar de pessoa (p1..p4,
 * ou 'human' para "eu"), com nome, foto e a cor da placa. Os oráculos continuam com os
 * nomes deles. Lido pela narração, pela mesa e pelos créditos; sem dependências.
 */
// ---------------------------------------------------------------------------

export interface SeatPerson {
  playerId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** A cor da placa (estável por pessoa). */
  color: string;
}

// Cores das placas das pessoas: longe das dos oráculos (verde, laranja, amarelo).
const PERSON_COLORS = ['#F5EBD3', '#9FD3FF', '#F2A7E0', '#B8F2C9'];

let people = new Map<string, SeatPerson>();

/** Quem está em cada lugar de pessoa nesta mesa (lido pela narração e pelos créditos). */
export function setTablePeople(list: SeatPerson[] | null) {
  people = new Map((list ?? []).map((p) => [p.playerId, p]));
}
export function tablePerson(id: string | null | undefined): SeatPerson | null {
  return id ? people.get(id) ?? null : null;
}
export function personColor(i: number): string {
  return PERSON_COLORS[i % PERSON_COLORS.length];
}

/** Ids de pessoa da mesa de amigos (p1..p4), antes ou depois do "eu" virar 'human'. */
export const isPersonId = (id: string | null | undefined): boolean => !!id && /^p[1-4]$/.test(id);
