-- MyBook — 013_ui_scale_dictionaries_toggles.sql
-- Dimensione testo dell'intera interfaccia (sidebar, albero, modali...),
-- distinta da editor_font_size che riguarda solo il testo dentro l'editor.
ALTER TABLE app_settings ADD COLUMN ui_font_size TEXT NOT NULL DEFAULT 'medium';

-- Lingue del correttore ortografico di sistema (Electron/Chromium supporta
-- più lingue attive contemporaneamente, vedi session.setSpellCheckerLanguages).
-- Sostituisce concettualmente dictionary_file (mai realmente collegato al
-- motore ortografico, come indicava il suo stesso testo di aiuto in
-- Impostazioni): quella colonna resta per compatibilità ma non viene più
-- usata dall'interfaccia.
ALTER TABLE app_settings ADD COLUMN dictionary_languages TEXT NOT NULL DEFAULT '["it-IT","en-US"]';

-- Mostra/nascondi tag e commenti nel testo, nel menu contestuale e nelle
-- rispettive sezioni del pannello scena.
ALTER TABLE app_settings ADD COLUMN tags_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE app_settings ADD COLUMN comments_enabled INTEGER NOT NULL DEFAULT 1;
