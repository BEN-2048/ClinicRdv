#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
REPO_URL="${REPO_URL:-https://github.com/BEN-2048/ClinicRdv.git}"
BRANCH="${BRANCH:-main}"
APP_USER=clinicrdv
BASE=/srv/clinicrdv
APP_DIR="$BASE/app"

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer ce script en root : sudo bash setup-vps.sh <domaine> <email>" >&2
  exit 1
fi
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage : sudo bash setup-vps.sh <domaine> <email-letsencrypt>" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> Paquets système"
apt-get update
apt-get upgrade -y
apt-get install -y curl git ufw nginx certbot python3-certbot-nginx build-essential python3 ca-certificates gnupg postgresql-common unattended-upgrades fail2ban

echo "==> Node.js 24"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

echo "==> Outils clients PostgreSQL 18 (sauvegardes)"
/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
apt-get install -y postgresql-client-18

echo "==> Utilisateur et dossiers"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$BASE" --shell /bin/bash "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$BASE"
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "$BASE/storage" "$BASE/backups"

echo "==> Code de l'application"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
if [ ! -f "$APP_DIR/backend/.env" ]; then
  install -o "$APP_USER" -g "$APP_USER" -m 600 "$APP_DIR/backend/.env.production.example" "$APP_DIR/backend/.env"
  sed -i "s#PUBLIC_API_URL=https://DOMAINE#PUBLIC_API_URL=https://$DOMAIN#" "$APP_DIR/backend/.env"
  for key in JWT_SECRET OTP_SECRET FILE_URL_SECRET BACKUP_ENCRYPTION_KEY; do
    sed -i "s#^$key=\$#$key=$(openssl rand -hex 32)#" "$APP_DIR/backend/.env"
  done
fi

echo "==> Nginx"
sed "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/deploy/nginx/clinicrdv.conf" > /etc/nginx/sites-available/clinicrdv
ln -sf /etc/nginx/sites-available/clinicrdv /etc/nginx/sites-enabled/clinicrdv
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Pare-feu"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> Certificat HTTPS"
certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --redirect --non-interactive

echo "==> PM2 au démarrage"
env PATH="$PATH" pm2 startup systemd -u "$APP_USER" --hp "$BASE"
sudo -u "$APP_USER" -H pm2 install pm2-logrotate
sudo -u "$APP_USER" -H pm2 set pm2-logrotate:max_size 10M
sudo -u "$APP_USER" -H pm2 set pm2-logrotate:retain 14

echo "==> Sauvegarde quotidienne"
cat > /etc/cron.d/clinicrdv-backup <<CRON
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 * * * $APP_USER cd $APP_DIR/backend && npm run db:backup >> $BASE/backups/backup.log 2>&1 && find $BASE/backups -name 'clinicrdv-*' -mtime +14 -delete
CRON
chmod 644 /etc/cron.d/clinicrdv-backup

echo
echo "Installation terminée."
echo "1. Compléter $APP_DIR/backend/.env (DATABASE_URL, Brevo, SMSGate) :"
echo "   sudo -u $APP_USER nano $APP_DIR/backend/.env"
echo "2. Noter BACKUP_ENCRYPTION_KEY dans un gestionnaire de mots de passe."
echo "3. Déployer : sudo -u $APP_USER -H bash $APP_DIR/deploy/deploy.sh"
