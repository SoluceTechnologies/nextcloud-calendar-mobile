import type { LiveEventState } from '@/features/widget/core/types';

jest.mock('@expo/ui/swift-ui', () => ({ HStack: 'HStack', Text: 'Text', VStack: 'VStack' }));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  background: jest.fn(),
  cornerRadius: jest.fn(),
  font: jest.fn(),
  foregroundStyle: jest.fn(),
  frame: jest.fn(),
  padding: jest.fn(),
}));
jest.mock('@/utils/i18n', () => ({ t: (key: string) => key }));
const mockReadLiveEvent = jest.fn();
jest.mock('@/features/widget/storage/widgetStore', () => ({
  writeLiveEvent: jest.fn(),
  readLiveEvent: () => mockReadLiveEvent(),
}));

const mockStart = jest.fn();
const mockGetInstances = jest.fn();

jest.mock('expo-widgets', () => ({
  createLiveActivity: () => ({ start: mockStart, getInstances: mockGetInstances }),
  after: (date: Date) => ({ after: date }),
}));

function makeState(overrides: Partial<LiveEventState> = {}): LiveEventState {
  return {
    uid: 'evt-1',
    title: 'Standup',
    startIso: '2026-07-29T09:00:00.000Z',
    endIso: '2026-07-29T09:30:00.000Z',
    color: '#3b82f6',
    link: 'nextcloud-calendar://event/evt-1',
    location: '',
    attendees: [],
    ...overrides,
  };
}

describe('liveActivity (ios)', () => {
  beforeEach(() => {
    jest.resetModules();
    mockStart.mockReset();
    mockGetInstances.mockReset();
    mockReadLiveEvent.mockReset();
    mockReadLiveEvent.mockReturnValue(null);
  });

  it('starts a new activity when none is tracked and none exist natively', async () => {
    mockGetInstances.mockReturnValue([]);
    const created = { update: jest.fn(), end: jest.fn() };
    mockStart.mockReturnValue(created);

    const { liveActivity } = require('@/features/widget/surfaces/liveActivity/liveActivity.ios');
    await liveActivity.update(makeState());

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(created.update).not.toHaveBeenCalled();
  });

  it('reuses the native activity found via getInstances() after a JS reload wiped the local reference', async () => {
    const existing = { update: jest.fn().mockResolvedValue(undefined), end: jest.fn() };
    mockGetInstances.mockReturnValue([existing]);
    mockReadLiveEvent.mockReturnValue(makeState());

    const { liveActivity } = require('@/features/widget/surfaces/liveActivity/liveActivity.ios');
    await liveActivity.update(makeState({ title: 'Updated title' }));

    expect(mockStart).not.toHaveBeenCalled();
    expect(existing.update).toHaveBeenCalledTimes(1);
    expect(existing.update.mock.calls[0][0]).toMatchObject({ title: 'Updated title' });
  });

  it('falls back to starting a fresh activity when the tracked one was ended externally', async () => {
    const dead = { update: jest.fn().mockRejectedValue(new Error("Can't find live activity with id: x")), end: jest.fn() };
    mockGetInstances.mockReturnValue([dead]);
    mockReadLiveEvent.mockReturnValue(makeState());
    const fresh = { update: jest.fn().mockResolvedValue(undefined), end: jest.fn() };
    mockStart.mockReturnValue(fresh);

    const { liveActivity } = require('@/features/widget/surfaces/liveActivity/liveActivity.ios');
    await liveActivity.update(makeState());
    await liveActivity.update(makeState({ title: 'Second edit' }));

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(fresh.update).toHaveBeenCalledTimes(1);
  });

  it('restarts the activity when the tracked event changed, so the deep link points at the new event', async () => {
    const stale = { update: jest.fn().mockResolvedValue(undefined), end: jest.fn().mockResolvedValue(undefined) };
    mockGetInstances.mockReturnValue([stale]);
    mockReadLiveEvent.mockReturnValue(makeState());
    const fresh = { update: jest.fn(), end: jest.fn() };
    mockStart.mockReturnValue(fresh);

    const moved = makeState({ uid: 'evt-2', link: 'nextcloud-calendar://event/evt-2' });
    const { liveActivity } = require('@/features/widget/surfaces/liveActivity/liveActivity.ios');
    await liveActivity.update(moved);

    expect(stale.end).toHaveBeenCalledWith('immediate');
    expect(stale.update).not.toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart.mock.calls[0][1]).toBe('nextcloud-calendar://event/evt-2');
  });

  it('updates in place while the tracked event is unchanged', async () => {
    const existing = { update: jest.fn().mockResolvedValue(undefined), end: jest.fn() };
    mockGetInstances.mockReturnValue([existing]);
    mockReadLiveEvent.mockReturnValue(makeState());

    const { liveActivity } = require('@/features/widget/surfaces/liveActivity/liveActivity.ios');
    await liveActivity.update(makeState({ title: 'Renamed' }));

    expect(existing.end).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
    expect(existing.update).toHaveBeenCalledTimes(1);
  });

  it('schedules a native auto-dismiss at the event end for a short upcoming event', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T09:10:00.000Z'));
    mockGetInstances.mockReturnValue([]);
    mockReadLiveEvent.mockReturnValue(makeState());
    const created = { update: jest.fn().mockResolvedValue(undefined), end: jest.fn().mockResolvedValue(undefined) };
    mockStart.mockReturnValue(created);

    const { liveActivity } = require('@/features/widget/surfaces/liveActivity/liveActivity.ios');
    await liveActivity.update(makeState());

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(created.end).toHaveBeenCalledTimes(1);
    expect(created.end.mock.calls[0][0]).toEqual({ after: new Date('2026-07-29T09:30:00.000Z') });

    await liveActivity.update(makeState());
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(created.update).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('restarts a scheduled short event when an edit changes its content', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T09:10:00.000Z'));
    mockGetInstances.mockReturnValue([]);
    mockReadLiveEvent.mockReturnValue(makeState());
    const created = { update: jest.fn().mockResolvedValue(undefined), end: jest.fn().mockResolvedValue(undefined) };
    mockStart.mockReturnValue(created);

    const { liveActivity } = require('@/features/widget/surfaces/liveActivity/liveActivity.ios');
    await liveActivity.update(makeState());
    expect(mockStart).toHaveBeenCalledTimes(1);

    await liveActivity.update(makeState({ title: 'Renamed standup' }));
    expect(created.end).toHaveBeenCalledWith('immediate');
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockStart.mock.calls[1][0]).toMatchObject({ title: 'Renamed standup' });

    jest.useRealTimers();
  });

  it('keeps a long event live and updatable instead of scheduling an early dismissal', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T09:00:00.000Z'));
    mockGetInstances.mockReturnValue([]);
    const created = { update: jest.fn().mockResolvedValue(undefined), end: jest.fn().mockResolvedValue(undefined) };
    mockStart.mockReturnValue(created);

    const longEvent = makeState({ endIso: '2026-07-29T15:00:00.000Z' });
    const { liveActivity } = require('@/features/widget/surfaces/liveActivity/liveActivity.ios');
    await liveActivity.update(longEvent);

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(created.end).not.toHaveBeenCalled();

    mockReadLiveEvent.mockReturnValue(longEvent);
    await liveActivity.update({ ...longEvent, title: 'Renamed' });
    expect(created.update).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('clear() ends a native activity reconciled via getInstances() even with no local reference', async () => {
    const existing = { update: jest.fn(), end: jest.fn().mockResolvedValue(undefined) };
    mockGetInstances.mockReturnValue([existing]);

    const { liveActivity } = require('@/features/widget/surfaces/liveActivity/liveActivity.ios');
    await liveActivity.clear();

    expect(existing.end).toHaveBeenCalledWith('immediate');
  });
});
