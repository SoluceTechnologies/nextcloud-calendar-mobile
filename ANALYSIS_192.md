# Analyse — Feature #192 : Fetch contacts from account

## Objectif de l'issue
Lors de la création ou modification d'un événement, proposer une autocomplétion des participants à partir du compte Nextcloud plutôt que de taper l'adresse email à la main.

## Approche retenue dans cette PR
Utilisation de l'endpoint OCS Nextcloud **`/ocs/v2.php/apps/files_sharing/api/v1/sharees`**.

### Pourquoi ce endpoint
- Il retourne en **une seule requête** :
  - les **utilisateurs Nextcloud** (`shareType: 0`) ;
  - les **contacts du carnet d'adresses** (`shareType: 4`, présenté sous `data.emails`).
- C'est la même API utilisée par l'application Nextcloud Files pour l'autocomplétion des partages.
- Aucun module natif ou permission Android/iOS requis ; fonctionne donc sur les deux plateformes.

### Limites constatées
- Pour les **utilisateurs Nextcloud**, l'identifiant retourné est le `username`, pas forcément une adresse email. Le service `sharees.ts` ne conserve qu'une entrée si un email exploitable est présent (soit dans le label `Display Name (email)`, soit dans `shareWith`).
- L'endpoint dépend de l'application **Files** (files_sharing). Si elle est désactivée, l'autocomplete ne retournera que les contacts accessibles par d'autres moyens.
- Les **groupes**, **cercles**, **utilisateurs fédérés distants** ne sont pas traités comme des participants CalDAV standards ; ils pourraient l'être dans une future itération.

## Autres pistes évaluées

### 1. CardDAV direct (`/remote.php/dav/addressbooks/users/{davUserId}/...`)
- **Avantage** : ne dépend pas de l'app Files, retourne les vCards complètes.
- **Inconvénient** : requiert de parser du XML + des vCards, plusieurs requêtes possibles (PROPFIND + GET), plus coûteux à implémenter.
- **Usage futur** : bon candidat comme fallback si `sharees` échoue ou est indisponible.

### 2. Core autocomplete (`/ocs/v2.php/core/autocomplete/get`)
- **Avantage** : endpoint plus "standard" et indépendant de files_sharing.
- **Inconvénient** : dans nos tests locaux, il ne retournait **pas** les contacts du carnet d'adresses, seulement les utilisateurs du serveur.
- **Usage futur** : peut être utile pour chercher des utilisateurs sans l'app Files, mais ne couvre pas le besoin "contacts".

### 3. Contacts système Android / iOS
- **Avantage** : accès direct au carnet d'adresses synchronisé (DAVx⁵, Google, etc.).
- **Inconvénient** : demande l'ajout d'une librairie native (`expo-contacts`, `react-native-contacts`) et une permission runtime (`READ_CONTACTS` sur Android, `NSContactsUsageDescription` sur iOS).
- **Usage futur** : excellente complémentaire. Peut être proposée comme deuxième source de contacts, avec un bouton "Choisir dans les contacts" à côté du champ.

### 4. Résolution d'email utilisateur via `/ocs/v2.php/cloud/users/{userId}`
- **Avantage** : permet d'inviter des utilisateurs Nextcloud même si `sharees` ne donne que leur `username`.
- **Inconvénient** : une requête supplémentaire **par utilisateur** affiché, ou une batch plus complexe.
- **Usage futur** : à envisager si l'on veut inviter des collègues par leur compte Nextcloud sans connaître leur email.

## Pistes de développement futur

| Piste | Priorité | Complexité | Plateformes |
|-------|----------|------------|-------------|
| **Picker natif contacts Android/iOS** | Haute | Moyenne — ajout lib + permission | Android, iOS |
| **Résolution email utilisateur Nextcloud** | Moyenne | Moyenne — batch de requêtes OCS | Toutes |
| **Fallback CardDAV** | Moyenne | Élevée — parsing XML/vCard | Toutes |
| **Cache local contacts récents** | Moyenne | Moyenne — MMKV/WatermelonDB | Toutes |
| **Support groupes / cercles / fédération** | Basse | Élevée — logique invitation spécifique | Toutes |
| **Debounce + annulation AbortController** | Basse | Faible — remplacer le flag par `AbortSignal` | Toutes |

## Décisions techniques du code
- `useContactSuggestions` utilise `trailingDebounce` (outil existant du projet) et un nonce pour ignorer les résultats retardés.
- `EventForm` reçoit `account` de manière optionnelle : sans compte, le formulaire reste inchangé (compatibilité tests et rétrocompatibilité).
- Le nombre maximal de résultats est fixé à 25 par requête (`perPage=25`).
- Le service retourne un type `ShareeResult` distinct de `Attendee` pour ne pas polluer le modèle CalDAV.

## Test local
- Nextcloud 29 (Docker `nextcloud-test`) avec l'app `contacts` activée.
- Contact créé : `John Doe <john.doe@example.com>`.
- Émulateur Pixel 7 API 36 : l'autocomplétion affiche `John Doe` + email et sélection ajoute le participant.
