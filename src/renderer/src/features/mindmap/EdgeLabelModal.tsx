import { useEffect, useState } from 'react'
import { useTranslation } from '@renderer/i18n/useTranslation'

/**
 * Finestra per aggiungere, modificare o togliere l'etichetta di un
 * collegamento della mappa (doppio click sul collegamento, v0.4.1).
 *
 * Non si usa `usePrompt`: restituisce null sia per "Annulla" sia per un
 * campo vuoto, quindi non permetterebbe di CANCELLARE un'etichetta. Qui il
 * campo vuoto è una risposta valida ("nessuna etichetta") e Annulla non
 * cambia nulla.
 */
export default function EdgeLabelModal({
  initialLabel,
  onSave,
  onClose
}: {
  initialLabel: string
  /** label "" = rimuovi l'etichetta. */
  onSave: (label: string) => void
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [value, setValue] = useState(initialLabel)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-96 rounded-lg bg-white p-4 shadow-xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">{t('mindmap.edge.title')}</h2>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => e.key === 'Enter' && onSave(value)}
          placeholder={t('mindmap.edge.placeholder')}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
        <p className="mt-1 text-xs text-gray-400">{t('mindmap.edge.hint')}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={() => onSave(value)} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
