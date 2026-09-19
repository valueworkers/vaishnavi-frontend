import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  FiLock,
  FiBell,
  FiShield,
  FiPhone,
  FiMail,
  FiSave,
  FiRotateCcw,
  FiPlus,
  FiTrash2,
  FiLink,
  FiUser,
} from 'react-icons/fi'
import {
  FaFacebookF,
  FaReddit,
  FaQuora,
  FaInstagram,
  FaLinkedinIn,
  FaYoutube,
  FaXTwitter,
  FaGlobe,
} from 'react-icons/fa6'
import { invalidateFaqContactsCache } from '../api/faqContactsApi'

const FAQ_CONTACTS_PATH = '/faq/contacts/'
const DRAFT_KEYS_TO_CLEAR = [
  'settings_contact_social_draft_v4',
  'settings_contact_social_draft_v3',
  'settings_contact_social_draft_v2',
  'settings_contact_social_draft_v1',
]

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_REGEX = /^https?:\/\//i
const CONTACT_PLATFORM = 'other'

/** Matches backend Platform TextChoices on /faq/contacts/ */
const SOCIAL_PLATFORMS = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'twitter', label: 'Twitter/X' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'quora', label: 'Quora' },
  { value: 'website', label: 'Website' },
  { value: 'other', label: 'Other' },
]

const SOCIAL_PLATFORM_VALUES = new Set(SOCIAL_PLATFORMS.map((p) => p.value))

const normalizePlatformValue = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'x' || raw === 'twitter/x') return 'twitter'
  if (raw === 'qoura') return 'quora'
  if (SOCIAL_PLATFORM_VALUES.has(raw)) return raw
  return 'other'
}

const createSocialLinkId = () => `social-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const createSocialLink = ({ platform = 'facebook', label = '', url = '', apiId = null } = {}) => {
  const normalizedPlatform = normalizePlatformValue(platform)
  return {
    id: apiId != null ? `api-${apiId}` : createSocialLinkId(),
    apiId,
    platform: normalizedPlatform,
    label: String(label || '').trim(),
    url: String(url || '').trim(),
  }
}

const formatMobileNumber = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('91') && digits.length >= 12) return `+${digits}`
  const local = digits.slice(-10)
  return local ? `+91${local}` : ''
}

const phoneDigitsFromValue = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.slice(-10)
}

const emptyContactForm = () => ({
  apiId: null,
  displayName: '',
  phone: '',
  email: '',
  platform: CONTACT_PLATFORM,
  socialLinks: [],
})

const clearContactDrafts = () => {
  DRAFT_KEYS_TO_CLEAR.forEach((key) => {
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore
    }
  })
}

const notifyFaqContactsUpdated = () => {
  invalidateFaqContactsCache()
  window.dispatchEvent(new Event('faq-contacts-updated'))
}

const getAuthHeaders = () => {
  const accessToken = localStorage.getItem('access_token')
  if (!accessToken) return null
  return { Authorization: `Bearer ${accessToken}` }
}

const getContactsApiUrl = () => {
  const base = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
  return `${base}${FAQ_CONTACTS_PATH}`
}

const getContactDetailApiUrl = (id) => {
  const base = getContactsApiUrl().replace(/\/?$/, '/')
  return `${base}${encodeURIComponent(String(id))}/`
}

const friendlyContactError = (error) => {
  const status = error?.response?.status
  if (status === 401 || status === 403) return 'You do not have permission to save contacts. Please sign in again.'
  if (status >= 500) return 'The server is unavailable right now. Please try again shortly.'
  if (!error?.response && String(error?.message || '').toLowerCase().includes('network')) {
    return 'Network error. Check your connection and try again.'
  }
  const data = error?.response?.data
  if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail.trim()
  if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim()
  if (data && typeof data === 'object') {
    const firstKey = Object.keys(data)[0]
    const firstVal = firstKey ? data[firstKey] : null
    if (typeof firstVal === 'string') return firstVal
    if (Array.isArray(firstVal) && firstVal[0]) return String(firstVal[0])
  }
  return 'Unable to save contact settings. Please try again.'
}

const toContactsList = (payload) => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.results)) return payload.results
  if (Array.isArray(payload?.data)) return payload.data
  if (payload && typeof payload === 'object' && (payload.mobile_number || payload.email || payload.url || payload.id)) {
    return [payload]
  }
  return []
}

const isSupportContactRow = (item) => {
  const platform = normalizePlatformValue(item?.platform)
  const hasContactFields = Boolean(item?.mobile_number || item?.email)
  const hasUrl = Boolean(String(item?.url || '').trim())
  return platform === CONTACT_PLATFORM && hasContactFields && !hasUrl
}

const isSocialContactRow = (item) => Boolean(String(item?.url || '').trim())

const pickOtherContact = (payload) => {
  const list = toContactsList(payload)
  return list.find((item) => isSupportContactRow(item)) || null
}

const pickSocialContacts = (payload) =>
  toContactsList(payload)
    .filter((item) => isSocialContactRow(item))
    .map((item) =>
      createSocialLink({
        apiId: item?.id ?? null,
        platform: item?.platform,
        label: item?.display_name || '',
        url: item?.url || '',
      })
    )

const formFromContactsApi = (payload) => {
  const support = pickOtherContact(payload)
  const socialLinks = pickSocialContacts(payload)
  return {
    apiId: support?.id ?? null,
    displayName: String(support?.display_name || '').trim(),
    phone: phoneDigitsFromValue(support?.mobile_number),
    email: String(support?.email || '').trim(),
    platform: CONTACT_PLATFORM,
    socialLinks,
  }
}

const getSocialPreviewStyle = (platform) => {
  switch (normalizePlatformValue(platform)) {
    case 'facebook':
      return 'bg-[#1877F2] text-white'
    case 'instagram':
      return 'bg-gradient-to-br from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] text-white'
    case 'linkedin':
      return 'bg-[#0A66C2] text-white'
    case 'youtube':
      return 'bg-[#FF0000] text-white'
    case 'twitter':
      return 'bg-black text-white'
    case 'reddit':
      return 'bg-[#FF4500] text-white'
    case 'quora':
      return 'bg-[#B92B27] text-white'
    case 'website':
      return 'bg-teal-700 text-white'
    default:
      return 'bg-slate-700 text-white'
  }
}

const renderSocialIcon = (platform, className = 'h-4 w-4') => {
  switch (normalizePlatformValue(platform)) {
    case 'facebook':
      return <FaFacebookF className={className} aria-hidden="true" />
    case 'instagram':
      return <FaInstagram className={className} aria-hidden="true" />
    case 'linkedin':
      return <FaLinkedinIn className={className} aria-hidden="true" />
    case 'youtube':
      return <FaYoutube className={className} aria-hidden="true" />
    case 'twitter':
      return <FaXTwitter className={className} aria-hidden="true" />
    case 'reddit':
      return <FaReddit className={className} aria-hidden="true" />
    case 'quora':
      return <FaQuora className={className} aria-hidden="true" />
    case 'website':
      return <FaGlobe className={className} aria-hidden="true" />
    default:
      return <FiLink className={className} aria-hidden="true" />
  }
}

const Settings = () => {
  const [tab, setTab] = useState('notifications')

  const [notifications, setNotifications] = useState({
    bookingUpdates: true,
    promotions: false,
    reminders: true,
  })

  const [security, setSecurity] = useState({
    twoFactor: false,
    loginAlerts: true,
    deviceTrust: true,
  })

  const [contactForm, setContactForm] = useState(emptyContactForm)
  const [contactErrors, setContactErrors] = useState({})
  const [contactSaveStatus, setContactSaveStatus] = useState('idle')
  const [contactSaveMessage, setContactSaveMessage] = useState('')
  const [socialSaveStatus, setSocialSaveStatus] = useState('idle')
  const [socialSaveMessage, setSocialSaveMessage] = useState('')
  const [deletingSocialId, setDeletingSocialId] = useState(null)
  const [scrollToSocialId, setScrollToSocialId] = useState(null)
  const [isLoadingContact, setIsLoadingContact] = useState(false)
  const [contactLoadError, setContactLoadError] = useState('')

  const applyContactsFromApi = useCallback((payload) => {
    setContactForm(formFromContactsApi(payload))
  }, [])

  const reloadContacts = useCallback(async () => {
    const headers = getAuthHeaders()
    if (!headers) {
      setContactLoadError('Please sign in again to load contact settings.')
      setContactForm(emptyContactForm())
      return
    }

    setIsLoadingContact(true)
    setContactLoadError('')
    try {
      const { data } = await axios.get(getContactsApiUrl(), { headers })
      applyContactsFromApi(data)
    } catch (error) {
      setContactForm(emptyContactForm())
      setContactLoadError(friendlyContactError(error))
    } finally {
      setIsLoadingContact(false)
    }
  }, [applyContactsFromApi])

  useEffect(() => {
    clearContactDrafts()
    reloadContacts()
  }, [reloadContacts])

  const toggleNotification = (key) => setNotifications((prev) => ({ ...prev, [key]: !prev[key] }))
  const toggleSecurity = (key) => setSecurity((prev) => ({ ...prev, [key]: !prev[key] }))

  const clearContactFeedback = () => {
    if (contactSaveStatus !== 'idle') {
      setContactSaveStatus('idle')
      setContactSaveMessage('')
    }
  }

  const clearSocialFeedback = () => {
    if (socialSaveStatus !== 'idle') {
      setSocialSaveStatus('idle')
      setSocialSaveMessage('')
    }
  }

  const updateContactField = (field, value) => {
    setContactForm((prev) => ({ ...prev, [field]: value }))
    setContactErrors((prev) => ({ ...prev, [field]: '' }))
    clearContactFeedback()
    clearSocialFeedback()
  }

  const updateSocialLink = (id, field, value) => {
    setContactForm((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.map((link) => {
        if (link.id !== id) return link
        const next = { ...link, [field]: value }
        if (field === 'platform') {
          const platformMeta = SOCIAL_PLATFORMS.find((p) => p.value === value)
          const previousDefault = SOCIAL_PLATFORMS.find((p) => p.label === link.label)?.label
          if (!link.label || link.label === previousDefault) {
            next.label = platformMeta?.label || link.label
          }
        }
        return next
      }),
    }))
    setContactErrors((prev) => {
      const next = { ...prev }
      delete next[`social-${id}-label`]
      delete next[`social-${id}-url`]
      return next
    })
    clearContactFeedback()
    clearSocialFeedback()
  }

  const addSocialLink = () => {
    const newLink = createSocialLink()
    setContactForm((prev) => ({
      ...prev,
      socialLinks: [...prev.socialLinks, newLink],
    }))
    setScrollToSocialId(newLink.id)
    clearContactFeedback()
    clearSocialFeedback()
  }

  useEffect(() => {
    if (!scrollToSocialId) return

    const frame = window.requestAnimationFrame(() => {
      const el = document.getElementById(`social-link-card-${scrollToSocialId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const platformField = document.getElementById(`social-platform-${scrollToSocialId}`)
        if (platformField && typeof platformField.focus === 'function') {
          platformField.focus({ preventScroll: true })
        }
      }
      setScrollToSocialId(null)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [scrollToSocialId, contactForm.socialLinks.length])

  const removeSocialLinkLocal = (id) => {
    setContactForm((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.filter((link) => link.id !== id),
    }))
    setContactErrors((prev) => {
      const next = { ...prev }
      delete next[`social-${id}-label`]
      delete next[`social-${id}-url`]
      delete next.socialLinks
      return next
    })
  }

  const removeSocialLink = async (id) => {
    const link = contactForm.socialLinks.find((item) => item.id === id)
    if (!link) return

    clearContactFeedback()
    clearSocialFeedback()

    // Unsaved local row — remove from UI only
    if (link.apiId == null) {
      removeSocialLinkLocal(id)
      return
    }

    const headers = getAuthHeaders()
    if (!headers) {
      setSocialSaveStatus('error')
      setSocialSaveMessage('Please sign in again to delete social links.')
      return
    }

    setDeletingSocialId(id)
    setSocialSaveStatus('saving')
    setSocialSaveMessage('')

    try {
      await axios.delete(getContactDetailApiUrl(link.apiId), { headers })
      removeSocialLinkLocal(id)
      setSocialSaveStatus('saved')
      setSocialSaveMessage('Social link deleted successfully.')
      notifyFaqContactsUpdated()
      await reloadContacts()
    } catch (error) {
      setSocialSaveStatus('error')
      setSocialSaveMessage(friendlyContactError(error))
    } finally {
      setDeletingSocialId(null)
    }
  }

  const validateSupportContact = () => {
    const nextErrors = {}
    const displayName = String(contactForm.displayName || '').trim()
    if (!displayName) nextErrors.displayName = 'Display name is required.'

    const phoneDigits = String(contactForm.phone || '').replace(/\D/g, '')
    if (!phoneDigits) {
      nextErrors.phone = 'Phone number is required.'
    } else if (phoneDigits.length < 10) {
      nextErrors.phone = 'Enter a valid phone number (at least 10 digits).'
    }

    const email = String(contactForm.email || '').trim()
    if (!email) {
      nextErrors.email = 'Email is required.'
    } else if (!EMAIL_REGEX.test(email)) {
      nextErrors.email = 'Enter a valid email address.'
    }

    setContactErrors((prev) => {
      const socialOnly = Object.fromEntries(
        Object.entries(prev).filter(([key]) => key.startsWith('social-'))
      )
      return { ...socialOnly, ...nextErrors }
    })
    return Object.keys(nextErrors).length === 0
  }

  const validateSocialLinks = () => {
    const nextErrors = {}
    const newLinks = contactForm.socialLinks.filter((link) => link.apiId == null)
    const filledNewLinks = newLinks.filter(
      (link) => String(link.label || '').trim() || String(link.url || '').trim()
    )

    if (!newLinks.length) {
      nextErrors.socialLinks = 'Add a new social media link before saving.'
    } else if (!filledNewLinks.length) {
      nextErrors.socialLinks = 'Fill in the new social media link before saving.'
    }

    filledNewLinks.forEach((link) => {
      const label = String(link.label || '').trim()
      const url = String(link.url || '').trim()
      if (!label) nextErrors[`social-${link.id}-label`] = 'Display name is required.'
      if (!url) nextErrors[`social-${link.id}-url`] = 'URL is required.'
      else if (!URL_REGEX.test(url)) nextErrors[`social-${link.id}-url`] = 'URL must start with http:// or https://'
      if (!SOCIAL_PLATFORM_VALUES.has(normalizePlatformValue(link.platform))) {
        nextErrors[`social-${link.id}-label`] = 'Select a valid platform.'
      }
    })

    setContactErrors((prev) => {
      const supportOnly = Object.fromEntries(
        Object.entries(prev).filter(([key]) => !key.startsWith('social-') && key !== 'socialLinks')
      )
      return { ...supportOnly, ...nextErrors }
    })
    return Object.keys(nextErrors).length === 0
  }

  const handleSaveContact = async () => {
    if (!validateSupportContact()) return

    const headers = getAuthHeaders()
    if (!headers) {
      setContactSaveStatus('error')
      setContactSaveMessage('Please sign in again to save contact settings.')
      return
    }

    setContactSaveStatus('saving')
    setContactSaveMessage('')

    const apiPayload = {
      display_name: String(contactForm.displayName).trim(),
      mobile_number: formatMobileNumber(contactForm.phone),
      email: String(contactForm.email).trim(),
      platform: CONTACT_PLATFORM,
    }

    const authJsonHeaders = {
      ...headers,
      'Content-Type': 'application/json',
    }

    try {
      if (contactForm.apiId != null) {
        await axios.patch(getContactDetailApiUrl(contactForm.apiId), apiPayload, {
          headers: authJsonHeaders,
        })
        setContactSaveStatus('saved')
        setContactSaveMessage('Contact updated successfully.')
      } else {
        await axios.post(getContactsApiUrl(), apiPayload, {
          headers: authJsonHeaders,
        })
        setContactSaveStatus('saved')
        setContactSaveMessage('Contact saved successfully.')
      }
      notifyFaqContactsUpdated()
      await reloadContacts()
    } catch (error) {
      setContactSaveStatus('error')
      setContactSaveMessage(friendlyContactError(error))
    }
  }

  const handleSaveSocialLinks = async () => {
    if (!validateSocialLinks()) return

    const headers = getAuthHeaders()
    if (!headers) {
      setSocialSaveStatus('error')
      setSocialSaveMessage('Please sign in again to save social links.')
      return
    }

    setSocialSaveStatus('saving')
    setSocialSaveMessage('')

    // Only POST newly added links (no apiId). Existing API rows must not be re-posted.
    const linksToSave = contactForm.socialLinks
      .filter((link) => link.apiId == null)
      .map((link) => ({
        id: link.id,
        platform: normalizePlatformValue(link.platform),
        label: String(link.label).trim(),
        url: String(link.url).trim(),
      }))
      .filter((link) => link.label && link.url)

    if (!linksToSave.length) {
      setSocialSaveStatus('error')
      setSocialSaveMessage('No new social links to save.')
      return
    }

    try {
      await Promise.all(
        linksToSave.map((link) =>
          axios.post(
            getContactsApiUrl(),
            {
              display_name: link.label,
              platform: link.platform,
              url: link.url,
            },
            {
              headers: {
                ...headers,
                'Content-Type': 'application/json',
              },
            }
          )
        )
      )

      setSocialSaveStatus('saved')
      setSocialSaveMessage(
        linksToSave.length === 1
          ? 'New social link saved successfully.'
          : `${linksToSave.length} new social links saved successfully.`
      )
      notifyFaqContactsUpdated()
      await reloadContacts()
    } catch (error) {
      setSocialSaveStatus('error')
      setSocialSaveMessage(friendlyContactError(error))
    }
  }

  const handleResetContact = () => {
    setContactErrors({})
    setContactSaveStatus('idle')
    setContactSaveMessage('')
    setSocialSaveStatus('idle')
    setSocialSaveMessage('')
    clearContactDrafts()
    reloadContacts()
  }

  const phonePreviewHref = useMemo(() => {
    const digits = String(contactForm.phone || '').replace(/\D/g, '')
    if (!digits) return null
    const normalized = digits.startsWith('91') ? digits : `91${digits.slice(-10)}`
    return `tel:+${normalized}`
  }, [contactForm.phone])

  const previewSocialLinks = useMemo(
    () => contactForm.socialLinks.filter((link) => link.label && link.url),
    [contactForm.socialLinks]
  )

  const renderToggleCard = ({ icon, title, description, checked, onChange }) => (
    <div className="flex items-center justify-between border border-slate-200 rounded-2xl p-4 bg-white">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="font-medium text-slate-900">{title}</div>
          <div className="text-sm text-slate-500">{description}</div>
        </div>
      </div>
      <label className="inline-flex items-center cursor-pointer">
        <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
        <div className="w-12 h-6 bg-slate-200 rounded-full peer peer-checked:bg-teal-500 relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:h-5 after:w-5 after:rounded-full after:transition-all peer-checked:after:translate-x-5"></div>
      </label>
    </div>
  )

  const renderContactField = ({
    id,
    label,
    value,
    onChange,
    error,
    icon,
    type = 'text',
    placeholder,
    helper,
  }) => (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">
        {label}
      </label>
      <div className="relative mt-2">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={contactSaveStatus === 'saving' || isLoadingContact}
          className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70 ${
            error ? 'border-red-300 focus:ring-red-400' : 'border-slate-200'
          }`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : helper ? `${id}-helper` : undefined}
        />
      </div>
      {helper && !error ? (
        <p id={`${id}-helper`} className="mt-1.5 text-xs text-slate-500">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500 mt-1">Manage notifications, account security, and public contact links</p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex flex-wrap gap-2 p-4 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setTab('notifications')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-150 ${
                tab === 'notifications' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Notifications
            </button>
            <button
              type="button"
              onClick={() => setTab('security')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-150 ${
                tab === 'security' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Security
            </button>
            <button
              type="button"
              onClick={() => setTab('contact')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-150 ${
                tab === 'contact' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Contact &amp; Social
            </button>
          </div>

          {tab === 'notifications' && (
            <div className="p-6 space-y-4">
              {renderToggleCard({
                icon: <FiBell className="text-teal-600 text-lg" />,
                title: 'Booking updates',
                description: 'Get notified when bookings are confirmed or changed',
                checked: notifications.bookingUpdates,
                onChange: () => toggleNotification('bookingUpdates'),
              })}
              {renderToggleCard({
                icon: <FiBell className="text-teal-600 text-lg" />,
                title: 'Promotions',
                description: 'Occasional offers and service announcements',
                checked: notifications.promotions,
                onChange: () => toggleNotification('promotions'),
              })}
              {renderToggleCard({
                icon: <FiBell className="text-teal-600 text-lg" />,
                title: 'Reminders',
                description: 'Reminders for upcoming appointments and payments',
                checked: notifications.reminders,
                onChange: () => toggleNotification('reminders'),
              })}
            </div>
          )}

          {tab === 'security' && (
            <div className="p-6 space-y-4">
              {renderToggleCard({
                icon: <FiLock className="text-teal-600 text-lg" />,
                title: 'Two-factor authentication',
                description: 'Require a second step when signing in',
                checked: security.twoFactor,
                onChange: () => toggleSecurity('twoFactor'),
              })}
              {renderToggleCard({
                icon: <FiShield className="text-teal-600 text-lg" />,
                title: 'Login alerts',
                description: 'Email me when a new device signs into my account',
                checked: security.loginAlerts,
                onChange: () => toggleSecurity('loginAlerts'),
              })}
              {renderToggleCard({
                icon: <FiShield className="text-teal-600 text-lg" />,
                title: 'Trust this device',
                description: 'Skip additional verification on this browser',
                checked: security.deviceTrust,
                onChange: () => toggleSecurity('deviceTrust'),
              })}
            </div>
          )}

          {tab === 'contact' && (
            <div className="p-6 space-y-6">
              {isLoadingContact ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Loading contact details from API…
                </div>
              ) : null}

              {contactLoadError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                  <p>{contactLoadError}</p>
                  <button
                    type="button"
                    onClick={reloadContacts}
                    className="mt-2 text-xs font-semibold underline"
                  >
                    Retry
                  </button>
                </div>
              ) : null}

              <div className="grid gap-5 sm:grid-cols-2">
                {renderContactField({
                  id: 'contact-display-name',
                  label: 'Display name',
                  value: contactForm.displayName,
                  onChange: (value) => updateContactField('displayName', value),
                  error: contactErrors.displayName,
                  icon: <FiUser className="h-[18px] w-[18px]" aria-hidden="true" />,
                  placeholder: 'Display name',
                  helper: 'From /faq/contacts/ when platform is other',
                })}

                <div>
                  <label htmlFor="contact-platform" className="block text-sm font-semibold text-slate-800">
                    Platform
                  </label>
                  <select
                    id="contact-platform"
                    value={CONTACT_PLATFORM}
                    disabled
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 cursor-not-allowed"
                    aria-describedby="contact-platform-helper"
                  >
                    <option value="other">Other</option>
                  </select>
                  <p id="contact-platform-helper" className="mt-1.5 text-xs text-slate-500">
                    Saved as <code className="rounded bg-slate-100 px-1">platform: other</code>
                  </p>
                </div>

                {renderContactField({
                  id: 'contact-phone',
                  label: 'Mobile number',
                  value: contactForm.phone,
                  onChange: (value) => updateContactField('phone', value),
                  error: contactErrors.phone,
                  icon: <FiPhone className="h-[18px] w-[18px]" aria-hidden="true" />,
                  placeholder: 'Mobile number',
                  helper: phonePreviewHref
                    ? `Saved as ${formatMobileNumber(contactForm.phone)}`
                    : 'Loaded from API mobile_number',
                })}

                {renderContactField({
                  id: 'contact-email',
                  label: 'Email address',
                  value: contactForm.email,
                  onChange: (value) => updateContactField('email', value),
                  error: contactErrors.email,
                  icon: <FiMail className="h-[18px] w-[18px]" aria-hidden="true" />,
                  type: 'email',
                  placeholder: 'Email address',
                  helper: 'Loaded from API email',
                })}
              </div>

              {contactSaveMessage ? (
                <div
                  role="status"
                  className={`rounded-xl px-4 py-3 text-sm ${
                    contactSaveStatus === 'error'
                      ? 'border border-red-200 bg-red-50 text-red-700'
                      : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                  }`}
                >
                  {contactSaveMessage}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveContact}
                  disabled={contactSaveStatus === 'saving' || isLoadingContact}
                  className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FiSave className="h-4 w-4" aria-hidden="true" />
                  {contactSaveStatus === 'saving' ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={handleResetContact}
                  disabled={contactSaveStatus === 'saving' || socialSaveStatus === 'saving' || isLoadingContact}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FiRotateCcw className="h-4 w-4" aria-hidden="true" />
                  Reload from API
                </button>
              </div>

              <div className="space-y-4 border-t border-slate-100 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Social media links</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Choose a platform from the dropdown — that value is sent as{' '}
                      <code className="rounded bg-slate-100 px-1">platform</code> (e.g. instagram, facebook).
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={addSocialLink}
                      disabled={socialSaveStatus === 'saving' || contactSaveStatus === 'saving'}
                      className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 transition-colors duration-150 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <FiPlus className="h-4 w-4" aria-hidden="true" />
                      Add social link
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSocialLinks}
                      disabled={socialSaveStatus === 'saving' || isLoadingContact}
                      className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <FiSave className="h-4 w-4" aria-hidden="true" />
                      {socialSaveStatus === 'saving' ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>

                {contactErrors.socialLinks ? (
                  <p className="text-xs text-red-600" role="alert">
                    {contactErrors.socialLinks}
                  </p>
                ) : null}

                {!isLoadingContact && contactForm.socialLinks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-slate-900">No social links yet</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Links from the API will appear here. Use Add social link to create a new one.
                    </p>
                  </div>
                ) : null}

                <div className="space-y-3">
                  {contactForm.socialLinks.map((link, index) => {
                    const selectedPlatform = normalizePlatformValue(link.platform)
                    const selectedLabel =
                      SOCIAL_PLATFORMS.find((p) => p.value === selectedPlatform)?.label || selectedPlatform
                    return (
                    <div
                      key={link.id}
                      id={`social-link-card-${link.id}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 scroll-mt-24"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${getSocialPreviewStyle(selectedPlatform)}`}
                          >
                            {renderSocialIcon(selectedPlatform, 'h-4 w-4')}
                          </span>
                          <span className="text-sm font-medium text-slate-700">Link {index + 1}</span>
                          {link.apiId == null ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              New
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSocialLink(link.id)}
                          disabled={socialSaveStatus === 'saving' || deletingSocialId != null}
                          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors duration-150 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={`Delete ${link.label || 'social link'}`}
                        >
                          <FiTrash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {deletingSocialId === link.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label htmlFor={`social-platform-${link.id}`} className="block text-sm font-semibold text-slate-800">
                            Platform
                          </label>
                          <select
                            id={`social-platform-${link.id}`}
                            value={selectedPlatform}
                            onChange={(e) => updateSocialLink(link.id, 'platform', e.target.value)}
                            disabled={socialSaveStatus === 'saving'}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                          >
                            {SOCIAL_PLATFORMS.map((platform) => (
                              <option key={platform.value} value={platform.value}>
                                {platform.label}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1.5 text-xs text-slate-500">
                            Selected: {selectedLabel} →{' '}
                            <code className="rounded bg-slate-100 px-1">platform: &quot;{selectedPlatform}&quot;</code>
                          </p>
                        </div>

                        <div>
                          <label htmlFor={`social-label-${link.id}`} className="block text-sm font-semibold text-slate-800">
                            Display name
                          </label>
                          <input
                            id={`social-label-${link.id}`}
                            type="text"
                            value={link.label}
                            onChange={(e) => updateSocialLink(link.id, 'label', e.target.value)}
                            placeholder="e.g. Social Media Name"
                            disabled={socialSaveStatus === 'saving'}
                            className={`mt-2 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-slate-50 ${
                              contactErrors[`social-${link.id}-label`] ? 'border-red-300 focus:ring-red-400' : 'border-slate-200'
                            }`}
                            aria-invalid={Boolean(contactErrors[`social-${link.id}-label`])}
                          />
                          {contactErrors[`social-${link.id}-label`] ? (
                            <p className="mt-1.5 text-xs text-red-600" role="alert">
                              {contactErrors[`social-${link.id}-label`]}
                            </p>
                          ) : null}
                        </div>

                        <div className="sm:col-span-2">
                          <label htmlFor={`social-url-${link.id}`} className="block text-sm font-semibold text-slate-800">
                            Profile URL
                          </label>
                          <input
                            id={`social-url-${link.id}`}
                            type="url"
                            value={link.url}
                            onChange={(e) => updateSocialLink(link.id, 'url', e.target.value)}
                            placeholder="https://instagram.com/..."
                            disabled={socialSaveStatus === 'saving'}
                            className={`mt-2 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-slate-50 ${
                              contactErrors[`social-${link.id}-url`] ? 'border-red-300 focus:ring-red-400' : 'border-slate-200'
                            }`}
                            aria-invalid={Boolean(contactErrors[`social-${link.id}-url`])}
                          />
                          {contactErrors[`social-${link.id}-url`] ? (
                            <p className="mt-1.5 text-xs text-red-600" role="alert">
                              {contactErrors[`social-${link.id}-url`]}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>

                {socialSaveMessage ? (
                  <div
                    role="status"
                    className={`rounded-xl px-4 py-3 text-sm ${
                      socialSaveStatus === 'error'
                        ? 'border border-red-200 bg-red-50 text-red-700'
                        : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                    }`}
                  >
                    {socialSaveMessage}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveSocialLinks}
                    disabled={socialSaveStatus === 'saving' || isLoadingContact}
                    className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FiSave className="h-4 w-4" aria-hidden="true" />
                    {socialSaveStatus === 'saving' ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {contactForm.displayName ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
                      <FiUser className="h-4 w-4" aria-hidden="true" />
                      {contactForm.displayName}
                    </span>
                  ) : null}
                  {phonePreviewHref ? (
                    <a
                      href={phonePreviewHref}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-teal-400 hover:text-teal-700 transition-colors duration-150"
                    >
                      <FiPhone className="h-4 w-4" aria-hidden="true" />
                      {formatMobileNumber(contactForm.phone) || contactForm.phone}
                    </a>
                  ) : null}
                  {contactForm.email ? (
                    <a
                      href={`mailto:${contactForm.email}`}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-teal-400 hover:text-teal-700 transition-colors duration-150"
                    >
                      <FiMail className="h-4 w-4" aria-hidden="true" />
                      {contactForm.email}
                    </a>
                  ) : null}
                  {previewSocialLinks.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${getSocialPreviewStyle(link.platform)}`}
                      aria-label={`Preview ${link.label}`}
                      title={link.label}
                    >
                      {renderSocialIcon(link.platform, link.platform === 'instagram' ? 'h-[17px] w-[17px]' : 'h-4 w-4')}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Settings
