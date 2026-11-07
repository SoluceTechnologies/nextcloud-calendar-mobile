# PR5 — Voice assistant scenarios: event description & location

Covers what the assistant does with `DESCRIPTION` and `LOCATION` on an
event — both directions: **writing** them through a create command, and
**reading/summarising** them back.

Setup: Android emulator, release APK from `feat/voice-per-account`, two
accounts — Test User on `http://10.0.2.2:8080` (no Context Agent) and
ARASABruno on `https://cloud.sipc-cgt.fr` (agent available). Typed input
everywhere: the intent path is what matters. Reference events are injected
directly over CalDAV so the read tests are deterministic.

Code facts known beforehand:
- `parseUtterance` extracts summary/start/end/names/calendarName only — no
  description, no location (`à/au/chez` are title-trimming fillers).
- `inputFromCreateIntent` never sets `description`/`location`.
- `buildBriefing`/`buildReminderBriefing` never speak them either.
- The freeform tier delegates to the Context Agent **server-side** — only
  accounts on a server with `core:contextagent:interaction` can write or
  read these fields.
- DB/sync layer fully round-trips both fields — the gap is voice-only.

## W1 — Local create with a place clause (« au bureau »)

1. Account = Test User. Voice sheet → type: `crée rdv client demain à 14h au bureau`
2. Read the confirm card title carefully.
3. **Confirmer** → GET the created `.ics` over CalDAV.

Watch for: is `au bureau` kept in the title, silently trimmed, or — the
correct outcome — mapped to `LOCATION`? Any answer other than LOCATION is
the gap being measured.

Evidence: `W1-confirm-card.png`, `W1-ics.png`.

## W2 — Local create with an explicit description clause

1. Voice sheet → type: `crée réunion équipe jeudi à 10h description apporter les documents`
2. Confirm card → **Confirmer** → GET the `.ics`.

Watch for: `description …` should map to `DESCRIPTION`; expected actual is
the clause being swallowed into `SUMMARY` or dropped.

## W3 — « chez / salle » place phrasing

1. `crée rdv chez le dentiste mardi à 9h`
2. `crée réunion salle B vendredi à 15h`

Watch for: « chez le dentiste » legitimately belongs in the title; « salle
B » is ambiguous — documents what the parser keeps today so a future
`location:` field has a defined contract.

## W4 — Freeform create with description (prod only)

1. Switch to ARASABruno (server has Context Agent).
2. `crée un événement point hebdo vendredi à 9h avec pour description ordre du jour envoyé par mail`
3. Check prod web UI → DESCRIPTION field.

Watch for: the agent acts server-side; verify whether it writes the
description at all and whether the resulting event syncs back locally with
`description` populated (round-trip through `database/sync.ts`).

## R1 — Agenda reading skips/keeps description + location

Seed over CalDAV on `test/personal` (done before opening the app):

```ics
BEGIN:VEVENT
UID:desc-loc-seed-1
DTSTART:<demain>140000Z
DTEND:<demain>150000Z
SUMMARY:rdv desc test
LOCATION:Salle B\, bâtiment 3
DESCRIPTION:Apporter le contrat signé et la pièce d'identité
END:VEVENT
```

1. Account = Test User → force a sync (pull the grid down).
2. Voice sheet → `quel est mon agenda demain`

Expected today: the reply speaks title + time only. Document whether
`LOCATION`/`DESCRIPTION` are absent — and decide if that is a product
choice or a gap (the text is already in the DB, so reading is cheap).

## R2 — Next-event briefing

1. Same seed event.
2. `mon prochain événement` → check the reminder card + spoken text.

## R3 — Freeform read (prod only)

Seed the same kind of event on the prod account, then:
1. `lis la description de rdv desc test`
2. `où se passe rdv desc test`

Watch for: does the Context Agent answer with the actual DESCRIPTION /
LOCATION, or fall back to a generic reply?

## R4 — Edit form baseline

Same seed event → open it in the edit form.
Baseline check: form fields show DESCRIPTION + LOCATION (proves the data
survived sync — isolates the gap to the voice layer only).

## Result matrix

| # | Path | Field | Result | Notes |
|---|------|-------|--------|-------|
| W1 | local create | location | ✗ dropped | `cree rdv client demain a 14h au bureau` → `SUMMARY:rdv client`, « au bureau » silently trimmed, no `LOCATION` in the .ics |
| W2 | local create | description | ✗ dropped | `… description apporter les documents` → `SUMMARY:reunion equipe`, clause swallowed, no `DESCRIPTION` |
| W3 | local create | location (ambiguous) | ~ kept in title | `chez le dentiste` stays in the title (« rdv chez le dentiste ») — reasonable, still no `LOCATION` |
| W4 | freeform (agent) | description write | ~ multi-turn | task 293 `STATUS_SUCCESSFUL` via direct API — but the agent replies with a **clarifying question** (« Dans quel calendrier ? ») instead of acting; turn 2 (task 296, `conversation_token` replayed) `STATUS_FAILED` — token continuation is not resumable this way on NC 35 |
| R1 | agenda | description+location read | location ✓ / description ✗ | « À 15 h : rdv desc test, pendant une heure, **Salle B, bâtiment 3** » — location spoken, description never |
| R2 | next | description+location read | location ✓ / description ✗ | same `locationClause` behaviour |
| R3 | freeform (agent) | description+location read | ~ multi-turn | task 276 `STATUS_SUCCESSFUL` via direct API — found « Rdv desc prod » but answered only title+date, then *offered* to fetch description/location; turn 2 (task 297) `STATUS_FAILED` like W4 — the actual field values never came back |
| R4 | UI baseline | — | ✓ | event detail shows Lieu « Salle B, bâtiment 3 » + Description « Apporter le contrat signé… » — data round-trips, gap is voice-only |

## Agent latency finding (prod, 2026-11-07)

The freeform path works mechanically — tasks reach `context_agent`, tools
run — but a query needing calendar tools is **unusably slow** on this
server:

- Each LLM step = a `core:text2text:chatwithtools` subtask serialized
  through the taskprocessing cron worker (~40–80 s/step) on top of Mistral
  free-tier inference time.
- `ministral-14b` then *interpreted* « rdv desc prod » as « rendez-vous
  sur la description des produits » instead of a literal title match; its
  `search_calendar_events` (`limit:1`) missed → the model wandered into
  list_tasks / Talk messages / repeated searches — 10+ steps, task 276
  still `STATUS_RUNNING` after 15 min, while the app gave up with
  « Le serveur n'a pas répondu ».
- Net: freeform answers that need a calendar lookup exceed both the app's
  patience and the flaky emulator WiFi; tool-free replies stay fast.

Consequence for the voice feature: description/location are only ever
reachable through the slow agent tier — and even there the agent treats
them as **multi-turn clarifications**. The app does resend the stored
`conversation_token` on the next `askAgent`, but the continuation task
fails (`STATUS_FAILED`, verified via direct API on tasks 296/297), so a
clarifying question can never be answered. Local intents were the missing
path.

## Implementation — `feat/voice-desc-loc`

Local voice intents now read AND write both fields, deterministically and
without the agent:

**Write (`create` intent)**
- `location` — extracted from the clause AFTER the last datetime moment:
  « …demain à 14h **au bureau** » → `LOCATION:bureau`; `salle`/`room` keep
  their word (« …15h **salle B** » → `LOCATION:salle B`). A place clause
  *before* the date (« chez le dentiste mardi … ») stays in the title —
  deliberate, it's the natural title.
- `description` — explicit marker anywhere: « **description** X »,
  « **avec la note** X », « **détails** X », "with **description** X".
  Runs to the next moment or end of utterance; bounded by calendar/name
  clauses so « …avec Marc dans agenda pro description X » extracts all
  four fields correctly.
- `inputFromCreateIntent` passes both to `CreateEventInput` — the existing
  ICS writer + sync round-trip them unchanged (verified by R4).
- The confirm card appends `Lieu : …` / `Description : …` lines when
  present (new keys `voice.confirmLocation`/`confirmDescription` ×9
  locales), so the extracted fields are visible before confirming.

**Read (`details` intent — new)**
- « **lis la description de** X », « **où se passe** X », « **détails de** X »,
  "**where is** X", "**read the description of** X" → `findEventTargets`
  (same resolver as move/delete) → `buildDetailsBriefing` speaks title,
  date, time, duration, location, attendees **and description** (« Pas de
  description » when empty). Read-only — no confirmation card, reuses the
  multi-match disambiguation candidates.
- Agenda/next-event briefings deliberately stay terse — description is
  only read on targeted queries, not on every agenda item.

Coverage: 14 new parser assertions + 2 `inputFromCreateIntent` passthrough
tests + 4 `buildDetailsBriefing` tests; full suite 1546 green, tsc clean.
