// Hand-rolled bilingual (EN/FR) moment parser — no chrono-node.
// `day` is always local midnight; `time` stays undefined when the utterance
// carries a day only (callers decide their own default).

export interface ParsedMoment {
  day: Date;
  time?: { h: number; m: number };
}

export interface MomentMatch {
  start: number; // offsets into the scanned fragment
  end: number;
  moment: ParsedMoment;
  hasDay: boolean;
  hasTime: boolean;
}

const ALPHA = 'a-zàâäçéèêëîïôöùûüÿœ';
const PRE = `(^|[^${ALPHA}0-9])`;
const POST = `(?![${ALPHA}0-9])`;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const WEEKDAYS: Record<string, number> = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};
const DAY_NAMES = 'dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi|sunday|monday|tuesday|wednesday|thursday|friday|saturday';

const h12 = (h: number, ap: string) => (ap === 'a' ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12);

export function momentToDate(m: ParsedMoment): Date {
  const d = new Date(m.day.getTime());
  if (m.time) d.setHours(m.time.h, m.time.m, 0, 0);
  return d;
}

interface Cand extends MomentMatch {
  ord: number;
}

// separator + optional connector allowed between a day-token and a time-token
const GAP = /^[\s,.;:'-]*(?:(?:à|a|at|vers|around|about|pour|for)[\s,.;:'-]*)?$/i;

export function extractMoments(fragment: string, opts: { locale?: string; now?: Date } = {}): MomentMatch[] {
  const now = opts.now ?? new Date();
  const cands: Cand[] = [];

  const each = (
    re: RegExp,
    ord: number,
    mk: (m: RegExpExecArray) => { moment: ParsedMoment; hasDay: boolean; hasTime: boolean } | null,
  ) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(fragment))) {
      const r = mk(m);
      if (r) {
        cands.push({ start: m.index + m[1].length, end: m.index + m[0].length, moment: r.moment, hasDay: r.hasDay, hasTime: r.hasTime, ord });
      }
      if (m[0].length === 0) re.lastIndex++;
    }
  };
  const dayOnly = (day: Date) => ({ moment: { day }, hasDay: true, hasTime: false });
  const timeOnly = (time: { h: number; m: number }) => ({ moment: { day: startOfDay(now), time }, hasDay: false, hasTime: true });

  // «dans N heures|jours» / "in N hours|days" — heures carries day+time together
  each(new RegExp(`${PRE}(?:dans|in)\\s+(\\d+|une?|an?|a)\\s+(jours?|heures?|days?|hours?)${POST}`, 'gi'), 0, (m) => {
    const n = /^\d+$/.test(m[2]) ? parseInt(m[2], 10) : 1;
    if (/^h/i.test(m[3])) {
      const t = new Date(now.getTime() + n * 3600000);
      return { moment: { day: startOfDay(t), time: { h: t.getHours(), m: t.getMinutes() } }, hasDay: true, hasTime: true };
    }
    return dayOnly(addDays(now, n));
  });
  each(new RegExp(`${PRE}(?:après[-\\s]demain|apres[-\\s]demain|day\\s+after\\s+tomorrow)${POST}`, 'gi'), 1, () =>
    dayOnly(addDays(now, 2)));
  each(new RegExp(`${PRE}(?:aujourd['’\\s-]?hui|today)${POST}`, 'gi'), 2, () =>
    dayOnly(startOfDay(now)));
  each(new RegExp(`${PRE}(?:demain|tomorrow)${POST}`, 'gi'), 3, () =>
    dayOnly(addDays(now, 1)));
  // bare weekday → next occurrence strictly after today (same weekday = +7);
  // "next monday" / «lundi prochain» adds a week ("following week")
  each(new RegExp(`${PRE}(?:(next|ce|this)\\s+)?(${DAY_NAMES})(?:\\s+(prochaine?))?${POST}`, 'gi'), 4, (m) => {
    const want = WEEKDAYS[m[3].toLowerCase()];
    let diff = (want - now.getDay() + 7) % 7 || 7;
    if (m[2]?.toLowerCase() === 'next' || m[4]) diff += 7;
    return dayOnly(addDays(now, diff));
  });
  // «le 12/05» — always dd/mm; rolls to next year when already past
  each(new RegExp(`${PRE}(\\d{1,2})\\s*\\/\\s*(\\d{1,2})(?:\\s*\\/\\s*(\\d{2,4}))?${POST}`, 'gi'), 5, (m) => {
    const d = +m[2];
    const mo = +m[3];
    let y = m[4] ? +m[4] : now.getFullYear();
    if (y < 100) y += 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    let day = new Date(y, mo - 1, d);
    if (day.getMonth() !== mo - 1 || day.getDate() !== d) return null;
    if (!m[4] && day.getTime() < startOfDay(now).getTime()) day = new Date(y + 1, mo - 1, d);
    return dayOnly(day);
  });
  // «14h30», «14 h 30», «14h» — h not followed by a letter (blocks "2 heures")
  each(new RegExp(`${PRE}(\\d{1,2})\\s*h(?:\\s*(\\d{1,2}))?${POST}`, 'gi'), 6, (m) => {
    const h = +m[2];
    const min = m[3] ? +m[3] : 0;
    return h <= 23 && min <= 59 ? timeOnly({ h, m: min }) : null;
  });
  each(new RegExp(`${PRE}(\\d{1,2})\\s*:\\s*(\\d{1,2})\\s*([ap])\\.?\\s?m\\.?${POST}`, 'gi'), 7, (m) => {
    const h = +m[2];
    const min = +m[3];
    return h >= 1 && h <= 12 && min <= 59 ? timeOnly({ h: h12(h, m[4].toLowerCase()), m: min }) : null;
  });
  each(new RegExp(`${PRE}(\\d{1,2})\\s*:\\s*(\\d{1,2})${POST}`, 'gi'), 8, (m) => {
    const h = +m[2];
    const min = +m[3];
    return h <= 23 && min <= 59 ? timeOnly({ h, m: min }) : null;
  });
  each(new RegExp(`${PRE}(\\d{1,2})\\s*([ap])\\.?\\s?m\\.?${POST}`, 'gi'), 9, (m) => {
    const h = +m[2];
    return h >= 1 && h <= 12 ? timeOnly({ h: h12(h, m[3].toLowerCase()), m: 0 }) : null;
  });
  each(new RegExp(`${PRE}(?:midi|noon)${POST}`, 'gi'), 10, () => timeOnly({ h: 12, m: 0 }));
  each(new RegExp(`${PRE}(?:minuit|midnight)${POST}`, 'gi'), 11, () => timeOnly({ h: 0, m: 0 }));

  cands.sort((a, b) => a.start - b.start || a.ord - b.ord || (b.end - b.start) - (a.end - a.start));
  const picked: Cand[] = [];
  let lastEnd = -1;
  for (const c of cands) {
    if (c.start >= lastEnd) {
      picked.push(c);
      lastEnd = c.end;
    }
  }

  const out: MomentMatch[] = [];
  for (let i = 0; i < picked.length; i++) {
    const c = picked[i];
    const n = picked[i + 1];
    // merge a day-only token with a following time-only token («demain à 14h»,
    // "friday at 9am") — never the reverse («14h à demain»: the «à» belongs to
    // the day, gluing would steal it)
    if (n && c.hasDay && !c.hasTime && !n.hasDay && n.hasTime && GAP.test(fragment.slice(c.end, n.start))) {
      out.push({
        start: c.start,
        end: n.end,
        moment: { day: c.moment.day, time: n.moment.time },
        hasDay: true,
        hasTime: true,
      });
      i++;
    } else {
      out.push({ start: c.start, end: c.end, moment: c.moment, hasDay: c.hasDay, hasTime: c.hasTime });
    }
  }
  return out;
}

export function parseMoment(fragment: string, opts: { locale?: string; now?: Date } = {}): ParsedMoment | null {
  return extractMoments(fragment, opts)[0]?.moment ?? null;
}
