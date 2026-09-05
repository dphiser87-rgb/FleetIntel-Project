import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from '@/App.jsx'
import Contact from '@/Contact.jsx'
import LuxuryScrollDemo from '@/LuxuryScrollDemo.jsx'
import MarketingShowcase from '@/components/MarketingShowcase.jsx'
import DemoThree from '@/DemoThree.jsx'
import HeroCompareA from '@/HeroCompareA.jsx'
import HeroCompareB from '@/HeroCompareB.jsx'

// No router dependency -- /contact is a real page, /demo, /demo2, and /demo3 each show a
// different framer-motion motion-style alternative, /hero-a and /hero-b compare two hero "video"
// treatments, everything else renders the real site.
const path = window.location.pathname
const page =
  path === '/contact' ? <Contact /> :
  path === '/demo' ? <LuxuryScrollDemo /> :
  path === '/demo2' ? <MarketingShowcase /> :
  path === '/demo3' ? <DemoThree /> :
  path === '/hero-a' ? <HeroCompareA /> :
  path === '/hero-b' ? <HeroCompareB /> :
  <App />

createRoot(document.getElementById('root')).render(
  <StrictMode>{page}</StrictMode>,
)
