import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { FiLoader, FiX } from 'react-icons/fi'

const FIELD_CLASS =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:cursor-not-allowed disabled:bg-slate-100'

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-slate-700'

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address: '',
  age: '',
  emergency_contact: '',
  emergency_phone: '',
  medical_conditions: '',
  allergies: '',
  present_health_condition: '',
  gender: '',
  blood_group: '',
  preferred_language: '',
  education_qualifications: '',
  earlier_occupation: '',
  year_of_retirement: '',
}

const patientLabel = (patient) => {
  const full = String(patient?.full_name ?? '').trim()
  if (full) return full
  const name = [patient?.first_name, patient?.last_name].filter(Boolean).join(' ').trim()
  if (name) return name
  if (patient?.patient_id) return `Patient ${patient.patient_id}`
  if (patient?.id != null) return `Patient #${patient.id}`
  return 'Patient'
}

const toFormState = (patient) => ({
  first_name: String(patient?.first_name ?? '').trim(),
  last_name: String(patient?.last_name ?? '').trim(),
  email: String(patient?.email ?? '').trim(),
  phone: String(patient?.phone ?? patient?.mobile_number ?? '').trim(),
  address: String(patient?.address ?? '').trim(),
  age: patient?.age != null && patient?.age !== '' ? String(patient.age) : '',
  emergency_contact: String(patient?.emergency_contact ?? '').trim(),
  emergency_phone: String(patient?.emergency_phone ?? '').trim(),
  medical_conditions: String(patient?.medical_conditions ?? '').trim(),
  allergies: String(patient?.allergies ?? '').trim(),
  present_health_condition: String(patient?.present_health_condition ?? '').trim(),
  gender: String(patient?.gender ?? '').trim(),
  blood_group: String(patient?.blood_group ?? '').trim(),
  preferred_language: String(patient?.preferred_language ?? '').trim(),
  education_qualifications: String(patient?.education_qualifications ?? '').trim(),
  earlier_occupation: String(patient?.earlier_occupation ?? '').trim(),
  year_of_retirement:
    patient?.year_of_retirement != null && patient?.year_of_retirement !== ''
      ? String(patient.year_of_retirement)
      : '',
})

const nullableNumber = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

const buildPatchPayload = (form) => ({
  first_name: String(form.first_name || '').trim(),
  last_name: String(form.last_name || '').trim(),
  email: String(form.email || '').trim(),
  phone: String(form.phone || '').trim(),
  address: String(form.address || '').trim(),
  age: nullableNumber(form.age),
  emergency_contact: String(form.emergency_contact || '').trim(),
  emergency_phone: String(form.emergency_phone || '').trim(),
  medical_conditions: String(form.medical_conditions || '').trim(),
  allergies: String(form.allergies || '').trim(),
  present_health_condition: String(form.present_health_condition || '').trim(),
  gender: String(form.gender || '').trim(),
  blood_group: String(form.blood_group || '').trim(),
  preferred_language: String(form.preferred_language || '').trim(),
  education_qualifications: String(form.education_qualifications || '').trim(),
  earlier_occupation: String(form.earlier_occupation || '').trim(),
  year_of_retirement: nullableNumber(form.year_of_retirement),
})

const friendlySaveError = (error) => {
  const status = error?.response?.status
  if (status === 401 || status === 403) {
    return 'You do not have permission to edit this patient. Please sign in again.'
  }
  if (status === 404) return 'Patient was not found. It may have been deleted.'
  if (status >= 500) return 'The server is unavailable right now. Please try again shortly.'
  if (!error?.response && String(error?.message || '').toLowerCase().includes('network')) {
    return 'Network error. Check your connection and try again.'
  }
  const data = error?.response?.data
  if (typeof data === 'string' && data.trim()) return data.trim()
  if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail.trim()
  if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim()
  if (data && typeof data === 'object') {
    const firstKey = Object.keys(data)[0]
    const value = data[firstKey]
    if (Array.isArray(value) && value[0]) return `${firstKey}: ${String(value[0])}`
    if (typeof value === 'string') return `${firstKey}: ${value}`
  }
  return 'Unable to update patient. Please try again.'
}

const CustomerPatientEditModal = ({ patient, onClose, onSaved }) => {
  const titleId = useId()
  const panelRef = useRef(null)
  const firstFieldRef = useRef(null)
  const [form, setForm] = useState(() => toFormState(patient))
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [visible, setVisible] = useState(false)

  const patientId = patient?.id
  const displayName = patientLabel(patient)

  useEffect(() => {
    setForm(toFormState(patient))
    setFieldErrors({})
    setError('')
  }, [patient])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    firstFieldRef.current?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !isSaving) {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isSaving, onClose])

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const validate = () => {
    const errors = {}
    if (!String(form.first_name || '').trim()) errors.first_name = 'First name is required'
    if (!String(form.phone || '').trim()) errors.phone = 'Phone is required'
    if (form.age !== '' && !Number.isFinite(Number(form.age))) {
      errors.age = 'Enter a valid age'
    }
    if (form.year_of_retirement !== '' && !Number.isFinite(Number(form.year_of_retirement))) {
      errors.year_of_retirement = 'Enter a valid year'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!validate()) return
    if (patientId == null || patientId === '') {
      setError('Invalid patient id.')
      return
    }

    setIsSaving(true)
    try {
      const token = localStorage.getItem('access_token')
      if (!token) throw new Error('Authorization token missing. Please log in again.')
      const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '')
      const response = await axios.patch(
        `${baseUrl}/booking/patients/${encodeURIComponent(patientId)}/`,
        buildPatchPayload(form),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      onSaved?.(response.data || { ...patient, ...buildPatchPayload(form) })
      onClose()
    } catch (err) {
      setError(friendlySaveError(err))
    } finally {
      setIsSaving(false)
    }
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4 ${
        visible ? 'opacity-100' : 'opacity-0'
      } transition-opacity duration-200`}
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Close edit patient dialog"
        disabled={isSaving}
        onClick={() => {
          if (!isSaving) onClose()
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl ${
          visible ? 'translate-y-0 scale-100' : 'translate-y-2 scale-[0.98]'
        } transition-transform duration-200 ease-out`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              Edit patient
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{displayName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            aria-label="Close"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
            {error ? (
              <div
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Basic details
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL_CLASS} htmlFor="edit-patient-first-name">
                    First name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    ref={firstFieldRef}
                    id="edit-patient-first-name"
                    value={form.first_name}
                    onChange={(e) => update('first_name', e.target.value)}
                    disabled={isSaving}
                    className={FIELD_CLASS}
                    autoComplete="given-name"
                  />
                  {fieldErrors.first_name ? (
                    <p className="mt-1 text-xs text-rose-600">{fieldErrors.first_name}</p>
                  ) : null}
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="edit-patient-last-name">
                    Last name
                  </label>
                  <input
                    id="edit-patient-last-name"
                    value={form.last_name}
                    onChange={(e) => update('last_name', e.target.value)}
                    disabled={isSaving}
                    className={FIELD_CLASS}
                    autoComplete="family-name"
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="edit-patient-phone">
                    Phone <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="edit-patient-phone"
                    value={form.phone}
                    onChange={(e) => update('phone', e.target.value)}
                    disabled={isSaving}
                    className={FIELD_CLASS}
                    inputMode="tel"
                    autoComplete="tel"
                  />
                  {fieldErrors.phone ? (
                    <p className="mt-1 text-xs text-rose-600">{fieldErrors.phone}</p>
                  ) : null}
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="edit-patient-email">
                    Email
                  </label>
                  <input
                    id="edit-patient-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update('email', e.target.value)}
                    disabled={isSaving}
                    className={FIELD_CLASS}
                    autoComplete="email"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={LABEL_CLASS} htmlFor="edit-patient-address">
                    Address
                  </label>
                  <textarea
                    id="edit-patient-address"
                    value={form.address}
                    onChange={(e) => update('address', e.target.value)}
                    disabled={isSaving}
                    rows={2}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="edit-patient-age">
                    Age
                  </label>
                  <input
                    id="edit-patient-age"
                    value={form.age}
                    onChange={(e) => update('age', e.target.value)}
                    disabled={isSaving}
                    className={FIELD_CLASS}
                    inputMode="numeric"
                  />
                  {fieldErrors.age ? (
                    <p className="mt-1 text-xs text-rose-600">{fieldErrors.age}</p>
                  ) : null}
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="edit-patient-gender">
                    Gender
                  </label>
                  <select
                    id="edit-patient-gender"
                    value={form.gender}
                    onChange={(e) => update('gender', e.target.value)}
                    disabled={isSaving}
                    className={FIELD_CLASS}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="edit-patient-blood-group">
                    Blood group
                  </label>
                  <select
                    id="edit-patient-blood-group"
                    value={form.blood_group}
                    onChange={(e) => update('blood_group', e.target.value)}
                    disabled={isSaving}
                    className={FIELD_CLASS}
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
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="edit-patient-language">
                    Preferred language
                  </label>
                  <input
                    id="edit-patient-language"
                    value={form.preferred_language}
                    onChange={(e) => update('preferred_language', e.target.value)}
                    disabled={isSaving}
                    className={FIELD_CLASS}
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Emergency contact
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL_CLASS} htmlFor="edit-patient-emergency-contact">
                    Emergency contact
                  </label>
                  <input
                    id="edit-patient-emergency-contact"
                    value={form.emergency_contact}
                    onChange={(e) => update('emergency_contact', e.target.value)}
                    disabled={isSaving}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="edit-patient-emergency-phone">
                    Emergency phone
                  </label>
                  <input
                    id="edit-patient-emergency-phone"
                    value={form.emergency_phone}
                    onChange={(e) => update('emergency_phone', e.target.value)}
                    disabled={isSaving}
                    className={FIELD_CLASS}
                    inputMode="tel"
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Health & background
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={LABEL_CLASS} htmlFor="edit-patient-medical">
                    Medical conditions
                  </label>
                  <textarea
                    id="edit-patient-medical"
                    value={form.medical_conditions}
                    onChange={(e) => update('medical_conditions', e.target.value)}
                    disabled={isSaving}
                    rows={2}
                    className={FIELD_CLASS}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={LABEL_CLASS} htmlFor="edit-patient-allergies">
                    Allergies
                  </label>
                  <textarea
                    id="edit-patient-allergies"
                    value={form.allergies}
                    onChange={(e) => update('allergies', e.target.value)}
                    disabled={isSaving}
                    rows={2}
                    className={FIELD_CLASS}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={LABEL_CLASS} htmlFor="edit-patient-present-health">
                    Present health condition
                  </label>
                  <textarea
                    id="edit-patient-present-health"
                    value={form.present_health_condition}
                    onChange={(e) => update('present_health_condition', e.target.value)}
                    disabled={isSaving}
                    rows={2}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="edit-patient-education">
                    Education qualifications
                  </label>
                  <input
                    id="edit-patient-education"
                    value={form.education_qualifications}
                    onChange={(e) => update('education_qualifications', e.target.value)}
                    disabled={isSaving}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="edit-patient-occupation">
                    Earlier occupation
                  </label>
                  <input
                    id="edit-patient-occupation"
                    value={form.earlier_occupation}
                    onChange={(e) => update('earlier_occupation', e.target.value)}
                    disabled={isSaving}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="edit-patient-retirement">
                    Year of retirement
                  </label>
                  <input
                    id="edit-patient-retirement"
                    value={form.year_of_retirement}
                    onChange={(e) => update('year_of_retirement', e.target.value)}
                    disabled={isSaving}
                    className={FIELD_CLASS}
                    inputMode="numeric"
                    placeholder="e.g. 2010"
                  />
                  {fieldErrors.year_of_retirement ? (
                    <p className="mt-1 text-xs text-rose-600">{fieldErrors.year_of_retirement}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <FiLoader className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Saving...
                </>
              ) : (
                'Save changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default CustomerPatientEditModal
