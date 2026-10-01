import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { canShowTagPanel } from '@renderer/lib/responsivePanel'
import type { EntityTagUsage } from '@shared/ipc/channels'

/**
 * Pannello "Dove compare" (v0.3.6, reso responsive in v0.3.7), mostrato a
 * destra della scheda di un personaggio/località/oggetto: elenco di
 * Capitoli e Scene in cui l'entità è taggata nel testo del Manoscritto.
 * Cliccando una riga si apre quella scena nel Manoscritto, con il cursore
 * posizionato esattamente sull'occorrenza del tag (vedi SceneEditor.tsx,
 * gestione di useProjectStore.pendingTagJump).
 *
 * v0.3.7 — due comportamenti distinti, da non confondere:
 *  - sotto TAG_PANEL_MIN_WINDOW_WIDTH il pannello si nasconde DEL TUTTO
 *    (nessuna striscia, nessun pulsante): non c'è spazio nemmeno per una
 *    barra ridotta accanto a sidebar + elenco + scheda;
 *  - quando la finestra è abbastanza larga, un pulsante permette comunque
 *    di collassarlo manualmente (a una sottile striscia con solo l'icona
 *    per riaprirlo) se l'utente preferisce più spazio per la scheda, anche
 *    senza restringere la finestra.
 * Lo stato di collasso è locale al componente (si resetta cambiando scheda
 * o riavviando l'app): non c'è una richiesta di persistenza, e persisterlo
 * per-entità aggiungerebbe complessità sproporzionata al beneficio.
 */
export default function EntityTagUsagePanel({
  entityType,
  entityId
}: {
  entityType: 'character' | 'location' | 'object'
  entityId: string
}): JSX.Element | null {
  const { activeProjectId, setActiveNode, setPendingTagJump } = useProjectStore()
  const navigate = useNavigate()
  const [usages, setUsages] = useState<EntityTagUsage[] | null>(null)
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const onResize = (): void => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!activeProjectId || !entityId) return
    let cancelled = false
    setUsages(null)
    window.mybook.documents.entityTagUsages(activeProjectId, entityType, entityId).then((rows: EntityTagUsage[]) => {
      if (!cancelled) setUsages(rows)
    })
    return () => {
      cancelled = true
    }
  }, [activeProjectId, entityType, entityId])

  const goTo = (usage: EntityTagUsage): void => {
    setPendingTagJump({ entityType, entityId, occurrenceIndex: usage.occurrenceIndex })
    setActiveNode(usage.sceneId)
    navigate('/')
  }

  if (!canShowTagPanel(windowWidth)) return null

  if (collapsed) {
    return (
      <div className="flex w-8 shrink-0 items-start justify-center border-l border-gray-200 pt-3 dark:border-gray-700">
        <button
          onClick={() => setCollapsed(false)}
          title="Espandi il pannello «Dove compare»"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
        >
          <PanelRightOpen size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="w-64 shrink-0 border-l border-gray-200 p-3 dark:border-gray-700">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <MapPin size={13} /> Dove compare
        </h3>
        <button
          onClick={() => setCollapsed(true)}
          title="Collassa il pannello"
          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
        >
          <PanelRightClose size={15} />
        </button>
      </div>
      {usages === null ? (
        <p className="text-xs text-gray-400">Ricerca in corso…</p>
      ) : usages.length === 0 ? (
        <p className="text-xs text-gray-400">Nessun tag ancora inserito nel Manoscritto per questa scheda.</p>
      ) : (
        <ul className="space-y-2">
          {usages.map((usage) => (
            <li key={`${usage.sceneId}:${usage.occurrenceIndex}`}>
              <button
                onClick={() => goTo(usage)}
                className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                title={`Vai a "${usage.sceneTitle}"`}
              >
                <div className="truncate text-gray-500 dark:text-gray-400">{usage.chapterTitle}</div>
                <div className="truncate font-medium text-gray-800 dark:text-gray-200">{usage.sceneTitle}</div>
                <div className="truncate italic text-gray-400">"{usage.snippet}"</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
