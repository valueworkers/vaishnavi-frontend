
import React, { useEffect, useState } from 'react'

// type: 'count' -> plain number, 'amount' -> INR currency
const ACTIVITIES = [
  { key: 'onboardStaff', label: 'Onboard new staff', type: 'count' },
  { key: 'onboardCustomer', label: 'Onboard new customer', type: 'count' },
  { key: 'terminateStaff', label: 'Terminate exited staff', type: 'count' },
  { key: 'offboardCustomer', label: 'Active customer offboarding', type: 'count' },
  { key: 'precloseBooking', label: 'Preclose booking of terminated customer', type: 'count' },
  { key: 'absenteeList', label: 'Send absentee list (to mark attendance)', type: 'count' },
  { key: 'createBooking', label: 'Create new booking', type: 'count' },
  { key: 'paymentsCollected', label: 'Update payments collected', type: 'amount' },
  { key: 'unmappedPayments', label: 'Assign unmapped payments', type: 'count' },
  { key: 'updateEmr', label: 'Update EMR', type: 'count' },
  { key: 'staffPayment', label: 'Update staff payment', type: 'count' },
  { key: 'onboardVendor', label: 'Onboard new vendor', type: 'count' },
  { key: 'venueAssignment', label: 'Modify venue assignment', type: 'count' },
  { key: 'serviceAssignment', label: 'Modify service assignment', type: 'count' },
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

/* ---------- date helpers (local dates, ISO strings YYYY-MM-DD) ---------- */

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

// Calendar weeks (Mon–Sun), clipped to the month's first and last day
const weeksOfMonth = (y, m) => {
  const last = new Date(y, m + 1, 0)
  const weeks = []
  let start = new Date(y, m, 1)
  while (start <= last) {
    const dow = (start.getDay() + 6) % 7 // Mon = 0
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

/* ---------- number helpers ---------- */

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

/* ---------- data layer ----------
 * fetchStats(ranges) receives [{ from, to }, ...] (inclusive ISO dates) and
 * must resolve to an array of value objects, one per range, in the same order:
 *   [{ onboardStaff: 2, ..., paymentsCollected: 125000 }, ...]
 * Replace mockFetchStats with a call to your API / n8n webhook / Neon query.
 */
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
          setState({ rows: [], loading: false, error: 'Could not load data. Try again.' })
      )
    return () => {
      cancelled = true
    }
  }, [key, fetchStats])

  return state
}

/* ---------- UI pieces ---------- */

const inputCls =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500'

const Seg = ({ active, onClick, children }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${
      active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
    }`}
  >
    {children}
  </button>
)

const SegWrap = ({ label, children }) => (
  <div
    role="group"
    aria-label={label}
    className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-100 p-1"
  >
    {children}
  </div>
)

const KpiCard = ({ label, value, type, loading }) => {
  const isAmount = type === 'amount'
  return (
    <div
      className={`flex flex-col justify-between rounded-lg border p-4 ${
        isAmount ? 'border-emerald-300 bg-emerald-50 sm:col-span-2' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p
        className={`mt-3 text-3xl font-semibold tabular-nums ${
          isAmount ? 'text-emerald-800' : 'text-slate-900'
        }`}
      >
        {loading ? '–' : formatValue(value, type)}
      </p>
    </div>
  )
}

const Breakdown = ({ levelName, items, rows, loading, total }) => {
  const cell = (v, type) => (Number(v) ? formatValue(v, type) : '–')
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-medium">
              {levelName}
            </th>
            {ACTIVITIES.map((a) => (
              <th key={a.key} className="min-w-[8rem] px-3 py-2 text-right font-medium">
                {a.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((c, i) => (
            <tr key={c.key} className="border-t border-slate-100">
              <th
                scope="row"
                className="sticky left-0 bg-white px-3 py-2 text-left font-medium text-slate-900"
              >
                {c.onOpen ? (
                  <button
                    type="button"
                    onClick={c.onOpen}
                    className="text-left underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                  >
                    {c.label}
                  </button>
                ) : (
                  c.label
                )}
                {c.sub && (
                  <span className="block text-xs font-normal text-slate-500">{c.sub}</span>
                )}
              </th>
              {ACTIVITIES.map((a) => (
                <td key={a.key} className="px-3 py-2 text-right tabular-nums text-slate-800">
                  {loading ? '' : cell(rows[i]?.[a.key], a.type)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-slate-300 bg-slate-50 font-semibold">
          <tr>
            <th scope="row" className="sticky left-0 bg-slate-50 px-3 py-2 text-left">
              Total
            </th>
            {ACTIVITIES.map((a) => (
              <td key={a.key} className="px-3 py-2 text-right tabular-nums text-slate-900">
                {loading ? '' : formatValue(total[a.key], a.type)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/* ---------- main component ----------
 * Daily   : pick any date from the calendar.
 * Weekly  : pick a month, then a week of that month (Mon–Sun, clipped to the month).
 * Monthly : pick a year -> all 12 months; click a month -> its weeks;
 *           click a week -> its days. Use the breadcrumb to go back up.
 *
 * <Kpis fetchStats={async (ranges) => [...]} />
 */
const Kpis = ({ fetchStats = mockFetchStats, defaultView = 'daily' }) => {
  const now = new Date()
  const today = iso(now)

  const [view, setView] = useState(defaultView)
  const [date, setDate] = useState(today)
  const [wMonth, setWMonth] = useState(today.slice(0, 7)) // 'YYYY-MM'
  const [wWeek, setWWeek] = useState(() => currentWeekIndex(now.getFullYear(), now.getMonth()))
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(null)
  const [week, setWeek] = useState(null)

  const [wy, wm] = wMonth.split('-').map(Number)
  const weekOptions = weeksOfMonth(wy, wm - 1)
  const wi = Math.min(wWeek, weekOptions.length - 1)

  // Work out what to fetch and how to label it
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

  const goYear = () => {
    setMonth(null)
    setWeek(null)
  }

  return (
    <section aria-label="Activities" className="w-full">
      <div
        role="status"
        className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      >
        <span className="font-semibold">API pending.</span>{' '}
        KPI numbers below use placeholder (mock) data until the live analytics API is connected.
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <SegWrap label="View">
          {VIEWS.map(({ key, label }) => (
            <Seg key={key} active={view === key} onClick={() => setView(key)}>
              {label}
            </Seg>
          ))}
        </SegWrap>
      </div>

      {/* Filters for the selected view */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {view === 'daily' && (
          <>
            <label className="flex items-center gap-2 text-sm text-slate-600">
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
              className={`${inputCls} hover:bg-slate-50`}
            >
              Today
            </button>
          </>
        )}

        {view === 'weekly' && (
          <>
            <label className="flex items-center gap-2 text-sm text-slate-600">
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
                  Week {i + 1}
                </Seg>
              ))}
            </SegWrap>
          </>
        )}

        {view === 'monthly' && (
          <>
            <label className="flex items-center gap-2 text-sm text-slate-600">
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
            <nav aria-label="Drill-down" className="flex items-center gap-1 text-sm">
              <button
                type="button"
                onClick={goYear}
                disabled={month === null}
                className="font-medium text-slate-700 underline-offset-2 enabled:hover:underline disabled:text-slate-900"
              >
                {year}
              </button>
              {month !== null && (
                <>
                  <span aria-hidden="true" className="text-slate-400">
                    ›
                  </span>
                  <button
                    type="button"
                    onClick={() => setWeek(null)}
                    disabled={week === null}
                    className="font-medium text-slate-700 underline-offset-2 enabled:hover:underline disabled:text-slate-900"
                  >
                    {MONTHS[month]}
                  </button>
                </>
              )}
              {week !== null && (
                <>
                  <span aria-hidden="true" className="text-slate-400">
                    ›
                  </span>
                  <span className="font-medium text-slate-900">Week {week + 1}</span>
                </>
              )}
            </nav>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div
        aria-busy={loading}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {ACTIVITIES.map(({ key, label, type }) => (
          <KpiCard key={key} label={label} type={type} value={values[key]} loading={loading} />
        ))}
      </div>

      {children && (
        <Breakdown
          levelName={levelName}
          items={children}
          rows={rows}
          loading={loading}
          total={values}
        />
      )}
    </section>
  )
}

export default Kpis