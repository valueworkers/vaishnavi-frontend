import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import * as XLSX from 'xlsx'
import { FiChevronDown, FiChevronUp, FiEdit2, FiTrash2 } from 'react-icons/fi'
import CustomerEmrDocumentsModal from './CustomerEmrDocumentsModal'
import CustomerPatientEditModal from './CustomerPatientEditModal'
import { hasOwnerPrivileges } from '../../utils/authRoles'

/** Columns shown in Customer Master (from GET /booking/patients/). */
const KNOWN_COLUMN_ORDER = [
  'full_name',
  'patient_id',
  'location_type',
  'booking_locality',
  'emr_count',
  'email',
  'phone',
  'address',
  'age',
  'emergency_contact',
  'emergency_phone',
  'gender',
  'is_active',
  'registration_date',
]

const COLUMN_LABELS = {
  full_name: 'Full Name',
  patient_id: 'Patient Id',
  location_type: 'Location Type',
  booking_locality: 'Booking Locality',
  emr_count: 'EMR Count',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  age: 'Age',
  emergency_contact: 'Emergency Contact',
  emergency_phone: 'Emergency Phone',
  gender: 'Gender',
  is_active: 'Is Active',
  registration_date: 'Registration Date',
}

const LONG_TEXT_COLUMNS = new Set([
  'address',
  'email',
  'emergency_contact',
  'full_name',
  'booking_locality',
])
const BOOLEAN_COLUMNS = new Set(['is_active'])
const DATE_COLUMNS = new Set(['registration_date'])

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

const formatColumnLabel = (key) => COLUMN_LABELS[key] ?? String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const renderColumnHeaderLabel = (colId) => {
  const label = formatColumnLabel(colId)
  const words = label.split(' ')
  if (words.length <= 2) {
    return (
      <span className="block leading-tight" title={label}>
        {label}
      </span>
    )
  }
  const mid = Math.ceil(words.length / 2)
  const lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
  return lines.map((line) => (
    <span key={line} className="block leading-tight" title={label}>
      {line}
    </span>
  ))
}

const resolveRequestUrl = (href, baseUrl) => {
  if (!href) return null
  const raw = String(href)
  if (/^https?:\/\//i.test(raw)) return raw
  const normalizedBase = String(baseUrl || '').replace(/\/$/, '')
  return `${normalizedBase}${raw.startsWith('/') ? raw : `/${raw}`}`
}

const PAGE_SIZE_PRESETS = [20, 40, 60]

const withPageSize = (requestUrl, pageSize) => {
  if (!requestUrl) return null
  try {
    const url = new URL(requestUrl)
    url.searchParams.set('page_size', String(pageSize))
    return url.toString()
  } catch {
    return requestUrl
  }
}

const resolveRequestPageSize = (selection, totalCount) => {
  const n = Number(selection)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  return totalCount > 0 ? totalCount : 20
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

const withActiveFilter = (requestUrl, activeFilter) => {
  if (!requestUrl) return null
  try {
    const url = new URL(requestUrl)
    if (activeFilter === true) {
      url.searchParams.set('is_active', 'true')
    } else if (activeFilter === false) {
      url.searchParams.set('is_active', 'false')
    } else {
      url.searchParams.delete('is_active')
    }
    return url.toString()
  } catch {
    return requestUrl
  }
}

const LOCATION_TYPE_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'CLIENT_SIDE', label: 'Client Side' },
  { value: 'IN_HOUSE', label: 'In House' },
  { value: 'OPD', label: 'OPD' },
]

const withLocationTypeFilter = (requestUrl, locationTypeFilter) => {
  if (!requestUrl) return null
  try {
    const url = new URL(requestUrl)
    const locationType = String(locationTypeFilter || '').trim().toUpperCase()
    if (locationType === 'CLIENT_SIDE' || locationType === 'IN_HOUSE' || locationType === 'OPD') {
      url.searchParams.set('location_type', locationType)
    } else {
      url.searchParams.delete('location_type')
    }
    return url.toString()
  } catch {
    return requestUrl
  }
}

const isValidListOrdering = (ordering) => {
  const order = String(ordering || '').trim()
  return (
    order === 'first_name' ||
    order === '-first_name' ||
    order === 'patient_id' ||
    order === '-patient_id'
  )
}

const withListOrdering = (requestUrl, ordering) => {
  if (!requestUrl) return null
  try {
    const url = new URL(requestUrl)
    const order = String(ordering || '').trim()
    if (isValidListOrdering(order)) {
      url.searchParams.set('ordering', order)
    } else {
      url.searchParams.delete('ordering')
    }
    return url.toString()
  } catch {
    return requestUrl
  }
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

const formatDateValue = (iso) => {
  if (iso == null || iso === '') return '-'
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return readValue(iso)
  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const formatLocationType = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw) return '-'
  if (raw === 'IN_HOUSE') return 'In House'
  if (raw === 'CLIENT_SIDE') return 'Client Side'
  if (raw === 'OPD') return 'OPD'
  return raw.replace(/_/g, ' ')
}

const formatGender = (value) => {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return '-'
  if (raw === 'male' || raw === 'm') return 'Male'
  if (raw === 'female' || raw === 'f') return 'Female'
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

const readCellValue = (patient, columnId) => {
  const value = patient?.[columnId]
  if (DATE_COLUMNS.has(columnId)) return formatDateValue(value)
  if (columnId === 'location_type') return formatLocationType(value)
  if (columnId === 'gender') return formatGender(value)
  if (columnId === 'age') {
    if (value == null || value === '') return '-'
    return String(value)
  }
  if (columnId === 'emr_count') {
    if (value == null || value === '') return '-'
    return String(value)
  }
  if (BOOLEAN_COLUMNS.has(columnId)) return readValue(value)
  return readValue(value)
}

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const exportCellText = (patient, columnId) => {
  if (columnId === 'is_active') return isPatientActiveValue(patient?.is_active) ? 'Active' : 'Inactive'
  return readCellValue(patient, columnId)
}

const getCustomerRowKey = (patient, index) => String(patient?.id ?? patient?.pk ?? `row-${index}`)

const isPatientActiveValue = (value) =>
  value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true'

const customerDisplayName = (patient) => {
  const full = String(patient?.full_name ?? '').trim()
  if (full) return full
  const name = [patient?.first_name, patient?.last_name].filter(Boolean).join(' ').trim()
  if (name) return name
  if (patient?.patient_id) return `Patient ${patient.patient_id}`
  if (patient?.id != null) return `Patient #${patient.id}`
  return 'this patient'
}

const CELL_PAD = 'px-1.5 py-1 sm:px-2 sm:py-1.5'
const LONG_TEXT_COL = 'min-w-0 max-w-[7.5rem] sm:max-w-[9.5rem]'

const renderTableCellContent = (patient, colId, { onEmrCountClick } = {}) => {
  const raw = patient?.[colId]

  if (colId === 'emr_count') {
    const countRaw = patient?.emr_count
    if (countRaw == null || countRaw === '') return '-'
    const count = Number(countRaw)
    const display = String(countRaw)
    if (Number.isFinite(count) && count > 0 && onEmrCountClick) {
      return (
        <button
          type="button"
          onClick={() => onEmrCountClick(patient)}
          className="rounded-sm font-semibold text-indigo-700 underline-offset-2 transition-colors hover:text-indigo-800 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
          title={`View ${display} EMR document${count !== 1 ? 's' : ''}`}
          aria-label={`View ${display} EMR document${count !== 1 ? 's' : ''} for ${customerDisplayName(patient)}`}
        >
          {display}
        </button>
      )
    }
    return display
  }

  if (colId === 'is_active') {
    const on = isPatientActiveValue(raw)
    const label = on ? 'Active' : 'Inactive'
    return (
      <span
        className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:text-[11px] ${
          on ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
        }`}
      >
        {label}
      </span>
    )
  }

  if (colId === 'gender') {
    const label = formatGender(raw)
    if (label === '-') return label
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
    const tip = value && value !== '-' ? value : undefined
    return (
      <span className="block min-w-0 cursor-default truncate" title={tip}>
        {value}
      </span>
    )
  }

  return value
}

const CustomerMaster = () => {
  const [patients, setPatients] = useState([])
  const [isLoading, setIsLoading] = useState(false)
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
  const [columnOrder, setColumnOrder] = useState(() => [...KNOWN_COLUMN_ORDER])
  const [columnVisibility, setColumnVisibility] = useState(() =>
    Object.fromEntries(KNOWN_COLUMN_ORDER.map((id) => [id, true]))
  )
  const [showColumnChooser, setShowColumnChooser] = useState(false)
  const [dragColId, setDragColId] = useState(null)
  const [activeFilter, setActiveFilter] = useState(null)
  const [showActiveFilterMenu, setShowActiveFilterMenu] = useState(false)
  const [locationTypeFilter, setLocationTypeFilter] = useState('')
  const [showLocationTypeFilterMenu, setShowLocationTypeFilterMenu] = useState(false)
  const [listOrdering, setListOrdering] = useState('')
  const [selectedCustomersById, setSelectedCustomersById] = useState({})
  const [authUser, setAuthUser] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [deletingCustomerIds, setDeletingCustomerIds] = useState(() => new Set())
  const [emrModalPatient, setEmrModalPatient] = useState(null)
  const [editModalPatient, setEditModalPatient] = useState(null)
  const chooserRef = useRef(null)
  const activeFilterRef = useRef(null)
  const locationTypeFilterRef = useRef(null)
  const totalCountRef = useRef(0)

  const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')

  const isVsreOwner = useMemo(() => hasOwnerPrivileges(authUser), [authUser])

  useEffect(() => {
    const readAuthUser = () => {
      try {
        const raw = localStorage.getItem('authUser')
        setAuthUser(raw ? JSON.parse(raw) : null)
      } catch {
        setAuthUser(null)
      }
    }
    readAuthUser()
    window.addEventListener('auth-changed', readAuthUser)
    window.addEventListener('storage', readAuthUser)
    return () => {
      window.removeEventListener('auth-changed', readAuthUser)
      window.removeEventListener('storage', readAuthUser)
    }
  }, [])

  const buildPatientsRequestUrl = (href = null) => {
    const resolved = href ? resolveRequestUrl(href, baseUrl) : `${baseUrl}/booking/patients/`
    if (!resolved) return null
    const size = resolveRequestPageSize(pageSize, totalCountRef.current)
    return withListOrdering(
      withLocationTypeFilter(
        withActiveFilter(withPageSize(withSearch(resolved, appliedSearch), size), activeFilter),
        locationTypeFilter
      ),
      listOrdering
    )
  }

  const fetchPatients = async (requestUrl) => {
    setIsLoading(true)
    setError('')
    try {
      const token = localStorage.getItem('access_token')
      if (!token) throw new Error('Authorization token missing. Please log in again.')
      const response = await axios.get(requestUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = response.data || {}
      const rows = Array.isArray(data.results) ? data.results : []
      setPatients(rows)
      const total = Number(data.count ?? 0) || 0
      totalCountRef.current = total
      setPagination({
        next: data.next ?? null,
        previous: data.previous ?? null,
        currentPage: data.current_page ?? 1,
        totalPages: data.total_pages ?? 1,
        count: total,
      })
    } catch (apiError) {
      const message =
        apiError?.response?.data?.detail ||
        apiError?.response?.data?.message ||
        apiError?.message ||
        'Unable to load patients.'
      setError(message)
      setPatients([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!baseUrl) {
      setError('Missing VITE_BASEURL_CARE in .env')
      return
    }
    const requestUrl = buildPatientsRequestUrl()
    if (requestUrl) fetchPatients(requestUrl)
  }, [baseUrl, pageSize, appliedSearch, activeFilter, locationTypeFilter, listOrdering])

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
    if (!showActiveFilterMenu) return
    const onDocClick = (event) => {
      if (activeFilterRef.current && !activeFilterRef.current.contains(event.target)) {
        setShowActiveFilterMenu(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showActiveFilterMenu])

  useEffect(() => {
    if (!showLocationTypeFilterMenu) return
    const onDocClick = (event) => {
      if (locationTypeFilterRef.current && !locationTypeFilterRef.current.contains(event.target)) {
        setShowLocationTypeFilterMenu(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showLocationTypeFilterMenu])

  const visibleColumns = useMemo(
    () => columnOrder.filter((id) => KNOWN_COLUMN_ORDER.includes(id) && columnVisibility[id] !== false),
    [columnOrder, columnVisibility]
  )

  const exportColumnIds = useMemo(() => visibleColumns, [visibleColumns])

  const selectedExportRows = useMemo(
    () => Object.values(selectedCustomersById),
    [selectedCustomersById]
  )

  const selectedCount = selectedExportRows.length

  const allPageSelected = useMemo(
    () =>
      patients.length > 0 &&
      patients.every((patient, index) => Boolean(selectedCustomersById[getCustomerRowKey(patient, index)])),
    [patients, selectedCustomersById]
  )

  const toggleCustomerSelection = useCallback((patient, index) => {
    const key = getCustomerRowKey(patient, index)
    setSelectedCustomersById((prev) => {
      if (prev[key]) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: patient }
    })
  }, [])

  const toggleSelectAllOnPage = useCallback(() => {
    setSelectedCustomersById((prev) => {
      const next = { ...prev }
      if (allPageSelected) {
        patients.forEach((patient, index) => {
          delete next[getCustomerRowKey(patient, index)]
        })
      } else {
        patients.forEach((patient, index) => {
          next[getCustomerRowKey(patient, index)] = patient
        })
      }
      return next
    })
  }, [allPageSelected, patients])

  const clearSelection = useCallback(() => {
    setSelectedCustomersById({})
  }, [])

  const reloadPatients = useCallback(() => {
    const requestUrl = buildPatientsRequestUrl()
    if (requestUrl) fetchPatients(requestUrl)
  }, [baseUrl, pageSize, appliedSearch, activeFilter, locationTypeFilter, listOrdering])

  const deletePatientById = useCallback(
    async (patientId, displayName) => {
      const id = Number(patientId)
      if (!Number.isFinite(id) || id <= 0) {
        setError('Invalid patient id.')
        return false
      }

      const token = localStorage.getItem('access_token')
      if (!token) {
        setError('Authorization token missing. Please log in again.')
        return false
      }

      setDeletingCustomerIds((prev) => new Set(prev).add(String(id)))
      setError('')
      setSuccessMessage('')

      try {
        await axios.delete(`${baseUrl}/booking/patients/${id}/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        setSelectedCustomersById((prev) => {
          const next = { ...prev }
          delete next[String(id)]
          return next
        })
        setSuccessMessage(`${displayName} deleted successfully.`)
        return true
      } catch (apiError) {
        const message =
          apiError?.response?.data?.detail ||
          apiError?.response?.data?.message ||
          apiError?.message ||
          'Unable to delete patient.'
        setError(message)
        return false
      } finally {
        setDeletingCustomerIds((prev) => {
          const next = new Set(prev)
          next.delete(String(id))
          return next
        })
      }
    },
    [baseUrl]
  )

  const handleEditCustomer = useCallback(
    (patient) => {
      if (!isVsreOwner || !patient) return
      setEditModalPatient(patient)
    },
    [isVsreOwner]
  )

  const handlePatientEdited = useCallback(
    (updatedPatient) => {
      const updatedId = updatedPatient?.id
      if (updatedId != null) {
        setPatients((prev) =>
          prev.map((row) => (String(row?.id) === String(updatedId) ? { ...row, ...updatedPatient } : row))
        )
        setSelectedCustomersById((prev) => {
          const next = { ...prev }
          Object.keys(next).forEach((key) => {
            if (String(next[key]?.id) === String(updatedId)) {
              next[key] = { ...next[key], ...updatedPatient }
            }
          })
          return next
        })
      }
      setSuccessMessage(`${customerDisplayName(updatedPatient)} updated successfully.`)
      reloadPatients()
    },
    [reloadPatients]
  )

  const handleDeleteCustomer = useCallback(
    async (patient) => {
      if (!isVsreOwner) return
      const displayName = customerDisplayName(patient)
      const confirmed = window.confirm(`Delete ${displayName}? This action cannot be undone.`)
      if (!confirmed) return

      const deleted = await deletePatientById(patient?.id, displayName)
      if (deleted) reloadPatients()
    },
    [isVsreOwner, deletePatientById, reloadPatients]
  )

  const handleDeleteSelected = useCallback(async () => {
    if (!isVsreOwner || selectedExportRows.length === 0) return

    const confirmed = window.confirm(
      `Delete ${selectedExportRows.length} selected patient${selectedExportRows.length === 1 ? '' : 's'}? This action cannot be undone.`
    )
    if (!confirmed) return

    let deletedCount = 0
    for (const patient of selectedExportRows) {
      const displayName = customerDisplayName(patient)
      const deleted = await deletePatientById(patient?.id, displayName)
      if (deleted) deletedCount += 1
    }

    if (deletedCount > 0) {
      setSuccessMessage(
        `${deletedCount} patient${deletedCount === 1 ? '' : 's'} deleted successfully.`
      )
      clearSelection()
      reloadPatients()
    }
  }, [isVsreOwner, selectedExportRows, deletePatientById, clearSelection, reloadPatients])

  const exportPdf = () => {
    if (!exportColumnIds.length) {
      setError('Please keep at least one visible column before exporting.')
      return
    }
    if (!selectedExportRows.length) {
      setError('Select at least one customer row to export.')
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
    const rows = selectedExportRows
      .map((patient) => {
        const cells = exportColumnIds
          .map((id) => `<td>${escapeHtml(exportCellText(patient, id))}</td>`)
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')

    printWindow.document.write(`
      <html>
        <head>
          <title>Customer Master</title>
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
          <h2>Customer Master</h2>
          <p>Selected rows: ${selectedExportRows.length}</p>
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
    if (!selectedExportRows.length) {
      setError('Select at least one customer row to export.')
      return
    }
    setError('')
    try {
      const headerRow = exportColumnIds.map((id) => formatColumnLabel(id))
      const dataRows = selectedExportRows.map((patient) =>
        exportColumnIds.map((id) => exportCellText(patient, id))
      )
      const sheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, sheet, 'Patients')
      const stamp = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(workbook, `customer-master-selected-${selectedExportRows.length}-${stamp}.xlsx`)
    } catch (e) {
      setError(e?.message || 'Unable to export Excel file.')
    }
  }

  const rowsSelectValue = String(pageSize)

  const showTotalCountOption =
    pagination.count > 0 && !PAGE_SIZE_PRESETS.includes(pagination.count)

  return (
    <>
      {emrModalPatient ? (
        <CustomerEmrDocumentsModal patient={emrModalPatient} onClose={() => setEmrModalPatient(null)} />
      ) : null}
      {editModalPatient ? (
        <CustomerPatientEditModal
          patient={editModalPatient}
          onClose={() => setEditModalPatient(null)}
          onSaved={handlePatientEdited}
        />
      ) : null}
    <div className="min-w-0 w-full max-w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 sm:text-base">Customer Master</h3>
        </div>
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setAppliedSearch(searchInput)
            }}
            placeholder="Search patients..."
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 sm:w-56 sm:text-xs"
          />
          <button
            type="button"
            onClick={() => setAppliedSearch(searchInput)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 sm:text-xs"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchInput('')
              setAppliedSearch('')
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 sm:text-xs"
          >
            Clear
          </button>
        </div>
        <div className="relative flex flex-wrap items-center gap-1.5" ref={chooserRef}>
          <label className="text-xs font-semibold text-slate-600" htmlFor="customer-page-size">
            Rows:
          </label>
          <select
            id="customer-page-size"
            value={rowsSelectValue}
            onChange={(e) => setPageSize(Number(e.target.value) || 20)}
            className="min-w-[5.5rem] rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] font-semibold text-slate-700 shadow-xs sm:min-w-[6.5rem] sm:text-xs"
            title="Rows per page"
          >
            {PAGE_SIZE_PRESETS.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
            {showTotalCountOption ? (
              <option value={String(pagination.count)}>Total ({pagination.count})</option>
            ) : null}
          </select>
          <button
            type="button"
            onClick={() => setShowColumnChooser((prev) => !prev)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 sm:text-xs"
          >
            Column Chooser
          </button>
          <button
            type="button"
            onClick={exportPdf}
            disabled={isLoading || selectedCount === 0}
            className="rounded-md border border-indigo-600 bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs"
            title={selectedCount === 0 ? 'Select rows to export' : `Export ${selectedCount} selected row(s) as PDF`}
          >
            Export PDF{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={isLoading || selectedCount === 0}
            className="rounded-md border border-emerald-700 bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs"
            title={selectedCount === 0 ? 'Select rows to export' : `Export ${selectedCount} selected row(s) as Excel`}
          >
            Export Excel{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
          {selectedCount > 0 ? (
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 sm:text-xs"
            >
              Clear selection
            </button>
          ) : null}
          {isVsreOwner && selectedCount > 0 ? (
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={isLoading || deletingCustomerIds.size > 0}
              className="inline-flex items-center gap-1 rounded-md border border-rose-600 bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs"
              title={`Delete ${selectedCount} selected customer(s)`}
            >
              <FiTrash2 className="h-3 w-3" />
              Delete ({selectedCount})
            </button>
          ) : null}
          {showColumnChooser && (
            <div className="absolute right-0 top-full z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg sm:w-72 sm:p-2.5">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Choose columns</p>
              <p className="mb-2 text-[11px] text-slate-400">Toggle columns. Reorder by dragging table headers.</p>
              <div className="space-y-1">
                {KNOWN_COLUMN_ORDER.map((colId) => (
                  <label key={colId} className="flex items-center gap-2 rounded px-1 py-1 text-xs text-slate-700 hover:bg-slate-50">
                    <span className="w-4 text-slate-300">•</span>
                    <input
                      type="checkbox"
                      checked={columnVisibility[colId] !== false}
                      onChange={() =>
                        setColumnVisibility((prev) => ({ ...prev, [colId]: !(prev[colId] !== false) }))
                      }
                    />
                    <span>{formatColumnLabel(colId)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {successMessage ? (
        <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs text-emerald-800 sm:text-sm">
          {successMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-4 text-center text-xs text-slate-600 sm:text-sm">
          Loading patients...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-xs text-rose-700 sm:text-sm">{error}</div>
      ) : (
        <>
          <div className="min-w-0 max-w-full overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-max border-collapse text-[11px] text-slate-700 sm:text-xs">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className={`${CELL_PAD} w-10 min-w-[2.5rem] align-top text-left font-semibold`}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAllOnPage}
                      disabled={patients.length === 0}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      aria-label="Select all patients on this page"
                    />
                  </th>
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
                      className={`${CELL_PAD} min-w-0 align-top text-left font-semibold whitespace-nowrap ${LONG_TEXT_COLUMNS.has(colId) ? LONG_TEXT_COL : ''}`}
                    >
                      <span className="flex min-w-0 items-start gap-1">
                        <span className="mt-0.5 shrink-0 text-slate-400 leading-none">⋮</span>
                        <span className="min-w-0 flex-1">{renderColumnHeaderLabel(colId)}</span>
                        {colId === 'full_name' ? (
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
                                setShowActiveFilterMenu(false)
                                setShowLocationTypeFilterMenu(false)
                                setListOrdering((prev) => (prev === 'first_name' ? '' : 'first_name'))
                              }}
                              className={`rounded p-0 leading-none transition-colors hover:bg-indigo-100 ${
                                listOrdering === 'first_name' ? 'text-indigo-600' : 'text-slate-400'
                              }`}
                              title="Sort full name A → Z"
                              aria-label="Sort full name ascending"
                              aria-pressed={listOrdering === 'first_name'}
                            >
                              <FiChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              draggable={false}
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowActiveFilterMenu(false)
                                setShowLocationTypeFilterMenu(false)
                                setListOrdering((prev) => (prev === '-first_name' ? '' : '-first_name'))
                              }}
                              className={`-mt-0.5 rounded p-0 leading-none transition-colors hover:bg-indigo-100 ${
                                listOrdering === '-first_name' ? 'text-indigo-600' : 'text-slate-400'
                              }`}
                              title="Sort full name Z → A"
                              aria-label="Sort full name descending"
                              aria-pressed={listOrdering === '-first_name'}
                            >
                              <FiChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ) : null}
                        {colId === 'patient_id' ? (
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
                                setShowActiveFilterMenu(false)
                                setShowLocationTypeFilterMenu(false)
                                setListOrdering((prev) => (prev === 'patient_id' ? '' : 'patient_id'))
                              }}
                              className={`rounded p-0 leading-none transition-colors hover:bg-indigo-100 ${
                                listOrdering === 'patient_id' ? 'text-indigo-600' : 'text-slate-400'
                              }`}
                              title="Sort patient ID ascending"
                              aria-label="Sort patient ID ascending"
                              aria-pressed={listOrdering === 'patient_id'}
                            >
                              <FiChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              draggable={false}
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowActiveFilterMenu(false)
                                setShowLocationTypeFilterMenu(false)
                                setListOrdering((prev) => (prev === '-patient_id' ? '' : '-patient_id'))
                              }}
                              className={`-mt-0.5 rounded p-0 leading-none transition-colors hover:bg-indigo-100 ${
                                listOrdering === '-patient_id' ? 'text-indigo-600' : 'text-slate-400'
                              }`}
                              title="Sort patient ID descending"
                              aria-label="Sort patient ID descending"
                              aria-pressed={listOrdering === '-patient_id'}
                            >
                              <FiChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ) : null}
                        {colId === 'location_type' ? (
                          <span className="relative shrink-0" ref={locationTypeFilterRef}>
                            <button
                              type="button"
                              draggable={false}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowLocationTypeFilterMenu((prev) => !prev)
                                setShowActiveFilterMenu(false)
                              }}
                              className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none hover:bg-slate-200/80 ${
                                locationTypeFilter ? 'text-indigo-600' : 'text-slate-400'
                              }`}
                              title={
                                locationTypeFilter
                                  ? `Filter by location type: ${
                                      LOCATION_TYPE_FILTER_OPTIONS.find((o) => o.value === locationTypeFilter)
                                        ?.label || locationTypeFilter
                                    }`
                                  : 'Filter by location type'
                              }
                              aria-label="Filter by location type"
                              aria-expanded={showLocationTypeFilterMenu}
                            >
                              ▼
                            </button>
                            {showLocationTypeFilterMenu ? (
                              <div
                                className="absolute right-0 top-full z-20 mt-1 min-w-[8.5rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                {LOCATION_TYPE_FILTER_OPTIONS.map((option) => (
                                  <button
                                    key={option.value || 'all'}
                                    type="button"
                                    onClick={() => {
                                      setLocationTypeFilter(option.value)
                                      setShowLocationTypeFilterMenu(false)
                                    }}
                                    className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-50 ${
                                      locationTypeFilter === option.value
                                        ? 'font-semibold text-indigo-700'
                                        : 'text-slate-700'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </span>
                        ) : null}
                        {colId === 'is_active' ? (
                          <span className="relative shrink-0" ref={activeFilterRef}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowActiveFilterMenu((prev) => !prev)
                                setShowLocationTypeFilterMenu(false)
                              }}
                              className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none hover:bg-slate-200/80 ${
                                activeFilter === null ? 'text-slate-400' : 'text-indigo-600'
                              }`}
                              title="Filter by active status"
                              aria-label="Filter by active status"
                            >
                              ▼
                            </button>
                            {showActiveFilterMenu ? (
                              <div
                                className="absolute right-0 top-full z-20 mt-1 min-w-[7rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveFilter(null)
                                    setShowActiveFilterMenu(false)
                                  }}
                                  className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-50 ${
                                    activeFilter === null ? 'font-semibold text-indigo-700' : 'text-slate-700'
                                  }`}
                                >
                                  All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveFilter(true)
                                    setShowActiveFilterMenu(false)
                                  }}
                                  className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-50 ${
                                    activeFilter === true ? 'font-semibold text-indigo-700' : 'text-slate-700'
                                  }`}
                                >
                                  Active
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveFilter(false)
                                    setShowActiveFilterMenu(false)
                                  }}
                                  className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-50 ${
                                    activeFilter === false ? 'font-semibold text-indigo-700' : 'text-slate-700'
                                  }`}
                                >
                                  Inactive
                                </button>
                              </div>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                    </th>
                  ))}
                  {isVsreOwner ? (
                    <th className={`${CELL_PAD} min-w-[7.5rem] align-top text-left font-semibold whitespace-nowrap`}>
                      Actions
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {patients.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(visibleColumns.length + 1 + (isVsreOwner ? 1 : 0), 1)}
                      className={`${CELL_PAD} text-center text-slate-500`}
                    >
                      No patients found for this page.
                    </td>
                  </tr>
                ) : (
                  patients.map((patient, index) => {
                    const rowKey = getCustomerRowKey(patient, index)
                    const isSelected = Boolean(selectedCustomersById[rowKey])
                    const isDeletingRow = deletingCustomerIds.has(String(patient?.id))
                    return (
                    <tr
                      key={rowKey}
                      className={`border-t border-slate-100 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} ${isSelected ? 'ring-1 ring-inset ring-indigo-200 bg-indigo-50/30' : ''}`}
                    >
                      <td className={`${CELL_PAD} align-top`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCustomerSelection(patient, index)}
                          disabled={isDeletingRow}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                          aria-label={`Select patient ${rowKey}`}
                        />
                      </td>
                      {visibleColumns.map((colId) => (
                        <td
                          key={colId}
                          className={`${CELL_PAD} overflow-hidden align-top ${LONG_TEXT_COLUMNS.has(colId) ? LONG_TEXT_COL : 'min-w-0 break-words'}`}
                        >
                          {renderTableCellContent(patient, colId, {
                            onEmrCountClick: setEmrModalPatient,
                          })}
                        </td>
                      ))}
                      {isVsreOwner ? (
                        <td className={`${CELL_PAD} align-top whitespace-nowrap`}>
                          <div className="flex flex-wrap items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditCustomer(patient)}
                              disabled={isLoading || isDeletingRow}
                              className="inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 sm:text-[11px]"
                              title={`Edit ${customerDisplayName(patient)}`}
                            >
                              <FiEdit2 className="h-3 w-3" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomer(patient)}
                              disabled={isLoading || isDeletingRow}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 sm:text-[11px]"
                              title={`Delete ${customerDisplayName(patient)}`}
                            >
                              <FiTrash2 className="h-3 w-3" />
                              {isDeletingRow ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 sm:text-xs">
            <p>
              Page <span className="font-semibold text-slate-900">{pagination.currentPage}</span> of{' '}
              <span className="font-semibold text-slate-900">{pagination.totalPages}</span>
              {pagination.count ? <span className="text-slate-500"> ({pagination.count} total)</span> : null}
              {selectedCount > 0 ? (
                <span className="text-indigo-700"> · {selectedCount} selected</span>
              ) : null}
              {visibleColumns.length ? (
                <span className="text-slate-500"> · {visibleColumns.length} columns visible</span>
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!pagination.previous || isLoading}
                onClick={() => {
                  const requestUrl = buildPatientsRequestUrl(pagination.previous)
                  if (requestUrl) fetchPatients(requestUrl)
                }}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!pagination.next || isLoading}
                onClick={() => {
                  const requestUrl = buildPatientsRequestUrl(pagination.next)
                  if (requestUrl) fetchPatients(requestUrl)
                }}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
    </>
  )
}

export default CustomerMaster
