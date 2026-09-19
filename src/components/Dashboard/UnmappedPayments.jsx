import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { createPortal } from 'react-dom'
import { FiChevronDown, FiChevronUp } from 'react-icons/fi'
import { hasOwnerPrivileges } from '../../utils/authRoles'

const toNumber = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Shorter for dense tables (less horizontal scroll). */
const formatDateTimeCompact = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatAmountPlain = (amount) => {
  const n = toNumber(amount)
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatDateOnlyCompact = (value) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Linked invoice on the payment record (null / empty until mapped). */
const getApiInvoiceLabel = (p) => {
  if (p?.invoice && typeof p.invoice === 'object') {
    const invObj =
      p.invoice.invoice_number ??
      p.invoice.reference ??
      p.invoice.id ??
      p.invoice.invoice_id
    if (invObj != null && String(invObj).trim() !== '') return String(invObj).trim()
  }
  const v =
    p.mapped_invoice_label ??
    p.invoice_label ??
    p.invoice_number ??
    p.invoice_id ??
    p.invoice ??
    p.source_invoice ??
    p.booking_invoice_id
  if (v == null || String(v).trim() === '') return null
  return String(v).trim()
}

/** Linked patient on the payment record (null / empty until mapped — not raw payer info). */
const getApiPatientLabel = (p) => {
  if (p?.patient && typeof p.patient === 'object') {
    const patObj =
      p.patient.full_name ??
      p.patient.name ??
      p.patient.patient_name ??
      p.patient.first_name
    if (patObj != null && String(patObj).trim() !== '') return String(patObj).trim()
  }
  const v =
    p.mapped_patient_label ??
    p.mapped_patient_name ??
    p.mapped_patient ??
    p.patient_label ??
    p.api_patient
  if (v == null || String(v).trim() === '') return null
  return String(v).trim()
}

const baseUrl = () => String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')

const mappingSelectClass =
  'w-full min-w-0 max-w-full rounded border border-slate-300 bg-white px-1 py-[2px] text-[11px] text-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none'

const amountDeductInputClass =
  'w-full min-w-0 rounded border border-slate-300 bg-white px-1 py-[2px] text-[11px] text-slate-800 tabular-nums text-right focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none'

const SearchableSelect = ({
  value,
  selectedLabel = '',
  options,
  placeholder,
  onChange,
  onSearch,
  fetchOnFocus = true,
  isLoading = false,
  disabled = false,
  minMenuWidth = 360,
  inputId,
}) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)
  const menuRef = useRef(null)
  const onSearchRef = useRef(onSearch)
  const lastRequestedQueryRef = useRef(null)
  const skipNextOpenFetchRef = useRef(false)
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0, width: 0, maxHeight: 220 })

  const selected = useMemo(
    () => options.find((opt) => String(opt.id) === String(value)),
    [options, value]
  )

  useEffect(() => {
    if (!open) return
    const updateMenuPosition = () => {
      const rect = wrapRef.current?.getBoundingClientRect()
      if (!rect) return
      const viewportW = window.innerWidth || 1280
      const viewportH = window.innerHeight || 800
      const spaceBelow = viewportH - rect.bottom - 8
      const spaceAbove = rect.top - 8
      const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow
      const maxHeight = Math.max(120, Math.min(260, openUpward ? spaceAbove : spaceBelow))
      const desiredWidth = Math.max(rect.width, minMenuWidth)
      const width = Math.min(desiredWidth, Math.max(180, viewportW - 16))
      const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportW - width - 8))
      setMenuStyle({
        top: openUpward ? Math.max(8, rect.top - maxHeight - 4) : rect.bottom + 4,
        left,
        width,
        maxHeight,
      })
    }
    updateMenuPosition()
    const onDown = (e) => {
      const insideInput = wrapRef.current && wrapRef.current.contains(e.target)
      const insideMenu = menuRef.current && menuRef.current.contains(e.target)
      if (!insideInput && !insideMenu) {
        setOpen(false)
        setQuery('')
      }
    }
    const onReposition = () => updateMenuPosition()
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, minMenuWidth])

  useEffect(() => {
    onSearchRef.current = onSearch
  }, [onSearch])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      const trimmed = query.trim()
      if (lastRequestedQueryRef.current === trimmed) return
      lastRequestedQueryRef.current = trimmed
      onSearchRef.current?.(trimmed)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [open, query])

  return (
    <div className="relative" ref={wrapRef}>
      <input
        id={inputId}
        type="text"
        value={open ? query : selected?.label || selectedLabel || ''}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setOpen(true)
          setQuery('')
          if (skipNextOpenFetchRef.current) {
            // User just selected an option; keep dropdown stable without refetching immediately.
            lastRequestedQueryRef.current = ''
            skipNextOpenFetchRef.current = false
          } else {
            if (fetchOnFocus) {
              lastRequestedQueryRef.current = null
              onSearchRef.current?.('')
            } else {
              // Keep current options; do not auto-call API on focus.
              lastRequestedQueryRef.current = ''
            }
          }
        }}
        onChange={(e) => {
          if (!open) setOpen(true)
          setQuery(e.target.value)
        }}
        className={`${mappingSelectClass} ${disabled ? 'bg-slate-100 text-slate-500' : ''}`}
      />
      {open && !disabled &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: menuStyle.top,
              left: menuStyle.left,
              width: menuStyle.width,
              zIndex: 9999,
            }}
            className="overflow-auto rounded border border-slate-200 bg-white shadow-lg"
          >
          <div style={{ maxHeight: menuStyle.maxHeight }} className="overflow-auto">
          {isLoading ? (
            <div className="px-2 py-1.5 text-[11px] text-slate-500">Searching...</div>
          ) : options.length === 0 ? (
            <div className="px-2 py-1.5 text-[11px] text-slate-500">No results</div>
          ) : (
            options.map((opt) => (
              <button
                key={String(opt.id)}
                type="button"
                onClick={() => {
                  onChange(String(opt.id), opt)
                  skipNextOpenFetchRef.current = true
                  setOpen(false)
                  setQuery('')
                }}
                className="block w-full px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-50 whitespace-normal wrap-break-words leading-snug"
                title={opt.label}
              >
                {opt.label}
              </button>
            ))
          )}
          </div>
          </div>,
          document.body
        )}
    </div>
  )
}

const LS_COLUMN_ORDER = 'unmappedPayments_columnOrder'
const LS_COLUMN_VISIBILITY = 'unmappedPayments_columnVisibility'

const MONTH_OPTIONS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

const YEAR_RANGE = 6

const PAGE_SIZE_OPTIONS = [40, 60, 80, 100]
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0]

const buildUnmappedPaymentsQueryParams = (pageSize, monthFilter, yearFilter, searchTerm = '') => {
  const params = { page_size: pageSize }
  if (monthFilter) params.paid_date__month = monthFilter
  if (yearFilter) params.paid_date__year = yearFilter
  const trimmedSearch = String(searchTerm || '').trim()
  if (trimmedSearch) params.search = trimmedSearch
  return params
}

/** Data columns can be hidden/reordered; mapping + selection columns stay available. */
const TABLE_COLUMNS = [
  { id: 'amount', label: 'Paid Amount', thClass: 'w-[64px]', locked: false },
  { id: 'amountToDeduct', label: 'Amount to Deduct', thClass: 'w-[88px]', locked: false },
  { id: 'method', label: 'Method', thClass: 'w-[52px]', locked: false },
  { id: 'reference', label: 'Reference', thClass: 'w-[88px]', locked: false },
  { id: 'paidDate', label: 'Payment Date', thClass: 'min-w-[7.75rem]', locked: false },
  { id: 'mapPatient', label: 'Map patient', thClass: 'w-[170px]', locked: true },
  { id: 'mapInvoice', label: 'Map invoice', thClass: 'w-[170px]', locked: true },
  { id: 'select', label: 'Select', thClass: 'w-[56px]', locked: true },
]

const DEFAULT_COLUMN_ORDER = TABLE_COLUMNS.map((c) => c.id)

const defaultColumnVisibility = () =>
  TABLE_COLUMNS.reduce((acc, col) => {
    acc[col.id] = true
    return acc
  }, {})

const reorderColumns = (order, sourceId, targetId) => {
  if (!sourceId || !targetId || sourceId === targetId) return order
  const si = order.indexOf(sourceId)
  const ti = order.indexOf(targetId)
  if (si < 0 || ti < 0) return order
  const next = [...order]
  const [moved] = next.splice(si, 1)
  next.splice(ti, 0, moved)
  return next
}

const mergeSavedColumnOrder = () => {
  try {
    const raw = localStorage.getItem(LS_COLUMN_ORDER)
    if (!raw) return [...DEFAULT_COLUMN_ORDER]
    const saved = JSON.parse(raw)
    if (!Array.isArray(saved)) return [...DEFAULT_COLUMN_ORDER]
    const merged = [...saved]
    DEFAULT_COLUMN_ORDER.forEach((id) => {
      if (!merged.includes(id)) merged.push(id)
    })
    const filtered = merged.filter((id) => TABLE_COLUMNS.some((c) => c.id === id))
    const invoiceIdx = filtered.indexOf('mapInvoice')
    const patientIdx = filtered.indexOf('mapPatient')
    if (invoiceIdx >= 0 && patientIdx >= 0 && invoiceIdx < patientIdx) {
      filtered.splice(invoiceIdx, 1)
      const nextPatientIdx = filtered.indexOf('mapPatient')
      filtered.splice(nextPatientIdx + 1, 0, 'mapInvoice')
    }
    const withoutSelect = filtered.filter((id) => id !== 'select')
    return [...withoutSelect, 'select']
  } catch {
    return [...DEFAULT_COLUMN_ORDER]
  }
}

const mergeSavedVisibility = () => {
  try {
    const raw = localStorage.getItem(LS_COLUMN_VISIBILITY)
    if (!raw) return defaultColumnVisibility()
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return defaultColumnVisibility()
    return { ...defaultColumnVisibility(), ...parsed }
  } catch {
    return defaultColumnVisibility()
  }
}

const UnmappedPayments = () => {
  const [authUser, setAuthUser] = useState(null)
  const [isLoadingPayments, setIsLoadingPayments] = useState(false)
  const [isBulkLinking, setIsBulkLinking] = useState(false)
  const [selectedPaymentIds, setSelectedPaymentIds] = useState(() => new Set())
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('')
  const [payments, setPayments] = useState([])
  const [paymentsPagination, setPaymentsPagination] = useState({
    count: 0,
    total_pages: 1,
    current_page: 1,
    next: null,
    previous: null,
  })
  const [patients, setPatients] = useState([])
  const patientSearchRequestSeqRef = useRef(0)
  const latestPatientQueryRef = useRef('')
  /** Abort previous patient dropdown XHR when focus/search changes so only the latest query runs. */
  const patientDropdownAbortRef = useRef(null)
  const [invoiceOptionsByPayment, setInvoiceOptionsByPayment] = useState({})
  const [isPatientDropdownLoading, setIsPatientDropdownLoading] = useState(false)
  const [invoiceLoadingPaymentId, setInvoiceLoadingPaymentId] = useState(null)
  const [selectedPatientByPayment, setSelectedPatientByPayment] = useState({})
  const [selectedPatientLabelByPayment, setSelectedPatientLabelByPayment] = useState({})
  const [selectedInvoiceByPayment, setSelectedInvoiceByPayment] = useState({})
  const [selectedInvoiceLabelByPayment, setSelectedInvoiceLabelByPayment] = useState({})
  /** Per-payment amount to deduct (user input; sent as `amount` on bulk-map-payments). */
  const [amountToDeductByPayment, setAmountToDeductByPayment] = useState({})
  const selectedInvoiceByPaymentRef = useRef(selectedInvoiceByPayment)
  selectedInvoiceByPaymentRef.current = selectedInvoiceByPayment
  const [sortPaidDateDesc, setSortPaidDateDesc] = useState(true)
  const [monthFilter, setMonthFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [columnOrder, setColumnOrder] = useState(mergeSavedColumnOrder)
  const [columnVisibility, setColumnVisibility] = useState(mergeSavedVisibility)
  const [showColumnChooser, setShowColumnChooser] = useState(false)
  const [dragColId, setDragColId] = useState(null)
  const columnChooserRef = useRef(null)

  const isVsreOwner = useMemo(() => hasOwnerPrivileges(authUser), [authUser])

  useEffect(() => {
    const syncAuth = () => {
      try {
        const raw = localStorage.getItem('authUser')
        setAuthUser(raw ? JSON.parse(raw) : null)
      } catch {
        setAuthUser(null)
      }
    }
    syncAuth()
    window.addEventListener('auth-changed', syncAuth)
    window.addEventListener('storage', syncAuth)
    return () => {
      window.removeEventListener('auth-changed', syncAuth)
      window.removeEventListener('storage', syncAuth)
    }
  }, [])

  useEffect(() => {
    if (!success) return undefined
    const timer = window.setTimeout(() => setSuccess(''), 5000)
    return () => window.clearTimeout(timer)
  }, [success])

  const loadPatientDropdown = useCallback(async (search = '') => {
    const accessToken = localStorage.getItem('access_token')
    if (!accessToken) return
    patientDropdownAbortRef.current?.abort()
    const controller = new AbortController()
    patientDropdownAbortRef.current = controller

    const trimmedSearch = String(search || '').trim()
    latestPatientQueryRef.current = trimmedSearch
    const requestSeq = patientSearchRequestSeqRef.current + 1
    patientSearchRequestSeqRef.current = requestSeq
    setIsPatientDropdownLoading(true)
    try {
      const response = await axios.get(`${baseUrl()}/booking/patients/patient_dropdown/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: trimmedSearch ? { search: trimmedSearch } : undefined,
        signal: controller.signal,
      })
      // Ignore stale responses when user has already typed a newer query.
      if (requestSeq !== patientSearchRequestSeqRef.current) return
      const raw = Array.isArray(response.data) ? response.data : []
      const mapped = raw.map((pat, idx) => {
        const pid = pat.id ?? pat.patient_id ?? `p_${idx}`
        const name = pat.name || pat.full_name || pat.patient_name || `Patient #${pid}`
        const uid = pat.user_id || pat.customer_id
        return {
          id: pid,
          label: uid ? `${name} (Customer ID: ${uid})` : name,
        }
      })
      const normalizedQuery = trimmedSearch.toLowerCase()
      const filtered = normalizedQuery
        ? mapped.filter((opt) => {
            const label = String(opt.label || '').toLowerCase()
            const idText = String(opt.id || '').toLowerCase()
            return label.includes(normalizedQuery) || idText.includes(normalizedQuery)
          })
        : mapped
      // Keep list aligned with the latest value in the input.
      if (latestPatientQueryRef.current !== trimmedSearch) return
      setPatients(filtered)
    } catch (e) {
      if (axios.isCancel(e) || e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
      if (requestSeq === patientSearchRequestSeqRef.current) setPatients([])
    } finally {
      if (patientDropdownAbortRef.current === controller) {
        patientDropdownAbortRef.current = null
        setIsPatientDropdownLoading(false)
      }
    }
  }, [])

  const loadInvoiceDropdownForPayment = useCallback(async (paymentId, search = '', patientId = '') => {
    const accessToken = localStorage.getItem('access_token')
    if (!accessToken) return
    const paymentKey = String(paymentId)
    setInvoiceLoadingPaymentId(paymentKey)
    try {
      const params = {}
      const trimmedSearch = String(search || '').trim()
      const selectedPatientId = String(patientId || '').trim()
      if (trimmedSearch) params.search = trimmedSearch
      if (selectedPatientId) params.patient = selectedPatientId
      const response = await axios.get(`${baseUrl()}/booking/invoices/dropdown/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: Object.keys(params).length ? params : undefined,
      })
      const raw = Array.isArray(response.data) ? response.data : []
      const mapped = raw.map((inv, idx) => {
        const invoiceId = inv.id ?? inv.invoice_id ?? `inv_${idx}`
        const invoiceNo = inv.invoice_number || `Invoice #${invoiceId}`
        const patientName = inv.patient_name ? ` - ${inv.patient_name}` : ''
        const start = formatDateOnlyCompact(inv.period_start)
        const end = formatDateOnlyCompact(inv.period_end)
        const period = start && end ? ` (${start} to ${end})` : ''
        const hasTotalAmount = inv.total_amount != null && inv.total_amount !== ''
        const totalAmount = hasTotalAmount ? ` | Total: ₹${formatAmountPlain(inv.total_amount)}` : ''
        return {
          id: invoiceId,
          label: `${invoiceNo}${patientName}${period}${totalAmount}`,
        }
      })
      const selectedInvoiceId = selectedInvoiceByPaymentRef.current[paymentKey]
      setInvoiceOptionsByPayment((prev) => {
        const previousOptions = prev[paymentKey] || []
        const selectedOption =
          previousOptions.find((opt) => String(opt.id) === String(selectedInvoiceId)) ||
          mapped.find((opt) => String(opt.id) === String(selectedInvoiceId))
        const nextOptions =
          selectedInvoiceId && !mapped.some((opt) => String(opt.id) === String(selectedInvoiceId))
            ? [
                selectedOption || {
                  id: selectedInvoiceId,
                  label: `Invoice #${selectedInvoiceId}`,
                },
                ...mapped,
              ]
            : mapped
        return { ...prev, [paymentKey]: nextOptions }
      })
    } catch {
      setInvoiceOptionsByPayment((prev) => ({ ...prev, [paymentKey]: [] }))
    } finally {
      setInvoiceLoadingPaymentId((current) => (current === paymentKey ? null : current))
    }
  }, [])

  const handlePatientSelection = useCallback(
    (paymentId, selectedId, selectedOption) => {
      const paymentKey = String(paymentId)
      setSelectedPatientByPayment((prev) => ({ ...prev, [paymentKey]: selectedId }))
      setSelectedPatientLabelByPayment((prev) => ({
        ...prev,
        [paymentKey]:
          selectedOption?.label ||
          patients.find((opt) => String(opt.id) === String(selectedId))?.label ||
          prev[paymentKey] ||
          '',
      }))
      // Reset stale invoice selection because invoice list now belongs to selected patient.
      setSelectedInvoiceByPayment((prev) => ({ ...prev, [paymentKey]: '' }))
      setSelectedInvoiceLabelByPayment((prev) => ({ ...prev, [paymentKey]: '' }))
      setInvoiceOptionsByPayment((prev) => ({ ...prev, [paymentKey]: [] }))
      loadInvoiceDropdownForPayment(paymentKey, '', selectedId)
      // Move user directly to invoice dropdown for the same row.
      window.requestAnimationFrame(() => {
        const isDesktop = window.matchMedia('(min-width: 1024px)').matches
        const targetId = isDesktop
          ? `invoice-select-desktop-${paymentId}`
          : `invoice-select-mobile-${paymentId}`
        const target = document.getElementById(targetId)
        if (target) target.focus()
      })
    },
    [loadInvoiceDropdownForPayment, patients]
  )

  const handleAmountToDeductChange = useCallback((paymentId, value) => {
    const key = String(paymentId)
    setAmountToDeductByPayment((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleInvoiceSelection = useCallback((paymentId, selectedId, selectedOption) => {
    const paymentKey = String(paymentId)
    setSelectedInvoiceByPayment((prev) => ({ ...prev, [paymentKey]: selectedId }))
    setSelectedInvoiceLabelByPayment((prev) => ({
      ...prev,
      [paymentKey]:
        selectedOption?.label ||
        invoiceOptionsByPayment[paymentKey]?.find((opt) => String(opt.id) === String(selectedId))?.label ||
        prev[paymentKey] ||
        '',
    }))
    setInvoiceOptionsByPayment((prev) => {
      const currentOptions = prev[paymentKey] || []
      if (!selectedId || currentOptions.some((opt) => String(opt.id) === String(selectedId))) {
        return prev
      }
      return {
        ...prev,
        [paymentKey]: [{ id: selectedId, label: `Invoice #${selectedId}` }, ...currentOptions],
      }
    })
  }, [invoiceOptionsByPayment])

  const mapUnmappedPaymentRow = useCallback((row, idx) => {
    return {
      id: row?.id ?? `ump_api_${idx}`,
      amount: row?.amount ?? 0,
      amountToDeduct: row?.amount_to_deduct ?? row?.amountToDeduct ?? null,
      method: row?.method ?? '—',
      reference: row?.reference ?? '',
      paidDate: row?.paid_date ?? row?.paidDate ?? null,
      createdAt: row?.created_at ?? row?.createdAt ?? row?.paid_date ?? null,
      verified: row?.is_verified ?? row?.verified ?? false,
      invoice: row?.invoice ?? null,
      patient: row?.patient ?? null,
    }
  }, [])

  const normalizePageUrl = useCallback((href) => {
    if (!href) return null
    const s = String(href)
    if (/^https?:\/\//i.test(s)) return s
    return `${baseUrl()}${s.startsWith('/') ? s : `/${s}`}`
  }, [])

  const loadUnmappedPayments = useCallback(async (requestUrl, params) => {
    const accessToken = localStorage.getItem('access_token')
    if (!accessToken) return
    setIsLoadingPayments(true)
    setError('')
    try {
      let url = requestUrl
        ? normalizePageUrl(requestUrl)
        : `${baseUrl()}/booking/payments/unmapped-payments/`
      const config = { headers: { Authorization: `Bearer ${accessToken}` } }
      const queryParams = params && typeof params === 'object' ? params : {}

      if (Object.keys(queryParams).length > 0) {
        try {
          const urlObj = new URL(url)
          Object.entries(queryParams).forEach(([key, value]) => {
            if (value != null && value !== '') urlObj.searchParams.set(key, String(value))
          })
          url = urlObj.toString()
        } catch {
          config.params = queryParams
        }
      }

      const response = await axios.get(url, config)
      const payload = response?.data || {}
      const list = Array.isArray(payload?.results) ? payload.results : []
      const mapped = list.map(mapUnmappedPaymentRow)
      setPayments(mapped)
      setAmountToDeductByPayment((prev) => {
        const next = { ...prev }
        mapped.forEach((p) => {
          const id = String(p.id)
          if (id in next) return
          const apiVal = p.amountToDeduct
          next[id] =
            apiVal != null && apiVal !== '' && Number.isFinite(Number(apiVal)) ? String(apiVal) : ''
        })
        return next
      })
      setPaymentsPagination({
        count: Number(payload?.count ?? list.length) || 0,
        total_pages: Number(payload?.total_pages ?? 1) || 1,
        current_page: Number(payload?.current_page ?? 1) || 1,
        next: payload?.next ?? null,
        previous: payload?.previous ?? null,
      })
    } catch (apiError) {
      const msg =
        apiError?.response?.data?.detail ||
        apiError?.response?.data?.message ||
        'Unable to load unmapped payments.'
      setError(msg)
      setPayments([])
    } finally {
      setIsLoadingPayments(false)
    }
  }, [mapUnmappedPaymentRow, normalizePageUrl])

  useEffect(() => {
    if (!isVsreOwner) return
    loadPatientDropdown()
    return () => {
      patientDropdownAbortRef.current?.abort()
    }
  }, [isVsreOwner, loadPatientDropdown])

  const listQueryParams = useMemo(
    () => buildUnmappedPaymentsQueryParams(pageSize, monthFilter, yearFilter, appliedSearchQuery),
    [pageSize, monthFilter, yearFilter, appliedSearchQuery]
  )

  const applySearch = useCallback(() => {
    setAppliedSearchQuery(searchInput.trim())
  }, [searchInput])

  const clearSearchAndReload = useCallback(() => {
    setSearchInput('')
    setAppliedSearchQuery('')
  }, [])

  const handleSearchInputChange = useCallback(
    (e) => {
      const value = e.target.value
      setSearchInput(value)
      if (!value.trim() && appliedSearchQuery.trim()) {
        clearSearchAndReload()
      }
    },
    [appliedSearchQuery, clearSearchAndReload]
  )

  useEffect(() => {
    if (!isVsreOwner) return
    loadUnmappedPayments(undefined, listQueryParams)
  }, [isVsreOwner, listQueryParams, loadUnmappedPayments])

  useEffect(() => {
    try {
      localStorage.setItem(LS_COLUMN_ORDER, JSON.stringify(columnOrder))
    } catch {
      /* ignore */
    }
  }, [columnOrder])

  useEffect(() => {
    try {
      localStorage.setItem(LS_COLUMN_VISIBILITY, JSON.stringify(columnVisibility))
    } catch {
      /* ignore */
    }
  }, [columnVisibility])

  useEffect(() => {
    if (!showColumnChooser) return
    const onDown = (e) => {
      const el = columnChooserRef.current
      if (el && !el.contains(e.target)) setShowColumnChooser(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showColumnChooser])

  useEffect(() => {
    setColumnOrder((prev) => {
      const invoiceIdx = prev.indexOf('mapInvoice')
      const patientIdx = prev.indexOf('mapPatient')
      if (invoiceIdx < 0 || patientIdx < 0 || patientIdx < invoiceIdx) return prev
      const next = [...prev]
      next.splice(invoiceIdx, 1)
      const targetIdx = next.indexOf('mapPatient')
      next.splice(targetIdx + 1, 0, 'mapInvoice')
      return next
    })
  }, [])

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const years = []
    for (let y = currentYear; y >= currentYear - YEAR_RANGE; y -= 1) years.push(String(y))
    return years
  }, [])

  const hasActiveDateFilter = Boolean(monthFilter) || Boolean(yearFilter)

  const visibleColumns = useMemo(() => {
    const ordered = columnOrder.filter((id) => {
      if (!TABLE_COLUMNS.some((c) => c.id === id)) return false
      const col = TABLE_COLUMNS.find((c) => c.id === id)
      if (col?.locked) return true
      return columnVisibility[id] !== false
    })
    const patientIdx = ordered.indexOf('mapPatient')
    const invoiceIdx = ordered.indexOf('mapInvoice')
    if (patientIdx >= 0 && invoiceIdx >= 0 && patientIdx > invoiceIdx) {
      const next = [...ordered]
      next.splice(patientIdx, 1)
      const nextInvoiceIdx = next.indexOf('mapInvoice')
      next.splice(nextInvoiceIdx, 0, 'mapPatient')
      return next
    }
    return ordered
  }, [columnOrder, columnVisibility])

  const sortedPayments = useMemo(() => {
    const list = [...payments]
    list.sort((a, b) => {
      const ta = new Date(a.paidDate).getTime()
      const tb = new Date(b.paidDate).getTime()
      const aOk = Number.isFinite(ta)
      const bOk = Number.isFinite(tb)
      if (!aOk && !bOk) return 0
      if (!aOk) return 1
      if (!bOk) return -1
      return sortPaidDateDesc ? tb - ta : ta - tb
    })
    return list
  }, [payments, sortPaidDateDesc])

  const selectedPaymentIdList = useMemo(() => Array.from(selectedPaymentIds), [selectedPaymentIds])

  const allVisibleSelected = useMemo(
    () =>
      sortedPayments.length > 0 &&
      sortedPayments.every((payment) => selectedPaymentIds.has(String(payment.id))),
    [sortedPayments, selectedPaymentIds]
  )

  const canLinkSelected = useMemo(
    () =>
      selectedPaymentIdList.length > 0 &&
      selectedPaymentIdList.every(
        (paymentId) => selectedPatientByPayment[paymentId] && selectedInvoiceByPayment[paymentId]
      ),
    [selectedPaymentIdList, selectedPatientByPayment, selectedInvoiceByPayment]
  )

  useEffect(() => {
    const visibleIds = new Set(payments.map((payment) => String(payment.id)))
    setSelectedPaymentIds((prev) => {
      const next = new Set()
      prev.forEach((id) => {
        if (visibleIds.has(String(id))) next.add(String(id))
      })
      return next
    })
    setInvoiceOptionsByPayment((prev) => {
      const next = {}
      Object.entries(prev).forEach(([paymentId, options]) => {
        if (visibleIds.has(String(paymentId))) next[paymentId] = options
      })
      return next
    })
  }, [payments])

  const togglePaymentSelection = useCallback((paymentId) => {
    const id = String(paymentId)
    setSelectedPaymentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedPaymentIds((prev) => {
      const next = new Set(prev)
      const shouldSelectAll = !sortedPayments.every((payment) => next.has(String(payment.id)))
      sortedPayments.forEach((payment) => {
        const id = String(payment.id)
        if (shouldSelectAll) next.add(id)
        else next.delete(id)
      })
      return next
    })
  }, [sortedPayments])

  const reloadCurrentPayments = useCallback(() => {
    loadUnmappedPayments(undefined, listQueryParams)
  }, [loadUnmappedPayments, listQueryParams])

  const handleBulkMap = async () => {
    if (!selectedPaymentIdList.length) {
      setError('Select at least one payment to link.')
      setSuccess('')
      return
    }

    const mappings = []
    for (const paymentId of selectedPaymentIdList) {
      const selectedPatientId = selectedPatientByPayment[paymentId]
      const selectedInvoiceId = selectedInvoiceByPayment[paymentId]
      if (!selectedPatientId || !selectedInvoiceId) {
        setError('Choose patient and invoice for every selected payment.')
        setSuccess('')
        return
      }
      const mapping = {
        id: Number(paymentId),
        patient: Number(selectedPatientId),
        invoice: Number(selectedInvoiceId),
      }
      const deductRaw = amountToDeductByPayment[String(paymentId)]
      if (deductRaw != null && String(deductRaw).trim() !== '') {
        const deductNum = Number(deductRaw)
        if (Number.isFinite(deductNum) && deductNum >= 0) {
          mapping.amount = deductNum
        }
      }
      mappings.push(mapping)
    }

    setIsBulkLinking(true)
    setError('')
    setSuccess('')

    try {
      const accessToken = localStorage.getItem('access_token')
      if (!accessToken) {
        throw new Error('Authorization token missing. Please log in again.')
      }

      await axios.patch(`${baseUrl()}/booking/payments/bulk-map-payments/`, mappings, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      setSelectedPaymentIds(new Set())
      setSelectedPatientByPayment((prev) => {
        const next = { ...prev }
        selectedPaymentIdList.forEach((paymentId) => {
          delete next[paymentId]
        })
        return next
      })
      setSelectedInvoiceByPayment((prev) => {
        const next = { ...prev }
        selectedPaymentIdList.forEach((paymentId) => {
          delete next[paymentId]
        })
        return next
      })
      setInvoiceOptionsByPayment((prev) => {
        const next = { ...prev }
        selectedPaymentIdList.forEach((paymentId) => {
          delete next[paymentId]
        })
        return next
      })
      setAmountToDeductByPayment((prev) => {
        const next = { ...prev }
        selectedPaymentIdList.forEach((paymentId) => {
          delete next[String(paymentId)]
        })
        return next
      })
      await reloadCurrentPayments()
      setSuccess(
        mappings.length === 1
          ? 'Payment linked successfully.'
          : `${mappings.length} payments linked successfully.`
      )
    } catch (apiError) {
      const msg =
        apiError?.response?.data?.detail ||
        apiError?.response?.data?.message ||
        'Unable to link payment. Please try again.'
      setError(msg)
    } finally {
      setIsBulkLinking(false)
    }
  }

  const renderDesktopCell = (colId, p, apiInv, apiPat) => {
    switch (colId) {
      case 'select':
        return (
          <td key={colId} className="px-1 py-0.5 align-middle text-center">
            <input
              type="checkbox"
              checked={selectedPaymentIds.has(String(p.id))}
              onChange={() => togglePaymentSelection(p.id)}
              aria-label={`Select payment ${p.reference || p.id}`}
              className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
          </td>
        )
      case 'amount':
        return (
          <td key={colId} className="px-1 py-0.5 align-middle text-slate-800 tabular-nums leading-tight">
            {formatAmountPlain(p.amount)}
          </td>
        )
      case 'amountToDeduct':
        return (
          <td key={colId} className="px-1 py-0.5 align-middle">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={amountToDeductByPayment[String(p.id)] ?? ''}
              onChange={(e) => handleAmountToDeductChange(p.id, e.target.value)}
              className={amountDeductInputClass}
              aria-label={`Amount to deduct for payment ${p.reference || p.id}`}
            />
          </td>
        )
      case 'method':
        return (
          <td key={colId} className="px-1 py-0.5 align-middle text-slate-700 leading-tight">
            {p.method || '—'}
          </td>
        )
      case 'reference':
        return (
          <td
            key={colId}
            className="px-1 py-0.5 align-middle font-mono text-[11px] text-slate-700 break-all leading-tight"
          >
            {p.reference || '—'}
          </td>
        )
      case 'paidDate':
        return (
          <td key={colId} className="px-1 py-0.5 align-middle text-slate-600 leading-tight">
            {formatDateTimeCompact(p.paidDate)}
          </td>
        )
      case 'mapInvoice':
        return (
          <td key={colId} className="px-1 py-0.5 align-middle">
            <SearchableSelect
              inputId={`invoice-select-desktop-${p.id}`}
              value={selectedInvoiceByPayment[p.id] || ''}
              selectedLabel={selectedInvoiceLabelByPayment[String(p.id)] || ''}
              onChange={(selectedId, selectedOption) => handleInvoiceSelection(p.id, selectedId, selectedOption)}
              options={invoiceOptionsByPayment[String(p.id)] || []}
              placeholder="Search invoice..."
              fetchOnFocus={false}
              onSearch={(search) =>
                loadInvoiceDropdownForPayment(p.id, search, selectedPatientByPayment[p.id] || '')
              }
              isLoading={invoiceLoadingPaymentId === String(p.id)}
            />
          </td>
        )
      case 'mapPatient':
        return (
          <td key={colId} className="px-1 py-0.5 align-middle">
            <SearchableSelect
              value={selectedPatientByPayment[p.id] || ''}
              selectedLabel={selectedPatientLabelByPayment[String(p.id)] || apiPat || ''}
              onChange={(selectedId, selectedOption) => handlePatientSelection(p.id, selectedId, selectedOption)}
              options={patients}
              placeholder="Search patient by name or number"
              onSearch={loadPatientDropdown}
              isLoading={isPatientDropdownLoading}
              minMenuWidth={260}
            />
          </td>
        )
      default:
        return <td key={colId} className="px-1 py-0.5">—</td>
    }
  }

  if (!isVsreOwner) {
    return (
      <div className="p-2 sm:p-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You do not have access to this page.
        </div>
      </div>
    )
  }

  return (
    <div className="p-1.5 sm:p-2">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-2 py-1.5 sm:px-3 sm:py-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
            <div>
              <h3 className="text-[15px] sm:text-base font-bold text-slate-800 leading-tight">Unmapped Payments</h3>
            </div>
            <div className="relative shrink-0" ref={columnChooserRef}>
              <button
                type="button"
                onClick={() => setShowColumnChooser((prev) => !prev)}
                className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 sm:text-xs"
              >
                Column chooser
              </button>
              {showColumnChooser && (
                <div className="absolute right-0 z-30 mt-1 w-72 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Table columns</p>
                  <p className="mb-1.5 text-[11px] text-slate-400 leading-snug">
                    Toggle optional columns. Drag headers (⋮) on the table to reorder.
                  </p>
                  <div className="max-h-64 space-y-1 overflow-y-auto border-t border-slate-100 pt-1.5">
                    {columnOrder.map((colId) => {
                      const col = TABLE_COLUMNS.find((c) => c.id === colId)
                      if (!col) return null
                      return (
                        <label
                          key={colId}
                          className="flex items-center gap-2 rounded px-1 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          <span className="w-4 shrink-0 text-center text-slate-300">{col.locked ? '—' : '•'}</span>
                          <input
                            type="checkbox"
                            checked={col.locked ? true : columnVisibility[colId] !== false}
                            disabled={col.locked}
                            onChange={() => {
                              if (col.locked) return
                              setColumnVisibility((prev) => ({ ...prev, [colId]: !(prev[colId] !== false) }))
                            }}
                          />
                          <span>{col.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-1.5 sm:p-2 space-y-1.5">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-nowrap sm:items-center">
            <div className="flex w-full min-w-0 flex-1 items-center gap-1 sm:min-w-[220px]">
              <input
                type="text"
                value={searchInput}
                onChange={handleSearchInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    applySearch()
                  }
                }}
                placeholder="Search by reference, payment or payment mode"
                className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-800 sm:text-xs focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={applySearch}
                className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 sm:text-xs"
              >
                Search
              </button>
              <button
                type="button"
                onClick={clearSearchAndReload}
                disabled={!searchInput && !appliedSearchQuery}
                className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs"
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <label className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-600 sm:text-xs">
                <span className="text-slate-500">Month</span>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  disabled={isLoadingPayments}
                  className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">All months</option>
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-600 sm:text-xs">
                <span className="text-slate-500">Year</span>
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  disabled={isLoadingPayments}
                  className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">All years</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              {hasActiveDateFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setMonthFilter('')
                    setYearFilter('')
                  }}
                  disabled={isLoadingPayments}
                  className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs"
                  title="Clear date filters"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={handleBulkMap}
                disabled={!canLinkSelected || isBulkLinking || isLoadingPayments}
                className="rounded-md bg-teal-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs"
              >
                {isBulkLinking
                  ? 'Linking...'
                  : selectedPaymentIdList.length > 0
                    ? `Link (${selectedPaymentIdList.length})`
                    : 'Link'}
              </button>
            </div>
            <div className="text-[11px] text-slate-500 sm:ml-auto sm:self-center whitespace-nowrap">
              {paymentsPagination.count > 0
                ? `${paymentsPagination.count} payment${paymentsPagination.count === 1 ? '' : 's'} to review`
                : `${sortedPayments.length} payment${sortedPayments.length === 1 ? '' : 's'} to review`}
              {appliedSearchQuery ? (
                <span className="text-slate-400"> · &quot;{appliedSearchQuery}&quot;</span>
              ) : null}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-800 sm:text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800 sm:text-sm">
              {success}
            </div>
          )}

          {isLoadingPayments ? (
            <>
              <div className="space-y-2 lg:hidden">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={`s-mobile-${idx}`} className="animate-pulse rounded-md border border-slate-200 bg-white p-2 shadow-sm">
                    <div className="grid grid-cols-2 gap-x-2 gap-y-2">
                      {Array.from({ length: 10 }).map((__, lineIdx) => (
                        <div
                          key={`s-mobile-line-${idx}-${lineIdx}`}
                          className={`h-3 rounded bg-slate-200 ${lineIdx % 2 === 0 ? 'w-20' : 'w-full justify-self-end'}`}
                        />
                      ))}
                    </div>
                    <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                      <div className="h-8 rounded bg-slate-200" />
                      <div className="h-8 rounded bg-slate-200" />
                      <div className="h-8 rounded bg-slate-200" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-md border border-slate-200 lg:block">
                <table className="w-full table-fixed text-[11px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                    <tr>
                      {visibleColumns.map((colId) => {
                        const col = TABLE_COLUMNS.find((c) => c.id === colId)
                        return (
                          <th
                            key={`s-head-${colId}`}
                            className={`px-1 py-0.5 text-left font-semibold ${col?.thClass || ''}`}
                          >
                            {col?.label}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Array.from({ length: 5 }).map((_, rowIdx) => (
                      <tr key={`s-row-${rowIdx}`} className="animate-pulse">
                        {visibleColumns.map((colId) => (
                          <td key={`s-cell-${rowIdx}-${colId}`} className="px-1 py-1">
                            <div className="h-4 w-full rounded bg-slate-200" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : sortedPayments.length === 0 ? (
            <div className="rounded-md border-2 border-dashed border-slate-200 bg-slate-50 py-4 text-center">
              <p className="text-xs text-slate-600 sm:text-sm">
                {appliedSearchQuery
                  ? `No unmapped payments match "${appliedSearchQuery}".`
                  : 'No payments need review.'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {appliedSearchQuery ? (
                  <button
                    type="button"
                    onClick={clearSearchAndReload}
                    className="font-semibold text-teal-700 hover:text-teal-800"
                  >
                    Clear search
                  </button>
                ) : (
                  'All payments are already linked.'
                )}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2 lg:hidden">
                {sortedPayments.map((p) => {
                  const apiInv = getApiInvoiceLabel(p)
                  const apiPat = getApiPatientLabel(p)
                  return (
                  <div key={p.id} className="rounded-md border border-slate-200 bg-white p-2 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedPaymentIds.has(String(p.id))}
                          onChange={() => togglePaymentSelection(p.id)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        Select
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] sm:text-xs">
                      <p className="text-slate-500">Amount</p>
                      <p className="text-right font-medium text-slate-800 tabular-nums">{formatAmountPlain(p.amount)}</p>
                      <p className="text-slate-500">Amount to deduct</p>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amountToDeductByPayment[String(p.id)] ?? ''}
                        onChange={(e) => handleAmountToDeductChange(p.id, e.target.value)}
                        className={amountDeductInputClass}
                        aria-label={`Amount to deduct for payment ${p.reference || p.id}`}
                      />
                      <p className="text-slate-500">Method</p>
                      <p className="text-right text-slate-700">{p.method || '—'}</p>
                      <p className="text-slate-500">Reference</p>
                      <p className="text-right font-mono text-[11px] text-slate-700 break-all">{p.reference || '—'}</p>
                      <p className="text-slate-500">Paid date</p>
                      <p className="text-right text-slate-700 leading-tight">{formatDateTimeCompact(p.paidDate)}</p>
                    </div>
                    {p.reason ? (
                      <>
                        <p className="mt-1.5 text-[11px] text-slate-500">Note</p>
                        <p className="mt-0.5 rounded border bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-900 border-amber-200">
                          {p.reason}
                        </p>
                      </>
                    ) : null}
                    <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                      <div>
                        <p className="text-[11px] font-medium text-slate-700 mb-0.5">Map to patient</p>
                        <SearchableSelect
                          value={selectedPatientByPayment[p.id] || ''}
                          selectedLabel={selectedPatientLabelByPayment[String(p.id)] || apiPat || ''}
                          onChange={(selectedId, selectedOption) => handlePatientSelection(p.id, selectedId, selectedOption)}
                          options={patients}
                          placeholder="Search patient..."
                          onSearch={loadPatientDropdown}
                          isLoading={isPatientDropdownLoading}
                          minMenuWidth={260}
                        />
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-slate-700 mb-0.5">Map to invoice</p>
                        <SearchableSelect
                          inputId={`invoice-select-mobile-${p.id}`}
                          value={selectedInvoiceByPayment[p.id] || ''}
                          selectedLabel={selectedInvoiceLabelByPayment[String(p.id)] || ''}
                          onChange={(selectedId, selectedOption) => handleInvoiceSelection(p.id, selectedId, selectedOption)}
                          options={invoiceOptionsByPayment[String(p.id)] || []}
                          placeholder="Search invoice..."
                          fetchOnFocus={false}
                          onSearch={(search) =>
                            loadInvoiceDropdownForPayment(p.id, search, selectedPatientByPayment[p.id] || '')
                          }
                          isLoading={invoiceLoadingPaymentId === String(p.id)}
                        />
                      </div>
                    </div>
                  </div>
                  )
                })}
              </div>

              <div className="hidden overflow-hidden rounded-md border border-slate-200 lg:block">
                <table className="w-full table-fixed text-[11px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                    <tr>
                      {visibleColumns.map((colId) => {
                        const col = TABLE_COLUMNS.find((c) => c.id === colId)
                        const locked = Boolean(col?.locked)
                        const sharedDrop = {
                          onDragOver: (e) => {
                            if (!dragColId || dragColId === colId) return
                            const srcM = TABLE_COLUMNS.find((c) => c.id === dragColId)
                            if (srcM?.locked) return
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                          },
                          onDrop: (e) => {
                            e.preventDefault()
                            const src = dragColId
                            setDragColId(null)
                            if (!src || src === colId) return
                            const srcM = TABLE_COLUMNS.find((c) => c.id === src)
                            if (srcM?.locked) return
                            setColumnOrder((prev) => reorderColumns(prev, src, colId))
                          },
                        }
                        const dragStartProps = locked
                          ? {}
                          : {
                              draggable: true,
                              onDragStart: (e) => {
                                setDragColId(colId)
                                e.dataTransfer.effectAllowed = 'move'
                                try {
                                  e.dataTransfer.setData('text/plain', colId)
                                } catch {
                                  /* ignore */
                                }
                              },
                              onDragEnd: () => setDragColId(null),
                            }
                        return (
                          <th
                            key={colId}
                            {...sharedDrop}
                            {...dragStartProps}
                            className={`px-1 py-0.5 text-left font-semibold ${col?.thClass || ''} ${
                              locked ? '' : 'cursor-grab active:cursor-grabbing'
                            } ${dragColId === colId && !locked ? 'bg-teal-50/80' : ''}`}
                            title={locked ? undefined : 'Drag header (⋮) to reorder'}
                          >
                            <span className="inline-flex items-center gap-0.5 select-none">
                              {!locked ? <span className="text-slate-400">⋮</span> : null}
                              {colId === 'select' ? (
                                <label className="inline-flex items-center gap-1 font-semibold leading-tight">
                                  <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={toggleSelectAllVisible}
                                    aria-label="Select all payments on this page"
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                  />
                                  <span>Select</span>
                                </label>
                              ) : colId === 'paidDate' ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSortPaidDateDesc((d) => !d)
                                  }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  className="group inline-flex items-center gap-1 rounded px-1 py-0.5 -ml-1 hover:bg-teal-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
                                  title={
                                    sortPaidDateDesc
                                      ? 'Sorted newest first — click for oldest first'
                                      : 'Sorted oldest first — click for newest first'
                                  }
                                  aria-label={
                                    sortPaidDateDesc
                                      ? 'Payment date: newest first. Activate to sort oldest first.'
                                      : 'Payment date: oldest first. Activate to sort newest first.'
                                  }
                                >
                                  <span className="font-semibold text-slate-800 group-hover:text-teal-800 whitespace-nowrap">
                                    Payment Date
                                  </span>
                                  <span
                                    className="inline-flex flex-col items-center justify-center -space-y-1 shrink-0"
                                    aria-hidden
                                  >
                                    <FiChevronUp
                                      className={`w-3.5 h-3.5 ${
                                        sortPaidDateDesc ? 'text-slate-300' : 'text-teal-600'
                                      }`}
                                      strokeWidth={2.5}
                                    />
                                    <FiChevronDown
                                      className={`w-3.5 h-3.5 ${
                                        sortPaidDateDesc ? 'text-teal-600' : 'text-slate-300'
                                      }`}
                                      strokeWidth={2.5}
                                    />
                                  </span>
                                </button>
                              ) : (
                                col?.label
                              )}
                            </span>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedPayments.map((p, rowIdx) => {
                      const apiInv = getApiInvoiceLabel(p)
                      const apiPat = getApiPatientLabel(p)
                      return (
                        <tr
                          key={p.id}
                          className={
                            rowIdx % 2 === 0 ? 'bg-white hover:bg-slate-50/80' : 'bg-slate-50/40 hover:bg-slate-50'
                          }
                        >
                          {visibleColumns.map((colId) => renderDesktopCell(colId, p, apiInv, apiPat))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 sm:text-xs">
                <span>
                  Page {paymentsPagination.current_page} of {paymentsPagination.total_pages} ({paymentsPagination.count}{' '}
                  total)
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 sm:text-xs">
                    <span className="text-slate-500">Rows</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      disabled={isLoadingPayments}
                      className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!paymentsPagination.previous || isLoadingPayments}
                    onClick={() => {
                      const url = normalizePageUrl(paymentsPagination.previous)
                      if (url) loadUnmappedPayments(url, listQueryParams)
                    }}
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!paymentsPagination.next || isLoadingPayments}
                    onClick={() => {
                      const url = normalizePageUrl(paymentsPagination.next)
                      if (url) loadUnmappedPayments(url, listQueryParams)
                    }}
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default UnmappedPayments
