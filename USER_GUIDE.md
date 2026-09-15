# Nextcloud Calendar Mobile — User Guide

## Table of contents

1. [Getting started](#getting-started)
2. [Calendar views](#calendar-views)
3. [Find a time / Free-Busy](#find-a-time--free-busy)
4. [Creating and editing events](#creating-and-editing-events)
5. [Attendees and invitations](#attendees-and-invitations)
6. [Calendars and accounts](#calendars-and-accounts)
7. [Widgets](#widgets)
8. [Settings](#settings)

---

## Getting started

### Connect your Nextcloud account

1. Open the app and tap **Add account**.
2. Enter your Nextcloud server URL.
3. Sign in with your username and an **app password** (recommended) or your main password.
4. Choose which calendars to sync.

The app stores your credentials securely and syncs events to a local WatermelonDB database so you can browse offline.

### First sync

After login, the calendar view fetches your events. Pull down on any calendar view to force a refresh.

---

## Calendar views

Switch between views from the top bar or the view selector:

- **Month** — full month overview.
- **Week** — 7-day scrollable view.
- **3-Day** — compact multi-day view.
- **Day** — single-day detail view.
- **Schedule / Agenda** — chronological list of events.

Tap a day in month view to jump to that day. Pinch or drag the time grid to change the hour-row height.

---

## Find a time / Free-Busy

Use **Find a time** when an event has at least one attendee to see when everyone is available and pick a new slot.

### Opening Find a time

1. Create or edit an event.
2. Add one or more attendees.
3. Tap the **Find a time** button below the attendee field.
4. The app queries the Nextcloud CalDAV scheduling outbox and shows a list of suggested times.

### Suggested times

The sheet lists the first free slots in a 15-day window around the event date.

- Each row shows the day, the time range, and who is free — `Everyone free`, or the names of the attendees who are busy on that slot.
- The slot matching the current event time is marked **Current**.
- Tap a suggestion to apply it to the event immediately and close the sheet.
- The **Everyone must be free** toggle controls whether suggestions must suit all attendees (on) or only the required ones (off). When off, tap an attendee chip to mark them required or optional.

### Timeline explorer

Tap **Explore timeline** at the bottom of the sheet to open a full-screen view.

- **Day strip** — pick a day in the 15-day window.
- **Everyone lane** — the top row merges every attendee's busy periods. Tap a free area to place the event there; the selection border is green when the slot is free for everyone and red when it conflicts.
- **Attendee lanes** — one row per participant with their own busy periods. Greyed rows mean availability could not be fetched (see *External attendees*).
- **Zoom** — the `+`/`−` buttons change the time scale.
- Tap **Apply selected slot** to copy the chosen slot back into the event form.

### External attendees

If the server cannot resolve an attendee (for example an external email not on the same Nextcloud instance), that participant is shown as **Unknown**. Unknown availability is treated as free, so double-check externally if needed.

---

## Creating and editing events

### New event

1. Tap the **+** button.
2. Fill the title, location, description, and calendar.
3. Set start/end times or toggle **All-day**.
4. Add attendees or a Nextcloud Talk room.
5. Tap **Save**.

### Recurring events

When editing a recurring event, choose whether the change applies to **This event**, **This and following events**, or **All events**.

### Reminders

Add one or more reminders. The app schedules local notifications for each reminder.

---

## Attendees and invitations

- Add attendees by email or by selecting a contact.
- The app searches your Nextcloud contacts and your local device contacts.
- For invitations sent by others, use the **Invitations** screen to accept or decline. Accepted events appear in your calendar; declined events are removed.

---

## Calendars and accounts

### Calendar drawer

Tap the hamburger menu to open the calendar drawer:

- Show or hide each calendar.
- See the current account.
- Add or switch accounts.

### Share a calendar

Long-press a calendar in the drawer to share, edit, or delete it.

---

## Widgets

### Android home widget

Add the Nextcloud Calendar widget to your home screen and choose which calendar to display. The widget updates in the background after each sync.

### iOS widgets and Live Activities

Add home-screen or lock-screen widgets. Live Activities show the next or ongoing event with a countdown.

---

## Settings

Open **Settings** from the calendar overflow menu:

- **Appearance** — light, dark, or system theme.
- **Calendar** — first day of the week, hour row height, default calendar.
- **Notifications** — reminder defaults and alert tones.
- **Accounts** — manage connected Nextcloud accounts.
- **Help** — this guide and in-app explanations.
