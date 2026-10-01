-- MyBook — 005_editor_toolbar_settings.sql
-- Preferenze globali della toolbar editor. JSON array per mantenere l'ordine
-- e consentire l'evoluzione dell'elenco senza una tabella key/value.
ALTER TABLE app_settings ADD COLUMN editor_toolbar_tools TEXT NOT NULL DEFAULT '["zoom","undo","redo","heading","font","size","bold","italic","underline","strike","color","clearFormatting","lists","alignment","lineHeight","blockquote","pageSeparator","link","image","search"]';
