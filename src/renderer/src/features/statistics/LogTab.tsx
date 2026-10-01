import { useEffect, useState } from 'react'
import type { ActivityLogEntry } from '@shared/ipc/channels'

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

function formatDateTime(iso: string): string {
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Scheda Statistiche > Log (v0.3.6): l'intero registro attività del
 * progetto attualmente aperto (fino al limite di ActivityLogService,
 * 300 voci — coerente con il tetto di conservazione di 1000 per progetto).
 * A differenza del recap all'apertura, qui la consultazione è esplicita:
 * la scheda resta visibile e consultabile anche se "Registra attività" è
 * stato disattivato nel frattempo (mostra comunque le voci già registrate).
 */
export default function LogTab({ projectId }: { projectId: string }): JSX.Element {
  const [entries, setEntries] = useState<ActivityLogEntry[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    window.mybook.activityLog.listForProject(projectId).then((rows: ActivityLogEntry[]) => {
      if (!cancelled) setEntries(rows)
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (entries === null) return <div className="text-sm text-gray-400">Caricamento…</div>
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400">Nessuna operazione ancora registrata per questo progetto.</p>
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700">
          <th className="py-2 pr-4 font-medium">Quando</th>
          <th className="py-2 pr-4 font-medium">Operazione</th>
          <th className="py-2 pr-4 font-medium">Tipo</th>
          <th className="py-2 font-medium">Nome</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id} className="border-b border-gray-100 dark:border-gray-800">
            <td className="whitespace-nowrap py-1.5 pr-4 text-xs text-gray-500">{formatDateTime(entry.created_at)}</td>
            <td className="py-1.5 pr-4">{ACTION_LABEL[entry.action] ?? entry.action}</td>
            <td className="py-1.5 pr-4 text-gray-500">{ENTITY_LABEL[entry.entity_type] ?? entry.entity_type}</td>
            <td className="py-1.5">
              {entry.entity_name}
              {entry.details && <span className="text-gray-400"> — {entry.details}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
