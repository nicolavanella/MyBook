-- MyBook — 006_settings_sidebar_dictionary.sql
ALTER TABLE app_settings ADD COLUMN sidebar_visible_tools TEXT NOT NULL DEFAULT '["characters","locations","timeline","mindmap"]';
ALTER TABLE app_settings ADD COLUMN dictionary_file TEXT NOT NULL DEFAULT '';
