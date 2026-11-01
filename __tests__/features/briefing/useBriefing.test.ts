import { renderHook, act } from '@testing-library/react-native';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { useBriefing } from '@/features/briefing/useBriefing';
import type { BriefingSegment } from '@/features/briefing/types';
import { readUpcomingEvents } from '@/features/widget/core/readEvents';
import * as tts from '@/services/voice/tts';
import { useSettingsStore } from '@/stores/settingsStore';
import type { CalendarEvent } from '@/types';

jest.mock('expo-localization', () => ({
  getCalendars: jest.fn(() => [{ uses24hourClock: false }]),
  getLocales: jest.fn(() => [{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US' }]),
}));

jest.mock('@/features/widget/core/readEvents', () => ({
  readUpcomingEvents: jest.fn(),
}));

jest.mock('@/services/voice/tts', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  isSpeaking: jest.fn(() => Promise.resolve(false)),
}));

const mockedRead = readUpcomingEvents as jest.MockedFunction<typeof readUpcomingEvents>;
const speakMock = tts.speak as jest.Mock;
const stopMock = tts.stop as jest.Mock;
const pauseMock = tts.pause as jest.Mock;
const resumeMock = tts.resume as jest.Mock;

const DAY = new Date(2026, 7, 10);
const FUTURE = new Date(2999, 0, 1);
const PAST = new Date(2000, 0, 1);

function ev(partial: Partial<CalendarEvent> & { uid: string }): CalendarEvent {
  return {
    href: `/cal/${partial.uid}`,
    calendarId: 'cal1',
    accountId: 'a1',
    summary: partial.uid,
    dtstart: new Date(2026, 7, 10, 9),
    dtend: FUTURE,
    allDay: false,
    color: '#000000',
    attendees: [],
    isRecurring: false,
    ...partial,
  };
}

const SEGMENTS: BriefingSegment[] = [
  { key: 'intro', text: 'Intro.' },
  { key: 'e1', text: 'First event.', eventUid: 'e1' },
  { key: 'outro', text: 'Outro.' },
];

const buildText = jest.fn();

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const speakCalls = () => speakMock.mock.calls.map((c) => c[0] as string);
const fireDone = (callIndex: number) =>
  act(() => {
    speakMock.mock.calls[callIndex][1].onDone();
  });

let originalOs: string;

beforeEach(() => {
  jest.clearAllMocks();
  originalOs = Platform.OS;
  (Platform as { OS: string }).OS = 'ios';
  useSettingsStore.setState({ language: 'en', timeFormat: '12h' });
  buildText.mockReturnValue(SEGMENTS);
  mockedRead.mockResolvedValue([ev({ uid: 'e1' })]);
});

afterEach(() => {
  (Platform as { OS: string }).OS = originalOs;
});

describe('useBriefing — start', () => {
  it('reads the displayed day, drops finished events for today and speaks segments in order', async () => {
    const today = new Date();
    const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    mockedRead.mockResolvedValue([
      ev({ uid: 'finished', dtend: new Date(Date.now() - 3600e3) }), // ended earlier today
      ev({ uid: 'tail', dtend: midnight }), // ends exactly at day start — never spoken
      ev({ uid: 'ongoing', dtend: FUTURE }),
      ev({ uid: 'holiday', allDay: true, dtend: new Date(midnight.getTime() + 12 * 3600e3) }),
    ]);
    const { result } = renderHook(() => useBriefing(today, buildText));

    await act(async () => {
      await result.current.start();
    });

    expect(mockedRead).toHaveBeenCalledWith(0, today);
    // finished + midnight-tail dropped; in-progress and all-day kept
    expect(buildText).toHaveBeenCalledWith(
      [expect.objectContaining({ uid: 'ongoing' }), expect.objectContaining({ uid: 'holiday' })],
      expect.objectContaining({ locale: 'en-US', use24h: false, now: expect.any(Date), day: today }),
    );
    expect(result.current.state).toBe('speaking');
    expect(result.current.index).toBe(0);
    expect(result.current.segments).toEqual(SEGMENTS);
    expect(speakCalls()).toEqual(['Intro.']);
    expect(speakMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ language: 'en-US', onDone: expect.any(Function) }),
    );

    fireDone(0);
    expect(result.current.index).toBe(1);
    expect(speakCalls()).toEqual(['Intro.', 'First event.']);

    fireDone(1);
    fireDone(2);
    expect(speakCalls()).toEqual(['Intro.', 'First event.', 'Outro.']);
    expect(result.current.state).toBe('done');
    expect(result.current.index).toBe(3);
  });

  it('keeps every event of a non-today displayed day, dropping only midnight-boundary tails', async () => {
    const pastDay = new Date(2020, 4, 11);
    const at = (h: number) => new Date(2020, 4, 11, h);
    mockedRead.mockResolvedValue([
      ev({ uid: 'morning', dtstart: at(8), dtend: at(9) }), // long finished, but kept
      ev({ uid: 'tail', dtstart: new Date(2020, 4, 10, 23), dtend: at(0) }), // ends at day start
      ev({ uid: 'evening', dtstart: at(20), dtend: at(21) }),
    ]);
    const { result } = renderHook(() => useBriefing(pastDay, buildText));

    await act(async () => {
      await result.current.start();
    });

    expect(mockedRead).toHaveBeenCalledWith(0, pastDay);
    expect(buildText).toHaveBeenCalledWith(
      [expect.objectContaining({ uid: 'morning' }), expect.objectContaining({ uid: 'evening' })],
      expect.objectContaining({ day: pastDay }),
    );
    expect(result.current.state).toBe('speaking');
  });

  it('speaks the localized emptyDay line and ends done on an empty day', async () => {
    buildText.mockReturnValue([]);
    const { result } = renderHook(() => useBriefing(DAY, buildText));

    await act(async () => {
      await result.current.start();
    });

    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(speakMock).toHaveBeenCalledWith('No events today', { language: 'en-US' });
    expect(result.current.state).toBe('done');
    expect(result.current.segments).toEqual([]);
  });

  it('warns and settles back to idle when readUpcomingEvents rejects', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedRead.mockRejectedValue(new Error('db down'));
    const { result } = renderHook(() => useBriefing(DAY, buildText));

    await act(async () => {
      await result.current.start(); // must not throw
    });

    expect(warn).toHaveBeenCalledWith('[briefing] start failed', expect.any(Error));
    expect(result.current.state).toBe('idle');
    expect(result.current.segments).toEqual([]);
    expect(speakMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('interrupts a running briefing on restart', async () => {
    const { result } = renderHook(() => useBriefing(DAY, buildText));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('speaking');

    await act(async () => {
      await result.current.start();
    });
    expect(stopMock).toHaveBeenCalledTimes(2); // once per start()
    expect(result.current.state).toBe('speaking');
    expect(result.current.index).toBe(0);
    // a stale onDone from the first run must not double-advance
    fireDone(0);
    expect(result.current.index).toBe(0);
    expect(speakCalls()).toEqual(['Intro.', 'Intro.']);
  });

  it('lets the later start win when readUpcomingEvents resolves out of order', async () => {
    const d1 = deferred<CalendarEvent[]>();
    const d2 = deferred<CalendarEvent[]>();
    mockedRead.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    buildText.mockImplementation((events: { uid: string }[]) =>
      events.map((e) => ({ key: e.uid, text: `${e.uid}.` })),
    );

    const { result } = renderHook(() => useBriefing(DAY, buildText));
    let p1!: Promise<void>;
    let p2!: Promise<void>;
    await act(async () => {
      p1 = result.current.start();
      p2 = result.current.start();
    });
    // second (winning) read resolves first
    await act(async () => {
      d2.resolve([ev({ uid: 'fresh' })]);
      await p2;
    });
    // stale first read resolves afterwards — must bail, not double-speak
    await act(async () => {
      d1.resolve([ev({ uid: 'stale' })]);
      await p1;
    });

    expect(speakCalls()).toEqual(['fresh.']);
    expect(result.current.segments).toEqual([{ key: 'fresh', text: 'fresh.' }]);
    expect(result.current.state).toBe('speaking');
  });
});

describe('useBriefing — controls', () => {
  it('next() skips to the following segment and finishes at the end', async () => {
    const { result } = renderHook(() => useBriefing(DAY, buildText));
    await act(async () => {
      await result.current.start();
    });

    act(() => result.current.next());
    expect(result.current.index).toBe(1);
    expect(speakCalls()).toEqual(['Intro.', 'First event.']);

    act(() => result.current.next());
    expect(result.current.index).toBe(2);

    act(() => result.current.next());
    expect(result.current.state).toBe('done');
    expect(speakCalls()).toEqual(['Intro.', 'First event.', 'Outro.']);
  });

  it('next() while paused stops the paused utterance and moves on', async () => {
    const { result } = renderHook(() => useBriefing(DAY, buildText));
    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.pause());
    expect(result.current.state).toBe('paused');

    act(() => result.current.next());
    expect(stopMock).toHaveBeenCalled();
    expect(result.current.state).toBe('speaking');
    expect(result.current.index).toBe(1);
  });

  it('pause() and resume() drive native tts and state on iOS', async () => {
    const { result } = renderHook(() => useBriefing(DAY, buildText));
    await act(async () => {
      await result.current.start();
    });

    act(() => result.current.pause());
    expect(pauseMock).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('paused');

    act(() => result.current.resume());
    expect(resumeMock).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('speaking');
  });

  it('pause() and resume() are guarded by state', async () => {
    const { result } = renderHook(() => useBriefing(DAY, buildText));

    act(() => result.current.pause()); // idle — no-op
    act(() => result.current.resume()); // idle — no-op
    expect(pauseMock).not.toHaveBeenCalled();
    expect(resumeMock).not.toHaveBeenCalled();
    expect(stopMock).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');

    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.resume()); // speaking, not paused — no-op
    expect(resumeMock).not.toHaveBeenCalled();
    expect(result.current.state).toBe('speaking');

    act(() => result.current.pause());
    act(() => result.current.pause()); // already paused — no-op
    expect(pauseMock).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('paused');
  });

  it('emulates pause on Android: stops the utterance and re-speaks the segment on resume', async () => {
    (Platform as { OS: string }).OS = 'android';
    const { result } = renderHook(() => useBriefing(DAY, buildText));
    await act(async () => {
      await result.current.start();
    });
    stopMock.mockClear();

    act(() => result.current.pause());
    expect(stopMock).toHaveBeenCalledTimes(1); // stop() emulates the missing native pause
    expect(pauseMock).not.toHaveBeenCalled();
    expect(result.current.state).toBe('paused');

    act(() => result.current.resume());
    expect(resumeMock).not.toHaveBeenCalled();
    expect(result.current.state).toBe('speaking');
    expect(result.current.index).toBe(0);
    expect(speakCalls()).toEqual(['Intro.', 'Intro.']); // same segment re-spoken

    fireDone(1); // the re-spoken segment finishes → chain resumes normally
    expect(result.current.index).toBe(1);
    expect(speakCalls()).toEqual(['Intro.', 'Intro.', 'First event.']);
  });

  it('defers an onDone that lands while paused to resume() instead of flicking back', async () => {
    const { result } = renderHook(() => useBriefing(DAY, buildText));
    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.pause());
    expect(result.current.state).toBe('paused');

    fireDone(0); // utterance had already finished while paused
    expect(result.current.state).toBe('paused');

    act(() => result.current.resume());
    expect(resumeMock).not.toHaveBeenCalled(); // nothing left to resume natively
    expect(result.current.state).toBe('speaking');
    expect(result.current.index).toBe(1);
    expect(speakCalls()).toEqual(['Intro.', 'First event.']); // chain continued, no re-speak
  });

  it('skips a failed segment instead of stalling when Speech reports onError', async () => {
    const { result } = renderHook(() => useBriefing(DAY, buildText));
    await act(async () => {
      await result.current.start();
    });

    act(() => {
      speakMock.mock.calls[0][1].onError(new Error('tts broke'));
    });
    expect(result.current.state).toBe('speaking');
    expect(result.current.index).toBe(1);
    expect(speakCalls()).toEqual(['Intro.', 'First event.']);
  });

  it('stop() resets state, index and segments', async () => {
    const { result } = renderHook(() => useBriefing(DAY, buildText));
    await act(async () => {
      await result.current.start();
    });

    act(() => result.current.stop());
    expect(stopMock).toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
    expect(result.current.index).toBe(0);
    expect(result.current.segments).toEqual([]);

    // a pending onDone after stop() must not speak again
    fireDone(0);
    expect(speakCalls()).toEqual(['Intro.']);
  });
});

describe('useBriefing — lifecycle', () => {
  it('stops tts on unmount', async () => {
    const { result, unmount } = renderHook(() => useBriefing(DAY, buildText));
    await act(async () => {
      await result.current.start();
    });
    stopMock.mockClear();

    unmount();
    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it('stops the briefing when the app goes to background', async () => {
    const handlers: ((s: AppStateStatus) => void)[] = [];
    const spy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((event: string, cb: (s: AppStateStatus) => void) => {
        if (event === 'change') handlers.push(cb);
        return { remove: jest.fn() };
      });

    const { result } = renderHook(() => useBriefing(DAY, buildText));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('speaking');

    act(() => {
      handlers.forEach((h) => h('background'));
    });
    expect(result.current.state).toBe('idle');
    expect(stopMock).toHaveBeenCalled();

    spy.mockRestore();
  });
});
