#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/srv/clinicrdv/app
BRANCH="${BRANCH:-main}"

if [ "$(id -un)" != "clinicrdv" ]; then
  echo "Lancer en tant que clinicrdv : sudo -u clinicrdv -H bash $APP_DIR/deploy/deploy.sh" >&2
  exit 1
fi

cd "$APP_DIR"
echo "==> Récupération de $BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

cd backend
echo "==> Dépendances"
npm ci --omit=dev

echo "==> Migrations"
npm run db:migrate

echo "==> Redémarrage"
pm2 startOrReload ecosystem.config.js --env production
pm2 save

echo "==> Vérification"
for attempt in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:4000/health >/dev/null; then
    echo "API en ligne ($(git rev-parse --short HEAD))"
    exit 0
  fi
  sleep 2
done
echo "L'API ne répond pas : pm2 logs clinicrdv-api" >&2
exit 1
