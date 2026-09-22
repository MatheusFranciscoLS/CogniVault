import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './experience-polish.css'
import App from './App.tsx'
import { ThemeProvider, ThemedToaster } from './components/ThemeProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="cognivault-theme">
      <App />
      <ThemedToaster />
    </ThemeProvider>
  </StrictMode>,
)
