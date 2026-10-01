-- MyBook — 011_sidebar_statistics.sql
-- Il nuovo strumento "Statistiche" è visibile di default, anche per le
-- installazioni esistenti (stesso pattern già usato in 007_objects.sql
-- quando fu aggiunto "Oggetti").
UPDATE app_settings
SET sidebar_visible_tools = CASE
  WHEN sidebar_visible_tools IS NULL OR sidebar_visible_tools = '' OR sidebar_visible_tools = '[]'
    THEN '["characters","locations","objects","timeline","mindmap","statistics"]'
  WHEN instr(sidebar_visible_tools, '"statistics"') > 0
    THEN sidebar_visible_tools
  ELSE replace(sidebar_visible_tools, ']', ',"statistics"]')
END
WHERE id = 'singleton';
