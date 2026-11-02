import { useState } from 'react'
import { HardDriveDownload } from 'lucide-react'
import { useTranslation } from '@renderer/i18n/useTranslation'

/**
 * Richiesta della cartella di backup (v0.4.1), mostrata UNA volta al primo
 * avvio in cui non ne è definita una (regole in shared/promptFlags.ts).
 *
 * Perché una finestra e non solo l'impostazione: i backup sono l'unica
 * protezione contro la perdita del lavoro, ma restano inattivi finché non
 * si sceglie dove salvarli — e chi non va a cercare le Impostazioni non lo
 * scopre mai. "Più tardi" non è un rifiuto definitivo: la scelta resta in
 * Impostazioni > Generale > Backup. La richiesta non si ripresenta.
 */
export default function BackupSetupModal({
  onChoose,
  onLater
}: {
  /** Apre il selettore di cartelle; restituisce true se una cartella è stata scelta e salvata. */
  onChoose: () => Promise<boolean>
  onLater: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const choose = async () => {
    setBusy(true)
    try {
      await onChoose() // se l'utente annulla il selettore, la finestra resta aperta: può riprovare o scegliere "Più tardi"
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div role="dialog" aria-label={t('backupSetup.title')} className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
        <div className="mb-2 flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <HardDriveDownload size={18} />
          <h2 className="text-sm font-semibold">{t('backupSetup.title')}</h2>
        </div>
        <p className="mb-2 text-sm text-gray-700 dark:text-gray-300">{t('backupSetup.description')}</p>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t('backupSetup.hint')}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onLater}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {t('backupSetup.later')}
          </button>
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={choose}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {t('backupSetup.choose')}
          </button>
        </div>
      </div>
    </div>
  )
}
