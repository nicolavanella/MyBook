import { describe, expect, it } from 'vitest'
import {
  DRAG_THRESHOLD_PX,
  EMPTY_SELECTION,
  canConnect,
  exceedsDragThreshold,
  movesFor,
  planDeletion,
  pressEdge,
  pressNode,
  pruneSelection,
  resolveConnection,
  selectBox,
  selectOnly
} from '@renderer/lib/graphInteraction'

describe('pressNode (pressione su un nodo)', () => {
  it('su un nodo non selezionato: diventa l\'unico selezionato, si può trascinare', () => {
    const result = pressNode({ nodes: ['x'], edges: ['e'] }, 'a', false)
    expect(result.selection).toEqual({ nodes: ['a'], edges: [] })
    expect(result.draggable).toBe(true)
    expect(result.collapseOnRelease).toBe(false)
  })

  it('su un nodo già selezionato tra più: la selezione resta (si trascina il gruppo) e si riduce solo se non si trascina', () => {
    const selection = { nodes: ['a', 'b'], edges: [] }
    const result = pressNode(selection, 'a', false)
    expect(result.selection).toBe(selection)
    expect(result.draggable).toBe(true)
    expect(result.collapseOnRelease).toBe(true)
  })

  it('sull\'unico nodo selezionato non c\'è nulla da ridurre', () => {
    expect(pressNode({ nodes: ['a'], edges: [] }, 'a', false).collapseOnRelease).toBe(false)
  })

  it('con collegamenti selezionati insieme al nodo, il rilascio senza trascinamento riduce a quel nodo', () => {
    expect(pressNode({ nodes: ['a'], edges: ['e1'] }, 'a', false).collapseOnRelease).toBe(true)
  })

  it('con Ctrl/Cmd/Maiusc aggiunge il nodo alla selezione senza perdere gli altri', () => {
    const result = pressNode({ nodes: ['a'], edges: ['e1'] }, 'b', true)
    expect(result.selection).toEqual({ nodes: ['a', 'b'], edges: ['e1'] })
    expect(result.draggable).toBe(true)
  })

  it('con Ctrl/Cmd/Maiusc su un nodo già selezionato lo deseleziona e NON avvia il trascinamento', () => {
    const result = pressNode({ nodes: ['a', 'b'], edges: [] }, 'a', true)
    expect(result.selection.nodes).toEqual(['b'])
    expect(result.draggable).toBe(false)
  })

  it('selectOnly riduce a un solo nodo', () => {
    expect(selectOnly('z')).toEqual({ nodes: ['z'], edges: [] })
  })
})

describe('collegamenti e riquadro', () => {
  it('pressEdge seleziona solo quel collegamento (e deseleziona i nodi); con additive lo aggiunge o toglie', () => {
    expect(pressEdge({ nodes: ['a'], edges: ['e1'] }, 'e2', false)).toEqual({ nodes: [], edges: ['e2'] })
    expect(pressEdge({ nodes: ['a'], edges: ['e1'] }, 'e2', true)).toEqual({ nodes: ['a'], edges: ['e1', 'e2'] })
    expect(pressEdge({ nodes: ['a'], edges: ['e1', 'e2'] }, 'e1', true)).toEqual({ nodes: ['a'], edges: ['e2'] })
  })

  it('selectBox sostituisce la selezione, oppure con additive la estende senza duplicati', () => {
    expect(selectBox({ nodes: ['a'], edges: ['e'] }, ['b', 'c'], false)).toEqual({ nodes: ['b', 'c'], edges: [] })
    expect(selectBox({ nodes: ['a'], edges: ['e'] }, ['a', 'b'], true)).toEqual({ nodes: ['a', 'b'], edges: ['e'] })
  })
})

describe('pruneSelection', () => {
  it('toglie ciò che non esiste più', () => {
    const pruned = pruneSelection({ nodes: ['a', 'gone'], edges: ['e', 'goneEdge'] }, new Set(['a']), new Set(['e']))
    expect(pruned).toEqual({ nodes: ['a'], edges: ['e'] })
  })

  it('se non cambia nulla restituisce lo stesso oggetto (nessun ridisegno)', () => {
    const selection = { nodes: ['a'], edges: ['e'] }
    expect(pruneSelection(selection, new Set(['a', 'b']), new Set(['e']))).toBe(selection)
    expect(pruneSelection(EMPTY_SELECTION, new Set(), new Set())).toBe(EMPTY_SELECTION)
  })
})

describe('resolveConnection e canConnect', () => {
  it('dalla maniglia in basso il nodo di partenza è l\'origine', () => {
    expect(resolveConnection({ nodeId: 'a', handle: 'source' }, 'b')).toEqual({ source: 'a', target: 'b' })
  })

  it('dalla maniglia in alto il nodo di partenza è la destinazione', () => {
    expect(resolveConnection({ nodeId: 'a', handle: 'target' }, 'b')).toEqual({ source: 'b', target: 'a' })
  })

  it('un nodo non si collega a se stesso', () => {
    expect(resolveConnection({ nodeId: 'a', handle: 'source' }, 'a')).toBeNull()
    expect(canConnect([], { source: 'a', target: 'a' })).toBe(false)
  })

  it('REGRESSIONE: collegare due nodi già collegati nello stesso verso non è ammesso (niente duplicati nel database)', () => {
    const edges = [{ id: 'e1', source: 'a', target: 'b' }]
    expect(canConnect(edges, { source: 'a', target: 'b' })).toBe(false)
  })

  it('il verso opposto e i collegamenti con altri nodi sono ammessi', () => {
    const edges = [{ id: 'e1', source: 'a', target: 'b' }]
    expect(canConnect(edges, { source: 'b', target: 'a' })).toBe(true)
    expect(canConnect(edges, { source: 'a', target: 'c' })).toBe(true)
  })
})

describe('planDeletion (pressione di Canc)', () => {
  const edges = [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n1' }
  ]

  it('REGRESSIONE: i collegamenti selezionati vanno eliminati in modo esplicito (prima restavano nel database)', () => {
    const plan = planDeletion({ nodes: [], edges: ['e2'] }, edges)
    expect(plan).toEqual({ nodeIds: [], edgeIds: ['e2'], cascadedEdgeIds: [] })
  })

  it('eliminando un nodo cadono i suoi collegamenti: vanno tolti dalla vista ma NON eliminati due volte', () => {
    const plan = planDeletion({ nodes: ['n1'], edges: ['e1', 'e2'] }, edges)
    expect(plan.nodeIds).toEqual(['n1'])
    expect(plan.cascadedEdgeIds).toEqual(['e1', 'e3']) // quelli attaccati a n1
    expect(plan.edgeIds).toEqual(['e2']) // e1 è selezionato ma cade con n1: nessuna chiamata dedicata
  })

  it('ignora collegamenti selezionati che non esistono più', () => {
    expect(planDeletion({ nodes: [], edges: ['fantasma'] }, edges).edgeIds).toEqual([])
  })

  it('selezione vuota → niente da fare', () => {
    expect(planDeletion(EMPTY_SELECTION, edges)).toEqual({ nodeIds: [], edgeIds: [], cascadedEdgeIds: [] })
  })
})

describe('movesFor (trascinamento)', () => {
  const positions = { a: { x: 10, y: 10 }, b: { x: 0, y: 0 }, c: { x: 100, y: 100 } }

  it('REGRESSIONE: sposta TUTTI i nodi trascinati dello stesso scostamento (prima se ne salvava uno solo)', () => {
    expect(movesFor(['a', 'b'], positions, { x: 5, y: -5 })).toEqual([
      { id: 'a', x: 15, y: 5 },
      { id: 'b', x: 5, y: -5 }
    ])
  })

  it('non tocca i nodi non selezionati e salta gli id senza posizione', () => {
    const moves = movesFor(['a', 'sconosciuto'], positions, { x: 1, y: 1 })
    expect(moves).toEqual([{ id: 'a', x: 11, y: 11 }])
  })

  it('scostamento nullo = posizioni invariate', () => {
    expect(movesFor(['c'], positions, { x: 0, y: 0 })).toEqual([{ id: 'c', x: 100, y: 100 }])
  })
})

describe('soglia di trascinamento', () => {
  it('un tremito del mouse non è un trascinamento', () => {
    expect(exceedsDragThreshold(1, 1)).toBe(false)
    expect(exceedsDragThreshold(2, 2)).toBe(false) // ≈ 2.83
  })
  it('dalla soglia in su lo è', () => {
    expect(exceedsDragThreshold(DRAG_THRESHOLD_PX, 0)).toBe(true)
    expect(exceedsDragThreshold(0, -4)).toBe(true)
  })
})
