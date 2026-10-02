import { decodeXmlEntities } from '../../src/services/nextcloud/caldav';
import { parseIcsObjects } from '@/utils/caldav-parse';

describe('decodeXmlEntities', () => {
  it('decodes the five named XML entities', () => {
    expect(decodeXmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decodeXmlEntities('a &lt; b')).toBe('a < b');
    expect(decodeXmlEntities('a &gt; b')).toBe('a > b');
    expect(decodeXmlEntities('say &quot;hi&quot;')).toBe('say "hi"');
    expect(decodeXmlEntities('it&apos;s')).toBe("it's");
  });

  it('decodes decimal and hex numeric references', () => {
    expect(decodeXmlEntities('A&#38;B')).toBe('A&B');
    expect(decodeXmlEntities('A&#x26;B')).toBe('A&B');
    expect(decodeXmlEntities('caf&#233;')).toBe('café');
  });

  it('leaves plain text and unknown entities untouched', () => {
    expect(decodeXmlEntities('no entities here')).toBe('no entities here');
    expect(decodeXmlEntities('100% &bogus; done')).toBe('100% &bogus; done');
  });

  it('is single-pass: does not cascade-decode (no double unescape)', () => {
    expect(decodeXmlEntities('x &amp;lt; y')).toBe('x &lt; y');
    expect(decodeXmlEntities('&amp;amp;')).toBe('&amp;');
  });
});

describe('CalDAV REPORT extraction: ICS arrives XML-escaped', () => {
  const calMeta = { calendarId: 'cal-1', accountId: 'acc-1', color: '#0082c9' };

  const escapedIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:amp-1
SUMMARY:Tom &amp; Jerry
DTSTART:20260601T140000Z
DTEND:20260601T150000Z
DESCRIPTION:&lt;b&gt;note&lt;/b&gt; &amp; more
LOCATION:Room A &amp; B
END:VEVENT
END:VCALENDAR`;

  it('yields decoded summary/description/location after XML-decoding the blob', () => {
    const ics = decodeXmlEntities(escapedIcs);
    const [event] = parseIcsObjects([{ ics, href: '/cal/e.ics' }], calMeta);
    expect(event.summary).toBe('Tom & Jerry');
    expect(event.description).toBe('<b>note</b> & more');
    expect(event.location).toBe('Room A & B');
  });
});
