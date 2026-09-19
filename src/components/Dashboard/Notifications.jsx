import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  FiBell,
  FiFilter,
  FiMessageCircle,
  FiMail,
  FiSmartphone,
  FiChevronLeft,
  FiChevronRight,
} from 'react-icons/fi'

const baseUrl = () => String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')

/** WebSocket URL for live notifications. Override with VITE_WS_NOTIFICATIONS_URL (full ws/wss URL). */
const notificationWebSocketUrl = () => {
  const explicit = String(import.meta.env.VITE_WS_NOTIFICATIONS_URL || '').trim()
  if (explicit) return explicit.replace(/\/$/, '')

  const rest = baseUrl()
  const path = String(import.meta.env.VITE_WS_NOTIFICATIONS_PATH || '/ws/notifications/').trim()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (!rest) return ''

  try {
    const u = new URL(rest.startsWith('http') ? rest : `https://${rest}`)
    // Dev notifications endpoint is ws:// (not wss) on this host
    if (u.hostname === 'eventroop-dev.vercel.app') {
      return `ws://${u.host}${normalizedPath}`.replace(/\/$/, '')
    }
    const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${wsProto}//${u.host}${normalizedPath}`.replace(/\/$/, '')
  } catch {
    return ''
  }
}

const appendAccessTokenQuery = (wsUrl, token) => {
  if (!wsUrl || !token) return wsUrl
  if (/[?&]token=/.test(wsUrl)) return wsUrl
  const sep = wsUrl.includes('?') ? '&' : '?'
  return `${wsUrl}${sep}token=${encodeURIComponent(token)}`
}

/**
 * Normalize server WebSocket payloads into notification object(s).
 * Supports: single object, { notification }, { payload }, { data }, { results: [] }, { type, ... }.
 */
const extractNotificationsFromMessage = (parsed) => {
  if (!parsed || typeof parsed !== 'object') return []

  if (Array.isArray(parsed)) {
    return parsed.filter((x) => x && typeof x === 'object' && x.id != null)
  }

  const candidates = [
    parsed.notification,
    parsed.payload,
    parsed.data,
    parsed.record,
    parsed.message?.notification,
  ].filter(Boolean)

  for (const c of candidates) {
    if (Array.isArray(c)) return c.filter((x) => x && typeof x === 'object' && x.id != null)
    if (c && typeof c === 'object' && c.id != null) return [c]
  }

  if (Array.isArray(parsed.results)) {
    return parsed.results.filter((x) => x && typeof x === 'object' && x.id != null)
  }

  if (parsed.id != null) return [parsed]

  return []
}

const mergeNotifications = (prev, incomingList) => {
  if (!incomingList.length) return prev
  const byId = new Map(prev.map((n) => [n.id, n]))
  for (const n of incomingList) {
    byId.set(n.id, { ...byId.get(n.id), ...n })
  }
  const merged = Array.from(byId.values())
  merged.sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime()
    const tb = new Date(b.created_at || 0).getTime()
    return tb - ta
  })
  return merged
}

const resolveApiUrl = (href) => {
  if (!href) return null
  const s = String(href)
  if (/^https?:\/\//i.test(s)) return s
  const base = baseUrl()
  if (!base) return s
  return `${base}${s.startsWith('/') ? s : `/${s}`}`
}

const CHANNEL_ICON = {
  whatsapp: FiMessageCircle,
  email: FiMail,
  sms: FiSmartphone,
  alert: FiBell,
}

/** API `category` values and UI labels (backend enum). */
const NOTIFICATION_CATEGORIES = [
  { value: 'operational', label: 'Operational' },
  { value: 'system', label: 'System' },
  { value: 'alert', label: 'Alert' },
  { value: 'task', label: 'Task' },
]

const CATEGORY_LABEL_BY_VALUE = NOTIFICATION_CATEGORIES.reduce((acc, { value, label }) => {
  acc[value] = label
  return acc
}, {})

const normalizeCategory = (category) => String(category || '').toLowerCase().trim()

const getCategoryDisplay = (n) => {
  const key = normalizeCategory(n.category)
  if (key && CATEGORY_LABEL_BY_VALUE[key]) return CATEGORY_LABEL_BY_VALUE[key]
  return n.category_display || n.category || '—'
}

const categoryAccent = (category) => {
  const c = normalizeCategory(category)
  if (c === 'system') return 'indigo'
  if (c === 'operational') return 'teal'
  if (c === 'alert') return 'amber'
  if (c === 'task') return 'orange'
  return 'slate'
}

const colorClasses = {
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  orange: 'bg-orange-100 text-orange-800 border-orange-200',
  teal: 'bg-teal-100 text-teal-800 border-teal-200',
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  slate: 'bg-slate-100 text-slate-800 border-slate-200',
}

const formatDate = (isoStr) => {
  try {
    const d = new Date(isoStr)
    const now = new Date()
    const diffMs = now - d
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

const formatDateTime = (isoStr) => {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

const Notifications = () => {
  const [filterCategory, setFilterCategory] = useState('all')
  const [notifications, setNotifications] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [wsStatus, setWsStatus] = useState('idle') // idle | connecting | open | closed | unsupported
  const wsRef = useRef(null)
  const wsGenerationRef = useRef(0)
  const reconnectTimerRef = useRef(null)
  const reconnectAttemptRef = useRef(0)
  const intentionalCloseRef = useRef(false)
  const [pagination, setPagination] = useState({
    count: 0,
    totalPages: 1,
    currentPage: 1,
    next: null,
    previous: null,
  })

  const fetchNotifications = useCallback(async (url = null) => {
    setIsLoading(true)
    setError('')
    try {
      const accessToken = localStorage.getItem('access_token')
      if (!accessToken) {
        setError('You need to be signed in to load notifications.')
        setNotifications([])
        setPagination({
          count: 0,
          totalPages: 1,
          currentPage: 1,
          next: null,
          previous: null,
        })
        return
      }

      const apiUrl = url ? resolveApiUrl(url) || url : `${baseUrl()}/notifications/notifications/`
      const response = await axios.get(apiUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      const data = response.data || {}
      const resultsList = Array.isArray(data.results) ? data.results : []

      setNotifications(resultsList)
      setPagination({
        count: data.count ?? resultsList.length,
        totalPages: data.total_pages || 1,
        currentPage: data.current_page || 1,
        next: resolveApiUrl(data.next),
        previous: resolveApiUrl(data.previous),
      })
    } catch (err) {
      console.error('Error fetching notifications:', err)
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.message ||
        'Could not load notifications.'
      setError(typeof msg === 'string' ? msg : 'Could not load notifications.')
      setNotifications([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    const wsBase = notificationWebSocketUrl()
    if (!wsBase || typeof WebSocket === 'undefined') {
      setWsStatus('idle')
      return undefined
    }

    const scheduleReconnect = () => {
      if (intentionalCloseRef.current) return
      if (!localStorage.getItem('access_token')) return
      const attempt = reconnectAttemptRef.current + 1
      reconnectAttemptRef.current = attempt
      const delayMs = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5))
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = window.setTimeout(() => connect(), delayMs)
    }

    const handleText = (text) => {
      const trimmed = String(text).trim()
      if (!trimmed) return
      try {
        const parsed = JSON.parse(trimmed)
        const action = String(parsed.action || parsed.type || '').toLowerCase()
        if (action === 'pong' || action === 'ping' || action === 'heartbeat') return

        const incoming = extractNotificationsFromMessage(parsed)
        if (incoming.length) {
          setNotifications((prev) => mergeNotifications(prev, incoming))
          try {
            window.dispatchEvent(
              new CustomEvent('notifications:new', {
                detail: { count: incoming.length },
              })
            )
          } catch {
            // ignore custom event issues in unsupported environments
          }
        }
      } catch {
        // Non-JSON messages are ignored
      }
    }

    const connect = () => {
      const token = localStorage.getItem('access_token')
      if (!token) {
        if (wsRef.current) {
          const prev = wsRef.current
          wsRef.current = null
          try {
            prev.close()
          } catch {
            /* ignore */
          }
        }
        clearTimeout(reconnectTimerRef.current)
        setWsStatus('closed')
        return
      }

      if (wsRef.current) {
        const prev = wsRef.current
        wsRef.current = null
        try {
          prev.close()
        } catch {
          /* ignore */
        }
      }

      wsGenerationRef.current += 1
      const generation = wsGenerationRef.current

      intentionalCloseRef.current = false
      setWsStatus('connecting')

      const url = appendAccessTokenQuery(wsBase, token)
      let socket
      try {
        socket = new WebSocket(url)
      } catch (e) {
        console.error('WebSocket create failed:', e)
        setWsStatus('closed')
        scheduleReconnect()
        return
      }

      wsRef.current = socket

      socket.onopen = () => {
        if (generation !== wsGenerationRef.current) return
        reconnectAttemptRef.current = 0
        setWsStatus('open')
      }

      socket.onmessage = (event) => {
        if (generation !== wsGenerationRef.current) return
        const raw = event.data
        if (raw instanceof Blob) {
          raw
            .text()
            .then((t) => {
              if (generation === wsGenerationRef.current) handleText(t)
            })
            .catch(() => {})
          return
        }
        handleText(raw)
      }

      socket.onerror = () => {
        // onclose will handle reconnect
      }

      socket.onclose = () => {
        if (generation !== wsGenerationRef.current) return
        if (wsRef.current === socket) wsRef.current = null
        if (!intentionalCloseRef.current) setWsStatus('closed')
        scheduleReconnect()
      }
    }

    connect()

    const onStorage = (e) => {
      if (e.key === 'access_token') connect()
    }
    const onAuthChanged = () => connect()

    window.addEventListener('storage', onStorage)
    window.addEventListener('auth-changed', onAuthChanged)

    return () => {
      intentionalCloseRef.current = true
      wsGenerationRef.current += 1
      clearTimeout(reconnectTimerRef.current)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('auth-changed', onAuthChanged)
      if (wsRef.current) {
        try {
          wsRef.current.close()
        } catch {
          /* ignore */
        }
        wsRef.current = null
      }
      setWsStatus('closed')
    }
  }, [])

  const filtered = useMemo(() => {
    if (filterCategory === 'all') return notifications
    return notifications.filter((n) => normalizeCategory(n.category) === filterCategory)
  }, [filterCategory, notifications])

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FiBell className="w-6 h-6 text-teal-600" />
            Notifications
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Alerts, messages, and updates for your account
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {notificationWebSocketUrl() && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                wsStatus === 'open'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : wsStatus === 'connecting'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : localStorage.getItem('access_token')
                      ? 'border-slate-200 bg-slate-50 text-slate-600'
                      : 'border-gray-200 bg-gray-50 text-gray-500'
              }`}
              title={
                wsStatus === 'open'
                  ? 'Connected for live notification updates'
                  : 'Live updates use a WebSocket; ensure your API exposes the same path or set VITE_WS_NOTIFICATIONS_URL'
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  wsStatus === 'open'
                    ? 'bg-emerald-500'
                    : wsStatus === 'connecting'
                      ? 'bg-amber-500 animate-pulse'
                      : 'bg-slate-400'
                }`}
                aria-hidden
              />
              {wsStatus === 'open'
                ? 'Live updates'
                : wsStatus === 'connecting'
                  ? 'Connecting…'
                  : localStorage.getItem('access_token')
                    ? 'Offline'
                    : 'Live (sign in)'}
            </span>
          )}
          <button
            type="button"
            disabled={isLoading}
            onClick={() => fetchNotifications()}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Refresh
          </button>
          <FiFilter className="w-4 h-4 text-gray-500 hidden sm:block" />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none min-w-40"
          >
            <option value="all">All categories</option>
            {NOTIFICATION_CATEGORIES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => setFilterCategory('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            filterCategory === 'all'
              ? 'bg-teal-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        {NOTIFICATION_CATEGORIES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilterCategory(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterCategory === value
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchNotifications()}
            className="text-sm font-semibold text-rose-900 underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {isLoading && notifications.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500 text-sm">
          Loading notifications…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center">
          <FiBell className="w-10 h-10 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600">
            {isLoading ? 'Loading…' : 'No notifications for this filter.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm text-left text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-3 whitespace-nowrap">
                    Channel
                  </th>
                  <th scope="col" className="px-3 py-3 whitespace-nowrap">
                    Category
                  </th>
                  <th scope="col" className="px-3 py-3 min-w-[140px]">
                    Title
                  </th>
                  <th scope="col" className="px-3 py-3 min-w-[200px]">
                    Message
                  </th>
                  <th scope="col" className="px-3 py-3 whitespace-nowrap">
                    Priority
                  </th>
                  <th scope="col" className="px-3 py-3 whitespace-nowrap">
                    Created
                  </th>
                  <th scope="col" className="px-3 py-3 min-w-40">
                    Recipient
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((n) => {
                  const accent = categoryAccent(n.category)
                  const colorClass = colorClasses[accent] || colorClasses.slate
                  const Icon = CHANNEL_ICON[n.channel] || FiBell
                  const categoryLabel = getCategoryDisplay(n)
                  const recipient = [n.recipient_email, n.recipient_phone].filter(Boolean).join(' · ') || '—'
                  return (
                    <tr
                      key={n.id}
                      className={n.is_read ? 'bg-white hover:bg-slate-50/80' : 'bg-teal-50/40 hover:bg-teal-50/70'}
                    >
                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${colorClass}`}>
                            <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          </span>
                          <span className="font-medium text-slate-800">
                            {n.channel_display || n.channel || '—'}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                        <span
                          className={`inline-flex max-w-40 truncate rounded border px-2 py-0.5 text-xs font-medium ${colorClass}`}
                          title={categoryLabel}
                        >
                          {categoryLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle font-semibold text-slate-900 max-w-[200px]">
                        <span className="line-clamp-2" title={n.title}>
                          {n.title || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle text-slate-600 max-w-[280px]">
                        <span className="line-clamp-2 whitespace-pre-wrap" title={n.message}>
                          {n.message || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle whitespace-nowrap text-slate-700">
                        {n.priority_display || n.priority || '—'}
                      </td>
                      <td className="px-3 py-2.5 align-middle whitespace-nowrap text-xs text-slate-600">
                        {formatDateTime(n.created_at) || formatDate(n.created_at) || '—'}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-xs text-slate-600 max-w-[200px]">
                        <span className="line-clamp-2" title={recipient}>
                          {recipient}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && pagination.count > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm p-4 border border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm text-slate-600">
              Page {pagination.currentPage} of {pagination.totalPages} ({pagination.count} total)
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => pagination.previous && fetchNotifications(pagination.previous)}
                disabled={!pagination.previous || isLoading}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                  pagination.previous
                    ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                }`}
              >
                <FiChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                type="button"
                onClick={() => pagination.next && fetchNotifications(pagination.next)}
                disabled={!pagination.next || isLoading}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                  pagination.next
                    ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                }`}
              >
                Next
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Notifications
