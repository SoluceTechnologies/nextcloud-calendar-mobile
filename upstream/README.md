# Upstream references — Direct Editing

Pinned copies of the upstream files our Direct Editing / editor integration is
based on. They are **reference material**, not compiled code — the app is React
Native, so upstream Kotlin/Java cannot be imported, only ported.

## Why

The `DirectEditingMobileInterface` WebView contract is a *convention* shared by
the first-party editors (text, richdocuments, whiteboard…) and the official
clients — it is not enforced by the server. The authoritative spec is the
developer manual; these files are the reference implementation we mirror.

- Spec: https://docs.nextcloud.com/server/stable/developer_manual/digging_deeper/direct_editing.html
- Editor-side messages: `nextcloud/text` `src/views/DirectEditing.vue`
  (`callMobileMessage`) and the npm package `@nextcloud/directediting`.

## Pinned sources

| Upstream file | Repo@ref | Ported to |
|---|---|---|
| `nextcloud-android/EditorWebView.java` | `nextcloud/android@bac87f2` | `app/event/editor.tsx` (loading screen, `MobileInterface` bridge, close/reload) |
| `nextcloud-android/TextEditorWebView.kt` | `nextcloud/android@bac87f2` | `app/event/editor.tsx` (`DirectEditingMobileInterface` injection, office UA) |
| `nextcloud-android/ExternalSiteWebView.java` | `nextcloud/android@bac87f2` | `app/event/editor.tsx` (WebView chrome) |
| `nextcloud-android/EditorUtils.kt` | `nextcloud/android@bac87f2` | `src/services/nextcloud/directEditing.ts` (`editorForMime`, `usesOfficeUserAgent`) |
| `nextcloud-android/TextEditorLoadUrlTask.java` | `nextcloud/android@bac87f2` | `openDirectEditingUrl` + `app/event/editor.tsx` reload |
| `nextcloud-android-library/DirectEditing*RemoteOperation.java` | `nextcloud/android-library@20bcd79` | `src/services/nextcloud/directEditing.ts` (OCS endpoints) |

## How to check for upstream changes

```bash
./scripts/update-upstream-refs.sh           # re-fetch at the pinned refs → git diff shows changes
./scripts/update-upstream-refs.sh master    # re-fetch at latest master to preview drift
```

Because the pinned copies are committed, re-running the script at a newer ref
and committing makes the upstream delta visible as a normal `git diff` — port
the relevant hunks, then bump the ref in this table and the script.

## What to look for when porting

- New `MobileInterface` methods (new bridge messages) → declare them in
  `DIRECT_EDITING_BRIDGE` in `app/event/editor.tsx` and handle them in
  `onMessage`.
- New editor ids in `OFFICE_EDITOR_IDS` → `usesOfficeUserAgent`.
- New OCS params/endpoints in the `RemoteOperation` classes →
  `directEditing.ts`.
- Token/lifecycle changes (`reload`, multi-use tokens) → `requestUrl` logic.
