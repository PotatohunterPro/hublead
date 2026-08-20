#!/usr/bin/env bash
# =============================================================================
#  HUB LEADS — Instalador idempotente
#  Ubuntu 24.04 LTS | Oracle VPS Always Free
#  16 fases | rollback automático | preservação de dados
# =============================================================================
set -Eeuo pipefail

# ----------------------------------------------------------------------------
#  Constantes
# ----------------------------------------------------------------------------
APP_NAME="hubleads"
APP_USER="hubleads"
APP_DIR="/opt/hubleads"
BACKUP_DIR="${APP_DIR}/backups"
ENV_FILE="${APP_DIR}/.env"
LOG_FILE="${APP_DIR}/install.log"
NGINX_SITE="/etc/nginx/sites-available/hublead.conf"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/hublead.conf"
WEB_ROOT="/var/www/hublead"
SERVICE_FILE="/etc/systemd/system/hubleads.service"
DOMAIN_DEFAULT="hublead.pradodacostasolucoes.com.br"
SSL_EMAIL_DEFAULT="contato@pradodacostasolucoes.com.br"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_LOG_FILE="${LOG_FILE}"

# ----------------------------------------------------------------------------
#  Cores / helpers
# ----------------------------------------------------------------------------
C_RESET="\e[0m"; C_RED="\e[31m"; C_GREEN="\e[32m"; C_YELLOW="\e[33m"; C_CYAN="\e[36m"

log()   { local c="$1"; shift; [ -d "$(dirname "$LOG_FILE")" ] || mkdir -p "$(dirname "$LOG_FILE")"; echo -e "${c}[${APP_NAME}]${C_RESET} $*" | tee -a "$LOG_FILE"; }
info()  { log "$C_CYAN" "INFO   » $*"; }
ok()    { log "$C_GREEN" "OK     » $*"; }
warn()  { log "$C_YELLOW" "WARN   » $*"; }
err()   { log "$C_RED" "ERRO   » $*"; }

# Estado (snapshot p/ rollback)
STATE_SNAPSHOT=""

on_error() {
    local lineno=$1
    err "Falha na linha ${lineno}. Iniciando rollback..."
    rollback
    exit 1
}
trap 'on_error $LINENO' ERR

# ----------------------------------------------------------------------------
#  Estados de snapshot (rollback)
# ----------------------------------------------------------------------------
snapshot_capture() {
    STATE_SNAPSHOT="$(mktemp)"
    {
        echo "containers:"
        (docker ps -q --filter name=hubleads 2>/dev/null || true)
        echo "env_present: $([ -f "$ENV_FILE" ] && echo yes || echo no)"
        echo "nginx_site: $([ -f "$NGINX_SITE_ENABLED" ] && echo yes || echo no)"
        echo "certbot: $(certbot certificates 2>/dev/null | grep -c 'Certificate Name' 2>/dev/null || true)"
    } > "$STATE_SNAPSHOT"
    info "Snapshot de estado capturado"
}

rollback() {
    if [ -z "${STATE_SNAPSHOT}" ] || [ ! -f "$STATE_SNAPSHOT" ]; then
        warn "Sem snapshot; rollback parcial"
        return
    fi
    warn "Restaurando estado anterior..."
    cd "${APP_DIR}" || return 0
    if docker compose ps -q >/dev/null 2>&1; then
        docker compose up -d >/dev/null 2>&1 || true
    fi
    if [ -f "$NGINX_SITE_ENABLED" ]; then
        systemctl reload nginx >/dev/null 2>&1 || true
    fi
    rm -f "$STATE_SNAPSHOT"
    ok "Rollback concluído. Verifique $LOG_FILE"
}

# ----------------------------------------------------------------------------
#  Modos de execução
# ----------------------------------------------------------------------------
MODE="auto"
for arg in "$@"; do
    case "$arg" in
        --fresh)    MODE="fresh" ;;
        --update)   MODE="update" ;;
        --repair)   MODE="repair" ;;
        --force)    MODE="force" ;;
        --selftest) MODE="selftest" ;;
        --help|-h)  echo "Uso: sudo bash install.sh [--fresh|--update|--repair|--force|--selftest]"; exit 0 ;;
    esac
done

is_installed() {
    [ -f "$ENV_FILE" ] && [ -f "${APP_DIR}/compose.yaml" ]
}

# ----------------------------------------------------------------------------
#  FASE 2 — Menu interativo se já instalado
# ----------------------------------------------------------------------------
handle_existing() {
    if ! is_installed; then
        MODE="fresh"
        return
    fi
    if [ "$MODE" != "auto" ]; then return; fi

    echo ""
    echo "Já existe uma instalação do Hub Leads."
    echo "  1) Atualizar (manter dados)"
    echo "  2) Reparar (restaurar compose + nginx)"
    echo "  3) Reinstalar (preservar .env e volumes)"
    echo "  4) Cancelar"
    read -rp "Opção [1-4]: " opt
    case "$opt" in
        1) MODE="update" ;;
        2) MODE="repair" ;;
        3) MODE="force" ;;
        4) echo "Cancelado."; exit 0 ;;
        *) warn "Opção inválida"; exit 1 ;;
    esac
}

# ----------------------------------------------------------------------------
#  FASE 1 — Detecção de ambiente
# ----------------------------------------------------------------------------
detect_environment() {
    info "FASE 1/16 — Detecção de ambiente"
    if [ "$(id -u)" -ne 0 ]; then
        err "Execute com sudo: sudo bash install.sh"
        exit 1
    fi
    if ! grep -q "Ubuntu" /etc/os-release; then
        warn "Distribuição não Ubuntu. Continuando mesmo assim (testado apenas em 24.04)."
    fi
    RAM_MB=$(free -m | awk '/Mem:/{print $2}')
    info "RAM: ${RAM_MB} MB"
    if [ "$RAM_MB" -lt 1024 ]; then
        warn "RAM baixa (<1GB). Recomendado habilitar swap."
    fi
    # Swap automático 2GB
    if ! swapon --show | grep -q swapfile && [ ! -f /swapfile ]; then
        warn "Criando swap de 2GB..."
        fallocate -l 2G /swapfile
        chmod 600 /swapfile
        mkswap /swapfile >/dev/null
        swapon /swapfile >/dev/null
        grep -q "/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
        ok "Swap 2GB criado"
    else
        ok "Swap já existente ou desnecessário"
    fi
}

# ----------------------------------------------------------------------------
#  FASE 3 — Dependências
# ----------------------------------------------------------------------------
install_dependencies() {
    info "FASE 3/16 — Dependências"
    apt-get update -qq
    apt-get install -y -qq curl wget ufw certbot python3-certbot-nginx ca-certificates gnupg lsb-release dnsutils openssl >/dev/null

    if ! command -v docker >/dev/null 2>&1; then
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg >/dev/null
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
            > /etc/apt/sources.list.d/docker.list
        apt-get update -qq
        apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
        ok "Docker instalado"
    else
        ok "Docker já presente"
    fi

    systemctl enable --now docker >/dev/null 2>&1 || true
    docker --version
    docker compose version
}

# ----------------------------------------------------------------------------
#  FASE 4 — Usuário de sistema
# ----------------------------------------------------------------------------
setup_user() {
    info "FASE 4/16 — Usuário de sistema"
    if id "$APP_USER" >/dev/null 2>&1; then
        ok "Usuário ${APP_USER} já existe"
    else
        useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
        ok "Usuário ${APP_USER} criado"
    fi
    # Necessario para o systemd unit (ExecStart=docker compose) rodar como este usuario
    if getent group docker >/dev/null 2>&1; then
        usermod -aG docker "$APP_USER" 2>/dev/null || true
        ok "Usuário ${APP_USER} adicionado ao grupo docker"
    fi
    mkdir -p "$APP_DIR"
}

# ----------------------------------------------------------------------------
#  FASE 5 — Segredos (preservados em reinstalação)
# ----------------------------------------------------------------------------
ensure_secrets() {
    info "FASE 5/16 — Segredos"
    if [ -f "$ENV_FILE" ]; then
        ok ".env existente preservado"
        return
    fi
    POSTGRES_PASSWORD="$(openssl rand -hex 16)"
    PB_ENCRYPTION_KEY="$(openssl rand -hex 32)"
    EVOLUTION_API_KEY="$(openssl rand -hex 20)"
    DOMAIN="${DOMAIN_OVERRIDE:-$DOMAIN_DEFAULT}"
    SSL_EMAIL="${SSL_EMAIL_DEFAULT}"
    export POSTGRES_PASSWORD PB_ENCRYPTION_KEY EVOLUTION_API_KEY DOMAIN SSL_EMAIL
    ok "Segredos gerados"
}

# ----------------------------------------------------------------------------
#  FASE 6 — Diretórios e permissões
# ----------------------------------------------------------------------------
create_dirs() {
    info "FASE 6/16 — Diretórios"
    mkdir -p "$APP_DIR/backups"
    mkdir -p "$WEB_ROOT"
    mkdir -p /var/log/nginx
    chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
    chmod 750 "$APP_DIR"
}

# ----------------------------------------------------------------------------
#  FASE 7 — .env
# ----------------------------------------------------------------------------
write_env() {
    info "FASE 7/16 — .env"
    if [ -f "$ENV_FILE" ]; then
        ok ".env já existe — mantendo"
        return
    fi
    cat > "$ENV_FILE" <<EOF
# Hub Leads — variáveis de ambiente
DOMAIN=${DOMAIN}
SSL_EMAIL=${SSL_EMAIL}

# PostgreSQL
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=hubleads

# PocketBase
PB_ENCRYPTION_KEY=${PB_ENCRYPTION_KEY}

# Evolution API
EVOLUTION_API_KEY=${EVOLUTION_API_KEY}
EVOLUTION_INSTANCE_NAME=hub_hunter

COMPOSE_PROJECT_NAME=hubleads
EOF
    chmod 600 "$ENV_FILE"
    chown "$APP_USER":"$APP_USER" "$ENV_FILE"
    ok ".env criado (modo 600)"
}

# ----------------------------------------------------------------------------
#  Copia compose + frontend
# ----------------------------------------------------------------------------
deploy_files() {
    info "FASE 8/16 — Arquivos da aplicação"
    PROJECT_ROOT="${SCRIPT_DIR}/.."
    # Compose
    if [ -f "${SCRIPT_DIR}/compose.yaml" ]; then
        cp "${SCRIPT_DIR}/compose.yaml" "$APP_DIR/compose.yaml"
        # Ajusta path do pb_hooks no compose: relativo a $APP_DIR no servidor
        sed -i 's|\.\./pb_hooks|./pb_hooks|g' "$APP_DIR/compose.yaml"
        chown "$APP_USER":"$APP_USER" "$APP_DIR/compose.yaml"
    fi
    # Init scripts do Postgres (cria banco evolution no 1o boot)
    if [ -d "${SCRIPT_DIR}/pg-init" ]; then
        mkdir -p "$APP_DIR/pg-init"
        cp -r "${SCRIPT_DIR}/pg-init/." "$APP_DIR/pg-init/"
        chown "$APP_USER":"$APP_USER" "$APP_DIR/pg-init"
    fi
    # Frontend (arquivos na RAIZ do projeto: index.html, js/, css/, assets/, sw.js, manifest.json)
    mkdir -p "$WEB_ROOT"
    for f in index.html manifest.json sw.js; do
        [ -f "${PROJECT_ROOT}/${f}" ] && cp "${PROJECT_ROOT}/${f}" "$WEB_ROOT/${f}"
    done
    for d in js css assets; do
        if [ -d "${PROJECT_ROOT}/${d}" ]; then
            mkdir -p "$WEB_ROOT/${d}"
            cp -r "${PROJECT_ROOT}/${d}/." "$WEB_ROOT/${d}/"
        fi
    done
    chown -R www-data:www-data "$WEB_ROOT" 2>/dev/null || true
    chmod -R 755 "$WEB_ROOT"
    # PocketBase hooks
    if [ -d "${PROJECT_ROOT}/pb_hooks" ]; then
        mkdir -p "$APP_DIR/pb_hooks"
        cp -r "${PROJECT_ROOT}/pb_hooks/." "$APP_DIR/pb_hooks/"
        chown -R "$APP_USER":"$APP_USER" "$APP_DIR/pb_hooks"
        ok "pb_hooks copiados"
    fi
    ok "Arquivos copiados"
}

# ----------------------------------------------------------------------------
#  FASE 9 — Docker Compose up
# ----------------------------------------------------------------------------
compose_up() {
    info "FASE 9/16 — Docker Compose up"
    cd "$APP_DIR"
    # Ajusta porta 8080/8090 do compose p/ 127.0.0.1 (override p/ Oracle)
    set -a; source "$ENV_FILE"; set +a
    docker compose pull >/dev/null 2>&1 || warn "pull falhou; tentando build/up direto"
    docker compose up -d
    ok "Containers iniciados"
}

# ----------------------------------------------------------------------------
#  FASE 10 — Healthcheck
# ----------------------------------------------------------------------------
wait_health() {
    info "FASE 10/16 — Healthcheck"
    local i
    for i in $(seq 1 60); do
        if docker compose -f "$APP_DIR/compose.yaml" ps --format '{{.Status}}' 2>/dev/null | grep -qi "Up"; then
            sleep 5
            if docker ps --format '{{.Names}}' | grep -q hubleads; then
                ok "Containers saudáveis (${i}0s)"
                return
            fi
        fi
        sleep 5
    done
    err "Timeout no healthcheck. Execute: docker compose -f $APP_DIR/compose.yaml logs"
    exit 1
}

# ----------------------------------------------------------------------------
#  FASE 10b — Banco evolution (Evolution API exige DB proprio no Postgres)
# ----------------------------------------------------------------------------
ensure_evolution_db() {
    info "FASE 10b/16 — Banco evolution"
    # Espera o Postgres aceitar conexoes (1o boot roda initdb e pode demorar)
    local i
    for i in $(seq 1 30); do
        if docker exec hubleads-postgres pg_isready -U postgres >/dev/null 2>&1; then break; fi
        sleep 2
    done
    if docker exec hubleads-postgres psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='evolution'" | grep -q 1; then
        ok "Banco evolution ja existe"
    else
        docker exec hubleads-postgres psql -U postgres -c "CREATE DATABASE evolution"
        ok "Banco evolution criado"
    fi
    # Garante que a Evolution API suba depois do banco existir (initdb so roda no 1o boot)
    if docker ps --format '{{.Names}}' | grep -q hubleads-evolution; then
        docker restart hubleads-evolution >/dev/null 2>&1 || true
    fi
}

# ----------------------------------------------------------------------------
#  FASE 11 — Nginx
# ----------------------------------------------------------------------------
setup_nginx() {
    info "FASE 11/16 — Nginx (site HTTP temporario)"
    apt-get install -y -qq nginx >/dev/null
    # nginx.conf com log_format main + security headers + include sites-enabled
    cp "${SCRIPT_DIR}/nginx/nginx.conf" /etc/nginx/nginx.conf
    # Site HTTP temporario (sem SSL) — o setup_ssl troca para o HTTPS depois
    cp "${SCRIPT_DIR}/nginx/sites/hublead-http.conf" "$NGINX_SITE"
    sed -i "s|__DOMAIN__|${DOMAIN:-hublead.pradodacostasolucoes.com.br}|g" "$NGINX_SITE"
    ln -sf "$NGINX_SITE" "$NGINX_SITE_ENABLED"
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    nginx -t || { err "nginx -t falhou"; exit 1; }
    systemctl enable nginx >/dev/null 2>&1 || true
    systemctl reload nginx >/dev/null 2>&1 || true
    ok "Nginx configurado (HTTP)"
}

# ----------------------------------------------------------------------------
#  FASE 12 — SSL (com verificação de DNS)
# ----------------------------------------------------------------------------
setup_ssl() {
    info "FASE 12/16 — SSL Let's Encrypt"
    local DOM="${DOMAIN:-hublead.pradodacostasolucoes.com.br}"
    if certbot certificates 2>/dev/null | grep -q "$DOM"; then
        ok "Certificado já existe"
    else
        local ip_actual
        ip_actual="$(dig +short "$DOM" 2>/dev/null | head -n1 || true)"
        if [ -z "$ip_actual" ]; then
            warn "DNS não resolve ainda. Tentando mesmo assim (pode falhar)..."
        fi
        if certbot --nginx -d "$DOM" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect; then
            ok "Certificado emitido"
        else
            warn "Falha na emissão do certificado (verifique DNS apontando para esta VPS)."
            warn "Execute depois: certbot --nginx -d $DOM"
            warn "Continuando com HTTP apenas por enquanto."
        fi
    fi
    # Se o certificado existir, troca o site para a versao HTTPS
    if [ -f "/etc/letsencrypt/live/${DOM}/fullchain.pem" ]; then
        cp "${SCRIPT_DIR}/nginx/sites/hublead.conf" "$NGINX_SITE"
        sed -i "s|__DOMAIN__|${DOM}|g" "$NGINX_SITE"
        ln -sf "$NGINX_SITE" "$NGINX_SITE_ENABLED"
        nginx -t || { err "nginx -t falhou (HTTPS)"; exit 1; }
        systemctl reload nginx >/dev/null 2>&1 || true
        ok "Site HTTPS ativo"
    else
        warn "Certificado ausente — mantendo HTTP. Rode certbot manualmente depois."
    fi
}

# ----------------------------------------------------------------------------
#  FASE 13 — UFW
# ----------------------------------------------------------------------------
setup_ufw() {
    info "FASE 13/16 — UFW"
    if command -v ufw >/dev/null 2>&1; then
        ufw allow OpenSSH
        ufw allow 'Nginx Full'
        echo "y" | ufw enable || true
        ufw status verbose
        ok "UFW configurado"
    fi
}

# ----------------------------------------------------------------------------
#  FASE 14 — Cron de backup
# ----------------------------------------------------------------------------
setup_cron() {
    info "FASE 14/16 — Cron de backup (03:00 diário)"
    if [ -f "${SCRIPT_DIR}/backup.sh" ]; then
        cp "${SCRIPT_DIR}/backup.sh" "$APP_DIR/backup.sh"
        chmod +x "$APP_DIR/backup.sh"
        chown "$APP_USER":"$APP_USER" "$APP_DIR/backup.sh"
    fi
    local cron_line="0 3 * * * ${APP_DIR}/backup.sh >> ${LOG_FILE} 2>&1"
    ( crontab -l 2>/dev/null | grep -v "${APP_DIR}/backup.sh"; echo "$cron_line" ) | crontab -
    ok "Cron instalado"
}

# ----------------------------------------------------------------------------
#  FASE 15 — Systemd
# ----------------------------------------------------------------------------
setup_systemd() {
    info "FASE 15/16 — Systemd unit"
    if [ -f "${SCRIPT_DIR}/deploy/hubleads.service" ]; then
        cp "${SCRIPT_DIR}/deploy/hubleads.service" "$SERVICE_FILE"
        systemctl daemon-reload
        systemctl enable hubleads.service >/dev/null 2>&1 || true
        ok "Systemd unit instalado"
    fi
}

# ----------------------------------------------------------------------------
#  FASE 16 — INSTALL_SUMMARY + self-test
# ----------------------------------------------------------------------------
write_summary() {
    info "FASE 16/16 — INSTALL_SUMMARY.md"
    # Garante DOMAIN disponivel (le do .env)
    [ -n "${DOMAIN:-}" ] || { set -a; [ -f "$ENV_FILE" ] && source "$ENV_FILE"; set +a; }
    local now
    now="$(date '+%Y-%m-%d %H:%M')"
    cat > "${APP_DIR}/INSTALL_SUMMARY.md" <<EOF
# INSTALL SUMMARY — Hub Leads

> Gerado: ${now}
> ⚠️ Contém credenciais. Não compartilhe.

## URLs
- App: https://${DOMAIN}/
- PocketBase Admin: https://${DOMAIN}/_/
- Evolution API: https://${DOMAIN}/evolution/

## Credenciais
- PocketBase Admin: admin@hubsolucao.com.br / (senha gerada manualmente no 1º acesso)
- Evolution API Key: $(grep EVOLUTION_API_KEY "$ENV_FILE" | cut -d= -f2)
- Evolution Instância: hub_hunter
- PostgreSQL: postgres / $(grep POSTGRES_PASSWORD "$ENV_FILE" | cut -d= -f2)

## Comandos
- Status: cd ${APP_DIR} && docker compose ps
- Backup: sudo bash ${APP_DIR}/backup.sh
- Restore: sudo bash ${APP_DIR}/restore.sh
- Doctor: sudo bash ${APP_DIR}/doctor
EOF
    chown "$APP_USER":"$APP_USER" "${APP_DIR}/INSTALL_SUMMARY.md"
    chmod 600 "${APP_DIR}/INSTALL_SUMMARY.md"
    ok "INSTALL_SUMMARY.md gerado em ${APP_DIR}/INSTALL_SUMMARY.md"
}

self_test() {
    info "Self-test final"
    local fail=0
    # Containers
    if docker ps --format '{{.Names}}' | grep -q hubleads; then ok "Containers OK"; else err "Containers não rodando"; fail=1; fi
    # Nginx
    if systemctl is-active nginx >/dev/null 2>&1; then ok "Nginx OK"; else err "Nginx inativo"; fail=1; fi
    # .env
    if [ -f "$ENV_FILE" ] && [ "$(stat -c%a "$ENV_FILE")" = "600" ]; then ok ".env modo 600 OK"; else err ".env inválido"; fail=1; fi
    # UFW
    if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then ok "UFW OK"; else warn "UFW inativo"; fi
    # Portas públicas
    if ss -tlnp 2>/dev/null | grep -E ":8080|:8090" | grep -q "127.0.0.1"; then
        ok "Portas 8080/8090 restritas a localhost"
    else
        warn "Portas 8080/8090 podem estar expostas"
    fi

    if [ "$fail" -eq 0 ]; then
        ok "✓ Self-test: TUDO OK"
    else
        err "Self-test com falhas — consulte $LOG_FILE"
        exit 1
    fi
}

# =============================================================================
#  MAIN
# =============================================================================
main() {
    # CRITICO: criar diretorio e log ANTES do primeiro log() (evita 'No such file or directory')
    mkdir -p "$APP_DIR"
    : > "$LOG_FILE"; touch "$LOG_FILE"; chmod 640 "$LOG_FILE"
    info "=== HUB LEADS — Instalação iniciada (modo: ${MODE}) ==="

    handle_existing
    snapshot_capture

    case "$MODE" in
        fresh|force|repair)
            detect_environment
            install_dependencies
            setup_user
            ensure_secrets
            create_dirs
            write_env
            deploy_files
            compose_up
            ensure_evolution_db
            wait_health
            setup_nginx
            setup_ssl
            setup_ufw
            setup_cron
            setup_systemd
            write_summary
            self_test
            ;;
        update)
            deploy_files
            compose_up
            wait_health
            systemctl reload nginx >/dev/null 2>&1 || true
            self_test
            ;;
        selftest)
            self_test
            ;;
    esac

    ok "=== Instalação concluída com sucesso ==="
    ok "App: https://${DOMAIN:-hublead.pradodacostasolucoes.com.br}/"
    ok "Resumo: ${APP_DIR}/INSTALL_SUMMARY.md"
}
main "$@"
