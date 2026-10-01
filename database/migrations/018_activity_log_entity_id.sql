-- MyBook — 018_activity_log_entity_id.sql (v0.3.7)
-- Aggiunge l'id reale dell'entità (scena/capitolo/personaggio/evento…) a
-- ogni voce del registro attività. Serve per due cose che entity_name da
-- solo non permette in modo affidabile:
--  1. Riconoscere in modo stabile la STESSA entità anche se viene rinominata
--     tra un'operazione e la successiva;
--  2. La soglia (throttle) sulle voci "Modificata" generate dal salvataggio
--     automatico del testo delle scene (v0.3.7): senza un id stabile, capire
--     se "si è già registrata una modifica recente per QUESTA scena" non
--     sarebbe affidabile.
-- Le voci già esistenti restano valide con entity_id = '' (non recuperabile
-- retroattivamente: non introduce comunque nessun problema, il throttle
-- semplicemente non si applica a quelle righe storiche).
ALTER TABLE activity_log ADD COLUMN entity_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_id, action, created_at DESC);
