import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc/channels'
import { ListCommentsInput, CreateCommentInput, UpdateCommentInput, DeleteCommentInput } from '@shared/schemas/comment.schema'
import type { CommentRepository } from '../database/repositories/comment.repository'

export function registerCommentIpc(repo: CommentRepository): void {
  ipcMain.handle(IpcChannels.comments.list, (_e, raw: unknown) => {
    const input = ListCommentsInput.parse(raw)
    return repo.list(input.documentNodeId)
  })

  ipcMain.handle(IpcChannels.comments.create, (_e, raw: unknown) => {
    const input = CreateCommentInput.parse(raw)
    return repo.create(input.documentNodeId, input.markId, input.text)
  })

  ipcMain.handle(IpcChannels.comments.update, (_e, raw: unknown) => {
    const input = UpdateCommentInput.parse(raw)
    return repo.update(input.id, input.text)
  })

  ipcMain.handle(IpcChannels.comments.delete, (_e, raw: unknown) => {
    const input = DeleteCommentInput.parse(raw)
    repo.delete(input.id)
    return { ok: true }
  })
}
