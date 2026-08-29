# Plan — Issue #186 : Ouvrir les événements Talk dans l'app mobile

## Vue d'ensemble

L'issue [#186](https://github.com/SoluceTechnologies/nextcloud-calendar-mobile/issues/186) demande que les événements calendrier contenant un lien Talk s'ouvrent par défaut dans l'application Nextcloud Talk (deep linking), tout en laissant la possibilité d'ouvrir le lien dans le navigateur.

L'application gère déjà :
- La création de salle Talk depuis le formulaire (`TalkToggle.tsx`, `createTalkRoom`).
- L'extraction de `talkUrl` depuis le champ `LOCATION` d'un événement ICS (`TALK_URL_PATTERN = /\/call\//`).
- L'affichage d'un bouton « Join Talk Room » dans l'écran de détail (`app/event/[uid].tsx`).
- Un `openTalkRoom()` qui, sur Android, tente un intent `package=com.nextcloud.talk2` avec fallback navigateur, et qui sur iOS appelle `Linking.openURL(talkUrl)`.

## Phases

### Phase 1 — Analyse et choix UX
- [x] Vérifier le code existant (modèle, parsing, écran détail, locales).
- [~] Choisir l'expérience utilisateur :
  - Option A : améliorer `openTalkRoom()` pour détecter si Talk est installé et ouvrir automatiquement l'app (ou navigateur sinon), sans nouvelle UI.
  - Option B : ajouter une feuille d'action (ActionSheet) à l'appui sur le bouton, proposant « Ouvrir dans Talk » / « Ouvrir dans le navigateur ».
  - Option C : ajouter une préférence dans les réglages (`settingsStore`) pour choisir le comportement par défaut, avec possibilité d'inverser à la volée.

### Phase 2 — Implémentation
- [ ] Détecter la présence de l'app Talk (`Linking.canOpenURL` ou intent explicite).
- [ ] Adapter `openTalkRoom()` pour Android et iOS avec le bon deep-link / URL scheme.
- [ ] Ajouter l'option « ouvrir dans le navigateur » si l'app Talk est installée (selon choix UX).
- [ ] Ajouter / mettre à jour les clés i18n (`joinTalkRoom`, `openInTalk`, `openInBrowser`, etc.).
- [ ] Ajouter éventuellement une préférence dans `settingsStore` et une entrée dans l'écran de réglages.

### Phase 3 — Tests et validation
- [ ] `yarn tsc --noEmit`.
- [ ] `yarn jest --ci`.
- [ ] Test sur émulateur Android Pixel 7 API 36 (avec/ sans Nextcloud Talk installé).
- [ ] Vérifier le deep-link iOS si un appareil / simulateur est disponible.

### Phase 4 — Livraison
- [ ] Créer une branche `fix/talk-deep-linking-186` depuis `upstream/dev`.
- [ ] Commiter avec un message Conventionnal Commit.
- [ ] Pousser et créer la PR contre `upstream/dev`.

## Décisions techniques

- Le package Android de Nextcloud Talk stable est `com.nextcloud.talk2` (à confirmer).
- Sur iOS, Nextcloud Talk supporte les liens universels `https://<instance>/call/<token>` ; `Linking.openURL` devrait donc ouvrir l'app si installée et si l'association de domaine est enregistrée.
- On privilégie le deep-link explicite sur Android (intent avec package) pour garantir l'ouverture dans Talk, et un fallback navigateur fiable.

## Prochaine étape

Valider l'approche UX (Phase 1) avec l'utilisateur avant d'implémenter.
