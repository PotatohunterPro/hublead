#!/usr/bin/env bash
# =============================================================================
#  HUB LEADS — Atualizador idempotente
#  Atualiza Frontend, PocketBase Hooks, Nginx e Docker Compose
#  Uso: sudo bash update.sh
# =============================================================================
set -Eeuo pipefail

APP_DIR="/opt/hubleads"
LOG_FILE="${APP_DIR}/install.log"
NGINX_SITE="/etc/nginx/sites-available/hublead.conf"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/hublead.conf"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${APP_DIR}/backups"

C_RESET="\e[0m"; C_RED="\e[31m"; C_GREEN="\e[32m"; C_YELLOW="\e[33m"; C_CYAN="\e[36m"
info()  { echo -e "${C_CYAN}[hubleads] INFO${C_RESET}  $*" | tee -a "$LOG_FILE"; }
ok()    { echo -e "${C_GREEN}[hubleads] OK${C_RESET}    $*" | tee -a "$LOG_FILE"; }
warn()  { echo -e "${C_YELLOW}[hubleads] WARN${C_RESET}  $*" | tee -a "$LOG_FILE"; }
err()   { echo -e "${C_RED}[hubleads] ERRO${C_RESET}  $*" | tee -a "$LOG_FILE"; }

on_error() { err "Falha na linha $1"; exit 1; }
trap 'on_error $LINENO' ERR

if [ "$(id -u)" -ne 0 ]; then err "Execute com sudo: sudo bash update.sh"; exit 1; fi
if [ ! -f "${APP_DIR}/compose.yaml" ]; then err "Instalação não encontrada em ${APP_DIR}. Execute install.sh primeiro."; exit 1; fi

info "=== HUB LEADS — Iniciando atualização ==="

# 1. Backup de segurança antes de atualizar
if [ -f "${SCRIPT_DIR}/backup.sh" ]; then
    info "Executando backup de segurança..."
    bash "${SCRIPT_DIR}/backup.sh" || warn "Backup pré-update falhou (continuando)"
fi

# 2. Atualizar arquivos da pasta local
cd "$SCRIPT_DIR"
PROJECT_ROOT="${SCRIPT_DIR}/.."

# Compose
if [ -f "${SCRIPT_DIR}/compose.yaml" ]; then
    cp "${SCRIPT_DIR}/compose.yaml" "${APP_DIR}/compose.yaml"
    sed -i 's|\.\./pb_hooks|./pb_hooks|g' "${APP_DIR}/compose.yaml"
    ok "compose.yaml atualizado"
fi

# Frontend (raiz do projeto: index.html, manifest.json, sw.js, js/, css/, assets/)
if [ -f "${PROJECT_ROOT}/index.html" ]; then
    mkdir -p /var/www/hublead
    for f in index.html manifest.json sw.js; do
        [ -f "${PROJECT_ROOT}/${f}" ] && cp "${PROJECT_ROOT}/${f}" /var/www/hublead/${f}
    done
    for d in js css assets; do
        if [ -d "${PROJECT_ROOT}/${d}" ]; then
            mkdir -p "/var/www/hublead/${d}"
            cp -r "${PROJECT_ROOT}/${d}/." "/var/www/hublead/${d}/"
        fi
    done
    chown -R www-data:www-data /var/www/hublead 2>/dev/null || true
    chmod -R 755 /var/www/hublead
    ok "Frontend e assets atualizados em /var/www/hublead"
fi

# PocketBase Hooks
if [ -d "${PROJECT_ROOT}/pb_hooks" ]; then
    mkdir -p "${APP_DIR}/pb_hooks"
    cp -r "${PROJECT_ROOT}/pb_hooks/." "${APP_DIR}/pb_hooks/"
    ok "pb_hooks atualizados"
fi

# Nginx: copia configurações
if [ -f "${SCRIPT_DIR}/nginx/nginx.conf" ]; then
    cp "${SCRIPT_DIR}/nginx/nginx.conf" /etc/nginx/nginx.conf
    ok "nginx.conf atualizado"
fi

if [ -f "${SCRIPT_DIR}/nginx/sites/hublead.conf" ]; then
    DOMAIN="$(grep DOMAIN "${APP_DIR}/.env" 2>/dev/null | cut -d= -f2 || echo "hublead.pradodacostasolucoes.com.br")"
    cp "${SCRIPT_DIR}/nginx/sites/hublead.conf" "$NGINX_SITE"
    sed -i "s|__DOMAIN__|${DOMAIN}|g" "$NGINX_SITE"
    ln -sf "$NGINX_SITE" "$NGINX_SITE_ENABLED"
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    ok "Nginx site ($DOMAIN) atualizado"
fi

# 3. Rebuild / recreate containers
cd "$APP_DIR"
set -a; [ -f .env ] && source .env; set +a

info "Atualizando e reiniciando containers..."
docker compose pull >/dev/null 2>&1 || warn "docker compose pull falhou (tentando direto)"
docker compose up -d --remove-orphans
ok "Containers iniciados e órfãos removidos"

# 4. Reload Nginx
if command -v nginx >/dev/null 2>&1; then
    nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || warn "Reload do Nginx com aviso"
    ok "Nginx recarregado"
fi

# 5. Status final
echo ""
info "Status dos containers:"
docker compose ps
echo ""
ok "=== Atualização concluída com sucesso! ==="
ok "Acesse: https://${DOMAIN:-hublead.pradodacostasolucoes.com.br}/"
