/** Shared helpers for launching In House / OPD / Client booking wizards with a patient preselected. */

export const BOOKING_CREATE_TYPES = {
  IN_HOUSE: 'IN_HOUSE',
  OPD: 'OPD',
  CLIENT_SIDE: 'CLIENT_SIDE',
}

export const BOOKING_CREATE_TYPE_OPTIONS = [
  {
    value: BOOKING_CREATE_TYPES.IN_HOUSE,
    label: 'In House (Inpatient Care)',
    description: 'Facility stay at Vaishnavi Medicare premises',
  },
  {
    value: BOOKING_CREATE_TYPES.OPD,
    label: 'OPD',
    description: 'Outpatient services',
  },
  {
    value: BOOKING_CREATE_TYPES.CLIENT_SIDE,
    label: 'Client Location',
    description: 'Care at the patient’s home / client address',
  },
]

export const getBookingCreatePath = (bookingType) => {
  if (bookingType === BOOKING_CREATE_TYPES.CLIENT_SIDE) return '/senior-care'
  return '/in-house'
}

/** Maps dashboard create-type to InHouse.jsx locationType values. */
export const getInHouseLocationType = (bookingType) => {
  if (bookingType === BOOKING_CREATE_TYPES.IN_HOUSE) return 'In House'
  if (bookingType === BOOKING_CREATE_TYPES.OPD) return 'Client Location'
  return null
}

/** Normalize GET /booking/patients/ (or dropdown) row into SeniorCare/InHouse registration shape. */
export const mapApiPatientToRegistration = (patient) => {
  if (!patient || typeof patient !== 'object') return null
  const id = patient.id ?? patient.pk
  if (id == null || id === '') return null

  const firstName = String(patient.first_name || '').trim()
  const lastName = String(patient.last_name || '').trim()
  const fullName =
    `${firstName} ${lastName}`.trim() ||
    String(patient.full_name || patient.name || patient.name_registered_by || '').trim() ||
    `Patient #${id}`

  return {
    id,
    apiId: id,
    apiResponse: patient,
    firstName,
    lastName,
    fullName,
    email: patient.email || '',
    phone: patient.phone || patient.mobile_number || '',
    countryCode: '+91',
    address: patient.address || '',
    dateOfBirth: '',
    dontKnowDOB: true,
    age: patient.age != null && patient.age !== '' ? String(patient.age) : '',
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
    yearOfRetirement: patient.year_of_retirement != null ? String(patient.year_of_retirement) : '',
    presentHealthCondition: patient.present_health_condition || '',
    registrationFee: patient.registration_fee || '5000.00',
    is_registration_fees_paid: patient.is_registration_fees_paid === true,
    advancePayment: patient.advance_payment || '',
    paymentMode: patient.payment_mode || '',
    status: patient.is_active === false ? 'Inactive' : 'Active',
    dateOfRegistration: patient.registration_date
      ? new Date(patient.registration_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    registeredBy: patient.registered_by,
    nameRegisteredBy: patient.name_registered_by || '',
    updatedAt: patient.updated_at || '',
    patient_id: patient.patient_id || null,
    selectedPackage: undefined,
    caregiverType: undefined,
    location: undefined,
    locationDetails: undefined,
    selectedDates: [],
  }
}
