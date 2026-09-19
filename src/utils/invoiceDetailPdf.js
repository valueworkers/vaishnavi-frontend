const COMPANY_NAME = 'Vaishnavi Home and Nursing Care (P) LTD.'
const COMPANY_ADDRESS = '17th Cross Road, 11th Main Rd, Malleshwaram, Bengaluru, Karnataka 560055'
const COMPANY_PHONE = '098807 41419'

const resolveInvoiceLogoUrl = () => {
  try {
    const base = String(import.meta.env.BASE_URL || '/')
    return new URL('logoVaishnavi.png', new URL(base, window.location.origin)).href
  } catch {
    return `${window.location.origin}/logoVaishnavi.png`
  }
}

/** Known in-house branch localities shown on invoice Location / Locality. */
const BRANCH_LOCALITY_PATTERNS = [
  { label: 'Hegde Nagar', pattern: /hegde\s*nagar/i },
  { label: 'Malleshwaram', pattern: /malles(?:h)?waram/i },
]

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

/**
 * Resolve Malleshwaram / Hegde Nagar from booking venue, locality, or location text.
 * Falls back to a short `locality` value when present.
 */
const resolveBranchLocality = (booking = {}) => {
  const candidates = [
    booking.locality,
    booking.address,
    booking.venue,
    booking.location,
    booking.location_locality,
  ]
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => String(v))

  const haystack = candidates.join(' | ')
  for (const { label, pattern } of BRANCH_LOCALITY_PATTERNS) {
    if (pattern.test(haystack)) return label
  }

  const locality = String(booking.locality || '').trim()
  if (locality && locality.length <= 40 && !/,/.test(locality)) return locality

  const address = String(booking.address || '').trim()
  if (address && address.length <= 60) return address

  return locality || address || ''
}

const formatMoney = (value) => {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return escapeHtml(value)
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (iso) => {
  if (iso == null || iso === '') return '—'
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return escapeHtml(iso)
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
}

const formatDateTime = (iso) => {
  if (iso == null || iso === '') return '—'
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return escapeHtml(iso)
  return d.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Opens a print-ready invoice PDF for a single invoice detail (GET /booking/invoices/:id/).
 * @param {object} invoice — API response body
 * @returns {boolean} false if popup blocked
 */
export function openInvoiceDetailPdf(invoice) {
  if (!invoice || typeof invoice !== 'object') return false

  const booking = invoice.booking && typeof invoice.booking === 'object' ? invoice.booking : {}
  const payments = Array.isArray(invoice.payments) ? invoice.payments : []
  const primaryPayment = payments[0] || {}
  const patientName = primaryPayment.patient_name || '—'
  const patientPhone = primaryPayment.patient_phone_number || '—'
  const invoiceNumber = invoice.invoice_number || `INV-${invoice.id ?? ''}`
  const title = `Invoice ${invoiceNumber}`
  const branchLocality = resolveBranchLocality(booking)
  const branchLocalityDisplay = branchLocality || '—'
  const logoUrl = resolveInvoiceLogoUrl()
  const dueDateRow =
    invoice.due_date != null && String(invoice.due_date).trim() !== ''
      ? `<div class="meta-row"><span class="meta-label">Due</span><span class="meta-value">${escapeHtml(formatDate(invoice.due_date))}</span></div>`
      : ''

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} — ${escapeHtml(COMPANY_NAME)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 28px 32px;
      font-size: 12px;
      line-height: 1.45;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      border-bottom: 2px solid #312e81;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .brand {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      min-width: 0;
      max-width: 520px;
    }
    .logo {
      width: 72px;
      height: 72px;
      object-fit: contain;
      flex-shrink: 0;
      display: block;
    }
    .company {
      font-size: 18px;
      font-weight: 700;
      color: #312e81;
      margin: 0 0 4px;
      max-width: 420px;
    }
    .company-sub {
      margin: 0 0 6px;
      color: #64748b;
      font-size: 11px;
    }
    .company-contact {
      margin: 0;
      color: #475569;
      font-size: 11px;
      line-height: 1.5;
      max-width: 420px;
    }
    .invoice-meta {
      text-align: right;
      min-width: 220px;
    }
    .invoice-meta h2 {
      margin: 0 0 8px;
      font-size: 22px;
      color: #1e293b;
      letter-spacing: 0.02em;
    }
    .meta-row {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin: 2px 0;
      font-size: 11px;
    }
    .meta-label { color: #64748b; min-width: 88px; text-align: right; }
    .meta-value { color: #0f172a; font-weight: 600; }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
    }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      background: #f8fafc;
    }
    .card h3 {
      margin: 0 0 8px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
    }
    .card p { margin: 3px 0; }
    .muted { color: #64748b; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #475569;
    }
    .amount { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .section-title {
      margin: 20px 0 8px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #475569;
    }
    .footer {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      font-size: 10px;
      color: #64748b;
      text-align: center;
    }
    @media print {
      body { padding: 12px 16px; }
      @page { margin: 12mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <img class="logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(COMPANY_NAME)}" />
      <div>
        <p class="company">${escapeHtml(COMPANY_NAME)}</p>
        <p class="company-sub">Tax Invoice / Bill of Supply</p>
        <p class="company-contact">Address: ${escapeHtml(COMPANY_ADDRESS)}</p>
        <p class="company-contact">Phone: ${escapeHtml(COMPANY_PHONE)}</p>
      </div>
    </div>
    <div class="invoice-meta">
      <h2>INVOICE</h2>
      <div class="meta-row"><span class="meta-label">Invoice No.</span><span class="meta-value">${escapeHtml(invoiceNumber)}</span></div>
      <div class="meta-row"><span class="meta-label">Issued</span><span class="meta-value">${escapeHtml(formatDate(invoice.issued_date))}</span></div>
      ${dueDateRow}
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h3>Bill To</h3>
      <p><strong>${escapeHtml(patientName)}</strong></p>
      <p class="muted">Phone: ${escapeHtml(patientPhone)}</p>
      ${primaryPayment.patient ? `<p class="muted">Patient ID: ${escapeHtml(primaryPayment.patient)}</p>` : ''}
    </div>
    <div class="card">
      <h3>Service Period</h3>
      <p><span class="muted">From:</span> ${escapeHtml(formatDateTime(invoice.period_start))}</p>
      <p><span class="muted">To:</span> ${escapeHtml(formatDateTime(invoice.period_end))}</p>
    </div>
  </div>

  <div class="card">
    <h3>Booking Details</h3>
    <div class="grid-2" style="margin-bottom:0">
      <div>
        <p><span class="muted">Order ID:</span> ${escapeHtml(booking.order_id || '—')}</p>
        <p><span class="muted">Venue:</span> ${escapeHtml(COMPANY_NAME)}</p>
        <p><span class="muted">Locality:</span> ${escapeHtml(branchLocalityDisplay)}</p>
      </div>
      <div>
        <p><span class="muted">Service:</span> ${escapeHtml(booking.service || '—')}</p>
        <p><span class="muted">Package:</span> ${escapeHtml(booking.package || '—')}</p>
        <p><span class="muted">Location:</span> ${escapeHtml(branchLocalityDisplay)}</p>
      </div>
    </div>
  </div>

  <p class="section-title">Amount</p>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="amount">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Subtotal</td>
        <td class="amount">${formatMoney(invoice.subtotal ?? invoice.total_amount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <p>This is a computer-generated invoice from ${escapeHtml(COMPANY_NAME)}.</p>
    <p>Generated on ${escapeHtml(formatDateTime(new Date().toISOString()))}</p>
  </div>
</body>
</html>`

  const printWindow = window.open('', '_blank', 'width=920,height=1040')
  if (!printWindow) return false

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()

  const triggerPrint = (() => {
    let printed = false
    return () => {
      if (printed) return
      printed = true
      try {
        printWindow.print()
      } catch {
        /* user may print manually */
      }
    }
  })()

  const waitForLogoThenPrint = () => {
    const logo = printWindow.document.querySelector('img.logo')
    if (!logo || logo.complete) {
      triggerPrint()
      return
    }
    logo.addEventListener('load', triggerPrint, { once: true })
    logo.addEventListener('error', triggerPrint, { once: true })
    setTimeout(triggerPrint, 1500)
  }

  if (printWindow.document.readyState === 'complete') {
    waitForLogoThenPrint()
  } else {
    printWindow.onload = waitForLogoThenPrint
  }

  return true
}

export { COMPANY_NAME as INVOICE_COMPANY_NAME }
