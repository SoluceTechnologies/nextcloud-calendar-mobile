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

### Étape 6 — Vérifier les slots suggérés
- **UI** : le sheet affiche une liste de créneaux libres + disponibilité de alice
- **Vérification** :
  - alice est marquée "Available"
  - les slots suggérés évitent la plage 10:00-10:30 (l'événement de alice)
  - au moins un slot est proposé
- **Capture** : `05-find-time-suggestions.png` — liste de slots + statut alice

### Étape 7 — Sélectionner un slot
- **UI** : tap sur un slot suggéré (ex: 11:00)
- **UI** : le bouton "Apply selected slot" apparaît
- **Capture** : `06-slot-selected.png` — slot sélectionné (highlight)

### Étape 8 — Appliquer le slot
- **UI** : tap sur "Apply selected slot"
- **UI** : le sheet se ferme, les dates start/end du formulaire sont mises à jour
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
