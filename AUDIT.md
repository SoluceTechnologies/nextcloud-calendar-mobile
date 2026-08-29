# Audit technique — Nextcloud Calendar Mobile

Document pédagogique destiné à l'équipe de développement.  
Pour chaque point de l'audit, on retrouve :

1. **Constat** — ce que fait (ou ne fait pas) le code aujourd'hui.
2. **Conséquences du code actuel** — risques et impacts pour l'utilisateur, la qualité ou la maintenance.
3. **Proposition d'amélioration** — solution technique concrète.
4. **Conséquences de l'amélioration** — ce que cela apporte, et ce qu'il faut surveiller.

---

## Contexte

- **Stack** : React Native 0.86, Expo 57, TypeScript strict, WatermelonDB 0.28, Zustand 5.
- **Protocole** : CalDAV natif vers Nextcloud, parsing iCalendar via `ical.js`.
- **Stockage** : WatermelonDB locale, Zustand persisté via MMKV, credentials dans `expo-secure-store`.
- **Audit** : réalisé en lecture seule, sans modification du code. Quatre sous-domaines ont été analysés en parallèle : sécurité/réseau, synchronisation CalDAV, performance/architecture, qualité du code et fonctionnalités.

---

## 1. Sécurité et réseau

### 1.1 Le trafic HTTP en clair est autorisé par défaut

#### Constat
Dans `app.config.ts` :

- iOS : `NSAllowsArbitraryLoads: true` désactive App Transport Security.
- Android : `usesCleartextTraffic: true` autorise le trafic non chiffré.

De plus, le plugin `withAndroidNetworkSecurityConfig` configure `<certificates src="user" />` et `cleartextTrafficPermitted="true"`.

#### Conséquences du code actuel
N'importe quel réseau local ou public peut faire baisser une connexion HTTPS vers HTTP sans que l'application ne le refuse. Un attaquant en position d'interception (MITM) peut alors récupérer les credentials envoyés en Basic Auth, ou injecter des réponses CalDAV corrompues.

#### Proposition d'amélioration
1. Désactiver `NSAllowsArbitraryLoads` sur iOS.
2. Désactiver `usesCleartextTraffic` sur Android.
3. Supprimer `<certificates src="user" />` du network security config.
4. Si un utilisateur saisit explicitement un serveur local HTTP, ajouter ce domaine à une liste d'exceptions explicite (par ex. `NSExceptionDomains` iOS ou `<domain-config cleartextTrafficPermitted="true">` Android).

#### Conséquences de l'amélioration
- Les credentials ne transitent plus jamais en clair par défaut.
- Les certificats utilisateurs ne sont plus automatiquement trustés (réduction du risque MITM par certificat racine installé).
- L'expérience utilisateur reste identique pour les serveurs HTTPS standards. Seuls les cas "HTTP local explicite" nécessiteront une étape de confirmation.

---

### 1.2 Hostname verification contourné par le pinning de certificats

#### Constat
Dans les modules natifs `tls-trust` (Android `TlsTrustModule.kt` et iOS `TlsTrustModule.swift`), la vérification du hostname est désactivée lorsqu'un certificat est pinné.

#### Conséquences du code actuel
Un attaquant qui obtient un certificat auto-signé avec un pin correspondant mais un hostname différent peut intercepter le trafic d'un autre serveur. Le pinning protège contre les CA compromises, mais pas contre un mauvais hostname si la vérification est désactivée.

#### Proposition d'amélioration
Conserver la vérification hostname (`SSLSession` / `URLSession` evaluation) **avant ou en complément** du pinning. Si un certificat est pinné mais que le hostname ne correspond pas, refuser la connexion.

#### Conséquences de l'amélioration
- Le pinning reste utile sans créer de faille secondaire.
- Les certificats auto-signés doivent avoir le bon CN/SAN, ce qui est le comportement attendu.

---

### 1.3 Validation insuffisante des URLs serveur et QR code

#### Constat
- `app/(auth)/setup.tsx` normalise l'URL en ajoutant `https://` si absente, mais ne valide pas le schéma.
- `features/account/utils/ncLoginUrl.ts` décode les informations d'un QR code sans imposer HTTPS.
- `services/nextcloud/caldav.ts:16` résout les URLs relatives contre `account.baseUrl` sans vérifier l'origine.

#### Conséquences du code actuel
- Un QR code malveillant peut diriger l'application vers un serveur HTTP arbitraire.
- Une réponse CalDAV contenant un `href` absolu vers un autre domaine peut provoquer des requêtes non prévues (SSRF).

#### Proposition d'amélioration
1. Rejeter tout schéma autre que `https://` par défaut.
2. Valider l'URL avec `new URL()` dans un `try/catch`.
3. Vérifier que les URLs relatives résolues restent dans l'origine du compte.
4. Proposer une option explicite "autoriser HTTP" pour les serveurs locaux, avec avertissement.

#### Conséquences de l'amélioration
- Réduction drastique des risques d'ouverture accidentelle sur un domaine malveillant.
- Protection contre les SSRF via CalDAV.
- Légère friction UX pour les serveurs HTTP locaux (justifiée par le gain de sécurité).

---

## 2. Synchronisation CalDAV et robustesse

### 2.1 Un calendrier défaillant bloque toute la synchronisation

#### Constat
`fetchEventsForCalendars` utilise `settleAllOrThrow` (`src/utils/settle.ts`). Si une seule promesse échoue, l'erreur est propagée et l'ensemble des résultats est perdu.

#### Conséquences du code actuel
- Un calendrier "subscribed" avec une URL `webcal` invalide ou un serveur distant en panne empêche l'affichage de **tous** les événements.
- L'utilisateur voit un calendrier vide, sans savoir quel calendrier pose problème.

#### Proposition d'amélioration
Remplacer `settleAllOrThrow` par une version "best effort" :

```ts
export async function settleAllBestEffort<T>(
  tasks: ReadonlyArray<() => Promise<T[]>>,
): Promise<{ results: T[]; errors: { index: number; reason: unknown }[] }> {
  const results = await Promise.allSettled(tasks.map((task) => task()));
  const values: T[] = [];
  const errors: { index: number; reason: unknown }[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      values.push(...(results[i] as PromiseFulfilledResult<T[]>).value);
    } else {
      errors.push({ index: i, reason: (results[i] as PromiseRejectedResult).reason });
    }
  }
  return { results: values, errors };
}
```

Dans l'UI, afficher un indicateur par calendrier en erreur et logger côté serveur (en dev).

#### Conséquences de l'amélioration
- Un calendrier cassé n'impacte plus les autres.
- L'utilisateur peut continuer à consulter ses calendriers sains et identifier la source du problème.
- Les erreurs restent visibles pour le support/debug.

---

### 2.2 Pas de retry exponentiel sur les requêtes réseau

#### Constat
`davFetch` et `trustedFetch` envoient une seule requête. En cas de 429, 502, 503 ou timeout, l'opération échoue immédiatement.

#### Conséquences du code actuel
- Sur un réseau instable (train, tunnel, Wi-Fi faible), une sync sur deux échoue.
- L'utilisateur ne voit aucune tentative de récupération.
- Le polling toutes les 30s (`useCalendars`) ne résout pas les erreurs ponctuelles.

#### Proposition d'amélioration
Implémenter un retry avec backoff exponentiel dans `trustedFetch` :

```ts
async function retryableFetch(
  url: string,
  init: Init,
  maxRetries = 3,
  baseDelay = 500,
): Promise<TrustedResponse> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await trustedFetch(url, init);
      if (res.status === 429) {
        const retryAfter = parseRetryAfter(res.headers.get('Retry-After'));
        await delay((retryAfter ?? baseDelay * 2 ** attempt) * 1000);
        continue;
      }
      if (res.status >= 500 && res.status < 600) {
        if (attempt < maxRetries) {
          await delay(baseDelay * 2 ** attempt);
          continue;
        }
      }
      return res;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) await delay(baseDelay * 2 ** attempt);
    }
  }
  throw lastError;
}
```

#### Conséquences de l'amélioration
- Résilience accrue sur réseau instable.
- Respect des en-têtes `Retry-After`.
- Coût : quelques centaines de millisecondes supplémentaires en cas d'erreur, mais une UX bien meilleure.

---

### 2.3 Écritures CalDAV sans `If-Match` / ETag

#### Constat
`putEvent` et `updateEvent` envoient un PUT sans en-tête `If-Match`. Le serveur accepte et écrase la ressource sans vérifier que le client avait la dernière version.

#### Conséquences du code actuel
- Si deux clients modifient le même événement en parallèle, la dernière écriture écrase la précédente sans avertissement.
- L'utilisateur peut perdre des modifications sans s'en apercevoir.

#### Proposition d'amélioration
1. Stocker l'ETag retourné par le serveur lors du fetch (via `getetag` dans les réponses multiget/report).
2. Ajouter une colonne `etag` dans le modèle `Event` de WatermelonDB.
3. Envoyer `If-Match: <etag>` dans `updateEvent`/`putEvent`.
4. Si le serveur répond `412 Precondition Failed`, recharger l'événement et proposer un écran de conflit à l'utilisateur.

#### Conséquences de l'amélioration
- Protection contre les pertes de données silencieuses.
- Gestion explicite des conflits.
- Nécessite un schéma DB en version 7 et une stratégie de résolution de conflit UX.

---

### 2.4 `localWriteEpoch` non persistant

#### Constat
`localWriteEpoch` est un compteur en mémoire (`src/database/sync.ts:130-138`). Il est incrémenté lors des écritures locales et comparé au début/fin du `syncEvents` pour détecter les écritures concurrentes.

#### Conséquences du code actuel
- Au redémarrage de l'application, le compteur repart à 0.
- Si l'app crash entre une écriture locale et le prochain sync, le pull distant peut écraser l'écriture locale.

#### Proposition d'amélioration
Remplacer le compteur par un timestamp monotone persistant (MMKV) ou utiliser le timestamp de dernière modification de WatermelonDB.

```ts
const LAST_WRITE_KEY = 'last_local_write_ms';

export function markLocalWrite(): void {
  storage.set(LAST_WRITE_KEY, Date.now());
}

export function localWriteEpoch(): number {
  return storage.getNumber(LAST_WRITE_KEY) ?? 0;
}
```

#### Conséquences de l'amélioration
- La protection contre les écrasements persiste après un crash ou un redémarrage.
- Le risque de perte de données locales est fortement réduit.

---

### 2.5 Parsing XML CalDAV par regex

#### Constat
`caldav.ts` utilise des expressions régulières pour extraire les balises `<d:href>`, `<d:sync-token>`, les couleurs, les privilèges, etc.

#### Conséquences du code actuel
- Un namespace différent (`c:href` au lieu de `d:href`), un espace de noms par défaut, ou un CDATA peut invalider l'extraction.
- Le calendrier disparaît silencieusement, sans message d'erreur.

#### Proposition d'amélioration
Adopter un parseur XML fiable comme `fast-xml-parser` :

```ts
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false });
const doc = parser.parse(xml) as CaldavMultistatus;
```

Adapter les fonctions `splitResponses`, `extractPropHref`, `fetchCalendars`, `syncCollection`, `fetchEventsByHrefs` pour utiliser le DOM structuré.

#### Conséquences de l'amélioration
- Robustesse face aux variantes de serveurs CalDAV (SabreDAV, DAVx5, etc.).
- Code plus maintenable et testable.
- Coût : ajout d'une dépendance (~70 ko) et refactorisation des fonctions de parsing.

---

## 3. Performance et architecture

### 3.1 Parsing ICS synchrone sur le thread principal

#### Constat
`parseIcsObjectsAsync` itère sur tous les objets ICS avec un `frameBudgetMs` de 8ms. Si le budget est dépassé, elle appelle `yieldToUI`. Cependant, sur un calendrier chargé (centaines d'événements ou série récurrente longue), le parsing reste majoritairement synchrone.

#### Conséquences du code actuel
- L'interface peut bloquer plusieurs frames, provoquant des saccades.
- Sur de très grandes bases, le splash de sync est visible.

#### Proposition d'amélioration
1. Augmenter le `frameBudgetMs` à 16ms (une frame complète à 60fps).
2. Chunker par nombre d'événements (par ex. traiter 10 objets ICS avant de rendre la main).
3. Envisager d'exécuter le parsing dans un worklet natif ou une background task pour les gros imports.

#### Conséquences de l'amélioration
- UI plus fluide pendant la synchronisation.
- Meilleure expérience sur les gros calendriers.
- Coût : synchronisation légèrement plus longue en temps total, mais meilleure perception utilisateur.

---

### 3.2 `buildDayIndex` recalculé à chaque changement d'événements

#### Constat
`buildDayIndex` (`features/calendar/utils/grid.ts`) reconstruit une `Map<string, GridEvent[]>` à chaque fois que la liste d'événements change.

#### Conséquences du code actuel
- Un commentaire dans le code signale un lag de ~500ms sur les calendriers chargés.
- L'indexation s'exécute dans `TimeGridView` à chaque notification WatermelonDB.

#### Proposition d'amélioration
Implémenter un cache avec clé de version :

```ts
const dayIndexCache = new Map<string, Map<string, GridEvent[]>>();

export function buildDayIndex(events: GridEvent[]): Map<string, GridEvent[]> {
  const version = events.map((e) => `${e._event.uid}-${e.start.getTime()}`).sort().join('|');
  const cached = dayIndexCache.get(version);
  if (cached) return cached;
  const index = /* logique actuelle */;
  dayIndexCache.set(version, index);
  return index;
}
```

Limiter la taille du cache (LRU) pour éviter une fuite mémoire.

#### Conséquences de l'amélioration
- Suppression du lag récurrent.
- Réutilisation de l'index si les événements n'ont pas changé.
- Attention à vider le cache lors d'un changement de compte ou de calendrier.

---

### 3.3 `useEventsForRange` effectue un tri à chaque notification

#### Constat
Dans `database/useEvents.ts`, le hook observe les événements puis appelle `.sort()` dans le callback d'abonnement.

#### Conséquences du code actuel
- Chaque notification de WatermelonDB déclenche un tri en O(n log n).
- Si plusieurs événements arrivent rapidement, le composant est re-trié plusieurs fois.

#### Proposition d'amélioration
1. Utiliser `useMemo` pour le tri.
2. Ou, si WatermelonDB le supporte, trier directement dans la requête avec `Q.sortBy('start', 'asc')`.

```ts
const events = useMemo(
  () => rows.map(mapEventToShared).sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime()),
  [rows],
);
```

#### Conséquences de l'amélioration
- Moins de calculs redondants.
- Réduction des re-rendus.
- Le tri reste correct visuellement.

---

### 3.4 Polling calendriers toutes les 30 secondes

#### Constat
`useCalendars` lance `syncCalendars` toutes les 30 secondes (`LIVE_POLL_MS = 30000`).

#### Conséquences du code actuel
- Requêtes inutiles hors ligne.
- Consommation batterie/données même quand l'application est au premier plan sans activité.

#### Proposition d'amélioration
1. Désactiver le polling lorsque le réseau est indisponible.
2. Déclencher la sync sur `ctag` différent via un premier fetch rapide, ou sur pull-to-refresh, ou sur retour au premier plan.
3. Conserver un polling plus espacé (par ex. 2 minutes) en fallback.

#### Conséquences de l'amélioration
- Moins de requêtes réseau.
- Meilleure autonomie batterie.
- La fraîcheur des données reste acceptable avec pull-to-refresh explicite.

---

## 4. Qualité du code et outillage

### 4.1 `// @ts-nocheck` sur les modèles WatermelonDB

#### Constat
`src/database/models/Event.ts` et `src/database/models/Calendar.ts` commencent par `// @ts-nocheck`, désactivant toute vérification TypeScript.

#### Conséquences du code actuel
- Les champs mal typés, les typos de nom de colonne ou les incompatibilités avec le schéma ne sont pas détectées à la compilation.
- Des bugs peuvent apparaître au runtime (par ex. champ optionnel mal géré).

#### Proposition d'amélioration
Supprimer `// @ts-nocheck` et typer les modèles avec les décorateurs WatermelonDB :

```ts
import { Model, field } from '@nozbe/watermelondb';

export default class Event extends Model {
  static table = 'events';

  @field('account_id') accountId!: string;
  @field('uid') uid!: string;
  // ...
}
```

Corriger les erreurs qui apparaissent.

#### Conséquences de l'amélioration
- Détection précoce des erreurs de type.
- Meilleure refactorabilité du code.
- Coût : temps de correction des erreurs existantes, généralement mineur.

---

### 4.2 `any` et casts non sécurisés

#### Constat
- `EventForm.tsx` utilise `event: any` pour les handlers de picker (`onChange` natifs).
- `caldav-parse.ts` utilise `as string` sur les valeurs `ical.js`.
- `services/nextcloud/nextcloud.ts` utilise `as string` sur les champs de l'API OCS.
- `utils/normalizeEvent.ts` utilise `as unknown as string`.

#### Consésequences du code actuel
- Perte de la "type safety".
- Risque de crash au runtime si la valeur retournée n'est pas une chaîne.
- Difficulté à refactoriser sans introduire de régressions.

#### Proposition d'amélioration
1. Remplacer `event: any` par `NativeSyntheticEvent<...>` ou les types spécifiques des composants `@react-native-community/datetimepicker`.
2. Ajouter des guards `typeof value === 'string'` avant d'utiliser les valeurs `ical.js`.
3. Utiliser des opérateurs de coalescence ou des validations sur les réponses API.

```ts
const displayName = typeof data?.displayname === 'string' ? data.displayname : '';
```

#### Conséquences de l'amélioration
- Moins d'erreurs runtime.
- Refactorisation plus sûre.
- Documentation du code améliorée par les types.

---

### 4.3 Absence d'ESLint, Prettier et de hooks pre-commit complets

#### Constat
- Pas de fichier `.eslintrc`, `.prettierrc` ou `eslint.config.*`.
- `.pre-commit-config.yaml` ne contient que le hook `gitleaks`.
- `package.json` n'inclut pas de dépendances ESLint/Prettier.

#### Conséquences du code actuel
- Le style de code est incohérent selon les contributeurs.
- Les `console.log`, les `any` et les imports non utilisés ne sont pas bloqués automatiquement.
- Les revues de code perdent du temps sur des détails de formatage.

#### Proposition d'amélioration
1. Installer `eslint`, `prettier`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-config-prettier`.
2. Créer `.eslintrc.js` avec les règles React Native et TypeScript.
3. Créer `.prettierrc`.
4. Ajouter `lint-staged` et Husky/Lefthook pour exécuter lint, prettier et `tsc --noEmit` avant chaque commit.

#### Conséquences de l'amélioration
- Qualité de code homogène.
- Détection automatique des `any`, `console.log`, imports morts.
- Revues de code concentrées sur la logique métier.
- Coût : une configuration initiale et un premier commit de formatage ("format the world").

---

## 5. Fonctionnalités et expérience utilisateur

### 5.1 Pas de recherche d'événements

#### Constat
Aucun champ de recherche n'est présent dans les vues Month, Week, Day ou Agenda.

#### Conséquences du code actuel
- Sur un calendrier avec des centaines d'événements, retrouver un événement ancien demande de scroller manuellement.
- L'application est moins compétitive face aux clients calendrier standards.

#### Proposition d'amélioration
Ajouter une barre de recherche dans le header :

1. Indexer les événements dans WatermelonDB par `summary`, `description`, `location`.
2. Filtrer localement les événements chargés avec un score de pertinence.
3. Proposer des filtres par calendrier et par période.

#### Conséquences de l'amélioration
- Navigation beaucoup plus rapide.
- Pas de dépendance réseau (recherche locale).
- Coût : ajout d'un écran et d'un hook de filtrage.

---

### 5.2 Pas de gestion RSVP / invitations

#### Constat
`EventForm.tsx` permet d'ajouter des participants par email, mais ne lit pas `PARTSTAT` et ne permet pas de répondre aux invitations.

#### Conséquences du code actuel
- L'utilisateur reçoit des invitations mais ne peut pas accepter/décliner depuis l'application.
- Le statut des participants n'est pas affiché.

#### Proposition d'amélioration
1. Parser `ATTENDEE` avec `PARTSTAT`, `ROLE`, `RSVP` dans `caldav-parse.ts`.
2. Ajouter un type `Attendee` enrichi.
3. Envoyer une mise à jour ICS avec `METHOD:REPLY` et `PARTSTAT:ACCEPTED|DECLINED`.
4. Afficher le statut des participants dans le détail de l'événement.

#### Conséquences de l'amélioration
- Workflow d'invitation complet.
- Meilleure intégration avec Nextcloud Calendar.
- Coût : gestion des permissions en écriture et des réponses multiples.

---

### 5.3 Support VTODO / tâches partiel

#### Constat
Le code parse les `VTODO` et les stocke avec `isTask: true`, mais il n'y a pas d'UI dédiée pour créer, terminer ou filtrer les tâches.

#### Conséquences du code actuel
- Les tâches Deck/Tasks sont affichées comme des événements, ce qui est confusant.
- L'utilisateur ne peut pas marquer une tâche comme terminée.

#### Proposition d'amélioration
1. Ajouter une vue/liste dédiée aux tâches.
2. Afficher `COMPLETED`/`STATUS`.
3. Permettre de cocher une tâche, ce qui envoie un `VTODO` mis à jour.

#### Conséquences de l'amélioration
- Intégration avec Nextcloud Tasks et Deck.
- Meilleure clarté entre événements et tâches.

---

## 6. Priorisation recommandée

### Immédiat (sécurité + robustesse)

1. Restreindre `NSAllowsArbitraryLoads` et `usesCleartextTraffic`.
2. Corriger `withAndroidNetworkSecurityConfig`.
3. Restaurer la hostname verification dans `tls-trust`.
4. Remplacer `settleAllOrThrow` par best effort.
5. Ajouter un retry exponentiel.
6. Ajouter `If-Match`/ETag.
7. Persister `localWriteEpoch`.

### Court terme (qualité)

8. ESLint + Prettier + pre-commit.
9. Supprimer `// @ts-nocheck` et typer les modèles.
10. Remplacer les `any`/casts non sécurisés.
11. Mémoïser `useEventsForRange`, `dotMap`, `buildDayIndex`.

### Moyen terme (fonctionnalités)

12. Recherche d'événements.
13. RSVP/invitations.
14. Support VTODO complet.
15. Tests E2E.

---

## Conclusion

L'application Nextcloud Calendar Mobile dispose d'une architecture moderne et d'une base de code de bonne qualité. Les principaux risques se situent dans trois domaines :

1. **Sécurité** : la configuration réseau est trop permissive. Les corrections sont principalement dans `app.config.ts` et les modules natifs.
2. **Robustesse de la sync** : le manque de retry, l'absence de `If-Match` et le `settleAllOrThrow` peuvent provoquer des pertes de données ou des écrans vides.
3. **Performance** : le parsing synchrone et le `buildDayIndex` non cache pénalisent les gros calendriers.

Les améliorations proposées sont graduelles : certaines sont de pure configuration, d'autres nécessitent des migrations de schéma (ETag, baseUid) et de nouveaux flux utilisateur (recherche, RSVP). Il est recommandé de traiter les points immédiats dans une première itération, puis de passer aux outils de qualité et enfin aux fonctionnalités.
