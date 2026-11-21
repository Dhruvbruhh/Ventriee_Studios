import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { AuthRoot } from './auth'
import { initFx } from './fx'

void initFx()

// Errors in the studio window go to the opt-in local log (the main process ignores them when it is off).
window.addEventListener('error', (e) => void window.ventriee?.errorReport(e.message, e.error?.stack ?? '').catch(() => {}))
window.addEventListener('unhandledrejection', (e) => void window.ventriee?.errorReport(String(e.reason?.message ?? e.reason), e.reason?.stack ?? '').catch(() => {}))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthRoot />
  </StrictMode>
)
