import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import NavBar from './components/NavBar'
import LoginModal from './components/LoginModal'
import './App.css'

const Home = lazy(() => import('./pages/Home'))
const SeniorCare = lazy(() => import('./pages/SeniorCare'))
const InHouse = lazy(() => import('./pages/InHouse'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const MyBookings = lazy(() => import('./pages/MyBookings'))
const MyOrders = lazy(() => import('./pages/MyOrders'))
const Settings = lazy(() => import('./pages/Settings'))
const CustomizeProfile = lazy(() => import('./pages/CustomizeProfile'))
const CreatePersona = lazy(() => import('./pages/CreatePersona'))
const PersonaPermissions = lazy(() => import('./pages/PersonaPermissions'))
const Payment = lazy(() => import('./pages/Payment'))
const Login = lazy(() => import('./components/Login'))
const ResetPassowrd = lazy(() => import('./components/ResetPassowrd'))
const BookingDashboard = lazy(() => import('./components/Dashboard/BookingDashboard'))
const About = lazy(() => import('./pages/About'))
const Media = lazy(() => import('./pages/Media'))
const Terms = lazy(() => import('./pages/Terms'))
const Privacy = lazy(() => import('./pages/Privacy'))

const SEO_CONFIG = {
  '/': {
    title: 'Vaishnavi Medicare | Senior Care & In-Home Nursing Services',
    description:
      'Book trusted senior care, in-home nursing, and assisted living services with Vaishnavi Medicare. Compassionate, trained caregivers and flexible care plans.',
    keywords:
      'senior care, in home nursing, elderly care, home health care, caregiver services, assisted living',
    index: true,
  },
  '/senior-care': {
    title: 'Book Senior Care at Home | Vaishnavi Medicare',
    description:
      'Schedule personalized at-home senior care with trained nurses and caregivers. Compare packages and book care services based on your family needs.',
    keywords:
      'senior care booking, at home elder care, home nurse booking, elderly caregiver at home',
    index: true,
  },
  '/in-house': {
    title: 'In-House Senior Care Packages | Vaishnavi Medicare',
    description:
      'Explore in-house senior care and assisted stay options at Vaishnavi Medicare partner facilities with professional medical support.',
    keywords: 'in house senior care, assisted care facility, elder care premises, care home services',
    index: true,
  },
  '/about': {
    title: 'About Us | Vaishnavi Medicare',
    description:
      'Learn about Vaishnavi Medicare and how we help families arrange at-home and in-facility senior care with trained professionals.',
    keywords: 'about vaishnavi medicare, senior care company, home care india',
    index: true,
  },
  '/media': {
    title: 'Media | Vaishnavi Medicare',
    description:
      'Browse Vaishnavi Medicare photos, blogs, videos, and community discussions.',
    keywords: 'vaishnavi medicare media, senior care blogs, home nursing videos, photos',
    index: true,
  },
  '/terms': {
    title: 'Terms & Conditions | Vaishnavi Medicare',
    description: 'Terms of use, bookings, cancellations, and refunds for Vaishnavi Medicare services.',
    keywords: 'terms and conditions, cancellation policy, refunds',
    index: true,
  },
  '/privacy': {
    title: 'Privacy Policy | Vaishnavi Medicare',
    description: 'How Vaishnavi Medicare collects, uses, and protects your personal information.',
    keywords: 'privacy policy, data protection, personal information',
    index: true,
  },
  '/dashboard': {
    title: 'Dashboard | Vaishnavi Medicare',
    description: 'Manage your bookings, invoices, and profile details.',
    keywords: 'dashboard, bookings, invoices',
    index: true,
  },
  '/my-bookings': {
    title: 'My Bookings | Vaishnavi Medicare',
    description: 'View and manage your active and past bookings.',
    keywords: 'my bookings, senior care bookings',
    index: false,
  },
  '/my-orders': {
    title: 'My Orders | Vaishnavi Medicare',
    description: 'Track your care orders and booking details.',
    keywords: 'my orders, care orders',
    index: false,
  },
  '/settings': {
    title: 'Settings | Vaishnavi Medicare',
    description: 'Update your profile and account preferences.',
    keywords: 'profile settings, account settings',
    index: false,
  },
  '/customize-profile': {
    title: 'Customize Profile | Vaishnavi Medicare',
    description: 'Customize your care preferences and profile details.',
    keywords: 'custom profile, care preferences',
    index: false,
  },
  '/create-persona': {
    title: 'Create Persona | Vaishnavi Medicare',
    description: 'Master Admin page to create Owner or Tenant Manager accounts.',
    keywords: 'create persona, create owner, tenant manager, master admin',
    index: false,
  },
  '/persona-permissions': {
    title: 'Permissions | Vaishnavi Medicare',
    description: 'Master Admin preview of persona permissions (Read, Write, Edit, Delete).',
    keywords: 'permissions, persona, master admin, roles',
    index: false,
  },
  '/create-owner': {
    title: 'Create Persona | Vaishnavi Medicare',
    description: 'Master Admin page to create Owner or Tenant Manager accounts.',
    keywords: 'create persona, create owner, tenant manager, master admin',
    index: false,
  },
  '/pay': {
    title: 'Payment | Vaishnavi Medicare',
    description: 'Securely complete your booking payment.',
    keywords: 'booking payment, secure payment',
    index: false,
  },
  '/login': {
    title: 'Login | Vaishnavi Medicare',
    description: 'Log in to manage your care bookings and dashboard.',
    keywords: 'login, account access',
    index: false,
  },
  '/reset-password': {
    title: 'Reset Password | Vaishnavi Medicare',
    description: 'Reset your Vaishnavi Medicare account password.',
    keywords: 'reset password, account recovery',
    index: false,
  },
  '/booking': {
    title: 'Booking Dashboard | Vaishnavi Medicare',
    description: 'Manage booking operations and schedules.',
    keywords: 'booking dashboard, booking management',
    index: false,
  },
}

const DEFAULT_SEO = {
  title: 'Vaishnavi Medicare | Senior Care Services',
  description:
    'Vaishnavi Medicare offers reliable senior care and nursing support services with compassionate caregivers.',
  keywords: 'senior care services, caregiver services, home care',
  index: true,
}

const upsertMeta = ({ name, property, content }) => {
  if (!content) return
  const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`
  let tag = document.head.querySelector(selector)
  if (!tag) {
    tag = document.createElement('meta')
    if (name) tag.setAttribute('name', name)
    if (property) tag.setAttribute('property', property)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

const upsertLink = ({ rel, href }) => {
  if (!href) return
  let tag = document.head.querySelector(`link[rel="${rel}"]`)
  if (!tag) {
    tag = document.createElement('link')
    tag.setAttribute('rel', rel)
    document.head.appendChild(tag)
  }
  tag.setAttribute('href', href)
}

function SeoManager() {
  const { pathname } = useLocation()

  useEffect(() => {
    const routeSeo = SEO_CONFIG[pathname] || DEFAULT_SEO
    const origin = window.location.origin
    const canonical = `${origin}${pathname}`
    const ogImage = `${origin}/favicon.svg`
    const robots = routeSeo.index ? 'index, follow' : 'noindex, nofollow'

    document.title = routeSeo.title

    upsertMeta({ name: 'description', content: routeSeo.description })
    upsertMeta({ name: 'keywords', content: routeSeo.keywords })
    upsertMeta({ name: 'robots', content: robots })
    upsertMeta({ property: 'og:title', content: routeSeo.title })
    upsertMeta({ property: 'og:description', content: routeSeo.description })
    upsertMeta({ property: 'og:type', content: 'website' })
    upsertMeta({ property: 'og:site_name', content: 'Vaishnavi Medicare' })
    upsertMeta({ property: 'og:locale', content: 'en_IN' })
    upsertMeta({ property: 'og:url', content: canonical })
    upsertMeta({ property: 'og:image', content: ogImage })
    upsertMeta({ name: 'twitter:card', content: 'summary_large_image' })
    upsertMeta({ name: 'twitter:title', content: routeSeo.title })
    upsertMeta({ name: 'twitter:description', content: routeSeo.description })
    upsertMeta({ name: 'twitter:image', content: ogImage })
    upsertMeta({ name: 'theme-color', content: '#0f766e' })

    upsertLink({ rel: 'canonical', href: canonical })

    const schemaId = 'vsmc-organization-schema'
    const existingSchema = document.getElementById(schemaId)
    if (!existingSchema) {
      const script = document.createElement('script')
      script.id = schemaId
      script.type = 'application/ld+json'
      script.text = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Vaishnavi Medicare',
        url: origin,
        logo: `${origin}/favicon.svg`,
        sameAs: [],
      })
      document.head.appendChild(script)
    }

    const websiteSchemaId = 'vsmc-website-schema'
    const existingWebsiteSchema = document.getElementById(websiteSchemaId)
    if (!existingWebsiteSchema) {
      const script = document.createElement('script')
      script.id = websiteSchemaId
      script.type = 'application/ld+json'
      script.text = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Vaishnavi Medicare',
        url: origin,
        inLanguage: 'en-IN',
      })
      document.head.appendChild(script)
    }
  }, [pathname])

  return null
}

function App() {
  return (
    <BrowserRouter>
      <SeoManager />
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <NavBar />
        <LoginModal />
        <main>
          <Suspense
            fallback={
              <div className="min-h-[40vh] flex items-center justify-center text-slate-500">Loading page...</div>
            }
          >
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/media" element={<Media />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/senior-care" element={<SeniorCare />} />
              <Route path="/in-house" element={<InHouse />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/my-bookings" element={<MyBookings />} />
              <Route path="/my-orders" element={<MyOrders />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/customize-profile" element={<CustomizeProfile />} />
              <Route path="/create-persona" element={<CreatePersona />} />
              <Route path="/create-owner" element={<CreatePersona />} />
              <Route path="/persona-permissions" element={<PersonaPermissions />} />
              <Route path="/pay" element={<Payment />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassowrd />} />
              <Route path="/booking" element={<BookingDashboard />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
