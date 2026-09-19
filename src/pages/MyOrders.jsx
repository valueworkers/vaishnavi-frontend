import { Fragment, useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import {
  FiCalendar,
  FiMapPin,
  FiUser,
  FiSearch,
  FiDownload,
  FiExternalLink,
  FiCheckCircle,
  FiXCircle,
  FiClock,
  FiPackage,
  FiChevronLeft,
  FiChevronRight,
} from 'react-icons/fi'
import { hasOwnerPrivileges } from '../utils/authRoles'

const MyOrders = () => {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [authUser, setAuthUser] = useState(null)
  const [bookings, setBookings] = useState([])
  const [expandedRows, setExpandedRows] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [pagination, setPagination] = useState({
    count: 0,
    totalPages: 1,
    currentPage: 1,
    next: null,
    previous: null,
  })

  const baseUrl = () => `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '')

  const resolveApiUrl = (href) => {
    if (!href) return null
    const s = String(href)
    if (/^https?:\/\//i.test(s)) return s
    const base = baseUrl()
    if (!base) return s
    return `${base}${s.startsWith('/') ? s : `/${s}`}`
  }

  // Fetch bookings from API
  const fetchBookings = async (url = null) => {
    setIsLoading(true)
    try {
      const accessToken = localStorage.getItem('access_token')
      if (!accessToken) {
        console.error('Authorization token missing')
        setIsLoading(false)
        return
      }

      const apiUrl = url ? resolveApiUrl(url) || url : `${baseUrl()}/booking/bookings/`
      const response = await axios.get(apiUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.data) {
        // Backend may return result[] or results[]
        const resultsList = response.data.result ?? response.data.results ?? []
        const statusMap = {
          BOOKED: 'active',
          DRAFT: 'upcoming',
          IN_PROGRESS: 'active',
          CANCELLED: 'cancelled',
          COMPLETED: 'completed',
          YET_TO_START: 'upcoming',
        }

        const mappedBookings = resultsList.map((booking) => {
          const patient = booking.patient || {}
          const totalAmount = parseFloat(booking.total_bill ?? booking.subtotal ?? 0)
          const secondaryOrders = booking.secondary_orders || booking.children || []
          const primaryServiceName = String(booking.service_name || '').trim()
          const primaryPackageName = String(booking.package_name || '').trim()
          const combinedServicePackage = [primaryServiceName, primaryPackageName]
            .filter(Boolean)
            .filter((value, index, arr) => arr.findIndex((x) => x.toLowerCase() === value.toLowerCase()) === index)
            .join(' / ')
          const bookingType = (booking.booking_type || '').toUpperCase()
          const isClientSideBooking = bookingType === 'CLIENT_SIDE' || bookingType === 'CLIENT SIDE'
          return {
            id: booking.id,
            orderId: booking.order_id || `#${booking.id}`,
            secondaryOrderIds: secondaryOrders.map((item) => item?.order_id).filter(Boolean),
            status: statusMap[booking.status] || booking.status?.toLowerCase() || 'active',
            customerName: booking.user_email || '-',
            patientName: patient.name || '-',
            location: isClientSideBooking
              ? (booking.client_address || booking.venue_name || '-')
              : (booking.venue_name || booking.client_address || '-'),
            serviceType: combinedServicePackage || '-',
            startDate: booking.start_datetime || '',
            endDate: booking.end_datetime || '',
            amount: totalAmount,
            totalAmount,
            createdAt: booking.created_at || booking.start_datetime || new Date().toISOString(),
            caregiverType: booking.booking_type || '-',
            bookingEntity: booking.booking_entity,
            bookingType: booking.booking_type,
            bookingTypeDisplay: formatBookingType(booking.booking_type),
            locationLabel: isClientSideBooking ? 'Client Location' : 'Venue',
            children: secondaryOrders,
          }
        })

        setBookings(mappedBookings)
        setExpandedRows({})
        setPagination({
          count: response.data.count || 0,
          totalPages: response.data.total_pages || 1,
          currentPage: response.data.current_page || 1,
          next: resolveApiUrl(response.data.next),
          previous: resolveApiUrl(response.data.previous),
        })
      }
    } catch (error) {
      console.error('Error fetching bookings:', error)
      setBookings([])
    } finally {
      setIsLoading(false)
    }
  }

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

    const handleAuthChange = () => checkAuthStatus()
    window.addEventListener('auth-changed', handleAuthChange)
    window.addEventListener('storage', handleAuthChange)

    return () => {
      window.removeEventListener('auth-changed', handleAuthChange)
      window.removeEventListener('storage', handleAuthChange)
    }
  }, [])

  const isCustomer = useMemo(() => {
    return authUser?.user_type === 'CUSTOMER'
  }, [authUser])

  const isVsreOwner = useMemo(() => hasOwnerPrivileges(authUser), [authUser])

  // Fetch bookings when component mounts or auth changes
  useEffect(() => {
    if (authUser && (isCustomer || isVsreOwner)) {
      fetchBookings()
    }
  }, [authUser, isCustomer, isVsreOwner])

  const filtered = useMemo(() => {
    return bookings
      .filter((order) => {
        if (activeTab === 'all') return true
        return order.status === activeTab
      })
      .filter((order) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return (
          order.customerName.toLowerCase().includes(q) ||
          order.patientName.toLowerCase().includes(q) ||
          order.serviceType.toLowerCase().includes(q) ||
          order.location.toLowerCase().includes(q)
        )
      })
  }, [bookings, query, activeTab])

  const badgeFor = (status) => {
    if (status === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-100'
    if (status === 'upcoming') return 'bg-sky-50 text-sky-700 border-sky-100'
    if (status === 'active') return 'bg-blue-50 text-blue-700 border-blue-100'
    return 'bg-rose-50 text-rose-700 border-rose-100'
  }

  const iconFor = (status) => {
    if (status === 'completed') return <FiCheckCircle className="w-4 h-4" />
    if (status === 'upcoming') return <FiClock className="w-4 h-4" />
    if (status === 'active') return <FiCheckCircle className="w-4 h-4" />
    return <FiXCircle className="w-4 h-4" />
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const formatDateTime = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatRange = (start, end) => {
    if (!start && !end) return '-'
    const startStr = formatDate(start)
    const endStr = formatDate(end)
    if (startStr === '-' && endStr === '-') return '-'
    if (startStr === '-') return endStr
    if (endStr === '-') return startStr
    return start === end ? startStr : `${startStr} - ${endStr}`
  }

  const formatBookingType = (bookingType) => {
    if (!bookingType) return '-'
    return bookingType
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const toggleRowExpansion = (orderId) => {
    setExpandedRows((prev) => ({ ...prev, [orderId]: !prev[orderId] }))
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="bg-white p-8 rounded-2xl text-center border border-slate-100">
            <p className="text-slate-600">Please log in to view your orders.</p>
          </div>
        </div>
      </div>
    )
  }

  if (!isCustomer && !isVsreOwner) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="bg-white p-8 rounded-2xl text-center border border-red-200">
            <p className="text-red-600 font-medium mb-2">Access Denied</p>
            <p className="text-slate-500 text-sm">
              This page is only accessible to Customers and VSRE Owners.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            {isVsreOwner ? 'All Orders' : 'My Orders'}
          </h1>
          <p className="text-slate-500 mt-1">
            {isVsreOwner
              ? 'View and manage all customer orders'
              : 'View your order history and upcoming services'}
          </p>
        </div>

        {isCustomer && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Your new booking is sent to the lobby for owner approval. It will appear in this list after the owner accepts it.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-4 border border-slate-100">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex rounded-xl border border-slate-200 overflow-hidden flex-1 max-w-xl bg-white">
              <span className="px-3 flex items-center text-slate-400">
                <FiSearch className="w-4 h-4" />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by patient, package, venue/client location..."
                className="w-full p-2 outline-none text-slate-900"
              />
            </div>
            <div className="text-xs text-slate-500">
              {pagination.count} total booking{pagination.count === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {isLoading && (
            <div className="bg-white p-8 rounded-2xl text-center border border-slate-100">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-500 mb-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
              </div>
              <p className="text-slate-800 font-medium">Loading bookings...</p>
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="bg-white p-8 rounded-2xl text-center border border-slate-100">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-500 mb-3">
                <FiPackage className="w-6 h-6" />
              </div>
              <p className="text-slate-800 font-medium">No bookings found</p>
              <p className="text-slate-500 text-sm mt-1">Try adjusting your filters or search</p>
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold w-[60px]"></th>
                    <th className="px-3 py-2 text-left font-semibold">Order ID</th>
                    {isVsreOwner && <th className="px-3 py-2 text-left font-semibold">Customer</th>}
                    <th className="px-3 py-2 text-left font-semibold">Patient</th>
                    <th className="px-3 py-2 text-left font-semibold">Service / Package</th>
                    <th className="px-3 py-2 text-left font-semibold">Location</th>
                    <th className="px-3 py-2 text-left font-semibold">Booking Type</th>
                    <th className="px-3 py-2 text-left font-semibold">Start Date</th>
                    <th className="px-3 py-2 text-left font-semibold">End Date</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => {
                    const payableAmount = order.children && order.children.length > 0 ? order.totalAmount : order.amount
                    const hasChildOrders = Array.isArray(order.children) && order.children.length > 0
                    const isExpanded = Boolean(expandedRows[order.id])
                    return (
                      <Fragment key={order.id}>
                        <tr className="border-t border-slate-200 align-top text-slate-700">
                          <td className="px-3 py-2">
                            {hasChildOrders ? (
                              <button
                                type="button"
                                onClick={() => toggleRowExpansion(order.id)}
                                className="h-6 w-6 rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                                aria-label={isExpanded ? 'Collapse secondary orders' : 'Expand secondary orders'}
                              >
                                {isExpanded ? '-' : '+'}
                              </button>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-mono text-xs text-slate-900">{order.orderId}</div>
                          </td>
                          {isVsreOwner && <td className="px-3 py-2">{order.customerName}</td>}
                          <td className="px-3 py-2">{order.patientName}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900">{order.serviceType}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-slate-900">{order.location}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-slate-900">{order.bookingTypeDisplay}</div>
                          </td>
                          <td className="px-3 py-2">{formatDate(order.startDate)}</td>
                          <td className="px-3 py-2">{formatDate(order.endDate)}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] border inline-flex items-center gap-1.5 ${badgeFor(order.status)}`}>
                              {iconFor(order.status)}
                              <span className="capitalize">{order.status.replaceAll('_', ' ')}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-900">
                            ₹{payableAmount.toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                        {isExpanded && hasChildOrders && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={isVsreOwner ? 11 : 10} className="px-4 py-3">
                              <p className="mb-2 text-sm font-medium text-slate-700">Secondary and tertiary orders</p>
                              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                <table className="min-w-full text-xs">
                                  <thead className="bg-slate-100 text-slate-600">
                                    <tr>
                                      <th className="px-3 py-2 text-left font-semibold">Order Type</th>
                                      <th className="px-3 py-2 text-left font-semibold">Order ID</th>
                                      <th className="px-3 py-2 text-left font-semibold">Service / Package</th>
                                      <th className="px-3 py-2 text-left font-semibold">Location</th>
                                      <th className="px-3 py-2 text-left font-semibold">Start Date</th>
                                      <th className="px-3 py-2 text-left font-semibold">End Date</th>
                                      <th className="px-3 py-2 text-left font-semibold">Status</th>
                                      <th className="px-3 py-2 text-right font-semibold">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {order.children.map((secondary) => (
                                      <Fragment key={`secondary-${secondary.id || secondary.order_id}`}>
                                        <tr className="border-t border-slate-100 text-slate-700">
                                          <td className="px-3 py-2">
                                            <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">
                                              Secondary
                                            </span>
                                          </td>
                                          <td className="px-3 py-2 font-medium">{secondary.order_id || '-'}</td>
                                          <td className="px-3 py-2">
                                            {[secondary.service_name, secondary.package_name].filter(Boolean).join(' / ') || '-'}
                                          </td>
                                          <td className="px-3 py-2">{secondary.location_locality || order.location || '-'}</td>
                                          <td className="px-3 py-2">{formatDateTime(secondary.start_datetime)}</td>
                                          <td className="px-3 py-2">{formatDateTime(secondary.end_datetime)}</td>
                                          <td className="px-3 py-2">{secondary.status || '-'}</td>
                                          <td className="px-3 py-2 text-right font-medium">
                                            ₹{parseFloat(secondary.subtotal ?? 0).toLocaleString('en-IN', {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            })}
                                          </td>
                                        </tr>
                                        {Array.isArray(secondary.ternary_orders) &&
                                          secondary.ternary_orders.map((tertiary) => (
                                            <tr
                                              key={`tertiary-${tertiary.id || tertiary.order_id}`}
                                              className="border-t border-slate-100 bg-emerald-50/60 text-slate-700"
                                            >
                                              <td className="px-3 py-2">
                                                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                                  Tertiary
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 font-medium">↳ {tertiary.order_id || '-'}</td>
                                              <td className="px-3 py-2">
                                                {[tertiary.service_name, tertiary.package_name].filter(Boolean).join(' / ') || '-'}
                                              </td>
                                              <td className="px-3 py-2">{tertiary.location_locality || secondary.location_locality || order.location || '-'}</td>
                                              <td className="px-3 py-2">{formatDateTime(tertiary.start_datetime)}</td>
                                              <td className="px-3 py-2">{formatDateTime(tertiary.end_datetime)}</td>
                                              <td className="px-3 py-2">{tertiary.status || '-'}</td>
                                              <td className="px-3 py-2 text-right font-medium">
                                                ₹{parseFloat(tertiary.subtotal ?? tertiary.total_bill ?? 0).toLocaleString('en-IN', {
                                                  minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2,
                                                })}
                                              </td>
                                            </tr>
                                          ))}
                                      </Fragment>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && pagination.count > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4 border border-slate-100">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">
                  Page {pagination.currentPage} of {pagination.totalPages} ({pagination.count} total bookings)
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => pagination.previous && fetchBookings(pagination.previous)}
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
                    onClick={() => pagination.next && fetchBookings(pagination.next)}
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
      </div>
    </div>
  )
}

export default MyOrders
