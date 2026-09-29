import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { clearLegacyKeys } from '@/lib/storage'

// Убираем ключи, оставшиеся от удалённых источников (OpenDota/Steam)
clearLegacyKeys()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
