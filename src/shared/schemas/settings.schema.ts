import { z } from 'zod'

export const ToolbarTool = z.enum(['zoom','undo','redo','heading','font','size','bold','italic','underline','strike','color','clearFormatting','lists','alignment','lineHeight','dialogues','blockquote','pageSeparator','link','image','search'])
export type ToolbarTool = z.infer<typeof ToolbarTool>

export const BackupFrequency = z.enum(['off', 'onClose', '30min', '60min', '120min', '240min'])
export type BackupFrequency = z.infer<typeof BackupFrequency>

export const AppSettingsSchema = z.object({
  id: z.literal('singleton'),
  theme: z.enum(['light', 'dark']),
  language: z.string(),
  backup_enabled: z.number().int(), // SQLite non ha booleani nativi: 0/1
  backup_folder: z.string(),
  backup_frequency: BackupFrequency,
  backup_max_count: z.number().int(),
  editor_font_size: z.enum(['small', 'medium', 'large']),
  ui_font_size: z.enum(['small', 'medium', 'large']),
  spellcheck_enabled: z.number().int(),
  editor_toolbar_tools: z.array(ToolbarTool),
  // v0.3.9: colori dell'editor, per tema. Stringa vuota o assente = usa il default (vedi DEFAULT_EDITOR_COLORS nel renderer).
  editor_bg_light: z.string(),
  editor_text_light: z.string(),
  editor_bg_dark: z.string(),
  editor_text_dark: z.string(),
  sidebar_visible_tools: z.array(z.enum(['characters','locations','objects','timeline','mindmap','statistics'])),
  dictionary_file: z.string(),
  dictionary_languages: z.array(z.string()),
  tags_enabled: z.number().int(),
  comments_enabled: z.number().int(),
  revisions_enabled: z.number().int(),
  // v0.3.5: registro attività (Log) + recap all'avvio + richiesta "To Do" alla chiusura del progetto.
  activity_log_enabled: z.number().int(),
  updated_at: z.string()
})
export type AppSettings = z.infer<typeof AppSettingsSchema>

export const UpdateAppSettingsInput = z
  .object({
    theme: z.enum(['light', 'dark']).optional(),
    language: z.string().optional(),
    backup_enabled: z.boolean().optional(),
    backup_folder: z.string().optional(),
    backup_frequency: BackupFrequency.optional(),
    backup_max_count: z.number().int().min(1).max(999).optional(),
    editor_font_size: z.enum(['small', 'medium', 'large']).optional(),
    ui_font_size: z.enum(['small', 'medium', 'large']).optional(),
    spellcheck_enabled: z.boolean().optional(),
    editor_toolbar_tools: z.array(ToolbarTool).optional(),
    editor_bg_light: z.string().optional(),
    editor_text_light: z.string().optional(),
    editor_bg_dark: z.string().optional(),
    editor_text_dark: z.string().optional(),
    sidebar_visible_tools: z.array(z.enum(['characters','locations','objects','timeline','mindmap','statistics'])).optional(),
    dictionary_file: z.string().optional(),
    dictionary_languages: z.array(z.string()).optional(),
    tags_enabled: z.boolean().optional(),
    comments_enabled: z.boolean().optional(),
    revisions_enabled: z.boolean().optional(),
    activity_log_enabled: z.boolean().optional()
  })
  .partial()
export type UpdateAppSettingsInput = z.infer<typeof UpdateAppSettingsInput>
