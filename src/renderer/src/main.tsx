import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { AuthRoot } from './auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthRoot />
  </StrictMode>
)
