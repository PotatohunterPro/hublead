#!/usr/bin/env bash
# =============================================================================
#  HUB LEADS — Desinstalação limpa
# =============================================================================
set -Eeuo pipefail

APP_DIR="/opt/hubleads"
BACKUP_DIR="${APP_DIR}/backups"
C_RESET="\e[0m"; C_RED="\e[31m"; C_GREEN="\e[32m"; C_YELLOW="\e[33m"; C_CYAN="\e[36m"

err()   { echo -e "${C_RED}[hubleads]${C_RESET} $*"; }
ok()    { echo -e "${C_GREEN}[hubleads]${C_RESET} $*"; }
info()  { echo -e "${C_CYAN}[hubleads]${C_RESET} $*"; }

if [ "$(id -u)" -ne 0 ]; then err "Execute com sudo"; exit 1; fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     HUB LEADS — Desinstalação            ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "⚠️  Isso vai REMOVER:"
echo "   • Containers Docker (postgres, pocketbase, evolution)"
echo "   • Volumes Docker (postgres-data, pb-data, evolution-data)"
echo "   • Configurações do Nginx + SSL"
echo "   • Diretório ${APP_DIR}"
echo "   • Cron de backup"
echo "   • Systemd unit"
echo "⚠️  DADOS NÃO REMOVIDOS:"
echo "   • Backups em ${BACKUP_DIR} (serão mantidos)"
echo ""

read -rp "Digite 'DESINSTALAR' para confirmar: " conf
if [ "$conf" != "DESINSTALAR" ]; then
    echo "Cancelado."; exit 0
fi

# 1. Parar containers
if [ -f "${APP_DIR}/compose.yaml" ]; then
    cd "$APP_DIR" && docker compose down --volumes 2>/dev/null || true
    ok "Containers parados e volumes removidos"
fi

# 2. Remover systemd unit
systemctl disable hubleads.service 2>/dev/null || true
rm -f /etc/systemd/system/hubleads.service
systemctl daemon-reload
ok "Systemd unit removido"

# 3. Remover Nginx site
rm -f /etc/nginx/sites-enabled/hublead.conf
rm -f /etc/nginx/sites-available/hublead.conf
systemctl reload nginx 2>/dev/null || true
ok "Nginx site removido"

# 4. Remover SSL
DOMAIN=$(grep DOMAIN "${APP_DIR}/.env" 2>/dev/null | cut -d= -f2 || echo "hublead.pradodacostasolucoes.com.br")
certbot delete --cert-name "$DOMAIN" --non-interactive 2>/dev/null || true
ok "Certificado SSL removido"

# 5. Remover cron
crontab -l 2>/dev/null | grep -v "${APP_DIR}/backup.sh" | crontab - || true
ok "Cron removido"

# 6. Remover diretório (exceto backups)
find "$APP_DIR" -maxdepth 1 -not -path "$APP_DIR" -not -name "backups" -exec rm -rf {} + 2>/dev/null || true
ok "Diretório ${APP_DIR} limpo (backups preservados)"

# 7. Remover web root
rm -rf /var/www/hublead
ok "Web root removido"

# 8. Remover usuário
userdel -r hubleads 2>/dev/null || true
ok "Usuário hubleads removido"

echo ""
ok "Desinstalação concluída."
echo "Backups preservados em: ${BACKUP_DIR}"
echo "Para remover os backups: rm -rf ${BACKUP_DIR}"