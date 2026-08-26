import type { Account } from '@/types';
import { httpErrorFrom } from '../shared/errors';
import { trustedFetch } from '../shared/trustedFetch';

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

export type ShareeSource = 'users' | 'emails';

export interface ShareeResult {
  id: string;
  displayName: string;
  email: string;
  source: ShareeSource;
}

interface ShareeEntry {
  label: string;
  value?: { shareType: number; shareWith: string };
  uuid?: string;
  name?: string;
}

interface ShareesResponse {
  ocs?: {
    meta?: { status: string };
    data?: {
      exact?: Record<ShareeSource, ShareeEntry[]>;
      users?: ShareeEntry[];
      emails?: ShareeEntry[];
    };
  };
}

function parseShareeEmail(entry: ShareeEntry): string | undefined {
  const label = entry.label ?? '';
  const match = label.match(/\(([^)]+)\)$/);
  if (match?.[1]?.includes('@')) {
    return match[1].trim();
  }
  if (entry.value?.shareWith?.includes('@')) {
    return entry.value.shareWith.trim();
  }
  return undefined;
}

function parseShareeEntry(entry: ShareeEntry, source: ShareeSource): ShareeResult | undefined {
  const email = parseShareeEmail(entry);
  if (!email) return undefined;

  const displayName = (entry.name ?? entry.label ?? '').replace(/\s*\([^)]+\)$/, '').trim() || email;
  const id = entry.value?.shareWith ?? entry.uuid ?? email;

  return { id, email, displayName, source };
}

function extractSharees(list: ShareeEntry[] | undefined, source: ShareeSource): ShareeResult[] {
  const results: ShareeResult[] = [];
  if (!Array.isArray(list)) return results;

  for (const entry of list) {
    const parsed = parseShareeEntry(entry, source);
    if (parsed) results.push(parsed);
  }
  return results;
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

  const searchParams = new URLSearchParams({
    search: trimmed,
    itemType: 'call',
    page: '1',
    perPage: String(limit),
  });

  const url = `${account.baseUrl}/ocs/v2.php/apps/files_sharing/api/v1/sharees?${searchParams.toString()}`;
  const res = await trustedFetch(url, {
    headers: {
      Authorization: basicAuth(account),
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
    },
    maxRetries: 1,
  });

  if (!res.ok) throw httpErrorFrom(res, 'fetchSharees');

  const json: ShareesResponse = await res.json();
  const data = json?.ocs?.data;
  if (!data) return [];

  const users = extractSharees(data.exact?.users, 'users').concat(extractSharees(data.users, 'users'));
  const emails = extractSharees(data.exact?.emails, 'emails').concat(extractSharees(data.emails, 'emails'));

  return [...users, ...emails];
}
