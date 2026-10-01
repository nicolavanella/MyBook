# =============================================================================
# MyBook - scripts/install.ps1
# Bootstrap dell'ambiente di sviluppo su Windows.
# Esegui da PowerShell, dalla root del progetto: .\scripts\install.ps1
#
# Se l'esecuzione di script è disabilitata nel sistema in uso.
# Cambia la policy solo per questa sessione
# Nello stesso terminale, esegui: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
# Chiudendo il terminale la restrizione torna quella di sistema
# =============================================================================

$ErrorActionPreference = "Stop"

Write-Host "== MyBook - setup ambiente di sviluppo (Windows) ==" -ForegroundColor Cyan

# --- Verifica Node.js -------------------------------------------------------
try {
    $nodeVersion = node -v
    Write-Host "Node.js trovato: $nodeVersion"
} catch {
    Write-Host "Node.js non trovato. Installa Node.js LTS da https://nodejs.org oppure con nvm-windows." -ForegroundColor Red
    exit 1
}

$nodeMajor = [int]($nodeVersion.TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
    Write-Host "Attenzione: e' consigliata Node.js 20 LTS o superiore (trovata $nodeVersion)." -ForegroundColor Yellow
}

# --- Verifica npm ------------------------------------------------------------
$npmVersion = npm -v
Write-Host "npm trovato: $npmVersion"

# --- Verifica Git -------------------------------------------------------------
try {
    $gitVersion = git --version
    Write-Host "Git trovato: $gitVersion"
} catch {
    Write-Host "Git non trovato. Installa Git da https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

# --- Strumenti di build nativi (necessari per better-sqlite3) ----------------
# better-sqlite3 compila un modulo nativo: su Windows serve una toolchain C++.
# node-gyp usa Visual Studio Build Tools (workload "Desktop development with C++")
# oppure, in alternativa piu' leggera, il pacchetto windows-build-tools (deprecato)
# non e' piu' raccomandato: installa Visual Studio Build Tools manualmente se npm
# install fallisce sulla compilazione di better-sqlite3.
Write-Host ""
Write-Host "Nota: se 'npm install' fallisce compilando better-sqlite3, installa" -ForegroundColor Yellow
Write-Host "Visual Studio Build Tools con il workload 'Desktop development with C++'" -ForegroundColor Yellow
Write-Host "da https://visualstudio.microsoft.com/visual-cpp-build-tools/" -ForegroundColor Yellow
Write-Host ""

# --- Installazione dipendenze --------------------------------------------------
Write-Host "Installazione dipendenze npm..." -ForegroundColor Cyan
npm install

# --- npm >= 12: gli install script delle dipendenze (better-sqlite3, electron, ---
# esbuild) sono bloccati di default per motivi di sicurezza, a meno che non siano
# elencati in "allowScripts" nel package.json (dove sono gia' presenti in questo
# progetto). Se il tuo npm li aveva comunque saltati durante l'install qui sopra
# (capita se "allowScripts" e' stato aggiunto dopo un primo tentativo fallito),
# "npm rebuild" li esegue ora. Innocuo su versioni di npm piu' vecchie.
Write-Host "Verifica/esecuzione degli install script delle dipendenze native..." -ForegroundColor Cyan
npm rebuild

# --- Migrazione database iniziale ---------------------------------------------
Write-Host "Esecuzione migrazioni database..." -ForegroundColor Cyan
npm run db:migrate

Write-Host ""
Write-Host "== Setup completato ==" -ForegroundColor Green
Write-Host "Avvia l'ambiente di sviluppo con: npm run dev"