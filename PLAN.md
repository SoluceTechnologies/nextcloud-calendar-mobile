# Plan — Suivi des améliorations du Nextcloud Calendar Mobile

Ce document synchronise l’audit technique `AUDIT.md` avec l’état du dépôt officiel `SoluceTechnologies/nextcloud-calendar-mobile` (branches, PR ouvertes, PR mergées).

## Légende

- ✅ Fait / mergé dans `dev` ou `main`
- 🔄 PR ouverte en cours
- ⏳ Branche locale non poussée / non mergée
- ❌ Non commencé

---

## 1. Sécurité et réseau

| Point de l’audit | État | Branche / PR | Notes |
|---|---|---|---|
| 1.1 Trafic HTTP clair autorisé par défaut | 🔄 | `fix/security-restrict-cleartext-traffic` → PR #200 (base `main`) | Commit `e25af77` : `NSAllowsArbitraryLoads: false`, suppression `usesCleartextTraffic`, `NSAllowsLocalNetworking: true`. PR bloquée par règle de protection. |
| 1.2 Hostname verification contournée | ❌ | — | Non traité. Modules natifs `tls-trust` à relire. |
| 1.3 Validation URLs / QR code | ❌ | — | Non traité. Nécessite des guards dans `setup.tsx`, `ncLoginUrl.ts`, `caldav.ts`. |

---

## 2. Synchronisation CalDAV et robustesse

| Point de l’audit | État | Branche / PR | Notes |
|---|---|---|---|
| 2.1 Calendrier défaillant bloque la sync | ✅ | `fix/sync-resilience-events-not-showing` PR #188, #195, #196 | `settleAll` best-effort (`src/utils/settle.ts`). Fix `webcal://` → `https://`. |
| 2.2 Retry exponentiel | ✅ | `fix/retry-transient-network-errors` PR #203 | Commit `036313f`, mergé dans `dev`. |
| 2.3 Écritures sans `If-Match` / ETag | ❌ | — | Non commencé. Nécessite migration WatermelonDB (colonne `etag`). |
| 2.4 `localWriteEpoch` non persistant | ❌ | — | Non commencé. Compteur en mémoire `src/database/sync.ts:130`. |
| 2.5 Parsing XML par regex | ❌ | — | Non commencé. Évaluer `fast-xml-parser`. |
| 2.6 Anti-deletion guard / empty sync-token | ✅ | `fix/sync-anti-delete-guard` PR #207, `fix/sync-token-empty-handling` PR #205 | Mergés dans `dev`. |

---

## 3. Performance et architecture

| Point de l’audit | État | Branche / PR | Notes |
|---|---|---|---|
| 3.1 Parsing ICS synchrone sur thread principal | 🔄 | `fix/performance-optimizations` PR #208 | `parseIcsObjectsAsync` chunké + frame budget 16ms dans le body de la PR. Reste à valider en prod. |
| 3.2 `buildDayIndex` recalculé | ✅ | `fix/performance-optimizations` | Cache LRU + `stabilizeDayIndex` dans `src/features/calendar/utils/grid.ts`. |
| 3.3 `useEventsForRange` tri à chaque notification | 🔄 | `fix/performance-optimizations` | Fingerprint valeur + tests drag-and-drop. Test émulateur OK. |
| 3.4 Polling 30s | ❌ | — | Non traité. À remplacer par sync sur `ctag` / pull-to-refresh. |

---

## 4. Qualité du code

| Point de l’audit | État | Branche / PR | Notes |
|---|---|---|---|
| 4.1 `// @ts-nocheck` modèles | ❌ | — | `Event.ts` et `Calendar.ts` restent avec `// @ts-nocheck`. |
| 4.2 `any` et casts non sécurisés | ✅ | `chore/replace-any-types` PR #211 | Mergé dans `dev`. |
| 4.3 ESLint / Prettier / pre-commit | ❌ | — | Non commencé. `chore/remove-unused-imports` PR #210 a nettoyé les imports. `fix/log-silent-errors` PR #212 a ajouté le log des erreurs silencieuses. |

---

## 5. Fonctionnalités

| Point de l’audit | État | Branche / PR | Notes |
|---|---|---|---|
| 5.1 Recherche d’événements | ❌ | — | Non commencé. |
| 5.2 RSVP / invitations | ❌ | — | Non commencé. |
| 5.3 Support VTODO complet | ❌ | — | Deck tasks affichées comme événements. |

---

## 6. Branches locales en attente

| Branche | Dernier commit | Tracking | Action proposée |
|---|---|---|---|
| `fix/performance-optimizations` | `56f4f7c` + `210a463` (skill local) | non, mais PR #208 ouverte | Le commit test est poussé (`56f4f7c` sur `origin/`). Le skill `.devin/skills/emulator-testing/` est à garder local. |
| `fix/security-restrict-cleartext-traffic` | `e25af77` | non, mais PR #200 ouverte | Déjà sur `origin/`. PR vers `main`, bloquée. |
| `feat/locale-week-start` | `642455a` | non | À rebase sur `dev` et pousser. |
| `fix/month-day-number-clip` | `9a41715` | non | À rebase sur `dev` et pousser. |
| `chore/remove-unused-imports` | `2af99e8` | `origin/...` | PR #210 mergée. Peut être supprimée. |
| `chore/replace-any-types` | `4212fb3` | `origin/...` | PR #211 mergée. Peut être supprimée. |
| `fix/log-silent-errors` | `986566c` | `origin/...` | PR #212 mergée. Peut être supprimée. |
| `dev` | `7587504` | `upstream/dev` | `origin/dev` est en retard (`fb16647` vs `7587504`). À pousser sur `origin/dev` si on veut synchroniser le fork. |

---

## Prochaines étapes suggérées

1. Pusher / créer des PR pour `feat/locale-week-start` et `fix/month-day-number-clip` (rebase sur `dev`).
2. Pousser `origin/dev` à jour avec `upstream/dev`.
3. Faire avancer PR #200 (sécurité) si le blocage est lié à une review ou un conflit.
4. Traiter les points non commencés : hostname verification, validation URL, ETag, `localWriteEpoch`, parsing XML, ESLint/Prettier, recherche, RSVP, VTODO.
