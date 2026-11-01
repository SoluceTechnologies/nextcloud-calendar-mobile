set dotenv-load := true
set positional-arguments

default:
    @just --list

seed *args:
    bash ./scripts/seed-nextcloud.sh "$@"

unseed *args:
    bash ./scripts/seed-nextcloud.sh --wipe "$@"

android:
    yarn android

ios:
    yarn ios

e2e-build:
    abi=$(adb shell getprop ro.product.cpu.abi 2>/dev/null | tr -d '\r'); \
    [ -n "$abi" ] || { [ "$(uname -m)" = arm64 ] && abi=arm64-v8a || abi=x86_64; }; \
    EXPO_NO_GIT_STATUS=1 npx expo prebuild -p android --clean --no-install \
      && (cd android && ./gradlew assembleRelease -x lintVitalAnalyzeRelease -PreactNativeArchitectures=$abi); \
    rc=$?; git checkout -- android/app/src/main/AndroidManifest.xml; exit $rc

e2e *args:
    yarn jest -c e2e/jest.config.mjs "$@"

e2e-all *args:
    #!/usr/bin/env bash
    set -euo pipefail
    command -v maestro >/dev/null || { echo 'Maestro CLI missing: curl -fsSL "https://get.maestro.mobile.dev" | bash' >&2; exit 1; }
    docker info >/dev/null 2>&1 || { echo 'Docker is not running: start Docker first' >&2; exit 1; }
    if ! adb get-state >/dev/null 2>&1; then
      avd="${AVD:-$(emulator -list-avds | head -1)}"
      [ -n "$avd" ] || { echo 'No AVD found: create one in Android Studio, or set AVD=<name>' >&2; exit 1; }
      echo "Booting emulator ${avd} in the background..."
      nohup emulator -avd "$avd" -no-snapshot-save -dns-server 8.8.8.8,1.1.1.1 >/dev/null 2>&1 &
    fi
    just e2e-build
    echo "Waiting for the emulator to finish booting..."
    adb wait-for-device
    until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 2; done
    just e2e "$@"
