import { ipcMain } from 'electron'
import { IpcChannels, type RendererConfig } from '@shared/ipc/channels'
import { getConfig } from '../config'

/**
 * Il renderer non può leggere config/database.yml da filesystem (contextIsolation
 * attiva, nessun accesso Node — vedi note di sicurezza nel README), quindi il
 * sottoinsieme di parametri che gli servono (timing autosave/versioning per
 * SceneEditor) viene esposto tramite questo canale invece di essere duplicato
 * come costanti hardcoded lato renderer.
 */
export function registerConfigIpc(): void {
  ipcMain.handle(IpcChannels.config.get, (): RendererConfig => {
    const config = getConfig()
    return {
      autosaveDebounceMs: config.autosave.debounceMs,
      revisionAfterIdleMs: config.versioning.revisionAfterIdleMs
    }
  })
}
