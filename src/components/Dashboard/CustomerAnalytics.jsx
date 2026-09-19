import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { FiChevronDown, FiRefreshCw, FiTrendingUp, FiUsers } from 'react-icons/fi'

const PATIENTS_PAGE_SIZE = 10

const PATIENT_COLUMNS = [
  { id: 'full_name', label: 'Full Name' },
  { id: 'patient_id', label: 'Patient Id' },
  { id: 'location_type', label: 'Location Type' },
  { id: 'emr_count', label: 'EMR Count' },
  { id: 'phone', label: 'Phone' },
  { id: 'age', label: 'Age' },
  { id: 'gender', label: 'Gender' },
  { id: 'is_active', label: 'Status' },
  { id: 'registration_date', label: 'Registration Date' },
  { id: 'name_registered_by', label: 'Registered By' },
]

const LONG_TEXT_COLUMNS = new Set(['full_name', 'name_registered_by'])
const CELL_PAD = 'px-1.5 py-1 sm:px-2 sm:py-1.5'

const CHART_COLORS = [
  'bg-indigo-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-teal-500',
  'bg-slate-400',
]

const resolveRequestUrl = (href, baseUrl) => {
  if (!href) return null
  const raw = String(href)
  if (/^https?:\/\//i.test(raw)) return raw
  const normalizedBase = String(baseUrl || '').replace(/\/$/, '')
  return `${normalizedBase}${raw.startsWith('/') ? raw : `/${raw}`}`
}

const formatLocationType = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw) return 'Not set'
  if (raw === 'IN_HOUSE') return 'In House'
  if (raw === 'CLIENT_SIDE') return 'Client Side'
  if (raw === 'OPD') return 'OPD'
  return raw.replace(/_/g, ' ')
}

const formatGender = (value) => {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return 'Not set'
  if (raw === 'male' || raw === 'm') return 'Male'
  if (raw === 'female' || raw === 'f') return 'Female'
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

const patientStatusLabel = (patient) => {
  if (patient?.is_deleted === true) return 'Deleted'
  if (patient?.is_active === true) return 'Active'
  return 'Inactive'
}

const isSameCalendarMonth = (iso, referenceDate) => {
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return false
  return (
    d.getFullYear() === referenceDate.getFullYear() && d.getMonth() === referenceDate.getMonth()
  )
}

const friendlyLoadError = (error) => {
  const status = error?.response?.status
  if (status === 401 || status === 403) {
    return 'You do not have permission to view customer analytics. Please sign in again.'
  }
  if (status >= 500) return 'The server is unavailable right now. Please try again shortly.'
  if (!error?.response && String(error?.message || '').toLowerCase().includes('network')) {
    return 'Network error. Check your connection and try again.'
  }
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  return 'Unable to load customer analytics.'
}

const countBy = (items, getLabel) => {
  const map = new Map()
  for (const item of items) {
    const label = getLabel(item)
    map.set(label, (map.get(label) || 0) + 1)
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

const readValue = (value) => {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  const text = String(value).trim()
  return text || '—'
}

const formatDate = (value) => {
  if (value == null || value === '') return '—'
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return readValue(value)
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
}

const readCellValue = (patient, columnId) => {
  const value = patient?.[columnId]
  if (columnId === 'location_type') return formatLocationType(value)
  if (columnId === 'gender') return formatGender(value)
  if (columnId === 'registration_date') return formatDate(value)
  if (columnId === 'is_active') return patientStatusLabel(patient)
  if (columnId === 'age' || columnId === 'emr_count') {
    if (value == null || value === '') return '—'
    return String(value)
  }
  return readValue(value)
}

const renderTableCellContent = (patient, colId) => {
  if (colId === 'is_active') {
    const on = patient?.is_active === true && patient?.is_deleted !== true
    const deleted = patient?.is_deleted === true
    const label = deleted ? 'Deleted' : on ? 'Active' : 'Inactive'
    const style = deleted
      ? 'bg-rose-100 text-rose-800'
      : on
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-slate-200 text-slate-700'
    return (
      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:text-[11px] ${style}`}>
        {label}
      </span>
    )
  }

  if (colId === 'gender') {
    const label = formatGender(patient?.gender)
    if (label === 'Not set') return '—'
    const genderClass =
      label === 'Male'
        ? 'bg-sky-100 text-sky-800'
        : label === 'Female'
          ? 'bg-rose-100 text-rose-800'
          : 'bg-slate-200 text-slate-700'
    return (
      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:text-[11px] ${genderClass}`}>
        {label}
      </span>
    )
  }

  const value = readCellValue(patient, colId)
  if (LONG_TEXT_COLUMNS.has(colId)) {
    const tip = value && value !== '—' ? value : undefined
    return (
      <span className="block min-w-0 max-w-[9rem] truncate sm:max-w-[11rem]" title={tip}>
        {value}
      </span>
    )
  }
  return value
}

const KpiSkeleton = () => (
  <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="h-3 w-24 rounded bg-slate-200" />
    <div className="mt-3 h-8 w-16 rounded bg-slate-200" />
    <div className="mt-2 h-2.5 w-32 rounded bg-slate-100" />
  </div>
)

const ChartSkeleton = () => (
  <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="h-3 w-28 rounded bg-slate-200" />
    <div className="mt-4 space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-2.5 w-full rounded bg-slate-100" />
          <div className="h-3 w-3/4 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  </div>
)

const BarChartCard = ({ title, subtitle, items, total, emptyLabel = 'No data yet' }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
    </div>
    {!items.length ? (
      <p className="py-6 text-center text-xs text-slate-500">{emptyLabel}</p>
    ) : (
      <ul className="space-y-3" aria-label={title}>
        {items.map((item, index) => {
          const pct = total > 0 ? Math.round((item.count / total) * 100) : 0
          const color = CHART_COLORS[index % CHART_COLORS.length]
          return (
            <li key={item.label}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-slate-700">{item.label}</span>
                <span className="tabular-nums text-slate-500">
                  {item.count.toLocaleString('en-IN')} · {pct}%
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-300 ease-out motion-reduce:transition-none ${color}`}
                  style={{ width: `${Math.max(pct, item.count > 0 ? 4 : 0)}%` }}
                  role="presentation"
                />
              </div>
            </li>
          )
        })}
      </ul>
    )}
  </div>
)

const DonutChartCard = ({ title, subtitle, items, total, highlightLabel }) => {
  const segments = useMemo(() => {
    if (!total || !items.length) return []
    let offset = 0
    return items.map((item, index) => {
      const pct = (item.count / total) * 100
      const start = offset
      offset += pct
      return {
        ...item,
        pct,
        start,
        end: offset,
        color: CHART_COLORS[index % CHART_COLORS.length].replace('bg-', ''),
      }
    })
  }, [items, total])

  const gradient =
    segments.length > 0
      ? `conic-gradient(${segments
          .map((seg) => {
            const cssColor = {
              'indigo-500': '#6366f1',
              'sky-500': '#0ea5e9',
              'emerald-500': '#10b981',
              'amber-500': '#f59e0b',
              'rose-500': '#f43f5e',
              'violet-500': '#8b5cf6',
              'teal-500': '#14b8a6',
              'slate-400': '#94a3b8',
            }[seg.color] || '#6366f1'
            return `${cssColor} ${seg.start}% ${seg.end}%`
          })
          .join(', ')})`
      : '#e2e8f0'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {!items.length ? (
        <p className="py-6 text-center text-xs text-slate-500">No data yet</p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="relative h-36 w-36 shrink-0">
            <div
              className="h-full w-full rounded-full"
              style={{ background: gradient }}
              role="img"
              aria-label={`${title} distribution`}
            />
            <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white text-center">
              <span className="text-xl font-bold tabular-nums text-slate-900">{total}</span>
              <span className="text-[10px] uppercase tracking-wide text-slate-500">Total</span>
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-2">
            {items.map((item, index) => {
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0
              const isHighlight = highlightLabel && item.label === highlightLabel
              return (
                <li
                  key={item.label}
                  className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs ${
                    isHighlight ? 'bg-sky-50 ring-1 ring-sky-200' : ''
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${CHART_COLORS[index % CHART_COLORS.length]}`}
                      aria-hidden="true"
                    />
                    <span className={`truncate font-medium ${isHighlight ? 'text-sky-900' : 'text-slate-700'}`}>
                      {item.label}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {item.count} · {pct}%
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

const CustomerAnalytics = () => {
  const [patients, setPatients] = useState([])
  const [pagination, setPagination] = useState({
    next: null,
    previous: null,
    currentPage: 1,
    totalPages: 1,
    count: 0,
  })
  const [monthLabel, setMonthLabel] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [showPatientList, setShowPatientList] = useState(false)
  const [error, setError] = useState('')

  const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
  const now = useMemo(() => new Date(), [])

  const buildPatientsRequestUrl = useCallback(
    (href = null) => {
      if (href) return resolveRequestUrl(href, baseUrl)
      if (!baseUrl) return null
      return `${baseUrl}/booking/patients/?page_size=${PATIENTS_PAGE_SIZE}`
    },
    [baseUrl]
  )

  const loadAnalytics = useCallback(
    async (requestUrl = null, isPageNav = false) => {
      if (!baseUrl) {
        setError('Missing VITE_BASEURL_CARE in .env')
        setPatients([])
        setIsLoading(false)
        return
      }

      const token = localStorage.getItem('access_token')
      if (!token) {
        setError('Authorization token missing. Please log in again.')
        setPatients([])
        setIsLoading(false)
        return
      }

      const resolvedUrl = requestUrl || buildPatientsRequestUrl()
      if (!resolvedUrl) {
        setError('Missing VITE_BASEURL_CARE in .env')
        setIsLoading(false)
        return
      }

      if (isPageNav) {
        setIsLoadingMore(true)
      } else {
        setIsLoading(true)
      }
      setError('')

      try {
        const response = await axios.get(resolvedUrl, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const payload = response.data || {}
        const pagePatients = Array.isArray(payload.results) ? payload.results : []

        setPatients(pagePatients)
        setPagination({
          next: payload.next ?? null,
          previous: payload.previous ?? null,
          currentPage: payload.current_page ?? 1,
          totalPages: payload.total_pages ?? 1,
          count: Number(payload.count ?? pagePatients.length) || pagePatients.length,
        })
        setMonthLabel(new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }))
      } catch (err) {
        console.error('Customer analytics load error:', err)
        setError(friendlyLoadError(err))
        setPatients([])
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    [baseUrl, buildPatientsRequestUrl]
  )

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  const goToPatientsPage = useCallback(
    (href) => {
      const requestUrl = buildPatientsRequestUrl(href)
      if (requestUrl) loadAnalytics(requestUrl, true)
    },
    [buildPatientsRequestUrl, loadAnalytics]
  )

  const analytics = useMemo(() => {
    const pageTotal = patients.length
    const activeOnPage = patients.filter((p) => p?.is_active === true && p?.is_deleted !== true).length
    const newThisMonthOnPage = patients.filter((p) => isSameCalendarMonth(p?.registration_date, now)).length
    const newThisMonthLabel = `Registered in ${monthLabel || 'this month'}`

    return {
      pageTotal,
      activeOnPage,
      newThisMonthOnPage,
      gender: countBy(patients, (p) => formatGender(p?.gender)),
      location: countBy(patients, (p) => formatLocationType(p?.location_type)),
      status: countBy(patients, patientStatusLabel),
      registration: countBy(patients, (p) =>
        isSameCalendarMonth(p?.registration_date, now) ? newThisMonthLabel : 'Earlier'
      ),
      emrDocs: countBy(patients, (p) => {
        const n = Number(p?.emr_count)
        if (!Number.isFinite(n) || n <= 0) return 'No EMR documents'
        if (n === 1) return '1 document'
        if (n <= 5) return '2–5 documents'
        return '6+ documents'
      }),
      registrationFees: countBy(patients, (p) =>
        p?.is_registration_fees_paid === true ? 'Fees paid' : 'Fees not paid'
      ),
      newThisMonthLabel,
    }
  }, [patients, now, monthLabel])

  const kpiCards = [
    {
      key: 'total',
      label: 'Total customers',
      value: pagination.count,
      hint: `${analytics.activeOnPage} active on this page`,
      icon: FiUsers,
      iconClass: 'text-indigo-600 bg-indigo-50',
      valueClass: 'text-slate-900',
    },
    {
      key: 'new',
      label: 'New customers this month',
      value: analytics.newThisMonthOnPage,
      hint: `${monthLabel || 'Current month'} · this page`,
      icon: FiTrendingUp,
      iconClass: 'text-sky-600 bg-sky-50',
      valueClass: 'text-sky-900',
    },
  ]

  const chartPageHint = `Page ${pagination.currentPage} · ${analytics.pageTotal} customers shown`

  return (
    <div className="min-w-0 space-y-3 p-1 sm:p-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 sm:text-lg">Customer Analytics</h2>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Visual breakdown of your customer base. Current month registrations are highlighted.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadAnalytics()}
            disabled={isLoading || isLoadingMore}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiRefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700 sm:text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => loadAnalytics()}
              className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => <KpiSkeleton key={i} />)
          : kpiCards.map((card) => {
              const Icon = card.icon
              return (
                <div
                  key={card.key}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">
                        {card.label}
                      </p>
                      <p className={`mt-2 text-2xl font-bold tabular-nums sm:text-3xl ${card.valueClass}`}>
                        {card.value.toLocaleString('en-IN')}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">{card.hint}</p>
                    </div>
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.iconClass}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              )
            })}
      </div>

      <div className="relative grid grid-cols-1 gap-3 lg:grid-cols-2">
        {isLoadingMore ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60"
            aria-live="polite"
            aria-busy="true"
          >
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
              Loading page…
            </span>
          </div>
        ) : null}
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <ChartSkeleton key={i} />)
        ) : (
          <>
            <BarChartCard
              title="Gender"
              subtitle={chartPageHint}
              items={analytics.gender}
              total={analytics.pageTotal}
            />
            <BarChartCard
              title="Customer status"
              subtitle={chartPageHint}
              items={analytics.status}
              total={analytics.pageTotal}
            />
            <BarChartCard
              title="Location type"
              subtitle={chartPageHint}
              items={analytics.location}
              total={analytics.pageTotal}
            />
            <DonutChartCard
              title="Registration timing"
              subtitle={chartPageHint}
              items={analytics.registration}
              total={analytics.pageTotal}
              highlightLabel={analytics.newThisMonthLabel}
            />
            <BarChartCard
              title="EMR documents"
              subtitle={chartPageHint}
              items={analytics.emrDocs}
              total={analytics.pageTotal}
            />
            <BarChartCard
              title="Registration fees"
              subtitle={chartPageHint}
              items={analytics.registrationFees}
              total={analytics.pageTotal}
            />
          </>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          id="patient-list-toggle"
          aria-expanded={showPatientList}
          aria-controls="patient-list-panel"
          onClick={() => setShowPatientList((prev) => !prev)}
          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:px-4"
        >
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 sm:text-base">Patient list</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {showPatientList ? 'Hide' : 'Show'} patients on page {pagination.currentPage}
              {analytics.pageTotal ? ` (${analytics.pageTotal})` : ''}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
            {showPatientList ? 'Collapse' : 'Expand'}
            <FiChevronDown
              className={`h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none ${
                showPatientList ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </span>
        </button>

        {showPatientList ? (
          <div
            id="patient-list-panel"
            role="region"
            aria-labelledby="patient-list-toggle"
            className="border-t border-slate-100"
          >
            {isLoading ? (
              <div className="space-y-2 p-3 sm:p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : patients.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <FiUsers className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-slate-700">No patients on this page</p>
              </div>
            ) : (
              <div className="relative overflow-x-auto">
                {isLoadingMore ? (
                  <div
                    className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/60"
                    aria-live="polite"
                    aria-busy="true"
                  >
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
                      Loading…
                    </span>
                  </div>
                ) : null}
                <table className="w-full min-w-max border-collapse text-[11px] text-slate-700">
                  <thead className="bg-slate-100">
                    <tr>
                      {PATIENT_COLUMNS.map((col) => (
                        <th
                          key={col.id}
                          className={`${CELL_PAD} whitespace-nowrap text-left font-semibold`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((patient, index) => {
                      const isNewThisMonth = isSameCalendarMonth(patient?.registration_date, now)
                      return (
                        <tr
                          key={patient.id ?? index}
                          className={`border-t border-slate-100 ${
                            isNewThisMonth
                              ? 'bg-sky-50 ring-1 ring-inset ring-sky-200'
                              : index % 2 === 0
                                ? 'bg-white'
                                : 'bg-slate-50/50'
                          }`}
                        >
                          {PATIENT_COLUMNS.map((col) => (
                            <td key={col.id} className={`${CELL_PAD} align-top`}>
                              {col.id === 'full_name' ? (
                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                  <span className="font-medium text-slate-900">
                                    {renderTableCellContent(patient, col.id)}
                                  </span>
                                  {isNewThisMonth ? (
                                    <span className="inline-flex rounded-full bg-sky-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-900">
                                      New
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                renderTableCellContent(patient, col.id)
                              )}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {!isLoading && pagination.count > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 sm:px-4">
          <p>
            Page <span className="font-semibold text-slate-900">{pagination.currentPage}</span> of{' '}
            <span className="font-semibold text-slate-900">{pagination.totalPages}</span>
            <span className="text-slate-500"> ({pagination.count} total)</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!pagination.previous || isLoading || isLoadingMore}
              onClick={() => goToPatientsPage(pagination.previous)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!pagination.next || isLoading || isLoadingMore}
              onClick={() => goToPatientsPage(pagination.next)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default CustomerAnalytics
