import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useDaySummary } from '@/features/ai/useDaySummary';
import { dayEventsToPrompt } from '@/features/ai/prompts';
import { templateSummary } from '@/features/ai/templateSummary';
import {
  fetchTaskTypes,
  hasTextTaskType,
  pollTask,
  scheduleTask,
} from '@/services/nextcloud/taskprocessing';
import { useEventsForRange } from '@/database/useEvents';
import { setAccounts } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Account, CalendarEvent, TaskTypeInfo } from '@/types';

jest.mock(
  '@/services/nextcloud/taskprocessing',
  () => ({
    fetchTaskTypes: jest.fn(),
    scheduleTask: jest.fn(),
    getTask: jest.fn(),
    cancelTask: jest.fn(),
    pollTask: jest.fn(),
    hasTextTaskType: jest.fn(),
  }),
  { virtual: true }
);
jest.mock(
  '@/features/ai/prompts',
  () => ({
    dayEventsToPrompt: jest.fn(() => 'PROMPT'),
    draftDescriptionPrompt: jest.fn(() => 'DRAFT'),
  }),
  { virtual: true }
);
jest.mock(
  '@/features/ai/templateSummary',
  () => ({ templateSummary: jest.fn(() => 'TEMPLATE') }),
  { virtual: true }
);
jest.mock('@/database/useEvents', () => ({ useEventsForRange: jest.fn(() => []) }));

const fetchTypes = fetchTaskTypes as jest.Mock;
const pickText = hasTextTaskType as jest.Mock;
const schedule = scheduleTask as jest.Mock;
const poll = pollTask as jest.Mock;
const eventsForRange = useEventsForRange as jest.Mock;
const toPrompt = dayEventsToPrompt as jest.Mock;
const template = templateSummary as jest.Mock;

const types: Record<string, TaskTypeInfo> = {
  'core:text2text': {
    name: 'Free text to text',
    description: '',
    inputShape: {},
    outputShape: {},
  },
};

function account(id: string): Account {
  return {
    id,
    displayName: 'Test',
    baseUrl: 'https://cloud.example.com',
    username: 'u',
    appPassword: 'p',
    davUserId: 'u',
  };
}

const event: CalendarEvent = {
  uid: 'u1',
  href: 'h1',
  calendarId: 'cal1',
  accountId: 'a1',
  summary: 'Standup',
  dtstart: new Date('2025-01-15T09:30:00Z'),
  dtend: new Date('2025-01-15T10:00:00Z'),
  allDay: false,
  color: '#fff',
  attendees: [],
  isRecurring: false,
};

function activate(a: Account, ai: boolean) {
  setAccounts([a]);
  useAccountStore.getState().setActiveAccountId(a.id);
  useSettingsStore.getState().setAiEnabled(ai);
  eventsForRange.mockReturnValue([{ ...event, accountId: a.id }]);
}

async function settleTaskTypes() {
  await waitFor(() => expect(fetchTypes).toHaveBeenCalled());
  await act(async () => {});
}

beforeEach(() => {
  jest.clearAllMocks();
  setAccounts([]);
  useAccountStore.getState().setActiveAccountId(null);
  useSettingsStore.getState().setAiEnabled(false);
  fetchTypes.mockResolvedValue(types);
  pickText.mockImplementation((t) =>
    t && Object.keys(t).length > 0 ? 'core:text2text' : null
  );
  template.mockReturnValue('TEMPLATE');
  toPrompt.mockReturnValue('PROMPT');
  eventsForRange.mockReturnValue([event]);
  schedule.mockResolvedValue({ id: 3, type: 'core:text2text', status: 1 });
  poll.mockResolvedValue({
    id: 3,
    type: 'core:text2text',
    status: 3,
    output: { output: 'AI TEXT' },
  });
});

describe('useDaySummary', () => {
  it('queries the exact local day range for the given ISO date', () => {
    activate(account('a1'), false);
    renderHook(() => useDaySummary('2025-01-15'));
    expect(eventsForRange).toHaveBeenCalledWith(
      'a1',
      new Date(2025, 0, 15),
      new Date(2025, 0, 16)
    );
  });

  it('returns the template summary immediately and stays idle when ai is off', async () => {
    activate(account('a2'), false);
    const { result } = renderHook(() => useDaySummary('2025-01-15'));
    await act(async () => {});
    expect(result.current.summary).toBe('TEMPLATE');
    expect(result.current.fromAi).toBe(false);
    expect(result.current.state).toBe('idle');
    expect(schedule).not.toHaveBeenCalled();
    expect(template).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          summary: 'Standup',
          isAllDay: false,
          start: event.dtstart.toISOString(),
        }),
      ],
      expect.objectContaining({ locale: expect.any(String) })
    );
  });

  it('replaces the template with the ai output once the task succeeds', async () => {
    activate(account('a3'), true);
    const { result } = renderHook(() => useDaySummary('2025-01-15'));
    expect(result.current.summary).toBe('TEMPLATE');
    await waitFor(() => expect(result.current.state).toBe('done'));
    expect(result.current.summary).toBe('AI TEXT');
    expect(result.current.fromAi).toBe(true);
    expect(toPrompt).toHaveBeenCalledWith(
      [expect.objectContaining({ summary: 'Standup', isAllDay: false })],
      expect.objectContaining({ locale: expect.any(String) })
    );
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('does not schedule a task when the day has no events', async () => {
    activate(account('a4'), true);
    eventsForRange.mockReturnValue([]);
    const { result } = renderHook(() => useDaySummary('2025-01-15'));
    await settleTaskTypes();
    await act(async () => {});
    expect(schedule).not.toHaveBeenCalled();
    expect(result.current.summary).toBe('TEMPLATE');
    expect(result.current.fromAi).toBe(false);
  });

  it('regenerate schedules a fresh task', async () => {
    activate(account('a5'), true);
    const { result } = renderHook(() => useDaySummary('2025-01-15'));
    await waitFor(() => expect(result.current.state).toBe('done'));
    poll.mockResolvedValueOnce({
      id: 3,
      type: 'core:text2text',
      status: 3,
      output: { output: 'AI TEXT 2' },
    });
    await act(async () => {
      result.current.regenerate();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.summary).toBe('AI TEXT 2'));
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it('keeps the template summary when the task fails', async () => {
    poll.mockResolvedValue({ id: 3, type: 'core:text2text', status: 5 });
    activate(account('a6'), true);
    const { result } = renderHook(() => useDaySummary('2025-01-15'));
    await waitFor(() => expect(result.current.state).toBe('failed'));
    expect(result.current.summary).toBe('TEMPLATE');
    expect(result.current.fromAi).toBe(false);
  });
});
