# Assistant vocal — Guide utilisateur

Comment utiliser l'assistant vocal de l'application, ce qu'il peut faire et les
points à connaître.

## Activer l'assistant

**Réglages → Assistant vocal** : activez l'assistant **par compte** — chaque
compte a son propre interrupteur (l'agent IA n'existe pas sur tous les
serveurs). Le bouton micro n'apparaît que pour un compte activé.

Sur cet écran vous pouvez aussi :

- **Reconnaissance sur l'appareil** : préférer le traitement vocal local quand
  votre téléphone le permet (l'audio ne part pas sur le réseau).
- **Agendas comptant pour la dispo** : choisir quels calendriers bloquent les
  créneaux proposés par « trouve-moi un créneau ».

## Ouvrir l'assistant

Depuis l'écran Calendrier, tapez l'icône **microphone** (barre du haut). La
fenêtre « Voice assistant » s'ouvre :

- **Micro central** : appuyez pour parler (reconnaissance vocale sur l'appareil)
- **Champ « Type a command… »** : alternative — écrire la commande au clavier
- Les réponses sont **lues à voix haute** et affichées en texte

## Ce que vous pouvez demander

### Actions rapides (traitées localement, instantanées)

| Dire par exemple | Effet |
|---|---|
| « mon agenda », « c'est quoi mon programme » | Résumé du jour demandé |
| « ma prochaine réunion » | Détails du prochain événement |
| « réunion dentiste demain à 14h30 » | **Création** — une carte de confirmation s'affiche avant d'écrire |
| « décale le rdv de demain à 16h » | **Déplacement** — confirmation requise |
| « supprime la réunion de vendredi » | **Suppression** — confirmation requise |
| « trouve-moi un créneau jeudi après-midi » | Propositions de plages libres |

### Questions libres (envoyées à l'agent IA Nextcloud)

Toute phrase qui n'est pas une commande ci-dessus part à l'agent IA du serveur :
résumé de semaine, questions générales, demandes complexes. Exemples :
« fais-moi un résumé de ma semaine », « qu'est-ce que j'ai de prévu avec le
comité ? ».

**⚠️ Mutations par l'agent** : si votre phrase contient un verbe de modification
(créer, déplacer, supprimer, reporter…) sans date précise interprétable, l'app
affiche d'abord **« Send this request to the Nextcloud agent? It can modify
your calendar. »** — toujours **Confirm** ou **Cancel** explicitement. L'agent
peut réellement modifier vos événements : soyez précis dans la consigne (titre,
date, heure, calendrier).

## Conversation

L'assistant garde le **contexte de la conversation** : vous pouvez répondre à
ses questions (« laquelle veux-tu décaler ? » → « celle de midi ») sans répéter
le sujet. La langue de réponse suit celle de votre dernier message.

## Conseils pour de bonnes commandes

- **Nommez les événements exactement** — la recherche locale est par
  sous-chaîne du titre (« Test agent » trouve « Test agent », pas
  « le rendez-vous Test agent »).
- **Donnez le jour** pour cibler : « du 5 novembre » plutôt que « midi » seul
  (midi = aujourd'hui).
- Si l'agent demande des précisions, répondez simplement dans le champ — la
  conversation continue.

## Limites connues

- La reconnaissance vocale utilise le pack de langue de l'appareil ; l'app
  peut aussi fonctionner en saisie clavier dans n'importe quelle langue.
- Les actions faites par l'agent distant ne sont pas toujours re-synchronisées
  immédiatement dans la vue — rouvrez l'écran ou changez de semaine pour
  forcer le rafraîchissement.
