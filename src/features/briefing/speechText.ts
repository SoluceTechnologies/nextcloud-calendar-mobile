import dayjs from 'dayjs';
import type { CalendarEvent } from '@/types';
import { displayLocation, meetingProvider, stripUrls } from '@/features/widget/core/liveEvent';
import type { BriefingSegment } from './types';

export interface BriefingEventInput
  extends Pick<
    CalendarEvent,
    'uid' | 'summary' | 'dtstart' | 'dtend' | 'allDay' | 'location' | 'isTask' | 'talkUrl'
  > {
  attendees?: { email?: string; displayName?: string }[];
}

interface Ctx {
  fr: boolean;
  use24h: boolean;
  now: Date;
  locale?: string;
  sameDay: boolean; // the briefed day is the real today
}

const byStart = (a: BriefingEventInput, b: BriefingEventInput) =>
  a.dtstart.getTime() - b.dtstart.getTime() || a.uid.localeCompare(b.uid);

function clean(raw: string | undefined): string {
  return stripUrls(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleOf(e: BriefingEventInput, fr: boolean): string {
  return clean(e.summary) || (fr ? 'événement sans titre' : 'untitled event');
}

function timeText(d: Date, fr: boolean, use24h: boolean): string {
  const h = d.getHours();
  const m = d.getMinutes();
  if (fr) return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
  if (use24h) return `${h}:${String(m).padStart(2, '0')}`;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function durationText(mins: number, fr: boolean): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (fr) {
    if (h === 0) return m === 30 ? 'une demi-heure' : `${m} minute${m > 1 ? 's' : ''}`;
    if (m === 0) return h === 1 ? 'une heure' : `${h} heures`;
    if (h === 1 && m === 30) return 'une heure et demie';
    return `${h === 1 ? 'une heure' : `${h} heures`} et ${m} minutes`;
  }
  if (h === 0) return m === 30 ? 'half an hour' : `${m} minute${m === 1 ? '' : 's'}`;
  if (m === 0) return h === 1 ? 'one hour' : h === 2 ? 'two hours' : `${h} hours`;
  if (h === 1 && m === 30) return 'an hour and a half';
  return `${h === 1 ? 'an hour' : `${h} hours`} and ${m} minute${m === 1 ? '' : 's'}`;
}

function firstName(a: { email?: string; displayName?: string }): string {
  const raw = (a.displayName || a.email || '').trim();
  // strip URLs from whatever we speak; if stripping left nothing word-like the
  // value was only a URL/domain — fall back to raw so the email branch / token
  // check below still reduces or drops it, never spoken verbatim
  const cleaned = stripUrls(raw).replace(/\s+/g, ' ').trim();
  const source = /[a-z0-9]/i.test(cleaned) ? cleaned : raw;
  // "Last, First" CN format — prefer the given name after the comma
  const comma = source.indexOf(',');
  const candidate =
    comma >= 0 ? source.slice(comma + 1).trim() || source.slice(0, comma).trim() : source;
  const first = candidate.split(/\s+/)[0] ?? '';
  if (first.includes('@')) return first.split('@')[0].split(/[._-]/)[0] ?? '';
  if (/[.:/]/.test(first)) return ''; // residual URL/domain-looking token
  return first;
}

function withClause(e: BriefingEventInput, fr: boolean): string {
  const names = [...new Set((e.attendees ?? []).map(firstName).filter(Boolean))];
  if (!names.length) return '';
  if (names.length <= 3) {
    const last = names[names.length - 1];
    const list = names.length === 1 ? last : `${names.slice(0, -1).join(', ')} ${fr ? 'et' : 'and'} ${last}`;
    return `${fr ? 'avec' : 'with'} ${list}`;
  }
  const rest = names.length - 2;
  return fr
    ? `avec ${names[0]}, ${names[1]} et ${rest} autres`
    : `with ${names[0]}, ${names[1]} and ${rest} others`;
}

function locationClause(e: BriefingEventInput, ctx: Ctx): string {
  const provider = meetingProvider(e.location || e.talkUrl);
  if (provider) return ctx.fr ? `appel sur ${provider}` : `call on ${provider}`;
  return displayLocation(e.location, ctx.locale);
}

function timedLine(e: BriefingEventInput, ctx: Ctx): string {
  const { fr, use24h, now } = ctx;
  const title = titleOf(e, fr);
  const t = now.getTime();
  if (ctx.sameDay && e.dtend.getTime() < t) {
    return fr ? `Plus tôt aujourd'hui : ${title}.` : `Earlier today: ${title}.`;
  }
  if (ctx.sameDay && e.dtstart.getTime() <= t) {
    const until = timeText(e.dtend, fr, use24h);
    return fr ? `${title}, en cours jusqu'à ${until}.` : `${title}, in progress until ${until}.`;
  }
  const head = fr
    ? `À ${timeText(e.dtstart, fr, use24h)} : ${title}`
    : `At ${timeText(e.dtstart, fr, use24h)}: ${title}`;
  const clauses: string[] = [];
  const mins = Math.round((e.dtend.getTime() - e.dtstart.getTime()) / 60000);
  if (mins > 0) clauses.push(fr ? `pendant ${durationText(mins, true)}` : `for ${durationText(mins, false)}`);
  const loc = locationClause(e, ctx);
  if (loc) clauses.push(loc);
  const att = withClause(e, fr);
  if (att) clauses.push(att);
  return `${head}${clauses.length ? `, ${clauses.join(', ')}` : ''}.`;
}

function taskLine(e: BriefingEventInput, fr: boolean): string {
  return fr ? `Échéance : ${titleOf(e, true)}.` : `Deadline: ${titleOf(e, false)}.`;
}

export function buildBriefing(
  events: BriefingEventInput[],
  opts: { locale?: string; use24h?: boolean; now?: Date; day?: Date; maxSegments?: number },
): BriefingSegment[] {
  if (!events.length) return []; // hook speaks the localized emptyDay line itself
  const fr = (opts.locale ?? '').toLowerCase().startsWith('fr');
  const now = opts.now ?? new Date();
  const day = opts.day ?? now;
  const ctx: Ctx = {
    fr,
    use24h: opts.use24h ?? fr,
    now,
    locale: opts.locale,
    sameDay: dayjs(day).isSame(now, 'day'),
  };

  const timed = events.filter((e) => !e.isTask && !e.allDay).sort(byStart);
  const allDay = events.filter((e) => !e.isTask && e.allDay).sort(byStart);
  const tasks = events.filter((e) => e.isTask).sort(byStart);

  const slots: { seg: BriefingSegment; count: number }[] = [
    ...timed.map((e) => ({ seg: { key: e.uid, text: timedLine(e, ctx), eventUid: e.uid }, count: 1 })),
    ...(allDay.length
      ? [
          {
            seg: {
              key: 'allday',
              text: fr
                ? `Toute la journée : ${allDay.map((e) => titleOf(e, true)).join(', ')}.`
                : `All day: ${allDay.map((e) => titleOf(e, false)).join(', ')}.`,
            },
            count: allDay.length,
          },
        ]
      : []),
    ...tasks.map((e) => ({ seg: { key: e.uid, text: taskLine(e, fr), eventUid: e.uid }, count: 1 })),
  ];

  const budget = Math.max(0, (opts.maxSegments ?? 20) - 2); // intro + outro are always spoken
  const picked: BriefingSegment[] = [];
  let covered = 0;
  for (const s of slots) {
    if (picked.length >= budget) break;
    picked.push(s.seg);
    covered += s.count;
  }
  const overflow = events.length - covered;

  const n = events.length;
  const more =
    overflow > 0
      ? fr
        ? `, et ${overflow} autre${overflow > 1 ? 's' : ''} événement${overflow > 1 ? 's' : ''}`
        : `, and ${overflow} more event${overflow === 1 ? '' : 's'}`
      : '';
  // localized day name for a non-today briefing ("lundi 3 novembre" / "Monday, November 3")
  const dayLabel = dayjs(day)
    .locale(fr ? 'fr' : 'en')
    .format(fr ? 'dddd D MMMM' : 'dddd, MMMM D');
  const introWhen = ctx.sameDay
    ? fr
      ? "aujourd'hui"
      : 'today'
    : fr
      ? dayLabel
      : `on ${dayLabel}`;
  const outroWhen = ctx.sameDay ? (fr ? "aujourd'hui" : 'today') : dayLabel;
  return [
    {
      key: 'intro',
      text: fr
        ? `Vous avez ${n} événement${n > 1 ? 's' : ''} ${introWhen}.`
        : `You have ${n} event${n === 1 ? '' : 's'} ${introWhen}.`,
    },
    ...picked,
    {
      key: 'outro',
      text: fr ? `C'est tout pour ${outroWhen}${more}.` : `That's all for ${outroWhen}${more}.`,
    },
  ];
}

// The voice must match the generated text — buildBriefing only produces
// French or English, so other app languages are read with an English voice.
export function briefingVoiceLocale(locale: string): string {
  return /^(fr|en)/i.test(locale) ? locale : 'en-US';
}

// Localized "Monday 3 November"-style label for the dated empty-day line;
// every LANGUAGES code maps to a loaded dayjs locale except 'oc' → 'oc-lnc'.
export function briefingDayLabel(day: Date, language: string): string {
  const loc = language === 'oc' ? 'oc-lnc' : language;
  return dayjs(day)
    .locale(loc)
    .format(language === 'en' ? 'dddd, MMMM D' : 'dddd D MMMM');
}
