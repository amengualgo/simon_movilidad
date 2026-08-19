#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SimonMovilidad — Project environment activation
# IMPORTANT: must be sourced, not executed directly
# Usage: source activate_project.sh   (or: . activate_project.sh)
# ─────────────────────────────────────────────────────────────────────────────

# Guard: warn if executed instead of sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "ERROR: run as:  source activate_project.sh"
    exit 1
fi

CONDA_ENV_PATH="/media/fox/fox_varios/envs/envSimonMovilidad"

# Initialize conda shell functions (required before conda activate)
eval "$(conda shell.bash hook)"
conda activate envSimonMovilidad

# Fix: el entorno conda se movió de /media/fox/envs a /media/fox/fox_varios/envs
# después de instalarse. ncurses (clear, tput, etc.) tiene esa ruta vieja grabada
# en el binario y no se reubica solo, por eso sin esto falla "terminals database
# is inaccessible" al usar `clear` con este entorno activado.
export TERMINFO_DIRS="$CONDA_ENV_PATH/share/terminfo"

echo ""
echo "  SimonMovilidad environment activated"
echo "  node : $(node --version)"
echo "  npm : $(npm --version)"
echo ""
