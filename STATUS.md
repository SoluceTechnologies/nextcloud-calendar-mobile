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

Rien (hors `STATUS.md`, non suivi par git). Branche courante : `integration/pr-batch-2`.

## En cours

Batch 2 (voir plus bas). Batch 1 terminé : Délai Semaine (521ee16) et splash iOS (bf85b9a) faits et vérifiés sur simulateur. Splash : écran uni noir en mode sombre du simulateur ; si le thème de l'app est forcé en clair dans ses réglages, on voit noir puis clair (même comportement qu'openmailbox).

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

## Batch 2 — EN COURS (branche `integration/pr-batch-2` poussée ; PR https://github.com/SoluceTechnologies/nextcloud-calendar-mobile/pull/433 vers `dev`)

Décisions utilisateur (2026-11-28) : semaine ouvrée seule (#422) ; #402 fermée + issue #369 fermée (commentées) ; #415 multi-comptes non retenue (PR laissée ouverte) ; tri des issues appliqué.

Commits (tous testés : `tsc` OK, `jest --ci` 140 suites / 1395 tests OK, aucun Devin) :

| PR / issue | Commit | Note |
|---|---|---|
| #400 | 2aaf2a7 | intervalle de récurrence (ferme #366) |
| #427 | 082ecf6 | widget prochains événements Android (ferme #425) ; auteur Devin → Bruno |
| #422 | ecf9865 | vue semaine ouvrée Lun–Ven (ferme #198) |
| — | b0e3920 | chaînes da/lb pour #400 et #422 |
| #407 | 1c65b63 | dupliquer un événement (ferme #175) ; conflits résolus, chaînes da/lb |
| #395 | 1963de5 | écritures locales protégées des pulls de sync. **Retravaillée** : clés « pending » en mémoire (plus MMKV) → un crash ne bloque plus jamais la sync d'un événement ; la duplication (#407) libère aussi ses clés ; test delta aligné sur le diff en place de #430 |
| issue #19 | fcfcd93 | couleur par événement (`COLOR` iCal, noms CSS ou hex via `processColor`) ; nouvelle colonne `event_color`, **schéma v12** ; le mapper affiche `eventColor ?? color` (compatible avec la réconciliation de couleur de #396) |
| issue #429 | 1e39954 | un échec de l'appel capabilities n'écrase plus `talkEnabled` (fusion dans le store) ; cause probable, non reproduite (NC 35) |

Non traité volontairement :
- #331 : pas un bug de l'app mobile (aucun choix « type d'élément » dans l'app) ; question de Killian sans réponse depuis le 27 oct. → proposer fermeture.
- #370 : bug du sous-dossier déjà corrigé en 1.10 (#353, confirmé dans #351), rapporteur en 1.9.0 → proposer commentaire « mettez à jour » + fermeture.

Reste à faire :
1. Test simulateur iOS (JS seul, pas de rebuild natif nécessaire ; migration v11→v12 à vérifier au démarrage) : vue Semaine ouvrée, intervalle de récurrence, dupliquer, couleur par événement. Le widget #427 est Android seulement.
2. PR #433 ouverte le 2026-11-28 : suivre la CI, puis fusionner (avec accord). Utiliser `env -u GITHUB_TOKEN gh`.
3. Après fusion : fermer #400, #427, #422, #407, #395 avec commentaire ; commenter/fermer issues #366, #425, #198, #175, #19, #429 (demander confirmation pour #429).
4. Avec accord : commentaires + fermeture #331 et #370.
5. Reportées : #284, #231, #226/#408, #301/#303, #333, #409, #415.

## Issues — tri appliqué le 2026-11-28 (étiquettes, commentaires et fermetures postés)

- Corrigées dans `dev` (batch 1), à étiqueter `awaiting-release` puis fermer à la sortie : #95 et #390 (import .ics, #224), #377 (statut, 86ab170), #387 (#388), #389 (#401), #424 (#426).
- Corrigées dans `dev` mais à faire confirmer par le rapporteur après la sortie : #348 (#386 + #430), #428 (crash Android au démarrage, #430), #393 (sync widget en arrière-plan, #399 couvre seulement les certificats personnalisés), #358 (chargement infini, à retester).
- À fermer : #294 (recherche livrée en 1.11), #421 (doublon de #311), #46 (déjà étiquetée « not planned »), #321 (question répondue), #337 (non reproductible, sans réponse depuis le 19 oct.), #392 (manque d'infos, sans réponse depuis le 6 nov.).
- Couvertes par une PR du batch 2 : #366, #425, #198, #369, #175, #311.
- Bugs à traiter dans le batch 2 : #19, #429, #370, #331.
- Backlog (gros sujets, on garde ouvert) : #16 F-Droid, #21 thèmes, #45 tâches, #47 connexion via l'app Nextcloud, #54 sync calendrier natif, #81 barre de calendriers, #84 autres CalDAV, #130 MDM, #193 catégories, #228 notifications, #229 trouver un créneau, #270 widget mois, #300 pièces jointes, #305 fuseau par événement, #357 certificats client, #363 « + » dans le widget, #367 glisser-déposer agenda, #374 intent INSERT Android, #418 inventaire du fork.

## Prochaines étapes

Voir « Batch 2 — Reste à faire » ci-dessus. Aussi : build et test Android jamais faits (correctif crash `react-native-screens` 4.28 de #430 non vérifié sur Android).
