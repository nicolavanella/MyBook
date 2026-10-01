#!/usr/bin/env bash
# =============================================================================
# MyBook — scripts/install.sh
# Bootstrap dell'ambiente di sviluppo su macOS/Linux.
# Esegui dalla root del progetto: bash scripts/install.sh
# =============================================================================

set -euo pipefail

echo "== MyBook — setup ambiente di sviluppo (Unix) =="

# --- Verifica Node.js --------------------------------------------------------
if ! command -v node &> /dev/null; then
  echo "Node.js non trovato. Installa Node.js LTS da https://nodejs.org o con nvm." >&2
  exit 1
fi

NODE_VERSION=$(node -v)
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)
echo "Node.js trovato: $NODE_VERSION"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Attenzione: è consigliata Node.js 20 LTS o superiore (trovata $NODE_VERSION)." >&2
fi

# --- Verifica npm -------------------------------------------------------------
echo "npm trovato: $(npm -v)"

# --- Verifica Git ---------------------------------------------------------------
if ! command -v git &> /dev/null; then
  echo "Git non trovato. Installa Git dal package manager di sistema." >&2
  exit 1
fi
echo "Git trovato: $(git --version)"

# --- Strumenti di build nativi (necessari per better-sqlite3) -------------------
# macOS: richiede Xcode Command Line Tools (xcode-select --install)
# Linux: richiede build-essential/python3 (es. apt install build-essential python3)
echo ""
echo "Nota: se 'npm install' fallisce compilando better-sqlite3:"
echo "  - macOS: esegui 'xcode-select --install'"
echo "  - Linux: installa build-essential e python3 (es. 'sudo apt install build-essential python3')"
echo ""

# --- Installazione dipendenze ----------------------------------------------------
echo "Installazione dipendenze npm..."
npm install

# --- npm >= 12: gli install script delle dipendenze (better-sqlite3, electron, ---
# esbuild) sono bloccati di default per motivi di sicurezza, a meno che non siano
# elencati in "allowScripts" nel package.json (dove sono gia' presenti in questo
# progetto). "npm rebuild" li esegue se erano stati comunque saltati durante
# l'install qui sopra. Innocuo su versioni di npm piu' vecchie.
echo "Verifica/esecuzione degli install script delle dipendenze native..."
npm rebuild

# --- Migrazione database iniziale -------------------------------------------------
echo "Esecuzione migrazioni database..."
npm run db:migrate

echo ""
echo "== Setup completato =="
echo "Avvia l'ambiente di sviluppo con: npm run dev"
