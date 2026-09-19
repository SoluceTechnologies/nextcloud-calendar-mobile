import type { EventAttachment } from '@/types';

/**
 * Minimal-diff ICS rewriting for ATTACH properties.
 *
 * Works on the raw calendar data instead of reserializing via ical.js so that
 * unrelated properties and exception VEVENTs are left byte-identical.
 */

const MAX_LINE_OCTETS = 75;

type Unfolded = { lines: string[]; eol: string };

/** Joins folded continuation lines into logical lines, preserving EOL style. */

export function unfoldLines(ics: string): Unfolded {
  const eol = ics.includes('\r\n') ? '\r\n' : '\n';
  const out: string[] = [];
  for (const cur of ics.split(/\r\n|\n/)) {
    if ((cur.startsWith(' ') || cur.startsWith('\t')) && out.length) {
      out[out.length - 1] += cur.slice(1);
    } else {
      out.push(cur);
    }
  }
  return { lines: out, eol };
}

/** RFC 5545 folding: hard wrap at 75 octets without splitting UTF-8 chars. */
export function foldLine(line: string, eol = '\r\n'): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= MAX_LINE_OCTETS) return line;
  const parts: string[] = [];
  let start = 0;
  // Subsequent chunks carry a leading space, so they get one less payload octet.
  let budget = MAX_LINE_OCTETS;
  while (start < bytes.length) {
    let end = Math.min(start + budget, bytes.length);
    // Backtrack over UTF-8 continuation bytes (10xxxxxx).
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(new TextDecoder().decode(bytes.slice(start, end)));
    start = end;
    budget = MAX_LINE_OCTETS - 1;
  }
  return parts.join(eol + ' ');
}

function escapeParam(value: string): string {
  // RFC 5545 param values containing ; : or , must be quoted.
  return /[;:,]/.test(value) ? `"${value.replace(/"/g, "'")}"` : value;
}

/** Builds the (folded) ATTACH property line for an attachment. */
export function buildAttachLine(att: EventAttachment, eol = '\r\n'): string {
  let line = 'ATTACH';
  if (att.fmttype) line += `;FMTTYPE=${escapeParam(att.fmttype)}`;
  if (att.filename) line += `;FILENAME=${escapeParam(att.filename)}`;
  if (att.size && att.size > 0) line += `;SIZE=${Math.round(att.size)}`;
  if (att.base64) {
    line += `;ENCODING=BASE64;VALUE=BINARY:${att.base64}`;
  } else {
    line += `:${att.uri}`;
  }
  return foldLine(line, eol);
}

function isMasterVeventBlock(lines: string[], beginIdx: number): boolean {
  for (let i = beginIdx + 1; i < lines.length; i++) {
    const l = lines[i].toUpperCase();
    if (l === 'END:VEVENT') return true;
    if (l.startsWith('RECURRENCE-ID')) return false;
  }
  return true;
}

/** Inserts a folded ATTACH line into the master VEVENT of an ICS document. */
export function injectAttachLine(ics: string, attachLine: string): string {
  const { lines, eol } = unfoldLines(ics);
  let inVevent = false;
  for (let i = 0; i < lines.length; i++) {
    const up = lines[i].toUpperCase();
    if (up === 'BEGIN:VEVENT') {
      inVevent = isMasterVeventBlock(lines, i);
    } else if (inVevent && up === 'END:VEVENT') {
      lines.splice(i, 0, attachLine);
      return lines.join(eol);
    }
  }
  throw new Error('no-master-vevent');
}

type PropLine = { name: string; params: string; value: string };

/** Splits a logical ICS line on the first `:` outside double quotes. */
function splitPropLine(line: string): PropLine | null {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ':' && !inQuote) {
      const head = line.slice(0, i);
      const semi = head.indexOf(';');
      return {
        name: (semi === -1 ? head : head.slice(0, semi)).toUpperCase(),
        params: semi === -1 ? '' : head.slice(semi + 1),
        value: line.slice(i + 1),
      };
    }
  }
  return null;
}

function paramValue(params: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|;)${name}=(?:"([^"]*)"|([^;:]*))`, 'i');
  const m = params.match(re);
  return m ? (m[1] ?? m[2]) : undefined;
}

function attachLineMatches(line: string, att: EventAttachment): boolean {
  const prop = splitPropLine(line);
  if (!prop || prop.name !== 'ATTACH') return false;
  if (att.uri) return prop.value === att.uri;
  if (att.base64) return prop.value === att.base64;
  // Occurrence copies lack the payload: match on metadata like openInlineAttachment does.
  return (
    (paramValue(prop.params, 'FILENAME') ?? '') === (att.filename ?? '') &&
    (paramValue(prop.params, 'FMTTYPE') ?? '') === (att.fmttype ?? '') &&
    Number(paramValue(prop.params, 'SIZE') ?? 0) === (att.size ?? 0)
  );
}

/**
 * Removes the ATTACH line matching `att` from the master VEVENT.
 * Returns the original ICS unchanged when nothing matches.
 */
export function removeAttachLine(ics: string, att: EventAttachment): string {
  const { lines, eol } = unfoldLines(ics);
  const kept: string[] = [];
  let inMaster = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const up = line.toUpperCase();
    if (up === 'BEGIN:VEVENT') inMaster = isMasterVeventBlock(lines, i);
    if (inMaster && attachLineMatches(line, att)) continue;
    if (up === 'END:VEVENT') inMaster = false;
    kept.push(line);
  }
  return kept.join(eol);
}
