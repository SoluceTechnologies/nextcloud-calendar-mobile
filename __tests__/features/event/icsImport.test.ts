jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  copyAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';

import {
  IcsImportError,
  sanitizeIcs,
  parseIcsToEvents,
  extractOrganizerName,
  eventToFormValues,
  readIcsUri,
} from '@/features/event/utils/icsImport';

const sampleIcs = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VEVENT\r\nUID:event-abc-123\r\nSUMMARY:Team Meeting\r\nDTSTART:20260601T140000Z\r\nDTEND:20260601T150000Z\r\nDESCRIPTION:Weekly sync\r\nLOCATION:Room A\r\nORGANIZER;CN=John Doe:mailto:john@example.com\r\nATTENDEE;CN=Alice;RSVP=TRUE:mailto:alice@example.com\r\nCATEGORIES:meeting\r\nEXDATE:20260608T140000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`;

const multiEventIcs = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:first-uid\r\nSUMMARY:First Event\r\nDTSTART:20260601T100000Z\r\nDTEND:20260601T110000Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:second-uid\r\nSUMMARY:Second Event\r\nDTSTART:20260602T100000Z\r\nDTEND:20260602T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`;

const todoIcs = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VTODO\r\nUID:todo-1\r\nSUMMARY:A task\r\nDUE:20260601T120000Z\r\nEND:VTODO\r\nEND:VCALENDAR`;

const { copyAsync, readAsStringAsync, deleteAsync } = FileSystem as unknown as {
  copyAsync: jest.Mock;
  readAsStringAsync: jest.Mock;
  deleteAsync: jest.Mock;
};

describe('sanitizeIcs', () => {
  it('removes a UTF-8 BOM', () => {
    const withBom = `\uFEFF${sampleIcs}`;
    expect(sanitizeIcs(withBom)).not.toMatch(/^\uFEFF/);
  });

  it('normalizes mixed line endings to CRLF', () => {
    const lfOnly = sampleIcs.replace(/\r\n/g, '\n');
    const sanitized = sanitizeIcs(lfOnly);
    expect(sanitized).toContain('BEGIN:VEVENT\r\n');
    expect(sanitized).not.toMatch(/[^\r]\n/);
  });

  it('trims leading and trailing whitespace', () => {
    const padded = `\n\n${sampleIcs}\n\n`;
    expect(sanitizeIcs(padded)).toMatch(/^BEGIN:VCALENDAR/);
    expect(sanitizeIcs(padded)).toMatch(/END:VCALENDAR$/);
  });
});

describe('parseIcsToEvents', () => {
  it('parses a single VEVENT into a CalendarEvent', () => {
    const [event] = parseIcsToEvents(sampleIcs);
    expect(event.uid).toBe('event-abc-123');
    expect(event.summary).toBe('Team Meeting');
    expect(event.allDay).toBe(false);
    expect(event.attendees).toHaveLength(1);
    expect(event.attendees[0].email).toBe('alice@example.com');
  });

  it('returns multiple master VEVENTs from one file', () => {
    const events = parseIcsToEvents(multiEventIcs);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.uid)).toEqual(['first-uid', 'second-uid']);
  });

  it('ignores VTODOs', () => {
    const events = parseIcsToEvents(todoIcs);
    expect(events).toHaveLength(0);
  });
});

describe('extractOrganizerName', () => {
  it('returns the ORGANIZER CN parameter for the matching UID', () => {
    expect(extractOrganizerName(sampleIcs, 'event-abc-123')).toBe('John Doe');
  });

  it('returns undefined when the event has no organizer', () => {
    expect(extractOrganizerName(multiEventIcs, 'first-uid')).toBeUndefined();
  });
});

describe('eventToFormValues', () => {
  it('carries the UID and parsed extra lines', () => {
    const [event] = parseIcsToEvents(sampleIcs);
    const form = eventToFormValues(event, sampleIcs);
    expect(form.uid).toBe('event-abc-123');
    expect(form.extraLines).toContain('CATEGORIES:meeting');
    expect(form.extraLines).toContain('EXDATE:20260608T140000Z');
    expect(form.summary).toBe('Team Meeting');
    expect(form.rrule).toBeUndefined();
  });
});

describe('readIcsUri', () => {
  beforeEach(() => {
    copyAsync.mockReset();
    readAsStringAsync.mockReset();
    deleteAsync.mockReset();
  });

  it('copies a content:// URI to cache, reads, and cleans up', async () => {
    copyAsync.mockResolvedValue(undefined);
    readAsStringAsync.mockResolvedValue(sampleIcs);
    deleteAsync.mockResolvedValue(undefined);

    const result = await readIcsUri('content://com.example/files/test.ics');
    expect(result).toBe(sampleIcs);
    expect(copyAsync).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'content://com.example/files/test.ics' }),
    );
    expect(deleteAsync).toHaveBeenCalled();
  });

  it('throws an IcsImportError when reading fails', async () => {
    copyAsync.mockResolvedValue(undefined);
    readAsStringAsync.mockRejectedValue(new Error('permission denied'));

    await expect(readIcsUri('content://com.example/files/test.ics')).rejects.toBeInstanceOf(
      IcsImportError,
    );
  });

  it('reads a file:// URI directly', async () => {
    readAsStringAsync.mockResolvedValue(sampleIcs);

    const result = await readIcsUri('file:///data/data/test.ics');
    expect(result).toBe(sampleIcs);
    expect(copyAsync).not.toHaveBeenCalled();
  });
});
