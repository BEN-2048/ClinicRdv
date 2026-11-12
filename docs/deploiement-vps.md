# Déploiement sur le VPS Hostinger (KVM 1)

L'API tourne sur le VPS derrière Nginx, en HTTPS. La base reste sur **Neon** : le VPS ne contient que l'API, les documents médicaux et les sauvegardes chiffrées.

```
Téléphone ──HTTPS──> Nginx (443) ──> Node / PM2 (127.0.0.1:4000) ──TLS──> Neon PostgreSQL
                                         │
                                         ├── /srv/clinicrdv/storage   documents
                                         └── /srv/clinicrdv/backups   sauvegardes chiffrées
```

| Fichier | Rôle |
|---|---|
| `deploy/setup-vps.sh` | Installation complète du serveur (une seule fois) |
| `deploy/deploy.sh` | Mise à jour : code, dépendances, migrations, redémarrage |
| `deploy/nginx/clinicrdv.conf` | Proxy inverse, taille d'envoi des documents, limite de débit |
| `backend/ecosystem.config.js` | Processus PM2 (une seule instance : la tâche des rappels ne doit pas tourner en double) |
| `backend/.env.production.example` | Modèle du `.env` de production |

## 1. Préparer le VPS dans hPanel

1. **VPS → Système d'exploitation** : installer **Ubuntu 24.04** (sans panneau).
2. Définir le mot de passe root et, si possible, ajouter votre **clé SSH**.
3. Noter l'**adresse IP** du VPS.
4. **Pare-feu hPanel** : s'il est activé, autoriser les ports 22, 80 et 443.

## 2. Nom de domaine

L'API a besoin d'un nom pour obtenir un certificat HTTPS.

- **Avec un domaine** : dans la zone DNS, créer un enregistrement `A` `api` → IP du VPS. Le domaine de l'API est alors `api.<domaine>`.
- **Sans domaine (gratuit)** : utiliser [sslip.io](https://sslip.io), qui fait pointer un nom vers l'IP qu'il contient. Pour l'IP `203.0.113.5`, le domaine est `203-0-113-5.sslip.io`. Rien à configurer.

Vérifier depuis le PC que le nom pointe bien sur le VPS (`ping <domaine>`) **avant** l'étape 3 : sinon Let's Encrypt refuse le certificat.

## 3. Installer le serveur

```bash
ssh root@<IP du VPS>
curl -fsSLO https://raw.githubusercontent.com/BEN-2048/ClinicRdv/main/deploy/setup-vps.sh
bash setup-vps.sh <domaine> <email-pour-letsencrypt>
```

Dépôt privé : télécharger le script avec `scp`, et donner l'URL du dépôt avec un jeton en lecture seule (GitHub → Settings → Developer settings → *Fine-grained token*, permission *Contents: Read*) :
```bash
REPO_URL=https://<jeton>@github.com/BEN-2048/ClinicRdv.git bash setup-vps.sh <domaine> <email>
```

Le script installe Node.js 24, PM2, Nginx, Certbot, les outils PostgreSQL 18, fail2ban et les mises à jour de sécurité automatiques. Il crée l'utilisateur `clinicrdv` et ses dossiers, génère les secrets, configure Nginx avec HTTPS, le pare-feu (22, 80, 443) et la sauvegarde quotidienne de 3 h (14 jours conservés).

## 4. Compléter le `.env`

```bash
sudo -u clinicrdv nano /srv/clinicrdv/app/backend/.env
```

| À renseigner | Où le trouver |
|---|---|
| `DATABASE_URL` | Neon → *Connect* → *Pooled connection*, avec `sslmode=verify-full` |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | Brevo → *SMTP & API* ; expéditeur vérifié |
| `SMSGATE_USERNAME`, `SMSGATE_PASSWORD` | Application SMSGate en mode **Cloud Server** (voir ci-dessous) |

Les secrets (`JWT_SECRET`, `OTP_SECRET`, `FILE_URL_SECRET`, `BACKUP_ENCRYPTION_KEY`) sont déjà générés. **Copier `BACKUP_ENCRYPTION_KEY` dans un gestionnaire de mots de passe** : sans elle, les sauvegardes sont illisibles.

Avec `NODE_ENV=production`, l'API refuse les pilotes `console` : Brevo et SMSGate doivent être configurés.

### SMS depuis le VPS
Le mode **Local Server** de SMSGate ne fonctionne qu'en Wi-Fi local : le VPS ne peut pas joindre le téléphone. Dans l'application SMSGate, activer **Cloud Server** à la place, puis copier l'identifiant et le mot de passe affichés. `SMSGATE_URL` reste `https://api.sms-gate.app/3rdparty/v1`. Le téléphone passerelle doit rester allumé et connecté à Internet.

## 5. Déployer

```bash
sudo -u clinicrdv -H bash /srv/clinicrdv/app/deploy/deploy.sh
```

Le script récupère `main`, installe les dépendances, applique les migrations, redémarre l'API et vérifie `/health`. Il sert aussi pour chaque mise à jour.

Vérifier depuis le téléphone : `https://<domaine>/health` doit afficher `{"status":"ok"}`.

## 6. Reconstruire l'application mobile

- **Android** : dans `mobile/eas.json`, remplacer `DOMAINE` dans le profil `production-apk`, puis :
  ```bash
  npx eas-cli build -p android --profile production-apk
  ```
- **iOS** : GitHub → *Actions → iOS IPA → Run workflow*, saisir `https://<domaine>/api`, puis installer avec Sideloadly comme d'habitude.

Le profil `preview` (IP du PC) reste disponible pour le développement local.

## Commandes utiles

| Action | Commande |
|---|---|
| État de l'API | `sudo -u clinicrdv -H pm2 status` |
| Journaux | `sudo -u clinicrdv -H pm2 logs clinicrdv-api` |
| Redémarrer | `sudo -u clinicrdv -H pm2 restart clinicrdv-api` |
| Sauvegarde manuelle | `sudo -u clinicrdv bash -c 'cd /srv/clinicrdv/app/backend && npm run db:backup'` |
| Journal des sauvegardes | `tail /srv/clinicrdv/backups/backup.log` |
| Renouvellement HTTPS (automatique) | `certbot renew --dry-run` |

Copier régulièrement `/srv/clinicrdv/backups` et `/srv/clinicrdv/storage` hors du VPS (`scp -r root@<IP>:/srv/clinicrdv/backups .`) : une panne du VPS ne doit pas emporter les seules copies. Hostinger propose aussi des instantanés du VPS dans hPanel.

## Sécurité après l'installation

- Se connecter avec une clé SSH puis désactiver la connexion par mot de passe (`PasswordAuthentication no` dans `/etc/ssh/sshd_config`, puis `systemctl restart ssh`). Tester la clé **avant** de fermer la session en cours.
- Le port 4000 n'est jamais exposé : seul Nginx (80, 443) est ouvert.
- Les données restent fictives : un hébergement réel de données de santé demande un hébergeur certifié.
