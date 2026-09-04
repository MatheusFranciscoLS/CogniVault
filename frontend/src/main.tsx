import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, ThemedToaster } from './components/ThemeProvider'
import { QuoteCartProvider } from './context/QuoteCartContext'
import QuickQuoteCart from './components/QuickQuoteCart'

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
          <App />
          <QuickQuoteCart />
          <ThemedToaster />
        </QuoteCartProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
