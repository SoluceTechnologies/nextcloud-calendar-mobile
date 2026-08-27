# AGENTS.md — Nextcloud Calendar Mobile

## Commandes essentielles

```bash
yarn tsc --noEmit     # typecheck (obligatoire avant commit)
yarn jest --ci        # tests unitaires (obligatoire avant commit)
npx expo run:android  # build + install sur émulateur
yarn start --port 8081  # dev server Metro
```

## Conventions de contribution

- **Package manager** : Yarn 4 via Corepack (`yarn@4.5.3`).
- **Commits** : Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`).
- **PRs** : contre `dev` (pas `main`), description détaillée, lien vers issue (`Closes #NNN`).
- **Code** : TypeScript strict, alias `@/` pour `src/`, pas de `any` dans nouveau code.
- **Native** : ne pas committer `android/` ni `ios/` (générés par prebuild).
- **Ne pas committer `AUDIT.md`** : c'est un document de travail interne.

## Dépôts

- **upstream** : `SoluceTechnologies/nextcloud-calendar-mobile` (cible des PRs).
- **origin** : `nonofr91/nextcloud-calendar-mobile` (fork, source des branches de PR).
- **PR command** : `gh pr create --repo SoluceTechnologies/nextcloud-calendar-mobile --base dev`.

## Gestion des branches et alignement sur upstream

- **Aligner** = mettre à jour `dev` et `main` avec `upstream/dev` et `upstream/main`, puis rebaser **seulement** la branche active de la PR en cours.
- **Ne jamais** faire de `rebase` ou de `force push` sur plusieurs branches d'un coup.
- **Ne jamais** supposer que "aligner les branches" signifie "rebase toutes les branches".
- **Jamais** de `git push --force` pur : utiliser `git push --force-with-lease` si nécessaire, et seulement sur la branche de la PR active.
- Pour toute synchronisation de fork, appliquer le skill `/safe-branch-sync`.
- Supprimer une branche locale ou distante **uniquement après confirmation explicite**.
- Règle d'or : si tu n'es pas propriétaire du dépôt, ne rien faire qui réécrive l'historique public sans un accord clair.

## Tests sur émulateur

Voir le skill `.devin/skills/emulator-testing/SKILL.md` pour le protocole complet.

Points clés :
- AVD : `nc-cal-api36` (Pixel 7, API 36, résolution réduite 480×854 @ 240 dpi pour la perf).
- Lancer : `./scripts/emulator.sh` (cold boot, `-no-nested-warnings`, `-gpu swiftshader_indirect`).
- **Locale fr-FR** : `./scripts/emulator.sh --fr` ou `./scripts/emulator.sh --locale fr-FR`. Le calendrier affiche "août 2026", "Semaine", "Mois", etc.
- Nextcloud Docker local : `nextcloud-test` sur port 8080 (admin/admin).
- L'émulateur atteint l'hôte via `10.0.2.2` (pas `localhost`) ; pour le dev client, utiliser `adb reverse tcp:8081 tcp:8081`.
- Toujours tester le drag-and-drop après modification de `useEvents.ts` ou `grid.ts`.
- Limitation : la VM tourne en **nested virtualization** (VMware → KVM), donc le rendu reste janky (~150 ms/p90), mais l'app est fonctionnelle.

### Bug connu — chargement de `ical.js` dans le bundle Metro

L'import de `src/services/nextcloud/invitations.ts` (qui importe `ical.js`) provoque parfois un crash natif au runtime :

```
Cannot read property 'EventEmitter' of undefined
loadModuleImplementation@252:40
```

Cela se produit quand le module est chargé (pas à l'import statique). Solution temporaire : charger `invitations.ts` le plus tard possible ; investigation en cours (probable cycle ou ordre de chargement Metro/Hermes autour de `ical.js` et du polyfill `events`).

## Pattern WatermelonDB — piège du fingerprint

`observeWithColumns` peut réémettre les **mêmes instances** de modèle après une
mise à jour. Ne jamais comparer par référence ; utiliser un fingerprint basé sur
les valeurs de **tous les champs mappés** (voir `src/database/useEvents.ts`).

## Infrastructure de test

- **Nextcloud Docker** : `docker start nextcloud-test` (port 8080, admin/admin).
- **Calendar app** : `docker exec -u www-data nextcloud-test php occ app:enable calendar`.
- **Vérification CalDAV** : `curl -s -u admin:admin http://127.0.0.1:8080/remote.php/dav/calendars/admin/personal/`.
