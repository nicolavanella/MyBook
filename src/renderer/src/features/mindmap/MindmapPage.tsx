import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, LayoutGrid, Network, GripVertical, Trash2, ChevronDown, ChevronRight, Palette } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type CollisionDetection
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { useConfirm, usePrompt } from '@renderer/components/ConfirmDialog'
import AddMindmapNodeModal, { type MindmapNodeType } from './AddMindmapNodeModal'
import EditMindmapNodeModal, { type EditableNode } from './EditMindmapNodeModal'
import { useTranslation } from '@renderer/i18n/useTranslation'
import EdgeLabelModal from './EdgeLabelModal'
import GraphCanvas, { type GraphEdgeData, type GraphNodeData } from './GraphCanvas'
import type { DeletionPlan, NodeMove } from '@renderer/lib/graphInteraction'
import { useEntityNavigationStore } from '@renderer/stores/useEntityNavigationStore'
import { linkedEntityTarget } from '@renderer/lib/mindmapLinks'
import { UNGROUPED_COLUMN, computeKanbanMove, isBelowCenter, type KanbanDropTarget } from '@renderer/lib/kanbanOrder'
import { GROUP_COLOR_PRESETS, normalizeHexColor, tintColor } from '@renderer/lib/colorUtils'

interface MindmapMeta {
  id: string
  name: string
}

interface RawNode {
  id: string
  node_type: string
  label: string
  description: string
  ref_id: string | null
  group_id: string | null
  pos_x: number
  pos_y: number
  /** v0.4.1: ordine della card dentro il suo gruppo (kanban). */
  order_index: number
  /** v0.4.1: per i nodi-gruppo, colore di sfondo della colonna ("" = nessuno). */
  color: string
}

// Colore di sfondo per tipo di nodo, cosi' personaggi/luoghi/eventi/capitoli/scene
// si distinguono a colpo d'occhio dalle note libere.
const NODE_COLORS: Record<string, { background: string; border: string }> = {
  free_note: { background: '#f9fafb', border: '#d1d5db' },
  character: { background: '#eff6ff', border: '#93c5fd' },
  location: { background: '#f0fdf4', border: '#86efac' },
  object: { background: '#fff7ed', border: '#fdba74' },
  event: { background: '#fefce8', border: '#fde047' },
  chapter: { background: '#faf5ff', border: '#d8b4fe' },
  scene: { background: '#fdf2f8', border: '#f9a8d4' },
  group: { background: '#f1f5f9', border: '#64748b' }
}

const TYPE_ICON: Record<string, string> = {
  free_note: '📝',
  character: '👤',
  location: '📍',
  object: '📦',
  event: '📅',
  chapter: '📖',
  scene: '🎬',
  group: '🗂️'
}

export default function MindmapPage(): JSX.Element {
  const { activeProjectId } = useProjectStore()
  const confirm = useConfirm()
  const prompt = usePrompt()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const requestEntitySelect = useEntityNavigationStore((s) => s.requestSelect)
  const [mindmaps, setMindmaps] = useState<MindmapMeta[]>([])
  const [activeMindmapId, setActiveMindmapId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [rawNodes, setRawNodes] = useState<RawNode[]>([])
  const [edges, setEdges] = useState<GraphEdgeData[]>([])
  // v0.5.0: cambia quando si carica una mappa DIVERSA: il canvas adatta la vista ai nodi solo allora, non a ogni modifica.
  const [fitKey, setFitKey] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingNode, setEditingNode] = useState<RawNode | null>(null)
  const [view, setView] = useState<'graph' | 'kanban'>('graph')
  // v0.4.1: collegamento di cui si sta modificando l'etichetta (doppio click) e colonna kanban evidenziata durante il trascinamento.
  const [editingEdge, setEditingEdge] = useState<{ id: string; label: string } | null>(null)
  const [overColumnKey, setOverColumnKey] = useState<string | null>(null)

  useEffect(() => {
    if (!activeProjectId) return
    window.mybook.mindmaps.list(activeProjectId).then(async (list: MindmapMeta[]) => {
      if (list.length === 0) {
        const created = await window.mybook.mindmaps.ensureDefault(activeProjectId)
        list = [created]
      }
      setMindmaps(list)
      setActiveMindmapId(list[0].id)
    })
  }, [activeProjectId])

  const reload = useCallback(() => {
    if (!activeMindmapId) return
    let cancelled = false
    window.mybook.mindmap.load(activeMindmapId).then(({ nodes: n, edges: e }: any) => {
      if (cancelled) return
      setRawNodes(n)
      setEdges(
        e.map((edge: any) => ({
          id: edge.id,
          source: edge.source_node_id,
          target: edge.target_node_id,
          label: edge.label
        }))
      )
      setFitKey((previous) => (previous === activeMindmapId ? previous : activeMindmapId))
    }).catch((error) => {
      if (!cancelled) console.error('[Mindmap] caricamento fallito:', error)
    })
    return () => { cancelled = true }
  }, [activeMindmapId])

  useEffect(reload, [reload])

  // ───────── v0.5.0 — grafo: i dati arrivano dal canvas (GraphCanvas), che non modifica nulla da solo ─────────
  //
  // I nodi del grafo sono DERIVATI da rawNodes: una sola fonte per grafo e kanban. Prima c'erano
  // due copie da tenere allineate a mano (per esempio eliminando un gruppo dal kanban la copia
  // del grafo restava indietro).
  const graphNodes = useMemo<GraphNodeData[]>(
    () =>
      rawNodes.map((node) => {
        const colors = NODE_COLORS[node.node_type] ?? NODE_COLORS.free_note
        return {
          id: node.id,
          x: node.pos_x,
          y: node.pos_y,
          label: `${TYPE_ICON[node.node_type] ?? ''} ${node.label}`,
          background: colors.background,
          borderColor: colors.border,
          bold: node.node_type === 'group'
        }
      }),
    [rawNodes]
  )

  // Un collegamento con un nodo che non esiste più (eliminato altrove) non va mostrato.
  const graphEdges = useMemo(() => {
    const ids = new Set(rawNodes.map((n) => n.id))
    return edges.filter((e) => ids.has(e.source) && ids.has(e.target))
  }, [rawNodes, edges])

  /**
   * Nodi spostati nel grafo. Il canvas li segnala TUTTI (v0.5.0): prima si salvava solo il nodo
   * afferrato e, spostando una selezione multipla, gli altri tornavano al posto vecchio
   * alla riapertura. Aggiornare rawNodes tiene coerente anche l'ordine delle colonne del kanban,
   * che dipende da pos_x dei gruppi.
   */
  const handleNodesMoved = useCallback(
    (moves: NodeMove[]) => {
      const byId = new Map(moves.map((m) => [m.id, m]))
      setRawNodes((prev) =>
        prev.map((n) => {
          const move = byId.get(n.id)
          return move ? { ...n, pos_x: move.x, pos_y: move.y } : n
        })
      )
      Promise.all(moves.map((m) => window.mybook.mindmap.updateNode(m.id, { pos_x: m.x, pos_y: m.y }))).catch((error) => {
        console.error('[Mindmap] salvataggio posizioni fallito:', error)
        reload() // se il salvataggio non è riuscito si torna a ciò che è davvero nel database
      })
    },
    [reload]
  )

  /** Nuovo collegamento. Le regole (no a sé stesso, no duplicati) sono già state applicate dal canvas. */
  const handleConnect = useCallback(
    async (connection: { source: string; target: string }) => {
      if (!activeMindmapId || !activeProjectId) return
      try {
        const edge = await window.mybook.mindmap.createEdge({
          projectId: activeProjectId,
          mindmapId: activeMindmapId,
          sourceNodeId: connection.source,
          targetNodeId: connection.target
        })
        setEdges((eds) => [...eds, { id: edge.id, source: edge.source_node_id, target: edge.target_node_id, label: edge.label }])
      } catch (error) {
        console.error('[Mindmap] creazione collegamento fallita:', error)
      }
    },
    [activeMindmapId, activeProjectId]
  )

  /**
   * Canc/Backspace sulla selezione. Dalla 0.5.0 si eliminano dal database anche i collegamenti
   * selezionati: prima sparivano dalla vista ma restavano salvati e ricomparivano alla riapertura.
   * I collegamenti attaccati a un nodo eliminato cadono da soli nel database (ON DELETE CASCADE).
   */
  const handleDeleteSelection = useCallback(
    (plan: DeletionPlan) => {
      const removedNodes = new Set(plan.nodeIds)
      const removedEdges = new Set([...plan.edgeIds, ...plan.cascadedEdgeIds])
      setRawNodes((prev) =>
        prev.filter((n) => !removedNodes.has(n.id)).map((n) => (n.group_id && removedNodes.has(n.group_id) ? { ...n, group_id: null } : n))
      )
      setEdges((eds) => eds.filter((e) => !removedEdges.has(e.id)))
      Promise.all([
        ...plan.nodeIds.map((id) => window.mybook.mindmap.deleteNode(id)),
        ...plan.edgeIds.map((id) => window.mybook.mindmap.deleteEdge(id))
      ]).catch((error) => {
        console.error('[Mindmap] eliminazione fallita:', error)
        reload()
      })
    },
    [reload]
  )

  const handleNodeDoubleClick = useCallback(
    (id: string) => {
      const raw = rawNodes.find((n) => n.id === id)
      if (raw) setEditingNode(raw)
    },
    [rawNodes]
  )

  /** v0.4.1 — doppio click su un collegamento: aggiunge, modifica o toglie la sua etichetta. */
  const handleEdgeDoubleClick = useCallback(
    (id: string) => {
      const edge = edges.find((e) => e.id === id)
      setEditingEdge({ id, label: edge?.label ?? '' })
    },
    [edges]
  )

  const handleSaveEdgeLabel = async (label: string) => {
    if (!editingEdge) return
    const trimmed = label.trim()
    const { id } = editingEdge
    setEditingEdge(null)
    await window.mybook.mindmap.updateEdge(id, { label: trimmed })
    // Etichetta vuota = nessuna etichetta: `undefined` fa sparire del tutto il riquadro dell'etichetta nel grafo.
    setEdges((eds) => eds.map((e) => (e.id === id ? { ...e, label: trimmed || undefined } : e)))
  }

  /** v0.4.1 — dalla finestra "Modifica nodo": apre la scheda (Personaggio, Località, Oggetto, Evento) collegata al nodo. */
  const handleOpenLinked = () => {
    if (!editingNode) return
    const target = linkedEntityTarget(editingNode.node_type, editingNode.ref_id)
    if (!target) return
    requestEntitySelect(target.entityType, target.id) // la pagina di destinazione seleziona l'elemento appena caricata la lista
    setEditingNode(null)
    navigate(target.route)
  }

  const handleCreateNode = async (input: {
    nodeType: MindmapNodeType
    label: string
    refId: string | null
    description: string
  }) => {
    if (!activeProjectId || !activeMindmapId) return
    const node = await window.mybook.mindmap.createNode({
      projectId: activeProjectId,
      mindmapId: activeMindmapId,
      nodeType: input.nodeType,
      refId: input.refId,
      label: input.label,
      description: input.description,
      posX: 100 + Math.random() * 400,
      posY: 100 + Math.random() * 300
    })
    setRawNodes((prev) => [...prev, node])
    setModalOpen(false)
  }

  const handleAddGroup = async () => {
    if (!activeProjectId || !activeMindmapId) return
    const name = await prompt({ message: t('mindmap.groupNamePrompt'), defaultValue: t('chapters.newGroup') })
    if (!name) return
    const node = await window.mybook.mindmap.createNode({
      projectId: activeProjectId,
      mindmapId: activeMindmapId,
      nodeType: 'group',
      refId: null,
      label: name,
      description: '',
      posX: 50,
      posY: 50
    })
    setRawNodes((prev) => [...prev, node])
  }

  const handleSaveNodeEdit = async (label: string, description: string, groupId: string | null) => {
    if (!editingNode) return
    const isEntityLinked = editingNode.node_type !== 'free_note' && editingNode.node_type !== 'group'
    const fields: Record<string, unknown> = { description, group_id: groupId }
    if (!isEntityLinked) fields.label = label
    await window.mybook.mindmap.updateNode(editingNode.id, fields)
    setEditingNode(null)
    reload()
  }

  const handleDeleteNodeFromModal = async () => {
    if (!editingNode) return
    const ok = await confirm({ message: t('mindmap.confirmDeleteNode'), confirmLabel: t('common.delete'), danger: true })
    if (!ok) return
    await window.mybook.mindmap.deleteNode(editingNode.id)
    setEditingNode(null)
    reload()
  }

  const addMindmap = async () => {
    if (!activeProjectId) return
    const created = await window.mybook.mindmaps.create(activeProjectId, t('mindmap.defaultName'))
    setMindmaps((prev) => [...prev, created])
    setActiveMindmapId(created.id)
  }

  const renameMindmap = async (id: string, name: string) => {
    await window.mybook.mindmaps.rename(id, name)
    setMindmaps((prev) => prev.map((m) => (m.id === id ? { ...m, name } : m)))
    setRenamingId(null)
  }

  /** Stessa UX di "Elimina timeline" in TimelinePage.tsx: richiede conferma e non permette di restare senza nessuna mappa. */
  const deleteMindmap = async (id: string) => {
    if (mindmaps.length <= 1) return
    const ok = await confirm({
      message: t('mindmap.confirmDeleteMap'),
      confirmLabel: t('common.delete'),
      danger: true
    })
    if (!ok) return
    await window.mybook.mindmaps.delete(id)
    const remaining = mindmaps.filter((m) => m.id !== id)
    setMindmaps(remaining)
    setActiveMindmapId(remaining[0]?.id ?? null)
  }

  if (!activeProjectId) return <div className="p-6 text-sm text-gray-400">{t('common.openProject')}</div>

  const groupNodes = rawNodes.filter((n) => n.node_type === 'group').sort((a, b) => a.pos_x - b.pos_x)
  const groupOptions = groupNodes.map((g) => ({ id: g.id, label: g.label }))

  const kanbanSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set())
  const [draggedCard, setDraggedCard] = useState<RawNode | null>(null)

  const toggleColumnCollapse = (id: string) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renameGroup = async (id: string, label: string) => {
    await window.mybook.mindmap.updateNode(id, { label })
    setRawNodes((prev) => prev.map((n) => (n.id === id ? { ...n, label } : n)))
    setRenamingId(null)
  }

  const deleteGroup = async (id: string) => {
    const ok = await confirm({
      message: t('mindmap.confirmDeleteGroup', { ungrouped: t('entities.ungrouped') }),
      confirmLabel: t('common.delete'),
      danger: true
    })
    if (!ok) return
    await window.mybook.mindmap.deleteNode(id)
    // group_id ha ON DELETE SET NULL (vedi migrazione 002): i nodi della
    // colonna restano, semplicemente "sganciati" dal gruppo eliminato.
    setRawNodes((prev) => prev.filter((n) => n.id !== id).map((n) => (n.group_id === id ? { ...n, group_id: null } : n)))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id)) // i collegamenti del gruppo cadono nel database (CASCADE)
  }

  // ───────── v0.4.1 — kanban: riordino delle card dentro e fra i gruppi ─────────
  //
  // Un solo DndContext gestisce due tipi di trascinamento:
  //  - COLONNE ('column-sort'): riordino dei gruppi (comportamento già esistente);
  //  - CARD ('card'): spostamento fra gruppi E riordino dentro il gruppo (novità 0.4.1).
  //
  // Perché prima il rilascio funzionava solo "al centro del gruppo": il rilevamento usava closestCenter
  // fra TUTTI i bersagli, quindi vicino ai bordi vinceva il bersaglio sbagliato (la colonna intesa come
  // elemento ordinabile, che le card ignoravano). Ora:
  //  - il bersaglio è quello SOTTO IL PUNTATORE (pointerWithin), non quello col centro più vicino;
  //  - sotto una card → si inserisce prima/dopo di essa; altrove nella colonna → in fondo;
  //  - l'INTERA colonna (intestazione, margini, spazio vuoto) è un bersaglio valido, non solo la lista.

  /** Card di una colonna nel loro ordine (order_index); per "Senza gruppo" key = UNGROUPED_COLUMN. */
  const nodesOfColumn = (key: string): RawNode[] =>
    rawNodes
      .filter((n) => (key === UNGROUPED_COLUMN ? !n.group_id && n.node_type !== 'group' : n.group_id === key))
      .sort((x, y) => x.order_index - y.order_index)

  /** colonna → id delle card, nel formato che si aspetta computeKanbanMove. */
  const columnMap = (): Record<string, string[]> => {
    const map: Record<string, string[]> = { [UNGROUPED_COLUMN]: nodesOfColumn(UNGROUPED_COLUMN).map((n) => n.id) }
    for (const g of groupNodes) map[g.id] = nodesOfColumn(g.id).map((n) => n.id)
    return map
  }

  const kanbanCollision: CollisionDetection = (args) => {
    if (args.active.data.current?.type === 'column-sort') {
      // Le colonne si riordinano fra loro: contano solo le altre colonne ordinabili.
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === 'column-sort') })
    }
    // Tipo di un bersaglio, ricavato dal suo contenitore (nei risultati di collisione `data` ha un'altra forma).
    const typeOf = (id: string | number) => args.droppableContainers.find((d) => d.id === id)?.data.current?.type
    const hits = pointerWithin(args)
    const otherCard = hits.find((c) => typeOf(c.id) === 'card' && c.id !== args.active.id)
    if (otherCard) return [otherCard]
    // Sopra la propria posizione originale: rilascio "su se stessa" → nessun effetto (e NON "in fondo alla colonna").
    const self = hits.find((c) => c.id === args.active.id)
    if (self) return [self]
    const column = hits.find((c) => typeOf(c.id) === 'column')
    return column ? [column] : []
  }

  /**
   * Traccia la card in trascinamento per mostrarla nella DragOverlay (vedi sotto): senza, la card
   * "sotto le dita" restava dentro il flusso normale del DOM e finiva dietro le altre colonne, perché
   * ciascuna colonna ha il proprio `overflow-auto` che ritaglia qualunque figlio spostato oltre i
   * propri bordi — va "estratta" dal flusso con un portale a livello di documento, che è cosa fa DragOverlay.
   */
  const handleDragStart = (e: DragStartEvent) => {
    if (e.active.data.current?.type === 'card') {
      setDraggedCard(rawNodes.find((n) => n.id === e.active.id) ?? null)
    }
  }

  /** Evidenzia la colonna che accoglierebbe la card se la si rilasciasse adesso. */
  const handleDragOver = (e: DragOverEvent) => {
    if (e.active.data.current?.type !== 'card') return
    const key = (e.over?.data.current as { columnKey?: string } | undefined)?.columnKey ?? null
    setOverColumnKey(key)
  }

  const handleDragCancel = () => {
    setDraggedCard(null)
    setOverColumnKey(null)
  }

  const handleGroupDragEnd = (e: DragEndEvent) => {
    setDraggedCard(null)
    setOverColumnKey(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    if (active.data.current?.type === 'card') {
      const overData = over.data.current as { type?: string; columnKey?: string } | undefined
      let target: KanbanDropTarget | null = null
      if (overData?.type === 'card') {
        const moved = active.rect.current.translated
        // Sotto il centro della card bersaglio → dopo di essa; sopra → prima.
        const after = moved ? isBelowCenter({ top: moved.top, height: moved.height }, { top: over.rect.top, height: over.rect.height }) : false
        target = { kind: 'card', overId: String(over.id), after }
      } else if (overData?.type === 'column' && overData.columnKey) {
        target = { kind: 'column', columnId: overData.columnKey }
      }
      const move = target ? computeKanbanMove(columnMap(), String(active.id), target) : null
      if (!move || !activeMindmapId) return
      // Aggiornamento ottimistico: l'interfaccia risponde subito, il salvataggio avviene in un'unica transazione.
      setRawNodes((prev) =>
        prev.map((n) => {
          const index = move.orderedIds.indexOf(n.id)
          return index >= 0 ? { ...n, group_id: move.groupId, order_index: index } : n
        })
      )
      window.mybook.mindmap
        .reorderNodes({ mindmapId: activeMindmapId, groupId: move.groupId, orderedIds: move.orderedIds })
        .catch((error: unknown) => {
          console.error('[Mindmap] riordino fallito:', error)
          reload() // ripristina lo stato reale dal database
        })
      return
    }

    if (active.id === UNGROUPED_COLUMN || over.id === UNGROUPED_COLUMN) return // colonna fissa, non riordinabile
    const oldIndex = groupNodes.findIndex((g) => g.id === active.id)
    const newIndex = groupNodes.findIndex((g) => g.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(groupNodes, oldIndex, newIndex)
    // Riusa pos_x come chiave d'ordine per le colonne kanban (nessuna colonna dedicata nello schema): riscrive 0,1,2… nel nuovo ordine.
    reordered.forEach((g, i) => window.mybook.mindmap.updateNode(g.id, { pos_x: i }))
    setRawNodes((prev) =>
      prev.map((n) => {
        const idx = reordered.findIndex((g) => g.id === n.id)
        return idx >= 0 ? { ...n, pos_x: idx } : n
      })
    )
  }

  /** v0.4.1: colore di sfondo di un gruppo (stringa vuota = nessun colore). Si salva nella colonna `color` del nodo-gruppo. */
  const setGroupColor = (id: string, color: string) => {
    void window.mybook.mindmap.updateNode(id, { color })
    setRawNodes((prev) => prev.map((n) => (n.id === id ? { ...n, color } : n)))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {mindmaps.map((m) => (
            <div key={m.id} className="group relative">
              {renamingId === m.id ? (
                <input
                  autoFocus
                  defaultValue={m.name}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => renameMindmap(m.id, e.target.value.trim() || m.name)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className="border-b-2 border-blue-500 px-3 py-1.5 text-sm outline-none"
                />
              ) : (
                <button
                  onDoubleClick={() => setRenamingId(m.id)}
                  onClick={() => setActiveMindmapId(m.id)}
                  className={`border-b-2 px-3 py-1.5 text-sm ${
                    activeMindmapId === m.id
                      ? 'border-blue-600 font-medium text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m.name}
                </button>
              )}
              {mindmaps.length > 1 && activeMindmapId === m.id && renamingId !== m.id && (
                <button
                  onClick={() => deleteMindmap(m.id)}
                  className="absolute -right-1 -top-1 hidden rounded-full bg-white text-gray-300 hover:text-red-600 group-hover:block"
                  title={t('mindmap.deleteMap')}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button onClick={addMindmap} className="px-2 py-1.5 text-gray-400 hover:text-gray-700" title={t('mindmap.defaultName')}>
            <Plus size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setView(view === 'graph' ? 'kanban' : 'graph')}
            className="flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            {view === 'graph' ? <LayoutGrid size={14} /> : <Network size={14} />}
            {view === 'graph' ? t('mindmap.viewKanban') : t('mindmap.viewGraph')}
          </button>
          <button
            onClick={handleAddGroup}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            {t('mindmap.addGroup')}
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white shadow"
          >
            {t('mindmap.addNode')}
          </button>
        </div>
      </div>

      <div className="relative flex-1">
        {view === 'graph' ? (
          <>
            <div className="absolute left-4 top-4 z-10 rounded bg-white/90 px-3 py-2 text-xs text-gray-500 shadow">
              {t('mindmap.hint')}
            </div>
            <GraphCanvas
              nodes={graphNodes}
              edges={graphEdges}
              fitSignal={fitKey}
              keyboardEnabled={!modalOpen && !editingNode && !editingEdge}
              labels={{ zoomIn: t('mindmap.zoomIn'), zoomOut: t('mindmap.zoomOut'), fitView: t('mindmap.fitView') }}
              onNodesMoved={handleNodesMoved}
              onConnect={handleConnect}
              onDelete={handleDeleteSelection}
              onNodeDoubleClick={handleNodeDoubleClick}
              onEdgeDoubleClick={handleEdgeDoubleClick}
            />
          </>
        ) : (
          <div className="flex h-full gap-4 overflow-x-auto p-4">
            <DndContext
              sensors={kanbanSensors}
              collisionDetection={kanbanCollision}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleGroupDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext items={groupNodes.map((g) => g.id)} strategy={horizontalListSortingStrategy}>
                {groupNodes.map((group) => (
                  <KanbanColumn
                    key={group.id}
                    columnKey={group.id}
                    group={group}
                    nodes={nodesOfColumn(group.id)}
                    draggable
                    highlighted={overColumnKey === group.id}
                    collapsed={collapsedColumns.has(group.id)}
                    onToggleCollapse={() => toggleColumnCollapse(group.id)}
                    isRenaming={renamingId === group.id}
                    onStartRename={() => setRenamingId(group.id)}
                    onRename={(label) => renameGroup(group.id, label)}
                    onDelete={() => deleteGroup(group.id)}
                    onColorChange={(color) => setGroupColor(group.id, color)}
                    onCardClick={setEditingNode}
                  />
                ))}
              </SortableContext>
              {/* Colonna "Senza gruppo": sempre in fondo, non trascinabile, non rinominabile/eliminabile/colorabile */}
              <KanbanColumn
                columnKey={UNGROUPED_COLUMN}
                group={{ id: UNGROUPED_COLUMN, label: t('entities.ungrouped') } as RawNode}
                nodes={nodesOfColumn(UNGROUPED_COLUMN)}
                draggable={false}
                highlighted={overColumnKey === UNGROUPED_COLUMN}
                collapsed={collapsedColumns.has(UNGROUPED_COLUMN)}
                onToggleCollapse={() => toggleColumnCollapse(UNGROUPED_COLUMN)}
                isRenaming={false}
                onCardClick={setEditingNode}
              />
              {/* Portale a livello di documento: la card segue il puntatore sopra
                  qualunque colonna, senza essere ritagliata dal loro overflow-auto. */}
              <DragOverlay>{draggedCard && <KanbanCardPreview node={draggedCard} />}</DragOverlay>
            </DndContext>
          </div>
        )}
      </div>

      {modalOpen && activeProjectId && (
        <AddMindmapNodeModal
          projectId={activeProjectId}
          onClose={() => setModalOpen(false)}
          onCreate={handleCreateNode}
        />
      )}

      {editingNode && (
        <EditMindmapNodeModal
          node={editingNode as EditableNode}
          groupOptions={groupOptions.filter((g) => g.id !== editingNode.id)}
          onClose={() => setEditingNode(null)}
          onSave={handleSaveNodeEdit}
          onDelete={handleDeleteNodeFromModal}
          onOpenLinked={linkedEntityTarget(editingNode.node_type, editingNode.ref_id) ? handleOpenLinked : undefined}
        />
      )}

      {editingEdge && <EdgeLabelModal initialLabel={editingEdge.label} onSave={handleSaveEdgeLabel} onClose={() => setEditingEdge(null)} />}
    </div>
  )
}

/**
 * Card kanban (v0.4.1: `useSortable`, prima `useDraggable`). Essere "ordinabile" permette di riordinare
 * le card dentro la colonna: quelle intorno si spostano per far posto. Soglia di attivazione di 5px
 * condivisa dal sensore, così un click semplice apre ancora il modale di modifica.
 */
function KanbanCard({ node, columnKey, onClick }: { node: RawNode; columnKey: string; onClick: () => void }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
    data: { type: 'card', columnKey }
  })
  // Mentre si trascina, la card "sotto le dita" è la DragOverlay (vedi KanbanCardPreview); l'originale resta
  // quasi trasparente a segnare il posto, e le card intorno scorrono per far spazio.
  return (
    <button
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.25 : 1 }}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className="block w-full cursor-grab rounded border border-gray-200 bg-white p-2 text-left text-xs shadow-sm hover:border-gray-300"
    >
      <div className="font-medium">
        {TYPE_ICON[node.node_type]} {node.label}
      </div>
      {node.description && <div className="mt-0.5 line-clamp-2 text-gray-400">{node.description}</div>}
    </button>
  )
}

/** Contenuto statico mostrato nella DragOverlay mentre una card è trascinata: stesso aspetto di KanbanCard ma senza gli hook di drag (li fornisce già DragOverlay). */
function KanbanCardPreview({ node }: { node: RawNode }): JSX.Element {
  return (
    <div className="w-64 cursor-grabbing rounded border border-gray-300 bg-white p-2 text-left text-xs shadow-lg">
      <div className="font-medium">
        {TYPE_ICON[node.node_type]} {node.label}
      </div>
      {node.description && <div className="mt-0.5 line-clamp-2 text-gray-400">{node.description}</div>}
    </div>
  )
}

/**
 * Menu del colore di sfondo di un gruppo (v0.4.1): colori predefiniti, un selettore libero e "nessun
 * colore". Si apre al click e si chiude cliccando fuori o con Esc.
 */
function GroupColorMenu({ color, onChange }: { color: string; onChange: (color: string) => void }): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const choose = (value: string) => {
    onChange(value)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t('mindmap.groupColor')}
        className={`text-gray-300 hover:text-gray-600 group-hover/col:opacity-100 ${open ? 'opacity-100' : 'opacity-0'}`}
      >
        <Palette size={13} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-600 dark:bg-gray-800">
          <div className="grid grid-cols-4 gap-1.5">
            {GROUP_COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => choose(preset)}
                title={preset}
                className={`h-6 rounded border ${normalizeHexColor(color) === preset ? 'border-gray-700 ring-1 ring-gray-700' : 'border-gray-200'}`}
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>
          <label className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
            {t('mindmap.groupColorCustom')}
            <input
              type="color"
              value={normalizeHexColor(color) ?? '#cbd5e1'}
              onChange={(e) => onChange(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border border-gray-300 bg-transparent p-0"
            />
          </label>
          <button
            type="button"
            onClick={() => choose('')}
            disabled={!color}
            className="mt-2 w-full rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {t('mindmap.groupColorNone')}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Colonna kanban: trascinabile (per riordinare i gruppi) tranne quella "Senza gruppo", sempre fissa in fondo.
 * Rinomina/elimina/colora/collassa per le colonne vere (non per "Senza gruppo").
 *
 * v0.4.1: l'INTERA colonna è un bersaglio di rilascio per le card (prima solo la lista interna), con
 * sfondo personalizzabile (`group.color`, applicato con trasparenza) e un ordine interno delle card.
 */
function KanbanColumn({
  columnKey,
  group,
  nodes,
  draggable,
  highlighted,
  collapsed,
  onToggleCollapse,
  isRenaming,
  onStartRename,
  onRename,
  onDelete,
  onColorChange,
  onCardClick
}: {
  columnKey: string
  group: RawNode
  nodes: RawNode[]
  draggable: boolean
  highlighted: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  isRenaming: boolean
  onStartRename?: () => void
  onRename?: (label: string) => void
  onDelete?: () => void
  onColorChange?: (color: string) => void
  onCardClick: (n: RawNode) => void
}): JSX.Element {
  const { t } = useTranslation()
  const sortable = useSortable({ id: group.id, disabled: !draggable, data: { type: 'column-sort' } })
  const style = draggable
    ? { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.5 : 1 }
    : undefined
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `col-drop:${columnKey}`,
    data: { type: 'column', columnKey }
  })
  // Lo stesso elemento è sia colonna ordinabile sia bersaglio per le card: due ref sullo stesso nodo.
  const setRefs = (el: HTMLElement | null) => {
    if (draggable) sortable.setNodeRef(el)
    setDropRef(el)
  }
  // Sfondo personalizzato: il colore del gruppo con trasparenza (leggibile in tema chiaro e scuro).
  const tint = tintColor(group.color, 0.35)
  const dropHighlight = isOver || highlighted
  const columnStyle = { ...style, ...(tint ? { backgroundColor: tint } : {}) }

  if (collapsed) {
    return (
      <div
        ref={setRefs}
        style={columnStyle}
        className={`flex w-10 shrink-0 flex-col items-center gap-2 rounded py-2 ${tint ? '' : 'bg-gray-50'} ${dropHighlight ? 'ring-2 ring-blue-400' : ''}`}
      >
        <button onClick={onToggleCollapse} className="text-gray-400 hover:text-gray-700" title={t('mindmap.expandColumn')}>
          <ChevronRight size={14} />
        </button>
        <span className="rotate-180 text-xs font-medium text-gray-600 [writing-mode:vertical-rl]">
          {group.label} ({nodes.length})
        </span>
      </div>
    )
  }

  return (
    <div
      ref={setRefs}
      style={columnStyle}
      className={`flex w-64 shrink-0 flex-col rounded p-2 ${tint ? '' : 'bg-gray-50'} ${dropHighlight ? 'ring-2 ring-blue-400' : ''}`}
    >
      <div className="group/col mb-2 flex items-center gap-1 px-1 text-sm font-medium text-gray-600">
        {draggable && (
          <button {...sortable.attributes} {...sortable.listeners} className="cursor-grab text-gray-300 hover:text-gray-500">
            <GripVertical size={14} />
          </button>
        )}
        <button onClick={onToggleCollapse} className="text-gray-400 hover:text-gray-700" title={t('mindmap.collapseColumn')}>
          <ChevronDown size={13} />
        </button>
        {isRenaming ? (
          <input
            autoFocus
            defaultValue={group.label}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => onRename?.(e.target.value.trim() || group.label)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="min-w-0 flex-1 rounded border border-blue-400 px-1 text-sm outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate" onDoubleClick={onStartRename}>
            {group.label} <span className="font-normal text-gray-400">({nodes.length})</span>
          </span>
        )}
        {onColorChange && <GroupColorMenu color={group.color ?? ''} onChange={onColorChange} />}
        {onDelete && (
          <button onClick={onDelete} className="text-gray-300 opacity-0 hover:text-red-600 group-hover/col:opacity-100" title={t('entities.deleteGroup')}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <div className="flex-1 space-y-2 overflow-auto rounded">
        {nodes.length === 0 && <p className="px-1 py-2 text-center text-xs italic text-gray-300">{t('mindmap.dropHere')}</p>}
        <SortableContext items={nodes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
          {nodes.map((n) => (
            <KanbanCard key={n.id} node={n} columnKey={columnKey} onClick={() => onCardClick(n)} />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}
