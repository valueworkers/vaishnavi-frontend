/** Easy-to-read WhatsApp message guides (from Value Occasions docs). No secrets. */

export const N8N_TEMPLATE_INTRO =
  'Send these messages on WhatsApp exactly like the examples. The automation reads the text and does the work for you (payments, bookings, staff, attendance, and more).';

export const N8N_HOW_TO_STEPS = [
  'Open WhatsApp and message the business number used for automation.',
  'Copy one of the templates below.',
  'Paste it into WhatsApp, then change the sample values to the real ones (names, IDs, dates, amounts).',
  'Send. Keep every line in the KEY: VALUE style shown — do not remove labels like TYPE: or PATIENT_ID:.',
];

/** Quick “what should I send?” chooser */
export const N8N_QUICK_PICKS = [
  { label: 'Record a payment', id: 'payment-known-patient' },
  { label: 'Payment without patient ID', id: 'payment-unknown-patient' },
  { label: 'Book an existing patient', id: 'booking-only' },
  { label: 'Add new patient + booking', id: 'patient-onboarding' },
  { label: 'Upload patient document', id: 'document-upload' },
  { label: 'Add / change staff salary', id: 'salary-base' },
  { label: 'Create staff login', id: 'staff-onboarding' },
  { label: 'Mark staff absent', id: 'absentees' },
];

/**
 * @typedef {object} N8nTemplate
 * @property {string} id
 * @property {string} category
 * @property {string} title
 * @property {string} plainTitle
 * @property {string} purpose
 * @property {string} howToSend
 * @property {string} formatLabel
 * @property {string} format
 * @property {string[]} [tips]
 * @property {boolean} [whatsappMessage]
 * @property {boolean} [advanced]
 */

/** @type {N8nTemplate[]} */
export const N8N_TEMPLATES = [
  {
    id: 'payment-known-patient',
    category: 'Payments',
    title: 'Customer Payment — patient ID known',
    plainTitle: 'Record a customer payment (you know the patient ID)',
    purpose:
      'Use this when money was received from a known patient. The system puts the amount on their oldest unpaid invoices first.',
    howToSend: 'Send as a normal WhatsApp text message.',
    formatLabel: 'Copy and edit this message',
    format: `TYPE: PAYMENT
PATIENT_ID: 123
PAYMENT_DATE: 2026-05-09
AMOUNT_PAID: 21000
METHOD: CASH`,
    tips: [
      'Replace 123 with the real patient ID.',
      'Date format: YYYY-MM-DD (example: 2026-05-09).',
      'METHOD can be CASH, UPI, CARD, etc. (as your team uses).',
      'Extra money after invoices are covered is kept as leftover / unverified.',
    ],
    whatsappMessage: true,
  },
  {
    id: 'payment-unknown-patient',
    category: 'Payments',
    title: 'Customer Payment — patient ID not known',
    plainTitle: 'Record a payment when you do not know the patient ID',
    purpose:
      'Use this when you received money but do not have the patient ID yet. The payment is saved with a phone number (or other note) so someone can match it later.',
    howToSend: 'Send as a normal WhatsApp text message.',
    formatLabel: 'Copy and edit this message',
    format: `TYPE: PAYMENT
PATIENT_INFO: 9886783349
PAYMENT_DATE: 2026-05-09
AMOUNT_PAID: 21000
METHOD: CASH`,
    tips: [
      'Use PATIENT_INFO for a phone number or any clear reference — not PATIENT_ID.',
      'This payment is saved as not verified until linked to a patient.',
    ],
    whatsappMessage: true,
  },
  {
    id: 'booking-only',
    category: 'Bookings',
    title: 'Patient Bookings — booking only',
    plainTitle: 'Create a booking for a patient who already exists',
    purpose:
      'Use this when the patient is already in the system and you only need to add a new booking (no new patient form).',
    howToSend: 'Send as WhatsApp text (or as a caption on a photo if needed).',
    formatLabel: 'Copy and edit this message',
    format: `TYPE: BOOKING_ONLY
PATIENT_ID: 001
BOOKING_TYPE: IN_HOUSE
VENUE: Malleswaram
START_DATE: 01-06-2026
END_DATE: 30-06-2026
SUBTOTAL: 30000
DISCOUNT_AMOUNT: 0
PREMIUM_AMOUNT: 0
CLIENT_ADDRESS: optional only for client-side`,
    tips: [
      'BOOKING_TYPE must be IN_HOUSE or CLIENT_SIDE.',
      'For IN_HOUSE, write the venue name: Malleswaram or Hegde Nagar.',
      'For CLIENT_SIDE, leave venue empty in practice and fill CLIENT_ADDRESS with the home address.',
      'SUBTOTAL is the amount for each booking period chunk (not always the full bill).',
    ],
    whatsappMessage: true,
  },
  {
    id: 'patient-onboarding',
    category: 'Bookings',
    title: 'Patient Onboarding with Booking and Documents',
    plainTitle: 'Register a new patient and create their first booking',
    purpose:
      'Use this for a brand-new patient. It creates the patient record, creates the booking, and can also save an Aadhaar/medical photo if you attach one.',
    howToSend:
      'Send as WhatsApp text, or attach a photo/PDF and put this whole message in the caption.',
    formatLabel: 'Copy and edit this message',
    format: `TYPE: PATIENT_ONBOARDING
FIRST_NAME: Lakshmi
LAST_NAME: Devi
PHONE: 9876543210
EMAIL: optional@example.com
ADDRESS: Full address here
AGE: 78
GENDER: F
EMERGENCY_CONTACT: Ramesh
EMERGENCY_PHONE: 9876500000
MEDICAL_CONDITIONS: Diabetes
ALLERGIES: None
BLOOD_GROUP: B+
PREFERRED_LANGUAGE: Kannada
BOOKING_TYPE: IN_HOUSE
VENUE: Hegde Nagar
START_DATE: 01-06-2026
END_DATE: 30-06-2026
SUBTOTAL: 30000
DISCOUNT_AMOUNT: 0
PREMIUM_AMOUNT: 0
DOCUMENT_TITLE: Aadhaar / Medical Document
DOCUMENT_REMARKS: Uploaded from WhatsApp`,
    tips: [
      'Must include: first name, last name, phone, address, emergency contact, emergency phone, and gender.',
      'TYPE can also be PATIENT_BOOKING or BOOKING (same idea).',
      'If you attach a file, put this text in the caption.',
      'Without a file, patient + booking still get created; only the document upload is skipped.',
    ],
    whatsappMessage: true,
  },
  {
    id: 'document-upload',
    category: 'Documents',
    title: 'Patient document upload',
    plainTitle: 'Upload a document for a patient who already exists',
    purpose:
      'Use this when the patient is already registered and you only need to attach a document (Aadhaar, report, etc.).',
    howToSend: 'Attach an image or PDF in WhatsApp and put this text in the caption (required).',
    formatLabel: 'Copy into the photo/PDF caption',
    format: `TYPE: DOCUMENT_UPLOAD
PATIENT_ID: 001
DOCUMENT_TITLE: Aadhaar Card
DOCUMENT_REMARKS: Uploaded from WhatsApp`,
    tips: [
      'Must include both the file and this caption.',
      'Patient ID is required.',
    ],
    whatsappMessage: true,
  },
  {
    id: 'salary-base',
    category: 'Staff & salary',
    title: 'Salary Structure — base salary',
    plainTitle: 'Set a staff member’s base monthly salary',
    purpose: 'Use this to create or update the main salary amount for a staff user ID.',
    howToSend:
      'Shown below on multiple lines for easy reading. When you tap Copy, it becomes one WhatsApp line joined with | (required by the system).',
    formatLabel: 'Message fields (shown on multiple lines)',
    format: `SALARY
user_id=11
effective_from=2026-06-01
change_type=BASE_SALARY
amount=20000
salary_type=MONTHLY`,
    joinWithPipe: true,
    tips: [
      'Edit the values, then use Copy message — WhatsApp must receive it as one line.',
      'effective_from date must be YYYY-MM-DD.',
      'amount must be a number only.',
    ],
    whatsappMessage: true,
  },
  {
    id: 'salary-increment',
    category: 'Staff & salary',
    title: 'Salary Structure — increment',
    plainTitle: 'Give a staff member a salary increase',
    purpose:
      'Use this to add an increment (raise). The system takes their latest salary and adds this amount.',
    howToSend:
      'Shown below on multiple lines for easy reading. When you tap Copy, it becomes one WhatsApp line joined with | (required by the system).',
    formatLabel: 'Message fields (shown on multiple lines)',
    format: `SALARY
user_id=11
effective_from=2026-07-01
change_type=INCREMENT
amount=2000
salary_type=MONTHLY`,
    joinWithPipe: true,
    tips: [
      'Edit the values, then use Copy message — WhatsApp must receive it as one line.',
      'Same fields as base salary; only change_type and amount differ.',
    ],
    whatsappMessage: true,
  },
  {
    id: 'staff-onboarding',
    category: 'Staff & salary',
    title: 'Staff Onboarding',
    plainTitle: 'Create a new staff account',
    purpose: 'Use this to create a staff login (email, phone, name, address, temporary password).',
    howToSend: 'Send as a normal WhatsApp text message.',
    formatLabel: 'Copy and edit this message',
    format: `FORM: STAFF
email: vaishnavistaff@example.com
mobile_number: 7760116368
first_name: SHOBHA
last_name: TBD
gender: F
address: Varamballi
city: Udupi
password: <temporary_password>
confirm_password: <temporary_password>`,
    tips: [
      'password and confirm_password must match.',
      'Use a strong temporary password; do not share it in screenshots or group chats.',
      'Keep the field names exactly as shown (email, mobile_number, first_name, …).',
    ],
    whatsappMessage: true,
  },
  {
    id: 'absentees',
    category: 'Attendance',
    title: 'WhatsApp Mark Absentees Only',
    plainTitle: 'Mark one or more staff as absent for a date',
    purpose: 'Use this to mark selected staff IDs as absent on a given day.',
    howToSend: 'Send as a normal WhatsApp text message.',
    formatLabel: 'Copy and edit this message',
    format: `DATE: 12-05-2026
ABSENTEES: 101 Lakshmi, 102 Ramesh, 103 Shobha`,
    tips: [
      'Date can be DD-MM-YYYY or DD/MM/YYYY.',
      'Start each person with their numeric staff/user ID; names after the ID are only for your reading.',
    ],
    whatsappMessage: true,
  },
  {
    id: 'daily-present',
    category: 'Attendance',
    title: 'Daily Mark Everyone Present — 8 AM',
    plainTitle: 'Automatic “everyone present” every morning',
    purpose:
      'This runs by itself every day at 8:00 AM. You do not send a WhatsApp message for it.',
    howToSend: 'Nothing to send — it is scheduled automatically.',
    formatLabel: 'No message needed',
    format: `You do not send anything on WhatsApp.

The system marks all linked staff as present every day at 8:00 AM.`,
    tips: ['For IT/admin only: this is a scheduled job, not a chat command.'],
    whatsappMessage: false,
    advanced: true,
  },
  {
    id: 'webhook-verify',
    category: 'Technical setup',
    title: 'GET WHATSAPP — Meta webhook verification',
    plainTitle: 'WhatsApp connection check (IT / admin)',
    purpose:
      'Used only when connecting WhatsApp to the automation system. Meta checks that our link works. Staff do not use this day to day.',
    howToSend: 'Not sent by people on WhatsApp.',
    formatLabel: 'For IT / admin only',
    format: `No WhatsApp chat message.

Meta sends a special verification request to the automation system.
The system replies with a challenge code so WhatsApp accepts the connection.`,
    tips: ['Skip this unless you are setting up or fixing the WhatsApp–automation link.'],
    whatsappMessage: false,
    advanced: true,
  },
];

export const N8N_CATEGORIES = [
  'All',
  'Payments',
  'Bookings',
  'Documents',
  'Staff & salary',
  'Attendance',
  'Technical setup',
];
