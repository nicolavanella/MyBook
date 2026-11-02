-- MyBook — 026_mindmap_order_and_prompt_flags.sql (v0.4.1)
--
-- 1) mindmap_nodes.order_index — ordine dei nodi DENTRO un gruppo nella vista
--    kanban. Finora le card erano mostrate nell'ordine di inserimento e non
--    c'era modo di salvarne uno diverso: per poterle riordinare col
--    trascinamento serve un ordine persistente. È relativo al gruppo
--    (group_id) all'interno della stessa mappa; i "buchi" fra i valori sono
--    ammessi (contano solo i confronti). Per le colonne (nodi di tipo
--    'group') l'ordine continua a stare in pos_x, come prima: non cambia nulla.
--    Backfill: i nodi esistenti ricevono 0,1,2… nell'ordine di inserimento
--    (rowid) per gruppo, cioè esattamente l'ordine che l'utente vedeva.
ALTER TABLE mindmap_nodes ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0;
UPDATE mindmap_nodes SET order_index = (
  SELECT COUNT(*) FROM mindmap_nodes n2
  WHERE n2.mindmap_id IS mindmap_nodes.mindmap_id
    AND n2.group_id   IS mindmap_nodes.group_id
    AND n2.rowid < mindmap_nodes.rowid
);

-- 2) app_settings.backup_prompt_shown — la richiesta "scegli la cartella di
--    backup" compare UNA sola volta (al primo avvio senza cartella), non a
--    ogni avvio. Chi ha già una cartella non la vedrà mai; chi la rimanda la
--    ritrova comunque in Impostazioni > Generale > Backup.
ALTER TABLE app_settings ADD COLUMN backup_prompt_shown INTEGER NOT NULL DEFAULT 0;

-- 3) app_settings.todo_recap_enabled — 1 = mostra il "To Do" alla chiusura di
--    un progetto e il recap all'apertura (comportamento storico); 0 = nascondi
--    entrambi ("Non mostrare più"). È indipendente da activity_log_enabled:
--    il registro può continuare a registrare senza mostrare le finestre.
ALTER TABLE app_settings ADD COLUMN todo_recap_enabled INTEGER NOT NULL DEFAULT 1;
