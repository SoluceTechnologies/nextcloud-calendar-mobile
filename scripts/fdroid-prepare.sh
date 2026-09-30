#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STUB_REPO='https://gitlab.com/freed-by-fdroid/firebase-stubs.git'
STUB_REV='ce90a956aacda17a85c60577ee443aeb83d876ef'
STUB_DIR="${FIREBASE_STUB_DIR:-$ROOT/.fdroid/firebase-stubs}"
NOTIF_ANDROID="$ROOT/node_modules/expo-notifications/android"

if [ ! -d "$STUB_DIR/firebase-messaging" ]; then
  git clone -q "$STUB_REPO" "$STUB_DIR"
  git -C "$STUB_DIR" checkout -q "$STUB_REV"
fi

if grep -q 'com.google.firebase' "$NOTIF_ANDROID/build.gradle"; then
  sed -i '/firebase/d' "$NOTIF_ANDROID/build.gradle"
fi
cp -a "$STUB_DIR/firebase-messaging/src" "$NOTIF_ANDROID/"

for SRC_ROOT in "$NOTIF_ANDROID"/src/main/java "$NOTIF_ANDROID"/src/main/kotlin; do
  if [ -d "$SRC_ROOT/com/google/firebase/messaging" ]; then
    mkdir -p "$SRC_ROOT/org/fdroid/stub/firebase"
    rm -rf "$SRC_ROOT/org/fdroid/stub/firebase/messaging"
    mv "$SRC_ROOT/com/google/firebase/messaging" "$SRC_ROOT/org/fdroid/stub/firebase/messaging"
    find "$SRC_ROOT/com" -type d -empty -delete
  fi
done
{ grep -rlE 'com\.google\.firebase\.messaging' "$NOTIF_ANDROID/src" || true; } \
  | xargs -r sed -i 's/com\.google\.firebase\.messaging/org.fdroid.stub.firebase.messaging/g'

sed -i '/<service/{N;/ExpoFirebaseMessagingService/{:a;N;/<\/service>/!ba;d}}' \
  "$NOTIF_ANDROID/src/main/AndroidManifest.xml"

APP_ANDROID="$ROOT/node_modules/expo-application/android"
APP_MODULE="$APP_ANDROID/src/main/java/expo/modules/application/ApplicationModule.kt"
if grep -q installreferrer "$APP_ANDROID/build.gradle"; then
  sed -i '/installreferrer/d' "$APP_ANDROID/build.gradle"
  sed -i \
    -e '/^import com.android.installreferrer/d' \
    -e '/val installReferrer = StringBuilder()/,/^      })$/d' \
    -e '/AsyncFunction("getInstallReferrerAsync")/a\      promise.reject("ERR_APPLICATION_INSTALL_REFERRER_UNAVAILABLE", "The install referrer API is not available on F-Droid builds.", null)' \
    "$APP_MODULE"
fi

sed -i 's/"exclude": \[/"buildFromSource": [".*"], "exclude": ["expo-camera",/' package.json
grep -q '"buildFromSource"' package.json

rm -rf node_modules/expo-dev-client node_modules/expo-dev-launcher \
       node_modules/expo-dev-menu node_modules/expo-dev-menu-interface

echo "F-Droid variant prepared"
