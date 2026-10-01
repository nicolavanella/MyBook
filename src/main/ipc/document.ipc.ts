import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc/channels'
import {
  CreateDocumentNodeInput,
  UpdateDocumentNodeInput,
  DuplicateDocumentNodeInput
} from '@shared/schemas/document.schema'
import type { DocumentService } from '../services/document.service'
import type { ActivityLogService } from '../services/activity-log.service'
import type { ActivityLogEntry } from '@shared/ipc/channels'

/** Etichetta del registro attività (v0.3.5) per tipo di nodo del Manoscritto: prologo/epilogo sono trattati come "Capitolo", scena/sezione come "Scena". */
const NODE_ENTITY_TYPE: Record<string, ActivityLogEntry['entity_type']> = {
  chapter: 'chapter',
  prologue: 'chapter',
  epilogue: 'chapter',
  group: 'group',
  scene: 'scene',
  section: 'scene'
}

/** v0.3.8: al più una voce "Modificata" al giorno per scena (non una soglia a tempo fisso), generata dal solo salvataggio automatico del testo — vedi logOncePerDay. */

/**
 * L'IPC espone operazioni di dominio (documents.create, documents.update,
 * documents.move...), mai query SQL generiche — sezione 8 del documento.
 * Ogni payload viene validato con Zod prima di raggiungere il service.
 */
export function registerDocumentIpc(service: DocumentService, activityLog: ActivityLogService): void {
  ipcMain.handle(IpcChannels.documents.tree, (_e, { projectId }: { projectId: string }) => {
    return service.getTree(projectId)
  })

  ipcMain.handle(IpcChannels.documents.create, (_e, raw: unknown) => {
    const input = CreateDocumentNodeInput.parse(raw)
    const node = service.create(input)
    if (node) activityLog.log(input.projectId, NODE_ENTITY_TYPE[node.node_type] ?? 'scene', 'created', node.title, '', node.id)
    return node
  })

  ipcMain.handle(IpcChannels.documents.update, (_e, raw: unknown) => {
    const input = UpdateDocumentNodeInput.parse(raw)
    const node = service.update(input)
    // v0.3.8: un cambio di campo "editoriale" (titolo, sottotitolo, stato...)
    // è un'azione deliberata e poco frequente, quindi si registra sempre e
    // subito. Il contenuto (content) invece viene salvato in autosave ad
    // ogni pausa di digitazione: si registra comunque (nessuna soglia
    // d'attesa: la primissima modifica del giorno viene loggata subito), ma
    // logOncePerDay evita di ripetere la voce ad ogni singolo autosave dello
    // stesso giorno. Le due cose possono capitare nella stessa chiamata (es.
    // si cambia lo stato mentre si scrive): in quel caso vale solo la voce
    // immediata, non due.
    if (node) {
      const changedFields = Object.keys(input.fields)
      // v0.3.9: cursor_position non è mai una "modifica" nel senso del
      // registro attività (cambia in continuazione muovendo il cursore, non
      // è un'azione deliberata dell'utente): va ignorata sia per la voce
      // immediata (titolo/stato...) sia per quella throttled del contenuto.
      const hasEditorialFieldChange = changedFields.some((key) => key !== 'content' && key !== 'cursor_position')
      const entityType = NODE_ENTITY_TYPE[node.node_type] ?? 'scene'
      if (hasEditorialFieldChange) {
        activityLog.log(node.project_id, entityType, 'updated', node.title, '', node.id)
      } else if (changedFields.includes('content')) {
        activityLog.logOncePerDay(node.project_id, entityType, 'updated', node.title, node.id)
      }
    }
    return node
  })

  ipcMain.handle(
    IpcChannels.documents.move,
    (_e, { id, newParentId, newOrderIndex }: { id: string; newParentId: string | null; newOrderIndex: number }) => {
      return service.move(id, newParentId, newOrderIndex)
    }
  )

  ipcMain.handle(
    IpcChannels.documents.reorder,
    (
      _e,
      {
        orderedIds,
        movedNodeId,
        newParentId
      }: { orderedIds: string[]; movedNodeId?: string; newParentId?: string | null }
    ) => {
      // Un riordino "puro" (drag&drop entro lo stesso genitore) non passa
      // movedNodeId: qui non c'è nulla da registrare, è lo spostamento tra
      // genitori diversi (movedNodeId presente) a essere uno "spostamento"
      // nel senso inteso dal registro attività.
      const movedBefore = movedNodeId ? service.get(movedNodeId) : undefined
      service.reorder(orderedIds, movedNodeId, newParentId)
      if (movedBefore) {
        const destination = newParentId ? service.get(newParentId)?.title : undefined
        activityLog.log(
          movedBefore.project_id,
          NODE_ENTITY_TYPE[movedBefore.node_type] ?? 'scene',
          'moved',
          movedBefore.title,
          destination ? `verso "${destination}"` : 'verso il livello principale',
          movedBefore.id
        )
      }
      return { ok: true }
    }
  )

  ipcMain.handle(IpcChannels.documents.delete, (_e, { id }: { id: string }) => {
    // Il nodo va letto PRIMA di eliminarlo: dopo la delete titolo/tipo non sarebbero più recuperabili.
    const node = service.get(id)
    service.delete(id)
    if (node) activityLog.log(node.project_id, NODE_ENTITY_TYPE[node.node_type] ?? 'scene', 'deleted', node.title, '', node.id)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.documents.duplicate, (_e, raw: unknown) => {
    const input = DuplicateDocumentNodeInput.parse(raw)
    const node = service.duplicate(input.id)
    if (node) activityLog.log(node.project_id, NODE_ENTITY_TYPE[node.node_type] ?? 'scene', 'created', node.title, '', node.id)
    return node
  })

  ipcMain.handle(
    IpcChannels.documents.entityTagUsages,
    (_e, { projectId, entityType, entityId }: { projectId: string; entityType: string; entityId: string }) => {
      return service.findEntityTagUsages(projectId, entityType, entityId)
    }
  )
}
