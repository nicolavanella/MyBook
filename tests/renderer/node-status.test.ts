import { describe, it, expect } from 'vitest'
import { NODE_STATUS_OPTIONS, STATUS_DOT } from '@renderer/lib/nodeStatus'
import { NodeStatus } from '@shared/schemas/document.schema'

describe('nodeStatus (fonte unica per albero e selettore Stato)', () => {
  it('copre esattamente gli stati validi dello schema, nell\'ordine Idea/Bozza/Revisione/Finito', () => {
    expect(NODE_STATUS_OPTIONS.map((o) => o.value)).toEqual(NodeStatus.options)
    expect(NODE_STATUS_OPTIONS.map((o) => o.label)).toEqual(['Idea', 'Bozza', 'Revisione', 'Finito'])
  })
  it('ogni stato ha un colore distinto e STATUS_DOT è coerente', () => {
    const classes = NODE_STATUS_OPTIONS.map((o) => o.dotClass)
    expect(new Set(classes).size).toBe(classes.length)
    for (const o of NODE_STATUS_OPTIONS) expect(STATUS_DOT[o.value]).toBe(o.dotClass)
  })
  it('mantiene i colori storici dell\'albero', () => {
    expect(STATUS_DOT).toMatchObject({ idea: 'bg-gray-300', bozza: 'bg-amber-400', revisione: 'bg-blue-400', completo: 'bg-green-500' })
  })
})
