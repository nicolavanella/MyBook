import { forwardRef, useEffect, useRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'

const DEFAULT_MAX_ROWS = 10

/**
 * Textarea "autosize": cresce con il contenuto invece di restare a un numero
 * fisso di righe, fino a `maxRows` (10 di default) oltre le quali torna a
 * scrollare normalmente. Sostituisce le `<textarea rows={N}>` sparse in
 * tutta l'app (Personaggi/Località/Oggetti, editor scena, Timeline, modali
 * di creazione…), così un testo breve non lascia spazio vuoto e uno lungo
 * non sfonda il layout.
 *
 * L'altezza è ricalcolata leggendo `scrollHeight` dopo aver azzerato
 * `height` (unico modo affidabile per misurare il contenuto reale di una
 * textarea), sia al mount sia a ogni input.
 */
const AutosizeTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number }>(
  ({ maxRows = DEFAULT_MAX_ROWS, onInput, className, ...rest }, forwardedRef) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null)

    const resize = (el: HTMLTextAreaElement | null) => {
      if (!el) return
      el.style.height = 'auto'
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
      const maxHeight = lineHeight * maxRows
      const nextHeight = Math.min(el.scrollHeight, maxHeight)
      el.style.height = `${nextHeight}px`
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
    }

    // Ricalcola al mount: copre sia il caso defaultValue precompilato (es.
    // aprendo una scheda già scritta) sia il remount forzato via key quando
    // il chiamante cambia elemento selezionato.
    useEffect(() => {
      resize(innerRef.current)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
      <textarea
        ref={(el) => {
          innerRef.current = el
          if (typeof forwardedRef === 'function') forwardedRef(el)
          else if (forwardedRef) forwardedRef.current = el
        }}
        onInput={(e) => {
          resize(e.currentTarget)
          onInput?.(e)
        }}
        className={className}
        {...rest}
      />
    )
  }
)
AutosizeTextarea.displayName = 'AutosizeTextarea'

export default AutosizeTextarea
