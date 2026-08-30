# Scénario de test — Find a time / free-busy (#229)

## Prérequis backend

- Nextcloud local (Docker) avec 2 utilisateurs :
  - **admin** (organisateur) — calendrier " Personal"
  - **alice** (participante) — calendrier "Personal" avec un événement existant
- L'app connectée au compte **admin**

## Étapes du scénario

### Étape 1 — Préparation : créer un événement pour alice
- **Backend** : via curl CalDAV, créer un événement dans le calendrier de alice
  (ex: "Team standup" 10:00-10:30 le jour J)
- **Vérification** : l'événement existe dans le calendrier de alice (PROPFIND/GET)

### Étape 2 — Ouvrir l'app, créer un nouvel événement
- **UI** : tap sur le bouton "+" (FAB) → écran "New Event"
- **Capture** : `01-new-event.png` — formulaire vide

### Étape 3 — Remplir le titre et ajouter un participant
- **UI** : saisir "Planning meeting" dans le champ titre
- **UI** : taper "alice" dans le champ Participants, sélectionner alice dans les suggestions
- **Capture** : `02-attendee-added.png` — participant alice ajouté

### Étape 4 — Vérifier l'apparition du bouton "Find a time"
- **UI** : le bouton "Find a time" apparaît sous le champ Participants
- **Capture** : `03-find-time-button.png` — bouton visible

### Étape 5 — Ouvrir le bottom sheet "Find a time"
- **UI** : tap sur "Find a time"
- **Backend** : POST VFREEBUSY vers le scheduling outbox de admin
- **Capture** : `04-find-time-loading.png` — spinner "Checking availability…"

### Étape 6 — Vérifier la timeline de disponibilité
- **UI** : le sheet affiche trois jours, les périodes occupées et la disponibilité de alice
- **Vérification** :
  - alice est marquée "Available"
  - la plage 10:00-10:30 de alice est affichée comme occupée
  - la brique de l'événement apparaît au jour et à l'heure sélectionnés
- **Capture** : `05-find-time-suggestions.png` — timeline + statut alice

### Étape 7 — Déplacer l'événement
- **UI** : faire glisser la poignée de la brique vers une plage libre
- **Vérification** : seule la brique se déplace ; la timeline et le sheet restent fixes pendant le drag
- **Vérification** : un glissement commencé hors de la poignée fait défiler le sheet normalement
- **UI** : la bordure est verte sur une plage libre et rouge sur une plage occupée
- **Capture** : `06-slot-selected.png` — brique déplacée avec retour visuel

### Étape 8 — Appliquer le créneau
- **UI** : relâcher la brique sur une plage libre
- **UI** : le sheet reste ouvert et les dates start/end du formulaire sont mises à jour
- **UI** : fermer le sheet pour vérifier les nouvelles dates du formulaire
- **Capture** : `07-slot-applied.png` — formulaire avec nouvelles dates

### Étape 9 — Test participant externe (disponibilité inconnue)
- **UI** : ajouter un participant externe (ex: "external@gmail.com")
- **UI** : rouvrir "Find a time"
- **Backend** : le serveur retourne "3.7;Could not find principal" pour l'externe
- **Vérification** : external@gmail.com affiché comme "Unknown"
- **Capture** : `08-external-unknown.png` — statut "Unknown" pour l'externe

### Étape 10 — Sauvegarder l'événement
- **UI** : tap sur "Save Event"
- **UI** : retour au calendrier, l'événement apparaît
- **Capture** : `09-event-saved.png` — calendrier avec le nouvel événement

## GIF final

Assembler les captures 01→09 en un GIF animé avec ffmpeg :
```bash
ffmpeg -framerate 1 -pattern_type glob -i '*.png' -vf 'scale=540:1200' find-time-flow.gif
```
