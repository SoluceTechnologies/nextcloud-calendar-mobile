#!/usr/bin/env bash
# Re-fetch the pinned upstream reference files under upstream/.
# Usage:
#   ./scripts/update-upstream-refs.sh          # fetch at the pinned refs
#   ./scripts/update-upstream-refs.sh master   # fetch at latest master (drift preview)
# Then `git diff upstream/` shows exactly what changed upstream.
set -euo pipefail
cd "$(dirname "$0")/.."

REF_APP="${1:-bac87f20df52d3034dd551f4810245d1cd3d0704}"   # nextcloud/android
REF_LIB="${2:-20bcd79a8f514a0bb79d98a6e42af80e28ac9ab3}"   # nextcloud/android-library
# `latest` resolves to the current default-branch HEADs.
if [[ "${1:-}" == "master" || "${1:-}" == "latest" ]]; then
  REF_APP="$(curl -sf https://api.github.com/repos/nextcloud/android/commits/master | python3 -c 'import json,sys; print(json.load(sys.stdin)["sha"])')"
  REF_LIB="$(curl -sf https://api.github.com/repos/nextcloud/android-library/commits/master | python3 -c 'import json,sys; print(json.load(sys.stdin)["sha"])')"
  echo "latest refs: android=$REF_APP android-library=$REF_LIB"
fi

fetch() { # repo ref remote-path local-path
  local url="https://raw.githubusercontent.com/$1/$2/$3"
  curl -sf "$url" -o "$4" && echo "ok  $4" || echo "FAIL $url"
}

A=app/src/main/java
fetch nextcloud/android "$REF_APP" "$A/com/owncloud/android/ui/activity/EditorWebView.java"          upstream/nextcloud-android/EditorWebView.java
fetch nextcloud/android "$REF_APP" "$A/com/owncloud/android/ui/activity/TextEditorWebView.kt"        upstream/nextcloud-android/TextEditorWebView.kt
fetch nextcloud/android "$REF_APP" "$A/com/owncloud/android/ui/activity/ExternalSiteWebView.java"    upstream/nextcloud-android/ExternalSiteWebView.java
fetch nextcloud/android "$REF_APP" "$A/com/nextcloud/utils/EditorUtils.kt"                           upstream/nextcloud-android/EditorUtils.kt
fetch nextcloud/android "$REF_APP" "$A/com/owncloud/android/ui/asynctasks/TextEditorLoadUrlTask.java" upstream/nextcloud-android/TextEditorLoadUrlTask.java

L=library/src/main/java/com/nextcloud/android/lib/resources/directediting
fetch nextcloud/android-library "$REF_LIB" "$L/DirectEditingCreateFileRemoteOperation.java"            upstream/nextcloud-android-library/DirectEditingCreateFileRemoteOperation.java
fetch nextcloud/android-library "$REF_LIB" "$L/DirectEditingObtainListOfTemplatesRemoteOperation.java" upstream/nextcloud-android-library/DirectEditingObtainListOfTemplatesRemoteOperation.java
fetch nextcloud/android-library "$REF_LIB" "$L/DirectEditingObtainRemoteOperation.java"               upstream/nextcloud-android-library/DirectEditingObtainRemoteOperation.java
fetch nextcloud/android-library "$REF_LIB" "$L/DirectEditingOpenFileRemoteOperation.java"             upstream/nextcloud-android-library/DirectEditingOpenFileRemoteOperation.java
