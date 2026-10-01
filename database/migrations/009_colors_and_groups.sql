-- MyBook — 009_colors_and_groups.sql
-- Campo colore (hex, es. "#3b82f6"): usato per la pallina colorata nella
-- sidebar e per organizzare visivamente le schede. Stringa vuota = nessun
-- colore assegnato (mostra un pallino neutro).
ALTER TABLE characters ADD COLUMN color TEXT NOT NULL DEFAULT '';
ALTER TABLE locations  ADD COLUMN color TEXT NOT NULL DEFAULT '';
ALTER TABLE objects    ADD COLUMN color TEXT NOT NULL DEFAULT '';
ALTER TABLE timeline_events ADD COLUMN color TEXT NOT NULL DEFAULT '';

-- Raggruppamento libero (es. "Protagonisti", "Interni", "Armi magiche"):
-- testo libero anziché una tabella di gruppi dedicata, così come i tag,
-- per restare coerenti con il resto del modello dati di questa sezione e
-- non introdurre un'entità/CRUD separati per qualcosa che l'utente scrive
-- liberamente. La sidebar raggruppa le schede per questo valore.
ALTER TABLE characters ADD COLUMN group_name TEXT NOT NULL DEFAULT '';
ALTER TABLE locations  ADD COLUMN group_name TEXT NOT NULL DEFAULT '';
ALTER TABLE objects    ADD COLUMN group_name TEXT NOT NULL DEFAULT '';
