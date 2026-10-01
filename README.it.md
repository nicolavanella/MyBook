# MyBook

Applicazione desktop offline-first per scrittura narrativa: editor, albero
capitoli/scene, personaggi, località, timeline, mappa concettuale,
statistiche, versioning ed export.

## Stack

Electron · electron-vite · React + TypeScript · TipTap · Zustand · dnd-kit ·
Tailwind CSS · better-sqlite3 · Zod · React Router · React Flow · Vitest

## Requisiti

- Node.js 20 LTS o superiore
- Git
- Su Windows: Visual Studio Build Tools ("Desktop development with C++"),
  necessari per compilare il modulo nativo `better-sqlite3`
- Su macOS: Xcode Command Line Tools (`xcode-select --install`)
- Su Linux: `build-essential` e `python3`

## Quick start

```bash
# Windows (PowerShell)
.\scripts\install.ps1

# macOS / Linux
bash scripts/install.sh
```

Lo script verifica Node/npm/Git, installa le dipendenze ed esegue le
migrazioni del database su un DB di sviluppo locale (`dev-data/mybook.db`).

Poi avvia l'ambiente di sviluppo:

```bash
npm run dev
```

## Nota: install script bloccati da npm (npm 12+)

Da npm 12, gli install script delle dipendenze (`better-sqlite3`, `electron`,
`esbuild`) sono bloccati di default per motivi di sicurezza, a meno che non
siano elencati nel campo `allowScripts` di `package.json` — dove sono già
presenti in questo progetto. Se il tuo `npm install` li segnala comunque come
saltati (`npm warn install-scripts ... blocked because they are not covered
by allowScripts`), esegui `npm rebuild` subito dopo: esegue gli script ora
"approvati" senza dover reinstallare da zero. `scripts/install.ps1` e
`scripts/install.sh` lo fanno già automaticamente.

## Nota: doppio ABI di `better-sqlite3`

`better-sqlite3` è un modulo nativo e deve essere compilato per l'ABI del
processo che lo carica. `npm run dev`/`npm run preview` girano dentro
Electron (ABI Electron), mentre `npm run db:migrate` e `npm test` girano
sul Node.js di sistema (ABI Node — diverso). Ogni script sopra ha un
pre-hook (`rebuild:node` o `rebuild:electron`) che ricompila
automaticamente il modulo per il target corretto prima di eseguirsi, quindi
non serve mai lanciare `npm rebuild` a mano — ma se alterni manualmente i
comandi senza passare dagli script npm (es. `vitest` diretto), potresti
rivedere l'errore `NODE_MODULE_VERSION mismatch`: in quel caso esegui
`npm run rebuild:node` (per test/migrazioni) o `npm run rebuild:electron`
(per tornare a sviluppare con `npm run dev`).

## Comandi principali

| Comando | Descrizione |
|---|---|
| `npm run dev` | Avvia Electron in modalità sviluppo con hot reload |
| `npm run build` | Build di produzione (senza pacchettizzare) |
| `npm run build:win` / `:mac` / `:linux` | Build + pacchetto installabile per la piattaforma |
| `npm run db:migrate` | Esegue le migrazioni SQL su un DB standalone (`dev-data/mybook.db`, o `MYBOOK_DB_PATH` custom) |
| `npm test` | Esegue i test Vitest |

## Struttura del progetto

```
src/
 ├─ main/           Processo Electron principale: database, IPC, servizi di dominio
 ├─ preload/        API tipizzata esposta al renderer via contextBridge
 ├─ renderer/       App React (UI)
 └─ shared/         Schemi Zod e tipi condivisi tra main/preload/renderer
database/
 └─ migrations/     Migrazioni SQL versionate (immutabili dopo il rilascio)
config/
 └─ database.yml    Parametri di default per DB, autosave, versioning
scripts/
 ├─ install.ps1     Bootstrap ambiente Windows
 ├─ install.sh      Bootstrap ambiente macOS/Linux
 └─ db-migrate.ts   Runner migrazioni standalone (fuori da Electron)
```

## Note di sicurezza

- `contextIsolation` attivo, `nodeIntegration` disabilitato nel renderer
- Il renderer non accede mai direttamente a SQLite, filesystem o API Node —
  solo tramite l'API esposta dal preload
- Tutti i payload IPC sono validati con Zod prima di raggiungere i servizi
- Query SQL sempre tramite prepared statements

## Versioning dei contenuti

Il testo di ogni scena/capitolo passa per tre livelli:

1. **Autosave** — il contenuto TipTap corrente viene scritto su SQLite ~800ms
   dopo l'ultima digitazione.
2. **Revisioni** (`document_revisions`) — snapshot immutabili creati dopo una
   pausa significativa (~30s), al cambio di scena, alla chiusura o su
   richiesta manuale. Non vengono mai sovrascritte.
3. **Snapshot periodici** (`document_snapshots`) — ogni 20 revisioni, per
   accelerare i ripristini futuri.

Il ripristino di una revisione precedente **crea una nuova revisione**
anziché cancellare la cronologia successiva.

## Stato del progetto

Scheletro funzionante: creazione progetto, albero capitoli/scene, editor con
autosave e revisioni, schede personaggi/località con campi personalizzati,
timeline, mappa concettuale (React Flow) con nodi/collegamenti liberi,
statistiche, export TXT/MD/HTML/DOCX/PDF.