-- MyBook — 020_manual_imported.sql (v0.3.8)
-- Traccia se il progetto dimostrativo "Manuale di MyBook" è già stato
-- importato al primo avvio (vedi main/index.ts, importManualOnFirstLaunchIfNeeded),
-- così non viene riproposto ad ogni riavvio, anche se l'utente lo elimina.
ALTER TABLE app_settings ADD COLUMN manual_imported INTEGER NOT NULL DEFAULT 0;
