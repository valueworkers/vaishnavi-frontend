import { useMemo, useState, useEffect, useCallback } from 'react'
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
  FiChevronLeft,
  FiChevronRight,
} from 'react-icons/fi'
import axios from 'axios'

const MyBookings = () => {
  const [query, setQuery] = useState('')
  const [invoices, setInvoices] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [pagination, setPagination] = useState({
    count: 0,
    totalPages: 1,
    currentPage: 1,
    next: null,
    previous: null,
  })
  const [paymentModal, setPaymentModal] = useState({
    isOpen: false,
    invoice: null,
    invoiceGroup: null,
    amount: '',
    method: '',
    reference: '',
  })
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)

  const baseUrl = () => `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '')

  const resolveApiUrl = (href) => {
    if (!href) return null
    const s = String(href)
    if (/^https?:\/\//i.test(s)) return s
    const base = baseUrl()
    if (!base) return s
    return `${base}${s.startsWith('/') ? s : `/${s}`}`
  }

  // Fetch invoices from API
  const loadInvoices = useCallback(async (url = null) => {
    const accessToken = localStorage.getItem('access_token')
    
    if (!accessToken) {
      setError('Authorization token missing. Please log in again.')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const apiUrl = url ? resolveApiUrl(url) || url : `${baseUrl()}/booking/invoices/`
      const response = await axios.get(apiUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (response.data) {
        const invoicesData = response.data.results || []
        
        setInvoices(invoicesData)
        setPagination({
          count: response.data.count || 0,
          totalPages: response.data.total_pages || 1,
          currentPage: response.data.current_page || 1,
          next: resolveApiUrl(response.data.next),
          previous: resolveApiUrl(response.data.previous),
        })
      }
    } catch (err) {
      console.error('Error fetching invoices:', err)
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.detail || 
                          err.message || 
                          'Failed to fetch invoices. Please try again.'
      setError(errorMessage)
      setInvoices([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  const filtered = useMemo(() => {
    return invoices.filter((invoice) => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        (invoice.user_name && invoice.user_name.toLowerCase().includes(q)) ||
        (invoice.patient_name && invoice.patient_name.toLowerCase().includes(q)) ||
        (invoice.patient_id && invoice.patient_id.toString().includes(q)) ||
        (invoice.invoices && invoice.invoices.some(inv => 
          inv.invoice_number && inv.invoice_number.toLowerCase().includes(q)
        ))
      )
    })
  }, [invoices, query])

  // Open payment modal
  const handleOpenPaymentModal = (invoice, invoiceGroup) => {
    // Backend provides `remaining_amount`; older code may use `balance`.
    const balance = parseFloat(invoice.remaining_amount ?? invoice.balance ?? 0)
    setPaymentModal({
      isOpen: true,
      invoice,
      invoiceGroup,
      amount: balance.toFixed(2),
      method: '',
      reference: '',
    })
  }

  // Close payment modal
  const handleClosePaymentModal = () => {
    setPaymentModal({
      isOpen: false,
      invoice: null,
      invoiceGroup: null,
      amount: '',
      method: '',
      reference: '',
    })
    setIsProcessingPayment(false)
  }

  // Process payment
  const handleProcessPayment = async () => {
    const { invoice, amount, method, reference } = paymentModal

    if (!invoice || !amount || !method || !reference) {
      setError('Please fill all payment fields')
      setTimeout(() => setError(''), 3000)
      return
    }

    // invoice_id is the id field of the invoice object
    const invoiceId = invoice.id
    if (!invoiceId) {
      setError('Invoice ID is missing')
      setTimeout(() => setError(''), 3000)
      return
    }

    setIsProcessingPayment(true)
    setError('')

    try {
      const accessToken = localStorage.getItem('access_token')
      if (!accessToken) {
        throw new Error('Authorization token missing')
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
      const paid_date = `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}+05:30`;

      const payload = {
        invoice_id: invoiceId,
        amount: parseFloat(amount).toFixed(2),
        method: method,
        reference: reference,
        paid_date,
        is_verified: false,
      }

      const response = await axios.post(
        `${baseUrl()}/booking/payments/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )

      // Reload invoices after successful payment
      await loadInvoices()
      handleClosePaymentModal()
      
      // Show success message
      setError('')
      // You could add a success state here if needed
    } catch (err) {
      console.error('Error processing payment:', err)
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.detail || 
                          err.message || 
                          'Failed to process payment. Please try again.'
      setError(errorMessage)
    } finally {
      setIsProcessingPayment(false)
    }
  }

  const formatRange = (start, end) => {
    const startStr = new Date(start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const endStr = new Date(end).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    return start === end ? startStr : `${startStr} - ${endStr}`
  }

  const badgeFor = (status) => {
    if (status === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-100'
    if (status === 'pending') return 'bg-amber-50 text-amber-700 border-amber-100'
    if (status === 'partial') return 'bg-blue-50 text-blue-700 border-blue-100'
    return 'bg-rose-50 text-rose-700 border-rose-100'
  }

  const iconFor = (status) => {
    if (status === 'completed') return <FiCheckCircle className="w-4 h-4" />
    if (status === 'pending') return <FiClock className="w-4 h-4" />
    if (status === 'partial') return <FiClock className="w-4 h-4" />
    return <FiXCircle className="w-4 h-4" />
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="bg-white p-8 rounded-2xl text-center border border-slate-100">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-teal-200 border-t-teal-600 mx-auto"></div>
            <p className="text-slate-600 mt-3 text-sm">Loading invoices...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="bg-white p-8 rounded-2xl text-center border border-red-200">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl text-red-600 font-bold">!</span>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Error Loading Invoices</h3>
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <button
              onClick={() => loadInvoices()}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="mb-3">
          <h1 className="text-xl font-bold text-slate-900">My Invoices</h1>
          <p className="text-slate-500 text-sm mt-0.5">View your invoices and payment status</p>
        </div>

        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Invoices are generated once your services are completed or fulfilled.
        </div>

        <div className="bg-white rounded-lg shadow-sm p-2 border border-slate-100 mb-3">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden flex-1 max-w-xl bg-white">
            <span className="px-2 flex items-center text-slate-400">
              <FiSearch className="w-3.5 h-3.5" />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by patient name, user name, or invoice number..."
              className="w-full p-1.5 text-sm outline-none text-slate-900"
            />
          </div>
        </div>

        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="bg-white p-4 rounded-lg text-center border border-slate-100">
              <p className="text-slate-800 font-medium text-xs">No invoices found</p>
              <p className="text-slate-500 text-[10px] mt-0.5">Try adjusting your search</p>
            </div>
          )}

          {filtered.map((invoiceGroup) => {
            const totalInvoiceAmount = parseFloat(invoiceGroup.total_invoice_amount || 0)
            const totalPaid = parseFloat(invoiceGroup.total_paid || 0)
            const totalBalance = parseFloat(invoiceGroup.total_balance || 0)
            const hasBalance = totalBalance > 0

            return (
              <div key={`invoice-group-${invoiceGroup.user_id}-${invoiceGroup.patient_id}`} className="bg-white rounded-lg p-2 shadow-sm border border-slate-100">
                {/* Header & Summary Inline */}
                <div className="mb-1.5 pb-1.5 border-b border-slate-200">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-900 truncate">{invoiceGroup.user_name || 'User'}</span>
                        <span className="text-slate-400">|</span>
                        <span className="text-slate-600 truncate">{invoiceGroup.patient_name || '-'}</span>
                        <span className="text-slate-400">|</span>
                        <span className="text-slate-500">ID: {invoiceGroup.patient_id || '-'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="text-slate-600">
                        <span className="text-slate-500">Total: </span>
                        <span className="font-semibold">₹{totalInvoiceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <span className="text-slate-400">|</span>
                      <div className="text-emerald-600">
                        <span className="text-emerald-500">Paid: </span>
                        <span className="font-semibold">₹{totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <span className="text-slate-400">|</span>
                      <div className={hasBalance ? 'text-amber-600' : 'text-slate-600'}>
                        <span className={hasBalance ? 'text-amber-500' : 'text-slate-500'}>To Pay: </span>
                        <span className="font-bold">₹{totalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Invoices Table */}
                {invoiceGroup.invoices && invoiceGroup.invoices.length > 0 && (
                  <div className="mb-1.5">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px]">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-1.5 py-1 text-left font-semibold text-slate-700">Invoice</th>
                            <th className="px-1.5 py-1 text-left font-semibold text-slate-700">Service</th>
                            <th className="px-1.5 py-1 text-left font-semibold text-slate-700">Package</th>
                            <th className="px-1.5 py-1 text-left font-semibold text-slate-700">Venue/Location</th>
                            <th className="px-1.5 py-1 text-left font-semibold text-slate-700">Date</th>
                            <th className="px-1.5 py-1 text-right font-semibold text-slate-700">Amount</th>
                            <th className="px-1.5 py-1 text-right font-semibold text-emerald-600">Paid</th>
                            <th className="px-1.5 py-1 text-left font-semibold text-slate-700">Paid Date</th>
                            <th className="px-1.5 py-1 text-right font-semibold text-amber-600">Balance</th>
                            <th className="px-1.5 py-1 text-center font-semibold text-slate-700">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {invoiceGroup.invoices.map((invoice, idx) => {
                            const invoiceBalance = parseFloat(invoice.remaining_amount ?? invoice.balance ?? 0);
                            const hasInvoiceBalance = invoiceBalance > 0;
                            const booking = invoice.booking || {};
                            const latestPaidDateStr = (() => {
                              const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
                              const paidDates = payments
                                .map((p) => p?.paid_date)
                                .filter(Boolean);
                              if (paidDates.length === 0) return null;
                              const latest = paidDates
                                .map((d) => ({ d, t: new Date(d).getTime() }))
                                .filter((x) => Number.isFinite(x.t))
                                .sort((a, b) => b.t - a.t)[0];
                              return latest?.d || null;
                            })();
                            return (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="px-1.5 py-1 text-slate-900 font-medium">{invoice.invoice_number}</td>
                                <td className="px-1.5 py-1 text-slate-600">{booking.service || '-'}</td>
                                <td className="px-1.5 py-1 text-slate-600">{booking.package || '-'}</td>
                                <td className="px-1.5 py-1 text-slate-600 max-w-[220px]">
                                  <div className="truncate">
                                    {booking.venue || '-'}
                                    {booking.locality ? ` (${booking.locality})` : ''}
                                  </div>
                                </td>
                                <td className="px-1.5 py-1 text-slate-600">
                                  {invoice.issued_date
                                    ? new Date(invoice.issued_date).toLocaleDateString('en-IN', {
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric',
                                      })
                                    : invoice.period_start
                                      ? new Date(invoice.period_start).toLocaleDateString('en-IN', {
                                          day: 'numeric',
                                          month: 'short',
                                          year: 'numeric',
                                        })
                                      : '-'}
                                </td>
                                <td className="px-1.5 py-1 text-right text-slate-900">
                                  ₹{parseFloat(invoice.total_amount ?? invoice.subtotal ?? invoice.invoice_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-1.5 py-1 text-right text-emerald-700">
                                  ₹{parseFloat(invoice.paid_amount ?? invoice.paid ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-1.5 py-1 text-left text-slate-600">
                                  {latestPaidDateStr
                                    ? new Date(latestPaidDateStr).toLocaleDateString('en-IN', {
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric',
                                      })
                                    : '-'}
                                </td>
                                <td className="px-1.5 py-1 text-right text-amber-700 font-medium">
                                  ₹{invoiceBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-1.5 py-1 text-center">
                                  {hasInvoiceBalance ? (
                                    <button 
                                      onClick={() => handleOpenPaymentModal(invoice, invoiceGroup)}
                                      className="px-2 py-0.5 bg-teal-600 text-white rounded text-[10px] font-semibold hover:bg-teal-700 transition-colors whitespace-nowrap"
                                    >
                                      Pay
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-slate-400">Paid</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        {pagination.count > 0 && (
          <div className="mt-3 bg-white rounded-lg shadow-sm p-2.5 border border-slate-100">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-600">
                Page {pagination.currentPage} of {pagination.totalPages} ({pagination.count} total)
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => pagination.previous && loadInvoices(pagination.previous)}
                  disabled={!pagination.previous || isLoading}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
                    pagination.previous
                      ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  }`}
                >
                  <FiChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => pagination.next && loadInvoices(pagination.next)}
                  disabled={!pagination.next || isLoading}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
                    pagination.next
                      ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  }`}
                >
                  Next
                  <FiChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {paymentModal.isOpen && paymentModal.invoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]" onClick={handleClosePaymentModal}>
          <div className="bg-white rounded-lg shadow-xl p-4 w-[90%] max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-slate-900">Process Payment</h3>
              <button
                onClick={handleClosePaymentModal}
                className="text-slate-500 hover:text-slate-700 text-xl font-bold"
                disabled={isProcessingPayment}
              >
                ×
              </button>
            </div>

            {/* Invoice Info */}
            <div className="bg-slate-50 rounded-lg p-2.5 mb-3 border border-slate-200">
              <div className="text-xs text-slate-600 mb-1">Invoice Number</div>
              <div className="text-sm font-semibold text-slate-900">{paymentModal.invoice.invoice_number}</div>
              {paymentModal.invoice.booking ? (
                <div className="text-[10px] text-slate-600 mt-1 leading-snug">
                  <div>{paymentModal.invoice.booking.service || '-'} · {paymentModal.invoice.booking.package || '-'}</div>
                  <div>
                    {paymentModal.invoice.booking.venue || '-'}
                    {paymentModal.invoice.booking.locality ? ` (${paymentModal.invoice.booking.locality})` : ''}
                  </div>
                </div>
              ) : null}
              <div className="text-xs text-slate-600 mt-1.5 mb-0.5">Balance Amount</div>
              <div className="text-base font-bold text-amber-700">
                ₹{parseFloat(paymentModal.invoice.remaining_amount ?? paymentModal.invoice.balance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              {Array.isArray(paymentModal.invoice.payments) && paymentModal.invoice.payments.length > 0 && (
                <div className="text-[10px] text-slate-600 mt-1 leading-snug">
                  Latest Paid Date:{' '}
                  {(() => {
                    const paidDates = paymentModal.invoice.payments
                      .map((p) => p?.paid_date)
                      .filter(Boolean);
                    const latest = paidDates
                      .map((d) => ({ d, t: new Date(d).getTime() }))
                      .filter((x) => Number.isFinite(x.t))
                      .sort((a, b) => b.t - a.t)[0];
                    return latest?.d
                      ? new Date(latest.d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '-';
                  })()}
                </div>
              )}
            </div>

            {/* Payment Form */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentModal.amount}
                  onChange={(e) => setPaymentModal({ ...paymentModal, amount: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="Enter amount"
                  disabled={isProcessingPayment}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method *</label>
                <select
                  value={paymentModal.method}
                  onChange={(e) => setPaymentModal({ ...paymentModal, method: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
                  disabled={isProcessingPayment}
                >
                  <option value="">Select payment method</option>
                  <option value="UPI">UPI</option>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="CHEQUE">Cheque</option>

                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reference Number *</label>
                <input
                  type="text"
                  value={paymentModal.reference}
                  onChange={(e) => setPaymentModal({ ...paymentModal, reference: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="Enter reference/transaction ID"
                  disabled={isProcessingPayment}
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={handleClosePaymentModal}
                disabled={isProcessingPayment}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleProcessPayment()
                }}
                disabled={isProcessingPayment || !paymentModal.amount || !paymentModal.method || !paymentModal.reference}
                className="flex-1 px-3 py-2 rounded-lg bg-teal-600 text-white font-medium text-sm hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessingPayment ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </>
                ) : (
                  <>Process Payment</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MyBookings

