import { useRef } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { formatCalendarDate, type CalendarLanguage } from '@shared/calendarDate'

/**
 * Campo "Data" selezionabile da calendario (v0.3.4), mostrata come
 * "Nome giorno, GG/MM/AAAA" (es. "lunedì, 21/09/2026").
 *
 * Un <input type="date"> nativo mostrerebbe la data nel formato della
 * lingua di sistema e senza il nome del giorno. Qui il campo visibile è un
 * pulsante con la data già formattata; il vero <input type="date"> resta
 * nascosto (ma allineato al pulsante) e viene aperto con showPicker(), così
 * il calendario è quello nativo, con tastiera e accessibilità incluse.
 *
 * Il valore scambiato con il chiamante è sempre ISO "AAAA-MM-GG" oppure ""
 * (data non impostata) — vedi shared/calendarDate.ts.
 */
export default function CalendarDateField({
  value,
  onChange,
  language = 'it',
  placeholder = 'Data'
}: {
  value: string
  onChange: (iso: string) => void
  language?: CalendarLanguage
  placeholder?: string
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const label = formatCalendarDate(value, language)

  const openPicker = () => {
    const input = inputRef.current
    if (!input) return
    try {
      input.showPicker()
    } catch {
      // showPicker può lanciare se non chiamato da un gesto utente: ripiego sul click nativo.
      input.click()
    }
  }

  return (
    <div className="relative inline-flex items-center rounded border border-gray-200 text-xs text-gray-500 dark:border-gray-700">
      <button
        type="button"
        onClick={openPicker}
        title="Scegli la data dal calendario"
        className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        <CalendarDays size={12} className="shrink-0" />
        <span className={label ? '' : 'text-gray-400'}>{label || placeholder}</span>
      </button>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          title="Rimuovi la data"
          className="px-1 text-gray-300 hover:text-red-600"
        >
          <X size={12} />
        </button>
      )}
      {/* Input reale: invisibile e non focalizzabile con Tab (il pulsante è il punto d'accesso), ma posizionato sotto il pulsante così il calendario nativo si apre lì vicino. */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
    </div>
  )
}
