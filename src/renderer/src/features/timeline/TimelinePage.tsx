import { useEffect, useRef, useState } from 'react'
import AutosizeTextarea from '@renderer/components/AutosizeTextarea'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { useConfirm } from '@renderer/components/ConfirmDialog'
import ColorField from '@renderer/components/ColorField'
import CalendarDateField from '@renderer/components/CalendarDateField'
import { useTranslation } from '@renderer/i18n/useTranslation'
import { formatCalendarDate, type CalendarLanguage } from '@shared/calendarDate'
import { filterTimelineEvents } from './timelineSearch'
import { sortTimelineEvents, type TimelineSortMode } from './timelineSort'
import { useEntityNavigationStore } from '@renderer/stores/useEntityNavigationStore'
import { Trash2, GripVertical, Plus, Search } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Timeline {
  id: string
  name: string
}

interface TimelineEvent {
  id: string
  title: string
  description: string
  event_date: string
  /** Data da calendario, ISO "AAAA-MM-GG" oppure "" (v0.3.4). */
  calendar_date: string
  order_index: number
  color: string
}

function EventRow({
  event,
  compact,
  draggable,
  highlighted,
  language,
  onUpdate,
  onDelete
}: {
  event: TimelineEvent
  compact: boolean
  draggable: boolean
  highlighted?: boolean
  language: CalendarLanguage
  onUpdate: (id: string, fields: Record<string, unknown>) => void
  onDelete: (id: string) => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: event.id, disabled: !draggable })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const rowRef = useRef<HTMLLIElement | null>(null)

  useEffect(() => {
    if (highlighted) rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlighted])

  return (
    <li
      ref={(el) => {
        setNodeRef(el)
        rowRef.current = el
      }}
      style={style}
      className={`group relative rounded border p-2 pl-8 transition-colors ${
        highlighted ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-white'
      }`}
    >
      {/* Barretta colorata a sinistra: stessa idea del pallino nelle sidebar Personaggi/Località/Oggetti, adattata alla riga orizzontale della timeline. */}
      <span
        className="absolute left-0 top-0 h-full w-1 rounded-l"
        style={{ backgroundColor: event.color || 'transparent' }}
      />
      {draggable && (
        <button
          {...attributes}
          {...listeners}
          className="absolute left-1.5 top-1/2 -translate-y-1/2 cursor-grab text-gray-300 hover:text-gray-500"
          title="Trascina per riordinare"
        >
          <GripVertical size={15} />
        </button>
      )}
      <button
        onClick={() => onDelete(event.id)}
        className="absolute right-1.5 top-1.5 text-gray-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
        title="Elimina evento"
      >
        <Trash2 size={14} />
      </button>

      {compact ? (
        <div className="flex items-center gap-2 pr-6 text-sm">
          <span className="h-2 w-2 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: event.color || '#e5e7eb' }} />
          <span className="shrink-0 text-xs text-gray-400">{event.event_date || '—'}</span>
          {/* v0.3.4: la Data da calendario è mostrata anche qui, altrimenti l'ordinamento "Data" non sarebbe verificabile a colpo d'occhio. */}
          {event.calendar_date && (
            <span className="shrink-0 text-xs text-gray-400">· {formatCalendarDate(event.calendar_date, language)}</span>
          )}
          <input
            key={`title-${event.id}`}
            className="min-w-0 flex-1 font-medium outline-none"
            defaultValue={event.title}
            onBlur={(e) => onUpdate(event.id, { title: e.target.value })}
          />
        </div>
      ) : (
        <div className="pr-6">
          <input
            key={`title-${event.id}`}
            className="w-full font-medium outline-none"
            defaultValue={event.title}
            onBlur={(e) => onUpdate(event.id, { title: e.target.value })}
          />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ColorField value={event.color} onChange={(color) => onUpdate(event.id, { color })} />
            <input
              key={`date-${event.id}`}
              className="w-48 rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500"
              placeholder='Data narrativa (es. "Anno 1200")'
              defaultValue={event.event_date}
              onBlur={(e) => onUpdate(event.id, { event_date: e.target.value })}
            />
            {/* v0.3.4: "Data" da calendario, accanto alla Data narrativa. */}
            <CalendarDateField
              value={event.calendar_date ?? ''}
              language={language}
              onChange={(iso) => onUpdate(event.id, { calendar_date: iso })}
            />
          </div>
          <AutosizeTextarea
            key={`description-${event.id}`}
            className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm"
            rows={2}
            placeholder="Descrizione"
            defaultValue={event.description}
            onBlur={(e) => onUpdate(event.id, { description: e.target.value })}
          />
        </div>
      )}
    </li>
  )
}

export default function TimelinePage(): JSX.Element {
  const { activeProjectId } = useProjectStore()
  const confirm = useConfirm()
  const [timelines, setTimelines] = useState<Timeline[]>([])
  const [activeTimelineId, setActiveTimelineId] = useState<string | null>(null)
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [compact, setCompact] = useState(false)
  // Criterio di ordinamento della vista compatta (solo visualizzazione, non tocca l'ordine salvato).
  const [sortMode, setSortMode] = useState<TimelineSortMode>('none')
  const { language } = useTranslation()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [highlightEventId, setHighlightEventId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    if (!activeProjectId) return
    window.mybook.timelines.list(activeProjectId).then(async (list: Timeline[]) => {
      if (list.length === 0) {
        const created = await window.mybook.timelines.ensureDefault(activeProjectId)
        list = [created]
      }
      setTimelines(list)
      setActiveTimelineId(list[0].id)
    })
  }, [activeProjectId])

  const reloadEvents = (timelineId: string) => {
    window.mybook.timelineEvents.list(timelineId).then(setEvents)
  }

  useEffect(() => {
    if (activeTimelineId) reloadEvents(activeTimelineId)
  }, [activeTimelineId])

  // Se si arriva qui da un Ctrl/Cmd+click su un tag "Evento" nel testo
  // dell'editor: l'evento potrebbe stare in una timeline diversa da quella
  // attualmente aperta, quindi le cerchiamo tutte prima di evidenziarlo.
  const pendingSelection = useEntityNavigationStore((s) => s.pending)
  const consumePendingSelection = useEntityNavigationStore((s) => s.consume)
  useEffect(() => {
    if (pendingSelection?.type !== 'event' || timelines.length === 0) return
    const eventId = pendingSelection.id
    let cancelled = false
    ;(async () => {
      for (const t of timelines) {
        const evs: TimelineEvent[] = await window.mybook.timelineEvents.list(t.id)
        if (cancelled) return
        if (evs.some((e) => e.id === eventId)) {
          if (t.id === activeTimelineId) setEvents(evs)
          else setActiveTimelineId(t.id)
          setHighlightEventId(eventId)
          consumePendingSelection()
          return
        }
      }
      consumePendingSelection() // non trovato in nessuna timeline: evita di ritentare all'infinito
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSelection, timelines])

  useEffect(() => {
    if (!highlightEventId) return
    const t = setTimeout(() => setHighlightEventId(null), 2500)
    return () => clearTimeout(t)
  }, [highlightEventId])

  const addEvent = async () => {
    if (!activeProjectId || !activeTimelineId || !newTitle.trim()) return
    await window.mybook.timelineEvents.create(activeProjectId, activeTimelineId, newTitle)
    setNewTitle('')
    reloadEvents(activeTimelineId)
  }

  const updateEvent = async (id: string, fields: Record<string, unknown>) => {
    await window.mybook.timelineEvents.update(id, fields)
    if (activeTimelineId) reloadEvents(activeTimelineId)
  }

  const deleteEvent = async (id: string) => {
    const ok = await confirm({ message: 'Eliminare questo evento?', confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    await window.mybook.timelineEvents.delete(id)
    if (activeTimelineId) reloadEvents(activeTimelineId)
  }

  const addTimeline = async () => {
    if (!activeProjectId) return
    const created = await window.mybook.timelines.create(activeProjectId, 'Nuova timeline')
    setTimelines((prev) => [...prev, created])
    setActiveTimelineId(created.id)
  }

  const renameTimeline = async (id: string, name: string) => {
    await window.mybook.timelines.rename(id, name)
    setTimelines((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)))
    setRenamingId(null)
  }

  const deleteTimeline = async (id: string) => {
    if (timelines.length <= 1) return // sempre almeno una timeline
    const ok = await confirm({
      message: 'Eliminare questa timeline e tutti i suoi eventi?',
      confirmLabel: 'Elimina',
      danger: true
    })
    if (!ok) return
    await window.mybook.timelines.delete(id)
    const remaining = timelines.filter((t) => t.id !== id)
    setTimelines(remaining)
    setActiveTimelineId(remaining[0]?.id ?? null)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = events.findIndex((ev) => ev.id === active.id)
    const newIndex = events.findIndex((ev) => ev.id === over.id)
    const reordered = arrayMove(events, oldIndex, newIndex)
    setEvents(reordered) // aggiornamento ottimistico, subito visibile
    window.mybook.timelineEvents.reorder(reordered.map((ev) => ev.id))
  }

  const query = search.trim().toLowerCase()
  const formatDate = (iso: string) => formatCalendarDate(iso, language)
  // La data da calendario fa parte dei criteri di ricerca (ISO e forma mostrata a schermo).
  const filteredEvents = filterTimelineEvents(events, query, formatDate)
  // L'ordinamento vale solo in vista compatta; in vista estesa resta l'ordine manuale.
  const activeSort: TimelineSortMode = compact ? sortMode : 'none'
  const sortedEvents = sortTimelineEvents(filteredEvents, activeSort, language)
  // Come per la ricerca, un elenco riordinato "per vista" non è trascinabile: il riordino manuale avrebbe un esito ambiguo.
  const canDrag = !query && activeSort === 'none'

  if (!activeProjectId) return <div className="p-6 text-sm text-gray-400">Apri un progetto dal Manoscritto.</div>

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="shrink-0 text-xl font-semibold">Timeline</h1>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <div className="flex w-full max-w-xs items-center gap-1.5 rounded border border-gray-300 px-2 py-1">
            <Search size={13} className="shrink-0 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per titolo, data o descrizione…"
              spellCheck={false}
              data-search-input
              className="w-full min-w-0 bg-transparent text-sm outline-none"
            />
          </div>
          {compact && (
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-gray-500">
              Ordina per
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as TimelineSortMode)}
                className="rounded border border-gray-300 px-1.5 py-1 text-xs"
              >
                <option value="none">Nessuno</option>
                <option value="narrative">Data narrativa</option>
                <option value="date">Data</option>
              </select>
            </label>
          )}
          <button
            onClick={() => setCompact((v) => !v)}
            className="shrink-0 rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
          >
            Vista {compact ? 'estesa' : 'compatta'}
          </button>
        </div>
      </div>

      {/* Selettore timeline (tab) */}
      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-gray-200">
        {timelines.map((t) => (
          <div key={t.id} className="group relative">
            {renamingId === t.id ? (
              <input
                autoFocus
                defaultValue={t.name}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => renameTimeline(t.id, e.target.value.trim() || t.name)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="border-b-2 border-blue-500 px-3 py-1.5 text-sm outline-none"
              />
            ) : (
              <button
                onDoubleClick={() => setRenamingId(t.id)}
                onClick={() => setActiveTimelineId(t.id)}
                className={`border-b-2 px-3 py-1.5 text-sm ${
                  activeTimelineId === t.id
                    ? 'border-blue-600 font-medium text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.name}
              </button>
            )}
            {timelines.length > 1 && activeTimelineId === t.id && renamingId !== t.id && (
              <button
                onClick={() => deleteTimeline(t.id)}
                className="absolute -right-1 -top-1 hidden rounded-full bg-white text-gray-300 hover:text-red-600 group-hover:block"
                title="Elimina timeline"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button onClick={addTimeline} className="px-2 py-1.5 text-gray-400 hover:text-gray-700" title="Nuova timeline">
          <Plus size={16} />
        </button>
      </div>

      <div className="mb-6 flex gap-2">
        <input
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          placeholder="Nuovo evento"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addEvent()}
        />
        <button onClick={addEvent} className="shrink-0 rounded bg-blue-600 px-3 text-sm text-white">
          Aggiungi
        </button>
      </div>

      {!canDrag ? (
        // Durante la ricerca o con un ordinamento attivo l'elenco è una "vista"
        // derivata e non trascinabile: riordinare un sottoinsieme (o un ordine
        // calcolato) produrrebbe un ordine manuale ambiguo. Si comporta come
        // la ricerca dell'albero del Manoscritto.
        <ul className="space-y-2">
          {sortedEvents.length === 0 && <p className="px-1 text-xs text-gray-400">Nessun risultato.</p>}
          {sortedEvents.map((ev) => (
            <EventRow key={ev.id} event={ev} compact={compact} draggable={false} highlighted={highlightEventId === ev.id} language={language} onUpdate={updateEvent} onDelete={deleteEvent} />
          ))}
        </ul>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={events.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {events.map((ev) => (
                <EventRow key={ev.id} event={ev} compact={compact} draggable highlighted={highlightEventId === ev.id} language={language} onUpdate={updateEvent} onDelete={deleteEvent} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
