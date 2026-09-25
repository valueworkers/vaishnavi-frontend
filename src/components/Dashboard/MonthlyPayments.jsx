import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { FiChevronDown, FiChevronUp, FiRefreshCw, FiSearch } from 'react-icons/fi';

/** Preferred column order; new API keys append alphabetically. */
const EXCLUDED_COLUMNS = new Set(['id', 'is_verified']);

const KNOWN_COLUMN_ORDER = [
  'patient_name',
  'patient_phone_number',
  'amount',
  'invoice_status',
  'total_amount',
  'remaining_amount',
  'method',
  'paid_date',
  'reference',
  'is_mapped',
  'invoice',
  'patient',
  'created_at',
  'updated_at',
  'mapping_meta',
  'mapping_status',
];

/** Hidden in the table until the user enables them in Column Chooser. */
const DEFAULT_HIDDEN_COLUMNS = new Set(['mapping_meta', 'mapping_status']);

const COLUMN_LABELS = {
  patient_name: 'Patient Name',
  patient_phone_number: 'Patient Phone',
  amount: 'Amount',
  invoice_status: 'Invoice Status',
  total_amount: 'Invoice Total',
  remaining_amount: 'Remaining Amount',
  method: 'Method',
  paid_date: 'Paid Date',
  reference: 'Reference',
  is_mapped: 'Is Mapped',
  invoice: 'Invoice',
  patient: 'Patient',
  created_at: 'Created At',
  updated_at: 'Updated At',
  mapping_meta: 'Mapping Meta',
  mapping_status: 'Mapping Status',
};

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const LONG_TEXT_COLUMNS = new Set(['reference']);
const BOOLEAN_COLUMNS = new Set(['is_mapped']);
const DATE_COLUMNS = new Set(['paid_date', 'created_at', 'updated_at']);
const MONEY_COLUMNS = new Set(['amount', 'total_amount', 'remaining_amount']);
const STATUS_COLUMNS = new Set(['invoice_status']);

const PAGE_SIZE_PRESETS = [20, 40, 60];
/** Backend caps page_size; when "All" is selected we fetch every page and merge. */
const API_MAX_PAGE_SIZE = 100;

const reorderColumns = (order, sourceId, targetId) => {
  if (!sourceId || !targetId || sourceId === targetId) return order;
  const sourceIndex = order.indexOf(sourceId);
  const targetIndex = order.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return order;
  const updated = [...order];
  const [moved] = updated.splice(sourceIndex, 1);
  updated.splice(targetIndex, 0, moved);
  return updated;
};

const formatColumnLabel = (key) =>
  COLUMN_LABELS[key] ||
  String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatInvoiceStatusLabel = (value) => {
  if (value == null || value === '') return '-';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const invoiceStatusBadgeClass = (status) => {
  const key = String(status || '').toUpperCase();
  if (key === 'PAID') return 'bg-emerald-100 text-emerald-800';
  if (key === 'PARTIALLY_PAID') return 'bg-amber-100 text-amber-900';
  if (key === 'UNPAID') return 'bg-red-100 text-red-800';
  if (key === 'OVERDUE') return 'bg-orange-100 text-orange-900';
  if (key === 'CANCELLED') return 'bg-slate-200 text-slate-700';
  if (key === 'REFUNDED') return 'bg-violet-100 text-violet-800';
  return 'bg-slate-100 text-slate-700';
};

const collectKeysFromRecords = (records) => {
  const keys = new Set();
  for (const row of records) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      Object.keys(row).forEach((k) => keys.add(k));
    }
  }
  return [...keys];
};

const buildInitialColumnOrder = (discoveredKeys) => {
  const discovered = new Set(discoveredKeys.filter((k) => !EXCLUDED_COLUMNS.has(k)));
  const ordered = KNOWN_COLUMN_ORDER.filter((k) => discovered.has(k));
  const rest = [...discovered].filter((k) => !ordered.includes(k)).sort();
  return [...ordered, ...rest];
};

const mergeColumnOrder = (prevOrder, discoveredKeys) => {
  if (!discoveredKeys.length) return prevOrder.filter((k) => !EXCLUDED_COLUMNS.has(k));
  const discoveredSet = new Set(discoveredKeys.filter((k) => !EXCLUDED_COLUMNS.has(k)));
  const kept = prevOrder.filter((k) => discoveredSet.has(k) && !EXCLUDED_COLUMNS.has(k));
  const initial = buildInitialColumnOrder(discoveredKeys);
  for (const k of initial) {
    if (!kept.includes(k)) kept.push(k);
  }
  return kept.length ? kept : initial;
};

const resolveRequestUrl = (href, baseUrl) => {
  if (!href) return null;
  const raw = String(href);
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalizedBase = String(baseUrl || '').replace(/\/$/, '');
  return `${normalizedBase}${raw.startsWith('/') ? raw : `/${raw}`}`;
};

const withSearch = (requestUrl, searchTerm) => {
  if (!requestUrl) return null;
  try {
    const url = new URL(requestUrl);
    const trimmed = String(searchTerm || '').trim();
    if (trimmed) {
      url.searchParams.set('search', trimmed);
    } else {
      url.searchParams.delete('search');
    }
    return url.toString();
  } catch {
    return requestUrl;
  }
};

const withMappedFilter = (requestUrl, mappedFilter) => {
  if (!requestUrl) return null;
  try {
    const url = new URL(requestUrl);
    if (mappedFilter === true) {
      url.searchParams.set('is_mapped', 'true');
    } else if (mappedFilter === false) {
      url.searchParams.set('is_mapped', 'false');
    } else {
      url.searchParams.delete('is_mapped');
    }
    return url.toString();
  } catch {
    return requestUrl;
  }
};

const INVOICE_STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIALLY_PAID', label: 'Partially Paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REFUNDED', label: 'Refunded' },
];

const withInvoiceStatusFilter = (requestUrl, invoiceStatus) => {
  if (!requestUrl) return null;
  try {
    const url = new URL(requestUrl);
    const status = String(invoiceStatus || '').trim().toUpperCase();
    const allowed = INVOICE_STATUS_FILTER_OPTIONS.some((o) => o.value && o.value === status);
    if (allowed) {
      url.searchParams.set('invoice__status', status);
    } else {
      url.searchParams.delete('invoice__status');
    }
    return url.toString();
  } catch {
    return requestUrl;
  }
};

const isValidPaymentsOrdering = (ordering) => {
  const order = String(ordering || '').trim();
  return (
    order === 'amount' ||
    order === '-amount' ||
    order === 'patient__first_name' ||
    order === '-patient__first_name'
  );
};

const isAmountOrdering = (ordering) => {
  const order = String(ordering || '').trim();
  return order === 'amount' || order === '-amount';
};

const withOrdering = (requestUrl, ordering) => {
  if (!requestUrl) return null;
  try {
    const url = new URL(requestUrl);
    const order = String(ordering || '').trim();
    if (isValidPaymentsOrdering(order)) {
      url.searchParams.set('ordering', order);
    } else {
      url.searchParams.delete('ordering');
    }
    return url.toString();
  } catch {
    return requestUrl;
  }
};

const AMOUNT_ORDERING_OPTIONS = [
  { value: '-amount', label: 'High to low' },
  { value: 'amount', label: 'Low to high' },
];

const applyListFilters = (requestUrl, { searchTerm, mappedFilter, invoiceStatus, ordering }) =>
  withOrdering(
    withInvoiceStatusFilter(withMappedFilter(withSearch(requestUrl, searchTerm), mappedFilter), invoiceStatus),
    ordering
  );

const formatApiError = (err) => {
  if (!err?.response) return err?.message || 'Network error';
  const { status, statusText, data } = err.response;
  const prefix = status ? `${status} ${statusText || ''}`.trim() : '';
  if (typeof data?.detail === 'string') return prefix ? `${prefix}: ${data.detail}` : data.detail;
  if (typeof data?.message === 'string') return prefix ? `${prefix}: ${data.message}` : data.message;
  return prefix || 'Failed to load payments';
};

const readValue = (value) => {
  if (value == null) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '-';
    }
  }
  const text = String(value).trim();
  return text || '-';
};

const formatDateTime = (iso) => {
  if (iso == null || iso === '') return '-';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return readValue(iso);
  return d.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Show amount exactly as API sends it (e.g. "35000.00"), with ₹ prefix only. */
const formatAmountExact = (value) => {
  if (value == null || value === '') return '-';
  const raw = String(value).trim();
  if (!raw) return '-';
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return `₹${raw}`;
  }
  return readValue(value);
};

const sumAmountsFromApi = (rows) => {
  let totalCents = 0;
  let anyParsed = false;
  for (const row of rows) {
    const raw = String(row?.amount ?? '').trim();
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
    if (!match) continue;
    anyParsed = true;
    const sign = match[1] === '-' ? -1 : 1;
    const whole = Number(match[2]) || 0;
    const frac = (match[3] || '0').padEnd(2, '0').slice(0, 2);
    totalCents += sign * (whole * 100 + Number(frac));
  }
  if (!anyParsed) return null;
  const sign = totalCents < 0 ? '-' : '';
  const abs = Math.abs(totalCents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
};

const readCellValue = (payment, columnId) => {
  const value = payment?.[columnId];
  if (DATE_COLUMNS.has(columnId)) return formatDateTime(value);
  if (MONEY_COLUMNS.has(columnId)) return formatAmountExact(value);
  if (STATUS_COLUMNS.has(columnId)) return formatInvoiceStatusLabel(value);
  if (BOOLEAN_COLUMNS.has(columnId)) return readValue(value);
  return readValue(value);
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const exportCellText = (payment, columnId) => {
  if (columnId === 'is_mapped') {
    return payment?.is_mapped ? 'Mapped' : 'Unmapped';
  }
  return readCellValue(payment, columnId);
};

const CELL_PAD = 'px-1.5 py-1 sm:px-2 sm:py-1.5';

const renderTableCellContent = (payment, colId) => {
  const raw = payment?.[colId];

  if (colId === 'is_mapped') {
    const on = raw === true;
    return (
      <span
        className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
          on ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-900'
        }`}
      >
        {on ? 'Mapped' : 'Unmapped'}
      </span>
    );
  }

  if (colId === 'invoice_status') {
    if (raw == null || raw === '') {
      return <span className="text-slate-400">-</span>;
    }
    const label = formatInvoiceStatusLabel(raw);
    return (
      <span
        className={`inline-flex whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${invoiceStatusBadgeClass(raw)}`}
      >
        {label}
      </span>
    );
  }

  const value = readCellValue(payment, colId);

  if (LONG_TEXT_COLUMNS.has(colId)) {
    const tip = value && value !== '-' ? value : undefined;
    return (
      <span className="block min-w-0 max-w-[9rem] truncate" title={tip}>
        {value}
      </span>
    );
  }

  if (MONEY_COLUMNS.has(colId) && (colId === 'remaining_amount') && value !== '-') {
    return <span className="font-medium text-red-700">{value}</span>;
  }

  if (MONEY_COLUMNS.has(colId) && colId === 'total_amount' && value !== '-') {
    return <span className="font-medium text-slate-800">{value}</span>;
  }

  return value;
};

const renderColumnHeaderLabel = (colId) => {
  const label = formatColumnLabel(colId);
  const words = label.split(' ');
  if (words.length <= 2) {
    return (
      <span className="block leading-tight" title={label}>
        {label}
      </span>
    );
  }
  const mid = Math.ceil(words.length / 2);
  const lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  return lines.map((line) => (
    <span key={line} className="block leading-tight" title={label}>
      {line}
    </span>
  ));
};

const syncColumnsFromRecords = (records, setColumnOrder, setColumnVisibility) => {
  const discovered = collectKeysFromRecords(records);
  if (!discovered.length) return;

  setColumnOrder((prev) => mergeColumnOrder(prev, discovered));
  setColumnVisibility((prev) => {
    const next = { ...prev };
    for (const key of discovered) {
      if (EXCLUDED_COLUMNS.has(key)) continue;
      if (next[key] === undefined) {
        next[key] = !DEFAULT_HIDDEN_COLUMNS.has(key);
      }
    }
    return next;
  });
};

const MonthlyPayments = () => {
  const now = new Date();
  const [paidMonth, setPaidMonth] = useState(now.getMonth() + 1);
  const [paidYear, setPaidYear] = useState(now.getFullYear());
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({
    next: null,
    previous: null,
    currentPage: 1,
    totalPages: 1,
    count: 0,
  });
  const [pageSize, setPageSize] = useState(20);
  const [isAllPageSize, setIsAllPageSize] = useState(false);
  const [periodTotalAmount, setPeriodTotalAmount] = useState(null);
  const [isLoadingPeriodTotal, setIsLoadingPeriodTotal] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [mappedFilter, setMappedFilter] = useState(null);
  const [showMappedFilterMenu, setShowMappedFilterMenu] = useState(false);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('');
  const [showInvoiceStatusFilterMenu, setShowInvoiceStatusFilterMenu] = useState(false);
  const [listOrdering, setListOrdering] = useState('');
  const [showAmountOrderingMenu, setShowAmountOrderingMenu] = useState(false);
  const [columnOrder, setColumnOrder] = useState(() => [...KNOWN_COLUMN_ORDER]);
  const [columnVisibility, setColumnVisibility] = useState(() =>
    Object.fromEntries(
      KNOWN_COLUMN_ORDER.map((id) => [id, !DEFAULT_HIDDEN_COLUMNS.has(id)])
    )
  );
  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const [dragColId, setDragColId] = useState(null);
  const chooserRef = useRef(null);
  const mappedFilterRef = useRef(null);
  const invoiceStatusFilterRef = useRef(null);
  const amountOrderingRef = useRef(null);
  const totalCountRef = useRef(0);

  const baseUrl = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '');

  const resolveRequestPageSize = (selection, totalCount) => {
    const n = Number(selection);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    return totalCount > 0 ? totalCount : 20;
  };

  const buildPaymentsRequestUrl = useCallback(
    (href = null) => {
      const resolved = href
        ? resolveRequestUrl(href, baseUrl)
        : (() => {
            if (!baseUrl) return null;
            const url = new URL(`${baseUrl}/booking/payments/`);
            url.searchParams.set('paid_date__year', String(paidYear));
            if (!showAllMonths) {
              url.searchParams.set('paid_date__month', String(paidMonth));
            }
            return url.toString();
          })();
      if (!resolved) return null;
      const size = isAllPageSize
        ? API_MAX_PAGE_SIZE
        : resolveRequestPageSize(pageSize, totalCountRef.current);
      try {
        const url = new URL(resolved);
        url.searchParams.set('page_size', String(size));
        return applyListFilters(url.toString(), {
          searchTerm: appliedSearch,
          mappedFilter,
          invoiceStatus: invoiceStatusFilter,
          ordering: listOrdering,
        });
      } catch {
        return applyListFilters(resolved, {
          searchTerm: appliedSearch,
          mappedFilter,
          invoiceStatus: invoiceStatusFilter,
          ordering: listOrdering,
        });
      }
    },
    [
      baseUrl,
      paidMonth,
      paidYear,
      pageSize,
      isAllPageSize,
      showAllMonths,
      appliedSearch,
      mappedFilter,
      invoiceStatusFilter,
      listOrdering,
    ]
  );

  /** Same filters as the table, always paged at API max — used to sum amount for the full period. */
  const buildPeriodAmountRequestUrl = useCallback(
    (href = null) => {
      const resolved = href
        ? resolveRequestUrl(href, baseUrl)
        : (() => {
            if (!baseUrl) return null;
            const url = new URL(`${baseUrl}/booking/payments/`);
            url.searchParams.set('paid_date__year', String(paidYear));
            if (!showAllMonths) {
              url.searchParams.set('paid_date__month', String(paidMonth));
            }
            return url.toString();
          })();
      if (!resolved) return null;
      try {
        const url = new URL(resolved);
        url.searchParams.set('page_size', String(API_MAX_PAGE_SIZE));
        return applyListFilters(url.toString(), {
          searchTerm: appliedSearch,
          mappedFilter,
          invoiceStatus: invoiceStatusFilter,
          ordering: listOrdering,
        });
      } catch {
        return applyListFilters(resolved, {
          searchTerm: appliedSearch,
          mappedFilter,
          invoiceStatus: invoiceStatusFilter,
          ordering: listOrdering,
        });
      }
    },
    [baseUrl, paidMonth, paidYear, showAllMonths, appliedSearch, mappedFilter, invoiceStatusFilter, listOrdering]
  );

  const applySearch = useCallback(() => {
    setAppliedSearch(searchInput.trim());
  }, [searchInput]);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setAppliedSearch('');
  }, []);

  const fetchPayments = async (requestUrl, isPageNav = false) => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setError('Authorization token missing. Please log in again.');
      setPayments([]);
      return;
    }

    if (isPageNav) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setError('');
    }

    try {
      if (isAllPageSize) {
        let nextRequestUrl = buildPaymentsRequestUrl();
        const allRows = [];
        let total = 0;

        while (nextRequestUrl) {
          const response = await axios.get(nextRequestUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = response.data || {};
          const rows = Array.isArray(data.results) ? data.results : [];
          allRows.push(...rows);
          total = Number(data.count ?? 0) || total;
          nextRequestUrl = data.next ? buildPaymentsRequestUrl(data.next) : null;
        }

        setPayments(allRows);
        syncColumnsFromRecords(allRows, setColumnOrder, setColumnVisibility);
        totalCountRef.current = total;
        setPeriodTotalAmount(sumAmountsFromApi(allRows));
        setPagination({
          next: null,
          previous: null,
          currentPage: 1,
          totalPages: 1,
          count: total,
        });
        return;
      }

      const response = await axios.get(requestUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data || {};
      const rows = Array.isArray(data.results) ? data.results : [];
      setPayments(rows);
      syncColumnsFromRecords(rows, setColumnOrder, setColumnVisibility);
      const total = Number(data.count ?? 0) || 0;
      totalCountRef.current = total;
      setPagination({
        next: data.next ?? null,
        previous: data.previous ?? null,
        currentPage: data.current_page ?? 1,
        totalPages: data.total_pages ?? 1,
        count: total,
      });
    } catch (err) {
      console.error('Monthly payments load error:', err);
      setError(formatApiError(err));
      setPayments([]);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!baseUrl) {
      setError('Missing VITE_BASEURL_CARE in .env');
      return;
    }
    const requestUrl = buildPaymentsRequestUrl();
    if (requestUrl) fetchPayments(requestUrl);
  }, [baseUrl, paidMonth, paidYear, pageSize, isAllPageSize, showAllMonths, appliedSearch, mappedFilter, invoiceStatusFilter, listOrdering, buildPaymentsRequestUrl]);

  useEffect(() => {
    if (!baseUrl || isAllPageSize) return;

    const token = localStorage.getItem('access_token');
    if (!token) return;

    let cancelled = false;
    setIsLoadingPeriodTotal(true);

    const fetchPeriodTotalAmount = async () => {
      try {
        let nextRequestUrl = buildPeriodAmountRequestUrl();
        const allRows = [];

        while (nextRequestUrl && !cancelled) {
          const response = await axios.get(nextRequestUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = response.data || {};
          const rows = Array.isArray(data.results) ? data.results : [];
          allRows.push(...rows);
          nextRequestUrl = data.next ? buildPeriodAmountRequestUrl(data.next) : null;
        }

        if (!cancelled) {
          setPeriodTotalAmount(sumAmountsFromApi(allRows));
        }
      } catch (err) {
        console.error('Monthly payments period total error:', err);
        if (!cancelled) setPeriodTotalAmount(null);
      } finally {
        if (!cancelled) setIsLoadingPeriodTotal(false);
      }
    };

    fetchPeriodTotalAmount();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, paidMonth, paidYear, showAllMonths, appliedSearch, mappedFilter, invoiceStatusFilter, listOrdering, isAllPageSize, buildPeriodAmountRequestUrl]);

  useEffect(() => {
    if (!showColumnChooser) return;
    const onDocClick = (event) => {
      if (chooserRef.current && !chooserRef.current.contains(event.target)) {
        setShowColumnChooser(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showColumnChooser]);

  useEffect(() => {
    if (!showMappedFilterMenu) return;
    const onDocClick = (event) => {
      if (mappedFilterRef.current && !mappedFilterRef.current.contains(event.target)) {
        setShowMappedFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showMappedFilterMenu]);

  useEffect(() => {
    if (!showInvoiceStatusFilterMenu) return;
    const onDocClick = (event) => {
      if (invoiceStatusFilterRef.current && !invoiceStatusFilterRef.current.contains(event.target)) {
        setShowInvoiceStatusFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showInvoiceStatusFilterMenu]);

  useEffect(() => {
    if (!showAmountOrderingMenu) return;
    const onDocClick = (event) => {
      if (amountOrderingRef.current && !amountOrderingRef.current.contains(event.target)) {
        setShowAmountOrderingMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showAmountOrderingMenu]);

  const visibleColumns = useMemo(
    () => columnOrder.filter((id) => !EXCLUDED_COLUMNS.has(id) && columnVisibility[id] !== false),
    [columnOrder, columnVisibility]
  );

  /** Export visible columns from chooser; if none hidden, same as all columns in order. */
  const exportColumnIds = useMemo(() => {
    const eligible = columnOrder.filter((id) => !EXCLUDED_COLUMNS.has(id));
    if (visibleColumns.length > 0) return visibleColumns;
    return eligible;
  }, [visibleColumns, columnOrder]);

  const hasHiddenColumns = useMemo(
    () =>
      columnOrder.some(
        (id) => !EXCLUDED_COLUMNS.has(id) && columnVisibility[id] === false
      ),
    [columnOrder, columnVisibility]
  );

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current, current - 1, current - 2, current - 3];
  }, []);

  const monthLabel = MONTH_OPTIONS.find((m) => m.value === paidMonth)?.label ?? String(paidMonth);
  const periodLabel = showAllMonths ? `All months · ${paidYear}` : `${monthLabel} ${paidYear}`;

  const pageTotalAmountDisplay = useMemo(() => {
    const total = sumAmountsFromApi(payments);
    if (total == null) return '-';
    return formatAmountExact(total);
  }, [payments]);

  const periodTotalAmountDisplay = useMemo(() => {
    if (isLoadingPeriodTotal) return '...';
    if (periodTotalAmount == null) return '-';
    return formatAmountExact(periodTotalAmount);
  }, [periodTotalAmount, isLoadingPeriodTotal]);

  const displayedRowRange = useMemo(() => {
    if (!payments.length) return '-';
    if (isAllPageSize || pagination.totalPages <= 1) {
      return payments.length === 1 ? '1' : `1–${payments.length}`;
    }
    const start = (pagination.currentPage - 1) * pageSize + 1;
    const end = start + payments.length - 1;
    return start === end ? String(start) : `${start}–${end}`;
  }, [payments.length, pagination.currentPage, pagination.totalPages, pageSize, isAllPageSize]);

  const periodAmountLabel = showAllMonths ? 'Amount (full year)' : 'Amount (for all month)';

  const showTotalCountOption =
    pagination.count > 0 && !PAGE_SIZE_PRESETS.includes(pagination.count);

  const exportPdf = () => {
    if (!exportColumnIds.length) {
      setError('Please keep at least one visible column before exporting.');
      return;
    }
    if (!payments.length) {
      setError('No payments to export on this page.');
      return;
    }
    setError('');
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      setError('Unable to open print window. Please allow popups.');
      return;
    }

    const headers = exportColumnIds
      .map((id) => `<th>${escapeHtml(formatColumnLabel(id))}</th>`)
      .join('');
    const rows = payments
      .map((payment) => {
        const cells = exportColumnIds
          .map((id) => `<td>${escapeHtml(exportCellText(payment, id))}</td>`)
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    const columnNote = hasHiddenColumns
      ? `${exportColumnIds.length} selected column(s)`
      : 'All columns';

    printWindow.document.write(`
      <html>
        <head>
          <title>Monthly Payments</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1e293b; }
            h2 { margin: 0 0 8px; }
            p { margin: 0 0 16px; color: #475569; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f1f5f9; font-weight: 700; }
          </style>
        </head>
        <body>
          <h2>Monthly Payments — ${escapeHtml(periodLabel)}</h2>
          <p>Rows on this page: ${payments.length}${pagination.count ? ` of ${pagination.count} total` : ''} · ${columnNote}</p>
          <table>
            <thead><tr>${headers}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const exportExcel = () => {
    if (!exportColumnIds.length) {
      setError('Please keep at least one visible column before exporting.');
      return;
    }
    if (!payments.length) {
      setError('No payments to export on this page.');
      return;
    }
    setError('');
    try {
      const headerRow = exportColumnIds.map((id) => formatColumnLabel(id));
      const dataRows = payments.map((payment) =>
        exportColumnIds.map((id) => exportCellText(payment, id))
      );
      const sheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Monthly Payments');
      const stamp = new Date().toISOString().slice(0, 10);
      const periodSlug = showAllMonths
        ? `all-months-${paidYear}`
        : `${paidYear}-m${paidMonth}`;
      XLSX.writeFile(workbook, `monthly-payments-${periodSlug}-p${pagination.currentPage}-${stamp}.xlsx`);
    } catch (e) {
      setError(e?.message || 'Unable to export Excel file.');
    }
  };

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 rounded border border-gray-200 bg-white p-1.5">
        <div className="relative min-w-0 flex-1 md:min-w-[14rem]">
          <FiSearch className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
            placeholder="Search payments (reference, method, patient, patient number, invoice id, patient id)"
            className="w-full rounded border border-gray-300 bg-white py-1.5 pl-8 pr-2 text-xs text-gray-900 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
        </div>
        <button
          type="button"
          onClick={applySearch}
          className="rounded border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
        >
          Search
        </button>
        <button
          type="button"
          onClick={clearSearch}
          disabled={!searchInput && !appliedSearch}
          className="rounded border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>
        {appliedSearch ? (
          <span className="text-[10px] text-gray-500">
            Filtering: <span className="font-medium text-gray-700">{appliedSearch}</span>
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-1.5">
        <label
          className={`flex items-center gap-1 text-[11px] text-gray-600 ${showAllMonths ? 'opacity-50' : ''}`}
        >
          Month
          <select
            value={paidMonth}
            disabled={showAllMonths}
            onChange={(e) => setPaidMonth(Number(e.target.value))}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100"
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-700">
          <input
            type="checkbox"
            checked={showAllMonths}
            onChange={(e) => setShowAllMonths(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show all months
        </label>
        <label className="flex items-center gap-1 text-[11px] text-gray-600">
          Year
          <select
            value={paidYear}
            onChange={(e) => setPaidYear(Number(e.target.value))}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[11px] text-gray-600">
          Rows
          <select
            value={isAllPageSize ? 'all' : String(pageSize)}
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'all') {
                setIsAllPageSize(true);
              } else {
                setIsAllPageSize(false);
                setPageSize(Number(value) || 20);
              }
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
          >
            {PAGE_SIZE_PRESETS.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
            {showTotalCountOption ? (
              <option value="all">All ({pagination.count})</option>
            ) : null}
          </select>
        </label>
        <div className="relative" ref={chooserRef}>
          <button
            type="button"
            onClick={() => setShowColumnChooser((prev) => !prev)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Column Chooser
          </button>
          {showColumnChooser && (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
              <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Columns</p>
              <div className="space-y-1">
                {columnOrder
                  .filter((colId) => !EXCLUDED_COLUMNS.has(colId))
                  .map((colId) => (
                  <label
                    key={colId}
                    className="flex items-center gap-2 rounded px-1 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={columnVisibility[colId] !== false}
                      onChange={() =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          [colId]: !(prev[colId] !== false),
                        }))
                      }
                    />
                    <span>{formatColumnLabel(colId)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={exportPdf}
            disabled={isLoading || payments.length === 0}
            className="rounded border border-indigo-600 bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={isLoading || payments.length === 0}
            className="rounded border border-emerald-700 bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => {
              const requestUrl = buildPaymentsRequestUrl();
              if (requestUrl) fetchPayments(requestUrl);
            }}
            disabled={isLoading}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FiRefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        <div className="rounded border border-slate-200 bg-white p-1.5">
          <p className="text-[9px] font-semibold uppercase text-slate-500">Period</p>
          <p className="text-xs font-bold text-slate-900">{periodLabel}</p>
          {showAllMonths ? (
            <p className="text-[10px] text-slate-500">Year filter only (Jan–Dec)</p>
          ) : null}
        </div>
        <div className="rounded border border-slate-200 bg-white p-1.5">
          <p className="text-[9px] font-semibold uppercase text-slate-500">Rows</p>
          <p className="text-xs font-bold text-slate-900">{displayedRowRange}</p>
          {pagination.count > payments.length ? (
            <p className="text-[10px] text-slate-500">of {pagination.count} total</p>
          ) : null}
        </div>
        <div className="rounded border border-slate-200 bg-white p-1.5">
          <p className="text-[9px] font-semibold uppercase text-slate-500">Amount (this page)</p>
          <p className="text-xs font-bold text-emerald-800">{pageTotalAmountDisplay}</p>
        </div>
        <div className="rounded border border-slate-200 bg-white p-1.5">
          <p className="text-[9px] font-semibold uppercase text-slate-500">{periodAmountLabel}</p>
          <p className="text-xs font-bold text-emerald-800">{periodTotalAmountDisplay}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded border border-gray-200 bg-white px-4 py-8 text-center text-xs text-gray-600">
          {isAllPageSize
            ? `Loading all payments for ${periodLabel}...`
            : `Loading payments for ${periodLabel}...`}
        </div>
      ) : error ? (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
      ) : payments.length === 0 ? (
        <div className="rounded border border-gray-200 bg-white px-4 py-6 text-center text-xs text-gray-500">
          <p>
            No payments found for {periodLabel}
            {appliedSearch ? ` matching "${appliedSearch}"` : ''}
            {mappedFilter === true ? ' (mapped only)' : mappedFilter === false ? ' (unmapped only)' : ''}
            {invoiceStatusFilter
              ? ` (${formatInvoiceStatusLabel(invoiceStatusFilter).toLowerCase()} invoices)`
              : ''}
            .
          </p>
          {mappedFilter !== null || appliedSearch || invoiceStatusFilter ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {mappedFilter !== null ? (
                <button
                  type="button"
                  onClick={() => {
                    setMappedFilter(null);
                    setShowMappedFilterMenu(false);
                  }}
                  className="rounded border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-100"
                >
                  Clear mapped filter
                </button>
              ) : null}
              {invoiceStatusFilter ? (
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceStatusFilter('');
                    setShowInvoiceStatusFilterMenu(false);
                  }}
                  className="rounded border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-100"
                >
                  Clear invoice status
                </button>
              ) : null}
              {appliedSearch ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="rounded border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Clear search
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full min-w-max border-collapse text-[11px] text-slate-700">
              <thead className="bg-slate-100">
                <tr>
                  {visibleColumns.map((colId) => (
                    <th
                      key={colId}
                      draggable
                      onDragStart={(e) => {
                        setDragColId(colId);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => setDragColId(null)}
                      onDragOver={(e) => {
                        if (!dragColId || dragColId === colId) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setColumnOrder((prev) => reorderColumns(prev, dragColId, colId));
                        setDragColId(null);
                      }}
                      className={`${CELL_PAD} min-w-0 align-top text-left font-semibold whitespace-nowrap`}
                    >
                      <span className="flex min-w-0 items-start gap-1">
                        <span className="mt-0.5 shrink-0 text-slate-400 leading-none">⋮</span>
                        <span className="min-w-0 flex-1">{renderColumnHeaderLabel(colId)}</span>
                        {colId === 'patient_name' ? (
                          <span
                            className="ml-0.5 inline-flex shrink-0 flex-col items-center justify-center gap-0"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              draggable={false}
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowAmountOrderingMenu(false);
                                setListOrdering((prev) =>
                                  prev === 'patient__first_name' ? '' : 'patient__first_name'
                                );
                              }}
                              className={`rounded p-0 leading-none transition-colors hover:bg-indigo-100 ${
                                listOrdering === 'patient__first_name'
                                  ? 'text-indigo-600'
                                  : 'text-slate-400'
                              }`}
                              title="Sort patient name A → Z"
                              aria-label="Sort patient name ascending"
                              aria-pressed={listOrdering === 'patient__first_name'}
                            >
                              <FiChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              draggable={false}
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowAmountOrderingMenu(false);
                                setListOrdering((prev) =>
                                  prev === '-patient__first_name' ? '' : '-patient__first_name'
                                );
                              }}
                              className={`-mt-0.5 rounded p-0 leading-none transition-colors hover:bg-indigo-100 ${
                                listOrdering === '-patient__first_name'
                                  ? 'text-indigo-600'
                                  : 'text-slate-400'
                              }`}
                              title="Sort patient name Z → A"
                              aria-label="Sort patient name descending"
                              aria-pressed={listOrdering === '-patient__first_name'}
                            >
                              <FiChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ) : null}
                        {colId === 'amount' ? (
                          <span className="relative shrink-0" ref={amountOrderingRef}>
                            <button
                              type="button"
                              draggable={false}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowAmountOrderingMenu((prev) => !prev);
                                setShowMappedFilterMenu(false);
                                setShowInvoiceStatusFilterMenu(false);
                              }}
                              className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none hover:bg-slate-200/80 ${
                                isAmountOrdering(listOrdering) ? 'text-indigo-600' : 'text-slate-400'
                              }`}
                              title={
                                isAmountOrdering(listOrdering)
                                  ? `Sort amount: ${
                                      AMOUNT_ORDERING_OPTIONS.find((o) => o.value === listOrdering)?.label ||
                                      'Amount'
                                    }`
                                  : 'Sort by amount'
                              }
                              aria-label="Sort by amount"
                              aria-expanded={showAmountOrderingMenu}
                            >
                              ▼
                            </button>
                            {showAmountOrderingMenu ? (
                              <div
                                className="absolute right-0 top-full z-20 mt-1 min-w-[8.5rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                {AMOUNT_ORDERING_OPTIONS.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                      setListOrdering(option.value);
                                      setShowAmountOrderingMenu(false);
                                    }}
                                    className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-50 ${
                                      listOrdering === option.value
                                        ? 'font-semibold text-indigo-700'
                                        : 'text-slate-700'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </span>
                        ) : null}
                        {colId === 'invoice_status' ? (
                          <span className="relative shrink-0" ref={invoiceStatusFilterRef}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowInvoiceStatusFilterMenu((prev) => !prev);
                                setShowMappedFilterMenu(false);
                                setShowAmountOrderingMenu(false);
                              }}
                              className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none hover:bg-slate-200/80 ${
                                invoiceStatusFilter ? 'text-indigo-600' : 'text-slate-400'
                              }`}
                              title="Filter by invoice status"
                              aria-label="Filter by invoice status"
                            >
                              ▼
                            </button>
                            {showInvoiceStatusFilterMenu ? (
                              <div
                                className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                {INVOICE_STATUS_FILTER_OPTIONS.map((option) => (
                                  <button
                                    key={option.value || 'all'}
                                    type="button"
                                    onClick={() => {
                                      setInvoiceStatusFilter(option.value);
                                      setShowInvoiceStatusFilterMenu(false);
                                    }}
                                    className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-50 ${
                                      invoiceStatusFilter === option.value
                                        ? 'font-semibold text-indigo-700'
                                        : 'text-slate-700'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </span>
                        ) : null}
                        {colId === 'is_mapped' ? (
                          <span className="relative shrink-0" ref={mappedFilterRef}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowMappedFilterMenu((prev) => !prev);
                                setShowInvoiceStatusFilterMenu(false);
                                setShowAmountOrderingMenu(false);
                              }}
                              className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none hover:bg-slate-200/80 ${
                                mappedFilter === null ? 'text-slate-400' : 'text-indigo-600'
                              }`}
                              title="Filter by mapped status"
                              aria-label="Filter by mapped status"
                            >
                              ▼
                            </button>
                            {showMappedFilterMenu ? (
                              <div
                                className="absolute right-0 top-full z-20 mt-1 min-w-[7.5rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMappedFilter(null);
                                    setShowMappedFilterMenu(false);
                                  }}
                                  className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-50 ${
                                    mappedFilter === null ? 'font-semibold text-indigo-700' : 'text-slate-700'
                                  }`}
                                >
                                  All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMappedFilter(true);
                                    setShowMappedFilterMenu(false);
                                  }}
                                  className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-50 ${
                                    mappedFilter === true ? 'font-semibold text-indigo-700' : 'text-slate-700'
                                  }`}
                                >
                                  Mapped
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMappedFilter(false);
                                    setShowMappedFilterMenu(false);
                                  }}
                                  className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-50 ${
                                    mappedFilter === false ? 'font-semibold text-indigo-700' : 'text-slate-700'
                                  }`}
                                >
                                  Unmapped
                                </button>
                              </div>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map((payment, index) => (
                  <tr
                    key={payment.id ?? index}
                    className={`border-t border-slate-100 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                  >
                    {visibleColumns.map((colId) => (
                      <td key={colId} className={`${CELL_PAD} min-w-0 align-top`}>
                        {renderTableCellContent(payment, colId)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-slate-700">
            {isAllPageSize ? (
              <p>
                Showing all <span className="font-semibold">{payments.length}</span> payments
                {pagination.count ? (
                  <span className="text-slate-500"> ({pagination.count} total)</span>
                ) : null}
              </p>
            ) : (
              <>
                <p>
                  Page <span className="font-semibold">{pagination.currentPage}</span> of{' '}
                  <span className="font-semibold">{pagination.totalPages}</span>
                  {pagination.count ? (
                    <span className="text-slate-500"> ({pagination.count} total)</span>
                  ) : null}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!pagination.previous || isLoading || isLoadingMore}
                    onClick={() => {
                      const requestUrl = buildPaymentsRequestUrl(pagination.previous);
                      if (requestUrl) fetchPayments(requestUrl, true);
                    }}
                    className="rounded border border-slate-300 bg-white px-2 py-1 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!pagination.next || isLoading || isLoadingMore}
                    onClick={() => {
                      const requestUrl = buildPaymentsRequestUrl(pagination.next);
                      if (requestUrl) fetchPayments(requestUrl, true);
                    }}
                    className="rounded border border-slate-300 bg-white px-2 py-1 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                  {isLoadingMore ? (
                    <span className="text-slate-500">Loading...</span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MonthlyPayments;
