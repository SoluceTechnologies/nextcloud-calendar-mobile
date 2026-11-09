import { extractMoments, momentToDate, parseMoment } from '@/services/voice/dateParse';

const NOW = new Date(2026, 7, 12, 10, 0); // Wed 12 Aug 2026, 10:00 local
const day = (d: number, mo = 7, y = 2026) => new Date(y, mo, d); // mo 0-based
const at = (d: number, h: number, m = 0, mo = 7) => new Date(2026, mo, d, h, m);
const P = (s: string) => parseMoment(s, { now: NOW, locale: 'fr' });

describe('parseMoment — days', () => {
  it("aujourd'hui / today → today at midnight, no time", () => {
    expect(P("aujourd'hui")).toEqual({ day: day(12) });
    expect(P('today')).toEqual({ day: day(12) });
    expect(P('aujourd’hui')).toEqual({ day: day(12) }); // typographic apostrophe
  });

  it('demain / tomorrow → +1 day', () => {
    expect(P('demain')).toEqual({ day: day(13) });
    expect(P('tomorrow')).toEqual({ day: day(13) });
  });

  it('après-demain / day after tomorrow → +2 days', () => {
    expect(P('après-demain')).toEqual({ day: day(14) });
    expect(P('apres demain')).toEqual({ day: day(14) });
    expect(P('day after tomorrow')).toEqual({ day: day(14) });
    // «demain» inside «après-demain» must not double-count
    expect(extractMoments('après-demain', { now: NOW })).toHaveLength(1);
  });

  it('weekday → next occurrence strictly after today', () => {
    expect(P('lundi')).toEqual({ day: day(17) }); // Mon 17
    expect(P('jeudi')).toEqual({ day: day(13) });
    expect(P('dimanche')).toEqual({ day: day(16) });
    expect(P('friday')).toEqual({ day: day(14) });
    expect(P('monday')).toEqual({ day: day(17) });
  });

  it('same weekday rolls to next week', () => {
    expect(P('mercredi')).toEqual({ day: day(19) }); // today is Wed → +7
    expect(P('wednesday')).toEqual({ day: day(19) });
  });

  it('«lundi prochain» / "next monday" forces the following week', () => {
    expect(P('lundi prochain')).toEqual({ day: day(24) });
    expect(P('next monday')).toEqual({ day: day(24) });
    expect(P('ce jeudi')).toEqual({ day: day(13) }); // «ce X» = plain next occurrence
  });

  it('«dans N jours» / "in N days"', () => {
    expect(P('dans 3 jours')).toEqual({ day: day(15) });
    expect(P('dans 1 jour')).toEqual({ day: day(13) });
    expect(P('in 2 days')).toEqual({ day: day(14) });
    expect(P('dans une semaine')).toBeNull(); // weeks unsupported
  });

  it('«dans N heures» / "in N hours" carries day+time of the target', () => {
    expect(P('dans 2 heures')).toEqual({ day: day(12), time: { h: 12, m: 0 } });
    expect(P('in 3 hours')).toEqual({ day: day(12), time: { h: 13, m: 0 } });
    expect(P('dans 20 heures')).toEqual({ day: day(13), time: { h: 6, m: 0 } }); // day rollover
    expect(extractMoments('dans 2 heures', { now: NOW })).toHaveLength(1); // no stray «2 h» time
  });

  it('«le 12/05» — dd/mm, rolls to next year when past', () => {
    expect(P('le 15/08')).toEqual({ day: day(15, 7) });
    expect(P('12/05')).toEqual({ day: day(12, 4, 2027) });
    expect(P('le 12/05/2028')).toEqual({ day: day(12, 4, 2028) });
    expect(P('le 31/02')).toBeNull(); // invalid date
  });
});

describe('parseMoment — times (day defaults to today)', () => {
  it('FR «14h30», «14 h 30», «14h»', () => {
    expect(P('à 14h30')).toEqual({ day: day(12), time: { h: 14, m: 30 } });
    expect(P('14 h 30')).toEqual({ day: day(12), time: { h: 14, m: 30 } });
    expect(P('14h')).toEqual({ day: day(12), time: { h: 14, m: 0 } });
    expect(P('9h05')).toEqual({ day: day(12), time: { h: 9, m: 5 } });
  });

  it('EN «2:30 pm», «2 pm», «14:30»', () => {
    expect(P('at 2:30 pm')).toEqual({ day: day(12), time: { h: 14, m: 30 } });
    expect(P('2 pm')).toEqual({ day: day(12), time: { h: 14, m: 0 } });
    expect(P('2:30 am')).toEqual({ day: day(12), time: { h: 2, m: 30 } });
    expect(P('14:30')).toEqual({ day: day(12), time: { h: 14, m: 30 } });
    expect(P('12pm')).toEqual({ day: day(12), time: { h: 12, m: 0 } });
    expect(P('12am')).toEqual({ day: day(12), time: { h: 0, m: 0 } });
  });

  it('«midi»/«noon» = 12:00, «minuit»/«midnight» = 00:00', () => {
    expect(P('midi')).toEqual({ day: day(12), time: { h: 12, m: 0 } });
    expect(P('noon')).toEqual({ day: day(12), time: { h: 12, m: 0 } });
    expect(P('minuit')).toEqual({ day: day(12), time: { h: 0, m: 0 } });
  });

  it('rejects out-of-range times', () => {
    expect(P('25h')).toBeNull();
    expect(P('14:75')).toBeNull();
  });
});

describe('parseMoment — composition & misc', () => {
  it('merges «demain à 14h30» / "friday at 9am" into one moment', () => {
    expect(P('demain à 14h30')).toEqual({ day: day(13), time: { h: 14, m: 30 } });
    expect(P('friday at 9am')).toEqual({ day: day(14), time: { h: 9, m: 0 } });
    expect(P('le 15/08 à 10h')).toEqual({ day: day(15), time: { h: 10, m: 0 } });
  });

  it('keeps «de 14h à 15h» as two moments', () => {
    const moms = extractMoments('de 14h à 15h', { now: NOW });
    expect(moms).toHaveLength(2);
    expect(moms[0].moment.time).toEqual({ h: 14, m: 0 });
    expect(moms[1].moment.time).toEqual({ h: 15, m: 0 });
  });

  it('returns the FIRST moment of a fragment', () => {
    expect(P('de 14h à 15h')).toEqual({ day: day(12), time: { h: 14, m: 0 } });
  });

  it('null on garbage / empty / no moment', () => {
    expect(P('')).toBeNull();
    expect(P('réunion bidon')).toBeNull();
    expect(P('bonjour')).toBeNull();
  });

  it('momentToDate applies time over the midnight day', () => {
    expect(momentToDate({ day: day(13), time: { h: 14, m: 30 } })).toEqual(at(13, 14, 30));
    expect(momentToDate({ day: day(13) })).toEqual(day(13));
  });
});
