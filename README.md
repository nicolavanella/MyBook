# MyBook

> 🇮🇹 Documentazione in italiano: [README.it.md](README.it.md)

**MyBook** is an offline-first desktop application for writing narrative
fiction. It combines a rich-text manuscript editor with the tools a novelist
needs to keep a story consistent: characters, locations, objects, timelines,
a concept map, writing statistics, revision history and export to several
formats. Everything is stored locally in a single SQLite database — no
account, no cloud, no network required.

## Features

**Manuscript**
- Tree of groups, chapters and scenes with drag & drop reordering, per-scene
  status (Idea / Draft / Revision / Done, shown as coloured dots), locking,
  and "duplicate" for scenes, chapters and whole groups.
- Rich-text editor (TipTap): headings, fonts, colours, lists, alignment, line
  height, quotations, images, links, find, page separators, and a **Dialogues**
  tool (« », “ ” and – with the cursor placed for you).
- **Comments** and **tags** (characters, locations, objects, events) anchored
  to the text, with a native context menu to add, show or delete them.
- Automatic saving, per-scene **revision history** and diff, and the editor
  reopens a scene at the cursor position where you left off.
- Spell checking with multiple dictionaries active at once.
- Customisable editor background and text colours for the light and dark
  themes.

**Story bible**
- Cards for **characters**, **locations** and **objects** with custom fields
  and images. Each card shows, on the right, every chapter/scene where the
  entity is tagged — a click jumps to the exact spot in the text.
- **Timeline** with a free-form narrative date plus an optional calendar date,
  search, and a compact view sortable by either date.
- **Concept map** (React Flow) linking characters, locations, objects and
  chapters.

**Statistics**
- *Main*: words, characters (with/without spaces), completed chapters and
  scenes as a progress bar, project age and writing pace.
- *Analysis*: sentences, paragraphs, reading time, editorial pages, most-used
  keywords, and — per chapter, in manuscript order — the tags it contains.

**Activity log** (can be turned off in Settings)
- Records creations, edits, deletions and moves of scenes, chapters, groups,
  characters, locations, objects, timelines and mind maps, per project.
- When you close a project you can leave yourself a **To Do** note; when you
  reopen it, a short recap shows the latest operations and that note.
- Projects reopen in the section you left them, and in the last scene you were
  editing.

**Projects & data**
- Export to TXT, Markdown, HTML, DOCX, PDF and EPUB.
- Export/import a whole project as a single `.mybook.json` file, duplicate a
  project, and schedule automatic database backups.
- A demonstration project ("Manuale di MyBook") is imported on first launch.

## Tech stack

Electron · electron-vite · React + TypeScript · TipTap · Zustand · dnd-kit ·
Tailwind CSS · better-sqlite3 · Zod · React Router · React Flow · Vitest

## Requirements

- Node.js 20 LTS or newer
- Git
- On Windows: Visual Studio Build Tools ("Desktop development with C++"),
  needed to compile the native `better-sqlite3` module
- On macOS: Xcode Command Line Tools (`xcode-select --install`)
- On Linux: `build-essential` and `python3`

## Quick start

```bash
# Windows (PowerShell)
.\scripts\install.ps1

# macOS / Linux
bash scripts/install.sh
```

The script checks Node/npm/Git, installs the dependencies and runs the
database migrations against a local development database
(`dev-data/mybook.db`).

Then start the development environment:

```bash
npm run dev
```

### Note: install scripts blocked by npm (npm 12+)

Since npm 12, dependency install scripts (`better-sqlite3`, `electron`,
`esbuild`) are blocked by default for security reasons unless they are listed
in the `allowScripts` field of `package.json` — where they are already
present in this project. If your `npm install` still reports them as skipped
(`npm warn install-scripts ... blocked because they are not covered by
allowScripts`), run `npm rebuild` right afterwards: it executes the now
"approved" scripts without a full reinstall. `scripts/install.ps1` and
`scripts/install.sh` already do this automatically.

### Note: `better-sqlite3` and the two ABIs

`better-sqlite3` is a native module and must be compiled for the ABI of the
process that loads it. `npm run dev` / `npm run preview` run inside Electron
(Electron ABI), while `npm run db:migrate` and `npm test` run on the system
Node.js (a different ABI). Each of those scripts has a pre-hook
(`rebuild:node` or `rebuild:electron`) that recompiles the module for the
right target, so you should never need to run `npm rebuild` by hand. If you
alternate commands manually without going through the npm scripts (for
example running `vitest` directly) you may see a `NODE_MODULE_VERSION
mismatch` error: run `npm run rebuild:node` (for tests/migrations) or
`npm run rebuild:electron` (to go back to `npm run dev`).

## Main commands

| Command | Description |
|---|---|
| `npm run dev` | Start Electron in development mode with hot reload |
| `npm run build` | Production build (no packaging) |
| `npm run build:win` / `:mac` / `:linux` | Build + installable package for the platform |
| `npm run db:migrate` | Run the SQL migrations on a standalone DB (`dev-data/mybook.db`, or a custom `MYBOOK_DB_PATH`) |
| `npm test` | Run the Vitest suite |

## Project structure

```
src/
 ├─ main/          Electron main process: database, IPC, domain services
 ├─ preload/       Typed API exposed to the renderer through contextBridge
 ├─ renderer/      React app (UI)
 └─ shared/        Zod schemas and pure helpers shared by main/preload/renderer
database/
 └─ migrations/    Versioned SQL migrations (immutable once released)
config/
 └─ database.yml   Default parameters for the DB, autosave and versioning
resources/
 └─ Manuale.mybook.json   Demo project imported on first launch
scripts/
 ├─ install.ps1    Windows environment bootstrap
 ├─ install.sh     macOS/Linux environment bootstrap
 └─ db-migrate.ts  Standalone migration runner (outside Electron)
tests/             Vitest suites (database, services, shared helpers, renderer logic)
```

The installer bundles `LICENSE` and `resources/Manuale.mybook.json` as extra
resources (see `electron-builder.yml`).

## Security notes

- `contextIsolation` is on and `nodeIntegration` is off in the renderer.
- The renderer never touches SQLite, the filesystem or Node APIs directly —
  only the API exposed by the preload script.
- Every IPC payload is validated with Zod before reaching the services.
- SQL is always executed through prepared statements.

## Content versioning

The text of every scene goes through three levels:

1. **Autosave** — the current TipTap content is written to SQLite ~800 ms
   after the last keystroke.
2. **Revisions** (`document_revisions`) — immutable snapshots created after a
   significant pause (~30 s), when switching scene, on closing, or on demand.
   They are never overwritten.
3. **Periodic snapshots** (`document_snapshots`) — every 20 revisions, to
   speed up future restores.

Restoring an earlier revision **creates a new revision** instead of erasing
the later history.

## Database and migrations

- Migrations are plain `.sql` files named `NNN_name.sql`, applied in numeric
  order and tracked in `schema_migrations`. **Never edit a migration that has
  already been released** — add a new one.
- Tags placed in the text are also mirrored in the `scene_tags` table each time
  a scene is saved; the statistics and the "where it appears" panel read from
  that table rather than re-parsing every scene.
- The activity log lives in `activity_log` / `project_todo`; per-project UI
  state (last section) lives in `project_settings`.

## Testing

```bash
npm test
```

The suite covers the migrations, repositories, services and the pure logic
extracted from the UI (text analysis, tag scanning, tree ordering, date
handling…). React components themselves are not rendered in tests, by design:
logic worth testing is kept in plain TypeScript modules.

## License

MyBook is free software, distributed under the terms of the
**GNU General Public License v3.0**. See the [`LICENSE`](LICENSE) file (also
reachable from the *Info* page inside the app).
