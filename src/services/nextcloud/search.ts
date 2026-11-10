import type { Account } from '@/types';
import type { ServerRequest } from '@/features/search/serverSearch';

import { httpErrorFrom } from '../shared/errors';
import { trustedFetch } from '../shared/trustedFetch';

export type CalendarSearchEntry = { title: string; subline: string; resourceUrl: string; start: Date | null };

const DEFAULT_LIMIT = 30;

function startOf(attributes: unknown): Date | null {
  const createdAt = Number((attributes as Record<string, unknown> | null)?.createdAt);
  return Number.isFinite(createdAt) && createdAt > 0 ? new Date(createdAt * 1000) : null;
}

export async function searchCalendarEvents(
  account: Account,
  request: ServerRequest,
  limit = DEFAULT_LIMIT,
): Promise<CalendarSearchEntry[]> {
  const params = new URLSearchParams({ term: request.term, limit: String(limit) });
  if (request.since) params.set('since', request.since);
  if (request.until) params.set('until', request.until);
  const res = await trustedFetch(`${account.baseUrl}/ocs/v2.php/search/providers/calendar/search?${params}`, {
    headers: {
      Authorization: 'Basic ' + btoa(`${account.username}:${account.appPassword}`),
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw httpErrorFrom(res, 'searchCalendarEvents');
  const json = await res.json();
  const entries: unknown[] = Array.isArray(json?.ocs?.data?.entries) ? json.ocs.data.entries : [];
  return entries.map((raw) => {
    const entry = raw as Record<string, unknown>;
    return {
      title: String(entry.title ?? ''),
      subline: String(entry.subline ?? ''),
      resourceUrl: String(entry.resourceUrl ?? ''),
      start: startOf(entry.attributes),
    };
  });
}
