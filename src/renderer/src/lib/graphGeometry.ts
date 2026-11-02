/**
 * Geometria del canvas dei grafi (v0.5.0).
 *
 * Sostituisce la parte "matematica" che prima forniva React Flow: conversione
 * tra coordinate dello schermo e del grafo, zoom e pan, adattamento alla vista,
 * curve dei collegamenti, selezione a riquadro. È TUTTO codice puro (nessun
 * React, nessun DOM): si verifica con i test in Node
 * (tests/renderer/graph-geometry.test.ts) e il componente GraphCanvas si limita
 * a collegarlo agli eventi del mouse.
 *
 * DUE SISTEMI DI COORDINATE
 *  - "mondo": le coordinate dei nodi come salvate nel database (pos_x, pos_y),
 *    indipendenti da zoom e pan;
 *  - "schermo": pixel dentro il contenitore del canvas (origine in alto a sinistra).
 *  Il Viewport {x, y, zoom} li lega:  schermo = mondo * zoom + (x, y).
 */

export interface Point {
  x: number
  y: number
}
export interface Size {
  width: number
  height: number
}
export interface Rect extends Point, Size {}
/** Rettangolo di un nodo nel mondo, con il suo id. */
export interface GraphBox extends Rect {
  id: string
}
export interface Viewport {
  /** Spostamento orizzontale in pixel dello schermo. */
  x: number
  /** Spostamento verticale in pixel dello schermo. */
  y: number
  zoom: number
}

/** Limiti di zoom: gli stessi che usava React Flow, per non cambiare l'abitudine. */
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 2
/** Fattore dei pulsanti "ingrandisci/riduci". */
export const ZOOM_STEP = 1.2
/** Margine attorno ai nodi nell'adattamento alla vista (10% come in React Flow). */
export const FIT_PADDING = 0.1
/**
 * Dimensione ipotizzata di un nodo non ancora misurato (le misure arrivano dal
 * DOM subito dopo il primo disegno): serve solo a non avere buchi nei calcoli.
 */
export const DEFAULT_NODE_SIZE: Size = { width: 150, height: 36 }
export const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }

/** Riporta lo zoom entro i limiti. */
export function clampZoom(zoom: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  return Math.min(max, Math.max(min, zoom))
}

/** Da pixel del contenitore a coordinate del mondo. */
export function screenToWorld(point: Point, viewport: Viewport): Point {
  return { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom }
}

/** Da coordinate del mondo a pixel del contenitore. */
export function worldToScreen(point: Point, viewport: Viewport): Point {
  return { x: point.x * viewport.zoom + viewport.x, y: point.y * viewport.zoom + viewport.y }
}

/**
 * Cambia lo zoom lasciando FERMO il punto del grafo che sta sotto `anchor`
 * (il cursore, o il centro del canvas per i pulsanti): è ciò che fa sembrare
 * lo zoom "naturale". Lo zoom richiesto è limitato a MIN_ZOOM..MAX_ZOOM; se
 * non cambia nulla ritorna lo stesso oggetto (evita ridisegni inutili).
 */
export function zoomAt(viewport: Viewport, anchor: Point, nextZoom: number): Viewport {
  const zoom = clampZoom(nextZoom)
  if (zoom === viewport.zoom) return viewport
  const world = screenToWorld(anchor, viewport)
  return { x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom, zoom }
}

/**
 * Fattore di zoom per un evento della rotellina. Stessa formula di d3-zoom
 * (la libreria sotto React Flow), così la sensibilità resta quella di prima:
 * 0.002 per pixel di scorrimento, 0.05 se la rotellina misura in righe, x10 con
 * Ctrl premuto (è così che i trackpad inviano il gesto di pizzico).
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
  const unit = deltaMode === 1 ? 0.05 : deltaMode ? 1 : 0.002
  return 2 ** (-deltaY * unit * (ctrlKey ? 10 : 1))
}

/** Rettangolo che contiene tutti i nodi, o null se non ce ne sono. */
export function boundsOf(boxes: readonly GraphBox[]): Rect | null {
  if (boxes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const box of boxes) {
    minX = Math.min(minX, box.x)
    minY = Math.min(minY, box.y)
    maxX = Math.max(maxX, box.x + box.width)
    maxY = Math.max(maxY, box.y + box.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Viewport che mostra `bounds` interamente e centrato nel contenitore, con un
 * margine proporzionale (`padding`). Con un solo nodo (area nulla) lo zoom
 * arriva al massimo consentito, come in React Flow. Senza nodi o con un
 * contenitore non ancora misurato restituisce la vista iniziale.
 */
export function fitViewport(
  bounds: Rect | null,
  container: Size,
  padding = FIT_PADDING,
  minZoom = MIN_ZOOM,
  maxZoom = MAX_ZOOM
): Viewport {
  if (!bounds || container.width <= 0 || container.height <= 0) return INITIAL_VIEWPORT
  const xZoom = container.width / (bounds.width * (1 + padding))
  const yZoom = container.height / (bounds.height * (1 + padding))
  const zoom = clampZoom(Math.min(xZoom, yZoom), minZoom, maxZoom)
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  return { x: container.width / 2 - centerX * zoom, y: container.height / 2 - centerY * zoom, zoom }
}

/** Punto da cui esce un collegamento: centro del lato BASSO del nodo. */
export function sourceHandlePoint(box: Rect): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height }
}

/** Punto in cui entra un collegamento: centro del lato ALTO del nodo. */
export function targetHandlePoint(box: Rect): Point {
  return { x: box.x + box.width / 2, y: box.y }
}

/** Distanza dei punti di controllo: proporzionale se il bersaglio è sotto, "a gomito" se è sopra. */
function controlOffset(distance: number, curvature: number): number {
  return distance >= 0 ? 0.5 * distance : curvature * 25 * Math.sqrt(-distance)
}

export interface BezierEdge {
  /** Valore dell'attributo `d` di un <path> SVG. */
  path: string
  /** Punto a metà della curva, dove sta l'etichetta. */
  labelX: number
  labelY: number
}

/**
 * Curva di Bézier cubica dal lato basso di un nodo al lato alto di un altro.
 * Stessa forma di quella di React Flow (curvatura 0.25): se il bersaglio è
 * sotto la curva è una "S" dolce, se è sopra fa un giro attorno ai nodi.
 * L'etichetta si colloca sul punto centrale della curva (t = 0.5).
 */
export function bezierEdge(source: Point, target: Point, curvature = 0.25): BezierEdge {
  const offset = controlOffset(target.y - source.y, curvature)
  const c1 = { x: source.x, y: source.y + offset } // esce verso il basso
  const c2 = { x: target.x, y: target.y - offset } // entra da sopra
  return {
    path: `M${source.x},${source.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${target.x},${target.y}`,
    labelX: 0.125 * source.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * target.x,
    labelY: 0.125 * source.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * target.y
  }
}

/** Rettangolo con due angoli opposti qualsiasi (il riquadro si può trascinare in ogni direzione). */
export function normalizeRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

/**
 * Nodi selezionati da un riquadro.
 *  - 'full': solo i nodi INTERAMENTE dentro il riquadro (default);
 *  - 'partial': anche quelli appena sfiorati.
 * Tenere la scelta come parametro rende banale cambiarla.
 */
export function boxesInRect(boxes: readonly GraphBox[], rect: Rect, mode: 'full' | 'partial' = 'full'): string[] {
  return boxes
    .filter((box) => {
      if (mode === 'full') {
        return (
          box.x >= rect.x &&
          box.y >= rect.y &&
          box.x + box.width <= rect.x + rect.width &&
          box.y + box.height <= rect.y + rect.height
        )
      }
      return (
        box.x < rect.x + rect.width &&
        box.x + box.width > rect.x &&
        box.y < rect.y + rect.height &&
        box.y + box.height > rect.y
      )
    })
    .map((box) => box.id)
}

/**
 * Id del nodo sotto `point` (il più in alto se sovrapposti: l'ultimo dell'elenco,
 * che è anche quello disegnato per ultimo), oppure null. `excludeId` serve a
 * ignorare il nodo da cui parte un collegamento.
 */
export function boxAt(boxes: readonly GraphBox[], point: Point, excludeId?: string): string | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i]
    if (box.id === excludeId) continue
    if (point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height) return box.id
  }
  return null
}
