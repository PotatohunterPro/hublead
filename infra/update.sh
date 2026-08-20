#!/usr/bin/env bash
# =============================================================================
#  HUB LEADS — Atualizador idempotente
#  Sem git pull hardcoded; usa a pasta local + loop de migrations
# =============================================================================
set -Eeuo pipefail

APP_DIR="/opt/hubleads"
LOG_FILE="${APP_DIR}/install.log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${APP_DIR}/backups"

C_RESET="\e[0m"; C_RED="\e[31m"; C_GREEN="\e[32m"; C_YELLOW="\e[33m"; C_CYAN="\e[36m"
info()  { echo -e "${C_CYAN}[hubleads] INFO${C_RESET}  $*" | tee -a "$LOG_FILE"; }
ok()    { echo -e "${C_GREEN}[hubleads] OK${C_RESET}    $*" | tee -a "$LOG_FILE"; }
warn()  { echo -e "${C_YELLOW}[hubleads] WARN${C_RESET}  $*" | tee -a "$LOG_FILE"; }
err()   { echo -e "${C_RED}[hubleads] ERRO${C_RESET}  $*" | tee -a "$LOG_FILE"; }

on_error() { err "Falha na linha $1"; exit 1; }
trap 'on_error $LINENO' ERR

if [ "$(id -u)" -ne 0 ]; then err "Execute com sudo"; exit 1; fi
if [ ! -f "${APP_DIR}/compose.yaml" ]; then err "Instalação não encontrada. Rode install.sh"; exit 1; fi

# 1. Backup de segurança antes de atualizar
if [ -f "${SCRIPT_DIR}/backup.sh" ]; then
    info "Backup de segurança antes da atualização..."
    bash "${SCRIPT_DIR}/backup.sh" || warn "Backup pré-update falhou (continuando)"
fi

# 2. Atualizar arquivos (compose, frontend, nginx) da pasta local
cd "$SCRIPT_DIR"
PROJECT_ROOT="${SCRIPT_DIR}/.."
if [ -f compose.yaml ]; then
    cp compose.yaml "${APP_DIR}/compose.yaml"
    sed -i 's|\.\./pb_hooks|./pb_hooks|g' "${APP_DIR}/compose.yaml"
    ok "compose.yaml atualizado"
fi
# Frontend na raiz do projeto: index.html, js/, css/, assets/, sw.js, manifest.json
if [ -f "${PROJECT_ROOT}/index.html" ]; then
    mkdir -p /var/www/hublead
    for f in index.html manifest.json sw.js; do
        [ -f "${PROJECT_ROOT}/${f}" ] && cp "${PROJECT_ROOT}/${f}" /var/www/hublead/${f}
    done
    for d in js css assets; do
        [ -d "${PROJECT_ROOT}/${d}" ] && cp -r "${PROJECT_ROOT}/${d}/." /var/www/hublead/${d}/
    done
    chown -R www-data:www-data /var/www/hublead 2>/dev/null || true
    chmod -R 755 /var/www/hublead
    ok "Frontend atualizado"
fi
if [ -d "${PROJECT_ROOT}/pb_hooks" ]; then
    mkdir -p "${APP_DIR}/pb_hooks"
    cp -r "${PROJECT_ROOT}/pb_hooks/." "${APP_DIR}/pb_hooks/"
    ok "pb_hooks atualizados"
fi
if [ -d "${PROJECT_ROOT}/pg-init" ]; then
    mkdir -p "${APP_DIR}/pg-init"
    cp -r "${PROJECT_ROOT}/pg-init/." "${APP_DIR}/pg-init/"
    ok "pg-init atualizado"
fi

# 3. Loop de migrations (aplicar upgrades na ordem, idempotente)
#    Migration = função bash com nome migration_NNN; registradas num arquivo de estado.
MIGRATIONS_FILE="${APP_DIR}/.migrations_applied"
: > /dev/null
for mig in $(declare -F | awk '{print $3}' | grep '^migration_' | sort -t_ -k2 -n); do
    if ! grep -qx "$mig" "$MIGRATIONS_FILE" 2>/dev/null; then
        info "Aplicando $mig..."
        "$mig"
        echo "$mig" >> "$MIGRATIONS_FILE"
        ok "$mig aplicada"
    else
        ok "$mig já aplicada (skip)"
    fi
done

# 4. Rebuild/recreate containers
cd "$APP_DIR"
set -a; [ -f .env ] && source .env; set +a
docker compose pull || warn "pull falhou"
docker compose up -d --remove-orphans
ok "Containers recriados"

# 4b. Garante banco evolution (criado pelo initdb no 1o boot; fallback idempotente)
if docker ps --format '{{.Names}}' | grep -q hubleads-postgres; then
    for i in $(seq 1 30); do
        if docker exec hubleads-postgres pg_isready -U postgres >/dev/null 2>&1; then break; fi
        sleep 2
    done
    docker exec hubleads-postgres psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='evolution'" | grep -q 1 \
        || docker exec hubleads-postgres psql -U postgres -c "CREATE DATABASE evolution"
    docker restart hubleads-evolution >/dev/null 2>&1 || true
fi

# 5. Reload nginx
systemctl reload nginx >/dev/null 2>&1 || true

# 6. Self-test rápido
docker compose ps
ok "Atualização concluída"

# ---- Funções de migration (adicionar novas no formato migration_00X_nome) ----

migration_001_inicial() {
    # Migração de exemplo — nada a fazer na primeira execução
    return 0
}
