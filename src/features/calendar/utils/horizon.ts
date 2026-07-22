export const HORIZON_MONTHS = 18;
export const RESET_THRESHOLD_MONTHS = 6;

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

export function expansionHorizon(now: Date): { start: Date; end: Date } {
  return { start: addMonths(now, -HORIZON_MONTHS), end: addMonths(now, HORIZON_MONTHS) };
}

export function needsHorizonReset(center: number | undefined, now: Date): boolean {
  if (center == null) return true;
  return Math.abs(now.getTime() - center) > RESET_THRESHOLD_MONTHS * MONTH_MS;
}
