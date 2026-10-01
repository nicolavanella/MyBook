-- MyBook — 012_scene_comments.sql
-- Un commento è ancorato a un intervallo di testo tramite un mark TipTap
-- "comment" con attributo commentId (uuid) nel contenuto della scena; questa
-- tabella conserva solo il testo del commento stesso (l'ancoraggio nel
-- documento vive nel JSON di content, non qui).
CREATE TABLE IF NOT EXISTS scene_comments (
  id                TEXT PRIMARY KEY,
  document_node_id  TEXT NOT NULL REFERENCES document_nodes(id) ON DELETE CASCADE,
  mark_id           TEXT NOT NULL, -- corrisponde all'attributo commentId del mark nel contenuto
  text              TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_scene_comments_node ON scene_comments(document_node_id);
