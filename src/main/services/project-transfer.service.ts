import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'

const entityList = z.array(z.record(z.unknown())).default([])
export const ProjectPackageSchema = z.object({
  format: z.literal('mybook-project'),
  version: z.literal(1),
  exportedAt: z.string(),
  application: z.object({ name: z.literal('MyBook'), version: z.string() }),
  project: z.object({ title: z.string().trim().min(1) }).passthrough(),
  settings: z.string().default('{}'),
  data: z.object({
    documentNodes: entityList, characters: entityList, locations: entityList, objects: entityList,
    timelines: entityList, timelineEvents: entityList, mindmaps: entityList,
    mindmapNodes: entityList, mindmapEdges: entityList
  })
})
export type ProjectPackage = z.infer<typeof ProjectPackageSchema>

/** Serializzazione portabile del contenuto corrente del progetto.
 * Le revisioni e l'audit sono volutamente esclusi: non fanno parte dello stato
 * editoriale importabile e renderebbero il pacchetto inutilmente pesante. */
export class ProjectTransferService {
  constructor(private db: Database.Database) {}

  exportProject(projectId: string): ProjectPackage {
    const project = this.db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any
    if (!project) throw new Error('Progetto non trovato')
    const all = (sql: string) => this.db.prepare(sql).all(projectId) as Record<string, unknown>[]
    return {
      format: 'mybook-project', version: 1, exportedAt: new Date().toISOString(),
      application: { name: 'MyBook', version: '0.2.6' }, project,
      settings: (this.db.prepare('SELECT settings FROM project_settings WHERE project_id=?').get(projectId) as any)?.settings ?? '{}',
      data: {
        documentNodes: all('SELECT * FROM document_nodes WHERE project_id=?'),
        characters: all('SELECT * FROM characters WHERE project_id=?'), locations: all('SELECT * FROM locations WHERE project_id=?'),
        objects: all('SELECT * FROM objects WHERE project_id=?'), timelines: all('SELECT * FROM timelines WHERE project_id=?'),
        timelineEvents: all('SELECT * FROM timeline_events WHERE project_id=?'),
        mindmaps: all('SELECT * FROM mindmaps WHERE project_id=?'), mindmapNodes: all('SELECT * FROM mindmap_nodes WHERE project_id=?'),
        mindmapEdges: all('SELECT * FROM mindmap_edges WHERE project_id=?')
      }
    }
  }

  importProject(raw: unknown): string {
    const pack = ProjectPackageSchema.parse(raw)
    const newProjectId = uuid()
    const map = (rows: Record<string, unknown>[]) => new Map(rows.map(r => [String(r.id), uuid()]))
    const d = pack.data
    const nodes = map(d.documentNodes), chars = map(d.characters), locations = map(d.locations), objects = map(d.objects)
    const timelines = map(d.timelines), events = map(d.timelineEvents)
    const mindmaps = map(d.mindmaps), mindmapNodes = map(d.mindmapNodes)
    const get = (row: Record<string, unknown>, key: string, fallback: any = '') => row[key] ?? fallback
    const id = (m: Map<string, string>, value: unknown) => value ? m.get(String(value)) ?? null : null

    return this.db.transaction(() => {
      const p = pack.project as Record<string, unknown>
      this.db.prepare('INSERT INTO projects (id,title,subtitle,author,year,description,notes,plot,fabula) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(newProjectId, get(p,'title'), get(p,'subtitle'), get(p,'author',null), get(p,'year',null), get(p,'description'), get(p,'notes'), get(p,'plot'), get(p,'fabula'))
      this.db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run(newProjectId, pack.settings)

      const insNode = this.db.prepare('INSERT INTO document_nodes (id,project_id,parent_id,node_type,title,subtitle,description,notes,status,order_index,content,word_count,char_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      for (const r of d.documentNodes) insNode.run(id(nodes,r.id),newProjectId,null,get(r,'node_type','scene'),get(r,'title'),get(r,'subtitle'),get(r,'description'),get(r,'notes'),get(r,'status','idea'),get(r,'order_index',0),get(r,'content','{}'),get(r,'word_count',0),get(r,'char_count',0))
      const setNodeParent=this.db.prepare('UPDATE document_nodes SET parent_id=? WHERE id=?')
      for (const r of d.documentNodes) if(r.parent_id) setNodeParent.run(id(nodes,r.parent_id),id(nodes,r.id))

      const insCharacter=this.db.prepare('INSERT INTO characters (id,project_id,name,role,description,avatar_path,notes,custom_fields,tags) VALUES (?,?,?,?,?,?,?,?,?)')
      for(const r of d.characters) insCharacter.run(id(chars,r.id),newProjectId,get(r,'name'),get(r,'role'),get(r,'description'),get(r,'avatar_path',null),get(r,'notes'),get(r,'custom_fields','[]'),get(r,'tags'))
      const insLocation=this.db.prepare('INSERT INTO locations (id,project_id,parent_id,name,description,image_path,notes,custom_fields,tags) VALUES (?,?,?,?,?,?,?,?,?)')
      for(const r of d.locations) insLocation.run(id(locations,r.id),newProjectId,null,get(r,'name'),get(r,'description'),get(r,'image_path',null),get(r,'notes'),get(r,'custom_fields','[]'),get(r,'tags'))
      const setLocationParent=this.db.prepare('UPDATE locations SET parent_id=? WHERE id=?')
      for(const r of d.locations) if(r.parent_id) setLocationParent.run(id(locations,r.parent_id),id(locations,r.id))
      const insObject=this.db.prepare('INSERT INTO objects (id,project_id,name,description,image_path,notes,custom_fields,tags) VALUES (?,?,?,?,?,?,?,?)')
      for(const r of d.objects) insObject.run(id(objects,r.id),newProjectId,get(r,'name'),get(r,'description'),get(r,'image_path',null),get(r,'notes'),get(r,'custom_fields','[]'),get(r,'tags'))

      for(const r of d.timelines) this.db.prepare('INSERT INTO timelines (id,project_id,name,order_index) VALUES (?,?,?,?)').run(id(timelines,r.id),newProjectId,get(r,'name'),get(r,'order_index',0))
      for(const r of d.timelineEvents) this.db.prepare('INSERT INTO timeline_events (id,project_id,timeline_id,title,description,event_date,calendar_date,order_index,notes) VALUES (?,?,?,?,?,?,?,?,?)').run(id(events,r.id),newProjectId,id(timelines,r.timeline_id),get(r,'title'),get(r,'description'),get(r,'event_date'),get(r,'calendar_date'),get(r,'order_index',0),get(r,'notes'))

      for(const r of d.mindmaps) this.db.prepare('INSERT INTO mindmaps (id,project_id,name,order_index) VALUES (?,?,?,?)').run(id(mindmaps,r.id),newProjectId,get(r,'name'),get(r,'order_index',0))
      const remapRef=(r: Record<string,unknown>) => ({character:chars,location:locations,object:objects,event:events,chapter:nodes,scene:nodes}[String(r.node_type)]?.get(String(r.ref_id)) ?? get(r,'ref_id',null))
      for(const r of d.mindmapNodes) this.db.prepare('INSERT INTO mindmap_nodes (id,project_id,mindmap_id,node_type,ref_id,label,description,group_id,pos_x,pos_y,color) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id(mindmapNodes,r.id),newProjectId,id(mindmaps,r.mindmap_id),get(r,'node_type'),remapRef(r),get(r,'label'),get(r,'description'),null,get(r,'pos_x',0),get(r,'pos_y',0),get(r,'color'))
      for(const r of d.mindmapNodes) if(r.group_id) this.db.prepare('UPDATE mindmap_nodes SET group_id=? WHERE id=?').run(id(mindmapNodes,r.group_id),id(mindmapNodes,r.id))
      for(const r of d.mindmapEdges) { const source=id(mindmapNodes,r.source_node_id), target=id(mindmapNodes,r.target_node_id); if(source && target) this.db.prepare('INSERT INTO mindmap_edges (id,project_id,mindmap_id,source_node_id,target_node_id,label,style) VALUES (?,?,?,?,?,?,?)').run(uuid(),newProjectId,id(mindmaps,r.mindmap_id),source,target,get(r,'label'),get(r,'style','solid')) }
      return newProjectId
    })()
  }
}
