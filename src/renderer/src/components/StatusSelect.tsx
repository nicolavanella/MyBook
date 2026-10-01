import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { NodeStatus } from '@shared/schemas/document.schema'
import { NODE_STATUS_OPTIONS } from '@renderer/lib/nodeStatus'

/**
 * Selettore dello Stato di una scena (Idea / Bozza / Revisione / Finito) con
 * il pallino colorato accanto a ogni voce, coerente con l'albero del
 * Manoscritto (v0.3.4).
 *
 * Perché non un <select> nativo: le <option> native non possono contenere
 * elementi grafici (i pallini verrebbero ignorati), quindi qui c'è un
 * menu a discesa personalizzato che mantiene però la semantica accessibile
 * (ruoli listbox/option) e i comportamenti attesi: chiusura con click esterno
 * o Esc, navigazione da tastiera con frecce + Invio.
 */
export default function StatusSelect({
  value,
  onChange
}: {
  value: NodeStatus
  onChange: (status: NodeStatus) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  // Voce evidenziata durante la navigazione da tastiera (indice in NODE_STATUS_OPTIONS).
  const [highlighted, setHighlighted] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const current = NODE_STATUS_OPTIONS.find((o) => o.value === value) ?? NODE_STATUS_OPTIONS[0]

  // Chiude il menu con un click fuori dal componente.
  useEffect(() => {
    if (!open) return
    const onDocumentMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    return () => document.removeEventListener('mousedown', onDocumentMouseDown)
  }, [open])

  const openMenu = () => {
    setHighlighted(Math.max(0, NODE_STATUS_OPTIONS.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  const choose = (status: NodeStatus) => {
    setOpen(false)
    if (status !== value) onChange(status)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return openMenu()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setHighlighted((h) => (h + step + NODE_STATUS_OPTIONS.length) % NODE_STATUS_OPTIONS.length)
      return
    }
    if (e.key === 'Enter' && open) {
      e.preventDefault()
      choose(NODE_STATUS_OPTIONS[highlighted].value)
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0" onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Stato della scena"
        className="flex items-center gap-2 rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${current.dotClass}`} />
        <span>{current.label}</span>
        <ChevronDown size={13} className="text-gray-400" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Stato della scena"
          className="absolute right-0 z-30 mt-1 min-w-full rounded border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {NODE_STATUS_OPTIONS.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => choose(option.value)}
              className={`flex cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-1.5 ${
                index === highlighted ? 'bg-gray-100 dark:bg-gray-700' : ''
              } ${option.value === value ? 'font-medium' : ''}`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${option.dotClass}`} />
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
