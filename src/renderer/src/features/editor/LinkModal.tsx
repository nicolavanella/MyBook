import { useEffect, useState } from 'react'
import { normalizeLinkUrl } from '@shared/linkUrl'
import { useTranslation } from '@renderer/i18n/useTranslation'

/**
 * Finestra per inserire/modificare/rimuovere un link (v0.4.0).
 * Sostituisce `window.prompt()`, non supportato da Electron: con quello lo
 * strumento Link lanciava un errore invece di aprire una richiesta.
 * L'indirizzo passa da normalizeLinkUrl (aggiunge https://, rifiuta
 * javascript: e simili); campo vuoto = rimuovi il link.
 */
export default function LinkModal({
  initialUrl,
  onApply,
  onClose
}: {
  /** Indirizzo del link già presente sulla selezione, se c'è. */
  initialUrl: string
  /** url "" = rimuovi il link. */
  onApply: (url: string) => void
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [value, setValue] = useState(initialUrl || 'https://')
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const submit = (raw: string) => {
    // "https://" lasciato com'è equivale a nessun indirizzo.
    const result = normalizeLinkUrl(raw.trim() === 'https://' ? '' : raw)
    if (!result.ok) {
      setInvalid(true)
      return
    }
    onApply(result.url)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">{t('link.title')}</h2>
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">{t('link.url')}</label>
        <input
          autoFocus
          value={value}
          spellCheck={false}
          onChange={(e) => {
            setValue(e.target.value)
            setInvalid(false)
          }}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => e.key === 'Enter' && submit(value)}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
        {invalid && <p className="mt-1 text-xs text-red-600">{t('link.invalid')}</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onApply('')}
            disabled={!initialUrl}
            className="rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:invisible dark:hover:bg-gray-700"
          >
            {t('link.remove')}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={() => submit(value)} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">
              {t('link.apply')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
