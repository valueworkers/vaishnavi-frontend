/**
 * Generates docs/Vaishnavi_User_Manual.pdf — step-by-step guide for booking + all dashboard tabs.
 * Run: node scripts/generate-user-manual-pdf.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "docs", "Vaishnavi_User_Manual.pdf");

const MARGIN = 48;
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = 28;
const TOP_Y = PAGE_H - MARGIN;

const teal = rgb(0.05, 0.45, 0.48);
const slate = rgb(0.12, 0.16, 0.23);
const muted = rgb(0.39, 0.45, 0.55);
const lightBg = rgb(0.94, 0.97, 0.97);
const line = rgb(0.86, 0.9, 0.94);

/** @typedef {{ type: 'h1'|'h2'|'h3'|'p'|'step'|'note'|'bullet'|'spacer'|'toc' , text?: string, n?: number }} Block */

/** @type {Block[]} */
const CONTENT = [
  { type: "h1", text: "Vaishnavi Medicare" },
  { type: "h2", text: "Complete User Manual — Step by Step" },
  {
    type: "p",
    text: "This guide explains every major action in the application: public booking (In House and Client Location), and every Admin Dashboard tab. Follow the numbered steps in order.",
  },
  { type: "note", text: "Tip: Admin screens open at /dashboard?section=… after login. Booking starts from the Home page Booking Options section (not from the top navbar)." },
  { type: "spacer" },

  { type: "h2", text: "1. Getting started" },
  { type: "h3", text: "1.1 Login" },
  { type: "step", n: 1, text: "Open the Vaishnavi Medicare website." },
  { type: "step", n: 2, text: "Click Login (top right) and enter your email/phone and password." },
  { type: "step", n: 3, text: "After login, staff/owners land on the Admin Dashboard; customers land on the Customer Dashboard." },
  { type: "h3", text: "1.2 Main navigation (public)" },
  { type: "bullet", text: "Home — landing page, Booking Options, FAQs." },
  { type: "bullet", text: "About Us — company info and booking shortcuts." },
  { type: "bullet", text: "Media — Photos, Blogs, Videos, Discussions." },
  { type: "spacer" },

  { type: "h2", text: "2. How to create a booking (public)" },
  {
    type: "p",
    text: "On Home, scroll to Booking Options. You must be logged in; otherwise you are redirected to Login.",
  },
  { type: "h3", text: "2.1 Choose booking type" },
  {
    type: "step",
    n: 1,
    text: "In House (premises): click “Book now at Vaishnavi Medicare Premises” → opens /in-house with location type In House.",
  },
  {
    type: "step",
    n: 2,
    text: "Client Location (at home): click “Book at Your Location” → opens /senior-care with location type Client Location.",
  },
  {
    type: "note",
    text: "Owners may also see “Existing Customer Manage your Bookings” which opens Manage Customer → Booking in the dashboard.",
  },
  { type: "spacer" },

  { type: "h2", text: "3. In House booking — full steps" },
  {
    type: "p",
    text: "Path: Home → Book now at Vaishnavi Medicare Premises → /in-house. Progress bar: Location → Package → Date → Booking.",
  },
  { type: "h3", text: "3.1 Patient Care Registration (required first)" },
  { type: "step", n: 1, text: "On the booking page, open Patient Care Registration." },
  { type: "step", n: 2, text: "Choose View Existing (pick a registered patient) OR Register Now / Register new patient." },
  { type: "step", n: 3, text: "Registration Step 1 — Details: fill patient name, contact, gender, address, affiliate, source, referred by, is probono (if shown), and other required fields. Save / Continue." },
  { type: "step", n: 4, text: "Registration Step 2 — ID Proof: upload ID documents as required. Complete registration." },
  {
    type: "note",
    text: "A registration fee may apply at booking time (shown in the wizard). Keep documents ready before starting.",
  },
  { type: "h3", text: "3.2 Step 1 — Select Location Type" },
  { type: "step", n: 1, text: "Choose In House (Inpatient Care) OR In House (OPD)." },
  { type: "step", n: 2, text: "Select Service (and Select Location / venue when prompted)." },
  { type: "step", n: 3, text: "Click Continue to Package Selection." },
  { type: "h3", text: "3.3 Step 2 — Select Service & Package" },
  { type: "step", n: 1, text: "Review available packages for the chosen service/venue." },
  { type: "step", n: 2, text: "For OPD, services may also appear in this step — pick the correct package." },
  { type: "step", n: 3, text: "Click Continue to Date Selection." },
  { type: "h3", text: "3.4 Step 3 — Select Date(s)" },
  { type: "step", n: 1, text: "Use the calendar to pick date(s). For hourly packages, also select time slots." },
  { type: "step", n: 2, text: "Confirm the schedule looks correct." },
  { type: "step", n: 3, text: "Click Review and Confirm Booking." },
  { type: "h3", text: "3.5 Step 4 — Review & Payment" },
  { type: "step", n: 1, text: "Review patient, location, service, package, dates, and amounts." },
  { type: "step", n: 2, text: "Optionally pay registration fee / upfront amount if the modal offers it." },
  { type: "step", n: 3, text: "Click Proceed to Booking." },
  {
    type: "note",
    text: "Success: customers usually return Home; owners often go to Lobby (/dashboard?section=lobby) for approval. Use Reset All in the sidebar to clear and restart.",
  },
  { type: "spacer" },

  { type: "h2", text: "4. Client Location booking — full steps" },
  {
    type: "p",
    text: "Path: Home → Book at Your Location → /senior-care. Progress: Location → Service → Package → Date → Review. Booking type on API: CLIENT_SIDE.",
  },
  { type: "h3", text: "4.1 Patient registration" },
  { type: "step", n: 1, text: "Same as In House: View Existing or Register new patient (Step 1 Details → Step 2 ID Proof)." },
  { type: "h3", text: "4.2 Step 1 — Select Location" },
  { type: "step", n: 1, text: "Enter Client Name." },
  { type: "step", n: 2, text: "Choose Address Type: Default Address OR Customize Address; fill address fields." },
  { type: "step", n: 3, text: "Click Continue to Booking / next step." },
  { type: "h3", text: "4.3 Step 2 — Service" },
  { type: "step", n: 1, text: "Select the care service. The wizard may auto-advance after selection." },
  { type: "step", n: 2, text: "Otherwise click Continue to Package Selection." },
  { type: "h3", text: "4.4 Step 3 — Select Package" },
  { type: "step", n: 1, text: "Pick a package for the selected service." },
  { type: "step", n: 2, text: "If no package fits, use request / enquire options if shown." },
  { type: "step", n: 3, text: "Click Continue to Date Selection." },
  { type: "h3", text: "4.5 Step 4 — Select Date(s)" },
  { type: "step", n: 1, text: "Pick date(s) and hourly times when required." },
  { type: "step", n: 2, text: "Click Continue to Review." },
  { type: "h3", text: "4.6 Step 5 — Review & Payment" },
  { type: "step", n: 1, text: "Review all details and amounts." },
  { type: "step", n: 2, text: "Complete optional upfront / registration payment if offered." },
  { type: "step", n: 3, text: "Click Final Booking / Proceed to Booking." },
  { type: "spacer" },

  { type: "h2", text: "5. Admin Dashboard overview" },
  {
    type: "p",
    text: "After staff/owner login, open Dashboard. Left sidebar lists modules. Role visibility differs: Owners see Manage Customer, Location & Package, N8N; Managers see Manage Staff; Staff see base modules without Manage Staff.",
  },
  { type: "bullet", text: "Base: Venues, Services, Resources, EMR, Analytics, Manage Staff (not for staff role)." },
  { type: "bullet", text: "Owner extras: Manage Customer, Location & Package, N8N Templates." },
  { type: "spacer" },

  { type: "h2", text: "6. Venues" },
  { type: "p", text: "Sidebar → Venues (/dashboard?section=venues)." },
  { type: "step", n: 1, text: "Open Venues to see the venue card list." },
  { type: "step", n: 2, text: "Click Add Venue → fill name, address, locality, amenities, photos, and other fields → Save." },
  { type: "step", n: 3, text: "To change a venue: open it → Edit → update fields → Save." },
  { type: "step", n: 4, text: "To remove (owner): use Delete and confirm." },
  { type: "step", n: 5, text: "Browse photos/amenities; use pagination if many venues exist." },
  { type: "spacer" },

  { type: "h2", text: "7. Services" },
  { type: "p", text: "Sidebar → Services (/dashboard?section=services)." },
  { type: "step", n: 1, text: "Open the Services table." },
  { type: "step", n: 2, text: "Click Add Service → enter service details → Save." },
  { type: "step", n: 3, text: "Use Active toggle to enable/disable a service without deleting it." },
  { type: "step", n: 4, text: "Click Edit Service to update; Delete Service to remove (with confirmation)." },
  { type: "step", n: 5, text: "Paginate through the list as needed." },
  { type: "spacer" },

  { type: "h2", text: "8. Resources" },
  { type: "p", text: "Sidebar → Resources (/dashboard?section=resources)." },
  {
    type: "note",
    text: "Resources Panel is a placeholder in the current build — full CRUD may not be available yet. Check with your admin if you need resource master data.",
  },
  { type: "spacer" },

  { type: "h2", text: "9. EMR (Electronic Medical Records)" },
  { type: "p", text: "Sidebar → EMR (/dashboard?section=emr)." },
  { type: "step", n: 1, text: "Search patients or document titles from the EMR screen." },
  { type: "step", n: 2, text: "Open a patient folder from the grid." },
  { type: "step", n: 3, text: "Click + Upload document / New document → choose file → upload." },
  { type: "step", n: 4, text: "View, Download, Download all, Edit, or Delete documents as needed." },
  { type: "spacer" },

  { type: "h2", text: "10. Manage Staff" },
  { type: "p", text: "Expand Manage Staff in the sidebar. Default opens Employee Master." },

  { type: "h3", text: "10.1 Employee Master" },
  { type: "p", text: "/dashboard?section=employee-master" },
  { type: "step", n: 1, text: "Review the employee list. Use Search / Clear and filters (status, type, category)." },
  { type: "step", n: 2, text: "Add employee: + Add Employee → complete multi-step form (details, documents, etc.) → Save." },
  { type: "step", n: 3, text: "Bulk Upload: click Bulk Upload → download Excel template → fill rows → Upload." },
  { type: "step", n: 4, text: "Edit a row → update fields (including Base Location from venues) → Save." },
  { type: "step", n: 5, text: "Assign: select row(s) → Assign Selected → choose Venues / Services / Resources → Assign or Unassign." },
  { type: "step", n: 6, text: "Terminate: Delete → enter Reason + Last working day → Voluntary or Involuntary Terminate." },
  { type: "step", n: 7, text: "Revoke Termination: select one TERMINATED employee → Revoke Termination → choose Rehired status → confirm." },
  { type: "step", n: 8, text: "Shifts: open Shifts → + Add Shift → Edit/Delete shifts → Back to list." },
  { type: "step", n: 9, text: "Export: Column Chooser → Export PDF or Excel." },

  { type: "h3", text: "10.2 Attendance" },
  { type: "p", text: "/dashboard?section=attendance — tabs My Staff / My Manager." },
  { type: "step", n: 1, text: "Search and select a staff or manager (terminated staff appear grayed and cannot be marked)." },
  { type: "step", n: 2, text: "Pick the month on the calendar." },
  { type: "step", n: 3, text: "Mark attendance statuses for days → save as prompted." },

  { type: "h3", text: "10.3 Payroll" },
  { type: "p", text: "/dashboard?section=payroll" },
  { type: "step", n: 1, text: "Search / filter employees by category." },
  { type: "step", n: 2, text: "Add Structure or Edit an existing payroll structure." },
  { type: "step", n: 3, text: "Open History / Payroll History → refresh reports → Process Payment when payable." },
  { type: "step", n: 4, text: "Export Excel when needed." },

  { type: "h3", text: "10.4 Staff Payouts" },
  { type: "p", text: "/dashboard?section=transaction" },
  { type: "step", n: 1, text: "Search payouts; filter by date, payment method, status." },
  { type: "step", n: 2, text: "Use Column Chooser and Export Excel." },
  { type: "step", n: 3, text: "Clear filters to reset the view." },

  { type: "h3", text: "10.5 Staff for hire" },
  { type: "p", text: "/dashboard?section=staff-for-hire" },
  { type: "step", n: 1, text: "Search available staff for hire." },
  { type: "step", n: 2, text: "Select rows → Hire selected, or click Hire on a single row." },
  { type: "spacer" },

  { type: "h2", text: "11. Manage Customer (Owner)" },
  { type: "p", text: "Expand Manage Customer. Default often opens Booking." },

  { type: "h3", text: "11.1 Customer Master" },
  { type: "p", text: "/dashboard?section=customer-master" },
  { type: "step", n: 1, text: "Search patients; apply filters (Active/Inactive, location type, locality, gender, sorts)." },
  { type: "step", n: 2, text: "Edit patient: open Edit → update affiliate, source, referred by, is probono, and other fields → Save." },
  { type: "step", n: 3, text: "Open EMR documents for a patient when needed." },
  { type: "step", n: 4, text: "Select rows → Export PDF/Excel or Delete (with confirmation)." },
  { type: "step", n: 5, text: "Use Column Chooser to show/hide Affiliate, Source, Referred By, Is Probono, Locality, etc." },

  { type: "h3", text: "11.2 Booking" },
  { type: "p", text: "/dashboard?section=booking (also /booking)." },
  { type: "step", n: 1, text: "Toggle View Customers ↔ Orders. Orders tabs: Past / Present / Upcoming." },
  { type: "step", n: 2, text: "Create booking: Create → Create new booking → select patient." },
  { type: "step", n: 3, text: "Choose In House / OPD / Client Location → Continue." },
  { type: "step", n: 4, text: "In House or OPD opens /in-house; Client Location opens /senior-care (prefilled). Complete the wizard as in sections 3–4." },
  { type: "step", n: 5, text: "Filter by location type, status, service, dates; expand orders; add/edit service; cancel; auto-renew as available." },
  { type: "step", n: 6, text: "Export and Column Chooser as needed." },

  { type: "h3", text: "11.3 Lobby" },
  { type: "p", text: "/dashboard?section=lobby — toggle Lobby ↔ Package Enquire." },
  { type: "step", n: 1, text: "Lobby: filter by status; expand a booking; select secondary orders." },
  { type: "step", n: 2, text: "Actions → Approve / Hold / Reject → enter reason if required → Submit." },
  { type: "step", n: 3, text: "Package Enquire: list enquiries → Create Booking or Delete; Add New Package → pick calendar/slots → submit." },

  { type: "h3", text: "11.4 Invoices" },
  { type: "p", text: "/dashboard?section=invoices" },
  { type: "step", n: 1, text: "Search; filter by month / All months, status, and location type (In House / Client Side / OPD)." },
  { type: "step", n: 2, text: "Open an invoice number to view details; download PDF." },
  { type: "step", n: 3, text: "Export PDF / Export Excel; Refresh the list." },

  { type: "h3", text: "11.5 Payment" },
  { type: "p", text: "/dashboard?section=customer-payment — tabs Customer Invoices / Monthly Payments." },
  { type: "step", n: 1, text: "Customer Invoices: search → filter status → Add Payment / Pay invoice → Update Payment → Edit/Delete cash entries." },
  { type: "step", n: 2, text: "Monthly Payments: search → Mapped/Unmapped and invoice status filters → Export PDF/Excel → Refresh." },
  { type: "step", n: 3, text: "Use Column Chooser (Mapping Meta / Mapping Status may be hidden by default)." },
  { type: "spacer" },

  { type: "h2", text: "12. Analytics" },
  { type: "p", text: "Expand Analytics. Default often opens Attendance Master." },

  { type: "h3", text: "12.1 Attendance Master" },
  { type: "p", text: "/dashboard?section=attendance-master" },
  { type: "step", n: 1, text: "Switch Table / Cards view; filter All / Has Absences / Full Attendance." },
  { type: "step", n: 2, text: "Change month with prev/next; Search; Export PDF/Excel; Column chooser; paginate." },

  { type: "h3", text: "12.2 Reminders" },
  { type: "p", text: "/dashboard?section=reminders — placeholder screen in current build." },

  { type: "h3", text: "12.3 Payment Master" },
  { type: "p", text: "/dashboard?section=payment-master" },
  { type: "step", n: 1, text: "Tabs: Monthly Summary, Daily Breakup, Payment Modes. Choose CY/FY and year." },
  { type: "step", n: 2, text: "Monthly: show all months or select one month; review KPI cards and month-wise table." },
  { type: "step", n: 3, text: "Export Columns / PDF / Excel for the table." },
  { type: "step", n: 4, text: "Details: choose Partly paid or Unpaid bills; choose All locations / In House / Client Side; click Details." },
  { type: "step", n: 5, text: "Review invoice lines; paginate; export details; Close when done." },
  { type: "step", n: 6, text: "Daily Breakup and Payment Modes: pick month/scope and review collection analytics." },

  { type: "h3", text: "12.4 Unmapped Payments" },
  { type: "p", text: "/dashboard?section=unmapped-payments" },
  { type: "step", n: 1, text: "Search; filter by month/year." },
  { type: "step", n: 2, text: "Map patient or Map invoice on a row, or select rows → Link (N) for bulk mapping." },
  { type: "spacer" },

  { type: "h2", text: "13. Location & Package (Owner)" },
  { type: "p", text: "/dashboard?section=location-package" },
  { type: "step", n: 1, text: "Choose Package Type: Service Packages or Venue Packages." },
  { type: "step", n: 2, text: "Pick service type filter: IN-HOUSE / OPD / CLIENT-SIDE when managing service packages." },
  { type: "step", n: 3, text: "Select a service or venue from the list." },
  { type: "step", n: 4, text: "Add Package → fill package fields → Save. Edit or Delete existing packages." },
  { type: "step", n: 5, text: "Add/Edit Location for venues as needed → Save." },
  {
    type: "note",
    text: "Packages created here appear in the public In House and Client Location booking wizards when customers select that service/venue.",
  },
  { type: "spacer" },

  { type: "h2", text: "14. N8N Templates (Owner)" },
  { type: "p", text: "/dashboard?section=n8n-templates — WhatsApp message guides." },
  { type: "step", n: 1, text: "Open a category tab." },
  { type: "step", n: 2, text: "Search templates; expand one to read the guide." },
  { type: "step", n: 3, text: "Click Copy to copy the message text." },
  { type: "spacer" },

  { type: "h2", text: "15. Customer Dashboard" },
  { type: "p", text: "When logged in as a customer (not staff/owner), the dashboard shows:" },
  { type: "step", n: 1, text: "Bookings — view your orders (/dashboard?section=bookings)." },
  { type: "step", n: 2, text: "Invoices — view your invoices (/dashboard?section=invoices)." },
  { type: "step", n: 3, text: "Notifications — alerts (/dashboard?section=notifications)." },
  { type: "spacer" },

  { type: "h2", text: "16. Other useful pages" },
  { type: "bullet", text: "Settings (/settings) — account preferences." },
  { type: "bullet", text: "Customize Profile (/customize-profile)." },
  { type: "bullet", text: "Create Persona / Permissions — owner tooling for roles." },
  { type: "bullet", text: "Terms (/terms) and Privacy (/privacy)." },
  { type: "bullet", text: "Reset Password (/reset-password) from login flows." },
  { type: "spacer" },

  { type: "h2", text: "17. Quick reference — Dashboard section URLs" },
  { type: "bullet", text: "venues | services | resources | emr" },
  { type: "bullet", text: "employee-master | attendance | payroll | transaction | staff-for-hire" },
  { type: "bullet", text: "customer-master | booking | lobby | invoices | customer-payment" },
  { type: "bullet", text: "attendance-master | reminders | payment-master | unmapped-payments" },
  { type: "bullet", text: "location-package | n8n-templates" },
  { type: "spacer" },

  { type: "h2", text: "18. End-to-end checklist (new In House booking)" },
  { type: "step", n: 1, text: "Owner ensures Venue exists (Venues) and Service is Active (Services)." },
  { type: "step", n: 2, text: "Owner creates Service/Venue Packages under Location & Package (IN-HOUSE)." },
  { type: "step", n: 3, text: "Staff assigned to venues/services via Employee Master → Assign." },
  { type: "step", n: 4, text: "User logs in → Home → Book now at Vaishnavi Medicare Premises." },
  { type: "step", n: 5, text: "Register or select patient → Location type → Service/Venue → Package → Dates → Review → Proceed." },
  { type: "step", n: 6, text: "Owner opens Lobby → Approve (or Hold/Reject)." },
  { type: "step", n: 7, text: "Track invoices under Invoices / Payment; monitor Analytics → Payment Master." },
  { type: "spacer" },

  { type: "h2", text: "19. End-to-end checklist (Client Location booking)" },
  { type: "step", n: 1, text: "Owner ensures CLIENT-SIDE service + packages exist in Location & Package." },
  { type: "step", n: 2, text: "User: Home → Book at Your Location." },
  { type: "step", n: 3, text: "Patient → Client address → Service → Package → Dates → Review → Final Booking." },
  { type: "step", n: 4, text: "Owner: Lobby approval → Payment / Invoices as needed." },
  { type: "spacer" },
  {
    type: "note",
    text: "Document version generated for the Vaishnavi Medicare frontend. UI labels may vary slightly with role permissions. For API/base URL setup, see the project README (not this manual).",
  },
];

function sanitizePdfText(text) {
  return String(text || "")
    .replace(/\u2192/g, "->")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/•/g, "-")
    .replace(/₹/g, "Rs ")
    .replace(/[^\x00-\x7F]/g, (ch) => {
      // Drop remaining non-WinAnsi glyphs
      return "";
    });
}

function wrapText(text, font, size, maxWidth) {
  const words = sanitizePdfText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = TOP_Y;
  let pageNum = 1;

  const drawFooter = (p, num) => {
    p.drawLine({
      start: { x: MARGIN, y: FOOTER_Y + 14 },
      end: { x: PAGE_W - MARGIN, y: FOOTER_Y + 14 },
      thickness: 0.5,
      color: line,
    });
    p.drawText(sanitizePdfText("Vaishnavi Medicare - User Manual"), {
      x: MARGIN,
      y: FOOTER_Y,
      size: 8,
      font,
      color: muted,
    });
    const label = `Page ${num}`;
    const w = font.widthOfTextAtSize(label, 8);
    p.drawText(label, {
      x: PAGE_W - MARGIN - w,
      y: FOOTER_Y,
      size: 8,
      font,
      color: muted,
    });
  };

  const ensureSpace = (needed) => {
    if (y - needed < FOOTER_Y + 28) {
      drawFooter(page, pageNum);
      page = doc.addPage([PAGE_W, PAGE_H]);
      pageNum += 1;
      y = TOP_Y;
    }
  };

  const drawLines = (lines, { size, f, color, leading, indent = 0 }) => {
    for (const ln of lines) {
      ensureSpace(leading);
      page.drawText(sanitizePdfText(ln), {
        x: MARGIN + indent,
        y: y - size,
        size,
        font: f,
        color,
        maxWidth: CONTENT_W - indent,
      });
      y -= leading;
    }
  };

  for (const block of CONTENT) {
    if (block.type === "spacer") {
      y -= 10;
      continue;
    }

    if (block.type === "h1") {
      ensureSpace(36);
      page.drawRectangle({
        x: MARGIN,
        y: y - 28,
        width: CONTENT_W,
        height: 32,
        color: lightBg,
      });
      const lines = wrapText(block.text, fontBold, 18, CONTENT_W - 16);
      let ty = y - 8;
      for (const ln of lines) {
        page.drawText(ln, { x: MARGIN + 8, y: ty - 18, size: 18, font: fontBold, color: teal });
        ty -= 22;
      }
      y = ty - 8;
      continue;
    }

    if (block.type === "h2") {
      ensureSpace(30);
      y -= 6;
      const lines = wrapText(block.text, fontBold, 13, CONTENT_W);
      drawLines(lines, { size: 13, f: fontBold, color: teal, leading: 17 });
      page.drawLine({
        start: { x: MARGIN, y: y + 2 },
        end: { x: MARGIN + 120, y: y + 2 },
        thickness: 1.5,
        color: teal,
      });
      y -= 8;
      continue;
    }

    if (block.type === "h3") {
      ensureSpace(22);
      y -= 4;
      const lines = wrapText(block.text, fontBold, 11, CONTENT_W);
      drawLines(lines, { size: 11, f: fontBold, color: slate, leading: 15 });
      y -= 2;
      continue;
    }

    if (block.type === "p") {
      const lines = wrapText(block.text, font, 10, CONTENT_W);
      drawLines(lines, { size: 10, f: font, color: slate, leading: 13 });
      y -= 4;
      continue;
    }

    if (block.type === "bullet") {
      const bulletIndent = 14;
      const lines = wrapText(block.text, font, 10, CONTENT_W - bulletIndent);
      ensureSpace(13);
      page.drawText(">", {
        x: MARGIN + 2,
        y: y - 10,
        size: 10,
        font,
        color: teal,
      });
      drawLines(lines, { size: 10, f: font, color: slate, leading: 13, indent: bulletIndent });
      continue;
    }

    if (block.type === "step") {
      const prefix = `${block.n}. `;
      const indent = 18;
      const lines = wrapText(block.text, font, 10, CONTENT_W - indent);
      ensureSpace(13);
      page.drawText(prefix, {
        x: MARGIN,
        y: y - 10,
        size: 10,
        font: fontBold,
        color: teal,
      });
      drawLines(lines, { size: 10, f: font, color: slate, leading: 13, indent });
      continue;
    }

    if (block.type === "note") {
      const pad = 8;
      const lines = wrapText(`Note: ${block.text}`, font, 9, CONTENT_W - pad * 2);
      const boxH = lines.length * 12 + pad * 2;
      ensureSpace(boxH + 6);
      page.drawRectangle({
        x: MARGIN,
        y: y - boxH,
        width: CONTENT_W,
        height: boxH,
        color: lightBg,
        borderColor: teal,
        borderWidth: 0.6,
      });
      let ty = y - pad - 9;
      for (const ln of lines) {
        page.drawText(ln, { x: MARGIN + pad, y: ty, size: 9, font, color: slate });
        ty -= 12;
      }
      y -= boxH + 8;
    }
  }

  drawFooter(page, pageNum);

  const bytes = await doc.save();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, bytes);
  console.log(`Wrote ${OUT} (${pageNum} pages, ${bytes.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
