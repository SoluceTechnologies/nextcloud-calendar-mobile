import type { RecurrenceFreq, RecurrenceRule } from '@/types';

const FREQS: RecurrenceFreq[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

const SUPPORTED = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'COUNT', 'UNTIL']);

function parseUntil(raw: string): Date | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?$/.exec(raw);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  const date = h === undefined
    ? new Date(Number(y), Number(mo) - 1, Number(d))
    : new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parsePositiveInt(raw: string): number | undefined {
  if (!/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return n > 0 ? n : undefined;
}

export function parseRrule(raw: string | undefined): RecurrenceRule | undefined {
  if (!raw) return undefined;

  const body = raw.replace(/^RRULE:/i, '').trim();
  if (!body) return undefined;

  const parts = new Map<string, string>();
  for (const chunk of body.split(';')) {
    if (!chunk) continue;
    const eq = chunk.indexOf('=');
    if (eq === -1) return undefined;
    const key = chunk.slice(0, eq).toUpperCase();
    if (!SUPPORTED.has(key)) return undefined;
    if (parts.has(key)) return undefined;
    parts.set(key, chunk.slice(eq + 1));
  }

  const freq = parts.get('FREQ')?.toUpperCase() as RecurrenceFreq | undefined;
  if (!freq || !FREQS.includes(freq)) return undefined;

  const rule: RecurrenceRule = { freq };

  const rawInterval = parts.get('INTERVAL');
  if (rawInterval !== undefined) {
    const interval = parsePositiveInt(rawInterval);
    if (interval === undefined) return undefined;
    if (interval > 1) rule.interval = interval;
  }

  const rawByDay = parts.get('BYDAY');
  if (rawByDay !== undefined) {
    const byDay = rawByDay.split(',').map((d) => d.trim().toUpperCase()).filter(Boolean);
    if (byDay.length === 0) return undefined;
    if (byDay.some((d) => !/^(MO|TU|WE|TH|FR|SA|SU)$/.test(d))) return undefined;
    rule.byDay = byDay;
  }

  if (parts.has('COUNT') && parts.has('UNTIL')) return undefined;

  const rawCount = parts.get('COUNT');
  if (rawCount !== undefined) {
    const count = parsePositiveInt(rawCount);
    if (count === undefined) return undefined;
    rule.count = count;
  }

  const rawUntil = parts.get('UNTIL');
  if (rawUntil !== undefined) {
    const until = parseUntil(rawUntil);
    if (until === undefined) return undefined;
    rule.until = until;
  }

  return rule;
}
