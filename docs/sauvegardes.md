# Sauvegardes de la base ClinicRDV

## Deux niveaux de protection

1. **Restauration à une date passée (Neon).** Neon conserve l'historique de la base pendant une durée qui dépend de l'offre souscrite. Vérifiez cette durée dans la console Neon (Settings → Storage) : c'est la protection principale contre une erreur récente.
2. **Exports chiffrés (`npm run db:backup`).** Un export complet, chiffré, conservé hors de Neon. Il protège contre la perte du compte Neon ou une erreur découverte trop tard.

## Prérequis

- **Les outils clients PostgreSQL de la même version majeure que le serveur, ou plus récents.** Neon est en PostgreSQL 18 : il faut `pg_dump` et `pg_restore` 18. Le script refuse de tourner avec une version plus ancienne.
- **Une clé de chiffrement de 32 octets.** Générez-la une seule fois :
  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Placez-la dans `backend/.env` (`BACKUP_ENCRYPTION_KEY=...`) **et** dans un gestionnaire de mots de passe. Sans elle, les sauvegardes sont illisibles.

## Faire une sauvegarde

```
cd backend
npm run db:backup
```

Le fichier `backups/clinicrdv-<date>.dump.enc` est chiffré en AES-256-GCM, et un fichier `.json` décrit son contenu (date, dernière migration, empreinte). Le dossier `backups/` est exclu de Git. Copiez le fichier vers un stockage sûr, hors de cet ordinateur.

## Tester une restauration (au moins une fois par mois)

1. Créez une base **de test** : par exemple une branche Neon, ou une base PostgreSQL 18 locale.
2. Dans `backend/.env`, renseignez `RESTORE_DATABASE_URL` avec l'adresse de cette base de test.
3. Lancez :
   ```
   npm run db:restore -- backups/clinicrdv-<date>.dump.enc --confirm
   ```
4. Comparez les nombres de lignes affichés avec ceux de la base d'origine.

Le script refuse de restaurer vers la base désignée par `DATABASE_URL`.
