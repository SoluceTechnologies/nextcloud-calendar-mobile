import type { RecurrenceFreq, RecurrenceRule } from '@/types';

const FREQS: RecurrenceFreq[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

const SUPPORTED = new Set([
  'FREQ',
  'INTERVAL',
  'BYDAY',
  'COUNT',
  'UNTIL',
  'BYMONTH',
  'BYWEEKNO',
]);

const BYDAY_RE = /^(?:([+-]?[1-9]\d?))?(MO|TU|WE|TH|FR|SA|SU)$/;

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

function parseMonthList(raw: string | undefined): number[] | undefined {
  if (raw === undefined) return undefined;
  const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
  if (values.length === 0) return undefined;

  const out: number[] = [];
  for (const v of values) {
    const n = parsePositiveInt(v);
    if (n === undefined || n > 12) return undefined;
    out.push(n);
  }
  return out;
}

function parseWeekNoList(raw: string | undefined): number[] | undefined {
  if (raw === undefined) return undefined;
  const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
  if (values.length === 0) return undefined;

  const out: number[] = [];
  for (const v of values) {
    const n = parsePositiveInt(v);
    if (n === undefined || n > 53) return undefined;
    out.push(n);
  }
  return out;
}

function parseByDayList(
  raw: string,
  freq: RecurrenceFreq,
  hasByMonth: boolean,
  hasByWeekNo: boolean,
): string[] | undefined {
  const entries = raw.split(',').map((d) => d.trim().toUpperCase()).filter(Boolean);
  if (entries.length === 0) return undefined;

  const out: string[] = [];
  for (const entry of entries) {
    const m = BYDAY_RE.exec(entry);
    if (!m) return undefined;

    const positionStr = m[1];
    const day = m[2];

    if (!positionStr) {
      out.push(day);
      continue;
    }

    const position = Number(positionStr);

    if (freq === 'WEEKLY' || freq === 'DAILY') {
      out.push(day);
      continue;
    }

    if (freq === 'MONTHLY') {
      if (position < -5 || position > 5 || position === 0) return undefined;
      out.push(`${position}${day}`);
      continue;
    }

    if (hasByMonth) {
      if (position < -5 || position > 5 || position === 0) return undefined;
    } else if (hasByWeekNo) {
      return undefined;
    } else {
      if (position < -53 || position > 53 || position === 0) return undefined;
    }

    out.push(`${position}${day}`);
  }

  return out;
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

  if (parts.has('COUNT') && parts.has('UNTIL')) return undefined;

  const byMonth = parseMonthList(parts.get('BYMONTH'));
  const byWeekNo = parseWeekNoList(parts.get('BYWEEKNO'));

  if (byMonth && freq !== 'YEARLY') return undefined;
  if (byWeekNo && freq !== 'YEARLY') return undefined;
  if (byMonth && byWeekNo) return undefined;

  const rule: RecurrenceRule = { freq };

  const rawInterval = parts.get('INTERVAL');
  if (rawInterval !== undefined) {
    const interval = parsePositiveInt(rawInterval);
    if (interval === undefined) return undefined;
    if (interval > 1) rule.interval = interval;
  }

  if (byMonth) rule.byMonth = byMonth;
  if (byWeekNo) rule.byWeekNo = byWeekNo;

  const rawByDay = parts.get('BYDAY');
  if (rawByDay !== undefined) {
    const byDay = parseByDayList(rawByDay, freq, !!byMonth, !!byWeekNo);
    if (byDay === undefined) return undefined;
    if (byDay.length > 0) rule.byDay = byDay;
  }

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
