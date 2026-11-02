/**
 * Canvas dei grafi della mappa concettuale (v0.5.0).
 *
 * Sostituisce React Flow con un componente interno e controllabile. Riproduce
 * ciò che la pagina usava della libreria: pan trascinando lo sfondo, zoom con la
 * rotellina o il pizzico del trackpad, pulsanti di zoom e "adatta alla vista",
 * sfondo a puntini, nodi trascinabili e selezionabili (anche in blocco con
 * Maiusc+trascinamento e con Ctrl/Cmd+click), collegamenti a curva con
 * etichetta, creazione di un collegamento trascinando da una maniglia, doppio
 * click per modificare, Canc/Backspace per eliminare.
 *
 * DIVISIONE DEI COMPITI
 *  - lib/graphGeometry.ts   → matematica (coordinate, zoom, curve, riquadri);
 *  - lib/graphInteraction.ts → regole (selezione, collegamenti validi, cosa
 *    eliminare, quali nodi si spostano). Entrambi puri e coperti da test;
 *  - questo file → collega i due agli eventi del mouse e disegna. Non contiene
 *    regole proprie: se serve cambiare un comportamento, di norma si tocca lì.
 *
 * COME È DISEGNATO. Un contenitore a riempimento contiene un unico "strato del
 * mondo" a cui si applica `translate + scale` (pan e zoom): dentro, i
 * collegamenti sono un SVG, le etichette e i nodi sono elementi HTML posizionati
 * con le coordinate del database. Così testo e CSS dei nodi restano nitidi a
 * qualsiasi zoom e le coordinate salvate non dipendono mai dalla vista.
 *
 * IL COMPONENTE È "CONTROLLATO". I nodi e i collegamenti arrivano dalla pagina,
 * che è l'unica fonte dei dati: il canvas non li modifica mai da solo, segnala
 * cosa è successo (spostati, collegati, da eliminare) e la pagina aggiorna lo
 * stato e il database. Tiene invece per sé lo stato puramente visivo: vista,
 * selezione, misure dei nodi e gesto in corso.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import {
  DEFAULT_NODE_SIZE,
  INITIAL_VIEWPORT,
  ZOOM_STEP,
  bezierEdge,
  boundsOf,
  boxAt,
  boxesInRect,
  fitViewport,
  normalizeRect,
  screenToWorld,
  sourceHandlePoint,
  targetHandlePoint,
  wheelZoomFactor,
  zoomAt,
  type GraphBox,
  type Point,
  type Rect,
  type Size,
  type Viewport
} from '@renderer/lib/graphGeometry'
import {
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
  selectOnly,
  type DeletionPlan,
  type GraphSelection,
  type HandleKind,
  type NodeMove
} from '@renderer/lib/graphInteraction'

export interface GraphNodeData {
  id: string
  /** Posizione nel mondo (pos_x, pos_y del database). */
  x: number
  y: number
  label: string
  background: string
  borderColor: string
  bold: boolean
}

export interface GraphEdgeData {
  id: string
  source: string
  target: string
  label?: string | null
}

export interface GraphCanvasLabels {
  zoomIn: string
  zoomOut: string
  fitView: string
}

export interface GraphCanvasProps {
  nodes: GraphNodeData[]
  edges: GraphEdgeData[]
  /**
   * Quando questo valore CAMBIA la vista si adatta ai nodi (appena sono misurati).
   * La pagina ci passa l'id della mappa mostrata: si adatta al cambio di mappa e
   * al primo caricamento, non a ogni modifica.
   */
  fitSignal: string | null
  /** false mentre una finestra di dialogo è aperta: Canc non deve eliminare i nodi dietro di essa. */
  keyboardEnabled: boolean
  labels: GraphCanvasLabels
  /** Uno o più nodi sono stati spostati (sempre TUTTI quelli trascinati). */
  onNodesMoved: (moves: NodeMove[]) => void
  onConnect: (connection: { source: string; target: string }) => void
  onDelete: (plan: DeletionPlan) => void
  onNodeDoubleClick: (id: string) => void
  onEdgeDoubleClick: (id: string) => void
}

/** Lo stato visivo del gesto in corso (cosa disegnare), distinto dai dati del gesto che stanno in un ref. */
type GestureView =
  | { kind: 'nodes'; ids: string[]; dx: number; dy: number }
  | { kind: 'box'; rect: Rect }
  | { kind: 'connect'; from: { nodeId: string; handle: HandleKind }; pointer: Point; hoverId: string | null }

/** Colori del tratto dei collegamenti: ricalcano quelli predefiniti di React Flow. */
const EDGE_COLOR = '#b1b1b7'
const EDGE_COLOR_SELECTED = '#3b82f6'

const isAdditive = (e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): boolean => e.ctrlKey || e.metaKey || e.shiftKey

// ─────────────────────────────────────────────────────────────────────────────
// Nodo
// ─────────────────────────────────────────────────────────────────────────────

interface GraphNodeViewProps {
  node: GraphNodeData
  /** Posizione da disegnare (quella del dato più lo spostamento del trascinamento in corso). */
  x: number
  y: number
  selected: boolean
  /** true se è il bersaglio su cui si sta per rilasciare un collegamento. */
  hovered: boolean
  onPointerDown: (e: ReactPointerEvent<HTMLElement>, id: string) => void
  onHandlePointerDown: (e: ReactPointerEvent<HTMLElement>, id: string, handle: HandleKind) => void
  onDoubleClick: (id: string) => void
  onSize: (id: string, width: number, height: number) => void
}

/**
 * Un nodo. È memorizzato (memo): durante pan e zoom, che cambiano molte volte al
 * secondo, i nodi non cambiano e non vanno ridisegnati. Per questo i gestori
 * ricevono l'id invece di essere creati per ogni nodo.
 */
const GraphNodeView = memo(function GraphNodeView({
  node,
  x,
  y,
  selected,
  hovered,
  onPointerDown,
  onHandlePointerDown,
  onDoubleClick,
  onSize
}: GraphNodeViewProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  // Misura il nodo: servono le dimensioni reali per agganciare le curve ai lati
  // e per adattare la vista. offsetWidth/Height NON risentono dello zoom (della
  // trasformazione), quindi sono già in unità del mondo.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const report = (): void => onSize(node.id, el.offsetWidth, el.offsetHeight)
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [node.id, node.label, node.bold, onSize])

  const handle = (kind: HandleKind): JSX.Element => (
    // Area sensibile di 16px attorno a un puntino di 8: facile da centrare anche a zoom ridotto.
    <div
      data-handle={kind}
      onPointerDown={(e) => onHandlePointerDown(e, node.id, kind)}
      style={{
        position: 'absolute',
        left: '50%',
        [kind === 'source' ? 'bottom' : 'top']: -8,
        width: 16,
        height: 16,
        marginLeft: -8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'crosshair'
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1a192b', border: '1px solid #fff' }} />
    </div>
  )

  return (
    <div
      ref={ref}
      data-node-id={node.id}
      onPointerDown={(e) => onPointerDown(e, node.id)}
      onDoubleClick={() => onDoubleClick(node.id)}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 'max-content',
        maxWidth: 360,
        boxSizing: 'border-box',
        background: node.background,
        border: `1.5px solid ${node.borderColor}`,
        borderRadius: 8,
        padding: '4px 10px',
        fontSize: 13,
        fontWeight: node.bold ? 600 : 400,
        color: '#222',
        textAlign: 'center',
        cursor: 'grab',
        userSelect: 'none',
        zIndex: selected ? 2 : 1,
        boxShadow: selected ? '0 0 0 2px rgba(59,130,246,0.75)' : hovered ? '0 0 0 2px rgba(34,197,94,0.75)' : undefined
      }}
    >
      {handle('target')}
      {node.label}
      {handle('source')}
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Canvas
// ─────────────────────────────────────────────────────────────────────────────

export default function GraphCanvas({
  nodes,
  edges,
  fitSignal,
  keyboardEnabled,
  labels,
  onNodesMoved,
  onConnect,
  onDelete,
  onNodeDoubleClick,
  onEdgeDoubleClick
}: GraphCanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  // Vista (pan e zoom). Il ref tiene sempre il valore più recente: i gesti vivono
  // in ascoltatori sulla finestra, che con lo stato di React leggerebbero valori vecchi.
  const [viewport, setViewportState] = useState<Viewport>(INITIAL_VIEWPORT)
  const viewportRef = useRef<Viewport>(INITIAL_VIEWPORT)
  const applyViewport = useCallback((next: Viewport): void => {
    viewportRef.current = next
    setViewportState(next)
  }, [])

  const [containerSize, setContainerSize] = useState<Size>({ width: 0, height: 0 })
  const [sizes, setSizes] = useState<Record<string, Size>>({})
  const [selection, setSelection] = useState<GraphSelection>(EMPTY_SELECTION)
  const [gesture, setGesture] = useState<GestureView | null>(null)
  const [panning, setPanning] = useState(false)

  // Rettangoli dei nodi nel mondo (posizione del dato + misura, o misura presunta).
  const boxes = useMemo<GraphBox[]>(
    () => nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, ...(sizes[n.id] ?? DEFAULT_NODE_SIZE) })),
    [nodes, sizes]
  )

  // Ultimi valori per i gestori "stabili" e per gli ascoltatori sulla finestra.
  const latest = useRef({ nodes, edges, boxes, selection, onNodesMoved, onConnect, onDelete, onNodeDoubleClick, onEdgeDoubleClick })
  latest.current = { nodes, edges, boxes, selection, onNodesMoved, onConnect, onDelete, onNodeDoubleClick, onEdgeDoubleClick }

  // ── Misure ────────────────────────────────────────────────────────────────

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = (): void =>
      setContainerSize((prev) =>
        prev.width === el.clientWidth && prev.height === el.clientHeight ? prev : { width: el.clientWidth, height: el.clientHeight }
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const reportSize = useCallback((id: string, width: number, height: number): void => {
    setSizes((prev) => {
      const current = prev[id]
      return current && current.width === width && current.height === height ? prev : { ...prev, [id]: { width, height } }
    })
  }, [])

  // ── Adattamento alla vista ──────────────────────────────────────────────────
  // Si "arma" quando cambia fitSignal e si esegue appena ci sono nodi e tutti
  // misurati (alla prima comparsa i nodi non hanno ancora una misura). Una volta
  // eseguito si disarma: aggiungere un nodo o ricaricare NON sposta la vista.

  const fitPendingRef = useRef(true)
  useEffect(() => {
    fitPendingRef.current = true
  }, [fitSignal])

  useEffect(() => {
    if (!fitPendingRef.current) return
    if (containerSize.width <= 0 || containerSize.height <= 0) return
    if (nodes.length === 0 || nodes.some((n) => !sizes[n.id])) return
    applyViewport(fitViewport(boundsOf(boxes), containerSize))
    fitPendingRef.current = false
  }, [fitSignal, nodes, sizes, boxes, containerSize, applyViewport])

  // ── Selezione ───────────────────────────────────────────────────────────────

  // Se un nodo o un collegamento sparisce (eliminato, mappa cambiata) esce dalla selezione.
  useEffect(() => {
    setSelection((prev) => pruneSelection(prev, new Set(nodes.map((n) => n.id)), new Set(edges.map((e) => e.id))))
  }, [nodes, edges])

  // ── Gesti ─────────────────────────────────────────────────────────────────
  // Un gesto (pan, trascinamento, riquadro, collegamento) parte da un
  // pointerdown sul canvas e prosegue con ascoltatori sulla FINESTRA, così continua
  // anche se il mouse esce dal canvas e termina sempre con un pointerup.

  const gestureCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => gestureCleanupRef.current?.(), []) // alla chiusura della pagina nessun ascoltatore resta appeso

  const startGesture = useCallback((onMove: (e: PointerEvent) => void, onEnd: (e: PointerEvent, cancelled: boolean) => void): void => {
    gestureCleanupRef.current?.()
    const cleanup = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      gestureCleanupRef.current = null
    }
    const up = (e: PointerEvent): void => {
      cleanup()
      onEnd(e, false)
    }
    const cancel = (e: PointerEvent): void => {
      cleanup()
      onEnd(e, true)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    gestureCleanupRef.current = cleanup
  }, [])

  /** Posizione del mouse in pixel del contenitore (origine in alto a sinistra del canvas). */
  const localPoint = useCallback((e: { clientX: number; clientY: number }): Point => {
    const rect = containerRef.current?.getBoundingClientRect()
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }
  }, [])

  /** Pressione sullo sfondo: Maiusc+trascina = riquadro di selezione; altrimenti trascina la vista. */
  const onPanePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    const start = { x: e.clientX, y: e.clientY }
    const startLocal = localPoint(e)
    let moved = false

    if (e.shiftKey) {
      startGesture(
        (ev) => {
          if (!moved && !exceedsDragThreshold(ev.clientX - start.x, ev.clientY - start.y)) return
          moved = true
          setGesture({ kind: 'box', rect: normalizeRect(startLocal, localPoint(ev)) })
        },
        (ev, cancelled) => {
          setGesture(null)
          if (cancelled || !moved) return
          const rect = normalizeRect(startLocal, localPoint(ev))
          const view = viewportRef.current
          const topLeft = screenToWorld(rect, view)
          const worldRect: Rect = { x: topLeft.x, y: topLeft.y, width: rect.width / view.zoom, height: rect.height / view.zoom }
          const ids = boxesInRect(latest.current.boxes, worldRect, 'full')
          setSelection(selectBox(latest.current.selection, ids, ev.ctrlKey || ev.metaKey))
        }
      )
      return
    }

    const startView = viewportRef.current
    const additive = isAdditive(e)
    startGesture(
      (ev) => {
        const dx = ev.clientX - start.x
        const dy = ev.clientY - start.y
        if (!moved && !exceedsDragThreshold(dx, dy)) return
        moved = true
        setPanning(true)
        applyViewport({ ...startView, x: startView.x + dx, y: startView.y + dy })
      },
      (_ev, cancelled) => {
        setPanning(false)
        // Un click (senza trascinare) sullo sfondo toglie la selezione.
        if (!cancelled && !moved && !additive) setSelection(EMPTY_SELECTION)
      }
    )
  }

  /** Pressione su un nodo: seleziona e, trascinando, sposta tutti i nodi selezionati. */
  const onNodePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, id: string): void => {
      if (e.button !== 0) return
      e.stopPropagation() // non deve partire anche il gesto dello sfondo
      const press = pressNode(latest.current.selection, id, isAdditive(e))
      setSelection(press.selection)
      if (!press.draggable) return

      const ids = press.selection.nodes
      const base: Record<string, Point> = {}
      for (const n of latest.current.nodes) if (ids.includes(n.id)) base[n.id] = { x: n.x, y: n.y }
      const start = { x: e.clientX, y: e.clientY }
      let moved = false

      startGesture(
        (ev) => {
          const dx = ev.clientX - start.x
          const dy = ev.clientY - start.y
          if (!moved && !exceedsDragThreshold(dx, dy)) return
          moved = true
          const zoom = viewportRef.current.zoom
          setGesture({ kind: 'nodes', ids, dx: dx / zoom, dy: dy / zoom })
        },
        (ev, cancelled) => {
          setGesture(null)
          if (cancelled) return
          if (!moved) {
            // Click senza trascinamento su un nodo di una selezione multipla: resta solo lui.
            if (press.collapseOnRelease) setSelection(selectOnly(id))
            return
          }
          const zoom = viewportRef.current.zoom
          latest.current.onNodesMoved(movesFor(ids, base, { x: (ev.clientX - start.x) / zoom, y: (ev.clientY - start.y) / zoom }))
        }
      )
    },
    [startGesture]
  )

  /** Pressione su una maniglia: trascinando verso un altro nodo si crea un collegamento. */
  const onHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, nodeId: string, handle: HandleKind): void => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      const from = { nodeId, handle }
      const hoverAt = (ev: PointerEvent): { pointer: Point; hoverId: string | null } => {
        const pointer = screenToWorld(localPoint(ev), viewportRef.current)
        return { pointer, hoverId: boxAt(latest.current.boxes, pointer, nodeId) }
      }
      startGesture(
        (ev) => setGesture({ kind: 'connect', from, ...hoverAt(ev) }),
        (ev, cancelled) => {
          const { hoverId } = hoverAt(ev)
          setGesture(null)
          if (cancelled || !hoverId) return
          const connection = resolveConnection(from, hoverId)
          // Le regole (niente collegamento a sé stesso né duplicati) sono in graphInteraction.
          if (connection && canConnect(latest.current.edges, connection)) latest.current.onConnect(connection)
        }
      )
    },
    [localPoint, startGesture]
  )

  /** Pressione su un collegamento (o sulla sua etichetta): lo seleziona. */
  const onEdgePointerDown = (e: ReactPointerEvent<Element>, id: string): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    setSelection(pressEdge(latest.current.selection, id, isAdditive(e)))
  }

  const handleNodeDoubleClick = useCallback((id: string) => latest.current.onNodeDoubleClick(id), [])

  // ── Zoom con la rotellina ───────────────────────────────────────────────────
  // Va registrato a mano, non con onWheel di React: per poter chiamare
  // preventDefault (altrimenti la pagina scorrerebbe) l'ascoltatore non deve
  // essere "passive", e React li registra passive.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const view = viewportRef.current
      applyViewport(zoomAt(view, anchor, view.zoom * wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyViewport])

  // ── Tastiera: Canc / Backspace elimina la selezione ──────────────────────────
  useEffect(() => {
    if (!keyboardEnabled) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const target = e.target as HTMLElement | null
      // Mai mentre si scrive in un campo di testo.
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const current = latest.current.selection
      if (current.nodes.length === 0 && current.edges.length === 0) return
      e.preventDefault()
      const plan = planDeletion(current, latest.current.edges)
      setSelection(EMPTY_SELECTION)
      latest.current.onDelete(plan)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [keyboardEnabled])

  // ── Pulsanti ────────────────────────────────────────────────────────────────
  const zoomBy = (factor: number): void => {
    const view = viewportRef.current
    applyViewport(zoomAt(view, { x: containerSize.width / 2, y: containerSize.height / 2 }, view.zoom * factor))
  }
  const fitToView = (): void => applyViewport(fitViewport(boundsOf(boxes), containerSize))

  // ── Disegno ─────────────────────────────────────────────────────────────────

  /** Rettangolo di ogni nodo come va DISEGNATO: durante un trascinamento i nodi mossi sono spostati. */
  const drawn = useMemo(() => {
    const moving = gesture?.kind === 'nodes' ? new Set(gesture.ids) : null
    const dx = gesture?.kind === 'nodes' ? gesture.dx : 0
    const dy = gesture?.kind === 'nodes' ? gesture.dy : 0
    const map = new Map<string, GraphBox>()
    for (const box of boxes) map.set(box.id, moving?.has(box.id) ? { ...box, x: box.x + dx, y: box.y + dy } : box)
    return map
  }, [boxes, gesture])

  const selectedNodes = useMemo(() => new Set(selection.nodes), [selection.nodes])
  const selectedEdges = useMemo(() => new Set(selection.edges), [selection.edges])

  const curves = useMemo(
    () =>
      edges.flatMap((edge) => {
        const source = drawn.get(edge.source)
        const target = drawn.get(edge.target)
        // Un collegamento con un'estremità mancante (nodo appena eliminato) non si disegna.
        if (!source || !target) return []
        return [{ edge, curve: bezierEdge(sourceHandlePoint(source), targetHandlePoint(target)) }]
      }),
    [edges, drawn]
  )

  /** Anteprima del collegamento in corso: dalla maniglia di partenza al puntatore. */
  const preview = useMemo(() => {
    if (gesture?.kind !== 'connect') return null
    const origin = drawn.get(gesture.from.nodeId)
    if (!origin) return null
    return gesture.from.handle === 'source'
      ? bezierEdge(sourceHandlePoint(origin), gesture.pointer)
      : bezierEdge(gesture.pointer, targetHandlePoint(origin))
  }, [gesture, drawn])

  const hoverId = gesture?.kind === 'connect' ? gesture.hoverId : null
  const dotGap = 20 * viewport.zoom

  const controlButton =
    'flex h-7 w-7 items-center justify-center border-b border-gray-200 text-gray-700 last:border-b-0 hover:bg-gray-100 ' +
    'dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'

  return (
    <div
      ref={containerRef}
      onPointerDown={onPanePointerDown}
      className="relative h-full w-full overflow-hidden"
      style={{
        cursor: panning ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect: 'none',
        // Sfondo a puntini che segue pan e zoom: la griglia è nel mondo, ogni 20 unità.
        backgroundImage: 'radial-gradient(circle, rgba(130,130,140,0.55) 1px, transparent 1.3px)',
        backgroundSize: `${dotGap}px ${dotGap}px`,
        backgroundPosition: `${viewport.x - dotGap / 2}px ${viewport.y - dotGap / 2}px`
      }}
    >
      {/* Strato del mondo: pan e zoom sono una sola trasformazione */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transformOrigin: '0 0',
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`
        }}
      >
        {/* Collegamenti. L'SVG è grande 1px ma con overflow visibile: le curve si disegnano ovunque. */}
        <svg style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none' }}>
          {curves.map(({ edge, curve }) => {
            const selected = selectedEdges.has(edge.id)
            return (
              <g key={edge.id}>
                <path d={curve.path} fill="none" stroke={selected ? EDGE_COLOR_SELECTED : EDGE_COLOR} strokeWidth={selected ? 2 : 1} />
                {/* Tracciato invisibile e largo: rende facile cliccare un filo sottile. */}
                <path
                  d={curve.path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={20}
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onPointerDown={(e) => onEdgePointerDown(e, edge.id)}
                  onDoubleClick={() => latest.current.onEdgeDoubleClick(edge.id)}
                />
              </g>
            )
          })}
          {preview && <path d={preview.path} fill="none" stroke={EDGE_COLOR} strokeWidth={1.5} strokeDasharray="5 4" />}
        </svg>

        {/* Etichette dei collegamenti, al centro della curva */}
        {curves.map(({ edge, curve }) =>
          edge.label ? (
            <div
              key={edge.id}
              onPointerDown={(e) => onEdgePointerDown(e, edge.id)}
              onDoubleClick={() => latest.current.onEdgeDoubleClick(edge.id)}
              style={{
                position: 'absolute',
                left: curve.labelX,
                top: curve.labelY,
                transform: 'translate(-50%, -50%)',
                padding: '2px 4px',
                borderRadius: 2,
                fontSize: 10,
                color: '#222',
                background: 'rgba(255,255,255,0.75)',
                outline: selectedEdges.has(edge.id) ? `1px solid ${EDGE_COLOR_SELECTED}` : undefined,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {edge.label}
            </div>
          ) : null
        )}

        {/* Nodi */}
        {nodes.map((node) => {
          const box = drawn.get(node.id)
          return (
            <GraphNodeView
              key={node.id}
              node={node}
              x={box?.x ?? node.x}
              y={box?.y ?? node.y}
              selected={selectedNodes.has(node.id)}
              hovered={hoverId === node.id}
              onPointerDown={onNodePointerDown}
              onHandlePointerDown={onHandlePointerDown}
              onDoubleClick={handleNodeDoubleClick}
              onSize={reportSize}
            />
          )
        })}
      </div>

      {/* Riquadro di selezione (in pixel del contenitore, fuori dallo strato scalato) */}
      {gesture?.kind === 'box' && (
        <div
          className="pointer-events-none absolute border border-blue-500 bg-blue-500/10"
          style={{ left: gesture.rect.x, top: gesture.rect.y, width: gesture.rect.width, height: gesture.rect.height }}
        />
      )}

      {/* Comandi di zoom: non devono avviare il pan dello sfondo */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute bottom-3 left-3 z-10 flex flex-col overflow-hidden rounded border border-gray-300 bg-white shadow dark:border-gray-600 dark:bg-gray-800"
        style={{ cursor: 'default' }}
      >
        <button type="button" className={controlButton} onClick={() => zoomBy(ZOOM_STEP)} aria-label={labels.zoomIn} title={labels.zoomIn}>
          <Plus size={14} />
        </button>
        <button type="button" className={controlButton} onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label={labels.zoomOut} title={labels.zoomOut}>
          <Minus size={14} />
        </button>
        <button type="button" className={controlButton} onClick={fitToView} aria-label={labels.fitView} title={labels.fitView}>
          <Maximize size={14} />
        </button>
      </div>
    </div>
  )
}
