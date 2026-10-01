import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from '@/App.jsx'
import Contact from '@/Contact.jsx'
import LuxuryScrollDemo from '@/LuxuryScrollDemo.jsx'
import MarketingShowcase from '@/components/MarketingShowcase.jsx'
import DemoThree from '@/DemoThree.jsx'
import V2 from '@/V2.jsx'

// No router dependency -- /contact is a real page, /demo, /demo2, and /demo3 each show a
// different framer-motion motion-style alternative, everything else renders the real site.
// (The /hero-a vs /hero-b hero comparison that used to live here was resolved 2026-09-05 -- B
// won and is now just Hero.jsx itself.)
const path = window.location.pathname
const page =
  path === '/contact' ? <Contact /> :
  path === '/demo' ? <LuxuryScrollDemo /> :
  path === '/demo2' ? <MarketingShowcase /> :
  path === '/demo3' ? <DemoThree /> :
  // /v2 is a full alternative layout of the real site (same content, same palette), kept alongside
  // the live one so the two can be compared at the same URL rather than judged from memory.
  path === '/v2' ? <V2 /> :
  <App />

createRoot(document.getElementById('root')).render(
  <StrictMode>{page}</StrictMode>,
)
