import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc/channels'
import { ProjectIdInput } from '@shared/schemas/domain.schema'
import { z } from 'zod'
import type { ActivityLogService } from '../services/activity-log.service'
import type { ProjectService } from '../services/project.service'

const SetTodoInput = z.object({ projectId: z.string().uuid(), text: z.string().max(4000) })

/** Registro attività (v0.3.5): recap all'avvio e nota "To Do" per progetto. Le singole operazioni sono registrate direttamente dagli altri handler IPC (document/character/location/object/timeline/mindmap), non da qui. */
export function registerActivityLogIpc(service: ActivityLogService, projectService: ProjectService): void {
  ipcMain.handle(IpcChannels.activityLog.recap, () => {
    return service.recap((projectId) => (projectService.findById(projectId) as any)?.title)
  })

  // v0.3.6: recap anche all'apertura di un singolo progetto (dall'elenco Progetti, o alla ripresa automatica dell'ultimo progetto attivo).
  ipcMain.handle(IpcChannels.activityLog.recapForProject, (_e, raw: unknown) => {
    const { projectId } = ProjectIdInput.parse(raw)
    const title = (projectService.findById(projectId) as any)?.title ?? ''
    return service.recapForProject(projectId, title)
  })

  // v0.3.6 — scheda Statistiche > Log: intero storico (fino al limite) del progetto aperto.
  ipcMain.handle(IpcChannels.activityLog.listForProject, (_e, raw: unknown) => {
    const { projectId } = ProjectIdInput.parse(raw)
    return service.listForProject(projectId)
  })

  ipcMain.handle(IpcChannels.activityLog.getTodo, (_e, raw: unknown) => {
    const { projectId } = ProjectIdInput.parse(raw)
    return service.getTodo(projectId)
  })

  ipcMain.handle(IpcChannels.activityLog.setTodo, (_e, raw: unknown) => {
    const { projectId, text } = SetTodoInput.parse(raw)
    service.setTodo(projectId, text)
    return { ok: true }
  })
}
