import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './theme.css'
import App from './App.tsx'
import { AuthProvider } from './AuthContext.tsx'
import ThemeToggle from './ThemeToggle.tsx'
import { applyTheme, getSavedTheme } from './theme.ts'

// Prevent screen flash on load
applyTheme(getSavedTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
      <ThemeToggle />
    </AuthProvider>
  </StrictMode>,
)
