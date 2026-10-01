import { app, ipcMain, dialog, BrowserWindow, session } from 'electron'
import { getDb, getDbPath, closeDb } from '../database/db'
import { clearDatabase, getDatabaseStatus, replaceDatabaseFile, resetDatabaseFile } from '../database/database-maintenance'
import { IpcChannels } from '@shared/ipc/channels'
import { UpdateAppSettingsInput } from '@shared/schemas/settings.schema'
import type { SettingsService } from '../services/settings.service'
import { markRelaunching } from '../index'

/**
 * Pianifica il riavvio dell'app dopo un'operazione distruttiva (reset,
 * ripristino backup). Bug corretto in questa versione: prima si chiamava
 * `app.relaunch()` seguito nello stesso tick da `app.exit(0)`, il che termina
 * il processo così bruscamente che la risposta IPC verso il renderer non fa
 * in tempo a essere consegnata (la Promise di `await window.mybook.settings
 * .resetDatabase()` restava sospesa per sempre) — da qui la sensazione che
 * "il riavvio automatico si blocchi" e la necessità di chiudere e riaprire
 * l'app a mano. La soluzione: rispondere subito al renderer (return normale
 * dell'handler) e rimandare relaunch+exit al giro successivo dell'event
 * loop con `setImmediate`, dando tempo al messaggio IPC di essere inviato;
 * le finestre vengono distrutte esplicitamente prima di uscire.
 */
function scheduleRelaunch(): void {
  markRelaunching()
  setImmediate(() => {
    app.relaunch()
    BrowserWindow.getAllWindows().forEach((win) => win.destroy())
    app.exit(0)
  })
}

export function registerSettingsIpc(service: SettingsService): void {
  ipcMain.handle(IpcChannels.settings.get, () => service.get())

  ipcMain.handle(IpcChannels.settings.update, (_e, raw: unknown) => {
    const input = UpdateAppSettingsInput.parse(raw)
    const result = service.update(input)
    if (input.dictionary_languages) {
      // Applica subito le lingue attive del correttore ortografico di
      // sistema: Chromium supporta più lingue simultaneamente, a differenza
      // del precedente "dizionario personalizzato" a file singolo mai
      // realmente collegato al motore ortografico.
      session.defaultSession.setSpellCheckerLanguages(input.dictionary_languages)
    }
    return result
  })

  // Elenco delle lingue installabili dal correttore ortografico di sistema, per il selettore in Impostazioni > Editor.
  ipcMain.handle(IpcChannels.settings.getAvailableDictionaries, () => {
    return session.defaultSession.availableSpellCheckerLanguages
  })

  // Apre il selettore di cartella nativo per scegliere dove salvare i backup.
  ipcMain.handle(IpcChannels.settings.pickBackupFolder, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IpcChannels.settings.backupNow, () => service.backupNow())

  ipcMain.handle(IpcChannels.settings.pickDictionaryFile, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Dizionari', extensions: ['dic', 'txt', 'aff', 'dic'] }, { name: 'Tutti i file', extensions: ['*'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IpcChannels.settings.pickDatabaseBackup, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Database MyBook', extensions: ['db', 'sqlite', 'sqlite3'] }, { name: 'Tutti i file', extensions: ['*'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IpcChannels.settings.databaseStatus, () => ({
    path: getDbPath(),
    tables: getDatabaseStatus(getDb())
  }))

  ipcMain.handle(IpcChannels.settings.clearDatabase, () => {
    clearDatabase(getDb())
    // Anche "Svuota" riavvia l'app: opera sulla connessione DB live, ma lo
    // stato in memoria del renderer (progetti, albero, editor aperto...)
    // resterebbe comunque disallineato dal database appena svuotato.
    // Riavviare garantisce uno stato coerente, come per Reset e Carica
    // backup. closeDb() qui è solo un checkpoint/chiusura pulita prima
    // dell'uscita, il file non viene toccato (a differenza di reset/replace).
    closeDb()
    scheduleRelaunch()
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.settings.resetDatabase, () => {
    const dbPath = getDbPath()
    closeDb()
    resetDatabaseFile(dbPath)
    scheduleRelaunch()
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.settings.loadDatabaseBackup, (_e, raw: unknown) => {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('Percorso backup non valido.')
    const dbPath = getDbPath()
    closeDb()
    replaceDatabaseFile(dbPath, raw)
    scheduleRelaunch()
    return { ok: true }
  })
}
