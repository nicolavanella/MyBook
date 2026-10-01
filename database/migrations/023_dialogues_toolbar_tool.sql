-- MyBook — 023_dialogues_toolbar_tool.sql (v0.3.9)
-- Nuovo strumento "Dialoghi" della toolbar dell'editor (virgolette basse/
-- alte, trattino). L'elenco strumenti è salvato come JSON in
-- app_settings.editor_toolbar_tools (migrazione 005), quindi senza questo
-- passaggio nessuno — nemmeno una nuova installazione — lo vedrebbe finché
-- non lo abilita a mano in Impostazioni > Editor.
-- Va inserito subito prima di "Citazione" (blockquote). Se "dialogues" è già
-- presente, o se l'utente aveva rimosso "blockquote" dalla propria lista
-- personalizzata (nessun punto di inserimento), la lista resta com'era: la
-- personalizzazione dell'utente vince.
UPDATE app_settings
SET editor_toolbar_tools = REPLACE(editor_toolbar_tools, '"blockquote"', '"dialogues","blockquote"')
WHERE editor_toolbar_tools NOT LIKE '%"dialogues"%';
