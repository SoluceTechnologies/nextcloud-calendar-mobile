import { setVtodoCompleted, taskIsCompleted } from '@/utils/vtodo';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const NOW_ICS = '20260914T120000Z';

const openTask = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks//EN
BEGIN:VTODO
UID:task-1
SUMMARY:Buy milk
DTSTAMP:20260901T080000Z
SEQUENCE:3
LAST-MODIFIED:20260910T090000Z
DUE:20260915T090000Z
STATUS:NEEDS-ACTION
PERCENT-COMPLETE:0
X-APPLE-SORT-ORDER:42
END:VTODO
END:VCALENDAR`;

const doneTask = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:task-1
SUMMARY:Buy milk
DTSTAMP:20260901T080000Z
SEQUENCE:4
LAST-MODIFIED:20260914T110000Z
DUE:20260915T090000Z
STATUS:COMPLETED
PERCENT-COMPLETE:100
COMPLETED:20260914T110000Z
END:VTODO
END:VCALENDAR`;

describe('taskIsCompleted', () => {
  it('is true for STATUS:COMPLETED, a COMPLETED timestamp, or PERCENT-COMPLETE 100', () => {
    expect(taskIsCompleted('COMPLETED')).toBe(true);
    expect(taskIsCompleted(undefined, new Date())).toBe(true);
    expect(taskIsCompleted(undefined, undefined, 100)).toBe(true);
    expect(taskIsCompleted('CANCELLED')).toBe(true);
  });

  it('is false for open tasks', () => {
    expect(taskIsCompleted('NEEDS-ACTION')).toBe(false);
    expect(taskIsCompleted('IN-PROCESS', undefined, 40)).toBe(false);
    expect(taskIsCompleted()).toBe(false);
  });
});

describe('setVtodoCompleted', () => {
  it('completes a task the way Nextcloud Tasks does', () => {
    const out = setVtodoCompleted(openTask, true, NOW);
    expect(out).toContain('STATUS:COMPLETED');
    expect(out).toContain('PERCENT-COMPLETE:100');
    expect(out).toContain(`COMPLETED:${NOW_ICS}`);
    expect(out).toContain('SEQUENCE:4');
    expect(out).toContain(`DTSTAMP:${NOW_ICS}`);
    expect(out).toContain(`LAST-MODIFIED:${NOW_ICS}`);
  });

  it('reopens a completed task', () => {
    const out = setVtodoCompleted(doneTask, false, NOW);
    expect(out).toContain('STATUS:NEEDS-ACTION');
    expect(out).toContain('PERCENT-COMPLETE:0');
    expect(out).not.toContain('COMPLETED:');
    expect(out).toContain('SEQUENCE:5');
  });

  it('round-trips: complete then reopen restores the open state', () => {
    const completed = setVtodoCompleted(openTask, true, NOW);
    const reopened = setVtodoCompleted(completed, false, NOW);
    expect(reopened).toContain('STATUS:NEEDS-ACTION');
    expect(reopened).not.toContain('COMPLETED:');
    expect(reopened).toContain('SUMMARY:Buy milk');
    expect(reopened).toContain('DUE:20260915T090000Z');
  });

  it('preserves unknown properties inside the VTODO', () => {
    const out = setVtodoCompleted(openTask, true, NOW);
    expect(out).toContain('X-APPLE-SORT-ORDER:42');
    expect(out).toContain('PRODID:-//Nextcloud Tasks//EN');
  });

  it('adds missing bookkeeping properties before END:VTODO', () => {
    const bare = `BEGIN:VCALENDAR
BEGIN:VTODO
UID:task-bare
SUMMARY:No bookkeeping
DUE:20260915T090000Z
END:VTODO
END:VCALENDAR`;
    const out = setVtodoCompleted(bare, true, NOW);
    expect(out).toContain('STATUS:COMPLETED');
    expect(out).toContain('PERCENT-COMPLETE:100');
    expect(out).toContain(`COMPLETED:${NOW_ICS}`);
    expect(out).toContain('SEQUENCE:1');
    expect(out).toContain(`DTSTAMP:${NOW_ICS}`);
    expect(out).toContain(`LAST-MODIFIED:${NOW_ICS}`);
    // INSERT lines land inside the block, before END:VTODO.
    expect(out.indexOf(`COMPLETED:${NOW_ICS}`)).toBeLessThan(out.indexOf('END:VTODO'));
  });

  it('does not touch properties outside the VTODO block', () => {
    const mixed = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:evt-1
SUMMARY:Meeting
DTSTART:20260915T090000Z
DTEND:20260915T100000Z
END:VEVENT
BEGIN:VTODO
UID:task-mixed
SUMMARY:Follow up
DUE:20260915T120000Z
END:VTODO
END:VCALENDAR`;
    const out = setVtodoCompleted(mixed, true, NOW);
    const vevent = out.slice(out.indexOf('BEGIN:VEVENT'), out.indexOf('END:VEVENT'));
    expect(vevent).not.toContain('STATUS:');
    expect(out).toContain('DTSTART:20260915T090000Z');
  });

  it('returns the input unchanged when there is no VTODO', () => {
    const eventOnly = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:evt-1
DTSTART:20260915T090000Z
DTEND:20260915T100000Z
END:VEVENT
END:VCALENDAR`;
    expect(setVtodoCompleted(eventOnly, true, NOW)).toBe(eventOnly);
  });
});
