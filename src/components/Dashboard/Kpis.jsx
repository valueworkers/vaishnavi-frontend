import React, { useEffect, useMemo, useState } from 'react'
import {
  FiAlertCircle,
  FiBarChart2,
  FiBriefcase,
  FiCalendar,
  FiCheckCircle,
  FiClipboard,
  FiCreditCard,
  FiFileText,
  FiInfo,
  FiMapPin,
  FiUserMinus,
  FiUserPlus,
  FiUsers,
} from 'react-icons/fi'

const ACTIVITIES = [
  { key: 'onboardStaff', label: 'Onboard new staff', type: 'count', icon: FiUserPlus, tone: 'indigo' },
  { key: 'onboardCustomer', label: 'Onboard new customer', type: 'count', icon: FiUsers, tone: 'sky' },
  { key: 'terminateStaff', label: 'Terminate exited staff', type: 'count', icon: FiUserMinus, tone: 'rose' },
  { key: 'offboardCustomer', label: 'Active customer offboarding', type: 'count', icon: FiUserMinus, tone: 'orange' },
  { key: 'precloseBooking', label: 'Preclose booking of terminated customer', type: 'count', icon: FiClipboard, tone: 'amber' },
  { key: 'absenteeList', label: 'Send absentee list (to mark attendance)', type: 'count', icon: FiCalendar, tone: 'violet' },
  { key: 'createBooking', label: 'Create new booking', type: 'count', icon: FiCheckCircle, tone: 'teal' },
  { key: 'paymentsCollected', label: 'Update payments collected', type: 'amount', icon: FiCreditCard, tone: 'emerald' },
  { key: 'unmappedPayments', label: 'Assign unmapped payments', type: 'count', icon: FiCreditCard, tone: 'lime' },
  { key: 'updateEmr', label: 'Update EMR', type: 'count', icon: FiFileText, tone: 'cyan' },
  { key: 'staffPayment', label: 'Update staff payment', type: 'count', icon: FiBriefcase, tone: 'blue' },
  { key: 'onboardVendor', label: 'Onboard new vendor', type: 'count', icon: FiBriefcase, tone: 'fuchsia' },
  { key: 'venueAssignment', label: 'Modify venue assignment', type: 'count', icon: FiMapPin, tone: 'slate' },
  { key: 'serviceAssignment', label: 'Modify service assignment', type: 'count', icon: FiBarChart2, tone: 'indigo' },
]

const VIEWS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const TONE = {
  indigo: {
    icon: 'bg-indigo-50 text-indigo-600',
    badge: 'bg-indigo-50 text-indigo-700',
    bar: 'bg-indigo-500',
    soft: 'from-indigo-50/80 to-white',
  },
  sky: {
    icon: 'bg-sky-50 text-sky-600',
    badge: 'bg-sky-50 text-sky-700',
    bar: 'bg-sky-500',
    soft: 'from-sky-50/80 to-white',
  },
  rose: {
    icon: 'bg-rose-50 text-rose-600',
    badge: 'bg-rose-50 text-rose-700',
    bar: 'bg-rose-500',
    soft: 'from-rose-50/70 to-white',
  },
  orange: {
    icon: 'bg-orange-50 text-orange-600',
    badge: 'bg-orange-50 text-orange-700',
    bar: 'bg-orange-500',
    soft: 'from-orange-50/70 to-white',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-600',
    badge: 'bg-amber-50 text-amber-800',
    bar: 'bg-amber-500',
    soft: 'from-amber-50/70 to-white',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-600',
    badge: 'bg-violet-50 text-violet-700',
    bar: 'bg-violet-500',
    soft: 'from-violet-50/70 to-white',
  },
  teal: {
    icon: 'bg-teal-50 text-teal-600',
    badge: 'bg-teal-50 text-teal-700',
    bar: 'bg-teal-500',
    soft: 'from-teal-50/70 to-white',
  },
  emerald: {
    icon: 'bg-emerald-100 text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-800',
    bar: 'bg-emerald-500',
    soft: 'from-emerald-50 to-white',
  },
  lime: {
    icon: 'bg-lime-50 text-lime-700',
    badge: 'bg-lime-50 text-lime-800',
    bar: 'bg-lime-500',
    soft: 'from-lime-50/70 to-white',
  },
  cyan: {
    icon: 'bg-cyan-50 text-cyan-600',
    badge: 'bg-cyan-50 text-cyan-700',
    bar: 'bg-cyan-500',
    soft: 'from-cyan-50/70 to-white',
  },
  blue: {
    icon: 'bg-blue-50 text-blue-600',
    badge: 'bg-blue-50 text-blue-700',
    bar: 'bg-blue-500',
    soft: 'from-blue-50/70 to-white',
  },
  fuchsia: {
    icon: 'bg-fuchsia-50 text-fuchsia-600',
    badge: 'bg-fuchsia-50 text-fuchsia-700',
    bar: 'bg-fuchsia-500',
    soft: 'from-fuchsia-50/70 to-white',
  },
  slate: {
    icon: 'bg-slate-100 text-slate-600',
    badge: 'bg-slate-100 text-slate-700',
    bar: 'bg-slate-400',
    soft: 'from-slate-50 to-white',
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
const fmtDay = (s) => fmt(s, { weekday: 'short', day: 'numeric', month: 'short' })
const fmtLong = (s) =>
  fmt(s, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const rangeLabel = ({ from, to }) =>
  from === to ? fmtShort(from) : `${fmtShort(from)} – ${fmtShort(to)}`

const monthRange = (y, m) => ({
  from: iso(new Date(y, m, 1)),
  to: iso(new Date(y, m + 1, 0)),
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
  ACTIVITIES.forEach(({ key }) => {
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
    ACTIVITIES.forEach(({ key, type }) => {
      out[key] = days.reduce((s, d) => {
        const r = hash(d + key)
        return s + (type === 'amount' ? Math.round((r * 150000) / 100) * 100 : Math.floor(r * r * 6))
      }, 0)
    })
    return out
  })

const useStats = (ranges, fetchStats) => {
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
          setState({ rows: [], loading: false, error: 'Could not load KPI data. Please try again.' })
      )
    return () => {
      cancelled = true
    }
  }, [key, fetchStats])

  return state
}

const inputCls =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20'

const Seg = ({ active, onClick, children }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
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
    className="inline-flex flex-wrap rounded-xl border border-slate-200/80 bg-slate-100/90 p-1 shadow-inner"
  >
    {children}
  </div>
)

const KpiCard = ({ label, value, type, loading, icon: Icon, tone = 'indigo', index = 0 }) => {
  const isAmount = type === 'amount'
  const t = TONE[tone] || TONE.indigo
  return (
    <article
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      className={`group relative flex min-h-[6.25rem] flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-gradient-to-br ${t.soft} p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md motion-safe:animate-[fadeSlideIn_0.28s_ease-out_both] ${
        isAmount ? 'sm:col-span-2' : ''
      }`}
    >
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${t.bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.icon} ring-1 ring-black/5`}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <p className="text-[11px] font-semibold leading-snug text-slate-600">{label}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
            isAmount ? 'bg-emerald-100 text-emerald-800' : t.badge
          }`}
        >
          {isAmount ? '₹ Amount' : 'Count'}
        </span>
      </div>
      {loading ? (
        <div className="mt-auto pl-1.5 pt-3">
          <div className="h-8 w-24 animate-pulse rounded-md bg-slate-200/80" aria-hidden />
        </div>
      ) : (
        <p
          className={`mt-auto pl-1.5 pt-2 text-[1.65rem] font-bold tabular-nums tracking-tight ${
            isAmount ? 'text-emerald-800' : 'text-slate-900'
          }`}
        >
          {formatValue(value, type)}
        </p>
      )}
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
            <tr className="bg-gradient-to-r from-slate-100 to-slate-50 text-slate-700">
              <th className="sticky left-0 z-10 bg-slate-100 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider">
                {levelName}
              </th>
              {ACTIVITIES.map((a) => (
                <th
                  key={a.key}
                  className="min-w-[7.5rem] px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider"
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
                    <td className="sticky left-0 bg-white px-3 py-2.5" colSpan={ACTIVITIES.length + 1}>
                      <div className="h-3 w-full max-w-md animate-pulse rounded bg-slate-100" />
                    </td>
                  </tr>
                ))
              : items.map((c, i) => (
                  <tr
                    key={c.key}
                    className="border-t border-slate-100 transition-colors hover:bg-indigo-50/40"
                  >
                    <th
                      scope="row"
                      className="sticky left-0 bg-white px-3 py-2 text-left font-semibold text-slate-900"
                    >
                      {c.onOpen ? (
                        <button
                          type="button"
                          onClick={c.onOpen}
                          className="inline-flex items-center gap-1 rounded-md text-left text-indigo-700 underline-offset-2 transition-colors hover:bg-indigo-50 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                          {c.label}
                          <span className="text-[10px] text-indigo-400" aria-hidden>
                            →
                          </span>
                        </button>
                      ) : (
                        c.label
                      )}
                      {c.sub ? (
                        <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
                          {c.sub}
                        </span>
                      ) : null}
                    </th>
                    {ACTIVITIES.map((a) => (
                      <td key={a.key} className="px-2.5 py-2 text-right tabular-nums text-slate-800">
                        {cell(rows[i]?.[a.key], a.type)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
          {!loading ? (
            <tfoot>
              <tr className="border-t-2 border-indigo-100 bg-indigo-50/50 font-bold">
                <th
                  scope="row"
                  className="sticky left-0 bg-indigo-50/90 px-3 py-2.5 text-left text-indigo-950"
                >
                  Total
                </th>
                {ACTIVITIES.map((a) => (
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

const Kpis = ({ fetchStats = mockFetchStats, defaultView = 'daily' }) => {
  const now = new Date()
  const today = iso(now)

  const [view, setView] = useState(defaultView)
  const [date, setDate] = useState(today)
  const [wMonth, setWMonth] = useState(today.slice(0, 7))
  const [wWeek, setWWeek] = useState(() => currentWeekIndex(now.getFullYear(), now.getMonth()))
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(null)
  const [week, setWeek] = useState(null)

  const [wy, wm] = wMonth.split('-').map(Number)
  const weekOptions = weeksOfMonth(wy, wm - 1)
  const wi = Math.min(wWeek, weekOptions.length - 1)

  let title
  let ranges
  let children = null
  let levelName = ''

  if (view === 'daily') {
    ranges = [{ from: date, to: date }]
    title = `Activities on ${fmtLong(date)}`
  } else if (view === 'weekly') {
    ranges = [weekOptions[wi]]
    title = `Week ${wi + 1}, ${MONTHS[wm - 1]} ${wy} (${rangeLabel(weekOptions[wi])})`
  } else if (month === null) {
    levelName = 'Month'
    children = MONTHS.map((m, i) => ({
      key: m,
      label: m,
      ...monthRange(year, i),
      onOpen: () => setMonth(i),
    }))
    title = `Activities in ${year}`
  } else {
    const weeks = weeksOfMonth(year, month)
    if (week === null) {
      levelName = 'Week'
      children = weeks.map((w, i) => ({
        key: w.from,
        label: `Week ${i + 1}`,
        sub: rangeLabel(w),
        ...w,
        onOpen: () => setWeek(i),
      }))
      title = `Activities in ${MONTHS[month]} ${year}`
    } else {
      levelName = 'Day'
      children = daysOfRange(weeks[week]).map((d) => ({
        key: d,
        label: fmtDay(d),
        from: d,
        to: d,
      }))
      title = `Week ${week + 1}, ${MONTHS[month]} ${year} (${rangeLabel(weeks[week])})`
    }
  }
  if (children) ranges = children.map(({ from, to }) => ({ from, to }))

  const { rows, loading, error } = useStats(ranges, fetchStats)
  const values = children ? sumValues(rows) : rows[0] || {}

  const summary = useMemo(() => {
    const countKeys = ACTIVITIES.filter((a) => a.type === 'count').map((a) => a.key)
    const totalCount = countKeys.reduce((s, k) => s + (Number(values[k]) || 0), 0)
    const amount = Number(values.paymentsCollected) || 0
    return { totalCount, amount }
  }, [values])

  const goYear = () => {
    setMonth(null)
    setWeek(null)
  }

  return (
    <section aria-label="KPI activities" className="min-w-0 max-w-full w-full space-y-3">
      <header className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 px-4 py-4 text-white shadow-md shadow-indigo-200/50">
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 left-1/3 h-28 w-28 rounded-full bg-violet-400/30 blur-2xl"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
                <FiBarChart2 className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-100">
                  Analytics
                </p>
                <h2 className="text-base font-bold tracking-tight sm:text-lg">KPI dashboard</h2>
              </div>
            </div>
            <p className="mt-1 max-w-xl text-xs text-indigo-100/95">{title}</p>
          </div>
          <SegWrap label="View">
            {VIEWS.map(({ key, label }) => (
              <Seg
                key={key}
                active={view === key}
                onClick={() => {
                  setView(key)
                  if (key === 'monthly') {
                    setMonth(null)
                    setWeek(null)
                  }
                }}
              >
                {label}
              </Seg>
            ))}
          </SegWrap>
        </div>

        <div className="relative mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
          <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/15 backdrop-blur-sm">
            <p className="text-[10px] font-medium uppercase tracking-wide text-indigo-100">
              Total actions
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums">
              {loading ? '–' : formatValue(summary.totalCount, 'count')}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/15 backdrop-blur-sm">
            <p className="text-[10px] font-medium uppercase tracking-wide text-indigo-100">
              Payments collected
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums">
              {loading ? '–' : formatValue(summary.amount, 'amount')}
            </p>
          </div>
        </div>
      </header>

      <div
        role="status"
        className="flex gap-2.5 rounded-xl border border-amber-200/90 bg-gradient-to-r from-amber-50 to-orange-50/60 px-3 py-2.5 text-[11px] text-amber-950 shadow-sm"
      >
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <FiInfo className="h-3.5 w-3.5" aria-hidden />
        </span>
        <p className="leading-relaxed">
          <span className="font-semibold">API pending.</span> Numbers below use placeholder (mock)
          data until the live analytics API is connected.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200/80">
          <FiCalendar className="h-3.5 w-3.5 text-indigo-600" aria-hidden />
          Period
        </span>

        {view === 'daily' && (
          <>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className={inputCls}
              />
            </label>
            <button
              type="button"
              onClick={() => setDate(today)}
              className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Today
            </button>
          </>
        )}

        {view === 'weekly' && (
          <>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
              Month
              <input
                type="month"
                value={wMonth}
                onChange={(e) => {
                  if (!e.target.value) return
                  const [y, m] = e.target.value.split('-').map(Number)
                  setWMonth(e.target.value)
                  setWWeek(currentWeekIndex(y, m - 1))
                }}
                className={inputCls}
              />
            </label>
            <SegWrap label="Week of month">
              {weekOptions.map((w, i) => (
                <Seg key={w.from} active={wi === i} onClick={() => setWWeek(i)}>
                  W{i + 1}
                </Seg>
              ))}
            </SegWrap>
          </>
        )}

        {view === 'monthly' && (
          <>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
              Year
              <select
                value={year}
                onChange={(e) => {
                  setYear(Number(e.target.value))
                  goYear()
                }}
                className={inputCls}
              >
                {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <nav
              aria-label="Drill-down"
              className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px]"
            >
              <button
                type="button"
                onClick={goYear}
                disabled={month === null}
                className="font-semibold text-indigo-700 underline-offset-2 enabled:hover:underline disabled:cursor-default disabled:text-slate-900 disabled:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {year}
              </button>
              {month !== null && (
                <>
                  <span aria-hidden="true" className="text-slate-400">
                    /
                  </span>
                  <button
                    type="button"
                    onClick={() => setWeek(null)}
                    disabled={week === null}
                    className="font-semibold text-indigo-700 underline-offset-2 enabled:hover:underline disabled:cursor-default disabled:text-slate-900 disabled:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    {MONTHS[month]}
                  </button>
                </>
              )}
              {week !== null && (
                <>
                  <span aria-hidden="true" className="text-slate-400">
                    /
                  </span>
                  <span className="font-semibold text-slate-900">Week {week + 1}</span>
                </>
              )}
            </nav>
          </>
        )}
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] text-rose-800 shadow-sm"
        >
          <FiAlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}

      <div
        aria-busy={loading}
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4"
      >
        {ACTIVITIES.map(({ key, label, type, icon, tone }, index) => (
          <KpiCard
            key={key}
            label={label}
            type={type}
            value={values[key]}
            loading={loading}
            icon={icon}
            tone={tone}
            index={index}
          />
        ))}
      </div>

      {children ? (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-800">
              Breakdown by {levelName}
              <span className="ml-1.5 font-normal text-slate-500">
                — click a row to drill down
              </span>
            </h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {loading ? 'Loading…' : `${children.length} row${children.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <Breakdown
            levelName={levelName}
            items={children}
            rows={rows}
            loading={loading}
            total={values}
          />
        </div>
      ) : null}
    </section>
  )
}

export default Kpis
