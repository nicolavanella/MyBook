/**
 * MyBook — gestore di tastiera configurabile dell'editor (v0.4.0).
 *
 * Funzionamento: un plugin ProseMirror con PRIORITÀ ALTA intercetta ogni
 * pressione di tasto PRIMA delle scorciatoie native di TipTap/StarterKit.
 *   1. se la combinazione è assegnata a un'azione → la esegue;
 *   2. se è una scorciatoia che l'editor gestiva "di suo" (Ctrl+B…) e ora non è
 *      più assegnata a nulla → la inghiotte, altrimenti spostare o togliere
 *      "Grassetto" lascerebbe Ctrl+B ancora attivo tramite TipTap;
 *   3. altrimenti non fa nulla e l'evento prosegue normalmente.
 *
 * Perché non disattivare le scorciatoie di ogni singola estensione: sono
 * incorporate in StarterKit e andrebbero riscritte una per una (e riscritte
 * a ogni aggiornamento di TipTap). Intercettare in anticipo è un punto solo.
 *
 * La tabella delle scorciatoie vive nello `storage` dell'estensione e viene
 * sostituita a caldo da `configureShortcuts` quando l'utente cambia le
 * impostazioni: l'editor non va ricreato (andrebbe perso cursore e annulla).
 */
import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import {
  VIEW_ONLY_ACTIONS,
  buildShortcutLookup,
  eventToShortcut,
  resolveShortcuts,
  type KeyEventLike,
  type ResolvedShortcuts,
  type ShortcutActionId,
  type ShortcutLookup
} from '@shared/shortcuts'

export interface ShortcutRuntime {
  lookup: ShortcutLookup
  isMac: boolean
  run: (action: ShortcutActionId) => void
}

export interface KeyDecision {
  /** true = l'evento è stato consumato (va bloccato il comportamento predefinito). */
  handled: boolean
  /** azione da eseguire, se la combinazione ne ha una. */
  action?: ShortcutActionId
}

/**
 * Decisione pura (testabile senza editor) per una pressione di tasto.
 * Con l'editor non modificabile (scena "Finito") le azioni che cambiano il
 * testo vengono consumate ma NON eseguite; ricerca e zoom restano attivi.
 */
export function decideKeyDown(
  runtime: Pick<ShortcutRuntime, 'lookup' | 'isMac'>,
  event: KeyEventLike,
  editable: boolean
): KeyDecision {
  const combo = eventToShortcut(event, runtime.isMac)
  if (!combo) return { handled: false }
  const action = runtime.lookup.actions.get(combo)
  if (action) {
    if (!editable && !VIEW_ONLY_ACTIONS.has(action)) return { handled: true }
    return { handled: true, action }
  }
  if (runtime.lookup.suppressed.has(combo)) return { handled: true }
  return { handled: false }
}

export const ConfigurableShortcuts = Extension.create<Record<string, never>, ShortcutRuntime>({
  name: 'configurableShortcuts',
  priority: 1000, // più alta di StarterKit (100): il nostro plugin vede l'evento per primo
  addStorage() {
    return { lookup: buildShortcutLookup(resolveShortcuts()), isMac: false, run: () => undefined }
  },
  addProseMirrorPlugins() {
    // `storage` è un oggetto condiviso: configureShortcuts lo AGGIORNA sul posto (non lo sostituisce).
    const storage = this.storage
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('configurableShortcuts'),
        props: {
          handleKeyDown: (_view, event) => {
            const decision = decideKeyDown(storage, event, editor.isEditable)
            if (decision.action) {
              event.preventDefault()
              storage.run(decision.action)
            }
            return decision.handled
          }
        }
      })
    ]
  }
})

/** Aggiorna a caldo le scorciatoie dell'editor (chiamata da SceneEditor quando cambiano le impostazioni). */
export function configureShortcuts(
  editor: Editor,
  resolved: ResolvedShortcuts,
  isMac: boolean,
  run: (action: ShortcutActionId) => void
): void {
  const storage = editor.storage.configurableShortcuts as ShortcutRuntime | undefined
  if (!storage) return
  storage.lookup = buildShortcutLookup(resolved)
  storage.isMac = isMac
  storage.run = run
}
