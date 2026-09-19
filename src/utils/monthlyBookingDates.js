/**
 * Monthly package date range from a start date:
 * - Start on the 1st → entire calendar month (1st through last day of that month).
 * - Any other start day → through (same day next month minus one day).
 *   e.g. 10 May → 9 Jun, 15 May → 14 Jun, 20 May → 19 Jun.
 */
export function getMonthlyBlockDateStrings(startDate) {
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  const dates = []

  if (start.getDate() === 1) {
    const year = start.getFullYear()
    const month = start.getMonth()
    const lastDay = new Date(year, month + 1, 0).getDate()
    for (let day = 1; day <= lastDay; day++) {
      dates.push(new Date(year, month, day).toDateString())
    }
  } else {
    const end = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate())
    end.setDate(end.getDate() - 1)
    end.setHours(0, 0, 0, 0)
    const current = new Date(start)
    while (current <= end) {
      dates.push(new Date(current).toDateString())
      current.setDate(current.getDate() + 1)
    }
  }

  return dates
}
