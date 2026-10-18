# Contributing to Nextcloud Calendar Mobile

Thanks for considering a contribution! 🎉

This app is an [Expo](https://expo.dev) / React Native project using the **bare-adjacent (prebuild) workflow**. It relies on native modules that are **not** in the Expo Go runtime, so everything below assumes a **development build**.

---

## Table of Contents

1. [Expo Go is not supported](#expo-go-is-not-supported)
2. [Prerequisites](#prerequisites)
3. [Project setup](#project-setup)
4. [Running a development build](#running-a-development-build)
5. [Building locally](#building-locally)
6. [Installing an APK on a device (adb)](#installing-an-apk-on-a-device-adb)
7. [Building with EAS](#building-with-eas)
8. [Project structure](#project-structure)
9. [Tests & typecheck](#tests--typecheck)
10. [Submitting changes](#submitting-changes)
11. [Pull request process](#pull-request-process)
12. [Community guidelines](#community-guidelines)

---

## Expo Go is not supported

**Do not use Expo Go.** The app depends on custom native code that Expo Go does not ship:

| Dependency | Why it needs a dev build |
| --- | --- |
| `@nozbe/watermelondb` (+ `@morrowdigital/watermelondb-expo-plugin`) | Native SQLite/JSI adapter |
| `react-native-mmkv` / `react-native-nitro-modules` | Nitro JSI bindings |
| `react-native-reanimated` 4 / `react-native-worklets` | Worklets runtime |
| `expo-camera`, `expo-secure-store`, `expo-localization` | Config-plugin native config |
| `patches/` (patch-package) | Patched native + JS sources |

Scanning the QR code with Expo Go will crash or silently misbehave. Always build and install a **development client** (`expo-dev-client` is already a dependency).

---

## Prerequisites

**All platforms**

- **Node.js** LTS (matches CI, which uses `lts/*`)
- **Corepack** enabled — the repo pins Yarn via `packageManager` (`yarn@4.5.3`)
  ```bash
  corepack enable
  ```
- **Git**

**Android**

- **JDK 17**
- **Android Studio** with:
  - Android SDK Platform (matching the Expo SDK 57 / RN 0.86 target)
  - Android SDK Build-Tools
  - Android SDK Platform-Tools (provides `adb`)
  - Android Emulator (or a physical device with USB debugging on)
- `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) exported, with `platform-tools` on your `PATH`:
  ```bash
  export ANDROID_HOME="$HOME/Android/Sdk"
  export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
  ```

**iOS (macOS only)**

- **Xcode** (latest stable) + Command Line Tools
- **CocoaPods** (`sudo gem install cocoapods` or via Homebrew)
- An iOS Simulator runtime, or a physical device with a provisioning profile

---

## Project setup

1. **Fork** the repository, then clone your fork:

   ```bash
   git clone https://github.com/<your-username>/nextcloud-calendar-mobile
   cd nextcloud-calendar-mobile
   ```

2. **Install dependencies** (Yarn 4 via Corepack). `postinstall` runs `patch-package`, so the patches in `patches/` are applied automatically:

   ```bash
   corepack enable
   yarn install
   ```

3. **Generate the native projects.** `android/` and `ios/` are git-ignored (except the tracked `android/app/src/main/AndroidManifest.xml`, kept for F-Droid). They are produced by Expo prebuild from `app.config.ts`:

   ```bash
   npx expo prebuild
   ```

   Useful variants:

   ```bash
   npx expo prebuild --platform android   # single platform
   npx expo prebuild --clean              # wipe & regenerate (do this after changing app.config.ts or plugins)
   ```

   > ⚠️ `--clean` deletes `android/` and `ios/`. Never hand-edit files inside them — changes belong in `app.config.ts` or in a config plugin, otherwise the next prebuild throws them away.

4. **Create a branch**:

   ```bash
   git checkout -b feat/<feature-name>
   ```

---

## Running a development build

The first run compiles the native app **and** installs it on the target, then starts Metro.

**Android** (emulator running, or device connected with USB debugging):

```bash
yarn android          # expo run:android
```

**iOS** (macOS):

```bash
yarn ios              # expo run:ios
```

After the dev client is installed, you only need Metro for subsequent JS changes:

```bash
yarn start            # expo start
```

Then open the **Nextcloud Calendar** dev client on the device and connect to the Metro bundler.

Rebuild the native app (`yarn android` / `yarn ios`) whenever you:

- add or remove a native dependency,
- change `app.config.ts` or a config plugin,
- add or update a patch in `patches/`.

Useful flags:

```bash
yarn start --clear                 # reset the Metro cache
npx expo run:android --device      # pick a target interactively
npx expo run:android --variant release
```

---

## Building locally

### Android APK via Gradle

After `npx expo prebuild --platform android`:

```bash
cd android

./gradlew assembleDebug      # debug APK  (needs Metro, or bundled JS)
./gradlew assembleRelease    # release APK (JS bundled in)
```

Outputs:

| Build | Path |
| --- | --- |
| Debug | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Release | `android/app/build/outputs/apk/release/app-release.apk` |

An **AAB** (Play Store format, not installable via `adb`):

```bash
./gradlew bundleRelease
# android/app/build/outputs/bundle/release/app-release.aab
```

> 🔑 **Signing:** the prebuild template signs `release` with the **debug keystore**. Locally built release APKs are therefore fine for testing but must never be published. Official store builds are signed by EAS credentials in CI.

Clean build:

```bash
./gradlew clean
```

### iOS locally (macOS)

```bash
npx expo run:ios --configuration Release
```

Or open `ios/NextcloudCalendar.xcworkspace` in Xcode and build/archive from there.

---

## Installing an APK on a device (adb)

1. On the phone: **Settings → About phone → tap "Build number" 7×**, then **Developer options → USB debugging → On**.
2. Plug the device in and accept the RSA prompt.
3. Check that it is visible:

   ```bash
   adb devices -l
   ```

4. Install:

   ```bash
   adb install -r android/app/build/outputs/apk/release/app-release.apk
   ```

   | Flag | Meaning |
   | --- | --- |
   | `-r` | Reinstall, keeping app data |
   | `-d` | Allow version downgrade |
   | `-s <serial>` | Target a specific device when several are connected |

   Multiple devices connected:

   ```bash
   adb -s <serial> install -r <path-to.apk>
   ```

5. Signature conflict (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) — you have a store build installed and are installing a locally-signed one. Uninstall first:

   ```bash
   adb uninstall com.soluce.nextcloudcalendar
   ```

   > This **deletes the local database and stored accounts** for that app on the device. Back up anything you need first.

6. Launch and read the logs:

   ```bash
   adb shell monkey -p com.soluce.nextcloudcalendar -c android.intent.category.LAUNCHER 1
   adb logcat --pid=$(adb shell pidof -s com.soluce.nextcloudcalendar)
   ```

**Over Wi-Fi** (Android 11+, device and computer on the same network):

```bash
adb pair <ip>:<pairing-port>     # code shown under Developer options → Wireless debugging
adb connect <ip>:<port>
```

**Testing a CI-built APK:** every release attaches `NextcloudCalendar-v<version>.apk` to the [GitHub release](https://github.com/SoluceTechnologies/nextcloud-calendar-mobile/releases/latest). Download it and `adb install -r` it the same way.

---

## Building with EAS

Optional — only needed for cloud builds or iOS builds without a Mac. Requires an Expo account with access to the `soluce` org (maintainers). Profiles live in `eas.json`.

```bash
npm install -g eas-cli
eas login

eas build --profile development --platform android   # dev client, internal distribution
eas build --profile apk         --platform android   # standalone installable APK
eas build --profile preview     --platform android   # internal distribution
eas build --profile production  --platform all       # store builds (maintainers only)
```

> **Tracked `AndroidManifest.xml` vs EAS.** `android/app/src/main/AndroidManifest.xml` is committed for F-Droid, which makes EAS detect the project as *bare* and skip prebuild. CI works around this by stripping the native dirs before building:
>
> ```bash
> rm -rf android ios
> eas build --profile production --platform all --non-interactive
> ```
>
> Do the same if you run EAS builds from a checkout, and re-run `npx expo prebuild` afterwards to restore your local native projects.

Release builds are automated: merging a PR whose **title contains `[release]`** into `main` triggers `release.yml` → `release-it` (version bump + changelog) → `expo.yml` (EAS build, store submit, APK attached to the GitHub release).

---

## Project structure

```
app/                    Expo Router routes (file-based navigation)
src/
  components/           Shared components
  database/             WatermelonDB models, schema, migrations (source of truth)
  features/             Feature modules (calendar, accounts, widget, …)
  hooks/                Shared hooks
  locales/              i18n resources (i18next)
  services/             CalDAV / Nextcloud API clients
  storage/              MMKV / SecureStore wrappers
  stores/               Zustand stores
  ui/                   Design system primitives — reuse these, don't recreate them
  utils/                Helpers (ICS, timezone, …)
assets/                 Icons, splash, fonts
patches/                patch-package patches
__tests__/  __mocks__/  Jest unit tests and shared module mocks
e2e/                    End-to-end suites (Jest + Maestro flows + Nextcloud in Docker)
android/  ios/          Generated by expo prebuild — do not edit or commit
```

Conventions:

- Import through the `@/` alias (`@/ui/components/...`), mapped to `src/`.
- **Reuse the existing design system in `src/ui`** rather than writing new primitives.
- Icons come from `lucide-react-native`.
- TypeScript is strict — no `any` escape hatches in new code.

---

## Tests & typecheck

There are two layers of tests:

| Layer | Where | Runs on | In CI |
| --- | --- | --- | --- |
| Static checks (typecheck, deps, secrets) | whole repo | Node / scanners | ✅ every PR (`test.yml`, `security.yml`, `plumber.yml`) |
| Unit / component (Jest) | `__tests__/` | Node, no device | ✅ every PR (`test.yml`) |
| End-to-end (Jest + Maestro) | `e2e/` | Android emulator + Nextcloud in Docker | ❌ run locally |

### Static checks

| Check | Tool | Workflow | Run locally |
| --- | --- | --- | --- |
| Typecheck (`strict: true`) | `tsc` | `test.yml` | `yarn tsc --noEmit` |
| Vulnerable dependencies (CRITICAL / HIGH, fixable only) | [Trivy](https://trivy.dev) | `security.yml` | `trivy fs --severity CRITICAL,HIGH --ignore-unfixed .` |
| Committed secrets | [Gitleaks](https://gitleaks.io), rules in `.gitleaks.toml` | `security.yml` (skipped on PRs from forks) | `gitleaks detect --config .gitleaks.toml` |
| CI/CD pipeline hygiene (pinned actions, permissions…) | [Plumber](https://github.com/getplumber/plumber) | `plumber.yml` | CI only |

Gitleaks also runs as a **pre-commit hook** (`.pre-commit-config.yaml`), so secrets are caught before they reach a commit. Install it once per clone:

```bash
brew install pre-commit      # or: pipx install pre-commit
pre-commit install
pre-commit run --all-files   # optional: scan the whole tree now
```

There is no linter or formatter configured — match the style of the surrounding code. If Gitleaks flags a test fixture, use an obviously fake value rather than allow-listing it.

### Typecheck & unit tests

Run both before pushing — CI fails the PR otherwise:

```bash
yarn tsc --noEmit                              # typecheck
yarn test                                      # all unit tests (jest-expo preset)
yarn jest --watch                              # watch mode while developing
yarn jest __tests__/utils/ics.test.ts          # a single file
yarn jest -t 'RecurrencePicker'                # tests whose name matches
```

Conventions:

- Unit tests live in **`__tests__/`**, grouped by area (`api/`, `components/`, `database/`, `features/<feature>/`, `hooks/`, `i18n/`, `services/`, `store/`, `utils/`). E2E suites stay in `e2e/` — don't mix the two.
- **Import app code through `@/`.**
- Module mocks shared by every suite live in **`__mocks__/`** (`expo-widgets`, `react-native-mmkv`) and **`jest.setup.js`**; anything else is `jest.mock()`'d locally in the test.
- Components that read the theme need it provided — wrap them with `ThemeWrapper` from `__tests__/helpers/theme.tsx`:

  ```tsx
  import { render as rtlRender } from '@testing-library/react-native';
  import { ThemeWrapper } from '../helpers/theme';

  const render = (ui: ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });
  ```
- `__tests__/i18n/parity.test.ts` fails if a translation key is missing in any language — add new strings to every locale.
- Add coverage for any new logic — especially sync, ICS parsing, and timezone handling, where regressions are easy to miss.

### End-to-end tests

E2E suites (`e2e/*.e2e.ts`) drive the **release APK** on an Android emulator with [Maestro](https://maestro.dev) flows (`e2e/maestro/**.yaml`), against a throwaway **Nextcloud server started in Docker** by [Testcontainers](https://testcontainers.com) (`nextcloud:34-apache`, admin `e2e`, a seeded `e2e-cal` calendar). Each suite asserts both what the app shows and what landed on the server over CalDAV.

**Extra prerequisites**

- **Docker** running (Docker Desktop, OrbStack, Colima…)
- **[Maestro CLI](https://docs.maestro.dev/getting-started/installing-maestro)** on your `PATH`
- **[just](https://github.com/casey/just)** (`brew install just`)
- An **Android emulator** booted and visible to `adb devices`. The app reaches the container through `10.0.2.2`, so it must be an emulator, not a physical device.

**Run them**

```bash
just e2e-all                       # boot emulator if needed + build + run every suite (AVD=<name> to pick one)

# or step by step:
just e2e-build                     # prebuild android + assembleRelease for the booted emulator's ABI
just e2e                           # every suite
just e2e e2e/event.e2e.ts          # one suite
just e2e -t 'dark theme'           # tests whose name matches
```

`just e2e-build` only needs re-running when app code changes. `just e2e-all` boots the emulator in the background while Gradle builds.

How a run is organised (`e2e/globalSetup.ts`), to keep it fast:

- **One Nextcloud container for the whole run**, started while the APK installs. Suites reach it through `E2E_NEXTCLOUD`; the first run pulls the image.
- **One install, one login.** `globalSetup` wipes the app, logs in once (`shared/login-and-wait`) and every suite starts from that session. App flows never log in: `shared/ensure-home` fails if it lands on setup, so a lost session shows up at once instead of costing a login per flow.
- **Isolation per suite on the server side:** each suite starts by deleting every event except the seed (`E2E seed`), so it never sees what the previous suite created.
- Only `account.e2e.ts` changes the session (switching, reconnecting, deleting accounts). `e2e/sequencer.cjs` runs it last so it can't break the others.
- Maestro installs its on-device driver on each suite's first flow only (`--no-reinstall-driver` afterwards).

> ⚠️ `just e2e-build` runs `expo prebuild --clean`, which regenerates `android/`. It builds only the ABI of the booted emulator (falling back to `arm64-v8a` on Apple Silicon, `x86_64` elsewhere) — boot the emulator first, and rebuild if you switch to an emulator with another ABI.

**Environment variables**

| Variable | Default | Purpose |
| --- | --- | --- |
| `APK` | `android/app/build/outputs/apk/release/app-release.apk` | APK to install |
| `ANDROID_SERIAL` | — | Target emulator when several are running (`emulator-5554`) |
| `MAESTRO_REPORT_DIR` | — | Write one JUnit XML report per flow into this folder |

**Writing a new E2E test**

1. Add any missing `testID` to the component (e2e IDs are kebab-case and prefixed by screen, e.g. `event-form-save`), and reference it from the flow.
2. Write the Maestro flow in `e2e/maestro/<area>/<name>.yaml`. Reuse `e2e/maestro/shared/*` (`ensure-home`, `home-and-wait`, `open-event`, …) via `runFlow`. Values come in as `${VAR}` (`NC_URL`, `NC_USER`, `NC_PASS`, plus whatever the suite passes).
3. Call it from a suite with `runFlow(suite.nc, '<area>/<name>', { TITLE })`, then verify the server side with `suite.nc.dav` and `eventually(...)` — sync is asynchronous.

Iterating on a flow alone is faster than the whole suite, once the app is installed and logged in:

```bash
maestro test e2e/maestro/event/create-timed.yaml -e TITLE='E2E test'
```

---

## Reporting issues

1. **Search existing issues** first to avoid duplicates.
2. Open a new issue using the appropriate template (bug report / feature request) and include:
   - a clear, descriptive title,
   - steps to reproduce,
   - app version, platform and OS version, Nextcloud server version,
   - relevant logs (`adb logcat`, Metro output), screenshots, or code snippets.

---

## Submitting changes

1. Keep your branch current:

   ```bash
   git pull --rebase origin main
   ```

2. Use **[Conventional Commits](https://www.conventionalcommits.org)** — `release-it` generates the changelog and version bump from them:

   ```
   feat: add per-calendar visibility toggle
   fix: resolve crash when an event has no DTEND
   chore: bump expo to SDK 57
   docs: update contributing guide
   refactor: extract ICS parser
   test: cover recurring event expansion
   ```

   `feat:` → minor bump, `fix:` → patch bump, `!` or `BREAKING CHANGE:` → major bump.

3. Push:

   ```bash
   git push origin feat/<feature-name>
   ```

4. Open a Pull Request against `main`.

---

## Pull request process

1. `yarn tsc --noEmit` and `yarn test` pass locally.
2. The change is verified on a **real development build** (emulator or device), not just compiled — state which platform you tested on.
3. The PR description explains what changed and why; link related issues (`Closes #123`).
4. Do not commit generated native code (`android/`, `ios/`), build outputs, or keystores.
5. Native dependency added? Say so explicitly — reviewers need to rebuild.
6. Wait for maintainer review.

---

## Community guidelines

- Be respectful and inclusive to all contributors.
- Feel free to ask questions if you're unsure about something — an early question beats a large rewrite.

---

Thank you for contributing! 🙌
