import { getTimezoneOffsetMinutes, isValidTimeZone } from './timezone';

/**
 * Generates a VTIMEZONE block (as unfolded ICS lines) for an IANA zone.
 *
 * There is no tz database bundled in the app, so observances are derived by
 * sampling `Intl.DateTimeFormat` offsets around the event date: transitions are
 * detected to the minute, then grouped into STANDARD/DAYLIGHT components whose
 * extra onsets are expressed as RDATE lists.
 *
 * The window is anchored on the event year: from (min(eventYear, now) - 1) to
 * (max(eventYear, now) + 25). Dates outside the window resolve to the offset
 * in force at the window edge — correct for any event scheduled inside it.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const SAMPLE_STEP_MS = 3 * DAY_MS; // DST transitions are never closer than this
const FUTURE_YEARS = 25;

const pad = (n: number) => String(n).padStart(2, '0');

export function formatUtcOffset(minutes: number): string {
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

/** GMT label for pickers/details: "GMT", "GMT+02:00", "GMT-05:00". */
export function gmtOffsetLabel(tz: string, at: Date): string {
  const minutes = getTimezoneOffsetMinutes(tz, at);
  if (minutes === 0) return 'GMT';
  const abs = Math.abs(minutes);
  return `GMT${minutes < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function localStamp(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

const NAME_FMT = new Map<string, Intl.DateTimeFormat>();

function tzName(tzid: string, at: Date): string | undefined {
  let fmt = NAME_FMT.get(tzid);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tzid,
      year: 'numeric',
      hour: 'numeric',
      timeZoneName: 'short',
    });
    NAME_FMT.set(tzid, fmt);
  }
  const name = fmt.formatToParts(at).find((p) => p.type === 'timeZoneName')?.value;
  return name ? name.replace(/[\\;,\n]/g, '') : undefined;
}

interface Transition {
  utcMs: number;
  from: number;
  to: number;
}

function listTransitions(tzid: string, fromMs: number, toMs: number): Transition[] {
  const out: Transition[] = [];
  let prev = getTimezoneOffsetMinutes(tzid, new Date(fromMs));
  let prevT = fromMs;
  for (let t = fromMs + SAMPLE_STEP_MS; t <= toMs; t += SAMPLE_STEP_MS) {
    const off = getTimezoneOffsetMinutes(tzid, new Date(t));
    if (off === prev) {
      prevT = t;
      continue;
    }
    // Pin the transition to the minute inside (prevT, t].
    let lo = Math.floor(prevT / MINUTE_MS);
    let hi = Math.ceil(t / MINUTE_MS);
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (getTimezoneOffsetMinutes(tzid, new Date(mid * MINUTE_MS)) === prev) lo = mid;
      else hi = mid;
    }
    out.push({ utcMs: hi * MINUTE_MS, from: prev, to: off });
    prev = off;
    prevT = t;
  }
  return out;
}

interface Observance {
  from: number;
  to: number;
  name?: string;
  /** Transition instants (UTC ms) at which this observance starts. */
  onsets: number[];
}

function buildLines(tzid: string, fromMs: number, toMs: number): string[] {
  const transitions = listTransitions(tzid, fromMs, toMs);
  const initialOffset = getTimezoneOffsetMinutes(tzid, new Date(fromMs));

  const groups = new Map<string, Observance>();
  for (const tr of transitions) {
    const name = tzName(tzid, new Date(tr.utcMs + MINUTE_MS));
    const key = `${tr.from}>${tr.to}>${name ?? ''}`;
    let g = groups.get(key);
    if (!g) {
      g = { from: tr.from, to: tr.to, name, onsets: [] };
      groups.set(key, g);
    }
    g.onsets.push(tr.utcMs);
  }

  // The lowest offset is the standard time; anything above it is daylight.
  const minOffset = Math.min(initialOffset, ...[...groups.values()].map((g) => g.to));

  const observances: Observance[] = [
    // Covers everything before the first sampled transition.
    {
      from: initialOffset,
      to: initialOffset,
      name: tzName(tzid, new Date(fromMs)),
      onsets: [0],
    },
    ...[...groups.values()].sort((a, b) => a.onsets[0] - b.onsets[0]),
  ];

  const lines = ['BEGIN:VTIMEZONE', `TZID:${tzid}`, `X-LIC-LOCATION:${tzid}`];
  for (const obs of observances) {
    const kind = obs.to === minOffset ? 'STANDARD' : 'DAYLIGHT';
    lines.push(`BEGIN:${kind}`);
    // The initial observance has no real onset; 1601 is the conventional start.
    lines.push(`DTSTART:${obs.onsets[0] === 0 ? '16010101T000000' : localStamp(obs.onsets[0] + obs.from * MINUTE_MS)}`);
    const rest = obs.onsets.slice(1);
    if (rest.length) {
      lines.push(`RDATE:${rest.map((o) => localStamp(o + obs.from * MINUTE_MS)).join(',')}`);
    }
    lines.push(`TZOFFSETFROM:${formatUtcOffset(obs.from)}`);
    lines.push(`TZOFFSETTO:${formatUtcOffset(obs.to)}`);
    if (obs.name) lines.push(`TZNAME:${obs.name}`);
    lines.push(`END:${kind}`);
  }
  lines.push('END:VTIMEZONE');
  return lines;
}

const VTZ_CACHE = new Map<string, string[]>();

export function vtimezoneLines(tzid: string, around?: Date): string[] {
  if (!isValidTimeZone(tzid)) return [];
  const anchorYear = (around ?? new Date()).getUTCFullYear();
  const nowYear = new Date().getUTCFullYear();
  const fromMs = Date.UTC(Math.min(anchorYear, nowYear) - 1, 0, 1);
  const toMs = Date.UTC(Math.max(anchorYear, nowYear) + FUTURE_YEARS, 0, 1);

  const key = `${tzid}|${fromMs}|${toMs}`;
  let lines = VTZ_CACHE.get(key);
  if (!lines) {
    lines = buildLines(tzid, fromMs, toMs);
    VTZ_CACHE.set(key, lines);
  }
  return lines;
}
