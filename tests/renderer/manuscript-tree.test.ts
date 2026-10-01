import { describe, it, expect } from 'vitest'
import { getRootItems, getChaptersOfGroup, getScenesOfChapter } from '@shared/manuscriptTree'

const TREE = [
  { id: 'g1', parent_id: null, node_type: 'group', order_index: 1 },
  { id: 'ch1', parent_id: null, node_type: 'chapter', order_index: 0 },
  { id: 'ch2', parent_id: 'g1', node_type: 'chapter', order_index: 0 },
  { id: 'ch3', parent_id: 'g1', node_type: 'chapter', order_index: 1 },
  { id: 'sc1', parent_id: 'ch1', node_type: 'scene', order_index: 1 },
  { id: 'sc2', parent_id: 'ch1', node_type: 'scene', order_index: 0 }
]

describe('getRootItems', () => {
  it('unisce gruppi e capitoli senza gruppo nello stesso ordine (order_index condiviso)', () => {
    expect(getRootItems(TREE).map((n) => n.id)).toEqual(['ch1', 'g1'])
  })

  it('esclude scene e capitoli dentro un gruppo', () => {
    const ids = getRootItems(TREE).map((n) => n.id)
    expect(ids).not.toContain('ch2')
    expect(ids).not.toContain('sc1')
  })
})

describe('getChaptersOfGroup', () => {
  it('ritorna i capitoli di un gruppo in ordine', () => {
    expect(getChaptersOfGroup(TREE, 'g1').map((n) => n.id)).toEqual(['ch2', 'ch3'])
  })

  it('ritorna un array vuoto per un gruppo senza capitoli', () => {
    expect(getChaptersOfGroup(TREE, 'inesistente')).toEqual([])
  })
})

describe('getScenesOfChapter', () => {
  it('ritorna le scene di un capitolo ordinate per order_index, non per ordine di inserimento', () => {
    expect(getScenesOfChapter(TREE, 'ch1').map((n) => n.id)).toEqual(['sc2', 'sc1'])
  })
})
