import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { IpcChannels } from '@shared/ipc/channels'
import { ObjectCreateInput, ObjectUpdateInput, ProjectIdInput, IdInput } from '@shared/schemas/domain.schema'
import type { EntityRepository } from '../database/repositories/entity.repository'
import type { ActivityLogService } from '../services/activity-log.service'

export function registerObjectIpc(repo: EntityRepository, activityLog: ActivityLogService): void {
  ipcMain.handle(IpcChannels.objects.list, (_e, raw: unknown) => repo.list(ProjectIdInput.parse(raw).projectId))
  ipcMain.handle(IpcChannels.objects.create, (_e, raw: unknown) => {
    const input = ObjectCreateInput.parse(raw)
    const id = uuid()
    repo.insert({ id, project_id: input.projectId, name: input.name })
    activityLog.log(input.projectId, 'object', 'created', input.name, '', id)
    return repo.findById(id)
  })
  ipcMain.handle(IpcChannels.objects.update, (_e, raw: unknown) => {
    const input = ObjectUpdateInput.parse(raw)
    const patch: Record<string, unknown> = { ...input.fields }
    if (input.fields.custom_fields) patch.custom_fields = JSON.stringify(input.fields.custom_fields)
    repo.update(input.id, patch)
    const updated = repo.findById(input.id) as any
    if (updated) activityLog.log(updated.project_id, 'object', 'updated', updated.name, '', updated.id)
    return updated
  })
  ipcMain.handle(IpcChannels.objects.delete, (_e, raw: unknown) => {
    const { id } = IdInput.parse(raw)
    const existing = repo.findById(id) as any
    repo.delete(id)
    if (existing) activityLog.log(existing.project_id, 'object', 'deleted', existing.name, '', existing.id)
    return { ok: true }
  })
}
