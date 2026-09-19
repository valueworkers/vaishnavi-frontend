import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

const formatDateOnly = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const extractContactBookings = (payload) => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

const extractPackages = (payload) => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.results)) return payload.results
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

const extractVenues = (payload) => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.venue)) return payload.venue
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

const resolveRequestUrl = (href, base) => {
  if (!href) return null
  const raw = String(href)
  if (/^https?:\/\//i.test(raw)) return raw
  const normalizedBase = String(base || '').replace(/\/$/, '')
  return `${normalizedBase}${raw.startsWith('/') ? raw : `/${raw}`}`
}

const resolveServiceId = (booking) => {
  const raw = booking?.service?.id ?? booking?.service
  const id = Number(raw)
  return Number.isFinite(id) ? id : null
}

const resolvePatientId = (booking) => {
  const raw = booking?.patient?.id ?? booking?.patient ?? booking?.patient_id
  const id = Number(raw)
  return Number.isFinite(id) ? id : null
}

const resolveContactBookingId = (booking) => {
  const raw = booking?.id
  const id = Number(raw)
  return Number.isFinite(id) ? id : null
}

const resolvePackageType = (pkg) =>
  pkg?.package_type || pkg?.type || pkg?.belongs_to_type || 'N/A'

const resolvePackagePeriod = (pkg) => pkg?.period || 'N/A'

const toArray = (value) => (Array.isArray(value) ? value : [])

const resolveRawDates = (pkg) => toArray(pkg?.raw_dates)

const resolveHourlyDates = (pkg) => {
  const source = pkg?.dates
  if (!source || typeof source !== 'object' || Array.isArray(source)) return []
  return Object.entries(source).map(([date, slots]) => ({
    date,
    slots: toArray(slots),
  }))
}

const pad2 = (value) => String(value).padStart(2, '0')

const toDateInputValue = (value) => {
  if (!value) return ''
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

const getMonthMeta = (date) => {
  const year = date.getFullYear()
  const month = date.getMonth()
  return {
    daysInMonth: new Date(year, month + 1, 0).getDate(),
    startingDayOfWeek: new Date(year, month, 1).getDay(),
  }
}

const getThirtyDayBlock = (startDateString) => {
  const start = new Date(`${startDateString}T00:00:00`)
  if (Number.isNaN(start.getTime())) return []
  const days = []
  for (let i = 0; i < 30; i += 1) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`)
  }
  return days
}

const deriveBookingDateRangeFromPackage = (pkg) => {
  const period = String(resolvePackagePeriod(pkg)).toUpperCase()
  if (period === 'MONTHLY') {
    return {
      startDate: toDateInputValue(pkg?.start_datetime),
      endDate: toDateInputValue(pkg?.end_datetime),
    }
  }

  if (period === 'DAILY') {
    const dates = resolveRawDates(pkg).map((date) => toDateInputValue(date)).filter(Boolean).sort()
    return {
      startDate: dates[0] || '',
      endDate: dates[dates.length - 1] || '',
    }
  }

  if (period === 'HOURLY') {
    const dates = resolveHourlyDates(pkg)
      .map((entry) => toDateInputValue(entry.date))
      .filter(Boolean)
      .sort()
    return {
      startDate: dates[0] || '',
      endDate: dates[dates.length - 1] || '',
    }
  }

  return { startDate: '', endDate: '' }
}

const PackageEnquire = () => {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [pagination, setPagination] = useState({
    count: 0,
    totalPages: 1,
    currentPage: 1,
    next: null,
    previous: null,
  })
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [bookingForm, setBookingForm] = useState({
    patientName: '',
    mobileNumber: '',
    serviceName: '',
    location: '',
    startDate: '',
    endDate: '',
    description: '',
    selectedPackageId: '',
    selectedVenueId: '',
    selectedScheduleDates: [],
    hourlyTimeByDate: {},
    discount: '',
    premium: '',
  })
  const [servicePackages, setServicePackages] = useState([])
  const [serviceVenues, setServiceVenues] = useState([])
  const [isLoadingPackages, setIsLoadingPackages] = useState(false)
  const [isLoadingVenues, setIsLoadingVenues] = useState(false)
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false)
  const [deletingContactBookingId, setDeletingContactBookingId] = useState(null)
  const [packageError, setPackageError] = useState('')
  const [venueError, setVenueError] = useState('')
  const [bookingSubmitError, setBookingSubmitError] = useState('')
  const [showCreatePackageForm, setShowCreatePackageForm] = useState(false)
  const [isCreatingPackage, setIsCreatingPackage] = useState(false)
  const [createPackageError, setCreatePackageError] = useState('')
  const [createPackageForm, setCreatePackageForm] = useState({
    name: '',
    description: '',
    price: '',
    registrationFees: '',
    period: 'DAILY',
  })
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date())
  const lastInitializedPackageIdRef = useRef(null)
  const bookingSubmitLockRef = useRef(false)

  const selectedPackage = servicePackages.find(
    (pkg) => String(pkg.id) === String(bookingForm.selectedPackageId)
  )
  const selectedPackagePeriod = String(resolvePackagePeriod(selectedPackage)).toUpperCase()
  const selectedPackageType = String(resolvePackageType(selectedPackage)).toUpperCase()
  const shouldShowVenue = selectedPackageType !== 'CLIENT_SIDE'
  const selectedPackageRawDates = resolveRawDates(selectedPackage)
  const selectedPackageHourlyDates = resolveHourlyDates(selectedPackage)
  const isDateOnlySelection = selectedPackagePeriod === 'DAILY' || selectedPackagePeriod === 'HOURLY'
  const isMonthlySelection = selectedPackagePeriod === 'MONTHLY'
  const shouldShowCalendarSelection = isDateOnlySelection || isMonthlySelection
  const startDateLabel = 'Start Date'
  const endDateLabel = 'End Date'
  const availableScheduleDates =
    selectedPackagePeriod === 'DAILY'
      ? selectedPackageRawDates.map((date) => toDateInputValue(date)).filter(Boolean)
      : selectedPackagePeriod === 'HOURLY'
        ? selectedPackageHourlyDates.map((entry) => toDateInputValue(entry.date)).filter(Boolean)
        : []
  const availableScheduleDateSet = new Set(availableScheduleDates)
  const hourlySlotsByDate = Object.fromEntries(
    selectedPackageHourlyDates.map((entry) => [toDateInputValue(entry.date), entry.slots])
  )
  const sortedSelectedScheduleDates = [...toArray(bookingForm.selectedScheduleDates)].sort(
    (a, b) => new Date(a) - new Date(b)
  )

  const fetchContactBookings = async (requestUrl) => {
    const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
    if (!baseUrl) {
      setError('Base URL is not configured.')
      setBookings([])
      setPagination({
        count: 0,
        totalPages: 1,
        currentPage: 1,
        next: null,
        previous: null,
      })
      return
    }

    setIsLoading(true)
    setError('')
    try {
      const token = localStorage.getItem('access_token')
      const targetUrl = requestUrl || `${baseUrl}/booking/contact-bookings/`
      const response = await axios.get(targetUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const payload = response.data || {}
      const rows = extractContactBookings(payload)
      setBookings(rows)
      setPagination({
        count: Number(payload.count ?? rows.length) || 0,
        totalPages: Number(payload.total_pages ?? 1) || 1,
        currentPage: Number(payload.current_page ?? 1) || 1,
        next: payload.next ?? null,
        previous: payload.previous ?? null,
      })
    } catch (apiError) {
      const message =
        apiError.response?.data?.detail ||
        apiError.response?.data?.message ||
        'Unable to fetch package enquiries.'
      setError(message)
      setBookings([])
      setPagination({
        count: 0,
        totalPages: 1,
        currentPage: 1,
        next: null,
        previous: null,
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchContactBookings()
  }, [])

  useEffect(() => {
    if (!selectedPackage) {
      lastInitializedPackageIdRef.current = null
      return
    }
    const packageId = String(selectedPackage.id ?? '')
    if (lastInitializedPackageIdRef.current === packageId) return

    const packageRange = deriveBookingDateRangeFromPackage(selectedPackage)
    const period = String(resolvePackagePeriod(selectedPackage)).toUpperCase()
    const isDateOnly = period === 'DAILY' || period === 'HOURLY'
    const isMonthly = period === 'MONTHLY'
    const scheduleDates =
      period === 'DAILY'
        ? resolveRawDates(selectedPackage).map((date) => toDateInputValue(date)).filter(Boolean)
        : period === 'HOURLY'
          ? resolveHourlyDates(selectedPackage).map((entry) => toDateInputValue(entry.date)).filter(Boolean)
          : []
    const firstScheduleDate = scheduleDates[0] || ''
    const firstHourlySlots =
      period === 'HOURLY'
        ? resolveHourlyDates(selectedPackage).find(
            (entry) => toDateInputValue(entry.date) === firstScheduleDate
          )?.slots || []
        : []

    setBookingForm((prev) => {
      const nextScheduleDates =
        isDateOnly && firstScheduleDate
          ? [firstScheduleDate]
          : isMonthly
            ? [packageRange.startDate, packageRange.endDate].filter(Boolean)
            : []
      const nextHourlyTimeByDate =
        period === 'HOURLY' && firstScheduleDate
          ? {
              [firstScheduleDate]: {
                start: String(firstHourlySlots[0] || '09:00'),
                end: String(firstHourlySlots[1] || '11:00'),
              },
            }
          : {}
      if (
        prev.startDate === packageRange.startDate &&
        prev.endDate === packageRange.endDate &&
        JSON.stringify(prev.selectedScheduleDates) === JSON.stringify(nextScheduleDates) &&
        JSON.stringify(prev.hourlyTimeByDate) === JSON.stringify(nextHourlyTimeByDate)
      ) {
        return prev
      }
      return {
        ...prev,
        startDate: packageRange.startDate,
        endDate: packageRange.endDate,
        selectedScheduleDates: nextScheduleDates,
        hourlyTimeByDate: nextHourlyTimeByDate,
      }
    })
    lastInitializedPackageIdRef.current = packageId

    const calendarStartDate = firstScheduleDate || packageRange.startDate
    if (calendarStartDate) {
      const parsed = new Date(`${calendarStartDate}T00:00:00`)
      if (!Number.isNaN(parsed.getTime())) setCurrentCalendarMonth(parsed)
    }
  }, [selectedPackage])

  useEffect(() => {
    if (!isMonthlySelection) return
    const sortedDates = [...toArray(bookingForm.selectedScheduleDates)].sort((a, b) => new Date(a) - new Date(b))
    const nextStartDate = sortedDates[0] || ''
    const nextEndDate = sortedDates[sortedDates.length - 1] || ''
    setBookingForm((prev) => {
      if (prev.startDate === nextStartDate && prev.endDate === nextEndDate) return prev
      return {
        ...prev,
        startDate: nextStartDate,
        endDate: nextEndDate,
      }
    })
  }, [bookingForm.selectedScheduleDates, isMonthlySelection])

  useEffect(() => {
    if (shouldShowVenue) return
    setBookingForm((prev) => {
      if (!prev.selectedVenueId) return prev
      return {
        ...prev,
        selectedVenueId: '',
      }
    })
  }, [shouldShowVenue])

  const fetchPackagesByService = async (serviceId) => {
    if (!serviceId) {
      setPackageError('Service ID is missing for this enquiry.')
      setServicePackages([])
      return
    }
    const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
    if (!baseUrl) {
      setPackageError('Base URL is not configured.')
      setServicePackages([])
      return
    }

    setIsLoadingPackages(true)
    setPackageError('')
    try {
      const token = localStorage.getItem('access_token')
      const response = await axios.get(
        `${baseUrl}/booking/packages/by_belongs_to/?id=${serviceId}&entity=service`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      )
      const packages = extractPackages(response.data)
      setServicePackages(packages)
      setBookingForm((prev) => ({
        ...prev,
        selectedPackageId: packages[0]?.id ? String(packages[0].id) : '',
      }))
    } catch (apiError) {
      const message =
        apiError.response?.data?.detail ||
        apiError.response?.data?.message ||
        'Unable to fetch packages for this service.'
      setPackageError(message)
      setServicePackages([])
      setBookingForm((prev) => ({ ...prev, selectedPackageId: '' }))
    } finally {
      setIsLoadingPackages(false)
    }
  }

  const fetchVenuesByService = async (serviceId) => {
    if (!serviceId) {
      setVenueError('Service ID is missing for this enquiry.')
      setServiceVenues([])
      return
    }
    const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
    if (!baseUrl) {
      setVenueError('Base URL is not configured.')
      setServiceVenues([])
      return
    }

    setIsLoadingVenues(true)
    setVenueError('')
    try {
      const token = localStorage.getItem('access_token')
      const response = await axios.get(`${baseUrl}/management/services/${serviceId}/venues/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const venues = extractVenues(response.data)
      setServiceVenues(venues)
      setBookingForm((prev) => ({
        ...prev,
        selectedVenueId: venues[0]?.id ? String(venues[0].id) : '',
      }))
    } catch (apiError) {
      const message =
        apiError.response?.data?.detail ||
        apiError.response?.data?.message ||
        'Unable to fetch venues for this service.'
      setVenueError(message)
      setServiceVenues([])
      setBookingForm((prev) => ({ ...prev, selectedVenueId: '' }))
    } finally {
      setIsLoadingVenues(false)
    }
  }

  const handleOpenCreateBooking = (booking) => {
    const serviceId = resolveServiceId(booking)
    setSelectedBooking(booking)
    setServicePackages([])
    setServiceVenues([])
    setPackageError('')
    setVenueError('')
    setBookingSubmitError('')
    setCreatePackageError('')
    setShowCreatePackageForm(false)
    setCreatePackageForm({
      name: '',
      description: booking.description || '',
      price: '',
      registrationFees: '',
      period: 'DAILY',
    })
    setBookingForm({
      patientName: booking.patient_name || '',
      mobileNumber: booking.mobile_number || '',
      serviceName: booking.service_name || booking.service?.name || String(booking.service || ''),
      location: booking.address || booking.location || '',
      startDate: booking.start_date || '',
      endDate: booking.end_date || '',
      description: booking.description || '',
      selectedPackageId: '',
      selectedVenueId: '',
      selectedScheduleDates: [],
      hourlyTimeByDate: {},
      discount: '',
      premium: '',
    })
    fetchPackagesByService(serviceId)
    fetchVenuesByService(serviceId)
  }

  const handleBookingFormChange = (field, value) => {
    setBookingForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleDeleteContactBooking = async (booking) => {
    const contactBookingId = resolveContactBookingId(booking)
    if (!contactBookingId) return

    const shouldDelete = window.confirm('Are you sure you want to delete this contact booking?')
    if (!shouldDelete) return

    const accessToken = localStorage.getItem('access_token')
    const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
    if (!baseUrl) {
      setError('Base URL is not configured.')
      return
    }
    if (!accessToken) {
      setError('Authorization token missing. Please log in again.')
      return
    }

    setDeletingContactBookingId(contactBookingId)
    setError('')
    try {
      await axios.delete(`${baseUrl}/booking/contact-bookings/${contactBookingId}/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (selectedBooking && resolveContactBookingId(selectedBooking) === contactBookingId) {
        setSelectedBooking(null)
      }
      await fetchContactBookings()
    } catch (apiError) {
      const message =
        apiError.response?.data?.detail ||
        apiError.response?.data?.message ||
        'Unable to delete contact booking.'
      setError(message)
    } finally {
      setDeletingContactBookingId(null)
    }
  }

  const handleCreateBookingSubmit = async (event) => {
    event.preventDefault()
    if (bookingSubmitLockRef.current || isSubmittingBooking) return
    bookingSubmitLockRef.current = true
    setBookingSubmitError('')

    const patientId = resolvePatientId(selectedBooking)
    const serviceId = resolveServiceId(selectedBooking)
    const contactBookingId = resolveContactBookingId(selectedBooking)
    const packageId = Number(bookingForm.selectedPackageId)
    const venueId = Number(bookingForm.selectedVenueId)
    const packagePeriod = String(resolvePackagePeriod(selectedPackage)).toUpperCase()
    const packageType = String(resolvePackageType(selectedPackage)).toUpperCase()
    const accessToken = localStorage.getItem('access_token')
    const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')

    if (!baseUrl) {
      setBookingSubmitError('Base URL is not configured.')
      bookingSubmitLockRef.current = false
      return
    }
    if (!accessToken) {
      setBookingSubmitError('Authorization token missing. Please log in again.')
      bookingSubmitLockRef.current = false
      return
    }
    if (!patientId) {
      setBookingSubmitError('Patient ID is missing for this enquiry.')
      bookingSubmitLockRef.current = false
      return
    }
    if (!serviceId) {
      setBookingSubmitError('Service ID is missing for this enquiry.')
      bookingSubmitLockRef.current = false
      return
    }
    if (!Number.isFinite(packageId)) {
      setBookingSubmitError('Please select a package.')
      bookingSubmitLockRef.current = false
      return
    }
    if (shouldShowVenue && !Number.isFinite(venueId)) {
      setBookingSubmitError('Please select a venue.')
      bookingSubmitLockRef.current = false
      return
    }

    const toHHMMSS = (hm) => {
      if (!hm || typeof hm !== 'string') return null
      const t = hm.trim()
      if (t.length === 5) return `${t}:00`
      if (t.length >= 8) return t.slice(0, 8)
      return `${t}:00`
    }

    let payload = {
      patient: patientId,
      service: serviceId,
      package: packageId,
      auto_continue: true,
      discount_amount: Number(bookingForm.discount || 0),
      premium_amount: Number(bookingForm.premium || 0),
    }

    if (packageType.includes('CLIENT_SIDE')) {
      payload.client_address = bookingForm.location || ''
    } else if (packageType.includes('OPD') || packageType.includes('INHOUSE') || packageType.includes('IN_HOUSE')) {
      payload.venue = venueId
    }

    if (packagePeriod === 'MONTHLY') {
      if (!bookingForm.startDate || !bookingForm.endDate) {
        setBookingSubmitError('Please select start and end date.')
        bookingSubmitLockRef.current = false
        return
      }
      payload = {
        ...payload,
        start_datetime: `${bookingForm.startDate}T00:00:00+05:30`,
        end_datetime: `${bookingForm.endDate}T23:59:59+05:30`,
      }
    } else if (packagePeriod === 'HOURLY') {
      const selectedDates = toArray(bookingForm.selectedScheduleDates).sort()
      if (!selectedDates.length) {
        setBookingSubmitError('Please select at least one date.')
        bookingSubmitLockRef.current = false
        return
      }
      const hourlyDatesObject = {}
      for (const dateKey of selectedDates) {
        const slot = bookingForm.hourlyTimeByDate?.[dateKey]
        if (!slot?.start || !slot?.end || slot.start >= slot.end) {
          setBookingSubmitError('Please set a valid start and end time for each selected date.')
          bookingSubmitLockRef.current = false
          return
        }
        const a = toHHMMSS(slot.start)
        const b = toHHMMSS(slot.end)
        if (!a || !b) {
          setBookingSubmitError('Invalid time selection for hourly booking.')
          bookingSubmitLockRef.current = false
          return
        }
        hourlyDatesObject[dateKey] = [a, b]
      }
      payload = {
        ...payload,
        raw_dates: hourlyDatesObject,
      }
    } else {
      const selectedDates = toArray(bookingForm.selectedScheduleDates).sort()
      if (!selectedDates.length) {
        setBookingSubmitError('Please select at least one date.')
        bookingSubmitLockRef.current = false
        return
      }
      payload = {
        ...payload,
        raw_dates: selectedDates,
      }
    }

    setIsSubmittingBooking(true)
    try {
      await axios.post(`${baseUrl}/booking/bookings/`, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (contactBookingId) {
        await axios.delete(`${baseUrl}/booking/contact-bookings/${contactBookingId}/`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      }

      setSelectedBooking(null)
      window.location.assign('/dashboard?section=lobby')
    } catch (apiError) {
      const message =
        apiError.response?.data?.message ||
        apiError.response?.data?.detail ||
        apiError.message ||
        'Failed to create booking.'
      setBookingSubmitError(message)
    } finally {
      setIsSubmittingBooking(false)
      bookingSubmitLockRef.current = false
    }
  }

  const handleCreatePackageChange = (field, value) => {
    setCreatePackageForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleCreatePackageSubmit = async (event) => {
    event.preventDefault()
    const serviceId = resolveServiceId(selectedBooking)
    if (!serviceId) {
      setCreatePackageError('Service ID is missing.')
      return
    }
    const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
    if (!baseUrl) {
      setCreatePackageError('Base URL is not configured.')
      return
    }

    setIsCreatingPackage(true)
    setCreatePackageError('')
    try {
      const token = localStorage.getItem('access_token')
      const payload = {
        object_id: serviceId,
        name: createPackageForm.name,
        description: createPackageForm.description,
        price: Number(createPackageForm.price || 0),
        registration_fees: Number(createPackageForm.registrationFees || 0),
        period: createPackageForm.period,
        belongs_to_type: 'service',
      }
      await axios.post(`${baseUrl}/booking/packages/`, payload, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      await fetchPackagesByService(serviceId)
      setShowCreatePackageForm(false)
    } catch (apiError) {
      const message =
        apiError.response?.data?.detail ||
        apiError.response?.data?.message ||
        'Unable to create package.'
      setCreatePackageError(message)
    } finally {
      setIsCreatingPackage(false)
    }
  }

  return (
    <div className="space-y-3">
      

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 shadow-sm">
          Loading package enquiries...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 shadow-sm">
          No package enquiries found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-2 py-1 text-left font-semibold">Patient Name</th>
                <th className="px-2 py-1 text-left font-semibold">Service Name</th>
                <th className="px-2 py-1 text-left font-semibold">Mobile</th>
                <th className="px-2 py-1 text-left font-semibold">Location</th>
                <th className="px-2 py-1 text-left font-semibold">Start Date</th>
                <th className="px-2 py-1 text-left font-semibold">End Date</th>
                <th className="px-2 py-1 text-left font-semibold">Description</th>
                <th className="px-2 py-1 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking, index) => (
                <tr
                  key={`${booking.patient || 'patient'}-${booking.service || 'service'}-${booking.start_date || 'start'}-${index}`}
                  className="border-t border-slate-200 text-slate-700"
                >
                  <td className="px-2 py-1 font-medium text-slate-800 whitespace-nowrap">{booking.patient_name || '-'}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{booking.service_name || booking.service?.name || booking.service || '-'}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{booking.mobile_number || '-'}</td>
                  <td className="px-2 py-1">{booking.address || booking.location || '-'}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{formatDateOnly(booking.start_date)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{formatDateOnly(booking.end_date)}</td>
                  <td className="px-2 py-1">{booking.description || '-'}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenCreateBooking(booking)}
                        className="rounded bg-blue-600 px-1 py-0.5 text-[9px] font-medium leading-none text-white hover:bg-blue-700"
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteContactBooking(booking)}
                        disabled={deletingContactBookingId === resolveContactBookingId(booking)}
                        className="rounded bg-rose-600 px-1 py-0.5 text-[9px] font-medium leading-none text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingContactBookingId === resolveContactBookingId(booking) ? 'Deleting' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 sm:text-sm">
            <p>
              Page <span className="font-semibold text-slate-900">{pagination.currentPage}</span> of{' '}
              <span className="font-semibold text-slate-900">{pagination.totalPages}</span>
              {pagination.count ? <span className="text-slate-500"> ({pagination.count} total)</span> : null}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!pagination.previous || isLoading}
                onClick={() => {
                  const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
                  const prevUrl = resolveRequestUrl(pagination.previous, baseUrl)
                  if (prevUrl) fetchContactBookings(prevUrl)
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!pagination.next || isLoading}
                onClick={() => {
                  const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
                  const nextUrl = resolveRequestUrl(pagination.next, baseUrl)
                  if (nextUrl) fetchContactBookings(nextUrl)
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedBooking && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-3">
          <div className="flex min-h-full items-start justify-center py-4 sm:items-center">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-800">Create Booking</h3>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreateBookingSubmit} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-700">
                Patient Name
                <input
                  type="text"
                  value={bookingForm.patientName}
                  onChange={(e) => handleBookingFormChange('patientName', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                />
              </label>

              <label className="text-xs font-medium text-slate-700">
                Mobile Number
                <input
                  type="text"
                  value={bookingForm.mobileNumber}
                  onChange={(e) => handleBookingFormChange('mobileNumber', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                />
              </label>

              <label className="text-xs font-medium text-slate-700">
                Service Name
                <input
                  type="text"
                  value={bookingForm.serviceName}
                  onChange={(e) => handleBookingFormChange('serviceName', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                />
              </label>

              <label className="text-xs font-medium text-slate-700">
                Package
                <select
                  value={bookingForm.selectedPackageId}
                  onChange={(e) => handleBookingFormChange('selectedPackageId', e.target.value)}
                  disabled={isLoadingPackages}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  <option value="">
                    {isLoadingPackages ? 'Loading packages...' : 'Select package'}
                  </option>
                  {servicePackages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name || `Package ${pkg.id}`} - Rs. {pkg.price ?? 0}
                    </option>
                  ))}
                </select>
                {!isLoadingPackages && selectedPackage ? (
                  <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700">
                    <p>
                      Package Type:{' '}
                      <span className="font-semibold">{resolvePackageType(selectedPackage)}</span>
                    </p>
                    <p>
                      Period: <span className="font-semibold">{resolvePackagePeriod(selectedPackage)}</span>
                    </p>
                  </div>
                ) : null}

              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreatePackageForm((prev) => !prev)
                    setCreatePackageError('')
                  }}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                >
                  {showCreatePackageForm ? 'Hide Package Form' : 'Add New Package'}
                </button>
              </div>

              {shouldShowVenue && (
                <label className="text-xs font-medium text-slate-700">
                  Venue
                  <select
                    value={bookingForm.selectedVenueId}
                    onChange={(e) => handleBookingFormChange('selectedVenueId', e.target.value)}
                    disabled={isLoadingVenues}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    <option value="">
                      {isLoadingVenues ? 'Loading venues...' : 'Select venue'}
                    </option>
                    {serviceVenues.map((venue) => (
                      <option key={venue.id} value={venue.id}>
                        {venue.name || `Venue ${venue.id}`}
                        {venue.locality ? ` - ${venue.locality}` : ''}
                      </option>
                    ))}
                  </select>
                  {venueError ? <p className="mt-1 text-xs text-rose-600">{venueError}</p> : null}
                </label>
              )}

              {packageError && (
                <p className="text-xs text-rose-600 sm:col-span-2">{packageError}</p>
              )}

              {showCreatePackageForm && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
                    Create package for this service
                  </p>

                  <label className="text-xs font-medium text-slate-700">
                    Package Name
                    <input
                      type="text"
                      value={createPackageForm.name}
                      onChange={(e) => handleCreatePackageChange('name', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                    />
                  </label>

                  <label className="text-xs font-medium text-slate-700">
                    Period
                    <select
                      value={createPackageForm.period}
                      onChange={(e) => handleCreatePackageChange('period', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                    >
                      <option value="DAILY">DAILY</option>
                      <option value="WEEKLY">WEEKLY</option>
                      <option value="MONTHLY">MONTHLY</option>
                      <option value="HOURLY">HOURLY</option>
                    </select>
                  </label>

                  <label className="text-xs font-medium text-slate-700">
                    Price
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={createPackageForm.price}
                      onChange={(e) => handleCreatePackageChange('price', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                    />
                  </label>

                  <label className="text-xs font-medium text-slate-700">
                    Registration Fees
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={createPackageForm.registrationFees}
                      onChange={(e) => handleCreatePackageChange('registrationFees', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                    />
                  </label>

                  <label className="text-xs font-medium text-slate-700 sm:col-span-2">
                    Package Description
                    <textarea
                      rows={2}
                      value={createPackageForm.description}
                      onChange={(e) => handleCreatePackageChange('description', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                    />
                  </label>

                  {createPackageError && (
                    <p className="text-xs text-rose-600 sm:col-span-2">{createPackageError}</p>
                  )}

                  <div className="sm:col-span-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleCreatePackageSubmit}
                      disabled={isCreatingPackage}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCreatingPackage ? 'Creating Package...' : 'Create Package'}
                    </button>
                  </div>
                </>
              )}

              <label className="text-xs font-medium text-slate-700">
                Location
                <input
                  type="text"
                  value={bookingForm.location}
                  onChange={(e) => handleBookingFormChange('location', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                />
              </label>

              {!shouldShowCalendarSelection && (
                <>
                  <label className="text-xs font-medium text-slate-700">
                    {startDateLabel}
                    <input
                      type="date"
                      value={bookingForm.startDate}
                      onChange={(e) => handleBookingFormChange('startDate', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                    />
                  </label>

                  <label className="text-xs font-medium text-slate-700">
                    {endDateLabel}
                    <input
                      type="date"
                      value={bookingForm.endDate}
                      onChange={(e) => handleBookingFormChange('endDate', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                    />
                  </label>
                </>
              )}

              {shouldShowCalendarSelection && (
                <>
                  <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-700">
                        {selectedPackagePeriod === 'HOURLY'
                          ? 'Select date from calendar and choose time'
                          : selectedPackagePeriod === 'MONTHLY'
                            ? 'Select monthly date range from calendar'
                          : 'Select date from calendar'}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setCurrentCalendarMonth(
                              (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                            )
                          }
                          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          ←
                        </button>
                        <span className="text-xs font-medium text-slate-700">
                          {currentCalendarMonth.toLocaleDateString('en-IN', {
                            month: 'long',
                            year: 'numeric',
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setCurrentCalendarMonth(
                              (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                            )
                          }
                          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          →
                        </button>
                      </div>
                    </div>

                    <div className="mb-1 grid grid-cols-7 gap-1">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                        <span key={day} className="text-center text-[10px] font-medium text-slate-500">
                          {day}
                        </span>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {(() => {
                        const { daysInMonth, startingDayOfWeek } = getMonthMeta(currentCalendarMonth)
                        const days = []
                        for (let i = 0; i < startingDayOfWeek; i += 1) {
                          days.push(<span key={`blank-${i}`} className="h-8" />)
                        }
                        for (let day = 1; day <= daysInMonth; day += 1) {
                          const dateString = `${currentCalendarMonth.getFullYear()}-${pad2(
                            currentCalendarMonth.getMonth() + 1
                          )}-${pad2(day)}`
                          const isAvailable = availableScheduleDateSet.has(dateString)
                          const isSelected = toArray(bookingForm.selectedScheduleDates).includes(dateString)
                          days.push(
                            <button
                              key={dateString}
                              type="button"
                              onClick={() => {
                                if (selectedPackagePeriod === 'MONTHLY') {
                                  setBookingForm((prev) => ({
                                    ...prev,
                                    selectedScheduleDates: getThirtyDayBlock(dateString),
                                  }))
                                  return
                                }
                                setBookingForm((prev) => ({
                                  ...prev,
                                  selectedScheduleDates: toArray(prev.selectedScheduleDates).includes(
                                    dateString
                                  )
                                    ? toArray(prev.selectedScheduleDates).filter((d) => d !== dateString)
                                    : [...toArray(prev.selectedScheduleDates), dateString],
                                  hourlyTimeByDate:
                                    selectedPackagePeriod === 'HOURLY'
                                      ? (() => {
                                          const next = { ...prev.hourlyTimeByDate }
                                          if (toArray(prev.selectedScheduleDates).includes(dateString)) {
                                            delete next[dateString]
                                          } else {
                                            const slotsForDate = hourlySlotsByDate[dateString] || []
                                            next[dateString] = {
                                              start: String(slotsForDate[0] || '09:00'),
                                              end: String(slotsForDate[1] || '11:00'),
                                            }
                                          }
                                          return next
                                        })()
                                      : prev.hourlyTimeByDate,
                                }))
                              }}
                              className={`h-8 rounded text-xs transition ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : isAvailable
                                    ? 'border border-blue-300 bg-blue-50 text-slate-700 hover:bg-blue-100'
                                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {day}
                            </button>
                          )
                        }
                        return days
                      })()}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {selectedPackagePeriod === 'MONTHLY'
                        ? 'For monthly packages, clicking one date auto-selects 30 days from that date.'
                        : 'Highlighted dates are from package schedule; you can choose any date.'}
                    </p>
                  </div>

                  {sortedSelectedScheduleDates.length > 0 && (
                    <div className="sm:col-span-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                      <p className="text-xs font-semibold text-blue-900">
                        {sortedSelectedScheduleDates.length} Date
                        {sortedSelectedScheduleDates.length > 1 ? 's' : ''} Selected
                      </p>
                    </div>
                  )}

                  {selectedPackagePeriod === 'HOURLY' && (
                    <div className="sm:col-span-2 space-y-2 rounded-lg border border-teal-200 bg-teal-50/50 p-3">
                      <p className="text-xs font-semibold text-teal-900">Time window per selected date</p>
                      {sortedSelectedScheduleDates.length === 0 ? (
                        <p className="text-xs text-teal-800/80">Select date(s) in calendar to set time.</p>
                      ) : (
                        sortedSelectedScheduleDates.map((dateString) => {
                          const t = bookingForm.hourlyTimeByDate?.[dateString] || {
                            start: '09:00',
                            end: '11:00',
                          }
                          const suggested = hourlySlotsByDate[dateString] || []
                          const invalid = t.start && t.end && t.start >= t.end
                          return (
                            <div
                              key={dateString}
                              className="rounded-lg border border-teal-100 bg-white p-2"
                            >
                              <p className="mb-2 text-xs font-semibold text-slate-800">{dateString}</p>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <label className="text-xs font-medium text-slate-700">
                                  Start Time
                                  <input
                                    type="time"
                                    value={t.start}
                                    onChange={(e) =>
                                      setBookingForm((prev) => ({
                                        ...prev,
                                        hourlyTimeByDate: {
                                          ...prev.hourlyTimeByDate,
                                          [dateString]: { ...t, start: e.target.value },
                                        },
                                      }))
                                    }
                                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                                  />
                                </label>
                                <label className="text-xs font-medium text-slate-700">
                                  End Time
                                  <input
                                    type="time"
                                    value={t.end}
                                    onChange={(e) =>
                                      setBookingForm((prev) => ({
                                        ...prev,
                                        hourlyTimeByDate: {
                                          ...prev.hourlyTimeByDate,
                                          [dateString]: { ...t, end: e.target.value },
                                        },
                                      }))
                                    }
                                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                                  />
                                </label>
                              </div>
                              {suggested.length ? (
                                <p className="mt-1 text-[11px] text-slate-500">
                                  Suggested: {suggested.join(' - ')}
                                </p>
                              ) : null}
                              {invalid ? (
                                <p className="mt-1 text-[11px] text-rose-600">
                                  End time must be after start time.
                                </p>
                              ) : null}
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </>
              )}

              <label className="text-xs font-medium text-slate-700">
                Discount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bookingForm.discount}
                  onChange={(e) => handleBookingFormChange('discount', e.target.value)}
                  placeholder="Enter discount"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                />
              </label>

              <label className="text-xs font-medium text-slate-700">
                Premium
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bookingForm.premium}
                  onChange={(e) => handleBookingFormChange('premium', e.target.value)}
                  placeholder="Enter premium"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                />
              </label>

              <label className="text-xs font-medium text-slate-700 sm:col-span-2">
                Description
                <textarea
                  rows={3}
                  value={bookingForm.description}
                  onChange={(e) => handleBookingFormChange('description', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                />
              </label>

              {bookingSubmitError ? (
                <p className="text-xs text-rose-600 sm:col-span-2">{bookingSubmitError}</p>
              ) : null}

              <div className="sm:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedBooking(null)}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBooking}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmittingBooking ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PackageEnquire
