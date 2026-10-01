import { useEffect, useMemo, useState } from 'react'
import AutosizeTextarea from '@renderer/components/AutosizeTextarea'
import { Search, MoreVertical, ChevronRight, ChevronDown, ChevronsDownUp, ChevronsUpDown, GripVertical, FolderPlus, Folder, Lock } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import type { DocumentNode } from '@renderer/stores/useProjectStore'
import { useConfirm } from '@renderer/components/ConfirmDialog'
import { resolveDragMove, ROOT_CONTAINER } from './treeDnd'
import { extractSnippet } from './textSnippet'
import { getRootItems, getChaptersOfGroup, getScenesOfChapter } from '@shared/manuscriptTree'
import { STATUS_DOT } from '@renderer/lib/nodeStatus'
import { titleIfTruncated } from '@renderer/lib/truncationTitle'

interface ChapterFormValues {
  title: string
  subtitle: string
  description: string
  notes: string
}

const EMPTY_CHAPTER_FORM: ChapterFormValues = { title: '', subtitle: '', description: '', notes: '' }

// STATUS_DOT (colori dei pallini di stato): vedi lib/nodeStatus.ts, condiviso col selettore Stato dell'editor.

interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }): JSX.Element {
  return (
    <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      <div
        className="absolute z-50 w-40 rounded border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item) => (
          <button
            key={item.label}
            onClick={item.onClick}
            className={`block w-full px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 ${item.danger ? 'text-red-600' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SceneRow({
  scene,
  isActive,
  isEditing,
  draftTitle,
  locked,
  onSelect,
  onContextMenu,
  onMenuButton,
  onDraftChange,
  onCommitRename,
  onCancelRename
}: {
  scene: DocumentNode
  isActive: boolean
  isEditing: boolean
  draftTitle: string
  locked: boolean
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onMenuButton: (e: React.MouseEvent) => void
  onDraftChange: (v: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id, disabled: locked })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <li ref={setNodeRef} style={style} className="group flex min-w-0 items-center">
      {/* Il capitolo (o il suo gruppo) è bloccato: niente maniglia di trascinamento per le sue scene — vedi "Blocca" nel menu contestuale del capitolo/gruppo. */}
      {!locked && (
        <button {...attributes} {...listeners} className="shrink-0 cursor-grab px-0.5 text-gray-300 opacity-0 hover:text-gray-500 group-hover:opacity-100">
          <GripVertical size={12} />
        </button>
      )}
      {isEditing ? (
        <input
          autoFocus
          value={draftTitle}
          onChange={(e) => onDraftChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename()
            if (e.key === 'Escape') onCancelRename()
          }}
          className="w-full min-w-0 rounded border border-blue-400 px-1 py-0.5 text-sm"
        />
      ) : (
        <button
          onClick={onSelect}
          onContextMenu={onContextMenu}
          className={`flex min-w-0 flex-1 items-center gap-1.5 truncate rounded px-2 py-1 text-left text-sm ${
            isActive ? 'bg-blue-100' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[scene.status]}`} />
          {/* v0.3.4: nome completo al passaggio del mouse, ma solo se è davvero troncato. */}
          <span className="min-w-0 truncate" onMouseEnter={(e) => titleIfTruncated(e.currentTarget, scene.title)}>
            {scene.title}
          </span>
        </button>
      )}
      <button onClick={onMenuButton} className="shrink-0 px-1 text-gray-300 opacity-0 hover:text-gray-600 group-hover:opacity-100">
        <MoreVertical size={14} />
      </button>
    </li>
  )
}

function ChapterBlock({
  chapter,
  containerId,
  scenes,
  collapsed,
  onToggleCollapse,
  isEditingChapter,
  draftTitle,
  activeNodeId,
  editingSceneId,
  locked,
  onSelectScene,
  onAddScene,
  onChapterContextMenu,
  onChapterMenuButton,
  onSceneContextMenu,
  onSceneMenuButton,
  onDraftChange,
  onCommitRename,
  onCancelRename,
  onSceneReorder
}: {
  chapter: DocumentNode
  containerId: string
  scenes: DocumentNode[]
  collapsed: boolean
  onToggleCollapse: () => void
  isEditingChapter: boolean
  draftTitle: string
  activeNodeId: string | null
  editingSceneId: string | null
  /** true se il capitolo stesso è bloccato OPPURE il gruppo che lo contiene lo è (il blocco di un gruppo si applica a cascata a tutti i suoi capitoli). */
  locked: boolean
  onSelectScene: (id: string) => void
  onAddScene: () => void
  onChapterContextMenu: (e: React.MouseEvent) => void
  onChapterMenuButton: (e: React.MouseEvent) => void
  onSceneContextMenu: (id: string, e: React.MouseEvent) => void
  onSceneMenuButton: (id: string, e: React.MouseEvent) => void
  onDraftChange: (v: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onSceneReorder: (reorderedIds: string[]) => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapter.id,
    data: { containerId },
    disabled: locked
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleSceneDragEnd = (e: DragEndEvent) => {
    if (locked) return
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = scenes.findIndex((s) => s.id === active.id)
    const newIndex = scenes.findIndex((s) => s.id === over.id)
    onSceneReorder(arrayMove(scenes, oldIndex, newIndex).map((s) => s.id))
  }

  return (
    <li ref={setNodeRef} style={style} className="min-w-0">
      <div className="group flex min-w-0 items-center justify-between rounded hover:bg-gray-100 dark:hover:bg-gray-700">
        {/* Capitolo bloccato (o dentro un gruppo bloccato): niente maniglia di trascinamento — vedi "Blocca" nel menu contestuale. */}
        {!locked && (
          <button {...attributes} {...listeners} className="shrink-0 cursor-grab px-0.5 text-gray-300 opacity-0 hover:text-gray-500 group-hover:opacity-100">
            <GripVertical size={13} />
          </button>
        )}
        <button onClick={onToggleCollapse} className="shrink-0 px-0.5 text-gray-400 hover:text-gray-700">
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
        {isEditingChapter ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => onDraftChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename()
              if (e.key === 'Escape') onCancelRename()
            }}
            className="w-full min-w-0 rounded border border-blue-400 px-1 py-0.5 text-sm font-medium"
          />
        ) : (
          // Prima qui c'era un title="Doppio click per rinominare" — rimosso su richiesta.
          <div
            className="flex min-w-0 flex-1 cursor-text items-center gap-1 truncate py-1 text-sm font-medium"
            onDoubleClick={onChapterContextMenu}
            onContextMenu={onChapterContextMenu}
          >
            {!!chapter.locked && <Lock size={11} className="shrink-0 text-gray-400" aria-label="Capitolo bloccato" />}
            {chapter.title}
            {chapter.subtitle && <span className="ml-1 font-normal text-gray-400">— {chapter.subtitle}</span>}
          </div>
        )}
        <button onClick={onChapterMenuButton} className="shrink-0 px-1 text-gray-300 opacity-0 hover:text-gray-600 group-hover:opacity-100">
          <MoreVertical size={14} />
        </button>
      </div>

      {!collapsed && (
        <ul className="ml-4 mt-1 min-w-0 space-y-0.5">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSceneDragEnd}>
            <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {scenes.map((scene) => (
                <SceneRow
                  key={scene.id}
                  scene={scene}
                  isActive={activeNodeId === scene.id}
                  isEditing={editingSceneId === scene.id}
                  draftTitle={draftTitle}
                  locked={locked}
                  onSelect={() => onSelectScene(scene.id)}
                  onContextMenu={(e) => onSceneContextMenu(scene.id, e)}
                  onMenuButton={(e) => onSceneMenuButton(scene.id, e)}
                  onDraftChange={onDraftChange}
                  onCommitRename={onCommitRename}
                  onCancelRename={onCancelRename}
                />
              ))}
            </SortableContext>
          </DndContext>
          <li>
            <button onClick={onAddScene} className="px-2 text-xs text-gray-500 hover:text-gray-800">
              + Aggiungi scena
            </button>
          </li>
        </ul>
      )}
    </li>
  )
}

/**
 * Riga di un gruppo di capitoli: sempre a livello radice (nessun gruppo
 * annidato). La zona dei capitoli è un contenitore droppable a sé — con id
 * prefissato `group:` per non collidere con l'id del gruppo stesso, usato
 * invece per il suo riordino come elemento di primo livello — così un
 * capitolo può essere trascinato in un gruppo anche quando è vuoto.
 */
function GroupBlock({
  group,
  chapters,
  collapsed,
  onToggleCollapse,
  isEditing,
  draftTitle,
  onDraftChange,
  onCommitRename,
  onCancelRename,
  onContextMenu,
  onMenuButton,
  children
}: {
  group: DocumentNode
  chapters: DocumentNode[]
  collapsed: boolean
  onToggleCollapse: () => void
  isEditing: boolean
  draftTitle: string
  onDraftChange: (v: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onMenuButton: (e: React.MouseEvent) => void
  children: React.ReactNode
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
    data: { containerId: ROOT_CONTAINER }
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `group:${group.id}`, data: { containerId: group.id } })

  return (
    <li ref={setNodeRef} style={style} className="min-w-0 rounded border border-gray-200 bg-gray-50/60 p-1.5 dark:border-gray-700 dark:bg-gray-800/40">
      <div className="group flex min-w-0 items-center justify-between rounded hover:bg-gray-100 dark:hover:bg-gray-700">
        <button {...attributes} {...listeners} className="shrink-0 cursor-grab px-0.5 text-gray-300 opacity-0 hover:text-gray-500 group-hover:opacity-100">
          <GripVertical size={13} />
        </button>
        <button onClick={onToggleCollapse} className="shrink-0 px-0.5 text-gray-400 hover:text-gray-700">
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
        <Folder size={13} className="mx-1 shrink-0 text-amber-500" />
        {isEditing ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => onDraftChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename()
              if (e.key === 'Escape') onCancelRename()
            }}
            className="w-full min-w-0 rounded border border-blue-400 px-1 py-0.5 text-sm font-semibold"
          />
        ) : (
          <div className="flex min-w-0 flex-1 cursor-text items-center gap-1 truncate py-1 text-sm font-semibold" onDoubleClick={onContextMenu} onContextMenu={onContextMenu}>
            {!!group.locked && <Lock size={11} className="shrink-0 text-gray-400" aria-label="Gruppo bloccato" />}
            {group.title}
          </div>
        )}
        <button onClick={onMenuButton} className="shrink-0 px-1 text-gray-300 opacity-0 hover:text-gray-600 group-hover:opacity-100">
          <MoreVertical size={14} />
        </button>
      </div>

      {!collapsed && (
        <ul ref={setDropRef} className={`ml-3 mt-1 min-h-[1.75rem] min-w-0 space-y-2 rounded ${isOver ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}>
          {chapters.length === 0 && <li className="px-2 py-1 text-xs italic text-gray-400">Trascina qui un capitolo</li>}
          {children}
        </ul>
      )}
    </li>
  )
}

export default function ChapterTree({ projectId }: { projectId: string }): JSX.Element {
  const { tree, loadTree, setActiveNode, activeNodeId } = useProjectStore()
  const confirm = useConfirm()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [contextMenu, setContextMenu] = useState<{ id: string; type: 'chapter' | 'scene' | 'group'; x: number; y: number } | null>(null)
  const [showNewChapterModal, setShowNewChapterModal] = useState(false)
  const [editingChapter, setEditingChapter] = useState<DocumentNode | null>(null)
  const [search, setSearch] = useState('')
  // Un solo insieme per capitoli E gruppi collassati: entrambi hanno figli
  // che si possono nascondere, "Comprimi/Espandi tutto" agisce su entrambi.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    loadTree()
  }, [projectId])

  const groups = tree.filter((n) => n.node_type === 'group').sort((a, b) => a.order_index - b.order_index)
  // Gruppi e capitoli senza gruppo condividono lo stesso spazio di order_index
  // (entrambi hanno parent_id NULL): unendoli e riordinando per order_index si
  // ottiene l'ordine reale con cui l'utente li ha disposti.
  const rootItems = getRootItems(tree)
  const chaptersOfGroup = (groupId: string) => getChaptersOfGroup(tree, groupId)
  const scenesOf = (chapterId: string) => getScenesOfChapter(tree, chapterId)

  const searchResults = useMemo(() => {
    if (!search.trim()) return null
    const q = search.trim().toLowerCase()
    return tree.filter((n) => n.node_type !== 'group' && (n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)))
  }, [search, tree])

  const createChapter = async (values: ChapterFormValues) => {
    await window.mybook.documents.create({
      projectId,
      parentId: null,
      nodeType: 'chapter',
      title: values.title,
      subtitle: values.subtitle || undefined,
      description: values.description || undefined,
      notes: values.notes || undefined
    })
    await loadTree()
    setShowNewChapterModal(false)
  }

  const createGroup = async () => {
    await window.mybook.documents.create({ projectId, parentId: null, nodeType: 'group', title: 'Nuovo gruppo' })
    await loadTree()
  }

  const saveChapterEdit = async (values: ChapterFormValues) => {
    if (!editingChapter) return
    await window.mybook.documents.update(editingChapter.id, {
      title: values.title,
      subtitle: values.subtitle,
      description: values.description,
      notes: values.notes
    })
    await loadTree()
    setEditingChapter(null)
  }

  const addScene = async (chapterId: string) => {
    await window.mybook.documents.create({ projectId, parentId: chapterId, nodeType: 'scene', title: 'Nuova scena' })
    loadTree()
  }

  const startEditing = (id: string, currentTitle: string) => {
    setEditingId(id)
    setDraftTitle(currentTitle)
  }

  const commitRename = async () => {
    if (!editingId) return
    const title = draftTitle.trim()
    if (title) {
      await window.mybook.documents.update(editingId, { title })
      await loadTree()
    }
    setEditingId(null)
  }

  const duplicateNode = async (node: DocumentNode) => {
    await window.mybook.documents.duplicate(node.id)
    await loadTree()
  }

  const toggleLock = async (node: DocumentNode) => {
    await window.mybook.documents.update(node.id, { locked: !node.locked })
    await loadTree()
  }

  const deleteNode = async (node: DocumentNode) => {
    const isChapter = node.node_type === 'chapter'
    const isGroup = node.node_type === 'group'
    const scenesCount = isChapter ? scenesOf(node.id).length : 0
    const chaptersCount = isGroup ? chaptersOfGroup(node.id).length : 0
    const message = isGroup
      ? `Eliminare il gruppo "${node.title}" e i suoi ${chaptersCount} capitoli (con tutte le loro scene)? L'operazione non è reversibile.`
      : isChapter
        ? `Eliminare "${node.title}" e le sue ${scenesCount} scene? L'operazione non è reversibile.`
        : `Eliminare la scena "${node.title}"? L'operazione non è reversibile.`
    const ok = await confirm({ message, confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    await window.mybook.documents.delete(node.id)
    if (activeNodeId === node.id) setActiveNode(null)
    await loadTree()
  }

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const collapseAll = () => setCollapsedIds(new Set([...groups.map((g) => g.id), ...tree.filter((n) => n.node_type === 'chapter').map((c) => c.id)]))
  const expandAll = () => setCollapsedIds(new Set())

  const handleSceneReorder = (chapterId: string, reorderedIds: string[]) => {
    window.mybook.documents.reorder(reorderedIds, undefined, chapterId).then(loadTree)
  }

  /**
   * Un solo DndContext copre sia il riordino di primo livello (gruppi +
   * capitoli senza gruppo) sia lo spostamento di un capitolo dentro/fuori un
   * gruppo: ogni elemento trascinabile porta con sé `data.containerId`
   * (ROOT_CONTAINER o l'id del gruppo che lo contiene). La decisione vera e
   * propria (semplice riordino vs cambio di contenitore) è delegata alla
   * funzione pura resolveDragMove (vedi treeDnd.ts), testata separatamente.
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    const activeNode = tree.find((n) => n.id === activeId)
    if (!activeNode) return

    const result = resolveDragMove({
      activeId,
      overId,
      activeContainer: (active.data.current?.containerId as string) ?? ROOT_CONTAINER,
      overContainer: (over.data.current?.containerId as string) ?? ROOT_CONTAINER,
      isGroup: activeNode.node_type === 'group',
      siblingsOf: (containerId) => (containerId === ROOT_CONTAINER ? rootItems : chaptersOfGroup(containerId)).map((n) => n.id)
    })
    if (!result) return

    if (result.type === 'reorder') {
      window.mybook.documents.reorder(result.orderedIds).then(loadTree)
    } else {
      window.mybook.documents.reorder(result.orderedIds, result.movedNodeId, result.newParentId).then(loadTree)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-x-hidden">
      <div className="mb-3 grid shrink-0 grid-cols-2 gap-1.5">
        <button onClick={() => setShowNewChapterModal(true)} className="rounded bg-gray-100 px-2 py-1 text-sm hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">
          + Nuovo capitolo
        </button>
        <button onClick={() => void createGroup()} className="flex items-center justify-center gap-1 rounded bg-gray-100 px-2 py-1 text-sm hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">
          <FolderPlus size={14} /> Nuovo gruppo
        </button>
      </div>
      <div className="mb-2 flex shrink-0 justify-end gap-3 text-xs text-gray-500 dark:text-gray-400">
        <button onClick={expandAll} className="flex items-center gap-1 hover:text-gray-800 dark:hover:text-gray-200">
          <ChevronsUpDown size={12} /> Espandi tutto
        </button>
        <button onClick={collapseAll} className="flex items-center gap-1 hover:text-gray-800 dark:hover:text-gray-200">
          <ChevronsDownUp size={12} /> Comprimi tutto
        </button>
      </div>

      <div className="min-w-0 flex-1 overflow-auto">
        {searchResults ? (
          <SearchResultsList results={searchResults} tree={tree} query={search.trim()} onSelect={setActiveNode} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={rootItems.map((n) => n.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-3">
                {rootItems.map((item) =>
                  item.node_type === 'group' ? (
                    <GroupBlock
                      key={item.id}
                      group={item}
                      chapters={chaptersOfGroup(item.id)}
                      collapsed={collapsedIds.has(item.id)}
                      onToggleCollapse={() => toggleCollapse(item.id)}
                      isEditing={editingId === item.id}
                      draftTitle={draftTitle}
                      onDraftChange={setDraftTitle}
                      onCommitRename={commitRename}
                      onCancelRename={() => setEditingId(null)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setContextMenu({ id: item.id, type: 'group', x: (e as any).clientX ?? 100, y: (e as any).clientY ?? 100 })
                      }}
                      onMenuButton={(e) => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect()
                        setContextMenu({ id: item.id, type: 'group', x: rect.left, y: rect.bottom })
                      }}
                    >
                      <SortableContext items={chaptersOfGroup(item.id).map((c) => c.id)} strategy={verticalListSortingStrategy}>
                        {chaptersOfGroup(item.id).map((chapter) => (
                          <ChapterBlock
                            key={chapter.id}
                            chapter={chapter}
                            containerId={item.id}
                            scenes={scenesOf(chapter.id)}
                            collapsed={collapsedIds.has(chapter.id)}
                            onToggleCollapse={() => toggleCollapse(chapter.id)}
                            isEditingChapter={editingId === chapter.id}
                            draftTitle={draftTitle}
                            activeNodeId={activeNodeId}
                            editingSceneId={editingId}
                            locked={!!chapter.locked || !!item.locked}
                            onSelectScene={setActiveNode}
                            onAddScene={() => addScene(chapter.id)}
                            onChapterContextMenu={(e) => {
                              e.preventDefault()
                              setContextMenu({ id: chapter.id, type: 'chapter', x: (e as any).clientX ?? 100, y: (e as any).clientY ?? 100 })
                            }}
                            onChapterMenuButton={(e) => {
                              const rect = (e.target as HTMLElement).getBoundingClientRect()
                              setContextMenu({ id: chapter.id, type: 'chapter', x: rect.left, y: rect.bottom })
                            }}
                            onSceneContextMenu={(id, e) => {
                              e.preventDefault()
                              setContextMenu({ id, type: 'scene', x: e.clientX, y: e.clientY })
                            }}
                            onSceneMenuButton={(id, e) => {
                              const rect = (e.target as HTMLElement).getBoundingClientRect()
                              setContextMenu({ id, type: 'scene', x: rect.left, y: rect.bottom })
                            }}
                            onDraftChange={setDraftTitle}
                            onCommitRename={commitRename}
                            onCancelRename={() => setEditingId(null)}
                            onSceneReorder={(ids) => handleSceneReorder(chapter.id, ids)}
                          />
                        ))}
                      </SortableContext>
                    </GroupBlock>
                  ) : (
                    <ChapterBlock
                      key={item.id}
                      chapter={item}
                      containerId={ROOT_CONTAINER}
                      scenes={scenesOf(item.id)}
                      collapsed={collapsedIds.has(item.id)}
                      onToggleCollapse={() => toggleCollapse(item.id)}
                      isEditingChapter={editingId === item.id}
                      draftTitle={draftTitle}
                      activeNodeId={activeNodeId}
                      editingSceneId={editingId}
                      locked={!!item.locked}
                      onSelectScene={setActiveNode}
                      onAddScene={() => addScene(item.id)}
                      onChapterContextMenu={(e) => {
                        e.preventDefault()
                        setContextMenu({ id: item.id, type: 'chapter', x: (e as any).clientX ?? 100, y: (e as any).clientY ?? 100 })
                      }}
                      onChapterMenuButton={(e) => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect()
                        setContextMenu({ id: item.id, type: 'chapter', x: rect.left, y: rect.bottom })
                      }}
                      onSceneContextMenu={(id, e) => {
                        e.preventDefault()
                        setContextMenu({ id, type: 'scene', x: e.clientX, y: e.clientY })
                      }}
                      onSceneMenuButton={(id, e) => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect()
                        setContextMenu({ id, type: 'scene', x: rect.left, y: rect.bottom })
                      }}
                      onDraftChange={setDraftTitle}
                      onCommitRename={commitRename}
                      onCancelRename={() => setEditingId(null)}
                      onSceneReorder={(ids) => handleSceneReorder(item.id, ids)}
                    />
                  )
                )}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="mt-3 shrink-0 border-t border-gray-200 pt-2 dark:border-gray-700">
        <div className="flex min-w-0 items-center gap-1.5 rounded border border-gray-200 px-2 py-1 dark:border-gray-700">
          <Search size={13} className="shrink-0 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per titolo o testo…"
            spellCheck={false}
            data-search-input
            className="w-full min-w-0 bg-transparent text-xs outline-none"
          />
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={(() => {
            const node = tree.find((n) => n.id === contextMenu.id)
            if (!node) return []
            const items: MenuItem[] = []
            // v0.3.9: "Rinomina" tolto per i Capitoli — "Modifica" (poco sotto) apre già la scheda completa, titolo incluso, quindi era un'azione ridondante lì. Resta per Gruppi e Scene, che non hanno un "Modifica" equivalente.
            if (contextMenu.type !== 'chapter') {
              items.push({ label: 'Rinomina', onClick: () => { startEditing(node.id, node.title); setContextMenu(null) } })
            }
            if (contextMenu.type === 'chapter') {
              items.push({ label: 'Modifica', onClick: () => { setEditingChapter(node); setContextMenu(null) } })
            }
            // v0.3.9: "Crea copia" anche per i Gruppi — duplicate() è già ricorsivo (copia capitoli e scene contenuti), serviva solo esporlo qui.
            if (contextMenu.type === 'chapter' || contextMenu.type === 'scene' || contextMenu.type === 'group') {
              items.push({ label: 'Crea copia', onClick: () => { void duplicateNode(node); setContextMenu(null) } })
            }
            if (contextMenu.type === 'chapter' || contextMenu.type === 'group') {
              items.push({
                label: node.locked ? 'Sblocca' : 'Blocca',
                onClick: () => { void toggleLock(node); setContextMenu(null) }
              })
            }
            items.push({ label: 'Elimina', danger: true, onClick: () => { void deleteNode(node); setContextMenu(null) } })
            return items
          })()}
        />
      )}

      {showNewChapterModal && (
        <ChapterFormModal title="Nuovo capitolo" submitLabel="Crea" onClose={() => setShowNewChapterModal(false)} onSubmit={createChapter} />
      )}

      {editingChapter && (
        <ChapterFormModal
          title="Modifica capitolo"
          submitLabel="Salva"
          initialValues={{
            title: editingChapter.title,
            subtitle: editingChapter.subtitle,
            description: editingChapter.description,
            notes: editingChapter.notes
          }}
          onClose={() => setEditingChapter(null)}
          onSubmit={saveChapterEdit}
        />
      )}
    </div>
  )
}

function SearchResultsList({
  results,
  tree,
  query,
  onSelect
}: {
  results: DocumentNode[]
  tree: DocumentNode[]
  query: string
  onSelect: (id: string) => void
}): JSX.Element {
  if (results.length === 0) return <p className="px-1 text-xs text-gray-400">Nessun risultato.</p>
  return (
    <ul className="space-y-2">
      {results.map((n) => {
        const isChapter = n.node_type === 'chapter'
        const chapter = isChapter ? null : tree.find((c) => c.id === n.parent_id)
        const snippet = extractSnippet(n.content, query)
        return (
          <li key={n.id}>
            <button onClick={() => onSelect(n.id)} className="block w-full min-w-0 rounded px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700">
              <span className="block truncate text-sm">
                {isChapter && <span className="mr-1 text-xs text-gray-400">[capitolo]</span>}
                {n.title}
                {chapter && <span className="ml-1 text-xs text-gray-400">— {chapter.title}</span>}
              </span>
              {snippet && <span className="mt-0.5 block truncate text-xs text-gray-400">{snippet}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function ChapterFormModal({
  title,
  submitLabel,
  initialValues,
  onClose,
  onSubmit
}: {
  title: string
  submitLabel: string
  initialValues?: ChapterFormValues
  onClose: () => void
  onSubmit: (values: ChapterFormValues) => void
}): JSX.Element {
  const [values, setValues] = useState<ChapterFormValues>(initialValues ?? EMPTY_CHAPTER_FORM)
  const set = (patch: Partial<ChapterFormValues>) => setValues((v) => ({ ...v, ...patch }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!values.title.trim()) return
    onSubmit(values)
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
        <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Titolo *</span>
            <input autoFocus required className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600" value={values.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Sottotitolo (opzionale)</span>
            <input className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600" value={values.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Descrizione</span>
            <AutosizeTextarea rows={2} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600" value={values.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Note</span>
            <AutosizeTextarea rows={2} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600" value={values.notes} onChange={(e) => set({ notes: e.target.value })} />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">Annulla</button>
          <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">{submitLabel}</button>
        </div>
      </form>
    </div>
  )
}
