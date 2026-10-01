import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc/channels'
import { CreateProjectInput, UpdateProjectInput } from '@shared/schemas/document.schema'
import type { ProjectService } from '../services/project.service'

export function registerProjectIpc(service: ProjectService): void {
  ipcMain.handle(IpcChannels.projects.list, () => service.list())

  ipcMain.handle(IpcChannels.projects.listWithStats, () => service.listWithStats())

  ipcMain.handle(IpcChannels.projects.findById, (_e, { id }: { id: string }) => {
    return service.findById(id)
  })

  ipcMain.handle(IpcChannels.projects.create, (_e, raw: unknown) => {
    const input = CreateProjectInput.parse(raw)
    return service.create(input)
  })

  ipcMain.handle(IpcChannels.projects.update, (_e, raw: unknown) => {
    const input = UpdateProjectInput.parse(raw)
    return service.update(input)
  })

  ipcMain.handle(IpcChannels.projects.duplicate, (_e, { id }: { id: string }) => {
    return service.duplicate(id)
  })

  ipcMain.handle(IpcChannels.projects.touch, (_e, { id }: { id: string }) => {
    service.touch(id)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.projects.delete, (_e, { id }: { id: string }) => {
    service.delete(id)
    return { ok: true }
  })

  // v0.3.9 — dove riaprire il progetto (sezione, ed eventualmente scena).
  ipcMain.handle(IpcChannels.projects.getUiState, (_e, { id }: { id: string }) => {
    return service.getUiState(id)
  })
  ipcMain.handle(IpcChannels.projects.setUiState, (_e, { id, patch }: { id: string; patch: Record<string, unknown> }) => {
    service.setUiState(id, patch)
    return { ok: true }
  })
}
