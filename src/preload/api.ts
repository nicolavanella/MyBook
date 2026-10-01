import { IpcChannels, type RendererConfig, type ProjectAnalysis, type ProjectActivityRecap, type EntityTagUsage, type ActivityLogEntry } from '@shared/ipc/channels'
import type { AppSettings, UpdateAppSettingsInput } from '@shared/schemas/settings.schema'

export interface SceneCommentDto {
  id: string
  document_node_id: string
  mark_id: string
  text: string
  created_at: string
}

/**
 * Superficie API esposta al renderer. Nessun accesso diretto a ipcRenderer,
 * fs o Node.js — solo queste funzioni tipizzate (sezione 3: contextIsolation
 * attiva, nodeIntegration disabilitato).
 */
export function buildApi(
  invoke: (channel: string, ...args: any[]) => Promise<any>,
  on: (channel: string, listener: (...args: any[]) => void) => () => void,
  sendSync: (channel: string, ...args: any[]) => any
) {
  return {
    app: {
      /** Apre un URL http/https nel browser di sistema (usato dalla pagina Info per i link esterni). */
      openExternal: (url: string): Promise<{ ok: boolean; reason?: string }> =>
        invoke(IpcChannels.app.openExternal, url),
      /** v0.3.8: apre il file LICENSE (pagina Info) col visualizzatore predefinito del sistema. */
      openLicense: (): Promise<{ ok: boolean }> => invoke(IpcChannels.app.openLicense),
      /**
       * v0.3.5 — flusso "To Do alla chiusura": il main intercetta la chiusura
       * della finestra e chiede al renderer (questo evento) di mostrare
       * l'eventuale prompt prima di autorizzare la chiusura reale con
       * confirmQuit. Se il registro attività è disabilitato, o non c'è un
       * progetto aperto, il renderer può chiamare confirmQuit subito, senza
       * mostrare nulla.
       */
      onQuitRequested: (listener: () => void) => on(IpcChannels.app.quitRequested, listener),
      /** Autorizza la chiusura reale della finestra, salvando prima il ToDo indicato (se un progetto è aperto). */
      confirmQuit: (payload: { projectId: string | null; todo?: string }): Promise<void> =>
        invoke(IpcChannels.app.confirmQuit, payload)
    },
    editor: {
      /** Notifica il main quando l'editor della scena guadagna/perde il focus, per mostrare "Aggiungi commento/tag" solo lì nel menu contestuale nativo. */
      setFocused: (focused: boolean): Promise<void> => invoke(IpcChannels.editor.setFocused, focused),
      /** Notifica il main se tag/commenti sono abilitati (Impostazioni > Editor), per mostrare o nascondere le relative voci nel menu contestuale nativo. */
      setAnnotationsEnabled: (flags: { tagsEnabled?: boolean; commentsEnabled?: boolean }): Promise<void> =>
        invoke(IpcChannels.editor.setAnnotationsEnabled, flags),
      /** "Aggiungi commento…" scelto nel menu contestuale nativo (vedi editor-context-menu.ts). */
      onAddComment: (listener: () => void) => on(IpcChannels.editor.addComment, listener),
      /** "Aggiungi tag…" scelto nel menu contestuale nativo, con la categoria selezionata. */
      onAddTag: (listener: (entityType: 'character' | 'location' | 'object' | 'event') => void) =>
        on(IpcChannels.editor.addTag, listener),
      /**
       * v0.3.8 — segnala al main, in modo SINCRONO, cosa c'è sotto l'ultimo
       * click destro nel testo (un commento esistente, un tag esistente, o
       * niente): il menu contestuale nativo lo legge subito dopo per
       * mostrare "Mostra/Elimina commento" o "Elimina tag" al posto di
       * "Aggiungi…". Va chiamato dal gestore 'mousedown' del tasto destro,
       * PRIMA che il menu si apra.
       */
      reportContextClick: (info: { kind: 'comment' } | { kind: 'tag' } | { kind: 'none' }): void => {
        sendSync(IpcChannels.editor.reportContextClick, info)
      },
      /** "Mostra commento" scelto nel menu contestuale nativo, su un commento esistente. */
      onShowComment: (listener: () => void) => on(IpcChannels.editor.showComment, listener),
      /** "Elimina commento" scelto nel menu contestuale nativo, su un commento esistente. */
      onDeleteCommentAt: (listener: () => void) => on(IpcChannels.editor.deleteCommentAt, listener),
      /** "Elimina tag" scelto nel menu contestuale nativo, su un tag esistente. */
      onDeleteTagAt: (listener: () => void) => on(IpcChannels.editor.deleteTagAt, listener)
    },
    comments: {
      list: (documentNodeId: string): Promise<SceneCommentDto[]> => invoke(IpcChannels.comments.list, { documentNodeId }),
      create: (documentNodeId: string, markId: string, text: string): Promise<SceneCommentDto> =>
        invoke(IpcChannels.comments.create, { documentNodeId, markId, text }),
      update: (id: string, text: string): Promise<SceneCommentDto> => invoke(IpcChannels.comments.update, { id, text }),
      delete: (id: string) => invoke(IpcChannels.comments.delete, { id })
    },
    projects: {
      list: () => invoke(IpcChannels.projects.list),
      listWithStats: () => invoke(IpcChannels.projects.listWithStats),
      findById: (id: string) => invoke(IpcChannels.projects.findById, { id }),
      create: (input: {
        title: string
        subtitle?: string
        author?: string
        year?: number
        description?: string
        notes?: string
        plot?: string
        fabula?: string
      }) => invoke(IpcChannels.projects.create, input),
      update: (id: string, fields: Record<string, unknown>) =>
        invoke(IpcChannels.projects.update, { id, fields }),
      duplicate: (id: string) => invoke(IpcChannels.projects.duplicate, { id }),
      exportData: (projectId: string) => invoke(IpcChannels.projects.exportData, { projectId }),
      importData: () => invoke(IpcChannels.projects.importData),
      touch: (id: string) => invoke(IpcChannels.projects.touch, { id }),
      delete: (id: string) => invoke(IpcChannels.projects.delete, { id }),
      /** v0.3.9: dove riaprire il progetto (sezione, ed eventualmente scena). */
      getUiState: (id: string): Promise<Record<string, unknown>> => invoke(IpcChannels.projects.getUiState, { id }),
      setUiState: (id: string, patch: Record<string, unknown>): Promise<{ ok: true }> =>
        invoke(IpcChannels.projects.setUiState, { id, patch })
    },
    documents: {
      tree: (projectId: string) => invoke(IpcChannels.documents.tree, { projectId }),
      create: (input: {
        projectId: string
        parentId?: string | null
        nodeType: string
        title: string
        subtitle?: string
        description?: string
        notes?: string
      }) => invoke(IpcChannels.documents.create, input),
      update: (id: string, fields: Record<string, unknown>) =>
        invoke(IpcChannels.documents.update, { id, fields }),
      move: (id: string, newParentId: string | null, newOrderIndex: number) =>
        invoke(IpcChannels.documents.move, { id, newParentId, newOrderIndex }),
      reorder: (orderedIds: string[], movedNodeId?: string, newParentId?: string | null) =>
        invoke(IpcChannels.documents.reorder, { orderedIds, movedNodeId, newParentId }),
      duplicate: (id: string) => invoke(IpcChannels.documents.duplicate, { id }),
      delete: (id: string) => invoke(IpcChannels.documents.delete, { id }),
      /** v0.3.6: dove compare, nel Manoscritto, un tag verso un'entità (personaggio/località/oggetto). */
      entityTagUsages: (projectId: string, entityType: string, entityId: string): Promise<EntityTagUsage[]> =>
        invoke(IpcChannels.documents.entityTagUsages, { projectId, entityType, entityId })
    },
    revisions: {
      list: (documentNodeId: string) => invoke(IpcChannels.revisions.list, { documentNodeId }),
      create: (documentNodeId: string, reason: string) =>
        invoke(IpcChannels.revisions.create, { documentNodeId, reason }),
      compare: (revisionIdA: string, revisionIdB: string) =>
        invoke(IpcChannels.revisions.compare, { revisionIdA, revisionIdB }),
      restore: (revisionId: string) => invoke(IpcChannels.revisions.restore, { revisionId })
    },
    characters: {
      list: (projectId: string) => invoke(IpcChannels.characters.list, { projectId }),
      create: (projectId: string, name: string) =>
        invoke(IpcChannels.characters.create, { projectId, name }),
      update: (id: string, fields: Record<string, unknown>) =>
        invoke(IpcChannels.characters.update, { id, fields }),
      delete: (id: string) => invoke(IpcChannels.characters.delete, { id })
    },
    locations: {
      list: (projectId: string) => invoke(IpcChannels.locations.list, { projectId }),
      create: (projectId: string, name: string, parentId?: string | null) =>
        invoke(IpcChannels.locations.create, { projectId, name, parentId }),
      update: (id: string, fields: Record<string, unknown>) =>
        invoke(IpcChannels.locations.update, { id, fields }),
      delete: (id: string) => invoke(IpcChannels.locations.delete, { id })
    },
    objects: {
      list: (projectId: string) => invoke(IpcChannels.objects.list, { projectId }),
      create: (projectId: string, name: string) =>
        invoke(IpcChannels.objects.create, { projectId, name }),
      update: (id: string, fields: Record<string, unknown>) =>
        invoke(IpcChannels.objects.update, { id, fields }),
      delete: (id: string) => invoke(IpcChannels.objects.delete, { id })
    },
    timelines: {
      list: (projectId: string) => invoke(IpcChannels.timelines.list, { projectId }),
      ensureDefault: (projectId: string) => invoke(IpcChannels.timelines.ensureDefault, { projectId }),
      create: (projectId: string, name: string) => invoke(IpcChannels.timelines.create, { projectId, name }),
      rename: (id: string, name: string) => invoke(IpcChannels.timelines.rename, { id, name }),
      delete: (id: string) => invoke(IpcChannels.timelines.delete, { id })
    },
    timelineEvents: {
      list: (timelineId: string) => invoke(IpcChannels.timelineEvents.list, { timelineId }),
      listAllForProject: (projectId: string) =>
        invoke(IpcChannels.timelineEvents.listAllForProject, { projectId }),
      create: (projectId: string, timelineId: string, title: string) =>
        invoke(IpcChannels.timelineEvents.create, { projectId, timelineId, title }),
      update: (id: string, fields: Record<string, unknown>) =>
        invoke(IpcChannels.timelineEvents.update, { id, fields }),
      delete: (id: string) => invoke(IpcChannels.timelineEvents.delete, { id }),
      reorder: (orderedIds: string[]) => invoke(IpcChannels.timelineEvents.reorder, { orderedIds })
    },
    mindmaps: {
      list: (projectId: string) => invoke(IpcChannels.mindmaps.list, { projectId }),
      ensureDefault: (projectId: string) => invoke(IpcChannels.mindmaps.ensureDefault, { projectId }),
      create: (projectId: string, name: string) => invoke(IpcChannels.mindmaps.create, { projectId, name }),
      rename: (id: string, name: string) => invoke(IpcChannels.mindmaps.rename, { id, name }),
      delete: (id: string) => invoke(IpcChannels.mindmaps.delete, { id })
    },
    mindmap: {
      load: (mindmapId: string) => invoke(IpcChannels.mindmap.load, { mindmapId }),
      createNode: (params: Record<string, unknown>) =>
        invoke(IpcChannels.mindmap.createNode, params),
      updateNode: (id: string, fields: Record<string, unknown>) =>
        invoke(IpcChannels.mindmap.updateNode, { id, fields }),
      deleteNode: (id: string) => invoke(IpcChannels.mindmap.deleteNode, { id }),
      createEdge: (params: Record<string, unknown>) =>
        invoke(IpcChannels.mindmap.createEdge, params),
      deleteEdge: (id: string) => invoke(IpcChannels.mindmap.deleteEdge, { id })
    },
    statistics: {
      get: (projectId: string) => invoke(IpcChannels.statistics.get, { projectId }),
      /** v0.3.5 — scheda Statistiche > Analisi: totali di progetto + spaccato per capitolo. */
      getAnalysis: (projectId: string): Promise<ProjectAnalysis> =>
        invoke(IpcChannels.statistics.getAnalysis, { projectId })
    },
    activityLog: {
      /** Recap mostrato all'apertura dell'app: ultime operazioni per progetto + ToDo lasciato la volta precedente. */
      recap: (): Promise<ProjectActivityRecap[]> => invoke(IpcChannels.activityLog.recap),
      /** v0.3.6: recap di un solo progetto, mostrato anche alla sua apertura (non solo all'avvio dell'app). Null se non c'è nulla da mostrare. */
      recapForProject: (projectId: string): Promise<ProjectActivityRecap | null> =>
        invoke(IpcChannels.activityLog.recapForProject, { projectId }),
      /** v0.3.6: intero storico (fino al limite) del progetto aperto — scheda Statistiche > Log. */
      listForProject: (projectId: string): Promise<ActivityLogEntry[]> => invoke(IpcChannels.activityLog.listForProject, { projectId }),
      getTodo: (projectId: string): Promise<string> => invoke(IpcChannels.activityLog.getTodo, { projectId }),
      setTodo: (projectId: string, text: string): Promise<{ ok: true }> =>
        invoke(IpcChannels.activityLog.setTodo, { projectId, text })
    },
    export: {
      project: (
        projectId: string,
        format: 'txt' | 'md' | 'html' | 'docx' | 'pdf' | 'epub',
        options?: { nodeIds?: string[]; sceneSeparator?: 'title' | 'stars' | 'none'; partSeparator?: 'title' | 'none'; chapterSeparator?: 'title' | 'none' }
      ) => invoke(IpcChannels.export.project, { projectId, format, options }),
      openFile: (filePath: string) => invoke(IpcChannels.export.openFile, { filePath }),
      showInFolder: (filePath: string) => invoke(IpcChannels.export.showInFolder, { filePath })
    },
    media: {
      pickImage: (): Promise<string | null> => invoke(IpcChannels.media.pickImage),
      readAsDataUrl: (path: string): Promise<string | null> =>
        invoke(IpcChannels.media.readAsDataUrl, { path })
    },
    config: {
      get: (): Promise<RendererConfig> => invoke(IpcChannels.config.get)
    },
    settings: {
      get: (): Promise<AppSettings> => invoke(IpcChannels.settings.get),
      update: (input: UpdateAppSettingsInput): Promise<AppSettings> =>
        invoke(IpcChannels.settings.update, input),
      pickBackupFolder: (): Promise<string | null> =>
        invoke(IpcChannels.settings.pickBackupFolder),
      backupNow: (): Promise<{ ok: boolean; path?: string; reason?: string }> =>
        invoke(IpcChannels.settings.backupNow),
      pickDictionaryFile: (): Promise<string | null> => invoke(IpcChannels.settings.pickDictionaryFile),
      pickDatabaseBackup: (): Promise<string | null> => invoke(IpcChannels.settings.pickDatabaseBackup),
      databaseStatus: () => invoke(IpcChannels.settings.databaseStatus),
      clearDatabase: () => invoke(IpcChannels.settings.clearDatabase),
      resetDatabase: () => invoke(IpcChannels.settings.resetDatabase),
      loadDatabaseBackup: (filePath: string) => invoke(IpcChannels.settings.loadDatabaseBackup, filePath),
      getAvailableDictionaries: (): Promise<string[]> => invoke(IpcChannels.settings.getAvailableDictionaries)
    }
  }
}

export type MyBookApi = ReturnType<typeof buildApi>
