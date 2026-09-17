---
name: emulator-testing
description: Test d’interface sur émulateur Android pour Nextcloud Calendar avant PR, en particulier le drag-and-drop et les refresh d’événements.
license: MIT
triggers:
  - user
  - model
---

# Tests sur émulateur Android — Nextcloud Calendar

## Quand l’appliquer

- Avant de merger une PR touchant au rendu calendrier, au drag-and-drop ou à `useEventsForRange`.
- Quand on soupçonne une régression du geste de glisser-déposer.
- Après un changement sur la logique de comparaison/fingerprint des événements.
- Quand on veut valider qu’une modification JS est bien rechargée par Metro dans le dev client.

## Pré-requis

```bash
# SDK Android installé, par ex. dans ~/Android/Sdk
export ANDROID_HOME="$HOME/Android/Sdk"

# KVM activé
cat /dev/kvm  # doit exister

# AVD créé
cd "$ANDROID_HOME/emulator"
emulator -list-avds
# → nc-cal-api36
```

## Démarrer l’émulateur

```bash
emulator -avd nc-cal-api36 -no-snapshot-load -no-boot-anim
# autre terminal :
adb wait-for-device
adb shell getprop sys.boot_completed
# → 1
```

## Builder et lancer le dev client

```bash
yarn tsc --noEmit
yarn jest --ci

npx expo run:android
```

Points clés constatés :

- La commande `npx expo run:android` compile un APK debug, l’installe sur l’émulateur et l’ouvre.
- Si le dev server ne démarre pas à cause du port 8081 occupé, vérifier qu’un ancien process Metro n’est pas resté : `lsof -i :8081`.
- La sortie indique l’URL distante utilisée (ex. `172.25.148.4:8081`) pour ouvrir l’application.

Si le launcher du dev client reste bloqué, lancer directement la deep link :

```bash
HOST_IP=$(hostname -I | awk '{print $1}')
adb shell am start -a android.intent.action.VIEW \
  -d "exp+nextcloud-calendar://expo-development-client/?url=http%3A%2F%2F${HOST_IP}%3A8081" \
  com.soluce.nextcloudcalendar
```

## Captures d’écran

```bash
adb shell screencap -p /sdcard/screen.png
adb pull /sdcard/screen.png /tmp/screen.png
```

## Logs à surveiller

- Metro : `tail -f .expo/dev/logs/start.log`
- Logcat : `adb logcat -s ReactNativeJS:V -b main`
- Filtrer : `adb logcat -s ReactNativeJS:V | grep -E 'drag|move|useEvents|render|settle'`

## Test drag-and-drop manuel (recommandé)

Le geste du projet est un `PanGestureHandler` avec `activateAfterLongPress(300)` (`src/features/calendar/hooks/useEventDrag.ts`), donc il faut vraiment un **appui long** avant de glisser. L’automatisation `adb` de ce geste n’est pas fiable.

### Scénario de test

1. Se mettre en vue **Week**.
2. Localiser l’événement **« Drag Test »** du mardi (ex. 12:00).
3. Appui long sur l’événement (~300 ms), puis glisser vers un autre créneau (ex. 14:00).
4. Relâcher.
5. Vérifier que l’événement reste à sa nouvelle position et ne revient pas.

### Points de référence sur Pixel 7 API 36 (1080×2400)

- Colonne mardi : environ x=430
- Événement à 12h : environ y=240
- 14h : environ y=500
- 17h : environ y=760

Ces coordonnées dépendent de la densité et du scroll ; elles servent de point de départ.

## Commandes adb utiles

### Taper sur un point

```bash
adb shell input tap 430 240
```

### Scroller la grille

```bash
# fait défiler le contenu vers le bas (doigt qui remonte)
adb shell input swipe 500 1200 500 600 500
```

### Glisser-déposer (automatique, non fiable à 100 %)

```bash
# nécessite un appui long ; utiliser motionevent plutôt que draganddrop
adb shell "input motionevent DOWN 430 240; sleep 0.5; \
  input motionevent MOVE 430 300; sleep 0.05; \
  input motionevent MOVE 430 360; sleep 0.05; \
  input motionevent MOVE 430 420; sleep 0.05; \
  input motionevent MOVE 430 500; \
  input motionevent UP 430 500"
```

> Note : `input draganddrop` ne réalise pas d’appui long, il est insuffisant pour ce geste.

### Ouvrir/fermer l’application

```bash
# fermer
adb shell am force-stop com.soluce.nextcloudcalendar

# ouvrir via deep link (voir section plus haut)
```

## Données de test connues

Sur le compte de test configuré sur `cloud.sipc-cgt.fr` :

- Calendrier « Personal » et « Contact birthdays ».
- Deux événements « Drag Test » :
  - mardi 25 à 12:00
  - vendredi 28 à 17:00

## Vérifications avant de pousser

- [ ] `yarn tsc --noEmit` passe.
- [ ] `yarn jest --ci` passe.
- [ ] Dev client installé et lancé sur l’émulateur.
- [ ] Le bon serveur Metro est sélectionné (l’URL de la machine hôte, pas `localhost` à moins d’avoir fait `adb reverse`).
- [ ] Le geste drag-and-drop fonctionne : l’événement glissé reste à sa nouvelle position.
- [ ] Pas d’erreur `Cannot connect to Expo CLI` dans les logs.

## Pièges rencontrés

- L’émulateur doit être lancé avec `-no-snapshot-load` pour éviter d’avoir un état étrange du dev client.
- Le launcher du dev client ne répond pas toujours aux taps `adb` : privilégier la deep link.
- Ne pas lancer deux instances Metro sur le port 8081.
- Si l’écran reste sur le launcher, forcer l’ouverture avec `am start -a android.intent.action.VIEW`.
