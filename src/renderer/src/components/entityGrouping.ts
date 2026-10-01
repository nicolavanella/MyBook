export interface GroupableItem {
  id: string
  name: string
  group_name?: string
}

export const UNGROUPED_KEY = '__ungrouped__'

export interface EntityGroup<T> {
  key: string
  label: string
  items: T[]
}

/** Filtra gli item per nome + testo libero fornito da `searchText`, case-insensitive. */
export function filterEntities<T extends GroupableItem>(items: T[], query: string, searchText: (item: T) => string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => `${item.name} ${searchText(item)}`.toLowerCase().includes(q))
}

/**
 * Raggruppa gli item per `group_name`: gruppi con nome in ordine alfabetico,
 * "Senza gruppo" (item senza group_name, o con spazi vuoti) sempre in fondo.
 */
export function groupEntities<T extends GroupableItem>(items: T[]): EntityGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = item.group_name?.trim() || UNGROUPED_KEY
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  const named = [...map.keys()].filter((k) => k !== UNGROUPED_KEY).sort((a, b) => a.localeCompare(b))
  const ordered = map.has(UNGROUPED_KEY) ? [...named, UNGROUPED_KEY] : named
  return ordered.map((key) => ({ key, label: key === UNGROUPED_KEY ? 'Senza gruppo' : key, items: map.get(key)! }))
}
