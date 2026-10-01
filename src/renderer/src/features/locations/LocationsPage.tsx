import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { useEntityNavigationStore } from '@renderer/stores/useEntityNavigationStore'
import CustomFieldsEditor, { type CustomField } from '../characters/CustomFieldsEditor'
import CollapsibleSidebar from '@renderer/components/CollapsibleSidebar'
import ImagePicker from '@renderer/components/ImagePicker'
import AutosizeTextarea from '@renderer/components/AutosizeTextarea'
import ColorField from '@renderer/components/ColorField'
import EntityListSidebar from '@renderer/components/EntityListSidebar'
import { useConfirm } from '@renderer/components/ConfirmDialog'
import EntityTagUsagePanel from '@renderer/components/EntityTagUsagePanel'

interface Location {
  id: string
  name: string
  description: string
  notes: string
  custom_fields: string
  image_path: string | null
  tags: string
  color: string
  group_name: string
}

export default function LocationsPage(): JSX.Element {
  const { activeProjectId } = useProjectStore()
  const confirm = useConfirm()
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const reload = () => {
    if (!activeProjectId) return
    window.mybook.locations.list(activeProjectId).then(setLocations)
  }

  useEffect(reload, [activeProjectId])

  // Selezione automatica se si arriva qui da un Ctrl/Cmd+click su un tag "Località" nel testo dell'editor.
  const pendingSelection = useEntityNavigationStore((s) => s.pending)
  const consumePendingSelection = useEntityNavigationStore((s) => s.consume)
  useEffect(() => {
    if (pendingSelection?.type === 'location' && locations.some((l) => l.id === pendingSelection.id)) {
      setSelectedId(pendingSelection.id)
      consumePendingSelection()
    }
  }, [pendingSelection, locations])

  const selected = locations.find((l) => l.id === selectedId) ?? null

  const addLocation = async () => {
    if (!activeProjectId || !newName.trim()) return
    const created = await window.mybook.locations.create(activeProjectId, newName)
    setNewName('')
    reload()
    setSelectedId(created.id)
  }

  const updateSelected = async (fields: Record<string, unknown>) => {
    if (!selectedId) return
    await window.mybook.locations.update(selectedId, fields)
    reload()
  }

  const renameGroup = async (oldName: string, newName: string) => {
    const members = locations.filter((l) => l.group_name === oldName)
    await Promise.all(members.map((l) => window.mybook.locations.update(l.id, { group_name: newName })))
    reload()
  }

  const deleteGroup = async (name: string) => {
    const members = locations.filter((l) => l.group_name === name)
    const ok = await confirm({
      message: `Eliminare il gruppo "${name}"? Le ${members.length} località al suo interno passeranno a "Senza gruppo" (non verranno eliminate).`,
      confirmLabel: 'Elimina gruppo',
      danger: true
    })
    if (!ok) return
    await Promise.all(members.map((l) => window.mybook.locations.update(l.id, { group_name: '' })))
    reload()
  }

  const deleteSelected = async () => {
    if (!selected) return
    const ok = await confirm({
      message: `Eliminare "${selected.name}"? L'operazione non è reversibile.`,
      confirmLabel: 'Elimina',
      danger: true
    })
    if (!ok) return
    await window.mybook.locations.delete(selected.id)
    setSelectedId(null)
    reload()
  }

  if (!activeProjectId) return <div className="p-6 text-sm text-gray-400">Apri un progetto dal Manoscritto.</div>

  return (
    <div className="flex h-full">
      <CollapsibleSidebar width={256}>
        <EntityListSidebar
          items={locations}
          selectedId={selectedId}
          onSelect={setSelectedId}
          newName={newName}
          onNewNameChange={setNewName}
          onAdd={addLocation}
          addPlaceholder="Nuova località"
          searchText={(l) => `${l.description} ${l.notes} ${l.tags} ${l.custom_fields}`}
          onRenameGroup={renameGroup}
          onDeleteGroup={deleteGroup}
        />
      </CollapsibleSidebar>

      <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        {!selected ? (
          <div className="text-sm text-gray-400">Seleziona o crea una località.</div>
        ) : (
          <div key={selected.id} className="max-w-xl space-y-4">
            {/* v0.3.4: il blocco avatar+nome occupa tutto lo spazio tra l'immagine e il bottone elimina (flex-1), e il campo nome si estende di conseguenza. */}
            <div className="flex items-center gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <ImagePicker
                  imagePath={selected.image_path}
                  onChange={(path) => updateSelected({ image_path: path })}
                />
                <input
                  className="min-w-0 flex-1 text-lg font-medium outline-none"
                  defaultValue={selected.name}
                  onBlur={(e) => updateSelected({ name: e.target.value })}
                />
              </div>
              <button
                onClick={deleteSelected}
                className="shrink-0 rounded p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-600"
                title="Elimina località"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="flex gap-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Colore</label>
                <ColorField value={selected.color} onChange={(color) => updateSelected({ color })} />
              </div>
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-600">Gruppo</label>
                <input
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  list="location-groups"
                  placeholder="es. Interni, Esterni, Regno del Nord…"
                  defaultValue={selected.group_name}
                  onBlur={(e) => updateSelected({ group_name: e.target.value })}
                />
                <datalist id="location-groups">
                  {[...new Set(locations.map((l) => l.group_name).filter(Boolean))].map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Descrizione</label>
              <AutosizeTextarea
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                rows={4}
                defaultValue={selected.description}
                onBlur={(e) => updateSelected({ description: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Note</label>
              <AutosizeTextarea
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                rows={3}
                defaultValue={selected.notes}
                onBlur={(e) => updateSelected({ notes: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">
                Tag <span className="font-normal text-gray-400">(separati da virgola, aiutano la ricerca)</span>
              </label>
              <input
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder="es. interno, notturno, pericoloso"
                defaultValue={selected.tags}
                onBlur={(e) => updateSelected({ tags: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Campi aggiuntivi</label>
              <CustomFieldsEditor
                fields={parseCustomFields(selected.custom_fields)}
                onChange={(fields: CustomField[]) => updateSelected({ custom_fields: fields })}
              />
            </div>
          </div>
        )}
      </div>
      {selected && <EntityTagUsagePanel entityType="location" entityId={selected.id} />}
      </div>
    </div>
  )
}

function parseCustomFields(json: string): CustomField[] {
  try {
    return JSON.parse(json)
  } catch {
    return []
  }
}
