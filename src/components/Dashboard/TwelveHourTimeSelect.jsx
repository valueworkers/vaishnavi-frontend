const CLOCK_HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const CLOCK_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

/** Parse `HH:mm` (24h) into 12-hour parts. */
export const parseHhMmTo12h = (hhmm) => {
  const raw = String(hhmm || '').trim()
  const match = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return { hour: '12', minute: '00', ampm: 'AM' }

  let h = Number.parseInt(match[1], 10)
  let m = Number.parseInt(match[2], 10)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return { hour: '12', minute: '00', ampm: 'AM' }

  h = Math.min(23, Math.max(0, h))
  m = Math.min(59, Math.max(0, m))
  const ampm = h >= 12 ? 'PM' : 'AM'
  let hour12 = h % 12
  if (hour12 === 0) hour12 = 12

  return {
    hour: String(hour12),
    minute: String(m).padStart(2, '0'),
    ampm,
  }
}

/** Build `HH:mm` (24h) from 12-hour parts. */
export const buildHhMmFrom12h = (hour12, minute, ampm) => {
  let h = Number.parseInt(String(hour12), 10)
  const m = Number.parseInt(String(minute), 10)
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 1 || h > 12 || m < 0 || m > 59) {
    return null
  }

  const period = String(ampm || '').trim().toUpperCase()
  if (period === 'AM') {
    if (h === 12) h = 0
  } else if (period === 'PM') {
    if (h !== 12) h += 12
  } else {
    return null
  }

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Accessible 12-hour time select (Hour / Minute / AM·PM).
 * Value/onChange use 24h `HH:mm` for API compatibility.
 */
const TwelveHourTimeSelect = ({
  id,
  value = '00:00',
  onChange,
  disabled = false,
  className = '',
  selectClassName = '',
  showPreview = true,
  'aria-label': ariaLabel = 'Time',
}) => {
  const parts = parseHhMmTo12h(value)

  const emit = (next) => {
    if (disabled || typeof onChange !== 'function') return
    const hhmm = buildHhMmFrom12h(next.hour, next.minute, next.ampm)
    if (hhmm) onChange(hhmm)
  }

  const baseSelect =
    selectClassName ||
    `w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60`

  return (
    <div className={className}>
      <div className="grid grid-cols-3 gap-2">
        <select
          id={id ? `${id}-hour` : undefined}
          value={parts.hour}
          disabled={disabled}
          onChange={(e) => emit({ ...parts, hour: e.target.value })}
          className={baseSelect}
          aria-label={`${ariaLabel} hour`}
        >
          {CLOCK_HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <select
          id={id ? `${id}-minute` : undefined}
          value={parts.minute}
          disabled={disabled}
          onChange={(e) => emit({ ...parts, minute: e.target.value })}
          className={baseSelect}
          aria-label={`${ariaLabel} minute`}
        >
          {CLOCK_MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          id={id ? `${id}-ampm` : undefined}
          value={parts.ampm}
          disabled={disabled}
          onChange={(e) => emit({ ...parts, ampm: e.target.value })}
          className={`${baseSelect} font-medium`}
          aria-label={`${ariaLabel} AM or PM`}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      {showPreview ? (
        <p className="mt-1 text-[11px] text-gray-500">
          {parts.hour}:{parts.minute} {parts.ampm}
        </p>
      ) : null}
    </div>
  )
}

export default TwelveHourTimeSelect
