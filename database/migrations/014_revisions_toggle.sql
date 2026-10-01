-- MyBook — 014_revisions_toggle.sql
-- Mostra/nascondi la sezione Revisioni nel pannello scena (le revisioni
-- continuano comunque a essere create in background, come tags_enabled/
-- comments_enabled non disattivano la relativa funzionalità sottostante).
ALTER TABLE app_settings ADD COLUMN revisions_enabled INTEGER NOT NULL DEFAULT 1;
