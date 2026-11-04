# ClinicRDV – Prise de rendez-vous médicaux

Application mobile (React Native / Expo) de réservation de rendez-vous pour une **clinique fictive**.
Projet d'examen – Programmation mobile L4 Informatique. **Toutes les données sont fictives.**

## Équipe
| Membre | Rôle / modules principaux |
|--------|---------------------------|
| Étudiant 1 | Authentification, rôles, sécurité |
| Étudiant 2 | Annuaire, agenda médecin, calcul des créneaux |
| Étudiant 3 | Réservation, annulation/report, liste d'attente |
| Étudiant 4 | Dossier patient, notifications, PDF, export .ics |

## Architecture
```
clinicrdv/
├── backend/   API REST Node.js + Express + PostgreSQL
├── mobile/    Application React Native (Expo, TypeScript)
├── docs/      Conception (à copier dans Confluence)
└── docker-compose.yml
```
- **Backend** : Express, JWT, bcrypt (mots de passe hachés), zod (validation des entrées), pg.
- **BD** : PostgreSQL. Anti double-réservation via contrainte `EXCLUDE USING gist` sur `appointments`.
- **Mobile** : React Navigation (navigation par rôle), axios, expo-secure-store.

## Installation

### Prérequis
Node.js 20+, PostgreSQL 16 (ou Docker), application **Expo Go** sur le téléphone.

### 1. Base de données

L'équipe partage une base PostgreSQL distante hébergée sur **Neon** : aucune installation de PostgreSQL n'est nécessaire.

```bash
cd backend
cp .env.example .env             # coller l'URL Neon dans DATABASE_URL, définir JWT_SECRET
npm install
```

L'URL de connexion (transmise par le responsable de la base, à ne jamais committer) se trouve dans le tableau de bord Neon → *Connect* → *Connection string*, option **Pooled connection** cochée. Elle se termine par `?sslmode=require`.

La base partagée est déjà initialisée. Uniquement pour une base neuve :
```bash
npm run db:init                  # crée les tables (refuse si elles existent déjà)
npm run db:seed                  # données fictives + comptes de test (ignoré si déjà présentes)
npm run db:reset                 # ⚠ supprime TOUTES les données puis recrée les tables
```

Pour travailler hors ligne avec une base locale : `docker compose up -d db` et
`DATABASE_URL=postgres://clinic:clinic@localhost:5432/clinicrdv`.

### 2. Backend
```bash
cd backend
npm run dev                      # http://localhost:4000/health
```

### 3. Mobile
```bash
cd mobile
cp .env.example .env             # mettre l'IP de votre PC dans EXPO_PUBLIC_API_URL
npm install
npx expo start                   # scanner le QR code avec Expo Go
```

## Comptes de test (mot de passe : `Test1234!`)
| Rôle | E-mail |
|------|--------|
| Administrateur | admin@clinic.test |
| Secrétaire | secretaire@clinic.test |
| Patient | patient@clinic.test |
| Médecin | kabila@clinic.test, mutombo@clinic.test, ilunga@clinic.test |

## API (extrait)
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | /api/auth/register, /login | Inscription / connexion |
| GET | /api/doctors?q=&specialtyId= | Annuaire |
| GET | /api/doctors/:id/slots?date=AAAA-MM-JJ | Créneaux d'un jour |
| POST | /api/appointments | Réserver (409 si conflit) |
| GET | /api/appointments/mine?scope=upcoming | Mes rendez-vous |
| PATCH | /api/appointments/:id/cancel, /reschedule | Annuler / reporter |

## Workflow Git
- Branches : `main` (protégée) ← `develop` ← `feature/CLIN-<n>-description`
- Un commit = une idée, message au format `feat(slots): calcul des créneaux libres`
- Merge Request obligatoire, relue par un autre membre
- Chaque commit est lié à une clé Jira (ex. `CLIN-12`)

## Liens
- Jira : _à compléter_
- Confluence (conception) : _à compléter_
- Maquette Figma : _à compléter_
