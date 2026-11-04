import { renderHook, act, waitFor } from '@testing-library/react-native';

import type { Account, CalendarEvent, CalendarMeta } from '@/types';
import type { VoiceIntent } from '@/services/voice/intents';
import { useSettingsStore } from '@/stores/settingsStore';

jest.mock('expo-localization', () => ({
    getCalendars: jest.fn(() => [{ uses24hourClock: false }]),
    getLocales: jest.fn(() => [{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US' }]),
}));

const mockIsSttAvailable = jest.fn(() => true);
const mockRequestPerms = jest.fn(async () => true);
let sttCallbacks: {
    onPartial?: (t: string) => void;
    onResult?: (t: string) => void;
    onError?: (e: Error) => void;
} = {};
const mockStartListening = jest.fn((opts: typeof sttCallbacks) => {
    sttCallbacks = opts;
});
const mockCancelListening = jest.fn();

jest.mock('@/services/voice/stt', () => ({
    isSttAvailable: () => mockIsSttAvailable(),
    requestSttPermissions: () => mockRequestPerms(),
    startListening: (o: typeof sttCallbacks) => mockStartListening(o),
    stopListening: jest.fn(),
    cancelListening: () => mockCancelListening(),
    getSttPermissions: jest.fn(async () => ({ granted: true, canAskAgain: true })),
}));

const mockParse = jest.fn(() => ({ kind: 'unknown', raw: '' } as VoiceIntent));
jest.mock('@/services/voice/intents', () => ({
    parseUtterance: () => mockParse(),
}));

const mockIsAgentAvailable = jest.fn();
const mockAskAgent = jest.fn();
jest.mock('@/services/voice/agent', () => ({
    ...jest.requireActual('@/services/voice/agent'),
    isAgentAvailable: (a: unknown) => mockIsAgentAvailable(a),
    askAgent: (...a: unknown[]) => mockAskAgent(a[0], a[1], a[2]),
}));

const mockEventsOnDay = jest.fn();
const mockNextEvent = jest.fn();
const mockFindTargets = jest.fn();
const mockResolveAttendees = jest.fn();
jest.mock('@/services/voice/actions', () => {
    const real = jest.requireActual('@/services/voice/actions');
    return {
        ...real,
        eventsOnDay: (a: string, d: Date) => mockEventsOnDay(a, d),
        nextEventAfter: (a: string, n?: Date) => mockNextEvent(a, n),
        findEventTargets: (a: string, t: unknown, n?: Date) => mockFindTargets(a, t, n),
        resolveAttendeeNames: (a: unknown, n: string[]) => mockResolveAttendees(a, n),
    };
});

jest.mock('@/services/voice/tts', () => ({
    speak: jest.fn((t: string, o?: { onDone?: () => void }) => o?.onDone?.()),
    stop: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    isSpeaking: jest.fn(async () => false),
}));

const mockCreateMutate = jest.fn(async () => {});
const mockUpdateMutate = jest.fn(async () => {});
const mockDeleteMutate = jest.fn(async () => {});
jest.mock('@/features/event/hooks/useMutateEvent', () => ({
    useCreateEvent: () => ({ mutateAsync: mockCreateMutate }),
    useUpdateEvent: () => ({ mutateAsync: mockUpdateMutate }),
    useDeleteEvent: () => ({ mutateAsync: mockDeleteMutate }),
}));

jest.mock('@/features/calendar/utils/eventToInput', () => ({
    eventToInput: () => ({ summary: 'x' }),
}));

import { useVoiceAssistant } from '@/features/voice/useVoiceAssistant';

const account = {
    id: 'a1', baseUrl: 'https://nc.test', username: 'u', appPassword: 'p',
} as unknown as Account;
const calendars = [{ id: 'cal1', displayName: 'Personnel' }] as never[];

function ev(partial: Partial<CalendarEvent> & { dtstart: Date; dtend: Date }): CalendarEvent {
    return {
        uid: 'u', href: '/u.ics', calendarId: 'cal1', accountId: 'a1',
        summary: 'Event', allDay: false, color: '#3b82f6', attendees: [], isRecurring: false,
        ...partial,
    };
}

function renderAssistant() {
    return renderHook(() => useVoiceAssistant(account, calendars));
}

beforeEach(() => {
    jest.clearAllMocks();
    sttCallbacks = {};
    mockIsSttAvailable.mockReturnValue(true);
    mockRequestPerms.mockResolvedValue(true);
    mockIsAgentAvailable.mockResolvedValue(false);
    mockAskAgent.mockResolvedValue('agent answer');
    mockEventsOnDay.mockResolvedValue([]);
    mockNextEvent.mockResolvedValue(undefined);
    mockFindTargets.mockResolvedValue([]);
    mockResolveAttendees.mockResolvedValue({ attendees: [], ambiguous: [] });
    mockParse.mockReturnValue({ kind: 'unknown', raw: '' });
    useSettingsStore.setState({ defaultCalendarByAccount: {} });
});

describe('open / listen', () => {
    it('opens the sheet, asks permission and starts listening', async () => {
        const { result } = renderAssistant();
        await act(async () => result.current.open());
        expect(result.current.visible).toBe(true);
        expect(mockRequestPerms).toHaveBeenCalled();
        expect(mockStartListening).toHaveBeenCalled();
        expect(result.current.state).toBe('listening');
    });

    it('permission denied → error but the sheet stays open for typed input', async () => {
        mockRequestPerms.mockResolvedValue(false);
        const { result } = renderAssistant();
        await act(async () => result.current.open());
        expect(result.current.state).toBe('error');
        expect(result.current.visible).toBe(true);
    });

    it('STT unavailable → error state, typed path still works', async () => {
        mockIsSttAvailable.mockReturnValue(false);
        mockParse.mockReturnValue({ kind: 'next' });
        mockNextEvent.mockResolvedValue(
            ev({ uid: 'n1', summary: 'Standup', dtstart: new Date(2030, 0, 1, 9), dtend: new Date(2030, 0, 1, 10) }),
        );
        const { result } = renderAssistant();
        await act(async () => result.current.open());
        expect(result.current.state).toBe('error');
        await act(async () => result.current.submitText('prochain événement'));
        await waitFor(() => expect(result.current.state).toBe('replying'));
        expect(mockNextEvent).toHaveBeenCalled();
    });
});

describe('read intents', () => {
    it('agenda → builds and speaks the day briefing', async () => {
        const day = new Date(2030, 0, 5);
        mockParse.mockReturnValue({ kind: 'agenda', day });
        mockEventsOnDay.mockResolvedValue([
            ev({ uid: 'e1', dtstart: new Date(2030, 0, 5, 9), dtend: new Date(2030, 0, 5, 10) }),
        ]);
        const { result } = renderAssistant();
        await act(async () => result.current.open());
        await act(async () => result.current.submitText('qu\'est-ce que j\'ai lundi'));
        await waitFor(() => expect(result.current.state).toBe('replying'));
        expect(mockEventsOnDay).toHaveBeenCalledWith('a1', day);
        expect(result.current.reply).toBeTruthy();
    });

    it('next → nothingFound reply when the calendar is empty', async () => {
        mockParse.mockReturnValue({ kind: 'next' });
        const { result } = renderAssistant();
        await act(async () => result.current.open());
        await act(async () => result.current.submitText('next event'));
        await waitFor(() => expect(result.current.state).toBe('replying'));
        expect(result.current.reply).toBeTruthy();
    });
});

describe('mutations behind the confirmation gate', () => {
    it('create → confirming → confirm executes and replies', async () => {
        const start = new Date(2030, 0, 5, 14, 30);
        mockParse.mockReturnValue({ kind: 'create', summary: 'Dentiste', start, names: [] });
        const { result } = renderAssistant();
        await act(async () => result.current.open());
        await act(async () => result.current.submitText('crée dentiste lundi 14h30'));
        await waitFor(() => expect(result.current.state).toBe('confirming'));
        expect(result.current.intentDescription).toBeTruthy();
        expect(mockCreateMutate).not.toHaveBeenCalled();

        await act(async () => result.current.confirm());
        await waitFor(() => expect(result.current.state).toBe('replying'));
        expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    });

    it('delete with several matches → disambiguating → pick → confirm → delete', async () => {
        mockParse.mockReturnValue({ kind: 'delete', target: { title: 'call' } });
        mockFindTargets.mockResolvedValue([
            ev({ uid: 'c1', summary: 'Call A', dtstart: new Date(2030, 0, 5, 15), dtend: new Date(2030, 0, 5, 16) }),
            ev({ uid: 'c2', summary: 'Call B', dtstart: new Date(2030, 0, 6, 15), dtend: new Date(2030, 0, 6, 16) }),
        ]);
        const { result } = renderAssistant();
        await act(async () => result.current.open());
        await act(async () => result.current.submitText('supprime call'));
        await waitFor(() => expect(result.current.state).toBe('disambiguating'));
        expect(result.current.candidates).toHaveLength(2);
        expect(mockDeleteMutate).not.toHaveBeenCalled();

        await act(async () => result.current.pickCandidate(1));
        await waitFor(() => expect(result.current.state).toBe('confirming'));
        await act(async () => result.current.confirm());
        await waitFor(() => expect(result.current.state).toBe('replying'));
        expect(mockDeleteMutate).toHaveBeenCalledWith(
            expect.objectContaining({ event: expect.objectContaining({ uid: 'c2' }) }),
        );
    });

    it('a new utterance while confirming drops the pending op — confirm() becomes a no-op', async () => {
        const start = new Date(2030, 0, 5, 14, 30);
        mockParse
            .mockReturnValueOnce({ kind: 'create', summary: 'Dentiste', start, names: [] })
            .mockReturnValue({ kind: 'next' });
        const { result } = renderAssistant();
        await act(async () => result.current.open());
        await act(async () => result.current.submitText('crée dentiste'));
        await waitFor(() => expect(result.current.state).toBe('confirming'));

        await act(async () => result.current.submitText('prochain événement'));
        await waitFor(() => expect(result.current.state).toBe('replying'));

        await act(async () => result.current.confirm());
        expect(mockCreateMutate).not.toHaveBeenCalled();
    });
});

describe('create — calendar resolution', () => {
    const start = new Date(2030, 0, 5, 14, 30);
    const multi = [
        { id: 'cal1', displayName: 'Personnel' },
        { id: 'cal2', displayName: 'Planning clara' },
        { id: 'cal3', displayName: 'Perma SIPC' },
    ] as CalendarMeta[];
    const renderMulti = () => renderHook(() => useVoiceAssistant(account, multi));

    it('several calendars + no default → disambiguating → pick → create on the chosen calendar', async () => {
        mockParse.mockReturnValue({ kind: 'create', summary: 'Dentiste', start, names: [] });
        const { result } = renderMulti();
        await act(async () => result.current.open());
        await act(async () => result.current.submitText('crée dentiste demain 14h30'));
        await waitFor(() => expect(result.current.state).toBe('disambiguating'));
        expect(result.current.candidates).toEqual(['Personnel', 'Planning clara', 'Perma SIPC']);
        expect(mockCreateMutate).not.toHaveBeenCalled();

        await act(async () => result.current.pickCandidate(1));
        await waitFor(() => expect(result.current.state).toBe('confirming'));
        expect(result.current.intentDescription).toContain('Planning clara');

        await act(async () => result.current.confirm());
        await waitFor(() => expect(result.current.state).toBe('replying'));
        expect(mockCreateMutate).toHaveBeenCalledWith(
            expect.objectContaining({ calendarId: 'cal2' }),
        );
    });

    it('spoken agenda name → direct confirmation on the matching calendar', async () => {
        mockParse.mockReturnValue({
            kind: 'create', summary: 'rdv', start, names: [], calendarName: 'clara',
        });
        const { result } = renderMulti();
        await act(async () => result.current.open());
        await act(async () => result.current.submitText("crée un rdv demain dans l'agenda clara"));
        await waitFor(() => expect(result.current.state).toBe('confirming'));
        expect(result.current.intentDescription).toContain('Planning clara');
        expect(result.current.candidates).toEqual([]);

        await act(async () => result.current.confirm());
        await waitFor(() => expect(result.current.state).toBe('replying'));
        expect(mockCreateMutate).toHaveBeenCalledWith(
            expect.objectContaining({ calendarId: 'cal2' }),
        );
    });

    it('configured default calendar is used without asking', async () => {
        useSettingsStore.setState({ defaultCalendarByAccount: { a1: 'cal3' } });
        mockParse.mockReturnValue({ kind: 'create', summary: 'Dentiste', start, names: [] });
        const { result } = renderMulti();
        await act(async () => result.current.open());
        await act(async () => result.current.submitText('crée dentiste demain 14h30'));
        await waitFor(() => expect(result.current.state).toBe('confirming'));
        expect(result.current.intentDescription).toContain('Perma SIPC');

        await act(async () => result.current.confirm());
        await waitFor(() => expect(result.current.state).toBe('replying'));
        expect(mockCreateMutate).toHaveBeenCalledWith(
            expect.objectContaining({ calendarId: 'cal3' }),
        );
    });

    it('unknown spoken calendar name → asks instead of silently defaulting', async () => {
        mockParse.mockReturnValue({
            kind: 'create', summary: 'rdv', start, names: [], calendarName: 'inconnu',
        });
        const { result } = renderMulti();
        await act(async () => result.current.open());
        await act(async () => result.current.submitText("crée un rdv demain dans l'agenda inconnu"));
        await waitFor(() => expect(result.current.state).toBe('disambiguating'));
        expect(result.current.candidates).toEqual(['Personnel', 'Planning clara', 'Perma SIPC']);
        expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('read-only calendars are excluded from the candidates', async () => {
        const mixed = [
            { id: 'ro', displayName: 'Jours fériés', isReadOnly: true },
            { id: 'cal1', displayName: 'Personnel' },
            { id: 'cal2', displayName: 'Pro' },
        ] as CalendarMeta[];
        mockParse.mockReturnValue({ kind: 'create', summary: 'Dentiste', start, names: [] });
        const { result } = renderHook(() => useVoiceAssistant(account, mixed));
        await act(async () => result.current.open());
        await act(async () => result.current.submitText('crée dentiste demain 14h30'));
        await waitFor(() => expect(result.current.state).toBe('disambiguating'));
        expect(result.current.candidates).toEqual(['Personnel', 'Pro']);
    });

    it('all calendars read-only → error, no mutation', async () => {
        const readOnly = [
            { id: 'ro1', displayName: 'A', isReadOnly: true },
            { id: 'ro2', displayName: 'B', isReadOnly: true },
        ] as CalendarMeta[];
        mockParse.mockReturnValue({ kind: 'create', summary: 'Dentiste', start, names: [] });
        const { result } = renderHook(() => useVoiceAssistant(account, readOnly));
        await act(async () => result.current.open());
        await act(async () => result.current.submitText('crée dentiste demain 14h30'));
        await waitFor(() => expect(result.current.state).toBe('error'));
        expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('default pointing at a read-only calendar is ignored → asks', async () => {
        useSettingsStore.setState({ defaultCalendarByAccount: { a1: 'ro' } });
        const mixed = [
            { id: 'ro', displayName: 'Jours fériés', isReadOnly: true },
            { id: 'cal1', displayName: 'Personnel' },
            { id: 'cal2', displayName: 'Pro' },
        ] as CalendarMeta[];
        mockParse.mockReturnValue({ kind: 'create', summary: 'Dentiste', start, names: [] });
        const { result } = renderHook(() => useVoiceAssistant(account, mixed));
        await act(async () => result.current.open());
        await act(async () => result.current.submitText('crée dentiste demain 14h30'));
        await waitFor(() => expect(result.current.state).toBe('disambiguating'));
        expect(result.current.candidates).toEqual(['Personnel', 'Pro']);
    });
});

describe('freeform → tier 2 agent', () => {
    it('agent unavailable → notUnderstood reply', async () => {
        mockParse.mockReturnValue({ kind: 'freeform', text: 'suis-je libre ?' });
        mockIsAgentAvailable.mockResolvedValue(false);
        const { result } = renderAssistant();
        await act(async () => result.current.open());
        await act(async () => result.current.submitText('suis-je libre ?'));
        await waitFor(() => expect(result.current.state).toBe('replying'));
        expect(mockAskAgent).not.toHaveBeenCalled();
    });

    it('agent available → thinking → spoken answer', async () => {
        mockParse.mockReturnValue({ kind: 'freeform', text: 'suis-je libre jeudi ?' });
        mockIsAgentAvailable.mockResolvedValue(true);
        mockAskAgent.mockResolvedValue('Vous êtes libre jeudi après-midi.');
        const { result } = renderAssistant();
        await act(async () => result.current.open());
        await act(async () => result.current.submitText('suis-je libre jeudi ?'));
        await waitFor(() => expect(result.current.state).toBe('replying'));
        expect(result.current.reply).toBe('Vous êtes libre jeudi après-midi.');
    });
});

describe('lifecycle', () => {
    it('close() stops listening + speaking and resets to idle', async () => {
        const { result } = renderAssistant();
        await act(async () => result.current.open());
        act(() => result.current.close());
        expect(result.current.visible).toBe(false);
        expect(result.current.state).toBe('idle');
        expect(mockCancelListening).toHaveBeenCalled();
    });

    it('new utterance invalidates an in-flight transcription', async () => {
        const { result } = renderAssistant();
        await act(async () => result.current.open());
        act(() => result.current.submitText('hello'));
        // stale STT result landing after the new round must be ignored
        act(() => sttCallbacks.onResult?.('stale'));
        expect(result.current.transcript).toBe('hello');
    });
});
