import { byServerOrder, calendarGroup } from '../../src/utils/calendars';
import type { CalendarMeta } from '../../src/types';

const cal = (id: string, extra: Partial<CalendarMeta> = {}): CalendarMeta => ({
  id,
  accountId: 'acc-1',
  displayName: id,
  color: '#fff',
  ctag: '1',
  url: `https://cloud.example.com/remote.php/dav/calendars/john/${id}/`,
  slug: id,
  ...extra,
});

describe('calendarGroup', () => {
  it('splits calendars like the Nextcloud web sidebar', () => {
    expect(calendarGroup(cal('personal'))).toBe('personal');
    expect(calendarGroup(cal('holidays', { isSubscribed: true }))).toBe('personal');
    expect(calendarGroup(cal('team_shared_by_jane', { isShared: true }))).toBe('shared');
    expect(calendarGroup(cal('app-generated--deck--board-1', { supportsEvents: false }))).toBe('deck');
    expect(calendarGroup(cal('todo', { supportsEvents: false }))).toBe('tasks');
  });
});

describe('byServerOrder', () => {
  it('sorts by the Nextcloud calendar-order', () => {
    const sorted = [cal('c', { order: 2 }), cal('a', { order: 0 }), cal('b', { order: 1 })].sort(byServerOrder);
    expect(sorted.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the existing order for ties and missing values', () => {
    const sorted = [cal('x', { order: 1 }), cal('y'), cal('z', { order: 0 }), cal('w', { order: 1 })].sort(byServerOrder);
    expect(sorted.map((c) => c.id)).toEqual(['y', 'z', 'x', 'w']);
  });

  it('puts groups first, then the order inside each group', () => {
    const sorted = [
      cal('todo', { supportsEvents: false, order: 0 }),
      cal('shared', { isShared: true, order: 0 }),
      cal('mine', { order: 5 }),
    ].sort(byServerOrder);
    expect(sorted.map((c) => c.id)).toEqual(['mine', 'shared', 'todo']);
  });
});
