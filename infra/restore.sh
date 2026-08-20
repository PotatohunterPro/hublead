#!/usr/bin/env bash
# =============================================================================
#  HUB LEADS — Restaurar último backup
# =============================================================================
set -Eeuo pipefail

APP_DIR="/opt/hubleads"
BACKUP_DIR="${APP_DIR}/backups"

C_RESET="\e[0m"; C_RED="\e[31m"; C_GREEN="\e[32m"; C_YELLOW="\e[33m"; C_CYAN="\e[36m"
info()  { echo -e "${C_CYAN}[hubleads] INFO${C_RESET}  $*"; }
ok()    { echo -e "${C_GREEN}[hubleads] OK${C_RESET}    $*"; }
err()   { echo -e "${C_RED}[hubleads] ERRO${C_RESET}  $*"; }

on_error() { err "Falha na linha $1"; exit 1; }
trap 'on_error $LINENO' ERR

if [ "$(id -u)" -ne 0 ]; then err "Execute com sudo"; exit 1; fi

# Escolher backup
LATEST="$(ls -t "$BACKUP_DIR"/hubleads_*.tar.gz 2>/dev/null | head -n1)"
if [ -z "$LATEST" ]; then err "Nenhum backup encontrado em $BACKUP_DIR"; exit 1; fi

echo "Último backup disponível: $(basename "$LATEST")"
echo "⚠️  Isso vai SOBRESCREVER os dados atuais."
read -rp "Continuar? [s/N] " conf
if [[ ! "$conf" =~ ^[sSyY]$ ]]; then
    echo "Cancelado."; exit 0
fi

TMP="$(mktemp -d)"
info "Extraindo $LATEST"
tar -xzf "$LATEST" -C "$TMP"
DIR="$TMP/$(basename "$LATEST" .tar.gz)"

# Restaurar PostgreSQL
if docker ps --format '{{.Names}}' | grep -q hubleads-postgres; then
    if [ -f "$DIR/hubleads.sql" ]; then
        docker exec -i hubleads-postgres psql -U postgres -d hubleads < "$DIR/hubleads.sql" && ok "Banco hubleads restaurado"
    fi
    if [ -f "$DIR/evolution.sql" ]; then
        docker exec -i hubleads-postgres psql -U postgres -d evolution < "$DIR/evolution.sql" && ok "Banco evolution restaurado"
    fi
fi

# Restaurar PocketBase storage
if docker ps --format '{{.Names}}' | grep -q hubleads-pocketbase && [ -d "$DIR/pb_data" ]; then
    docker cp "$DIR/pb_data/." hubleads-pocketbase:/pb_data/ && ok "PocketBase storage restaurado"
fi

# Restaurar Evolution data
if docker ps --format '{{.Names}}' | grep -q hubleads-evolution && [ -d "$DIR/evolution_instances" ]; then
    docker cp "$DIR/evolution_instances/." hubleads-evolution:/evolution/instances/ && ok "Evolution data restaurado"
fi

rm -rf "$TMP"

# Reiniciar containers para aplicar
cd "$APP_DIR"
docker compose restart postgres pocketbase evolution 2>/dev/null || true
ok "Restauração concluída. Containers reiniciados."
