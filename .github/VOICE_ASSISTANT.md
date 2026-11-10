# Voice Assistant & Siri — User Guide

The app ships an optional voice assistant plus native iOS Siri integration. Everything below is opt-in and off by default — turn it on in **Settings → Voice assistant**.

## In-app voice assistant

Tap the microphone in the calendar top bar (or Settings → Voice assistant → Open). Speak naturally in English or French — for example:

- *"What's my day like?"* / *"C'est quoi mon programme ?"*
- *"Next meeting"* / *"Prochain rendez-vous"*
- *"Lunch with Emma tomorrow at noon"*
- *"Move my dentist appointment to Friday 3 pm"*
- *"Delete the standup on Thursday"*
- *"Find me an hour with Alex next week"*

### Two processing tiers

- **Local intents** — the commands above are parsed on-device and run against your locally synced calendars. They work **offline** on cached data; mutations queue and replay on reconnect.
- **Context Agent** — anything the local parser doesn't handle is sent to your Nextcloud server's **Context Agent** (TaskProcessing). This requires the Nextcloud **Assistant** and **Context Agent** apps plus a configured AI provider on your instance. Without them, free-form requests gracefully report that the server can't answer.

Every create/move/delete always shows a **confirmation card** — nothing mutates your calendar without an explicit tap.

### Privacy: on-device speech recognition

Settings → Voice assistant → **On-device recognition** requests that speech recognition run locally (iOS 17+ / Android 13+ with the offline model downloaded). If your device or language doesn't support it, recognition falls back to the platform's network service — the setting shows the unsupported state so there is no silent surprise. The assistant and free-form agent replies always need network for the server tier, but local commands don't.

## Siri & App Shortcuts (iOS)

App Shortcuts are registered at install — no setup needed. Just ask Siri:

| Phrase | What it does |
|---|---|
| *"Agenda du jour dans Nextcloud Calendar"* / *"Today's agenda in Nextcloud Calendar"* | Siri reads today's agenda aloud from the app's shared snapshot |
| *"Prochain rendez-vous dans Nextcloud Calendar"* / *"Next event in Nextcloud Calendar"* | Siri announces your next event |
| *"Demande à Nextcloud Calendar …"* / *"Ask Nextcloud Calendar …"* | Opens the assistant with your question injected — routed to the Context Agent like a typed query |
| *"Nouvel événement dans Nextcloud Calendar"* / *"New event in Nextcloud Calendar"* | Opens a **pre-filled** event form — you review and save |

Notes:

- Read intents only answer while the voice assistant is enabled in settings.
- The snapshot Siri reads is refreshed every time the widget timeline syncs.
- Creation is never silent — Siri only pre-fills the form; saving stays manual.
- These phrases work **hands-free, including in CarPlay** ("Hey Siri, agenda du jour dans Nextcloud Calendar").

## CarPlay

**Already works today, two ways:**

1. **Siri + the app's shortcuts** — all phrases above, hands-free.
2. **Zero-code native path** — add your Nextcloud account in iOS **Settings → Calendar → Accounts → Add Account → Other → Add CalDAV Account** (server: `https://<your-nextcloud>/remote.php/dav`). Your events then appear in Apple Calendar → shown in the CarPlay Dashboard, and Siri can read/create basic events natively. The app adds what the native path can't: the Context Agent, attendee free/busy, multi-account visibility.

**Not yet available:** a dedicated CarPlay conversational app (iOS 26.4 "voice-based conversational" category). It requires a special Apple entitlement whose approval is pending — see the linked PR for status.

## Android

- The in-app assistant works on Android exactly as on iOS.
- **Android Auto has no integration**: Google offers no public API for third-party conversational apps on Android Auto (App Actions deprecated, Gemini is Google-first-party only). Nothing is claimable here today — this is a platform limitation, not a missing feature.
