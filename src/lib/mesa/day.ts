// O dia da Mesa é o dia de Brasília (SPEC §2.16), 05/11/2026: as cartas não
// viradas voltam ao baralho à meia-noite de São Paulo, não à meia-noite do
// aparelho nem de UTC. O servidor usa a mesma regra (mesa_day()).

const BRT = 'America/Sao_Paulo';
let fmt: Intl.DateTimeFormat | null = null;

// 'YYYY-MM-DD' do dia de Brasília (en-CA formata justamente assim).
export function brtDay(d: Date = new Date()): string {
  fmt ??= new Intl.DateTimeFormat('en-CA', { timeZone: BRT, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(d);
}

// Dia da semana (0 = domingo) de um 'YYYY-MM-DD', sem depender do fuso do
// aparelho (meio-dia UTC nunca vira o dia).
export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

// A segunda-feira da semana de Brasília de um dia (semana de segunda a
// domingo, como a quarta carta do Espelho).
export function isoWeekStart(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

// Quantos dias de calendário entre dois 'YYYY-MM-DD' (b − a).
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

// A hora local do aparelho (as sugestões da mão usam o relógio da pessoa).
export function localClock(d: Date = new Date()): { hour: number; weekday: number } {
  return { hour: d.getHours(), weekday: d.getDay() };
}
