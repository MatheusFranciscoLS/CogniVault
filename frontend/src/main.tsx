import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './experience-polish.css'
import App from './App.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, ThemedToaster } from './components/ThemeProvider'
import { QuoteCartProvider } from './context/QuoteCartContext'
import { CounterSessionProvider } from './context/CounterSessionProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="cognivault-theme">
        <QuoteCartProvider>
          <CounterSessionProvider>
            <App />
            <ThemedToaster />
          </CounterSessionProvider>
        </QuoteCartProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
