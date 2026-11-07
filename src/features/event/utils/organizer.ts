import type { Account } from '@/types';

// ORGANIZER's mailto must match an entry in the account's CalDAV
// calendar-user-address-set, otherwise the server's scheduling broker drops
// the invitation entirely (no inbox object, no iMIP mail). A username like
// 'ARASABruno' is NOT a registered address — only emit well-formed emails.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function resolveOrganizer(account: Account): { organizerEmail: string; organizerName: string } {
  const candidates = [account.email, account.username.includes('@') ? account.username : undefined];
  const organizerEmail = candidates.find((e) => e && EMAIL_RE.test(e))
    ?? `${account.username}@${new URL(account.baseUrl).hostname}`;
  return { organizerEmail, organizerName: account.displayName };
}
