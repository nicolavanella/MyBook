-- =============================================================================
-- MyBook — 003_projects_and_entities_extras.sql
-- Traccia l'ultima apertura di un progetto (per le card nella selezione
-- progetti), aggiunge immagine e tag a personaggi/località, e un campo
-- "ruolo" ai personaggi (mostrato nell'albero, es. "Marco — Protagonista").
-- =============================================================================

ALTER TABLE projects ADD COLUMN last_opened_at TEXT;

-- role e avatar_path per characters, image_path per locations esistono già
-- dallo schema iniziale (mai esposti in UI finora); qui aggiungiamo solo tags.
ALTER TABLE characters ADD COLUMN tags TEXT NOT NULL DEFAULT ''; -- comma-separated
ALTER TABLE locations  ADD COLUMN tags TEXT NOT NULL DEFAULT '';
