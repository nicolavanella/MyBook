-- MyBook — 015_drop_unused_tables.sql
-- Analisi del database: le tabelle seguenti non sono mai lette né scritte da
-- alcuna funzionalità reale dell'app (nessun repository, nessun canale IPC,
-- nessuna pagina le usa) — erano schema predisposto per funzionalità mai
-- realizzate (note libere, un vecchio sistema di tag sostituito dai tag
-- inline nel testo introdotti in v0.3.0, collegamenti scena->personaggio/
-- località/oggetto/evento, un log di controllo/audit). Le uniche righe che
-- le referenziavano erano nell'export/duplica progetto, che si limitavano a
-- copiare dati che di fatto non venivano mai creati da nessuna interazione
-- utente: nessuna perdita di dati reali rimuovendole.
DROP TABLE IF EXISTS entity_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS scene_characters;
DROP TABLE IF EXISTS scene_locations;
DROP TABLE IF EXISTS scene_objects;
DROP TABLE IF EXISTS scene_timeline_events;
DROP TABLE IF EXISTS document_changes;
DROP TABLE IF EXISTS change_log;
DROP TABLE IF EXISTS entity_revisions;
