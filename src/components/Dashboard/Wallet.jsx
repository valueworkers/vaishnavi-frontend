import { Fragment, useMemo, useState } from 'react'

const formatAmount = (value) => {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return '-'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

const toNumber = (value) => {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

const deriveWalletAmount = (row) => {
  const totalInvoice = toNumber(row?.total_invoice_amount)
  const totalPaid = toNumber(row?.total_paid)
  const totalBalance = toNumber(row?.total_balance)

  // Primary logic: wallet = extra paid above invoice total.
  const extraPaid = totalPaid - totalInvoice
  if (extraPaid > 0) return extraPaid

  // Fallback for APIs where excess is expressed as negative balance.
  if (totalBalance < 0) return Math.abs(totalBalance)
  return 0
}

const MOCK_WALLET_ROWS = [
  {
    user_id: 1,
    patient_id: 16,
    patient_name: 'Shreya Joshi',
    total_invoice_amount: 2200,
    total_paid: 2500,
    total_balance: -300,
    last_updated: '2026-05-08',
    redeem_services: ['General Consultation', 'Nursing Visit', 'Physiotherapy'],
    wallet_entries: [
      { id: 'W-1001', date: '2026-05-08', type: 'Credit', service_name: 'General Consultation', amount: 300, note: 'Extra paid at booking' },
    ],
  },
  {
    user_id: 2,
    patient_id: 24,
    patient_name: 'Customer 5',
    total_invoice_amount: 5400,
    total_paid: 6000,
    total_balance: -600,
    last_updated: '2026-05-07',
    redeem_services: ['Client side no package', 'X-ray'],
    wallet_entries: [
      { id: 'W-1002', date: '2026-05-07', type: 'Credit', service_name: 'Client side no package', amount: 400, note: 'Extra paid at booking' },
      { id: 'W-1003', date: '2026-05-08', type: 'Credit', service_name: 'Client side no package', amount: 200, note: 'Additional excess payment' },
    ],
  },
  {
    user_id: 3,
    patient_id: 28,
    patient_name: 'Customer 9',
    total_invoice_amount: 3000,
    total_paid: 3350,
    total_balance: -350,
    last_updated: '2026-05-06',
    redeem_services: ['X-ray', 'Lab Home Collection'],
    wallet_entries: [
      { id: 'W-1004', date: '2026-05-06', type: 'Credit', service_name: 'X-ray', amount: 350, note: 'Extra paid at booking' },
    ],
  },
]

const Wallet = () => {
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [sortBy, setSortBy] = useState('wallet_amount')
  const [sortOrder, setSortOrder] = useState('desc')
  const [expandedRows, setExpandedRows] = useState({})
  const [redeemModal, setRedeemModal] = useState({ open: false, row: null })
  const [redeemForm, setRedeemForm] = useState({ service: '', amount: '', note: '' })
  const [actionMessage, setActionMessage] = useState('')

  const walletRows = useMemo(() => {
    const rows = MOCK_WALLET_ROWS
      .map((row) => ({
        ...row,
        wallet_amount: deriveWalletAmount(row),
      }))
      .filter((row) => {
        const q = appliedSearch.trim().toLowerCase()
        if (!q) return true
        const patientName = String(row.patient_name || '').toLowerCase()
        const patientId = String(row.patient_id || '')
        return patientName.includes(q) || patientId.includes(q)
      })
      .filter((row) => row.wallet_amount > 0)

    const direction = sortOrder === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      if (sortBy === 'patient_name') {
        return String(a.patient_name || '').localeCompare(String(b.patient_name || '')) * direction
      }
      if (sortBy === 'patient_id') {
        return (toNumber(a.patient_id) - toNumber(b.patient_id)) * direction
      }
      if (sortBy === 'wallet_amount') {
        return (toNumber(a.wallet_amount) - toNumber(b.wallet_amount)) * direction
      }
      if (sortBy === 'last_updated') {
        return (new Date(a.last_updated).getTime() - new Date(b.last_updated).getTime()) * direction
      }
      return 0
    })
    return rows
  }, [appliedSearch, sortBy, sortOrder])

  const totalWalletAmount = useMemo(() => walletRows.reduce((sum, row) => sum + toNumber(row.wallet_amount), 0), [walletRows])

  const highestWallet = useMemo(
    () =>
      walletRows.reduce((max, row) => (toNumber(row.wallet_amount) > toNumber(max.wallet_amount) ? row : max), walletRows[0] || {}),
    [walletRows]
  )

  const toggleSort = (key) => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(key)
    setSortOrder(key === 'patient_name' || key === 'patient_id' ? 'asc' : 'desc')
  }

  const toggleRow = (patientId) => {
    setExpandedRows((prev) => ({ ...prev, [patientId]: !prev[patientId] }))
  }

  const openRedeemModal = (row) => {
    const firstService = row?.redeem_services?.[0] || ''
    setRedeemModal({ open: true, row })
    setRedeemForm({
      service: firstService,
      amount: '',
      note: '',
    })
    setActionMessage('')
  }

  const closeRedeemModal = () => {
    setRedeemModal({ open: false, row: null })
  }

  const submitRedeem = () => {
    const row = redeemModal.row
    if (!row) return
    const redeemAmount = toNumber(redeemForm.amount)
    if (!redeemForm.service) return
    if (!redeemAmount || redeemAmount <= 0) return
    if (redeemAmount > toNumber(row.wallet_amount)) return
    setActionMessage(
      `Redeem request prepared: ${row.patient_name} -> ${formatAmount(redeemAmount)} for ${redeemForm.service}.`
    )
    closeRedeemModal()
  }

  const sortIndicator = (key) => (sortBy !== key ? '⇅' : sortOrder === 'asc' ? '↑' : '↓')

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 sm:text-lg">Patient Wallet</h3>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            UI preview: extra paid amount is shown as wallet balance (owner view).
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setAppliedSearch(search)
            }}
            placeholder="Search patient..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 sm:w-64"
          />
          <button
            type="button"
            onClick={() => setAppliedSearch(search)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Search
          </button>
        </div>
      </div>
      {actionMessage ? (
        <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
          {actionMessage}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-xs sm:text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-2 py-1 text-left font-semibold">Details</th>
              <th className="px-2 py-1 text-left font-semibold">
                <button type="button" onClick={() => toggleSort('patient_name')} className="inline-flex items-center gap-1 hover:text-slate-900">
                  Patient <span className="text-slate-500">{sortIndicator('patient_name')}</span>
                </button>
              </th>
              <th className="px-2 py-1 text-left font-semibold">
                <button type="button" onClick={() => toggleSort('patient_id')} className="inline-flex items-center gap-1 hover:text-slate-900">
                  Patient ID <span className="text-slate-500">{sortIndicator('patient_id')}</span>
                </button>
              </th>
              <th className="px-2 py-1 text-left font-semibold">Invoice Total</th>
              <th className="px-2 py-1 text-left font-semibold">Paid Total</th>
              <th className="px-2 py-1 text-left font-semibold">
                <button type="button" onClick={() => toggleSort('wallet_amount')} className="inline-flex items-center gap-1 hover:text-slate-900">
                  Wallet Balance <span className="text-slate-500">{sortIndicator('wallet_amount')}</span>
                </button>
              </th>
              <th className="px-2 py-1 text-left font-semibold">
                <button type="button" onClick={() => toggleSort('last_updated')} className="inline-flex items-center gap-1 hover:text-slate-900">
                  Last Updated <span className="text-slate-500">{sortIndicator('last_updated')}</span>
                </button>
              </th>
              <th className="px-2 py-1 text-left font-semibold">Redeem</th>
            </tr>
          </thead>
          <tbody>
            {walletRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-2 text-center text-sm text-slate-500">
                  No patient wallet balance found.
                </td>
              </tr>
            ) : (
              walletRows.map((row) => {
                const isExpanded = Boolean(expandedRows[row.patient_id])
                return (
                  <Fragment key={`${row.user_id || 'u'}-${row.patient_id || 'p'}`}>
                    <tr className="border-t border-slate-100 text-slate-700">
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => toggleRow(row.patient_id)}
                          className="h-5 w-5 rounded border border-slate-300 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
                          title={isExpanded ? 'Hide wallet history' : 'Show wallet history'}
                        >
                          {isExpanded ? '-' : '+'}
                        </button>
                      </td>
                      <td className="px-2 py-1.5 font-medium text-slate-800">{row.patient_name || '-'}</td>
                      <td className="px-2 py-1.5">{row.patient_id || '-'}</td>
                      <td className="px-2 py-1.5">{formatAmount(row.total_invoice_amount)}</td>
                      <td className="px-2 py-1.5">{formatAmount(row.total_paid)}</td>
                      <td className="px-2 py-1.5 font-semibold text-emerald-700">{formatAmount(row.wallet_amount)}</td>
                      <td className="px-2 py-1.5">{row.last_updated || '-'}</td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => openRedeemModal(row)}
                          className="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          Redeem Wallet
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={8} className="px-3 py-2">
                          <div className="rounded-lg border border-slate-200 bg-white p-2">
                            <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Wallet History</p>
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-[11px]">
                                <thead className="bg-slate-100 text-slate-600">
                                  <tr>
                                    <th className="px-2 py-1 text-left font-semibold">Entry ID</th>
                                    <th className="px-2 py-1 text-left font-semibold">Date</th>
                                    <th className="px-2 py-1 text-left font-semibold">Service</th>
                                    <th className="px-2 py-1 text-left font-semibold">Type</th>
                                    <th className="px-2 py-1 text-left font-semibold">Amount</th>
                                    <th className="px-2 py-1 text-left font-semibold">Note</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(row.wallet_entries || []).map((entry) => (
                                    <tr key={entry.id} className="border-t border-slate-100 text-slate-700">
                                      <td className="px-2 py-1">{entry.id}</td>
                                      <td className="px-2 py-1">{entry.date}</td>
                                      <td className="px-2 py-1">{entry.service_name || '-'}</td>
                                      <td className="px-2 py-1">{entry.type}</td>
                                      <td className="px-2 py-1 font-semibold text-emerald-700">{formatAmount(entry.amount)}</td>
                                      <td className="px-2 py-1">{entry.note}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {redeemModal.open && redeemModal.row ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-3">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <h4 className="text-sm font-bold text-slate-900">Redeem Wallet</h4>
            <p className="mt-1 text-xs text-slate-600">
              Patient: <span className="font-semibold text-slate-800">{redeemModal.row.patient_name}</span>
            </p>
            <p className="text-xs text-slate-600">
              Available wallet: <span className="font-semibold text-emerald-700">{formatAmount(redeemModal.row.wallet_amount)}</span>
            </p>

            <div className="mt-3 space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Redeem For Service
                <select
                  value={redeemForm.service}
                  onChange={(e) => setRedeemForm((prev) => ({ ...prev, service: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
                >
                  {(redeemModal.row.redeem_services || []).map((service) => (
                    <option key={service} value={service}>
                      {service}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Redeem Amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={redeemForm.amount}
                  onChange={(e) => setRedeemForm((prev) => ({ ...prev, amount: e.target.value }))}
                  placeholder="Enter amount"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Notes
                <textarea
                  rows={3}
                  value={redeemForm.note}
                  onChange={(e) => setRedeemForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="Optional note"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
                />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeRedeemModal}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRedeem}
                className="rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Confirm Redeem
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default Wallet
