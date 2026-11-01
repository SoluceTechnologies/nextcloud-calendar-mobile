import { linkify } from '../../src/utils/linkify';

const links = (text: string) => linkify(text).filter((p) => p.url).map((p) => [p.text, p.url]);

describe('linkify', () => {
  it('keeps plain text as a single part', () => {
    expect(linkify('Bring snacks')).toEqual([{ text: 'Bring snacks' }]);
  });

  it('splits text around links without losing characters', () => {
    const text = 'Agenda: https://cloud.example.com/s/abc, mail jane@example.com or call +33 6 12 34 56 78.';
    expect(linkify(text).map((p) => p.text).join('')).toBe(text);
    expect(links(text)).toEqual([
      ['https://cloud.example.com/s/abc', 'https://cloud.example.com/s/abc'],
      ['jane@example.com', 'mailto:jane@example.com'],
      ['+33 6 12 34 56 78', 'tel:+33612345678'],
    ]);
  });

  it('handles www, explicit schemes and Outlook-style <url>', () => {
    expect(links('see www.example.com/x')).toEqual([['www.example.com/x', 'https://www.example.com/x']]);
    expect(links('mailto:bob@example.com tel:+4930123456')).toEqual([
      ['mailto:bob@example.com', 'mailto:bob@example.com'],
      ['tel:+4930123456', 'tel:+4930123456'],
    ]);
    expect(links('Join <https://teams.example.com/l/meetup>')).toEqual([
      ['https://teams.example.com/l/meetup', 'https://teams.example.com/l/meetup'],
    ]);
  });

  it('links bare domains on common TLDs but not file names or versions', () => {
    expect(links('Site: soluce-technologies.com.')).toEqual([
      ['soluce-technologies.com', 'https://soluce-technologies.com'],
    ]);
    expect(links('docs.example.co.uk/guide?x=1')).toEqual([
      ['docs.example.co.uk/guide?x=1', 'https://docs.example.co.uk/guide?x=1'],
    ]);
    expect(links('see index.html, Node.js, v1.2.3, e.g. this')).toEqual([]);
    expect(links('contact.fr@example.com')).toEqual([['contact.fr@example.com', 'mailto:contact.fr@example.com']]);
  });

  it('drops trailing sentence punctuation but keeps balanced parentheses', () => {
    expect(links('(https://example.com/a).')).toEqual([['https://example.com/a', 'https://example.com/a']]);
    expect(links('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual([
      ['https://en.wikipedia.org/wiki/Foo_(bar)', 'https://en.wikipedia.org/wiki/Foo_(bar)'],
    ]);
  });

  it('detects local phone numbers but not dates, times or ids', () => {
    expect(links('Tel 06 12 34 56 78')).toEqual([['06 12 34 56 78', 'tel:0612345678']]);
    expect(links('Büro 030 1234567')).toEqual([['030 1234567', 'tel:0301234567']]);
    expect(links('01.11.2026 10:00 – 2026-11-02, room 0042, ticket 123456789')).toEqual([]);
  });

  it('does not split an email inside a URL', () => {
    expect(links('https://example.com/u/jane@example.com')).toEqual([
      ['https://example.com/u/jane@example.com', 'https://example.com/u/jane@example.com'],
    ]);
  });
});
