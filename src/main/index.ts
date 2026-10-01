import { app, BrowserWindow, shell, Menu, session, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { z } from 'zod'
import { getDb, getDbPath, closeDb } from './database/db'
import { loadWindowState, saveWindowState } from './window-state'
import { IpcChannels } from '@shared/ipc/channels'

import { ProjectRepository } from './database/repositories/project.repository'
import { DocumentRepository } from './database/repositories/document.repository'
import { EntityRepository } from './database/repositories/entity.repository'
import { TimelineRepository } from './database/repositories/timeline.repository'
import { SettingsRepository } from './database/repositories/settings.repository'
import { ActivityLogRepository } from './database/repositories/activity-log.repository'
import { SceneTagsRepository } from './database/repositories/scene-tags.repository'

import { ProjectService } from './services/project.service'
import { ProjectDuplicationService } from './services/project-duplication.service'
import { ProjectTransferService } from './services/project-transfer.service'
import { DocumentService } from './services/document.service'
import { ExportService } from './services/export.service'
import { SettingsService } from './services/settings.service'
import { MediaService } from './services/media.service'
import { ActivityLogService } from './services/activity-log.service'

import { registerAppIpc } from './ipc/app.ipc'
import { registerProjectIpc } from './ipc/project.ipc'
import { registerProjectTransferIpc } from './ipc/project-transfer.ipc'
import { registerDocumentIpc } from './ipc/document.ipc'
import { registerRevisionIpc } from './ipc/revision.ipc'
import { registerCharacterIpc } from './ipc/character.ipc'
import { registerLocationIpc } from './ipc/location.ipc'
import { registerObjectIpc } from './ipc/object.ipc'
import { registerTimelineIpc } from './ipc/timeline.ipc'
import { registerMindmapIpc } from './ipc/mindmap.ipc'
import { registerStatisticsIpc } from './ipc/statistics.ipc'
import { registerExportIpc } from './ipc/export.ipc'
import { registerConfigIpc } from './ipc/config.ipc'
import { registerSettingsIpc } from './ipc/settings.ipc'
import { registerMediaIpc } from './ipc/media.ipc'
import { registerCommentIpc } from './ipc/comment.ipc'
import { registerActivityLogIpc } from './ipc/activity-log.ipc'
import { CommentRepository } from './database/repositories/comment.repository'
import { registerEditorContextMenu, registerEditorContextClickReporter } from './editor-context-menu'

let settingsServiceRef: SettingsService | null = null
let activityLogServiceRef: ActivityLogService | null = null
// Finestra corrente e "lasciapassare" per la chiusura reale, usati dal flusso
// "To Do alla chiusura" (v0.3.5): la prima 'close' viene intercettata per
// chiedere al renderer di mostrare (eventualmente) il prompt; solo dopo la
// conferma esplicita (IpcChannels.app.confirmQuit) la finestra si chiude
// davvero. Un solo timer di sicurezza evita che l'app resti bloccata se il
// renderer non risponde mai (finestra non ancora caricata, errore JS...).
let currentWindow: BrowserWindow | null = null
let quitConfirmed = false
const QUIT_CONFIRM_TIMEOUT_MS = 5_000
// Evita un doppio tentativo di backup automatico (window-all-closed) quando
// la chiusura di tutte le finestre è provocata da un relaunch deliberato
// (reset/ripristino backup, vedi settings.ipc.ts): a quel punto il database
// è già stato sostituito, un backup "di cortesia" sarebbe solo rumore/rischio.
let isRelaunching = false
/** Intervallo (ms) con cui si verifica se è dovuto un backup automatico "a intervallo" — vedi SettingsService.runScheduledBackupIfDue. */
const BACKUP_SCHEDULE_CHECK_INTERVAL_MS = 60_000

export function markRelaunching(): void {
  isRelaunching = true
}

/**
 * Percorso dell'icona applicativa (finestra/taskbar), sia in sviluppo (repo
 * root, cartella `build/`) sia in produzione (copiata in `resources/` da
 * electron-builder tramite `extraResources` — vedi electron-builder.yml).
 * Stesso pattern di risoluzione dev/prod già usato in config.ts.
 */
function resolveIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.png')
  }
  return path.join(__dirname, '../../build/icon.png')
}

/**
 * Percorso del progetto dimostrativo incluso con l'applicazione (v0.3.8):
 * in sviluppo è nella cartella resources/ del repository, in produzione
 * viene copiato tra le risorse extra da electron-builder (electron-builder.yml)
 * — stesso pattern di resolveIconPath()/resolveMigrationsDir().
 */
function resolveManualPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'Manuale.mybook.json')
  }
  return path.join(__dirname, '../../resources/Manuale.mybook.json')
}

/**
 * Importa il progetto dimostrativo "Manuale di MyBook" la primissima volta
 * che l'app viene avviata (v0.3.8), così chi la apre per la prima volta
 * trova subito un esempio pronto da esplorare invece di una lista progetti
 * vuota. Non viene mai riproposto in seguito, nemmeno se l'utente lo
 * elimina: il flag manual_imported (migrazione 020) si imposta a 1 anche se
 * l'import fallisce (file mancante, JSON non valido...), per non ritentare
 * — e fallire di nuovo, magari rumorosamente — ad ogni riavvio successivo.
 */
function importManualOnFirstLaunchIfNeeded(db: ReturnType<typeof getDb>, projectTransferService: ProjectTransferService): void {
  const settings = db.prepare('SELECT manual_imported FROM app_settings').get() as { manual_imported: number } | undefined
  if (settings?.manual_imported) return
  try {
    const raw = JSON.parse(fs.readFileSync(resolveManualPath(), 'utf-8'))
    projectTransferService.importProject(raw)
  } catch (error) {
    console.error('[main] impossibile importare il manuale al primo avvio:', error)
  } finally {
    db.prepare('UPDATE app_settings SET manual_imported = 1').run()
  }
}

function registerAllIpc(): void {
  const db = getDb()

  // Repository (accesso dati puro)
  const projectRepo = new ProjectRepository(db)
  const documentRepo = new DocumentRepository(db)
  const characterRepo = new EntityRepository(db, 'characters')
  const locationRepo = new EntityRepository(db, 'locations')
  const objectRepo = new EntityRepository(db, 'objects')
  const timelineRepo = new TimelineRepository(db)
  const settingsRepo = new SettingsRepository(db)
  const activityLogRepo = new ActivityLogRepository(db)
  const sceneTagsRepo = new SceneTagsRepository(db)

  // Service (logica di dominio)
  const projectDuplicationService = new ProjectDuplicationService(db)
  const projectService = new ProjectService(projectRepo, projectDuplicationService)
  const projectTransferService = new ProjectTransferService(db)
  importManualOnFirstLaunchIfNeeded(db, projectTransferService)
  const documentService = new DocumentService(documentRepo, sceneTagsRepo)
  const exportService = new ExportService(db)
  const settingsService = new SettingsService(settingsRepo, getDbPath(), db)
  settingsServiceRef = settingsService
  const mediaService = new MediaService()
  const activityLogService = new ActivityLogService(activityLogRepo, settingsRepo)
  activityLogServiceRef = activityLogService

  // IPC (validazione payload + esposizione operazioni di dominio al renderer)
  registerAppIpc()
  registerProjectIpc(projectService)
  registerProjectTransferIpc(projectTransferService)
  registerDocumentIpc(documentService, activityLogService)
  registerRevisionIpc(documentService)
  registerCharacterIpc(characterRepo, activityLogService)
  registerLocationIpc(locationRepo, activityLogService)
  registerObjectIpc(objectRepo, activityLogService)
  registerTimelineIpc(timelineRepo, activityLogService)
  registerMindmapIpc(db, activityLogService)
  registerStatisticsIpc(documentService, projectService)
  registerExportIpc(exportService)
  registerConfigIpc()
  registerSettingsIpc(settingsService)
  registerActivityLogIpc(activityLogService, projectService)
  registerEditorContextClickReporter()

  // Applica subito all'avvio le lingue del correttore ortografico salvate,
  // altrimenti Chromium userebbe solo la lingua di sistema di default finché
  // l'utente non tocca le Impostazioni almeno una volta.
  try {
    const currentSettings = settingsService.get() as any
    if (Array.isArray(currentSettings?.dictionary_languages) && currentSettings.dictionary_languages.length > 0) {
      session.defaultSession.setSpellCheckerLanguages(currentSettings.dictionary_languages)
    }
  } catch (err) {
    console.warn('[dictionary] impossibile applicare le lingue salvate:', (err as Error).message)
  }
  registerMediaIpc(mediaService)
  registerCommentIpc(new CommentRepository(db))

  // v0.3.5 — "To Do alla chiusura": salva la nota (se un progetto era aperto)
  // e autorizza la chiusura reale della finestra in attesa (vedi win.on('close') in createMainWindow).
  const ConfirmQuitInput = z.object({ projectId: z.string().uuid().nullable().optional(), todo: z.string().max(4000).optional() })
  ipcMain.handle(IpcChannels.app.confirmQuit, (_e, raw: unknown) => {
    const { projectId, todo } = ConfirmQuitInput.parse(raw)
    if (projectId && typeof todo === 'string') activityLogServiceRef?.setTodo(projectId, todo)
    quitConfirmed = true
    currentWindow?.close()
  })
}

function createMainWindow(): void {
  const windowState = loadWindowState()
  const win = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    show: false,
    autoHideMenuBar: true,
    // Titolo iniziale: il renderer lo aggiorna subito dopo il mount con
    // "MyBook - nome progetto - sezione attuale" (vedi MainLayout.tsx).
    // Electron sincronizza automaticamente document.title -> titolo finestra
    // finché nessuno chiama win.setTitle() esplicitamente, quindi non serve
    // altro codice qui.
    title: 'MyBook',
    icon: resolveIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Ripristina massimizzazione/fullscreen DOPO la creazione: passarli come
  // opzioni del costruttore non è supportato in modo affidabile su tutte le
  // piattaforme, mentre chiamare i metodi qui funziona ovunque.
  if (windowState.isMaximized) win.maximize()
  if (windowState.isFullScreen) win.setFullScreen(true)

  win.once('ready-to-show', () => win.show())

  currentWindow = win
  quitConfirmed = false

  // Salvataggio dello stato: su 'close' (non 'closed', quando la finestra è
  // già distrutta) così la prossima apertura ricorda dimensione, posizione
  // e se era massimizzata/a schermo intero.
  win.on('close', (event) => {
    saveWindowState(win)

    // v0.3.5 — "To Do alla chiusura": la prima richiesta di chiusura viene
    // intercettata per dare tempo al renderer di mostrare (eventualmente,
    // se un progetto è aperto e il registro attività è abilitato) il prompt
    // "cosa fare la prossima volta". Solo dopo la conferma esplicita
    // (IpcChannels.app.confirmQuit) la chiusura procede davvero. isRelaunching
    // salta il prompt: a quel punto l'app sta per riavviarsi da sola (reset/
    // ripristino backup), non è l'utente a chiuderla.
    if (quitConfirmed || isRelaunching) return
    event.preventDefault()
    win.webContents.send(IpcChannels.app.quitRequested)
    // Rete di sicurezza: se il renderer non risponde mai (finestra non ancora
    // caricata, eccezione JS) la chiusura non deve restare bloccata per sempre.
    setTimeout(() => {
      if (!quitConfirmed) {
        quitConfirmed = true
        win.close()
      }
    }, QUIT_CONFIRM_TIMEOUT_MS)
  })

  // Link esterni aperti nel browser di sistema, mai in finestre Electron nuove
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  registerEditorContextMenu(win)

  // La menu bar è già nascosta di default (autoHideMenuBar) ma il tasto Alt
  // la rivela comunque: con Menu.setApplicationMenu(null) a livello di app
  // (vedi sotto) non esiste più alcuna menu bar da rivelare. L'unico effetto
  // collaterale è che l'acceleratore F11 per il fullscreen, normalmente
  // fornito dalla voce di menu "Schermo intero", va reimplementato a mano.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen())
      event.preventDefault()
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Disabilita completamente la menu bar nativa (niente Alt per mostrarla).
  // Va chiamato a livello di app, non solo sulla singola finestra: altrimenti
  // Electron ricrea comunque il menu di default. Vedi il listener F11 sopra
  // per la funzionalità di fullscreen che altrimenti andrebbe persa.
  Menu.setApplicationMenu(null)

  registerAllIpc()
  createMainWindow()

  // Backup automatico "a intervallo" (30min/1h/2h/4h): il controllo è
  // economico (una SELECT + confronto orario) quindi un intervallo di un
  // minuto è più che sufficiente a rispettare la frequenza configurata senza
  // sprecare risorse con timer più fitti.
  setInterval(() => settingsServiceRef?.runScheduledBackupIfDue(), BACKUP_SCHEDULE_CHECK_INTERVAL_MS)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  // Backup automatico se la frequenza configurata è "alla chiusura" (Impostazioni
  // > Generale > Backup). Le frequenze a intervallo (30min/1h/2h/4h) sono
  // gestite invece dal timer periodico avviato sopra, non da qui.
  if (!isRelaunching) {
    try {
      const settings = settingsServiceRef?.get() as any
      if (settings?.backup_frequency === 'onClose') {
        settingsServiceRef?.backupNow()
      }
    } catch (err) {
      console.warn('[backup] backup automatico alla chiusura fallito:', (err as Error).message)
    }
  }
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
