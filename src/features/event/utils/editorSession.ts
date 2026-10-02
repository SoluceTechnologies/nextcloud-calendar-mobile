/**
 * Hand-off slot for a pre-minted one-time Direct Editing URL (from
 * `directEditing/create`). Kept out of route params on purpose: params
 * survive navigation-state restoration, but a consumed token is dead — a
 * restored screen must fall back to requesting a fresh `open` URL.
 * Process death simply drops the pending URL, which is the desired reset.
 */
let pendingUrl: string | null = null;

export function setPendingEditorUrl(url: string): void {
  pendingUrl = url;
}

/** Reads and clears the pending URL (consumed once). */
export function takePendingEditorUrl(): string | null {
  const url = pendingUrl;
  pendingUrl = null;
  return url;
}
