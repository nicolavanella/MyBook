import { useEffect, useReducer, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { eventToShortcut, type ResolvedShortcuts } from '@shared/shortcuts'
import type { SearchOptions } from '@shared/textSearch'
import { useTranslation } from '@renderer/i18n/useTranslation'
import { IS_MAC } from '@renderer/lib/platform'
import {
  currentMatchIndex,
  getSearchState,
  goToMatchTransaction,
  replaceAllTransaction,
  replaceCurrentTransaction,
  setSearchTransaction
} from './extensions/searchExtension'

/** Richiesta di apertura/messa a fuoco: `nonce` cambia a ogni richiesta, anche con la finestra già aperta (Ctrl+F e Ctrl+H ripetuti). */
export interface FindRequest {
  mode: 'find' | 'replace'
  nonce: number
  /** Testo selezionato nell'editor al momento della richiesta ("" = nessuno): precompila il campo Trova, come negli altri editor. */
  prefill: string
}

const NO_SEARCH: SearchOptions = { caseSensitive: false, wholeWord: false }

/**
 * Finestra "Cerca e sostituisci" (v0.4.0).
 *
 * Scelta di design: è una finestra FLOTTANTE e non bloccante (nessuno sfondo
 * oscurato), ancorata sotto la toolbar. Una modal bloccante impedirebbe di
 * vedere e correggere il testo trovato mentre si scorrono i risultati, che è
 * proprio l'uso tipico. Si chiude con Esc o con la X; l'editor resta attivo.
 *
 * Lo stato della ricerca (query, opzioni, occorrenze) vive nel plugin
 * dell'editor (searchExtension.ts), non qui: questa componente lo imposta e
 * lo legge a ogni transazione, così contatore ed evidenziazione non possono
 * andare fuori sincrono rispetto al testo.
 */
export default function FindReplaceDialog({
  editor,
  request,
  shortcuts,
  onClose
}: {
  editor: Editor
  request: FindRequest
  shortcuts: ResolvedShortcuts
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState(request.prefill)
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const findRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  // Allinea il plugin di ricerca ai campi della finestra.
  useEffect(() => {
    editor.view.dispatch(setSearchTransaction(editor.state, query, { caseSensitive, wholeWord }))
    setStatus(null)
  }, [editor, query, caseSensitive, wholeWord])

  // Alla chiusura toglie l'evidenziazione dal testo.
  useEffect(() => {
    return () => {
      try {
        if (!editor.isDestroyed) editor.view.dispatch(setSearchTransaction(editor.state, '', NO_SEARCH))
      } catch {
        /* editor già smontato (cambio pagina): niente da ripulire */
      }
    }
  }, [editor])

  // Contatore ("3 di 12") e pulsanti seguono ogni modifica di testo o di selezione.
  useEffect(() => {
    const onTransaction = () => rerender()
    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
    }
  }, [editor])

  // Ogni richiesta (anche a finestra già aperta) porta il focus sul campo giusto.
  useEffect(() => {
    if (request.prefill) setQuery(request.prefill)
    const target = request.mode === 'replace' ? replaceRef.current : findRef.current
    target?.focus()
    target?.select()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.nonce])

  const { matches } = getSearchState(editor.state)
  const total = matches.length
  const current = currentMatchIndex(editor.state)
  const canReplace = editor.isEditable && total > 0

  const counter =
    query === ''
      ? ''
      : total === 0
        ? t('find.noResults')
        : current >= 0
          ? t('find.position', { current: current + 1, total })
          : t('find.count', { count: total })

  const go = (direction: 'next' | 'prev') => {
    const tr = goToMatchTransaction(editor.state, direction)
    if (tr) editor.view.dispatch(tr)
  }

  /**
   * "Sostituisci": se la selezione è un'occorrenza la sostituisce e passa alla
   * successiva; altrimenti seleziona soltanto la prossima (senza sostituire a vuoto).
   */
  const replaceOne = () => {
    if (!editor.isEditable) return
    const wasOnMatch = currentMatchIndex(editor.state) !== -1
    const tr = replaceCurrentTransaction(editor.state, replacement)
    if (tr) editor.view.dispatch(tr)
    if (wasOnMatch) go('next')
    setStatus(null)
  }

  const replaceAll = () => {
    if (!editor.isEditable) return
    const result = replaceAllTransaction(editor.state, replacement)
    if (!result) return
    editor.view.dispatch(result.tr)
    setStatus(t('find.replaced', { count: result.count }))
  }

  const focusField = (ref: React.RefObject<HTMLInputElement>) => {
    ref.current?.focus()
    ref.current?.select()
  }

  const close = () => {
    onClose()
    editor.commands.focus()
  }

  const onContainerKeyDown = (e: React.KeyboardEvent) => {
    // Le stesse scorciatoie configurabili di Cerca/Sostituisci riportano il focus sul campo corrispondente.
    const combo = eventToShortcut(e.nativeEvent, IS_MAC)
    if (combo && combo === shortcuts.find) {
      e.preventDefault()
      focusField(findRef)
    } else if (combo && combo === shortcuts.replace) {
      e.preventDefault()
      focusField(replaceRef)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  const input =
    'w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100'
  const iconButton =
    'rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-300 dark:hover:bg-gray-700'
  const textButton =
    'rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'

  return (
    <div
      role="dialog"
      aria-label={t('find.title')}
      onKeyDown={onContainerKeyDown}
      className="absolute right-6 top-full z-20 mt-1 w-[26rem] max-w-[calc(100%-3rem)] rounded-lg border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-600 dark:bg-gray-800"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t('find.title')}</h2>
        <button type="button" onClick={close} title={t('common.close')} className={iconButton}>
          <X size={14} />
        </button>
      </div>

      <div className="flex items-center gap-1">
        <input
          ref={findRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              go(e.shiftKey ? 'prev' : 'next')
            }
          }}
          placeholder={t('find.findPlaceholder')}
          spellCheck={false}
          className={input}
        />
        <button type="button" onClick={() => go('prev')} disabled={total === 0} title={t('find.previous')} className={iconButton}>
          <ArrowUp size={15} />
        </button>
        <button type="button" onClick={() => go('next')} disabled={total === 0} title={t('find.next')} className={iconButton}>
          <ArrowDown size={15} />
        </button>
      </div>

      <div className="mt-1 flex h-5 items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span aria-live="polite">{counter}</span>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-700 dark:text-gray-300">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} />
          {t('find.wholeWord')}
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
          {t('find.matchCase')}
        </label>
      </div>

      <input
        ref={replaceRef}
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            replaceOne()
          }
        }}
        placeholder={t('find.replacePlaceholder')}
        spellCheck={false}
        disabled={!editor.isEditable}
        className={`${input} disabled:opacity-50`}
      />

      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={replaceOne} disabled={!canReplace} className={textButton}>
          {t('find.replace')}
        </button>
        <button type="button" onClick={replaceAll} disabled={!canReplace} className={textButton}>
          {t('find.replaceAll')}
        </button>
        {!editor.isEditable && <span className="text-xs text-amber-700 dark:text-amber-400">{t('find.readOnly')}</span>}
      </div>

      {status && (
        <p className="mt-2 text-xs text-green-700 dark:text-green-400" aria-live="polite">
          {status}
        </p>
      )}
    </div>
  )
}
