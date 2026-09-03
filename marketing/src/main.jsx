import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from '@/App.jsx'
import Contact from '@/Contact.jsx'
import LuxuryScrollDemo from '@/LuxuryScrollDemo.jsx'
import MarketingShowcase from '@/components/MarketingShowcase.jsx'
import DemoThree from '@/DemoThree.jsx'

// No router dependency -- /contact is a real page, /demo, /demo2, and /demo3 each show a
// different framer-motion motion-style alternative, everything else renders the real site.
const path = window.location.pathname
const page =
  path === '/contact' ? <Contact /> :
  path === '/demo' ? <LuxuryScrollDemo /> :
  path === '/demo2' ? <MarketingShowcase /> :
  path === '/demo3' ? <DemoThree /> :
  <App />

createRoot(document.getElementById('root')).render(
  <StrictMode>{page}</StrictMode>,
)
