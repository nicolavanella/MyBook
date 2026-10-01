-- MyBook — 010_locked_nodes.sql
-- Blocco di un capitolo o di un Gruppo di Capitoli: impedisce lo spostamento
-- (drag&drop) delle scene al suo interno. 0/1 perché SQLite non ha un tipo
-- booleano nativo (stessa convenzione già usata per backup_enabled ecc.).
ALTER TABLE document_nodes ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;
