import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'

/** Duplica un progetto e tutte le relazioni correnti, escludendo volutamente lo storico revisioni/audit. */
export class ProjectDuplicationService {
  constructor(private db: Database.Database) {}

  duplicate(sourceProjectId: string): string {
    const newProjectId = uuid()
    return this.db.transaction(() => {
      const p=this.db.prepare('SELECT * FROM projects WHERE id=?').get(sourceProjectId) as any
      if(!p) throw new Error(`Progetto non trovato: ${sourceProjectId}`)
      this.db.prepare(`INSERT INTO projects (id,title,subtitle,author,year,description,notes,plot,fabula)
        VALUES (@id,@title,@subtitle,@author,@year,@description,@notes,@plot,@fabula)`).run({id:newProjectId,title:`${p.title} (copia)`,subtitle:p.subtitle,author:p.author,year:p.year,description:p.description,notes:p.notes,plot:p.plot,fabula:p.fabula})
      const ps=this.db.prepare('SELECT settings FROM project_settings WHERE project_id=?').get(sourceProjectId) as any
      this.db.prepare('INSERT INTO project_settings (project_id,settings) VALUES (?,?)').run(newProjectId,ps?.settings??'{}')

      const nodeMap=new Map<string,string>()
      const nodes=this.db.prepare('SELECT * FROM document_nodes WHERE project_id=? ORDER BY created_at, order_index').all(sourceProjectId) as any[]
      for(const n of nodes) nodeMap.set(n.id,uuid())
      const insNode=this.db.prepare(`INSERT INTO document_nodes (id,project_id,parent_id,node_type,title,subtitle,description,notes,status,order_index,content,word_count,char_count)
        VALUES (@id,@projectId,@parentId,@nodeType,@title,@subtitle,@description,@notes,@status,@orderIndex,@content,@wordCount,@charCount)`)
      // Le foreign key gerarchiche sono immediate in SQLite: inseriamo prima
      // tutti i nodi, poi colleghiamo i padri. L'ordine fisico delle righe non
      // è una garanzia (un nodo può essere assegnato a un gruppo creato dopo).
      for(const n of nodes) insNode.run({id:nodeMap.get(n.id),projectId:newProjectId,parentId:null,nodeType:n.node_type,title:n.title,subtitle:n.subtitle,description:n.description,notes:n.notes,status:n.status,orderIndex:n.order_index,content:n.content,wordCount:n.word_count,charCount:n.char_count})
      const setNodeParent=this.db.prepare('UPDATE document_nodes SET parent_id=? WHERE id=?')
      for(const n of nodes) if(n.parent_id) setNodeParent.run(nodeMap.get(n.parent_id)??null,nodeMap.get(n.id))

      const charMap=new Map<string,string>()
      for(const c of this.db.prepare('SELECT * FROM characters WHERE project_id=?').all(sourceProjectId) as any[]){ const id=uuid();charMap.set(c.id,id);this.db.prepare(`INSERT INTO characters (id,project_id,name,role,description,avatar_path,notes,custom_fields,tags) VALUES (?,?,?,?,?,?,?,?,?)`).run(id,newProjectId,c.name,c.role,c.description,c.avatar_path,c.notes,c.custom_fields,c.tags) }
      const locMap=new Map<string,string>(); const locs=this.db.prepare('SELECT * FROM locations WHERE project_id=?').all(sourceProjectId) as any[]; for(const l of locs) locMap.set(l.id,uuid())
      for(const l of locs) this.db.prepare(`INSERT INTO locations (id,project_id,parent_id,name,description,image_path,notes,custom_fields,tags) VALUES (?,?,?,?,?,?,?,?,?)`).run(locMap.get(l.id),newProjectId,null,l.name,l.description,l.image_path,l.notes,l.custom_fields,l.tags)
      const setLocationParent=this.db.prepare('UPDATE locations SET parent_id=? WHERE id=?')
      for(const l of locs) if(l.parent_id) setLocationParent.run(locMap.get(l.parent_id)??null,locMap.get(l.id))

      const objectMap=new Map<string,string>()
      const objects=this.db.prepare('SELECT * FROM objects WHERE project_id=?').all(sourceProjectId) as any[]
      for(const o of objects){
        const id=uuid(); objectMap.set(o.id,id)
        this.db.prepare('INSERT INTO objects (id,project_id,name,description,image_path,notes,custom_fields,tags) VALUES (?,?,?,?,?,?,?,?)')
          .run(id,newProjectId,o.name,o.description,o.image_path,o.notes,o.custom_fields,o.tags)
      }

      const timelineMap=new Map<string,string>()
      for(const t of this.db.prepare('SELECT * FROM timelines WHERE project_id=?').all(sourceProjectId) as any[]){const id=uuid();timelineMap.set(t.id,id);this.db.prepare('INSERT INTO timelines (id,project_id,name,order_index) VALUES (?,?,?,?)').run(id,newProjectId,t.name,t.order_index)}
      const eventMap=new Map<string,string>()
      for(const e of this.db.prepare('SELECT * FROM timeline_events WHERE project_id=?').all(sourceProjectId) as any[]){const id=uuid();eventMap.set(e.id,id);this.db.prepare(`INSERT INTO timeline_events (id,project_id,timeline_id,title,description,event_date,calendar_date,order_index,notes) VALUES (?,?,?,?,?,?,?,?,?)`).run(id,newProjectId,e.timeline_id?(timelineMap.get(e.timeline_id)??null):null,e.title,e.description,e.event_date,e.calendar_date,e.order_index,e.notes)}

      const mapMap=new Map<string,string>()
      for(const m of this.db.prepare('SELECT * FROM mindmaps WHERE project_id=?').all(sourceProjectId) as any[]){const id=uuid();mapMap.set(m.id,id);this.db.prepare('INSERT INTO mindmaps (id,project_id,name,order_index) VALUES (?,?,?,?)').run(id,newProjectId,m.name,m.order_index)}
      const mmNodeMap=new Map<string,string>();const mmNodes=this.db.prepare('SELECT * FROM mindmap_nodes WHERE project_id=?').all(sourceProjectId) as any[];for(const n of mmNodes)mmNodeMap.set(n.id,uuid())
      const refFor=(n:any)=> n.node_type==='character'?charMap.get(n.ref_id):n.node_type==='location'?locMap.get(n.ref_id):n.node_type==='object'?objectMap.get(n.ref_id):n.node_type==='event'?eventMap.get(n.ref_id):['chapter','scene'].includes(n.node_type)?nodeMap.get(n.ref_id):n.ref_id
      for(const n of mmNodes)this.db.prepare(`INSERT INTO mindmap_nodes (id,project_id,mindmap_id,node_type,ref_id,label,description,group_id,pos_x,pos_y,color) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(mmNodeMap.get(n.id),newProjectId,n.mindmap_id?(mapMap.get(n.mindmap_id)??null):null,n.node_type,refFor(n)??null,n.label,n.description,null,n.pos_x,n.pos_y,n.color)
      const setMindmapGroup=this.db.prepare('UPDATE mindmap_nodes SET group_id=? WHERE id=?')
      for(const n of mmNodes) if(n.group_id) setMindmapGroup.run(mmNodeMap.get(n.group_id)??null,mmNodeMap.get(n.id))
      for(const e of this.db.prepare('SELECT * FROM mindmap_edges WHERE project_id=?').all(sourceProjectId) as any[])if(mmNodeMap.has(e.source_node_id)&&mmNodeMap.has(e.target_node_id))this.db.prepare(`INSERT INTO mindmap_edges (id,project_id,mindmap_id,source_node_id,target_node_id,label,style) VALUES (?,?,?,?,?,?,?)`).run(uuid(),newProjectId,e.mindmap_id?(mapMap.get(e.mindmap_id)??null):null,mmNodeMap.get(e.source_node_id),mmNodeMap.get(e.target_node_id),e.label,e.style)
      return newProjectId
    })()
  }
}
