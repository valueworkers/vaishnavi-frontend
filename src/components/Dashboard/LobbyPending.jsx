import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import PackageEnquire from './PackageEnquire'

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatAmount = (value) => {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return value || '-'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

const formatDateOnly = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const ACTION_BUTTON_IDLE_CLASSES = {
  APPROVE: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
  REJECT: 'bg-rose-100 text-rose-800 hover:bg-rose-200',
  HOLD: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
}

const ORDER_STATUS_BADGE = {
  LOBBY: 'border-slate-200 bg-slate-100 text-slate-800',
  HOLD: 'border-amber-200 bg-amber-50 text-amber-900',
  CANCELLED: 'border-rose-200 bg-rose-50 text-rose-800',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
}

const formatOrderStatusLabel = (status) => {
  if (!status) return '-'
  return String(status)
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

const ACTION_TYPES = ['APPROVE', 'HOLD', 'REJECT']

const extractOrdersFromPayload = (payload) => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

const getPrimaryServiceLabel = (order) => {
  const label = order.service_name || order.service?.name
  return label || 'Not selected'
}

const resolveLobbyRequestUrl = (href) => {
  if (!href) return null
  const s = String(href)
  if (/^https?:\/\//i.test(s)) return s
  const base = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
  if (!base) return s
  return `${base}${s.startsWith('/') ? s : `/${s}`}`
}

const buildLobbyUrlWithStatus = (baseUrl, status) => {
  const normalizedBase = String(baseUrl || '').replace(/\/$/, '')
  const url = new URL(`${normalizedBase}/booking/lobby/`)
  if (status && status !== 'ALL') {
    url.searchParams.set('status', status)
  }
  return url.toString()
}

const initialPagination = () => ({
  next: null,
  previous: null,
  currentPage: 1,
  totalPages: 1,
  count: 0,
})

const MAIN_TABLE_COLUMNS = [
  { id: 'expand', label: '', locked: true },
  { id: 'patientName', label: 'Patient name' },
  { id: 'patientMobile', label: 'Patient mobile' },
  { id: 'serviceSelected', label: 'Service selected' },
  { id: 'packageSelected', label: 'Package selected' },
  { id: 'startDate', label: 'Start date' },
  { id: 'endDate', label: 'End date' },
  { id: 'actions', label: 'Actions' },
]

const SECONDARY_TABLE_COLUMNS = [
  { id: 'select', label: 'Select' },
  { id: 'orderId', label: 'Order ID' },
  { id: 'service', label: 'Service' },
  { id: 'serviceDate', label: 'Service Date' },
  { id: 'status', label: 'Status' },
  { id: 'package', label: 'Package' },
  { id: 'location', label: 'Location' },
  { id: 'amount', label: 'Amount' },
  { id: 'createdDate', label: 'Created Date' },
]

const toInitialVisibilityMap = (columns) =>
  columns.reduce((acc, col) => {
    acc[col.id] = true
    return acc
  }, {})

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

const getSelectedSecondaryIdsForOrder = (order, selectedSecondaryIds) => {
  const secondaryOrders = Array.isArray(order?.secondary_orders) ? order.secondary_orders : []
  return secondaryOrders
    .map((secondary) => secondary?.id)
    .filter((id) => Boolean(id) && Boolean(selectedSecondaryIds[id]))
}

const LobbyPending = () => {
  const [activeView, setActiveView] = useState('LOBBY')
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedMainRows, setExpandedMainRows] = useState({})
  const [actionLoadingByOrder, setActionLoadingByOrder] = useState({})
  const [pagination, setPagination] = useState(initialPagination)
  const [currentPageUrl, setCurrentPageUrl] = useState(null)
  const [openActionMenuOrderId, setOpenActionMenuOrderId] = useState(null)
  const [showColumnChooser, setShowColumnChooser] = useState(false)
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('')
  const [mainColumnVisibility, setMainColumnVisibility] = useState(() => toInitialVisibilityMap(MAIN_TABLE_COLUMNS))
  const [secondaryColumnVisibility, setSecondaryColumnVisibility] = useState(() => toInitialVisibilityMap(SECONDARY_TABLE_COLUMNS))
  const [mainColumnOrder, setMainColumnOrder] = useState(() => MAIN_TABLE_COLUMNS.map((col) => col.id))
  const [secondaryColumnOrder, setSecondaryColumnOrder] = useState(() => SECONDARY_TABLE_COLUMNS.map((col) => col.id))
  const [dragMainColId, setDragMainColId] = useState(null)
  const [dragSecondaryColId, setDragSecondaryColId] = useState(null)
  const [selectedSecondaryIds, setSelectedSecondaryIds] = useState({})
  const [pendingReasonAction, setPendingReasonAction] = useState(null)
  const [actionReasonText, setActionReasonText] = useState('')
  const [reasonModalError, setReasonModalError] = useState('')
  const [isReasonSubmitting, setIsReasonSubmitting] = useState(false)
  const actionMenuContainerRef = useRef(null)
  const actionTriggerRef = useRef(null)
  const columnChooserRef = useRef(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 })

  useEffect(() => {
    if (openActionMenuOrderId == null) return
    const onPointerDown = (event) => {
      const menu = actionMenuContainerRef.current
      const trigger = actionTriggerRef.current
      if (
        (menu && menu.contains(event.target)) ||
        (trigger && trigger.contains(event.target))
      ) return
      setOpenActionMenuOrderId(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [openActionMenuOrderId])

  useEffect(() => {
    if (!showColumnChooser) return
    const onPointerDown = (event) => {
      const chooser = columnChooserRef.current
      if (chooser && !chooser.contains(event.target)) {
        setShowColumnChooser(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [showColumnChooser])


  const fetchLobbyPage = async (requestUrl) => {
    setCurrentPageUrl(requestUrl)
    setIsLoading(true)
    setError('')
    try {
      const token = localStorage.getItem('access_token')
      const response = await axios.get(requestUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const data = response.data
      setOrders(extractOrdersFromPayload(data))
      setExpandedMainRows({})
      setSelectedSecondaryIds({})

      if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.results)) {
        setPagination({
          next: data.next ?? null,
          previous: data.previous ?? null,
          currentPage: data.current_page ?? 1,
          totalPages: data.total_pages ?? 1,
          count: data.count ?? data.results.length,
        })
      } else {
        const list = extractOrdersFromPayload(data)
        setPagination({
          next: null,
          previous: null,
          currentPage: 1,
          totalPages: 1,
          count: list.length,
        })
      }
    } catch (apiError) {
      const message =
        apiError.response?.data?.detail ||
        apiError.response?.data?.message ||
        'Unable to fetch pending approvals.'
      setError(message)
      setOrders([])
      setPagination(initialPagination())
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
    fetchLobbyPage(buildLobbyUrlWithStatus(baseUrl, selectedStatusFilter))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [])

  const toggleMainRow = (id) => {
    setExpandedMainRows((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const submitBulkAction = async ({ orderId, action, ids, reason = '' }) => {
    const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
    const actionUrl = `${baseUrl}/booking/lobby/${orderId}/bulk-action/`
    setActionLoadingByOrder((prev) => ({ ...prev, [orderId]: action }))
    setError('')

    try {
      const token = localStorage.getItem('access_token')
      await axios.post(actionUrl, {
        ids,
        action,
        reason,
        notify_customer: false,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })

      const reloadUrl = currentPageUrl || `${baseUrl}/booking/lobby/`
      await fetchLobbyPage(reloadUrl)
    } catch (apiError) {
      const message =
        apiError.response?.data?.detail ||
        apiError.response?.data?.message ||
        `Unable to ${action.toLowerCase()} this lobby booking.`
      setError(message)
    } finally {
      setActionLoadingByOrder((prev) => {
        const updated = { ...prev }
        delete updated[orderId]
        return updated
      })
    }
  }

  const handleActionClick = async (order, action) => {
    const orderId = order?.id
    if (!orderId) return
    setOpenActionMenuOrderId(null)
    if (!ACTION_TYPES.includes(action)) return

    const selectedIds = getSelectedSecondaryIdsForOrder(order, selectedSecondaryIds)
    if (selectedIds.length === 0) {
      setError('Select at least one secondary order before taking action.')
      return
    }
    setPendingReasonAction({ orderId, action, ids: selectedIds })
    setActionReasonText('')
    setReasonModalError('')
  }

  const closeReasonModal = () => {
    if (isReasonSubmitting) return
    setPendingReasonAction(null)
    setActionReasonText('')
    setReasonModalError('')
  }

  const handleReasonSubmit = async () => {
    if (!pendingReasonAction || isReasonSubmitting) return
    const trimmedReason = actionReasonText.trim()
    if (!trimmedReason) {
      setReasonModalError(`Reason is required to ${pendingReasonAction.action.toLowerCase()} selected bookings.`)
      return
    }
    setIsReasonSubmitting(true)
    try {
      await submitBulkAction({ ...pendingReasonAction, reason: trimmedReason })
      setPendingReasonAction(null)
      setActionReasonText('')
      setReasonModalError('')
    } finally {
      setIsReasonSubmitting(false)
    }
  }

  const isAnyActionLoading = Object.keys(actionLoadingByOrder).length > 0
  const visibleMainColumns = mainColumnOrder.filter((id) => {
    const col = MAIN_TABLE_COLUMNS.find((x) => x.id === id)
    return col?.locked ? true : mainColumnVisibility[id] !== false
  })
  const visibleSecondaryColumns = secondaryColumnOrder.filter((id) => secondaryColumnVisibility[id] !== false)

  return (
    <div className="p-1 sm:p-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <button
            type="button"
            onClick={() => setActiveView('LOBBY')}
            className={`shrink-0 px-1 text-xs font-semibold transition-colors ${
              activeView === 'LOBBY' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Lobby
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={activeView === 'PACKAGE_ENQUIRE'}
            aria-label="Toggle Lobby and Package Enquire"
            onClick={() =>
              setActiveView((prev) => (prev === 'LOBBY' ? 'PACKAGE_ENQUIRE' : 'LOBBY'))
            }
            className={`relative inline-flex h-7 w-12 shrink-0 items-center overflow-hidden rounded-full transition-colors ${
              activeView === 'PACKAGE_ENQUIRE' ? 'bg-indigo-500' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                activeView === 'PACKAGE_ENQUIRE' ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => setActiveView('PACKAGE_ENQUIRE')}
            className={`shrink-0 px-1 text-xs font-semibold transition-colors ${
              activeView === 'PACKAGE_ENQUIRE' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Package Enquire
          </button>
        </div>

        {activeView !== 'PACKAGE_ENQUIRE' && (
          <div className="flex items-center justify-end gap-2">
            {selectedStatusFilter && (
              <button
                type="button"
                onClick={() => {
                  setSelectedStatusFilter('')
                  const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
                  fetchLobbyPage(buildLobbyUrlWithStatus(baseUrl, ''))
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                <span>Status: {selectedStatusFilter.charAt(0) + selectedStatusFilter.slice(1).toLowerCase()}</span>
                <span aria-hidden>×</span>
              </button>
            )}
            <div className="relative" ref={columnChooserRef}>
              <button
                type="button"
                onClick={() => setShowColumnChooser((prev) => !prev)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Column Chooser
              </button>
              {showColumnChooser && (
                <div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Main table columns</p>
                <p className="mb-2 text-[11px] text-slate-400">Toggle visibility only. Reorder by dragging table headers.</p>
                <div className="space-y-1 border-b border-slate-100 pb-2">
                  {mainColumnOrder.map((colId) => {
                    const col = MAIN_TABLE_COLUMNS.find((x) => x.id === colId)
                    if (!col) return null
                    return (
                      <label
                        key={colId}
                        className="flex items-center gap-2 rounded px-1 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <span className="w-4 text-slate-300">{col.locked ? '—' : '•'}</span>
                        <input
                          type="checkbox"
                          checked={col.locked ? true : mainColumnVisibility[colId] !== false}
                          disabled={col.locked}
                          onChange={() => {
                            if (col.locked) return
                            setMainColumnVisibility((prev) => ({ ...prev, [colId]: !(prev[colId] !== false) }))
                          }}
                        />
                        <span>{col.label || 'Expand'}</span>
                      </label>
                    )
                  })}
                </div>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Secondary table columns</p>
                <div className="mt-1 space-y-1">
                  {secondaryColumnOrder.map((colId) => {
                    const col = SECONDARY_TABLE_COLUMNS.find((x) => x.id === colId)
                    if (!col) return null
                    return (
                      <label
                        key={colId}
                        className="flex items-center gap-2 rounded px-1 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <span className="w-4 text-slate-300">•</span>
                        <input
                          type="checkbox"
                          checked={secondaryColumnVisibility[colId] !== false}
                          onChange={() =>
                            setSecondaryColumnVisibility((prev) => ({ ...prev, [colId]: !(prev[colId] !== false) }))
                          }
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
        )}
      </div>

      {activeView === 'PACKAGE_ENQUIRE' ? (
        <PackageEnquire />
      ) : (
      <>
      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          Loading pending approvals...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          No pending approvals found.
        </div>
      ) : (
        <>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                {visibleMainColumns.map((colId) => {
                  if (colId === 'expand') return <th key={colId} className="px-2 py-1 text-left font-semibold w-[60px]"></th>
                  const col = MAIN_TABLE_COLUMNS.find((x) => x.id === colId)
                  const sharedDragProps = {
                    draggable: true,
                    onDragStart: (e) => { setDragMainColId(colId); e.dataTransfer.effectAllowed = 'move' },
                    onDragEnd: () => setDragMainColId(null),
                    onDragOver: (e) => { if (!dragMainColId || dragMainColId === colId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move' },
                    onDrop: (e) => { e.preventDefault(); setMainColumnOrder((prev) => reorderColumns(prev, dragMainColId, colId)); setDragMainColId(null) },
                  }
                  return (
                    <th
                      key={colId}
                      {...sharedDragProps}
                      className={`px-2 py-1 text-left font-semibold ${colId === 'actions' ? 'w-[140px]' : ''}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <span className="text-slate-400">⋮</span>
                        {col?.label}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const isMainExpanded = Boolean(expandedMainRows[order.id])
                const secondaryOrders = Array.isArray(order.secondary_orders) ? order.secondary_orders : []
                const selectedSecondaryCount = secondaryOrders
                  .map((secondary) => secondary?.id)
                  .filter((id) => Boolean(id) && Boolean(selectedSecondaryIds[id]))
                  .length

                return (
                  <Fragment key={`main-group-${order.id}`}>
                    <tr className="border-t border-slate-200 text-xs text-slate-700">
                      {visibleMainColumns.map((colId) => {
                        if (colId === 'expand') {
                          return (
                            <td key={colId} className="px-2 py-1">
                              <button
                                type="button"
                                onClick={() => toggleMainRow(order.id)}
                                className="h-5 w-5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 text-[12px] font-bold leading-none flex items-center justify-center"
                                aria-label={isMainExpanded ? 'Collapse secondary orders' : 'Expand secondary orders'}
                              >
                                {isMainExpanded ? '-' : '+'}
                              </button>
                            </td>
                          )
                        }
                        if (colId === 'patientName') return <td key={colId} className="px-2 py-1 font-medium text-slate-800 whitespace-nowrap">{order.patient?.name || '-'}</td>
                        if (colId === 'patientMobile') return <td key={colId} className="px-2 py-1 text-slate-700 whitespace-nowrap">{order.patient?.mobile || order.patient?.phone || '-'}</td>
                        if (colId === 'serviceSelected') return <td key={colId} className="px-2 py-1 text-slate-700 whitespace-nowrap">{getPrimaryServiceLabel(order)}</td>
                        if (colId === 'packageSelected') return <td key={colId} className="px-2 py-1 text-slate-700 whitespace-nowrap">{order.package_name || 'Not selected'}</td>
                        if (colId === 'startDate') return <td key={colId} className="px-2 py-1 whitespace-nowrap">{formatDateOnly(order.start_datetime)}</td>
                        if (colId === 'endDate') return <td key={colId} className="px-2 py-1 whitespace-nowrap">{formatDateOnly(order.end_datetime)}</td>
                        if (colId === 'actions') {
                          return (
                            <td key={colId} className="px-2 py-1">
                              <button
                                type="button"
                                ref={openActionMenuOrderId === order.id ? actionTriggerRef : undefined}
                                disabled={Boolean(actionLoadingByOrder[order.id]) || isLoading || selectedSecondaryCount === 0}
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                                  setOpenActionMenuOrderId((prev) => (prev === order.id ? null : order.id))
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                aria-expanded={openActionMenuOrderId === order.id}
                                aria-haspopup="menu"
                              >
                                {actionLoadingByOrder[order.id] ? 'Processing…' : 'Actions'}
                                <span className="text-slate-500" aria-hidden>▾</span>
                              </button>
                              {openActionMenuOrderId === order.id && !actionLoadingByOrder[order.id] && createPortal(
                                <div
                                  ref={actionMenuContainerRef}
                                  style={{ position: 'fixed', top: menuPosition.top, right: menuPosition.right, zIndex: 9999 }}
                                  className="min-w-40 rounded-lg border border-slate-200 bg-white py-0.5 shadow-lg"
                                  role="menu"
                                >
                                  {ACTION_TYPES.map((action) => {
                                    const isDisabled = Boolean(actionLoadingByOrder[order.id]) || isLoading
                                    return (
                                      <button
                                        key={action}
                                        type="button"
                                        role="menuitem"
                                        disabled={isDisabled}
                                        onClick={() => handleActionClick(order, action)}
                                        className={`flex w-full items-center px-2 py-1 text-left text-[11px] font-semibold transition-colors ${
                                          ACTION_BUTTON_IDLE_CLASSES[action]
                                        } disabled:cursor-not-allowed disabled:opacity-60 rounded-none first:rounded-t-md last:rounded-b-md`}
                                      >
                                        {action.charAt(0) + action.slice(1).toLowerCase()}
                                      </button>
                                    )
                                  })}
                                </div>,
                                document.body
                              )}
                            </td>
                          )
                        }
                        return null
                      })}
                    </tr>

                    {isMainExpanded && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={visibleMainColumns.length} className="px-2 py-1.5">
                          {secondaryOrders.length === 0 ? (
                            <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-500">
                              No secondary orders
                            </div>
                          ) : (
                            <>
                             
                              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                <table className="min-w-full text-xs">
                              <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                  {visibleSecondaryColumns.map((colId) => {
                                    const col = SECONDARY_TABLE_COLUMNS.find((x) => x.id === colId)
                                    const selectableIds = secondaryOrders.map((secondary) => secondary.id).filter(Boolean)
                                    const selectedCount = selectableIds.filter((id) => selectedSecondaryIds[id]).length
                                    return (
                                      <th
                                        key={colId}
                                        draggable
                                        onDragStart={(e) => {
                                          setDragSecondaryColId(colId)
                                          e.dataTransfer.effectAllowed = 'move'
                                        }}
                                        onDragEnd={() => setDragSecondaryColId(null)}
                                        onDragOver={(e) => {
                                          if (!dragSecondaryColId || dragSecondaryColId === colId) return
                                          e.preventDefault()
                                          e.dataTransfer.dropEffect = 'move'
                                        }}
                                        onDrop={(e) => {
                                          e.preventDefault()
                                          setSecondaryColumnOrder((prev) => reorderColumns(prev, dragSecondaryColId, colId))
                                          setDragSecondaryColId(null)
                                        }}
                                        className="px-2 py-1 text-left font-semibold"
                                      >
                                        {colId === 'select' ? (
                                          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                                            <input
                                              type="checkbox"
                                              checked={selectableIds.length > 0 && selectedCount === selectableIds.length}
                                              onChange={(e) => {
                                                const checked = e.target.checked
                                                setSelectedSecondaryIds((prev) => {
                                                  const next = { ...prev }
                                                  selectableIds.forEach((id) => {
                                                    if (checked) next[id] = true
                                                    else delete next[id]
                                                  })
                                                  return next
                                                })
                                              }}
                                            />
                                            {selectedCount > 0 ? `${selectedCount} selected` : 'Select'}
                                          </label>
                                        ) : (
                                          <span className="inline-flex items-center gap-1">
                                            <span className="text-slate-400">⋮</span>
                                            {col?.label}
                                          </span>
                                        )}
                                      </th>
                                    )
                                  })}
                                </tr>
                              </thead>
                              <tbody>
                                {secondaryOrders.map((secondary) => (
                                  <Fragment key={`secondary-${secondary.id}`}>
                                    <tr className="border-t border-slate-100 text-slate-700">
                                      {visibleSecondaryColumns.map((colId) => {
                                        if (colId === 'select') {
                                          return (
                                            <td key={colId} className="px-2 py-1">
                                              <input
                                                type="checkbox"
                                                checked={Boolean(selectedSecondaryIds[secondary.id])}
                                                onChange={(e) => {
                                                  const checked = e.target.checked
                                                  setSelectedSecondaryIds((prev) => {
                                                    const next = { ...prev }
                                                    if (checked) next[secondary.id] = true
                                                    else delete next[secondary.id]
                                                    return next
                                                  })
                                                }}
                                              />
                                            </td>
                                          )
                                        }
                                        if (colId === 'orderId') return <td key={colId} className="px-2 py-1 font-medium">{secondary.order_id || '-'}</td>
                                        if (colId === 'service') return <td key={colId} className="px-2 py-1">{secondary.service_name || '-'}</td>
                                        if (colId === 'serviceDate') return <td key={colId} className="px-2 py-1">{formatDateTime(secondary.start_datetime)} - {formatDateTime(secondary.end_datetime)}</td>
                                        if (colId === 'status') {
                                          return (
                                            <td key={colId} className="px-2 py-1">
                                              {secondary.status ? (
                                                <span
                                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                                    ORDER_STATUS_BADGE[secondary.status] ||
                                                    'border-slate-200 bg-slate-50 text-slate-700'
                                                  }`}
                                                >
                                                  {formatOrderStatusLabel(secondary.status)}
                                                </span>
                                              ) : (
                                                <span className="text-slate-400">-</span>
                                              )}
                                            </td>
                                          )
                                        }
                                        if (colId === 'package') return <td key={colId} className="px-2 py-1">{secondary.package_name || '-'}</td>
                                        if (colId === 'location') return <td key={colId} className="px-2 py-1">{order.client_address || order.venue_name || '-'}</td>
                                        if (colId === 'amount') return <td key={colId} className="px-2 py-1">{formatAmount(secondary.subtotal)}</td>
                                        if (colId === 'createdDate') return <td key={colId} className="px-2 py-1">{formatDateTime(secondary.created_at)}</td>
                                        return null
                                      })}
                                    </tr>
                                    {Array.isArray(secondary.ternary_orders) &&
                                      secondary.ternary_orders.map((tertiary) => (
                                        <tr
                                          key={`tertiary-${tertiary.id}`}
                                          className="border-t border-slate-100 bg-emerald-50/60 text-slate-700"
                                        >
                                          {visibleSecondaryColumns.map((colId) => {
                                            if (colId === 'select') return <td key={colId} className="px-2 py-1 text-slate-300">-</td>
                                            if (colId === 'orderId') return <td key={colId} className="px-2 py-1 font-medium">↳ {tertiary.order_id || '-'}</td>
                                            if (colId === 'service') return <td key={colId} className="px-2 py-1">{tertiary.service_name || '-'}</td>
                                            if (colId === 'serviceDate') return <td key={colId} className="px-2 py-1">{formatDateTime(tertiary.start_datetime)} - {formatDateTime(tertiary.end_datetime)}</td>
                                            if (colId === 'status') {
                                              return (
                                                <td key={colId} className="px-2 py-1">
                                                  {tertiary.status ? (
                                                    <span
                                                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                                        ORDER_STATUS_BADGE[tertiary.status] ||
                                                        'border-slate-200 bg-slate-50 text-slate-700'
                                                      }`}
                                                    >
                                                      {formatOrderStatusLabel(tertiary.status)}
                                                    </span>
                                                  ) : (
                                                    <span className="text-slate-400">-</span>
                                                  )}
                                                </td>
                                              )
                                            }
                                            if (colId === 'package') return <td key={colId} className="px-2 py-1">{tertiary.package_name || '-'}</td>
                                            if (colId === 'location') return <td key={colId} className="px-2 py-1">{order.client_address || order.venue_name || '-'}</td>
                                            if (colId === 'amount') return <td key={colId} className="px-2 py-1">{formatAmount(tertiary.subtotal || tertiary.total_bill)}</td>
                                            if (colId === 'createdDate') return <td key={colId} className="px-2 py-1">{formatDateTime(tertiary.created_at)}</td>
                                            return null
                                          })}
                                        </tr>
                                      ))}
                                  </Fragment>
                                ))}
                                </tbody>
                              </table>
                            </div>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
          <p className="text-slate-600">
            Page <span className="font-semibold text-slate-900">{pagination.currentPage}</span> of{' '}
            <span className="font-semibold text-slate-900">{pagination.totalPages}</span>
            {pagination.count > 0 ? (
              <span className="text-slate-500"> ({pagination.count} total)</span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!pagination.previous || isLoading || isAnyActionLoading}
              onClick={() => {
                const url = resolveLobbyRequestUrl(pagination.previous)
                if (url) fetchLobbyPage(url)
              }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!pagination.next || isLoading || isAnyActionLoading}
              onClick={() => {
                const url = resolveLobbyRequestUrl(pagination.next)
                if (url) fetchLobbyPage(url)
              }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
        </>
      )}
      </>
      )}
      {pendingReasonAction && createPortal(
        <div className="fixed inset-0 z-10000 flex items-center justify-center bg-slate-900/35 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">
              Add reason for {pendingReasonAction.action.toLowerCase()}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              This reason will be sent for {pendingReasonAction.ids.length} selected booking(s).
            </p>
            <textarea
              value={actionReasonText}
              onChange={(e) => {
                setActionReasonText(e.target.value)
                if (reasonModalError) setReasonModalError('')
              }}
              disabled={isReasonSubmitting}
              rows={4}
              placeholder="Enter reason..."
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            {reasonModalError ? (
              <p className="mt-2 text-xs font-medium text-rose-600">{reasonModalError}</p>
            ) : null}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeReasonModal}
                disabled={isReasonSubmitting}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReasonSubmit}
                disabled={isReasonSubmitting}
                className="rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                {isReasonSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default LobbyPending
