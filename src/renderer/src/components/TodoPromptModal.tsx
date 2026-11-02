import { useState } from 'react'
import { useTranslation } from '@renderer/i18n/useTranslation'

/**
 * Prompt "cosa fare la prossima volta" mostrato alla chiusura di un
 * progetto (v0.3.5): un campo di testo libero, salvato come nota "To Do" del
 * progetto e riproposto nel recap alla successiva apertura dell'app.
 *
 * `initialValue` precompila con la nota lasciata l'ultima volta (comodo per
 * correggerla invece di riscriverla da capo). "Salta" chiude senza
 * modificare la nota esistente; "Salva e chiudi" la sovrascrive anche con
 * una stringa vuota, che equivale a cancellarla.
 *
 * v0.4.2 — "Annulla" (o Esc): interrompe l'azione che ha fatto comparire il prompt
 * (la chiusura dell'app o l'uscita dal progetto) senza modificare la nota.
 *
 * v0.4.1 — "Non mostrare più": una casella che, qualunque pulsante si prema (anche "Salta"), disattiva
 * questa finestra E il recap all'apertura dei progetti. Si riattiva da Impostazioni > Log. Se si
 * sceglie "Salva e chiudi" la nota viene comunque salvata.
 */
export default function TodoPromptModal({
  projectTitle,
  initialValue,
  onSubmit,
  onSkip,
  onCancel
}: {
  projectTitle: string
  initialValue: string
  onSubmit: (text: string, dontShowAgain: boolean) => void
  onSkip: (dontShowAgain: boolean) => void
  /** v0.4.2: "Annulla" (o Esc) — non si chiude l'app / non si esce dal progetto, la nota non viene toccata. */
  onCancel: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [text, setText] = useState(initialValue)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(text, dontShowAgain)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
        }}
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800"
      >
        <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{t('todo.title', { title: projectTitle })}</h2>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t('todo.question')}</p>
        <textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('todo.placeholder')}
          className="mb-4 w-full resize-none rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
        <div className="flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300" title={t('todo.dontShowAgainHint')}>
            <input type="checkbox" checked={dontShowAgain} onChange={(e) => setDontShowAgain(e.target.checked)} />
            {t('todo.dontShowAgain')}
          </label>
          <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onSkip(dontShowAgain)}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {t('todo.skip')}
          </button>
          <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            {t('todo.saveAndClose')}
          </button>
          </div>
        </div>
      </form>
    </div>
  )
}
