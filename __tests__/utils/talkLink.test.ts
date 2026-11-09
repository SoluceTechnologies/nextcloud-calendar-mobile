import ICAL from 'ical.js';
import { extractTalkUrl, TALK_URL_PATTERN } from '@/utils/talkLink';

function veventWith(props: string[]): ICAL.Component {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:x',
    'DTSTART:20260115T090000Z',
    'DTEND:20260115T100000Z',
    ...props,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');
  const comp = new ICAL.Component(ICAL.parse(ics));
  return comp.getAllSubcomponents('vevent')[0];
}

describe('TALK_URL_PATTERN', () => {
  it('matches /call/ URLs only', () => {
    expect(TALK_URL_PATTERN.test('https://cloud.example.com/call/abc12')).toBe(true);
    expect(TALK_URL_PATTERN.test('https://cloud.example.com/index.php/call/abc')).toBe(true);
    expect(TALK_URL_PATTERN.test('https://meet.google.com/abc')).toBe(false);
  });
});

describe('extractTalkUrl', () => {
  it('detects a Talk URL in LOCATION', () => {
    expect(extractTalkUrl('https://cloud.example.com/call/tok1')).toBe('https://cloud.example.com/call/tok1');
  });

  it('detects a Talk URL inside DESCRIPTION text', () => {
    const desc = 'Weekly sync.\nJoin: https://cloud.example.com/call/xyz789\nAgenda…';
    expect(extractTalkUrl('Room 4', desc)).toBe('https://cloud.example.com/call/xyz789');
  });

  it('detects a Talk URL in CONFERENCE;VALUE=URI', () => {
    const v = veventWith(['CONFERENCE;VALUE=URI:https://cloud.example.com/call/conf1']);
    expect(extractTalkUrl('Room 4', undefined, v)).toBe('https://cloud.example.com/call/conf1');
  });

  it('prefers CONFERENCE over LOCATION and DESCRIPTION', () => {
    const v = veventWith(['CONFERENCE;VALUE=URI:https://cloud.example.com/call/conf1']);
    expect(
      extractTalkUrl('https://cloud.example.com/call/loc1', 'https://cloud.example.com/call/desc1', v),
    ).toBe('https://cloud.example.com/call/conf1');
  });

  it('prefers LOCATION over DESCRIPTION', () => {
    expect(
      extractTalkUrl('https://cloud.example.com/call/loc1', 'see https://cloud.example.com/call/desc1'),
    ).toBe('https://cloud.example.com/call/loc1');
  });

  it('ignores non-Talk URLs in DESCRIPTION', () => {
    expect(extractTalkUrl('Room 4', 'Notes at https://docs.example.com/x')).toBeUndefined();
  });

  it('handles subdirectory installs (/index.php/call/)', () => {
    expect(
      extractTalkUrl(undefined, 'join https://cloud.example.com/nextcloud/index.php/call/tok5'),
    ).toBe('https://cloud.example.com/nextcloud/index.php/call/tok5');
  });

  it('returns undefined when nothing matches', () => {
    expect(extractTalkUrl()).toBeUndefined();
    expect(extractTalkUrl('Room 4', 'plain notes')).toBeUndefined();
  });
});
