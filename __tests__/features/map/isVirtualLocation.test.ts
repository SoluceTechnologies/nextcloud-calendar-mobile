import { isVirtualLocation } from '@/features/map/utils/isVirtualLocation';

describe('isVirtualLocation', () => {
  it('returns false for a plain address', () => {
    expect(isVirtualLocation('10 Downing Street, London')).toBe(false);
  });

  it('returns false for a hybrid event: real address + Talk link carried separately', () => {
    // talkUrl may now come from DESCRIPTION/CONFERENCE — a physical LOCATION
    // must keep its map even when a call link exists on the event.
    expect(isVirtualLocation('Room 4, Building B')).toBe(false);
  });

  it('detects a Nextcloud Talk URL', () => {
    expect(isVirtualLocation('https://cloud.example.com/call/abc')).toBe(true);
  });

  it('detects a Zoom URL', () => {
    expect(isVirtualLocation('https://zoom.us/j/123456789')).toBe(true);
  });

  it('detects a Teams URL', () => {
    expect(isVirtualLocation('https://teams.microsoft.com/l/meetup-join/19%3a...')).toBe(true);
  });

  it('detects a Google Meet URL', () => {
    expect(isVirtualLocation('https://meet.google.com/abc-defg-hij')).toBe(true);
  });

  it('returns false for an empty location', () => {
    expect(isVirtualLocation('')).toBe(false);
    expect(isVirtualLocation(undefined)).toBe(false);
  });
});
