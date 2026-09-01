<br />
<div align="center">

  <a href="#">
    <img src="/.github/assets/banner.png" alt="Banner">
  </a>

# Nextcloud Calendar Mobile (unofficial)

A mobile calendar client for Nextcloud, built with React Native & Expo.

[![React Native](https://img.shields.io/badge/React%20Native-0.86-61DAFB?logo=react&logoColor=white)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-57-000020?logo=expo&logoColor=white)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![CalDAV](https://img.shields.io/badge/Protocol-CalDAV-4A90D9)](https://tools.ietf.org/html/rfc4791)
[![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android-lightgrey?)](https://expo.dev/eas)

</div>

---

## Overview

**Nextcloud Calendar Mobile** brings your Nextcloud calendars natively to iOS and Android. It connects directly to your Nextcloud instance via the CalDAV protocol, supporting multiple accounts, rich event management, home-screen widgets, iOS Live Activities, and deep Nextcloud integration, including Talk room creation per event.

---

## ⚠️ Active Development Disclaimer

> This project is **actively under development**. APIs, data structures, and behavior may change without prior notice between versions. Breaking changes should be expected until a stable release is published.

Use in production at your own discretion, and pin to a specific commit or tag if stability is required.

---

## 📢 Notice

> This is **not an official Nextcloud application**. It has not been reviewed, endorsed, or certified by the Nextcloud GmbH team or the Nextcloud community.
>
> This project was initiated by a private company to address specific client needs around mobile Nextcloud calendar access. It is shared openly in the spirit of collaboration, not as an official integration.

---

## 📥 Download

<p >
  <a href="https://apps.apple.com/app/nextcloud-calendar/id6766678698">
    <img src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg" alt="Download on the App Store" height="46" />
  </a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://play.google.com/store/apps/details?id=com.soluce.nextcloudcalendar">
    <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Get it on Google Play" height="40" />
  </a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/SoluceTechnologies/nextcloud-calendar-mobile/releases/latest">
    <img src="https://img.shields.io/github/v/release/SoluceTechnologies/nextcloud-calendar-mobile?label=Download%20APK&logo=android&color=3DDC84&style=for-the-badge" alt="Download latest APK" height="40" />
  </a>
</p>

<p >
  Want early access? Beta builds are available, reach out at <a href="mailto:contact@soluce-technologies.com">contact@soluce-technologies.com</a>
</p>

---

## 🎬 Demo

<div align="center">

| Switch views | Drag event | Resize event |
| :---: | :---: | :---: |
| <img src="/.github/assets/change-view.gif" alt="Switch between calendar views" width="230" /> | <img src="/.github/assets/drag.gif" alt="Drag an event" width="230" /> | <img src="/.github/assets/resize-event.gif" alt="Resize an event" width="230" /> |

| Calendars drawer | Zoom / resize grid | Settings |
| :---: | :---: | :---: |
| <img src="/.github/assets/drawer.gif" alt="Calendars drawer" width="230" /> | <img src="/.github/assets/resize.gif" alt="Resize the calendar grid" width="230" /> | <img src="/.github/assets/settings.gif" alt="Settings" width="230" /> |

| Pick widget calendar |
| :---: |
| <img src="/.github/assets/select-calendar-widget.gif" alt="Select the calendar shown in the widget" width="230" /> | | |

</div>

---

## ✨ Features

### Multiple Calendar Views
Switch seamlessly between five view modes:
- **Month**, full month overview
- **Week**, 7-day scrollable view
- **3-Day**, compact multi-day view
- **Day**, single-day detail view
- **Schedule/Agenda**, chronological event list

### CalDAV Sync
Full two-way sync with any Nextcloud instance using the CalDAV protocol. Events are fetched, parsed (iCalendar/ICS), and persisted to a local-first WatermelonDB store, kept current through per-calendar delta sync.

### Multi-Account Support
Add and switch between multiple Nextcloud accounts. Each account's calendars are shown with per-calendar visibility toggles and color coding.

### Event Management
Create, view, and edit calendar events with support for:
- Title, description, location
- All-day and timed events
- Attendee lists with display names
- Recurring event detection
- Accept, tentatively accept, or decline CalDAV invitations, with the ability to change your response later

### Nextcloud Talk Integration
Optionally attach a Nextcloud Talk room to any event at creation time, the Talk link is stored in the event and surfaced in the event detail view.

### Home Screen Widgets & Live Activities
Keep your agenda glanceable without opening the app:
- **iOS home widgets**, small, medium, and large sizes showing your upcoming agenda, plus lock-screen accessory widgets
- **Android home widget**, upcoming events on your home screen
- **iOS Live Activity**, the next or ongoing event with a live countdown, shown on the Lock Screen and in the Dynamic Island

Widgets are kept up to date through the app's background sync, and tapping an event deep-links straight into its detail view.

### Theming & Personalization
- Light, dark, and system-auto theme modes
- Adjustable zoom level (hour row height: 45–120 px)
- Configurable week start day (Sunday or Monday)
---

## 🤝 Open to Collaboration

This project is free and open source. If you're interested in contributing, have a partnership opportunity in mind, or want to discuss how this could fit your organization's workflow, feel free to reach out. All conversations welcome.

---

## 📱 Screenshots

<div align="center">

| Connect to Nextcloud | Calendar view | Calendars drawer |
| :---: | :---: | :---: |
| <img src="/.github/assets/setup.png" alt="Connect to Nextcloud" width="230" /> | <img src="/.github/assets/calendar.png" alt="Calendar view" width="230" /> | <img src="/.github/assets/drawer.png" alt="Calendars drawer" width="230" /> |

| New event | Accounts | Account detail |
| :---: | :---: | :---: |
| <img src="/.github/assets/new-event.png" alt="New event" width="230" /> | <img src="/.github/assets/accounts.png" alt="Accounts" width="230" /> | <img src="/.github/assets/account-detail.png" alt="Account detail" width="230" /> |

| Settings | Appearance | Calendar settings |
| :---: | :---: | :---: |
| <img src="/.github/assets/settings.png" alt="Settings" width="230" /> | <img src="/.github/assets/settings-appearance.png" alt="Appearance settings" width="230" /> | <img src="/.github/assets/settings-calendar.png" alt="Calendar settings" width="230" /> |

| Notifications | Widgets | Accessibility |
| :---: | :---: | :---: |
| <img src="/.github/assets/settings-notifications.png" alt="Notification settings" width="230" /> | <img src="/.github/assets/settings-widgets.png" alt="Widget settings" width="230" /> | <img src="/.github/assets/settings-accessbility.png" alt="Accessibility settings" width="230" /> |

</div>
