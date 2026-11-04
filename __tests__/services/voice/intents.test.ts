import { parseUtterance, type VoiceIntent } from '@/services/voice/intents';

const NOW = new Date(2026, 7, 12, 10, 0); // Wed 12 Aug 2026, 10:00 local
const day = (d: number, mo = 7) => new Date(2026, mo, d);
const at = (d: number, h: number, m = 0) => new Date(2026, 7, d, h, m);
const U = (s: string, locale = 'fr'): VoiceIntent => parseUtterance(s, { now: NOW, locale });

describe('agenda', () => {
  it("«qu'est-ce que j'ai …» variants + EN", () => {
    expect(U("qu'est-ce que j'ai aujourd'hui ?")).toEqual({ kind: 'agenda', day: day(12) });
    expect(U("qu'est-ce que j'ai lundi")).toEqual({ kind: 'agenda', day: day(17) });
    expect(U('qu est ce que j ai demain')).toEqual({ kind: 'agenda', day: day(13) });
    expect(U("what's on friday", 'en')).toEqual({ kind: 'agenda', day: day(14) });
    expect(U("what's on", 'en')).toEqual({ kind: 'agenda', day: day(12) });
    expect(U('what do i have tomorrow', 'en')).toEqual({ kind: 'agenda', day: day(13) });
  });

  it('«agenda», «planning», «mes événements»', () => {
    expect(U('agenda de demain')).toEqual({ kind: 'agenda', day: day(13) });
    expect(U('mon planning lundi')).toEqual({ kind: 'agenda', day: day(17) });
    expect(U('mes événements vendredi')).toEqual({ kind: 'agenda', day: day(14) });
    expect(U('my agenda', 'en')).toEqual({ kind: 'agenda', day: day(12) });
  });
});

describe('next', () => {
  it('«prochain(e) X» / "next X"', () => {
    expect(U('prochain rendez-vous')).toEqual({ kind: 'next' });
    expect(U('mon prochain événement')).toEqual({ kind: 'next' });
    expect(U('prochaine réunion')).toEqual({ kind: 'next' });
    expect(U("what's my next meeting", 'en')).toEqual({ kind: 'next' });
  });

  it('next wins over a create-noun («prochain rdv demain» ≠ create)', () => {
    expect(U('prochain rdv demain')).toEqual({ kind: 'next' });
  });
});

describe('create', () => {
  it('verb-less noun trigger keeps the noun in the summary', () => {
    // RULE: a noun trigger (rdv, meeting…) is part of the title — only verb
    // triggers are stripped. «rendez-vous dentiste …» → 'rendez-vous dentiste'.
    const i = U('rendez-vous dentiste demain à 14h30');
    expect(i).toEqual({ kind: 'create', summary: 'rendez-vous dentiste', start: at(13, 14, 30), end: undefined, names: undefined });
  });

  it('verb trigger strips verb + articles, keeps rest up to the first moment', () => {
    const i = U('crée un point avec Marc demain à 14h');
    expect(i).toEqual({ kind: 'create', summary: 'point', start: at(13, 14), end: undefined, names: ['Marc'] });
  });

  it('EN mirrors', () => {
    expect(U('lunch with Marc tomorrow at 12:30', 'en')).toEqual({
      kind: 'create', summary: 'lunch', start: at(13, 12, 30), end: undefined, names: ['Marc'],
    });
    expect(U('schedule a call with Marc and Sofia friday at 9am', 'en')).toEqual({
      kind: 'create', summary: 'call', start: at(14, 9), end: undefined, names: ['Marc', 'Sofia'],
    });
    expect(U('dentist appointment friday at 5pm', 'en')).toEqual({
      kind: 'create', summary: 'dentist appointment', start: at(14, 17), end: undefined, names: undefined,
    });
  });

  it('«de 14h à 15h» → start + end', () => {
    expect(U('crée un truc de 14h à 15h')).toEqual({
      kind: 'create', summary: 'truc', start: at(12, 14), end: at(12, 15), names: undefined,
    });
  });

  it('day without time → start at local midnight (caller picks the hour)', () => {
    const i = U('crée un rdv demain');
    expect(i.kind).toBe('create');
    if (i.kind === 'create') expect(i.start).toEqual(day(13));
  });

  it('«jusqu’à 15h» alone bounds the end, start stays midnight', () => {
    const i = U('crée un truc demain jusqu’à 15h');
    expect(i.kind).toBe('create');
    if (i.kind === 'create') {
      expect(i.start).toEqual(day(13));
      expect(i.end).toEqual(at(13, 15));
    }
  });

  it('«nouveau rdv», infinitives, dans N heures', () => {
    expect(U('nouveau rdv avec Léa mardi à 11h')).toEqual({
      kind: 'create', summary: 'rdv', start: at(18, 11), end: undefined, names: ['Léa'],
    });
    expect(U('ajoute un rdv dentiste lundi à 10h30')).toEqual({
      kind: 'create', summary: 'rdv dentiste', start: at(17, 10, 30), end: undefined, names: undefined,
    });
    expect(U('crée un rappel dans 2 heures')).toEqual({
      kind: 'create', summary: 'rappel', start: at(12, 12), end: undefined, names: undefined,
    });
  });

  it('no parseable datetime → freeform', () => {
    expect(U('crée un truc')).toEqual({ kind: 'freeform', text: 'crée un truc' });
    expect(U('schedule meeting', 'en')).toEqual({ kind: 'freeform', text: 'schedule meeting' });
  });
});

describe('move', () => {
  it('«décale mon call de 15h à 16h» → title + when + newStart', () => {
    expect(U('décale mon call de 15h à 16h')).toEqual({
      kind: 'move',
      target: { title: 'call', when: at(12, 15) },
      newStart: at(12, 16),
    });
  });

  it('"move my 3pm call to 4pm" — same, time embedded in title', () => {
    expect(U('move my 3pm call to 4pm', 'en')).toEqual({
      kind: 'move',
      target: { title: 'call', when: at(12, 15) },
      newStart: at(12, 16),
    });
  });

  it('day-only targets', () => {
    expect(U('décale le rdv à demain')).toEqual({
      kind: 'move',
      target: { title: 'rdv', when: undefined },
      newStart: day(13),
    });
    expect(U('décale le rdv de demain à vendredi')).toEqual({
      kind: 'move',
      target: { title: 'rdv', when: day(13) },
      newStart: day(14),
    });
    expect(U('décale mon meeting de 14h à demain 15h')).toEqual({
      kind: 'move',
      target: { title: 'meeting', when: at(12, 14) },
      newStart: at(13, 15),
    });
  });

  it('only a «de/from» moment → no destination → freeform', () => {
    expect(U('décale le rdv de 15h')).toEqual({ kind: 'freeform', text: 'décale le rdv de 15h' });
    expect(U('décale le rdv')).toEqual({ kind: 'freeform', text: 'décale le rdv' });
  });
});

describe('delete', () => {
  it('title only / title + when / bare verb', () => {
    expect(U('supprime TTest5')).toEqual({ kind: 'delete', target: { title: 'TTest5', when: undefined } });
    expect(U('supprime')).toEqual({ kind: 'delete', target: { title: undefined, when: undefined } });
    expect(U('annule le rdv de demain')).toEqual({ kind: 'delete', target: { title: 'rdv', when: day(13) } });
    expect(U('delete standup', 'en')).toEqual({ kind: 'delete', target: { title: 'standup', when: undefined } });
    expect(U('cancel dinner tomorrow', 'en')).toEqual({ kind: 'delete', target: { title: 'dinner', when: day(13) } });
  });

  it('verb beats a later create-noun («supprime le rdv…» is delete, not create)', () => {
    const i = U('supprime le rdv demain à 10h');
    expect(i.kind).toBe('delete');
    if (i.kind === 'delete') expect(i.target.when).toEqual(at(13, 10));
  });
});

describe('freeform / unknown fallback', () => {
  it('untagged questions → freeform', () => {
    expect(U('est-ce que je suis libre jeudi après-midi ?')).toEqual({
      kind: 'freeform',
      text: 'est-ce que je suis libre jeudi après-midi ?',
    });
    expect(U('quel temps fait-il demain')).toEqual({ kind: 'freeform', text: 'quel temps fait-il demain' });
  });

  it('short / empty / garbage → unknown', () => {
    expect(U('coucou')).toEqual({ kind: 'unknown', raw: 'coucou' });
    expect(U('bonjour')).toEqual({ kind: 'unknown', raw: 'bonjour' });
    expect(U('ok merci')).toEqual({ kind: 'unknown', raw: 'ok merci' });
    expect(U('')).toEqual({ kind: 'unknown', raw: '' });
    expect(U('   ')).toEqual({ kind: 'unknown', raw: '' });
    expect(U('bla bla bla')).toEqual({ kind: 'freeform', text: 'bla bla bla' }); // ≥3 words
  });
});
