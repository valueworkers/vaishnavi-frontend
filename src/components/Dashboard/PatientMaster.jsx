import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import * as XLSX from 'xlsx'

const COLUMN_ORDER_DEFAULT = [
  'patient_name',
  'patient_id',
  'phone',
  'address',
  'age',
  'emergency_contact',
  'emergency_phone',
  'is_registration_fees_paid',
  'registration_date',
  'name_registered_by',
  'status',
]

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

const COLUMN_LABELS = {
  patient_name: 'Patient Name',
  patient_id: 'Patient ID',
  phone: 'Mobile Number',
  address: 'Address',
  age: 'Age',
  emergency_contact: 'Emergency Contact Name',
  emergency_phone: 'Emergency Contact Number',
  is_registration_fees_paid: 'Registration Fee Paid',
  registration_date: 'Registration Date',
  name_registered_by: 'Registered By',
  status: 'Status',
}

const COLUMN_HEADER_LINES = {
  patient_name: ['Patient', 'Name'],
  patient_id: ['Patient', 'ID'],
  phone: ['Mobile', 'Number'],
  address: ['Address'],
  age: ['Age'],
  emergency_contact: ['Emergency', 'Contact'],
  emergency_phone: ['Emergency', 'Phone'],
  is_registration_fees_paid: ['Registration', 'Fee Paid'],
  registration_date: ['Registration', 'Date'],
  name_registered_by: ['Registered', 'By'],
  status: ['Status'],
}

const renderColumnHeaderLabel = (colId) => {
  const lines = COLUMN_HEADER_LINES[colId] || [COLUMN_LABELS[colId]]
  return lines.map((line) => (
    <span key={line} className="block leading-tight">
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

/** Numeric page_size for API: presets or exact total patient count. */
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

const withStatusFilter = (requestUrl, statusFilter) => {
  if (!requestUrl) return null
  try {
    const url = new URL(requestUrl)
    if (statusFilter === true) {
      url.searchParams.set('status', 'true')
    } else if (statusFilter === false) {
      url.searchParams.set('status', 'false')
    } else {
      url.searchParams.delete('status')
    }
    return url.toString()
  } catch {
    return requestUrl
  }
}

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const readValue = (value) => {
  if (value == null) return '-'
  const text = String(value).trim()
  return text || '-'
}

const formatRegistrationDate = (iso) => {
  if (iso == null || iso === '') return '-'
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return readValue(iso)
  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const readCellValue = (patient, columnId) => {
  if (columnId === 'patient_name') {
    const first = String(patient?.first_name ?? '').trim()
    const last = String(patient?.last_name ?? '').trim()
    const combined = [first, last].filter(Boolean).join(' ')
    if (combined) return combined
    return readValue(patient?.full_name)
  }
  if (columnId === 'registration_date') return formatRegistrationDate(patient?.registration_date)
  const value = patient?.[columnId]
  if (columnId === 'is_registration_fees_paid') return value ? 'Yes' : 'No'
  if (columnId === 'status') {
    if (typeof value === 'boolean') return value ? 'Active' : 'Inactive'
    return readValue(value)
  }
  return readValue(value)
}

/** Compact table: address truncates; full text on hover via native tooltip. */
const CELL_PAD = 'px-1.5 py-1 sm:px-2 sm:py-1.5'
const ADDRESS_COL = 'min-w-0 max-w-[7.5rem] sm:max-w-[9.5rem]'

const renderTableCellContent = (patient, colId) => {
  const value = readCellValue(patient, colId)
  if (colId === 'address') {
    const tip = value && value !== '-' ? value : undefined
    return (
      <span className="block min-w-0 cursor-default truncate" title={tip}>
        {value}
      </span>
    )
  }
  return value
}

const PatientMaster = () => {
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
  const [columnOrder, setColumnOrder] = useState(COLUMN_ORDER_DEFAULT)
  const [columnVisibility, setColumnVisibility] = useState(() =>
    Object.fromEntries(COLUMN_ORDER_DEFAULT.map((id) => [id, true]))
  )
  const [showColumnChooser, setShowColumnChooser] = useState(false)
  const [dragColId, setDragColId] = useState(null)
  const [statusFilter, setStatusFilter] = useState(null)
  const [showStatusFilterMenu, setShowStatusFilterMenu] = useState(false)
  const chooserRef = useRef(null)
  const statusFilterRef = useRef(null)
  const totalCountRef = useRef(0)

  const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')

  const buildPatientsRequestUrl = (href = null) => {
    const resolved = href ? resolveRequestUrl(href, baseUrl) : `${baseUrl}/booking/patients/`
    if (!resolved) return null
    const size = resolveRequestPageSize(pageSize, totalCountRef.current)
    return withStatusFilter(withPageSize(withSearch(resolved, appliedSearch), size), statusFilter)
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
      setPatients(Array.isArray(data.results) ? data.results : [])
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
  }, [baseUrl, pageSize, appliedSearch, statusFilter])

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

  const visibleColumns = useMemo(
    () => columnOrder.filter((id) => columnVisibility[id] !== false),
    [columnOrder, columnVisibility]
  )

  const rowsSelectValue = String(pageSize)

  const showTotalCountOption =
    pagination.count > 0 && !PAGE_SIZE_PRESETS.includes(pagination.count)

  const showingAllPatients =
    pagination.count > 0 && Number(pageSize) === pagination.count

  const exportPdf = () => {
    if (!visibleColumns.length) {
      setError('Please keep at least one visible column before exporting.')
      return
    }
    const printWindow = window.open('', '_blank', 'width=1100,height=800')
    if (!printWindow) {
      setError('Unable to open print window. Please allow popups.')
      return
    }

    const headers = visibleColumns.map((id) => `<th>${escapeHtml(COLUMN_LABELS[id])}</th>`).join('')
    const rows = patients
      .map((patient) => {
        const cells = visibleColumns
          .map((id) => `<td>${escapeHtml(readCellValue(patient, id))}</td>`)
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')

    printWindow.document.write(`
      <html>
        <head>
          <title>Patient Master</title>
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
          <h2>Patient Master</h2>
          <p>Total Records: ${patients.length}</p>
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
    if (!visibleColumns.length) {
      setError('Please keep at least one visible column before exporting.')
      return
    }
    setError('')
    try {
      const headerRow = visibleColumns.map((id) => COLUMN_LABELS[id])
      const dataRows = patients.map((patient) =>
        visibleColumns.map((id) => readCellValue(patient, id))
      )
      const sheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, sheet, 'Patients')
      const safePage = pagination.currentPage ?? 1
      const stamp = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(workbook, `patient-master-p${safePage}-${stamp}.xlsx`)
    } catch (e) {
      setError(e?.message || 'Unable to export Excel file.')
    }
  }

  return (
    <div className="min-w-0 w-full max-w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 sm:text-base">Patient Master</h3>
          <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">
            View and manage patient contact and emergency details.
          </p>
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
          <label className="text-xs font-semibold text-slate-600" htmlFor="patient-page-size">
            Rows:
          </label>
          <select
            id="patient-page-size"
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
            onClick={exportPdf}
            className="rounded-md border border-indigo-600 bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 sm:text-xs"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="rounded-md border border-emerald-700 bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 sm:text-xs"
          >
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => setShowColumnChooser((prev) => !prev)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 sm:text-xs"
          >
            Column Chooser
          </button>
          {showColumnChooser && (
            <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg sm:w-72 sm:p-2.5">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Choose columns</p>
              <p className="mb-2 text-[11px] text-slate-400">Toggle columns. Reorder by dragging table headers.</p>
              <div className="space-y-1">
                {columnOrder.map((colId) => (
                  <label key={colId} className="flex items-center gap-2 rounded px-1 py-1 text-xs text-slate-700 hover:bg-slate-50">
                    <span className="w-4 text-slate-300">•</span>
                    <input
                      type="checkbox"
                      checked={columnVisibility[colId] !== false}
                      onChange={() =>
                        setColumnVisibility((prev) => ({ ...prev, [colId]: !(prev[colId] !== false) }))
                      }
                    />
                    <span>{COLUMN_LABELS[colId]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-4 text-center text-xs text-slate-600 sm:text-sm">
          Loading patients...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-xs text-rose-700 sm:text-sm">{error}</div>
      ) : (
        <>
          <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full table-fixed border-collapse text-[11px] text-slate-700 sm:text-xs">
              <thead className="bg-slate-100 text-slate-700">
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
                      className={`${CELL_PAD} min-w-0 align-top text-left font-semibold ${colId === 'address' ? ADDRESS_COL : ''}`}
                    >
                      <span className="flex min-w-0 items-start gap-1">
                        <span className="mt-0.5 shrink-0 text-slate-400 leading-none">⋮</span>
                        <span className="min-w-0 flex-1" title={COLUMN_LABELS[colId]}>
                          {renderColumnHeaderLabel(colId)}
                        </span>
                        {colId === 'status' ? (
                          <span className="relative shrink-0" ref={statusFilterRef}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowStatusFilterMenu((prev) => !prev)
                              }}
                              className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none hover:bg-slate-200/80 ${
                                statusFilter === null ? 'text-slate-400' : 'text-indigo-600'
                              }`}
                              title="Filter by status"
                              aria-label="Filter by status"
                            >
                              ▼
                            </button>
                            {showStatusFilterMenu ? (
                              <div
                                className="absolute right-0 top-full z-20 mt-1 min-w-[7rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStatusFilter(null)
                                    setShowStatusFilterMenu(false)
                                  }}
                                  className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-50 ${
                                    statusFilter === null ? 'font-semibold text-indigo-700' : 'text-slate-700'
                                  }`}
                                >
                                  All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStatusFilter(true)
                                    setShowStatusFilterMenu(false)
                                  }}
                                  className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-50 ${
                                    statusFilter === true ? 'font-semibold text-indigo-700' : 'text-slate-700'
                                  }`}
                                >
                                  Active
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStatusFilter(false)
                                    setShowStatusFilterMenu(false)
                                  }}
                                  className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-50 ${
                                    statusFilter === false ? 'font-semibold text-indigo-700' : 'text-slate-700'
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
                </tr>
              </thead>
              <tbody>
                {patients.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(visibleColumns.length, 1)} className={`${CELL_PAD} text-center text-slate-500`}>
                      No patients found for this page.
                    </td>
                  </tr>
                ) : (
                  patients.map((patient, index) => (
                    <tr
                      key={patient.id}
                      className={`border-t border-slate-100 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    >
                      {visibleColumns.map((colId) => (
                        <td
                          key={colId}
                          className={`${CELL_PAD} overflow-hidden align-top ${colId === 'address' ? ADDRESS_COL : 'min-w-0 break-words'}`}
                        >
                          {renderTableCellContent(patient, colId)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 sm:text-xs">
            <p>
              {showingAllPatients ? (
                <>
                  Showing all{' '}
                  <span className="font-semibold text-slate-900">{patients.length}</span>
                  {pagination.count ? (
                    <span className="text-slate-500"> of {pagination.count} patients</span>
                  ) : null}
                </>
              ) : (
                <>
                  Page <span className="font-semibold text-slate-900">{pagination.currentPage}</span> of{' '}
                  <span className="font-semibold text-slate-900">{pagination.totalPages}</span>
                  {pagination.count ? <span className="text-slate-500"> ({pagination.count} total)</span> : null}
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={showingAllPatients || !pagination.previous || isLoading}
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
                disabled={showingAllPatients || !pagination.next || isLoading}
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
  )
}

export default PatientMaster
