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

Use **Find a time** when an event has at least one attendee to see when everyone is available and pick a new slot visually.

### Opening Find a time

1. Create or edit an event.
2. Add one or more attendees.
3. Tap the **Find a time** button below the attendee field.
4. The app queries the Nextcloud CalDAV scheduling outbox and opens the availability timeline.

### Timeline

The timeline shows a 3-day window centered on the current event date.

- **Day columns** — swipe horizontally to see adjacent days.
- **Hour rail** — 00:00 to 24:00 on the left.
- **Busy blocks** — red blocks are `BUSY`, dashed grey blocks are `BUSY-UNAVAILABLE` (outside working hours).
- **Attendee colors** — each participant is assigned a unique color. Colored dots inside a busy block show who is unavailable during that period.
- **Free zones** — green highlighted areas where the selected attendees are free.
- **Attendee list** — below the timeline, showing `Available` or `Unknown` for each participant. Each row displays the participant's color dot.

### Draggable event brick

The coloured brick represents the event, sized to its duration.

- **Drag the handle** on the right edge of the brick to move it to another time or day.
- The brick border turns **green** over free slots and **red** over busy slots.
- Drag near the top or bottom edge of the sheet to auto-scroll to earlier or later hours.
- **Long-press any green zone** to snap the brick to that time instantly.
- Release on a free slot to update the event start/end times.

### External attendees

If the server cannot resolve an attendee (for example an external email not on the same Nextcloud instance), that participant is shown as **Unknown**. Unknown availability is treated as free, so double-check externally if needed.

### Required attendees and mode toggle

Two modes are available above the timeline:

- **All free** (default) — the event brick turns red if any attendee is busy and can only be placed where everyone is free.
- **Some may be busy** — switch to this mode to mark individual attendees as **optional**. The brick then ignores optional attendees' busy periods and can be placed in slots where only required attendees are free.

In the attendee list, tap the toggle next to a participant to mark them required or optional when the permissive mode is active.

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
