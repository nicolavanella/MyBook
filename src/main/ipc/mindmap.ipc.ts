import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import type Database from 'better-sqlite3'
import { IpcChannels } from '@shared/ipc/channels'
import { IdInput, ProjectIdInput, MindmapIdInput, MindmapCreateInput, MindmapRenameInput, MindmapNodeCreateInput, MindmapNodeUpdateInput, MindmapEdgeCreateInput } from '@shared/schemas/domain.schema'
import type { ActivityLogService } from '../services/activity-log.service'

const NODE_COLUMNS = new Set(['node_type','ref_id','label','description','group_id','pos_x','pos_y','color'])

/**
 * Registro attività (v0.3.5, esteso in v0.3.6): sia il contenitore Mappa
 * concettuale (creazione/rinomina/eliminazione) sia i suoi nodi (creazione/
 * rinomina/eliminazione — "rinomina" solo se cambia l'etichetta) e i suoi
 * archi (creazione/eliminazione: un arco non ha un nome da rinominare).
 */
export function registerMindmapIpc(db: Database.Database, activityLog: ActivityLogService): void {
  ipcMain.handle(IpcChannels.mindmaps.list, (_e, raw: unknown) => {
    const { projectId } = ProjectIdInput.parse(raw)
    return db.prepare('SELECT * FROM mindmaps WHERE project_id = ? ORDER BY order_index ASC').all(projectId)
  })
  ipcMain.handle(IpcChannels.mindmaps.ensureDefault, (_e, raw: unknown) => {
    const { projectId } = ProjectIdInput.parse(raw)
    const existing = db.prepare('SELECT * FROM mindmaps WHERE project_id = ? ORDER BY order_index ASC').all(projectId) as any[]
    if (existing.length) return existing[0]
    const id=uuid(); db.prepare('INSERT INTO mindmaps (id, project_id, name) VALUES (?, ?, ?)').run(id,projectId,'Mappa principale')
    return db.prepare('SELECT * FROM mindmaps WHERE id = ?').get(id)
  })
  ipcMain.handle(IpcChannels.mindmaps.create, (_e, raw: unknown) => {
    const i=MindmapCreateInput.parse(raw); const id=uuid()
    db.prepare('INSERT INTO mindmaps (id, project_id, name) VALUES (?, ?, ?)').run(id,i.projectId,i.name)
    activityLog.log(i.projectId,'mindmap','created',i.name,'',id)
    return db.prepare('SELECT * FROM mindmaps WHERE id = ?').get(id)
  })
  ipcMain.handle(IpcChannels.mindmaps.rename, (_e, raw: unknown) => {
    const i=MindmapRenameInput.parse(raw)
    const before=db.prepare('SELECT project_id FROM mindmaps WHERE id=?').get(i.id) as any
    db.prepare("UPDATE mindmaps SET name=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(i.name,i.id)
    if(before) activityLog.log(before.project_id,'mindmap','updated',i.name,'',i.id)
    return {ok:true}
  })
  ipcMain.handle(IpcChannels.mindmaps.delete, (_e, raw: unknown) => {
    const { id } = IdInput.parse(raw)
    const existing=db.prepare('SELECT * FROM mindmaps WHERE id=?').get(id) as any
    db.prepare('DELETE FROM mindmaps WHERE id=?').run(id)
    if(existing) activityLog.log(existing.project_id,'mindmap','deleted',existing.name,'',id)
    return {ok:true}
  })

  ipcMain.handle(IpcChannels.mindmap.load, (_e, raw: unknown) => {
    const { mindmapId }=MindmapIdInput.parse(raw)
    return { nodes: db.prepare('SELECT * FROM mindmap_nodes WHERE mindmap_id=?').all(mindmapId), edges: db.prepare('SELECT * FROM mindmap_edges WHERE mindmap_id=?').all(mindmapId) }
  })
  ipcMain.handle(IpcChannels.mindmap.createNode, (_e, raw: unknown) => {
    const i=MindmapNodeCreateInput.parse(raw)
    const owner=db.prepare('SELECT project_id FROM mindmaps WHERE id=?').get(i.mindmapId) as any
    if(!owner || owner.project_id!==i.projectId) throw new Error('Mappa non appartenente al progetto')
    const id=uuid()
    db.prepare(`INSERT INTO mindmap_nodes (id,project_id,mindmap_id,node_type,ref_id,label,description,group_id,pos_x,pos_y,color)
      VALUES (@id,@projectId,@mindmapId,@nodeType,@refId,@label,@description,@groupId,@posX,@posY,@color)`).run({id,...i,refId:i.refId??null,description:i.description??'',groupId:i.groupId??null,color:i.color??''})
    activityLog.log(i.projectId,'mindmap_node','created',i.label || '(senza etichetta)','',id)
    return db.prepare('SELECT * FROM mindmap_nodes WHERE id=?').get(id)
  })
  ipcMain.handle(IpcChannels.mindmap.updateNode, (_e, raw: unknown) => {
    const i=MindmapNodeUpdateInput.parse(raw); const keys=Object.keys(i.fields).sort()
    const invalid=keys.filter(k=>!NODE_COLUMNS.has(k)); if(invalid.length) throw new Error(`Campi nodo non consentiti: ${invalid.join(', ')}`)
    const before=db.prepare('SELECT project_id, label FROM mindmap_nodes WHERE id=?').get(i.id) as any
    if(keys.length){ const set=keys.map(k=>`${k}=@${k}`).join(', '); db.prepare(`UPDATE mindmap_nodes SET ${set}, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=@id`).run({...i.fields,id:i.id}) }
    // Come per gli eventi della Timeline: si registra "rinominato" solo se
    // cambia l'etichetta, non ad ogni spostamento/cambio colore.
    if(before && typeof i.fields.label === 'string' && i.fields.label !== before.label) {
      activityLog.log(before.project_id,'mindmap_node','updated',i.fields.label || '(senza etichetta)','',i.id)
    }
    return db.prepare('SELECT * FROM mindmap_nodes WHERE id=?').get(i.id)
  })
  ipcMain.handle(IpcChannels.mindmap.deleteNode, (_e, raw: unknown) => {
    const { id } = IdInput.parse(raw)
    const existing=db.prepare('SELECT * FROM mindmap_nodes WHERE id=?').get(id) as any
    db.prepare('DELETE FROM mindmap_nodes WHERE id=?').run(id)
    if(existing) activityLog.log(existing.project_id,'mindmap_node','deleted',existing.label || '(senza etichetta)','',id)
    return {ok:true}
  })
  ipcMain.handle(IpcChannels.mindmap.createEdge, (_e, raw: unknown) => {
    const i=MindmapEdgeCreateInput.parse(raw)
    const nodes=db.prepare('SELECT id,project_id,mindmap_id,label FROM mindmap_nodes WHERE id IN (?,?)').all(i.sourceNodeId,i.targetNodeId) as any[]
    if(nodes.length!==2 || nodes.some(n=>n.project_id!==i.projectId || n.mindmap_id!==i.mindmapId)) throw new Error('Arco tra nodi non appartenenti alla stessa mappa/progetto')
    const id=uuid(); db.prepare('INSERT INTO mindmap_edges (id,project_id,mindmap_id,source_node_id,target_node_id,label) VALUES (?,?,?,?,?,?)').run(id,i.projectId,i.mindmapId,i.sourceNodeId,i.targetNodeId,i.label??'')
    const source=nodes.find(n=>n.id===i.sourceNodeId)?.label || '?'
    const target=nodes.find(n=>n.id===i.targetNodeId)?.label || '?'
    activityLog.log(i.projectId,'mindmap_edge','created',`${source} → ${target}`,'',id)
    return db.prepare('SELECT * FROM mindmap_edges WHERE id=?').get(id)
  })
  ipcMain.handle(IpcChannels.mindmap.deleteEdge, (_e, raw: unknown) => {
    const { id } = IdInput.parse(raw)
    const existing=db.prepare(
      `SELECT e.project_id as project_id, sn.label as sourceLabel, tn.label as targetLabel
       FROM mindmap_edges e
       LEFT JOIN mindmap_nodes sn ON sn.id = e.source_node_id
       LEFT JOIN mindmap_nodes tn ON tn.id = e.target_node_id
       WHERE e.id=?`
    ).get(id) as any
    db.prepare('DELETE FROM mindmap_edges WHERE id=?').run(id)
    if(existing) activityLog.log(existing.project_id,'mindmap_edge','deleted',`${existing.sourceLabel||'?'} → ${existing.targetLabel||'?'}`,'',id)
    return {ok:true}
  })
}
