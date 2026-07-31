import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initSentry } from './lib/sentry'
import { initAnalytics } from './lib/analytics'
import { initTheme } from './lib/theme'
import './index.css'

initTheme()
initSentry()
initAnalytics()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
