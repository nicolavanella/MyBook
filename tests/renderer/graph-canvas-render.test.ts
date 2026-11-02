import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import GraphCanvas, { type GraphCanvasProps, type GraphEdgeData, type GraphNodeData } from '@renderer/features/mindmap/GraphCanvas'

/**
 * Prova di disegno del canvas dei grafi (v0.5.0). Gira in Node, senza finestra:
 * disegna il componente in una stringa HTML e ne verifica il contenuto. Non prova
 * i gesti del mouse (quelli stanno nella checklist manuale del CHANGELOG, mentre le
 * regole che li governano sono coperte da graph-interaction.test.ts), ma intercetta
 * errori di disegno su dati reali: nodi, curve, etichette, collegamenti orfani.
 */
const node = (id: string, x: number, y: number, label: string): GraphNodeData => ({
  id,
  x,
  y,
  label,
  background: '#fff',
  borderColor: '#333',
  bold: false
})

const baseProps = (over: Partial<GraphCanvasProps> = {}): GraphCanvasProps => ({
  nodes: [],
  edges: [],
  fitSignal: null,
  keyboardEnabled: true,
  labels: { zoomIn: 'Ingrandisci', zoomOut: 'Riduci', fitView: 'Adatta alla vista' },
  onNodesMoved: () => undefined,
  onConnect: () => undefined,
  onDelete: () => undefined,
  onNodeDoubleClick: () => undefined,
  onEdgeDoubleClick: () => undefined,
  ...over
})

const render = (props: GraphCanvasProps): string => renderToStaticMarkup(createElement(GraphCanvas, props))

describe('GraphCanvas — disegno', () => {
  it('canvas vuoto: nessun nodo, ma i tre comandi di zoom ci sono, con le etichette ricevute', () => {
    const html = render(baseProps())
    expect(html).not.toContain('data-node-id')
    expect(html).toContain('aria-label="Ingrandisci"')
    expect(html).toContain('aria-label="Riduci"')
    expect(html).toContain('aria-label="Adatta alla vista"')
  })

  it('disegna ogni nodo con testo, posizione, colori e le due maniglie', () => {
    const html = render(baseProps({ nodes: [node('a', 120, 80, '👤 Marco'), node('b', 300, 200, '📍 Roma')] }))
    expect(html).toContain('data-node-id="a"')
    expect(html).toContain('data-node-id="b"')
    expect(html).toContain('👤 Marco')
    expect(html).toContain('left:120px')
    expect(html).toContain('top:80px')
    expect((html.match(/data-handle="source"/g) ?? []).length).toBe(2)
    expect((html.match(/data-handle="target"/g) ?? []).length).toBe(2)
  })

  it('disegna una curva per ogni collegamento, e l\'etichetta solo se c\'è', () => {
    const edges: GraphEdgeData[] = [
      { id: 'e1', source: 'a', target: 'b', label: 'fratello di' },
      { id: 'e2', source: 'b', target: 'a', label: null }
    ]
    const html = render(baseProps({ nodes: [node('a', 0, 0, 'A'), node('b', 200, 150, 'B')], edges }))
    expect((html.match(/ C/g) ?? []).length).toBeGreaterThanOrEqual(2) // path "M… C…"
    expect(html).toContain('fratello di')
  })

  it('un collegamento verso un nodo mancante non rompe il disegno e non produce curve', () => {
    const html = render(baseProps({ nodes: [node('a', 0, 0, 'A')], edges: [{ id: 'e1', source: 'a', target: 'fantasma' }] }))
    expect(html).toContain('data-node-id="a"')
    expect(html).not.toContain(' C')
  })

  it('i nodi di tipo gruppo sono in grassetto', () => {
    const html = render(baseProps({ nodes: [{ ...node('g', 0, 0, '🗂️ Atto I'), bold: true }] }))
    expect(html).toContain('font-weight:600')
  })

  it('regge molti nodi e collegamenti', () => {
    const nodes = Array.from({ length: 300 }, (_, i) => node(`n${i}`, (i % 20) * 180, Math.floor(i / 20) * 90, `Nodo ${i}`))
    const edges = nodes.slice(1).map((n, i) => ({ id: `e${i}`, source: `n${i}`, target: n.id }))
    const html = render(baseProps({ nodes, edges }))
    expect((html.match(/data-node-id=/g) ?? []).length).toBe(300)
  })
})
