-- =============================================================================
-- MyBook — 001_initial_schema.sql
-- Schema SQLite iniziale. Immutabile dopo il rilascio: ogni modifica futura
-- va in una nuova migrazione (002_..., 003_...), mai qui.
-- Convenzioni: id TEXT (UUID v4), date TEXT ISO-8601 UTC, prepared statements
-- lato applicativo, foreign_keys=ON, journal_mode=WAL (impostati in db.ts).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PROGETTI
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  author      TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Impostazioni di progetto (autosave, soglie di revisione, ecc.) come JSON
-- singolo per riga: evita una tabella key/value rigida e permette di
-- aggiungere nuove impostazioni senza migrazioni.
CREATE TABLE IF NOT EXISTS project_settings (
  project_id  TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  settings    TEXT NOT NULL DEFAULT '{}', -- JSON
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ---------------------------------------------------------------------------
-- ALBERO DOCUMENTALE (capitoli / scene / sezioni condividono la struttura)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_nodes (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES document_nodes(id) ON DELETE CASCADE,
  node_type     TEXT NOT NULL DEFAULT 'scene', -- 'chapter' | 'scene' | 'section' | 'prologue' | 'epilogue'
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'idea',  -- 'idea' | 'bozza' | 'revisione' | 'completo' (estendibile)
  order_index   INTEGER NOT NULL DEFAULT 0,
  content       TEXT NOT NULL DEFAULT '{}',    -- TipTap JSON (current state, aggiornato via autosave)
  word_count    INTEGER NOT NULL DEFAULT 0,    -- cache, ricalcolata da content
  char_count    INTEGER NOT NULL DEFAULT 0,    -- cache, ricalcolata da content
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_document_nodes_project ON document_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_document_nodes_parent  ON document_nodes(parent_id);

-- ---------------------------------------------------------------------------
-- NOTE (globali di progetto o agganciate a un nodo specifico)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_node_id  TEXT REFERENCES document_nodes(id) ON DELETE CASCADE, -- NULL = nota globale
  title             TEXT NOT NULL DEFAULT '',
  content           TEXT NOT NULL DEFAULT '', -- testo libero o TipTap JSON, a scelta della UI
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id);
CREATE INDEX IF NOT EXISTS idx_notes_node    ON notes(document_node_id);

-- ---------------------------------------------------------------------------
-- PERSONAGGI
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS characters (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  avatar_path    TEXT,
  notes          TEXT NOT NULL DEFAULT '',
  custom_fields  TEXT NOT NULL DEFAULT '[]', -- JSON: [{ "label": "...", "value": "..." }]
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id);

-- Relazione scena <-> personaggi presenti in quella scena
CREATE TABLE IF NOT EXISTS scene_characters (
  id                TEXT PRIMARY KEY,
  document_node_id  TEXT NOT NULL REFERENCES document_nodes(id) ON DELETE CASCADE,
  character_id      TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  role_in_scene     TEXT NOT NULL DEFAULT '',
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(document_node_id, character_id)
);

CREATE INDEX IF NOT EXISTS idx_scene_characters_node ON scene_characters(document_node_id);
CREATE INDEX IF NOT EXISTS idx_scene_characters_char ON scene_characters(character_id);

-- ---------------------------------------------------------------------------
-- LOCALITÀ (gerarchiche: es. "Regno" > "Città" > "Taverna")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id      TEXT REFERENCES locations(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  image_path     TEXT,
  notes          TEXT NOT NULL DEFAULT '',
  custom_fields  TEXT NOT NULL DEFAULT '[]',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_locations_project ON locations(project_id);
CREATE INDEX IF NOT EXISTS idx_locations_parent  ON locations(parent_id);

CREATE TABLE IF NOT EXISTS scene_locations (
  id                TEXT PRIMARY KEY,
  document_node_id  TEXT NOT NULL REFERENCES document_nodes(id) ON DELETE CASCADE,
  location_id       TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(document_node_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_scene_locations_node ON scene_locations(document_node_id);
CREATE INDEX IF NOT EXISTS idx_scene_locations_loc  ON scene_locations(location_id);

-- ---------------------------------------------------------------------------
-- TIMELINE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timeline_events (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  event_date   TEXT NOT NULL DEFAULT '', -- testo libero: "Anno 1200", "Giorno 3 dopo l'incendio"
  order_index  INTEGER NOT NULL DEFAULT 0,
  notes        TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_timeline_events_project ON timeline_events(project_id);

CREATE TABLE IF NOT EXISTS scene_timeline_events (
  id                 TEXT PRIMARY KEY,
  document_node_id   TEXT NOT NULL REFERENCES document_nodes(id) ON DELETE CASCADE,
  timeline_event_id  TEXT NOT NULL REFERENCES timeline_events(id) ON DELETE CASCADE,
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(document_node_id, timeline_event_id)
);

CREATE INDEX IF NOT EXISTS idx_scene_timeline_node  ON scene_timeline_events(document_node_id);
CREATE INDEX IF NOT EXISTS idx_scene_timeline_event ON scene_timeline_events(timeline_event_id);

-- ---------------------------------------------------------------------------
-- MAPPA CONCETTUALE (nodi/collegamenti liberi, possono referenziare entità)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mindmap_nodes (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  node_type   TEXT NOT NULL, -- 'character' | 'location' | 'event' | 'free_note'
  ref_id      TEXT,          -- id dell'entità referenziata, NULL se free_note
  label       TEXT NOT NULL DEFAULT '',
  pos_x       REAL NOT NULL DEFAULT 0,
  pos_y       REAL NOT NULL DEFAULT 0,
  color       TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS mindmap_edges (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_node_id   TEXT NOT NULL REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
  target_node_id   TEXT NOT NULL REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
  label            TEXT NOT NULL DEFAULT '',
  style            TEXT NOT NULL DEFAULT 'solid', -- 'solid' | 'dashed'
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_mindmap_nodes_project ON mindmap_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_mindmap_edges_project ON mindmap_edges(project_id);

-- ---------------------------------------------------------------------------
-- TAG
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '',
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS entity_tags (
  id           TEXT PRIMARY KEY,
  tag_id       TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL, -- 'document_node' | 'character' | 'location' | 'timeline_event' | 'note'
  entity_id    TEXT NOT NULL,
  UNIQUE(tag_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON entity_tags(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- VERSIONING: revisioni immutabili, change log incrementale, snapshot
-- ---------------------------------------------------------------------------

-- Snapshot completo e immutabile del contenuto di un document_node.
-- Creato dopo pausa significativa, cambio scena, chiusura, o su richiesta.
-- MAI sovrascritto: il restore crea una nuova revisione.
CREATE TABLE IF NOT EXISTS document_revisions (
  id                TEXT PRIMARY KEY,
  document_node_id  TEXT NOT NULL REFERENCES document_nodes(id) ON DELETE CASCADE,
  content           TEXT NOT NULL,            -- TipTap JSON, snapshot completo
  reason            TEXT NOT NULL DEFAULT 'autosave', -- 'autosave' | 'manual' | 'pause' | 'close' | 'restore'
  word_count        INTEGER NOT NULL DEFAULT 0,
  char_count        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_document_revisions_node ON document_revisions(document_node_id, created_at);

-- Log incrementale delle modifiche tra una revisione e la successiva.
-- Quando disponibili, si usano gli step ProseMirror (diff strutturale);
-- altrimenti un diff testuale semplice come fallback.
CREATE TABLE IF NOT EXISTS document_changes (
  id                TEXT PRIMARY KEY,
  document_node_id  TEXT NOT NULL REFERENCES document_nodes(id) ON DELETE CASCADE,
  revision_id       TEXT REFERENCES document_revisions(id) ON DELETE SET NULL,
  steps             TEXT NOT NULL DEFAULT '[]', -- JSON: ProseMirror steps o diff fallback
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_document_changes_node ON document_changes(document_node_id, created_at);

-- Snapshot completo periodico (ogni N revisioni) per accelerare il recupero
-- senza dover riapplicare una lunga catena di document_changes.
CREATE TABLE IF NOT EXISTS document_snapshots (
  id                TEXT PRIMARY KEY,
  document_node_id  TEXT NOT NULL REFERENCES document_nodes(id) ON DELETE CASCADE,
  revision_id       TEXT NOT NULL REFERENCES document_revisions(id) ON DELETE CASCADE,
  content           TEXT NOT NULL, -- TipTap JSON completo
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_document_snapshots_node ON document_snapshots(document_node_id, created_at);

-- Versioni di entità non testuali (personaggi, luoghi, note, ecc.)
CREATE TABLE IF NOT EXISTS entity_revisions (
  id           TEXT PRIMARY KEY,
  entity_type  TEXT NOT NULL, -- 'character' | 'location' | 'note' | 'timeline_event'
  entity_id    TEXT NOT NULL,
  content      TEXT NOT NULL, -- JSON snapshot completo dell'entità
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_entity_revisions_entity ON entity_revisions(entity_type, entity_id, created_at);

-- Audit/activity log di progetto. Non serve a ricostruire il testo (a quello
-- servono le revisioni), solo a tracciare "cosa è successo e quando".
CREATE TABLE IF NOT EXISTS change_log (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  action       TEXT NOT NULL, -- 'create' | 'update' | 'delete' | 'restore'
  details      TEXT NOT NULL DEFAULT '{}', -- JSON libero
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_change_log_project ON change_log(project_id, created_at);

-- ---------------------------------------------------------------------------
-- VERSIONAMENTO SCHEMA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version      INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  applied_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
