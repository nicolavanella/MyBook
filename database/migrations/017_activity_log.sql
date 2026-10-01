-- MyBook — 017_activity_log.sql (v0.3.5)
-- Registro attività per progetto (sezione "Log"): traccia creazione,
-- modifica, eliminazione e spostamento delle voci principali del
-- Manoscritto (scena/capitolo/gruppo) e delle altre sezioni (personaggio/
-- località/oggetto/timeline/mappa concettuale come CONTENITORI: i singoli
-- eventi di una timeline o nodi di una mappa NON sono loggati singolarmente,
-- per non rendere il registro enormemente rumoroso — si registra solo la
-- creazione/rinomina/eliminazione della timeline o mappa nel suo insieme).
--
-- entity_name è una copia del nome al momento dell'operazione (non una
-- FK "viva"): un'eliminazione resta leggibile nel registro anche se
-- l'entità non esiste più.
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_name TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_log_project_date ON activity_log(project_id, created_at DESC);

-- Nota "To Do" per progetto, compilata alla chiusura ("cosa fare la prossima
-- volta"): una sola riga per progetto, sovrascritta ad ogni chiusura.
CREATE TABLE IF NOT EXISTS project_todo (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Interruttore generale in Impostazioni: disabilitandolo, niente più
-- voci nel registro, niente richiesta "To Do" alla chiusura, niente recap
-- all'apertura (comportamento analogo a tags_enabled/comments_enabled).
ALTER TABLE app_settings ADD COLUMN activity_log_enabled INTEGER NOT NULL DEFAULT 1;
