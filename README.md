<br />
<div align="center">

  <a href="#">
    <img src="/.github/assets/banner.png" alt="Banner">
  </a>

# Nextcloud Calendar Mobile (unofficial)

A mobile calendar client for Nextcloud, built with React Native & Expo.

[![React Native](https://img.shields.io/badge/React%20Native-0.83-61DAFB?logo=react&logoColor=white)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-55-000020?logo=expo&logoColor=white)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![CalDAV](https://img.shields.io/badge/Protocol-CalDAV-4A90D9)](https://tools.ietf.org/html/rfc4791)
[![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android-lightgrey?)](https://expo.dev/eas)

</div>

---

## Overview

**Nextcloud Calendar Mobile** brings your Nextcloud calendars natively to iOS and Android. It connects directly to your Nextcloud instance via the CalDAV protocol, supporting multiple accounts, rich event management, and deep Nextcloud integration, including Talk room creation per event.

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
  <a href="#">
    <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Get it on Google Play" height="40" />
  </a>
</p>

<p >
  Want early access? Beta builds are available — reach out at <a href="mailto:contact@soluce-technologies.com">contact@soluce-technologies.com</a>
</p>

---


## ✨ Features

### Multiple Calendar Views
Switch seamlessly between five view modes:
- **Month** — full month overview
- **Week** — 7-day scrollable view
- **3-Day** — compact multi-day view
- **Day** — single-day detail view
- **Schedule/Agenda** — chronological event list

### CalDAV Sync
Full two-way sync with any Nextcloud instance using the CalDAV protocol. Events are fetched, parsed (iCalendar/ICS), and kept up to date via TanStack Query's caching layer.

### Multi-Account Support
Add and switch between multiple Nextcloud accounts. Each account's calendars are shown with per-calendar visibility toggles and color coding.

### Event Management
Create, view, and edit calendar events with support for:
- Title, description, location
- All-day and timed events
- Attendee lists with display names
- Recurring event detection

### Nextcloud Talk Integration
Optionally attach a Nextcloud Talk room to any event at creation time, the Talk link is stored in the event and surfaced in the event detail view.

### Theming & Personalization
- Light, dark, and system-auto theme modes
- Adjustable zoom level (hour row height: 45–120 px)
- Configurable week start day (Sunday or Monday)
---

## 🗺️ Roadmap

Planned improvements for upcoming releases:

- [ ] **Push Notifications** : Event reminders delivered natively on iOS and Android
- [ ] **UX/UI Polish** : Improved loading states, transitions, and overall visual experience
- [ ] **Gesture Improvements** : More fluid and intuitive swipe navigation across calendar views
- [ ] **QR Code Authentication** : Scan the Nextcloud login QR code to authenticate without typing credentials
- [ ] **Release Pipeline** : CI/CD for automated builds and store submissions

---

## 🤝 Open to Collaboration

This project is free and open source. If you're interested in contributing, have a partnership opportunity in mind, or want to discuss how this could fit your organization's workflow, feel free to reach out. All conversations welcome.
