import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { getMonthlyBlockDateStrings } from '../../utils/monthlyBookingDates';

const dateToYmd = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const getDaysInMonth = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  return { daysInMonth: lastDay.getDate(), startingDayOfWeek: firstDay.getDay() };
};

const isMainServiceBooking = (booking) => {
  const type = String(booking?.booking_type || '')
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return type === 'CLIENT_SIDE' || type === 'IN_HOUSE' || type === 'CLIENT';
};

const formatShortDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Distinct styles per main-order index (0 = older … last = latest). */
const ORDER_SWATCHES = [
  {
    key: 'sky',
    swatch: 'bg-sky-100 ring-1 ring-sky-400',
    day: 'border border-sky-300 bg-sky-100 text-sky-900 hover:bg-sky-200',
    dayPast: 'bg-sky-50 text-sky-300 cursor-not-allowed',
    label: 'text-sky-800',
  },
  {
    key: 'amber',
    swatch: 'bg-amber-100 ring-1 ring-amber-400',
    day: 'border border-amber-400 bg-amber-100 text-amber-950 hover:bg-amber-200',
    dayPast: 'bg-amber-50 text-amber-300 cursor-not-allowed',
    label: 'text-amber-900',
  },
  {
    key: 'violet',
    swatch: 'bg-violet-100 ring-1 ring-violet-400',
    day: 'border border-violet-300 bg-violet-100 text-violet-900 hover:bg-violet-200',
    dayPast: 'bg-violet-50 text-violet-300 cursor-not-allowed',
    label: 'text-violet-800',
  },
  {
    key: 'rose',
    swatch: 'bg-rose-100 ring-1 ring-rose-400',
    day: 'border border-rose-300 bg-rose-100 text-rose-900 hover:bg-rose-200',
    dayPast: 'bg-rose-50 text-rose-300 cursor-not-allowed',
    label: 'text-rose-800',
  },
];

const OVERLAP_DAY =
  'border border-fuchsia-400 bg-fuchsia-100 text-fuchsia-950 hover:bg-fuchsia-200';
const OVERLAP_DAY_PAST = 'bg-fuchsia-50 text-fuchsia-300 cursor-not-allowed';

const TERNARY_DAY =
  'border border-emerald-500 bg-emerald-100 text-emerald-950 hover:bg-emerald-200';
const TERNARY_DAY_PAST = 'bg-emerald-50 text-emerald-300 cursor-not-allowed';

const bookingOrderKey = (booking) =>
  String(
    booking?.primary_order_id ||
      booking?.secondary_order_id ||
      booking?.order_id ||
      `${booking?.start_datetime}-${booking?.end_datetime}`
  );

/** Ternary (OPD add-on) rows whose service window covers the calendar day. */
const getTernaryOrdersForDate = (bookings, ymd) => {
  if (!ymd || !Array.isArray(bookings)) return [];
  const out = [];
  const seen = new Set();
  for (const booking of bookings) {
    const tertiaries = Array.isArray(booking?.ternary_orders) ? booking.ternary_orders : [];
    for (const ternary of tertiaries) {
      const startYmd = String(ternary?.start_datetime || '').slice(0, 10);
      const endYmd = String(ternary?.end_datetime || startYmd).slice(0, 10);
      if (!startYmd || ymd < startYmd || ymd > endYmd) continue;
      const key = String(
        ternary?.ternary_order_id || ternary?.order_id || `${startYmd}-${ternary?.service_name || ''}`
      );
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ternary);
    }
  }
  return out;
};

const formatShortTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

const resolveTernaryLocationText = (ternary) => {
  const locality = String(ternary?.location_locality ?? '').trim();
  if (locality) return locality;
  const clientAddr = String(ternary?.client_address ?? '').trim();
  if (clientAddr) return clientAddr;
  return String(ternary?.venue_name ?? '').trim();
};

const BookingAvailabilityCalendar = ({
  patientId,
  serviceId,
  packagePeriod = 'DAILY',
  startDate = '',
  endDate = '',
  onRangeChange,
  isVsreOwner = false,
  disabled = false,
  /** When true (add OPD service), dates occupied by main services stay selectable. */
  opdOnOccupiedAllowed = false,
  onUnavailableSelect,
  className = '',
}) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [serviceAvailability, setServiceAvailability] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hoveredDate, setHoveredDate] = useState(null);
  const [rangeAnchor, setRangeAnchor] = useState(null);

  const period = String(packagePeriod || 'DAILY').toUpperCase();
  const isMonthly = period === 'MONTHLY';

  const availabilityByDate = useMemo(() => {
    const entries = Array.isArray(serviceAvailability?.calendar) ? serviceAvailability.calendar : [];
    const map = new Map();
    for (const row of entries) {
      const key = String(row?.date || '').slice(0, 10);
      if (key) map.set(key, row);
    }
    return map;
  }, [serviceAvailability]);

  /** Unique main bookings in this month, oldest → newest by start_datetime. */
  const mainOrders = useMemo(() => {
    const byKey = new Map();
    for (const row of availabilityByDate.values()) {
      const bookings = Array.isArray(row?.bookings) ? row.bookings : [];
      for (const booking of bookings) {
        const type = String(booking?.booking_type || '');
        if (type && !isMainServiceBooking(booking)) continue;
        const key = bookingOrderKey(booking);
        if (!key || byKey.has(key)) continue;
        byKey.set(key, {
          key,
          primaryOrderId: booking.primary_order_id || booking.order_id || key,
          orderId: booking.order_id || '',
          serviceName: booking.service_name || 'Main service',
          packageName: booking.package_name || '',
          status: booking.status || '',
          bookingType: booking.booking_type || '',
          startDatetime: booking.start_datetime || '',
          endDatetime: booking.end_datetime || '',
          startMs: Date.parse(booking.start_datetime || '') || 0,
          endMs: Date.parse(booking.end_datetime || '') || 0,
        });
      }
    }
    return [...byKey.values()].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  }, [availabilityByDate]);

  const latestOrderKey = mainOrders.length ? mainOrders[mainOrders.length - 1].key : null;

  const orderStyleByKey = useMemo(() => {
    const map = new Map();
    mainOrders.forEach((order, index) => {
      const isLatest = order.key === latestOrderKey;
      // Latest order always uses amber (emphasized for OPD); older use other swatches.
      const swatch = isLatest
        ? ORDER_SWATCHES[1]
        : ORDER_SWATCHES[index % ORDER_SWATCHES.length === 1 ? 0 : index % ORDER_SWATCHES.length];
      map.set(order.key, { ...swatch, index, isLatest });
    });
    return map;
  }, [mainOrders, latestOrderKey]);

  const latestOrder = mainOrders.length ? mainOrders[mainOrders.length - 1] : null;

  const getDayMeta = useCallback(
    (date) => {
      const ymd = dateToYmd(date);
      const availabilityForDate = ymd ? availabilityByDate.get(ymd) : null;
      const bookings = Array.isArray(availabilityForDate?.bookings)
        ? availabilityForDate.bookings
        : [];
      const isPast = Boolean(availabilityForDate?.is_past);
      const isApiAvailable = availabilityForDate
        ? Boolean(availabilityForDate.is_available)
        : null;
      const mainBookingsOnDay = bookings.filter(
        (b) => isMainServiceBooking(b) || !String(b?.booking_type || '')
      );
      const orderKeysOnDay = [
        ...new Set(mainBookingsOnDay.map(bookingOrderKey).filter(Boolean)),
      ];
      const hasMainService = orderKeysOnDay.length > 0;
      const occupiedByMain =
        availabilityForDate != null &&
        !isApiAvailable &&
        (hasMainService || bookings.length > 0);
      const isOverlap = orderKeysOnDay.length > 1;
      const coversLatest = Boolean(latestOrderKey && orderKeysOnDay.includes(latestOrderKey));
      const primaryOrderKey = coversLatest
        ? latestOrderKey
        : orderKeysOnDay[0] || null;
      const ternaryOrdersOnDay = getTernaryOrdersForDate(bookings, ymd);
      const hasTernaryOnDay = ternaryOrdersOnDay.length > 0;

      let selectable = false;
      if (availabilityForDate) {
        if (isPast) {
          selectable = false;
        } else if (isApiAvailable) {
          selectable = true;
        } else if (opdOnOccupiedAllowed && occupiedByMain) {
          selectable = true;
        } else {
          selectable = false;
        }
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (isVsreOwner) {
          selectable = date >= today;
        } else {
          const minBookingDate = new Date(today);
          minBookingDate.setDate(today.getDate() + 2);
          selectable = date >= minBookingDate;
        }
      }

      return {
        ymd,
        availabilityForDate,
        bookings,
        isPast,
        isApiAvailable,
        occupiedByMain,
        selectable,
        orderKeysOnDay,
        isOverlap,
        coversLatest,
        primaryOrderKey,
        ternaryOrdersOnDay,
        hasTernaryOnDay,
      };
    },
    [availabilityByDate, isVsreOwner, opdOnOccupiedAllowed, latestOrderKey]
  );

  const isDateAvailable = useCallback((date) => getDayMeta(date).selectable, [getDayMeta]);

  const fetchServiceAvailability = useCallback(async () => {
    if (!patientId) {
      setServiceAvailability(null);
      setError('');
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setServiceAvailability(null);
      setError('Authorization token missing. Please log in again.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const response = await axios.get(`${import.meta.env.VITE_BASEURL_CARE}/booking/availability/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          patient_id: patientId,
          month: currentMonth.getMonth() + 1,
          year: currentMonth.getFullYear(),
        },
      });
      setServiceAvailability(response?.data || null);
    } catch (err) {
      setServiceAvailability(null);
      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          'Could not load booking availability.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [patientId, currentMonth]);

  useEffect(() => {
    fetchServiceAvailability();
  }, [fetchServiceAvailability]);

  useEffect(() => {
    setRangeAnchor(null);
  }, [patientId, serviceId, packagePeriod]);

  const isDateInSelectedRange = useCallback(
    (date) => {
      const ymd = dateToYmd(date);
      if (!startDate) return false;
      if (!endDate) return ymd === startDate;
      return ymd >= startDate && ymd <= endDate;
    },
    [startDate, endDate]
  );

  const applyRange = useCallback(
    (nextStart, nextEnd) => {
      onRangeChange?.({ startDate: nextStart, endDate: nextEnd });
    },
    [onRangeChange]
  );

  const handleDateSelect = (date) => {
    if (disabled || !isDateAvailable(date)) {
      if (!isDateAvailable(date)) onUnavailableSelect?.();
      return;
    }

    if (isMonthly) {
      const blockDates = getMonthlyBlockDateStrings(date);
      const blockedInRange = blockDates.find((d) => {
        const localDate = d instanceof Date ? d : new Date(d);
        // Prefer parsing YYYY-MM-DD as local midnight to avoid UTC shift.
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
          const [y, m, day] = d.split('-').map(Number);
          return !isDateAvailable(new Date(y, m - 1, day));
        }
        return !isDateAvailable(localDate);
      });
      if (blockedInRange) {
        onUnavailableSelect?.('This monthly range contains unavailable dates. Choose another start date.');
        return;
      }
      const first = blockDates[0];
      const last = blockDates[blockDates.length - 1];
      const toLocalYmd = (value) => {
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        return dateToYmd(value instanceof Date ? value : new Date(value));
      };
      const nextStart = toLocalYmd(first);
      const nextEnd = toLocalYmd(last);
      const sameRange = startDate === nextStart && endDate === nextEnd;
      applyRange(sameRange ? '' : nextStart, sameRange ? '' : nextEnd);
      setRangeAnchor(null);
      return;
    }

    const clickedYmd = dateToYmd(date);

    if (!rangeAnchor || (startDate && endDate)) {
      setRangeAnchor(clickedYmd);
      applyRange(clickedYmd, clickedYmd);
      return;
    }

    if (clickedYmd < rangeAnchor) {
      setRangeAnchor(clickedYmd);
      applyRange(clickedYmd, clickedYmd);
      return;
    }

    const start = new Date(`${rangeAnchor}T00:00:00`);
    const end = new Date(`${clickedYmd}T00:00:00`);
    const cursor = new Date(start);
    while (cursor <= end) {
      if (!isDateAvailable(cursor)) {
        onUnavailableSelect?.('Selected range includes unavailable dates. Choose a different range.');
        return;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    applyRange(rangeAnchor, clickedYmd);
    setRangeAnchor(null);
  };

  const navigateMonth = (delta) => {
    setCurrentMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + delta);
      return next;
    });
  };

  if (!patientId || !serviceId) {
    return null;
  }

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentMonth);

  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-2 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-800">
          {currentMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => navigateMonth(-1)}
            disabled={disabled}
            className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            aria-label="Previous month"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => navigateMonth(1)}
            disabled={disabled}
            className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>

      {(isLoading || error) && (
        <p className={`mb-2 text-[10px] ${error ? 'text-red-600' : 'text-gray-500'}`}>
          {error || 'Loading availability…'}
        </p>
      )}

      {opdOnOccupiedAllowed ? (
        <div className="mb-2 space-y-1.5 rounded border border-amber-200 bg-amber-50/80 px-2 py-1.5">
          <p className="text-[10px] font-semibold text-amber-950">
            For OPD, book within the latest month order dates
            {latestOrder
              ? ` (${formatShortDate(latestOrder.startDatetime)} → ${formatShortDate(latestOrder.endDatetime)})`
              : ''}
            .
          </p>
          <p className="text-[10px] text-amber-900/80">
            Each main booking period has its own colour. Prefer the latest order (amber). Overlap days are fuchsia.
            Days with an OPD add-on service are emerald.
          </p>
        </div>
      ) : (
        <p className="mb-1.5 text-[10px] text-gray-500">
          {isMonthly
            ? 'Unavailable dates are grayed out. Click a start date to select the monthly period.'
            : 'Unavailable dates are grayed out. Click start date, then end date.'}
        </p>
      )}

      {opdOnOccupiedAllowed && mainOrders.length > 0 ? (
        <div className="mb-2 space-y-1 rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
          {mainOrders.map((order) => {
            const style = orderStyleByKey.get(order.key);
            return (
              <div key={order.key} className="flex items-start gap-1.5 text-[10px] text-gray-700">
                <span
                  className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded ${style?.swatch || 'bg-gray-200'}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold leading-tight ${style?.label || ''}`}>
                    {order.key === latestOrderKey ? 'Latest order · ' : 'Earlier order · '}
                    {formatShortDate(order.startDatetime)} → {formatShortDate(order.endDatetime)}
                  </p>
                  <p className="truncate text-gray-500">
                    {order.serviceName}
                    {order.primaryOrderId ? ` · ${order.primaryOrderId}` : ''}
                    {order.status ? ` · ${String(order.status).replace(/_/g, ' ')}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-1 text-[10px] text-gray-600">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded bg-teal-100 ring-1 ring-teal-300" aria-hidden />
              Free
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded bg-fuchsia-100 ring-1 ring-fuchsia-400" aria-hidden />
              Overlap
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded bg-emerald-100 ring-1 ring-emerald-500" aria-hidden />
              OPD add-on
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded bg-gray-100 ring-1 ring-gray-300" aria-hidden />
              Past
            </span>
          </div>
        </div>
      ) : null}

      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
          <div key={day} className="py-0.5 text-center text-[10px] font-medium text-gray-500">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: startingDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="h-7" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
          const meta = getDayMeta(date);
          const {
            bookings,
            selectable,
            occupiedByMain,
            isApiAvailable,
            isPast,
            isOverlap,
            coversLatest,
            primaryOrderKey,
            ternaryOrdersOnDay,
            hasTernaryOnDay,
          } = meta;
          const selected = isDateInSelectedRange(date);
          const isToday = date.toDateString() === new Date().toDateString();
          const freeForOpd = selectable && !occupiedByMain && isApiAvailable !== false;
          const orderStyle = primaryOrderKey ? orderStyleByKey.get(primaryOrderKey) : null;

          let dayClass = 'cursor-not-allowed bg-gray-100 text-gray-400';
          if (selected) {
            dayClass = 'bg-indigo-600 text-white';
          } else if (hasTernaryOnDay) {
            dayClass = selectable ? TERNARY_DAY : TERNARY_DAY_PAST;
          } else if (occupiedByMain || (bookings.length > 0 && !isApiAvailable)) {
            if (isOverlap) {
              dayClass = selectable ? OVERLAP_DAY : OVERLAP_DAY_PAST;
            } else if (orderStyle) {
              dayClass = selectable ? orderStyle.day : orderStyle.dayPast;
            } else if (selectable) {
              dayClass = 'border border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200';
            }
          } else if (selectable) {
            dayClass = freeForOpd
              ? 'border border-teal-300 bg-teal-50 text-teal-900 hover:bg-teal-100'
              : 'border border-gray-200 bg-white text-gray-900 hover:bg-gray-100';
          }

          const ternaryTip = hasTernaryOnDay
            ? `OPD add-on: ${ternaryOrdersOnDay
                .map((t) => t?.service_name || t?.package_name || 'Service')
                .join(', ')}`
            : '';
          const tip =
            hasTernaryOnDay
              ? ternaryTip
              : occupiedByMain && opdOnOccupiedAllowed
                ? coversLatest
                  ? 'Latest month order — preferred for OPD'
                  : isOverlap
                    ? 'Orders overlap — prefer latest order dates for OPD'
                    : 'Earlier month order — prefer latest order dates for OPD'
                : undefined;

          return (
            <div
              key={day}
              className="relative"
              onMouseEnter={() => setHoveredDate(date)}
              onMouseLeave={() => setHoveredDate(null)}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDateSelect(date);
                }}
                disabled={disabled || !selectable}
                title={tip}
                className={`relative h-7 w-full rounded text-[11px] transition-colors ${dayClass} ${
                  isToday ? 'ring-1 ring-indigo-300' : ''
                } ${coversLatest && selectable && !selected ? 'font-semibold' : ''}`}
              >
                {day}
                {hasTernaryOnDay && !selected ? (
                  <span
                    className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-emerald-600"
                    aria-hidden
                  />
                ) : null}
              </button>
              {hoveredDate?.toDateString() === date.toDateString() &&
                (bookings.length > 0 || hasTernaryOnDay) && (
                <div className="absolute bottom-full left-1/2 z-20 mb-1 w-56 -translate-x-1/2 rounded bg-gray-800 px-2 py-1.5 text-[10px] text-white shadow-lg">
                  <p className={`mb-0.5 font-semibold ${hasTernaryOnDay ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {hasTernaryOnDay
                      ? 'OPD add-on on this day'
                      : coversLatest
                        ? 'Latest order · OPD preferred here'
                        : isOverlap
                          ? 'Overlapping orders'
                          : occupiedByMain && opdOnOccupiedAllowed
                            ? 'Earlier order · OPD ok'
                            : 'Already booked'}
                  </p>
                  {hasTernaryOnDay
                    ? ternaryOrdersOnDay.slice(0, 3).map((ternary, idx) => {
                        const startT = formatShortTime(ternary?.start_datetime);
                        const endT = formatShortTime(ternary?.end_datetime);
                        const timeLabel = startT && endT ? `${startT} – ${endT}` : '';
                        return (
                          <div
                            key={`${ternary?.ternary_order_id || ternary?.order_id || idx}`}
                            className="mb-0.5 border-t border-gray-700 pt-0.5 first:border-0 first:pt-0 last:mb-0"
                          >
                            <p className="font-medium text-emerald-200">
                              {ternary?.service_name || ternary?.package_name || 'OPD service'}
                            </p>
                            {ternary?.package_name &&
                            ternary?.package_name !== ternary?.service_name ? (
                              <p className="text-gray-200">{ternary.package_name}</p>
                            ) : null}
                            {timeLabel ? <p className="text-gray-200">{timeLabel}</p> : null}
                            <p className="text-gray-400">
                              {(() => {
                                const loc = resolveTernaryLocationText(ternary);
                                return (
                                  <>
                                    {loc}
                                    {ternary?.order_id ? `${loc ? ' · ' : ''}${ternary.order_id}` : ''}
                                    {ternary?.status
                                      ? ` · ${String(ternary.status).replace(/_/g, ' ')}`
                                      : ''}
                                  </>
                                );
                              })()}
                            </p>
                          </div>
                        );
                      })
                    : bookings.slice(0, 3).map((booking, idx) => (
                        <div
                          key={`${booking?.order_id || idx}`}
                          className="mb-0.5 border-t border-gray-700 pt-0.5 first:border-0 first:pt-0 last:mb-0"
                        >
                          <p className="font-medium">{booking?.service_name || 'Service'}</p>
                          <p className="text-gray-200">
                            {formatShortDate(booking?.start_datetime)} →{' '}
                            {formatShortDate(booking?.end_datetime)}
                          </p>
                          <p className="text-gray-400">
                            {booking?.primary_order_id || booking?.order_id || ''}
                            {booking?.status
                              ? ` · ${String(booking.status).replace(/_/g, ' ')}`
                              : ''}
                          </p>
                        </div>
                      ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(startDate || endDate) && (
        <p className="mt-2 text-[10px] text-gray-600">
          Selected: {startDate || '—'}
          {endDate && endDate !== startDate ? ` → ${endDate}` : ''}
        </p>
      )}
    </div>
  );
};

export { dateToYmd, getDaysInMonth };
export default BookingAvailabilityCalendar;
