import { useEffect, useState } from 'react'
import type { AppSettings, ToolbarTool } from '@shared/schemas/settings.schema'

export interface EditorPreferences {
  fontSize: 'small' | 'medium' | 'large'
  spellcheck: boolean
  toolbarTools: ToolbarTool[]
  tagsEnabled: boolean
  commentsEnabled: boolean
  revisionsEnabled: boolean
  /** v0.3.9: colore di sfondo/testo dell'editor per il tema ATTUALMENTE attivo (chiaro o scuro) — vedi Impostazioni > Editor. */
  editorBackground: string
  editorTextColor: string
}

/** v0.3.9: valori di default, identici a quelli finora fissi nel CSS (styles/index.css, regole .editor-surface/.prose) — non è un cambiamento visivo per chi non tocca queste impostazioni, solo la loro origine cambia (personalizzabile invece che fissa). */
export const DEFAULT_EDITOR_COLORS = {
  light: { background: '#f1efe8', text: '#374151' },
  dark: { background: '#1f1f22', text: '#e4e4e7' }
}

export const ALL_TOOLBAR_TOOLS: { id: ToolbarTool; label: string }[] = [
  {id:'zoom',label:'Zoom'}, {id:'undo',label:'Undo'}, {id:'redo',label:'Redo'}, {id:'heading',label:'Heading'},
  {id:'font',label:'Font'}, {id:'size',label:'Size'}, {id:'bold',label:'Grassetto'}, {id:'italic',label:'Corsivo'},
  {id:'underline',label:'Sottolineato'}, {id:'strike',label:'Barrato'}, {id:'color',label:'Colore'}, {id:'clearFormatting',label:'Cancella formattazione'},
  {id:'lists',label:'Liste / elenchi'}, {id:'alignment',label:'Allineamento'}, {id:'lineHeight',label:'Interlinea'}, {id:'dialogues',label:'Dialoghi'}, {id:'blockquote',label:'Citazione'},
  {id:'pageSeparator',label:'Separatore pagina'}, {id:'link',label:'Link'}, {id:'image',label:'Immagine'}, {id:'search',label:'Cerca'}
]

export const DEFAULT_TOOLBAR_TOOLS: ToolbarTool[] = ALL_TOOLBAR_TOOLS.map((x) => x.id)
const DEFAULTS: EditorPreferences = {
  fontSize: 'medium',
  spellcheck: true,
  toolbarTools: DEFAULT_TOOLBAR_TOOLS,
  tagsEnabled: true,
  commentsEnabled: true,
  revisionsEnabled: true,
  editorBackground: DEFAULT_EDITOR_COLORS.light.background,
  editorTextColor: DEFAULT_EDITOR_COLORS.light.text
}

function fromSettings(s: AppSettings): EditorPreferences {
  const isDark = s.theme === 'dark'
  const defaults = isDark ? DEFAULT_EDITOR_COLORS.dark : DEFAULT_EDITOR_COLORS.light
  return {
    fontSize: s.editor_font_size,
    spellcheck: !!s.spellcheck_enabled,
    toolbarTools: s.editor_toolbar_tools?.length ? s.editor_toolbar_tools : DEFAULT_TOOLBAR_TOOLS,
    tagsEnabled: s.tags_enabled === undefined ? true : !!s.tags_enabled,
    commentsEnabled: s.comments_enabled === undefined ? true : !!s.comments_enabled,
    revisionsEnabled: s.revisions_enabled === undefined ? true : !!s.revisions_enabled,
    editorBackground: (isDark ? s.editor_bg_dark : s.editor_bg_light) || defaults.background,
    editorTextColor: (isDark ? s.editor_text_dark : s.editor_text_light) || defaults.text
  }
}

/**
 * Reattivo ai cambi di impostazioni fatti mentre una scena è aperta (es.
 * disattivare i Tag da Impostazioni > Editor mentre si scrive): prima
 * leggeva le preferenze una sola volta al mount, quindi un cambiamento non
 * si vedeva finché non si cambiava scena o si riavviava l'app.
 */
export function useEditorPreferences(): EditorPreferences {
  const [prefs, setPrefs] = useState<EditorPreferences>(DEFAULTS)
  useEffect(() => {
    let cancelled = false
    window.mybook.settings.get().then((s: AppSettings) => {
      if (!cancelled) setPrefs(fromSettings(s))
    })
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail) setPrefs(fromSettings(detail))
    }
    window.addEventListener('mybook-settings-changed', handler)
    return () => {
      cancelled = true
      window.removeEventListener('mybook-settings-changed', handler)
    }
  }, [])
  return prefs
}
export const FONT_SIZE_CLASS: Record<EditorPreferences['fontSize'], string> = { small:'prose-sm', medium:'prose-base', large:'prose-lg' }
