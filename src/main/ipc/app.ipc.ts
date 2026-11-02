import { app, ipcMain, shell } from 'electron'
import path from 'node:path'
import { IpcChannels } from '@shared/ipc/channels'
import { setSceneEditorFocused, setAnnotationsEnabled } from '../editor-context-menu'
import { isAllowedExternalUrl } from '../security/external-url'

/**
 * Percorso del file LICENSE incluso con l'applicazione: in sviluppo è alla
 * radice del repository, in produzione viene copiato tra le risorse extra
 * da electron-builder (vedi electron-builder.yml) — stesso pattern di
 * resolveIconPath()/resolveMigrationsDir() in index.ts/db.ts.
 */
function resolveLicensePath(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'LICENSE')
  return path.join(__dirname, '../../LICENSE')
}

/**
 * Il renderer non ha accesso diretto a `shell` (contextIsolation attiva),
 * quindi ogni apertura di link esterno passa da qui — usato dalla sezione
 * Info per i link a sito/repository/contatti. Limitato a http, https e
 * mailto (vedi security/external-url.ts, regola condivisa con l'apertura di
 * finestre dal contenuto) per non trasformare questo canale in un modo per
 * lanciare protocolli arbitrari (es. file://, uno schema custom di un'altra
 * app) dal renderer. Fino alla 0.4.1 il commento diceva "solo http/https"
 * ma il codice ammetteva anche mailto: ora le due cose coincidono.
 */
export function registerAppIpc(): void {
  ipcMain.handle(IpcChannels.app.openExternal, (_e, url: unknown) => {
    if (!isAllowedExternalUrl(url)) return { ok: false, reason: 'Protocol not allowed' }
    shell.openExternal(url)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.editor.setFocused, (_e, focused: boolean) => {
    setSceneEditorFocused(!!focused)
  })

  ipcMain.handle(IpcChannels.editor.setAnnotationsEnabled, (_e, flags: { tagsEnabled?: boolean; commentsEnabled?: boolean }) => {
    setAnnotationsEnabled(flags ?? {})
  })

  // v0.3.8 — pagina Info: apre il file LICENSE con il visualizzatore predefinito del sistema (non in una finestra Electron).
  ipcMain.handle(IpcChannels.app.openLicense, () => {
    shell.openPath(resolveLicensePath())
    return { ok: true }
  })
}
