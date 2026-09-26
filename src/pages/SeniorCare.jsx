import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import { mapApiPatientToRegistration } from '../utils/bookingPatientPrefill'
import { FiMapPin, FiClock, FiStar, FiHeart, FiShare2, FiPhone, FiMail, FiUser, FiCalendar, FiCheckCircle, FiXCircle, FiUsers, FiEdit2, FiX } from 'react-icons/fi'
import axios from 'axios'
import AlertModal from '../components/AlertModal'
import { createPatientDocument } from '../api/ermPatientRecordsApi'
import { compressFileForUpload } from '../utils/compressUploadFiles'
import { getMonthlyBlockDateStrings } from '../utils/monthlyBookingDates'
import { hasOwnerPrivileges, isCareStaffUser } from '../utils/authRoles'

const toNum = (v) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Suffix for price display: ₹X/day, ₹X/month, etc. */
const periodUnitLabel = (periodRaw) => {
  const p = String(periodRaw || 'DAILY').toUpperCase()
  const map = {
    DAILY: 'day',
    MONTHLY: 'month',
    WEEKLY: 'week',
    SESSION: 'session',
    HOURLY: 'hour',
  }
  return map[p] || p.toLowerCase().replace(/_/g, '')
}

const periodBadgeLabel = (periodRaw) => {
  const p = String(periodRaw || 'DAILY').toUpperCase()
  const map = {
    DAILY: 'Daily',
    MONTHLY: 'Monthly',
    WEEKLY: 'Weekly',
    SESSION: 'Session',
    HOURLY: 'Hourly',
  }
  return map[p] || p.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

const ID_PROOF_TYPE_LABELS = {
  aadhar: 'Aadhar Card',
  pan: 'PAN Card',
  passport: 'Passport',
  'driving-license': 'Driving License',
  'voter-id': 'Voter ID',
  other: 'Other',
}

const ID_PROOF_MAX_FILES = 20
const ID_PROOF_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const UPFRONT_PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK', label: 'Bank' },
  { value: 'CHEQUE', label: 'Cheque' },
]

const ID_PROOF_VALID_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'application/pdf',
]

const totalIdProofFileBytes = (files) =>
  (Array.isArray(files) ? files : []).reduce((sum, f) => sum + (f?.size || 0), 0)

const formatIdProofFileMb = (bytes) => (bytes / 1024 / 1024).toFixed(2)

const isValidIdProofFile = (file) => {
  if (!file) return false
  if (ID_PROOF_VALID_TYPES.includes(String(file.type || '').toLowerCase())) return true
  return /\.(jpe?g|png|gif|pdf)$/i.test(file.name || '')
}

const SeniorCare = () => {
  const location = useLocation()
  const service = location.state || {}
  const navigate = useNavigate()
  
  const [isSaved, setIsSaved] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedDates, setSelectedDates] = useState([])
  /** HOURLY packages only: keyed by date.toDateString(), values { start, end } as "HH:mm" for <input type="time" /> */
  const [hourlyTimeByDate, setHourlyTimeByDate] = useState({})
  const [selectedPeriodAnchors, setSelectedPeriodAnchors] = useState([])
  const [hoveredDate, setHoveredDate] = useState(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedCaregiver, setSelectedCaregiver] = useState('')
  const [selectedServiceOption, setSelectedServiceOption] = useState(null)
  const [serviceAvailability, setServiceAvailability] = useState(null)
  const [isLoadingServiceAvailability, setIsLoadingServiceAvailability] = useState(false)
  const [serviceAvailabilityError, setServiceAvailabilityError] = useState('')
  const [serviceDropdownOptions, setServiceDropdownOptions] = useState([])
  const [isLoadingServiceDropdown, setIsLoadingServiceDropdown] = useState(false)
  const [serviceDropdownError, setServiceDropdownError] = useState('')
  const [packageOptions, setPackageOptions] = useState([])
  const [isLoadingPackages, setIsLoadingPackages] = useState(false)
  const [packagesError, setPackagesError] = useState('')
  const [currentStep, setCurrentStep] = useState(1)
  const [selectedLocation, setSelectedLocation] = useState('')
  const [selectedLocationType, setSelectedLocationType] = useState('')
  const [clientAddressMode, setClientAddressMode] = useState('DEFAULT')
  const [clientAddress, setClientAddress] = useState('')
  const [clientName, setClientName] = useState('')
  const [selectedPackage, setSelectedPackage] = useState('')
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [activeTab, setActiveTab] = useState('about')
  const [showMoreFacilities, setShowMoreFacilities] = useState(false)
  const [clientAddressSuggestions, setClientAddressSuggestions] = useState([])
  const [showClientSuggestions, setShowClientSuggestions] = useState(false)
  const [blinkCustomAddressInput, setBlinkCustomAddressInput] = useState(false)
  const [customAddressFocusRequest, setCustomAddressFocusRequest] = useState(0)

  // Customer Registration Form States
  const [showRegistrationModal, setShowRegistrationModal] = useState(false)
  const [isRegistrationComplete, setIsRegistrationComplete] = useState(false)
  const [showRegistrationRequiredPopup, setShowRegistrationRequiredPopup] = useState(false)
  const [showExistingRegistrations, setShowExistingRegistrations] = useState(false)
  const [showAddressChoicePopup, setShowAddressChoicePopup] = useState(false)
  const [pendingSelectedRegistration, setPendingSelectedRegistration] = useState(null)
  const [existingRegistrations, setExistingRegistrations] = useState([])
  const [registrationToDelete, setRegistrationToDelete] = useState(null)
  const [activeRegistration, setActiveRegistration] = useState(null)
  const [isEditingRegistration, setIsEditingRegistration] = useState(false)
  const [editingRegistrationId, setEditingRegistrationId] = useState(null)
  const [registrationModalStep, setRegistrationModalStep] = useState(1)
  const [newlyRegisteredPatientId, setNewlyRegisteredPatientId] = useState(null)
  const [idProofCompressing, setIdProofCompressing] = useState(false)
  const [idProofCompressMessage, setIdProofCompressMessage] = useState('')
  const [idProofFilesMeta, setIdProofFilesMeta] = useState([])
  const idProofFilesRef = useRef([])
  const idProofFilesMetaRef = useRef([])
  const [registrationForm, setRegistrationForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    countryCode: '+91',
    address: '',
    dateOfBirth: '',
    dontKnowDOB: false,
    age: '',
    emergencyContact: '',
    emergencyPhone: '',
    emergencyCountryCode: '+91',
    emergencyContact2: '',
    emergencyPhone2: '',
    emergencyCountryCode2: '+91',
    medicalConditions: '',
    allergies: '',
    preferredLanguage: '',
    gender: '',
    bloodGroup: '',
    idProof: '',
    idProofNumber: '',
    idProofFiles: [],
    idProofFile: null,
    idProofFileUrl: '',
    educationQualifications: '',
    earlierOccupation: '',
    yearOfRetirement: '',
    presentHealthCondition: '',
    advancePayment: '',
    paymentMode: '',
    affiliate: '',
    source: '',
    referredBy: '',
    isProbono: false,
  })
  const [registrationErrors, setRegistrationErrors] = useState({})
  const [isSubmittingRegistration, setIsSubmittingRegistration] = useState(false)
  const [isLoadingRegistrations, setIsLoadingRegistrations] = useState(false)
  const [isDeletingRegistration, setIsDeletingRegistration] = useState(false)
  const [registrationsError, setRegistrationsError] = useState('')
  const [isLoadingAPI, setIsLoadingAPI] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [serverError, setServerError] = useState(null) // { message, onRetry, type }
  const [nextUrlPatients, setNextUrlPatients] = useState(null) // Pagination URLs for patients
  const [previousUrlPatients, setPreviousUrlPatients] = useState(null)
  const [totalCountPatients, setTotalCountPatients] = useState(0)
  const [patientsSearchInput, setPatientsSearchInput] = useState('')
  const [patientsActiveSearch, setPatientsActiveSearch] = useState('')
  const [authUser, setAuthUser] = useState(null)
  const [discountAmount, setDiscountAmount] = useState(0) // Discount amount in rupees
  const [premiumAmount, setPremiumAmount] = useState(0) // Premium amount in rupees
  const [paymentAmount, setPaymentAmount] = useState(0) // Amount user wants to pay
  const [advancePaymentTiming, setAdvancePaymentTiming] = useState('upfront') // 'upfront' | 'post_service'
  const [showUpfrontPaymentModal, setShowUpfrontPaymentModal] = useState(false)
  const [upfrontPaymentOrderId, setUpfrontPaymentOrderId] = useState(null)
  const [isSubmittingUpfrontPayment, setIsSubmittingUpfrontPayment] = useState(false)
  const [upfrontPaymentError, setUpfrontPaymentError] = useState('')
  const [upfrontPaymentForm, setUpfrontPaymentForm] = useState({
    amount: '',
    method: 'CASH',
    reference: 'upfront-payment',
    paidDate: '',
  })
  const [isRegFull, setIsRegFull] = useState(false)
  const [isRegSplit, setIsRegSplit] = useState(false)
  const [installment1, setInstallment1] = useState(0)
  const [installment2, setInstallment2] = useState(0)
  const [isRegUpfront, setIsRegUpfront] = useState(false)
  const [upfrontChoice, setUpfrontChoice] = useState(null) // "upfront" | "after" | null
  const [autoContinue, setAutoContinue] = useState(false)
  const [packageRequestForm, setPackageRequestForm] = useState({
    serviceWanted: '',
    durationStartDate: '',
    durationEndDate: '',
    durationStart: '',
    durationEnd: '',
    description: '',
  })
  const [packageRequestErrors, setPackageRequestErrors] = useState({})
  const [packageRequestSubmitted, setPackageRequestSubmitted] = useState(false)
  const [isSubmittingPackageRequest, setIsSubmittingPackageRequest] = useState(false)
  const [showNoPackageRequestModal, setShowNoPackageRequestModal] = useState(false)
  const [alertState, setAlertState] = useState({ open: false, type: 'info', message: '' })
  const showAlert = useCallback((message, type = 'info') => {
    setAlertState({ open: true, type, message: String(message) })
  }, [])
  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, open: false }))
    if (lobbyNavigateAfterAlertRef.current) {
      lobbyNavigateAfterAlertRef.current = false
      navigate('/dashboard?section=lobby')
    }
  }, [navigate])
  const defaultClientAddress = (activeRegistration?.address || '').trim()
  const effectiveClientAddress = clientAddressMode === 'DEFAULT' ? defaultClientAddress : clientAddress.trim()
  const hasClientLocationDetails = Boolean((clientName || '').trim() && effectiveClientAddress)
  const getPackagePeriod = useCallback(
    () => String(selectedPackage?.period || '').toUpperCase(),
    [selectedPackage]
  )

  const isHourlyPackage = getPackagePeriod() === 'HOURLY'

  const isHourlySelectionComplete = useMemo(() => {
    if (!isHourlyPackage) return true
    if (selectedDates.length === 0) return false
    return selectedDates.every((ds) => {
      const t = hourlyTimeByDate[ds]
      if (!t?.start || !t?.end) return false
      return t.start < t.end
    })
  }, [isHourlyPackage, selectedDates, hourlyTimeByDate])

  // Refs to prevent duplicate API calls
  const hasLoadedPatientsRef = useRef(false)
  const isFetchingPatientsRef = useRef(false)
  const reviewSectionRef = useRef(null)
  const customAddressInputRef = useRef(null)
  const lobbyNavigateAfterAlertRef = useRef(false)
  const bookingReturnToRef = useRef(null)
  const dashboardPrefillAppliedRef = useRef(false)

  // Owner privileges: VSRE_OWNER or MASTER_ADMIN
  const isVsreOwner = useMemo(() => hasOwnerPrivileges(authUser), [authUser])
  const isCustomerUser = useMemo(() => authUser?.user_type === 'CUSTOMER', [authUser])
  const canChooseAdvancePaymentTiming = useMemo(() => isCareStaffUser(authUser), [authUser])
  const todayDateStr = useMemo(() => new Date().toISOString().split('T')[0], [])
  const ownerTwoMonthsBackDateStr = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 2)
    return d.toISOString().split('T')[0]
  }, [])
  const packageRequestMinDate = isVsreOwner ? ownerTwoMonthsBackDateStr : todayDateStr

  // Prefill patient when launched from Manage Customer → Booking → Create booking
  useEffect(() => {
    if (dashboardPrefillAppliedRef.current) return
    const state = location.state
    if (!state?.fromDashboardBooking || !state?.prefillPatient) return

    const registration = mapApiPatientToRegistration(state.prefillPatient)
    if (!registration) return

    dashboardPrefillAppliedRef.current = true
    bookingReturnToRef.current = state.returnTo || '/dashboard?section=booking'
    setActiveRegistration(registration)
    setIsRegistrationComplete(true)
    setSelectedLocationType('Client Location')
    setClientAddressMode('DEFAULT')
    setClientName((registration.fullName || '').trim())
    setClientAddress('')
    setCurrentStep(2)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    if (isCustomerUser) {
      setAdvancePaymentTiming('upfront')
    }
  }, [isCustomerUser])

  useEffect(() => {
    idProofFilesRef.current = registrationForm.idProofFiles || []
  }, [registrationForm.idProofFiles])

  useEffect(() => {
    idProofFilesMetaRef.current = idProofFilesMeta
  }, [idProofFilesMeta])

  // Load authUser on mount
  useEffect(() => {
    const checkAuthStatus = () => {
      try {
        const raw = localStorage.getItem('authUser')
        if (raw) {
          const parsed = JSON.parse(raw)
          setAuthUser(parsed)
        } else {
          setAuthUser(null)
        }
      } catch (error) {
        setAuthUser(null)
      }
    }

    checkAuthStatus()

    const handleAuthChange = () => checkAuthStatus()
    window.addEventListener('auth-changed', handleAuthChange)
    window.addEventListener('storage', handleAuthChange)

    return () => {
      window.removeEventListener('auth-changed', handleAuthChange)
      window.removeEventListener('storage', handleAuthChange)
    }
  }, [])

  // Fetch patients from API with pagination support
  const fetchPatientsFromAPI = async (url = null, options = {}) => {
    const accessToken = localStorage.getItem('access_token')
    
    if (!accessToken) {
      throw new Error('Authorization token missing. Please log in again.')
    }

    try {
      const searchQ =
        options.search !== undefined ? String(options.search || '').trim() : null
      let apiUrl = url
      if (!apiUrl) {
        const base = `${import.meta.env.VITE_BASEURL_CARE}/booking/patients/`
        if (searchQ) {
          const built = new URL(base)
          built.searchParams.set('search', searchQ)
          apiUrl = built.toString()
        } else {
          apiUrl = base
        }
      }
      const response = await axios.get(apiUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })
      
      const isSearchRequest = Boolean(searchQ && !url)
      if (isSearchRequest) {
        setNextUrlPatients(null)
        setPreviousUrlPatients(null)
      } else {
        setNextUrlPatients(response.data?.next || null)
        setPreviousUrlPatients(response.data?.previous || null)
      }
      setTotalCountPatients(response.data?.count || 0)
      
      // Handle paginated response or direct array
      const patientsData = response.data?.results || response.data || []
      
      // Map API response to local format
      return patientsData.map(patient => ({
        id: patient.id,
        apiId: patient.id,
        firstName: patient.first_name || '',
        lastName: patient.last_name || '',
        fullName: `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || patient.name_registered_by || '',
        email: patient.email || '',
        phone: patient.phone || '',
        countryCode: '+91', // Default, API doesn't provide this
        address: patient.address || '',
        dateOfBirth: '', // API doesn't provide DOB, only age
        dontKnowDOB: true, // Since API only has age
        age: patient.age ? patient.age.toString() : '',
        emergencyContact: patient.emergency_contact || '',
        emergencyPhone: patient.emergency_phone || '',
        emergencyCountryCode: '+91',
        emergencyContact2: patient.emergency_contact_2 || '',
        emergencyPhone2: patient.emergency_phone_2 || '',
        emergencyCountryCode2: '+91',
        medicalConditions: patient.medical_conditions || '',
        allergies: patient.allergies || '',
        preferredLanguage: patient.preferred_language || '',
        gender: patient.gender || '',
        bloodGroup: patient.blood_group || '',
        idProof: patient.id_proof || '',
        idProofNumber: patient.id_proof_number || '',
        idProofFile: null,
        idProofFileUrl: patient.patient_documents || '',
        educationQualifications: patient.education_qualifications || '',
        earlierOccupation: patient.earlier_occupation || '',
        yearOfRetirement: patient.year_of_retirement ? patient.year_of_retirement.toString() : '',
        presentHealthCondition: patient.present_health_condition || '',
        registrationFee: patient.registration_fee || '5000.00',
        is_registration_fees_paid: patient.is_registration_fees_paid === true,
        advancePayment: patient.advance_payment || '',
        paymentMode: patient.payment_mode || '',
        affiliate: patient.affiliate ?? '',
        source: patient.source ?? '',
        referredBy: patient.referred_by ?? '',
        isProbono: patient.is_probono === true,
        status: patient.is_active ? 'Active' : 'Inactive',
        dateOfRegistration: patient.registration_date ? new Date(patient.registration_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        registeredBy: patient.registered_by,
        nameRegisteredBy: patient.name_registered_by || '',
        updatedAt: patient.updated_at || '',
        // Preserve booking data if exists in localStorage
        selectedPackage: undefined,
        caregiverType: undefined,
        location: undefined,
        locationDetails: undefined,
        selectedDates: []
      }))
    } catch (error) {
      console.error('Error fetching patients from API:', error)
      if (isServerError(error)) {
        showServerErrorModal(error, () => fetchPatientsFromAPI())
        throw new Error('SERVER_ERROR')
      }
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error ||
                          error.message ||
                          'Failed to fetch patients'
      throw new Error(errorMessage)
    }
  }

  // Load existing registrations from API only
  const loadExistingRegistrations = async (fromAPI = true, searchOverride) => {
    // Prevent concurrent calls
    if (isFetchingPatientsRef.current) {
      return []
    }
    
    setIsLoadingRegistrations(true)
    setRegistrationsError('')
    isFetchingPatientsRef.current = true
    
    try {
      let apiRegistrations = []
      const searchTerm =
        searchOverride !== undefined ? String(searchOverride || '').trim() : patientsActiveSearch
      
      // Fetch from API if requested
      if (fromAPI) {
        try {
          apiRegistrations = await fetchPatientsFromAPI(null, { search: searchTerm })
        } catch (apiError) {
          console.error('Error fetching from API:', apiError)
          // Don't set error for server errors (already shown in modal)
          if (apiError.message !== 'SERVER_ERROR') {
            setRegistrationsError(apiError.message)
          }
        }
      }
      
      setExistingRegistrations(apiRegistrations)
      setActiveRegistration((prev) => {
        if (!prev) return prev
        const pid = prev.apiId ?? prev.id
        if (pid == null) return prev
        const row = apiRegistrations.find((r) => (r.apiId ?? r.id) === pid)
        if (!row) return prev
        return { ...prev, is_registration_fees_paid: row.is_registration_fees_paid === true }
      })
      return apiRegistrations
    } catch (error) {
      console.error('Error loading existing registrations:', error)
      setRegistrationsError(error.message || 'Failed to load registrations')
      setExistingRegistrations([])
      return []
    } finally {
      setIsLoadingRegistrations(false)
      isFetchingPatientsRef.current = false
    }
  }

  // Load existing registrations on component mount
  useEffect(() => {
    // Only load once on mount
    if (!hasLoadedPatientsRef.current) {
      hasLoadedPatientsRef.current = true
      loadExistingRegistrations(true) // Fetch from API on mount
    }
  }, [])

  // Search address using OpenStreetMap Nominatim (free, no API key required)
  const searchAddress = async (query) => {
    if (!query || query.length < 3) {
      return []
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`
      )
      const data = await response.json()
      return data.map(item => ({
        display: item.display_name,
        lat: item.lat,
        lon: item.lon,
        address: item.address || {}
      }))
    } catch (error) {
      console.error('Error fetching address suggestions:', error)
      return []
    }
  }

  // Debounce function to reduce API calls
  const debounce = (func, wait) => {
    let timeout
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout)
        func(...args)
      }
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
  }

  // Handle client address search with debounce
  const handleClientAddressSearch = async (value) => {
    setClientAddress(value)
    if (value.length >= 3) {
      const suggestions = await searchAddress(value)
      // Add the typed text as first option for manual entry
      const allSuggestions = [
        { display: value, isManualEntry: true },
        ...suggestions
      ]
      setClientAddressSuggestions(allSuggestions)
      setShowClientSuggestions(true)
    } else {
      setClientAddressSuggestions([])
      setShowClientSuggestions(false)
    }
  }

  // Select suggestion for client
  const selectClientSuggestion = (suggestion) => {
    setClientAddress(suggestion.display)
    setClientAddressSuggestions([])
    setShowClientSuggestions(false)
  }

  // Caregiver options
  const caregiverOptions = [
    'Skilled Male Nurse',
    'Skilled Female Nurse', 
    'Semi Skilled Male Care Taker',
    'Semi Skilled Female Care Taker'
  ]

  // Location options
  const locationOptions = {
    'Client Location': 'form'
  }

  const getServiceTypeForLocation = useCallback(() => {
    if (selectedLocationType === 'Client Location') return 'CLIENT_SIDE'
    return ''
  }, [selectedLocationType])

  useEffect(() => {
    const fetchServiceDropdown = async () => {
      if (currentStep !== 2) return
      const serviceType = getServiceTypeForLocation()
      if (!serviceType) return

      setIsLoadingServiceDropdown(true)
      setServiceDropdownError('')
      try {
        const accessToken = localStorage.getItem('access_token')
        const response = await axios.get(
          `${import.meta.env.VITE_BASEURL_CARE}/booking/public-services/service_dropdown/?service_type=${encodeURIComponent(serviceType)}`,
          {
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
          }
        )
        const list = Array.isArray(response.data) ? response.data : []
        setServiceDropdownOptions(list)
      } catch (error) {
        setServiceDropdownOptions([])
        setServiceDropdownError('Failed to load services. Please try again.')
      } finally {
        setIsLoadingServiceDropdown(false)
      }
    }

    fetchServiceDropdown()
  }, [currentStep, getServiceTypeForLocation])

  useEffect(() => {
    const fetchPackagesByService = async () => {
      if (currentStep !== 3) return
      if (!selectedServiceOption?.id) return

      setIsLoadingPackages(true)
      setPackagesError('')
      try {
        const accessToken = localStorage.getItem('access_token')
        const base = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
        const response = await axios.get(
          `${base}/booking/packages/by_belongs_to/`,
          {
            params: {
              id: selectedServiceOption.id,
              entity: 'service',
            },
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          }
        )
        const payload = response.data
        const items = Array.isArray(payload) ? payload : (payload?.results ?? [])
        const normalized = items.map((pkg) => {
          const amount = toNum(pkg.price)
          const period = String(pkg.period || 'DAILY').toUpperCase()
          const unit = periodUnitLabel(period)
          return {
            ...pkg,
            priceValue: amount,
            priceLabel: `₹${amount.toLocaleString('en-IN')}/${unit}`,
            features: [pkg.description || 'Package details available'],
          }
        })
        setPackageOptions(normalized)
      } catch (error) {
        setPackageOptions([])
        setPackagesError('Failed to load packages. Please try again.')
      } finally {
        setIsLoadingPackages(false)
      }
    }

    fetchPackagesByService()
  }, [currentStep, selectedServiceOption])

  // Caregiver availability data
  const caregiverAvailability = {
    'Skilled Male Nurse': 7,
    'Skilled Female Nurse': 5,
    'Semi Skilled Male Care Taker': 8,
    'Semi Skilled Female Care Taker': 6
  }

  const dateToYmd = useCallback((value) => {
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }, [])

  const availabilityByDate = useMemo(() => {
    const entries = Array.isArray(serviceAvailability?.calendar) ? serviceAvailability.calendar : []
    const map = new Map()
    for (const row of entries) {
      const key = String(row?.date || '').slice(0, 10)
      if (key) map.set(key, row)
    }
    return map
  }, [serviceAvailability])

  const fetchServiceAvailability = useCallback(async () => {
    const patientId = activeRegistration?.apiId || activeRegistration?.id
    if (!patientId || currentStep !== 4) {
      setServiceAvailability(null)
      setServiceAvailabilityError('')
      return
    }

    const accessToken = localStorage.getItem('access_token')
    if (!accessToken) {
      setServiceAvailability(null)
      setServiceAvailabilityError('Authorization token missing. Please log in again.')
      return
    }

    setIsLoadingServiceAvailability(true)
    setServiceAvailabilityError('')
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/availability/`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            patient_id: patientId,
            month: currentMonth.getMonth() + 1,
            year: currentMonth.getFullYear(),
          },
        }
      )
      setServiceAvailability(response?.data || null)
    } catch (error) {
      setServiceAvailability(null)
      const msg =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        'Could not load booking availability.'
      setServiceAvailabilityError(msg)
    } finally {
      setIsLoadingServiceAvailability(false)
    }
  }, [activeRegistration?.apiId, activeRegistration?.id, currentStep, currentMonth])

  useEffect(() => {
    fetchServiceAvailability()
  }, [fetchServiceAvailability])

  // Service data from ListofServices or fallback
  const serviceData = useMemo(() => ({
    id: service.id || '1',
    name: service.name || 'Vaishnavi Medicare',
    location: service.place || 'Bengaluru, KA',
    experience: '10+ years experience',
    rating: service.rating || 4.8,
    reviewCount: 89,
    isFeatured: true,
    startingPrice: '₹1,500/day',
    responseTime: 'Within 1 hour',
    advanceBooking: '7 days',
    cancellation: 'Free up to 24 hours',
    contact: service.contact || '+91 9898989898',
    email: 'care@srivashnavi.com',
    description: `With over 10 years of dedicated experience in senior care, we provide compassionate and professional care services for elderly individuals. Our team of skilled nurses and caregivers ensures your loved ones receive the best possible care in the comfort of their own home.`,
    services: service.services || ['Home Care', 'Residential Care', 'Companion Care', 'Live-in Care'],
    packages: [
      { 
        name: 'Basic Care Package', 
        price: '₹1,500/day', 
        features: ['8 hours daily care', 'Basic medical assistance', 'Medication reminders', 'Meal preparation'] 
      },
      { 
        name: 'Premium Care Package', 
        price: '₹2,500/day', 
        features: ['12 hours daily care', 'Skilled nursing', 'Physical therapy', '24/7 emergency support'] 
      },
      { 
        name: 'Live-in Care Package', 
        price: '₹4,500/day', 
        features: ['24/7 live-in caregiver', 'Complete personal care', 'Medical monitoring', 'Family updates'] 
      }
    ],
    reviews: [
      { name: 'Mrs. Radha Sharma', rating: 5, comment: 'Excellent care for my mother. The caregivers are very professional and compassionate.' },
      { name: 'Mr. Rajesh Kumar', rating: 5, comment: 'Highly recommended! They took great care of my father during his recovery.' },
      { name: 'Mrs. Anita Singh', rating: 4, comment: 'Good service with caring staff. Very satisfied with the quality of care provided.' }
    ]
  }), [service])

  // Color scheme for senior care
  const colorClasses = {
    bg: 'bg-teal-50',
    text: 'text-teal-600',
    button: 'bg-teal-600 hover:bg-teal-700',
    badge: 'bg-teal-100 text-teal-700',
    border: 'border-teal-200'
  }

  // Mock unavailable dates
  const unavailableDates = useMemo(() => {
    const today = new Date()
    const unavailable = []
    
    // Add some random unavailable dates for demo
    for (let i = 0; i < 8; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() + Math.floor(Math.random() * 30) + 1)
      unavailable.push(date.toDateString())
    }
    
    return unavailable
  }, [])

  // Calendar utility functions
  const getDaysInMonth = (date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()
    
    return { daysInMonth, startingDayOfWeek }
  }

  const isDateAvailable = (date) => {
    const ymd = dateToYmd(date)
    const availabilityForDate = ymd ? availabilityByDate.get(ymd) : null
    if (availabilityForDate) {
      return Boolean(availabilityForDate.is_available)
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // VSRE_OWNER: no date disabling in calendar.
    if (isVsreOwner) {
      return true
    }

    // Non-owners: at least 2 days in the future.
    const minBookingDate = new Date(today)
    minBookingDate.setDate(today.getDate() + 2)
    return date >= minBookingDate
  }

  useEffect(() => {
    if (!selectedDates.length) return
    setSelectedDates((prev) =>
      prev.filter((dateString) => {
        const d = new Date(dateString)
        return !Number.isNaN(d.getTime()) && isDateAvailable(d)
      })
    )
  }, [availabilityByDate, selectedDates.length])

  // Registration Form Handlers
  const handleRegistrationInputChange = (field, value) => {
    setRegistrationForm(prev => {
      const updated = {
        ...prev,
        [field]: value
      }
      // Clear ID number when ID proof type changes
      if (field === 'idProof') {
        updated.idProofNumber = ''
      }
      // Calculate age when DOB changes
      if (field === 'dateOfBirth' && value) {
        updated.age = calculateAge(value)
      }
      // Handle "Don't know DOB" checkbox
      if (field === 'dontKnowDOB') {
        if (value) {
          // If checked, clear DOB and age
          updated.dateOfBirth = ''
          updated.age = ''
        } else {
          // If unchecked, clear age (will be calculated from DOB)
          updated.age = ''
        }
      }
      return updated
    })
    // Clear error for this field when user starts typing
    if (registrationErrors[field]) {
      setRegistrationErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
    // Clear ID number error when ID proof type changes
    if (field === 'idProof' && registrationErrors.idProofNumber) {
      setRegistrationErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors.idProofNumber
        return newErrors
      })
    }
  }

  const addIdProofFiles = async (fileList) => {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return

    setIdProofCompressing(true)
    setIdProofCompressMessage('Compressing selected files…')

    const errors = []
    let nextFiles = [...idProofFilesRef.current]
    let nextMeta = [...idProofFilesMetaRef.current]

    for (const raw of incoming) {
      if (nextFiles.length >= ID_PROOF_MAX_FILES) {
        errors.push(`Maximum ${ID_PROOF_MAX_FILES} files allowed.`)
        break
      }
      if (!isValidIdProofFile(raw)) {
        errors.push(`"${raw.name}" is not allowed. Use JPEG, PNG, GIF, or PDF.`)
        continue
      }

      try {
        const usedBytes = totalIdProofFileBytes(nextFiles)
        const remainingBytes = Math.max(150_000, ID_PROOF_MAX_UPLOAD_BYTES - usedBytes)
        const result = await compressFileForUpload(raw, {
          quick: true,
          maxDimension: 1920,
          maxBytes: remainingBytes,
        })

        const dup = nextFiles.some(
          (f) => f.name === result.file.name && f.size === result.file.size
        )
        if (dup) continue

        const trial = [...nextFiles, result.file]
        if (totalIdProofFileBytes(trial) > ID_PROOF_MAX_UPLOAD_BYTES) {
          errors.push('Combined file size must not exceed 5 MB.')
          continue
        }

        nextFiles = trial
        nextMeta = [
          ...nextMeta,
          { originalSize: result.originalSize, compressed: result.compressed },
        ]
        idProofFilesRef.current = nextFiles
        idProofFilesMetaRef.current = nextMeta

        setIdProofFilesMeta(nextMeta)
        setRegistrationForm((prev) => ({
          ...prev,
          idProofFiles: nextFiles,
          idProofFile: nextFiles[0] || null,
          idProofFileUrl:
            nextFiles[0] && nextFiles[0].type?.startsWith('image/')
              ? URL.createObjectURL(nextFiles[0])
              : prev.idProofFileUrl,
        }))
      } catch {
        errors.push(`Could not process "${raw.name}".`)
      }
    }

    setIdProofCompressing(false)
    const anyCompressed = nextMeta.some((m) => m.compressed)
    setIdProofCompressMessage(
      anyCompressed
        ? 'Files compressed for upload — quality may be lower than originals.'
        : ''
    )

    if (errors.length) {
      setRegistrationErrors((prev) => ({ ...prev, idProofFile: errors[0] }))
    } else if (registrationErrors.idProofFile) {
      setRegistrationErrors((prev) => {
        const nextErr = { ...prev }
        delete nextErr.idProofFile
        return nextErr
      })
    }
  }

  const handleIdProofFileChange = (e) => {
    void addIdProofFiles(e.target.files)
    e.target.value = ''
  }

  const removeIdProofFile = (index) => {
    setIdProofFilesMeta((prev) => {
      const nextMeta = prev.filter((_, i) => i !== index)
      idProofFilesMetaRef.current = nextMeta
      return nextMeta
    })
    setRegistrationForm((prev) => {
      const next = (prev.idProofFiles || []).filter((_, i) => i !== index)
      idProofFilesRef.current = next
      return {
        ...prev,
        idProofFiles: next,
        idProofFile: next[0] || null,
        idProofFileUrl: '',
      }
    })
  }

  // Calculate age from date of birth
  const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return ''
    const today = new Date()
    const birthDate = new Date(dateOfBirth)
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age.toString()
  }

  const validateRegistrationForm = () => {
    const errors = {}
    
    // Mandatory fields
    if (!registrationForm.firstName.trim()) {
      errors.firstName = 'First name is required'
    }
    if (!registrationForm.lastName.trim()) {
      errors.lastName = 'Last name is required'
    }
    if (!registrationForm.address.trim()) {
      errors.address = 'Address is required'
    }
    if (!registrationForm.emergencyContact.trim()) {
      errors.emergencyContact = 'Emergency contact name is required'
    }
    if (!registrationForm.emergencyPhone.trim()) {
      errors.emergencyPhone = 'Emergency contact phone is required'
    } else if (!/^[0-9]{10}$/.test(registrationForm.emergencyPhone.replace(/\D/g, ''))) {
      errors.emergencyPhone = 'Please enter a valid 10-digit phone number'
    }
    if (!registrationForm.gender.trim()) {
      errors.gender = 'Gender is required'
    }

    // Phone is mandatory
    if (!registrationForm.phone.trim()) {
      errors.phone = 'Phone number is required'
    } else if (!/^[0-9]{10}$/.test(registrationForm.phone.replace(/\D/g, ''))) {
      errors.phone = 'Please enter a valid 10-digit phone number'
    }
    
    // Optional fields validation (only validate format if provided)
    if (registrationForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registrationForm.email)) {
      errors.email = 'Please enter a valid email address'
    }
    
    // Date of Birth / Age validation (optional)
    if (!registrationForm.dontKnowDOB && registrationForm.dateOfBirth.trim()) {
      const dob = new Date(registrationForm.dateOfBirth)
      const today = new Date()
      const minDate = new Date('1925-01-01')
      const maxDate = new Date()
      maxDate.setFullYear(today.getFullYear() - 1) // At least 1 year old
      
      if (dob < minDate || dob > maxDate) {
        errors.dateOfBirth = 'Date of birth must be between 1925 and today (at least 1 year old)'
      }
    }
    if (registrationForm.dontKnowDOB && registrationForm.age.trim()) {
      const ageNum = parseInt(registrationForm.age)
      if (isNaN(ageNum) || ageNum < 1 || ageNum > 100) {
        errors.age = 'Age must be between 1 and 100 years'
      }
    }
    // Second Emergency Contact validation (optional but if phone is entered, name is required and vice versa)
    if (registrationForm.emergencyContact2.trim() && !registrationForm.emergencyPhone2.trim()) {
      errors.emergencyPhone2 = 'Emergency contact phone is required when name is provided'
    }
    if (registrationForm.emergencyPhone2.trim() && !registrationForm.emergencyContact2.trim()) {
      errors.emergencyContact2 = 'Emergency contact name is required when phone is provided'
    }
    if (registrationForm.emergencyPhone2.trim() && !/^[0-9]{10}$/.test(registrationForm.emergencyPhone2.replace(/\D/g, ''))) {
      errors.emergencyPhone2 = 'Please enter a valid 10-digit phone number'
    }

    // Advance Payment validation (optional)
    if (registrationForm.advancePayment.trim()) {
      const paymentAmount = parseFloat(registrationForm.advancePayment)
      if (isNaN(paymentAmount) || paymentAmount < 0) {
        errors.advancePayment = 'Payment amount cannot be negative'
      } else if (paymentAmount > 100000) {
        errors.advancePayment = 'Payment amount cannot exceed ₹1,00,000'
      }
    }
    
    setRegistrationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const validateIdProofStep = () => {
    const errors = {}
    if (!registrationForm.idProof.trim()) {
      errors.idProof = 'ID proof type is required'
    }
    if (registrationForm.idProof.trim() && !registrationForm.idProofNumber.trim()) {
      errors.idProofNumber = 'ID number is required'
    }
    const hasIdProofUpload =
      (registrationForm.idProofFiles?.length > 0) ||
      registrationForm.idProofFile ||
      registrationForm.idProofFileUrl
    if (registrationForm.idProof.trim() && !hasIdProofUpload) {
      errors.idProofFile = 'Add at least one ID proof document.'
    }
    if (registrationForm.idProofFiles?.length > 0) {
      if (totalIdProofFileBytes(registrationForm.idProofFiles) > ID_PROOF_MAX_UPLOAD_BYTES) {
        errors.idProofFile = 'Combined file size must not exceed 5 MB.'
      }
    }
    if (registrationForm.idProof === 'aadhar' && registrationForm.idProofNumber.trim()) {
      if (!/^[0-9]{12}$/.test(registrationForm.idProofNumber.replace(/\s/g, ''))) {
        errors.idProofNumber = 'Aadhar number must be exactly 12 digits'
      }
    }
    if (registrationForm.idProof === 'pan' && registrationForm.idProofNumber.trim()) {
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(registrationForm.idProofNumber.toUpperCase().replace(/\s/g, ''))) {
        errors.idProofNumber = 'PAN number must be in format: ABCDE1234F'
      }
    }
    setRegistrationErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Helper function to check if error is a server error (500, 502, 503, 504)
  const isServerError = (error) => {
    const status = error.response?.status
    return status === 500 || status === 502 || status === 503 || status === 504
  }

  // Show server error modal
  const showServerErrorModal = (error, onRetry = null) => {
    setServerError({
      message: 'Our servers are experiencing issues. Please try again in a moment.',
      details: error.response?.data?.message || error.message || 'Server Error',
      onRetry: onRetry,
      type: 'server_error',
      status: error.response?.status || 500
    })
  }

  // Submit patient registration to API
  const submitPatientRegistrationToAPI = async (registrationData) => {
    const accessToken = localStorage.getItem('access_token')
    
    if (!accessToken) {
      throw new Error('Authorization token missing. Please log in again.')
    }

    try {
      // Create FormData for file upload
      const formData = new FormData()
      
      // Map form fields to API field names (snake_case)
      formData.append('first_name', registrationData.firstName || '')
      formData.append('last_name', registrationData.lastName || '')
      formData.append('email', registrationData.email || '')
      formData.append('phone', registrationData.phone || '')
      formData.append('address', registrationData.address || '')
      
      // Handle age - use age if don't know DOB, otherwise calculate from DOB
      if (registrationData.dontKnowDOB && registrationData.age) {
        formData.append('age', registrationData.age)
      } else if (registrationData.dateOfBirth) {
        const today = new Date()
        const birthDate = new Date(registrationData.dateOfBirth)
        let age = today.getFullYear() - birthDate.getFullYear()
        const monthDiff = today.getMonth() - birthDate.getMonth()
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--
        }
        formData.append('age', age.toString())
      }
      
      formData.append('emergency_contact', registrationData.emergencyContact || '')
      formData.append('emergency_phone', registrationData.emergencyPhone || '')
      
      // Second emergency contact (optional)
      if (registrationData.emergencyContact2) {
        formData.append('emergency_contact_2', registrationData.emergencyContact2)
      }
      if (registrationData.emergencyPhone2) {
        formData.append('emergency_phone_2', registrationData.emergencyPhone2)
      }
      
      formData.append('medical_conditions', registrationData.medicalConditions || '')
      formData.append('allergies', registrationData.allergies || '')
      formData.append('present_health_condition', registrationData.presentHealthCondition || '')
      formData.append('gender', registrationData.gender || '')
      formData.append('blood_group', registrationData.bloodGroup || '')
      formData.append('preferred_language', registrationData.preferredLanguage || '')
      formData.append('affiliate', registrationData.affiliate || '')
      formData.append('source', registrationData.source || '')
      formData.append('referred_by', registrationData.referredBy || '')
      formData.append('is_probono', registrationData.isProbono ? 'true' : 'false')
      if (registrationData.includeIdProofFields) {
        formData.append('id_proof', registrationData.idProof || '')
        formData.append('id_proof_number', registrationData.idProofNumber || '')
      }
      formData.append('education_qualifications', registrationData.educationQualifications || '')
      formData.append('earlier_occupation', registrationData.earlierOccupation || '')
      
      if (registrationData.yearOfRetirement) {
        formData.append('year_of_retirement', registrationData.yearOfRetirement)
      }

      formData.append('registration_fee', '5000.00')

      if (registrationData.advancePayment) {
        formData.append('advance_payment', registrationData.advancePayment)
      }

      if (registrationData.paymentMode) {
        formData.append('payment_mode', registrationData.paymentMode)
      }

      if (registrationData.includeIdProofFields) {
        const uploadFiles =
          registrationData.idProofFiles?.length > 0
            ? registrationData.idProofFiles
            : registrationData.idProofFile
              ? [registrationData.idProofFile]
              : []
        uploadFiles.forEach((file) => {
          if (file) formData.append('patient_documents', file)
        })
      }

      const response = await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/patients/`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      )
      
      return response.data
    } catch (error) {
      console.error('Error submitting patient registration:', error)
      if (isServerError(error)) {
        showServerErrorModal(error, () => submitPatientRegistrationToAPI(registrationData))
        throw new Error('SERVER_ERROR')
      }
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error ||
                          error.message ||
                          'Failed to submit patient registration'
      throw new Error(errorMessage)
    }
  }

  // Update patient registration via API (PATCH)
  const updatePatientRegistrationToAPI = async (patientId, registrationData) => {
    const accessToken = localStorage.getItem('access_token')
    
    if (!accessToken) {
      throw new Error('Authorization token missing. Please log in again.')
    }

    if (!patientId) {
      throw new Error('Patient ID is required for update')
    }

    try {
      // Create FormData for file upload
      const formData = new FormData()
      
      // Map form fields to API field names (snake_case)
      formData.append('first_name', registrationData.firstName || '')
      formData.append('last_name', registrationData.lastName || '')
      formData.append('email', registrationData.email || '')
      formData.append('phone', registrationData.phone || '')
      formData.append('address', registrationData.address || '')
      
      // Handle age - use age if don't know DOB, otherwise calculate from DOB
      if (registrationData.dontKnowDOB && registrationData.age) {
        formData.append('age', registrationData.age)
      } else if (registrationData.dateOfBirth) {
        const today = new Date()
        const birthDate = new Date(registrationData.dateOfBirth)
        let age = today.getFullYear() - birthDate.getFullYear()
        const monthDiff = today.getMonth() - birthDate.getMonth()
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--
        }
        formData.append('age', age.toString())
      }
      
      formData.append('emergency_contact', registrationData.emergencyContact || '')
      formData.append('emergency_phone', registrationData.emergencyPhone || '')
      
      // Second emergency contact (optional)
      if (registrationData.emergencyContact2) {
        formData.append('emergency_contact_2', registrationData.emergencyContact2)
      } else {
        formData.append('emergency_contact_2', '')
      }
      if (registrationData.emergencyPhone2) {
        formData.append('emergency_phone_2', registrationData.emergencyPhone2)
      } else {
        formData.append('emergency_phone_2', '')
      }
      
      formData.append('medical_conditions', registrationData.medicalConditions || '')
      formData.append('allergies', registrationData.allergies || '')
      formData.append('present_health_condition', registrationData.presentHealthCondition || '')
      formData.append('gender', registrationData.gender || '')
      formData.append('blood_group', registrationData.bloodGroup || '')
      formData.append('preferred_language', registrationData.preferredLanguage || '')
      formData.append('affiliate', registrationData.affiliate || '')
      formData.append('source', registrationData.source || '')
      formData.append('referred_by', registrationData.referredBy || '')
      formData.append('is_probono', registrationData.isProbono ? 'true' : 'false')
      if (registrationData.includeIdProofFields) {
        formData.append('id_proof', registrationData.idProof || '')
        formData.append('id_proof_number', registrationData.idProofNumber || '')
      }
      formData.append('education_qualifications', registrationData.educationQualifications || '')
      formData.append('earlier_occupation', registrationData.earlierOccupation || '')
      
      if (registrationData.yearOfRetirement) {
        formData.append('year_of_retirement', registrationData.yearOfRetirement)
      }

      if (registrationData.advancePayment) {
        formData.append('advance_payment', registrationData.advancePayment)
      }

      if (registrationData.paymentMode) {
        formData.append('payment_mode', registrationData.paymentMode)
      }

      if (registrationData.includeIdProofFields !== false) {
        const uploadFiles =
          registrationData.idProofFiles?.length > 0
            ? registrationData.idProofFiles
            : registrationData.idProofFile
              ? [registrationData.idProofFile]
              : []
        uploadFiles.forEach((file) => {
          if (file) formData.append('patient_documents', file)
        })
      }

      const response = await axios.patch(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/patients/${patientId}/`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      )
      
      return response.data
    } catch (error) {
      console.error('Error updating patient registration:', error)
      if (isServerError(error)) {
        showServerErrorModal(error, () => updatePatientRegistrationToAPI(patientId, registrationData))
        throw new Error('SERVER_ERROR')
      }
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error ||
                          error.message ||
                          'Failed to update patient registration'
      throw new Error(errorMessage)
    }
  }

  // Delete patient via API (DELETE)
  const deletePatientFromAPI = async (patientId) => {
    const accessToken = localStorage.getItem('access_token')
    
    if (!accessToken) {
      throw new Error('Authorization token missing. Please log in again.')
    }

    if (!patientId) {
      throw new Error('Patient ID is required for deletion')
    }

    try {
      const response = await axios.delete(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/patients/${patientId}/`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      )
      
      return response.data
    } catch (error) {
      console.error('Error deleting patient:', error)
      if (isServerError(error)) {
        showServerErrorModal(error, () => deletePatientFromAPI(patientId))
        throw new Error('SERVER_ERROR')
      }
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error ||
                          error.message ||
                          'Failed to delete patient'
      throw new Error(errorMessage)
    }
  }

  const patchPatientIdProofToAPI = async (patientId, { idProof, idProofNumber }) => {
    const accessToken = localStorage.getItem('access_token')
    if (!accessToken) {
      throw new Error('Authorization token missing. Please log in again.')
    }
    const formData = new FormData()
    formData.append('id_proof', idProof || '')
    formData.append('id_proof_number', idProofNumber || '')
    const response = await axios.patch(
      `${import.meta.env.VITE_BASEURL_CARE}/booking/patients/${patientId}/`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'multipart/form-data',
        },
      }
    )
    return response.data
  }

  const resolveRegistrationPatientApiId = useCallback(() => {
    if (newlyRegisteredPatientId) return newlyRegisteredPatientId
    if (isEditingRegistration && editingRegistrationId) {
      const existingReg = existingRegistrations.find((reg) => reg.id === editingRegistrationId)
      return existingReg?.apiId || existingReg?.id || null
    }
    return null
  }, [newlyRegisteredPatientId, isEditingRegistration, editingRegistrationId, existingRegistrations])

  const finishRegistrationAfterIdProof = async (apiRegistration) => {
    const wasEdit = isEditingRegistration
    setActiveRegistration(apiRegistration)
    setIsRegistrationComplete(true)
    setShowRegistrationModal(false)
    setShowRegistrationRequiredPopup(false)
    setRegistrationModalStep(1)
    setNewlyRegisteredPatientId(null)
    setIsEditingRegistration(false)
    setEditingRegistrationId(null)
    resetRegistrationForm()
    showAlert(
      wasEdit ? 'Patient registration updated successfully!' : 'Patient registration completed successfully!',
      'success'
    )
    await loadExistingRegistrations(true)
  }

  const handleIdProofStepSubmit = async (e) => {
    e.preventDefault()
    if (!validateIdProofStep()) return
    const patientId = resolveRegistrationPatientApiId()
    if (!patientId) {
      showAlert('Patient ID missing. Please complete step 1 again.', 'error')
      return
    }
    const idProofUploadFiles = registrationForm.idProofFiles || []
    const hasExistingDoc = Boolean(registrationForm.idProofFileUrl)
    if (!idProofUploadFiles.length && !hasExistingDoc) {
      showAlert('Please upload at least one ID proof document.', 'error')
      return
    }

    setIsSubmittingRegistration(true)
    try {
      const idLabel = ID_PROOF_TYPE_LABELS[registrationForm.idProof] || 'ID Proof'

      // PATCH id_proof/id_proof_number is non-blocking.
      // If backend changed and PATCH fails, we still want to upload the documents via POST.
      try {
        await patchPatientIdProofToAPI(patientId, {
          idProof: registrationForm.idProof,
          idProofNumber: registrationForm.idProofNumber.trim(),
        })
      } catch (patchError) {
        console.error('Could not update id_proof fields:', patchError)
        const msg =
          patchError?.response?.data?.detail ||
          patchError?.response?.data?.message ||
          patchError?.message ||
          'ID proof details update failed.'
        showAlert(msg, 'warning')
      }

      if (idProofUploadFiles.length) {
        await createPatientDocument(patientId, {
          title: idLabel,
          remarks: `ID Number: ${registrationForm.idProofNumber.trim()}`,
          files: idProofUploadFiles,
        })
      }

      const apiRegistration = {
        id: patientId,
        apiId: patientId,
        firstName: registrationForm.firstName,
        lastName: registrationForm.lastName,
        fullName: `${registrationForm.firstName} ${registrationForm.lastName}`.trim(),
        phone: registrationForm.phone,
        idProof: registrationForm.idProof,
        idProofNumber: registrationForm.idProofNumber,
        idProofFiles: registrationForm.idProofFiles,
      }
      await finishRegistrationAfterIdProof(apiRegistration)
    } catch (error) {
      console.error('Error saving ID proof:', error)
      const msg =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        'Could not save ID proof. Please try again.'
      showAlert(msg, 'error')
    } finally {
      setIsSubmittingRegistration(false)
    }
  }

  const handleRegistrationSubmit = async (e) => {
    e.preventDefault()
    if (validateRegistrationForm()) {
      // Prepare registration data with form data and current selections
      const registrationData = {
        firstName: registrationForm.firstName,
        lastName: registrationForm.lastName,
        fullName: `${registrationForm.firstName} ${registrationForm.lastName}`, // For backward compatibility
        phone: registrationForm.phone,
        countryCode: registrationForm.countryCode,
        email: registrationForm.email,
        address: registrationForm.address,
        dateOfBirth: registrationForm.dateOfBirth,
        dontKnowDOB: registrationForm.dontKnowDOB,
        age: registrationForm.age,
        emergencyContact: registrationForm.emergencyContact,
        emergencyPhone: registrationForm.emergencyPhone,
        emergencyCountryCode: registrationForm.emergencyCountryCode,
        emergencyContact2: registrationForm.emergencyContact2,
        emergencyPhone2: registrationForm.emergencyPhone2,
        emergencyCountryCode2: registrationForm.emergencyCountryCode2,
        medicalConditions: registrationForm.medicalConditions,
        allergies: registrationForm.allergies,
        preferredLanguage: registrationForm.preferredLanguage,
        gender: registrationForm.gender,
        bloodGroup: registrationForm.bloodGroup,
        idProof: registrationForm.idProof,
        idProofNumber: registrationForm.idProofNumber,
        idProofFiles: registrationForm.idProofFiles,
        idProofFile: registrationForm.idProofFiles?.[0] || registrationForm.idProofFile,
        idProofFileUrl: registrationForm.idProofFileUrl,
        educationQualifications: registrationForm.educationQualifications,
        earlierOccupation: registrationForm.earlierOccupation,
        yearOfRetirement: registrationForm.yearOfRetirement,
        presentHealthCondition: registrationForm.presentHealthCondition,
        registrationFee: 5000,
        advancePayment: registrationForm.advancePayment,
        paymentMode: registrationForm.paymentMode,
        affiliate: registrationForm.affiliate,
        source: registrationForm.source,
        referredBy: registrationForm.referredBy,
        isProbono: registrationForm.isProbono,
        includeIdProofFields: false,
        // Include booking selections if available (only update if not editing or if explicitly provided)
        selectedPackage: isEditingRegistration ? undefined : (selectedPackage || null),
        caregiverType: isEditingRegistration ? undefined : (selectedCaregiver || ''),
        location: isEditingRegistration ? undefined : (selectedLocationType || ''),
        locationDetails: isEditingRegistration ? undefined : (
          selectedLocationType === 'Client Location' 
            ? `${clientName} - ${effectiveClientAddress}` 
            : ''
        ),
        selectedDates: isEditingRegistration ? undefined : (selectedDates.length > 0 ? selectedDates : [])
      }
      
      // Submit to API first (only for new registrations, not editing)
      setIsSubmittingRegistration(true)
      
      try {
        let apiResponse = null
        
        // Submit to API - create new or update existing
        if (isEditingRegistration && editingRegistrationId) {
          // Find the registration being edited to get API ID
          const existingReg = existingRegistrations.find(reg => reg.id === editingRegistrationId)
          const patientId = existingReg?.apiId || existingReg?.id
          
          if (patientId) {
            try {
              apiResponse = await updatePatientRegistrationToAPI(patientId, registrationData)
              
              
              // Update registrationData with API response data if available
              if (apiResponse && apiResponse.id) {
                registrationData.apiId = apiResponse.id
                registrationData.apiResponse = apiResponse
              }
            } catch (apiError) {
              console.error('API update error:', apiError)
              // Don't show alert for server errors (already shown in modal)
              if (apiError.message !== 'SERVER_ERROR') {
                // Continue to save to localStorage even if API fails
                showAlert(`Warning: Could not update on server. ${apiError.message}. Saving locally...`, 'warning')
              }
            }
          } else {
            console.warn('No patient ID found for update, saving locally only')
          }
        } else if (!isEditingRegistration) {
          // Create new registration
          try {
            apiResponse = await submitPatientRegistrationToAPI(registrationData)
           
            
            // Update registrationData with API response data if available
            if (apiResponse && apiResponse.id) {
              registrationData.apiId = apiResponse.id
              registrationData.apiResponse = apiResponse
            }
          } catch (apiError) {
            console.error('API submission error:', apiError)
            // Don't show alert for server errors (already shown in modal)
            if (apiError.message !== 'SERVER_ERROR') {
              // Continue to save to localStorage even if API fails
              showAlert(`Warning: Could not submit to server. ${apiError.message}. Saving locally...`, 'warning')
            }
          }
        }
        
        if (apiResponse) {
          const patientApiId = apiResponse.id ?? apiResponse.pk ?? newlyRegisteredPatientId

          if (patientApiId) {
            setNewlyRegisteredPatientId(patientApiId)
            setRegistrationModalStep(2)
            setRegistrationErrors({})
            showAlert(
              isEditingRegistration
                ? 'Details saved. Continue to ID proof (step 2).'
                : 'Registration saved. Please add ID proof (step 2).',
              'success'
            )
            return
          }
        } else {
          // API call failed - show error
          showAlert('Error saving registration. Please try again.', 'error')
        }
      } catch (error) {
        console.error('Error saving registration:', error)
        showAlert(`Error saving registration: ${error.message || 'Please try again.'}`, 'error')
      } finally {
        setIsSubmittingRegistration(false)
      }
    }
  }

  // Reset registration form to default values
  const resetRegistrationForm = () => {
    setRegistrationForm({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      countryCode: '+91',
      address: '',
      dateOfBirth: '',
      dontKnowDOB: false,
      age: '',
      emergencyContact: '',
      emergencyPhone: '',
      emergencyCountryCode: '+91',
      emergencyContact2: '',
      emergencyPhone2: '',
      emergencyCountryCode2: '+91',
      medicalConditions: '',
      allergies: '',
      preferredLanguage: '',
      gender: '',
      bloodGroup: '',
      idProof: '',
      idProofNumber: '',
      idProofFiles: [],
      idProofFile: null,
      idProofFileUrl: '',
      educationQualifications: '',
      earlierOccupation: '',
      yearOfRetirement: '',
      presentHealthCondition: '',
      advancePayment: '',
      paymentMode: '',
      affiliate: '',
      source: '',
      referredBy: '',
      isProbono: false,
    })
    setRegistrationErrors({})
    setIsEditingRegistration(false)
    setEditingRegistrationId(null)
    setIdProofCompressing(false)
    setIdProofCompressMessage('')
    setIdProofFilesMeta([])
    idProofFilesRef.current = []
    idProofFilesMetaRef.current = []
  }

  // Populate form with existing registration data
  const populateFormFromRegistration = (registration) => {
    if (!registration) return

    setIdProofCompressing(false)
    setIdProofCompressMessage('')
    setIdProofFilesMeta([])
    idProofFilesRef.current = []
    idProofFilesMetaRef.current = []

    setRegistrationForm({
      firstName: registration.firstName || '',
      lastName: registration.lastName || '',
      email: registration.email || '',
      phone: registration.phone || '',
      countryCode: registration.countryCode || '+91',
      address: registration.address || '',
      dateOfBirth: registration.dateOfBirth || '',
      dontKnowDOB: registration.dontKnowDOB || false,
      age: registration.age || '',
      emergencyContact: registration.emergencyContact || '',
      emergencyPhone: registration.emergencyPhone || '',
      emergencyCountryCode: registration.emergencyCountryCode || '+91',
      emergencyContact2: registration.emergencyContact2 || '',
      emergencyPhone2: registration.emergencyPhone2 || '',
      emergencyCountryCode2: registration.emergencyCountryCode2 || '+91',
      medicalConditions: registration.medicalConditions || '',
      allergies: registration.allergies || '',
      preferredLanguage: registration.preferredLanguage || '',
      gender: registration.gender || '',
      bloodGroup: registration.bloodGroup || '',
      idProof: registration.idProof || '',
      idProofNumber: registration.idProofNumber || '',
      idProofFiles: [],
      idProofFile: null,
      idProofFileUrl: registration.idProofFile || registration.idProofFileUrl || '',
      educationQualifications: registration.educationQualifications || '',
      earlierOccupation: registration.earlierOccupation || '',
      yearOfRetirement: registration.yearOfRetirement || '',
      presentHealthCondition: registration.presentHealthCondition || '',
      advancePayment: registration.advancePayment || '',
      paymentMode: registration.paymentMode || '',
      affiliate: registration.affiliate || '',
      source: registration.source || '',
      referredBy: registration.referredBy || '',
      isProbono: registration.isProbono === true,
    })
  }

  const handleOpenRegistrationModal = (registrationToEdit = null) => {
    // Check authentication before opening modal
    const accessToken = localStorage.getItem('access_token')
    const authUser = localStorage.getItem('authUser')
    if (!accessToken && !authUser) {
      navigate('/login')
      return
    }
    
    // Always reset editing state first
    setIsEditingRegistration(false)
    setEditingRegistrationId(null)
    
    if (registrationToEdit) {
      setIsEditingRegistration(true)
      setEditingRegistrationId(registrationToEdit.id)
      populateFormFromRegistration(registrationToEdit)
      const patientApiId = registrationToEdit.apiId || registrationToEdit.id
      setNewlyRegisteredPatientId(patientApiId ? String(patientApiId) : null)
      setRegistrationModalStep(1)
    } else {
      resetRegistrationForm()
      setRegistrationModalStep(1)
      setNewlyRegisteredPatientId(null)
    }
    setShowRegistrationModal(true)
  }

  const handleCloseRegistrationModal = () => {
    setShowRegistrationModal(false)
    setIsEditingRegistration(false)
    setEditingRegistrationId(null)
    setRegistrationModalStep(1)
    setNewlyRegisteredPatientId(null)
    resetRegistrationForm()
  }

  const handleEditRegistration = (registration) => {
    handleCloseExistingRegistrations()
    handleOpenRegistrationModal(registration)
  }

  const handleNewRegistration = () => {
    handleCloseExistingRegistrations()
    handleOpenRegistrationModal()
  }

  const handleOpenExistingRegistrations = async () => {
    // Check authentication before opening modal
    const accessToken = localStorage.getItem('access_token')
    const authUser = localStorage.getItem('authUser')
    if (!accessToken && !authUser) {
      navigate('/login')
      return
    }
    
    setPatientsSearchInput('')
    setPatientsActiveSearch('')
    setNextUrlPatients(null)
    setPreviousUrlPatients(null)
    setTotalCountPatients(0)
    
    await loadExistingRegistrations(true, '')
    setShowExistingRegistrations(true)
  }

  const handleCloseExistingRegistrations = () => {
    setShowExistingRegistrations(false)
    setPatientsSearchInput('')
    setPatientsActiveSearch('')
    setNextUrlPatients(null)
    setPreviousUrlPatients(null)
    setTotalCountPatients(0)
  }

  const submitPatientsSearch = async () => {
    const q = patientsSearchInput.trim()
    setPatientsActiveSearch(q)
    await loadExistingRegistrations(true, q)
  }

  const handlePatientsSearchInputChange = (value) => {
    setPatientsSearchInput(value)
    if (!String(value || '').trim()) {
      setPatientsActiveSearch('')
      loadExistingRegistrations(true, '')
    }
  }

  const handleSelectExistingRegistration = (registration) => {
    if (!registration) return
    setShowExistingRegistrations(false)
    setPendingSelectedRegistration(registration)
    setShowAddressChoicePopup(true)
  }

  const handleConfirmDefaultAddress = () => {
    const registration = pendingSelectedRegistration
    if (!registration) return
    setActiveRegistration(registration)
    setIsRegistrationComplete(true)
    setShowExistingRegistrations(false)
    setShowRegistrationRequiredPopup(false)
    setSelectedLocationType('Client Location')
    setClientAddressMode('DEFAULT')
    setClientName((registration.fullName || '').trim())
    setClientAddress('')
    setCurrentStep(2)
    setShowAddressChoicePopup(false)
    setPendingSelectedRegistration(null)
  }

  const handleChooseCustomizeAddress = () => {
    const registration = pendingSelectedRegistration
    if (!registration) return
    setActiveRegistration(registration)
    setIsRegistrationComplete(true)
    setShowExistingRegistrations(false)
    setShowRegistrationRequiredPopup(false)
    setSelectedLocationType('Client Location')
    setClientAddressMode('CUSTOM')
    setCustomAddressFocusRequest((n) => n + 1)
    setBlinkCustomAddressInput(true)
    setClientName((registration.fullName || '').trim())
    setClientAddress('')
    setClientAddressSuggestions([])
    setShowClientSuggestions(false)
    setShowAddressChoicePopup(false)
    setPendingSelectedRegistration(null)
  }

  // Helper to create registration object from API response or form data
  const createRegistrationObject = (registrationData, apiResponse = null) => {
    return {
      id: apiResponse?.id || Date.now(),
      apiId: apiResponse?.id || null,
      apiResponse: apiResponse,
      ...registrationData,
      status: 'Active',
      dateOfRegistration: apiResponse?.registration_date 
        ? new Date(apiResponse.registration_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]
    }
  }

  // Check if user is authenticated
  const isAuthenticated = () => {
    const accessToken = localStorage.getItem('access_token')
    const authUser = localStorage.getItem('authUser')
    return !!(accessToken || authUser)
  }

  const handleDeleteRegistration = (registrationId) => {
    setRegistrationToDelete(registrationId)
  }

  const handleConfirmDelete = async () => {
    if (!registrationToDelete) return
    
    setIsDeletingRegistration(true)
    
    try {
      // Find the registration to get API ID
      const registrationToDeleteObj = existingRegistrations.find(reg => reg.id === registrationToDelete)
      const patientId = registrationToDeleteObj?.apiId || registrationToDeleteObj?.id
      
      // Delete from API if patient ID exists
      if (patientId && registrationToDeleteObj?.apiId) {
        try {
          await deletePatientFromAPI(patientId)
          
        } catch (apiError) {
          console.error('API delete error:', apiError)
          // Don't show confirm for server errors (already shown in modal)
          if (apiError.message === 'SERVER_ERROR') {
            setIsDeletingRegistration(false)
            return // Server error modal is shown, don't proceed
          }
          throw apiError // Re-throw to show error alert
        }
      } else {
        throw new Error('Patient ID not found. Cannot delete.')
      }
      
      // Update local state
      setRegistrationToDelete(null)
      if (activeRegistration?.id === registrationToDelete) {
        setActiveRegistration(null)
        setIsRegistrationComplete(false)
      }
      
      // Refresh the list from API
      await loadExistingRegistrations(true)
    } catch (error) {
      console.error('Error during deletion:', error)
      showAlert(`Error deleting registration: ${error.message || 'Please try again.'}`, 'error')
    } finally {
      setIsDeletingRegistration(false)
    }
  }

  const handleCancelDelete = () => {
    setRegistrationToDelete(null)
  }

  const handleCaregiverSelect = (caregiver) => {
    if (!isRegistrationComplete) {
      setShowRegistrationRequiredPopup(true)
      return
    }
    setSelectedCaregiver(caregiver)
  }

  const handleLocationTypeSelect = (locationType) => {
    setSelectedLocationType(locationType)
    setShowMoreFacilities(false) // Reset dropdown when changing location type
    if (locationType === 'Client Location') {
      setSelectedLocation('')
      setClientAddressMode('DEFAULT')
      setClientName((activeRegistration?.fullName || '').trim())
      setClientAddress('')
    }
  }

  const handleRemoveLocationSelection = () => {
    setSelectedLocationType('')
    setSelectedLocation('')
    setClientAddressMode('DEFAULT')
    setShowMoreFacilities(false)
  }

  const handleLocationSelect = (location) => {
    if (location && location.trim() !== '') {
      setSelectedLocation(location)
      setCurrentStep(3)
    }
  }

  const handleClientAddressSubmit = () => {
    if (hasClientLocationDetails) {
      setCurrentStep(3)
    }
  }

  const handlePartnersFormSubmit = () => {
    if (partnersAddress.trim() && partnersName.trim()) {
      setCurrentStep(3)
    }
  }

  const handlePackageSelect = (pkg) => {
    setSelectedPackage(pkg)
    setSelectedDate(null)
    setSelectedDates([])
    setHourlyTimeByDate({})
    setSelectedPeriodAnchors([])
    setCurrentStep(4)
  }

  const handlePackageRequestInputChange = (field, value) => {
    setPackageRequestForm((prev) => ({ ...prev, [field]: value }))
    if (packageRequestErrors[field]) {
      setPackageRequestErrors((prev) => ({ ...prev, [field]: '' }))
    }
  }

  const handlePackageRequestSubmit = async (e) => {
    e.preventDefault()
    const errors = {}
    const patientId = activeRegistration?.apiId ?? activeRegistration?.id
    const serviceId = selectedServiceOption?.id
    const fallbackPatientName = (clientName || activeRegistration?.fullName || '').trim()
    const fallbackAddress = (effectiveClientAddress || activeRegistration?.address || '').trim()
    const fallbackMobile = (activeRegistration?.phone || '').trim()
    if (!patientId) errors.patientName = 'Patient id is missing from selected patient'
    if (!serviceId) errors.serviceWanted = 'Service id is missing for selected service'
    if (!fallbackPatientName) errors.patientName = 'Patient name is missing from Step 1'
    if (!fallbackAddress) errors.address = 'Address is missing from Step 1'
    if (!fallbackMobile) errors.mobileNumber = 'Mobile number is missing from selected patient'
    if (!packageRequestForm.serviceWanted.trim()) errors.serviceWanted = 'Service is required'
    if (!packageRequestForm.durationStartDate) errors.durationStartDate = 'Start date is required'
    if (!packageRequestForm.durationEndDate) errors.durationEndDate = 'End date is required'
    if (
      packageRequestForm.durationStartDate &&
      packageRequestForm.durationEndDate &&
      packageRequestForm.durationEndDate < packageRequestForm.durationStartDate
    ) {
      errors.durationEndDate = 'End date should be on or after start date'
    }
    if (!packageRequestForm.description.trim()) errors.description = 'Description is required'
    setPackageRequestErrors(errors)
    if (Object.keys(errors).length > 0) return

    try {
      setIsSubmittingPackageRequest(true)
      await axios.post(`${import.meta.env.VITE_BASEURL_CARE}/booking/contact-bookings/`, {
        patient: Number(patientId),
        address: fallbackAddress,
        service: Number(serviceId),
        start_date: packageRequestForm.durationStartDate,
        end_date: packageRequestForm.durationEndDate,
        description: packageRequestForm.description.trim(),
      })
      setPackageRequestSubmitted(true)
      setPackageRequestErrors({})
    } catch (apiError) {
      const message =
        apiError?.response?.data?.message ||
        apiError?.response?.data?.detail ||
        'Failed to submit service request. Please try again.'
      setPackageRequestErrors((prev) => ({ ...prev, submit: String(message) }))
    } finally {
      setIsSubmittingPackageRequest(false)
    }
  }

  const closeNoPackageRequestModalAndGoHome = useCallback(() => {
    setShowNoPackageRequestModal(false)
    setPackageRequestSubmitted(false)
    setPackageRequestErrors({})
    navigate('/')
  }, [navigate])

  useEffect(() => {
    if (currentStep !== 3) {
      setShowNoPackageRequestModal(false)
      setPackageRequestSubmitted(false)
      setPackageRequestErrors({})
      return
    }
    if (isLoadingPackages || packagesError) {
      setShowNoPackageRequestModal(false)
      return
    }
    if (packageOptions.length === 0) {
      setShowNoPackageRequestModal(true)
    } else {
      setShowNoPackageRequestModal(false)
    }
  }, [currentStep, isLoadingPackages, packagesError, packageOptions.length])

  useEffect(() => {
    if (!showNoPackageRequestModal) return undefined
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [showNoPackageRequestModal])

  useEffect(() => {
    if (!showNoPackageRequestModal) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') closeNoPackageRequestModalAndGoHome()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showNoPackageRequestModal, closeNoPackageRequestModalAndGoHome])

  useEffect(() => {
    if (selectedLocationType === 'Client Location' && clientAddressMode === 'DEFAULT' && activeRegistration) {
      setClientName((activeRegistration.fullName || '').trim())
    }
  }, [selectedLocationType, clientAddressMode, activeRegistration])

  useEffect(() => {
    if (!blinkCustomAddressInput) return undefined
    const t = setTimeout(() => setBlinkCustomAddressInput(false), 1400)
    return () => clearTimeout(t)
  }, [blinkCustomAddressInput])

  useLayoutEffect(() => {
    if (clientAddressMode !== 'CUSTOM') return
    const el = customAddressInputRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    if (typeof el.select === 'function') el.select()
  }, [clientAddressMode, customAddressFocusRequest])

  // Auto-select client location once patient registration is completed.
  useEffect(() => {
    if (isRegistrationComplete && !selectedLocationType) {
      setSelectedLocationType('Client Location')
    }
  }, [isRegistrationComplete, selectedLocationType])


  const handleDateSelect = (date) => {
    if (!isDateAvailable(date)) return;

    const period = String(selectedPackage?.period || 'DAILY').toUpperCase()
    const selectedDateString = date.toDateString()

    if (period === 'MONTHLY') {
      const blockDates = getMonthlyBlockDateStrings(date)
      const blockedDateInRange = blockDates.find((d) => !isDateAvailable(new Date(d)))
      if (blockedDateInRange) {
        showAlert('This monthly range contains unavailable dates. Choose another start date/month.', 'warning')
        return
      }

      setSelectedDates((prev) => {
        const hasClickedDate = prev.includes(selectedDateString)
        if (hasClickedDate) {
          return prev.filter((d) => !blockDates.includes(d))
        }
        return [...new Set([...prev, ...blockDates])]
      })
      setSelectedPeriodAnchors((prev) => {
        const hasAnchor = prev.includes(selectedDateString)
        return hasAnchor
          ? prev.filter((d) => d !== selectedDateString)
          : [...prev, selectedDateString]
      })
      setSelectedDate(date)
      return
    }

    if (period === 'WEEKLY') {
      const blockDates = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(date)
        d.setDate(date.getDate() + i)
        if (isDateAvailable(d)) {
          blockDates.push(d.toDateString())
        }
      }

      setSelectedDates((prev) => {
        const hasClickedDate = prev.includes(selectedDateString)
        if (hasClickedDate) {
          return prev.filter((d) => !blockDates.includes(d))
        }
        return [...new Set([...prev, ...blockDates])]
      })
      setSelectedPeriodAnchors((prev) => {
        const hasAnchor = prev.includes(selectedDateString)
        return hasAnchor
          ? prev.filter((d) => d !== selectedDateString)
          : [...prev, selectedDateString]
      })
      setSelectedDate(date)
      return
    }

    if (period === 'HOURLY') {
      const removing = selectedDates.includes(selectedDateString)
      if (removing) {
        setSelectedDates((prev) => prev.filter((d) => d !== selectedDateString))
        setHourlyTimeByDate((h) => {
          const next = { ...h }
          delete next[selectedDateString]
          return next
        })
      } else {
        setSelectedDates((prev) => [...prev, selectedDateString])
        setHourlyTimeByDate((h) => ({
          ...h,
          [selectedDateString]: h[selectedDateString] || { start: '09:00', end: '11:00' },
        }))
      }
      setSelectedPeriodAnchors([])
      setSelectedDate(date)
      return
    }

    // DAILY/other periods: pick individual dates.
    setSelectedDates((prev) =>
      prev.includes(selectedDateString)
        ? prev.filter((d) => d !== selectedDateString)
        : [...prev, selectedDateString]
    )
    setSelectedPeriodAnchors([])
    setSelectedDate(date);
  }

  const isDateSelected = (date) => {
    return selectedDates.includes(date.toDateString())
  }

  // Format selected dates to show start, end, and optionally some in between
  const formatSelectedDates = () => {
    if (selectedDates.length === 0) return null
    
    // Sort dates chronologically
    const sortedDates = [...selectedDates].sort((a, b) => {
      return new Date(a) - new Date(b)
    })
    
    if (sortedDates.length === 1) {
      return {
        start: new Date(sortedDates[0]).toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        }),
        end: null,
        middle: [],
        total: 1
      }
    }
    
    const startDate = new Date(sortedDates[0])
    const endDate = new Date(sortedDates[sortedDates.length - 1])
    
    // If dates are consecutive or very few, show all
    if (sortedDates.length <= 5) {
      return {
        start: startDate.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        }),
        end: endDate.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        }),
        middle: sortedDates.slice(1, -1).map(dateStr => 
          new Date(dateStr).toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
          })
        ),
        total: sortedDates.length
      }
    }
    
    // For many dates, show start, a few middle ones, and end
    const middleDates = sortedDates.slice(1, Math.min(4, sortedDates.length - 1))
    
    return {
      start: startDate.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      }),
      end: endDate.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      }),
      middle: middleDates.map(dateStr => 
        new Date(dateStr).toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        })
      ),
      total: sortedDates.length
    }
  }

  const getDateAvailability = (date) => {
    if (!selectedCaregiver) return null
    // Mock availability data - you can replace this with real data
    const availability = {
      'Skilled Male Nurse': Math.floor(Math.random() * 5) + 3,
      'Skilled Female Nurse': Math.floor(Math.random() * 4) + 2,
      'Semi Skilled Male Care Taker': Math.floor(Math.random() * 6) + 4,
      'Semi Skilled Female Care Taker': Math.floor(Math.random() * 5) + 3
    }
    return availability[selectedCaregiver] || 0
  }

  // Total based on package period:
  // - DAILY / HOURLY: price × number of selected dates (each date is one billed unit)
  // - WEEKLY/MONTHLY: price × number of selected blocks
  const calculateTotalAmount = () => {
    if (!selectedPackage) return 0
    const packagePriceValue = toNum(selectedPackage.priceValue ?? selectedPackage.price)
    const period = String(selectedPackage?.period || 'DAILY').toUpperCase()
    const numberOfDates = selectedDates.length
    if (numberOfDates === 0) return 0
    if (period === 'MONTHLY' || period === 'WEEKLY') {
      const blocks = selectedPeriodAnchors.length > 0 ? selectedPeriodAnchors.length : 1
      return packagePriceValue * blocks
    }
    return packagePriceValue * numberOfDates
  }

  // Format amount with currency
  const formatAmount = (amount) => {
    return `₹${amount.toLocaleString('en-IN')}`
  }

  // Calculate final amount after discount/premium adjustments
  const calculateFinalAmount = () => {
    const total = calculateTotalAmount()
    const discount = discountAmount || 0
    const premium = premiumAmount || 0
    const final = Math.max(0, total - discount + premium)
    return final
  }

  const getPaymentBreakdownLabel = () => {
    if (!selectedPackage || selectedDates.length === 0) return ''
    const finalAmount = calculateFinalAmount()
    const packagePeriod = getPackagePeriod()
    const numberOfDates = selectedDates.length

    if (packagePeriod === 'MONTHLY') {
      const numberOfMonths = selectedPeriodAnchors.length > 0 ? selectedPeriodAnchors.length : 1
      const unitAmount = numberOfMonths > 0 ? finalAmount / numberOfMonths : finalAmount
      return `${numberOfMonths} month${numberOfMonths > 1 ? 's' : ''} (${numberOfDates} days) × ${formatAmount(unitAmount)}`
    }

    if (packagePeriod === 'WEEKLY') {
      const numberOfWeeks = selectedPeriodAnchors.length > 0 ? selectedPeriodAnchors.length : 1
      const unitAmount = numberOfWeeks > 0 ? finalAmount / numberOfWeeks : finalAmount
      return `${numberOfWeeks} week${numberOfWeeks > 1 ? 's' : ''} (${numberOfDates} days) × ${formatAmount(unitAmount)}`
    }

    if (packagePeriod === 'SESSION') {
      const unitAmount = numberOfDates > 0 ? finalAmount / numberOfDates : finalAmount
      return `${numberOfDates} session(s) × ${formatAmount(unitAmount)}`
    }

    const unitAmount = numberOfDates > 0 ? finalAmount / numberOfDates : finalAmount
    const unit = packagePeriod === 'HOURLY' ? 'hour(s)' : 'day(s)'
    return `${numberOfDates} ${unit} × ${formatAmount(unitAmount)}`
  }

  // Calculate minimum payment (removed 10% requirement)
  const calculateMinimumPayment = () => {
    return 0 // No minimum payment required
  }

  const handleRegFullToggle = (checked) => {
    if (!checked) {
      setIsRegFull(false)
      return
    }
    setIsRegFull(true)
    setIsRegSplit(false)
    setInstallment1(0)
    setInstallment2(0)
    setIsRegUpfront(false)
    setUpfrontChoice(null)
  }

  const handleRegSplitToggle = (checked) => {
    if (!checked) {
      setIsRegSplit(false)
      setInstallment1(0)
      setInstallment2(0)
      return
    }
    setIsRegSplit(true)
    setIsRegFull(false)
    setIsRegUpfront(false)
    setUpfrontChoice(null)
  }

  const handleRegUpfrontToggle = (checked) => {
    if (!checked) {
      setIsRegUpfront(false)
      setUpfrontChoice(null)
      return
    }
    setIsRegUpfront(true)
    setIsRegFull(false)
    setIsRegSplit(false)
    setInstallment1(0)
    setInstallment2(0)
    setUpfrontChoice(null)
  }

  // Update payment amount when adjustments or total change on review step
  useEffect(() => {
    if (currentStep === 5) {
      const total = calculateTotalAmount()
      if (total > 0) {
        const final = calculateFinalAmount()
        // Keep amount-to-pay aligned with current final amount.
        setPaymentAmount(final)
      } else {
        setPaymentAmount(0)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, discountAmount, premiumAmount, selectedPackage, selectedDates, selectedPeriodAnchors])

  // Keep review/payment section visible right after date selection.
  useEffect(() => {
    if (currentStep === 5 && selectedDates.length > 0 && isHourlySelectionComplete && reviewSectionRef.current) {
      reviewSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [currentStep, selectedDates, isHourlySelectionComplete])

  const isUpfrontPaymentSelected = useCallback(() => {
    if (isCustomerUser) return true
    return canChooseAdvancePaymentTiming && advancePaymentTiming === 'upfront'
  }, [isCustomerUser, canChooseAdvancePaymentTiming, advancePaymentTiming])

  /** Booking POST response `id` is sent as `primary_order_id` on upfront payment. */
  const resolvePrimaryOrderId = (booking) => {
    if (!booking || typeof booking !== 'object') return null
    const id = booking.id
    if (id == null || id === '') return null
    const parsed = Number(id)
    return Number.isFinite(parsed) ? parsed : null
  }

  const navigateAfterBookingSuccess = useCallback(() => {
    if (bookingReturnToRef.current) {
      const target = bookingReturnToRef.current
      bookingReturnToRef.current = null
      navigate(target)
      return
    }
    if (isVsreOwner) {
      navigate('/dashboard?section=lobby')
    } else {
      navigate('/')
    }
  }, [isVsreOwner, navigate])

  const handleCloseUpfrontPaymentModal = useCallback(() => {
    if (isSubmittingUpfrontPayment) return
    setShowUpfrontPaymentModal(false)
    setUpfrontPaymentOrderId(null)
    setUpfrontPaymentError('')
    lobbyNavigateAfterAlertRef.current = true
    showAlert('upfront payment is not paid', 'error')
  }, [isSubmittingUpfrontPayment, showAlert])

  const handleSubmitUpfrontPayment = async () => {
    if (!upfrontPaymentOrderId) {
      setUpfrontPaymentError('Order ID missing. Cannot record upfront payment.')
      return
    }

    const amount = Number.parseFloat(upfrontPaymentForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setUpfrontPaymentError('Please enter a valid payment amount greater than zero.')
      return
    }

    if (!upfrontPaymentForm.paidDate) {
      setUpfrontPaymentError('Please select paid date.')
      return
    }

    const accessToken = localStorage.getItem('access_token')
    if (!accessToken) {
      setUpfrontPaymentError('Authorization token missing. Please log in again.')
      return
    }

    setIsSubmittingUpfrontPayment(true)
    setUpfrontPaymentError('')
    try {
      await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/payments/upfront-payment/`,
        {
          primary_order_id: Number(upfrontPaymentOrderId),
          amount: amount.toFixed(2),
          method: upfrontPaymentForm.method,
          reference: String(upfrontPaymentForm.reference || 'upfront-payment').trim() || 'upfront-payment',
          paid_date: upfrontPaymentForm.paidDate,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )
      setShowUpfrontPaymentModal(false)
      setUpfrontPaymentOrderId(null)
      showAlert('Booking and upfront payment recorded successfully.', 'success')
      navigateAfterBookingSuccess()
    } catch (err) {
      const msg =
        err.response?.data?.message ??
        err.response?.data?.detail ??
        err.message ??
        'Failed to record upfront payment. Please try again.'
      setUpfrontPaymentError(typeof msg === 'string' ? msg : 'Failed to record upfront payment. Please try again.')
    } finally {
      setIsSubmittingUpfrontPayment(false)
    }
  }

  const handlePayment = async () => {
    const finalAmount = calculateFinalAmount()
    const amountToPay = paymentAmount > 0 ? paymentAmount : finalAmount

    const patientId = activeRegistration?.apiId || activeRegistration?.id
    const serviceId = selectedServiceOption?.id
    const packageId = selectedPackage?.id

    if (!patientId) {
      showAlert('Patient is required for booking.', 'warning')
      return
    }
    if (!serviceId) {
      showAlert('Please select a service before booking.', 'warning')
      return
    }
    if (!packageId) {
      showAlert('Please select a package before booking.', 'warning')
      return
    }
    if (selectedDates.length === 0) {
      showAlert('Please select at least one date before booking.', 'warning')
      return
    }

    const accessToken = localStorage.getItem('access_token')
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error')
      return
    }

    const formatBookingDate = (value) => {
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return null
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }

    const formattedDates = selectedDates
      .map(formatBookingDate)
      .filter(Boolean)
      .sort()

    if (formattedDates.length === 0) {
      showAlert('Invalid booking dates selected.', 'warning')
      return
    }

    const selectedPackagePeriod = String(selectedPackage?.period || 'DAILY').toUpperCase()
    const isDailyPeriod = selectedPackagePeriod === 'DAILY'
    const isHourlyPeriod = selectedPackagePeriod === 'HOURLY'
    const isMonthlyOrWeeklyPeriod = selectedPackagePeriod === 'MONTHLY' || selectedPackagePeriod === 'WEEKLY'
    const nonDailyDatesPayload = formattedDates.reduce((acc, dateKey) => {
      // For non-daily periods API expects dates as object: { "YYYY-MM-DD": ["HH:mm:ss", "HH:mm:ss"] }
      acc[dateKey] = ['00:00:00', '23:59:59']
      return acc
    }, {})

    const toHHMMSS = (hm) => {
      if (!hm || typeof hm !== 'string') return null
      const t = hm.trim()
      if (t.length === 5) return `${t}:00`
      if (t.length >= 8) return t.slice(0, 8)
      return `${t}:00`
    }

    let payload

    if (isMonthlyOrWeeklyPeriod) {
      const startDate = formattedDates[0]
      const endDate = formattedDates[formattedDates.length - 1]
      payload = {
        patient: Number(patientId),
        service: Number(serviceId),
        package: Number(packageId),
        client_address: effectiveClientAddress,
        auto_continue: autoContinue,
        discount_amount: Number(discountAmount || 0),
        premium_amount: Number(premiumAmount || 0),
        start_datetime: `${startDate}T00:00:00+05:30`,
        end_datetime: `${endDate}T23:59:59+05:30`,
      }
    } else if (isHourlyPeriod) {
      const hourlyDatesObject = {}
      for (const ds of selectedDates) {
        const ymd = formatBookingDate(ds)
        const slot = hourlyTimeByDate[ds]
        if (!ymd || !slot?.start || !slot?.end || slot.start >= slot.end) {
          showAlert('Please set a valid start and end time for each selected date.', 'warning')
          return
        }
        const a = toHHMMSS(slot.start)
        const b = toHHMMSS(slot.end)
        if (!a || !b) {
          showAlert('Invalid time selection for hourly booking.', 'warning')
          return
        }
        hourlyDatesObject[ymd] = [a, b]
      }
      if (Object.keys(hourlyDatesObject).length === 0) {
        showAlert('Please select at least one date with times for hourly booking.', 'warning')
        return
      }
      payload = {
        patient: Number(patientId),
        service: Number(serviceId),
        package: Number(packageId),
        client_address: effectiveClientAddress,
        auto_continue: autoContinue,
        discount_amount: Number(discountAmount || 0),
        premium_amount: Number(premiumAmount || 0),
        raw_dates: hourlyDatesObject,
      }
    } else {
      payload = {
        patient: Number(patientId),
        service: Number(serviceId),
        package: Number(packageId),
        client_address: effectiveClientAddress,
        auto_continue: autoContinue,
        discount_amount: Number(discountAmount || 0),
        premium_amount: Number(premiumAmount || 0),
        raw_dates: isDailyPeriod ? formattedDates : nonDailyDatesPayload,
      }
    }

    setIsLoadingAPI(true)
    setLoadingMessage('Creating booking...')
    let createdBooking = null
    let response = null
    try {
      response = await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/bookings/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )
      createdBooking = response.data
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.detail ||
        error.message ||
        'Failed to create booking. Please try again.'
      showAlert(errorMessage, 'error')
      setIsLoadingAPI(false)
      setLoadingMessage('')
      return
    }

    setIsLoadingAPI(false)
    setLoadingMessage('')

    const successMessage =
      response?.data?.message ?? createdBooking?.message ?? 'Booking created successfully.'

    if (isUpfrontPaymentSelected()) {
      const primaryOrderId = resolvePrimaryOrderId(createdBooking)
      if (!primaryOrderId) {
        showAlert(
          `${successMessage} However, order ID was missing — please record upfront payment from the dashboard.`,
          'warning'
        )
        navigateAfterBookingSuccess()
        return
      }

      setUpfrontPaymentOrderId(primaryOrderId)
      setUpfrontPaymentForm({
        amount: String(amountToPay > 0 ? amountToPay : finalAmount),
        method: 'CASH',
        reference: 'upfront-payment',
        paidDate: todayDateStr,
      })
      setUpfrontPaymentError('')
      setShowUpfrontPaymentModal(true)
      return
    }

    showAlert(successMessage, 'success')
    navigateAfterBookingSuccess()
  }

  const handleStepClick = (stepNumber) => {
    if (stepNumber === 1 && !isRegistrationComplete) {
      setShowRegistrationRequiredPopup(true)
      return
    }
    if (stepNumber === 1) {
      setCurrentStep(1)
      return
    }
    if (stepNumber === 2 && isStepAccessible(2)) {
      setCurrentStep(2)
      return
    }
    if (stepNumber === 3 && isStepAccessible(3)) {
      if (currentStep >= 4) {
        setSelectedDates([])
        setSelectedDate(null)
        setHourlyTimeByDate({})
        setSelectedPeriodAnchors([])
      }
      setCurrentStep(3)
      return
    }
    if (stepNumber === 4 && isStepAccessible(4)) {
      setCurrentStep(4)
      return
    }
    if (stepNumber === 5 && isStepAccessible(5)) {
      setCurrentStep(5)
    }
  }

  const isStepAccessible = (stepNumber) => {
    if (stepNumber === 1) return isRegistrationComplete
    if (stepNumber === 2) {
      if (!selectedLocationType) return false
      if (selectedLocationType === 'Client Location') return hasClientLocationDetails
      return true
    }
    if (stepNumber === 3) {
      return isStepAccessible(2) && !!selectedServiceOption
    }
    if (stepNumber === 4) {
      return isStepAccessible(3) && !!selectedPackage
    }
    if (stepNumber === 5) {
      return isStepAccessible(4) && selectedDates.length > 0 && isHourlySelectionComplete
    }
    return false
  }

  const handleGoBack = () => {
    if (currentStep <= 1) return
    if (currentStep === 5) {
      setCurrentStep(4)
      return
    }
    if (currentStep === 4) {
      setSelectedDates([])
      setSelectedDate(null)
      setHourlyTimeByDate({})
      setSelectedPeriodAnchors([])
      setCurrentStep(3)
      return
    }
    setCurrentStep((p) => Math.max(1, p - 1))
  }

  const handleResetAll = () => {
    setSelectedCaregiver('')
    setSelectedServiceOption(null)
    setSelectedLocation('')
    setSelectedLocationType('')
    setClientAddressMode('DEFAULT')
    setClientAddress('')
    setClientName('')
    setSelectedPackage('')
    setSelectedDate(null)
    setSelectedDates([])
    setHourlyTimeByDate({})
    setSelectedPeriodAnchors([])
    setHoveredDate(null)
    setCurrentStep(1)
    setCurrentMonth(new Date())
    setShowResetConfirm(false)
    setShowMoreFacilities(false)
    setDiscountAmount(0)
    setPremiumAmount(0)
    setPaymentAmount(0)
    setAdvancePaymentTiming('upfront')
    setShowUpfrontPaymentModal(false)
    setUpfrontPaymentOrderId(null)
    setUpfrontPaymentError('')
    setIsSubmittingUpfrontPayment(false)
    setIsRegFull(false)
    setIsRegSplit(false)
    setInstallment1(0)
    setInstallment2(0)
    setIsRegUpfront(false)
    setUpfrontChoice(null)
  }

  const handleResetConfirm = () => {
    setShowResetConfirm(true)
  }

  const handleResetCancel = () => {
    setShowResetConfirm(false)
  }

  const navigateMonth = (direction) => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev)
      newMonth.setMonth(prev.getMonth() + direction)
      return newMonth
    })
  }

  const handleBookNow = () => {
    if (currentStep === 1) {
      if (!selectedLocationType) {
        showAlert('Please select a location before proceeding.', 'warning')
        return
      }
      if (selectedLocationType === 'Client Location' && !hasClientLocationDetails) {
        showAlert('Please fill in client location details before proceeding.', 'warning')
        return
      }
      setCurrentStep(2)
      return
    }
    if (currentStep === 2) {
      if (!selectedServiceOption) {
        showAlert('Please select a service before proceeding.', 'warning')
        return
      }
      setCurrentStep(3)
      return
    }
    if (currentStep === 3) {
      if (!selectedPackage) {
        showAlert('Please select a package before proceeding.', 'warning')
        return
      }
      setCurrentStep(4)
      return
    }
    if (currentStep === 4) {
      if (selectedDates.length === 0) {
        showAlert('Please select at least one date before final booking.', 'warning')
        return
      }
      if (!isHourlySelectionComplete) {
        showAlert('For hourly packages, set start and end time for each selected date (start must be before end).', 'warning')
        return
      }
      setCurrentStep(5)
      return
    }
    if (currentStep === 5) {
      handlePayment()
    }
  }

  const patientsSearchTrimmed = patientsSearchInput.trim()
  const patientsListMatchesInput =
    !patientsSearchTrimmed || patientsSearchTrimmed === patientsActiveSearch
  const visibleRegistrations = patientsListMatchesInput ? existingRegistrations : []

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      {/* <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link 
              to="/" 
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div> */}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-3 sm:space-y-4">
            {/* Senior Care Registration Button */}
            <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 mb-1">Patient Care Registration</h3>
                  <p className="text-sm text-gray-600"> 
                    {isRegistrationComplete 
                      ? 'Registration completed ✓' 
                      : 'Please complete your registration to proceed with booking'}
                  </p>
                  {activeRegistration && (
                    <p className="text-xs text-green-700 mt-1">
                      Using registration for <span className="font-semibold">{activeRegistration.fullName}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={handleOpenExistingRegistrations}
                    disabled={isLoadingRegistrations}
                    className={`px-3 sm:px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200 ${
                      isLoadingRegistrations ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isLoadingRegistrations ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="hidden sm:inline">Loading...</span>
                        <span className="sm:hidden">Loading...</span>
                      </>
                    ) : (
                      <>
                        <FiUsers className="w-4 h-4" />
                        <span className="hidden sm:inline">View Existing</span>
                        <span className="sm:hidden">View</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleOpenRegistrationModal()}
                    className={`px-3 sm:px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                      isRegistrationComplete
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : `${colorClasses.button} text-white hover:opacity-90`
                    }`}
                  >
                    <FiEdit2 className="w-4 h-4" />
                     Register new patient
                  </button>
                </div>
              </div>
              {activeRegistration && !activeRegistration.is_registration_fees_paid ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="text-xs sm:text-sm text-amber-800 leading-relaxed">
                    Registration fee of Rs 5,000 is charged at the time of booking. This is a one-time non-refundable fee.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Step-by-Step Selection Process */}
            <div className="bg-white rounded-xl shadow-sm">
              {/* Progress Steps */}
              <div className="border-b border-gray-200 p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center justify-between flex-1">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <div key={step} className="flex items-center">
                        <button
                          onClick={() => handleStepClick(step)}
                          disabled={!isStepAccessible(step)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 ${
                            currentStep >= step 
                              ? `${colorClasses.button} text-white hover:opacity-90` 
                              : isStepAccessible(step)
                              ? 'bg-gray-300 text-gray-700 hover:bg-gray-400 cursor-pointer'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                          title={
                            !isStepAccessible(step) 
                              ? 'Complete previous steps first' 
                              : `Go to Step ${step}`
                          }
                        >
                          {step}
                        </button>
                        {step < 5 && (
                          <div className={`w-12 h-1 mx-2 ${
                            currentStep > step ? colorClasses.bg : 'bg-gray-200'
                          }`}></div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {/* Reset Button */}
                  {(selectedCaregiver || selectedLocationType || selectedPackage || selectedDate) && (
                    <button
                      onClick={handleResetConfirm}
                      className="ml-4 px-3 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <FiXCircle className="w-4 h-4" />
                      Reset All
                    </button>
                  )}
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-600">
                  <span>Location</span>
                  <span>Service</span>
                  <span>Package</span>
                  <span>Date</span>
                  <span>Review</span>
                </div>
              </div>

              <div className="p-3 sm:p-4">
                {/* Step 2: Service */}
                {currentStep === 1 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">Step 1: Select Location</h3>
                      <button
                        onClick={handleGoBack}
                        disabled={currentStep === 1}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        ← Back
                      </button>
                    </div>
                    {!isRegistrationComplete ? (
                      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                      
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            type="button"
                            onClick={handleOpenExistingRegistrations}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-yellow-300 bg-white text-yellow-900 hover:bg-yellow-100 transition-colors text-sm font-medium"
                          >
                            <FiUsers className="w-4 h-4" />
                            Click here if you're an existing patient
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenRegistrationModal()}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-teal-600 bg-teal-600 text-white hover:opacity-90 transition-colors text-sm font-medium"
                          >
                            <FiEdit2 className="w-4 h-4" />
                            Register new patient
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {selectedLocationType === 'Client Location' && (
                      <div className="space-y-2 border border-gray-200 rounded-lg p-2.5 bg-gray-50">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Client Name</label>
                          <input
                            type="text"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            placeholder="Enter client name..."
                            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Address Type</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setClientAddressMode('DEFAULT')}
                              className={`p-1.5 rounded-lg border text-sm text-left ${
                                clientAddressMode === 'DEFAULT'
                                  ? 'border-teal-500 bg-teal-50 text-teal-700'
                                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              Default Address
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setClientAddressMode('CUSTOM')
                                setClientAddress('')
                                setClientAddressSuggestions([])
                                setShowClientSuggestions(false)
                                setBlinkCustomAddressInput(true)
                                setCustomAddressFocusRequest((n) => n + 1)
                              }}
                              className={`p-1.5 rounded-lg border text-sm text-left ${
                                clientAddressMode === 'CUSTOM'
                                  ? 'border-teal-500 bg-teal-50 text-teal-700'
                                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              Customize Address
                            </button>
                          </div>
                        </div>
                        {clientAddressMode === 'DEFAULT' ? (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Default Address (from selected patient)</label>
                            <textarea
                              value={defaultClientAddress}
                              readOnly
                              rows={2}
                              className="w-full p-2.5 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                            />
                            {!defaultClientAddress && (
                              <p className="text-xs text-amber-700 mt-1">
                                Selected patient does not have a saved address. Please choose Customize Address.
                              </p>
                            )}
                          </div>
                        ) : (
                        <div className="relative">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Custom Address</label>
                          <input
                            ref={customAddressInputRef}
                            type="text"
                            value={clientAddress}
                            onChange={(e) => handleClientAddressSearch(e.target.value)}
                            placeholder="Enter custom address..."
                            className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                              blinkCustomAddressInput ? 'animate-pulse border-teal-500 ring-2 ring-teal-300' : 'border-gray-300'
                            }`}
                          />
                        </div>
                        )}
                      </div>
                    )}

                    {/* About and Reviews Section */}
                    <div className="bg-white rounded-xl shadow-sm p-3 sm:p-4 mt-3">
                      {/* Tab Navigation */}
                      <div className="flex space-x-4 mb-3 border-b border-gray-200">
                        <button
                          onClick={() => setActiveTab('about')}
                          className={`pb-3 text-sm sm:text-base font-medium transition-colors ${
                            activeTab === 'about'
                              ? 'text-blue-600 border-b-2 border-blue-600'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          About
                        </button>
                        <button
                          onClick={() => setActiveTab('reviews')}
                          className={`pb-3 text-sm sm:text-base font-medium transition-colors ${
                            activeTab === 'reviews'
                              ? 'text-blue-600 border-b-2 border-blue-600'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          Reviews
                        </button>
                      </div>

                      {/* Tab Content */}
                      {activeTab === 'about' && (
                        <div>
                          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">About {serviceData.name}</h3>
                          <p className="text-sm text-gray-600 leading-relaxed mb-3">{serviceData.description}</p>
                          
                          <div className="mb-3">
                            <h4 className="text-sm font-semibold text-gray-900 mb-2">Services Offered</h4>
                            <div className="flex flex-wrap gap-2">
                              {serviceData.services.map((serviceItem, index) => (
                                <span key={index} className="px-2 sm:px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs sm:text-sm">
                                  {serviceItem}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div>
                            <h4 className="text-sm sm:text-md font-semibold text-gray-900 mb-3">Care Features</h4>
                            <div className="space-y-2">
                              {[
                                'Professional medical care and monitoring',
                                'Personal hygiene and grooming assistance',
                                'Medication management and reminders',
                                'Meal planning and preparation',
                                'Physical therapy and mobility assistance',
                                'Companionship and emotional support'
                              ].map((item, index) => (
                                <div key={index} className="flex items-center gap-2 text-gray-600">
                                  <div className={`w-2 h-2 rounded-full ${colorClasses.bg}`}></div>
                                  <span className="text-sm sm:text-base">{item}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {activeTab === 'reviews' && (
                        <div>
                          <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">Customer Reviews</h3>
                          <div className="space-y-4">
                            {serviceData.reviews.map((review, index) => (
                              <div key={index} className="border-b border-gray-200 pb-4 last:border-b-0">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 gap-2">
                                  <h4 className="font-semibold text-gray-900 text-sm sm:text-base">{review.name}</h4>
                                  <div className="flex items-center gap-1">
                                    {[...Array(5)].map((_, i) => (
                                      <FiStar 
                                        key={i} 
                                        className={`w-3 h-3 sm:w-4 sm:h-4 ${
                                          i < review.rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
                                        }`} 
                                      />
                                    ))}
                                  </div>
                                </div>
                                <p className="text-gray-600 text-sm sm:text-base">{review.comment}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 2: Service Selection */}
                {currentStep === 2 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">Step 2: Service</h3>
                      <button
                        onClick={handleGoBack}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 flex items-center gap-2"
                      >
                        ← Back
                      </button>
                    </div>
                    
                    <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                      {isLoadingServiceDropdown ? (
                        <p className="text-sm text-gray-600">Loading services...</p>
                      ) : serviceDropdownError ? (
                        <p className="text-sm text-red-600">{serviceDropdownError}</p>
                      ) : serviceDropdownOptions.length === 0 ? (
                        <p className="text-sm text-gray-600">No services available.</p>
                      ) : (
                        <div className="space-y-2">
                          {serviceDropdownOptions.map((svc) => {
                            const isSelected = selectedServiceOption?.id === svc.id
                            return (
                              <button
                                key={svc.id}
                                type="button"
                                onClick={() => {
                                  setSelectedServiceOption(svc)
                                  setSelectedCaregiver(svc.name || '')
                                  setSelectedPackage('')
                                  setSelectedDates([])
                                  setSelectedDate(null)
                                  setSelectedPeriodAnchors([])
                                  setHourlyTimeByDate({})
                                  setPackageRequestSubmitted(false)
                                  setPackageRequestErrors({})
                                  setPackageRequestForm({
                                    serviceWanted: svc.name || '',
                                    durationStartDate: '',
                                    durationEndDate: '',
                                    durationStart: '',
                                    durationEnd: '',
                                    description: '',
                                  })
                                  setCurrentStep(3)
                                }}
                                className={`w-full text-left rounded-lg border p-2.5 transition-all ${
                                  isSelected
                                    ? 'border-teal-500 bg-teal-50'
                                    : 'border-gray-200 bg-white hover:border-gray-300'
                                }`}
                              >
                                <div className="font-medium text-gray-900">{svc.name}</div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}


                {/* Step 3: Package Selection */}
                {currentStep === 3 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-gray-900">
                        {(!isLoadingPackages && !packagesError && packageOptions.length === 0)
                          ? 'Step 3: No packages for this service'
                          : 'Step 3: Select Package'}
                      </h3>
                      <button
                        onClick={handleGoBack}
                        className="px-3 py-1.5 text-gray-600 hover:text-gray-800 flex items-center gap-2 text-sm"
                      >
                        ← Back
                      </button>
                    </div>
                    <div className="space-y-2">
                      {isLoadingPackages ? (
                        <div className="rounded-lg border border-gray-200 p-3 bg-gray-50 text-sm text-gray-600">Loading packages...</div>
                      ) : packagesError ? (
                        <div className="rounded-lg border border-red-200 p-3 bg-red-50 text-sm text-red-600">{packagesError}</div>
                      ) : packageOptions.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-teal-200 bg-teal-50/70 p-4 text-sm text-gray-700 space-y-2">
                          <p className="font-medium text-gray-900">A request dialog opens automatically</p>
                          <p>
                            Complete the form in the popup on your screen. After you submit, you can return to the home page from there. Use <span className="font-medium text-gray-800">← Back</span> if you prefer to choose a different service.
                          </p>
                        </div>
                      ) : (
                        packageOptions.map((pkg) => {
                          const registrationFee = Number(pkg.registration_fees ?? pkg.registration_fee) || 0
                          return (
                            <button
                              key={pkg.id}
                              type="button"
                              onClick={() => handlePackageSelect(pkg)}
                              className={`w-full p-2.5 rounded-lg border-2 transition-all text-left ${
                                selectedPackage?.id === pkg.id
                                  ? `${colorClasses.border} bg-teal-50 border-teal-500`
                                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={`w-4 h-4 rounded-full border-2 ${
                                    selectedPackage?.id === pkg.id
                                      ? 'border-teal-500 bg-teal-500'
                                      : 'border-gray-300'
                                  }`}>
                                    {selectedPackage?.id === pkg.id && (
                                      <div className="w-full h-full rounded-full bg-white scale-50"></div>
                                    )}
                                  </div>
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="font-medium text-gray-900 text-sm">{pkg.name}</h4>
                                      <span className="text-[10px] font-medium uppercase tracking-wide text-teal-800 bg-teal-100 px-1.5 py-0.5 rounded">
                                        {periodBadgeLabel(pkg.period)}
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-0.5">{pkg.description || 'Package details available'}</p>
                                    <p className="text-xs text-gray-700 mt-1">
                                      Registration Fee: ₹{registrationFee.toLocaleString('en-IN')}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg font-bold text-gray-900">
                                    {pkg.priceLabel}
                                  </span>
                                </div>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Step 4: Date Selection */}
                {currentStep === 4 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">
                          Step 4: Select Date(s)
                        </h3>
                        {isHourlyPackage && (
                          <p className="text-xs text-gray-500 mt-1">
                            This package is hourly — pick each date, then set start and end time for that day.
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleGoBack}
                          className="px-3 py-1.5 text-gray-600 hover:text-gray-800 flex items-center gap-2 text-sm"
                        >
                          ← Back
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrentStep(5)}
                          disabled={selectedDates.length === 0 || !isHourlySelectionComplete}
                          className="px-3 py-1.5 text-gray-700 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 rounded-lg p-3">
                      {(isLoadingServiceAvailability || serviceAvailabilityError) && (
                        <div
                          className={`mb-2 rounded-md border px-2 py-1.5 text-xs ${
                            serviceAvailabilityError
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-slate-100 text-slate-600'
                          }`}
                        >
                          {serviceAvailabilityError || 'Loading monthly booking availability...'}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mb-4">
                        <h4 className="text-lg font-semibold text-gray-900">
                          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </h4>
                        <div className="flex gap-1">
                          <button
                            onClick={() => navigateMonth(-1)}
                            className="p-2 rounded-lg text-black bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                          >
                            ←
                          </button>
                          <button
                            onClick={() => navigateMonth(1)}
                            className="p-2 rounded-lg text-black bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                          >
                            →
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                          <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
                            {day}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-7 gap-1">
                        {(() => {
                          const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentMonth)
                          const days = []
                          
                          for (let i = 0; i < startingDayOfWeek; i++) {
                            days.push(<div key={`empty-${i}`} className="p-2"></div>)
                          }
                          
                          for (let day = 1; day <= daysInMonth; day++) {
                            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
                            const dayAvailability = availabilityByDate.get(dateToYmd(date))
                            const bookingsForDay = Array.isArray(dayAvailability?.bookings) ? dayAvailability.bookings : []
                            const isAvailable = isDateAvailable(date)
                            const isSelected = isDateSelected(date)
                            const isToday = date.toDateString() === new Date().toDateString()
                            
                            days.push(
                              <div
                                key={day}
                                className="relative"
                                onMouseEnter={() => setHoveredDate(date)}
                                onMouseLeave={() => setHoveredDate(null)}
                              >
                                <button
                                  onClick={() => handleDateSelect(date)}
                                  disabled={!isAvailable}
                                  className={`p-2 text-sm rounded-lg transition-all w-full ${
                                    isSelected
                                      ? `${colorClasses.button} text-white`
                                      : isAvailable
                                      ? 'bg-white hover:bg-gray-100 text-gray-900 border border-gray-200'
                                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  } ${isToday ? 'ring-2 ring-teal-300' : ''}`}
                                >
                                  {day}
                                </button>
                                
                                {/* Availability Tooltip */}
                                {hoveredDate && hoveredDate.toDateString() === date.toDateString() && selectedCaregiver && isAvailable && (
                                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                    <div className="flex items-center gap-2">
                                      <FiUsers className="w-3 h-3" />
                                      <span>{getDateAvailability(date)} {selectedCaregiver.toLowerCase()} available</span>
                                    </div>
                                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                                  </div>
                                )}
                                {hoveredDate && hoveredDate.toDateString() === date.toDateString() && !isAvailable && bookingsForDay.length > 0 && (
                                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-52 rounded-lg bg-gray-800 px-3 py-2 text-[11px] text-white opacity-100 transition-opacity duration-200 z-10">
                                    <p className="font-semibold text-amber-300 mb-1">Already booked</p>
                                    <div className="space-y-1 max-h-24 overflow-y-auto">
                                      {bookingsForDay.slice(0, 3).map((booking, idx) => (
                                        <div key={`${booking?.secondary_order_id || booking?.order_id || 'booking'}-${idx}`}>
                                          <p className="font-medium">{booking?.service_name || 'Service'}</p>
                                          <p className="text-gray-200">{booking?.package_name || 'Package'}</p>
                                        </div>
                                      ))}
                                      {bookingsForDay.length > 3 && (
                                        <p className="text-gray-300">+{bookingsForDay.length - 3} more bookings</p>
                                      )}
                                    </div>
                                    <div className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                                  </div>
                                )}
                              </div>
                            )
                          }
                          
                          return days
                        })()}
                      </div>
                    </div>
                    
                    {/* Date Selection Feedback */}
                    {selectedDates.length > 0 && (() => {
                      const formattedDates = formatSelectedDates()
                      return (
                        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center gap-3">
                            <FiCalendar className="w-5 h-5 text-blue-600" />
                            <div className="flex-1">
                              <h4 className="font-semibold text-blue-900">
                                {formattedDates.total} Date{formattedDates.total > 1 ? 's' : ''} Selected
                              </h4>
                              <div className="text-blue-700 text-sm mt-1">
                                {formattedDates.total === 1 ? (
                                  <div>{formattedDates.start}</div>
                                ) : (
                                  <div className="space-y-1">
                                    <div>
                                      <span className="font-medium">Start:</span> {formattedDates.start}
                                    </div>
                                    {formattedDates.middle.length > 0 && formattedDates.middle.length <= 3 && (
                                      formattedDates.middle.map((date, index) => (
                                        <div key={index}>{date}</div>
                                      ))
                                    )}
                                    {formattedDates.middle.length > 3 && (
                                      <>
                                        {formattedDates.middle.slice(0, 2).map((date, index) => (
                                          <div key={index}>{date}</div>
                                        ))}
                                        <div className="text-blue-600 text-xs">
                                          ... {formattedDates.total - 3} more dates ...
                                        </div>
                                      </>
                                    )}
                                    <div>
                                      <span className="font-medium">End:</span> {formattedDates.end}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <p className="text-blue-600 text-xs mt-2">
                                {isHourlyPackage
                                  ? '💡 Set the time window for each date below, then continue to review.'
                                  : '💡 You can select multiple dates for extended care. Click "Continue to Review" when ready.'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                    {isHourlyPackage && selectedDates.length > 0 && (
                      <div className="mt-3 p-3 rounded-lg border border-teal-200 bg-teal-50/50 space-y-2">
                        <h4 className="text-sm font-semibold text-teal-900">Time window per date</h4>
                        <p className="text-xs text-teal-800/90">
                          Start must be before end. Times are sent as <span className="font-mono">HH:mm:ss</span> in the booking payload.
                        </p>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {[...selectedDates]
                            .sort((a, b) => new Date(a) - new Date(b))
                            .map((ds) => {
                              const t = hourlyTimeByDate[ds] || { start: '09:00', end: '11:00' }
                              const label = new Date(ds).toLocaleDateString('en-IN', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                              const invalid = t.start && t.end && t.start >= t.end
                              return (
                                <div
                                  key={ds}
                                  className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-lg bg-white border border-teal-100"
                                >
                                  <span className="text-sm font-medium text-gray-800 sm:w-40 shrink-0">{label}</span>
                                  <div className="flex flex-wrap items-center gap-2 flex-1">
                                    <label className="text-xs text-gray-600 flex items-center gap-1">
                                      <span>From</span>
                                      <input
                                        type="time"
                                        value={t.start}
                                        onChange={(e) =>
                                          setHourlyTimeByDate((prev) => ({
                                            ...prev,
                                            [ds]: { ...t, start: e.target.value },
                                          }))
                                        }
                                        className="px-2 py-1 text-sm border border-gray-300 rounded-md"
                                      />
                                    </label>
                                    <label className="text-xs text-gray-600 flex items-center gap-1">
                                      <span>To</span>
                                      <input
                                        type="time"
                                        value={t.end}
                                        onChange={(e) =>
                                          setHourlyTimeByDate((prev) => ({
                                            ...prev,
                                            [ds]: { ...t, end: e.target.value },
                                          }))
                                        }
                                        className="px-2 py-1 text-sm border border-gray-300 rounded-md"
                                      />
                                    </label>
                                    {invalid && (
                                      <span className="text-xs text-red-600">End time must be after start</span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 5: Final Booking Summary */}
                {currentStep === 5 && selectedDates.length > 0 && isHourlySelectionComplete && (
                  <div ref={reviewSectionRef} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-gray-900">Step 5: Review & Payment</h3>
                      <button
                        onClick={handleGoBack}
                        className="px-3 py-1.5 text-gray-600 hover:text-gray-800 flex items-center gap-2 text-sm"
                      >
                        ← Back
                      </button>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Service:</span>
                        <span className="font-medium text-gray-900">{selectedCaregiver}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Location:</span>
                        <span className="font-medium text-gray-900">
                          {selectedLocationType === 'Client Location' 
                            ? `${clientName} - ${effectiveClientAddress}` 
                            : ''}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Package:</span>
                        <span className="font-medium text-gray-900">
                          {selectedPackage?.name}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">
                          Selected Date{selectedDates.length > 1 ? 's' : ''}:
                        </span>
                        <div className="text-right">
                          {selectedDates.length > 0 ? (() => {
                            const formattedDates = formatSelectedDates()
                            return (
                              <div className="font-medium text-gray-900 space-y-1">
                                {formattedDates.total === 1 ? (
                                  <div className="text-sm">{formattedDates.start}</div>
                                ) : (
                                  <>
                                    <div className="text-sm">
                                      <span className="text-gray-600">Start:</span> {formattedDates.start}
                                    </div>
                                    {formattedDates.middle.length > 0 && formattedDates.middle.length <= 2 && (
                                      formattedDates.middle.map((date, index) => (
                                        <div key={index} className="text-sm">{date}</div>
                                      ))
                                    )}
                                    {formattedDates.middle.length > 2 && (
                                      <div className="text-xs text-gray-600">
                                        ... {formattedDates.total - 2} dates ...
                                      </div>
                                    )}
                                    <div className="text-sm">
                                      <span className="text-gray-600">End:</span> {formattedDates.end}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                      ({formattedDates.total} total)
                                    </div>
                                  </>
                                )}
                                {isHourlyPackage && (
                                  <div className="text-left mt-2 pt-2 border-t border-gray-200 space-y-1 max-h-32 overflow-y-auto">
                                    {[...selectedDates]
                                      .sort((a, b) => new Date(a) - new Date(b))
                                      .map((ds) => {
                                        const t = hourlyTimeByDate[ds]
                                        const dayLabel = new Date(ds).toLocaleDateString('en-IN', {
                                          weekday: 'short',
                                          day: 'numeric',
                                          month: 'short',
                                        })
                                        return (
                                          <div key={ds} className="text-xs text-gray-600">
                                            {dayLabel}: {t?.start || '—'} – {t?.end || '—'}
                                          </div>
                                        )
                                      })}
                                  </div>
                                )}
                              </div>
                            )
                          })() : (
                            <span className="font-medium text-gray-900">No dates selected</span>
                          )}
                        </div>
                      </div>
                      <div className="border-t pt-3 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Subtotal:</span>
                          <span className="font-medium text-gray-900">
                            {selectedPackage && selectedDates.length > 0 
                              ? formatAmount(calculateTotalAmount())
                              : selectedPackage?.price || serviceData.startingPrice}
                          </span>
                        </div>
                        
                        {/* Discount Input - Only for VSRE_OWNER */}
                        {isVsreOwner && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600">Discount:</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max={calculateTotalAmount()}
                                value={discountAmount || ''}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value) || 0
                                  const maxDiscount = calculateTotalAmount()
                                  const discount = Math.min(Math.max(0, value), maxDiscount)
                                  setDiscountAmount(discount)
                                }}
                                className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                                placeholder="0"
                              />
                              <span className="text-xs text-gray-500">₹</span>
                            </div>
                          </div>
                        )}

                        {/* Premium Input - Only for VSRE_OWNER */}
                        {isVsreOwner && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600">Premium:</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                value={premiumAmount || ''}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value) || 0
                                  const premium = Math.max(0, value)
                                  setPremiumAmount(premium)
                                }}
                                className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                                placeholder="0"
                              />
                              <span className="text-xs text-gray-500">₹</span>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex justify-between text-lg font-bold">
                          <span className="text-gray-900">Final Amount:</span>
                          <span className="text-gray-900">
                            {formatAmount(calculateFinalAmount())}
                          </span>
                        </div>

                        {/* Advance Payment */}
                        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <h4 className="text-xs font-semibold tracking-wide text-gray-700 mb-2">ADVANCE PAYMENT</h4>
                          {canChooseAdvancePaymentTiming ? (
                            <div className="mb-3 space-y-2">
                              <p className="text-sm font-medium text-gray-900">
                                Is this an upfront payment or post-service payment?
                              </p>
                              <p className="text-xs text-gray-600">
                                Choose when the client pays the full amount for this booking.
                              </p>
                              <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
                                <button
                                  type="button"
                                  onClick={() => setAdvancePaymentTiming('upfront')}
                                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    advancePaymentTiming === 'upfront'
                                      ? 'bg-teal-600 text-white shadow-sm'
                                      : 'text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  Upfront payment
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAdvancePaymentTiming('post_service')}
                                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    advancePaymentTiming === 'post_service'
                                      ? 'bg-teal-600 text-white shadow-sm'
                                      : 'text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  Post-service payment
                                </button>
                              </div>
                            </div>
                          ) : isCustomerUser ? (
                            <p className="text-xs text-gray-600">
                              Full payment is collected upfront at the time of booking.
                            </p>
                          ) : null}
                          {canChooseAdvancePaymentTiming && advancePaymentTiming === 'post_service' ? (
                            <p className="text-xs text-gray-600">
                              Full payment will be collected after the service is completed.
                            </p>
                          ) : canChooseAdvancePaymentTiming && advancePaymentTiming === 'upfront' ? (
                            <p className="text-xs text-gray-600">
                              Full payment will be collected at the time of booking.
                            </p>
                          ) : null}
                        </div>

                        {/* Registration Fee Options */}
                        {/* <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <h4 className="text-xs font-semibold tracking-wide text-gray-700 mb-2">REGISTRATION FEE OPTIONS</h4>

                          <div className="space-y-2">
                            <label
                              className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors hover:bg-gray-100 ${
                                isRegFull ? 'bg-teal-50 border-teal-200' : 'bg-white border-gray-200'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isRegFull}
                                onChange={(e) => handleRegFullToggle(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900">
                                  {isCustomerUser
                                    ? 'Will you pay the full registration fee right now?'
                                    : 'Will the client pay the full registration fee right now?'}
                                </p>
                                <p className="text-xs text-gray-600 mt-0.5">
                                  {isCustomerUser
                                    ? 'Select this if you agree to pay the complete registration fee at the time of booking.'
                                    : 'Select this if the client agrees to pay the complete registration fee at the time of booking.'}
                                </p>
                              </div>
                            </label>

                            <div className="space-y-2">
                              <label
                                className={`flex items-start justify-between gap-3 rounded-md border p-3 cursor-pointer transition-colors hover:bg-gray-100 ${
                                  isRegSplit ? 'bg-teal-50 border-teal-200' : 'bg-white border-gray-200'
                                }`}
                              >
                                <div className="flex items-start gap-3 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isRegSplit}
                                    onChange={(e) => handleRegSplitToggle(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                                  />
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">
                                      {isCustomerUser
                                        ? 'Would you like to split the registration fee?'
                                        : 'Would the client like to split the registration fee?'}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-0.5">
                                      {isCustomerUser
                                        ? 'Select this if you prefer to pay the registration fee in multiple installments.'
                                        : 'Select this if the client prefers to pay the registration fee in multiple installments.'}
                                    </p>
                                  </div>
                                </div>
                                {isRegSplit && (
                                  <span
                                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0"
                                    style={{ backgroundColor: '#faeeda', color: '#854f0b' }}
                                  >
                                    Split
                                  </span>
                                )}
                              </label>

                              {isRegSplit && (
                                <div className="ml-7 rounded-md border border-gray-200 bg-white p-3 space-y-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <label className="text-sm text-gray-700">1st installment amount (₹)</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={installment1 > 0 ? installment1 : ''}
                                      onChange={(e) => setInstallment1(Math.max(0, Number.parseFloat(e.target.value) || 0))}
                                      className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                                    />
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <label className="text-sm text-gray-700">2nd installment amount (₹)</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={installment2 > 0 ? installment2 : ''}
                                      onChange={(e) => setInstallment2(Math.max(0, Number.parseFloat(e.target.value) || 0))}
                                      className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <label
                                className={`flex items-start justify-between gap-3 rounded-md border p-3 cursor-pointer transition-colors hover:bg-gray-100 ${
                                  isRegUpfront ? 'bg-teal-50 border-teal-200' : 'bg-white border-gray-200'
                                }`}
                              >
                                <div className="flex items-start gap-3 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isRegUpfront}
                                    onChange={(e) => handleRegUpfrontToggle(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                                  />
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">
                                      {isCustomerUser
                                        ? 'Would you like to pay the registration fee upfront or after the service?'
                                        : 'Would the client like to pay the registration fee upfront or after the service?'}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-0.5">
                                      {isCustomerUser
                                        ? 'Choose whether you pay the registration fee before the service begins or after it is completed.'
                                        : 'Choose whether the client pays the registration fee before the service begins or after it is completed.'}
                                    </p>
                                  </div>
                                </div>
                                {isRegUpfront && (
                                  <span
                                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0"
                                    style={
                                      upfrontChoice === 'upfront'
                                        ? { backgroundColor: '#e1f5ee', color: '#0f6e56' }
                                        : upfrontChoice === 'after'
                                          ? { backgroundColor: '#faeeda', color: '#854f0b' }
                                          : { backgroundColor: '#e6f1fb', color: '#185fa5' }
                                    }
                                  >
                                    {upfrontChoice === 'upfront'
                                      ? 'Upfront'
                                      : upfrontChoice === 'after'
                                        ? 'After service'
                                        : 'Selected'}
                                  </span>
                                )}
                              </label>

                              {isRegUpfront && (
                                <div className="ml-7 rounded-md border border-gray-200 bg-white p-3 space-y-2">
                                  <p className="text-sm font-semibold text-gray-800">
                                    {isCustomerUser
                                      ? 'When will you pay the registration fee?'
                                      : 'When will the client pay the registration fee?'}
                                  </p>

                                  <label
                                    className={`flex items-start gap-3 rounded-md border p-2.5 cursor-pointer transition-colors ${
                                      upfrontChoice === 'upfront'
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                        : 'bg-white border-gray-200 hover:bg-gray-50'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name="reg-upfront-choice-senior-care"
                                      checked={upfrontChoice === 'upfront'}
                                      onChange={() => setUpfrontChoice('upfront')}
                                      className="mt-0.5 h-4 w-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                                    />
                                    <div>
                                      <p className="text-sm font-medium">Pay upfront</p>
                                      <p className="text-xs mt-0.5">
                                        {isCustomerUser
                                          ? 'You pay the registration fee before the service begins.'
                                          : 'Client pays the registration fee before the service begins.'}
                                      </p>
                                    </div>
                                  </label>

                                  <label
                                    className={`flex items-start gap-3 rounded-md border p-2.5 cursor-pointer transition-colors ${
                                      upfrontChoice === 'after'
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                        : 'bg-white border-gray-200 hover:bg-gray-50'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name="reg-upfront-choice-senior-care"
                                      checked={upfrontChoice === 'after'}
                                      onChange={() => setUpfrontChoice('after')}
                                      className="mt-0.5 h-4 w-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                                    />
                                    <div>
                                      <p className="text-sm font-medium">Pay after service</p>
                                      <p className="text-xs mt-0.5">
                                        {isCustomerUser
                                          ? 'You pay the registration fee once the service is completed.'
                                          : 'Client pays the registration fee once the service is completed.'}
                                      </p>
                                    </div>
                                  </label>
                                </div>
                              )}
                            </div>
                          </div>
                        </div> */}
                        
                        <div className="pt-2 border-t border-gray-200">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-600 text-sm">Amount to Pay:</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">₹</span>
                              <input
                                type="number"
                                min={0}
                                max={calculateFinalAmount()}
                                value={paymentAmount || ''}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value) || 0
                                  const final = calculateFinalAmount()
                                  const payment = Math.min(Math.max(0, value), final)
                                  setPaymentAmount(payment)
                                }}
                                className="w-28 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 font-medium"
                                placeholder="0"
                              />
                            </div>
                          </div>
                        </div>

                        {(() => {
                          const breakdownLabel = getPaymentBreakdownLabel()
                          if (!breakdownLabel) return null
                          return (
                            <div className="text-xs text-gray-600 mt-1 text-right">
                              {breakdownLabel}
                            </div>
                          )
                        })()}

                        <div className="pt-2 border-t border-gray-200">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={autoContinue}
                              onChange={(e) => setAutoContinue(e.target.checked)}
                              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                            />
                            <span className="text-sm text-gray-700">Auto continue</span>
                          </label>
                          <p className="text-xs text-gray-500 mt-0.5 ml-6">If enabled, your booking will automatically renew based on the selected schedule until the service ends.</p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handlePayment}
                      disabled={
                        isLoadingAPI ||
                        !activeRegistration?.id ||
                        !selectedServiceOption?.id ||
                        !selectedPackage?.id ||
                        selectedDates.length === 0 ||
                        !isHourlySelectionComplete
                      }
                      className={`w-full py-3 px-4 rounded-lg font-medium ${colorClasses.button} text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isLoadingAPI
                        ? 'Creating Booking...'
                        : `Proceed to Booking (${formatAmount(calculateFinalAmount())}${
                            canChooseAdvancePaymentTiming && advancePaymentTiming === 'post_service'
                              ? ', post-service'
                              : ''
                          })`}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Reset Confirmation Dialog */}
            {showResetConfirm && (
              <div className="fixed inset-0 bg-white/10 backdrop-blur-md flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl p-6 max-w-md w-full border-2 border-black">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                      <FiXCircle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Reset All Selections</h3>
                      <p className="text-sm text-gray-600">This will clear all your current selections</p>
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <p className="text-gray-700 mb-3">Are you sure you want to reset all selections? This action will:</p>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Clear selected caregiver</li>
                      <li>• Clear location preferences and forms</li>
                      <li>• Clear package selection</li>
                      <li>• Clear selected date</li>
                      <li>• Return to Step 1</li>
                    </ul>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={handleResetCancel}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleResetAll}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Reset All
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Customer Registration Modal */}
            {showRegistrationModal && (
              <div className="fixed inset-0 bg-white/10 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto">
                <div className="bg-white rounded-xl p-6 max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto border-2 border-black">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">
                      {isEditingRegistration
                        ? registrationModalStep === 2
                          ? 'Edit Registration — Step 2'
                          : 'Edit Registration — Step 1'
                        : registrationModalStep === 2
                          ? 'Patient Registration — Step 2'
                          : 'Patient Registration — Step 1'}
                    </h2>
                    <button
                      onClick={handleCloseRegistrationModal}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <FiXCircle className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="mb-4 flex items-center gap-2 text-sm">
                    <span
                      className={`rounded-full px-3 py-1 font-semibold ${
                        registrationModalStep === 1
                          ? 'bg-teal-600 text-white'
                          : 'bg-teal-100 text-teal-800'
                      }`}
                    >
                      1. Details
                    </span>
                    <span className="text-gray-400">→</span>
                    <span
                      className={`rounded-full px-3 py-1 font-semibold ${
                        registrationModalStep === 2
                          ? 'bg-teal-600 text-white'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      2. ID Proof
                    </span>
                  </div>

                  {registrationModalStep === 1 && !isEditingRegistration && (
                  <div className="mb-6 p-4 bg-teal-50 border border-teal-200 rounded-lg">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-teal-900">Registration Fee</h3>
                        <p className="text-sm text-teal-700 mt-1">One-time registration fee required for all new registrations</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-teal-900">₹5,000</p>
                        <p className="text-xs text-teal-600">Fixed Fee</p>
                      </div>
                    </div>
                  </div>
                  )}

                  {registrationModalStep === 2 && (
                    <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-900">
                      {isEditingRegistration ? 'Update' : 'Registration saved for'}{' '}
                      <span className="font-semibold">
                        {registrationForm.firstName} {registrationForm.lastName}
                      </span>
                      . {isEditingRegistration ? 'Review or upload ID proof.' : 'Upload ID proof to finish.'}
                    </div>
                  )}

                  <form
                    onSubmit={(e) => {
                      if (registrationModalStep === 2) {
                        handleIdProofStepSubmit(e)
                      } else {
                        handleRegistrationSubmit(e)
                      }
                    }}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {registrationModalStep === 1 && (
                      <>
                      {/* First Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          First Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={registrationForm.firstName}
                          onChange={(e) => handleRegistrationInputChange('firstName', e.target.value)}
                          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                            registrationErrors.firstName ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="Enter your first name"
                        />
                        {registrationErrors.firstName && (
                          <p className="text-red-500 text-xs mt-1">{registrationErrors.firstName}</p>
                        )}
                      </div>

                      {/* Last Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Last Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={registrationForm.lastName}
                          onChange={(e) => handleRegistrationInputChange('lastName', e.target.value)}
                          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                            registrationErrors.lastName ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="Enter your last name"
                        />
                        {registrationErrors.lastName && (
                          <p className="text-red-500 text-xs mt-1">{registrationErrors.lastName}</p>
                        )}
                      </div>

                      {/* Email */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Email
                        </label>
                        <input
                          type="email"
                          value={registrationForm.email}
                          onChange={(e) => handleRegistrationInputChange('email', e.target.value)}
                          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                            registrationErrors.email ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="your.email@example.com"
                        />
                        {registrationErrors.email && (
                          <p className="text-red-500 text-xs mt-1">{registrationErrors.email}</p>
                        )}
                      </div>

                      {/* Phone */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Phone Number <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={registrationForm.countryCode}
                            onChange={(e) => handleRegistrationInputChange('countryCode', e.target.value)}
                            className="w-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white"
                          >
                            <option value="+91">+91</option>
                            <option value="+1">+1</option>
                            <option value="+44">+44</option>
                            <option value="+61">+61</option>
                            <option value="+971">+971</option>
                            <option value="+65">+65</option>
                            <option value="+60">+60</option>
                            <option value="+66">+66</option>
                          </select>
                          <input
                            type="tel"
                            value={registrationForm.phone}
                            onChange={(e) => handleRegistrationInputChange('phone', e.target.value)}
                            className={`flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                              registrationErrors.phone ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="10-digit phone number"
                            maxLength="10"
                          />
                        </div>
                        {registrationErrors.phone && (
                          <p className="text-red-500 text-xs mt-1">{registrationErrors.phone}</p>
                        )}
                      </div>

                      {/* Date of Birth / Age */}
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Date of Birth / Age
                        </label>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="dontKnowDOB"
                              checked={registrationForm.dontKnowDOB}
                              onChange={(e) => handleRegistrationInputChange('dontKnowDOB', e.target.checked)}
                              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                            />
                            <label htmlFor="dontKnowDOB" className="text-sm text-gray-700">
                              I don't know my date of birth
                            </label>
                          </div>
                          
                          {!registrationForm.dontKnowDOB ? (
                            <div className="space-y-2">
                              <input
                                type="date"
                                value={registrationForm.dateOfBirth}
                                onChange={(e) => handleRegistrationInputChange('dateOfBirth', e.target.value)}
                                min="1925-01-01"
                                max={new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0]}
                                className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                                  registrationErrors.dateOfBirth ? 'border-red-500' : 'border-gray-300'
                                }`}
                              />
                              {registrationErrors.dateOfBirth && (
                                <p className="text-red-500 text-xs">{registrationErrors.dateOfBirth}</p>
                              )}
                              {registrationForm.dateOfBirth && registrationForm.age && (
                                <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg">
                                  <p className="text-sm text-blue-700">
                                    <span className="font-medium">Age:</span> {registrationForm.age} years
                                  </p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <input
                                type="number"
                                value={registrationForm.age}
                                onChange={(e) => handleRegistrationInputChange('age', e.target.value)}
                                min="1"
                                max="100"
                                className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                                  registrationErrors.age ? 'border-red-500' : 'border-gray-300'
                                }`}
                                placeholder="Enter age (1-100 years)"
                              />
                              {registrationErrors.age && (
                                <p className="text-red-500 text-xs mt-1">{registrationErrors.age}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Address */}
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Address <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={registrationForm.address}
                          onChange={(e) => handleRegistrationInputChange('address', e.target.value)}
                          rows="3"
                          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                            registrationErrors.address ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="Enter your complete address"
                        />
                        {registrationErrors.address && (
                          <p className="text-red-500 text-xs mt-1">{registrationErrors.address}</p>
                        )}
                      </div>

                      {/* Emergency Contact Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Emergency Contact Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={registrationForm.emergencyContact}
                          onChange={(e) => handleRegistrationInputChange('emergencyContact', e.target.value)}
                          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                            registrationErrors.emergencyContact ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="Emergency contact person name"
                        />
                        {registrationErrors.emergencyContact && (
                          <p className="text-red-500 text-xs mt-1">{registrationErrors.emergencyContact}</p>
                        )}
                      </div>

                      {/* Emergency Contact Phone */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Emergency Contact Phone <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={registrationForm.emergencyCountryCode}
                            onChange={(e) => handleRegistrationInputChange('emergencyCountryCode', e.target.value)}
                            className="w-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white"
                          >
                            <option value="+91">+91</option>
                            <option value="+1">+1</option>
                            <option value="+44">+44</option>
                            <option value="+61">+61</option>
                            <option value="+971">+971</option>
                            <option value="+65">+65</option>
                            <option value="+60">+60</option>
                            <option value="+66">+66</option>
                          </select>
                          <input
                            type="tel"
                            value={registrationForm.emergencyPhone}
                            onChange={(e) => handleRegistrationInputChange('emergencyPhone', e.target.value)}
                            className={`flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                              registrationErrors.emergencyPhone ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="10-digit phone number"
                            maxLength="10"
                          />
                        </div>
                        {registrationErrors.emergencyPhone && (
                          <p className="text-red-500 text-xs mt-1">{registrationErrors.emergencyPhone}</p>
                        )}
                      </div>

                      {/* Second Emergency Contact Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Second Emergency Contact Name
                        </label>
                        <input
                          type="text"
                          value={registrationForm.emergencyContact2}
                          onChange={(e) => handleRegistrationInputChange('emergencyContact2', e.target.value)}
                          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                            registrationErrors.emergencyContact2 ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="Second emergency contact person name (optional)"
                        />
                        {registrationErrors.emergencyContact2 && (
                          <p className="text-red-500 text-xs mt-1">{registrationErrors.emergencyContact2}</p>
                        )}
                      </div>

                      {/* Second Emergency Contact Phone */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Second Emergency Contact Phone
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={registrationForm.emergencyCountryCode2}
                            onChange={(e) => handleRegistrationInputChange('emergencyCountryCode2', e.target.value)}
                            className="w-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white"
                          >
                            <option value="+91">+91</option>
                            <option value="+1">+1</option>
                            <option value="+44">+44</option>
                            <option value="+61">+61</option>
                            <option value="+971">+971</option>
                            <option value="+65">+65</option>
                            <option value="+60">+60</option>
                            <option value="+66">+66</option>
                          </select>
                          <input
                            type="tel"
                            value={registrationForm.emergencyPhone2}
                            onChange={(e) => handleRegistrationInputChange('emergencyPhone2', e.target.value)}
                            className={`flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                              registrationErrors.emergencyPhone2 ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="10-digit phone number (optional)"
                            maxLength="10"
                          />
                        </div>
                        {registrationErrors.emergencyPhone2 && (
                          <p className="text-red-500 text-xs mt-1">{registrationErrors.emergencyPhone2}</p>
                        )}
                      </div>

                      {/* Medical Conditions */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Medical Conditions
                        </label>
                        <textarea
                          value={registrationForm.medicalConditions}
                          onChange={(e) => handleRegistrationInputChange('medicalConditions', e.target.value)}
                          rows="3"
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                          placeholder="List any medical conditions (optional)"
                        />
                      </div>

                      {/* Allergies */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Allergies
                        </label>
                        <textarea
                          value={registrationForm.allergies}
                          onChange={(e) => handleRegistrationInputChange('allergies', e.target.value)}
                          rows="3"
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                          placeholder="List any allergies (optional)"
                        />
                      </div>

                      {/* Preferred Language */}
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Preferred Language
                        </label>
                        <select
                          value={registrationForm.preferredLanguage}
                          onChange={(e) => handleRegistrationInputChange('preferredLanguage', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                        >
                          <option value="">Select preferred language</option>
                          <option value="english">English</option>
                          <option value="hindi">Hindi</option>
                          <option value="kannada">Kannada</option>
                          <option value="tamil">Tamil</option>
                          <option value="telugu">Telugu</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      {/* Gender */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Gender <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={registrationForm.gender}
                          onChange={(e) => handleRegistrationInputChange('gender', e.target.value)}
                          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                            registrationErrors.gender ? 'border-red-500' : 'border-gray-300'
                          }`}
                        >
                          <option value="">Select gender</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                          <option value="prefer-not-to-say">Prefer not to say</option>
                        </select>
                        {registrationErrors.gender && (
                          <p className="text-red-500 text-xs mt-1">{registrationErrors.gender}</p>
                        )}
                      </div>

                      {/* Blood Group */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Blood Group
                        </label>
                        <select
                          value={registrationForm.bloodGroup}
                          onChange={(e) => handleRegistrationInputChange('bloodGroup', e.target.value)}
                          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                            registrationErrors.bloodGroup ? 'border-red-500' : 'border-gray-300'
                          }`}
                        >
                          <option value="">Select blood group</option>
                          <option value="A+">A+</option>
                          <option value="A-">A-</option>
                          <option value="B+">B+</option>
                          <option value="B-">B-</option>
                          <option value="AB+">AB+</option>
                          <option value="AB-">AB-</option>
                          <option value="O+">O+</option>
                          <option value="O-">O-</option>
                        </select>
                        {registrationErrors.bloodGroup && (
                          <p className="text-red-500 text-xs mt-1">{registrationErrors.bloodGroup}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Affiliate
                        </label>
                        <input
                          type="text"
                          value={registrationForm.affiliate}
                          onChange={(e) => handleRegistrationInputChange('affiliate', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                          placeholder="Enter affiliate"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Source
                        </label>
                        <input
                          type="text"
                          value={registrationForm.source}
                          onChange={(e) => handleRegistrationInputChange('source', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                          placeholder="Enter source"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Referred By
                        </label>
                        <input
                          type="text"
                          value={registrationForm.referredBy}
                          onChange={(e) => handleRegistrationInputChange('referredBy', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                          placeholder="Enter referred by"
                        />
                      </div>

                      <div className="flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer py-3">
                          <input
                            type="checkbox"
                            checked={registrationForm.isProbono === true}
                            onChange={(e) => handleRegistrationInputChange('isProbono', e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                          />
                          <span className="text-sm font-medium text-gray-700">Is Probono</span>
                        </label>
                      </div>

                      </>
                      )}

                      {registrationModalStep === 2 && (
                      <>
                      {/* ID Proof */}
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          ID Proof <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={registrationForm.idProof}
                          onChange={(e) => handleRegistrationInputChange('idProof', e.target.value)}
                          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                            registrationErrors.idProof ? 'border-red-500' : 'border-gray-300'
                          }`}
                        >
                          <option value="">Select ID proof type</option>
                          <option value="aadhar">Aadhar Card</option>
                          <option value="pan">PAN Card</option>
                          <option value="passport">Passport</option>
                          <option value="driving-license">Driving License</option>
                          <option value="voter-id">Voter ID</option>
                          <option value="other">Other</option>
                        </select>
                        {registrationErrors.idProof && (
                          <p className="text-red-500 text-xs mt-1">{registrationErrors.idProof}</p>
                        )}
                      </div>

                      {/* ID Proof Number */}
                      {registrationForm.idProof && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {registrationForm.idProof === 'aadhar' ? 'Aadhar Number' :
                             registrationForm.idProof === 'pan' ? 'PAN Number' :
                             registrationForm.idProof === 'passport' ? 'Passport Number' :
                             registrationForm.idProof === 'driving-license' ? 'Driving License Number' :
                             registrationForm.idProof === 'voter-id' ? 'Voter ID Number' :
                             'ID Number'} <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={registrationForm.idProofNumber}
                            onChange={(e) => {
                              let value = e.target.value
                              if (registrationForm.idProof === 'pan') {
                                value = value.toUpperCase()
                              }
                              if (registrationForm.idProof === 'aadhar') {
                                value = value.replace(/\D/g, '')
                              }
                              handleRegistrationInputChange('idProofNumber', value)
                            }}
                            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                              registrationErrors.idProofNumber ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder={`Enter ${registrationForm.idProof === 'aadhar' ? 'Aadhar' :
                                         registrationForm.idProof === 'pan' ? 'PAN' :
                                         registrationForm.idProof === 'passport' ? 'Passport' :
                                         registrationForm.idProof === 'driving-license' ? 'Driving License' :
                                         registrationForm.idProof === 'voter-id' ? 'Voter ID' :
                                         'ID'} number`}
                            maxLength={registrationForm.idProof === 'aadhar' ? '12' :
                                       registrationForm.idProof === 'pan' ? '10' : ''}
                          />
                          {registrationErrors.idProofNumber && (
                            <p className="text-red-500 text-xs mt-1">{registrationErrors.idProofNumber}</p>
                          )}
                          {registrationForm.idProof === 'aadhar' && (
                            <p className="text-gray-500 text-xs mt-1">Enter 12-digit Aadhar number</p>
                          )}
                          {registrationForm.idProof === 'pan' && (
                            <p className="text-gray-500 text-xs mt-1">Enter 10-character PAN number</p>
                          )}
                        </div>
                      )}

                      {/* ID Proof File Upload */}
                      {registrationForm.idProof && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            ID Proof Document <span className="text-red-500">*</span>
                          </label>
                          <div className="space-y-3">
                            <div className="flex items-center gap-4">
                              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                  <svg className="w-8 h-8 mb-2 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2h-3m-3 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-1 4v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4m4 0v.01"/>
                                  </svg>
                                  <p className="mb-2 text-sm text-gray-500">
                                    <span className="font-semibold">Click to upload</span> or drag and drop
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    PNG, JPG, GIF or PDF — max 5 MB combined, multiple files allowed (images auto-compressed)
                                  </p>
                                </div>
                                <input
                                  type="file"
                                  multiple
                                  className="hidden"
                                  accept="image/jpeg,image/jpg,image/png,image/gif,application/pdf"
                                  disabled={idProofCompressing}
                                  onChange={handleIdProofFileChange}
                                />
                              </label>
                            </div>

                            {idProofCompressing && (
                              <p className="text-xs text-amber-700">Compressing selected files…</p>
                            )}
                            {idProofCompressMessage && !idProofCompressing && (
                              <p className="text-xs text-slate-500">{idProofCompressMessage}</p>
                            )}

                            {registrationForm.idProofFiles?.length > 0 && (
                              <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-green-200 bg-green-50 divide-y divide-green-100">
                                {registrationForm.idProofFiles.map((file, index) => (
                                  <li
                                    key={`${file.name}-${file.size}-${index}`}
                                    className="flex items-center justify-between gap-2 px-3 py-2"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-green-900 truncate">{file.name}</p>
                                      <p className="text-xs text-green-700">
                                        {formatIdProofFileMb(file.size)} MB
                                        {idProofFilesMeta[index]?.compressed &&
                                          idProofFilesMeta[index].originalSize > file.size && (
                                            <>
                                              {' '}
                                              (was {formatIdProofFileMb(idProofFilesMeta[index].originalSize)} MB,
                                              compressed)
                                            </>
                                          )}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeIdProofFile(index)}
                                      className="shrink-0 text-red-600 hover:text-red-800"
                                      aria-label={`Remove ${file.name}`}
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {registrationForm.idProofFiles?.length > 0 && (
                              <p className="text-[11px] text-slate-500 mt-1">
                                Selected: {(totalIdProofFileBytes(registrationForm.idProofFiles) / 1024 / 1024).toFixed(2)} / 5 MB
                                {' · '}
                                {registrationForm.idProofFiles.length} file
                                {registrationForm.idProofFiles.length !== 1 ? 's' : ''}
                              </p>
                            )}

                            {!registrationForm.idProofFiles?.length && registrationForm.idProofFileUrl && (
                              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-center gap-2">
                                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  <span className="text-sm text-blue-900">Existing file uploaded</span>
                                  <a
                                    href={registrationForm.idProofFileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 hover:text-blue-800 underline ml-2"
                                  >
                                    View
                                  </a>
                                </div>
                                {registrationForm.idProofFileUrl.match(/\.(jpg|jpeg|png|gif)$/i) && (
                                  <div className="mt-2">
                                    <img
                                      src={registrationForm.idProofFileUrl}
                                      alt="ID Proof"
                                      className="max-w-full h-32 object-contain rounded border border-gray-200"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {registrationErrors.idProofFile && (
                            <p className="text-red-500 text-xs mt-1">{registrationErrors.idProofFile}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            Upload a clear photo or scan of your {registrationForm.idProof === 'aadhar' ? 'Aadhar Card' :
                             registrationForm.idProof === 'pan' ? 'PAN Card' :
                             registrationForm.idProof === 'passport' ? 'Passport' :
                             registrationForm.idProof === 'driving-license' ? 'Driving License' :
                             registrationForm.idProof === 'voter-id' ? 'Voter ID' :
                             'ID Proof'}
                          </p>
                        </div>
                      )}
                      </>
                      )}

                      {registrationModalStep === 1 && (
                      <>
                      {/* Education Qualifications */}
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Education Qualifications
                        </label>
                        <textarea
                          value={registrationForm.educationQualifications}
                          onChange={(e) => handleRegistrationInputChange('educationQualifications', e.target.value)}
                          rows="3"
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                          placeholder="Enter your educational qualifications"
                        />
                      </div>

                      {/* Earlier Occupation */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Earlier Occupation
                        </label>
                        <input
                          type="text"
                          value={registrationForm.earlierOccupation}
                          onChange={(e) => handleRegistrationInputChange('earlierOccupation', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                          placeholder="Enter your previous occupation"
                        />
                      </div>

                      {/* Year of Retirement */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Year of Retirement
                        </label>
                        <input
                          type="number"
                          value={registrationForm.yearOfRetirement}
                          onChange={(e) => handleRegistrationInputChange('yearOfRetirement', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                          placeholder="YYYY"
                          min="1950"
                          max={new Date().getFullYear()}
                        />
                      </div>

                      {/* Present Health Condition */}
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Present Health Condition
                        </label>
                        <textarea
                          value={registrationForm.presentHealthCondition}
                          onChange={(e) => handleRegistrationInputChange('presentHealthCondition', e.target.value)}
                          rows="3"
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                          placeholder="Describe your current health condition"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Advance payment (optional)
                        </label>
                        <input
                          type="number"
                          value={registrationForm.advancePayment}
                          onChange={(e) => {
                            const value = e.target.value
                            if (value === "" || (parseFloat(value) >= 0 && parseFloat(value) <= 100000)) {
                              handleRegistrationInputChange("advancePayment", value)
                            }
                          }}
                          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                            registrationErrors.advancePayment ? "border-red-500" : "border-gray-300"
                          }`}
                          placeholder="Up to ₹1,00,000"
                          min="0"
                          max="100000"
                          step="0.01"
                        />
                        {registrationErrors.advancePayment && (
                          <p className="text-red-500 text-xs mt-1">{registrationErrors.advancePayment}</p>
                        )}
                      </div>

                      {registrationForm.advancePayment && registrationForm.advancePayment.trim() !== "" ? (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Payment mode (optional)
                          </label>
                          <select
                            value={registrationForm.paymentMode}
                            onChange={(e) => handleRegistrationInputChange("paymentMode", e.target.value)}
                            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 ${
                              registrationErrors.paymentMode ? "border-red-500" : "border-gray-300"
                            }`}
                          >
                            <option value="">Select payment mode</option>
                            <option value="cash">Cash</option>
                            <option value="credit-card">Credit Card</option>
                            <option value="debit-card">Debit Card</option>
                            <option value="net-banking">Net Banking</option>
                            <option value="upi">UPI</option>
                            <option value="cheque">Cheque</option>
                            <option value="bank-transfer">Bank Transfer</option>
                          </select>
                          {registrationErrors.paymentMode && (
                            <p className="text-red-500 text-xs mt-1">{registrationErrors.paymentMode}</p>
                          )}
                        </div>
                      ) : null}
                      </>
                      )}
                    </div>

                    <div className="flex gap-3 pt-4 border-t">
                      <button
                        type="button"
                        onClick={handleCloseRegistrationModal}
                        className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingRegistration}
                        className={`flex-1 px-4 py-3 rounded-lg font-medium ${colorClasses.button} text-white hover:opacity-90 transition-colors ${
                          isSubmittingRegistration ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {isSubmittingRegistration ? (
                          <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Saving...
                          </span>
                        ) : registrationModalStep === 2 ? (
                          'Save ID proof & finish'
                        ) : isEditingRegistration ? (
                          'Save details (Step 1)'
                        ) : (
                          'Submit registration (Step 1)'
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Registration Required Popup */}
            {showRegistrationRequiredPopup && (
              <div className="fixed inset-0 bg-white/10 backdrop-blur-md flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl p-6 max-w-md w-full border-2 border-black">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                      <FiUser className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Registration Required</h3>
                      <p className="text-sm text-gray-600">Please complete your registration first</p>
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <p className="text-gray-700 mb-3">
                      You need to complete the customer registration form before proceeding with the booking process.
                    </p>
                    <p className="text-sm text-gray-600">
                      This helps us provide you with the best care service and maintain accurate records.
                    </p>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowRegistrationRequiredPopup(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        setShowRegistrationRequiredPopup(false)
                        setShowRegistrationModal(true)
                      }}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium ${colorClasses.button} text-white hover:opacity-90 transition-colors`}
                    >
                      Register new patient
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Address Choice Popup after selecting existing patient */}
            {showAddressChoicePopup && (
              <div className="fixed inset-0 bg-white/10 backdrop-blur-md flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl p-6 max-w-md w-full border-2 border-black">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center shrink-0">
                      <FiMapPin className="w-5 h-5 text-teal-700" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Is this the right address?</h3>
                      <p className="text-sm text-gray-600">We will use this address as the default address for the patient.</p>
                    </div>
                  </div>
                  <div className="mb-6">
                    <div className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-3">
                      <p className="text-sm font-medium text-teal-800">Address on file</p>
                      <p className="mt-1 text-base text-gray-900 wrap-break-word leading-snug">
                        {(pendingSelectedRegistration?.address || '').trim() || 'No address saved yet for this patient.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddressChoicePopup(false)
                        setShowExistingRegistrations(true)
                        setPendingSelectedRegistration(null)
                      }}
                      className="w-full sm:flex-1 px-2.5 py-1.5 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-xs sm:text-sm"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleChooseCustomizeAddress}
                      className="w-full sm:flex-1 px-2.5 py-1.5 border border-teal-300 text-teal-700 rounded-md hover:bg-teal-50 transition-colors font-medium text-xs sm:text-sm"
                    >
                      Change address
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDefaultAddress}
                      className={`w-full sm:flex-1 px-2.5 py-1.5 rounded-md font-medium ${colorClasses.button} text-white hover:opacity-90 transition-colors text-xs sm:text-sm`}
                    >
                      Use this address
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Existing Registrations Modal */}
            {showExistingRegistrations && (
              <div className="fixed inset-0 bg-white/10 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto">
                <div className="bg-white rounded-xl max-w-4xl w-full my-8 max-h-[90vh] flex flex-col border-2 border-black">
                  {/* Sticky Header */}
                  <div className="p-6 pb-4 border-b border-gray-200 bg-white rounded-t-xl sticky top-0 z-10">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">Existing Registered Patients</h2>
                        <p className="text-sm text-gray-600 mt-1">View, edit, or select registered Patients</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleNewRegistration}
                          className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${colorClasses.button} text-white hover:opacity-90`}
                        >
                          <FiEdit2 className="w-4 h-4" />
                          New Registration
                        </button>
                        <button
                          onClick={handleCloseExistingRegistrations}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <FiXCircle className="w-6 h-6" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 max-w-lg">
                      <input
                        type="search"
                        value={patientsSearchInput}
                        onChange={(e) => handlePatientsSearchInputChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            submitPatientsSearch()
                          }
                        }}
                        placeholder="Search name or patient ID — press Enter"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      {patientsSearchInput.trim() &&
                        patientsSearchInput.trim() !== patientsActiveSearch &&
                        !isLoadingRegistrations && (
                          <p className="mt-1 text-xs text-gray-500">Press Enter to search</p>
                        )}
                    </div>
                  </div>
                  
                  {/* Scrollable Content Area */}
                  <div className="flex-1 overflow-y-auto p-6">
                  {isLoadingRegistrations ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <svg className="animate-spin h-12 w-12 text-teal-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <p className="text-gray-600">Loading patients...</p>
                    </div>
                  ) : registrationsError ? (
                    <div className="text-center py-12">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                        <p className="text-red-800 font-medium">Error loading patients</p>
                        <p className="text-red-600 text-sm mt-1">{registrationsError}</p>
                      </div>
                      <button
                        onClick={() => handleOpenExistingRegistrations()}
                        className={`px-4 py-2 rounded-lg font-medium ${colorClasses.button} text-white hover:opacity-90 transition-colors`}
                      >
                        Retry
                      </button>
                    </div>
                  ) : visibleRegistrations.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {visibleRegistrations.map((registration) => {
                        const isActive = activeRegistration?.id === registration.id
                        return (
                        <div 
                          key={registration.id} 
                          className={`border border-gray-200 rounded-lg p-3 sm:p-4 transition-shadow ${isActive ? 'shadow-md border-teal-400 bg-teal-50/30' : 'hover:shadow-sm'}`}
                        >
                          {/* Compact Patient Details */}
                          <div>
                            {/* Name Row */}
                            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-gray-100">
                              <h3 className="text-base font-semibold text-gray-900">
                                {registration.firstName} {registration.lastName}
                              </h3>
                              {isActive && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-teal-200 text-teal-900">
                                  Selected
                                </span>
                              )}
                            </div>

                            {/* Details - Compact Inline Layout */}
                            <div className="space-y-1.5 text-sm">
                              {/* Phone & Gender - Inline */}
                              <div className="flex items-center gap-3 flex-wrap">
                                {registration.phone && (
                                  <div className="flex items-center gap-1.5 text-gray-700">
                                    <FiPhone className="w-3.5 h-3.5 text-gray-400" />
                                    <span>{registration.phone}</span>
                                  </div>
                                )}
                                {registration.gender && (
                                  <div className="flex items-center gap-1.5 text-gray-700">
                                    <FiUser className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="capitalize">{registration.gender}</span>
                                  </div>
                                )}
                              </div>

                              {/* Patient ID */}
                              <div className="text-gray-700">
                                <span className="text-gray-500">Patient ID: </span>
                                <span className="font-medium">
                                  {registration.apiId ?? registration.id}
                                </span>
                              </div>

                              {/* Medical Conditions */}
                              {registration.medicalConditions && (
                                <div className="text-gray-700">
                                  <span className="text-gray-500">Medical: </span>
                                  <span>{registration.medicalConditions}</span>
                                </div>
                              )}

                              {/* Health Condition */}
                              {registration.presentHealthCondition && (
                                <div className="text-gray-700">
                                  <span className="text-gray-500">Health: </span>
                                  <span>{registration.presentHealthCondition}</span>
                                </div>
                              )}

                              {/* Emergency Contact */}
                              {registration.emergencyContact && (
                                <div className="text-gray-700">
                                  <span className="text-gray-500">Emergency: </span>
                                  <span>{registration.emergencyContact}</span>
                                  {registration.emergencyPhone && (
                                    <span className="text-gray-500 ml-1.5">• {registration.emergencyPhone}</span>
                                  )}
                                </div>
                              )}

                              <div className="text-gray-700">
                                <span className="text-gray-500">Registration fee: </span>
                                <span>{registration.is_registration_fees_paid ? 'Paid' : 'Not Paid'}</span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                            <button
                              onClick={() => handleSelectExistingRegistration(registration)}
                              disabled={isActive}
                              className={`px-3 py-1.5 rounded-md font-medium text-xs ${
                                isActive
                                  ? 'bg-teal-200 text-teal-800 cursor-not-allowed'
                                  : `${colorClasses.button} text-white hover:opacity-90`
                              }`}
                            >
                              {isActive ? 'Selected' : 'Use'}
                            </button>
                            <button
                              onClick={() => handleEditRegistration(registration)}
                              className="px-3 py-1.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors border border-blue-200 flex items-center justify-center gap-1.5"
                              title="Edit registration"
                            >
                              <FiEdit2 className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteRegistration(registration.id)}
                              className="px-3 py-1.5 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors border border-red-200 flex items-center justify-center gap-1.5"
                              title="Remove registration"
                            >
                              <FiXCircle className="w-3.5 h-3.5" />
                              Remove
                            </button>
                          </div>
                        </div>
                      )})}
                    </div>
                  ) : patientsActiveSearch && patientsListMatchesInput ? (
                    <div className="text-center py-12">
                      <FiUsers className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No patients found</h3>
                      <p className="text-gray-600">Try a different name or patient ID.</p>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <FiUsers className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No Registered Seniors</h3>
                      <p className="text-gray-600 mb-4">There are no existing registrations to display.</p>
                      <button
                        onClick={handleNewRegistration}
                        className={`px-4 py-2 rounded-lg font-medium ${colorClasses.button} text-white hover:opacity-90 transition-colors`}
                      >
                        Register New Patient 
                      </button>
                    </div>
                  )}
                  </div>

                  {/* Pagination Controls - browse list only */}
                  {visibleRegistrations.length > 0 && !patientsActiveSearch && (
                    <div className="border-t border-gray-200 p-4 bg-white">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                          {totalCountPatients > 0 && (
                            <span>Total: {totalCountPatients} patients</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              if (previousUrlPatients) {
                                setIsLoadingRegistrations(true)
                                setRegistrationsError('')
                                try {
                                  const apiRegistrations = await fetchPatientsFromAPI(previousUrlPatients)
                                  setExistingRegistrations(apiRegistrations)
                                } catch (error) {
                                  console.error('Error fetching previous page:', error)
                                  if (error.message !== 'SERVER_ERROR') {
                                    setRegistrationsError(error.message)
                                  }
                                } finally {
                                  setIsLoadingRegistrations(false)
                                }
                              }
                            }}
                            disabled={!previousUrlPatients || isLoadingRegistrations}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                              !previousUrlPatients || isLoadingRegistrations
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Previous
                          </button>
                          <button
                            onClick={async () => {
                              if (nextUrlPatients) {
                                setIsLoadingRegistrations(true)
                                setRegistrationsError('')
                                try {
                                  const apiRegistrations = await fetchPatientsFromAPI(nextUrlPatients)
                                  setExistingRegistrations(apiRegistrations)
                                } catch (error) {
                                  console.error('Error fetching next page:', error)
                                  if (error.message !== 'SERVER_ERROR') {
                                    setRegistrationsError(error.message)
                                  }
                                } finally {
                                  setIsLoadingRegistrations(false)
                                }
                              }
                            }}
                            disabled={!nextUrlPatients || isLoadingRegistrations}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                              !nextUrlPatients || isLoadingRegistrations
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sticky Footer */}
                  <div className="flex justify-end p-6 pt-4 border-t border-gray-200 bg-white rounded-b-xl sticky bottom-0 z-10">
                    <button
                      onClick={handleCloseExistingRegistrations}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete Registration Confirmation Dialog */}
            {registrationToDelete && (
              <div className="fixed inset-0 bg-white/10 backdrop-blur-md flex items-center justify-center z-60 p-4">
                <div className="bg-white rounded-xl p-6 max-w-md w-full border-2 border-black">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                      <FiXCircle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Remove Registration</h3>
                      <p className="text-sm text-gray-600">This action cannot be undone</p>
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <p className="text-gray-700 mb-3">
                      Are you sure you want to remove this registration? This will permanently delete all information for this senior.
                    </p>
                    {existingRegistrations.find(reg => reg.id === registrationToDelete) && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p className="text-sm font-medium text-gray-900">
                          {existingRegistrations.find(reg => reg.id === registrationToDelete).fullName}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          {existingRegistrations.find(reg => reg.id === registrationToDelete).email}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={handleCancelDelete}
                      disabled={isDeletingRegistration}
                      className={`flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors ${
                        isDeletingRegistration ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmDelete}
                      disabled={isDeletingRegistration}
                      className={`flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 ${
                        isDeletingRegistration ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {isDeletingRegistration ? (
                        <>
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Deleting...
                        </>
                      ) : (
                        'Remove Registration'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Contact & Info */}
          <div className="space-y-4 sm:space-y-6">
            {/* Get in Touch */}
            <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-2">Get in Touch</h3>
              <div className="space-y-2">
                <button 
                  onClick={handleBookNow} 
                  disabled={
                    (currentStep === 1 && (!selectedLocationType || (selectedLocationType === 'Client Location' && !hasClientLocationDetails))) ||
                    (currentStep === 2 && !selectedServiceOption) ||
                    (currentStep === 3 && !selectedPackage) ||
                    (currentStep === 4 && (selectedDates.length === 0 || !isHourlySelectionComplete)) ||
                    (currentStep === 5 && (selectedDates.length === 0 || !isHourlySelectionComplete))
                  }
                  className={`w-full py-2 sm:py-3 px-3 sm:px-4 rounded-lg font-medium transition-colors text-sm sm:text-base ${
                    ((currentStep === 1 && (!selectedLocationType || (selectedLocationType === 'Client Location' && !hasClientLocationDetails))) ||
                     (currentStep === 2 && !selectedServiceOption) ||
                     (currentStep === 3 && !selectedPackage) ||
                     (currentStep === 4 && (selectedDates.length === 0 || !isHourlySelectionComplete)) ||
                     (currentStep === 5 && (selectedDates.length === 0 || !isHourlySelectionComplete)))
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : `${colorClasses.button} text-white hover:opacity-90`
                  }`}
                >
                  {currentStep === 1 
                    ? (selectedLocationType ? 'Continue to Booking' : 'Please select location')
                    : currentStep === 2 
                    ? 'Continue to Package Selection'
                    : currentStep === 3 
                    ? (selectedPackage ? 'Continue to Date Selection' : 'Please select a package')
                    : currentStep === 4 
                    ? (selectedDates.length === 0
                        ? 'Select at least one date'
                        : !isHourlySelectionComplete
                          ? 'Set valid times for each date'
                          : 'Continue to Review')
                    : currentStep === 5
                    ? 'Final Booking'
                    : 'Continue to Next Step'}
                </button>
                <button className="w-full border border-gray-300 text-gray-700 py-2 sm:py-3 px-3 sm:px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base">
                  <FiPhone className="w-4 h-4" />
                  Call Now for Booking
                </button>
                <button className="w-full border border-gray-300 text-gray-700 py-2 sm:py-3 px-3 sm:px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base">
                  <FiMail className="w-4 h-4" />
                  Send Email
                </button>
              </div>
              
              {/* Selected Options Display */}
              {(selectedCaregiver || selectedLocationType || selectedPackage || selectedDate) && (
                <div className="mt-3 sm:mt-4 space-y-2">
                  {selectedCaregiver && (
                    <div 
                      onClick={() => setCurrentStep(2)}
                      className="p-2 sm:p-3 bg-green-50 border border-green-200 rounded-lg cursor-pointer hover:bg-green-100 transition-colors group relative"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <FiCheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
                          <span className="text-xs sm:text-sm font-medium text-green-900">Service:</span>
                        </div>
                        <FiEdit2 className="w-3 h-3 sm:w-4 sm:h-4 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-xs sm:text-sm text-green-700 mt-1">{selectedCaregiver}</p>
                    </div>
                  )}
                  
                  {selectedLocationType && (
                    <div 
                      onClick={() => setCurrentStep(1)}
                      className="p-2 sm:p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors group relative"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <FiMapPin className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" />
                          <span className="text-xs sm:text-sm font-medium text-blue-900">Location:</span>
                        </div>
                        <FiEdit2 className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p
                        className="text-xs sm:text-sm text-blue-700 mt-1 wrap-break-word break-all whitespace-normal"
                        title={selectedLocationType === 'Client Location' ? `${clientName} - ${effectiveClientAddress}` : ''}
                      >
                        {selectedLocationType === 'Client Location' ? `${clientName} - ${effectiveClientAddress}` : ''}
                      </p>
                    </div>
                  )}
                  
                  {selectedPackage && (
                    <div 
                      onClick={() => setCurrentStep(3)}
                      className="p-2 sm:p-3 bg-purple-50 border border-purple-200 rounded-lg cursor-pointer hover:bg-purple-100 transition-colors group relative"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <FiCheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-purple-600" />
                          <span className="text-xs sm:text-sm font-medium text-purple-900">Package:</span>
                        </div>
                        <FiEdit2 className="w-3 h-3 sm:w-4 sm:h-4 text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-xs sm:text-sm text-purple-700 mt-1">{selectedPackage.name}</p>
                    </div>
                  )}
                  
                  {selectedDates.length > 0 && (
                    <div 
                      onClick={() => setCurrentStep(4)}
                      className="p-2 sm:p-3 bg-orange-50 border border-orange-200 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors group relative"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <FiCalendar className="w-3 h-3 sm:w-4 sm:h-4 text-orange-600" />
                          <span className="text-xs sm:text-sm font-medium text-orange-900">Selected Dates:</span>
                        </div>
                        <FiEdit2 className="w-3 h-3 sm:w-4 sm:h-4 text-orange-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="text-xs sm:text-sm text-orange-700 mt-1">
                        <div>
                          <span className="font-medium">Start:</span>
                          {' '}
                          {new Date(Math.min(...selectedDates.map(d => new Date(d)))).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                        <div>
                          <span className="font-medium">End:</span>
                          {' '}
                          {new Date(Math.max(...selectedDates.map(d => new Date(d)))).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                        <div className="text-gray-700">
                          {selectedDates.length} date{selectedDates.length > 1 ? 's' : ''} selected
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Info */}
           
          </div>
        </div>
      </div>

      {/* Global Loading Overlay for API Operations */}
      {(isSubmittingRegistration || isDeletingRegistration || isLoadingRegistrations) && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-100">
          <div className="bg-white rounded-xl p-8 shadow-2xl max-w-sm w-full mx-4">
            <div className="flex flex-col items-center justify-center">
              <svg className="animate-spin h-12 w-12 text-teal-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-gray-700 font-medium text-lg">
                {isSubmittingRegistration && (isEditingRegistration ? 'Updating patient...' : 'Submitting registration...')}
                {isDeletingRegistration && 'Deleting patient...'}
                {isLoadingRegistrations && 'Loading patients...'}
              </p>
              <p className="text-gray-500 text-sm mt-2">Please wait</p>
            </div>
          </div>
        </div>
      )}

      {/* Server Error Modal */}
      {serverError && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-110 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full border-2 border-red-200 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900">Server Error</h3>
                <p className="text-sm text-gray-600 mt-1">Status Code: {serverError.status || 500}</p>
              </div>
              <button
                onClick={() => setServerError(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <FiXCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-700 mb-3 font-medium">
                {serverError.message}
              </p>
              {serverError.details && serverError.details !== serverError.message && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-600 font-medium mb-1">Technical Details:</p>
                  <p className="text-xs text-gray-500">{serverError.details}</p>
                </div>
              )}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>What you can do:</strong>
                </p>
                <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
                  <li>Wait a few moments and try again</li>
                  <li>Check your internet connection</li>
                  <li>If the problem persists, contact support</li>
                </ul>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setServerError(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Close
              </button>
              {serverError.onRetry && (
                <button
                  onClick={async () => {
                    setServerError(null)
                    try {
                      await serverError.onRetry()
                    } catch (error) {
                      // Error will be handled by the API function
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

    {showUpfrontPaymentModal && (
      <div
        className="fixed inset-0 z-[210] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upfront-payment-modal-title"
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/45 backdrop-blur-sm"
          aria-label="Close upfront payment"
          onClick={handleCloseUpfrontPaymentModal}
          disabled={isSubmittingUpfrontPayment}
        />
        <div
          className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 id="upfront-payment-modal-title" className="text-lg font-semibold text-gray-900">
                Upfront payment
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Booking created successfully. Record upfront payment to continue.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCloseUpfrontPaymentModal}
              disabled={isSubmittingUpfrontPayment}
              className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Close upfront payment"
            >
              <FiX className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Order ID</label>
              <input
                type="text"
                value={upfrontPaymentOrderId ?? ''}
                readOnly
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={upfrontPaymentForm.amount}
                onChange={(e) =>
                  setUpfrontPaymentForm((prev) => ({ ...prev, amount: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Payment method</label>
              <select
                value={upfrontPaymentForm.method}
                onChange={(e) =>
                  setUpfrontPaymentForm((prev) => ({ ...prev, method: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
              >
                {UPFRONT_PAYMENT_METHODS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Reference</label>
              <input
                type="text"
                value={upfrontPaymentForm.reference}
                onChange={(e) =>
                  setUpfrontPaymentForm((prev) => ({ ...prev, reference: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Paid date</label>
              <input
                type="date"
                value={upfrontPaymentForm.paidDate}
                onChange={(e) =>
                  setUpfrontPaymentForm((prev) => ({ ...prev, paidDate: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {upfrontPaymentError ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {upfrontPaymentError}
              </p>
            ) : null}
          </div>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={handleCloseUpfrontPaymentModal}
              disabled={isSubmittingUpfrontPayment}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSubmitUpfrontPayment}
              disabled={isSubmittingUpfrontPayment}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white ${colorClasses.button} hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {isSubmittingUpfrontPayment
                ? 'Recording payment...'
                : upfrontPaymentError
                  ? 'Try again'
                  : 'Record upfront payment'}
            </button>
          </div>
        </div>
      </div>
    )}

    {showNoPackageRequestModal && (
      <div className="fixed inset-0 z-200 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="no-package-request-modal-title">
        <button
          type="button"
          aria-label="Close and return to home"
          className="absolute inset-0 bg-black/45 backdrop-blur-sm"
          onClick={closeNoPackageRequestModalAndGoHome}
        />
        <div
          className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-1 flex items-start justify-between gap-2 border-b border-gray-100 bg-white px-4 py-3">
            <h2 id="no-package-request-modal-title" className="text-base font-semibold text-gray-900 pr-2">
              {packageRequestSubmitted ? 'Request received' : 'Request a service'}
            </h2>
            <button
              type="button"
              onClick={closeNoPackageRequestModalAndGoHome}
              className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              aria-label="Close and return to home"
            >
              <FiX className="h-5 w-5" />
            </button>
          </div>
          <div className="p-5">
            {packageRequestSubmitted ? (
              <div className="space-y-5">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                  <p className="font-medium text-green-950">Thank you for contacting us.</p>
                  <p className="mt-1">Our executive will get back to you within 24 hours.</p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={closeNoPackageRequestModalAndGoHome}
                    className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white ${colorClasses.button} hover:opacity-90`}
                  >
                    Go to home
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handlePackageRequestSubmit} className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Patient Name</p>
                    <p className="text-base font-semibold text-slate-900">{(clientName || activeRegistration?.fullName || '—').trim() || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Service Address</p>
                    <p className="text-base font-semibold text-slate-900 wrap-break-word">{(effectiveClientAddress || activeRegistration?.address || '—').trim() || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Mobile Number</p>
                    <p className="text-base font-semibold text-slate-900">{(activeRegistration?.phone || '—').trim() || '—'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Service Selected</label>
                    <input
                      type="text"
                      value={packageRequestForm.serviceWanted}
                      onChange={(e) => handlePackageRequestInputChange('serviceWanted', e.target.value)}
                      className={`w-full p-2 text-sm border rounded-lg text-gray-900 ${packageRequestErrors.serviceWanted ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {packageRequestErrors.serviceWanted && <p className="text-red-500 text-xs mt-1">{packageRequestErrors.serviceWanted}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:col-span-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Start date</label>
                      <input
                        type="date"
                        value={packageRequestForm.durationStartDate}
                        onChange={(e) => handlePackageRequestInputChange('durationStartDate', e.target.value)}
                        min={packageRequestMinDate}
                        className={`w-full p-2 text-sm border rounded-lg text-gray-900 ${packageRequestErrors.durationStartDate ? 'border-red-500' : 'border-gray-300'}`}
                      />
                      {packageRequestErrors.durationStartDate && <p className="text-red-500 text-xs mt-1">{packageRequestErrors.durationStartDate}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">End date</label>
                      <input
                        type="date"
                        value={packageRequestForm.durationEndDate}
                        onChange={(e) => handlePackageRequestInputChange('durationEndDate', e.target.value)}
                        min={packageRequestForm.durationStartDate || packageRequestMinDate}
                        className={`w-full p-2 text-sm border rounded-lg text-gray-900 ${packageRequestErrors.durationEndDate ? 'border-red-500' : 'border-gray-300'}`}
                      />
                      {packageRequestErrors.durationEndDate && <p className="text-red-500 text-xs mt-1">{packageRequestErrors.durationEndDate}</p>}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      rows={3}
                      value={packageRequestForm.description}
                      onChange={(e) => handlePackageRequestInputChange('description', e.target.value)}
                      className={`w-full p-2 text-sm border rounded-lg text-gray-900 ${packageRequestErrors.description ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {packageRequestErrors.description && <p className="text-red-500 text-xs mt-1">{packageRequestErrors.description}</p>}
                  </div>
                </div>
                {(packageRequestErrors.patientName || packageRequestErrors.address || packageRequestErrors.mobileNumber) && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    {packageRequestErrors.patientName || packageRequestErrors.address || packageRequestErrors.mobileNumber}
                  </div>
                )}
                {packageRequestErrors.submit && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    {packageRequestErrors.submit}
                  </div>
                )}
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isSubmittingPackageRequest}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${colorClasses.button} text-white hover:opacity-90`}
                  >
                    {isSubmittingPackageRequest ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    )}

    <AlertModal open={alertState.open} type={alertState.type} message={alertState.message} onClose={closeAlert} />
    </>
  )
}

export default SeniorCare