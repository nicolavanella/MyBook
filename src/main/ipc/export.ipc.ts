import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import fs from 'node:fs'
import { IpcChannels } from '@shared/ipc/channels'
import type { ExportFormat } from '@shared/ipc/channels'
import type { ExportService, ExportOptions } from '../services/export.service'

export function registerExportIpc(service: ExportService): void {
  ipcMain.handle(
    IpcChannels.export.project,
    async (
      _e,
      { projectId, format, options }: { projectId: string; format: ExportFormat; options?: ExportOptions }
    ) => {
      const defaultPath = service.suggestedFileName(projectId, format)

      switch (format) {
        case 'txt':
        case 'md': {
          const content =
            format === 'md' ? service.toMarkdown(projectId, options) : service.toPlainText(projectId, options)
          const { filePath } = await dialog.showSaveDialog({
            defaultPath,
            filters: [{ name: format.toUpperCase(), extensions: [format] }]
          })
          if (!filePath) return { ok: false }
          fs.writeFileSync(filePath, content, 'utf-8')
          return { ok: true, filePath }
        }

        case 'html': {
          const content = service.toHtml(projectId, options)
          const { filePath } = await dialog.showSaveDialog({
            defaultPath,
            filters: [{ name: 'HTML', extensions: ['html'] }]
          })
          if (!filePath) return { ok: false }
          fs.writeFileSync(filePath, content, 'utf-8')
          return { ok: true, filePath }
        }

        case 'docx': {
          const buffer = await service.toDocxBuffer(projectId, options)
          const { filePath } = await dialog.showSaveDialog({
            defaultPath,
            filters: [{ name: 'Word Document', extensions: ['docx'] }]
          })
          if (!filePath) return { ok: false }
          fs.writeFileSync(filePath, buffer)
          return { ok: true, filePath }
        }

        case 'pdf': {
          const html = service.toHtml(projectId, options)
          const win = new BrowserWindow({ show: false })
          await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
          const pdfBuffer = await win.webContents.printToPDF({})
          win.close()

          const { filePath } = await dialog.showSaveDialog({
            defaultPath,
            filters: [{ name: 'PDF', extensions: ['pdf'] }]
          })
          if (!filePath) return { ok: false }
          fs.writeFileSync(filePath, pdfBuffer)
          return { ok: true, filePath }
        }

        case 'epub': {
          const buffer = await service.toEpubBuffer(projectId, options)
          const { filePath } = await dialog.showSaveDialog({
            defaultPath,
            filters: [{ name: 'EPUB', extensions: ['epub'] }]
          })
          if (!filePath) return { ok: false }
          fs.writeFileSync(filePath, buffer)
          return { ok: true, filePath }
        }

        default:
          throw new Error(`Formato di export non supportato: ${format}`)
      }
    }
  )

  // Dopo l'export, il renderer offre "Apri file" / "Mostra nella cartella"
  // tramite un piccolo componente proprio (non un dialog nativo bloccante).
  ipcMain.handle(IpcChannels.export.openFile, (_e, { filePath }: { filePath: string }) => {
    shell.openPath(filePath)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.export.showInFolder, (_e, { filePath }: { filePath: string }) => {
    shell.showItemInFolder(filePath)
    return { ok: true }
  })
}
