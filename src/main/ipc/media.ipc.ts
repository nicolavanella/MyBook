import { ipcMain, dialog } from 'electron'
import { IpcChannels } from '@shared/ipc/channels'
import type { MediaService } from '../services/media.service'

export function registerMediaIpc(service: MediaService): void {
  ipcMain.handle(IpcChannels.media.pickImage, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Immagini', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return service.importImage(result.filePaths[0])
  })

  ipcMain.handle(IpcChannels.media.readAsDataUrl, (_e, { path }: { path: string }) => {
    return service.readAsDataUrl(path)
  })
}
