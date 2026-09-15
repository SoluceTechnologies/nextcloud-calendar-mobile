# Scénario de test — Find a time / free-busy (#229)

## Prérequis backend

- Nextcloud local (Docker) avec 3 comptes de test :
  - **admin** (organisateur) — mot de passe `admin123`
  - **testuser** (participant occupé le matin)
  - **bob** (participant occupé l'après-midi)
- L'application connectée au compte **admin**.

### Commandes de mise en place (Docker)

Lancer un conteneur Nextcloud local :

```bash
docker run -d --name nc-findtime \
  -p 127.0.0.1:8080:80 \
  -e NEXTCLOUD_ADMIN_USER=admin \
  -e NEXTCLOUD_ADMIN_PASSWORD=admin123 \
  -e NEXTCLOUD_TRUSTED_DOMAINS=10.0.2.2 \
  nextcloud

# Installation en ligne de commande (nécessaire une seule fois)
docker exec -u www-data nc-findtime php occ maintenance:install \
  --admin-user admin \
  --admin-pass admin123 \
  --database sqlite \
  --database-name nextcloud \
  --database-host 127.0.0.1

# Activer l'application Calendrier
docker exec -u www-data nc-findtime php occ app:enable calendar

# Ajouter l'adresse visible par l'émulateur (10.0.2.2 = hôte) aux trusted_domains
docker exec -u www-data nc-findtime php occ config:system:set trusted_domains 1 --value=10.0.2.2:8080

# Créer les participants (un e-mail est nécessaire pour l'autocomplétion)
docker exec -u www-data -e NC_PASS='FindTimeEmulatorTest2026!' nc-findtime php occ user:add --password-from-env testuser
docker exec -u www-data -e NC_PASS='BobEmulatorPass2026!' nc-findtime php occ user:add --password-from-env bob
docker exec -u www-data nc-findtime php occ user:setting testuser settings email testuser@example.local
docker exec -u www-data nc-findtime php occ user:setting bob settings email bob@example.local

# L'adresse e-mail de l'organisateur doit correspondre au compte connecté
# (l'app génère admin@<hostname> avec le hostname de l'URL serveur)
docker exec -u www-data nc-findtime php occ user:setting admin settings email admin@10.0.2.2
```

Créer un événement occupant pour **testuser** le 01/09 (14:00-15:00, heure locale Europe/Paris) :

```bash
printf 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//NONSGML v1.0//EN\r\nBEGIN:VEVENT\r\nUID:test-busy-event@test\r\nDTSTAMP:20260831T200000Z\r\nDTSTART:20260901T120000Z\r\nDTEND:20260901T130000Z\r\nSUMMARY:Testuser busy slot\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n' > /tmp/test-busy.ics
curl -u testuser:'FindTimeEmulatorTest2026!' \
  --upload-file /tmp/test-busy.ics \
  'http://127.0.0.1:8080/remote.php/dav/calendars/testuser/personal/test-busy.ics'
```

Créer un événement occupant pour **bob** le 01/09 (15:00-16:00, heure locale Europe/Paris) :

```bash
printf 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//NONSGML v1.0//EN\r\nBEGIN:VEVENT\r\nUID:bob-busy-event@test\r\nDTSTAMP:20260831T200000Z\r\nDTSTART:20260901T130000Z\r\nDTEND:20260901T140000Z\r\nSUMMARY:Bob busy slot\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n' > /tmp/bob-busy.ics
curl -u bob:'BobEmulatorPass2026!' \
  --upload-file /tmp/bob-busy.ics \
  'http://127.0.0.1:8080/remote.php/dav/calendars/bob/personal/bob-busy.ics'
```

Définir les heures de travail (09:00-18:00, lun-ven) pour que les plages en dehors apparaissent hachurées (`BUSY-UNAVAILABLE`) :

```bash
for user in testuser bob; do
  cat > /tmp/$user-availability.xml <<'XMLEOF'
<?xml version="1.0"?>
<D:propertyupdate xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:set>
    <D:prop>
      <C:calendar-availability><![CDATA[BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//NONSGML v1.0//EN
BEGIN:VTIMEZONE
TZID:Europe/Paris
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VAVAILABILITY
BEGIN:AVAILABLE
DTSTART;TZID=Europe/Paris:19700101T090000
DTEND;TZID=Europe/Paris:19700101T180000
UID:wh-$user
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
END:AVAILABLE
END:VAVAILABILITY
END:VCALENDAR]]></C:calendar-availability>
    </D:prop>
  </D:set>
</D:propertyupdate>
XMLEOF
  pass=$([ "$user" = "testuser" ] && echo 'FindTimeEmulatorTest2026!' || echo 'BobEmulatorPass2026!')
  curl -u "$user:$pass" -X PROPPATCH -H 'Content-Type: text/xml; charset=utf-8' \
    --data @/tmp/$user-availability.xml \
    "http://127.0.0.1:8080/remote.php/dav/calendars/$user/inbox/"
done
```

Pour que l'émulateur Android accède au serveur hôte via `10.0.2.2:8080` :

```bash
adb reverse tcp:8081 tcp:8081
```

## Étapes du scénario utilisateur

### Étape 0 — Connexion
- Saisir l'URL : `http://10.0.2.2:8080`
- Saisir le nom d'utilisateur : `admin`
- Saisir le mot de passe : `admin123`
- Tap sur **Connect**
- Attendre la synchronisation du calendrier
- **Capture** : `00-login.png`

### Étape 1 — Créer un nouvel événement
- Tap sur le bouton **+** en bas à droite de l'écran calendrier
- **Capture** : `01-new-event.png` — formulaire vide

### Étape 2 — Remplir le titre et ajouter les participants
- Saisir `Find a time test` dans le champ titre
- Dans le champ **Attendees**, ajouter `testuser`, puis `bob`
- **Capture** : `02-attendees-added.png`

### Étape 3 — Vérifier l'apparition du bouton "Find a time"
- Le bouton **Find a time** apparaît sous le champ Participants
- **Capture** : `03-find-time-button.png`

### Étape 4 — Ouvrir le bottom sheet "Find a time"
- Tap sur **Find a time**
- L'appel free-busy est envoyé au serveur
- **Capture** : `04-find-time-loading.png` — spinner "Checking availability…"

### Étape 5 — Vérifier la liste de suggestions
- Le sheet affiche la liste des créneaux suggérés
- Vérifier :
  - chaque ligne indique le jour, la plage horaire et le statut (« Everyone free » ou les noms des participants occupés)
  - le créneau correspondant à l'heure actuelle de l'événement est marqué « Current »
  - les chips participants en bas affichent testuser et bob avec une pastille de couleur
- **Capture** : `05-find-time-suggestions.png`

### Étape 5b — Test du mode permissif
- Désactiver le toggle **Everyone must be free**
- Tap sur le chip de `bob` pour le passer en optionnel
- Vérifier que de nouveaux créneaux apparaissent, y compris sur la plage 15:00-16:00 de bob
- Réactiver **Everyone must be free**
- **Capture** : `05b-permissive-mode.png`

### Étape 6 — Appliquer une suggestion (fast path)
- Tap sur un créneau suggéré (ex. 16:00-17:00)
- Vérifier que le sheet se ferme et que les champs **Start** / **End** du formulaire sont mis à jour
- **Capture** : `06-slot-applied.png`

### Étape 7 — Ouvrir l'explorateur plein écran
- Rouvrir **Find a time**, puis tap sur **Explore timeline**
- Vérifier :
  - la ligne « Everyone » en haut montre les créneaux occupés fusionnés de 14:00 à 16:00
  - une ligne par participant : la plage 14:00-15:00 sur la ligne de testuser, 15:00-16:00 sur celle de bob
  - la brique de l'événement apparaît à l'heure actuelle sur la ligne « Everyone »
- **Capture** : `07-find-time-lanes.png`

### Étape 8 — Placement par tap + sélecteur de jour
- Tap sur une zone libre de la ligne « Everyone » → la sélection se déplace, bordure verte
- Tap sur une zone occupée → la sélection se déplace, bordure rouge, bouton **Apply** désactivé
- Tap sur un autre jour dans le DayStrip → les lanes se re-rendent pour ce jour
- **Capture** : `08-tap-placement.png`

### Étape 9 — Zoom + Apply
- Utiliser les boutons **+**/**−** pour changer l'échelle horaire
- Revenir sur une zone libre, tap sur **Apply selected slot**
- Vérifier le retour au formulaire avec Start/End mis à jour
- **Capture** : `09-apply-lanes.png`

### Étape 10 — Test participant externe (disponibilité inconnue)
- Ajouter un participant externe, ex. `external@gmail.com`
- Rouvrir **Find a time**
- Vérifier que `external@gmail.com` est affiché comme **Unknown** et sa lane est grisée dans l'explorateur
- **Capture** : `10-external-unknown.png`

### Étape 11 — Sauvegarder l'événement
- Tap sur **Save Event**
- Retour au calendrier, l'événement apparaît à sa nouvelle position
- **Capture** : `11-event-saved.png`

## GIF final

Assembler les captures au format 540×1200, par exemple avec ffmpeg :

```bash
ffmpeg -framerate 1 -pattern_type glob -i '*.png' -vf 'scale=540:1200' find-time-flow.gif
```

Placer le GIF dans `/.github/assets/find-time-flow.gif` pour le `README.md`.
