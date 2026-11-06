export function percent(count: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((count / goal) * 100));
}
