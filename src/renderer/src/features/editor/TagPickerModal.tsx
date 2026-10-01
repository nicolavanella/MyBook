import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { EntityTagType } from '@renderer/stores/useEntityNavigationStore'

const LABELS: Record<EntityTagType, string> = {
  character: 'Personaggio',
  location: 'Località',
  object: 'Oggetto',
  event: 'Evento'
}

interface PickerItem {
  id: string
  name: string
}

/**
 * Elenca le entità del tipo scelto (dal sottomenu "Aggiungi tag" del menu
 * contestuale nativo) e lascia sceglierne una da collegare al testo
 * selezionato. Gli eventi Timeline (che hanno `title` invece di `name`) sono
 * già normalizzati a `{id, name}` da chi chiama questo componente.
 */
export default function TagPickerModal({
  entityType,
  items,
  onSelect,
  onClose
}: {
  entityType: EntityTagType
  items: PickerItem[]
  onSelect: (item: PickerItem) => void
  onClose: () => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items
  }, [items, query])

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-24" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg bg-white shadow-xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-100 p-3 dark:border-gray-700">
          <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">Tag: {LABELS[entityType]}</div>
          <div className="flex items-center gap-1.5 rounded border border-gray-300 px-2 py-1 dark:border-gray-600">
            <Search size={13} className="shrink-0 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca…"
              spellCheck={false}
              data-search-input
              className="w-full min-w-0 bg-transparent text-sm outline-none dark:text-gray-100"
            />
          </div>
        </div>
        <ul className="max-h-72 overflow-auto p-1">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400">Nessun elemento trovato.</li>
          )}
          {filtered.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onSelect(item)}
                className="block w-full truncate rounded px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
