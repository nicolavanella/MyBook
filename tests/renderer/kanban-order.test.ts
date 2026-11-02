import { describe, expect, it } from 'vitest'
import { UNGROUPED_COLUMN, computeKanbanMove, isBelowCenter } from '@renderer/lib/kanbanOrder'

const cols = () => ({
  A: ['a1', 'a2', 'a3'],
  B: ['b1', 'b2'],
  C: [] as string[],
  [UNGROUPED_COLUMN]: ['u1']
})

describe('computeKanbanMove — stessa colonna', () => {
  it('sposta una card in giù, dopo la card bersaglio', () => {
    expect(computeKanbanMove(cols(), 'a1', { kind: 'card', overId: 'a3', after: true })).toEqual({
      columnId: 'A', groupId: 'A', orderedIds: ['a2', 'a3', 'a1']
    })
  })

  it('sposta una card in su, prima della card bersaglio', () => {
    expect(computeKanbanMove(cols(), 'a3', { kind: 'card', overId: 'a1', after: false })?.orderedIds).toEqual(['a3', 'a1', 'a2'])
  })

  it('scambia due card adiacenti', () => {
    expect(computeKanbanMove(cols(), 'a1', { kind: 'card', overId: 'a2', after: true })?.orderedIds).toEqual(['a2', 'a1', 'a3'])
  })

  it('rilasciata sul proprio posto → nessuna modifica', () => {
    expect(computeKanbanMove(cols(), 'a2', { kind: 'card', overId: 'a1', after: true })).toBeNull() // dopo a1 = dov'è già
    expect(computeKanbanMove(cols(), 'a2', { kind: 'card', overId: 'a3', after: false })).toBeNull() // prima di a3 = dov'è già
    expect(computeKanbanMove(cols(), 'a2', { kind: 'card', overId: 'a2', after: false })).toBeNull() // su se stessa
  })

  it('rilasciata sullo spazio vuoto della propria colonna → in fondo', () => {
    expect(computeKanbanMove(cols(), 'a1', { kind: 'column', columnId: 'A' })?.orderedIds).toEqual(['a2', 'a3', 'a1'])
  })

  it('già ultima e rilasciata sullo spazio vuoto → nessuna modifica', () => {
    expect(computeKanbanMove(cols(), 'a3', { kind: 'column', columnId: 'A' })).toBeNull()
  })
})

describe('computeKanbanMove — fra colonne', () => {
  it('inserisce PRIMA della card bersaglio di un\'altra colonna', () => {
    expect(computeKanbanMove(cols(), 'a1', { kind: 'card', overId: 'b1', after: false })).toEqual({
      columnId: 'B', groupId: 'B', orderedIds: ['a1', 'b1', 'b2']
    })
  })

  it('inserisce DOPO la card bersaglio di un\'altra colonna', () => {
    expect(computeKanbanMove(cols(), 'a1', { kind: 'card', overId: 'b1', after: true })?.orderedIds).toEqual(['b1', 'a1', 'b2'])
  })

  it('in mezzo a due card', () => {
    expect(computeKanbanMove(cols(), 'a2', { kind: 'card', overId: 'b2', after: false })?.orderedIds).toEqual(['b1', 'a2', 'b2'])
  })

  it('rilasciata sulla colonna (spazio vuoto) → in fondo alla colonna', () => {
    expect(computeKanbanMove(cols(), 'a1', { kind: 'column', columnId: 'B' })?.orderedIds).toEqual(['b1', 'b2', 'a1'])
  })

  it('in una colonna vuota', () => {
    expect(computeKanbanMove(cols(), 'a1', { kind: 'column', columnId: 'C' })).toEqual({ columnId: 'C', groupId: 'C', orderedIds: ['a1'] })
  })

  it('verso "Senza gruppo" produce group_id null', () => {
    expect(computeKanbanMove(cols(), 'a1', { kind: 'column', columnId: UNGROUPED_COLUMN })).toEqual({
      columnId: UNGROUPED_COLUMN, groupId: null, orderedIds: ['u1', 'a1']
    })
  })

  it('da "Senza gruppo" a un gruppo', () => {
    expect(computeKanbanMove(cols(), 'u1', { kind: 'card', overId: 'a2', after: false })).toEqual({
      columnId: 'A', groupId: 'A', orderedIds: ['a1', 'u1', 'a2', 'a3']
    })
  })

  it('spostare in un\'altra colonna è una modifica anche se la card finisce nella stessa posizione numerica', () => {
    const result = computeKanbanMove({ A: ['x'], B: ['y'] }, 'x', { kind: 'card', overId: 'y', after: false })
    expect(result).toEqual({ columnId: 'B', groupId: 'B', orderedIds: ['x', 'y'] })
  })
})

describe('computeKanbanMove — casi non validi', () => {
  it('card sconosciuta, bersaglio sconosciuto o colonna sconosciuta → null', () => {
    expect(computeKanbanMove(cols(), 'zzz', { kind: 'column', columnId: 'A' })).toBeNull()
    expect(computeKanbanMove(cols(), 'a1', { kind: 'card', overId: 'zzz', after: false })).toBeNull()
    expect(computeKanbanMove(cols(), 'a1', { kind: 'column', columnId: 'ZZ' })).toBeNull()
  })

  it('non muta lo stato ricevuto', () => {
    const input = cols()
    computeKanbanMove(input, 'a1', { kind: 'card', overId: 'b2', after: true })
    expect(input).toEqual(cols())
  })

  it('il risultato non contiene mai doppioni né perde card', () => {
    const result = computeKanbanMove(cols(), 'a2', { kind: 'card', overId: 'b1', after: true })!
    expect(new Set(result.orderedIds).size).toBe(result.orderedIds.length)
    expect([...result.orderedIds].sort()).toEqual(['a2', 'b1', 'b2'])
  })
})

describe('isBelowCenter', () => {
  it('confronta il centro della card trascinata con il centro del bersaglio', () => {
    expect(isBelowCenter({ top: 100, height: 40 }, { top: 60, height: 40 })).toBe(true) // 120 > 80
    expect(isBelowCenter({ top: 50, height: 40 }, { top: 60, height: 40 })).toBe(false) // 70 < 80
  })
})
