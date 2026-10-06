import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { ConfirmProvider } from './components/ConfirmDialog'
import { initLanguage } from './i18n/useTranslation'
import './styles/index.css'

// v0.4.0: lingua dell'interfaccia disponibile prima del primo render (cache locale + impostazioni).
initLanguage()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfirmProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </ConfirmProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
