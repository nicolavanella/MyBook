import { Component, type ErrorInfo, type ReactNode } from 'react'
import { tNow } from '@renderer/i18n/useTranslation'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * React Error Boundary. Senza questo, un errore di rendering non gestito in
 * una qualsiasi pagina fa collassare silenziosamente l'intero albero React
 * fino alla radice, con effetti che possono sembrare "l'app torna alla
 * schermata iniziale" senza nessun messaggio — difficile da diagnosticare.
 * Con questo componente, l'errore viene mostrato chiaramente e l'utente può
 * tornare all'app senza riavviarla.
 * v0.4.0: è un componente a classe (niente hook), quindi usa `tNow` — la traduzione "istantanea" dello store.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] errore non gestito:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm font-medium text-gray-800">{tNow('errorBoundary.title')}</p>
          <p className="max-w-md text-xs text-gray-500">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
          >
            {tNow('errorBoundary.retry')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
