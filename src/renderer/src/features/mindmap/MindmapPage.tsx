import { useCallback, useEffect, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Plus, LayoutGrid, Network, GripVertical, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { useConfirm, usePrompt } from '@renderer/components/ConfirmDialog'
import AddMindmapNodeModal, { type MindmapNodeType } from './AddMindmapNodeModal'
import EditMindmapNodeModal, { type EditableNode } from './EditMindmapNodeModal'

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

function nodeStyle(nodeType: string) {
  const colors = NODE_COLORS[nodeType] ?? NODE_COLORS.free_note
  return {
    background: colors.background,
    border: `1.5px solid ${colors.border}`,
    borderRadius: 8,
    padding: '4px 10px',
    fontSize: 13,
    fontWeight: nodeType === 'group' ? 600 : 400
  }
}

export default function MindmapPage(): JSX.Element {
  const { activeProjectId } = useProjectStore()
  const confirm = useConfirm()
  const prompt = usePrompt()
  const [mindmaps, setMindmaps] = useState<MindmapMeta[]>([])
  const [activeMindmapId, setActiveMindmapId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [rawNodes, setRawNodes] = useState<RawNode[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingNode, setEditingNode] = useState<RawNode | null>(null)
  const [view, setView] = useState<'graph' | 'kanban'>('graph')

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
      setNodes(
        n.map((node: RawNode) => ({
          id: node.id,
          position: { x: node.pos_x, y: node.pos_y },
          data: { label: `${TYPE_ICON[node.node_type] ?? ''} ${node.label}` },
          style: nodeStyle(node.node_type)
        }))
      )
      setEdges(
        e.map((edge: any) => ({
          id: edge.id,
          source: edge.source_node_id,
          target: edge.target_node_id,
          label: edge.label
        }))
      )
    }).catch((error) => {
      if (!cancelled) console.error('[Mindmap] caricamento fallito:', error)
    })
    return () => { cancelled = true }
  }, [activeMindmapId])

  useEffect(reload, [reload])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds))
  }, [])

  const onNodeDragStop = useCallback((_: any, node: Node) => {
    window.mybook.mindmap.updateNode(node.id, { pos_x: node.position.x, pos_y: node.position.y })
  }, [])

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!activeMindmapId || !activeProjectId || !connection.source || !connection.target) return
      const edge = await window.mybook.mindmap.createEdge({
        projectId: activeProjectId,
        mindmapId: activeMindmapId,
        sourceNodeId: connection.source,
        targetNodeId: connection.target
      })
      setEdges((eds) =>
        addEdge({ id: edge.id, source: edge.source_node_id, target: edge.target_node_id }, eds)
      )
    },
    [activeMindmapId, activeProjectId]
  )

  const onDeleteSelectedNodes = useCallback((deleted: Node[]) => {
    deleted.forEach((n) => window.mybook.mindmap.deleteNode(n.id))
  }, [])

  const onNodeDoubleClick = useCallback(
    (_: any, node: Node) => {
      const raw = rawNodes.find((n) => n.id === node.id)
      if (raw) setEditingNode(raw)
    },
    [rawNodes]
  )

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
    setNodes((nds) => [
      ...nds,
      {
        id: node.id,
        position: { x: node.pos_x, y: node.pos_y },
        data: { label: `${TYPE_ICON[node.node_type] ?? ''} ${node.label}` },
        style: nodeStyle(node.node_type)
      }
    ])
    setModalOpen(false)
  }

  const handleAddGroup = async () => {
    if (!activeProjectId || !activeMindmapId) return
    const name = await prompt({ message: 'Nome del gruppo (colonna kanban):', defaultValue: 'Nuovo gruppo' })
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
    setNodes((nds) => [
      ...nds,
      { id: node.id, position: { x: node.pos_x, y: node.pos_y }, data: { label: `🗂️ ${node.label}` }, style: nodeStyle('group') }
    ])
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
    const ok = await confirm({ message: 'Eliminare questo nodo?', confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    await window.mybook.mindmap.deleteNode(editingNode.id)
    setEditingNode(null)
    reload()
  }

  const addMindmap = async () => {
    if (!activeProjectId) return
    const created = await window.mybook.mindmaps.create(activeProjectId, 'Nuova mappa')
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
      message: 'Eliminare questa mappa concettuale e tutti i suoi nodi/collegamenti?',
      confirmLabel: 'Elimina',
      danger: true
    })
    if (!ok) return
    await window.mybook.mindmaps.delete(id)
    const remaining = mindmaps.filter((m) => m.id !== id)
    setMindmaps(remaining)
    setActiveMindmapId(remaining[0]?.id ?? null)
  }

  if (!activeProjectId) return <div className="p-6 text-sm text-gray-400">Apri un progetto dal Manoscritto.</div>

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
      message: 'Eliminare questo gruppo/colonna? I nodi al suo interno non verranno eliminati, torneranno "Senza gruppo".',
      confirmLabel: 'Elimina',
      danger: true
    })
    if (!ok) return
    await window.mybook.mindmap.deleteNode(id)
    // group_id ha ON DELETE SET NULL (vedi migrazione 002): i nodi della
    // colonna restano, semplicemente "sganciati" dal gruppo eliminato.
    setRawNodes((prev) => prev.filter((n) => n.id !== id).map((n) => (n.group_id === id ? { ...n, group_id: null } : n)))
  }

  /**
   * Un solo DndContext gestisce sia il riordino delle colonne (drag&drop già
   * presente) sia — novità di questa versione — lo spostamento delle singole
   * card tra colonne: le card usano `useDraggable` (non `useSortable`, dato
   * che non serve un ordine all'interno della colonna, solo l'appartenenza),
   * mentre l'intera area di una colonna è un `useDroppable` che porta con sé
   * il group_id di destinazione (null per "Senza gruppo").
   */
  /**
   * Traccia la card in trascinamento per mostrarla nella DragOverlay (vedi
   * sotto): senza, la card "sotto le dita" restava dentro il flusso normale
   * del DOM e finiva dietro le altre colonne, perché ciascuna colonna ha il
   * proprio `overflow-auto` che ritaglia (clip) qualunque figlio spostato
   * oltre i propri bordi — un semplice z-index più alto sulla card non basta
   * a risolverlo, va "estratta" dal flusso con un portale a livello di
   * documento, che è esattamente cosa fa DragOverlay.
   */
  const handleDragStart = (e: DragStartEvent) => {
    if (e.active.data.current?.type === 'card') {
      setDraggedCard(rawNodes.find((n) => n.id === e.active.id) ?? null)
    }
  }

  const handleGroupDragEnd = (e: DragEndEvent) => {
    setDraggedCard(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    if (active.data.current?.type === 'card') {
      const overData = over.data.current as { type?: string; groupId?: string | null } | undefined
      if (overData?.type !== 'column') return
      const newGroupId = overData.groupId ?? null
      const node = rawNodes.find((n) => n.id === active.id)
      if (!node || node.group_id === newGroupId) return
      window.mybook.mindmap.updateNode(String(active.id), { group_id: newGroupId })
      setRawNodes((prev) => prev.map((n) => (n.id === active.id ? { ...n, group_id: newGroupId } : n)))
      return
    }

    if (active.id === '__ungrouped__' || over.id === '__ungrouped__') return // colonna fissa, non riordinabile
    const oldIndex = groupNodes.findIndex((g) => g.id === active.id)
    const newIndex = groupNodes.findIndex((g) => g.id === over.id)
    const reordered = arrayMove(groupNodes, oldIndex, newIndex)
    // Riusa pos_x come chiave d'ordine per le colonne kanban (nessuna
    // colonna dedicata nello schema): riscrive 0,1,2… nel nuovo ordine.
    reordered.forEach((g, i) => window.mybook.mindmap.updateNode(g.id, { pos_x: i }))
    setRawNodes((prev) =>
      prev.map((n) => {
        const idx = reordered.findIndex((g) => g.id === n.id)
        return idx >= 0 ? { ...n, pos_x: idx } : n
      })
    )
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
                  title="Elimina mappa"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button onClick={addMindmap} className="px-2 py-1.5 text-gray-400 hover:text-gray-700" title="Nuova mappa">
            <Plus size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setView(view === 'graph' ? 'kanban' : 'graph')}
            className="flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            {view === 'graph' ? <LayoutGrid size={14} /> : <Network size={14} />}
            Vista {view === 'graph' ? 'kanban' : 'grafo'}
          </button>
          <button
            onClick={handleAddGroup}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            + Gruppo
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white shadow"
          >
            + Aggiungi nodo
          </button>
        </div>
      </div>

      <div className="relative flex-1">
        {view === 'graph' ? (
          <>
            <div className="absolute left-4 top-4 z-10 rounded bg-white/90 px-3 py-2 text-xs text-gray-500 shadow">
              Trascina per collegare · doppio click per modificare · Canc per eliminare
            </div>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStop={onNodeDragStop}
              onConnect={onConnect}
              onNodesDelete={onDeleteSelectedNodes}
              onNodeDoubleClick={onNodeDoubleClick}
              deleteKeyCode={['Backspace', 'Delete']}
              fitView
            >
              <Background />
              <Controls />
            </ReactFlow>
          </>
        ) : (
          <div className="flex h-full gap-4 overflow-x-auto p-4">
            <DndContext sensors={kanbanSensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleGroupDragEnd}>
              <SortableContext items={groupNodes.map((g) => g.id)} strategy={horizontalListSortingStrategy}>
                {groupNodes.map((group) => (
                  <KanbanColumn
                    key={group.id}
                    group={group}
                    nodes={rawNodes.filter((n) => n.group_id === group.id)}
                    draggable
                    collapsed={collapsedColumns.has(group.id)}
                    onToggleCollapse={() => toggleColumnCollapse(group.id)}
                    isRenaming={renamingId === group.id}
                    onStartRename={() => setRenamingId(group.id)}
                    onRename={(label) => renameGroup(group.id, label)}
                    onDelete={() => deleteGroup(group.id)}
                    onCardClick={setEditingNode}
                  />
                ))}
              </SortableContext>
              {/* Colonna "Senza gruppo": sempre in fondo, non trascinabile, non rinominabile/eliminabile */}
              <KanbanColumn
                group={{ id: '__ungrouped__', label: 'Senza gruppo' } as RawNode}
                nodes={rawNodes.filter((n) => !n.group_id && n.node_type !== 'group')}
                draggable={false}
                collapsed={collapsedColumns.has('__ungrouped__')}
                onToggleCollapse={() => toggleColumnCollapse('__ungrouped__')}
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
        />
      )}
    </div>
  )
}

/** Card kanban trascinabile: `useDraggable` (non `useSortable`, non serve un ordine interno alla colonna) con soglia di attivazione di 5px condivisa dal sensore, cosi' un click semplice apre ancora il modale di modifica. */
function KanbanCard({ node, onClick }: { node: RawNode; onClick: () => void }): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: node.id, data: { type: 'card' } })
  // Nessun transform qui: mentre si trascina, la visuale reale è affidata
  // interamente alla DragOverlay (vedi handleDragStart/KanbanCardPreview);
  // l'originale si limita a diventare quasi invisibile per segnare il posto.
  return (
    <button
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.25 : 1 }}
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

/** Colonna kanban: trascinabile (per riordinare i gruppi) tranne quella "Senza gruppo", sempre fissa in fondo. Rinomina/elimina/collassa per le colonne vere (non per "Senza gruppo"). */
function KanbanColumn({
  group,
  nodes,
  draggable,
  collapsed,
  onToggleCollapse,
  isRenaming,
  onStartRename,
  onRename,
  onDelete,
  onCardClick
}: {
  group: RawNode
  nodes: RawNode[]
  draggable: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  isRenaming: boolean
  onStartRename?: () => void
  onRename?: (label: string) => void
  onDelete?: () => void
  onCardClick: (n: RawNode) => void
}): JSX.Element {
  const sortable = useSortable({ id: group.id, disabled: !draggable })
  const style = draggable
    ? { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.5 : 1 }
    : undefined
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `col-drop:${group.id}`,
    data: { type: 'column', groupId: group.id === '__ungrouped__' ? null : group.id }
  })

  if (collapsed) {
    return (
      <div
        ref={draggable ? sortable.setNodeRef : undefined}
        style={style}
        className="flex w-10 shrink-0 flex-col items-center gap-2 rounded bg-gray-50 py-2"
      >
        <button onClick={onToggleCollapse} className="text-gray-400 hover:text-gray-700" title="Espandi colonna">
          <ChevronRight size={14} />
        </button>
        <span className="rotate-180 text-xs font-medium text-gray-600 [writing-mode:vertical-rl]">
          {group.label} ({nodes.length})
        </span>
      </div>
    )
  }

  return (
    <div ref={draggable ? sortable.setNodeRef : undefined} style={style} className="flex w-64 shrink-0 flex-col rounded bg-gray-50 p-2">
      <div className="group/col mb-2 flex items-center gap-1 px-1 text-sm font-medium text-gray-600">
        {draggable && (
          <button {...sortable.attributes} {...sortable.listeners} className="cursor-grab text-gray-300 hover:text-gray-500">
            <GripVertical size={14} />
          </button>
        )}
        <button onClick={onToggleCollapse} className="text-gray-400 hover:text-gray-700" title="Comprimi colonna">
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
        {onDelete && (
          <button onClick={onDelete} className="text-gray-300 opacity-0 hover:text-red-600 group-hover/col:opacity-100" title="Elimina gruppo">
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <div ref={setDropRef} className={`flex-1 space-y-2 overflow-auto rounded ${isOver ? 'bg-blue-50' : ''}`}>
        {nodes.length === 0 && <p className="px-1 py-2 text-center text-xs italic text-gray-300">Trascina qui un nodo</p>}
        {nodes.map((n) => (
          <KanbanCard key={n.id} node={n} onClick={() => onCardClick(n)} />
        ))}
      </div>
    </div>
  )
}
