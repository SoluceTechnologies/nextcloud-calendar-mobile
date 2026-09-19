import {
  buildAttachLine,
  foldLine,
  injectAttachLine,
  removeAttachLine,
  unfoldLines,
} from '@/features/event/utils/attachmentWrite';
import { extractEventAttachments } from '@/utils/caldav-parse';

const CRLF = '\r\n';

const baseIcs = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//EN',
  'BEGIN:VEVENT',
  'UID:ev-1',
  'DTSTART:20260919T140000Z',
  'DTEND:20260919T150000Z',
  'SUMMARY:Demo',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join(CRLF);

describe('foldLine', () => {
  it('leaves short lines unfolded', () => {
    expect(foldLine('ATTACH:https://x/f.txt')).toBe('ATTACH:https://x/f.txt');
  });

  it('folds at 75 octets with CRLF + space continuation', () => {
    const line = 'ATTACH;FILENAME=' + 'a'.repeat(100) + ':https://x';
    const folded = foldLine(line);
    const physical = folded.split(CRLF);
    expect(physical.length).toBeGreaterThan(1);
    expect(new TextEncoder().encode(physical[0]).length).toBeLessThanOrEqual(75);
    physical.slice(1).forEach((p) => {
      expect(p.startsWith(' ')).toBe(true);
      expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    });
    // Round-trip: unfolding restores the original logical line.
    expect(unfoldLines(folded).lines[0]).toBe(line);
  });

  it('never splits a UTF-8 multibyte character', () => {
    const line = 'ATTACH;FILENAME=' + 'é'.repeat(60) + ':u'; // 2-octet chars
    const folded = foldLine(line);
    expect(unfoldLines(folded).lines[0]).toBe(line);
    folded.split(CRLF).forEach((p) => {
      expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    });
  });
});

describe('buildAttachLine', () => {
  it('builds a URI attachment with metadata params', () => {
    const line = buildAttachLine({
      uri: 'https://srv/remote.php/dav/files/u/Calendar/doc.pdf',
      filename: 'doc.pdf',
      fmttype: 'application/pdf',
      size: 1024,
    });
    expect(unfoldLines(line).lines[0]).toBe(
      'ATTACH;FMTTYPE=application/pdf;FILENAME=doc.pdf;SIZE=1024' +
        ':https://srv/remote.php/dav/files/u/Calendar/doc.pdf',
    );
  });

  it('quotes param values containing separators', () => {
    const line = buildAttachLine({ uri: 'u', filename: 'a;b,c.txt' });
    expect(line).toContain('FILENAME="a;b,c.txt"');
  });

  it('omits SIZE when absent', () => {
    expect(buildAttachLine({ uri: 'u' })).toBe('ATTACH:u');
  });
});

describe('injectAttachLine', () => {
  it('inserts the ATTACH line inside the master VEVENT', () => {
    const out = injectAttachLine(baseIcs, 'ATTACH:https://x/f.txt');
    const vevent = out.split('BEGIN:VEVENT')[1].split('END:VEVENT')[0];
    expect(vevent).toContain('ATTACH:https://x/f.txt');
    expect(out.indexOf('ATTACH')).toBeLessThan(out.indexOf('END:VEVENT'));
  });

  it('targets the master VEVENT, not exceptions', () => {
    const ics = baseIcs.replace(
      'END:VCALENDAR',
      [
        'BEGIN:VEVENT',
        'UID:ev-1',
        'RECURRENCE-ID:20260920T140000Z',
        'DTSTART:20260920T140000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join(CRLF),
    );
    const out = injectAttachLine(ics, 'ATTACH:https://x/f.txt');
    const blocks = out.split('BEGIN:VEVENT');
    expect(blocks[1]).toContain('ATTACH'); // master
    expect(blocks[2]).toContain('RECURRENCE-ID');
    expect(blocks[2]).not.toContain('ATTACH'); // exception untouched
  });

  it('throws when the ICS has no VEVENT', () => {
    expect(() => injectAttachLine('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', 'ATTACH:u')).toThrow(
      'no-master-vevent',
    );
  });

  it('produces ICS that the parser reads back', () => {
    const att = {
      uri: 'https://srv/remote.php/dav/files/alice/Calendar/doc.pdf',
      filename: 'doc.pdf',
      fmttype: 'application/pdf',
      size: 1024,
    };
    const out = injectAttachLine(baseIcs, buildAttachLine(att));
    expect(extractEventAttachments(out)).toEqual([
      expect.objectContaining({ uri: att.uri, filename: 'doc.pdf', fmttype: 'application/pdf' }),
    ]);
  });
});

describe('removeAttachLine', () => {
  const withTwo = baseIcs.replace(
    'END:VEVENT',
    ['ATTACH;FILENAME=a.txt:https://srv/a.txt', 'ATTACH;FILENAME=b.txt:https://srv/b.txt', 'END:VEVENT'].join(
      CRLF,
    ),
  );

  it('removes the matching URI attachment and keeps the others', () => {
    const out = removeAttachLine(withTwo, { uri: 'https://srv/a.txt', filename: 'a.txt' });
    expect(out).not.toContain('a.txt');
    expect(out).toContain('ATTACH;FILENAME=b.txt:https://srv/b.txt');
    expect(out).toContain('SUMMARY:Demo');
  });

  it('removes a folded ATTACH line', () => {
    const folded = foldLine(
      'ATTACH;FILENAME=very-long-name-' + 'x'.repeat(80) + '.txt:https://srv/big',
    );
    const ics = baseIcs.replace('END:VEVENT', folded + CRLF + 'END:VEVENT');
    const out = removeAttachLine(ics, { uri: 'https://srv/big' });
    expect(out).not.toContain('very-long-name');
  });

  it('removes an embedded attachment matched by metadata', () => {
    const ics = baseIcs.replace(
      'END:VEVENT',
      'ATTACH;FMTTYPE=text/plain;FILENAME=n.txt;SIZE=4;ENCODING=BASE64;VALUE=BINARY:aGk=\r\nEND:VEVENT',
    );
    const out = removeAttachLine(ics, { filename: 'n.txt', fmttype: 'text/plain', size: 4, inline: true });
    expect(out).not.toContain('ATTACH');
  });

  it('leaves the ICS unchanged when nothing matches', () => {
    expect(removeAttachLine(withTwo, { uri: 'https://srv/other' })).toBe(withTwo);
  });
});
