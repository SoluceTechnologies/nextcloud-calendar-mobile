# Plan — Feature : Gérer les invitations CalDAV

## Vue d'ensemble

L'application Nextcloud Calendar Mobile ne prend pas en charge les invitations à des événements reçues par CalDAV. Quand un utilisateur (compte A) crée un événement et ajoute `ARASABruno` (compte B) comme participant, le compte B reçoit un mail avec un `.ics` en pièce jointe, mais l'application ne signale pas l'invitation, ne l'affiche pas dans l'agenda et ne permet pas d'accepter, de refuser ou de proposer.

Cette feature est maintenant implémentée et validée :
- lecture de la `schedule-inbox` CalDAV ;
- affichage des invitations en attente avec actions Accepter / Refuser / Peut-être ;
- mise à jour du calendrier cible et nettoyage de l'inbox ;
- gestion du cas où le serveur a déjà pré-créé un événement avec le même UID.

Cette feature vise à :
- Lire la **schedule-inbox CalDAV** (`/remote.php/dav/calendars/<user>/inbox/`).
- Afficher les invitations en attente.
- Permettre d'**accepter**, **refuser** ou **accepter provisoirement**.
- Ajouter l'événement au calendrier choisi si accepté.
- Répondre à l'organisateur selon le flux iTIP (CalDAV scheduling).
- Supprimer l'invitation de l'inbox après traitement.

## Phases

### Phase 1 — Recherche et design
- [x] Analyser comment Nextcloud gère les invitations CalDAV (inbox, outbox, `SCHEDULE-STATUS`, `PARTSTAT`).
- [x] Comprendre le format iTIP/iMIP utilisé par Nextcloud (`METHOD:REQUEST`, `REPLY`, `PARTSTAT`).
- [x] Identifier où l'app lit déjà les calendriers (`useCalendars`, `syncEvents`) et comment intégrer l'inbox.
- [~] Définir l'expérience utilisateur : notification ? onglet "Invitations" dans l'agenda ? badge dans l'UI ?
- [~] Rédiger le plan et les questions pour les maintainers.

### Phase 2 — Modèle et parsing
- [x] Ajouter un type `CalendarInvitation` (uid, summary, dtstart, dtend, organizer, attendees, status, location, talkUrl, ics, calendarId cible).
- [x] Créer `src/services/nextcloud/invitations.ts` :
  - `fetchInvitations(account)` : `REPORT` sur `/inbox/`.
  - `parseInvitation(ics)` : extraire les propriétés pertinentes (uid, summary, organizer, attendee avec `PARTSTAT=NEEDS-ACTION`, location, etc.).
  - `respondToInvitation(account, invitation, response, targetCalendar)` : PUT de l'événement répondu dans le calendrier cible.
- [x] Lire à la volée depuis l'inbox CalDAV ; pas de persistance WatermelonDB.

### Phase 3 — Intégration UI / UX
- [x] Ajouter un écran `/invitations` (onglet, drawer).
- [x] Afficher la liste avec actions Accepter / Refuser / Peut-être.
- [x] Permettre de choisir le calendrier cible dans un select.
- [x] Pull-to-refresh et polling périodique.
- [x] Clés i18n (en, fr).
- [~] Badge dans `CalendarDrawer` (compteur fonctionne ; l'entrée du drawer indique les invitations, voir Phase 4).

### Phase 4 — Tests et validation
- [x] Tests unitaires pour `parseInvitation`, `fetchInvitations` et `respondToInvitation` (`__tests__/services/nextcloud/invitations.test.ts`).
- [x] `yarn tsc --noEmit` OK.
- [x] `yarn jest --ci` OK (72/72 suites, 671 tests).
- [~] Test sur émulateur : l'app démarre, l'écran Invitations s'ouvre, charge les invitations, et l'acceptation écrit l'événement dans le calendrier cible. Le crash `ical.js` / `EventEmitter` n'a pas été reproduit sur le build actuel.

### Phase 5 — Livraison
- [x] Branche `feature/caldav-invitations` depuis `upstream/dev`.
- [x] Commiter avec Conventional Commits.
- [~] Pousser et mettre à jour la PR contre `upstream/dev`.
- [~] Rédiger la réponse au maintainer avec captures d'écran.

## Décisions techniques

- **Protocole** : iCal / iTIP (RFC 5546) pour les réponses. Nextcloud gère le scheduling CalDAV côté serveur, donc on envoie le `REPLY` au bon endpoint.
- **Stockage** : les invitations sont lues depuis l'inbox CalDAV, pas nécessairement persistées localement, sauf si besoin de notification offline.
- **Permissions** : si l'utilisateur refuse, l'événement n'est pas ajouté et l'inbox est nettoyée.
- **Talk** : si l'invitation contient `LOCATION` avec `/call/`, le bouton *Rejoindre la salle Talk* s'affichera comme pour les événements classiques (issue #186).

## Découvertes de la phase 1

### Inbox CalDAV

- L'inbox utilisateur est exposé sous `/remote.php/dav/calendars/<davUserId>/inbox/`.
- C'est une collection `schedule-inbox` (RFC 6638) ; un `PROPFIND Depth:1` renvoie les ressources présentes, un `REPORT calendar-query` avec `<c:calendar-data/>` permet de lire le contenu ICS de chaque message.
- Les messages dans l'inbox contiennent normalement `METHOD:REQUEST` (invitation) ou `METHOD:REPLY` (réponse d'un autre participant). Pour cette feature, on filtre `METHOD:REQUEST` avec `VEVENT`.

### Format d'une invitation

Exemple minimal trouvé dans la documentation et les RFCs :

```ics
BEGIN:VCALENDAR
VERSION:2.0
METHOD:REQUEST
PRODID:-//Sabre//Sabre VObject 4.0//EN
BEGIN:VEVENT
UID:xxx
DTSTAMP:...
SEQUENCE:0
DTSTART:...
DTEND:...
SUMMARY:Invitation
ORGANIZER;CN=Alice:mailto:alice@example.com
ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;CN=Bob:mailto:bob@example.com
END:VEVENT
END:VCALENDAR
```

- Le `PARTSTAT=NEEDS-ACTION` indique que l'invitation est en attente.
- L'organisateur est dans `ORGANIZER` ; l'invité courant est l'un des `ATTENDEE`.
- L'app sait déjà parser `ATTENDEE` et `ORGANIZER` via `caldav-parse.ts`.

### Réponse à une invitation

Deux approches possibles pour notifier l'organisateur :

1. **Approche serveur (recommandée)** : accepter l'invitation en créant le VEVENT dans un calendrier de l'utilisateur avec `PARTSTAT=ACCEPTED|TENTATIVE|DECLINED`, `DTSTAMP` mis à jour. Nextcloud envoie alors automatiquement le `METHOD:REPLY` à l'organisateur si le scheduling est activé.
2. **Approche client iTIP** : générer un `VCALENDAR` avec `METHOD:REPLY` et l'envoyer par POST sur l'outbox CalDAV ou par email (iMIP). C'est plus complexe et dépend de la configuration serveur.

La première approche est la plus fiable et celle utilisée par les clients CalDAV classiques (Thunderbird, Apple Calendar, etc.).

### Points d'intégration identifiés dans le code

- `src/services/nextcloud/caldav.ts` : `davFetch`, `calUrl`, `splitResponses`, `reportCalendarObjects` sont réutilisables pour l'inbox.
- `src/utils/caldav-parse.ts` : `parseIcsItem` parse déjà `ATTENDEE`/`ORGANIZER`, il faut juste extraire `METHOD` et `PARTSTAT`.
- `src/utils/ics.ts` : `buildIcs` génère des ICS sans `METHOD` ; on pourra l'adapter pour lire l'invitation et l'écrire dans le calendrier cible.
- `app/(tabs)/calendar/index.tsx` et `CalendarDrawer` : le drawer latéral est le point naturel pour ajouter un lien "Invitations".
- `app/(tabs)/_layout.tsx` : ajouter un troisième onglet "Invitations" est possible mais réduit la place pour les libellés.
- `src/types/index.ts` : le type `CalendarEvent` est presque utilisable pour une invitation ; il manque `partstat`, `method` et `organizerName`.

## Itération — Modifier sa réponse après acceptation

Cas utilisateur : l'utilisateur a accepté une invitation, puis ne peut finalement plus y participer. Il doit pouvoir changer son statut `PARTSTAT` et notifier l'organisateur.

### Implémentation

- `src/services/nextcloud/invitations.ts` : `updateAttendeeStatus(account, event, response)` :
  - Récupère le VEVENT depuis le calendrier (`GET` sur `event.href`).
  - Identifie l'`ATTENDEE` correspondant au compte (`findTargetAttendee`).
  - Met à jour `PARTSTAT` et `RSVP` de l'attendee.
  - Pour `accepted` / `tentative` : `PUT` de l'événement mis à jour dans le calendrier.
  - Pour `declined` : envoi d'un `METHOD:REPLY` puis `DELETE` de l'événement du calendrier.
  - Dans tous les cas : envoi d'un `METHOD:REPLY` via la CalDAV outbox (`POST`) pour notifier l'organisateur.
- `src/features/invitations/hooks/useUpdateAttendeeStatus.ts` : hook React gérant le mutation state, la mise à jour WatermelonDB (`patchByUid` / `removeWhere`) et l'affichage d'erreur.
- `app/event/[uid].tsx` : section "Ma participation" affichée si l'utilisateur courant est dans la liste des attendees. Boutons Accepter / Peut-être / Refuser avec le statut actuel mis en valeur.
- `src/utils/attendees.ts` : helpers `isAttendeeOfAccount`, `findAttendeeForAccount`, `getAttendeePartstat`, `isCurrentUserAttendee`.
- `src/utils/ics.ts` : `attendeeLines` préserve `partstat` et `role` des attendees pour ne pas réinitialiser `PARTSTAT=NEEDS-ACTION` à l'édition.
- i18n : clés `event.myParticipation`, `event.participationAccepted`, `event.participationTentative`, `event.participationDeclined`, `event.participationNeedsAction`.
- Tests unitaires : `updateAttendeeStatus` et `useUpdateAttendeeStatus`.

### Points de vigilance

- L'utilisateur peut-être un attendee d'un événement récurrent. Pour la v1, la réponse s'applique au maître (`event.href`) ; l'exception n'est pas traitée séparément.
- Le serveur Nextcloud propage le `REPLY` à l'organisateur, qui peut ensuite informer les autres participants.

## Améliorations futures (v2)

- **Notifications push / OCS** : investiguer si l'app Calendar de Nextcloud génère une notification OCS (`/ocs/v2.php/apps/notifications/api/v2/notifications`) à la réception d'une invitation. Si oui, utiliser `notify_push` ou le polling OCS pour alerter l'utilisateur sans lire l'inbox CalDAV à chaque ouverture. Le contenu et les actions resteraient cependant lus depuis le CalDAV inbox.
- **Réponse iTIP explicite** : pour les serveurs qui ne génèrent pas de `REPLY` automatiquement, ajouter une option pour envoyer un `METHOD:REPLY` directement au serveur de l'organisateur.
- **Widget / écran d'accueil** : afficher le nombre d'invitations en attente sur le widget Android/iOS.

## Prochaine étape

Pousser le commit et répondre au maintainer de la PR #226 avec un use case détaillé et les captures d'écran du flux testé sur émulateur.

### Décisions validées

| Sujet | Décision | Justification |
|-------|----------|---------------|
| Emplacement UI | Section "Invitations" dans le drawer + badge sur l'icône menu | Moins invasif qu'un 3ème onglet ; cohérent avec le compte et les calendriers déjà présents dans `CalendarDrawer`. |
| Calendrier cible | Picker à la volée au moment de l'acceptation | L'utilisateur choisit explicitement où ajouter l'événement. On peut mémoriser le dernier choix pour accélérer la suite. |
| Réponse organisateur | PUT dans le calendrier cible, serveur gère le `REPLY` | C'est la méthode CalDAV standard, supportée par Nextcloud et les clients Thunderbird/Apple. |
| Persistance | Lecture à la volée depuis l'inbox, pas de WatermelonDB | Une invitation traitée (acceptée/déclinée) disparaît de l'inbox et de l'UI. Pas besoin de persister localement. |

### Questions à valider avant implémentation

1. **Emplacement dans l'UI** :
   - **A.** Ajouter un onglet "Invitations" dans la barre de navigation principale (`app/(tabs)/_layout.tsx`) avec un badge de compteur.
   - **B.** Ajouter une section "Invitations" dans le drawer latéral du calendrier (`CalendarDrawer`), qui ouvre un écran dédié.
   - **C.** Les deux : onglet + badge sur mobile, entrée drawer pour le détail.

2. **Choix du calendrier cible** :
   - **A.** Utiliser le calendrier par défaut / premier calendrier modifiable de l'utilisateur.
   - **B.** Proposer un picker de calendrier au moment de l'acceptation.
   - **C.** Mémoriser le dernier calendrier choisi pour les prochaines invitations.

3. **Mode de réponse à l'organisateur** :
   - **A.** Faire confiance au serveur Nextcloud : on PUT l'event accepté dans le calendrier cible et on laisse le serveur envoyer le `REPLY`.
   - **B.** Générer et POST explicitement un `METHOD:REPLY` (approche iTIP) — plus complexe, peut ne pas être supporté par tous les serveurs.

## Captures d'écran du flux testé (émulateur Android 36, 1080×2400)

Captures stockées dans `.github/pr-assets/` :

- `invitations-list.png` — liste des invitations en attente avec actions Accepter / Refuser / Peut-être.
- `invitations-accepted.png` — inbox vide après acceptation.
- `calendar-after-accept.png` — calendrier avec l'événement ajouté au jour choisi.

4. **Persistence offline** :
   - **A.** Stocker les invitations dans WatermelonDB (table `invitations`) pour les afficher hors connexion.
   - **B.** Les lire à la volée depuis l'inbox (pas de persistance locale, les invitations disparaissent si l'app est offline).
