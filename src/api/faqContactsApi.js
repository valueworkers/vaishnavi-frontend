import axios from 'axios'
import {
  SITE_EMAIL,
  SITE_PHONE,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_TEL,
  SITE_WHATSAPP_URL,
  formatSitePhoneDisplay,
} from '../constants/siteContact'

const FAQ_CONTACTS_PATH = '/faq/contacts/'

const normalizeTelHref = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits ? `tel:+${digits.startsWith('91') ? digits : `91${digits}`}` : ''
}

const normalizeWhatsAppHref = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  const withCountry = digits.startsWith('91') ? digits : `91${digits}`
  return `https://wa.me/${withCountry}`
}

const getContactsApiUrl = () => {
  const base = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
  return `${base}${FAQ_CONTACTS_PATH}`
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
  const platform = String(item?.platform || '').toLowerCase()
  const hasContactFields = Boolean(item?.mobile_number || item?.email)
  const hasUrl = Boolean(String(item?.url || '').trim())
  return platform === 'other' && hasContactFields && !hasUrl
}

const isSocialContactRow = (item) => Boolean(String(item?.url || '').trim())

export const emptyFaqContactsView = () => ({
  displayName: '',
  phone: SITE_PHONE,
  phoneDisplay: SITE_PHONE_DISPLAY,
  phoneTel: SITE_PHONE_TEL,
  whatsappUrl: SITE_WHATSAPP_URL,
  email: SITE_EMAIL,
  socialLinks: [],
})

export const mapFaqContactsResponse = (payload) => {
  const list = toContactsList(payload)
  const support = list.find((item) => isSupportContactRow(item)) || null
  const socialLinks = list
    .filter((item) => isSocialContactRow(item))
    .map((item) => ({
      id: item?.id ?? null,
      displayName: String(item?.display_name || '').trim(),
      platform: String(item?.platform || '').trim().toLowerCase(),
      url: String(item?.url || '').trim(),
    }))
    .filter((item) => item.url)

  const phone = String(support?.mobile_number || '').trim()
  const email = String(support?.email || '').trim()
  const phoneTel = phone ? normalizeTelHref(phone) : SITE_PHONE_TEL
  const whatsappUrl = phone ? normalizeWhatsAppHref(phone) : SITE_WHATSAPP_URL

  return {
    displayName: String(support?.display_name || '').trim(),
    phone: phone || SITE_PHONE,
    phoneDisplay: phone ? formatSitePhoneDisplay(phone) : SITE_PHONE_DISPLAY,
    phoneTel: phoneTel || SITE_PHONE_TEL,
    whatsappUrl: whatsappUrl || SITE_WHATSAPP_URL,
    email: email || SITE_EMAIL,
    socialLinks,
  }
}

let contactsCache = null
let contactsInflight = null

/** Shared GET /faq/contacts/ for public surfaces (navbar, home). */
export const fetchFaqContacts = async ({ force = false } = {}) => {
  if (!force && contactsCache) return contactsCache
  if (!force && contactsInflight) return contactsInflight

  const headers = {}
  const accessToken = localStorage.getItem('access_token')
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  contactsInflight = axios
    .get(getContactsApiUrl(), { headers: Object.keys(headers).length ? headers : undefined })
    .then((response) => {
      contactsCache = mapFaqContactsResponse(response.data)
      return contactsCache
    })
    .catch(() => {
      contactsCache = emptyFaqContactsView()
      return contactsCache
    })
    .finally(() => {
      contactsInflight = null
    })

  return contactsInflight
}

export const invalidateFaqContactsCache = () => {
  contactsCache = null
  contactsInflight = null
}
