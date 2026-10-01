-- MyBook — 019_scene_tags.sql (v0.3.8)
-- Indice persistente dei tag (Personaggi/Località/Oggetti) presenti nel
-- testo delle scene. Il mark nel contenuto TipTap resta la fonte per la
-- RESA VISIVA nell'editor (sottolineatura, posizione nel testo — serve
-- comunque un riferimento posizionale dentro il documento, che solo
-- ProseMirror può mantenere aggiornato mentre si scrive), ma da qui in poi
-- ogni RICERCA incrociata (Analisi per capitolo, pannello "Dove compare"
-- nelle schede di Personaggi/Località/Oggetti) legge da questa tabella
-- invece di riaprire e rianalizzare il JSON di ogni scena ad ogni richiesta.
-- La tabella viene ricostruita per intero (DELETE + INSERT) ad ogni
-- salvataggio del contenuto di una scena — vedi DocumentService — quindi è
-- sempre lo specchio esatto dell'ultimo contenuto salvato.
CREATE TABLE IF NOT EXISTS scene_tags (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_node_id TEXT NOT NULL REFERENCES document_nodes(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  occurrence_index INTEGER NOT NULL,
  snippet TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_scene_tags_entity ON scene_tags(project_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_scene_tags_node ON scene_tags(document_node_id);
