import type { Account } from '@/types';

export interface AccountProfilePatch {
  displayName?: string;
  email?: string;
}

export type AccountField = keyof AccountProfilePatch | 'appPassword' | 'username';

export type FieldErrorCode = 'required' | 'invalidEmail' | 'accountMismatch';

export type FieldErrors = Partial<Record<AccountField, FieldErrorCode>>;

export class AccountFieldError extends Error {
  readonly fields: FieldErrors;

  constructor(fields: FieldErrors) {
    super(`Invalid account fields: ${Object.keys(fields).join(', ')}`);
    this.name = 'AccountFieldError';
    this.fields = fields;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalize(value: string | undefined): string | undefined {
  return value === undefined ? undefined : value.trim();
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function isAccountEnabled(accountId: string, disabledIds: string[]): boolean {
  return !disabledIds.includes(accountId);
}

/** Accounts visible in the merged calendar view. */
export function enabledAccounts<T extends { id: string }>(accounts: T[], disabledIds: string[]): T[] {
  return accounts.filter((a) => isAccountEnabled(a.id, disabledIds));
}

/** True if disabling `accountId` would leave the app with zero enabled accounts. */
export function isLastEnabledAccount(
  accountId: string,
  accounts: { id: string }[],
  disabledIds: string[],
): boolean {
  return enabledAccounts(accounts, disabledIds).every((a) => a.id === accountId);
}

/** Account to promote as active when the current one gets disabled or removed. */
export function nextActiveAccountId(
  accounts: { id: string }[],
  disabledIds: string[],
): string | null {
  return enabledAccounts(accounts, disabledIds)[0]?.id ?? null;
}

export function diffProfile(account: Account, patch: AccountProfilePatch): AccountProfilePatch {
  const changes: AccountProfilePatch = {};
  const displayName = normalize(patch.displayName);
  const email = normalize(patch.email);
  if (displayName !== undefined && displayName !== account.displayName) {
    changes.displayName = displayName;
  }
  if (email !== undefined && email !== (account.email ?? '')) {
    changes.email = email;
  }
  return changes;
}

export function validateProfilePatch(patch: AccountProfilePatch): FieldErrors | null {
  const errors: FieldErrors = {};

  if (patch.displayName !== undefined && !patch.displayName.trim()) {
    errors.displayName = 'required';
  }

  const email = normalize(patch.email);
  if (email && !EMAIL_RE.test(email)) {
    errors.email = 'invalidEmail';
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
