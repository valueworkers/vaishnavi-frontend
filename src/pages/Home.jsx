import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { FiLink, FiMenu, FiPhone } from 'react-icons/fi'
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaXTwitter, FaReddit, FaQuora, FaGlobe, FaWhatsapp } from 'react-icons/fa6'
import axios from 'axios'
import { useFaqContacts } from '../hooks/useFaqContacts'
import { hasOwnerPrivileges } from '../utils/authRoles'
import HomeMarketingSections from '../components/HomeMarketingSections'
import BrandName from '../components/BrandName'
import { openBookCare } from '../components/BookCareModal'
import { HOME_HERO } from '../constants/homeMarketing'
import caregivingMoment from '../assets/Compassionate Caregiving Moment.png'
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

const heroSocialIconBase =
  'hero-social-icon inline-flex h-12 w-12 items-center justify-center rounded-full text-white shadow-sm transition-transform duration-200 ease-out hover:-translate-y-1 hover:scale-110 hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100'
const heroSocialGlyphClass = 'h-[22px] w-[22px]'

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
  const { contacts } = useFaqContacts()
  const socialLinks = contacts.socialLinks || []
  const phoneTel = contacts.phoneTel
  const phoneDisplay = contacts.phoneDisplay
  const whatsappUrl = contacts.whatsappUrl
  const hasContactLinks = Boolean(phoneTel || whatsappUrl || socialLinks.length)
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

  const handleStartJourneyClick = (e) => {
    e.preventDefault()
    openBookCare()
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

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section ref={heroSectionRef} className="relative overflow-hidden bg-white">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-teal-50/40" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8 lg:grid-cols-2">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-[#1e3a5f] sm:text-4xl lg:text-[2.5rem]">
              {HOME_HERO.headline}
            </h1>
            <p className="mt-2 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              {HOME_HERO.body}
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => openBookCare()}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                Book Care
              </button>
            </div>
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-700">Stay connected with us</p>
              {hasContactLinks ? (
                <div className="mt-3 flex flex-wrap items-center gap-3.5">
                  {phoneTel ? (
                    <a
                      href={phoneTel}
                      className={`${heroSocialIconBase} hero-social-icon--live bg-teal-600 hover:bg-teal-700 focus-visible:ring-teal-600`}
                      aria-label={`Call ${phoneDisplay || 'us'}`}
                      title={`Call ${phoneDisplay || 'us'}`}
                    >
                      <FiPhone className={`hero-social-glyph ${heroSocialGlyphClass}`} aria-hidden="true" />
                    </a>
                  ) : null}
                  {whatsappUrl ? (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${heroSocialIconBase} hero-social-icon--live bg-[#25D366] hover:bg-[#1ebe57] focus-visible:ring-[#25D366]`}
                      aria-label={`Open WhatsApp chat with ${phoneDisplay || 'us'}`}
                      title={`WhatsApp ${phoneDisplay || 'us'}`}
                    >
                      <FaWhatsapp className={`hero-social-glyph ${heroSocialGlyphClass}`} aria-hidden="true" />
                    </a>
                  ) : null}
                  {socialLinks.map((link) => {
                    const platform = String(link.platform || '').toLowerCase()
                    const label = link.displayName || platform
                    const key = `${platform}-${link.id ?? link.url}`
                    if (platform === 'facebook') {
                      return (
                        <a
                          key={key}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${heroSocialIconBase} bg-[#1877F2] hover:bg-[#166fe5] focus-visible:ring-[#1877F2]`}
                          aria-label={label}
                          title={label}
                        >
                          <FaFacebookF className={heroSocialGlyphClass} aria-hidden="true" />
                        </a>
                      )
                    }
                    if (platform === 'instagram') {
                      return (
                        <a
                          key={key}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${heroSocialIconBase} bg-gradient-to-br from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] focus-visible:ring-[#ee2a7b]`}
                          aria-label={label}
                          title={label}
                        >
                          <FaInstagram className="h-[23px] w-[23px]" aria-hidden="true" />
                        </a>
                      )
                    }
                    if (platform === 'linkedin') {
                      return (
                        <a
                          key={key}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${heroSocialIconBase} bg-[#0A66C2] focus-visible:ring-[#0A66C2]`}
                          aria-label={label}
                          title={label}
                        >
                          <FaLinkedinIn className={heroSocialGlyphClass} aria-hidden="true" />
                        </a>
                      )
                    }
                    if (platform === 'youtube') {
                      return (
                        <a
                          key={key}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${heroSocialIconBase} bg-[#FF0000] focus-visible:ring-[#FF0000]`}
                          aria-label={label}
                          title={label}
                        >
                          <FaYoutube className={heroSocialGlyphClass} aria-hidden="true" />
                        </a>
                      )
                    }
                    if (platform === 'twitter') {
                      return (
                        <a
                          key={key}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${heroSocialIconBase} bg-black focus-visible:ring-black`}
                          aria-label={label}
                          title={label}
                        >
                          <FaXTwitter className={heroSocialGlyphClass} aria-hidden="true" />
                        </a>
                      )
                    }
                    if (platform === 'reddit') {
                      return (
                        <a
                          key={key}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${heroSocialIconBase} bg-[#FF4500] focus-visible:ring-[#FF4500]`}
                          aria-label={label}
                          title={label}
                        >
                          <FaReddit className={heroSocialGlyphClass} aria-hidden="true" />
                        </a>
                      )
                    }
                    if (platform === 'quora') {
                      return (
                        <a
                          key={key}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${heroSocialIconBase} bg-[#B92B27] focus-visible:ring-[#B92B27]`}
                          aria-label={label}
                          title={label}
                        >
                          <FaQuora className={heroSocialGlyphClass} aria-hidden="true" />
                        </a>
                      )
                    }
                    return (
                      <a
                        key={key}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${heroSocialIconBase} bg-teal-700 focus-visible:ring-teal-600`}
                        aria-label={label}
                        title={label}
                      >
                        {platform === 'website' ? (
                          <FaGlobe className={heroSocialGlyphClass} aria-hidden="true" />
                        ) : (
                          <FiLink className={heroSocialGlyphClass} aria-hidden="true" />
                        )}
                      </a>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Contact links will appear here when available.</p>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-sm">
              <img
                src={caregivingMoment}
                alt="Caregiver sharing a compassionate moment with a senior patient"
                className="aspect-[4/3] w-full object-cover object-center lg:aspect-[5/4]"
                width={800}
                height={640}
                decoding="async"
              />
            </div>
          </div>
        </div>
      </section>

      <HomeMarketingSections />

      {/* FAQ — left topics, right questions */}
      <section ref={faqSectionRef} id="faq" className="bg-white py-6 border-t border-slate-100 defer-render-section scroll-mt-20 sm:py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-center text-slate-900 sm:text-3xl">Frequently Asked Questions</h2>

          <div className="mt-5 rounded-2xl border-2 border-slate-200 bg-white p-3 sm:p-4">
            <div className="flex flex-col md:flex-row gap-3 min-h-[360px]">
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
      <section className="bg-slate-50 py-6 defer-render-section sm:py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <p className="text-center text-teal-600 font-semibold uppercase tracking-[0.2em] text-xs">Families speak</p>
          <h2 className="text-2xl font-bold text-center text-slate-900 mt-1 sm:text-3xl">Why people trust Vaishnavi Medicare </h2>
          <div className="grid gap-3 md:grid-cols-2 mt-4">
            {testimonials.map((item) => (
              <div key={item.name} className="p-4 rounded-2xl border border-white shadow-sm bg-white sm:p-5">
                <p className="text-slate-700 leading-relaxed text-sm sm:text-base">"{item.quote}"</p>
                <div className="mt-2">
                  <p className="font-semibold text-slate-900">{item.name}</p>
                  <p className="text-sm text-slate-500">{item.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-6 bg-white defer-render-section sm:py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="bg-slate-50 rounded-2xl text-slate-900 px-5 py-5 grid gap-3 md:grid-cols-[1.5fr,1fr] items-center border border-slate-100 sm:px-6 sm:py-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Ready to start care?</h2>
              <p className="text-slate-600 mt-1 text-sm sm:text-base">
                Share a few details, get matched with the right caregiver, and begin services in 48 hours.
              </p>
            </div>
            <div className="flex flex-col gap-3">
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 sm:gap-8">
            <div className="lg:col-span-2">
              <h2 className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm font-semibold tracking-wider text-slate-300">
                <span className="uppercase">About</span>
                <BrandName size="sm" layout="inline" />
              </h2>
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
          <div className="mt-6 pt-5 border-t border-teal-900/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-400">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span>© {new Date().getFullYear()}</span>
              <BrandName size="sm" layout="inline" />
              <span>. All rights reserved.</span>
            </p>
            <p className="text-slate-400">Compassionate · Professional · Personalized Care</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Home

