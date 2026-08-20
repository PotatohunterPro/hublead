#!/usr/bin/env bash
# =============================================================================
#  HUB LEADS — Backup diário
#  PostgreSQL + storage do PocketBase + evolution-data
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
err()   { echo -e "${C_RED}[hubleads] ERRO${C_RESET}  $*"; }

on_error() { err "Falha na linha $1"; exit 1; }
trap 'on_error $LINENO' ERR

if [ "$(id -u)" -ne 0 ]; then err "Execute com sudo"; exit 1; fi
[ -f "$ENV_FILE" ] || { err ".env não encontrado"; exit 1; }
set -a; source "$ENV_FILE"; set +a

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/hubleads_${TS}"
mkdir -p "$OUT"

info "Backup iniciado: $TS"

# 1. PostgreSQL (2 bancos: hubleads + evolution)
if docker ps --format '{{.Names}}' | grep -q hubleads-postgres; then
    docker exec hubleads-postgres pg_dump -U postgres hubleads > "${OUT}/hubleads.sql" 2>/dev/null \
        || warn "pg_dump hubleads falhou"
    docker exec hubleads-postgres pg_dump -U postgres evolution > "${OUT}/evolution.sql" 2>/dev/null \
        || warn "pg_dump evolution falhou"
    ok "Dumps SQL gerados"
else
    err "Container postgres não encontrado"
fi

# 2. PocketBase storage (pb_data + pb_public)
if docker ps --format '{{.Names}}' | grep -q hubleads-pocketbase; then
    docker cp hubleads-pocketbase:/pb_data "${OUT}/pb_data" 2>/dev/null || warn "pb_data copiado parcialmente"
    ok "PocketBase storage copiado"
fi

# 3. Evolution data (sessões WhatsApp — CRÍTICO, nunca perder)
if docker ps --format '{{.Names}}' | grep -q hubleads-evolution; then
    docker cp hubleads-evolution:/evolution/instances "${OUT}/evolution_instances" 2>/dev/null || warn "evolution data parcial"
    ok "Evolution data copiado"
fi

# 4. Compactar
tar -czf "${OUT}.tar.gz" -C "$BACKUP_DIR" "$(basename "$OUT")" 2>/dev/null
rm -rf "$OUT"
ok "Arquivo: ${OUT}.tar.gz"

# 5. Retenção 30 dias
find "$BACKUP_DIR" -name "hubleads_*.tar.gz" -mtime +${RETENTION_DAYS} -delete
ok "Retenção: mantidos backups dos últimos ${RETENTION_DAYS} dias"

ls -lh "$BACKUP_DIR" | tail -n 5
info "Backup concluído"
