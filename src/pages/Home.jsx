import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { FiMenu, FiLink } from 'react-icons/fi'
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaXTwitter, FaReddit, FaQuora, FaGlobe } from 'react-icons/fa6'
import axios from 'axios'
import { useFaqContacts } from '../hooks/useFaqContacts'
import { hasOwnerPrivileges } from '../utils/authRoles'
const faqSectionsSeed = []

const normalizeQandaItems = (qanda = []) => {
  if (!Array.isArray(qanda)) return []
  return qanda
    .filter((it) => it && (it.question || it.answer))
    .map((it, idx) => ({
      id: `faq-q-${it.id ?? idx + 1}`,
      q: String(it.question || '').trim(),
      answer: String(it.answer || '').trim(),
    }))
    .filter((it) => it.q && it.answer)
}

const mapFaqApiResponseToSections = (payload) => {
  const topics = Array.isArray(payload?.results) ? payload.results : []
  return topics
    .map((topic, idx) => {
      const title = String(topic?.topic || '').trim()
      const items = normalizeQandaItems(topic?.qanda)
      if (!title || items.length === 0) return null
      return {
        id: `faq-topic-${topic.id ?? idx + 1}`,
        apiId: topic.id ?? null,
        title,
        items,
      }
    })
    .filter(Boolean)
}

// Runtime cache: survives route navigation, resets only on full app reload.
let homeFaqRuntimeCache = null
let homeFaqRequestedInRuntime = false

function cloneFaqSections(sections) {
  return sections.map((s) => ({ ...s, items: s.items.map((it) => ({ ...it })) }))
}

const getCardsPerView = (width) => {
  if (width >= 1280) return 4
  if (width >= 768) return 3
  return 1
}

const truncateText = (text, maxLength) => {
  const normalized = String(text || '').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trimEnd()}...`
}

const testimonials = [
  {
    name: 'Radha Sharma',
    quote: 'They treated my mother like family. Professional, punctual, and extremely caring.',
    role: 'Daughter of a client',
  },
  {
    name: 'Ravi Menon',
    quote: 'The onboarding was seamless. The caregiver understood our needs from day one.',
    role: 'Client in Bengaluru',
  },
]

function parseFaqAnswer(text) {
  const lines = text.split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const t = lines[i].trim()
    if (!t) {
      i += 1
      continue
    }
    if (t.startsWith('•')) {
      const items = []
      while (i < lines.length && lines[i].trim().startsWith('•')) {
        items.push(lines[i].trim().replace(/^•\s*/, ''))
        i += 1
      }
      blocks.push({ type: 'ul', items })
    } else {
      const paras = []
      while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('•')) {
        paras.push(lines[i].trim())
        i += 1
      }
      blocks.push({ type: 'p', text: paras.join(' ') })
    }
  }
  return blocks
}

const normalizeAnswerForSchema = (text) =>
  String(text || '')
    .replace(/•\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const PUBLIC_SERVICES_CACHE_PREFIX = 'home_public_services_cache_v1::'

const getPublicServicesCacheKey = (url) => `${PUBLIC_SERVICES_CACHE_PREFIX}${url}`

const readPublicServicesCache = (url) => {
  try {
    const raw = localStorage.getItem(getPublicServicesCacheKey(url))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.payload || typeof parsed.payload !== 'object') return null
    return parsed
  } catch (_) {
    return null
  }
}

const writePublicServicesCache = (url, payload) => {
  try {
    localStorage.setItem(
      getPublicServicesCacheKey(url),
      JSON.stringify({
        updatedAt: Date.now(),
        payload,
      }),
    )
  } catch (_) {}
}

const normalizePublicServicesPayload = (payload) => {
  const safePayload = payload && typeof payload === 'object' ? payload : {}
  const items = Array.isArray(safePayload.results) ? safePayload.results : []
  return {
    results: items,
    next: safePayload.next || null,
    previous: safePayload.previous || null,
    count: Number(safePayload.count || items.length || 0),
    total_pages: Number(safePayload.total_pages || 1),
    current_page: Number(safePayload.current_page || 1),
  }
}

const getPublicServicesPayloadSignature = (payload) => {
  try {
    return JSON.stringify(normalizePublicServicesPayload(payload))
  } catch (_) {
    return ''
  }
}

function FaqAnswer({ text }) {
  const blocks = parseFaqAnswer(text)
  return (
    <div className="mt-1 space-y-2 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
      {blocks.map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i} className="list-disc pl-5 space-y-1.5 marker:text-teal-600">
            {b.items.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  )
}

const Home = () => {
  const servicesTouchStartXRef = useRef(null)
  const cardsPerViewRef = useRef(1)
  const { contacts } = useFaqContacts()
  const socialLinks = contacts.socialLinks || []
  const [publicServices, setPublicServices] = useState([])
  const [servicesError, setServicesError] = useState('')
  const [isLoadingServices, setIsLoadingServices] = useState(false)
  const [servicesNextUrl, setServicesNextUrl] = useState(null)
  const [servicesPreviousUrl, setServicesPreviousUrl] = useState(null)
  const [servicesPagination, setServicesPagination] = useState({
    count: 0,
    totalPages: 1,
    currentPage: 1,
  })
  const [currentServiceIndex, setCurrentServiceIndex] = useState(0)
  const [cardsPerView, setCardsPerView] = useState(() => getCardsPerView(window.innerWidth))
  const [openFaqId, setOpenFaqId] = useState(null)
  const [faqSlide, setFaqSlide] = useState(0)
  const [faqSectionsState, setFaqSectionsState] = useState(() =>
    cloneFaqSections(homeFaqRuntimeCache || faqSectionsSeed),
  )
  const [isLoadingFaq, setIsLoadingFaq] = useState(false)
  const [faqError, setFaqError] = useState('')
  const faqDragIdRef = useRef(null)
  const faqTopicDragIdRef = useRef(null)
  const faqSectionRef = useRef(null)
  const hasRequestedFaqRef = useRef(false)
  const [showBookingOptions, setShowBookingOptions] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()
  const heroSectionRef = useRef(null)

  const scrollToFaqSection = useCallback(() => {
    const el = document.getElementById('faq')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  useEffect(() => {
    if (location.pathname !== '/') return
    if (location.hash !== '#faq') return
    const t = window.setTimeout(() => scrollToFaqSection(), 0)
    return () => window.clearTimeout(t)
  }, [location.pathname, location.hash, scrollToFaqSection])

  // Check auth status and user type
  useEffect(() => {
    const checkAuthStatus = () => {
      try {
        const raw = localStorage.getItem('authUser')
        if (raw) {
          const parsed = JSON.parse(raw)
          setAuthUser(parsed)
        } else {
          setAuthUser(null)
        }
      } catch (error) {
        console.error('Error parsing authUser from localStorage:', error)
        setAuthUser(null)
      }
    }

    checkAuthStatus()

    // Listen for auth changes
    const handleAuthChange = () => checkAuthStatus()
    window.addEventListener('auth-changed', handleAuthChange)
    window.addEventListener('storage', handleAuthChange)

    return () => {
      window.removeEventListener('auth-changed', handleAuthChange)
      window.removeEventListener('storage', handleAuthChange)
    }
  }, [])

  // Owner privileges: VSRE_OWNER or MASTER_ADMIN
  const isVsreOwner = hasOwnerPrivileges(authUser)

  // Check if user is authenticated
  const isAuthenticated = () => {
    const accessToken = localStorage.getItem('access_token')
    const authUser = localStorage.getItem('authUser')
    return !!(accessToken || authUser)
  }

  // Handle booking option click with authentication check
  const handleBookingOptionClick = (path, state) => {
    if (!isAuthenticated()) {
      navigate('/login')
      return
    }
    navigate(path, { state })
  }

  // Handle Start Your Journey button click
  const handleStartJourneyClick = (e) => {
    e.preventDefault()
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // Show booking options
    setShowBookingOptions(true)
  }

  const handleFaqDragStart = useCallback((e, itemId) => {
    faqDragIdRef.current = itemId
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', itemId)
  }, [])

  const handleFaqDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleFaqDrop = useCallback(
    (e, targetId) => {
      e.preventDefault()
      const draggedId = faqDragIdRef.current
      if (!draggedId || draggedId === targetId) return
      setFaqSectionsState((prev) =>
        prev.map((section, si) => {
          if (si !== faqSlide) return section
          const items = [...section.items]
          const from = items.findIndex((i) => i.id === draggedId)
          const to = items.findIndex((i) => i.id === targetId)
          if (from < 0 || to < 0) return section
          const [el] = items.splice(from, 1)
          const newTo = from < to ? to - 1 : to
          items.splice(newTo, 0, el)
          return { ...section, items }
        }),
      )
      faqDragIdRef.current = null
    },
    [faqSlide],
  )

  const handleFaqDragEnd = useCallback(() => {
    faqDragIdRef.current = null
  }, [])

  const handleFaqTopicDragStart = useCallback((e, topicId) => {
    faqTopicDragIdRef.current = topicId
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', topicId)
  }, [])

  const handleFaqTopicDrop = useCallback((e, targetTopicId) => {
    e.preventDefault()
    const draggedId = faqTopicDragIdRef.current
    if (!draggedId || draggedId === targetTopicId) return

    setFaqSectionsState((prev) => {
      const from = prev.findIndex((s) => s.id === draggedId)
      const to = prev.findIndex((s) => s.id === targetTopicId)
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      const insertAt = from < to ? to - 1 : to
      next.splice(insertAt, 0, moved)
      setFaqSlide(insertAt)
      return next
    })
    faqTopicDragIdRef.current = null
  }, [])

  const handleFaqTopicDragEnd = useCallback(() => {
    faqTopicDragIdRef.current = null
  }, [])

  const loadFaqSections = useCallback(async () => {
    const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '')
    const apiUrl = `${baseUrl}/faq/faq/`
    setIsLoadingFaq(true)
    setFaqError('')
    try {
      const response = await axios.get(apiUrl)
      const mapped = mapFaqApiResponseToSections(response.data || {})
      homeFaqRuntimeCache = mapped
      setFaqSectionsState(mapped)
      setFaqSlide(0)
      setOpenFaqId(null)
    } catch (error) {
      console.error('Unable to load FAQ from API:', error)
      setFaqSectionsState([])
      setFaqError('Unable to load FAQ right now. Please try again.')
    } finally {
      setIsLoadingFaq(false)
    }
  }, [])

  const requestFaqIfNeeded = useCallback(() => {
    if (homeFaqRuntimeCache && homeFaqRuntimeCache.length > 0) {
      setFaqSectionsState(cloneFaqSections(homeFaqRuntimeCache))
      return
    }
    if (homeFaqRequestedInRuntime) return
    homeFaqRequestedInRuntime = true
    if (hasRequestedFaqRef.current) return
    hasRequestedFaqRef.current = true
    loadFaqSections()
  }, [loadFaqSections])

  useEffect(() => {
    if (location.pathname !== '/') return
    if (location.hash !== '#faq') return
    requestFaqIfNeeded()
  }, [location.pathname, location.hash, requestFaqIfNeeded])

  useEffect(() => {
    const node = faqSectionRef.current
    if (!node || typeof window === 'undefined' || !('IntersectionObserver' in window)) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (!entry?.isIntersecting) return
        requestFaqIfNeeded()
        observer.disconnect()
      },
      { root: null, rootMargin: '220px 0px', threshold: 0.01 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [requestFaqIfNeeded])

  const currentFaqSection = faqSectionsState[faqSlide] || null


  useEffect(() => {
    cardsPerViewRef.current = cardsPerView
  }, [cardsPerView])

  useEffect(() => {
    const handleResize = () => {
      setCardsPerView(getCardsPerView(window.innerWidth))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const run = () => {
      const faqItems = faqSectionsState.flatMap((section) => section.items || [])
      if (faqItems.length === 0) return

      const schemaId = 'vsmc-faq-schema'
      let scriptTag = document.getElementById(schemaId)
      if (!scriptTag) {
        scriptTag = document.createElement('script')
        scriptTag.id = schemaId
        scriptTag.type = 'application/ld+json'
        document.head.appendChild(scriptTag)
      }

      scriptTag.text = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems.map((item) => ({
          '@type': 'Question',
          name: String(item.q || '').trim(),
          acceptedAnswer: {
            '@type': 'Answer',
            text: normalizeAnswerForSchema(item.answer),
          },
        })),
      })
    }

    let idleId = null
    let timerId = null
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(run, { timeout: 1500 })
    } else {
      timerId = window.setTimeout(run, 100)
    }

    return () => {
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timerId !== null) {
        window.clearTimeout(timerId)
      }
      const existing = document.getElementById('vsmc-faq-schema')
      if (existing) existing.remove()
    }
  }, [faqSectionsState])

  const applyPublicServicesPayload = useCallback((payload, targetIndex = 0) => {
    const normalizedPayload = normalizePublicServicesPayload(payload)
    const items = normalizedPayload.results

    setPublicServices(items)
    setServicesNextUrl(normalizedPayload.next)
    setServicesPreviousUrl(normalizedPayload.previous)
    setServicesPagination({
      count: normalizedPayload.count,
      totalPages: normalizedPayload.total_pages,
      currentPage: normalizedPayload.current_page,
    })

    if (items.length === 0) {
      setCurrentServiceIndex(0)
    } else {
      const maxStartIndex = Math.max(0, items.length - cardsPerViewRef.current)
      const normalizedTarget = targetIndex < 0 ? maxStartIndex : targetIndex
      const safeIndex = Math.max(0, Math.min(normalizedTarget, maxStartIndex))
      setCurrentServiceIndex(safeIndex)
    }
  }, [])

  const loadPublicServices = useCallback(async (url = null, targetIndex = 0, options = {}) => {
    const { preferCache = true } = options
    const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '')
    const apiUrl = url || `${baseUrl}/booking/public-services/`

    let cachedEntry = null
    if (preferCache) {
      cachedEntry = readPublicServicesCache(apiUrl)
      if (cachedEntry?.payload) {
        applyPublicServicesPayload(cachedEntry.payload, targetIndex)
      }
    }

    setServicesError('')
    setIsLoadingServices(!cachedEntry)

    try {
      const response = await axios.get(apiUrl)
      const payload = normalizePublicServicesPayload(response.data || {})
      const incomingSignature = getPublicServicesPayloadSignature(payload)
      const cachedSignature = getPublicServicesPayloadSignature(cachedEntry?.payload)

      if (!cachedEntry || incomingSignature !== cachedSignature) {
        applyPublicServicesPayload(payload, targetIndex)
      }
      writePublicServicesCache(apiUrl, payload)
    } catch (error) {
      if (!cachedEntry) {
        setServicesError('Unable to load services right now. Please try again.')
        setPublicServices([])
        setServicesNextUrl(null)
        setServicesPreviousUrl(null)
      }
    } finally {
      setIsLoadingServices(false)
    }
  }, [applyPublicServicesPayload])

  useEffect(() => {
    let idleId = null
    let timerId = null
    const run = () => loadPublicServices()

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(run, { timeout: 1200 })
    } else {
      timerId = window.setTimeout(run, 100)
    }

    return () => {
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timerId !== null) {
        window.clearTimeout(timerId)
      }
    }
  }, [loadPublicServices])

  useEffect(() => {
    setCurrentServiceIndex((prev) => {
      const maxStartIndex = Math.max(0, publicServices.length - cardsPerView)
      return Math.min(prev, maxStartIndex)
    })
  }, [cardsPerView, publicServices.length])

  const handleNextService = useCallback(() => {
    const maxStartIndex = Math.max(0, publicServices.length - cardsPerView)
    if (currentServiceIndex < maxStartIndex) {
      setCurrentServiceIndex((prev) => prev + 1)
      return
    }
    if (servicesNextUrl) {
      loadPublicServices(servicesNextUrl, 0)
    }
  }, [currentServiceIndex, publicServices.length, servicesNextUrl, loadPublicServices, cardsPerView])

  const handlePreviousService = useCallback(() => {
    if (currentServiceIndex > 0) {
      setCurrentServiceIndex((prev) => prev - 1)
      return
    }
    if (servicesPreviousUrl) {
      loadPublicServices(servicesPreviousUrl, -1)
    }
  }, [currentServiceIndex, servicesPreviousUrl, loadPublicServices])

  const handleServicesTouchStart = useCallback((event) => {
    servicesTouchStartXRef.current = event.touches[0]?.clientX ?? null
  }, [])

  const handleServicesTouchEnd = useCallback(
    (event) => {
      const startX = servicesTouchStartXRef.current
      const endX = event.changedTouches[0]?.clientX
      servicesTouchStartXRef.current = null
      if (startX == null || endX == null) return

      const deltaX = endX - startX
      const swipeThreshold = 50
      if (deltaX <= -swipeThreshold) {
        handleNextService()
      } else if (deltaX >= swipeThreshold) {
        handlePreviousService()
      }
    },
    [handleNextService, handlePreviousService],
  )

  const visibleServices = publicServices.slice(currentServiceIndex, currentServiceIndex + cardsPerView)

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section ref={heroSectionRef} className="bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid gap-6 md:grid-cols-2 items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight text-slate-900">
              Compassionate care for your loved ones, wherever you need it
            </h1>
            <p className="text-lg text-slate-600 mt-3">
              Certified nurses, curated caregivers, and multi-city partner homes that adapt to every family's medical
              and emotional needs.
            </p>
            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-700">Stay connected with us</p>
              {socialLinks.length ? (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {socialLinks.map((link) => {
                    const platform = String(link.platform || '').toLowerCase()
                    const label = link.displayName || platform
                    if (platform === 'facebook') {
                      return (
                        <a
                          key={`${platform}-${link.id ?? link.url}`}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#1877F2] text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#166fe5] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1877F2] focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                          aria-label={label}
                          title={label}
                        >
                          <FaFacebookF className="h-[18px] w-[18px]" aria-hidden="true" />
                        </a>
                      )
                    }
                    if (platform === 'instagram') {
                      return (
                        <a
                          key={`${platform}-${link.id ?? link.url}`}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ee2a7b] focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                          aria-label={label}
                          title={label}
                        >
                          <FaInstagram className="h-[19px] w-[19px]" aria-hidden="true" />
                        </a>
                      )
                    }
                    if (platform === 'linkedin') {
                      return (
                        <a
                          key={`${platform}-${link.id ?? link.url}`}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0A66C2] text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A66C2] focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                          aria-label={label}
                          title={label}
                        >
                          <FaLinkedinIn className="h-[18px] w-[18px]" aria-hidden="true" />
                        </a>
                      )
                    }
                    if (platform === 'youtube') {
                      return (
                        <a
                          key={`${platform}-${link.id ?? link.url}`}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#FF0000] text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF0000] focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                          aria-label={label}
                          title={label}
                        >
                          <FaYoutube className="h-[18px] w-[18px]" aria-hidden="true" />
                        </a>
                      )
                    }
                    if (platform === 'twitter') {
                      return (
                        <a
                          key={`${platform}-${link.id ?? link.url}`}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                          aria-label={label}
                          title={label}
                        >
                          <FaXTwitter className="h-[18px] w-[18px]" aria-hidden="true" />
                        </a>
                      )
                    }
                    if (platform === 'reddit') {
                      return (
                        <a
                          key={`${platform}-${link.id ?? link.url}`}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#FF4500] text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4500] focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                          aria-label={label}
                          title={label}
                        >
                          <FaReddit className="h-[18px] w-[18px]" aria-hidden="true" />
                        </a>
                      )
                    }
                    if (platform === 'quora') {
                      return (
                        <a
                          key={`${platform}-${link.id ?? link.url}`}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#B92B27] text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B92B27] focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                          aria-label={label}
                          title={label}
                        >
                          <FaQuora className="h-[18px] w-[18px]" aria-hidden="true" />
                        </a>
                      )
                    }
                    return (
                      <a
                        key={`${platform}-${link.id ?? link.url}`}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-teal-700 text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                        aria-label={label}
                        title={label}
                      >
                        {platform === 'website' ? (
                          <FaGlobe className="h-[18px] w-[18px]" aria-hidden="true" />
                        ) : (
                          <FiLink className="h-[18px] w-[18px]" aria-hidden="true" />
                        )}
                      </a>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Social links will appear here when available.</p>
              )}
            </div>
      
          </div>
          <div>
            
              <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-slate-500 text-sm uppercase tracking-[0.3em]">Booking Options</h2>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={() => handleBookingOptionClick('/in-house', { locationType: 'In House' })}
                    className="block w-full p-4 rounded-2xl bg-white border border-slate-200 hover:border-teal-500 hover:bg-teal-50 transition-all text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 group-hover:text-teal-700">Book now at Vaishnavi Medicare Premises</h3>
                        <p className="text-sm text-slate-600 mt-1">Care provided at our facilities</p>
                      </div>
                      <span className="text-teal-600 text-xl">→</span>
                    </div>
                  </button>
                  <button
                    onClick={() => handleBookingOptionClick('/senior-care', { locationType: 'Client Location' })}
                    className="block w-full p-4 rounded-2xl bg-white border border-slate-200 hover:border-teal-500 hover:bg-teal-50 transition-all text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 group-hover:text-teal-700">Book at Your Location</h3>
                        <p className="text-sm text-slate-600 mt-1">Care provided at client's location</p>
                      </div>
                      <span className="text-teal-600 text-xl">→</span>
                    </div>
                  </button>
                  {isVsreOwner && (
                    <button
                      onClick={() => navigate('/dashboard?section=booking')}
                      className="block w-full p-4 rounded-2xl bg-white border border-slate-200 hover:border-teal-500 hover:bg-teal-50 transition-all text-left group"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 group-hover:text-teal-700">Existing Customer Manage your Bookings</h3>
                          <p className="text-sm text-slate-600 mt-1">View and manage your existing bookings</p>
                        </div>
                        <span className="text-teal-600 text-xl">→</span>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8 bg-white defer-render-section">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <p className="text-teal-600 font-semibold uppercase tracking-[0.2em] text-xs">What we offer</p>
            <h2 className="text-3xl font-bold text-slate-900 mt-1.5">Personalized care plans that evolve with you</h2>
            <p className="text-slate-600 mt-1.5 max-w-2xl">
              Start in under 48 hours. Mix skilled nursing, assisted living, and rehab visits without changing your care
              team.
            </p>
          </div>
          
        </div>
        {/* <div className="max-w-3xl mx-auto">
          {isLoadingServices ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-slate-200" />
              <div className="h-7 w-1/2 mt-3 rounded bg-slate-200" />
              <div className="h-4 w-full mt-3 rounded bg-slate-200" />
              <div className="h-4 w-4/5 mt-2 rounded bg-slate-200" />
            </div>
          ) : servicesError ? (
            <div className="bg-white rounded-2xl border border-rose-200 p-5 text-center">
              <p className="text-rose-700 font-medium">{servicesError}</p>
              <button
                type="button"
                onClick={() => loadPublicServices(null, 0, { preferCache: false })}
                className="mt-3 inline-flex items-center justify-center px-4 py-2 rounded-full bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : visibleServices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center text-slate-600">
              No services available at the moment.
            </div>
          ) : (
            <div className="space-y-3">
              <div
                className="grid gap-3 md:grid-cols-3 xl:grid-cols-4"
                onTouchStart={handleServicesTouchStart}
                onTouchEnd={handleServicesTouchEnd}
              >
                {visibleServices.map((service) => (
                  <div key={service.id || service.name} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 min-h-[190px]">
                    <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center text-base font-bold">
                      {String(service.name || '')
                        .split(' ')
                        .map((word) => word[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <h3 className="text-lg leading-6 font-semibold text-slate-900 mt-2">{service.name || 'Service'}</h3>
                    <p className="text-sm leading-6 text-slate-600 mt-1.5">
                      {truncateText(
                        service.description?.trim() || 'Service description will be updated soon.',
                        95,
                      )}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handlePreviousService}
                  disabled={currentServiceIndex === 0 && !servicesPreviousUrl}
                  className="px-4 py-2 rounded-full border border-slate-200 text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                >
                  ← Previous
                </button>
                <p className="text-sm text-slate-500">
                  Showing {publicServices.length ? currentServiceIndex + 1 : 0}-
                  {Math.min(currentServiceIndex + cardsPerView, publicServices.length)} of {publicServices.length} |
                  Total {servicesPagination.count} | Page{' '}
                  {servicesPagination.currentPage}/{servicesPagination.totalPages}
                </p>
                <button
                  type="button"
                  onClick={handleNextService}
                  disabled={currentServiceIndex >= Math.max(0, publicServices.length - cardsPerView) && !servicesNextUrl}
                  className="px-4 py-2 rounded-full border border-slate-200 text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div> */}
      </section>

      {/* FAQ — left topics, right questions */}
      <section ref={faqSectionRef} id="faq" className="bg-white py-10 border-t border-slate-100 defer-render-section scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-center text-slate-900 mt-1.5">Frequently Asked Questions</h2>

          <div className="mt-8 rounded-2xl border-2 border-slate-200 bg-white p-3 sm:p-4">
            <div className="flex flex-col md:flex-row gap-4 min-h-[420px]">
              <aside className="md:w-72 md:shrink-0 md:border-r md:border-slate-200 md:pr-4">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider px-2 pb-2">
                Topics
                </p>
                <div className="space-y-2 max-h-[360px] md:max-h-[380px] overflow-y-scroll pr-1" role="tablist" aria-label="FAQ topics">
                  {faqSectionsState.map((section, idx) => (
                    <div
                      key={section.id || section.title}
                      onDragOver={isVsreOwner ? handleFaqDragOver : undefined}
                      onDrop={isVsreOwner ? (e) => handleFaqTopicDrop(e, section.id) : undefined}
                      className={`rounded-md border-2 px-2 py-2 transition-colors ${
                        faqSlide === idx
                          ? 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm'
                          : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          role="button"
                          tabIndex={0}
                          draggable={isVsreOwner}
                          onDragStart={isVsreOwner ? (e) => handleFaqTopicDragStart(e, section.id) : undefined}
                          onDragEnd={isVsreOwner ? handleFaqTopicDragEnd : undefined}
                          className={`shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center rounded ${
                            isVsreOwner
                              ? 'cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                              : 'cursor-default text-slate-300'
                          }`}
                          aria-label="Drag to reorder topic"
                        >
                          <FiMenu className="w-4 h-4" aria-hidden />
                        </div>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={faqSlide === idx}
                          onClick={() => {
                            setOpenFaqId(null)
                            setFaqSlide(idx)
                          }}
                          className="flex-1 text-left px-1 py-1 text-sm font-semibold"
                          title={section.title}
                        >
                          {section.title}
                        </button>
                      </div>
                    </div>
                  ))}
                  {!isLoadingFaq && faqSectionsState.length === 0 ? (
                    <p className="px-2 py-2 text-sm text-slate-500">{faqError || 'No FAQs available.'}</p>
                  ) : null}
                </div>
              </aside>

              <div
                className="flex-1 max-h-[420px] overflow-y-auto md:pl-2"
                id={`faq-panel-${faqSlide}`}
                role="tabpanel"
                aria-label={currentFaqSection?.title || 'FAQ'}
              >
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-3">
                  {currentFaqSection?.title || (isLoadingFaq ? 'Loading FAQs...' : 'Frequently asked questions')}
                </h3>
                <div className="space-y-2">
                  {(currentFaqSection?.items || []).map((item) => {
                    const isOpen = openFaqId === item.id
                    return (
                      <div
                        key={item.id}
                        onDragOver={isVsreOwner ? handleFaqDragOver : undefined}
                        onDrop={isVsreOwner ? (e) => handleFaqDrop(e, item.id) : undefined}
                        className="rounded-xl border border-slate-200 bg-white overflow-hidden transition-colors hover:border-slate-300 shadow-sm"
                      >
                        <div className="flex items-stretch">
                          <div
                            role="button"
                            tabIndex={0}
                            draggable={isVsreOwner}
                            onDragStart={isVsreOwner ? (e) => handleFaqDragStart(e, item.id) : undefined}
                            onDragEnd={isVsreOwner ? handleFaqDragEnd : undefined}
                            className={`shrink-0 flex items-center justify-center w-10 border-r border-slate-100 touch-none select-none ${
                              isVsreOwner
                                ? 'cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                : 'cursor-default text-slate-300'
                            }`}
                            aria-label="Drag to reorder question"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
                            }}
                          >
                            <FiMenu className="w-5 h-5" aria-hidden />
                          </div>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() => setOpenFaqId((prev) => (prev === item.id ? null : item.id))}
                            className="flex-1 min-w-0 flex items-start justify-between gap-3 text-left py-3.5 px-4 bg-white hover:bg-slate-50/80 transition-colors"
                          >
                            <span className="font-medium text-slate-900 text-[15px] leading-snug pr-2">
                              {item.q}
                            </span>
                            <span
                              className="shrink-0 mt-0.5 w-8 h-8 flex items-center justify-center rounded-md bg-sky-100 text-sky-700 text-lg font-light leading-none"
                              aria-hidden
                            >
                              {isOpen ? '−' : '+'}
                            </span>
                          </button>
                        </div>
                        {isOpen ? (
                          <div className="px-4 pb-4 bg-white border-t border-slate-100">
                            <FaqAnswer text={item.answer} />
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                  {isLoadingFaq ? (
                    <div className="space-y-2" aria-hidden>
                      {[1, 2, 3].map((k) => (
                        <div key={k} className="rounded-xl border border-slate-200 bg-white p-4 animate-pulse">
                          <div className="h-4 w-3/4 rounded bg-slate-200" />
                          <div className="h-4 w-1/2 rounded bg-slate-100 mt-2" />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Video section */}
      {/* <section className="bg-white py-8 border-t border-slate-100 defer-render-section">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-center text-teal-600 font-semibold uppercase tracking-[0.2em] text-xs">Watch</p>
          <h2 className="text-3xl font-bold text-center text-slate-900 mt-1.5">Vaishnavi Medicare in Action</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="aspect-video rounded-xl overflow-hidden bg-slate-100">
                <iframe
                  className="w-full h-full"
                  src="https://www.youtube.com/embed/2GQM8XfOO58"
                  title="Vaishnavi Medicare overview"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900">About our care approach</p>
              <p className="text-sm text-slate-600">A quick overview of how we support patients and families.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="aspect-video rounded-xl overflow-hidden bg-slate-100">
                <iframe
                  className="w-full h-full"
                  src="https://www.youtube.com/embed/othxZeNjJrI?start=305"
                  title="Vaishnavi Medicare services"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900">Services & patient journey</p>
              <p className="text-sm text-slate-600">Understand service flow from booking to active care.</p>
            </div>
          </div>
        </div>
      </section> */}

      {/* Testimonials */}
      <section className="bg-slate-50 py-8 defer-render-section">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <p className="text-center text-teal-600 font-semibold uppercase tracking-[0.2em] text-xs">Families speak</p>
          <h2 className="text-3xl font-bold text-center text-slate-900 mt-1.5">Why people trust Vaishnavi Medicare </h2>
          <div className="grid gap-3 md:grid-cols-2 mt-6">
            {testimonials.map((item) => (
              <div key={item.name} className="p-5 rounded-2xl border border-white shadow-sm bg-white">
                <p className="text-slate-700 leading-relaxed">"{item.quote}"</p>
                <div className="mt-3">
                  <p className="font-semibold text-slate-900">{item.name}</p>
                  <p className="text-sm text-slate-500">{item.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-8 bg-white defer-render-section">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="bg-slate-50 rounded-3xl text-slate-900 px-6 py-8 grid gap-4 md:grid-cols-[1.5fr,1fr] items-center border border-slate-100">
            <div>
              <h2 className="text-3xl font-bold text-slate-900">Ready to start care?</h2>
              <p className="text-slate-600 mt-1.5">
                Share a few details, get matched with the right caregiver, and begin services in 48 hours.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <button
                onClick={handleStartJourneyClick}
                className="w-full text-center px-6 py-3 rounded-full bg-teal-600 text-white font-semibold shadow-lg shadow-teal-200 hover:-translate-y-0.5 transition-transform"
              >
                Start Your Journey
              </button>
              {/* <a
                href="mailto:care@vaishnavimedicare.com"
                className="w-full text-center px-6 py-3 rounded-full border border-slate-200 text-slate-700 font-semibold hover:bg-white transition-colors"
              >
                
              </a> */}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-teal-900/40 bg-slate-800 text-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-400">About Vaishnavi Medicare</h2>
              <p className="mt-3 text-sm text-slate-200 leading-relaxed max-w-xl">
                We connect families with trained caregivers and nursing support for at-home and in-facility senior care.
                Our goal is dependable, dignified care that fits your schedule and clinical needs.
              </p>
              <Link
                to="/about"
                className="inline-flex mt-4 text-sm font-semibold text-teal-400 hover:text-teal-300 transition-colors"
              >
                Read more about us →
              </Link>
            </div>
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Explore</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link to="/senior-care" className="text-slate-200 hover:text-white transition-colors">
                    Senior care at home
                  </Link>
                </li>
                <li>
                  <Link to="/in-house" className="text-slate-200 hover:text-white transition-colors">
                    In-house & premises care
                  </Link>
                </li>
                <li>
                  <Link
                    to="/#faq"
                    onClick={(e) => {
                      if (location.pathname === '/' && location.hash === '#faq') {
                        e.preventDefault()
                        scrollToFaqSection()
                      }
                    }}
                    className="text-slate-200 hover:text-white transition-colors"
                  >
                    FAQ
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Legal & policies</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link to="/terms" className="text-slate-200 hover:text-white transition-colors">
                    Terms & conditions
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="text-slate-200 hover:text-white transition-colors">
                    Privacy policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms#cancellation" className="text-slate-200 hover:text-white transition-colors">
                    Cancellations & refunds
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-8 border-t border-teal-900/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-400">
            <p>© {new Date().getFullYear()} Vaishnavi Medicare. All rights reserved.</p>
            <p className="text-slate-400">Compassionate care for families across India.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Home

