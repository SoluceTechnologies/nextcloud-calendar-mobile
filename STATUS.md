# STATUS — tri et intégration des PR (mis à jour le 2026-11-28)

Fichier de reprise : à lire en premier si la session ou le compte Claude change. À tenir à jour après chaque étape.

## Objectif

Trier les PR ouvertes de SoluceTechnologies/nextcloud-calendar-mobile, intégrer celles qui servent la perf et l'UX dans une branche dédiée, tester sur simulateur iOS, puis ouvrir une PR vers `dev`.
Règles : pas de nouvelles features gadget, réutiliser l'existant, pas de commentaires dans le code, retirer « Devin » (trailers `Co-authored-by` et « Generated with Devin ») à chaque squash, un commit par PR avec l'auteur d'origine.

## Branche

`integration/pr-batch-1`, créée depuis `origin/dev` (= `main`, 1d70388). PR https://github.com/SoluceTechnologies/nextcloud-calendar-mobile/pull/431 fusionnée dans `dev` le 2026-11-28 (merge commit 32d2cac). Les 17 PR intégrées sont fermées avec un commentaire.

Commits (du plus ancien au plus récent) :

| PR | Commit | Note |
|---|---|---|
| #430 | 237d6cd | perf boot/sync/rendu, rn-screens 4.28, react-freeze, schéma v10 ; commit de logs dev `7b923f2` retiré |
| #416 | 28d7c58 | agenda blanc Android |
| #423 | 099ce69 | retour à aujourd'hui après minuit |
| #419 | 1db4acc | grille scrollable après 24:00 |
| #404 | c0f4ef8 | paramètres ATTENDEE conservés |
| #420 | 780de8e | flux abonnés non-ICS rejetés |
| #399 | 5f8a2de | pins TLS dans la sync widget en arrière-plan |
| #406 | cdd3827 | RRULE des VTODO |
| #388 | eda8006 | Dialog scrollable |
| #401 | 391461e | aide de syntaxe recherche |
| #426 | 4b51829 | widget agenda 4×3 |
| #396 | 99f8cf8 | couleurs d'événements suivent le calendrier |
| #386 | 5193f28 | saut Aujourd'hui, conflit avec #430 résolu à la main |
| #318 | 37ebf35 | CI token GitHub App |
| #394 | 47a0f2a | danois |
| #397 | 9722fdf | luxembourgeois (+ enregistrement `lb` dans tests et CFBundleLocalizations) |
| #224 | 4765cdc | import .ics via « Ouvrir avec » |
| — | dc5905d | import : « tout importer » + entrée « Importer un fichier .ics » dans le drawer (`expo-document-picker`) |
| #377 (fork nonofr91) | 86ab170 | statut Confirmé/Provisoire/Annulé + Occupé/Libre ; migration schéma v11 |
| — | 521ee16 | délai premier passage Agenda → Semaine corrigé (`ViewLayer` sans react-freeze, dépendance retirée) |
| — | bf85b9a | splash iOS uni (blanc / noir en sombre) comme openmailbox ; Android garde bleu + icône |

Vérifs (HEAD bf85b9a) : `npx tsc --noEmit` OK, `npx jest --ci` 139 suites / 1360 tests OK.

## Non commité (working tree)

Rien (hors `STATUS.md`, non suivi par git).

## En cours

Rien. Délai Semaine (521ee16) et splash iOS (bf85b9a) faits et vérifiés sur simulateur. Splash : écran uni noir en mode sombre du simulateur ; si le thème de l'app est forcé en clair dans ses réglages, on voit noir puis clair (même comportement qu'openmailbox).

## Tests simulateur iOS faits (iPhone 17 Pro, compte réel)

OK : agenda immédiat ancré sur aujourd'hui, en-tête suit le scroll, grille jusqu'à 24:00, aide recherche, entrée drawer + sélecteur iOS, import de 3 événements (récurrence + exception, TENTATIVE en italique, journée entière), import d'un seul événement → formulaire direct, statut → Annulé (titre barré), 2e passage en Semaine immédiat.
Événements de test supprimés (vérifié : plus rien en local ni côté serveur).
Non testé : #404 sur le vrai compte (risque d'e-mails aux invités), #396, #420, #399, #423, #426, #388, Android (aucun build).
Défaut connu hors lot : numéro de semaine ISO du dimanche affiché quand la semaine commence le dimanche (W47 pour 22–28 nov.).

## Décisions sur les autres PR

- Fermées le 2026-11-28 (commentaire explicatif posté) : #319, #398, #412, #413, #414, #230, #312, #310, #309, #410, #411, #306.
- En attente : #415, #284, #231, #226/#408, #301/#303, #409, #333, #400, #407, #422/#402 (conflit, choisir une seule ou fusionner via `PAGE_SPECS`), #427.
- À retravailler : #395 (clé « pending » jamais expirée après crash → ajouter une expiration).
- Une fois la PR d'intégration fusionnée : fermer les PR intégrées ci-dessus.

## Pièges d'environnement

- `gh` : `GITHUB_TOKEN` (~/.zshrc, compte Soluce-Technologies) n'a que le droit lecture. Préfixer par `env -u GITHUB_TOKEN` pour utiliser le compte RambokDev (keyring, admin).

- `pod install` / `expo prebuild` : exporter `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` sinon CocoaPods plante (Encoding::CompatibilityError).
- `ios/` est généré et ignoré par git ; regénérer avec `npx expo prebuild --platform ios`.
- Metro tourne déjà sur :8081 (un `expo run:ios` lancé par l'utilisateur) ; build avec `npx expo run:ios --device <udid> --no-bundler`.
- Relance à froid : `xcrun simctl terminate <udid> com.soluce.nextcloud-calendar` puis ouvrir `exp+nextcloud-calendar://expo-development-client/?url=http%3A%2F%2F192.168.0.47%3A8081`.
- Base locale en schéma v11 sur le simulateur : revenir à `dev` (v9) ferait réinitialiser la base.

## Batch 2 — proposition (2026-11-28, en attente de validation)

`dev` local avancé à 32d2cac (fusion #431). Branche à créer : `integration/pr-batch-2`.

État des 15 PR en attente face au nouveau `dev` : sans conflit #427, #422, #402, #400 ; conflits légers #415 (3 fichiers), #395 (3), #333 (3) ; conflits lourds #407 (12, surtout locales), #409 (8), #408 (15), #303 (15), #301 (11), #284 (21), #231 (11), #226 (12).

Proposition :
- A. Petites, sans conflit, UX : #400 intervalle de récurrence (ferme #366), #427 widget prochains événements Android (ferme #425), #422 + #402 vues Semaine ouvrée / 7 jours glissants (ferment #198, #369) à fusionner via `PAGE_SPECS` — décision UX : barre de vues trop chargée (7 boutons).
- B. À rebaser : #407 dupliquer un événement (ferme #175), #395 écritures locales protégées + expiration des clés.
- C. Bugs issus des issues, sans PR : #19 couleur par événement (`COLOR` jamais lu par le parseur), #429 bouton salle Talk absent (NC 35, détection `spreed` via capabilities, à reproduire), #370 événements existants absents (Nextcloud en sous-dossier, #351 fermée mais rapporté en 1.9.0), #331 la liste « Tâches » proposée comme calendrier cible d'un événement.
- D. À décider : #415 vue multi-comptes (ferme #311 et #421, forte demande, 3 conflits, risque d'écriture sur le mauvais serveur à tester).
- Reportées : #284 tâches, #231 trouver un créneau, #226/#408 invitations, #301/#303 pièces jointes, #333 widget mois, #409 GEO.

## Issues ouvertes (46) — tri proposé

- Corrigées dans `dev` (batch 1), à étiqueter `awaiting-release` puis fermer à la sortie : #95 et #390 (import .ics, #224), #377 (statut, 86ab170), #387 (#388), #389 (#401), #424 (#426).
- Corrigées dans `dev` mais à faire confirmer par le rapporteur après la sortie : #348 (#386 + #430), #428 (crash Android au démarrage, #430), #393 (sync widget en arrière-plan, #399 couvre seulement les certificats personnalisés), #358 (chargement infini, à retester).
- À fermer : #294 (recherche livrée en 1.11), #421 (doublon de #311), #46 (déjà étiquetée « not planned »), #321 (question répondue), #337 (non reproductible, sans réponse depuis le 19 oct.), #392 (manque d'infos, sans réponse depuis le 6 nov.).
- Couvertes par une PR du batch 2 : #366, #425, #198, #369, #175, #311.
- Bugs à traiter dans le batch 2 : #19, #429, #370, #331.
- Backlog (gros sujets, on garde ouvert) : #16 F-Droid, #21 thèmes, #45 tâches, #47 connexion via l'app Nextcloud, #54 sync calendrier natif, #81 barre de calendriers, #84 autres CalDAV, #130 MDM, #193 catégories, #228 notifications, #229 trouver un créneau, #270 widget mois, #300 pièces jointes, #305 fuseau par événement, #357 certificats client, #363 « + » dans le widget, #367 glisser-déposer agenda, #374 intent INSERT Android, #418 inventaire du fork.

## Prochaines étapes

1. Valider le contenu du batch 2 et les actions sur les issues.
2. Build et test Android (correctif crash `react-native-screens` 4.28 jamais vérifié sur Android).
