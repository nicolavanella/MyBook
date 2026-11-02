import { ipcMain, dialog } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '@shared/ipc/channels'
import type { MediaService } from '../services/media.service'
import { tm } from '../i18n'

/** Payload di readAsDataUrl: un solo percorso, di lunghezza ragionevole. */
const ReadAsDataUrlInput = z.object({ path: z.string().min(1).max(4096) })

export function registerMediaIpc(service: MediaService): void {
  ipcMain.handle(IpcChannels.media.pickImage, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: tm('dialog.images'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return service.importImage(result.filePaths[0])
  })

  ipcMain.handle(IpcChannels.media.readAsDataUrl, (_e, raw: unknown) => {
    const { path } = ReadAsDataUrlInput.parse(raw) // v0.4.2: payload validato; il controllo "dentro la cartella media" è nel servizio
    return service.readAsDataUrl(path)
  })
}
