import { useEffect, useRef } from 'react'
import type { ProjectActivityRecap } from '@shared/ipc/channels'

const ACTION_LABEL: Record<string, string> = { created: 'Creato', updated: 'Modificato', deleted: 'Eliminato', moved: 'Spostato' }
const ENTITY_LABEL: Record<string, string> = {
  scene: 'Scena',
  chapter: 'Capitolo',
  group: 'Gruppo',
  character: 'Personaggio',
  location: 'Località',
  object: 'Oggetto',
  timeline: 'Timeline',
  timeline_event: 'Evento (Timeline)',
  mindmap: 'Mappa concettuale',
  mindmap_node: 'Nodo (Mappa concettuale)',
  mindmap_edge: 'Collegamento (Mappa concettuale)'
}

/**
 * Recap mostrato all'apertura di un progetto (v0.3.5, poi v0.3.7): le
 * ultime operazioni registrate e l'eventuale nota "To Do" lasciata alla
 * chiusura precedente.
 *
 * v0.3.9: il pulsante "Ho capito" prende il focus non appena la modale
 * compare (Invio lo attiva "gratis": è il comportamento nativo di un
 * <button> focalizzato) ed Esc la chiude comunque, anche senza passare dal
 * pulsante — coerente con le altre modali dell'app (es. ConfirmDialog).
 */
export default function StartupRecapModal({
  recap,
  onClose
}: {
  recap: ProjectActivityRecap[]
  onClose: () => void
}): JSX.Element {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Bentornato — da dove avevi lasciato</h2>
        <div className="space-y-4">
          {recap.map((project) => (
            <div key={project.projectId} className="rounded border border-gray-200 p-3 dark:border-gray-700">
              <div className="mb-1.5 text-sm font-medium">{project.projectTitle}</div>
              {project.todo && (
                <p className="mb-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                  <span className="font-semibold">To Do: </span>
                  {project.todo}
                </p>
              )}
              {project.entries.length > 0 && (
                <ul className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  {project.entries.map((entry) => (
                    <li key={entry.id}>
                      {ACTION_LABEL[entry.action] ?? entry.action} {ENTITY_LABEL[entry.entity_type] ?? entry.entity_type}
                      {entry.entity_name && <> «{entry.entity_name}»</>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
          >
            Ho capito
          </button>
        </div>
      </div>
    </div>
  )
}
