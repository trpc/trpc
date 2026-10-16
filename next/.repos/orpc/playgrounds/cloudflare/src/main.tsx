import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './global.css'
import { Providers } from './providers'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
)
