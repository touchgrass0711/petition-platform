export const HOLD_MS = 1200;

/** 0..1 hold progress. Reduced motion fills in four calm steps instead of a continuous sweep. */
export function holdProgress(elapsed: number, duration: number, reduced: boolean): number {
  const p = Math.min(1, Math.max(0, elapsed / duration));
  return reduced && p < 1 ? Math.floor(p * 4) / 4 : p;
}

/** How much of ring i (inner first) is drawn at overall progress p. */
export const ringFill = (p: number, i: number, rings: number) => Math.min(1, Math.max(0, p * rings - i));
