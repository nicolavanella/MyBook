import { useState } from 'react'
import AutosizeTextarea from '@renderer/components/AutosizeTextarea'

export interface EditableNode {
  id: string
  label: string
  description: string
  node_type: string
  group_id: string | null
}

interface Props {
  node: EditableNode
  groupOptions: { id: string; label: string }[]
  onClose: () => void
  onSave: (label: string, description: string, groupId: string | null) => void
  onDelete: () => void
}

export default function EditMindmapNodeModal({ node, groupOptions, onClose, onSave, onDelete }: Props): JSX.Element {
  const [label, setLabel] = useState(node.label)
  const [description, setDescription] = useState(node.description)
  const [groupId, setGroupId] = useState<string>(node.group_id ?? '')

  const isEntityLinked = node.node_type !== 'free_note' && node.node_type !== 'group'

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-96 rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-sm font-semibold text-gray-800">Modifica nodo</h2>

        <label className="mb-1 block text-xs font-medium text-gray-600">Titolo</label>
        <input
          autoFocus
          disabled={isEntityLinked}
          className="mb-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        {isEntityLinked && (
          <p className="mb-3 text-xs text-gray-400">
            Collegato a un elemento esistente: rinominalo dalla sua sezione dedicata.
          </p>
        )}
        {!isEntityLinked && <div className="mb-3" />}

        <label className="mb-1 block text-xs font-medium text-gray-600">Descrizione</label>
        <AutosizeTextarea
          rows={3}
          className="mb-3 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {node.node_type !== 'group' && groupOptions.length > 0 && (
          <>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Gruppo (vista kanban)
            </label>
            <select
              className="mb-4 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              <option value="">— nessuno —</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="flex justify-between gap-2">
          <button
            onClick={onDelete}
            className="rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            Elimina nodo
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
              Annulla
            </button>
            <button
              onClick={() => onSave(label, description, groupId || null)}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
            >
              Salva
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
