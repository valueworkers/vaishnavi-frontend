import React, { useEffect, useState } from 'react'
import { FiAlertCircle, FiBarChart2, FiCalendar, FiInfo } from 'react-icons/fi'

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
  'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

const Seg = ({ active, onClick, children }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
      active
        ? 'bg-white text-indigo-700 shadow-sm'
        : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
    }`}
  >
    {children}
  </button>
)

const SegWrap = ({ label, children }) => (
  <div
    role="group"
    aria-label={label}
    className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-100 p-0.5"
  >
    {children}
  </div>
)

const KpiCard = ({ label, value, type, loading }) => {
  const isAmount = type === 'amount'
  return (
    <div
      className={`flex min-h-[5.5rem] flex-col justify-between rounded-lg border p-3 transition-shadow hover:shadow-sm ${
        isAmount
          ? 'border-emerald-200 bg-emerald-50/80 sm:col-span-2'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold leading-snug text-slate-600">{label}</p>
        {isAmount ? (
          <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-800">
            Amount
          </span>
        ) : (
          <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-700">
            Count
          </span>
        )}
      </div>
      {loading ? (
        <div
          className={`mt-3 h-7 w-20 animate-pulse rounded ${isAmount ? 'bg-emerald-200/70' : 'bg-slate-200'}`}
          aria-hidden
        />
      ) : (
        <p
          className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${
            isAmount ? 'text-emerald-800' : 'text-slate-900'
          }`}
        >
          {formatValue(value, type)}
        </p>
      )}
    </div>
  )
}

const Breakdown = ({ levelName, items, rows, loading, total }) => {
  const cell = (v, type) => (Number(v) ? formatValue(v, type) : '–')
  return (
    <div className="mt-4 min-w-0 max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-max w-full border-collapse text-[11px] text-slate-700">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-100 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">
              {levelName}
            </th>
            {ACTIVITIES.map((a) => (
              <th
                key={a.key}
                className="min-w-[7.5rem] px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide"
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
                  <td className="sticky left-0 bg-white px-2 py-2" colSpan={ACTIVITIES.length + 1}>
                    <div className="h-3 w-full max-w-md animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            : items.map((c, i) => (
                <tr key={c.key} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <th
                    scope="row"
                    className="sticky left-0 bg-white px-2 py-1.5 text-left font-semibold text-slate-900"
                  >
                    {c.onOpen ? (
                      <button
                        type="button"
                        onClick={c.onOpen}
                        className="text-left text-indigo-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      >
                        {c.label}
                      </button>
                    ) : (
                      c.label
                    )}
                    {c.sub ? (
                      <span className="mt-0.5 block text-[10px] font-normal text-slate-500">{c.sub}</span>
                    ) : null}
                  </th>
                  {ACTIVITIES.map((a) => (
                    <td key={a.key} className="px-2 py-1.5 text-right tabular-nums text-slate-800">
                      {cell(rows[i]?.[a.key], a.type)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
        {!loading ? (
          <tfoot className="border-t border-slate-300 bg-slate-50 font-semibold">
            <tr>
              <th scope="row" className="sticky left-0 bg-slate-50 px-2 py-1.5 text-left text-slate-900">
                Total
              </th>
              {ACTIVITIES.map((a) => (
                <td key={a.key} className="px-2 py-1.5 text-right tabular-nums text-slate-900">
                  {formatValue(total[a.key], a.type)}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
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

  const goYear = () => {
    setMonth(null)
    setWeek(null)
  }

  return (
    <section aria-label="KPI activities" className="min-w-0 max-w-full w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-700">
            <FiBarChart2 className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">KPI</h2>
            <p className="truncate text-[11px] text-slate-500">{title}</p>
          </div>
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

      <div
        role="status"
        className="mb-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-950"
      >
        <FiInfo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
        <p>
          <span className="font-semibold">API pending.</span> Numbers below use placeholder (mock)
          data until the live analytics API is connected.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
          <FiCalendar className="h-3.5 w-3.5 text-indigo-600" aria-hidden />
          Period
        </span>

        {view === 'daily' && (
          <>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
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
              className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-800 transition-colors hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Today
            </button>
          </>
        )}

        {view === 'weekly' && (
          <>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
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
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
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
              className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px]"
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
          className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-800"
        >
          <FiAlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}

      <div
        aria-busy={loading}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
      >
        {ACTIVITIES.map(({ key, label, type }) => (
          <KpiCard key={key} label={label} type={type} value={values[key]} loading={loading} />
        ))}
      </div>

      {children ? (
        <div className="mt-1">
          <div className="mb-1.5 mt-4 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-slate-800">Breakdown by {levelName}</h3>
            <span className="text-[10px] text-slate-500">
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
