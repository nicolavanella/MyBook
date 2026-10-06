import { z } from 'zod'

/** v0.4.0: lingua in cui è scritto il libro (vedi migrazione 024). Distinta dalla lingua dell'interfaccia. */
export const BookLanguageSchema = z.enum(['it', 'en'])

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  author: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  description: z.string().optional(), // sezione "Struttura"
  notes: z.string().optional(), // sezione "Struttura"
  plot: z.string().optional(), // "Trama", sezione "Narrazione"
  fabula: z.string().optional(), // "Fabula", sezione "Narrazione"
  book_language: BookLanguageSchema.optional(),
  created_at: z.string(),
  updated_at: z.string()
})
export type Project = z.infer<typeof ProjectSchema>

export const CreateProjectInput = z.object({
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  author: z.string().optional(),
  year: z.number().int().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  plot: z.string().optional(),
  fabula: z.string().optional(),
  book_language: BookLanguageSchema.optional()
})
export type CreateProjectInput = z.infer<typeof CreateProjectInput>

export const UpdateProjectInput = z.object({
  id: z.string().uuid(),
  fields: z
    .object({
      title: z.string().min(1).optional(),
      subtitle: z.string().optional(),
      author: z.string().nullable().optional(),
      year: z.number().int().nullable().optional(),
      description: z.string().optional(),
      notes: z.string().optional(),
      plot: z.string().optional(),
      fabula: z.string().optional(),
      book_language: BookLanguageSchema.optional()
    })
    .partial()
})
export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>

export const NodeType = z.enum(['chapter', 'scene', 'section', 'prologue', 'epilogue', 'group'])
export type NodeType = z.infer<typeof NodeType>

export const NodeStatus = z.enum(['idea', 'bozza', 'revisione', 'completo'])
export type NodeStatus = z.infer<typeof NodeStatus>

export const DocumentNodeSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable(),
  node_type: NodeType,
  title: z.string(),
  subtitle: z.string(),
  description: z.string(),
  notes: z.string(),
  status: NodeStatus,
  order_index: z.number().int(),
  content: z.string(), // TipTap JSON serializzato
  word_count: z.number().int(),
  char_count: z.number().int(),
  // v0.3.9: posizione del cursore nell'ultimo salvataggio, per riaprire la scena esattamente dove si era interrotta la scrittura.
  cursor_position: z.number().int().default(0),
  created_at: z.string(),
  updated_at: z.string()
})
export type DocumentNode = z.infer<typeof DocumentNodeSchema>

export const CreateDocumentNodeInput = z.object({
  projectId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  nodeType: NodeType,
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional()
})
export type CreateDocumentNodeInput = z.infer<typeof CreateDocumentNodeInput>

export const UpdateDocumentNodeInput = z.object({
  id: z.string().uuid(),
  fields: z
    .object({
      title: z.string().min(1).optional(),
      subtitle: z.string().optional(),
      description: z.string().optional(),
      notes: z.string().optional(),
      status: NodeStatus.optional(),
      order_index: z.number().int().optional(),
      parent_id: z.string().uuid().nullable().optional(),
      content: z.string().optional(), // TipTap JSON, se presente ricalcola le statistiche
      locked: z.boolean().optional(), // capitolo o gruppo: impedisce lo spostamento delle scene contenute
      // v0.3.9: salvata insieme al contenuto nello stesso autosave (mai da sola, e mai loggata nel registro attività: non è una modifica dell'utente).
      cursor_position: z.number().int().min(0).optional()
    })
    .partial()
})
export type UpdateDocumentNodeInput = z.infer<typeof UpdateDocumentNodeInput>

export const CreateRevisionInput = z.object({
  documentNodeId: z.string().uuid(),
  reason: z.enum(['autosave', 'manual', 'pause', 'close', 'restore']).default('manual')
})
export type CreateRevisionInput = z.infer<typeof CreateRevisionInput>

export const RestoreRevisionInput = z.object({
  revisionId: z.string().uuid()
})
export type RestoreRevisionInput = z.infer<typeof RestoreRevisionInput>

export const DuplicateDocumentNodeInput = z.object({
  id: z.string().uuid()
})
export type DuplicateDocumentNodeInput = z.infer<typeof DuplicateDocumentNodeInput>
