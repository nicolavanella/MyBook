import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

export interface SceneComment {
  id: string
  document_node_id: string
  mark_id: string
  text: string
  created_at: string
}

export class CommentRepository {
  constructor(private db: Database.Database) {}

  list(documentNodeId: string): SceneComment[] {
    return this.db
      .prepare('SELECT * FROM scene_comments WHERE document_node_id = ? ORDER BY created_at ASC')
      .all(documentNodeId) as SceneComment[]
  }

  create(documentNodeId: string, markId: string, text: string): SceneComment {
    const id = uuid()
    this.db
      .prepare('INSERT INTO scene_comments (id, document_node_id, mark_id, text) VALUES (?, ?, ?, ?)')
      .run(id, documentNodeId, markId, text)
    return this.db.prepare('SELECT * FROM scene_comments WHERE id = ?').get(id) as SceneComment
  }

  update(id: string, text: string): SceneComment {
    this.db.prepare('UPDATE scene_comments SET text = ? WHERE id = ?').run(text, id)
    return this.db.prepare('SELECT * FROM scene_comments WHERE id = ?').get(id) as SceneComment
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM scene_comments WHERE id = ?').run(id)
  }
}
