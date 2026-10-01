-- =============================================================================
-- MyBook — 002_extended_metadata.sql
-- Aggiunge: metadati estesi progetto e capitoli/scene, supporto a più timeline
-- e più mappe concettuali (con nodi-contenitore per uso stile kanban),
-- impostazioni applicative globali (tema, lingua, backup).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PROGETTI: sottotitolo, anno, descrizione/note strutturali, trama/fabula
-- ---------------------------------------------------------------------------
ALTER TABLE projects ADD COLUMN subtitle    TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN year        INTEGER;
ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT ''; -- sezione "Struttura"
ALTER TABLE projects ADD COLUMN notes       TEXT NOT NULL DEFAULT ''; -- sezione "Struttura"
ALTER TABLE projects ADD COLUMN plot        TEXT NOT NULL DEFAULT ''; -- "Trama", sezione "Narrazione"
ALTER TABLE projects ADD COLUMN fabula      TEXT NOT NULL DEFAULT ''; -- "Fabula", sezione "Narrazione"

-- ---------------------------------------------------------------------------
-- CAPITOLI/SCENE: sottotitolo e note (la descrizione esiste già)
-- ---------------------------------------------------------------------------
ALTER TABLE document_nodes ADD COLUMN subtitle TEXT NOT NULL DEFAULT '';
ALTER TABLE document_nodes ADD COLUMN notes    TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- TIMELINE MULTIPLE: un progetto può avere più timeline nominate.
-- timeline_id è nullable per compatibilità con eventi pre-esistenti; la UI
-- crea "pigramente" una timeline di default al primo accesso se il progetto
-- non ne ha ancora nessuna (vedi timeline.service.ts).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timelines (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  order_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_timelines_project ON timelines(project_id);

ALTER TABLE timeline_events ADD COLUMN timeline_id TEXT REFERENCES timelines(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_timeline_events_timeline ON timeline_events(timeline_id);

-- ---------------------------------------------------------------------------
-- MAPPE CONCETTUALI MULTIPLE: come sopra, un progetto può avere più mappe.
-- group_id supporta nodi-contenitore (uso stile kanban: un nodo 'group'
-- funge da colonna/lane, gli altri nodi vi appartengono tramite group_id).
-- description: testo libero associato al nodo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mindmaps (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  order_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_mindmaps_project ON mindmaps(project_id);

ALTER TABLE mindmap_nodes ADD COLUMN mindmap_id  TEXT REFERENCES mindmaps(id) ON DELETE CASCADE;
ALTER TABLE mindmap_nodes ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE mindmap_nodes ADD COLUMN group_id    TEXT REFERENCES mindmap_nodes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_mindmap_nodes_mindmap ON mindmap_nodes(mindmap_id);
CREATE INDEX IF NOT EXISTS idx_mindmap_nodes_group   ON mindmap_nodes(group_id);

ALTER TABLE mindmap_edges ADD COLUMN mindmap_id TEXT REFERENCES mindmaps(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_mindmap_edges_mindmap ON mindmap_edges(mindmap_id);

-- ---------------------------------------------------------------------------
-- IMPOSTAZIONI APPLICATIVE GLOBALI (non di progetto): tema, lingua, backup.
-- Riga singola fissa (id='singleton'), più semplice di una tabella key/value
-- per un pannello impostazioni con pochi campi noti a priori.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  id              TEXT PRIMARY KEY DEFAULT 'singleton',
  theme           TEXT NOT NULL DEFAULT 'light', -- 'light' | 'dark'
  language        TEXT NOT NULL DEFAULT 'it',
  backup_enabled  INTEGER NOT NULL DEFAULT 0,    -- 0/1
  backup_folder   TEXT NOT NULL DEFAULT '',
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO app_settings (id) VALUES ('singleton');
