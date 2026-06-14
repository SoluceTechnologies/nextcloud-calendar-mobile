/**
 * Centralized React Query timing config.
 * Single source of truth for staleness / GC / refetch cadence so behavior is
 * consistent across hooks and easy to tune.
 */

const MIN = 60 * 1000;

/** Calendar list (ctags). Changes only when calendars are added/edited server-side. */
export const CALENDARS_STALE = 5 * MIN;
export const CALENDARS_REFETCH_INTERVAL = 5 * MIN;

/**
 * Near-live freshness: how often to poll calendar ctags. The ctag fetch is a
 * single cheap PROPFIND (no event data, no ICS parse). The expensive events
 * query is refetched only when a ctag actually changes (see calendar/index.tsx),
 * so this stays light. Foreground-only — paused while backgrounded via
 * focusManager. Tune here if 5s is too aggressive for a given deployment.
 */
export const CALENDARS_LIVE_POLL = 5 * 1000;

/** Event queries. Kept fresh-ish; explicitly invalidated on mutation. */
export const EVENTS_STALE = 2 * MIN;

/** Subscribed (external ICS) calendars — remote, slow-changing. */
export const SUBSCRIBED_EVENTS_STALE = 30 * MIN;

/** Avatar images — rarely change. */
export const AVATAR_STALE = 30 * MIN;
export const AVATAR_GC = 60 * MIN;

/** Global cache retention for the AsyncStorage persister. */
export const DEFAULT_GC = 7 * 24 * 60 * MIN;
export const DEFAULT_STALE = 5 * MIN;
