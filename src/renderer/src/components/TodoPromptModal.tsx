import { useState } from 'react'

/**
 * Prompt "cosa fare la prossima volta" mostrato alla chiusura di un
 * progetto (v0.3.5): un campo di testo libero, salvato come nota "To Do" del
 * progetto e riproposto nel recap alla successiva apertura dell'app.
 *
 * `initialValue` precompila con la nota lasciata l'ultima volta (comodo per
 * correggerla invece di riscriverla da capo). "Salta" chiude senza
 * modificare la nota esistente; "Salva e chiudi" la sovrascrive anche con
 * una stringa vuota, che equivale a cancellarla.
 */
export default function TodoPromptModal({
  projectTitle,
  initialValue,
  onSubmit,
  onSkip
}: {
  projectTitle: string
  initialValue: string
  onSubmit: (text: string) => void
  onSkip: () => void
}): JSX.Element {
  const [text, setText] = useState(initialValue)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(text)
        }}
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800"
      >
        <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">Prima di chiudere «{projectTitle}»</h2>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Cosa fare la prossima volta? (facoltativo)</p>
        <textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Es. Rivedere il dialogo del capitolo 4, sistemare la timeline…"
          className="mb-4 w-full resize-none rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Salta
          </button>
          <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Salva e chiudi
          </button>
        </div>
      </form>
    </div>
  )
}
