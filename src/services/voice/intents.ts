// Hand-rolled bilingual (EN/FR) intent classifier.
// Keyword-tagged utterances only; tags compete by position (earliest wins,
// contract order as tie-break) so noun-triggers («rdv», "meeting") cannot
// hijack a leading move/delete verb («supprime le rdv» → delete, not create).
// Mutations without a parseable datetime degrade to `freeform` (tier-2).

import { extractMoments, momentToDate, startOfDay, type MomentMatch } from './dateParse';

export type VoiceIntent =
  | { kind: 'agenda'; day: Date }
  | { kind: 'next' }
  | { kind: 'create'; summary?: string; start: Date; end?: Date; names?: string[] }
  | { kind: 'move'; target: { title?: string; when?: Date }; newStart: Date }
  | { kind: 'delete'; target: { title?: string; when?: Date } }
  | { kind: 'freeform'; text: string }
  | { kind: 'unknown'; raw: string };

type Kind = 'agenda' | 'next' | 'create' | 'move' | 'delete';

const A = 'a-zàâäçéèêëîïôöùûüÿœ';
const rx = (s: string) => new RegExp(`(^|[^${A}0-9])(?:${s})(?![${A}0-9])`, 'i');

const AGENDA = [
  `qu['’\\s-]?est[-\\s]ce\\s+que\\s+j['’\\s]?ai`,
  `c['’]est\\s+quoi\\s+(?:(?:mon|mes|le)\\s+)?(?:agenda|planning|programme)`,
  `(?:mon|mes|ton|tes|son|ses|notre|votre|le|les|the|my)\\s+(?:agenda|planning|événements?|evenements?|rendez[-\\s]?vous|rdv|réunions?|reunions?|meetings?|events?)(?![a-zà-ÿ])`,
  `agenda`,
  `planning`,
  `what['’\\s]?s\\s+on`,
  `what\\s+is\\s+on`,
  `what\\s+do\\s+i\\s+have`,
];

const NEXT = [
  `prochaine?s?\\s+(?:événement|evenement|event|rdv|rendez[-\\s]?vous|réunion|reunion|meeting|appel|call|entretien|interview)`,
  `(?:next|upcoming)\\s+(?:event|meeting|appointment|call|rendez[-\\s]?vous|interview)`,
];

const CREATE_VERB = [
  `crée?r?|cree?r?`,
  `ajoute[zr]?|ajouter`,
  `planifie[zr]?|planifier`,
  `programme[zr]?|programmer`,
  `prévoie?s?|prevoie?s?|prévoir|prevoir`,
  `nouveau|nouvel(?:le)?`,
  `create|add|schedule|book|new|plan|set\\s+up`,
];

// event nouns that open an implicit create («rendez-vous dentiste demain à 14h30»);
// kept in the summary — a noun tag is a title word, not a disposable verb
const CREATE_NOUN = [
  `rendez[-\\s]?vous|rdv|réunion|reunion|entretien|point|appel|call|déjeuner|dejeuner|dîner|diner|repas|session|événement|evenement|event`,
  `meeting|appointment|lunch|dinner|standup|interview|breakfast`,
];

const MOVE = [
  `décale?r?|decale?r?`,
  `déplace?r?|deplace?r?`,
  `reporte?r?`,
  `avance?r?`,
  `recule?r?`,
  `repousse?r?`,
  `modifie?r?|change?s?|changer`,
  `move|reschedule|postpone|shift|push`,
];

const DELETE = [
  `supprime?r?`,
  `annule?r?`,
  `efface?r?`,
  `enlève?r?|enleve?r?`,
  `retire?r?`,
  `delete|cancel|remove|drop`,
];

interface Tag {
  kind: Kind;
  start: number;
  end: number;
  noun?: boolean;
}

// group order = contract priority (agenda > next > create > move > delete)
const GROUPS: { kind: Kind; noun?: boolean; res: RegExp[] }[] = [
  { kind: 'agenda', res: AGENDA.map(rx) },
  { kind: 'next', res: NEXT.map(rx) },
  { kind: 'create', res: CREATE_VERB.map(rx) },
  { kind: 'create', noun: true, res: CREATE_NOUN.map(rx) },
  { kind: 'move', res: MOVE.map(rx) },
  { kind: 'delete', res: DELETE.map(rx) },
];

function findTag(norm: string): Tag | null {
  const found: { tag: Tag; prio: number }[] = [];
  GROUPS.forEach((g, prio) => {
    for (const re of g.res) {
      const m = re.exec(norm);
      if (m) found.push({ tag: { kind: g.kind, noun: g.noun, start: m.index + m[1].length, end: m.index + m[0].length }, prio });
    }
  });
  if (!found.length) return null;
  found.sort((a, b) => a.tag.start - b.tag.start || a.prio - b.prio);
  return found[0].tag;
}

const LEAD = /^\s*(?:un|une|des|du|de|de\s+la|de\s+l['’]|le|la|les|l['’]|mon|ma|mes|ce|cet|cette|au|aux|a|an|the|my|some)\s+/i;
const TRAIL = /\s+(?:de|du|des|d['’]|à|a|at|to|on|of|for|with|pour|en|au|aux|le|la|les|the|an|et|and|my|un|une|from)\s*$/i;
const PUNCT = /^[\s,.;:!?'"()«»\-]+|[\s,.;:!?'"()«»\-]+$/g;
const BARE = /^(?:de|du|des|d['’]|à|a|at|to|on|of|for|with|pour|en|au|aux|le|la|les|l['’]|the|an|et|and|my|un|une|from|since|vers|sur|ce|cet|cette|mon|ma|mes)$/i;

function cleanTitle(raw: string): string | undefined {
  let s = raw.replace(PUNCT, '');
  let prev: string;
  do {
    prev = s;
    s = s
      .replace(LEAD, '')
      .replace(/^[ld]['’]/i, '')
      .replace(TRAIL, '')
      .replace(PUNCT, '');
  } while (s !== prev);
  if (!s || BARE.test(s)) return undefined;
  return s;
}

function titleBefore(body: string, moms: MomentMatch[], upto: number): string | undefined {
  let s = '';
  let pos = 0;
  for (const m of moms) {
    if (m.start >= upto) break;
    s += `${body.slice(pos, m.start)} `;
    pos = m.end;
  }
  if (pos < upto) s += body.slice(pos, upto);
  return cleanTitle(s);
}

const WORD = /[a-zàâäçéèêëîïôöùûüÿœ0-9]/i;
const NAMES_RE = new RegExp(`(^|[^${A}0-9])((?:avec|with|and|et)\\s+)([A-ZÀ-Ý])`);
const FROM_CONN = /^(?:de|du|des|d['’]|from|since|depuis)$/i;
const UNTIL_RE = /(?:jusqu['’][aà]|until|up\s+to|bis|au\s+plus\s+tard)\s*$/i;

const lastWord = (s: string) => s.match(/[a-zàâäçéèêëîïôöùûüÿœ'’]+/gi)?.pop() ?? '';

export function parseUtterance(text: string, opts: { locale?: string; now?: Date } = {}): VoiceIntent {
  const norm = text.trim().replace(/\s+/g, ' ');
  if (!norm) return { kind: 'unknown', raw: '' };
  const now = opts.now ?? new Date();
  const freeform = (): VoiceIntent => ({ kind: 'freeform', text: norm });
  const tag = findTag(norm);

  if (!tag) {
    const words = norm.split(' ').filter((w) => WORD.test(w));
    return words.length >= 3 ? freeform() : { kind: 'unknown', raw: norm };
  }

  if (tag.kind === 'agenda') {
    const m = extractMoments(norm, opts)[0];
    return { kind: 'agenda', day: m ? m.moment.day : startOfDay(now) };
  }
  if (tag.kind === 'next') return { kind: 'next' };

  // noun triggers keep preceding words too — they're part of the title
  // ("dentist appointment friday" → 'dentist appointment')
  const body = norm.slice(tag.noun ? 0 : tag.end);
  const moms = extractMoments(body, opts);

  if (tag.kind === 'delete') {
    return {
      kind: 'delete',
      target: {
        title: titleBefore(body, moms, body.length),
        when: moms[0] ? momentToDate(moms[0].moment) : undefined,
      },
    };
  }

  if (tag.kind === 'move') {
    if (!moms.length) return freeform();
    const last = moms[moms.length - 1];
    if (moms.length === 1 && FROM_CONN.test(lastWord(body.slice(0, last.start)))) return freeform();
    return {
      kind: 'move',
      target: {
        title: titleBefore(body, moms, last.start),
        when: moms.length > 1 ? momentToDate(moms[0].moment) : undefined,
      },
      newStart: momentToDate(last.moment),
    };
  }

  // create
  if (!moms.length) return freeform();
  const timeMoms = moms.filter((m) => m.hasTime);
  const anchor = (moms.find((m) => m.hasDay)?.moment.day ?? startOfDay(now)).getTime();

  let start: Date;
  let end: Date | undefined;
  const gapBefore = (m: MomentMatch) => body.slice(0, m.start);
  if (timeMoms.length === 1 && UNTIL_RE.test(gapBefore(timeMoms[0]))) {
    // «… jusqu'à 15h» / "… until 3pm" — the only time bounds the END, not the start
    const e = timeMoms[0];
    start = new Date(anchor);
    end = momentToDate(e.hasDay ? e.moment : { day: new Date(anchor), time: e.moment.time });
  } else if (timeMoms.length) {
    const s = timeMoms[0];
    start = momentToDate(s.hasDay ? s.moment : { day: new Date(anchor), time: s.moment.time });
    const e = timeMoms[1];
    if (e) {
      end = e.hasDay ? momentToDate(e.moment) : momentToDate({ day: startOfDay(start), time: e.moment.time });
      if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 86400000);
    }
  } else {
    start = new Date(anchor); // day without time → local midnight (Phase C decides)
  }

  const nm = NAMES_RE.exec(body);
  let names: string[] | undefined;
  let cut = moms[0].start;
  if (nm) {
    const connStart = nm.index + nm[1].length;
    const nameStart = connStart + nm[2].length;
    cut = Math.min(cut, connStart);
    const nextMom = moms.find((m) => m.start >= nameStart);
    names = body
      .slice(nameStart, nextMom ? nextMom.start : body.length)
      .split(/\s*(?:,|\bet\b|\band\b)\s*/i)
      .map((chunk) =>
        chunk
          .split(/\s+/)
          .filter((w) => /^[A-ZÀ-Ý]/.test(w))
          .join(' '),
      )
      .filter(Boolean);
    if (!names.length) names = undefined;
  }

  const summary = cleanTitle(body.slice(0, cut));
  return { kind: 'create', summary, start, end, names };
}
