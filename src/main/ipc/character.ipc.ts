import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { IpcChannels } from '@shared/ipc/channels'
import { CharacterCreateInput, CharacterUpdateInput, LocationCreateInput, LocationUpdateInput, ProjectIdInput, IdInput } from '@shared/schemas/domain.schema'
import type { EntityRepository } from '../database/repositories/entity.repository'
import type { ActivityLogService } from '../services/activity-log.service'

export function registerCharacterIpc(repo: EntityRepository, activityLog: ActivityLogService): void {
  ipcMain.handle(IpcChannels.characters.list, (_e, raw: unknown) => repo.list(ProjectIdInput.parse(raw).projectId))
  ipcMain.handle(IpcChannels.characters.create, (_e, raw: unknown) => {
    const input = CharacterCreateInput.parse(raw); const id = uuid()
    repo.insert({ id, project_id: input.projectId, name: input.name })
    activityLog.log(input.projectId, 'character', 'created', input.name, '', id)
    return repo.findById(id)
  })
  ipcMain.handle(IpcChannels.characters.update, (_e, raw: unknown) => {
    const input = CharacterUpdateInput.parse(raw)
    const patch: Record<string, unknown> = { ...input.fields }
    if (input.fields.custom_fields) patch.custom_fields = JSON.stringify(input.fields.custom_fields)
    repo.update(input.id, patch)
    const updated = repo.findById(input.id) as any
    if (updated) activityLog.log(updated.project_id, 'character', 'updated', updated.name, '', updated.id)
    return updated
  })
  ipcMain.handle(IpcChannels.characters.delete, (_e, raw: unknown) => {
    const { id } = IdInput.parse(raw)
    const existing = repo.findById(id) as any
    repo.delete(id)
    if (existing) activityLog.log(existing.project_id, 'character', 'deleted', existing.name, '', existing.id)
    return { ok: true }
  })
}

export function registerLocationIpc(repo: EntityRepository, activityLog: ActivityLogService): void {
  ipcMain.handle(IpcChannels.locations.list, (_e, raw: unknown) => repo.list(ProjectIdInput.parse(raw).projectId))
  ipcMain.handle(IpcChannels.locations.create, (_e, raw: unknown) => {
    const input = LocationCreateInput.parse(raw); const id = uuid()
    repo.insert({ id, project_id: input.projectId, parent_id: input.parentId ?? null, name: input.name })
    activityLog.log(input.projectId, 'location', 'created', input.name, '', id)
    return repo.findById(id)
  })
  ipcMain.handle(IpcChannels.locations.update, (_e, raw: unknown) => {
    const input = LocationUpdateInput.parse(raw)
    const patch: Record<string, unknown> = { ...input.fields }
    if (input.fields.custom_fields) patch.custom_fields = JSON.stringify(input.fields.custom_fields)
    repo.update(input.id, patch)
    const updated = repo.findById(input.id) as any
    if (updated) activityLog.log(updated.project_id, 'location', 'updated', updated.name, '', updated.id)
    return updated
  })
  ipcMain.handle(IpcChannels.locations.delete, (_e, raw: unknown) => {
    const { id } = IdInput.parse(raw)
    const existing = repo.findById(id) as any
    repo.delete(id)
    if (existing) activityLog.log(existing.project_id, 'location', 'deleted', existing.name, '', existing.id)
    return { ok: true }
  })
}
