import { useEffect, useState } from 'react'
import AutosizeTextarea from '@renderer/components/AutosizeTextarea'

/** Modal per "Aggiungi commento…" (dal menu contestuale) e "Modifica" (dalla sezione Commenti): stessa interfaccia, cambia solo il testo iniziale e il titolo. */
export default function CommentModal({
  initialText = '',
  onSave,
  onClose
}: {
  initialText?: string
  onSave: (text: string) => void
  onClose: () => void
}): JSX.Element {
  const [text, setText] = useState(initialText)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleSave = () => {
    if (!text.trim()) return
    onSave(text.trim())
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
          {initialText ? 'Modifica commento' : 'Aggiungi commento'}
        </h2>
        <AutosizeTextarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Scrivi il commento…"
          className="w-full resize-none rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave()
          }}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!text.trim()}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  )
}
