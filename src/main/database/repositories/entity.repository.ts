import type Database from 'better-sqlite3'

type EntityTable = 'characters' | 'locations' | 'objects'

const ALLOWED_COLUMNS: Record<EntityTable, ReadonlySet<string>> = {
  characters: new Set(['id','project_id','name','role','description','avatar_path','notes','custom_fields','tags','color','group_name']),
  locations: new Set(['id','project_id','parent_id','name','description','image_path','notes','custom_fields','tags','color','group_name']),
  objects: new Set(['id','project_id','name','description','image_path','notes','custom_fields','tags','color','group_name'])
}

export class EntityRepository {
  private readonly stmtList: Database.Statement
  private readonly stmtFindById: Database.Statement
  private readonly stmtDelete: Database.Statement
  private readonly insertStmtCache = new Map<string, Database.Statement>()
  private readonly updateStmtCache = new Map<string, Database.Statement>()

  constructor(private db: Database.Database, private table: EntityTable) {
    this.stmtList = db.prepare(`SELECT * FROM ${table} WHERE project_id = ? ORDER BY name ASC`)
    this.stmtFindById = db.prepare(`SELECT * FROM ${table} WHERE id = ?`)
    this.stmtDelete = db.prepare(`DELETE FROM ${table} WHERE id = ?`)
  }

  private validateKeys(keys: string[], allowId = false): void {
    const allowed = ALLOWED_COLUMNS[this.table]
    const invalid = keys.filter((k) => !allowed.has(k) || (!allowId && k === 'id'))
    if (invalid.length) throw new Error(`Campi non consentiti per ${this.table}: ${invalid.join(', ')}`)
  }

  list(projectId: string) { return this.stmtList.all(projectId) }
  findById(id: string) { return this.stmtFindById.get(id) }

  insert(row: Record<string, unknown>) {
    const keys = Object.keys(row).sort()
    this.validateKeys(keys, true)
    const cacheKey = keys.join(',')
    let stmt = this.insertStmtCache.get(cacheKey)
    if (!stmt) {
      stmt = this.db.prepare(`INSERT INTO ${this.table} (${keys.join(', ')}) VALUES (${keys.map((k) => `@${k}`).join(', ')})`)
      this.insertStmtCache.set(cacheKey, stmt)
    }
    stmt.run(row)
  }

  update(id: string, patch: Record<string, unknown>) {
    const keys = Object.keys(patch).sort()
    if (!keys.length) return
    this.validateKeys(keys)
    const cacheKey = keys.join(',')
    let stmt = this.updateStmtCache.get(cacheKey)
    if (!stmt) {
      const setClause = keys.map((k) => `${k} = @${k}`).join(', ')
      stmt = this.db.prepare(`UPDATE ${this.table} SET ${setClause}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = @id`)
      this.updateStmtCache.set(cacheKey, stmt)
    }
    stmt.run({ ...patch, id })
  }

  delete(id: string) { this.stmtDelete.run(id) }
}
