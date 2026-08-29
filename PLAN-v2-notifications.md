# V2 Notifications — Detailed Technical Plan

## 1. Goal

Move the mobile app from a polling-first model to a **server-push-first model** for calendar changes. The V2 scope is broader than CalDAV invitations: it covers any server-side calendar mutation (event created, updated, deleted, invitation response, reminders) and surfaces these changes through badges, system push notifications, an in-app notification center, and widgets.

## 2. Current state

- The app polls the server every 15 minutes (`backgroundSync.ts`) and on pull-to-refresh.
- Local event reminders are already implemented with `expo-notifications` (`scheduleAlerts.ts`).
- The new invitations screen (PR #226) reads the CalDAV `schedule-inbox` on demand.
- No server-push, WebSocket, or OCS notification integration exists yet.

## 3. Server-side notification mechanisms available

### 3.1 `notify_push` (Nextcloud Client Push)

- **Purpose**: reduce client polling by pushing "something changed" signals.
- **Server setup**: install the `notify_push` app and run `occ notify_push:setup`.
- **Discovery**: `GET /ocs/v2.php/cloud/capabilities` returns `capabilities.notify_push.websocket_url`.
- **Transport**: authenticated WebSocket. The client sends the username and app password over the socket; the server responds with `authenticated`.
- **Relevant messages**:
  - `notify_notification` — an OCS notification was created, processed, or dismissed.
  - `notify_custom` with `message: 'calendar_sync'` and `body.calendarUrl` — a calendar was modified (Nextcloud Calendar fires `CalendarObjectCreatedEvent`, `CalendarObjectUpdatedEvent`, `CalendarObjectDeletedEvent` and pushes this since v28). Verified payload: `calendar_sync {"calendarUrl":"/remote.php/dav/calendars/{user}/{calendar}/"}`.
- **Semantics**: best-effort. The server may skip a message or send a message when nothing actually changed. Clients must still poll, but at a much lower frequency.

### 3.2 OCS Notifications API

- **Endpoint**: `GET /ocs/v2.php/apps/notifications/api/v2/notifications`.
- **Filter**: `?app=calendar` to retrieve only calendar-related notifications.
- **Payload**:
  ```json
  {
    "notification_id": 61,
    "app": "calendar",
    "user": "bob",
    "datetime": "...",
    "object_type": "event",
    "object_id": "...",
    "subject": "You have been invited to Team standup",
    "subjectRich": "...",
    "message": "...",
    "link": "...",
    "actions": [...]
  }
  ```
- **Types produced by Nextcloud Calendar / event_update_notification**:
  - Received invitation.
  - Attendee accepted / declined / tentative.
  - Event updated (title, date, location, description).
  - Event deleted.
  - Reminder.
- **Dismiss**: `DELETE /ocs/v2.php/apps/notifications/api/v2/notifications/{id}`.
- **Push-to-device**: `POST /ocs/v2.php/apps/notifications/api/v2/push` registers a device token (FCM for Android, APNs for iOS). The server then sends encrypted push payloads; the device must decrypt them with its RSA private key.

### 3.3 CalDAV `schedule-inbox`

- Already used in V1 invitations.
- Remains the source of truth for pending invitations.
- `notify_push` can trigger an early re-fetch of the inbox.

## 4. Proposed UX options

| Option | What it is | Pros | Cons |
|--------|-----------|------|------|
| **A. Drawer badge only** | Show a counter on the hamburger menu / drawer entry. | Simple, non-intrusive, consistent with current UI. | Not visible when the app is closed. |
| **B. System push notifications** | Use FCM/APNS to show native notifications for invitations and event changes. | Visible everywhere, native feel, real-time. | Requires device key management, permissions, and FCM/APNS setup; more complex. |
| **C. Notification center screen** | Add a screen listing invitations + OCS notifications with quick actions. | Central place for all activity; easy to browse and act. | Adds a new entry point; may duplicate the invitations screen. |
| **D. Widget / Live Activity** | Extend the existing widget to show upcoming changes or a notification count. | Visible on home screen / lock screen. | Limited interaction; not a primary discovery surface. |

**Recommended combination**: **A + B + C**.
- Badge in the drawer for in-app awareness.
- System push notifications for high-value events (invitation, imminent change, reminder).
- Notification center screen for history and actions.

## 5. High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Nextcloud Server                         │
│  notify_push ──► WebSocket ──┐                              │
│  OCS Notifications ────────────┼──►  Mobile Client           │
│  CalDAV inbox ────────────────┘                              │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  ┌──────────┐         ┌──────────────┐       ┌──────────┐
  │ PushSync │         │ Notification │       │ CalDAV   │
  │ Manager  │         │ Store        │       │ Sync     │
  │ WebSocket│         │ (Zustand +   │       │ Engine   │
  └──────────┘         │  persist)    │       └──────────┘
        │              └──────────────┘             │
        │                     │                     │
        ▼                     ▼                     ▼
  ┌──────────────────────────────────────────────────────┐
  │                       UI Layer                        │
  │  - Drawer badge                                       │
  │  - Notification center screen                         │
  │  - System notifications (expo-notifications)          │
  │  - Widget / Live Activity refresh                     │
  └──────────────────────────────────────────────────────┘
```

## 6. Core modules

### 6.1 `PushSyncManager`

Responsibilities:
- Discover the WebSocket URL from server capabilities.
- Open and maintain one authenticated WebSocket per active account.
- Parse incoming messages:
  - `notify_notification` → trigger OCS notification fetch.
  - `calendar_sync` → trigger `syncCalendars` / `syncEvents` for the given `calendarUrl`.
- Handle reconnections with exponential backoff (5s → 5min cap).
- Suspend connection when the app goes to background; resume on foreground.

API sketch:
```ts
export type PushStatus = 'checking' | 'connected' | 'disconnected' | 'unsupported';

export function usePushSync(account: Account): PushStatus;
export function connectPush(account: Account): Promise<void>;
export function disconnectPush(account: Account): void;
```

### 6.2 `NotificationService`

Responsibilities:
- Poll `/ocs/v2.php/apps/notifications/api/v2/notifications` at a low frequency (e.g. every 15 minutes) as a fallback.
- Filter calendar-related notifications.
- Map OCS payload to an internal `ServerNotification` type.
- Dismiss notifications via `DELETE`.

API sketch:
```ts
export type ServerNotification = {
  id: number;
  app: string;
  type: 'invitation' | 'invitation_response' | 'event_updated' | 'event_deleted' | 'reminder';
  objectType: string;
  objectId: string;
  title: string;
  body: string;
  link?: string;
  timestamp: Date;
  actions: NotificationAction[];
  read: boolean;
};

export async function fetchNotifications(account: Account, since?: number): Promise<ServerNotification[]>;
export async function dismissNotification(account: Account, id: number): Promise<void>;
```

### 6.3 `NotificationStore`

Responsibilities:
- Store unread and recent notifications locally.
- Provide `unreadCount` for the drawer badge.
- Mark items as read / dismiss them.
- Merge CalDAV invitations with OCS notifications in the notification center.

### 6.4 `PushNotificationService`

Responsibilities:
- Generate an RSA-2048 key pair on first launch.
- Get the FCM / APNs push token.
- Register the device with Nextcloud: `POST /ocs/v2.php/apps/notifications/api/v2/push`.
- Decrypt incoming push payloads with the private key.
- Display local notifications with `expo-notifications`.

API sketch:
```ts
export async function registerPushDevice(account: Account): Promise<void>;
export async function handleRemotePush(payload: Record<string, unknown>): Promise<void>;
export async function unregisterPushDevice(account: Account): Promise<void>;
```

### 6.5 `NotificationCenterScreen`

Responsibilities:
- List pending CalDAV invitations and recent OCS notifications.
- Group by date.
- Provide quick actions:
  - Accept / Decline / Maybe for invitations.
  - Open event detail for updates.
  - Dismiss for OCS notifications.
- Pull-to-refresh.

## 7. Data flow

### 7.1 Receiving an invitation

1. Organizer creates an event and adds the user as attendee.
2. Nextcloud puts a `METHOD:REQUEST` message in the user's CalDAV inbox.
3. Nextcloud creates an OCS notification (`invitation`).
4. `notify_push` sends `notify_notification` to the client.
5. Client fetches OCS notifications and the CalDAV inbox.
6. Client displays:
   - system push notification (if enabled),
   - drawer badge +1,
   - entry in notification center.

### 7.2 Event updated by someone else

1. Organizer edits a shared event.
2. Nextcloud Calendar fires `CalendarObjectUpdatedEvent`.
3. `notify_push` sends `calendar_sync` with the calendar URL.
4. Client syncs the affected calendar.
5. Client displays an OCS notification (`event_updated`) if `event_update_notification` is installed.
6. Client shows a system notification and/or a notification center entry.

### 7.3 Reminder

1. Nextcloud `dav` background job decides a reminder is due.
2. Nextcloud sends an OCS notification and a push.
3. Client displays the reminder as a local/system notification.

## 8. Implementation phases

### Phase 1 — Feasibility & scoping
- [x] Verify `notify_push` is installed and configured on target servers (Docker test instance done; `cloud.sipc-cgt.fr` pending).
- [x] Verify `nextcloud/calendar` emits `calendar_sync` messages on the target Nextcloud version (verified on NC 34.0.3 + Calendar 6.5.4).
- [ ] Verify `event_update_notification` availability or native calendar notification types.
- [ ] Choose the final UX combination with maintainers.

### Phase 2 — `notify_push` WebSocket integration
- [x] Add `src/services/push/notifyPush.ts` for capability discovery and WebSocket connection.
- [x] Implement `PushSyncManager` with reconnection and lifecycle handling.
- [x] Wire `calendar_sync` messages into `syncCalendarByUrl` / `syncCalendars`.
- [x] Wire `notify_notification` messages into `NotificationService.fetchNotifications`.
- [x] Tests: unit tests for message parsing; emulator test for connection lifecycle.

### Phase 3 — OCS Notifications integration
- [x] Implement `src/services/nextcloud/notifications.ts`.
- [x] Create `ServerNotification` type and `NotificationStore` (Zustand + persist).
- [x] Add drawer / hamburger badge using the store's `unreadCount`.
- [x] Add tab bar badge on `Notifications` tab.
- [x] Add notification center tab `app/(tabs)/notifications`.
- [x] Tests: mock OCS endpoint; verify filtering and dismissal.

### Phase 4 — System push notifications
- [x] Configure `expo-notifications` for remote push on iOS and Android.
- [x] Implement device key generation (`jsencrypt`/`js-sha512`) and registration with Nextcloud.
- [x] Decrypt and display remote push payloads.
- [x] Configure FCM (`google-services.json`) and APNs / EAS placeholders in `app.config.ts`.
- [x] Add `isPushAvailable` and v2/v3 registration fallback.
- [x] Add notification permissions hook.
- [x] Tests: unit tests for crypto, registration, and message handler.

### Phase 5 — Notification center UI
- [x] Create `app/(tabs)/notifications/index.tsx`.
- [x] Render OCS notifications with dismiss action.
- [ ] Render CalDAV invitations with quick actions.
- [x] i18n (en, fr, de, es, it, nl, oc, pt, ru).
- [ ] Tests: React Native testing library.

### Phase 6 — Widget / Live Activity integration
- [ ] Update `backgroundSync.ts` to react to `calendar_sync` and push refresh the widget.
- [ ] Extend widget UI to show notification count or next pending invitation.
- [ ] Extend Live Activity for iOS.
- [ ] Tests: widget snapshot tests where applicable.

### Phase 7 — Fallback, settings, and documentation
- [ ] Keep the 15-minute background sync as a fallback.
- [x] Add settings toggle for push notifications.
- [ ] Add settings for notification types and reminder behavior.
- [ ] Update `AGENTS.md` with the new architecture and commands.

## 11. FCM / APNS setup

### Android (FCM)

1. Create a Firebase project and add an Android app with package `com.soluce.nextcloudcalendar`.
2. Download `google-services.json` and place it at the repo root.
3. Build a development build (`eas build --profile development`).
4. The app calls `expo-notifications.getDevicePushTokenAsync()` to get an FCM token.
5. `registerPushNotifications()` sends the SHA-512 hash and RSA public key to Nextcloud, then to `push-notifications.nextcloud.com`.

### iOS (APNs)

1. In Apple Developer, enable Push Notifications for App ID `com.soluce.nextcloud-calendar`.
2. Create an APNs Auth Key (.p8) or certificates and upload them to EAS.
3. Configure `eas.json` with the proper credentials.
4. Build a development build (`eas build --profile development --platform ios`).
5. iOS returns an APNs token from `getDevicePushTokenAsync()`; the same registration flow applies.

### Notes

- Expo Go does not support remote push since SDK 53; a development build is required.
- `google-services.json` and `GoogleService-Info.plist` are in `.gitignore` and must not be committed.

## 9. Options for maintainers to validate

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Primary UX | A. Drawer badge only<br>B. Badge + push<br>C. Badge + push + notification center<br>D. Widget only | **C** |
| 2 | Push transport | A. `notify_push` WebSocket only (no FCM/APNS)<br>B. WebSocket + FCM/APNS via Nextcloud push registration<br>C. Polling only (status quo) | **B in the long term, A as an MVP** |
| 3 | Notification persistence | A. WatermelonDB table `notifications`<br>B. Zustand + AsyncStorage<br>C. No persistence, fetch on every open | **A** |
| 4 | Initial scope | A. Invitations only<br>B. Invitations + event updates<br>C. Invitations + updates + reminders | **B for V2, C later** |
| 5 | Integration with V1 | A. Refactor V1 invitations to share `NotificationStore`<br>B. Keep V1 invitations independent | **A** to avoid duplication |

## 10. Pros and cons analysis

### Advantages

1. **Real-time feel**: users see invitations and event changes much faster than with 15-minute polling.
2. **Server efficiency**: fewer aggressive CalDAV syncs; the server pushes only when something changes.
3. **Better UX**: system notifications, badge, and notification center make users less likely to miss important calendar changes.
4. **Future-proof**: the same `notify_push` and OCS infrastructure can support other features (Talk, file shares, tasks).
5. **Offline support**: persisting notifications locally lets users see what happened while they were offline.

### Disadvantages / Risks

1. **Server dependency**: `notify_push` must be installed and correctly configured. Older Nextcloud instances may not support `calendar_sync` messages.
2. **Battery and data**: maintaining a WebSocket and push registration consumes more resources than periodic polling, especially on Android.
3. **Complexity**: encryption, device key management, FCM/APNS setup, and lifecycle handling add significant code and maintenance surface.
4. **Best-effort semantics**: `notify_push` does not guarantee delivery. Polling must remain, so the benefit is latency reduction, not elimination of polling.
5. **Fragmentation on Android**: devices without Google Play Services (e.g. some Chinese ROMs) cannot receive FCM. A WebSocket fallback or UnifiedPush could be needed later.
6. **Privacy**: push payloads contain encrypted subjects, but the device still needs to register with the server and with Google/Apple push services.

## 11. Open questions

1. Is `notify_push` installed on `cloud.sipc-cgt.fr` and the test Docker instance?
2. What is the target minimum Nextcloud version for this app? `calendar_sync` support starts at Nextcloud 28.
3. Is `event_update_notification` installed on production, or do we rely on native calendar notifications?
4. Do we support devices without Google Play Services? If so, do we need a UnifiedPush fallback?
5. Should the notification center replace the standalone `Invitations` screen, or be a separate screen that includes it?
6. What is the desired fallback sync interval once `notify_push` is enabled? 15 min? 60 min?

## 12. Next step

Validate the feasibility and the UX options with the maintainers. Once decisions 1–5 are confirmed, start Phase 2 with a small proof-of-concept: connect to `notify_push`, receive one `calendar_sync` message, and trigger a CalDAV sync.
