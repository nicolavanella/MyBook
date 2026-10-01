import { z } from 'zod'

export const ListCommentsInput = z.object({ documentNodeId: z.string().uuid() })
export const CreateCommentInput = z.object({
  documentNodeId: z.string().uuid(),
  markId: z.string().uuid(),
  text: z.string().trim().min(1)
})
export const DeleteCommentInput = z.object({ id: z.string().uuid() })
export const UpdateCommentInput = z.object({ id: z.string().uuid(), text: z.string().trim().min(1) })
