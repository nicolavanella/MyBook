import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { ConfirmProvider } from './components/ConfirmDialog'
import './styles/index.css'

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
