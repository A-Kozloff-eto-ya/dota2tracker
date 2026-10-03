import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { clearLegacyKeys, clearServiceWorkers } from '@/lib/storage'

// Убираем ключи, оставшиеся от удалённых источников (OpenDota/Steam)
clearLegacyKeys()
void clearServiceWorkers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
