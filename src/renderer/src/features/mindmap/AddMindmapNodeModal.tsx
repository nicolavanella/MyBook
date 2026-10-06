import { useEffect, useState } from 'react'
import AutosizeTextarea from '@renderer/components/AutosizeTextarea'
import type { DocumentNode } from '@renderer/stores/useProjectStore'
import type { TranslationKey } from '@shared/i18n'
import { useTranslation } from '@renderer/i18n/useTranslation'

export type MindmapNodeType = 'free_note' | 'character' | 'location' | 'object' | 'event' | 'chapter' | 'scene'

export interface EntityOption {
  id: string
  label: string
}

const TYPE_LABELS: Record<MindmapNodeType, TranslationKey> = {
  free_note: 'mindmap.type.freeNote',
  character: 'entityType.character',
  location: 'entityType.location',
  object: 'entityType.object',
  event: 'mindmap.type.event',
  chapter: 'mindmap.type.chapter',
  scene: 'mindmap.type.scene'
}

interface Props {
  projectId: string
  onClose: () => void
  onCreate: (input: { nodeType: MindmapNodeType; label: string; refId: string | null; description: string }) => void
}

export default function AddMindmapNodeModal({ projectId, onClose, onCreate }: Props): JSX.Element {
  const { t } = useTranslation()
  const [nodeType, setNodeType] = useState<MindmapNodeType>('free_note')
  const [freeLabel, setFreeLabel] = useState('')
  const [description, setDescription] = useState('')
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const [characters, setCharacters] = useState<EntityOption[]>([])
  const [locations, setLocations] = useState<EntityOption[]>([])
  const [objects, setObjects] = useState<EntityOption[]>([])
  const [events, setEvents] = useState<EntityOption[]>([])
  const [chapters, setChapters] = useState<EntityOption[]>([])
  const [scenes, setScenes] = useState<EntityOption[]>([])

  useEffect(() => {
    window.mybook.characters.list(projectId).then((rows: any[]) =>
      setCharacters(rows.map((r) => ({ id: r.id, label: r.name })))
    )
    window.mybook.locations.list(projectId).then((rows: any[]) =>
      setLocations(rows.map((r) => ({ id: r.id, label: r.name })))
    )
    window.mybook.objects.list(projectId).then((rows: any[]) =>
      setObjects(rows.map((r) => ({ id: r.id, label: r.name })))
    )
    window.mybook.timelineEvents.listAllForProject(projectId).then((rows: any[]) =>
      setEvents(rows.map((r) => ({ id: r.id, label: r.title })))
    )
    window.mybook.documents.tree(projectId).then((rows: DocumentNode[]) => {
      setChapters(
        rows.filter((r) => r.node_type === 'chapter').map((r) => ({ id: r.id, label: r.title }))
      )
      const byId = new Map(rows.map((r) => [r.id, r]))
      const sceneLabel = (scene: DocumentNode): string => {
        let parent = scene.parent_id ? byId.get(scene.parent_id) : undefined
        while (parent && parent.node_type !== 'chapter' && parent.parent_id) parent = byId.get(parent.parent_id)
        return parent ? `${parent.title} - ${scene.title}` : scene.title
      }
      setScenes(
        rows
          .filter((r) => r.node_type === 'scene')
          .map((r) => ({ id: r.id, label: sceneLabel(r) }))
      )
    })
  }, [projectId])

  const entityListForType: EntityOption[] =
    nodeType === 'character'
      ? characters
      : nodeType === 'location'
        ? locations
        : nodeType === 'object'
          ? objects
          : nodeType === 'event'
          ? events
          : nodeType === 'chapter'
            ? chapters
            : nodeType === 'scene'
              ? scenes
              : []

  const isFree = nodeType === 'free_note'
  const canSubmit = isFree ? freeLabel.trim().length > 0 : selectedEntityId.length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    if (isFree) {
      onCreate({ nodeType, label: freeLabel.trim(), refId: null, description })
    } else {
      const entity = entityListForType.find((e) => e.id === selectedEntityId)
      if (!entity) return
      onCreate({ nodeType, label: entity.label, refId: entity.id, description })
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-96 rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-sm font-semibold text-gray-800">{t('mindmap.add.title')}</h2>

        <label className="mb-1 block text-xs font-medium text-gray-600">{t('mindmap.type')}</label>
        <select
          className="mb-3 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          value={nodeType}
          onChange={(e) => {
            setNodeType(e.target.value as MindmapNodeType)
            setSelectedEntityId('')
          }}
        >
          {Object.entries(TYPE_LABELS).map(([value, labelKey]) => (
            <option key={value} value={value}>
              {t(labelKey)}
            </option>
          ))}
        </select>

        {isFree ? (
          <>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t('mindmap.nodeText')}</label>
            <input
              autoFocus
              className="mb-4 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={freeLabel}
              onChange={(e) => setFreeLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder={t('mindmap.nodeTextPlaceholder')}
            />
          </>
        ) : (
          <>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {t('mindmap.select', { type: t(TYPE_LABELS[nodeType]).toLowerCase() })}
            </label>
            {entityListForType.length === 0 ? (
              <p className="mb-4 text-xs text-gray-400">
                {t('mindmap.noItems')}
              </p>
            ) : (
              <select
                autoFocus
                className="mb-4 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                value={selectedEntityId}
                onChange={(e) => setSelectedEntityId(e.target.value)}
              >
                <option value="" disabled>
                  {t('mindmap.choose')}
                </option>
                {entityListForType.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        <label className="mb-1 block text-xs font-medium text-gray-600">{t('mindmap.descriptionOptional')}</label>
        <AutosizeTextarea
          rows={2}
          className="mb-4 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('mindmap.descriptionPlaceholder')}
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:bg-gray-300"
          >
            {t('common.add')}
          </button>
        </div>
      </div>
    </div>
  )
}
