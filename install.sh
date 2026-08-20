#!/usr/bin/env bash
# =============================================================================
#  HUB LEADS — Instalador (wrapper raiz)
#  Delega para infra/install.sh (o script real, com as 16 fases)
#  Uso:  sudo bash install.sh [--fresh|--update|--repair|--force|--selftest]
# =============================================================================
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/infra/install.sh" "$@"
