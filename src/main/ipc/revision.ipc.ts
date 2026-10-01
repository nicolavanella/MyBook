import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc/channels'
import { CreateRevisionInput, RestoreRevisionInput } from '@shared/schemas/document.schema'
import { RevisionCompareInput, Uuid } from '@shared/schemas/domain.schema'
import type { DocumentService } from '../services/document.service'

export function registerRevisionIpc(service: DocumentService): void {
  ipcMain.handle(IpcChannels.revisions.list, (_e, raw: unknown) => {
    const input = Uuid.parse((raw as any)?.documentNodeId)
    return service.listRevisions(input)
  })
  ipcMain.handle(IpcChannels.revisions.create, (_e, raw: unknown) => { const i=CreateRevisionInput.parse(raw); return service.createRevision(i.documentNodeId,i.reason) })
  ipcMain.handle(IpcChannels.revisions.restore, (_e, raw: unknown) => service.restoreRevision(RestoreRevisionInput.parse(raw).revisionId))
  ipcMain.handle(IpcChannels.revisions.compare, (_e, raw: unknown) => { const i=RevisionCompareInput.parse(raw); return service.compareRevisions(i.revisionIdA,i.revisionIdB) })
}
