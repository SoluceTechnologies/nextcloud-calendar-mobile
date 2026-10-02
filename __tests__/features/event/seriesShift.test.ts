import { seriesDeltas, shiftedMasterInput } from '@/features/event/hooks/useMutateEvent';

const occurrence = {
  dtstart: new Date(2026, 7, 17, 9, 0),
  dtend: new Date(2026, 7, 17, 10, 0),
};

describe('seriesDeltas', () => {
  it('gives equal deltas for a move', () => {
    const d = seriesDeltas(occurrence, new Date(2026, 7, 17, 10, 0), new Date(2026, 7, 17, 11, 0));
    expect(d.deltaStart).toBe(60 * 60_000);
    expect(d.deltaEnd).toBe(60 * 60_000);
  });

  it('gives a zero start delta when only the end moved', () => {
    const d = seriesDeltas(occurrence, new Date(2026, 7, 17, 9, 0), new Date(2026, 7, 17, 10, 30));
    expect(d.deltaStart).toBe(0);
    expect(d.deltaEnd).toBe(30 * 60_000);
  });

  it('gives a zero end delta when only the start moved', () => {
    const d = seriesDeltas(occurrence, new Date(2026, 7, 17, 8, 30), new Date(2026, 7, 17, 10, 0));
    expect(d.deltaStart).toBe(-30 * 60_000);
    expect(d.deltaEnd).toBe(0);
  });
});

describe('shiftedMasterInput', () => {
  const masterBounds = {
    dtstart: new Date(2026, 7, 3, 9, 0),
    dtend: new Date(2026, 7, 3, 10, 0),
  };
  const input = {
    summary: 'Standup',
    dtstart: new Date(2026, 7, 17, 10, 0),
    dtend: new Date(2026, 7, 17, 11, 0),
  } as never;

  it('shifts the master rather than moving it to the dragged occurrence', () => {
    const next = shiftedMasterInput(input, masterBounds, 60 * 60_000, 60 * 60_000);
    expect(next.dtstart.getDate()).toBe(3);
    expect(next.dtstart.getHours()).toBe(10);
    expect(next.dtend.getHours()).toBe(11);
  });

  it('keeps every other field of the input', () => {
    const next = shiftedMasterInput(input, masterBounds, 0, 0);
    expect(next.summary).toBe('Standup');
  });
});
