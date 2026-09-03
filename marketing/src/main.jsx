import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from '@/App.jsx'
import LuxuryScrollDemo from '@/LuxuryScrollDemo.jsx'
import MarketingShowcase from '@/components/MarketingShowcase.jsx'

// No router dependency for these comparison pages -- /demo and /demo2 each show a different
// framer-motion motion-style alternative, everything else renders the real site.
const path = window.location.pathname

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {path === '/demo' ? <LuxuryScrollDemo /> : path === '/demo2' ? <MarketingShowcase /> : <App />}
  </StrictMode>,
)
