import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FiArrowLeft, FiEye, FiEyeOff, FiUserPlus, FiUsers } from 'react-icons/fi'
import axios from 'axios'
import AlertModal from '../components/AlertModal'
import { isMasterAdmin } from '../utils/authRoles'

const PERSONA_OPTIONS = [
  {
    id: 'owner',
    label: 'Create Owner',
    description: 'Create a VSRE Owner account.',
    endpoint: '/accounts/register/owner/',
    detailsTitle: 'Owner details',
    submitLabel: 'Create Owner',
    failFallback: 'Failed to create owner.',
    available: true,
  },
  {
    id: 'tenant_manager',
    label: 'Create Tenant Manager',
    description: 'API in progress — coming soon.',
    endpoint: '',
    detailsTitle: 'Tenant Manager details',
    submitLabel: 'Create Tenant Manager',
    failFallback: 'Failed to create tenant manager.',
    available: false,
  },
]

const EMPTY_FORM = {
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  mobileNumber: '',
  gender: '',
  address: '',
  city: '',
  password: '',
  confirmPassword: '',
}

const fieldClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:cursor-not-allowed disabled:bg-slate-100'

const labelClass = 'mb-1 block text-xs font-medium text-slate-700'

const extractErrorMessage = (data, fallback) => {
  if (!data) return fallback
  if (typeof data === 'string' && data.trim()) return data.trim()
  if (typeof data.detail === 'string') return data.detail
  if (typeof data.message === 'string') return data.message
  if (typeof data.error === 'string') return data.error
  if (typeof data === 'object') {
    const firstKey = Object.keys(data)[0]
    const value = data[firstKey]
    if (Array.isArray(value) && value[0]) return String(value[0])
    if (typeof value === 'string') return value
  }
  return fallback
}

const CreatePersona = () => {
  const navigate = useNavigate()
  const [authUser, setAuthUser] = useState(null)
  const [personaType, setPersonaType] = useState('owner')
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [status, setStatus] = useState({ type: '', message: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [successAlertOpen, setSuccessAlertOpen] = useState(false)
  const [successAlertMessage, setSuccessAlertMessage] = useState('Create user is successful.')

  useEffect(() => {
    try {
      const raw = localStorage.getItem('authUser')
      setAuthUser(raw ? JSON.parse(raw) : null)
    } catch {
      setAuthUser(null)
    }
  }, [])

  const allowed = useMemo(() => isMasterAdmin(authUser), [authUser])

  const selectedPersona = useMemo(
    () => PERSONA_OPTIONS.find((option) => option.id === personaType) || PERSONA_OPTIONS[0],
    [personaType]
  )

  useEffect(() => {
    if (authUser && !allowed) {
      navigate('/dashboard', { replace: true })
    }
  }, [authUser, allowed, navigate])

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const selectPersona = (nextType) => {
    const option = PERSONA_OPTIONS.find((item) => item.id === nextType)
    if (!option?.available || nextType === personaType) return
    setPersonaType(nextType)
    setForm(EMPTY_FORM)
    setFieldErrors({})
    setStatus({ type: '', message: '' })
  }

  const validate = () => {
    const errors = {}
    if (!form.firstName.trim()) errors.firstName = 'First name is required'
    if (!form.lastName.trim()) errors.lastName = 'Last name is required'
    if (!form.email.trim()) errors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email'
    if (!form.mobileNumber.trim()) errors.mobileNumber = 'Mobile number is required'
    else if (!/^\d{10}$/.test(form.mobileNumber.trim().replace(/\D/g, '').slice(-10))) {
      errors.mobileNumber = 'Enter a valid 10-digit mobile number'
    }
    if (!form.password) errors.password = 'Password is required'
    else if (form.password.length < 8) errors.password = 'Password must be at least 8 characters'
    if (!form.confirmPassword) errors.confirmPassword = 'Confirm password is required'
    else if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setStatus({ type: '', message: '' })
    if (!validate()) return
    if (!selectedPersona.available || !selectedPersona.endpoint) {
      setStatus({
        type: 'error',
        message: 'Tenant Manager creation is not available yet. The API is still in progress.',
      })
      return
    }

    const accessToken = localStorage.getItem('access_token')
    if (!accessToken) {
      setStatus({ type: 'error', message: 'Authorization token missing. Please log in again.' })
      return
    }

    setIsSubmitting(true)
    try {
      const mobile = form.mobileNumber.trim().replace(/\D/g, '').slice(-10)
      const payload = {
        email: form.email.trim(),
        mobile_number: mobile,
        first_name: form.firstName.trim(),
        middle_name: form.middleName.trim() || '',
        last_name: form.lastName.trim(),
        gender: form.gender || '',
        address: form.address.trim() || '',
        city: form.city.trim() || '',
        password: form.password,
        confirm_password: form.confirmPassword,
      }

      const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
      const response = await axios.post(`${baseUrl}${selectedPersona.endpoint}`, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      const message =
        response.data?.message ||
        response.data?.detail ||
        'Create user is successful.'
      setForm(EMPTY_FORM)
      setFieldErrors({})
      setStatus({ type: '', message: '' })
      setSuccessAlertMessage(message)
      setSuccessAlertOpen(true)
    } catch (error) {
      const data = error?.response?.data
      const message = extractErrorMessage(data, error?.message || selectedPersona.failFallback)
      setStatus({ type: 'error', message })

      if (data && typeof data === 'object') {
        const nextFieldErrors = {}
        if (data.email) nextFieldErrors.email = Array.isArray(data.email) ? data.email[0] : String(data.email)
        if (data.mobile_number) {
          nextFieldErrors.mobileNumber = Array.isArray(data.mobile_number)
            ? data.mobile_number[0]
            : String(data.mobile_number)
        }
        if (data.password) {
          nextFieldErrors.password = Array.isArray(data.password) ? data.password[0] : String(data.password)
        }
        if (data.confirm_password) {
          nextFieldErrors.confirmPassword = Array.isArray(data.confirm_password)
            ? data.confirm_password[0]
            : String(data.confirm_password)
        }
        if (Object.keys(nextFieldErrors).length) setFieldErrors(nextFieldErrors)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSuccessAlertClose = () => {
    setSuccessAlertOpen(false)
    navigate('/')
  }

  if (!authUser) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-slate-600">Please log in as Master Admin to create a persona.</p>
        <Link to="/login" className="mt-4 inline-flex text-sm font-medium text-teal-700 hover:underline">
          Go to login
        </Link>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-slate-600">Only Master Admin can create personas.</p>
        <Link to="/dashboard" className="mt-4 inline-flex text-sm font-medium text-teal-700 hover:underline">
          Back to dashboard
        </Link>
      </div>
    )
  }

  const idPrefix = selectedPersona.id

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-teal-700"
          >
            <FiArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back
          </button>
          <h1 className="text-xl font-semibold text-slate-900">Create Persona</h1>
          <p className="mt-1 text-sm text-slate-500">
            Choose a persona type, then fill in the details. Available only to Master Admin.
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Persona type">
        {PERSONA_OPTIONS.map((option) => {
          const selected = personaType === option.id
          const unavailable = !option.available
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={unavailable}
              disabled={isSubmitting || unavailable}
              onClick={() => selectPersona(option.id)}
              title={unavailable ? 'Tenant Manager API is still in progress' : undefined}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                unavailable
                  ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-80'
                  : selected
                    ? 'border-teal-500 bg-teal-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
              } disabled:cursor-not-allowed`}
            >
              <span className="flex items-start gap-3">
                <span
                  className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    unavailable
                      ? 'bg-slate-200 text-slate-400'
                      : selected
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {option.id === 'owner' ? (
                    <FiUserPlus className="h-4 w-4" aria-hidden />
                  ) : (
                    <FiUsers className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-semibold ${unavailable ? 'text-slate-500' : 'text-slate-900'}`}>
                      {option.label}
                    </span>
                    {unavailable ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                        Coming soon
                      </span>
                    ) : null}
                  </span>
                  <span className={`mt-0.5 block text-xs ${unavailable ? 'text-slate-400' : 'text-slate-500'}`}>
                    {option.description}
                  </span>
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        noValidate
      >
        <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-teal-700">
            <FiUserPlus className="h-4 w-4" aria-hidden />
          </span>
          {selectedPersona.detailsTitle}
        </div>

        {status.message ? (
          <div
            className={`mb-4 rounded-lg px-3 py-2 text-sm ${
              status.type === 'success'
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border border-rose-200 bg-rose-50 text-rose-800'
            }`}
            role="status"
          >
            {status.message}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor={`${idPrefix}-first-name`} className={labelClass}>
              First name <span className="text-rose-500">*</span>
            </label>
            <input
              id={`${idPrefix}-first-name`}
              type="text"
              value={form.firstName}
              onChange={(e) => update('firstName', e.target.value)}
              disabled={isSubmitting}
              className={fieldClass}
              autoComplete="given-name"
            />
            {fieldErrors.firstName ? (
              <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.firstName}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor={`${idPrefix}-middle-name`} className={labelClass}>
              Middle name
            </label>
            <input
              id={`${idPrefix}-middle-name`}
              type="text"
              value={form.middleName}
              onChange={(e) => update('middleName', e.target.value)}
              disabled={isSubmitting}
              className={fieldClass}
              autoComplete="additional-name"
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-last-name`} className={labelClass}>
              Last name <span className="text-rose-500">*</span>
            </label>
            <input
              id={`${idPrefix}-last-name`}
              type="text"
              value={form.lastName}
              onChange={(e) => update('lastName', e.target.value)}
              disabled={isSubmitting}
              className={fieldClass}
              autoComplete="family-name"
            />
            {fieldErrors.lastName ? (
              <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.lastName}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idPrefix}-email`} className={labelClass}>
              Email <span className="text-rose-500">*</span>
            </label>
            <input
              id={`${idPrefix}-email`}
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              disabled={isSubmitting}
              className={fieldClass}
              autoComplete="email"
            />
            {fieldErrors.email ? <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.email}</p> : null}
          </div>
          <div>
            <label htmlFor={`${idPrefix}-mobile`} className={labelClass}>
              Mobile number <span className="text-rose-500">*</span>
            </label>
            <input
              id={`${idPrefix}-mobile`}
              type="tel"
              value={form.mobileNumber}
              onChange={(e) => update('mobileNumber', e.target.value)}
              disabled={isSubmitting}
              className={fieldClass}
              autoComplete="tel"
              inputMode="numeric"
            />
            {fieldErrors.mobileNumber ? (
              <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.mobileNumber}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idPrefix}-gender`} className={labelClass}>
              Gender
            </label>
            <select
              id={`${idPrefix}-gender`}
              value={form.gender}
              onChange={(e) => update('gender', e.target.value)}
              disabled={isSubmitting}
              className={fieldClass}
            >
              <option value="">Select</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${idPrefix}-city`} className={labelClass}>
              City
            </label>
            <input
              id={`${idPrefix}-city`}
              type="text"
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
              disabled={isSubmitting}
              className={fieldClass}
              autoComplete="address-level2"
            />
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor={`${idPrefix}-address`} className={labelClass}>
            Address
          </label>
          <textarea
            id={`${idPrefix}-address`}
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
            disabled={isSubmitting}
            rows={3}
            className={fieldClass}
            autoComplete="street-address"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idPrefix}-password`} className={labelClass}>
              Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id={`${idPrefix}-password`}
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                disabled={isSubmitting}
                className={`${fieldClass} pr-10`}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.password ? (
              <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.password}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor={`${idPrefix}-confirm-password`} className={labelClass}>
              Confirm password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id={`${idPrefix}-confirm-password`}
                type={showConfirmPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(e) => update('confirmPassword', e.target.value)}
                disabled={isSubmitting}
                className={`${fieldClass} pr-10`}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirmPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.confirmPassword ? (
              <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.confirmPassword}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Creating…' : selectedPersona.submitLabel}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              setForm(EMPTY_FORM)
              setFieldErrors({})
              setStatus({ type: '', message: '' })
            }}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear
          </button>
        </div>
      </form>

      <AlertModal
        open={successAlertOpen}
        type="success"
        title="Success"
        message={successAlertMessage || 'Create user is successful.'}
        onClose={handleSuccessAlertClose}
      />
    </div>
  )
}

export default CreatePersona
