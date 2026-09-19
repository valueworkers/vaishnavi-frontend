import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { FiChevronDown, FiChevronUp, FiLoader, FiRefreshCw, FiSearch } from 'react-icons/fi'
import * as XLSX from 'xlsx'
import { openInvoiceDetailPdf } from '../../utils/invoiceDetailPdf'

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

const PAGE_SIZE_PRESETS = [20, 40, 60]

/** Preferred display order when API returns these keys; unknown keys append automatically. */
const COLUMN_LABEL_OVERRIDES = {
  patient: 'Patient Id',
  patient_id: 'Patient Id',
  user_name: 'Customer',
  booking_order_id: 'Booking Order',
  booking_venue: 'Venue',
  booking_locality: 'Locality',
  booking_location_type: 'Location type',
  booking_service: 'Service',
  booking_package: 'Package',
  paid_date: 'Paid Date',
}

const HIDDEN_COLUMN_KEYS = new Set([
  'booking',
  'payments',
  'invoices',
  'user_id',
  'patient',
  'group_total_invoice_amount',
  'group_total_paid',
  'group_total_balance',
  'booking_location',
])

const PREFERRED_COLUMN_ORDER = [
  'invoice_number',
  'patient_id',
  'patient_name',
  'user_name',
  'booking_order_id',
  'booking_venue',
  'booking_locality',
  'booking_location_type',
  'booking_service',
  'booking_package',
  'period_start',
  'period_end',
  'subtotal',
  'discount_amount',
  'premium_amount',
  'tax_amount',
  'total_amount',
  'paid_amount',
  'paid_date',
  'remaining_amount',
  'status',
  'issued_date',
  'due_date',
  'created_at',
  'updated_at',
  'id',
]

const DATE_COLUMNS = new Set(['period_start', 'period_end', 'issued_date', 'due_date', 'created_at', 'updated_at'])
const MONEY_COLUMNS = new Set([
  'subtotal',
  'discount_amount',
  'premium_amount',
  'tax_amount',
  'total_amount',
  'paid_amount',
  'remaining_amount',
])
const LONG_TEXT_COLUMNS = new Set([
  'patient_name',
  'user_name',
  'booking_venue',
  'booking_locality',
  'booking_service',
  'booking_package',
  'booking_location',
  'paid_date',
])

const CELL_PAD = 'px-1.5 py-1 sm:px-2 sm:py-1.5'

const resolveRequestUrl = (href, baseUrl) => {
  if (!href) return null
  const raw = String(href)
  if (/^https?:\/\//i.test(raw)) return raw
  const normalizedBase = String(baseUrl || '').replace(/\/$/, '')
  return `${normalizedBase}${raw.startsWith('/') ? raw : `/${raw}`}`
}

const withSearch = (requestUrl, searchTerm) => {
  if (!requestUrl) return null
  try {
    const url = new URL(requestUrl)
    const trimmed = String(searchTerm || '').trim()
    if (trimmed) {
      url.searchParams.set('search', trimmed)
    } else {
      url.searchParams.delete('search')
    }
    return url.toString()
  } catch {
    return requestUrl
  }
}

const withStatusFilter = (requestUrl, statusFilter) => {
  if (!requestUrl) return null
  try {
    const url = new URL(requestUrl)
    const status = String(statusFilter || '').trim()
    if (status) {
      url.searchParams.set('status', status)
    } else {
      url.searchParams.delete('status')
    }
    return url.toString()
  } catch {
    return requestUrl
  }
}

const BOOKING_TYPE_FILTER_PARAM = 'secondary_order__primary_order__booking_type'

const withBookingTypeFilter = (requestUrl, bookingTypeFilter) => {
  if (!requestUrl) return null
  try {
    const url = new URL(requestUrl)
    const bookingType = String(bookingTypeFilter || '').trim().toUpperCase()
    if (bookingType) {
      url.searchParams.set(BOOKING_TYPE_FILTER_PARAM, bookingType)
    } else {
      url.searchParams.delete(BOOKING_TYPE_FILTER_PARAM)
    }
    return url.toString()
  } catch {
    return requestUrl
  }
}

const applyInvoiceListFilters = (requestUrl, { searchTerm, statusFilter, bookingTypeFilter }) =>
  withBookingTypeFilter(withStatusFilter(withSearch(requestUrl, searchTerm), statusFilter), bookingTypeFilter)

const withListOrdering = (requestUrl, ordering) => {
  if (!requestUrl) return null
  try {
    const url = new URL(requestUrl)
    const order = String(ordering || '').trim()
    if (
      order === 'total_invoice_amount' ||
      order === '-total_invoice_amount' ||
      order === 'patient_first_name' ||
      order === '-patient_first_name'
    ) {
      url.searchParams.set('ordering', order)
    } else {
      url.searchParams.delete('ordering')
    }
    return url.toString()
  } catch {
    return requestUrl
  }
}

const isAmountOrdering = (ordering) => {
  const order = String(ordering || '').trim()
  return order === 'total_invoice_amount' || order === '-total_invoice_amount'
}

const isPatientNameOrdering = (ordering) => {
  const order = String(ordering || '').trim()
  return order === 'patient_first_name' || order === '-patient_first_name'
}

const withPeriodFilters = (requestUrl, { year, month, showAllMonths }) => {
  if (!requestUrl) return null
  try {
    const url = new URL(requestUrl)
    url.searchParams.set('year', String(year))
    if (!showAllMonths) {
      url.searchParams.set('month', String(month))
    } else {
      url.searchParams.delete('month')
    }
    url.searchParams.delete('period_start__year')
    url.searchParams.delete('period_start__month')
    return url.toString()
  } catch {
    return requestUrl
  }
}

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'PAID', label: 'Fully paid' },
  { value: 'PARTIALLY_PAID', label: 'Partly paid' },
  { value: 'UNPAID', label: 'Unpaid' },
]

const AMOUNT_ORDERING_OPTIONS = [
  { value: '-total_invoice_amount', label: 'High to low' },
  { value: 'total_invoice_amount', label: 'Low to high' },
]

const PATIENT_NAME_ORDERING_OPTIONS = [
  { value: 'patient_first_name', label: 'A to Z' },
  { value: '-patient_first_name', label: 'Z to A' },
]

const LOCATION_TYPE_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'CLIENT_SIDE', label: 'Client Side' },
  { value: 'IN_HOUSE', label: 'In House' },
  { value: 'OPD', label: 'OPD' },
]

const LOCATION_TYPE_FILTER_VALUES = LOCATION_TYPE_FILTER_OPTIONS.map((option) => option.value)

const cycleLocationTypeFilter = (current, direction) => {
  const values = LOCATION_TYPE_FILTER_VALUES
  const idx = Math.max(0, values.indexOf(String(current || '')))
  const nextIdx = (idx + direction + values.length) % values.length
  return values[nextIdx]
}

/** Collect paid_date values from invoice payments[]. */
const extractPaidDates = (payments) => {
  if (!Array.isArray(payments) || !payments.length) return []
  return payments
    .map((payment) => payment?.paid_date || payment?.created_at)
    .filter(Boolean)
}

const formatPaidDatesCell = (paidDates) => {
  if (!Array.isArray(paidDates) || !paidDates.length) return '-'
  return paidDates.map((date) => formatDateTime(date)).join('; ')
}

/** Flatten grouped GET /booking/invoices/ results into one table row per invoice. */
const flattenBookingInvoiceResults = (results) => {
  if (!Array.isArray(results)) return []
  const rows = []
  for (const group of results) {
    const invoices = Array.isArray(group?.invoices) ? group.invoices : []
    for (const invoice of invoices) {
      const booking = invoice?.booking || {}
      rows.push({
        ...invoice,
        user_id: group.user_id,
        user_name: group.user_name,
        patient_id: group.patient_id,
        patient: group.patient_id,
        patient_name: group.patient_name,
        group_total_invoice_amount: group.total_invoice_amount,
        group_total_paid: group.total_paid,
        group_total_balance: group.total_balance,
        booking_order_id: booking.order_id ?? null,
        booking_venue: booking.venue ?? null,
        booking_locality: (() => {
          const locality = String(booking.locality ?? '').trim()
          if (locality) return locality
          const address = String(booking.address ?? '').trim()
          return address || null
        })(),
        booking_location_type: booking.location_type ?? null,
        booking_service: booking.service ?? null,
        booking_package: booking.package ?? null,
        booking_location: booking.location ?? null,
        paid_date: extractPaidDates(invoice.payments),
      })
    }
  }
  return rows
}

const formatColumnLabel = (key) =>
  COLUMN_LABEL_OVERRIDES[key] ??
  String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

const collectKeysFromRecords = (records) => {
  const keys = new Set()
  for (const row of records) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      Object.keys(row).forEach((k) => {
        if (!HIDDEN_COLUMN_KEYS.has(k)) keys.add(k)
      })
    }
  }
  return [...keys]
}

const buildInitialColumnOrder = (discoveredKeys) => {
  const discovered = new Set(discoveredKeys)
  const ordered = PREFERRED_COLUMN_ORDER.filter((k) => discovered.has(k))
  const rest = discoveredKeys.filter((k) => !ordered.includes(k)).sort()
  return [...ordered, ...rest]
}

/** Append newly discovered API keys; never drop columns seen on earlier pages. */
const mergeColumnOrder = (prevOrder, discoveredKeys) => {
  if (!discoveredKeys.length) return prevOrder
  const next = prevOrder.length ? [...prevOrder] : []
  const initial = buildInitialColumnOrder(discoveredKeys)
  for (const k of initial) {
    if (!next.includes(k)) next.push(k)
  }
  return next.length ? next : initial
}

const formatApiError = (err) => {
  if (!err?.response) return err?.message || 'Network error'
  const { status, statusText, data } = err.response
  const prefix = status ? `${status} ${statusText || ''}`.trim() : ''
  if (typeof data?.detail === 'string') return prefix ? `${prefix}: ${data.detail}` : data.detail
  if (typeof data?.message === 'string') return prefix ? `${prefix}: ${data.message}` : data.message
  return prefix || 'Failed to load invoices'
}

const readValue = (value) => {
  if (value == null) return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return '-'
    }
  }
  const text = String(value).trim()
  return text || '-'
}

const isMoneyColumn = (columnId) =>
  MONEY_COLUMNS.has(columnId) ||
  /_(amount|total|paid|price|fee|balance|cost)$/.test(columnId) ||
  columnId === 'amount'

const isDateColumn = (columnId) =>
  DATE_COLUMNS.has(columnId) ||
  /_(date|at)$/.test(columnId) ||
  columnId.endsWith('_datetime') ||
  /^period_/.test(columnId)

const isDateOnlyColumn = (columnId, value) => {
  if (columnId === 'issued_date' || columnId === 'due_date' || columnId.endsWith('_date')) return true
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return true
  return false
}

const isStatusColumn = (columnId) => columnId === 'status' || columnId.endsWith('_status')

const isBooleanColumn = (columnId, value) =>
  typeof value === 'boolean' || columnId.startsWith('is_') || columnId.startsWith('has_')

const looksLikeIsoDateTime = (value) => {
  if (value == null || value === '') return false
  const text = String(value).trim()
  return /^\d{4}-\d{2}-\d{2}T/.test(text) || /^\d{4}-\d{2}-\d{2} \d{2}:/.test(text)
}

const formatDateTime = (iso) => {
  if (iso == null || iso === '') return '-'
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return readValue(iso)
  return d.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatDateOnly = (iso) => {
  if (iso == null || iso === '') return '-'
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return readValue(iso)
  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const formatAmountExact = (value) => {
  if (value == null || value === '') return '-'
  const raw = String(value).trim()
  if (!raw) return '-'
  if (/^-?\d+(\.\d+)?$/.test(raw)) return `₹${raw}`
  return readValue(value)
}

const formatLocationType = (value) => {
  const raw = String(value ?? '').trim().toUpperCase()
  if (!raw) return '-'
  if (raw === 'IN_HOUSE') return 'In House'
  if (raw === 'CLIENT_SIDE') return 'Client Side'
  if (raw === 'OPD') return 'OPD'
  return raw.replace(/_/g, ' ')
}

const formatStatusLabel = (status) => {
  const u = String(status || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
  if (u === 'PARTIALLY_PAID') return 'Partly paid'
  if (u === 'UNPAID') return 'Unpaid'
  if (u === 'PAID' || u === 'FULLY_PAID') return 'Fully paid'
  if (u === 'OVERDUE') return 'Overdue'
  return readValue(status)
}

const statusBadgeClass = (status) => {
  const u = String(status || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
  if (u === 'PAID' || u === 'FULLY_PAID') return 'bg-emerald-100 text-emerald-800'
  if (u === 'PARTIALLY_PAID') return 'bg-amber-100 text-amber-900'
  if (u === 'UNPAID') return 'bg-slate-200 text-slate-700'
  if (u === 'OVERDUE') return 'bg-rose-100 text-rose-800'
  return 'bg-slate-200 text-slate-700'
}

const readCellValue = (invoice, columnId) => {
  if (columnId === 'paid_date') {
    return formatPaidDatesCell(invoice?.paid_date ?? extractPaidDates(invoice?.payments))
  }
  if (columnId === 'booking_location_type') {
    return formatLocationType(invoice?.booking_location_type)
  }
  const value = invoice?.[columnId]
  if (isBooleanColumn(columnId, value)) return readValue(value)
  if (isStatusColumn(columnId) && columnId !== 'status') return formatStatusLabel(value)
  if (columnId === 'status') return formatStatusLabel(value)
  if (isMoneyColumn(columnId)) return formatAmountExact(value)
  if (isDateColumn(columnId) || looksLikeIsoDateTime(value)) {
    return isDateOnlyColumn(columnId, value) ? formatDateOnly(value) : formatDateTime(value)
  }
  return readValue(value)
}

const shouldTruncateCell = (colId, invoice) => {
  if (colId === 'paid_date') {
    const paidDates = invoice?.paid_date ?? extractPaidDates(invoice?.payments)
    return Array.isArray(paidDates) && paidDates.length > 1
  }
  if (isMoneyColumn(colId) || isStatusColumn(colId) || isBooleanColumn(colId, invoice?.[colId])) {
    return false
  }
  if (LONG_TEXT_COLUMNS.has(colId)) return true
  const raw = invoice?.[colId]
  if (raw == null) return false
  if (typeof raw === 'object') return true
  return String(raw).length > 28
}

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const exportCellText = (invoice, columnId) => readCellValue(invoice, columnId)

const renderTableCellContent = (invoice, colId, { onInvoiceNumberClick, generatingPdfInvoiceId } = {}) => {
  if (colId === 'invoice_number') {
    const num = invoice?.invoice_number
    if (!num) return '-'
    const invoiceId = invoice?.id
    const isGenerating = invoiceId != null && generatingPdfInvoiceId === invoiceId
    if (invoiceId && onInvoiceNumberClick) {
      return (
        <button
          type="button"
          onClick={() => onInvoiceNumberClick(invoice)}
          disabled={isGenerating}
          className="inline-flex items-center gap-1 rounded-sm font-semibold text-indigo-700 underline-offset-2 transition-colors hover:text-indigo-800 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:cursor-wait disabled:opacity-60"
          title={`Download PDF for ${num}`}
          aria-label={`Download PDF invoice ${num}`}
        >
          {isGenerating ? (
            <>
              <FiLoader className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <span>Loading…</span>
            </>
          ) : (
            num
          )}
        </button>
      )
    }
    return readValue(num)
  }

  if (colId === 'status' || (isStatusColumn(colId) && typeof invoice?.[colId] === 'string')) {
    const raw = invoice?.[colId]
    return (
      <span
        className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusBadgeClass(raw)}`}
      >
        {formatStatusLabel(raw)}
      </span>
    )
  }

  const value = readCellValue(invoice, colId)
  if (shouldTruncateCell(colId, invoice)) {
    const tip = value && value !== '-' ? value : undefined
    return (
      <span className="block min-w-0 max-w-[9rem] truncate" title={tip}>
        {value}
      </span>
    )
  }
  return value
}

const syncColumnsFromRecords = (records, setColumnOrder, setColumnVisibility) => {
  const discovered = collectKeysFromRecords(records)
  if (!discovered.length) return

  setColumnOrder((prev) => mergeColumnOrder(prev, discovered))
  setColumnVisibility((prev) => {
    const next = { ...prev }
    for (const key of discovered) {
      if (next[key] === undefined) {
        next[key] = true
      }
    }
    return next
  })
}

const reorderColumns = (order, sourceId, targetId) => {
  if (!sourceId || !targetId || sourceId === targetId) return order
  const sourceIndex = order.indexOf(sourceId)
  const targetIndex = order.indexOf(targetId)
  if (sourceIndex < 0 || targetIndex < 0) return order
  const updated = [...order]
  const [moved] = updated.splice(sourceIndex, 1)
  updated.splice(targetIndex, 0, moved)
  return updated
}

const Invoices = () => {
  const now = new Date()
  const [invoiceYear, setInvoiceYear] = useState(now.getFullYear())
  const [invoiceMonth, setInvoiceMonth] = useState(now.getMonth() + 1)
  const [showAllMonths, setShowAllMonths] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [showStatusFilterMenu, setShowStatusFilterMenu] = useState(false)
  const statusFilterRef = useRef(null)
  const [bookingTypeFilter, setBookingTypeFilter] = useState('')
  const [listOrdering, setListOrdering] = useState('-total_invoice_amount')
  const [showAmountOrderingMenu, setShowAmountOrderingMenu] = useState(false)
  const amountOrderingRef = useRef(null)
  const [showPatientNameOrderingMenu, setShowPatientNameOrderingMenu] = useState(false)
  const patientNameOrderingRef = useRef(null)
  const [invoices, setInvoices] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [pagination, setPagination] = useState({
    next: null,
    previous: null,
    currentPage: 1,
    totalPages: 1,
    count: 0,
  })
  const [pageSize, setPageSize] = useState(20)
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [columnOrder, setColumnOrder] = useState([])
  const [columnVisibility, setColumnVisibility] = useState({})
  const [showColumnChooser, setShowColumnChooser] = useState(false)
  const [dragColId, setDragColId] = useState(null)
  const [generatingPdfInvoiceId, setGeneratingPdfInvoiceId] = useState(null)
  const chooserRef = useRef(null)
  const totalCountRef = useRef(0)

  const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear()
    return [current, current - 1, current - 2, current - 3]
  }, [])

  const resolveRequestPageSize = (selection, totalCount) => {
    const n = Number(selection)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    return totalCount > 0 ? totalCount : 20
  }

  const buildInvoicesRequestUrl = useCallback(
    (href = null) => {
      const resolved = href
        ? resolveRequestUrl(href, baseUrl)
        : baseUrl
          ? `${baseUrl}/booking/invoices/`
          : null
      if (!resolved) return null
      const size = resolveRequestPageSize(pageSize, totalCountRef.current)
      try {
        const withPeriod = withPeriodFilters(resolved, {
          year: invoiceYear,
          month: invoiceMonth,
          showAllMonths,
        })
        const url = new URL(withPeriod)
        url.searchParams.set('page_size', String(size))
        return withListOrdering(
          applyInvoiceListFilters(url.toString(), {
            searchTerm: appliedSearch,
            statusFilter,
            bookingTypeFilter,
          }),
          listOrdering
        )
      } catch {
        const withPeriod = withPeriodFilters(resolved, {
          year: invoiceYear,
          month: invoiceMonth,
          showAllMonths,
        })
        return withListOrdering(
          applyInvoiceListFilters(withPeriod, {
            searchTerm: appliedSearch,
            statusFilter,
            bookingTypeFilter,
          }),
          listOrdering
        )
      }
    },
    [
      baseUrl,
      invoiceYear,
      invoiceMonth,
      showAllMonths,
      pageSize,
      appliedSearch,
      statusFilter,
      bookingTypeFilter,
      listOrdering,
    ]
  )

  const applySearch = useCallback(() => {
    setAppliedSearch(searchInput.trim())
  }, [searchInput])

  const clearSearch = useCallback(() => {
    setSearchInput('')
    setAppliedSearch('')
  }, [])

  const fetchInvoices = async (requestUrl, isPageNav = false) => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setError('Authorization token missing. Please log in again.')
      setInvoices([])
      return
    }

    if (isPageNav) {
      setIsLoadingMore(true)
    } else {
      setIsLoading(true)
      setError('')
    }

    try {
      const response = await axios.get(requestUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = response.data || {}
      const groups = Array.isArray(data.results) ? data.results : []
      const rows = flattenBookingInvoiceResults(groups)
      setInvoices(rows)
      syncColumnsFromRecords(rows, setColumnOrder, setColumnVisibility)
      const total = Number(data.count ?? 0) || 0
      totalCountRef.current = total
      setPagination({
        next: data.next ?? null,
        previous: data.previous ?? null,
        currentPage: data.current_page ?? 1,
        totalPages: data.total_pages ?? 1,
        count: total,
      })
    } catch (err) {
      console.error('Invoices load error:', err)
      setError(formatApiError(err))
      setInvoices([])
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }

  useEffect(() => {
    if (!baseUrl) {
      setError('Missing VITE_BASEURL_CARE in .env')
      return
    }
    const requestUrl = buildInvoicesRequestUrl()
    if (requestUrl) fetchInvoices(requestUrl)
  }, [baseUrl, invoiceYear, invoiceMonth, showAllMonths, pageSize, appliedSearch, statusFilter, bookingTypeFilter, listOrdering, buildInvoicesRequestUrl])

  useEffect(() => {
    if (!showColumnChooser) return
    const onDocClick = (event) => {
      if (chooserRef.current && !chooserRef.current.contains(event.target)) {
        setShowColumnChooser(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showColumnChooser])

  useEffect(() => {
    if (!showStatusFilterMenu) return
    const onDocClick = (event) => {
      if (statusFilterRef.current && !statusFilterRef.current.contains(event.target)) {
        setShowStatusFilterMenu(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showStatusFilterMenu])

  useEffect(() => {
    if (!showAmountOrderingMenu) return
    const onDocClick = (event) => {
      if (amountOrderingRef.current && !amountOrderingRef.current.contains(event.target)) {
        setShowAmountOrderingMenu(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showAmountOrderingMenu])

  useEffect(() => {
    if (!showPatientNameOrderingMenu) return
    const onDocClick = (event) => {
      if (patientNameOrderingRef.current && !patientNameOrderingRef.current.contains(event.target)) {
        setShowPatientNameOrderingMenu(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showPatientNameOrderingMenu])

  const visibleColumns = useMemo(() => {
    const fromOrder = columnOrder.filter((id) => columnVisibility[id] !== false)
    if (fromOrder.length > 0) return fromOrder
    return buildInitialColumnOrder(collectKeysFromRecords(invoices))
  }, [columnOrder, columnVisibility, invoices])

  const exportColumnIds = useMemo(() => {
    if (visibleColumns.length > 0) return visibleColumns
    return columnOrder
  }, [visibleColumns, columnOrder])

  const hasHiddenColumns = useMemo(
    () => columnOrder.some((id) => columnVisibility[id] === false),
    [columnOrder, columnVisibility]
  )

  const periodLabel = useMemo(() => {
    if (showAllMonths) return `All months · ${invoiceYear}`
    const monthLabel = MONTH_OPTIONS.find((m) => m.value === invoiceMonth)?.label || invoiceMonth
    return `${monthLabel} ${invoiceYear}`
  }, [invoiceMonth, invoiceYear, showAllMonths])

  const statusFilterLabel = useMemo(
    () => STATUS_FILTER_OPTIONS.find((option) => option.value === statusFilter)?.label || 'All',
    [statusFilter]
  )

  const amountOrderingLabel = useMemo(
    () =>
      AMOUNT_ORDERING_OPTIONS.find((option) => option.value === listOrdering)?.label ||
      'Amount',
    [listOrdering]
  )

  const patientNameOrderingLabel = useMemo(
    () =>
      PATIENT_NAME_ORDERING_OPTIONS.find((option) => option.value === listOrdering)?.label ||
      'Patient name',
    [listOrdering]
  )

  const bookingTypeFilterLabel = useMemo(
    () =>
      LOCATION_TYPE_FILTER_OPTIONS.find((option) => option.value === bookingTypeFilter)?.label ||
      'All',
    [bookingTypeFilter]
  )

  const showTotalCountOption = pagination.count > 0 && pagination.count > PAGE_SIZE_PRESETS[PAGE_SIZE_PRESETS.length - 1]

  const handleInvoiceNumberClick = useCallback(
    async (invoice) => {
      const invoiceId = invoice?.id
      if (!invoiceId) {
        setError('Invoice id is missing for this row.')
        return
      }
      const token = localStorage.getItem('access_token')
      if (!token) {
        setError('Authorization token missing. Please log in again.')
        return
      }
      if (!baseUrl) {
        setError('Missing VITE_BASEURL_CARE in .env')
        return
      }

      setGeneratingPdfInvoiceId(invoiceId)
      setError('')
      try {
        const response = await axios.get(`${baseUrl}/booking/invoices/${invoiceId}/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const opened = openInvoiceDetailPdf(response.data)
        if (!opened) {
          setError('Unable to open print window. Please allow popups for this site.')
        }
      } catch (err) {
        console.error('Invoice detail PDF error:', err)
        setError(formatApiError(err))
      } finally {
        setGeneratingPdfInvoiceId(null)
      }
    },
    [baseUrl]
  )

  const exportPdf = () => {
    if (!exportColumnIds.length) {
      setError('Please keep at least one visible column before exporting.')
      return
    }
    if (!invoices.length) {
      setError('No invoices to export on this page.')
      return
    }
    setError('')
    const printWindow = window.open('', '_blank', 'width=1100,height=800')
    if (!printWindow) {
      setError('Unable to open print window. Please allow popups.')
      return
    }

    const headers = exportColumnIds
      .map((id) => `<th>${escapeHtml(formatColumnLabel(id))}</th>`)
      .join('')
    const rows = invoices
      .map((invoice) => {
        const cells = exportColumnIds
          .map((id) => `<td>${escapeHtml(exportCellText(invoice, id))}</td>`)
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')
    const columnNote = hasHiddenColumns
      ? `${exportColumnIds.length} selected column(s)`
      : 'All columns'

    printWindow.document.write(`
      <html>
        <head>
          <title>Invoices</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1e293b; }
            h2 { margin: 0 0 8px; }
            p { margin: 0 0 16px; color: #475569; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f1f5f9; font-weight: 700; }
          </style>
        </head>
        <body>
          <h2>Invoices — ${escapeHtml(periodLabel)}</h2>
          <p>Rows on this page: ${invoices.length}${pagination.count ? ` of ${pagination.count} total` : ''} · ${columnNote}</p>
          <table>
            <thead><tr>${headers}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  const exportExcel = () => {
    if (!exportColumnIds.length) {
      setError('Please keep at least one visible column before exporting.')
      return
    }
    if (!invoices.length) {
      setError('No invoices to export on this page.')
      return
    }
    setError('')
    try {
      const headerRow = exportColumnIds.map((id) => formatColumnLabel(id))
      const dataRows = invoices.map((invoice) =>
        exportColumnIds.map((id) => exportCellText(invoice, id))
      )
      const sheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, sheet, 'Invoices')
      const stamp = new Date().toISOString().slice(0, 10)
      const periodSlug = showAllMonths ? `${invoiceYear}-all` : `${invoiceYear}-m${invoiceMonth}`
      const statusSlug = statusFilter ? `-${statusFilter.toLowerCase()}` : ''
      const bookingTypeSlug = bookingTypeFilter ? `-${bookingTypeFilter.toLowerCase()}` : ''
      XLSX.writeFile(
        workbook,
        `invoices-${periodSlug}${statusSlug}${bookingTypeSlug}-p${pagination.currentPage}-${stamp}.xlsx`
      )
    } catch (e) {
      setError(e?.message || 'Unable to export Excel file.')
    }
  }

  return (
    <div className="space-y-1.5 min-w-0 p-1 sm:p-2">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 rounded border border-gray-200 bg-white p-1.5">
        <div className="relative min-w-0 flex-1 md:min-w-[14rem]">
          <FiSearch className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch()
            }}
            placeholder="Search invoices (invoice number, patient, customer)"
            className="w-full rounded border border-gray-300 bg-white py-1.5 pl-8 pr-2 text-xs text-gray-900 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
        </div>
        <button
          type="button"
          onClick={applySearch}
          className="rounded border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
        >
          Search
        </button>
        <button
          type="button"
          onClick={clearSearch}
          disabled={!searchInput && !appliedSearch}
          className="rounded border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>
        {appliedSearch ? (
          <span className="text-[10px] text-gray-500">
            Filtering: <span className="font-medium text-gray-700">{appliedSearch}</span>
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-1.5">
        <label className="flex items-center gap-1 text-[11px] text-gray-600">
          Month
          <select
            value={showAllMonths ? 'all' : String(invoiceMonth)}
            onChange={(e) => {
              const value = e.target.value
              if (value === 'all') {
                setShowAllMonths(true)
              } else {
                setShowAllMonths(false)
                setInvoiceMonth(Number(value))
              }
            }}
            className={`rounded border bg-white px-2 py-1 text-xs text-gray-900 ${
              showAllMonths ? 'border-indigo-400 font-medium text-indigo-800' : 'border-gray-300'
            }`}
          >
            <option value="all">All months</option>
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={String(m.value)}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[11px] text-gray-600">
          Year
          <select
            value={invoiceYear}
            onChange={(e) => setInvoiceYear(Number(e.target.value))}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[11px] text-gray-600">
          Rows
          <select
            value={String(pageSize)}
            onChange={(e) => setPageSize(Number(e.target.value) || 20)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
          >
            {PAGE_SIZE_PRESETS.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
            {showTotalCountOption ? (
              <option value={String(pagination.count)}>All ({pagination.count})</option>
            ) : null}
          </select>
        </label>
        <div className="relative" ref={chooserRef}>
          <button
            type="button"
            onClick={() => setShowColumnChooser((prev) => !prev)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Column Chooser
          </button>
          {showColumnChooser ? (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
              <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Columns</p>
              <div className="space-y-1">
                {columnOrder.map((colId) => (
                  <label
                    key={colId}
                    className="flex items-center gap-2 rounded px-1 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={columnVisibility[colId] !== false}
                      onChange={() =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          [colId]: !(prev[colId] !== false),
                        }))
                      }
                    />
                    <span>{formatColumnLabel(colId)}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={exportPdf}
            disabled={isLoading || invoices.length === 0}
            className="rounded border border-indigo-600 bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={isLoading || invoices.length === 0}
            className="rounded border border-emerald-700 bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => {
              const requestUrl = buildInvoicesRequestUrl()
              if (requestUrl) fetchInvoices(requestUrl)
            }}
            disabled={isLoading}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FiRefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        <div className="rounded border border-slate-200 bg-white p-1.5">
          <p className="text-[9px] font-semibold uppercase text-slate-500">Period</p>
          <p className="text-xs font-bold text-slate-900">{periodLabel}</p>
        </div>
        <div className="rounded border border-slate-200 bg-white p-1.5">
          <p className="text-[9px] font-semibold uppercase text-slate-500">Customer groups</p>
          <p className="text-xs font-bold text-slate-900">{pagination.count}</p>
        </div>
        <div className="rounded border border-slate-200 bg-white p-1.5">
          <p className="text-[9px] font-semibold uppercase text-slate-500">Invoice rows (this page)</p>
          <p className="text-xs font-bold text-slate-900">{invoices.length}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded border border-gray-200 bg-white px-4 py-8 text-center text-xs text-gray-600">
          Loading invoices for {periodLabel}...
        </div>
      ) : error ? (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
      ) : invoices.length === 0 ? (
        <div className="rounded border border-gray-200 bg-white px-4 py-6 text-center text-xs text-gray-500">
          <p>
            No invoices found for {periodLabel}
            {statusFilter ? ` with status ${statusFilterLabel}` : ''}
            {bookingTypeFilter ? ` · location type ${bookingTypeFilterLabel}` : ''}
            {appliedSearch ? ` matching "${appliedSearch}"` : ''}.
          </p>
          {appliedSearch || statusFilter || bookingTypeFilter ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {appliedSearch ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="rounded border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-100"
                >
                  Clear search
                </button>
              ) : null}
              {statusFilter ? (
                <button
                  type="button"
                  onClick={() => setStatusFilter('')}
                  className="rounded border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-100"
                >
                  Clear status filter
                </button>
              ) : null}
              {bookingTypeFilter ? (
                <button
                  type="button"
                  onClick={() => setBookingTypeFilter('')}
                  className="rounded border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-100"
                >
                  Clear location type filter
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full min-w-max border-collapse text-[11px] text-slate-700">
              <thead className="bg-slate-100">
                <tr>
                  {visibleColumns.map((colId) => (
                    <th
                      key={colId}
                      draggable
                      onDragStart={(e) => {
                        setDragColId(colId)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => setDragColId(null)}
                      onDragOver={(e) => {
                        if (!dragColId || dragColId === colId) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        setColumnOrder((prev) => reorderColumns(prev, dragColId, colId))
                        setDragColId(null)
                      }}
                      className={`${CELL_PAD} min-w-0 align-top text-left font-semibold whitespace-nowrap`}
                    >
                      <span className="flex min-w-0 items-start gap-1">
                        <span className="mt-0.5 shrink-0 text-slate-400 leading-none">⋮</span>
                        <span className="min-w-0 flex-1">{formatColumnLabel(colId)}</span>
                        {colId === 'patient_name' ? (
                          <span className="relative shrink-0" ref={patientNameOrderingRef}>
                            <button
                              type="button"
                              draggable={false}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowPatientNameOrderingMenu((prev) => !prev)
                                setShowAmountOrderingMenu(false)
                                setShowStatusFilterMenu(false)
                              }}
                              className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none transition-colors hover:bg-indigo-100 ${
                                isPatientNameOrdering(listOrdering) ? 'text-indigo-600' : 'text-gray-400'
                              }`}
                              title={
                                isPatientNameOrdering(listOrdering)
                                  ? `Sort patient name: ${patientNameOrderingLabel}`
                                  : 'Sort patient name'
                              }
                              aria-label="Sort patient name"
                              aria-expanded={showPatientNameOrderingMenu}
                            >
                              ▼
                            </button>
                            {showPatientNameOrderingMenu ? (
                              <div
                                className="absolute right-0 top-full z-20 mt-1 min-w-[7.5rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                {PATIENT_NAME_ORDERING_OPTIONS.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                      setListOrdering(option.value)
                                      setShowPatientNameOrderingMenu(false)
                                    }}
                                    className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-gray-50 ${
                                      listOrdering === option.value
                                        ? 'font-semibold text-indigo-700'
                                        : 'text-gray-700'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                                <div className="my-1 border-t border-gray-100" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isPatientNameOrdering(listOrdering)) {
                                      setListOrdering('-total_invoice_amount')
                                    }
                                    setShowPatientNameOrderingMenu(false)
                                  }}
                                  disabled={!isPatientNameOrdering(listOrdering)}
                                  className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-gray-50 ${
                                    isPatientNameOrdering(listOrdering)
                                      ? 'text-gray-700'
                                      : 'cursor-not-allowed text-gray-400'
                                  }`}
                                >
                                  Clear
                                </button>
                              </div>
                            ) : null}
                          </span>
                        ) : null}
                        {colId === 'total_amount' ? (
                          <span className="relative shrink-0" ref={amountOrderingRef}>
                            <button
                              type="button"
                              draggable={false}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowAmountOrderingMenu((prev) => !prev)
                                setShowPatientNameOrderingMenu(false)
                                setShowStatusFilterMenu(false)
                              }}
                              className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none transition-colors hover:bg-indigo-100 ${
                                isAmountOrdering(listOrdering) ? 'text-indigo-600' : 'text-gray-400'
                              }`}
                              title={
                                isAmountOrdering(listOrdering)
                                  ? `Sort amount: ${amountOrderingLabel}`
                                  : 'Sort by amount'
                              }
                              aria-label="Sort by amount"
                              aria-expanded={showAmountOrderingMenu}
                            >
                              ▼
                            </button>
                            {showAmountOrderingMenu ? (
                              <div
                                className="absolute right-0 top-full z-20 mt-1 min-w-[8.5rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                {AMOUNT_ORDERING_OPTIONS.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                      setListOrdering(option.value)
                                      setShowAmountOrderingMenu(false)
                                    }}
                                    className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-gray-50 ${
                                      listOrdering === option.value
                                        ? 'font-semibold text-indigo-700'
                                        : 'text-gray-700'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </span>
                        ) : null}
                        {colId === 'status' ? (
                          <span className="relative shrink-0" ref={statusFilterRef}>
                            <button
                              type="button"
                              draggable={false}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowStatusFilterMenu((prev) => !prev)
                                setShowAmountOrderingMenu(false)
                                setShowPatientNameOrderingMenu(false)
                              }}
                              className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none transition-colors hover:bg-indigo-100 ${
                                statusFilter ? 'text-indigo-600' : 'text-gray-400'
                              }`}
                              title={`Filter by status${statusFilter ? `: ${statusFilterLabel}` : ''}`}
                              aria-label="Filter by status"
                              aria-expanded={showStatusFilterMenu}
                            >
                              ▼
                            </button>
                            {showStatusFilterMenu ? (
                              <div
                                className="absolute right-0 top-full z-20 mt-1 min-w-[8.5rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                {STATUS_FILTER_OPTIONS.map((option) => (
                                  <button
                                    key={option.value || 'all'}
                                    type="button"
                                    onClick={() => {
                                      setStatusFilter(option.value)
                                      setShowStatusFilterMenu(false)
                                    }}
                                    className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-gray-50 ${
                                      statusFilter === option.value
                                        ? 'font-semibold text-indigo-700'
                                        : 'text-gray-700'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </span>
                        ) : null}
                        {colId === 'booking_location_type' ? (
                          <span
                            className="ml-0.5 inline-flex flex-col items-center justify-center gap-0"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              draggable={false}
                              onClick={(e) => {
                                e.stopPropagation()
                                setBookingTypeFilter((prev) => cycleLocationTypeFilter(prev, -1))
                              }}
                              className={`rounded p-0 leading-none transition-colors hover:bg-indigo-100 ${
                                bookingTypeFilter ? 'text-indigo-600' : 'text-gray-400'
                              }`}
                              title={`Location type filter: ${bookingTypeFilterLabel} (previous)`}
                              aria-label="Previous location type filter"
                            >
                              <FiChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              draggable={false}
                              onClick={(e) => {
                                e.stopPropagation()
                                setBookingTypeFilter((prev) => cycleLocationTypeFilter(prev, 1))
                              }}
                              className={`-mt-0.5 rounded p-0 leading-none transition-colors hover:bg-indigo-100 ${
                                bookingTypeFilter ? 'text-indigo-600' : 'text-gray-400'
                              }`}
                              title={`Location type filter: ${bookingTypeFilterLabel} (next)`}
                              aria-label="Next location type filter"
                            >
                              <FiChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ) : null}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice, index) => (
                  <tr
                    key={invoice.id ?? invoice.invoice_number ?? index}
                    className={`border-t border-slate-100 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                  >
                    {visibleColumns.map((colId) => (
                      <td key={colId} className={`${CELL_PAD} min-w-0 align-top`}>
                        {renderTableCellContent(invoice, colId, {
                          onInvoiceNumberClick: handleInvoiceNumberClick,
                          generatingPdfInvoiceId,
                        })}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-slate-700">
            <p>
              Page <span className="font-semibold">{pagination.currentPage}</span> of{' '}
              <span className="font-semibold">{pagination.totalPages}</span>
              {pagination.count ? (
                <span className="text-slate-500"> ({pagination.count} total)</span>
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!pagination.previous || isLoading || isLoadingMore}
                onClick={() => {
                  const requestUrl = buildInvoicesRequestUrl(pagination.previous)
                  if (requestUrl) fetchInvoices(requestUrl, true)
                }}
                className="rounded border border-slate-300 bg-white px-2 py-1 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!pagination.next || isLoading || isLoadingMore}
                onClick={() => {
                  const requestUrl = buildInvoicesRequestUrl(pagination.next)
                  if (requestUrl) fetchInvoices(requestUrl, true)
                }}
                className="rounded border border-slate-300 bg-white px-2 py-1 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
              {isLoadingMore ? <span className="text-slate-500">Loading...</span> : null}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Invoices
