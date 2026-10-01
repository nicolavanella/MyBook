-- MyBook — 016_timeline_calendar_date.sql (v0.3.4)
-- Timeline: aggiunge la "Data" da calendario accanto alla "Data narrativa".
--  * event_date    (esistente) resta il testo libero narrativo ("Anno 1200");
--  * calendar_date (nuova)     data reale, stringa ISO "AAAA-MM-GG" oppure ''
--    se non impostata. Stringa e non timestamp: una data di calendario non ha
--    fuso orario, e l'ordine alfabetico coincide con quello cronologico.
-- DEFAULT '' => gli eventi esistenti restano validi e senza data: nessuna
-- perdita né trasformazione di dati.
ALTER TABLE timeline_events ADD COLUMN calendar_date TEXT NOT NULL DEFAULT '';
