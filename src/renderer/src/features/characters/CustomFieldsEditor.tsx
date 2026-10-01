import AutosizeTextarea from '@renderer/components/AutosizeTextarea'
export interface CustomField {
  label: string
  value: string
}

interface Props {
  fields: CustomField[]
  onChange: (fields: CustomField[]) => void
}

export default function CustomFieldsEditor({ fields, onChange }: Props): JSX.Element {
  const updateField = (index: number, patch: Partial<CustomField>) => {
    const next = fields.map((f, i) => (i === index ? { ...f, ...patch } : f))
    onChange(next)
  }

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index))
  }

  const addField = () => {
    onChange([...fields, { label: '', value: '' }])
  }

  return (
    <div className="space-y-2">
      {fields.map((field, i) => (
        <div key={i} className="flex gap-2">
          <input
            className="w-1/3 rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder="Etichetta"
            value={field.label}
            onChange={(e) => updateField(i, { label: e.target.value })}
          />
          <AutosizeTextarea
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder="Valore"
            rows={field.value.includes('\n') ? 3 : 1}
            value={field.value}
            onChange={(e) => updateField(i, { value: e.target.value })}
          />
          <button
            onClick={() => removeField(i)}
            className="px-2 text-sm text-gray-400 hover:text-red-600"
            title="Rimuovi campo"
          >
            ✕
          </button>
        </div>
      ))}
      <button onClick={addField} className="text-sm text-blue-600 hover:underline">
        + aggiungi campo
      </button>
    </div>
  )
}
