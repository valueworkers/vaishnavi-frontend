import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import * as XLSX from "xlsx";

/** Readable message from axios error (Django may return detail as string, array, or object). */
function formatApiError(err) {
  if (!err?.response) {
    return err?.message || "Network error — check connection and CORS";
  }
  const { status, statusText, data } = err.response;
  const prefix = status ? `${status} ${statusText || ""}`.trim() : "";
  if (data == null) return prefix || "Request failed";
  if (typeof data.detail === "string") return prefix ? `${prefix}: ${data.detail}` : data.detail;
  if (Array.isArray(data.detail)) {
    const parts = data.detail.map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
    return prefix ? `${prefix}: ${parts.join("; ")}` : parts.join("; ");
  }
  if (typeof data.message === "string") return prefix ? `${prefix}: ${data.message}` : data.message;
  if (typeof data === "string") return prefix ? `${prefix}: ${data}` : data;
  try {
    const s = JSON.stringify(data);
    if (s && s !== "{}") return prefix ? `${prefix}: ${s}` : s;
  } catch {
    /* ignore */
  }
  return prefix || "Failed to load monthly performance";
}

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");




    
/** API payment method keys → display label & bar color */
const METHOD_META = {
  UPI: { label: "UPI", color: "#0052cc" },
  CARD: { label: "Card", color: "#00875a" },
  BANK: { label: "Bank", color: "#6c4ecb" },
  CASH: { label: "Cash", color: "#b45309" },
  CHEQUE: { label: "Cheque", color: "#9b1c1c" },
};
const METHOD_SORT = ["UPI", "CARD", "BANK", "CASH", "CHEQUE"];

function sortMethodKeys(keys) {
  const upper = [...new Set(keys.map((k) => String(k || "").toUpperCase()))];
  const set = new Set(upper);
  return METHOD_SORT.filter((k) => set.has(k)).concat([...set].filter((k) => !METHOD_SORT.includes(k)));
}

function amountForMethod(methods, key) {
  if (!methods || typeof methods !== "object") return 0;
  const k = String(key).toUpperCase();
  const v = methods[k] ?? methods[key] ?? methods[String(key).toLowerCase()];
  return Number(v ?? 0);
}

function labelForMethod(method) {
  const m = String(method || "").toUpperCase();
  return METHOD_META[m]?.label ?? method;
}

function colorForMethod(method) {
  const m = String(method || "").toUpperCase();
  return METHOD_META[m]?.color ?? "#64748b";
}

const fmt = (v) =>
  v ? "₹" + Number(v).toLocaleString("en-IN") : "—";
/** Like fmt but shows ₹0 when amount is zero (payment mode KPIs). */
const fmtRupee = (v) =>
  v === "" || v == null || (typeof v === "number" && Number.isNaN(v))
    ? "—"
    : "₹" + Number(v).toLocaleString("en-IN");
const pct = (a, b) =>
  b ? (((a / b) * 100).toFixed(1) + "%") : "—";

/** Normalize invoice list pagination from DRF / custom JSON (snake_case or camelCase). */
function parseInvoiceListPaginationPayload(data) {
  const d = data && typeof data === "object" ? data : {};
  const pickUrl = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
  };
  const page = Number(d.current_page ?? d.currentPage) || 1;
  let totalPg = Number(d.total_pages ?? d.totalPages);
  const count = Number(d.count ?? d.total_count ?? 0);
  const pageSize = Number(d.page_size ?? d.pageSize ?? d.limit);
  if (!(Number.isFinite(totalPg) && totalPg >= 1) && Number.isFinite(pageSize) && pageSize > 0 && count > 0) {
    totalPg = Math.max(1, Math.ceil(count / pageSize));
  }
  const totalPages = Number.isFinite(totalPg) && totalPg >= 1 ? totalPg : 1;
  return {
    nextUrl: pickUrl(d.next ?? d.next_url ?? d.nextUrl),
    prevUrl: pickUrl(d.previous ?? d.previous_url ?? d.prevUrl ?? d.prev),
    currentPage: page >= 1 ? page : 1,
    totalPages,
    count,
  };
}

/** Resolve DRF `next` / `previous` URL (absolute or path) against API root. */
function resolvePaginatedUrl(pageUrl, root) {
  if (!pageUrl || !root) return null;
  const u = String(pageUrl).trim();
  if (/^https?:\/\//i.test(u)) return u;
  const r = String(root).replace(/\/$/, "");
  const path = u.startsWith("/") ? u : `/${u}`;
  return `${r}${path}`;
}

const ANALYSIS_INVOICES_PATH = "/analysis/invoices/";

function invoiceBookingOrderId(inv) {
  return inv?.booking?.order_id ?? inv?.booking_order_id ?? "—";
}

function invoiceBookingVenue(inv) {
  return inv?.booking?.venue ?? inv?.booking_venue ?? "—";
}

function invoiceBookingService(inv) {
  return inv?.booking?.service ?? inv?.booking_service ?? "—";
}

function invoiceBookingPackage(inv) {
  return inv?.booking?.package ?? inv?.booking_package ?? "—";
}

function normalizeAnalysisInvoiceRow(inv, rowKey) {
  if (!inv || typeof inv !== "object") return null;
  return {
    ...inv,
    __patientName: inv.patient_name || inv.__patientName || "—",
    __rowKey: String(rowKey ?? inv.id ?? inv.invoice_number ?? "row"),
  };
}

function flattenInvoiceDetailResults(results) {
  const rows = Array.isArray(results) ? results : [];
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    if (Array.isArray(item?.invoices)) {
      for (let j = 0; j < item.invoices.length; j++) {
        const inv = normalizeAnalysisInvoiceRow(
          {
            ...item.invoices[j],
            patient_name: item.patient_name ?? item.invoices[j]?.patient_name,
          },
          `${item?.user_id ?? "u"}-${item?.patient_id ?? "p"}-${item.invoices[j]?.id ?? item.invoices[j]?.invoice_number ?? j}`
        );
        if (inv) out.push(inv);
      }
      continue;
    }
    const inv = normalizeAnalysisInvoiceRow(item, item?.id ?? item?.invoice_number ?? i);
    if (inv) out.push(inv);
  }
  return out;
}

function buildAnalysisInvoiceQueryParams({ status, year, month, yearType, page = 1 }) {
  const params = {
    year,
    page,
  };
  if (yearType) params.year_type = yearType;
  if (month != null && month !== "") params.month = month;
  if (status) params.status = status;
  return params;
}

/** Plain-language label for API invoice status codes. */
function invoiceStatusInSimpleWords(status) {
  const u = String(status || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (u === "PARTIALLY_PAID") return "Partly paid";
  if (u === "UNPAID") return "Unpaid";
  if (u === "PAID" || u === "FULLY_PAID") return "Fully paid";
  if (u === "OVERDUE") return "Overdue";
  if (!u) return "—";
  return String(status);
}

const INVOICE_TABLE_COLUMNS = [
  { key: "billNo", header: "Bill number", hint: "Official bill reference" },
  { key: "patient", header: "Patient name", hint: "Patient linked to this bill" },
  { key: "from", header: "Start Date", hint: "Start of this bill period" },
  { key: "to", header: "End Date", hint: "End of this bill period" },
  { key: "total", header: "Total bill (₹)", hint: "Full amount on this bill" },
  { key: "paid", header: "Paid so far (₹)", hint: "Money already received" },
  { key: "due", header: "Balance due (₹)", hint: "Amount still to be paid" },
  { key: "status", header: "Payment status", hint: "How payment stands" },
  { key: "booking", header: "Booking ref.", hint: "Booking reference" },
  { key: "venue", header: "Centre / place", hint: "Where care is given" },
  { key: "service", header: "Service type", hint: "Kind of service" },
  { key: "pkg", header: "Package", hint: "Chosen plan" },
];

const INVOICE_DETAILS_TABLE_STORAGE_KEY = "paymentMaster.invoiceDetailsColumns.v1";
const INVOICE_DETAILS_COLUMN_ORDER_DEFAULT = INVOICE_TABLE_COLUMNS.map((c) => c.key);

function mergeInvoiceDetailsColumnOrder(saved) {
  const allowed = new Set(INVOICE_DETAILS_COLUMN_ORDER_DEFAULT);
  const out = [];
  const seen = new Set();
  if (Array.isArray(saved)) {
    for (const id of saved) {
      if (allowed.has(id) && !seen.has(id)) {
        out.push(id);
        seen.add(id);
      }
    }
  }
  for (const id of INVOICE_DETAILS_COLUMN_ORDER_DEFAULT) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

function loadInvoiceDetailsTablePrefs() {
  try {
    const raw = localStorage.getItem(INVOICE_DETAILS_TABLE_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    return p;
  } catch {
    return null;
  }
}

function saveInvoiceDetailsTablePrefs(order, visible) {
  try {
    localStorage.setItem(INVOICE_DETAILS_TABLE_STORAGE_KEY, JSON.stringify({ order, visible }));
  } catch {
    /* ignore */
  }
}

/** One table per patient — simple headers, text wraps to avoid wide layout. */
function InvoiceLinesTable({
  invoices,
  columns = INVOICE_TABLE_COLUMNS,
  draggingColumnId = null,
  onColumnDragStart,
  onColumnMove,
  onColumnDragEnd,
}) {
  const list = Array.isArray(invoices) ? invoices : [];
  if (list.length === 0) {
    return <div style={{ padding: 10, color: "#64748b", fontSize: 12 }}>No bills in this group.</div>;
  }
  const thStyle = {
    padding: "6px 5px",
    textAlign: "left",
    color: "#475569",
    fontWeight: 600,
    fontSize: 9,
    letterSpacing: "0.02em",
    textTransform: "none",
    borderBottom: "1px solid #e2e8f0",
    whiteSpace: "normal",
    wordBreak: "break-word",
    verticalAlign: "bottom",
    lineHeight: 1.25,
  };
  const tdStyle = {
    padding: "6px 5px",
    fontSize: 11,
    color: "#1e293b",
    wordBreak: "break-word",
    verticalAlign: "top",
    lineHeight: 1.35,
    borderBottom: "1px solid #f1f5f9",
  };
  return (
    <div style={{ width: "100%", minWidth: 0, overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          minWidth: 640,
          borderCollapse: "collapse",
          tableLayout: "fixed",
        }}
      >
        <thead>
          <tr style={{ background: "#fafafa" }}>
            {columns.map((col) => (
              <th
                key={col.key}
                title={col.hint}
                draggable
                onDragStart={(e) => {
                  onColumnDragStart?.(col.key);
                  try {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", col.key);
                  } catch {
                    /* ignore */
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggingColumnId && draggingColumnId !== col.key) {
                    onColumnMove?.(draggingColumnId, col.key);
                  }
                }}
                onDragEnd={() => onColumnDragEnd?.()}
                style={{
                  ...thStyle,
                  cursor: "grab",
                  background: draggingColumnId === col.key ? "#f1f5f9" : undefined,
                }}
              >
                <span style={{ color: "#94a3b8", marginRight: 6, fontSize: 11 }}>⋮⋮</span>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((inv) => (
            <tr key={inv.__rowKey ?? inv.id ?? inv.invoice_number}>
              {columns.map((col) => {
                if (col.key === "billNo") return <td key={col.key} style={{ ...tdStyle, fontWeight: 600 }}>{inv.invoice_number || "—"}</td>;
                if (col.key === "patient") return <td key={col.key} style={tdStyle}>{inv.__patientName || inv.patient_name || "—"}</td>;
                if (col.key === "from") return <td key={col.key} style={tdStyle}>{inv.period_start ? new Date(inv.period_start).toLocaleString("en-IN") : "—"}</td>;
                if (col.key === "to") return <td key={col.key} style={tdStyle}>{inv.period_end ? new Date(inv.period_end).toLocaleString("en-IN") : "—"}</td>;
                if (col.key === "total") return <td key={col.key} style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{fmtRupee(inv.total_amount)}</td>;
                if (col.key === "paid") return <td key={col.key} style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", color: "#15803d" }}>{fmtRupee(inv.paid_amount)}</td>;
                if (col.key === "due") {
                  return (
                    <td key={col.key} style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", color: "#b91c1c", fontWeight: 600 }}>
                      {fmtRupee(inv.remaining_amount)}
                    </td>
                  );
                }
                if (col.key === "status") return <td key={col.key} style={tdStyle} title={inv.status || ""}>{invoiceStatusInSimpleWords(inv.status)}</td>;
                if (col.key === "booking") return <td key={col.key} style={tdStyle}>{invoiceBookingOrderId(inv)}</td>;
                if (col.key === "venue") return <td key={col.key} style={tdStyle}>{invoiceBookingVenue(inv)}</td>;
                if (col.key === "service") return <td key={col.key} style={tdStyle}>{invoiceBookingService(inv)}</td>;
                if (col.key === "pkg") return <td key={col.key} style={tdStyle}>{invoiceBookingPackage(inv)}</td>;
                return <td key={col.key} style={tdStyle}>—</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Month-wise API: total invoice rows = generated + not yet generated; pending = unpaid invoices only. */
function collectionPctDisplay(r) {
  if (r.collection_pct != null && r.collection_pct !== "") {
    const n = Number(r.collection_pct);
    if (Number.isFinite(n)) return `${n.toFixed(1)}%`;
  }
  return pct(r.col, r.inv);
}

const MONTHLY_TABLE_STORAGE_KEY = "paymentMaster.monthlyPerfColumns.v1";

const MONTHLY_PERF_COLUMN_ORDER_DEFAULT = [
  "month",
  "bookings_executed",
  "bookings_ended",
  "no_invoices",
  "paid_invoices",
  "partially_paid_invoices",
  "pending",
  "unmapped_count",
  "unmapped_amount",
  "invoice_value",
  "amt_collected",
  "balance",
  "collection_pct",
];

const MONTHLY_PERF_COLUMN_LABELS = {
  month: "Month",
  bookings_executed: "Booking initiated",
  bookings_ended: "Booking ended",
  no_invoices: "No. of Invoices",
  paid_invoices: "Fully paid invoice",
  partially_paid_invoices: "Partially paid",
  pending: "Unpaid invoices",
  unmapped_count: "Unmapped count",
  unmapped_amount: "Unmapped amount",
  invoice_value: "Invoice Value",
  amt_collected: "Amt Collected",
  balance: "Balance",
  collection_pct: "Collection %",
};

function mergeMonthlyColumnOrder(saved) {
  const allowed = new Set(MONTHLY_PERF_COLUMN_ORDER_DEFAULT);
  const out = [];
  const seen = new Set();
  const expandLegacyId = (id) => {
    if (id === "bookings") return ["bookings_executed", "bookings_ended"];
    return [id];
  };
  if (Array.isArray(saved)) {
    for (const id of saved) {
      for (const expanded of expandLegacyId(id)) {
        if (allowed.has(expanded) && !seen.has(expanded)) {
          out.push(expanded);
          seen.add(expanded);
        }
      }
    }
  }
  for (const id of MONTHLY_PERF_COLUMN_ORDER_DEFAULT) {
    if (!seen.has(id)) out.push(id);
  }
  const noMonth = out.filter((id) => id !== "month");
  return ["month", ...noMonth];
}

function loadMonthlyTablePrefs() {
  try {
    const raw = localStorage.getItem(MONTHLY_TABLE_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    return p;
  } catch {
    return null;
  }
}

function saveMonthlyTablePrefs(order, visible) {
  try {
    localStorage.setItem(MONTHLY_TABLE_STORAGE_KEY, JSON.stringify({ order, visible }));
  } catch {
    /* ignore */
  }
}

function StatusBadge({ inv, col }) {
  if (!inv) return <span style={badge("gray")}>No data</span>;
  const r = col / inv;
  if (r >= 1) return <span style={badge("green")}>Settled</span>;
  if (r >= 0.9) return <span style={badge("amber")}>Partial</span>;
  return <span style={badge("red")}>Pending</span>;
}

function badge(c) {
  const map = {
    green: { bg: "#d1fae5", color: "#065f46" },
    amber: { bg: "#fef3c7", color: "#92400e" },
    red: { bg: "#fee2e2", color: "#991b1b" },
    gray: { bg: "#f1f5f9", color: "#475569" },
    blue: { bg: "#dbeafe", color: "#1e40af" },
  };
  const { bg, color } = map[c] || map.gray;
  return {
    background: bg, color, fontSize: 10, padding: "2px 8px",
    borderRadius: 20, fontWeight: 500, whiteSpace: "nowrap",
  };
}

function KpiCard({ label, value, sub, accent }) {
  const accents = {
    blue: "#1d4ed8", green: "#15803d", amber: "#b45309", red: "#b91c1c", default: "#334155",
  };
  return (
    <div style={{
      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
      padding: "5px 6px", minWidth: 84,
    }}>
      <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 1, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1.2 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: accents[accent] || accents.default, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 1, lineHeight: 1.2 }}>{sub}</div>}
    </div>
  );
}

const monthlyPerfThBase = {
  padding: "6px 8px",
  color: "#64748b",
  fontWeight: 600,
  fontSize: 10,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  borderBottom: "1px solid #f1f5f9",
  whiteSpace: "nowrap",
};

function monthlyPerfRowStats(r) {
  const b = r.balance != null ? Number(r.balance) : Number(r.inv) - Number(r.col);
  const unmappedCount =
    Number(
      r.unmapped_count ??
        r.unmapped_payments ??
        r.total_unmapped_count ??
        r.total_unmapped_payments ??
        0
    ) || 0;
  const unmappedAmount = Number(r.unmapped_amount ?? r.total_unmapped_amount ?? 0) || 0;
  return {
    b,
    bookingsExecuted: Number(r.bookings_executed ?? r.bk_start ?? r.bk ?? 0) || 0,
    bookingsEnded: Number(r.bookings_ended ?? r.bk_end ?? 0) || 0,
    invoiceCount: Number(r.generated_invoices ?? 0) || 0,
    paidInvoices: Number(r.paid_invoices ?? r.total_paid_invoices ?? 0) || 0,
    partiallyPaidInvoices: Number(r.partially_paid_invoices ?? 0) || 0,
    unmappedCount,
    unmappedAmount,
    pendingInvoices: Number(r.pending_invoices ?? r.pendingInvoices ?? r.unpaid_invoices ?? 0) || 0,
  };
}

/** Period totals from month-wise-performance `summary` (preferred when viewing all months). */
function monthlyTotalsFromSummary(summary) {
  if (!summary || typeof summary !== "object") return null;
  const inv = Number(summary.total_invoice_value ?? 0) || 0;
  const col = Number(summary.total_amt_collected ?? 0) || 0;
  const balRaw = summary.total_balance;
  const balance = balRaw != null && balRaw !== "" ? Number(balRaw) : inv - col;
  return {
    bookings_executed: Number(summary.total_bookings_starting ?? 0) || 0,
    bookings_ended: Number(summary.total_bookings_ending ?? 0) || 0,
    invoiceCount: Number(summary.total_generated_invoices ?? 0) || 0,
    paidInvoices: Number(summary.total_paid_invoices ?? 0) || 0,
    partiallyPaidInvoices: Number(summary.total_partially_paid_invoices ?? 0) || 0,
    unmappedCount: Number(summary.total_unmapped_count ?? 0) || 0,
    unmappedAmount: Number(summary.total_unmapped_amount ?? 0) || 0,
    inv,
    col,
    balance,
    pending: Number(summary.total_unpaid_invoices ?? 0) || 0,
    collection_pct: summary.collection_pct,
  };
}

function getMonthlyPdfColumns() {
  try {
    const p = loadMonthlyTablePrefs();
    const order = p?.order ? mergeMonthlyColumnOrder(p.order) : [...MONTHLY_PERF_COLUMN_ORDER_DEFAULT];
    const vis = Object.fromEntries(MONTHLY_PERF_COLUMN_ORDER_DEFAULT.map((id) => [id, true]));
    if (p?.visible && typeof p.visible === "object") {
      for (const id of MONTHLY_PERF_COLUMN_ORDER_DEFAULT) {
        if (p.visible[id] !== undefined) vis[id] = Boolean(p.visible[id]);
      }
    }
    vis.month = true;
    return mergeMonthlyColumnOrder(order).filter((id) => vis[id]);
  } catch {
    return mergeMonthlyColumnOrder([...MONTHLY_PERF_COLUMN_ORDER_DEFAULT]);
  }
}

function monthlyPdfCellHtml(colId, r) {
  const s = monthlyPerfRowStats(r);
  switch (colId) {
    case "month":
      return `<td>${esc(r.month)}</td>`;
    case "bookings_executed":
      return `<td>${s.bookingsExecuted || "—"}</td>`;
    case "bookings_ended":
      return `<td>${s.bookingsEnded || "—"}</td>`;
    case "partially_paid_invoices":
      return `<td>${s.partiallyPaidInvoices}</td>`;
    case "no_invoices":
      return `<td>${s.invoiceCount}</td>`;
    case "paid_invoices":
      return `<td>${s.paidInvoices}</td>`;
    case "unmapped_count":
      return `<td>${s.unmappedCount}</td>`;
    case "unmapped_amount":
      return `<td>${esc(fmt(s.unmappedAmount))}</td>`;
    case "invoice_value":
      return `<td>${esc(fmt(r.inv))}</td>`;
    case "amt_collected":
      return `<td>${esc(fmt(r.col))}</td>`;
    case "balance":
      return `<td>${r.inv || r.col ? esc(fmt(Math.abs(s.b))) : "—"}</td>`;
    case "collection_pct":
      return `<td>${esc(collectionPctDisplay(r))}</td>`;
    case "pending":
      return `<td>${s.pendingInvoices}</td>`;
    default:
      return `<td>—</td>`;
  }
}

function monthlyPdfTotals(list, periodSummary = null) {
  const fromApi = monthlyTotalsFromSummary(periodSummary);
  if (fromApi) return fromApi;
  return list.reduce(
    (acc, r) => {
      const s = monthlyPerfRowStats(r);
      acc.bookings_executed += s.bookingsExecuted;
      acc.bookings_ended += s.bookingsEnded;
      acc.invoiceCount += s.invoiceCount;
      acc.paidInvoices += s.paidInvoices;
      acc.partiallyPaidInvoices += s.partiallyPaidInvoices;
      acc.unmappedCount += s.unmappedCount;
      acc.unmappedAmount += s.unmappedAmount;
      acc.inv += Number(r.inv) || 0;
      acc.col += Number(r.col) || 0;
      acc.pending += s.pendingInvoices;
      return acc;
    },
    {
      bookings_executed: 0,
      bookings_ended: 0,
      invoiceCount: 0,
      paidInvoices: 0,
      partiallyPaidInvoices: 0,
      unmappedCount: 0,
      unmappedAmount: 0,
      inv: 0,
      col: 0,
      pending: 0,
    }
  );
}

function monthlyPdfTotalCellHtml(colId, t) {
  const bal = t.balance != null ? Number(t.balance) : t.inv - t.col;
  switch (colId) {
    case "month":
      return `<td>Total (period)</td>`;
    case "bookings_executed":
      return `<td>${t.bookings_executed ?? "—"}</td>`;
    case "bookings_ended":
      return `<td>${t.bookings_ended ?? "—"}</td>`;
    case "partially_paid_invoices":
      return `<td>${t.partiallyPaidInvoices ?? "—"}</td>`;
    case "no_invoices":
      return `<td>${t.invoiceCount || "—"}</td>`;
    case "paid_invoices":
      return `<td>${t.paidInvoices}</td>`;
    case "unmapped_count":
      return `<td>${t.unmappedCount}</td>`;
    case "unmapped_amount":
      return `<td>${esc(fmt(t.unmappedAmount))}</td>`;
    case "invoice_value":
      return `<td>${esc(fmt(t.inv))}</td>`;
    case "amt_collected":
      return `<td>${esc(fmt(t.col))}</td>`;
    case "balance":
      return `<td>${t.inv || t.col ? esc(fmt(Math.abs(bal))) : "—"}</td>`;
    case "collection_pct":
      return `<td>${esc(
        t.collection_pct != null && t.collection_pct !== ""
          ? `${Number(t.collection_pct).toFixed(1)}%`
          : pct(t.col, t.inv)
      )}</td>`;
    case "pending":
      return `<td>${t.pending}</td>`;
    default:
      return `<td>—</td>`;
  }
}

function MonthlyPerfCell({ colId, r }) {
  const {
    b,
    bookingsExecuted,
    bookingsEnded,
    invoiceCount,
    paidInvoices,
    partiallyPaidInvoices,
    unmappedCount,
    unmappedAmount,
    pendingInvoices,
  } = monthlyPerfRowStats(r);
  switch (colId) {
    case "month":
      return <td style={{ padding: "6px 8px", fontWeight: 600, color: "#1e293b" }}>{r.month}</td>;
    case "bookings_executed":
      return <Td>{bookingsExecuted || "—"}</Td>;
    case "bookings_ended":
      return <Td>{bookingsEnded || "—"}</Td>;
    case "partially_paid_invoices":
      return <Td>{partiallyPaidInvoices}</Td>;
    case "no_invoices":
      return <Td>{invoiceCount}</Td>;
    case "paid_invoices":
      return <Td>{paidInvoices}</Td>;
    case "unmapped_count":
      return <Td>{unmappedCount}</Td>;
    case "unmapped_amount":
      return <Td>{fmt(unmappedAmount)}</Td>;
    case "invoice_value":
      return <Td>{fmt(r.inv)}</Td>;
    case "amt_collected":
      return <Td>{fmt(r.col)}</Td>;
    case "balance":
      return (
        <Td color={r.inv || r.col ? (b >= 0 ? "#b91c1c" : "#15803d") : undefined}>
          {r.inv || r.col ? fmt(Math.abs(b)) : "—"}
        </Td>
      );
    case "collection_pct":
      return <Td>{collectionPctDisplay(r)}</Td>;
    case "pending":
      return <Td>{pendingInvoices}</Td>;
    default:
      return <Td>—</Td>;
  }
}

function MonthlySummary({
  monthsData = [],
  periodSummary = null,
  selectedMonthKey,
  onSelectMonthKey,
  showAllMonths,
  onShowAllMonthsChange,
  onExportPdf,
  onExportExcel,
  onShowDetails,
  isDetailsLoading,
  detailsStatus,
  onDetailsStatusChange,
  isDetailsVisible,
  onCloseDetails,
  detailsError,
  detailsItems,
  detailsMeta,
  onInvoiceDetailsPageNavigate,
  invoiceStatusCounts,
  isInvoiceStatusCountsLoading,
}) {
  const data = monthsData;
  const selectedIdx = Math.max(0, data.findIndex((d) => d.month === selectedMonthKey));
  const row = data[selectedIdx] ?? data[0];
  if (!row) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0" }}>
        No months in this range.
      </div>
    );
  }

  const rowStats = monthlyPerfRowStats(row);
  const kpiInv = Number(row.inv) || 0;
  const kpiCol = Number(row.col) || 0;
  const kpiBal = row.balance != null ? Number(row.balance) : kpiInv - kpiCol;

  const rowsToShow = useMemo(() => (showAllMonths ? data : [row]), [showAllMonths, data, row]);
  const periodTotals = useMemo(() => {
    if (!showAllMonths) return null;
    return monthlyTotalsFromSummary(periodSummary) ?? monthlyPdfTotals(data);
  }, [showAllMonths, periodSummary, data]);

  const kpiBkExecuted = showAllMonths && periodTotals ? periodTotals.bookings_executed : rowStats.bookingsExecuted;
  const kpiBkEnded = showAllMonths && periodTotals ? periodTotals.bookings_ended : rowStats.bookingsEnded;
  const kpiInvDisp = showAllMonths && periodTotals ? periodTotals.inv : kpiInv;
  const kpiColDisp = showAllMonths && periodTotals ? periodTotals.col : kpiCol;
  const kpiBalDisp =
    showAllMonths && periodTotals
      ? periodTotals.balance != null
        ? Number(periodTotals.balance)
        : periodTotals.inv - periodTotals.col
      : kpiBal;
  const kpiPartiallyPaid =
    showAllMonths && periodTotals
      ? periodTotals.partiallyPaidInvoices
      : rowStats.partiallyPaidInvoices;
  const kpiUnpaid =
    showAllMonths && periodTotals ? periodTotals.pending : rowStats.pendingInvoices;
  const kpiLabelText = showAllMonths ? "All months" : row.month.replace("'", " ");
  const pendingForScope = showAllMonths && periodTotals ? periodTotals.pending : rowStats.pendingInvoices;
  const partlyPaidCount =
    showAllMonths && periodSummary != null
      ? Number(periodSummary.total_partially_paid_invoices ?? 0)
      : invoiceStatusCounts?.PARTIALLY_PAID;
  const unpaidCount =
    showAllMonths && periodSummary != null
      ? Number(periodSummary.total_unpaid_invoices ?? 0)
      : invoiceStatusCounts?.UNPAID;
  const selectedFilterCount =
    detailsStatus === "PARTIALLY_PAID" ? partlyPaidCount : detailsStatus === "UNPAID" ? unpaidCount : null;

  const [monthlyColumnOrder, setMonthlyColumnOrder] = useState(() => {
    if (typeof window === "undefined") return [...MONTHLY_PERF_COLUMN_ORDER_DEFAULT];
    const p = loadMonthlyTablePrefs();
    return p?.order ? mergeMonthlyColumnOrder(p.order) : [...MONTHLY_PERF_COLUMN_ORDER_DEFAULT];
  });
  const [monthlyColumnVisible, setMonthlyColumnVisible] = useState(() => {
    const base = Object.fromEntries(MONTHLY_PERF_COLUMN_ORDER_DEFAULT.map((id) => [id, true]));
    if (typeof window !== "undefined") {
      const p = loadMonthlyTablePrefs();
      if (p?.visible && typeof p.visible === "object") {
        for (const id of MONTHLY_PERF_COLUMN_ORDER_DEFAULT) {
          if (p.visible[id] !== undefined) base[id] = Boolean(p.visible[id]);
        }
      }
    }
    base.month = true;
    return base;
  });
  const [monthlyColPanelOpen, setMonthlyColPanelOpen] = useState(false);
  const [dragMonthlyCol, setDragMonthlyCol] = useState(null);
  const monthlyColPanelWrapRef = useRef(null);
  const [invoiceDetailsColumnOrder, setInvoiceDetailsColumnOrder] = useState(() => {
    if (typeof window === "undefined") return [...INVOICE_DETAILS_COLUMN_ORDER_DEFAULT];
    const p = loadInvoiceDetailsTablePrefs();
    return p?.order ? mergeInvoiceDetailsColumnOrder(p.order) : [...INVOICE_DETAILS_COLUMN_ORDER_DEFAULT];
  });
  const [invoiceDetailsColumnVisible, setInvoiceDetailsColumnVisible] = useState(() => {
    const base = Object.fromEntries(INVOICE_DETAILS_COLUMN_ORDER_DEFAULT.map((id) => [id, true]));
    if (typeof window !== "undefined") {
      const p = loadInvoiceDetailsTablePrefs();
      if (p?.visible && typeof p.visible === "object") {
        for (const id of INVOICE_DETAILS_COLUMN_ORDER_DEFAULT) {
          if (p.visible[id] !== undefined) base[id] = Boolean(p.visible[id]);
        }
      }
    }
    return base;
  });
  const [invoiceDetailsColPanelOpen, setInvoiceDetailsColPanelOpen] = useState(false);
  const [dragInvoiceDetailsCol, setDragInvoiceDetailsCol] = useState(null);
  const invoiceDetailsColPanelWrapRef = useRef(null);

  useEffect(() => {
    saveMonthlyTablePrefs(monthlyColumnOrder, monthlyColumnVisible);
  }, [monthlyColumnOrder, monthlyColumnVisible]);
  useEffect(() => {
    saveInvoiceDetailsTablePrefs(invoiceDetailsColumnOrder, invoiceDetailsColumnVisible);
  }, [invoiceDetailsColumnOrder, invoiceDetailsColumnVisible]);

  useEffect(() => {
    if (!monthlyColPanelOpen) return;
    const onDoc = (e) => {
      if (monthlyColPanelWrapRef.current && !monthlyColPanelWrapRef.current.contains(e.target)) {
        setMonthlyColPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [monthlyColPanelOpen]);
  useEffect(() => {
    if (!invoiceDetailsColPanelOpen) return;
    const onDoc = (e) => {
      if (invoiceDetailsColPanelWrapRef.current && !invoiceDetailsColPanelWrapRef.current.contains(e.target)) {
        setInvoiceDetailsColPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [invoiceDetailsColPanelOpen]);

  const visibleOrderedColumns = useMemo(
    () => mergeMonthlyColumnOrder(monthlyColumnOrder).filter((id) => monthlyColumnVisible[id]),
    [monthlyColumnOrder, monthlyColumnVisible]
  );
  const visibleInvoiceDetailsColumns = useMemo(
    () =>
      mergeInvoiceDetailsColumnOrder(invoiceDetailsColumnOrder)
        .filter((id) => invoiceDetailsColumnVisible[id])
        .map((id) => INVOICE_TABLE_COLUMNS.find((c) => c.key === id))
        .filter(Boolean),
    [invoiceDetailsColumnOrder, invoiceDetailsColumnVisible]
  );
  const flattenedDetailInvoices = useMemo(
    () => flattenInvoiceDetailResults(detailsItems),
    [detailsItems]
  );

  const moveMonthlyColumn = useCallback((dragId, targetId) => {
    if (dragId === "month" || targetId === "month" || dragId === targetId) return;
    setMonthlyColumnOrder((prev) => {
      const merged = mergeMonthlyColumnOrder(prev);
      const noMonth = merged.filter((id) => id !== "month");
      const from = noMonth.indexOf(dragId);
      const to = noMonth.indexOf(targetId);
      if (from < 0 || to < 0) return merged;
      const next = [...noMonth];
      next.splice(from, 1);
      next.splice(to, 0, dragId);
      return mergeMonthlyColumnOrder(["month", ...next]);
    });
  }, []);
  const moveInvoiceDetailsColumn = useCallback((dragId, targetId) => {
    if (dragId === targetId) return;
    setInvoiceDetailsColumnOrder((prev) => {
      const merged = mergeInvoiceDetailsColumnOrder(prev);
      const from = merged.indexOf(dragId);
      const to = merged.indexOf(targetId);
      if (from < 0 || to < 0) return merged;
      const next = [...merged];
      next.splice(from, 1);
      next.splice(to, 0, dragId);
      return mergeInvoiceDetailsColumnOrder(next);
    });
  }, []);
  const exportInvoiceDetailsPdf = useCallback(() => {
    const cols = visibleInvoiceDetailsColumns.length ? visibleInvoiceDetailsColumns : INVOICE_TABLE_COLUMNS;
    const rows = flattenedDetailInvoices;
    const filterLabel =
      detailsStatus === "PARTIALLY_PAID" ? "partly paid" : detailsStatus === "UNPAID" ? "unpaid" : detailsStatus;
    const title = `Bill list — ${filterLabel}`;
    const sub = `${detailsMeta.periodLabel || "Selected period"} • ${detailsMeta.count ?? rows.length ?? 0} records`;
    const headers = cols.map((c) => `<th>${esc(c.header)}</th>`).join("");
    const rowHtml = rows
      .map((inv) => {
        const tds = cols
          .map((c) => {
            if (c.key === "billNo") return `<td>${esc(inv.invoice_number || "—")}</td>`;
            if (c.key === "patient") return `<td>${esc(inv.__patientName || inv.patient_name || "—")}</td>`;
            if (c.key === "from") return `<td>${esc(inv.period_start ? new Date(inv.period_start).toLocaleString("en-IN") : "—")}</td>`;
            if (c.key === "to") return `<td>${esc(inv.period_end ? new Date(inv.period_end).toLocaleString("en-IN") : "—")}</td>`;
            if (c.key === "total") return `<td>${esc(fmtRupee(inv.total_amount))}</td>`;
            if (c.key === "paid") return `<td>${esc(fmtRupee(inv.paid_amount))}</td>`;
            if (c.key === "due") return `<td>${esc(fmtRupee(inv.remaining_amount))}</td>`;
            if (c.key === "status") return `<td>${esc(invoiceStatusInSimpleWords(inv.status))}</td>`;
            if (c.key === "booking") return `<td>${esc(invoiceBookingOrderId(inv))}</td>`;
            if (c.key === "venue") return `<td>${esc(invoiceBookingVenue(inv))}</td>`;
            if (c.key === "service") return `<td>${esc(invoiceBookingService(inv))}</td>`;
            if (c.key === "pkg") return `<td>${esc(invoiceBookingPackage(inv))}</td>`;
            return `<td>—</td>`;
          })
          .join("");
        return `<tr>${tds}</tr>`;
      })
      .join("");
    const body = `
      <h2>${esc(title)}</h2>
      <p>${esc(sub)}</p>
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>${rowHtml || `<tr><td colspan="${cols.length}">No invoices for this period.</td></tr>`}</tbody>
      </table>
    `;
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:18px;color:#0f172a}
        h2{margin:0 0 8px 0;font-size:18px}
        p{margin:0 0 10px 0;color:#475569;font-size:12px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #e2e8f0;padding:6px 7px;text-align:left;vertical-align:top}
        th{background:#f8fafc;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
      </style></head><body>${body}</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }, [detailsMeta.count, detailsMeta.periodLabel, detailsStatus, flattenedDetailInvoices, visibleInvoiceDetailsColumns]);

  const exportInvoiceDetailsExcel = useCallback(() => {
    const cols = visibleInvoiceDetailsColumns.length ? visibleInvoiceDetailsColumns : INVOICE_TABLE_COLUMNS;
    const rows = flattenedDetailInvoices;
    const filterLabel =
      detailsStatus === "PARTIALLY_PAID" ? "partly-paid" : detailsStatus === "UNPAID" ? "unpaid" : String(detailsStatus || "bills");

    const headerRow = cols.map((c) => c.header);
    const dataRows = rows.map((inv) =>
      cols.map((c) => {
        if (c.key === "billNo") return inv.invoice_number || "—";
        if (c.key === "patient") return inv.__patientName || inv.patient_name || "—";
        if (c.key === "from") return inv.period_start ? new Date(inv.period_start).toLocaleString("en-IN") : "—";
        if (c.key === "to") return inv.period_end ? new Date(inv.period_end).toLocaleString("en-IN") : "—";
        if (c.key === "total") return Number(inv.total_amount ?? 0) || 0;
        if (c.key === "paid") return Number(inv.paid_amount ?? 0) || 0;
        if (c.key === "due") return Number(inv.remaining_amount ?? 0) || 0;
        if (c.key === "status") return invoiceStatusInSimpleWords(inv.status);
        if (c.key === "booking") return invoiceBookingOrderId(inv);
        if (c.key === "venue") return invoiceBookingVenue(inv);
        if (c.key === "service") return invoiceBookingService(inv);
        if (c.key === "pkg") return invoiceBookingPackage(inv);
        return "—";
      })
    );

    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bill List");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `bill-list-${filterLabel}-${stamp}.xlsx`);
  }, [detailsStatus, flattenedDetailInvoices, visibleInvoiceDetailsColumns]);

  return (
    <div>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "4px 6px", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onShowAllMonthsChange((prev) => !prev)}
            style={{
              padding: "2px 6px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: showAllMonths ? "#eff6ff" : "#fff",
              color: showAllMonths ? "#1d4ed8" : "#334155",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              lineHeight: 1.2,
              flexShrink: 0,
            }}
          >
            {showAllMonths ? "Selected month only" : "Show all months"}
          </button>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
          {data.map((d, i) => (
            <button
              key={d.month}
              type="button"
              onClick={() => {
                onSelectMonthKey(d.month);
              }}
              style={{
                padding: "2px 8px",
                borderRadius: 16,
                border: "1px solid",
                borderColor: !showAllMonths && i === selectedIdx ? "#1d4ed8" : "#e2e8f0",
                background: !showAllMonths && i === selectedIdx ? "#1d4ed8" : "#fff",
                color: !showAllMonths && i === selectedIdx ? "#fff" : "#64748b",
                fontSize: 10,
                cursor: "pointer",
                fontWeight: !showAllMonths && i === selectedIdx ? 600 : 400,
              }}
            >
              {d.month}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(84px,1fr))", gap: 4, marginBottom: 4 }}>
        <KpiCard
          label="Booking initiated"
          value={kpiBkExecuted.toLocaleString("en-IN") || "—"}
          sub={kpiLabelText}
          accent="blue"
        />
        <KpiCard
          label="Booking ended"
          value={kpiBkEnded.toLocaleString("en-IN") || "—"}
          sub={kpiLabelText}
          accent="blue"
        />
        <KpiCard
          label="Partially paid"
          value={kpiPartiallyPaid.toLocaleString("en-IN")}
          sub="Invoices"
          accent="amber"
        />
        <KpiCard label="Unpaid invoices" value={kpiUnpaid.toLocaleString("en-IN")} sub="Open bills" accent="red" />
        <KpiCard label="Total Invoice Amount" value={fmt(kpiInvDisp)} sub="Billed amount" accent="default" />
        <KpiCard label="Amt Collected" value={fmt(kpiColDisp)} sub={kpiInvDisp ? `${pct(kpiColDisp, kpiInvDisp)} of invoice` : "—"} accent="green" />
        <KpiCard
          label="Balance"
          value={kpiInvDisp || kpiColDisp ? fmt(Math.abs(kpiBalDisp)) : "—"}
          sub={!kpiInvDisp && !kpiColDisp ? "—" : kpiBalDisp >= 0 ? "Shortfall" : "Surplus"}
          accent={!kpiInvDisp && !kpiColDisp ? "default" : kpiBalDisp >= 0 ? "red" : "green"}
        />
        <KpiCard
          label="Avg / Booking"
          value={kpiBkExecuted ? fmt(Math.round(kpiInvDisp / kpiBkExecuted)) : "—"}
          sub="Invoice avg"
          accent="amber"
        />
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "visible" }}>
        <div
          ref={monthlyColPanelWrapRef}
          style={{
            padding: "4px 6px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
            borderRadius: "10px 10px 0 0",
            overflow: "visible",
            position: "relative",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 12 }}>Month-wise performance</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setMonthlyColPanelOpen((o) => !o)}
              title="Choose and reorder columns"
              style={{
                padding: "3px 8px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                background: monthlyColPanelOpen ? "#f1f5f9" : "#fff",
                color: "#334155",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                lineHeight: 1.2,
              }}
            >
              Columns
            </button>
            <button
              type="button"
              onClick={onExportPdf}
              title="Export PDF"
              style={{
                padding: "3px 8px",
                borderRadius: 6,
                border: "1px solid #1d4ed8",
                background: "#1d4ed8",
                color: "#fff",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                lineHeight: 1.2,
              }}
            >
              PDF
            </button>
            <button
              type="button"
              onClick={onExportExcel}
              title="Export Excel"
              style={{
                padding: "3px 8px",
                borderRadius: 6,
                border: "1px solid #047857",
                background: "#059669",
                color: "#fff",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                lineHeight: 1.2,
              }}
            >
              Excel
            </button>
          </div>
          {monthlyColPanelOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 8,
                marginTop: 4,
                zIndex: 40,
                minWidth: 260,
                maxWidth: "min(320px, 92vw)",
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                boxShadow: "0 10px 40px rgba(15,23,42,0.12)",
                padding: "8px 10px",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                Choose columns
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 8, lineHeight: 1.35 }}>
                Drag table headers to reorder. Month stays first.
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 280, overflowY: "auto" }}>
                {mergeMonthlyColumnOrder(monthlyColumnOrder).map((colId) => {
                  const locked = colId === "month";
                  const label = MONTHLY_PERF_COLUMN_LABELS[colId] || colId;
                  return (
                    <li
                      key={colId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 4px",
                        borderRadius: 6,
                        borderBottom: "1px solid #f8fafc",
                        cursor: "default",
                      }}
                    >
                      <span style={{ fontSize: 12, color: "#cbd5e1", userSelect: "none", width: 14, textAlign: "center" }} aria-hidden>
                        {locked ? "—" : "•"}
                      </span>
                      <label
                        style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#334155", cursor: locked ? "default" : "pointer" }}
                      >
                        <input
                          type="checkbox"
                          checked={!!monthlyColumnVisible[colId]}
                          disabled={locked}
                          onChange={() => {
                            if (locked) return;
                            setMonthlyColumnVisible((prev) => ({ ...prev, [colId]: !prev[colId] }));
                          }}
                          style={{ cursor: locked ? "not-allowed" : "pointer" }}
                        />
                        <span>{label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {visibleOrderedColumns.map((colId) => (
                  <th
                    key={colId}
                    draggable={colId !== "month"}
                    onDragStart={(e) => {
                      if (colId === "month") {
                        e.preventDefault();
                        return;
                      }
                      setDragMonthlyCol(colId);
                      e.dataTransfer.effectAllowed = "move";
                      try {
                        e.dataTransfer.setData("text/plain", colId);
                      } catch {
                        /* ignore */
                      }
                    }}
                    onDragEnd={() => setDragMonthlyCol(null)}
                    onDragOver={(e) => {
                      if (colId === "month" || !dragMonthlyCol || dragMonthlyCol === colId) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragMonthlyCol || (() => {
                        try {
                          return e.dataTransfer.getData("text/plain");
                        } catch {
                          return null;
                        }
                      })();
                      if (from) moveMonthlyColumn(from, colId);
                      setDragMonthlyCol(null);
                    }}
                    style={{
                      ...monthlyPerfThBase,
                      textAlign: colId === "month" ? "left" : "right",
                      cursor: colId === "month" ? "default" : "grab",
                      background:
                        dragMonthlyCol && dragMonthlyCol === colId ? "#e2e8f0" : undefined,
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {colId !== "month" ? (
                        <span aria-hidden style={{ color: "#cbd5e1", fontSize: 10 }}>⋮⋮</span>
                      ) : null}
                      {MONTHLY_PERF_COLUMN_LABELS[colId] || colId}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsToShow.map((r) => {
                const isSel = r.month === row.month;
                return (
                  <tr
                    key={r.month}
                    onClick={() => {
                      onSelectMonthKey(r.month);
                    }}
                    style={{
                      borderBottom: "1px solid #f8fafc",
                      background: isSel ? "#eff6ff" : undefined,
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSel) e.currentTarget.style.background = "#f8fafc";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isSel ? "#eff6ff" : "";
                    }}
                  >
                    {visibleOrderedColumns.map((colId) => (
                      <MonthlyPerfCell key={colId} colId={colId} r={r} />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div
          style={{
            padding: "6px 8px",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <select
            value={detailsStatus}
            onChange={(e) => onDetailsStatusChange(e.target.value)}
            style={{
              padding: "3px 6px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#fff",
              fontSize: 10,
              color: "#334155",
              cursor: "pointer",
              maxWidth: 140,
            }}
          >
            <option value="PARTIALLY_PAID">
              Partly paid bills{Number.isFinite(partlyPaidCount) ? ` (${partlyPaidCount})` : ""}
            </option>
            <option value="UNPAID">
              Unpaid bills{Number.isFinite(unpaidCount) ? ` (${unpaidCount})` : ""}
            </option>
          </select>
          <button
            type="button"
            onClick={() => onShowDetails()}
            disabled={
              (Number.isFinite(selectedFilterCount) ? selectedFilterCount : pendingForScope) <= 0 ||
              isDetailsLoading
            }
            style={{
              padding: "3px 8px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#fff",
              color: "#1d4ed8",
              fontSize: 10,
              fontWeight: 600,
              cursor:
                (Number.isFinite(selectedFilterCount) ? selectedFilterCount : pendingForScope) > 0 &&
                !isDetailsLoading
                  ? "pointer"
                  : "not-allowed",
              opacity:
                (Number.isFinite(selectedFilterCount) ? selectedFilterCount : pendingForScope) > 0 &&
                !isDetailsLoading
                  ? 1
                  : 0.55,
              minWidth: 54,
              lineHeight: 1.2,
            }}
          >
            {isDetailsLoading ? "…" : "Details"}
          </button>
          {isDetailsVisible && (
            <button
              type="button"
              onClick={onCloseDetails}
              style={{
                padding: "3px 8px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#334155",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                lineHeight: 1.2,
              }}
            >
              Close
            </button>
          )}
        </div>
        {isDetailsVisible && (
          <div style={{ borderTop: "1px solid #f1f5f9", background: "#fff", padding: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Bill list — filter: {detailsStatus === "PARTIALLY_PAID" ? "partially paid" : detailsStatus === "UNPAID" ? "unpaid" : detailsStatus}
                {Number.isFinite(selectedFilterCount) ? ` (${selectedFilterCount})` : ""}
              </div>
              <div ref={invoiceDetailsColPanelWrapRef} style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    type="button"
                    onClick={exportInvoiceDetailsPdf}
                    title="Export bill list PDF"
                    style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      border: "1px solid #1d4ed8",
                      background: "#1d4ed8",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: "pointer",
                      lineHeight: 1.2,
                    }}
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={exportInvoiceDetailsExcel}
                    title="Export bill list Excel"
                    style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      border: "1px solid #047857",
                      background: "#059669",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: "pointer",
                      lineHeight: 1.2,
                    }}
                  >
                    Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceDetailsColPanelOpen((o) => !o)}
                    title="Choose and reorder columns"
                    style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      background: invoiceDetailsColPanelOpen ? "#f1f5f9" : "#fff",
                      color: "#334155",
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: "pointer",
                      lineHeight: 1.2,
                    }}
                  >
                    Columns
                  </button>
                </div>
                {invoiceDetailsColPanelOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: 0,
                      marginTop: 4,
                      zIndex: 40,
                      minWidth: 260,
                      maxWidth: "min(320px, 92vw)",
                      background: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      boxShadow: "0 10px 40px rgba(15,23,42,0.12)",
                      padding: "8px 10px",
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                      Choose columns
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 8, lineHeight: 1.35 }}>
                      Drag items to reorder. Toggle to show/hide.
                    </div>
                    {mergeInvoiceDetailsColumnOrder(invoiceDetailsColumnOrder).map((colId) => {
                      const col = INVOICE_TABLE_COLUMNS.find((c) => c.key === colId);
                      if (!col) return null;
                      return (
                        <label
                          key={colId}
                          draggable
                          onDragStart={() => setDragInvoiceDetailsCol(colId)}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const from = dragInvoiceDetailsCol;
                            if (from && from !== colId) moveInvoiceDetailsColumn(from, colId);
                            setDragInvoiceDetailsCol(null);
                          }}
                          onDragEnd={() => setDragInvoiceDetailsCol(null)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "5px 6px",
                            borderRadius: 6,
                            borderBottom: "1px solid #f8fafc",
                            cursor: "grab",
                            userSelect: "none",
                            background: dragInvoiceDetailsCol === colId ? "#f8fafc" : "#fff",
                          }}
                          title={col.hint}
                        >
                          <span style={{ color: "#94a3b8", fontSize: 12 }}>⋮⋮</span>
                          <input
                            type="checkbox"
                            checked={!!invoiceDetailsColumnVisible[colId]}
                            onChange={(e) => {
                              e.stopPropagation();
                              setInvoiceDetailsColumnVisible((prev) => ({ ...prev, [colId]: !prev[colId] }));
                            }}
                          />
                          <span style={{ fontSize: 11, color: "#334155" }}>{col.header}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {isDetailsLoading ? (
              <div style={{ padding: 10, color: "#64748b", fontSize: 13 }}>Loading details...</div>
            ) : detailsError ? (
              <div style={{ padding: 10, color: "#b91c1c", fontSize: 13 }}>{detailsError}</div>
            ) : detailsItems.length === 0 ? (
              <div style={{ padding: 10, color: "#64748b", fontSize: 13 }}>No invoices for this period.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                  <InvoiceLinesTable
                    columns={visibleInvoiceDetailsColumns.length ? visibleInvoiceDetailsColumns : INVOICE_TABLE_COLUMNS}
                    draggingColumnId={dragInvoiceDetailsCol}
                    onColumnDragStart={(colId) => setDragInvoiceDetailsCol(colId)}
                    onColumnMove={moveInvoiceDetailsColumn}
                    onColumnDragEnd={() => setDragInvoiceDetailsCol(null)}
                    invoices={flattenedDetailInvoices}
                  />
                </div>
                {typeof onInvoiceDetailsPageNavigate === "function" ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      padding: "8px 10px",
                      marginTop: 6,
                      borderTop: "1px solid #e2e8f0",
                      background: "#f1f5f9",
                      borderRadius: 8,
                    }}
                  >
                    <button
                      type="button"
                      disabled={
                        isDetailsLoading ||
                        (!detailsMeta.prevUrl && (detailsMeta.currentPage ?? 1) <= 1)
                      }
                      onClick={() => onInvoiceDetailsPageNavigate("prev")}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid #cbd5e1",
                        background:
                          !isDetailsLoading &&
                          (detailsMeta.prevUrl || (detailsMeta.currentPage ?? 1) > 1)
                            ? "#fff"
                            : "#e2e8f0",
                        color:
                          !isDetailsLoading &&
                          (detailsMeta.prevUrl || (detailsMeta.currentPage ?? 1) > 1)
                            ? "#334155"
                            : "#94a3b8",
                        fontSize: 10,
                        fontWeight: 600,
                        cursor:
                          !isDetailsLoading &&
                          (detailsMeta.prevUrl || (detailsMeta.currentPage ?? 1) > 1)
                            ? "pointer"
                            : "not-allowed",
                        lineHeight: 1.2,
                      }}
                    >
                      Previous
                    </button>
                    <span style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>
                      Page {detailsMeta.currentPage ?? 1} / {detailsMeta.totalPages ?? 1}
                    </span>
                    <button
                      type="button"
                      disabled={
                        isDetailsLoading ||
                        (!detailsMeta.nextUrl &&
                          (detailsMeta.currentPage ?? 1) >= (detailsMeta.totalPages ?? 1))
                      }
                      onClick={() => onInvoiceDetailsPageNavigate("next")}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid #cbd5e1",
                        background:
                          !isDetailsLoading &&
                          (detailsMeta.nextUrl ||
                            (detailsMeta.currentPage ?? 1) < (detailsMeta.totalPages ?? 1))
                            ? "#fff"
                            : "#e2e8f0",
                        color:
                          !isDetailsLoading &&
                          (detailsMeta.nextUrl ||
                            (detailsMeta.currentPage ?? 1) < (detailsMeta.totalPages ?? 1))
                            ? "#334155"
                            : "#94a3b8",
                        fontSize: 10,
                        fontWeight: 600,
                        cursor:
                          !isDetailsLoading &&
                          (detailsMeta.nextUrl ||
                            (detailsMeta.currentPage ?? 1) < (detailsMeta.totalPages ?? 1))
                            ? "pointer"
                            : "not-allowed",
                        lineHeight: 1.2,
                      }}
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Td({ children, color, bold }) {
  return (
    <td style={{ padding: "6px 8px", textAlign: "right", color: color || "#334155", fontWeight: bold ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>
      {children}
    </td>
  );
}

const MONTH_ABBREV = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parse month label from monthly API or UI → { year, month } with month 1–12. Supports Feb'2026, Feb-2026, Feb 2026. */
function monthKeyToYearMonthApi(monthLabel) {
  const s = String(monthLabel ?? "").trim();
  if (!s) return null;

  let m = /^([A-Za-z]{3})'(\d{4})$/.exec(s);
  if (m) {
    const mIdx = MONTH_ABBREV[m[1]];
    if (mIdx === undefined) return null;
    return { year: +m[2], month: mIdx + 1 };
  }
  m = /^([A-Za-z]{3})-(\d{4})$/.exec(s);
  if (m) {
    const mIdx = MONTH_ABBREV[m[1]];
    if (mIdx === undefined) return null;
    return { year: +m[2], month: mIdx + 1 };
  }
  m = /^([A-Za-z]{3})\s+(\d{4})$/.exec(s);
  if (m) {
    const mIdx = MONTH_ABBREV[m[1]];
    if (mIdx === undefined) return null;
    return { year: +m[2], month: mIdx + 1 };
  }
  return null;
}

/** Unify backend labels (`Feb-2026`) with UI keys (`Feb'2026`) so pills and daily API stay aligned. */
function normalizeMonthLabelFromApi(monthRaw) {
  const parsed = monthKeyToYearMonthApi(monthRaw);
  if (parsed) {
    const m = MONTH_SHORT[parsed.month - 1];
    return `${m}'${parsed.year}`;
  }
  const fallback = String(monthRaw ?? "").trim();
  return fallback || "—";
}

/** Match `daily_collection` bucket keys like `Feb-2026` (same as backend, locale-independent). */
function apiMonthBucketKey(year, month1to12) {
  const mon = MONTH_SHORT[month1to12 - 1];
  if (!mon) return "";
  return `${mon}-${year}`;
}

function calendarStartDayAndLength(year, month1to12) {
  const first = new Date(year, month1to12 - 1, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month1to12, 0).getDate();
  return { startDay, daysInMonth };
}

/** Map API `daily_collection` object to day number → amount. */
function parseDailyCollectionBuckets(dailyCollection, year, month1to12) {
  if (!dailyCollection || typeof dailyCollection !== "object") return {};
  const preferredKey = apiMonthBucketKey(year, month1to12);
  let bucket = dailyCollection[preferredKey];
  if (!bucket) {
    const lower = preferredKey.toLowerCase();
    const matchKey = Object.keys(dailyCollection).find((k) => k.toLowerCase() === lower);
    if (matchKey) bucket = dailyCollection[matchKey];
  }
  if (!bucket && Object.keys(dailyCollection).length === 1) {
    bucket = dailyCollection[Object.keys(dailyCollection)[0]];
  }
  if (!bucket || typeof bucket !== "object") return {};
  const out = {};
  Object.entries(bucket).forEach(([dayStr, val]) => {
    const dayNum = parseInt(String(dayStr), 10);
    if (dayNum >= 1 && dayNum <= 31) {
      const n = Number(val);
      out[dayNum] = Number.isFinite(n) ? n : 0;
    }
  });
  return out;
}

const fmtDayAmount = (n) => {
  if (n == null || Number.isNaN(Number(n))) return "·";
  const x = Number(n);
  if (x === 0) return "₹0";
  return "₹" + x.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

function DailyBreakup({
  monthsData = [],
  selectedMonthKey,
  onSelectMonthKey,
  dailyByDay = {},
  isLoading = false,
  error = "",
  onRetry,
}) {
  const data = monthsData;
  const row = data.find((d) => d.month === selectedMonthKey) ?? data[0];
  const parsed = monthKeyToYearMonthApi(row?.month);
  const { startDay, daysInMonth } = parsed
    ? calendarStartDayAndLength(parsed.year, parsed.month)
    : { startDay: 0, daysInMonth: 30 };
  const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ padding: "4px 6px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600, fontSize: 12 }}>Daily collection calendar</span>
          <span style={badge("green")}>Day-wise view</span>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "4px 6px", borderBottom: "1px solid #f1f5f9" }}>
          {data.map((d) => (
            <button key={d.month} type="button" onClick={() => onSelectMonthKey(d.month)} style={{
              padding: "2px 8px", borderRadius: 16, border: "1px solid",
              borderColor: d.month === selectedMonthKey ? "#1d4ed8" : "#e2e8f0",
              background: d.month === selectedMonthKey ? "#1d4ed8" : "#fff",
              color: d.month === selectedMonthKey ? "#fff" : "#64748b",
              fontSize: 12, cursor: "pointer", fontWeight: d.month === selectedMonthKey ? 600 : 400,
            }}>{d.month}</button>
          ))}
        </div>
        {error ? (
          <div style={{ padding: "12px 10px", color: "#b91c1c", fontSize: 12 }}>
            <div style={{ marginBottom: 8 }}>{error}</div>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                style={{
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        {isLoading ? (
          <div style={{ padding: 20, textAlign: "center", color: "#64748b", fontSize: 12 }}>Loading daily collection…</div>
        ) : (
          <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "4px 8px 0", gap: 3 }}>
          {WEEK.map(w => <div key={w} style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", fontWeight: 600, padding: "4px 0" }}>{w}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, padding: "4px 8px 8px" }}>
          {Array.from({ length: startDay }).map((_, i) => <div key={"e" + i} />)}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((dayNum) => {
            const v = dailyByDay[dayNum];
            const num = v != null && v !== "" ? Number(v) : NaN;
            const hasPositive = Number.isFinite(num) && num > 0;
            return (
              <div key={dayNum} style={{
                border: "1px solid", borderColor: hasPositive ? "#bfdbfe" : "#f1f5f9",
                background: hasPositive ? "#eff6ff" : "#f8fafc",
                borderRadius: 8, padding: "5px 2px", textAlign: "center", cursor: "default",
                minHeight: 44,
              }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>{dayNum}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: hasPositive ? "#1d4ed8" : "#cbd5e1", lineHeight: 1.2 }}>
                  {Number.isFinite(num) ? fmtDayAmount(num) : "·"}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10, padding: "0 10px 8px", flexWrap: "wrap" }}>
          <Legend color="#eff6ff" border="#bfdbfe" label="Has collection" />
          <Legend color="#f8fafc" border="#f1f5f9" label="No data" />
        </div>
          </>
        )}
      </div>
    </div>
  );
}

function Legend({ color, border, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, border: `1px solid ${border}`, display: "inline-block" }} />
      {label}
    </div>
  );
}

function PaymentModes({
  monthsData = [],
  selectedMonthKey,
  onSelectMonthKey,
  showAllMonths,
  onShowAllMonthsChange,
  modesPayload,
  isLoading,
  error,
  onRetry,
}) {
  const months = monthsData;
  const selectedIdx = Math.max(0, months.findIndex((d) => d.month === selectedMonthKey));
  const row = months[selectedIdx] ?? months[0];
  if (!row) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0" }}>
        No months in this range.
      </div>
    );
  }

  const sc = modesPayload?.summary_cards;
  const modeSplit = Array.isArray(modesPayload?.mode_split) ? modesPayload.mode_split : [];
  const monthlyTrend = Array.isArray(modesPayload?.monthly_trend) ? modesPayload.monthly_trend : [];

  const trendMethodKeys =
    monthlyTrend.length > 0
      ? sortMethodKeys(Object.keys(monthlyTrend[0].methods || {}))
      : sortMethodKeys(modeSplit.map((m) => m.method));

  const trendRowsToUse = showAllMonths ? monthlyTrend : monthlyTrend.filter((tr) => tr.month === row.month);
  const hasTrendForAggregation = showAllMonths && trendRowsToUse.length > 0;

  const aggregatedMethodTotals = trendMethodKeys.reduce((acc, k) => {
    acc[k] = trendRowsToUse.reduce((sum, tr) => sum + Number(amountForMethod(tr.methods, k) || 0), 0);
    return acc;
  }, {});

  const effectiveModeSplit = hasTrendForAggregation
    ? trendMethodKeys.map((k) => ({ method: k, amount: aggregatedMethodTotals[k] }))
    : modeSplit;

  const totalCollected = hasTrendForAggregation
    ? trendRowsToUse.reduce((sum, tr) => sum + Number(tr.total ?? 0), 0)
    : Number(sc?.total_collected?.amount ?? 0);

  const normalized = (v) => String(v || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const sumAliases = (aliases) =>
    effectiveModeSplit.reduce((sum, m) => {
      const key = normalized(m.method);
      return aliases.includes(key) ? sum + Number(m.amount || 0) : sum;
    }, 0);

  const digitalAmt = hasTrendForAggregation
    ? sumAliases(["digital", "upi", "card", "cards", "wallet", "online", "net_banking", "internet_banking", "bank_transfer"])
    : Number(sc?.digital_payments?.amount ?? 0);
  const digitalPct = hasTrendForAggregation ? null : sc?.digital_payments?.pct_of_total;
  const cashAmt = hasTrendForAggregation ? sumAliases(["cash"]) : Number(sc?.cash_payments?.amount ?? 0);
  const cashPct = hasTrendForAggregation ? null : sc?.cash_payments?.pct_of_total;
  const chqAmt = hasTrendForAggregation ? sumAliases(["cheque", "check", "cheq"]) : Number(sc?.cheque_payments?.amount ?? 0);
  const chqPct = hasTrendForAggregation ? null : sc?.cheque_payments?.pct_of_total;
  const periodLabel = showAllMonths ? "All months" : (sc?.total_collected?.period ?? row.month.replace("'", " "));

  const totalForBars = totalCollected || effectiveModeSplit.reduce((s, m) => s + Number(m.amount || 0), 0);

  return (
    <div>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "4px 6px", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase", flexShrink: 0 }}>Months</div>
          <button
            type="button"
            onClick={() => onShowAllMonthsChange((prev) => !prev)}
            style={{
              padding: "2px 6px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: showAllMonths ? "#eff6ff" : "#fff",
              color: showAllMonths ? "#1d4ed8" : "#334155",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              lineHeight: 1.2,
              flexShrink: 0,
            }}
          >
            {showAllMonths ? "Selected month only" : "Show all months"}
          </button>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
          {months.map((d, i) => (
            <button
              key={d.month}
              type="button"
              onClick={() => {
                onSelectMonthKey(d.month);
                onShowAllMonthsChange(false);
              }}
              style={{
                padding: "2px 8px",
                borderRadius: 16,
                border: "1px solid",
                borderColor: !showAllMonths && i === selectedIdx ? "#1d4ed8" : "#e2e8f0",
                background: !showAllMonths && i === selectedIdx ? "#1d4ed8" : "#fff",
                color: !showAllMonths && i === selectedIdx ? "#fff" : "#64748b",
                fontSize: 10,
                cursor: "pointer",
                fontWeight: !showAllMonths && i === selectedIdx ? 600 : 400,
              }}
            >
              {d.month}
            </button>
          ))}
          </div>
        </div>
      </div>

      {error ? (
        <div style={{ padding: "12px 0", color: "#b91c1c", fontSize: 13 }}>
          <div style={{ marginBottom: 8 }}>{error}</div>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              style={{
                padding: "5px 10px",
                borderRadius: 7,
                border: "1px solid #cbd5e1",
                background: "#fff",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <div style={{ padding: 20, color: "#64748b", fontSize: 13 }}>Loading payment mode analytics…</div>
      ) : (
        <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(84px,1fr))", gap: 4, marginBottom: 6 }}>
        <KpiCard
          label="Digital Payments"
          value={fmtRupee(sc?.digital_payments?.amount != null ? digitalAmt : null)}
          sub={digitalPct != null ? `${Number(digitalPct).toFixed(1)}% of total` : totalForBars ? pct(digitalAmt, totalForBars) : "—"}
          accent="blue"
        />
        <KpiCard
          label="Cash Payments"
          value={fmtRupee(sc?.cash_payments?.amount != null ? cashAmt : null)}
          sub={cashPct != null ? `${Number(cashPct).toFixed(1)}% of total` : totalForBars ? pct(cashAmt, totalForBars) : "—"}
          accent="amber"
        />
        <KpiCard
          label="Cheque"
          value={fmtRupee(sc?.cheque_payments?.amount != null ? chqAmt : null)}
          sub={chqPct != null ? `${Number(chqPct).toFixed(1)}% of total` : totalForBars ? pct(chqAmt, totalForBars) : "—"}
          accent="red"
        />
        <KpiCard
          label="Total Collected"
          value={fmtRupee(sc?.total_collected?.amount != null ? totalCollected : null)}
          sub={periodLabel}
          accent="green"
        />
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Payment mode split — {periodLabel}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))", gap: 8, padding: "10px 10px" }}>
          {effectiveModeSplit.length === 0 ? (
            <div style={{ padding: 12, color: "#94a3b8", fontSize: 13 }}>
              {showAllMonths ? "No mode split for this period." : "No mode split for this month."}
            </div>
          ) : (
            effectiveModeSplit.map((m) => {
              const col = colorForMethod(m.method);
              const amt = Number(m.amount);
              return (
                <div key={m.method} style={{ background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: 8, padding: "8px 9px" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{labelForMethod(m.method)}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{fmtRupee(amt)}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{m.pct != null ? `${Number(m.pct).toFixed(1)}%` : pct(amt, totalForBars)}</div>
                </div>
              );
            })
          )}
        </div>
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "2px 10px 10px" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8, marginTop: 8 }}>Share of total collected</div>
          {effectiveModeSplit.length === 0 ? null : effectiveModeSplit.map((m) => {
            const amt = Number(m.amount);
            const col = colorForMethod(m.method);
            const pctVal = m.pct != null ? Number(m.pct) : (totalForBars ? (amt / totalForBars) * 100 : 0);
            return (
              <div key={m.method} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 72, fontSize: 11, color: "#64748b", flexShrink: 0 }}>{labelForMethod(m.method)}</div>
                <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, pctVal).toFixed(1)}%`, height: "100%", background: col, borderRadius: 4, transition: "width 0.6s ease" }} />
                </div>
                <div style={{ width: 42, fontSize: 11, textAlign: "right", color: "#64748b" }}>{pctVal.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Month-wise mode trend</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "7px 10px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", borderBottom: "1px solid #f1f5f9" }}>Month</th>
                {trendMethodKeys.map((k) => (
                  <th key={k} style={{ padding: "7px 10px", textAlign: "right", color: "#64748b", fontWeight: 600, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>{labelForMethod(k)}</th>
                ))}
                <th style={{ padding: "7px 10px", textAlign: "right", color: "#64748b", fontWeight: 600, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", borderBottom: "1px solid #f1f5f9" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {monthlyTrend.length === 0 ? (
                <tr>
                  <td colSpan={2 + trendMethodKeys.length} style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>
                    No trend rows for this period.
                  </td>
                </tr>
              ) : (
                monthlyTrend.map((tr) => (
                  <tr
                    key={tr.month}
                    style={{
                      borderBottom: "1px solid #f8fafc",
                      background: tr.month === row.month ? "#eff6ff" : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (tr.month !== row.month) e.currentTarget.style.background = "#f8fafc";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = tr.month === row.month ? "#eff6ff" : "";
                    }}
                  >
                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>{tr.month}</td>
                    {trendMethodKeys.map((k) => (
                      <Td key={k}>{fmtRupee(amountForMethod(tr.methods, k))}</Td>
                    ))}
                    <Td bold>{fmtRupee(Number(tr.total ?? 0))}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

const TABS = [
  { id: "monthly", label: "Monthly Summary" },
  { id: "daily", label: "Daily Breakup" },
  { id: "modes", label: "Payment Modes" },
];

const tabLabel = (id) => TABS.find((t) => t.id === id)?.label ?? id;

const collectionStatusText = (inv, col) => {
  if (!inv) return "No data";
  const r = col / inv;
  if (r >= 1) return "Settled";
  if (r >= 0.9) return "Partial";
  return "Pending";
};

function pickDefaultMonthKey(list) {
  if (!list?.length) return "";
  const idx = list.findIndex((d) => d.inv > 0 || d.col > 0 || d.bk > 0);
  return list[idx >= 0 ? idx : 0].month;
}

function isoDateOnly(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function PaymentMaster() {
  const [activeTab, setActiveTab] = useState("monthly");
  /** Year selector shared across CY/FY modes. */
  const [yearType, setYearType] = useState("CY");
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [selectedMonthKey, setSelectedMonthKey] = useState("");

  const [monthlyApiData, setMonthlyApiData] = useState([]);
  const [monthlyApiSummary, setMonthlyApiSummary] = useState(null);
  const [isMonthlyApiLoading, setIsMonthlyApiLoading] = useState(false);
  const [monthlyApiError, setMonthlyApiError] = useState("");
  const [monthlyFetchKey, setMonthlyFetchKey] = useState(0);
  /** Synced with Monthly Summary: Export PDF uses this to include all rows vs one month. */
  const [showAllMonths, setShowAllMonths] = useState(true);

  const [dailyByDay, setDailyByDay] = useState({});
  const [isDailyLoading, setIsDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState("");
  const [dailyFetchKey, setDailyFetchKey] = useState(0);

  const [paymentModesPayload, setPaymentModesPayload] = useState(null);
  const [isModesLoading, setIsModesLoading] = useState(false);
  const [modesError, setModesError] = useState("");
  const [modesFetchKey, setModesFetchKey] = useState(0);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("PARTIALLY_PAID");
  const [invoiceStatusCounts, setInvoiceStatusCounts] = useState({ PARTIALLY_PAID: null, UNPAID: null });
  const [isInvoiceStatusCountsLoading, setIsInvoiceStatusCountsLoading] = useState(false);
  const [isInvoiceDetailsLoading, setIsInvoiceDetailsLoading] = useState(false);
  const [invoiceDetailsError, setInvoiceDetailsError] = useState("");
  const [invoiceDetailsItems, setInvoiceDetailsItems] = useState([]);
  const [invoiceDetailsMeta, setInvoiceDetailsMeta] = useState({
    periodLabel: "",
    count: 0,
    currentPage: 1,
    totalPages: 1,
    nextUrl: null,
    prevUrl: null,
  });
  const [isInvoiceDetailsOpen, setIsInvoiceDetailsOpen] = useState(false);
  const invoiceDetailsMetaRef = useRef(invoiceDetailsMeta);
  invoiceDetailsMetaRef.current = invoiceDetailsMeta;
  const invoiceCountsRequestIdRef = useRef(0);
  const invoiceDetailsRequestIdRef = useRef(0);
  const invoiceDetailsScopeKeyRef = useRef("");

  const baseUrl = () => String(import.meta.env.VITE_BASEURL_CARE || "").replace(/\/$/, "");

  const selectedYear = Number(year) || new Date().getFullYear();
  // Backend expects FY as ending year (e.g. FY 2026-27 => year=2027).
  const effectiveYearForApi = yearType === "FY" ? selectedYear + 1 : selectedYear;
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current, current - 1, current - 2, current - 3];
  }, []);

  useEffect(() => {
    setShowAllMonths(true);
  }, [selectedYear, yearType]);

  const loadMonthlyPerformance = useCallback(async () => {
    const root = baseUrl();
    if (!root) {
      setMonthlyApiError("Missing VITE_BASEURL_CARE in .env — restart dev server after fixing.");
      setMonthlyApiData([]);
      setMonthlyApiSummary(null);
      return;
    }
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      setMonthlyApiError("Authorization token missing. Please log in again.");
      setMonthlyApiData([]);
      setMonthlyApiSummary(null);
      return;
    }

    setIsMonthlyApiLoading(true);
    setMonthlyApiError("");
    try {
      const url = `${root}/analysis/payment-master/month-wise-performance/`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        // Whole-year API call: pass selected year + year_type (CY/FY).
        params: { year: effectiveYearForApi, year_type: yearType },
      });

      const rows = Array.isArray(res.data?.rows) ? res.data.rows : [];
      const y = selectedYear;
      setMonthlyApiSummary(res.data?.summary ?? null);
      setMonthlyApiData(
        rows.map((r) => {
          const gen = Number(r.generated_invoices ?? 0) || 0;
          const notGen = Number(r.not_generated_invoices ?? 0) || 0;
          const hasNewInvoiceSplit =
            r.generated_invoices != null ||
            r.not_generated_invoices != null;
          const totalInvoices = hasNewInvoiceSplit
            ? gen + notGen
            : Number(r.total_invoices ?? r.no_of_invoices ?? r.invoice_count ?? r.invoices_count ?? 0) || 0;

          const unpaid =
            r.unpaid_invoices != null && r.unpaid_invoices !== ""
              ? Number(r.unpaid_invoices) || 0
              : Number(r.pending_invoices ?? 0) || 0;

          const bookingsExecuted = Number(r.bookings_starting ?? r.total_bookings ?? 0) || 0;
          const bookingsEnded = Number(r.bookings_ending ?? 0) || 0;

          const balRaw = r.balance;
          const balance =
            balRaw != null && balRaw !== "" ? Number(balRaw) : undefined;

          return {
            month: normalizeMonthLabelFromApi(r.month),
            yr: y,
            bk: bookingsExecuted,
            bookings_executed: bookingsExecuted,
            bookings_ended: bookingsEnded,
            inv: Number(r.invoice_value ?? 0) || 0,
            col: Number(r.amt_collected ?? 0) || 0,
            balance,
            generated_invoices: gen,
            total_invoices: totalInvoices,
            paid_invoices: Number(r.paid_invoices ?? 0) || 0,
            partially_paid_invoices: Number(r.partially_paid_invoices ?? 0) || 0,
            unmapped_count: Number(r.unmapped_count ?? r.unmapped_payments ?? 0) || 0,
            unmapped_amount: Number(r.unmapped_amount ?? 0) || 0,
            pending_invoices: unpaid,
            unpaid_invoices: unpaid,
            invoices_not_generated: notGen,
            collection_pct: r.collection_pct,
            gpay: 0,
            pp: 0,
            card: 0,
            cash: 0,
            chq: 0,
          };
        })
      );
    } catch (e) {
      console.error("Error fetching payment master (monthly):", e);
      setMonthlyApiError(formatApiError(e));
      setMonthlyApiData([]);
      setMonthlyApiSummary(null);
    } finally {
      setIsMonthlyApiLoading(false);
    }
  }, [effectiveYearForApi, selectedYear, yearType]);

  const loadDailyCollection = useCallback(async () => {
    const parsed = monthKeyToYearMonthApi(selectedMonthKey);
    if (!parsed) {
      setDailyError("Invalid month selection.");
      setDailyByDay({});
      return;
    }
    const root = baseUrl();
    if (!root) {
      setDailyError("Missing VITE_BASEURL_CARE in .env — restart dev server after fixing.");
      setDailyByDay({});
      return;
    }
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      setDailyError("Authorization token missing. Please log in again.");
      setDailyByDay({});
      return;
    }

    setIsDailyLoading(true);
    setDailyError("");
    try {
      const url = `${root}/analysis/payment-master/daily-collection/`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { year: parsed.year, month: parsed.month },
      });
      const dc = res.data?.daily_collection;
      const map = parseDailyCollectionBuckets(dc, parsed.year, parsed.month);
      setDailyByDay(map);
    } catch (e) {
      console.error("Error fetching payment master (daily collection):", e);
      setDailyError(formatApiError(e));
      setDailyByDay({});
    } finally {
      setIsDailyLoading(false);
    }
  }, [selectedMonthKey]);

  const loadPaymentModeAnalytics = useCallback(async () => {
    const root = baseUrl();
    if (!root) {
      setModesError("Missing VITE_BASEURL_CARE in .env — restart dev server after fixing.");
      setPaymentModesPayload(null);
      return;
    }
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      setModesError("Authorization token missing. Please log in again.");
      setPaymentModesPayload(null);
      return;
    }

    setIsModesLoading(true);
    setModesError("");
    try {
      const url = `${root}/analysis/payment-master/payment-mode-analytics/`;
      const parsed = monthKeyToYearMonthApi(selectedMonthKey);
      const params =
        showAllMonths
          ? { year: effectiveYearForApi, year_type: yearType }
          : parsed
            ? { year: parsed.year, month: parsed.month }
            : null;
      if (!params) {
        setModesError("Invalid month selection.");
        setPaymentModesPayload(null);
        return;
      }
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
      });
      setPaymentModesPayload(res.data);
    } catch (e) {
      console.error("Error fetching payment master (payment modes):", e);
      setModesError(formatApiError(e));
      setPaymentModesPayload(null);
    } finally {
      setIsModesLoading(false);
    }
  }, [selectedMonthKey, showAllMonths, effectiveYearForApi, yearType]);

  useEffect(() => {
    loadMonthlyPerformance();
  }, [loadMonthlyPerformance, monthlyFetchKey]);

  useEffect(() => {
    if (activeTab !== "daily") return;
    loadDailyCollection();
  }, [activeTab, loadDailyCollection, dailyFetchKey]);

  useEffect(() => {
    if (activeTab !== "modes") return;
    loadPaymentModeAnalytics();
  }, [activeTab, loadPaymentModeAnalytics, modesFetchKey]);

  useEffect(() => {
    const list = monthlyApiData;
    if (!list.length) return;
    if (!list.some((d) => d.month === selectedMonthKey)) {
      setSelectedMonthKey(pickDefaultMonthKey(list));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, monthlyApiData]);

  const yearLabel =
    yearType === "FY"
      ? `FY ${year}-${String((Number(year) + 1) % 100).padStart(2, "0")}`
      : `CY ${year}`;

  const exportPaymentPdf = useCallback(() => {
    const list = monthlyApiData;
    const selRow = list.find((d) => d.month === selectedMonthKey) ?? list[0];
    const monthSuffix =
      activeTab === "monthly" && showAllMonths
        ? " — All months"
        : selRow?.month
          ? ` — ${selRow.month}`
          : "";
    const title = `Payment Master — ${yearLabel} — ${tabLabel(activeTab)}${monthSuffix}`;
    const sub = `Generated ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`;

    let body = "";

    if (activeTab === "monthly") {
      if (!list.length) {
        body = "<p>No data for this filter.</p>";
      } else if (showAllMonths) {
        const pdfCols = getMonthlyPdfColumns();
        const rowsHtml = list
          .map((r) => {
            const cells = pdfCols.map((colId) => monthlyPdfCellHtml(colId, r)).join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");
        const headerCells = pdfCols.map((colId) => `<th>${esc(MONTHLY_PERF_COLUMN_LABELS[colId] || colId)}</th>`).join("");
        body = `
        <h2>Month-wise performance (all months)</h2>
        <table>
          <thead>
            <tr>${headerCells}</tr>
          </thead>
          <tbody>
          ${rowsHtml}
          </tbody>
        </table>`;
      } else if (!selRow) {
        body = "<p>No data for this filter.</p>";
      } else {
        const pdfCols = getMonthlyPdfColumns();
        const headerCells = pdfCols.map((colId) => `<th>${esc(MONTHLY_PERF_COLUMN_LABELS[colId] || colId)}</th>`).join("");
        const dataCells = pdfCols.map((colId) => monthlyPdfCellHtml(colId, selRow)).join("");
        body = `
        <h2>Month-wise performance (${esc(selRow.month)})</h2>
        <table>
          <thead>
            <tr>${headerCells}</tr>
          </thead>
          <tbody>
          <tr>${dataCells}</tr>
          </tbody>
        </table>`;
      }
    } else if (activeTab === "daily") {
      const dailyMap =
        dailyByDay && Object.keys(dailyByDay).length > 0 ? dailyByDay : null;
      if (!dailyMap || Object.keys(dailyMap).length === 0) {
        body = `<p>No daily breakdown for ${esc(selRow?.month ?? "this month")}.</p>`;
      } else {
        const dayRows = Object.keys(dailyMap)
          .sort((a, b) => Number(a) - Number(b))
          .map(
            (day) =>
              `<tr><td>${esc(day)}</td><td>${esc(fmt(dailyMap[day]))}</td></tr>`
          )
          .join("");
        body = `<h2>${esc(selRow.month)} — daily collections</h2>
          <table>
            <thead><tr><th>Day</th><th>Collected (₹)</th></tr></thead>
            <tbody>${dayRows}</tbody>
          </table>`;
      }
    } else if (activeTab === "modes") {
      const payload = paymentModesPayload;
      const split = Array.isArray(payload?.mode_split) ? payload.mode_split : [];
      const trend = Array.isArray(payload?.monthly_trend) ? payload.monthly_trend : [];
      const sc = payload?.summary_cards;
      const period = sc?.total_collected?.period ?? selRow?.month ?? "—";
      const totalAmt = Number(sc?.total_collected?.amount ?? 0) || split.reduce((s, m) => s + Number(m.amount || 0), 0);

      if (!split.length && !trend.length) {
        body = `<p>No payment mode data for ${esc(period)}.</p>`;
      } else {
        const modeSplitRows = split
          .map((m) => {
            const amt = Number(m.amount);
            const share = m.pct != null ? `${Number(m.pct).toFixed(1)}%` : pct(amt, totalAmt);
            return `<tr><td>${esc(labelForMethod(m.method))}</td><td>${esc(fmtRupee(amt))}</td><td>${esc(share)}</td></tr>`;
          })
          .join("");
        const trendKeys =
          trend.length > 0 ? sortMethodKeys(Object.keys(trend[0].methods || {})) : sortMethodKeys(split.map((m) => m.method));
        const trendHeader = trendKeys.map((k) => `<th>${esc(labelForMethod(k))}</th>`).join("");
        const trendRows = trend
          .map((tr) => {
            const cells = trendKeys
              .map((k) => `<td style="text-align:right">${esc(fmtRupee(amountForMethod(tr.methods, k)))}</td>`)
              .join("");
            return `<tr><td>${esc(tr.month)}</td>${cells}<td style="text-align:right;font-weight:bold">${esc(fmtRupee(Number(tr.total ?? 0)))}</td></tr>`;
          })
          .join("");

        body = `
        <h2>Payment modes — ${esc(period)}</h2>
        <table>
          <thead><tr><th>Mode</th><th>Amount</th><th>Share</th></tr></thead>
          <tbody>
            ${modeSplitRows}
            <tr style="font-weight:bold;background:#f3f4f6">
              <td>Total</td>
              <td>${esc(fmtRupee(totalAmt))}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <h2>Month-wise mode trend</h2>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              ${trendHeader}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${trendRows || `<tr><td colspan="${2 + trendKeys.length}">No data</td></tr>`}</tbody>
        </table>`;
      }
    }

    const printHtml = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${esc(title)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; color: #111827; }
            h1 { margin: 0 0 8px; font-size: 18px; }
            h2 { margin: 16px 0 8px; font-size: 15px; }
            h3 { margin: 12px 0 6px; font-size: 13px; }
            p { margin: 0 0 12px; color: #4b5563; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
            th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>${esc(title)}</h1>
          <p>${esc(sub)}</p>
          ${body}
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 200);
  }, [activeTab, monthlyApiData, monthlyApiSummary, yearLabel, selectedMonthKey, showAllMonths, dailyByDay, paymentModesPayload]);

  const exportPaymentExcel = useCallback(() => {
    const workbook = XLSX.utils.book_new();
    const stamp = new Date().toISOString().slice(0, 10);
    const fileLabel = tabLabel(activeTab).toLowerCase().replace(/\s+/g, "-");
    const list = monthlyApiData;
    const selRow = list.find((d) => d.month === selectedMonthKey) ?? list[0];

    const addSheetFromAoa = (sheetName, aoa) => {
      const safeRows = Array.isArray(aoa) && aoa.length ? aoa : [["No data"]];
      const ws = XLSX.utils.aoa_to_sheet(safeRows);
      XLSX.utils.book_append_sheet(workbook, ws, sheetName.slice(0, 31));
    };

    const monthlyCellValue = (colId, r) => {
      const s = monthlyPerfRowStats(r);
      const invoiceCount = Number(r.total_invoices ?? r.generated_invoices ?? 0) || 0;
      const balance = r.balance != null ? Number(r.balance) : (Number(r.inv) || 0) - (Number(r.col) || 0);
      switch (colId) {
        case "month":
          return r.month ?? r.label ?? "—";
        case "bookings_executed":
          return s.bookingsExecuted;
        case "bookings_ended":
          return s.bookingsEnded;
        case "no_invoices":
          return s.invoiceCount || invoiceCount;
        case "paid_invoices":
          return s.paidInvoices;
        case "partially_paid_invoices":
          return s.partiallyPaidInvoices;
        case "unmapped_count":
          return s.unmappedCount;
        case "unmapped_amount":
          return s.unmappedAmount;
        case "invoice_value":
          return Number(r.inv) || 0;
        case "amt_collected":
          return Number(r.col) || 0;
        case "balance":
          return balance;
        case "collection_pct":
          return r.collection_pct != null && r.collection_pct !== ""
            ? `${Number(r.collection_pct).toFixed(1)}%`
            : collectionPctDisplay(r);
        case "pending":
          return s.pendingInvoices;
        case "generated_invoices":
          return Number(r.generated_invoices ?? 0) || 0;
        case "invoices_not_generated":
          return Number(r.invoices_not_generated ?? 0) || 0;
        default:
          return r?.[colId] ?? "—";
      }
    };

    if (activeTab === "monthly") {
      const pdfCols = getMonthlyPdfColumns();
      const headers = pdfCols.map((c) => MONTHLY_PERF_COLUMN_LABELS[c] || c);
      const dataRows = (showAllMonths ? list : selRow ? [selRow] : []).map((r) =>
        pdfCols.map((c) => monthlyCellValue(c, r))
      );
      addSheetFromAoa("Monthly Summary", [headers, ...dataRows]);
    } else if (activeTab === "daily") {
      const dailyRows = dailyByDay && Object.keys(dailyByDay).length
        ? Object.keys(dailyByDay)
            .sort((a, b) => Number(a) - Number(b))
            .map((day) => [Number(day), Number(dailyByDay[day]) || 0])
        : [];
      addSheetFromAoa("Daily Breakup", [["Day", "Collected Amount"], ...dailyRows]);
    } else if (activeTab === "modes") {
      const payload = paymentModesPayload;
      const split = Array.isArray(payload?.mode_split) ? payload.mode_split : [];
      const trend = Array.isArray(payload?.monthly_trend) ? payload.monthly_trend : [];
      const splitRows = split.map((m) => [
        labelForMethod(m.method),
        Number(m.amount ?? 0) || 0,
        m.pct != null ? Number(m.pct) : "",
      ]);
      addSheetFromAoa("Mode Split", [["Mode", "Amount", "Share %"], ...splitRows]);

      const trendKeys =
        trend.length > 0
          ? sortMethodKeys(Object.keys(trend[0].methods || {}))
          : sortMethodKeys(split.map((m) => m.method));
      const trendHeader = ["Month", ...trendKeys.map((k) => labelForMethod(k)), "Total"];
      const trendRows = trend.map((tr) => [
        tr.month || "—",
        ...trendKeys.map((k) => Number(amountForMethod(tr.methods, k)) || 0),
        Number(tr.total ?? 0) || 0,
      ]);
      addSheetFromAoa("Mode Trend", [trendHeader, ...trendRows]);
    }

    XLSX.writeFile(workbook, `payment-master-${fileLabel}-${stamp}.xlsx`);
  }, [activeTab, dailyByDay, monthlyApiData, monthlyApiSummary, paymentModesPayload, selectedMonthKey, showAllMonths]);

  const getInvoiceQueryScope = useCallback(() => {
    if (showAllMonths) {
      return {
        year: effectiveYearForApi,
        yearType,
        periodLabel:
          yearType === "FY"
            ? `FY ${selectedYear}-${String((selectedYear + 1) % 100).padStart(2, "0")}`
            : `CY ${selectedYear}`,
      };
    }
    const parsed = monthKeyToYearMonthApi(selectedMonthKey);
    if (!parsed) return null;
    return {
      year: parsed.year,
      month: parsed.month,
      yearType,
      periodLabel: selectedMonthKey,
    };
  }, [effectiveYearForApi, selectedMonthKey, selectedYear, showAllMonths, yearType]);

  const invoiceCountsScopeKey = useMemo(() => {
    if (activeTab !== "monthly") return "";
    const scope = getInvoiceQueryScope();
    if (!scope) return "";
    return `${scope.year}|${scope.month ?? "all"}|${scope.yearType}|${showAllMonths ? "all" : selectedMonthKey}`;
  }, [activeTab, getInvoiceQueryScope, showAllMonths, selectedMonthKey]);

  useEffect(() => {
    if (activeTab !== "monthly" || !invoiceCountsScopeKey) return;

    const root = baseUrl();
    const accessToken = localStorage.getItem("access_token");
    const scope = getInvoiceQueryScope();
    if (!root || !accessToken || !scope) {
      setInvoiceStatusCounts({ PARTIALLY_PAID: null, UNPAID: null });
      return;
    }

    const controller = new AbortController();
    const requestId = invoiceCountsRequestIdRef.current + 1;
    invoiceCountsRequestIdRef.current = requestId;
    setIsInvoiceStatusCountsLoading(true);

    (async () => {
      try {
        const statuses = ["PARTIALLY_PAID", "UNPAID"];
        const results = await Promise.all(
          statuses.map(async (status) => {
            try {
              const res = await axios.get(`${root}${ANALYSIS_INVOICES_PATH}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: buildAnalysisInvoiceQueryParams({
                  status,
                  year: scope.year,
                  month: scope.month,
                  yearType: scope.yearType,
                  page: 1,
                }),
                signal: controller.signal,
              });
              const pag = parseInvoiceListPaginationPayload(res.data || {});
              const count = Number.isFinite(pag.count) ? pag.count : null;
              return [status, count];
            } catch (err) {
              if (axios.isCancel(err) || err?.code === "ERR_CANCELED" || err?.name === "CanceledError") {
                return [status, null];
              }
              return [status, null];
            }
          })
        );
        if (requestId !== invoiceCountsRequestIdRef.current) return;
        setInvoiceStatusCounts({
          PARTIALLY_PAID: results.find(([k]) => k === "PARTIALLY_PAID")?.[1] ?? null,
          UNPAID: results.find(([k]) => k === "UNPAID")?.[1] ?? null,
        });
      } finally {
        if (requestId === invoiceCountsRequestIdRef.current) {
          setIsInvoiceStatusCountsLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [activeTab, invoiceCountsScopeKey, getInvoiceQueryScope]);

  const loadPendingInvoiceDetails = useCallback(async (opts = {}) => {
    const normalizedOpts =
      opts && typeof opts === "object" && ("nativeEvent" in opts || typeof opts.preventDefault === "function")
        ? {}
        : opts;
    const pageUrl = normalizedOpts?.pageUrl ?? null;
    const page = Number(normalizedOpts?.page) > 0 ? Number(normalizedOpts.page) : 1;

    const root = baseUrl();
    if (!root) {
      setInvoiceDetailsError("Missing VITE_BASEURL_CARE in .env — restart dev server after fixing.");
      setInvoiceDetailsItems([]);
      setIsInvoiceDetailsOpen(true);
      return;
    }
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      setInvoiceDetailsError("Authorization token missing. Please log in again.");
      setInvoiceDetailsItems([]);
      setIsInvoiceDetailsOpen(true);
      return;
    }

    let periodLabel;
    let invoiceScope;
    if (!pageUrl) {
      const scope = getInvoiceQueryScope();
      if (!scope) {
        setInvoiceDetailsError("Invalid month selection.");
        setInvoiceDetailsItems([]);
        setIsInvoiceDetailsOpen(true);
        return;
      }
      invoiceScope = scope;
      periodLabel = scope.periodLabel;
    }

    setIsInvoiceDetailsLoading(true);
    setInvoiceDetailsError("");
    setIsInvoiceDetailsOpen(true);
    const requestId = invoiceDetailsRequestIdRef.current + 1;
    invoiceDetailsRequestIdRef.current = requestId;
    try {
      let res;
      if (pageUrl) {
        const abs = resolvePaginatedUrl(pageUrl, root);
        if (!abs) {
          setInvoiceDetailsError("Invalid pagination link.");
          setInvoiceDetailsItems([]);
          setIsInvoiceDetailsLoading(false);
          return;
        }
        res = await axios.get(abs, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } else {
        const url = `${root}${ANALYSIS_INVOICES_PATH}`;
        res = await axios.get(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: buildAnalysisInvoiceQueryParams({
            status: invoiceStatusFilter,
            year: invoiceScope.year,
            month: invoiceScope.month,
            yearType: invoiceScope.yearType,
            page,
          }),
        });
      }
      const data = res.data || {};
      const items = Array.isArray(data.results) ? data.results : [];
      const pag = parseInvoiceListPaginationPayload(data);
      let totalPages = Math.max(1, pag.totalPages || Number(data.total_pages) || 1);
      const listCount = pag.count || Number(data.count ?? items.length ?? 0);
      if (totalPages <= 1 && listCount > items.length && items.length > 0) {
        totalPages = Math.max(2, Math.ceil(listCount / items.length));
      }
      if (requestId !== invoiceDetailsRequestIdRef.current) return;
      setInvoiceDetailsItems(items);
      setInvoiceDetailsMeta((prev) => ({
        periodLabel: periodLabel ?? prev.periodLabel,
        count: listCount,
        currentPage: pag.currentPage || Number(data.current_page ?? page) || 1,
        totalPages,
        nextUrl: pag.nextUrl,
        prevUrl: pag.prevUrl,
      }));
    } catch (e) {
      if (requestId !== invoiceDetailsRequestIdRef.current) return;
      console.error("Error fetching invoice details:", e);
      setInvoiceDetailsError(formatApiError(e, "Failed to load invoice details."));
      setInvoiceDetailsItems([]);
    } finally {
      if (requestId === invoiceDetailsRequestIdRef.current) {
        setIsInvoiceDetailsLoading(false);
      }
    }
  }, [invoiceStatusFilter, getInvoiceQueryScope]);

  const invoiceDetailsScopeKey = useMemo(() => {
    if (!invoiceCountsScopeKey) return "";
    return `${invoiceCountsScopeKey}|${invoiceStatusFilter}`;
  }, [invoiceCountsScopeKey, invoiceStatusFilter]);

  useEffect(() => {
    if (activeTab !== "monthly" || !isInvoiceDetailsOpen) {
      invoiceDetailsScopeKeyRef.current = "";
      return;
    }
    if (!invoiceDetailsScopeKey) return;

    const prev = invoiceDetailsScopeKeyRef.current;
    if (prev && prev !== invoiceDetailsScopeKey) {
      loadPendingInvoiceDetails({ page: 1 });
    }
    invoiceDetailsScopeKeyRef.current = invoiceDetailsScopeKey;
  }, [activeTab, isInvoiceDetailsOpen, invoiceDetailsScopeKey, loadPendingInvoiceDetails]);

  const selectMonthlyScope = useCallback((monthKey) => {
    setSelectedMonthKey(monthKey);
    setShowAllMonths(false);
  }, []);

  const navigateInvoiceDetailsPage = useCallback(
    (dir) => {
      const m = invoiceDetailsMetaRef.current;
      const cur = m.currentPage ?? 1;
      const tot = m.totalPages ?? 1;
      if (dir === "prev") {
        if (m.prevUrl) loadPendingInvoiceDetails({ pageUrl: m.prevUrl });
        else if (cur > 1) loadPendingInvoiceDetails({ page: cur - 1 });
        return;
      }
      if (dir === "next") {
        if (m.nextUrl) loadPendingInvoiceDetails({ pageUrl: m.nextUrl });
        else if (cur < tot) loadPendingInvoiceDetails({ page: cur + 1 });
      }
    },
    [loadPendingInvoiceDetails]
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "6px 8px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap", flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: 0, whiteSpace: "nowrap" }}>Payment Master</h1>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                gap: 2,
                background: "#e2e8f0",
                borderRadius: 6,
                padding: 2,
                minWidth: 280,
                maxWidth: 560,
                width: "auto",
                flex: "0 0 auto",
                overflowX: "auto",
              }}
            >
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                  padding: "4px 6px", borderRadius: 5, border: "none",
                  background: activeTab === t.id ? "#fff" : "transparent",
                  color: activeTab === t.id ? "#0f172a" : "#64748b",
                  fontSize: 11, cursor: "pointer", fontWeight: activeTab === t.id ? 600 : 400, textAlign: "center",
                  boxShadow: activeTab === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s",
                }}>{t.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#334155", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={yearType === "CY"}
                onChange={() => setYearType("CY")}
              />
              CY
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#334155", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={yearType === "FY"}
                onChange={() => setYearType("FY")}
              />
              FY
            </label>
            <select value={year} onChange={e => setYear(e.target.value)} style={{
              padding: "4px 6px", borderRadius: 6, border: "1px solid #e2e8f0",
              background: "#fff", fontSize: 11, color: "#334155", cursor: "pointer",
            }}>
              {yearOptions.map((y) => (
                <option key={y} value={String(y)}>
                  {yearType === "FY"
                    ? `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`
                    : `CY ${y}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "monthly" && (
          isMonthlyApiLoading ? (
            <div style={{ padding: 12, color: "#64748b", fontSize: 12 }}>Loading monthly performance...</div>
          ) : monthlyApiError ? (
            <div style={{ padding: 12, color: "#b91c1c", fontSize: 12 }}>
              <div style={{ marginBottom: 8 }}>{monthlyApiError}</div>
              <button
                type="button"
                onClick={() => setMonthlyFetchKey((k) => k + 1)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            <MonthlySummary
              key={`${yearType}-${selectedYear}`}
              monthsData={monthlyApiData}
              periodSummary={monthlyApiSummary}
              selectedMonthKey={selectedMonthKey}
              onSelectMonthKey={selectMonthlyScope}
              showAllMonths={showAllMonths}
              onShowAllMonthsChange={setShowAllMonths}
              onExportPdf={exportPaymentPdf}
              onExportExcel={exportPaymentExcel}
              onShowDetails={loadPendingInvoiceDetails}
              isDetailsLoading={isInvoiceDetailsLoading}
              detailsStatus={invoiceStatusFilter}
              onDetailsStatusChange={setInvoiceStatusFilter}
              isDetailsVisible={isInvoiceDetailsOpen}
              onCloseDetails={() => setIsInvoiceDetailsOpen(false)}
              detailsError={invoiceDetailsError}
              detailsItems={invoiceDetailsItems}
              detailsMeta={invoiceDetailsMeta}
              onInvoiceDetailsPageNavigate={navigateInvoiceDetailsPage}
              invoiceStatusCounts={invoiceStatusCounts}
              isInvoiceStatusCountsLoading={isInvoiceStatusCountsLoading}
            />
          )
        )}
        {activeTab === "daily" && (
          isMonthlyApiLoading ? (
            <div style={{ padding: 12, color: "#64748b", fontSize: 12 }}>Loading monthly performance...</div>
          ) : monthlyApiError ? (
            <div style={{ padding: 12, color: "#b91c1c", fontSize: 12 }}>
              <div style={{ marginBottom: 8 }}>{monthlyApiError}</div>
              <button
                type="button"
                onClick={() => setMonthlyFetchKey((k) => k + 1)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            <DailyBreakup
              monthsData={monthlyApiData}
              selectedMonthKey={selectedMonthKey}
              onSelectMonthKey={setSelectedMonthKey}
              dailyByDay={dailyByDay}
              isLoading={isDailyLoading}
              error={dailyError}
              onRetry={() => setDailyFetchKey((k) => k + 1)}
            />
          )
        )}
        {activeTab === "modes" && (
          isMonthlyApiLoading ? (
            <div style={{ padding: 12, color: "#64748b", fontSize: 12 }}>Loading monthly performance...</div>
          ) : monthlyApiError ? (
            <div style={{ padding: 12, color: "#b91c1c", fontSize: 12 }}>
              <div style={{ marginBottom: 8 }}>{monthlyApiError}</div>
              <button
                type="button"
                onClick={() => setMonthlyFetchKey((k) => k + 1)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            <PaymentModes
              monthsData={monthlyApiData}
              selectedMonthKey={selectedMonthKey}
              onSelectMonthKey={setSelectedMonthKey}
              showAllMonths={showAllMonths}
              onShowAllMonthsChange={setShowAllMonths}
              modesPayload={paymentModesPayload}
              isLoading={isModesLoading}
              error={modesError}
              onRetry={() => setModesFetchKey((k) => k + 1)}
            />
          )
        )}

      </div>
    </div>
  );
}