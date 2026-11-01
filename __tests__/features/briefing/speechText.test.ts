import {
  buildBriefing,
  briefingDayLabel,
  briefingVoiceLocale,
  type BriefingEventInput,
} from '@/features/briefing/speechText';

const at = (h: number, m = 0) => new Date(2026, 7, 10, h, m); // Mon 10 Aug 2026
const BEFORE = at(8); // 'now' before every default event

function ev(partial: Partial<BriefingEventInput> & { uid: string }): BriefingEventInput {
  return {
    summary: 'Standup',
    dtstart: at(9),
    dtend: at(10),
    allDay: false,
    ...partial,
  };
}

const keys = (segs: { key: string }[]) => segs.map((s) => s.key);

describe('buildBriefing — structure', () => {
  it('returns [] for an empty day (the hook speaks the localized emptyDay line itself)', () => {
    expect(buildBriefing([], { locale: 'en' })).toEqual([]);
    expect(buildBriefing([], { locale: 'fr' })).toEqual([]);
  });

  it('builds intro → timed → outro and tags event segments with eventUid', () => {
    const segs = buildBriefing([ev({ uid: 'e1' })], { locale: 'en', now: BEFORE });
    expect(keys(segs)).toEqual(['intro', 'e1', 'outro']);
    expect(segs[0].text).toBe('You have 1 event today.');
    expect(segs[1].text).toBe('At 9 AM: Standup, for one hour.');
    expect(segs[1].eventUid).toBe('e1');
    expect(segs[2].text).toBe("That's all for today.");
    expect(segs[2].eventUid).toBeUndefined();
  });

  it('sorts timed events by dtstart regardless of input order, then all-day, then tasks', () => {
    const segs = buildBriefing(
      [
        ev({ uid: 'task1', summary: 'File taxes', isTask: true }),
        ev({ uid: 'late', summary: 'Late one', dtstart: at(15), dtend: at(16) }),
        ev({ uid: 'ad1', summary: 'Company holiday', allDay: true }),
        ev({ uid: 'early', summary: 'Early one' }),
      ],
      { locale: 'en', now: BEFORE },
    );
    expect(keys(segs)).toEqual(['intro', 'early', 'late', 'allday', 'task1', 'outro']);
    expect(segs[0].text).toBe('You have 4 events today.');
    expect(segs[3].text).toBe('All day: Company holiday.');
    expect(segs[4].text).toBe('Deadline: File taxes.');
  });

  it('joins several all-day events in a single group segment', () => {
    const segs = buildBriefing(
      [
        ev({ uid: 'a2', summary: 'Conference', allDay: true }),
        ev({ uid: 'a1', summary: 'Company holiday', allDay: true, dtstart: at(0), dtend: at(0) }),
      ],
      { locale: 'en', now: BEFORE },
    );
    expect(keys(segs)).toEqual(['intro', 'allday', 'outro']);
    expect(segs[1].text).toBe('All day: Company holiday, Conference.');
    expect(segs[1].eventUid).toBeUndefined();
  });
});

describe('buildBriefing — time phrasing', () => {
  it('uses EN 12h AM/PM by default', () => {
    const text = (h: number, m: number, eh: number, em: number) =>
      buildBriefing([ev({ uid: 'e', dtstart: at(h, m), dtend: at(eh, em) })], {
        locale: 'en',
        now: BEFORE,
      })[1].text;
    expect(text(9, 0, 10, 0)).toBe('At 9 AM: Standup, for one hour.');
    expect(text(9, 30, 10, 0)).toBe('At 9:30 AM: Standup, for half an hour.');
    expect(text(14, 0, 15, 0)).toBe('At 2 PM: Standup, for one hour.');
    expect(text(12, 15, 13, 0)).toBe('At 12:15 PM: Standup, for 45 minutes.');
  });

  it('uses EN 24h when use24h is set', () => {
    const segs = buildBriefing([ev({ uid: 'e', dtstart: at(14, 30), dtend: at(15, 0) })], {
      locale: 'en',
      use24h: true,
      now: BEFORE,
    });
    expect(segs[1].text).toBe('At 14:30: Standup, for half an hour.');
  });

  it('uses "9 h" / "9 h 30" in French, 24h-style by default', () => {
    const segs = buildBriefing([ev({ uid: 'e' })], { locale: 'fr-FR', now: BEFORE });
    expect(segs[0].text).toBe("Vous avez 1 événement aujourd'hui.");
    expect(segs[1].text).toBe('À 9 h : Standup, pendant une heure.');
    expect(segs[2].text).toBe("C'est tout pour aujourd'hui.");

    const half = buildBriefing([ev({ uid: 'e', dtstart: at(9, 30), dtend: at(10, 0) })], {
      locale: 'fr',
      now: BEFORE,
    });
    expect(half[1].text).toBe('À 9 h 30 : Standup, pendant une demi-heure.');
  });

  it('keeps the "h" style in French even if use24h is false', () => {
    const segs = buildBriefing([ev({ uid: 'e' })], {
      locale: 'fr',
      use24h: false,
      now: BEFORE,
    });
    expect(segs[1].text).toBe('À 9 h : Standup, pendant une heure.');
  });

  it('falls back to English templates for unknown locales', () => {
    const segs = buildBriefing([ev({ uid: 'e' })], { locale: 'de', now: BEFORE });
    expect(segs[1].text).toBe('At 9 AM: Standup, for one hour.');
  });
});

describe('buildBriefing — durations', () => {
  const text = (mins: number, locale = 'en') =>
    buildBriefing(
      [ev({ uid: 'e', dtend: new Date(at(9).getTime() + mins * 60000) })],
      { locale, now: BEFORE },
    )[1].text;

  it('phrases common durations in English', () => {
    expect(text(15)).toContain('for 15 minutes');
    expect(text(30)).toContain('for half an hour');
    expect(text(45)).toContain('for 45 minutes');
    expect(text(60)).toContain('for one hour');
    expect(text(90)).toContain('for an hour and a half');
    expect(text(120)).toContain('for two hours');
    expect(text(150)).toContain('for 2 hours and 30 minutes');
  });

  it('phrases common durations in French', () => {
    expect(text(15, 'fr')).toContain('pendant 15 minutes');
    expect(text(30, 'fr')).toContain('pendant une demi-heure');
    expect(text(45, 'fr')).toContain('pendant 45 minutes');
    expect(text(60, 'fr')).toContain('pendant une heure');
    expect(text(90, 'fr')).toContain('pendant une heure et demie');
    expect(text(120, 'fr')).toContain('pendant 2 heures');
  });

  it('omits the duration when dtend is not after dtstart', () => {
    const segs = buildBriefing([ev({ uid: 'e', dtend: at(9) })], { locale: 'en', now: BEFORE });
    expect(segs[1].text).toBe('At 9 AM: Standup.');
  });
});

describe('buildBriefing — now-aware phrasing', () => {
  it('phrases finished events as "earlier today"', () => {
    const segs = buildBriefing([ev({ uid: 'e' })], { locale: 'en', now: at(11) });
    expect(segs[1].text).toBe('Earlier today: Standup.');
    const fr = buildBriefing([ev({ uid: 'e' })], { locale: 'fr', now: at(11) });
    expect(fr[1].text).toBe("Plus tôt aujourd'hui : Standup.");
  });

  it('phrases in-progress events as ongoing until their end', () => {
    const segs = buildBriefing([ev({ uid: 'e' })], { locale: 'en', now: at(9, 30) });
    expect(segs[1].text).toBe('Standup, in progress until 10 AM.');
    const fr = buildBriefing([ev({ uid: 'e' })], { locale: 'fr', now: at(9, 30) });
    expect(fr[1].text).toBe("Standup, en cours jusqu'à 10 h.");
  });
});

describe('buildBriefing — tasks', () => {
  it('uses deadline phrasing, never "at" a time', () => {
    const segs = buildBriefing(
      [ev({ uid: 't', summary: 'Submit report', isTask: true })],
      { locale: 'en', now: BEFORE },
    );
    expect(keys(segs)).toEqual(['intro', 't', 'outro']);
    expect(segs[1].text).toBe('Deadline: Submit report.');
    const fr = buildBriefing([ev({ uid: 't', summary: 'Submit report', isTask: true })], {
      locale: 'fr',
      now: BEFORE,
    });
    expect(fr[1].text).toBe('Échéance : Submit report.');
  });

  it('keeps deadline phrasing for all-day tasks', () => {
    const segs = buildBriefing(
      [ev({ uid: 't', summary: 'Submit report', isTask: true, allDay: true })],
      { locale: 'en', now: BEFORE },
    );
    expect(segs[1].text).toBe('Deadline: Submit report.');
  });
});

describe('buildBriefing — location and URLs', () => {
  it('detects a meeting provider in a location URL', () => {
    const segs = buildBriefing(
      [ev({ uid: 'e', location: 'https://cloud.example.com/call/abc123' })],
      { locale: 'en', now: BEFORE },
    );
    expect(segs[1].text).toBe('At 9 AM: Standup, for one hour, call on Talk.');
    const fr = buildBriefing(
      [ev({ uid: 'e', location: 'https://cloud.example.com/call/abc123' })],
      { locale: 'fr', now: BEFORE },
    );
    expect(fr[1].text).toBe('À 9 h : Standup, pendant une heure, appel sur Talk.');
  });

  it('detects a meeting provider in talkUrl when location is empty', () => {
    const segs = buildBriefing(
      [ev({ uid: 'e', talkUrl: 'https://meet.google.com/abc-defg-hij' })],
      { locale: 'en', now: BEFORE },
    );
    expect(segs[1].text).toContain('call on Google Meet');
  });

  it('keeps a plain text location as a bare clause', () => {
    const segs = buildBriefing([ev({ uid: 'e', location: 'Room 3' })], {
      locale: 'en',
      now: BEFORE,
    });
    expect(segs[1].text).toBe('At 9 AM: Standup, for one hour, Room 3.');
  });

  it('strips URLs from summaries and never speaks a raw link', () => {
    const segs = buildBriefing(
      [ev({ uid: 'e', summary: 'Review https://example.com/spec now' })],
      { locale: 'en', now: BEFORE },
    );
    expect(segs[1].text).toBe('At 9 AM: Review now, for one hour.');
    expect(segs[1].text).not.toContain('http');
    expect(segs[1].text).not.toContain('example.com');
  });

  it('omits a location that is only a non-meeting URL', () => {
    const segs = buildBriefing(
      [ev({ uid: 'e', location: 'https://example.com/directions' })],
      { locale: 'en', now: BEFORE },
    );
    expect(segs[1].text).toBe('At 9 AM: Standup, for one hour.');
  });

  it('falls back to an untitled label when the summary is only a URL', () => {
    const segs = buildBriefing([ev({ uid: 'e', summary: 'https://example.com' })], {
      locale: 'en',
      now: BEFORE,
    });
    expect(segs[1].text).toBe('At 9 AM: untitled event, for one hour.');
    const fr = buildBriefing([ev({ uid: 'e', summary: 'https://example.com' })], {
      locale: 'fr',
      now: BEFORE,
    });
    expect(fr[1].text).toBe('À 9 h : événement sans titre, pendant une heure.');
  });
});

describe('buildBriefing — attendees', () => {
  it('speaks first names, caps at 3 and counts the rest', () => {
    const segs = buildBriefing(
      [
        ev({
          uid: 'e',
          attendees: [
            { displayName: 'Clara Martin' },
            { email: 'david@example.com' },
            { displayName: 'Eve' },
            { displayName: 'Frank' },
          ],
        }),
      ],
      { locale: 'en', now: BEFORE },
    );
    expect(segs[1].text).toBe('At 9 AM: Standup, for one hour, with Clara, david and 2 others.');
  });

  it('lists up to 3 names without an "others" count', () => {
    const segs = buildBriefing(
      [
        ev({
          uid: 'e',
          attendees: [
            { displayName: 'Clara Martin' },
            { email: 'david@example.com' },
            { displayName: 'Eve' },
          ],
        }),
      ],
      { locale: 'en', now: BEFORE },
    );
    expect(segs[1].text).toContain('with Clara, david and Eve');
    const fr = buildBriefing(
      [
        ev({
          uid: 'e',
          attendees: [{ displayName: 'Clara Martin' }, { displayName: 'Eve' }],
        }),
      ],
      { locale: 'fr', now: BEFORE },
    );
    expect(fr[1].text).toContain('avec Clara et Eve');
  });

  it('uses the email local part as a last resort and skips empties', () => {
    const segs = buildBriefing(
      [ev({ uid: 'e', attendees: [{ email: 'clara.dupont@example.com' }, {}] })],
      { locale: 'en', now: BEFORE },
    );
    expect(segs[1].text).toContain('with clara.');
  });

  it('prefers the given name after the comma in "Last, First" display names', () => {
    const segs = buildBriefing(
      [
        ev({
          uid: 'e',
          attendees: [{ displayName: 'Martin, Clara' }, { displayName: 'Le Grand, Pierre' }],
        }),
      ],
      { locale: 'en', now: BEFORE },
    );
    expect(segs[1].text).toContain('with Clara and Pierre');
  });

  it('never speaks a URL or domain stored in a displayName', () => {
    const segs = buildBriefing(
      [
        ev({
          uid: 'e',
          attendees: [
            { displayName: 'https://example.com/join' },
            { displayName: 'meet.example.com/room-1' },
            { displayName: 'Clara' },
          ],
        }),
      ],
      { locale: 'en', now: BEFORE },
    );
    expect(segs[1].text).toContain('with Clara');
    expect(segs[1].text).not.toContain('http');
    expect(segs[1].text).not.toContain('example.com');
    expect(segs[1].text).not.toContain('meet');
  });
});

describe('buildBriefing — non-today day', () => {
  const onDay = (h: number) => new Date(2026, 7, 12, h); // Wed 12 Aug 2026
  const DAY = new Date(2026, 7, 12);
  const LATER = new Date(2026, 7, 13, 9); // "now" after the briefed day

  it('names the day in intro and outro instead of "today"', () => {
    const segs = buildBriefing([ev({ uid: 'e', dtstart: onDay(9), dtend: onDay(10) })], {
      locale: 'en',
      now: LATER,
      day: DAY,
    });
    expect(segs[0].text).toBe('You have 1 event on Wednesday, August 12.');
    expect(segs[2].text).toBe("That's all for Wednesday, August 12.");
  });

  it('uses the French day name and word order', () => {
    const segs = buildBriefing([ev({ uid: 'e', dtstart: onDay(9), dtend: onDay(10) })], {
      locale: 'fr-FR',
      now: LATER,
      day: DAY,
    });
    expect(segs[0].text).toBe('Vous avez 1 événement mercredi 12 août.');
    expect(segs[2].text).toBe("C'est tout pour mercredi 12 août.");
  });

  it('keeps plain "At" phrasing for finished events on another day', () => {
    const segs = buildBriefing([ev({ uid: 'e', dtstart: onDay(9), dtend: onDay(10) })], {
      locale: 'en',
      now: LATER,
      day: DAY,
    });
    // without the sameDay gate this would wrongly say "Earlier today"
    expect(segs[1].text).toBe('At 9 AM: Standup, for one hour.');
  });
});

describe('buildBriefing — maxSegments overflow', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      ev({ uid: `e${i}`, dtstart: at(9 + i), dtend: at(10 + i) }),
    );

  it('folds unlisted events into the outro', () => {
    const segs = buildBriefing(many(5), { locale: 'en', now: BEFORE, maxSegments: 4 });
    expect(keys(segs)).toEqual(['intro', 'e0', 'e1', 'outro']);
    expect(segs[0].text).toBe('You have 5 events today.');
    expect(segs[3].text).toBe("That's all for today, and 3 more events.");
  });

  it('uses the singular for a single overflow event', () => {
    const segs = buildBriefing(many(3), { locale: 'en', now: BEFORE, maxSegments: 4 });
    expect(segs[3].text).toBe("That's all for today, and 1 more event.");
  });

  it('speaks the French overflow phrasing', () => {
    const segs = buildBriefing(many(4), { locale: 'fr', now: BEFORE, maxSegments: 4 });
    expect(segs[3].text).toBe("C'est tout pour aujourd'hui, et 2 autres événements.");
    const one = buildBriefing(many(3), { locale: 'fr', now: BEFORE, maxSegments: 4 });
    expect(one[3].text).toBe("C'est tout pour aujourd'hui, et 1 autre événement.");
  });

  it('counts the all-day group as one segment but its events as overflow when dropped', () => {
    const events = [
      ...many(2),
      ev({ uid: 'a1', summary: 'Holiday', allDay: true }),
      ev({ uid: 'a2', summary: 'Offsite', allDay: true }),
      ev({ uid: 'a3', summary: 'Conference', allDay: true }),
    ];
    const segs = buildBriefing(events, { locale: 'en', now: BEFORE, maxSegments: 4 });
    expect(keys(segs)).toEqual(['intro', 'e0', 'e1', 'outro']);
    expect(segs[3].text).toBe("That's all for today, and 3 more events.");
  });

  it('fits the whole all-day group in a single slot when there is room', () => {
    const events = [
      ev({ uid: 't1' }),
      ev({ uid: 'a1', summary: 'Holiday', allDay: true }),
      ev({ uid: 'a2', summary: 'Offsite', allDay: true }),
    ];
    const segs = buildBriefing(events, { locale: 'en', now: BEFORE, maxSegments: 4 });
    expect(keys(segs)).toEqual(['intro', 't1', 'allday', 'outro']);
    expect(segs[2].text).toBe('All day: Holiday, Offsite.');
    expect(segs[3].text).toBe("That's all for today.");
  });
});

describe('briefing voice/day helpers', () => {
  it('keeps the app voice for French and English, falls back to en-US otherwise', () => {
    expect(briefingVoiceLocale('fr-FR')).toBe('fr-FR');
    expect(briefingVoiceLocale('en-GB')).toBe('en-GB');
    expect(briefingVoiceLocale('de-DE')).toBe('en-US');
    expect(briefingVoiceLocale('ru-RU')).toBe('en-US');
  });

  it('labels a day in the app language with the right dayjs locale', () => {
    const day = new Date(2026, 7, 10); // Monday 10 Aug 2026
    expect(briefingDayLabel(day, 'en')).toBe('Monday, August 10');
    expect(briefingDayLabel(day, 'fr')).toBe('lundi 10 août');
    expect(briefingDayLabel(day, 'de')).toBe('Montag 10 August');
    expect(briefingDayLabel(day, 'oc')).toBe('diluns 10 agost');
  });
});
