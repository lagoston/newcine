// Contas pequenas dos números de um perfil (seu Perfil e o de outras pessoas).

// Distribuição { nota: quantidade } → as 11 contagens (0–10) e a média.
export const summarizeRatings = (distribution: Record<number, number>) => {
  const counts = Array.from({ length: 11 }, (_, r) => Number(distribution?.[r]) || 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const average = total > 0 ? counts.reduce((acc, count, r) => acc + count * r, 0) / total : null;
  return { counts, total, average };
};

export const formatWatchTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h ${minutes % 60}m`;
};
