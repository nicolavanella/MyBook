import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc/channels'
import type { DocumentService } from '../services/document.service'
import type { ProjectService } from '../services/project.service'

/**
 * Le statistiche sono derivate dal contenuto corrente (sezione 9): questo
 * handler delega al DocumentService, che a sua volta legge dalle colonne
 * cache word_count/char_count di document_nodes (ricalcolate ad ogni update
 * del contenuto). Nessuna tabella statistics dedicata: se in futuro serve
 * una vera cache materializzata, si aggiunge senza toccare questa interfaccia.
 */
export function registerStatisticsIpc(
  documentService: DocumentService,
  projectService: ProjectService
): void {
  ipcMain.handle(IpcChannels.statistics.get, (_e, { projectId }: { projectId: string }) => {
    const totals = documentService.projectStatistics(projectId)
    const chapters = documentService.chapterBreakdown(projectId)
    const project = projectService.findById(projectId) as any

    const createdAt = project?.created_at ? new Date(project.created_at) : null
    const daysSinceCreation = createdAt
      ? Math.max(1, Math.ceil((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)))
      : null
    const avgWordsPerDay =
      daysSinceCreation && daysSinceCreation > 0
        ? Math.round(totals.totalWords / daysSinceCreation)
        : null

    return {
      ...totals,
      chapters,
      projectCreatedAt: project?.created_at ?? null,
      daysSinceCreation,
      avgWordsPerDay
    }
  })

  // v0.3.5 — scheda Statistiche > Analisi: parole/caratteri/frasi/paragrafi/
  // dimensioni editoriali/parole chiave, totali e per capitolo.
  ipcMain.handle(IpcChannels.statistics.getAnalysis, (_e, { projectId }: { projectId: string }) => {
    return documentService.analysis(projectId)
  })
}
