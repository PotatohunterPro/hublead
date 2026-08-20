#!/usr/bin/env bash
# =============================================================================
#  HUB LEADS — Atualizador (wrapper raiz)
#  Delega para infra/update.sh (o script real)
#  Uso:  sudo bash update.sh
# =============================================================================
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/infra/update.sh" "$@"
