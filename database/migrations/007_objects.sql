-- MyBook 007 — Oggetti
CREATE TABLE IF NOT EXISTS objects (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  image_path     TEXT,
  notes          TEXT NOT NULL DEFAULT '',
  custom_fields  TEXT NOT NULL DEFAULT '[]',
  tags           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_objects_project ON objects(project_id);

CREATE TABLE IF NOT EXISTS scene_objects (
  id                TEXT PRIMARY KEY,
  document_node_id  TEXT NOT NULL REFERENCES document_nodes(id) ON DELETE CASCADE,
  object_id         TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(document_node_id, object_id)
);
CREATE INDEX IF NOT EXISTS idx_scene_objects_node ON scene_objects(document_node_id);
CREATE INDEX IF NOT EXISTS idx_scene_objects_object ON scene_objects(object_id);

-- Aggiorna le installazioni esistenti: il nuovo strumento Oggetti è visibile di default.
UPDATE app_settings
SET sidebar_visible_tools = CASE
  WHEN sidebar_visible_tools IS NULL OR sidebar_visible_tools = '' OR sidebar_visible_tools = '[]'
    THEN '["characters","locations","objects","timeline","mindmap"]'
  WHEN instr(sidebar_visible_tools, '"objects"') > 0
    THEN sidebar_visible_tools
  ELSE replace(sidebar_visible_tools, ']', ',"objects"]')
END
WHERE id = 'singleton';
