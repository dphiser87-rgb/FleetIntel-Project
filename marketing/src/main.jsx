import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LuxuryScrollDemo from './LuxuryScrollDemo.jsx'

// No router dependency for a single comparison page -- /demo shows the framer-motion motion-style
// demo, everything else renders the real site.
const isDemo = window.location.pathname === '/demo'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isDemo ? <LuxuryScrollDemo /> : <App />}
  </StrictMode>,
)
