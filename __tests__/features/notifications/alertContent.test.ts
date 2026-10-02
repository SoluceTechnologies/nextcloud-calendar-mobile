import { alertBody, leadLabel } from '../../../src/features/notifications/alertContent';
import i18n from '../../../src/utils/i18n';

const base = {
  summary: 'Standup',
  dtstart: new Date(2026, 7, 10, 9, 0),
  allDay: false,
};

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('leadLabel', () => {
  it('says "Now" when the alert fires at the event time', () => {
    expect(leadLabel(base, new Date(2026, 7, 10, 9, 0))).toBe('Now');
  });

  it('formats minutes', () => {
    expect(leadLabel(base, new Date(2026, 7, 10, 8, 50))).toBe('in 10 min');
  });

  it('formats whole hours', () => {
    expect(leadLabel(base, new Date(2026, 7, 10, 7, 0))).toBe('in 2 h');
  });

  it('formats hours and minutes', () => {
    expect(leadLabel(base, new Date(2026, 7, 10, 7, 30))).toBe('in 1 h 30');
  });

  it('uses calendar days beyond 24 hours', () => {
    expect(leadLabel(base, new Date(2026, 7, 9, 9, 0))).toBe('Tomorrow');
    expect(leadLabel(base, new Date(2026, 7, 3, 9, 0))).toBe('in 7 days');
  });

  it('keeps hour wording when a sub-day alert crosses midnight', () => {
    expect(leadLabel(base, new Date(2026, 7, 9, 23, 0))).toBe('in 10 h');
  });

  it('uses days for all-day events', () => {
    const allDay = { dtstart: new Date(2026, 7, 10, 0, 0), allDay: true };
    expect(leadLabel(allDay, new Date(2026, 7, 10, 9, 0))).toBe('Today');
    expect(leadLabel(allDay, new Date(2026, 7, 8, 9, 0))).toBe('in 2 days');
  });
});

describe('alertBody', () => {
  it('puts the delay first, then location, then description', () => {
    const body = alertBody(
      { ...base, location: 'Room 3', description: 'Weekly sync' },
      new Date(2026, 7, 10, 8, 45),
    );
    expect(body).toBe('in 15 min\nRoom 3\nWeekly sync');
  });

  it('skips missing or blank fields', () => {
    expect(alertBody({ ...base, location: '  ', description: '' }, new Date(2026, 7, 10, 8, 45))).toBe(
      'in 15 min',
    );
  });

  it('normalises CRLF and collapses blank runs', () => {
    const body = alertBody(
      { ...base, description: 'line 1\r\n\r\n\r\n\r\nline 2' },
      new Date(2026, 7, 10, 9, 0),
    );
    expect(body).toBe('Now\nline 1\n\nline 2');
  });

  it('truncates long descriptions', () => {
    const body = alertBody({ ...base, description: 'x'.repeat(500) }, new Date(2026, 7, 10, 9, 0));
    const description = body.split('\n')[1];
    expect(description).toHaveLength(200);
    expect(description.endsWith('…')).toBe(true);
  });

  it('turns a bare meeting URL in the location into a video-conference label', () => {
    const body = alertBody(
      { ...base, location: 'https://cloud.example.com/call/abc123' },
      new Date(2026, 7, 10, 9, 0),
    );
    expect(body).toBe('Now\nVideo conference: Talk');
  });

  it('surfaces a meeting URL found in the description and strips the raw link', () => {
    const body = alertBody(
      { ...base, description: 'Join here https://meet.google.com/abc-defg' },
      new Date(2026, 7, 10, 9, 0),
    );
    expect(body).toBe('Now\nVideo conference: Google Meet\nJoin here');
  });

  it('does not duplicate the video-conference line when location and description share it', () => {
    const body = alertBody(
      {
        ...base,
        location: 'https://cloud.example.com/call/x',
        description: 'Talk link https://cloud.example.com/call/x',
      },
      new Date(2026, 7, 10, 9, 0),
    );
    expect(body).toBe('Now\nVideo conference: Talk\nTalk link');
  });

  it('strips a non-meeting URL from the description without adding a visio line', () => {
    const body = alertBody(
      { ...base, description: 'See https://example.com/docs' },
      new Date(2026, 7, 10, 9, 0),
    );
    expect(body).toBe('Now\nSee');
  });
});
