# V2 Notifications — Code Overview

> **Status: PROTOTYPE** — This branch implements new notification features. Only the new
> functionality has been tested (unit tests + manual scenario on Android emulator).
> No regression testing has been performed on the rest of the codebase.
> Do not merge to `main` without a full review and regression test pass.

## What this branch adds

### 1. OCS Notifications API (`src/services/nextcloud/notifications.ts`)

Fetches calendar notifications from the Nextcloud OCS API:
- `GET /ocs/v2.php/apps/notifications/api/v2/notifications` — list notifications
- `DELETE /ocs/v2.php/apps/notifications/api/v2/notifications/{id}` — dismiss one
- `DELETE /ocs/v2.php/apps/notifications/api/v2/notifications` — dismiss all

Notifications are filtered to `app === 'calendar' || app === 'event_update_notification'`.

### 2. Notification Store (`src/stores/notificationStore.ts`)

Zustand store with persist middleware. Key behaviors:
- `setNotifications()` — replaces the full list (server-side dismissals are reflected), preserves `seen` status for existing entries
- `markAsSeen()` / `markAllSeen()` — marks notifications as read, updates badge
- `removeNotification()` — removes one locally after server-side dismissal
- `updateBadgeCount()` — called on every mutation, delegates to `setAppBadge()`

### 3. Notification Polling (`src/hooks/useNotifications.ts`)

Polls the OCS API every 60 seconds when an account is active. Uses `setNotifications`
(not `addOrUpdateNotifications`) so that server-side dismissals are properly reflected.

### 4. NotifyPush WebSocket (`src/services/push/notifyPush.ts`)

Real-time push client using the Nextcloud NotifyPush server:
- Connects to `wss://<server>/push/ws/v2`
- Authenticates with device ID + app password
- Receives `notify_notification` messages that trigger an immediate notification refresh
- Auto-reconnects with backoff on disconnect

### 5. Push Crypto (`src/services/push/pushCrypto.ts`)

Implements the Nextcloud push encryption protocol:
- Device key generation (Curve25519 / ECDH)
- Shared secret derivation with server public key
- AES-256-GCM decryption of push payloads
- Used by `PushSyncManager` to decrypt incoming push messages

### 6. Push Registration (`src/services/push/pushRegistration.ts`)

Registers the device with the Nextcloud Push API:
- `POST /ocs/v2.php/apps/notifications/api/v2/push` — registers device token + public key
- Stores the push token and subscription ID for later unregistration
- Platform-specific token retrieval (FCM for Android, APNS for iOS)

### 7. Push Sync Manager (`src/services/push/PushSyncManager.ts`)

Orchestrates the push flow:
1. Registers the device for push notifications
2. Connects the NotifyPush WebSocket
3. On incoming push message: decrypts, then triggers notification refresh + calendar sync

### 8. Notification Center (`src/features/notifications/NotificationCenter.tsx`)

UI component for the Notifications tab:
- FlatList of calendar notifications
- Each item shows: type chip (Created/Updated/Deleted/Invited/Response) + subject + relative time + event time
- Type is parsed from `subjectRich` template (e.g. `{actor} updated {event}` → "Updated")
- Tapping a notification navigates to `/event/{uid}` using `subjectRichParameters.event.id`
- Dismiss button calls the OCS DELETE API and removes locally
- `useFocusEffect` marks all as seen when the tab is opened

### 9. App-Icon Badge (`src/features/notifications/appBadge.ts`)

Cross-platform app-icon badge:
- **iOS**: `Notifications.setBadgeCountAsync(count)` — native iOS badge
- **Android**: Posts a silent, sticky notification on a dedicated channel
  (`app-badge`) with `showBadge: true`. The launcher reads the notification
  count from the channel and displays a badge on the app icon automatically.
  When count = 0, the notification is dismissed.

### 10. In-App Badge (`app/(tabs)/_layout.tsx`, `CalendarTopBar.tsx`)

- **Notifications tab**: `tabBarBadge` shows the unread count
- **Hamburger menu** (CalendarTopBar): red dot with unread count on the menu icon

### 11. Settings Toggle (`src/features/settings/components/NotificationSettings.tsx`)

- "Push notifications" toggle — enables/disables push registration and WebSocket
- "Live activity" toggle — for ongoing event notifications (existing feature)
- Toggle state persisted in `settingsStore`

### 12. Localization (`src/locales/*.json`)

New keys added to all 9 locales:
- `notifications.type.*` (created, updated, deleted, invited, response, unknown)
- `notifications.badgeTitle` / `badgeTitle_other` (pluralization)
- `settings.notifications.badgeChannelName`

## Files changed

| Area | Files |
|------|-------|
| Services | `notifications.ts`, `notifyPush.ts`, `pushCrypto.ts`, `pushRegistration.ts`, `PushSyncManager.ts`, `pushMessageHandler.ts`, `types.ts` |
| Stores | `notificationStore.ts`, `settingsStore.ts` |
| Hooks | `useNotifications.ts`, `usePushNotifications.ts`, `usePushSync.ts` |
| UI | `NotificationCenter.tsx`, `appBadge.ts`, `NotificationSettings.tsx`, `CalendarTopBar.tsx`, `_layout.tsx` |
| Config | `app.config.ts`, `jest.setup.js`, `tsconfig.json`, `package.json` |
| Tests | `notifications.test.ts`, `notifyPush.test.ts`, `pushCrypto.test.ts`, `pushRegistration.test.ts`, `notificationStore.test.ts` |
| Locales | `en.json`, `fr.json`, `de.json`, `es.json`, `it.json`, `nl.json`, `oc.json`, `pt.json`, `ru.json` |

## Known limitations (prototype)

1. **No regression testing**: Only new notification features were tested. Existing
   calendar, settings, and sync functionality was not re-verified.
2. **Android-only manual test**: The scenario was tested on an Android emulator.
   iOS push (APNS) and badge were not manually tested.
3. **NotifyPush server**: The WebSocket connection requires a NotifyPush server
   running on the Nextcloud instance. If not available, the app falls back to
   60s polling.
4. **Push token registration**: FCM token retrieval requires a valid
   `google-services.json`. If missing, push registration is skipped (polling still works).
5. **Notification type detection**: Types are inferred from `subjectRich` string
   matching (e.g. "updated", "created", "deleted"). This may need adjustment if
   Nextcloud changes the template strings.
6. **No notification grouping**: Multiple notifications for the same event are
   shown as separate entries. Grouping could be added in a future iteration.
