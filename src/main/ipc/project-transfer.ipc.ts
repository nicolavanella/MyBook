import { dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import { IpcChannels } from '@shared/ipc/channels'
import type { ProjectTransferService } from '../services/project-transfer.service'
import { tm } from '../i18n'

export function registerProjectTransferIpc(service: ProjectTransferService): void {
  ipcMain.handle(IpcChannels.projects.exportData, async (_e, { projectId }: { projectId: string }) => {
    const project = service.exportProject(projectId)
    const safeTitle = String(project.project.title).replace(/[\\/:*?"<>|]/g, '-').trim() || tm('dialog.defaultProjectFileName')
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: `${safeTitle}.mybook.json`,
      filters: [{ name: tm('dialog.mybookProject'), extensions: ['json'] }]
    })
    if (!filePath) return { ok: false }
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf8')
    return { ok: true, filePath }
  })

  ipcMain.handle(IpcChannels.projects.importData, async () => {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'], filters: [{ name: tm('dialog.mybookProject'), extensions: ['json'] }]
    })
    if (!filePaths[0]) return { ok: false }
    let parsed: unknown
    try { parsed = JSON.parse(fs.readFileSync(filePaths[0], 'utf8')) }
    catch { throw new Error(tm('dialog.invalidJson')) }
    const projectId = service.importProject(parsed)
    return { ok: true, projectId }
  })
}
