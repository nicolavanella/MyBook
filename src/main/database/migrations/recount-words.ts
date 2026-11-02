import type Database from 'better-sqlite3'
import { countWordsAndChars } from '@shared/textAnalysis'

/**
 * Ricalcola word_count/char_count di tutte le scene e di tutte le revisioni
 * già salvate (v0.4.2), con la regola corretta di shared/textAnalysis.ts.
 *
 * Va eseguita UNA volta, subito dopo che la migrazione 027_recount_words.sql
 * viene applicata per la prima volta (db.ts). Perché anche le revisioni:
 * l'editor mostra la differenza di parole tra revisioni consecutive; se solo
 * le scene fossero ricalcolate, la prima revisione nuova mostrerebbe un salto
 * fittizio rispetto a quelle vecchie ancora "gonfiate".
 *
 * È idempotente (rieseguirla non cambia nulla) e atomica (una transazione:
 * o tutti i valori sono aggiornati o nessuno). Aggiorna solo le righe il cui
 * valore cambia davvero. Ritorna il numero di righe modificate (utile ai
 * test e al log).
 *
 * MEMORIA E SQLITE: si leggono prima i soli id, poi il contenuto una riga
 * alla volta. Non si usa `.iterate()` perché better-sqlite3 non permette di
 * eseguire un UPDATE sulla stessa connessione mentre un iteratore è aperto
 * ("database connection is busy"); caricare tutti i testi insieme invece
 * peserebbe in memoria su un libro grande.
 */
export function recountWordsAndChars(db: Database.Database): { nodes: number; revisions: number } {
  const run = db.transaction(() => ({
    nodes: recountTable(db, 'document_nodes'),
    revisions: recountTable(db, 'document_revisions')
  }))
  return run()
}

/** Ricalcola una tabella con colonne id/content/word_count/char_count; ritorna quante righe sono cambiate. */
function recountTable(db: Database.Database, table: 'document_nodes' | 'document_revisions'): number {
  const ids = db.prepare(`SELECT id FROM ${table} WHERE content IS NOT NULL AND content != ''`).pluck().all() as string[]
  const select = db.prepare(`SELECT content, word_count, char_count FROM ${table} WHERE id = ?`)
  const update = db.prepare(`UPDATE ${table} SET word_count = ?, char_count = ? WHERE id = ?`)
  let changed = 0
  for (const id of ids) {
    const row = select.get(id) as { content: string; word_count: number; char_count: number }
    const { words, chars } = countWordsAndChars(row.content)
    if (words !== row.word_count || chars !== row.char_count) {
      update.run(words, chars, id)
      changed++
    }
  }
  return changed
}
