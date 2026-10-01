-- =============================================================================
-- MyBook — 004_editor_settings.sql
-- Due impostazioni utili in più: dimensione del font nell'editor (per
-- leggibilità durante lunghe sessioni di scrittura) e controllo ortografico
-- nativo del sistema operativo.
-- =============================================================================

ALTER TABLE app_settings ADD COLUMN editor_font_size    TEXT NOT NULL DEFAULT 'medium'; -- 'small' | 'medium' | 'large'
ALTER TABLE app_settings ADD COLUMN spellcheck_enabled  INTEGER NOT NULL DEFAULT 1;      -- 0/1
