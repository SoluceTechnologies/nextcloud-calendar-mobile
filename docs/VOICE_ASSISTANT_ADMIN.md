# Assistant vocal — Guide de mise en œuvre (administrateur)

Guide complet de déploiement : prérequis serveur, apps à installer, réglages IA
(fournisseurs, modèles, prompts), contraintes par utilisateur et vérifications.
Écrit et validé contre `https://cloud.sipc-cgt.fr` (NC 35.0.2, context_agent
2.11.0, fournisseur Mistral).

## 0. Architecture — qui fait quoi

```
micro ──► STT (sur l'appareil) ──► parsing d'intention local
                                      │
              ┌───────────────────────┴───────────────────────┐
        commande simple                              phrase libre / ambiguë
              │                                               │
        CalDAV direct (app)                          TaskProcessing API
        PUT/DELETE/REPORT                            POST /ocs/v2.php/taskprocessing/schedule
              │                                               │
              ▼                                               ▼
        événements / invitations                    Context Agent (ExApp)
        + free/busy (scheduling outbox)             → LLM fournisseur + outils NC
                                      │
                                      ▼
                              réponse texte ──► TTS (sur l'appareil)
```

**Point clé** : la reconnaissance vocale (STT) et la synthèse (TTS) sont
**100 % locales au téléphone** — aucun fournisseur STT/TTS n'est requis côté
serveur pour l'app mobile. Seul l'**agent IA** (génération de texte + outils
Nextcloud) est nécessaire côté serveur.

## 1. Apps Nextcloud à installer

| App (id store) | Rôle | Obligatoire ? |
|---|---|---|
| **Nextcloud Context Agent** (`context_agent`) | ExApp : agent IA appelé via TaskProcessing (`core:contextagent:interaction`) | ✅ pour l'agent |
| **AppAPI** (`app_api`) | Prérequis des ExApps : nécessite un **daemon de déploiement** (Docker ou `appapi-harp`) — installe et fait tourner le conteneur `nc_app_context_agent` | ✅ (implicite avec context_agent) |
| **Nextcloud Assistant** (`assistant`) | Page d'admin IA, **prompt système** (`chat_user_instructions`), task picker | ✅ pour les réglages IA |
| **OpenAI and LocalAI integration** (`integration_openai`) | Fournisseur de génération de texte (et STT/TTS/image pour le web) via endpoint OpenAI-compatible | ✅ un fournisseur de texte est requis |
| Local large language model (`llm2`) | Alternative 100 % on-prem (llama.cpp) | option |
| **Context Chat** (`context_chat`) | RAG sur les fichiers (l'agent répond avec le contenu des documents) | option |
| Assistant Talk Bot (`talk_bot_ai`, ExApp) | Bot Talk — non utilisé par l'app mobile | option |

> context_agent est déployé comme **application externe** (conteneur Docker
> géré par AppAPI), pas comme app PHP : prévoir Docker/`appapi-harp` et la RAM
> associée sur l'hôte.

### Fournisseurs LLM possibles (tous via TaskProcessing)

Le Context Agent consomme le **fournisseur de génération de texte** déclaré
dans l'admin IA. Toutes les options :

| Fournisseur | Comment | Cas prod |
|---|---|---|
| **OpenAI** | `integration_openai`, URL `https://api.openai.com/v1`, clé API | — |
| **Mistral AI** | `integration_openai`, URL `https://api.mistral.ai/v1` | ✅ cloud.sipc-cgt.fr (`ministral-14b-2512`) |
| **Ollama / LocalAI** | `integration_openai` avec URL custom (`http://ollama:11434/v1`) — ou app dédiée | self-hosted |
| **llm2 (local)** | app `llm2`, aucun service externe | vie privée / hors-ligne |
| Tout endpoint OpenAI-compatible | Groq, Together, Azure OpenAI, LiteLLM… via `integration_openai` | — |

Réglages `integration_openai` pertinents : `url`, clé API (admin secrets),
`default_completion_model_id`, `request_timeout` (60 s — à monter si le modèle
est lent), `llm_extra_params` (ex. `{"temperature": 0.3}`), quotas par type.

## 2. Réglages d'administration (UI)

**Paramètres → Administration → Artificial intelligence** :

1. **Text generation** : choisir le fournisseur + le modèle par défaut. Sans
   lui, le Context Agent ne répond pas.
2. **Assistant → Instructions** (`assistant.chat_user_instructions`) : le
   **prompt système** — contexte métier, langue, règles d'usage des outils,
   fichiers à ne jamais résumer, compétences. C'est là que vivent les prompts.
3. **Context Agent** (section de l'ExApp) : **activation/désactivation par
   outil** (`context_agent.tool_status` — calendar, deck, talk, files, mail,
   contacts, context_chat, memory, skills…). Ne garder que les outils voulus :
   chaque outil activé élargit ce que l'agent peut lire ou modifier.

> Recommandé : **context_agent ≥ 2.11** — les versions < 2.10 sérialisaient
> les événements en UTC sans préserver le `TZID` (événements décalés d'une
> heure). Corrigé en 2.10/2.11.

## 3. Prérequis plateforme

| Élément | Requis | Vérification |
|---|---|---|
| Nextcloud | ≥ 30 (testé 35.0.2) | `occ status` |
| **Cron système** | les tâches TaskProcessing passent par les jobs de fond | `backgroundjobs_mode: cron` dans `occ config:list core` |
| HTTPS + reverse proxy | le POST `schedule` est rapide et le polling est asynchrone — les timeouts proxy standards suffisent | — |
| CalDAV | activé (core) | `PROPFIND /remote.php/dav/calendars/<user>/` |
| API TaskProcessing | exposée par context_agent | `GET /ocs/v2.php/taskprocessing/tasktypes` → doit lister `core:contextagent:interaction` |

## 4. Prérequis par utilisateur (les vrais pièges)

1. **Mot de passe d'application** : l'app s'authentifie en Basic Auth —
   créer un app-password par appareil (Paramètres → Sécurité). Les comptes
   SSO/OIDC doivent aussi passer par un app-password.
2. **⚠️ Email UNIQUE par compte** — le plus gros piège rencontré :
   `getPrincipalByUri(mailto:)` exige une résolution unique. Si deux comptes
   partagent la même adresse (ex. `admin` et un utilisateur), les invitations
   ne sont **jamais livrées localement** : log `Message not delivered locally
   with status: 3.7;Could not find principal.` et `oc_schedulingobjects` reste
   vide — seul un mail iMIP part. Le free/busy, lui, continue de fonctionner
   (résolution en liste), ce qui masque le problème.
   → Vérifier `oc_preferences` / `calendar-user-address-set` : une adresse =
   un seul principal.
3. **Calendrier d'invitations par défaut** : Paramètres Agenda → Général →
   « calendrier pour les invitations entrantes » doit pointer vers un
   calendrier existant et coché/visible.
4. **Free/busy des invités** : l'adresse invitée doit être dans le
   `calendar-user-address-set` du compte (email de profil), sinon pas de
   résolution.
5. **iMIP** : pour les invités externes au serveur, configurer le SMTP
   (l'email part par mail — la livraison interne n'a lieu que pour un
   principal local unique).

## 5. Ce que l'app appelle (contrat API)

- **Découverte** : `GET /ocs/v2.php/taskprocessing/tasktypes` — l'app cherche
  `core:contextagent:interaction`. Absent → agent désactivé côté app (les
  commandes locales restent fonctionnelles).
- **Exécution** : `POST /ocs/v2.php/taskprocessing/schedule`. Sur NC 35,
  l'`inputShape` du task type impose les slots :
  - `input` (Text) — le prompt utilisateur
  - `confirmation` (Number) — `0` par défaut
  - `conversation_token` (Text) — renvoyé au tour suivant (mémoire de
    conversation par compte)
  - `output_mode` (optionnel) — `speech` quand exposé
  Tout slot **required** doit être envoyé, sinon `Missing key` au schedule.
- **Polling** : `GET .../task/{id}` ~2,8 s jusqu'à **120 s**
  (`POLL_TIMEOUT_MS`) puis `POST .../cancel`. Les tâches multi-outils
  (calendrier + Deck + Talk) dépassent 45 s — ne pas baisser le timeout.
- **Sortie** : `outputShape` → `output` (lu à voix haute),
  `conversation_token` (mémorisé), `actions` (**ignoré par l'app** : les
  mutations sont déjà exécutées côté serveur).
- **Rate limit** : HTTP 429 → cooldown client 60 s.

## 6. Mobile — Android et iOS

| | Android | iOS |
|---|---|---|
| Permissions | `RECORD_AUDIO` + déclaration `RecognitionService` (déjà dans le manifest) | `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription` (injectés par le plugin expo-speech-recognition) |
| Moteur STT | service de reconnaissance du système (Google app) — **compatible d'origine** sur tout appareil Play Services | `SFSpeechRecognizer` natif — **compatible d'origine** |
| Hors-ligne | packs de langue on-device (Soda) optionnels : Paramètres Google → Reconnaissance vocale hors connexion ; sinon fallback réseau | dictée on-device automatique sur les appareils récents |
| TTS | moteur TTS système (Google Speech Services) | `AVSpeechSynthesizer` natif |
| De-Googled / émulateur | nécessite un `RecognitionService` installé (Sinscribe, pack Google) — saisie clavier toujours possible | n/a |

**Rien à installer côté téléphone** : sur un Android standard ou un iPhone,
la chaîne vocale fonctionne out-of-the-box. La saisie clavier (« Type a
command… ») reste un fallback universel.

## 7. Sécurité et comportements observés (prod)

- **Les mutations agent sont réelles et immédiates** — en test, une consigne
  ambiguë a fait **annuler** des événements au lieu de les déplacer. Le gate
  de confirmation côté app (« Send this request to the Nextcloud agent? ») est
  indispensable ; valider sur un **compte de test**.
- Les événements `STATUS:CANCELLED` par l'agent peuvent rester visibles dans
  certains clients — l'app les filtre et resynchronise.
- Table de vérité des statuts : Accept→`ACCEPTED`, Maybe→`TENTATIVE`,
  Decline→`DECLINED` (+ suppression locale chez l'invité).
- L'`output_mode: speech` change le formatage de la réponse pour la lecture à
  voix haute.

## 8. Vérifications et diagnostic

```bash
# task type présent ?
curl -u user:app-password -H 'OCS-APIRequest: true' \
  'https://<server>/ocs/v2.php/taskprocessing/tasktypes' | grep contextagent

# config effective
occ app:list                          # context_agent / assistant / integration_openai / app_api
occ config:list context_agent         # tool_status (outils actifs)
occ config:list assistant             # chat_user_instructions (prompt)
occ config:list integration_openai    # url + default_completion_model_id (NE PAS publier la clé)
occ config:list core | grep cron      # backgroundjobs_mode

# livraison d'invitations
SELECT principaluri FROM oc_schedulingobjects ORDER BY id DESC LIMIT 5;
grep 'Message not delivered locally' data/nextcloud.log

# santé de l'ExApp
occ app_api:app:list                  # context_agent enabled + version
docker logs nc_app_context_agent      # erreurs runtime agent
```

| Symptôme | Cause probable |
|---|---|
| Agent « unavailable » dans l'app | `core:contextagent:interaction` absent des tasktypes → ExApp désactivée ou sans fournisseur de texte |
| Tâche `failed` immédiate | `Missing key` → slot required non envoyé (vérifier inputShape) ou LLM down |
| Invitations reçues en mail mais pas dans l'agenda | email dupliqué sur 2 comptes → 3.7 (voir §4.2) |
| Réponses lentes / timeout | modèle trop lent → monter `request_timeout` d'integration_openai, vérifier le cron |
| Heure décalée +1 h | context_agent < 2.10 (TZID→UTC) ou fuseau de l'appareil ≠ celui du compte |

## 9. Checklist de mise en œuvre

1. ☐ NC ≥ 30 + cron système actif
2. ☐ `app_api` + daemon de déploiement opérationnel
3. ☐ Installer `context_agent` (≥ 2.11), `assistant`, `integration_openai`
4. ☐ Admin AI : fournisseur + modèle de génération choisis, clé API saisie
5. ☐ Prompt système (`chat_user_instructions`) rédigé
6. ☐ `tool_status` : ne garder que les outils voulus
7. ☐ tasktypes expose `core:contextagent:interaction`
8. ☐ Par utilisateur : app-password, email unique, calendrier d'invitations
9. ☐ Test E2E : commande simple (création) + phrase libre (agent) + invitation
10. ☐ Mobile : permission micro accordée au 1er lancement — rien d'autre
