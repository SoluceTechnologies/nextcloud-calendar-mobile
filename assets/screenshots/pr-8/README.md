# PR fork #8 — assistant vocal par compte : preuves

Émulateur Android API 36, release APK. Deux comptes : `ARASABruno` sur le
Nextcloud de test (cloud.sipc-cgt.fr) et `test` sur le Nextcloud local Docker
(`nextcloud-test`, joint via `http://10.0.2.2:8080`).

| # | Fichier | Prouve |
|---|---------|--------|
| 1 | `01-settings-voice-per-account.png` | Une rangée par compte (avatar + nom + hôte) ; migration v2→v3 en live (flag global ON → compte ON après update) |
| 2 | `02-two-accounts-independent-toggles.png` | Deux rangées : ARASA ON (migré), Test OFF (défaut nouveau compte) ; sous-cartes masquées tant que le compte actif est OFF |
| 3 | `03-test-account-on-shows-own-calendars.png` | Test ON → sous-cartes visibles avec les agendas du compte test (Personal, Contact birthdays) — pas ceux d'ARASA |
| 4 | `04-test-off-no-mic.png` | Calendrier du compte test OFF : pas de FAB micro |
| 5 | `05-arasa-off-no-mic.png` | ARASA passé OFF → son calendrier perd le micro pendant que Test reste ON (indépendance) |
| 6 | `06-both-on-arasa-calendars.png` | Les deux ON, compte actif ARASA → la liste de dispo montre les agendas ARASA |
