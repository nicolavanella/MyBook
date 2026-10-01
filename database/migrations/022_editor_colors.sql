-- MyBook — 022_editor_colors.sql (v0.3.9)
-- Colori dell'editor (sfondo/testo), personalizzabili per tema chiaro e
-- scuro separatamente (Impostazioni > Editor). I default riprendono
-- esattamente i valori finora fissi nel CSS (styles/index.css): attivare
-- questa versione non cambia nulla visivamente finché l'utente non li tocca.
ALTER TABLE app_settings ADD COLUMN editor_bg_light TEXT NOT NULL DEFAULT '#f1efe8';
ALTER TABLE app_settings ADD COLUMN editor_text_light TEXT NOT NULL DEFAULT '#374151';
ALTER TABLE app_settings ADD COLUMN editor_bg_dark TEXT NOT NULL DEFAULT '#1f1f22';
ALTER TABLE app_settings ADD COLUMN editor_text_dark TEXT NOT NULL DEFAULT '#e4e4e7';
