import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc/channels'
import { IdInput, ProjectIdInput, TimelineIdInput, TimelineCreateInput, TimelineRenameInput, TimelineEventCreateInput, TimelineEventUpdateInput, ReorderIdsInput } from '@shared/schemas/domain.schema'
import type { TimelineRepository } from '../database/repositories/timeline.repository'
import type { ActivityLogService } from '../services/activity-log.service'

/**
 * Registro attività (v0.3.5, esteso in v0.3.6): sia il contenitore Timeline
 * (creazione/rinomina/eliminazione) sia i suoi singoli eventi (creazione/
 * rinomina/eliminazione). Per un evento si registra "rinominato" solo
 * quando cambia il titolo, non ad ogni modifica di data/descrizione/colore.
 */
export function registerTimelineIpc(repo: TimelineRepository, activityLog: ActivityLogService): void {
  ipcMain.handle(IpcChannels.timelines.list,(_e,r:unknown)=>repo.listTimelines(ProjectIdInput.parse(r).projectId))
  ipcMain.handle(IpcChannels.timelines.ensureDefault,(_e,r:unknown)=>repo.ensureDefaultTimeline(ProjectIdInput.parse(r).projectId))
  ipcMain.handle(IpcChannels.timelines.create,(_e,r:unknown)=>{
    const i=TimelineCreateInput.parse(r)
    const timeline=repo.createTimeline(i.projectId,i.name) as any
    activityLog.log(i.projectId,'timeline','created',i.name,'',timeline.id)
    return timeline
  })
  ipcMain.handle(IpcChannels.timelines.rename,(_e,r:unknown)=>{
    const i=TimelineRenameInput.parse(r)
    const before=repo.findTimelineById(i.id)
    repo.renameTimeline(i.id,i.name)
    if(before) activityLog.log(before.project_id,'timeline','updated',i.name,'',i.id)
    return{ok:true}
  })
  ipcMain.handle(IpcChannels.timelines.delete,(_e,r:unknown)=>{
    const { id } = IdInput.parse(r)
    const existing=repo.findTimelineById(id)
    repo.deleteTimeline(id)
    if(existing) activityLog.log(existing.project_id,'timeline','deleted',existing.name,'',id)
    return{ok:true}
  })
  ipcMain.handle(IpcChannels.timelineEvents.list,(_e,r:unknown)=>repo.listEvents(TimelineIdInput.parse(r).timelineId))
  ipcMain.handle(IpcChannels.timelineEvents.listAllForProject,(_e,r:unknown)=>repo.listAllEventsForProject(ProjectIdInput.parse(r).projectId))
  ipcMain.handle(IpcChannels.timelineEvents.create,(_e,r:unknown)=>{
    const i=TimelineEventCreateInput.parse(r)
    const event=repo.createEvent(i.projectId,i.timelineId,i.title) as any
    activityLog.log(i.projectId,'timeline_event','created',i.title,'',(event as any).id)
    return event
  })
  ipcMain.handle(IpcChannels.timelineEvents.update,(_e,r:unknown)=>{
    const i=TimelineEventUpdateInput.parse(r)
    const before=repo.findEventById(i.id)
    repo.updateEvent(i.id,i.fields)
    // Come per le scene: si registra "rinominato" solo se cambia il titolo,
    // non ad ogni modifica di data/descrizione/colore (altrimenti rumore).
    if(before && typeof i.fields.title === 'string' && i.fields.title !== before.title) {
      activityLog.log(before.project_id,'timeline_event','updated',i.fields.title,'',i.id)
    }
    return{ok:true}
  })
  ipcMain.handle(IpcChannels.timelineEvents.delete,(_e,r:unknown)=>{
    const { id } = IdInput.parse(r)
    const existing=repo.findEventById(id)
    repo.deleteEvent(id)
    if(existing) activityLog.log(existing.project_id,'timeline_event','deleted',existing.title,'',id)
    return{ok:true}
  })
  ipcMain.handle(IpcChannels.timelineEvents.reorder,(_e,r:unknown)=>{repo.reorderEvents(ReorderIdsInput.parse(r).orderedIds);return{ok:true}})
}
