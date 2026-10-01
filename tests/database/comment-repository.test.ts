import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import { runMigrations } from '../../src/main/database/migrations/runner'
import { CommentRepository } from '../../src/main/database/repositories/comment.repository'

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, path.join(__dirname, '../../database/migrations'))
  db.prepare('INSERT INTO projects (id,title) VALUES (?,?)').run('p', 'Progetto')
  db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run('p', '{}')
  db.prepare(
    `INSERT INTO document_nodes (id, project_id, parent_id, node_type, title, content, order_index)
     VALUES ('scene1','p',NULL,'scene','Scena','{}',0)`
  ).run()
  return { db, repo: new CommentRepository(db) }
}

describe('CommentRepository', () => {
  it('crea un commento e lo ritorna con id e data assegnati', () => {
    const { repo } = setup()
    const comment = repo.create('scene1', 'mark-123', 'Rivedi questo paragrafo')
    expect(comment.id).toBeTruthy()
    expect(comment.document_node_id).toBe('scene1')
    expect(comment.mark_id).toBe('mark-123')
    expect(comment.text).toBe('Rivedi questo paragrafo')
    expect(comment.created_at).toBeTruthy()
  })

  it('elenca i commenti di una scena in ordine di creazione', () => {
    const { repo } = setup()
    repo.create('scene1', 'mark-a', 'Primo commento')
    repo.create('scene1', 'mark-b', 'Secondo commento')
    const list = repo.list('scene1')
    expect(list.map((c) => c.text)).toEqual(['Primo commento', 'Secondo commento'])
  })

  it('elimina un commento', () => {
    const { repo } = setup()
    const comment = repo.create('scene1', 'mark-a', 'Da eliminare')
    repo.delete(comment.id)
    expect(repo.list('scene1')).toHaveLength(0)
  })

  it('modifica il testo di un commento esistente (v0.3.3: opzione Modifica)', () => {
    const { repo } = setup()
    const comment = repo.create('scene1', 'mark-a', 'Testo originale')
    const updated = repo.update(comment.id, 'Testo corretto')
    expect(updated.text).toBe('Testo corretto')
    expect(updated.id).toBe(comment.id)
    expect(updated.mark_id).toBe('mark-a') // il mark associato non cambia, solo il testo
    expect(repo.list('scene1')[0].text).toBe('Testo corretto')
  })

  it('i commenti di una scena eliminata vengono eliminati a cascata', () => {
    const { db, repo } = setup()
    repo.create('scene1', 'mark-a', 'Commento')
    db.prepare('DELETE FROM document_nodes WHERE id = ?').run('scene1')
    expect(repo.list('scene1')).toHaveLength(0)
  })
})
