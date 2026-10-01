-- MyBook — 021_editor_ui_state.sql (v0.3.9)
-- Posizione del cursore nell'ultima scena aperta, per riaprirla esattamente
-- dove si era interrotta la scrittura (vedi SceneEditor.tsx). Salvata
-- insieme al contenuto nello stesso autosave, non ad ogni movimento del
-- cursore: rappresenta "dov'ero arrivato l'ultima volta che ho salvato",
-- non un tracciamento continuo della posizione.
ALTER TABLE document_nodes ADD COLUMN cursor_position INTEGER NOT NULL DEFAULT 0;
