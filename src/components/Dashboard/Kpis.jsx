import React, { useEffect, useId, useMemo, useState } from 'react'
import {
  FiAlertCircle,
  FiBarChart2,
  FiBriefcase,
  FiCalendar,
  FiCheckCircle,
  FiClipboard,
  FiCreditCard,
  FiInfo,
  FiInbox,
  FiRefreshCw,
  FiUserMinus,
  FiUserPlus,
  FiUsers,
  FiXCircle,
} from 'react-icons/fi'

/** Semantic tones only (admin: indigo + slate; emerald/amber/rose for meaning). */
const METRICS = [
  {
    key: 'newStaffOnboarded',
    label: 'New Staff onboarded',
    type: 'count',
    icon: FiUserPlus,
    tone: 'indigo',
  },
  {
    key: 'newCustomersOnboarded',
    label: 'New Customers onboarded',
    type: 'count',
    icon: FiUsers,
    tone: 'indigo',
  },
  {
    key: 'bookingsCreated',
    label: 'Bookings created',
    type: 'count',
    icon: FiClipboard,
    tone: 'indigo',
  },
  {
    key: 'bookingsFulfilled',
    label: 'Bookings fulfilled',
    type: 'count',
    icon: FiCheckCircle,
    tone: 'emerald',
  },
  {
    key: 'bookingsPreclosed',
    label: 'Bookings preclosed',
    type: 'count',
    icon: FiXCircle,
    tone: 'amber',
  },
  {
    key: 'amountCollected',
    label: 'Amount collected',
    type: 'amount',
    icon: FiCreditCard,
    tone: 'emerald',
  },
  {
    key: 'staffPayout',
    label: 'Staff payout',
    type: 'amount',
    icon: FiBriefcase,
    tone: 'indigo',
  },
  {
    key: 'spendOther',
    label: 'Spend other than staff payout',
    type: 'amount',
    icon: FiCreditCard,
    tone: 'slate',
  },
  {
    key: 'staffAbsent',
    label: 'Staff absent',
    type: 'count',
    icon: FiUserMinus,
    tone: 'rose',
  },
  {
    key: 'staffUnutilised',
    label: 'Staff unutilised',
    type: 'count',
    icon: FiUsers,
    tone: 'amber',
  },
]

const VIEWS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'yearly', label: 'Yearly' },
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const QUARTERS = [
  { key: 0, label: 'Q1', months: [0, 1, 2] },
  { key: 1, label: 'Q2', months: [3, 4, 5] },
  { key: 2, label: 'Q3', months: [6, 7, 8] },
  { key: 3, label: 'Q4', months: [9, 10, 11] },
]

const TONE = {
  indigo: {
    icon: 'bg-indigo-50 text-indigo-700',
    value: 'text-slate-900',
  },
  emerald: {
    icon: 'bg-emerald-50 text-emerald-700',
    value: 'text-emerald-800',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-800',
    value: 'text-amber-900',
  },
  rose: {
    icon: 'bg-rose-50 text-rose-700',
    value: 'text-rose-800',
  },
  slate: {
    icon: 'bg-slate-100 text-slate-600',
    value: 'text-slate-900',
  },
}

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const fmt = (s, opts) => parse(s).toLocaleDateString('en-IN', opts)
const fmtShort = (s) => fmt(s, { day: 'numeric', month: 'short' })
const fmtLong = (s) =>
  fmt(s, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const rangeLabel = ({ from, to }) =>
  from === to ? fmtShort(from) : `${fmtShort(from)} – ${fmtShort(to)}`

const monthRange = (y, m) => ({
  from: iso(new Date(y, m, 1)),
  to: iso(new Date(y, m + 1, 0)),
})

const quarterRange = (y, q) => ({
  from: iso(new Date(y, q * 3, 1)),
  to: iso(new Date(y, q * 3 + 3, 0)),
})

const yearRange = (y) => ({
  from: iso(new Date(y, 0, 1)),
  to: iso(new Date(y, 11, 31)),
})

const weeksOfMonth = (y, m) => {
  const last = new Date(y, m + 1, 0)
  const weeks = []
  let start = new Date(y, m, 1)
  while (start <= last) {
    const dow = (start.getDay() + 6) % 7
    let end = new Date(start)
    end.setDate(start.getDate() + (6 - dow))
    if (end > last) end = last
    weeks.push({ from: iso(start), to: iso(end) })
    start = new Date(end)
    start.setDate(end.getDate() + 1)
  }
  return weeks
}

const daysOfRange = ({ from, to }) => {
  const out = []
  const end = parse(to)
  for (let d = parse(from); d <= end; d.setDate(d.getDate() + 1)) out.push(iso(d))
  return out
}

const currentWeekIndex = (y, m) => {
  const today = iso(new Date())
  const i = weeksOfMonth(y, m).findIndex((w) => today >= w.from && today <= w.to)
  return i < 0 ? 0 : i
}

const currentQuarter = (d = new Date()) => Math.floor(d.getMonth() / 3)

const formatValue = (value, type) => {
  const n = Number(value) || 0
  if (type === 'amount') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(n)
  }
  return new Intl.NumberFormat('en-IN').format(n)
}

const sumValues = (rows) => {
  const total = {}
  METRICS.forEach(({ key }) => {
    total[key] = rows.reduce((s, r) => s + (Number(r?.[key]) || 0), 0)
  })
  return total
}

const hash = (str) => {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

export const mockFetchStats = async (ranges) =>
  ranges.map((range) => {
    const days = daysOfRange(range)
    const out = {}
    METRICS.forEach(({ key, type }) => {
      out[key] = days.reduce((s, d) => {
        const r = hash(d + key)
        if (type === 'amount') {
          const scale =
            key === 'amountCollected' ? 180000 : key === 'staffPayout' ? 90000 : 35000
          return s + Math.round((r * scale) / 100) * 100
        }
        const scale =
          key === 'staffAbsent' || key === 'staffUnutilised'
            ? 4
            : key === 'bookingsCreated' || key === 'bookingsFulfilled'
              ? 8
              : 5
        return s + Math.floor(r * r * scale)
      }, 0)
    })
    return out
  })

const useStats = (ranges, fetchStats, reloadKey = 0) => {
  const [state, setState] = useState({ rows: [], loading: true, error: null })
  const key = JSON.stringify(ranges)

  useEffect(() => {
    let cancelled = false
    setState({ rows: [], loading: true, error: null })
    Promise.resolve(fetchStats(JSON.parse(key)))
      .then((rows) => !cancelled && setState({ rows, loading: false, error: null }))
      .catch(
        () =>
          !cancelled &&
          setState({
            rows: [],
            loading: false,
            error: 'Could not load KPI data. Please try again.',
          })
      )
    return () => {
      cancelled = true
    }
  }, [key, fetchStats, reloadKey])

  return state
}

const FIELD_CLASS =
  'w-full min-h-11 rounded-md border border-slate-300 bg-white px-2.5 py-2 text-base text-slate-900 sm:min-h-0 sm:w-auto sm:py-1 sm:text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50'

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-slate-700 sm:mb-0'

const btnPrimary =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-indigo-700 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-[11px]'

const btnSecondary =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-[11px]'

const Seg = ({ active, onClick, disabled, children }) => (
  <button
    type="button"
    aria-pressed={active}
    disabled={disabled}
    onClick={onClick}
    className={`min-h-11 shrink-0 rounded-md px-3 py-2 text-sm font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-[11px] ${
      active
        ? 'bg-indigo-600 text-white shadow-sm'
        : 'text-slate-600 hover:bg-white hover:text-slate-900'
    }`}
  >
    {children}
  </button>
)

const SegWrap = ({ label, children }) => (
  <div
    role="group"
    aria-label={label}
    className="inline-flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-1"
  >
    {children}
  </div>
)

const KpiSkeleton = () => (
  <div
    className="flex min-h-[7rem] flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    aria-hidden
  >
    <div className="flex items-start justify-between gap-2">
      <div className="h-3 w-28 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
      <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
    </div>
    <div className="mt-auto pt-4">
      <div className="h-8 w-20 animate-pulse rounded-md bg-slate-200/80 motion-reduce:animate-none" />
      <div className="mt-2 h-3 w-16 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
    </div>
  </div>
)

const KpiCard = ({ label, value, type, icon: Icon, tone = 'indigo', index = 0 }) => {
  const isAmount = type === 'amount'
  const t = TONE[tone] || TONE.indigo
  return (
    <article
      style={{ animationDelay: `${Math.min(index, 9) * 40}ms` }}
      className="flex min-h-[7rem] flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md motion-safe:animate-[fadeSlideIn_0.28s_ease-out_both]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">
            {label}
          </p>
          <p className="mt-1 text-[10px] font-medium text-slate-400">
            {isAmount ? 'Amount (₹)' : 'Count'}
          </p>
        </div>
        <span
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.icon}`}
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className={`mt-auto pt-3 text-2xl font-bold tabular-nums tracking-tight sm:text-[1.65rem] ${t.value}`}>
        {formatValue(value, type)}
      </p>
    </article>
  )
}

const Breakdown = ({ levelName, items, rows, loading, total }) => {
  const cell = (v, type) => (Number(v) ? formatValue(v, type) : '–')
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="min-w-0 max-w-full overflow-x-auto">
        <table className="min-w-max w-full border-collapse text-[11px] text-slate-700">
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th className="sticky left-0 z-10 bg-slate-100 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider">
                {levelName}
              </th>
              {METRICS.map((a) => (
                <th
                  key={a.key}
                  className="min-w-[7.5rem] px-2.5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider"
                >
                  {a.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: Math.min(items.length || 3, 6) }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-t border-slate-100">
                    <td className="sticky left-0 bg-white px-3 py-2.5" colSpan={METRICS.length + 1}>
                      <div className="h-3 w-full max-w-md animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
                    </td>
                  </tr>
                ))
              : items.map((c, i) => (
                  <tr key={c.key} className="border-t border-slate-100 hover:bg-indigo-50/40">
                    <th
                      scope="row"
                      className="sticky left-0 bg-white px-3 py-2 text-left font-semibold text-slate-900"
                    >
                      {c.label}
                      {c.sub ? (
                        <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
                          {c.sub}
                        </span>
                      ) : null}
                    </th>
                    {METRICS.map((a) => (
                      <td key={a.key} className="px-2.5 py-2 text-right tabular-nums text-slate-800">
                        {cell(rows[i]?.[a.key], a.type)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
          {!loading && items.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-indigo-100 bg-indigo-50/50 font-bold">
                <th
                  scope="row"
                  className="sticky left-0 bg-indigo-50/90 px-3 py-2.5 text-left text-indigo-950"
                >
                  Total
                </th>
                {METRICS.map((a) => (
                  <td key={a.key} className="px-2.5 py-2.5 text-right tabular-nums text-indigo-950">
                    {formatValue(total[a.key], a.type)}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  )
}

const Field = ({ id, label, children }) => (
  <div className="flex min-w-0 flex-col gap-0 sm:flex-row sm:items-center sm:gap-1.5">
    <label htmlFor={id} className={LABEL_CLASS}>
      {label}
    </label>
    {children}
  </div>
)

const Kpis = ({ fetchStats = mockFetchStats, defaultView = 'daily' }) => {
  const now = new Date()
  const today = iso(now)
  const headingId = useId()
  const dateId = useId()
  const weekMonthId = useId()
  const yearId = useId()
  const monthId = useId()

  const [view, setView] = useState(defaultView)
  const [date, setDate] = useState(today)
  const [wMonth, setWMonth] = useState(today.slice(0, 7))
  const [wWeek, setWWeek] = useState(() => currentWeekIndex(now.getFullYear(), now.getMonth()))
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [quarter, setQuarter] = useState(() => currentQuarter(now))
  const [reloadKey, setReloadKey] = useState(0)

  const [wy, wm] = wMonth.split('-').map(Number)
  const weekOptions = weeksOfMonth(wy, wm - 1)
  const wi = Math.min(wWeek, Math.max(weekOptions.length - 1, 0))

  let title = ''
  let ranges = []
  let children = null
  let levelName = ''

  if (view === 'daily') {
    ranges = [{ from: date, to: date }]
    title = `KPIs for ${fmtLong(date)}`
  } else if (view === 'weekly') {
    const week = weekOptions[wi] || weekOptions[0]
    ranges = [week]
    title = `Week ${wi + 1}, ${MONTHS[wm - 1]} ${wy} (${rangeLabel(week)})`
  } else if (view === 'monthly') {
    const range = monthRange(year, month)
    ranges = [range]
    title = `${MONTHS[month]} ${year}`
    const weeks = weeksOfMonth(year, month)
    levelName = 'Week'
    children = weeks.map((w, i) => ({
      key: w.from,
      label: `Week ${i + 1}`,
      sub: rangeLabel(w),
      ...w,
    }))
  } else if (view === 'quarterly') {
    const range = quarterRange(year, quarter)
    ranges = [range]
    const q = QUARTERS[quarter]
    title = `${q.label} ${year} (${rangeLabel(range)})`
    levelName = 'Month'
    children = q.months.map((m) => ({
      key: `${year}-${m}`,
      label: MONTHS[m],
      sub: rangeLabel(monthRange(year, m)),
      ...monthRange(year, m),
    }))
  } else {
    const range = yearRange(year)
    ranges = [range]
    title = `Year ${year}`
    levelName = 'Quarter'
    children = QUARTERS.map((q) => ({
      key: `${year}-Q${q.key + 1}`,
      label: q.label,
      sub: rangeLabel(quarterRange(year, q.key)),
      ...quarterRange(year, q.key),
    }))
  }

  const fetchRanges = children
    ? children.map(({ from, to }) => ({ from, to }))
    : ranges
  const { rows, loading, error } = useStats(fetchRanges, fetchStats, reloadKey)
  const values = children ? sumValues(rows) : rows[0] || {}
  const childRows = children ? rows : []
  const breakdownTotal = values
  const isEmpty = !loading && !error && (children ? rows.length === 0 : !rows[0])

  const highlight = useMemo(
    () => ({
      bookingsCreated: Number(values.bookingsCreated) || 0,
      amountCollected: Number(values.amountCollected) || 0,
      staffPayout: Number(values.staffPayout) || 0,
    }),
    [values]
  )

  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i)

  const retry = () => setReloadKey((k) => k + 1)

  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 max-w-full w-full space-y-3 p-1 sm:p-2"
    >
      <header className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                <FiBarChart2 className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2
                  id={headingId}
                  className="text-base font-bold text-slate-900 sm:text-lg"
                >
                  KPI dashboard
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{title}</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={retry}
            disabled={loading}
            className={btnSecondary}
            aria-label="Refresh KPI data"
          >
            <FiRefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`}
              aria-hidden
            />
            Refresh
          </button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <SegWrap label="Period view">
            {VIEWS.map(({ key, label }) => (
              <Seg
                key={key}
                active={view === key}
                disabled={loading}
                onClick={() => setView(key)}
              >
                {label}
              </Seg>
            ))}
          </SegWrap>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            {
              label: 'Bookings created',
              value: formatValue(highlight.bookingsCreated, 'count'),
              className: 'text-slate-900',
            },
            {
              label: 'Amount collected',
              value: formatValue(highlight.amountCollected, 'amount'),
              className: 'text-emerald-800',
            },
            {
              label: 'Staff payout',
              value: formatValue(highlight.staffPayout, 'amount'),
              className: 'text-slate-900',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {item.label}
              </p>
              {loading ? (
                <div className="mt-1.5 h-6 w-20 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
              ) : (
                <p className={`mt-0.5 text-lg font-bold tabular-nums ${item.className}`}>
                  {item.value}
                </p>
              )}
            </div>
          ))}
        </div>
      </header>

      <div
        role="status"
        className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950"
      >
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <FiInfo className="h-3.5 w-3.5" aria-hidden />
        </span>
        <p className="leading-relaxed">
          <span className="font-semibold">API pending.</span> Numbers use placeholder data until
          the live analytics API is connected.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-3.5">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <FiCalendar className="h-3.5 w-3.5 text-indigo-600" aria-hidden />
          Period filters
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-2">
          {view === 'daily' && (
            <>
              <Field id={dateId} label="Date">
                <input
                  id={dateId}
                  type="date"
                  value={date}
                  disabled={loading}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className={FIELD_CLASS}
                />
              </Field>
              <button
                type="button"
                onClick={() => setDate(today)}
                disabled={loading || date === today}
                className={btnPrimary}
              >
                Today
              </button>
            </>
          )}

          {view === 'weekly' && (
            <>
              <Field id={weekMonthId} label="Month">
                <input
                  id={weekMonthId}
                  type="month"
                  value={wMonth}
                  disabled={loading}
                  onChange={(e) => {
                    if (!e.target.value) return
                    const [y, m] = e.target.value.split('-').map(Number)
                    setWMonth(e.target.value)
                    setWWeek(currentWeekIndex(y, m - 1))
                  }}
                  className={FIELD_CLASS}
                />
              </Field>
              <div className="min-w-0">
                <p className={LABEL_CLASS}>Week</p>
                <SegWrap label="Week of month">
                  {weekOptions.map((w, i) => (
                    <Seg
                      key={w.from}
                      active={wi === i}
                      disabled={loading}
                      onClick={() => setWWeek(i)}
                    >
                      W{i + 1}
                    </Seg>
                  ))}
                </SegWrap>
              </div>
            </>
          )}

          {view === 'monthly' && (
            <>
              <Field id={yearId} label="Year">
                <select
                  id={yearId}
                  value={year}
                  disabled={loading}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className={FIELD_CLASS}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={monthId} label="Month">
                <select
                  id={monthId}
                  value={month}
                  disabled={loading}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className={FIELD_CLASS}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          {view === 'quarterly' && (
            <>
              <Field id={yearId} label="Year">
                <select
                  id={yearId}
                  value={year}
                  disabled={loading}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className={FIELD_CLASS}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="min-w-0">
                <p className={LABEL_CLASS}>Quarter</p>
                <SegWrap label="Quarter">
                  {QUARTERS.map((q) => (
                    <Seg
                      key={q.key}
                      active={quarter === q.key}
                      disabled={loading}
                      onClick={() => setQuarter(q.key)}
                    >
                      {q.label}
                    </Seg>
                  ))}
                </SegWrap>
              </div>
            </>
          )}

          {view === 'yearly' && (
            <Field id={yearId} label="Year">
              <select
                id={yearId}
                value={year}
                disabled={loading}
                onChange={(e) => setYear(Number(e.target.value))}
                className={FIELD_CLASS}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700 sm:text-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{error}</p>
            </div>
            <button type="button" onClick={retry} className={btnSecondary}>
              <FiRefreshCw className="h-3.5 w-3.5" aria-hidden />
              Retry
            </button>
          </div>
        </div>
      ) : null}

      <div
        aria-busy={loading}
        aria-live="polite"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      >
        {loading
          ? Array.from({ length: METRICS.length }).map((_, i) => <KpiSkeleton key={`sk-${i}`} />)
          : isEmpty
            ? null
            : METRICS.map(({ key, label, type, icon, tone }, index) => (
                <KpiCard
                  key={key}
                  label={label}
                  type={type}
                  value={values[key]}
                  icon={icon}
                  tone={tone}
                  index={index}
                />
              ))}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-10 text-center shadow-sm">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <FiInbox className="h-6 w-6" aria-hidden />
          </span>
          <h3 className="mt-3 text-sm font-semibold text-slate-900">No KPI data</h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500">
            Nothing to show for this period. Try another date range or refresh.
          </p>
          <button type="button" onClick={retry} className={`${btnPrimary} mt-4`}>
            Refresh
          </button>
        </div>
      ) : null}

      {children && !error ? (
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Breakdown by {levelName}</h3>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {loading ? 'Loading…' : `${children.length} row${children.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <Breakdown
            levelName={levelName}
            items={children}
            rows={childRows}
            loading={loading}
            total={breakdownTotal}
          />
        </div>
      ) : null}
    </section>
  )
}

export default Kpis
