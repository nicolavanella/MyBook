import { describe, expect, it } from 'vitest'
import {
  FIT_PADDING,
  INITIAL_VIEWPORT,
  MAX_ZOOM,
  MIN_ZOOM,
  bezierEdge,
  boundsOf,
  boxAt,
  boxesInRect,
  clampZoom,
  fitViewport,
  normalizeRect,
  screenToWorld,
  sourceHandlePoint,
  targetHandlePoint,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
  type GraphBox
} from '@renderer/lib/graphGeometry'

const box = (id: string, x: number, y: number, width: number, height: number): GraphBox => ({ id, x, y, width, height })

describe('coordinate mondo ⇄ schermo', () => {
  it('sono l\'una l\'inversa dell\'altra, a qualsiasi zoom e pan', () => {
    const viewport = { x: 37, y: -120, zoom: 1.7 }
    const world = { x: 215.5, y: -40 }
    const back = screenToWorld(worldToScreen(world, viewport), viewport)
    expect(back.x).toBeCloseTo(world.x)
    expect(back.y).toBeCloseTo(world.y)
  })

  it('con la vista iniziale coincidono', () => {
    expect(worldToScreen({ x: 10, y: 20 }, INITIAL_VIEWPORT)).toEqual({ x: 10, y: 20 })
  })
})

describe('zoom', () => {
  it('clampZoom rispetta i limiti', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM)
    expect(clampZoom(9)).toBe(MAX_ZOOM)
    expect(clampZoom(1.3)).toBe(1.3)
  })

  it('zoomAt lascia fermo il punto del grafo sotto il cursore', () => {
    const viewport = { x: 10, y: 20, zoom: 1 }
    const anchor = { x: 110, y: 120 } // sotto il cursore c'è il punto (100, 100) del mondo
    const zoomed = zoomAt(viewport, anchor, 2)
    expect(zoomed.zoom).toBe(2)
    const stillUnder = worldToScreen({ x: 100, y: 100 }, zoomed)
    expect(stillUnder.x).toBeCloseTo(anchor.x)
    expect(stillUnder.y).toBeCloseTo(anchor.y)
  })

  it('zoomAt non supera i limiti e, se nulla cambia, restituisce lo stesso oggetto', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 5, y: 5 }, 50).zoom).toBe(MAX_ZOOM)
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 5, y: 5 }, 0.01).zoom).toBe(MIN_ZOOM)
    const atLimit = { x: 3, y: 4, zoom: MAX_ZOOM }
    expect(zoomAt(atLimit, { x: 5, y: 5 }, 3)).toBe(atLimit)
  })

  it('wheelZoomFactor: nessuno scorrimento = nessuno zoom; scorrere in su ingrandisce, in giù riduce', () => {
    expect(wheelZoomFactor(0, 0, false)).toBe(1)
    expect(wheelZoomFactor(-100, 0, false)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100, 0, false)).toBeLessThan(1)
  })

  it('wheelZoomFactor: stessa formula di d3-zoom (pixel, righe, Ctrl)', () => {
    expect(wheelZoomFactor(-100, 0, false)).toBeCloseTo(2 ** 0.2)
    expect(wheelZoomFactor(-100, 1, false)).toBeCloseTo(2 ** 5)
    expect(wheelZoomFactor(-100, 0, true)).toBeCloseTo(2 ** 2) // pizzico del trackpad: x10
    expect(wheelZoomFactor(-1, 2, false)).toBeCloseTo(2) // deltaMode "pagina": unità 1
  })
})

describe('boundsOf e fitViewport', () => {
  const boxes = [box('a', 0, 0, 100, 50), box('b', 200, 100, 50, 50)]

  it('boundsOf racchiude tutti i nodi; senza nodi è null', () => {
    expect(boundsOf(boxes)).toEqual({ x: 0, y: 0, width: 250, height: 150 })
    expect(boundsOf([])).toBeNull()
  })

  it('boundsOf gestisce coordinate negative', () => {
    expect(boundsOf([box('a', -50, -20, 10, 10), box('b', 10, 10, 10, 10)])).toEqual({ x: -50, y: -20, width: 70, height: 40 })
  })

  it('fitViewport centra i nodi nel contenitore', () => {
    const bounds = boundsOf(boxes)!
    const viewport = fitViewport(bounds, { width: 800, height: 600 })
    const center = worldToScreen({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, viewport)
    expect(center.x).toBeCloseTo(400)
    expect(center.y).toBeCloseTo(300)
  })

  it('fitViewport mostra l\'intera area con il margine richiesto', () => {
    const bounds = { x: 0, y: 0, width: 200, height: 100 }
    const viewport = fitViewport(bounds, { width: 400, height: 400 })
    expect(viewport.zoom).toBeCloseTo(400 / (200 * (1 + FIT_PADDING)))
    // l'area, a quello zoom, sta tutta nel contenitore
    expect(bounds.width * viewport.zoom).toBeLessThanOrEqual(400)
  })

  it('fitViewport limita lo zoom: area enorme → minimo, un solo punto → massimo', () => {
    expect(fitViewport({ x: 0, y: 0, width: 100000, height: 100000 }, { width: 400, height: 400 }).zoom).toBe(MIN_ZOOM)
    expect(fitViewport({ x: 5, y: 5, width: 0, height: 0 }, { width: 400, height: 400 }).zoom).toBe(MAX_ZOOM)
  })

  it('fitViewport senza nodi o con contenitore non misurato dà la vista iniziale', () => {
    expect(fitViewport(null, { width: 800, height: 600 })).toBe(INITIAL_VIEWPORT)
    expect(fitViewport({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 })).toBe(INITIAL_VIEWPORT)
  })
})

describe('punti di aggancio e curva dei collegamenti', () => {
  it('esce dal centro del lato basso ed entra nel centro del lato alto', () => {
    const b = box('a', 100, 50, 80, 40)
    expect(sourceHandlePoint(b)).toEqual({ x: 140, y: 90 })
    expect(targetHandlePoint(b)).toEqual({ x: 140, y: 50 })
  })

  it('bersaglio sotto: curva dolce, etichetta a metà', () => {
    const edge = bezierEdge({ x: 0, y: 0 }, { x: 0, y: 100 })
    expect(edge.path).toBe('M0,0 C0,50 0,50 0,100')
    expect(edge.labelX).toBeCloseTo(0)
    expect(edge.labelY).toBeCloseTo(50)
  })

  it('bersaglio spostato di lato: etichetta a metà strada', () => {
    const edge = bezierEdge({ x: 0, y: 0 }, { x: 100, y: 100 })
    expect(edge.path).toBe('M0,0 C0,50 100,50 100,100')
    expect(edge.labelX).toBeCloseTo(50)
    expect(edge.labelY).toBeCloseTo(50)
  })

  it('bersaglio sopra: la curva fa il giro (punti di controllo oltre i nodi) ma l\'etichetta resta a metà', () => {
    const edge = bezierEdge({ x: 0, y: 100 }, { x: 0, y: 0 })
    expect(edge.path).toBe('M0,100 C0,162.5 0,-62.5 0,0')
    expect(edge.labelY).toBeCloseTo(50)
  })

  it('stessa altezza: distanza nulla, nessun valore non numerico', () => {
    const edge = bezierEdge({ x: 0, y: 40 }, { x: 100, y: 40 })
    expect(edge.path).toBe('M0,40 C0,40 100,40 100,40')
    expect(Number.isFinite(edge.labelX) && Number.isFinite(edge.labelY)).toBe(true)
  })
})

describe('riquadro di selezione', () => {
  it('normalizeRect funziona in qualsiasi direzione di trascinamento', () => {
    expect(normalizeRect({ x: 10, y: 20 }, { x: 5, y: 40 })).toEqual({ x: 5, y: 20, width: 5, height: 20 })
    expect(normalizeRect({ x: 5, y: 40 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 20, width: 5, height: 20 })
  })

  const boxes = [box('a', 0, 0, 100, 50), box('b', 90, 0, 100, 50)]

  it('modo "full": solo i nodi interamente dentro', () => {
    expect(boxesInRect(boxes, { x: 0, y: 0, width: 120, height: 60 })).toEqual(['a'])
    expect(boxesInRect(boxes, { x: -10, y: -10, width: 300, height: 100 })).toEqual(['a', 'b'])
  })

  it('modo "partial": anche i nodi solo sfiorati', () => {
    expect(boxesInRect(boxes, { x: 0, y: 0, width: 120, height: 60 }, 'partial')).toEqual(['a', 'b'])
  })

  it('un riquadro lontano non seleziona nulla; un bordo che si tocca soltanto non conta', () => {
    expect(boxesInRect(boxes, { x: 500, y: 500, width: 10, height: 10 })).toEqual([])
    expect(boxesInRect(boxes, { x: 190, y: 0, width: 10, height: 10 }, 'partial')).toEqual([])
  })
})

describe('boxAt (nodo sotto il cursore)', () => {
  const boxes = [box('a', 0, 0, 100, 100), box('b', 50, 50, 100, 100)] // b sopra a, sovrapposti

  it('tra nodi sovrapposti vince quello disegnato per ultimo', () => {
    expect(boxAt(boxes, { x: 75, y: 75 })).toBe('b')
  })

  it('excludeId lo salta (il nodo da cui parte un collegamento)', () => {
    expect(boxAt(boxes, { x: 75, y: 75 }, 'b')).toBe('a')
  })

  it('fuori da tutti → null; i bordi sono compresi', () => {
    expect(boxAt(boxes, { x: 500, y: 500 })).toBeNull()
    expect(boxAt(boxes, { x: 0, y: 0 })).toBe('a')
    expect(boxAt(boxes, { x: 150, y: 150 })).toBe('b')
  })
})
