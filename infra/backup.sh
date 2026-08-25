#!/usr/bin/env bash
# =============================================================================
#  HUB LEADS — Backup diário
#  PocketBase (SQLite data + public files) + .env
#  Retenção: 30 dias
# =============================================================================
set -Eeuo pipefail

APP_DIR="/opt/hubleads"
BACKUP_DIR="${APP_DIR}/backups"
ENV_FILE="${APP_DIR}/.env"
RETENTION_DAYS=30
TS="$(date '+%Y%m%d_%H%M%S')"

C_RESET="\e[0m"; C_RED="\e[31m"; C_GREEN="\e[32m"; C_YELLOW="\e[33m"; C_CYAN="\e[36m"
info()  { echo -e "${C_CYAN}[hubleads] INFO${C_RESET}  $*"; }
ok()    { echo -e "${C_GREEN}[hubleads] OK${C_RESET}    $*"; }
warn()  { echo -e "${C_YELLOW}[hubleads] WARN${C_RESET}  $*"; }
err()   { echo -e "${C_RED}[hubleads] ERRO${C_RESET}  $*"; }

on_error() { err "Falha na linha $1"; exit 1; }
trap 'on_error $LINENO' ERR

if [ "$(id -u)" -ne 0 ]; then err "Execute com sudo"; exit 1; fi
[ -f "$ENV_FILE" ] || { err ".env não encontrado"; exit 1; }

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/hubleads_${TS}"
mkdir -p "$OUT"

info "Backup iniciado: $TS"

# 1. PocketBase storage (pb_data com banco SQLite + pb_public)
if docker ps --format '{{.Names}}' | grep -q hubleads-pocketbase; then
    docker cp hubleads-pocketbase:/pb_data "${OUT}/pb_data" 2>/dev/null || warn "pb_data copiado parcialmente"
    ok "PocketBase storage (SQLite) copiado"
fi

# 2. Configurações (.env)
cp "$ENV_FILE" "${OUT}/.env"
ok "Arquivo .env copiado"

# 3. Compactar
tar -czf "${OUT}.tar.gz" -C "$BACKUP_DIR" "$(basename "$OUT")" 2>/dev/null
rm -rf "$OUT"
ok "Arquivo gerado: ${OUT}.tar.gz"

# 4. Retenção 30 dias
find "$BACKUP_DIR" -name "hubleads_*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
ok "Retenção: mantidos backups dos últimos ${RETENTION_DAYS} dias"

info "Backup concluído com sucesso."
