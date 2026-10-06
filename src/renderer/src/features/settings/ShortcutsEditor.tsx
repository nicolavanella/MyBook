import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import {
  SHORTCUT_ACTIONS,
  actionsOfTool,
  defaultShortcutOf,
  diffFromDefaults,
  eventToShortcut,
  findShortcutConflict,
  formatShortcut,
  resolveShortcuts,
  validateShortcut,
  type ShortcutActionId,
  type ShortcutOverrides,
  type ShortcutTool
} from '@shared/shortcuts'
import type { MessageKey, TranslationKey, TranslationParams } from '@shared/i18n'
import { useTranslation } from '@renderer/i18n/useTranslation'
import { IS_MAC } from '@renderer/lib/platform'

/**
 * Editor delle scorciatoie da tastiera (v0.4.0), nella scheda
 * Impostazioni > Editor > Strumenti toolbar.
 *
 * Interazione: si clicca su una scorciatoia e si preme la nuova combinazione
 * (Esc annulla, Backspace/Canc la rimuove). Una combinazione non utilizzabile
 * (senza Ctrl/Cmd/Alt, riservata al sistema) o già assegnata a un'altra
 * azione viene RIFIUTATA con un messaggio che dice perché: niente
 * sovrascritture silenziose.
 *
 * Il componente non salva nulla da solo: calcola le nuove personalizzazioni
 * (solo le differenze dai default, vedi diffFromDefaults) e le passa a `onChange`.
 */

/** Gruppi nell'ordine della toolbar. Il titolo del gruppo è l'etichetta dello strumento. */
const TOOL_ORDER: { tool: ShortcutTool; labelKey: TranslationKey }[] = [
  { tool: 'undo', labelKey: 'toolbar.tool.undo' },
  { tool: 'redo', labelKey: 'toolbar.tool.redo' },
  { tool: 'zoom', labelKey: 'toolbar.tool.zoom' },
  { tool: 'heading', labelKey: 'toolbar.tool.heading' },
  { tool: 'bold', labelKey: 'toolbar.tool.bold' },
  { tool: 'italic', labelKey: 'toolbar.tool.italic' },
  { tool: 'underline', labelKey: 'toolbar.tool.underline' },
  { tool: 'strike', labelKey: 'toolbar.tool.strike' },
  { tool: 'clearFormatting', labelKey: 'toolbar.tool.clearFormatting' },
  { tool: 'lists', labelKey: 'toolbar.tool.lists' },
  { tool: 'alignment', labelKey: 'toolbar.tool.alignment' },
  { tool: 'dialogues', labelKey: 'toolbar.tool.dialogues' },
  { tool: 'blockquote', labelKey: 'toolbar.tool.blockquote' },
  { tool: 'pageSeparator', labelKey: 'toolbar.tool.pageSeparator' },
  { tool: 'link', labelKey: 'toolbar.tool.link' },
  { tool: 'image', labelKey: 'toolbar.tool.image' },
  { tool: 'search', labelKey: 'toolbar.tool.search' }
]

/** Etichetta di ogni azione: chiave (e parametri) riusando i testi già presenti nella toolbar. */
const ACTION_LABEL: Record<ShortcutActionId, { key: MessageKey; params?: TranslationParams }> = {
  undo: { key: 'toolbar.tool.undo' },
  redo: { key: 'toolbar.tool.redo' },
  zoomIn: { key: 'toolbar.zoomIn' },
  zoomOut: { key: 'toolbar.zoomOut' },
  zoomReset: { key: 'toolbar.zoomReset' },
  paragraph: { key: 'toolbar.paragraph' },
  heading1: { key: 'toolbar.headingLevel', params: { level: 1 } },
  heading2: { key: 'toolbar.headingLevel', params: { level: 2 } },
  heading3: { key: 'toolbar.headingLevel', params: { level: 3 } },
  bold: { key: 'toolbar.tool.bold' },
  italic: { key: 'toolbar.tool.italic' },
  underline: { key: 'toolbar.tool.underline' },
  strike: { key: 'toolbar.tool.strike' },
  clearFormatting: { key: 'toolbar.tool.clearFormatting' },
  bulletList: { key: 'toolbar.bulletList' },
  orderedList: { key: 'toolbar.orderedList' },
  alignLeft: { key: 'toolbar.alignLeft' },
  alignCenter: { key: 'toolbar.alignCenter' },
  alignRight: { key: 'toolbar.alignRight' },
  alignJustify: { key: 'toolbar.alignJustify' },
  dialogueGuillemets: { key: 'shortcuts.action.dialogueGuillemets' },
  dialogueQuotes: { key: 'shortcuts.action.dialogueQuotes' },
  dialogueDash: { key: 'shortcuts.action.dialogueDash' },
  blockquote: { key: 'toolbar.tool.blockquote' },
  pageSeparator: { key: 'toolbar.tool.pageSeparator' },
  link: { key: 'toolbar.tool.link' },
  image: { key: 'toolbar.tool.image' },
  find: { key: 'toolbar.tool.search' },
  replace: { key: 'find.replace' }
}

export default function ShortcutsEditor({
  overrides,
  onChange
}: {
  /** Personalizzazioni salvate ({azione: combinazione}). */
  overrides: ShortcutOverrides
  /** Nuove personalizzazioni (solo differenze dai default). */
  onChange: (next: ShortcutOverrides) => void
}): JSX.Element {
  const { t } = useTranslation()
  const resolved = resolveShortcuts(overrides)
  const [capturing, setCapturing] = useState<ShortcutActionId | null>(null)
  const [error, setError] = useState<{ id: ShortcutActionId; message: string } | null>(null)

  const labelOf = (id: ShortcutActionId): string => t(ACTION_LABEL[id].key, ACTION_LABEL[id].params)

  const commit = (id: ShortcutActionId, value: string) => {
    onChange(diffFromDefaults({ ...resolved, [id]: value }))
    setCapturing(null)
    setError(null)
  }

  /** Controlli comuni a "nuova combinazione" e "ripristina default": rifiuta con un messaggio chiaro, oppure salva. */
  const tryAssign = (id: ShortcutActionId, candidate: string) => {
    if (candidate === '') return commit(id, '')
    const checked = validateShortcut(candidate)
    if (!checked.ok) {
      const key =
        checked.reason === 'needsModifier'
          ? 'shortcuts.needsModifier'
          : checked.reason === 'reserved'
            ? 'shortcuts.reserved'
            : 'shortcuts.invalid'
      setError({ id, message: t(key) })
      return
    }
    const conflict = findShortcutConflict(resolved, id, checked.shortcut)
    if (conflict) {
      setError({ id, message: t('shortcuts.conflict', { action: labelOf(conflict) }) })
      return
    }
    commit(id, checked.shortcut)
  }

  // Durante la cattura si ascolta la tastiera a livello di documento, in fase di cattura, per fermare ogni tasto
  // (altrimenti Ctrl+S, Tab… farebbero altro mentre l'utente sta registrando la combinazione).
  useEffect(() => {
    if (!capturing) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(null)
        setError(null)
        return
      }
      const bare = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
      if (bare && (e.key === 'Backspace' || e.key === 'Delete')) return tryAssign(capturing, '')
      const combo = eventToShortcut(e, IS_MAC)
      if (!combo) return // solo modificatori finora: si attende il tasto vero e proprio
      tryAssign(capturing, combo)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, resolved])

  const row = (id: ShortcutActionId, showLabel: boolean) => {
    const value = resolved[id]
    const isDefault = value === defaultShortcutOf(id)
    const isCapturing = capturing === id
    return (
      <div key={id} className="py-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">{showLabel ? labelOf(id) : ''}</span>
          <button
            type="button"
            onClick={() => {
              setError(null)
              setCapturing(isCapturing ? null : id)
            }}
            onBlur={() => isCapturing && setCapturing(null)}
            aria-label={labelOf(id)}
            className={`min-w-[9rem] rounded border px-2 py-1 text-center font-mono text-xs ${
              isCapturing
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600'
            }`}
          >
            {isCapturing ? t('shortcuts.pressKeys') : formatShortcut(value, IS_MAC) || t('shortcuts.none')}
          </button>
          <button
            type="button"
            // onMouseDown: senza, il blur del campo in cattura annullerebbe la cattura prima del click.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => tryAssign(id, defaultShortcutOf(id))}
            disabled={isDefault}
            title={t('shortcuts.resetOne')}
            className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:invisible dark:hover:text-gray-200"
          >
            <RotateCcw size={13} />
          </button>
        </div>
        {error?.id === id && <p className="mt-0.5 text-right text-xs text-red-600 dark:text-red-400">{error.message}</p>}
      </div>
    )
  }

  const customCount = Object.keys(diffFromDefaults(resolved)).length

  return (
    <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-700">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('shortcuts.title')}</h3>
        <button
          type="button"
          onClick={() => {
            setCapturing(null)
            setError(null)
            onChange({})
          }}
          disabled={customCount === 0}
          className="text-xs font-medium text-blue-600 hover:underline disabled:invisible dark:text-blue-400"
        >
          {t('shortcuts.resetAll')}
        </button>
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t('shortcuts.hint')}</p>

      <div className="grid gap-x-8 md:grid-cols-2">
        {TOOL_ORDER.filter(({ tool }) => actionsOfTool(tool).length > 0).map(({ tool, labelKey }) => {
          const ids = actionsOfTool(tool)
          const single = ids.length === 1
          return (
            <div key={tool} className="border-b border-gray-100 py-1.5 dark:border-gray-700/60">
              {/* Strumenti con più azioni: titolo del gruppo e una riga per azione. Con una sola azione basta la riga. */}
              {single ? (
                row(ids[0], true)
              ) : (
                <>
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{t(labelKey)}</div>
                  {ids.map((id) => row(id, true))}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Verifica di consistenza usata dai test: ogni azione del catalogo compare in un gruppo mostrato nelle Impostazioni. */
export const SHORTCUT_TOOLS_SHOWN: readonly ShortcutTool[] = TOOL_ORDER.map((g) => g.tool)
export const SHORTCUT_ACTIONS_LABELLED: readonly ShortcutActionId[] = SHORTCUT_ACTIONS.map((a) => a.id).filter(
  (id): id is ShortcutActionId => id in ACTION_LABEL
)
