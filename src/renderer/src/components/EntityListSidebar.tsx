import { useMemo, useState } from 'react'
import { Search, ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { titleIfTruncated } from '@renderer/lib/truncationTitle'
import { filterEntities, groupEntities, UNGROUPED_KEY, type GroupableItem } from './entityGrouping'

export interface EntityListItem extends GroupableItem {
  color?: string
}

/**
 * Sidebar condivisa da Personaggi, Località e Oggetti: le tre pagine erano
 * quasi identiche, questo componente ne raccoglie la parte in comune —
 * ricerca, raggruppamento collassabile, pallino colore, rinomina/elimina
 * gruppo. `searchText` estrae dall'item TUTTO il testo su cui la ricerca
 * deve corrispondere (non solo il nome).
 * La barra di ricerca è in fondo (come nell'albero del Manoscritto), non in
 * cima: il campo "aggiungi nuovo" resta invece in alto, dove l'utente se lo
 * aspetta quando vuole creare rapidamente un nuovo elemento.
 */
export default function EntityListSidebar<T extends EntityListItem>({
  items,
  selectedId,
  onSelect,
  newName,
  onNewNameChange,
  onAdd,
  addPlaceholder,
  searchText,
  onRenameGroup,
  onDeleteGroup
}: {
  items: T[]
  selectedId: string | null
  onSelect: (id: string) => void
  newName: string
  onNewNameChange: (v: string) => void
  onAdd: () => void
  addPlaceholder: string
  searchText: (item: T) => string
  /** Rinomina un gruppo: applica il nuovo nome a tutti gli elementi che ne fanno parte. */
  onRenameGroup: (oldName: string, newName: string) => void
  /** Elimina un gruppo: gli elementi al suo interno passano a "Senza gruppo" (non vengono eliminati). */
  onDeleteGroup: (name: string) => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null)

  const filtered = useMemo(() => filterEntities(items, query, searchText), [items, query, searchText])
  const groups = useMemo(() => groupEntities(filtered), [filtered])

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex shrink-0 gap-2">
        <input
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          placeholder={addPlaceholder}
          value={newName}
          onChange={(e) => onNewNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        />
        <button onClick={onAdd} className="rounded bg-blue-600 px-2 text-sm text-white">
          +
        </button>
      </div>

      <div className="min-w-0 flex-1 space-y-3 overflow-auto">
        {groups.length === 0 && <p className="px-1 text-xs text-gray-400">Nessun risultato.</p>}
        {groups.map((group) => {
          const isRealGroup = group.key !== UNGROUPED_KEY
          return (
            <div key={group.key}>
              {/* La sezione "Senza gruppo" resta sempre visibile (nessuna intestazione collassabile) quando è l'unico gruppo, per non appesantire l'interfaccia in progetti senza raggruppamenti. */}
              {(groups.length > 1 || isRealGroup) &&
                (renamingGroup === group.key ? (
                  <input
                    autoFocus
                    defaultValue={group.label}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => {
                      const next = e.target.value.trim()
                      if (next && next !== group.label) onRenameGroup(group.label, next)
                      setRenamingGroup(null)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className="mb-1 w-full rounded border border-blue-400 px-1 py-0.5 text-xs"
                  />
                ) : (
                  <div className="group/hdr mb-1 flex items-center gap-1 px-1">
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="flex min-w-0 flex-1 items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-400 hover:text-gray-600"
                    >
                      {collapsedGroups.has(group.key) ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                      <span className="truncate">{group.label}</span>
                      <span className="shrink-0 font-normal normal-case text-gray-300">({group.items.length})</span>
                    </button>
                    {isRealGroup && (
                      <span className="flex shrink-0 gap-0.5 opacity-0 group-hover/hdr:opacity-100">
                        <button onClick={() => setRenamingGroup(group.key)} title="Rinomina gruppo" className="text-gray-300 hover:text-gray-600">
                          <Pencil size={11} />
                        </button>
                        <button onClick={() => onDeleteGroup(group.label)} title="Elimina gruppo" className="text-gray-300 hover:text-red-600">
                          <Trash2 size={11} />
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              {!collapsedGroups.has(group.key) && (
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => onSelect(item.id)}
                        className={`flex w-full items-center gap-2 truncate rounded px-2 py-1 text-left text-sm ${
                          selectedId === item.id ? 'bg-blue-100' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full border border-black/10"
                          style={{ backgroundColor: item.color || '#d1d5db' }}
                        />
                        {/* v0.3.4: nome completo al passaggio del mouse, solo se troncato. */}
                        <span className="min-w-0 truncate" onMouseEnter={(e) => titleIfTruncated(e.currentTarget, item.name)}>
                          {item.name}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-3 shrink-0 border-t border-gray-200 pt-2 dark:border-gray-700">
        <div className="flex min-w-0 items-center gap-1.5 rounded border border-gray-200 px-2 py-1 dark:border-gray-700">
          <Search size={13} className="shrink-0 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca…"
            spellCheck={false}
            data-search-input
            className="w-full min-w-0 bg-transparent text-xs outline-none"
          />
        </div>
      </div>
    </div>
  )
}
