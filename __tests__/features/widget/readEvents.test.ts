import { observeAgendaEventsQuery, observeTodayEventsQuery } from '@/features/widget/core/readEvents';

const mockQuery = jest.fn(() => ({
  fetch: jest.fn(async () => []),
  observeWithColumns: jest.fn(),
}));

jest.mock('@/database', () => ({
  database: { get: jest.fn(() => ({ query: mockQuery })) },
}));

type WhereClause = {
  type: string;
  left?: string;
  comparison?: { operator: string; right: { value: number } };
};

function endClause(): WhereClause | undefined {
  const conditions = mockQuery.mock.calls.at(-1) as WhereClause[];
  return conditions.find((c) => c.type === 'where' && c.left === 'end');
}

describe('eventsInRangeQuery', () => {
  beforeEach(() => mockQuery.mockClear());

  it('includes events whose end is exactly the range start (inclusive all-day ends)', () => {
    const now = new Date(2026, 9, 1, 15, 30);
    observeTodayEventsQuery('a1', now);
    expect(endClause()?.comparison?.operator).toBe('gte');
    expect(endClause()?.comparison?.right.value).toBe(
      new Date(2026, 9, 1).getTime(),
    );
  });

  it('keeps the same inclusive bound for multi-day windows', () => {
    const now = new Date(2026, 9, 1, 15, 30);
    observeAgendaEventsQuery('a1', 7, now);
    expect(endClause()?.comparison?.operator).toBe('gte');
  });
});
