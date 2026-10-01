/**
 * Nomi dei canali IPC, come stringhe costanti — così preload/main/renderer
 * non rischiano refusi ("documents.udpate" invece di "documents.update").
 * Il documento di architettura specifica: l'IPC espone operazioni di dominio,
 * non query SQL generiche (sezione 8).
 */
export const IpcChannels = {
  app: {
    openExternal: 'app.openExternal',
    /** v0.3.8: apre il file LICENSE incluso con l'applicazione (pagina Info). */
    openLicense: 'app.openLicense',
    // v0.3.5: richiesta "To Do" alla chiusura (vedi main/index.ts e MainLayout.tsx).
    quitRequested: 'app.quitRequested', // push dal main al renderer, quando l'utente chiude la finestra
    confirmQuit: 'app.confirmQuit' // invoke dal renderer: salva il ToDo (se presente) e autorizza la chiusura
  },
  editor: {
    setFocused: 'editor.setFocused',
    setAnnotationsEnabled: 'editor.setAnnotationsEnabled',
    addComment: 'editor.addComment', // push dal main al renderer (menu contestuale nativo)
    addTag: 'editor.addTag', // push dal main al renderer (menu contestuale nativo)
    // v0.3.8 — menu contestuale su un commento/tag già esistente nel testo:
    reportContextClick: 'editor.reportContextClick', // renderer -> main, sincrono: cosa c'è sotto l'ultimo click destro (comment/tag/niente)
    showComment: 'editor.showComment', // push dal main al renderer ("Mostra commento")
    deleteCommentAt: 'editor.deleteCommentAt', // push dal main al renderer ("Elimina commento")
    deleteTagAt: 'editor.deleteTagAt' // push dal main al renderer ("Elimina tag")
  },
  comments: {
    list: 'comments.list',
    create: 'comments.create',
    update: 'comments.update',
    delete: 'comments.delete'
  },
  projects: {
    list: 'projects.list',
    listWithStats: 'projects.listWithStats',
    findById: 'projects.findById',
    create: 'projects.create',
    update: 'projects.update',
    duplicate: 'projects.duplicate',
    exportData: 'projects.exportData',
    importData: 'projects.importData',
    touch: 'projects.touch',
    delete: 'projects.delete',
    /** v0.3.9: dove riaprire il progetto (sezione, ed eventualmente scena) — vedi MainLayout.tsx. */
    getUiState: 'projects.getUiState',
    setUiState: 'projects.setUiState'
  },
  documents: {
    tree: 'documents.tree',
    create: 'documents.create',
    update: 'documents.update',
    move: 'documents.move',
    reorder: 'documents.reorder',
    duplicate: 'documents.duplicate',
    delete: 'documents.delete',
    /** v0.3.6: dove compare, nel Manoscritto, un tag verso un'entità (personaggio/località/oggetto). */
    entityTagUsages: 'documents.entityTagUsages'
  },
  revisions: {
    list: 'revisions.list',
    create: 'revisions.create',
    compare: 'revisions.compare',
    restore: 'revisions.restore'
  },
  characters: {
    list: 'characters.list',
    create: 'characters.create',
    update: 'characters.update',
    delete: 'characters.delete'
  },
  locations: {
    list: 'locations.list',
    create: 'locations.create',
    update: 'locations.update',
    delete: 'locations.delete'
  },
  objects: {
    list: 'objects.list',
    create: 'objects.create',
    update: 'objects.update',
    delete: 'objects.delete'
  },
  timelines: {
    list: 'timelines.list',
    ensureDefault: 'timelines.ensureDefault',
    create: 'timelines.create',
    rename: 'timelines.rename',
    delete: 'timelines.delete'
  },
  timelineEvents: {
    list: 'timelineEvents.list',
    listAllForProject: 'timelineEvents.listAllForProject',
    create: 'timelineEvents.create',
    update: 'timelineEvents.update',
    delete: 'timelineEvents.delete',
    reorder: 'timelineEvents.reorder'
  },
  mindmaps: {
    list: 'mindmaps.list',
    ensureDefault: 'mindmaps.ensureDefault',
    create: 'mindmaps.create',
    rename: 'mindmaps.rename',
    delete: 'mindmaps.delete'
  },
  mindmap: {
    load: 'mindmap.load',
    createNode: 'mindmap.createNode',
    updateNode: 'mindmap.updateNode',
    deleteNode: 'mindmap.deleteNode',
    createEdge: 'mindmap.createEdge',
    deleteEdge: 'mindmap.deleteEdge'
  },
  statistics: {
    get: 'statistics.get',
    getAnalysis: 'statistics.getAnalysis' // v0.3.5, scheda Statistiche > Analisi
  },
  activityLog: {
    recap: 'activityLog.recap',
    recapForProject: 'activityLog.recapForProject', // v0.3.6: recap anche all'apertura del singolo progetto
    listForProject: 'activityLog.listForProject', // v0.3.6: scheda Statistiche > Log
    getTodo: 'activityLog.getTodo',
    setTodo: 'activityLog.setTodo'
  },
  export: {
    project: 'export.project',
    openFile: 'export.openFile',
    showInFolder: 'export.showInFolder'
  },
  media: {
    pickImage: 'media.pickImage',
    readAsDataUrl: 'media.readAsDataUrl'
  },
  config: {
    get: 'config.get'
  },
  settings: {
    get: 'settings.get',
    update: 'settings.update',
    pickBackupFolder: 'settings.pickBackupFolder',
    backupNow: 'settings.backupNow',
    pickDictionaryFile: 'settings.pickDictionaryFile',
    pickDatabaseBackup: 'settings.pickDatabaseBackup',
    databaseStatus: 'settings.databaseStatus',
    clearDatabase: 'settings.clearDatabase',
    resetDatabase: 'settings.resetDatabase',
    loadDatabaseBackup: 'settings.loadDatabaseBackup',
    getAvailableDictionaries: 'settings.getAvailableDictionaries'
  }
} as const

/** Sottoinsieme di config/database.yml rilevante per il renderer (autosave/versioning UI). */
export interface RendererConfig {
  autosaveDebounceMs: number
  revisionAfterIdleMs: number
}

export interface ChapterStatistics {
  chapterId: string
  chapterTitle: string
  sceneCount: number
  wordCount: number
  idea: number
  bozza: number
  revisione: number
  completo: number
}

export interface ProjectStatistics {
  totalWords: number
  totalChars: number
  /** v0.3.6: caratteri totali senza contare gli spazi (calcolato dal contenuto vero, nessuna colonna cache). */
  totalCharsWithoutSpaces: number
  totalNodes: number
  completedNodes: number
  completionPct: number
  /** v0.3.8: capitoli "completati" = tutte le loro scene sono in stato Finito (e ne hanno almeno una). */
  chaptersCompleted: number
  chaptersTotal: number
  chapters: ChapterStatistics[]
  projectCreatedAt: string | null
  daysSinceCreation: number | null
  avgWordsPerDay: number | null
}

/** Statistiche testuali di un blocco di testo (progetto intero o singolo capitolo) — v0.3.5. */
export interface TextAnalysisResult {
  words: number
  charsWithSpaces: number
  charsWithoutSpaces: number
  sentences: number
  paragraphs: number
  readingMinutes: number
  editorialPages: number
  printPages: number
  keywords: { word: string; count: number }[]
}

export interface ChapterTextAnalysis extends TextAnalysisResult {
  chapterId: string
  chapterTitle: string
  /** v0.3.6: tag (personaggi/località/oggetti) presenti nel capitolo, con conteggio occorrenze — vedi Statistiche > Analisi. */
  tags: { entityType: string; entityId: string; count: number }[]
}

/** Risposta di statistics.getAnalysis: totali di progetto + spaccato per capitolo. */
export interface ProjectAnalysis {
  total: TextAnalysisResult
  chapters: ChapterTextAnalysis[]
}

/** Una riga dell'elenco "dove compare questo tag" nella scheda di un personaggio/località/oggetto (v0.3.6). */
export interface EntityTagUsage {
  chapterId: string
  chapterTitle: string
  sceneId: string
  sceneTitle: string
  occurrenceIndex: number
  snippet: string
}

/** Una riga del registro attività di un progetto (v0.3.5, sezione Log). */
export interface ActivityLogEntry {
  id: string
  project_id: string
  entity_type: 'scene' | 'chapter' | 'group' | 'character' | 'location' | 'object' | 'timeline' | 'timeline_event' | 'mindmap' | 'mindmap_node' | 'mindmap_edge'
  action: 'created' | 'updated' | 'deleted' | 'moved'
  entity_name: string
  /** v0.3.7: id reale dell'entità coinvolta (stabile anche se viene rinominata) — vedi migrazione 018. */
  entity_id: string
  details: string
  created_at: string
}

/** Recap di un progetto mostrato all'apertura dell'app: ultime operazioni + ToDo lasciato la volta precedente. */
export interface ProjectActivityRecap {
  projectId: string
  projectTitle: string
  todo: string
  entries: ActivityLogEntry[]
}

export type ExportFormat = 'txt' | 'md' | 'html' | 'docx' | 'pdf' | 'epub'
