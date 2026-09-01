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

Créer un événement occupant pour **testuser** (14:00-15:00, heure locale Europe/Paris) :

```bash
printf 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//NONSGML v1.0//EN\r\nBEGIN:VEVENT\r\nUID:test-busy-event@test\r\nDTSTAMP:20260831T200000Z\r\nDTSTART:20260826T120000Z\r\nDTEND:20260826T130000Z\r\nSUMMARY:Testuser busy slot\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n' > /tmp/test-busy.ics
curl -u testuser:'FindTimeEmulatorTest2026!' \
  --upload-file /tmp/test-busy.ics \
  'http://127.0.0.1:8080/remote.php/dav/calendars/testuser/personal/test-busy.ics'
```

Créer un événement occupant pour **bob** (15:00-16:00, heure locale Europe/Paris) :

```bash
printf 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//NONSGML v1.0//EN\r\nBEGIN:VEVENT\r\nUID:bob-busy-event@test\r\nDTSTAMP:20260831T200000Z\r\nDTSTART:20260826T130000Z\r\nDTEND:20260826T140000Z\r\nSUMMARY:Bob busy slot\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n' > /tmp/bob-busy.ics
curl -u bob:'BobEmulatorPass2026!' \
  --upload-file /tmp/bob-busy.ics \
  'http://127.0.0.1:8080/remote.php/dav/calendars/bob/personal/bob-busy.ics'
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

### Étape 5 — Vérifier la timeline de disponibilité multi-participants
- Le sheet affiche la timeline du jour
- Vérifier :
  - testuser et bob apparaissent avec une pastille de couleur différente dans la liste
  - la plage 14:00-15:00 affiche la couleur de testuser
  - la plage 15:00-16:00 affiche la couleur de bob
  - les deux plages sont fusionnées de 14:00 à 16:00 avec les deux pastilles
  - la brique de l'événement apparaît à l'heure choisie
  - en défilant vers la liste des participants, les boutons de mode et les en-têtes de jours restent visibles en haut du sheet
- **Capture** : `05-find-time-timeline.png`

### Étape 5b — Test du mode "Certains peuvent être occupés"
- Tap sur **Some may be busy** au-dessus de la timeline
- Désactiver le toggle **Required** pour `bob`
- Vérifier :
  - la plage 15:00-16:00 n'est plus traitée comme occupée
  - la brique peut être posée de 15:00 à 16:00 (elle reste verte/bleu)
- Réactiver le mode **All free** et vérifier que la brique redevient rouge de 14:00 à 16:00
- **Capture** : `05b-permissive-mode.png`

### Étape 6 — Déplacer l'événement (snap visuel)
- Saisir la poignée de la brique et la glisser vers une plage libre
- Vérifier :
  - la brique reste sous le doigt
  - elle devient verte/bleu sur les créneaux libres
  - elle devient rouge sur les créneaux occupés
- **Capture** : `06-slot-selected.png`

### Étape 7 — Appliquer le créneau
- Relâcher la brique sur une plage libre (ex. 13:00-14:00 ou 16:00-17:00)
- Vérifier que les champs **Start** / **End** du formulaire sont mis à jour
- **Capture** : `07-slot-applied.png`

### Étape 8 — Test participant externe (disponibilité inconnue)
- Ajouter un participant externe, ex. `external@gmail.com`
- Rouvrir **Find a time**
- Vérifier que `external@gmail.com` est affiché comme **Unknown**
- **Capture** : `08-external-unknown.png`

### Étape 9 — Sauvegarder l'événement
- Tap sur **Save Event**
- Retour au calendrier, l'événement apparaît à sa nouvelle position
- **Capture** : `09-event-saved.png`

### Étape 10 — Drag avec auto-scroll
- Créer un événement long (par ex. 2 ou 3 heures) à 15:00
- Ajouter `testuser` et `bob`
- Ouvrir **Find a time**
- Saisir la poignée de la brique et glisser vers le haut ou le bas, au-delà du bord de l'écran
- Vérifier :
  - le `ScrollView` défile automatiquement dès que la brique approche du bord
  - le contrôle du drag n'est pas perdu
  - le défilement s'arrête quand la brique revient dans la zone centrale
- **Capture** : `10-drag-auto-scroll.png`

### Étape 11 — Snapping sur un créneau libre
- Relâcher la brique sur une zone verte
- Vérifier :
  - la brique se snap à un multiple de 15 minutes
  - l'heure de début est mise à jour dans le formulaire
- **Capture** : `11-snapped-slot.png`

## GIF final

Assembler les captures au format 540×1200, par exemple avec ffmpeg :

```bash
ffmpeg -framerate 1 -pattern_type glob -i '*.png' -vf 'scale=540:1200' find-time-flow.gif
```

Placer le GIF dans `/.github/assets/find-time-flow.gif` pour le `README.md`.
