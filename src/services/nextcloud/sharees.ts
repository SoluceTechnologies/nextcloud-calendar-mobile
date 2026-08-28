import type { Account } from '@/types';
import { httpErrorFrom } from '../shared/errors';
import { trustedFetch } from '../shared/trustedFetch';

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

export type ShareeSource = 'system' | 'user';

export interface ShareeResult {
  id: string;
  displayName: string;
  email: string;
  source: ShareeSource;
}

interface ContactAutocompleteEntry {
  name?: unknown;
  emails?: unknown;
  type?: unknown;
  source?: unknown;
}

const CALENDAR_ATTENDEE_PATH = 'apps/calendar/v1/autocompletion/attendee';

function buildCalendarAttendeeUrl(baseUrl: string, withIndexPhp: boolean): string {
  if (withIndexPhp) {
    return `${baseUrl}/index.php/${CALENDAR_ATTENDEE_PATH}`;
  }
  return `${baseUrl}/${CALENDAR_ATTENDEE_PATH}`;
}

function stripMailto(value: string): string {
  return value.replace(/^mailto:/i, '').trim();
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? v : String(v)));
  }
  if (typeof value === 'string') return [value];
  return [];
}

function parseContactEntry(entry: ContactAutocompleteEntry): ShareeResult[] {
  if (entry.type !== 'individual') return [];

  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  const rawSource = typeof entry.source === 'string' ? entry.source : 'user';
  const source: ShareeSource = rawSource === 'system' ? 'system' : 'user';

  const results: ShareeResult[] = [];
  const seen = new Set<string>();

  for (const raw of asStringList(entry.emails)) {
    let email = stripMailto(raw);
    try {
      email = decodeURIComponent(email);
    } catch {
      // keep as-is
    }
    email = email.trim();
    if (!email.includes('@')) continue;

    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      id: email,
      email,
      displayName: name || email,
      source,
    });
  }

  return results;
}

export interface FetchCalendarAttendeesParams {
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'>;
  search: string;
  limit?: number;
}

async function fetchCalendarAttendees({
  account,
  search,
  limit = 25,
}: FetchCalendarAttendeesParams): Promise<ShareeResult[]> {
  const body = JSON.stringify({ search });
  const headers = {
    Authorization: basicAuth(account),
    'OCS-APIRequest': 'true',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  let res = await trustedFetch(buildCalendarAttendeeUrl(account.baseUrl, false), {
    method: 'POST',
    headers,
    body,
    maxRetries: 1,
  });

  if (res.status === 404) {
    res = await trustedFetch(buildCalendarAttendeeUrl(account.baseUrl, true), {
      method: 'POST',
      headers,
      body,
      maxRetries: 0,
    });
  }

  if (!res.ok) throw httpErrorFrom(res, 'fetchSharees');

  const json: unknown = await res.json();
  if (!Array.isArray(json)) return [];

  const byEmail = new Map<string, ShareeResult>();
  for (const entry of json) {
    for (const parsed of parseContactEntry(entry as ContactAutocompleteEntry)) {
      const key = parsed.email.toLowerCase();
      if (!byEmail.has(key)) {
        byEmail.set(key, parsed);
      }
    }
  }

  const results = Array.from(byEmail.values());
  return limit > 0 ? results.slice(0, limit) : results;
}

export interface FetchAllContactsParams {
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'>;
  limit?: number;
}

export async function fetchAllContacts({
  account,
  limit = 0,
}: FetchAllContactsParams): Promise<ShareeResult[]> {
  return fetchCalendarAttendees({ account, search: '', limit });
}

export interface FetchShareesParams {
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'>;
  query: string;
  limit?: number;
}

export async function fetchSharees({
  account,
  query,
  limit = 25,
}: FetchShareesParams): Promise<ShareeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return fetchCalendarAttendees({ account, search: trimmed, limit });
}
