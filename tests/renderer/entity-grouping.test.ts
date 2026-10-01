import { describe, it, expect } from 'vitest'
import { filterEntities, groupEntities } from '@renderer/components/entityGrouping'

interface Item {
  id: string
  name: string
  group_name?: string
  description?: string
}

const ITEMS: Item[] = [
  { id: '1', name: 'Aria', group_name: 'Protagonisti', description: 'Una guerriera coraggiosa' },
  { id: '2', name: 'Bran', group_name: 'Antagonisti', description: 'Un signore oscuro' },
  { id: '3', name: 'Cira', group_name: 'Protagonisti', description: 'Amica di Aria' },
  { id: '4', name: 'Doran', description: 'Senza gruppo assegnato' }
]

describe('filterEntities', () => {
  it('ritorna tutti gli item con query vuota', () => {
    expect(filterEntities(ITEMS, '', (i) => i.description ?? '')).toHaveLength(4)
  })

  it('filtra per nome, case-insensitive', () => {
    const result = filterEntities(ITEMS, 'bran', (i) => i.description ?? '')
    expect(result.map((i) => i.id)).toEqual(['2'])
  })

  it('filtra anche per il contenuto di altri campi (searchText), non solo il nome', () => {
    const result = filterEntities(ITEMS, 'oscuro', (i) => i.description ?? '')
    expect(result.map((i) => i.id)).toEqual(['2'])
  })

  it('nessun risultato per un termine assente ovunque', () => {
    expect(filterEntities(ITEMS, 'introvabile', (i) => i.description ?? '')).toHaveLength(0)
  })
})

describe('groupEntities', () => {
  it('raggruppa per group_name, ordine alfabetico dei gruppi', () => {
    const groups = groupEntities(ITEMS)
    const namedGroups = groups.filter((g) => g.label !== 'Senza gruppo')
    expect(namedGroups.map((g) => g.label)).toEqual(['Antagonisti', 'Protagonisti'])
  })

  it('mette insieme tutti gli item dello stesso gruppo', () => {
    const groups = groupEntities(ITEMS)
    const protagonisti = groups.find((g) => g.label === 'Protagonisti')
    expect(protagonisti?.items.map((i) => i.name)).toEqual(['Aria', 'Cira'])
  })

  it('gli item senza gruppo finiscono in "Senza gruppo", sempre per ultimo', () => {
    const groups = groupEntities(ITEMS)
    expect(groups[groups.length - 1].label).toBe('Senza gruppo')
    expect(groups[groups.length - 1].items.map((i) => i.name)).toEqual(['Doran'])
  })

  it('nessun gruppo "Senza gruppo" se tutti gli item hanno un group_name', () => {
    const groups = groupEntities(ITEMS.filter((i) => i.group_name))
    expect(groups.some((g) => g.label === 'Senza gruppo')).toBe(false)
  })
})
