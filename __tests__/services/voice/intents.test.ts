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

  it('« mon programme » is agenda, not the «programmer» create verb', () => {
    expect(U('quel est mon programme demain')).toEqual({ kind: 'agenda', day: day(13) });
    expect(U('montre mon programme lundi')).toEqual({ kind: 'agenda', day: day(17) });
    // verb usage without a possessive stays a create
    expect(U('programme un rdv dentiste demain 14h').kind).toBe('create');
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

  it("«dans l'agenda X» → calendarName, stripped from the summary", () => {
    const i = U("crée un rdv demain à 15h dans l'agenda personnel");
    expect(i).toEqual({
      kind: 'create', summary: 'rdv', start: at(13, 15), end: undefined, names: undefined,
      calendarName: 'personnel',
    });
    expect(U("ajoute un point mardi à 10h dans mon agenda planning clara")).toEqual({
      kind: 'create', summary: 'point', start: at(18, 10), end: undefined, names: undefined,
      calendarName: 'planning clara',
    });
  });

  it('EN "in X calendar" mirrors', () => {
    expect(U('schedule a call friday at 5pm in work calendar', 'en')).toEqual({
      kind: 'create', summary: 'call', start: at(14, 17), end: undefined, names: undefined,
      calendarName: 'work',
    });
    expect(U('create lunch tomorrow at noon in my personal calendar', 'en')).toEqual({
      kind: 'create', summary: 'lunch', start: at(13, 12), end: undefined, names: undefined,
      calendarName: 'personal',
    });
  });

  it('«dans 2 heures» stays a duration — no agenda/calendar keyword, no calendarName', () => {
    const i = U('crée un rappel dans 2 heures');
    expect(i).toEqual({
      kind: 'create', summary: 'rappel', start: at(12, 12), end: undefined, names: undefined,
      calendarName: undefined,
    });
  });

  it("empty calendar clause («dans l'agenda» alone) → no calendarName", () => {
    const i = U("crée un rdv demain à 15h dans l'agenda");
    expect(i.kind).toBe('create');
    if (i.kind === 'create') expect(i.calendarName).toBeUndefined();
  });

  it('post-datetime « au/à la/chez » clause → location (not dropped, not in title)', () => {
    expect(U('cree rdv client demain a 14h au bureau')).toEqual({
      kind: 'create', summary: 'rdv client', start: at(13, 14), end: undefined, names: undefined,
      location: 'bureau',
    });
    expect(U('crée un rdv demain à 15h à la clinique')).toEqual({
      kind: 'create', summary: 'rdv', start: at(13, 15), end: undefined, names: undefined,
      location: 'clinique',
    });
    expect(U('meeting friday at 3pm at the office', 'en')).toEqual({
      kind: 'create', summary: 'meeting', start: at(14, 15), end: undefined, names: undefined,
      location: 'office',
    });
  });

  it('« salle/room » tail keeps the room word in the location', () => {
    const i = U('cree reunion equipe vendredi a 15h salle B');
    if (i.kind !== 'create') throw new Error('not create');
    expect(i.location).toBe('salle B');
    const j = U('meeting tomorrow at 9am room 42', 'en');
    if (j.kind !== 'create') throw new Error('not create');
    expect(j.location).toBe('room 42');
  });

  it('« chez » BEFORE the date stays in the title (no location)', () => {
    const i = U('cree rdv chez le dentiste mardi a 9h');
    if (i.kind !== 'create') throw new Error('not create');
    expect(i.summary).toBe('rdv chez le dentiste');
    expect(i.location).toBeUndefined();
  });

  it('« description/note/détails » clause → description, stripped from title', () => {
    expect(U('cree reunion equipe jeudi a 10h description apporter les documents')).toEqual({
      kind: 'create', summary: 'reunion equipe', start: at(13, 10), end: undefined, names: undefined,
      description: 'apporter les documents',
    });
    const i = U('cree un point demain a 11h avec la note prevoir le cable hdmi');
    if (i.kind !== 'create') throw new Error('not create');
    expect(i.description).toBe('prevoir le cable hdmi');
    const j = U('schedule a call tomorrow at 10am with description bring signed papers', 'en');
    if (j.kind !== 'create') throw new Error('not create');
    expect(j.description).toBe('bring signed papers');
  });

  it('location + description + names + calendar all coexist', () => {
    const i = U('cree point client demain a 14h au siege avec Marc dans agenda pro description premier contact');
    if (i.kind !== 'create') throw new Error('not create');
    expect(i.summary).toBe('point client');
    expect(i.location).toBe('siege');
    expect(i.names).toEqual(['Marc']);
    expect(i.calendarName).toBe('pro');
    expect(i.description).toBe('premier contact');
  });

  it('no markers → location/description stay undefined', () => {
    const i = U('cree un rdv demain a 14h');
    if (i.kind !== 'create') throw new Error('not create');
    expect(i.location).toBeUndefined();
    expect(i.description).toBeUndefined();
  });

  it('« avec la note » is a description connector — NOT an attendee connector', () => {
    const i = U('cree un point demain a 11h avec la note prevoir le cable');
    if (i.kind !== 'create') throw new Error('not create');
    expect(i.names).toBeUndefined();
    expect(i.description).toBe('prevoir le cable');
    const j = U('schedule sync tomorrow at 9am with description bring the deck', 'en');
    if (j.kind !== 'create') throw new Error('not create');
    expect(j.names).toBeUndefined();
    expect(j.description).toBe('bring the deck');
  });

  it('times inside a description are text — not the event end', () => {
    const i = U('cree un point demain a 10h description appeler Marc a 15h');
    if (i.kind !== 'create') throw new Error('not create');
    expect(i.start).toEqual(at(13, 10));
    expect(i.end).toBeUndefined();
    expect(i.description).toBe('appeler Marc a 15h');
  });

  it('a place clause after the calendar name is the location, not the calendar', () => {
    const i = U('cree point demain a 14h dans agenda pro au bureau');
    if (i.kind !== 'create') throw new Error('not create');
    expect(i.calendarName).toBe('pro');
    expect(i.location).toBe('bureau');
  });

  it('description keeps its leading article (« un rapport à préparer »)', () => {
    const i = U('cree un point demain a 10h description un rapport a preparer');
    if (i.kind !== 'create') throw new Error('not create');
    expect(i.description).toBe('un rapport a preparer');
  });
});

describe('slot', () => {
    it("«trouve une dispo pour une réunion avec Devin demain … et fais l'invitation» → day + names + summary", () => {
        expect(
            U("trouve moi une disponibilité pour une reunion avec Devin demain dans la journée et fait l'invitation"),
        ).toEqual({ kind: 'slot', day: day(13), durationMin: undefined, summary: 'reunion', names: ['Devin'], calendarName: undefined });
    });

    it('duration «pendant 2h» / «d\'une demi-heure»', () => {
        expect(U('trouve un créneau demain pendant 2h')).toMatchObject({ kind: 'slot', day: day(13), durationMin: 120 });
        expect(U("cherche un trou d'une demi-heure vendredi")).toMatchObject({ kind: 'slot', durationMin: 30 });
    });

    it('duration «de 30 minutes» / "a 30-minute slot"', () => {
        expect(U('trouve un créneau de 30 minutes demain')).toMatchObject({ kind: 'slot', day: day(13), durationMin: 30 });
        expect(U('cherche une dispo de 45 min vendredi')).toMatchObject({ kind: 'slot', durationMin: 45 });
        expect(U('find a 30-minute slot friday', 'en')).toMatchObject({ kind: 'slot', durationMin: 30 });
    });

    it('«un créneau dans 30 minutes» is a moment, not a duration', () => {
        expect(U('trouve un créneau dans 30 minutes')).toMatchObject({ kind: 'slot', durationMin: undefined });
    });

    it('«suis-je libre vendredi ?» / «temps libre»', () => {
        expect(U('suis-je libre vendredi ?')).toEqual({ kind: 'slot', day: day(14), durationMin: undefined, summary: undefined, names: undefined, calendarName: undefined });
        expect(U("quand ai-je du temps libre demain dans l'agenda planning clara")).toMatchObject({ kind: 'slot', day: day(13), calendarName: 'planning clara' });
    });

    it('EN "find a slot … for 30 minutes" + "am i free"', () => {
        expect(U('find me a slot for a meeting with Anna tomorrow for 30 minutes', 'en')).toMatchObject({
            kind: 'slot', day: day(13), durationMin: 30, summary: 'meeting', names: ['Anna'],
        });
        expect(U('am i free friday', 'en')).toMatchObject({ kind: 'slot', day: day(14) });
    });

    it('«crée un créneau demain à 14h» stays create — the earlier verb wins', () => {
        expect(U('crée un créneau demain à 14h')).toMatchObject({ kind: 'create' });
    });
});

describe('move', () => {
  it('«décale mon call de 15h à 16h» → title + when + newStart', () => {
    expect(U('décale mon call de 15h à 16h')).toEqual({
      kind: 'move',
      target: { title: 'call', when: at(12, 15) },
      newStart: at(12, 16),
      newStartHasTime: true,
    });
  });

  it('"move my 3pm call to 4pm" — same, time embedded in title', () => {
    expect(U('move my 3pm call to 4pm', 'en')).toEqual({
      kind: 'move',
      target: { title: 'call', when: at(12, 15) },
      newStart: at(12, 16),
      newStartHasTime: true,
    });
  });

  it('day-only targets', () => {
    expect(U('décale le rdv à demain')).toEqual({
      kind: 'move',
      target: { title: 'rdv', when: undefined },
      newStart: day(13),
      newStartHasTime: false,
    });
    expect(U('décale le rdv de demain à vendredi')).toEqual({
      kind: 'move',
      target: { title: 'rdv', when: day(13) },
      newStart: day(14),
      newStartHasTime: false,
    });
    expect(U('décale mon meeting de 14h à demain 15h')).toEqual({
      kind: 'move',
      target: { title: 'meeting', when: at(12, 14) },
      newStart: at(13, 15),
      newStartHasTime: true,
    });
  });

  it('only a «de/from» moment → no destination → freeform', () => {
    expect(U('décale le rdv de 15h')).toEqual({ kind: 'freeform', text: 'décale le rdv de 15h' });
    expect(U('décale le rdv')).toEqual({ kind: 'freeform', text: 'décale le rdv' });
  });
});

describe('details', () => {
  it('« lis la description de X » → details with the title after the marker', () => {
    const i = U('lis la description de rdv client');
    expect(i).toEqual({ kind: 'details', target: { title: 'rdv client', when: undefined } });
    const j = U('donne les détails du point avec Marc demain');
    expect(j).toEqual({ kind: 'details', target: { title: 'point avec Marc', when: day(13) } });
  });

  it('« où se passe / où a lieu » → details', () => {
    const i = U('ou se passe le rdv client vendredi');
    expect(i).toEqual({ kind: 'details', target: { title: 'rdv client', when: day(14) } });
    const j = U("c'est ou la reunion");
    expect(j).toEqual({ kind: 'details', target: { title: 'reunion', when: undefined } });
  });

  it('EN mirrors: "where is" / "read the description of"', () => {
    const i = U('where is my dentist appointment on friday', 'en');
    expect(i).toEqual({ kind: 'details', target: { title: 'dentist appointment', when: day(14) } });
    const j = U('read the description of the team meeting', 'en');
    expect(j).toEqual({ kind: 'details', target: { title: 'team meeting', when: undefined } });
  });

  it('create verb still wins over a description marker (« cree rdv description X »)', () => {
    const i = U('cree rdv demain a 10h description note importante');
    if (i.kind !== 'create') throw new Error('not create');
    expect(i.description).toBe('note importante');
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
    // «suis-je libre» was freeform before the slot intent existed — now routed locally
    expect(U('est-ce que je suis libre jeudi après-midi ?')).toMatchObject({ kind: 'slot', day: day(13) });
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
