import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

const EVENT_COLUMNS = new Set(['timeline_id','title','description','event_date','calendar_date','order_index','notes','color'])

export class TimelineRepository {
  constructor(private db: Database.Database) {}
  listTimelines(projectId: string) { return this.db.prepare('SELECT * FROM timelines WHERE project_id = ? ORDER BY order_index ASC').all(projectId) }
  /** Usato dal registro attività (v0.3.5) per leggere project_id/nome prima di una rinomina o eliminazione. */
  findTimelineById(id: string): any { return this.db.prepare('SELECT * FROM timelines WHERE id = ?').get(id) }
  ensureDefaultTimeline(projectId: string): any { const e=this.listTimelines(projectId) as any[]; return e[0] ?? this.createTimeline(projectId,'Timeline principale') }
  createTimeline(projectId: string, name: string) { const id=uuid(); this.db.prepare('INSERT INTO timelines (id, project_id, name) VALUES (?, ?, ?)').run(id,projectId,name); return this.db.prepare('SELECT * FROM timelines WHERE id = ?').get(id) }
  renameTimeline(id: string, name: string) { this.db.prepare("UPDATE timelines SET name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(name,id) }
  deleteTimeline(id: string) { this.db.prepare('DELETE FROM timelines WHERE id = ?').run(id) }
  listEvents(timelineId: string) { return this.db.prepare('SELECT * FROM timeline_events WHERE timeline_id = ? ORDER BY order_index ASC').all(timelineId) }
  listAllEventsForProject(projectId: string) { return this.db.prepare('SELECT * FROM timeline_events WHERE project_id = ? ORDER BY order_index ASC').all(projectId) }
  createEvent(projectId: string, timelineId: string, title: string) {
    const owner=this.db.prepare('SELECT project_id FROM timelines WHERE id = ?').get(timelineId) as any
    if (!owner || owner.project_id !== projectId) throw new Error('Timeline non appartenente al progetto')
    const id=uuid(); const max=this.db.prepare('SELECT MAX(order_index) m FROM timeline_events WHERE timeline_id = ?').get(timelineId) as any
    this.db.prepare('INSERT INTO timeline_events (id, project_id, timeline_id, title, order_index) VALUES (?, ?, ?, ?, ?)').run(id,projectId,timelineId,title,(max?.m??-1)+1)
    return this.db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(id)
  }
  updateEvent(id: string, patch: Record<string, unknown>) {
    const keys=Object.keys(patch).sort(); if(!keys.length) return
    const invalid=keys.filter(k=>!EVENT_COLUMNS.has(k)); if(invalid.length) throw new Error(`Campi evento non consentiti: ${invalid.join(', ')}`)
    const set=keys.map(k=>`${k} = @${k}`).join(', ')
    this.db.prepare(`UPDATE timeline_events SET ${set}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = @id`).run({...patch,id})
  }
  deleteEvent(id: string) { this.db.prepare('DELETE FROM timeline_events WHERE id = ?').run(id) }
  /** Usato dal registro attività (v0.3.5) per leggere project_id/titolo prima di una rinomina o eliminazione. */
  findEventById(id: string): any { return this.db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(id) }
  reorderEvents(orderedIds: string[]) { const stmt=this.db.prepare("UPDATE timeline_events SET order_index = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"); this.db.transaction((ids:string[])=>ids.forEach((id,i)=>stmt.run(i,id)))(orderedIds) }
}
