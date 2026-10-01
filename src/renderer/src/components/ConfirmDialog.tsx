import { useState, useCallback, createContext, useContext, useRef } from 'react'

interface ConfirmOptions {
  message: string
  confirmLabel?: string
  danger?: boolean
}

interface PromptOptions {
  message: string
  defaultValue?: string
  confirmLabel?: string
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>
type PromptFn = (options: PromptOptions) => Promise<string | null>

const ConfirmContext = createContext<ConfirmFn | null>(null)
const PromptContext = createContext<PromptFn | null>(null)

/**
 * Sostituisce window.confirm()/window.prompt(): i dialog nativi bloccanti di
 * Electron sono una causa nota di perdita del focus della finestra dopo la
 * chiusura (in alcuni casi impediscono di digitare in qualsiasi campo finché
 * non si clicca manualmente da qualche parte). Questo componente React evita
 * completamente il problema restando dentro il normale ciclo di eventi.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null)
  const confirmResolveRef = useRef<(value: boolean) => void>()

  const [promptOptions, setPromptOptions] = useState<PromptOptions | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const promptResolveRef = useRef<(value: string | null) => void>()

  const confirm = useCallback<ConfirmFn>((opts) => {
    setConfirmOptions(opts)
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve
    })
  }, [])

  const prompt = useCallback<PromptFn>((opts) => {
    setPromptOptions(opts)
    setPromptValue(opts.defaultValue ?? '')
    return new Promise((resolve) => {
      promptResolveRef.current = resolve
    })
  }, [])

  const handleConfirm = (result: boolean) => {
    setConfirmOptions(null)
    confirmResolveRef.current?.(result)
  }

  const handlePrompt = (result: string | null) => {
    setPromptOptions(null)
    promptResolveRef.current?.(result)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      <PromptContext.Provider value={prompt}>
        {children}
        {confirmOptions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
              <p className="mb-4 text-sm text-gray-800">{confirmOptions.message}</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => handleConfirm(false)}
                  className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                >
                  Annulla
                </button>
                <button
                  autoFocus
                  onClick={() => handleConfirm(true)}
                  className={`rounded px-3 py-1.5 text-sm font-medium text-white ${
                    confirmOptions.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {confirmOptions.confirmLabel ?? 'Conferma'}
                </button>
              </div>
            </div>
          </div>
        )}
        {promptOptions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handlePrompt(promptValue.trim() || null)
              }}
              className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
            >
              <p className="mb-2 text-sm text-gray-800">{promptOptions.message}</p>
              <input
                autoFocus
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="mb-4 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handlePrompt(null)}
                  className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {promptOptions.confirmLabel ?? 'OK'}
                </button>
              </div>
            </form>
          </div>
        )}
      </PromptContext.Provider>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm deve essere usato dentro <ConfirmProvider>')
  return ctx
}

export function usePrompt(): PromptFn {
  const ctx = useContext(PromptContext)
  if (!ctx) throw new Error('usePrompt deve essere usato dentro <ConfirmProvider>')
  return ctx
}
