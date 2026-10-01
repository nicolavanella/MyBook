-- MyBook — 008_backup_schedule.sql
-- 'off' | 'onClose' | '30min' | '60min' | '120min' | '240min'. Sostituisce
-- concettualmente backup_enabled (che resta per compatibilità con installazioni
-- esistenti, ma non è più l'unica fonte di verità: vedi settings.service.ts).
ALTER TABLE app_settings ADD COLUMN backup_frequency TEXT NOT NULL DEFAULT 'onClose';
-- Numero massimo di file di backup conservati nella cartella configurata:
-- superata la soglia, i più vecchi vengono eliminati automaticamente dopo
-- ogni nuovo backup riuscito (vedi SettingsService.backupNow).
ALTER TABLE app_settings ADD COLUMN backup_max_count INTEGER NOT NULL DEFAULT 10;

-- Le installazioni esistenti con backup_enabled=0 non devono iniziare a fare
-- backup automatici "a sorpresa" solo perché aggiorniamo l'app: se il backup
-- automatico era disattivato, la nuova colonna frequency riflette 'off'.
UPDATE app_settings SET backup_frequency = 'off' WHERE backup_enabled = 0;
