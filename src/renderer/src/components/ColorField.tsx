import { X } from 'lucide-react'

const DEFAULT_COLOR = '#94a3b8'

/**
 * Campo colore riutilizzabile (Personaggi/Località/Oggetti/Timeline): solo
 * il selettore colore nativo del sistema operativo, senza il campo
 * esadecimale testuale (rimosso su richiesta — semplifica l'interfaccia,
 * il selettore nativo è già sufficiente per scegliere qualunque colore).
 */
export default function ColorField({ value, onChange }: { value: string; onChange: (color: string) => void }): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={value || DEFAULT_COLOR}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 shrink-0 cursor-pointer rounded border border-gray-300 bg-transparent p-0.5 dark:border-gray-600"
        title="Scegli colore"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} title="Rimuovi colore" className="text-gray-300 hover:text-gray-600 dark:hover:text-gray-300">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
