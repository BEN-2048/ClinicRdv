# ClinicRDV – Prise de rendez-vous médicaux

Application mobile (React Native / Expo) de prise de rendez-vous et de suivi médical pour un réseau d'établissements de santé **fictifs**.
Projet d'examen – Programmation mobile L4 Informatique. **Toutes les données sont fictives.** Le projet n'utilise que des services gratuits.

## Équipe
| Membre | Rôle / modules principaux |
|--------|---------------------------|
| Étudiant 1 | Authentification, rôles, sécurité |
| Étudiant 2 | Annuaire, agenda médecin, calcul des créneaux |
| Étudiant 3 | Réservation, annulation/report, liste d'attente |
| Étudiant 4 | Dossier patient, notifications, ordonnances, documents |

## Fonctionnalités

| Domaine | Ce que l'application permet |
|---------|-----------------------------|
| Comptes | Inscription et connexion par e-mail **ou par téléphone** (code SMS), sessions courtes renouvelées, appareils connectés, récupération du compte, changement de mot de passe, de numéro et d'e-mail |
| Patients | Profils de la famille (enfants, personnes à charge) liés à un tuteur vérifié par l'établissement |
| Établissements | Plusieurs hôpitaux, cliniques et centres, avec services, spécialités, horaires et fuseau horaire ; médecins affiliés à plusieurs établissements |
| Rendez-vous | Créneaux calculés à partir des horaires, congés et créneaux bloqués ; réservation sans double réservation ; annulation, report, liste d'attente avec alertes de désistement |
| Indisponibilités | Annulation expliquée par l'établissement et **redirection** vers un autre créneau, médecin ou établissement |
| Rappels | Rappel in-app la veille et 2 h avant chaque rendez-vous, SMS la veille si le numéro est vérifié |
| Dossier médical | Allergies, antécédents, traitements, vaccins, consultations, ordonnances, documents ; consentements de partage par établissement ; journal des accès ; accès d'urgence encadré |
| Hors ligne | Fiche d'urgence et contacts des établissements consultables sans réseau |
| Urgence | Écran public (sans compte) : numéros vérifiés et services d'urgence les plus proches |
| Orientation | « Je ne sais pas quel médecin consulter » : symptômes → spécialité conseillée (les signes graves renvoient vers l'urgence) → médecins classés sur 100 avec les raisons |

## Rôles

| Rôle | Accès |
|------|-------|
| Patient | Ses rendez-vous, ceux de sa famille, son dossier, ses partages, l'orientation |
| Médecin | Tableau de bord, agenda, horaires et congés, fiches de consultation, dossiers des patients autorisés |
| Secrétaire | Rendez-vous, médecins et statistiques **de son établissement**, validation des liens familiaux |
| Administrateur | Tous les établissements, numéros d'urgence nationaux |

## Architecture
```
clinicrdv/
├── backend/   API REST Node.js + Express + PostgreSQL
│   ├── db/          schema.sql, migrations/, seed.js, migrate.js
│   ├── scripts/     sauvegarde et restauration chiffrées
│   ├── src/         routes, contrôleurs, services, validateurs
│   └── tests/       tests Jest + Supertest
├── mobile/    Application React Native (Expo, TypeScript)
└── docs/      Conception, backlog, guides (SMS, sauvegardes)
```
- **Backend** : Express, JWT + jetons de renouvellement, bcrypt, zod (validation), helmet, limitation des tentatives, pg.
- **BD** : PostgreSQL. Anti double réservation via la contrainte `EXCLUDE USING gist` sur `appointments`.
- **Mobile** : React Navigation (navigation par rôle), axios, expo-secure-store, expo-sqlite (hors ligne), expo-location.

## Installation

### Prérequis
Node.js 20+, application **Expo Go** sur le téléphone. Aucune installation de PostgreSQL : la base est hébergée sur Neon.

### 1. Base de données

L'équipe partage une base PostgreSQL distante hébergée sur **Neon** : aucune installation de PostgreSQL n'est nécessaire.

```bash
cd backend
cp .env.example .env             # coller l'URL Neon dans DATABASE_URL, définir les secrets
npm install
npm run db:migrate               # applique les migrations manquantes
```

L'URL de connexion (transmise par le responsable de la base, à ne jamais committer) se trouve dans le tableau de bord Neon → *Connect* → *Connection string*, option **Pooled connection** cochée. Remplacer `sslmode=require` par `sslmode=verify-full` à la fin de l’URL (même sécurité, sans avertissement de `pg`).

La base partagée est déjà initialisée. Uniquement pour une base neuve :
```bash
npm run db:init                  # crée les tables puis applique les migrations (refuse si elles existent)
npm run db:seed                  # données fictives + comptes de test (ignoré si déjà présentes)
npm run db:reset                 # ⚠ supprime TOUTES les données puis recrée les tables
```

Pour travailler avec une base locale : installer PostgreSQL 16, créer une base `clinicrdv` et
renseigner `DATABASE_URL=postgres://<utilisateur>:<mot_de_passe>@localhost:5432/clinicrdv`.

### Migrations
Les fichiers `backend/db/migrations/NNN_nom.sql` sont appliqués dans l'ordre par `npm run db:migrate`, qui note chaque fichier passé dans la table `schema_migrations`. Après chaque fusion qui ajoute une migration, chacun relance `npm run db:migrate`. Une nouvelle migration prend le numéro suivant et ne modifie jamais un fichier déjà appliqué.

### 2. Backend
```bash
cd backend
npm run dev                      # http://localhost:4000/health
npm test                         # tests (base simulée, aucune connexion requise)
```

### 3. Mobile
```bash
cd mobile
cp .env.example .env             # mettre l'IP de votre PC dans EXPO_PUBLIC_API_URL
npm install
npx expo start                   # scanner le QR code avec Expo Go
npm run lint                     # ESLint (configuration Expo)
npx tsc --noEmit                 # vérification des types
npx jest                         # tests
```

### 4. APK Android
L'APK est généré dans le cloud par **EAS Build** (offre gratuite Expo) avec le profil `preview` de `mobile/eas.json`.

```bash
cd mobile
npx eas-cli login                # une seule fois, compte Expo
npx eas-cli build -p android --profile preview
```

Le lien de téléchargement de l'APK s'affiche à la fin du build, avec un QR code sur la page du build.

- L'URL de l'API est **figée dans l'APK** : elle vient de `EXPO_PUBLIC_API_URL` dans `mobile/eas.json` (les fichiers `.env` ne sont pas envoyés à EAS). Mettre l'IP du PC qui fait tourner le backend avant chaque build.
- Le téléphone Android doit être sur le même réseau que ce PC, backend lancé (`npm start`). Vérifier depuis son navigateur : `http://<IP du PC>:4000/health`.
- Si la page ne répond pas, autoriser le port 4000 dans le pare-feu Windows.
- L'APK ne s'installe que sur **Android**. Pour l'iPhone, voir la section suivante.

### 5. Application iOS (IPA)
Sans Mac ni compte Apple Developer payant : l'IPA est compilé sans signature sur un runner macOS de **GitHub Actions**, puis signé et installé depuis Windows avec **Sideloadly** et un Apple ID gratuit.

1. Pousser le dépôt sur GitHub (miroir du dépôt GitLab) : `git push github main`.
2. Sur GitHub : **Actions → iOS IPA → Run workflow**, saisir l'URL de l'API (`http://<IP du PC>:4000/api`).
3. À la fin du build (20 à 30 min), télécharger l'artefact **ClinicRDV-ipa** et le décompresser pour obtenir `ClinicRDV.ipa`.
4. Sur le PC : installer [iTunes](https://www.apple.com/itunes/) (version du site Apple, pas celle du Microsoft Store) et [Sideloadly](https://sideloadly.io).
5. Brancher l'iPhone en USB, faire confiance à l'ordinateur, glisser `ClinicRDV.ipa` dans Sideloadly, saisir son Apple ID, puis **Start**.
6. Sur l'iPhone : **Réglages → Confidentialité et sécurité → Mode développeur** (activer, redémarrer), puis **Réglages → Général → VPN et gestion de l'appareil** → faire confiance à son Apple ID.

- Avec un Apple ID gratuit, l'application **expire au bout de 7 jours** : relancer l'étape 5 avec le même IPA pour la renouveler (pas besoin de recompiler). Trois applications au maximum par appareil.
- Comme pour l'APK, l'URL de l'API est figée dans l'IPA : relancer le workflow si l'IP du PC change.
- Au premier lancement, accepter l'autorisation **Réseau local**.
- Dépôt privé : les minutes macOS comptent 10 fois (environ 200 min par mois offertes, soit 6 à 8 builds). Un dépôt public n'a pas cette limite.

## Variables d'environnement (backend/.env)

| Variable | Rôle | Valeur par défaut |
|----------|------|-------------------|
| `DATABASE_URL` | Connexion PostgreSQL | — (obligatoire) |
| `JWT_SECRET` | Signature des jetons d'accès | — (obligatoire) |
| `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_DAYS`, `SESSION_MAX_DAYS` | Durée du jeton d'accès, du renouvellement et maximale d'une session | `15m`, `30`, `90` |
| `OTP_SECRET` | Hachage des codes de vérification | — (obligatoire) |
| `OTP_EXPIRES_MINUTES`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS` | Validité, essais et délai de renvoi des codes | `10`, `5`, `60` |
| `EMAIL_DRIVER`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | Envoi des e-mails : `console` (terminal) ou `brevo` (offre gratuite) | `brevo` si une clé est fournie, sinon `console` |
| `SMS_DRIVER`, `SMSGATE_URL`, `SMSGATE_USERNAME`, `SMSGATE_PASSWORD` | Envoi des SMS : `console` ou `smsgate` (téléphone Android), voir `docs/sms-passerelle.md` | `console` |
| `SMS_DAILY_CAP`, `SMS_PER_NUMBER_DAILY` | Plafonds de SMS par jour, au total et par numéro | `200`, `5` |
| `REMINDERS_ENABLED`, `REMINDER_INTERVAL_MINUTES` | Tâche des rappels de rendez-vous | activée, `5` |
| `CORS_ORIGINS` | Origines web autorisées, séparées par des virgules. Vide : toutes en développement, aucune en production. L'app mobile n'est pas concernée | vide |
| `RATE_LIMIT_ENABLED`, `TRUST_PROXY` | Limitation des tentatives ; proxy de confiance pour l'adresse IP | activée hors tests |
| `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`, `FILE_URL_SECRET`, `PUBLIC_API_URL` | Stockage des documents médicaux et liens signés | `local` |
| `BACKUP_ENCRYPTION_KEY`, `BACKUP_DIR`, `PG_DUMP_PATH`, `PG_RESTORE_PATH`, `RESTORE_DATABASE_URL` | Sauvegardes chiffrées, voir `docs/sauvegardes.md` | — |

En production (`NODE_ENV=production`), les pilotes `console` sont refusés et `CORS_ORIGINS=*` empêche le démarrage.

## Comptes de test (mot de passe : `Test1234!`)
| Rôle | E-mail |
|------|--------|
| Administrateur | admin@clinic.test |
| Secrétaire | secretaire@clinic.test |
| Patient | patient@clinic.test |
| Médecin | kabila@clinic.test, mutombo@clinic.test, ilunga@clinic.test |

En développement, les codes envoyés par SMS ou par e-mail s'affichent dans le terminal du backend.

## API (extrait)
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | /api/auth/register, /login, /refresh, /logout | Comptes et sessions |
| GET | /api/doctors?q=&specialtyId= | Annuaire |
| GET | /api/doctors/:id/slots?date=AAAA-MM-JJ | Créneaux d'un jour |
| POST | /api/appointments | Réserver (409 si conflit) |
| GET | /api/appointments/mine?scope=upcoming | Mes rendez-vous |
| PATCH | /api/appointments/:id/cancel, /reschedule | Annuler / reporter |
| GET | /api/appointments/:id/alternatives | Solutions de remplacement |
| GET | /api/facilities | Établissements |
| GET | /api/notifications | Notifications et rappels |
| GET | /api/emergency/directory | Annuaire d'urgence public |
| GET, POST | /api/triage/symptoms, /api/triage | Orientation par symptômes (public) |
| GET | /api/recommendations/doctors?specialtyId= | Médecins classés avec les raisons |

## Intégration continue
GitLab CI tourne sur chaque merge request et sur `main` :
- `backend-test` : tests du backend ;
- `mobile-check` : types, lint (45 avertissements au plus) et tests du mobile.

Les deux jobs doivent passer avant la fusion.

## Workflow Git
- Une branche par étape : `feature/<phase>-<description>` (ex. `feature/phase6a-orientation`), créée depuis `main`
- Un commit = une idée, message au format `feat(slots): calcul des créneaux libres`
- Merge Request vers `main`, relue par un autre membre, pipeline au vert
- Branches empilées : chaque MR cible la précédente et se fusionne dans l'ordre

## Documentation
- `docs/conception.md` : conception
- `docs/backlog-jira.md` : backlog
- `docs/sms-passerelle.md` : envoi des SMS gratuit
- `docs/sauvegardes.md` : sauvegardes et restauration

## Liens
- Jira : _à compléter_
- Confluence (conception) : _à compléter_
- Maquette Figma : _à compléter_
