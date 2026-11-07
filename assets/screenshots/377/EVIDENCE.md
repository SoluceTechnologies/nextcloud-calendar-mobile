# Issue #377 — Availability (TRANSP) & Status (STATUS) — Validation evidence

## Scope

Add `TRANSP` (opaque/busy vs transparent/free) and `STATUS` (confirmed /
tentative / cancelled) support: parse → persist → serialize → UI, following the
existing `partstat` (invitations) pattern.

Commits on `feat/event-transp-status` (based on `origin/dev`):

- `b0024aa` — data layer: types, WatermelonDB columns + migration 9→10, ICS
  parse/serialize (RFC defaults not emitted), sync/write mapping, fingerprint.
- `d91a1ef` — UI layer: two `Select` pickers in EventForm, detail rows,
  agenda/month-grid visual treatment, i18n ×9 locales, focused tests.

## Environment

- Emulator: `emulator-5554` (AVD `nc-cal-api36`, API 36, no KVM — software
  rendering, very slow)
- Build: dev-client APK installed, JS served from Metro `expo start
  --dev-client` on this branch (`Android Bundled 41762ms … entry.js`)
- Locale under test: fr-FR

## Gates

- `yarn tsc --noEmit` — clean (Phase 1 + Phase 2)
- `yarn jest __tests__/utils __tests__/database __tests__/features/event
  __tests__/components __tests__/app` — 48 suites / ~428 tests green
- `__tests__/i18n/parity.test.ts` — all 9 locales complete

## On-device validation

### DB migration

```
[🍉] [SQLite] Database needs migrations
[🍉] [SQLite] Migrating from version 9 to 10...
[🍉] [SQLite] Migration successful
```

`sqlite3` on the pulled `watermelon.db` confirms `transp` and `status` columns
exist on `events`.

### Create event with non-default values

1. Form shows **Disponibilité** (`Occupé`/`Libre`) and **Statut**
   (`Confirmé`/`Provisoire`/`Annulé`) selects below Alertes.
2. Created `Test-Tentative-377` with Libre + Provisoire.
3. Pulled DB row: `transp=transparent`, `status=tentative` →
   **values persisted end-to-end** (form → CreateEventInput → WatermelonDB).

### Edit event

4. Reopened the event: pickers pre-seeded **Libre / Provisoire** from
   `initialValues`.
5. Changed Statut → **Annulé**; DB row updated `status=cancelled` →
   **edit write-path persists both fields**.

### Visual treatment

6. Detail screen rows: `Statut — Provisoire` (Info icon) / `Annulé` (Ban
   icon), `Disponibilité — Libre` (EyeOff icon).
7. Cancelled title **struck through** on the detail header.
8. Agenda rows: tentative → **italic**; cancelled → **struck through +
   dimmed**, both visible side-by-side in the same list.

### Defaults do not spam ICS (unit level)

`ics.test.ts`: `STATUS:CONFIRMED` / `TRANSP:OPAQUE` are never emitted
(RFC defaults); `TENTATIVE`/`CANCELLED`/`TRANSPARENT` round-trip parse ↔
serialize, including recurrence-override precedence. Server round-trip not
exercised here (no Nextcloud in emulator env); covered by e2e layer design.

## Screenshots

| File | Shows |
|---|---|
| `01-form-default.png` | New-event form, both pickers at defaults |
| `02-availability-options.png` | Availability select open (Occupé/Libre) |
| `03-status-options.png` | Status select open (Confirmé/Provisoire/Annulé) |
| `04-agenda-tentative-italic.png` | Agenda: tentative event in italic |
| `05-detail-tentative.png` | Detail: Statut=Provisoire + Disponibilité=Libre |
| `06-detail-cancelled.png` | Detail: cancelled, title struck through |
| `07-agenda-tentative-vs-cancelled.png` | Agenda: italic vs struck side-by-side |
| `08-edit-initial-values.png` | Edit form seeded with Libre/Provisoire |

## Penpot

Page `11 · Implemented` created in the project file — boards
`Screen / Event · Form — availability & status (#377)` and
`Screen / Event · Detail — cancelled (#377)` mirror the shipped UI (proposal
boards stay on `08 · Epic proposals`).

## Known limitations / env issues

- **No KVM**: emulator is extremely slow; WatermelonDB writes queue behind
  sync and one `insertEvents` call hit the 15 s safe-write timeout during a
  sync burst — a retry persisted fine. Not a code issue (queue contention
  under software rendering); watch on real device.
- `Cannot connect to Expo CLI` warning: harmless, dev-tools socket vs LAN IP.
- **iOS not validated** — no macOS/simulator; SwiftUI-independent change so
  risk is low, but widgets consuming `CalendarEvent` should get an iOS look.
- Server-side round-trip (CalDAV PUT/GET) not exercised here; ICS-level
  behavior is covered by unit tests.
