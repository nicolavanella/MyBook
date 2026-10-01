import { describe, it, expect } from 'vitest'
import { resolveDragMove, ROOT_CONTAINER } from '@renderer/features/chapters/treeDnd'

describe('resolveDragMove', () => {
  it('riordina due capitoli nello stesso contenitore (radice)', () => {
    const result = resolveDragMove({
      activeId: 'ch1',
      overId: 'ch3',
      activeContainer: ROOT_CONTAINER,
      overContainer: ROOT_CONTAINER,
      isGroup: false,
      siblingsOf: () => ['ch1', 'ch2', 'ch3']
    })
    expect(result).toEqual({ type: 'reorder', orderedIds: ['ch2', 'ch3', 'ch1'] })
  })

  it('sposta un capitolo dalla radice dentro un gruppo', () => {
    const result = resolveDragMove({
      activeId: 'ch1',
      overId: 'ch5',
      activeContainer: ROOT_CONTAINER,
      overContainer: 'group1',
      isGroup: false,
      siblingsOf: (c) => (c === ROOT_CONTAINER ? ['ch1', 'group1'] : ['ch5', 'ch6'])
    })
    expect(result).toEqual({ type: 'move', orderedIds: ['ch1', 'ch5', 'ch6'], movedNodeId: 'ch1', newParentId: 'group1' })
  })

  it('sposta un capitolo fuori da un gruppo, verso la radice', () => {
    const result = resolveDragMove({
      activeId: 'ch5',
      overId: 'ch1',
      activeContainer: 'group1',
      overContainer: ROOT_CONTAINER,
      isGroup: false,
      siblingsOf: (c) => (c === ROOT_CONTAINER ? ['ch1', 'group1'] : ['ch5', 'ch6'])
    })
    expect(result).toEqual({ type: 'move', orderedIds: ['ch5', 'ch1', 'group1'], movedNodeId: 'ch5', newParentId: null })
  })

  it('un gruppo trascinato su un altro gruppo (contenitore diverso da root) viene ignorato: i gruppi non si annidano', () => {
    const result = resolveDragMove({
      activeId: 'group1',
      overId: 'ch5',
      activeContainer: ROOT_CONTAINER,
      overContainer: 'group2',
      isGroup: true,
      siblingsOf: () => ['ch5', 'ch6']
    })
    expect(result).toBeNull()
  })

  it('un drop su se stesso non produce alcun cambiamento', () => {
    const result = resolveDragMove({
      activeId: 'ch1',
      overId: 'ch1',
      activeContainer: ROOT_CONTAINER,
      overContainer: ROOT_CONTAINER,
      isGroup: false,
      siblingsOf: () => ['ch1', 'ch2']
    })
    expect(result).toBeNull()
  })

  it('inserisce in coda quando il target non è tra i fratelli attuali (drop su un contenitore vuoto)', () => {
    const result = resolveDragMove({
      activeId: 'ch1',
      overId: 'group:empty-group',
      activeContainer: ROOT_CONTAINER,
      overContainer: 'empty-group',
      isGroup: false,
      siblingsOf: (c) => (c === ROOT_CONTAINER ? ['ch1'] : [])
    })
    expect(result).toEqual({ type: 'move', orderedIds: ['ch1'], movedNodeId: 'ch1', newParentId: 'empty-group' })
  })
})
