export const SALARY_TXN_LS_ORDER = 'staffPayouts_columnOrder';
export const SALARY_TXN_LS_VISIBILITY = 'staffPayouts_columnVisibility';

/** Preferred order/labels for GET /payroll/salary-transactions/ fields. */
export const SALARY_TXN_PREFERRED_KEYS = [
  'employee_name',
  'employee_id',
  'id',
  'transaction_id',
  'period_month',
  'amount_paid',
  'payment_method',
  'payment_reference',
  'paid_at',
  'processed_at',
  'split_basic',
  'split_pf',
  'split_esi',
  'split_other',
  'note',
  'status',
];

export const SALARY_TXN_COLUMN_LABELS = {
  employee_name: 'Employee',
  employee_id: 'Emp. ID',
  id: 'ID',
  transaction_id: 'Transaction ID',
  salary_report_id: 'Salary Report ID',
  period_month: 'Month',
  start_date: 'Start Date',
  end_date: 'End Date',
  amount_paid: 'Amount Paid',
  payment_method: 'Payment Method',
  payment_reference: 'Payment Reference',
  paid_at: 'Paid At',
  processed_at: 'Processed At',
  split_basic: 'Basic',
  split_pf: 'PF',
  split_esi: 'ESI',
  split_other: 'Other',
  note: 'Note',
  status: 'Status',
};

const MONEY_KEYS = new Set([
  'amount_paid',
  'split_basic',
  'split_pf',
  'split_esi',
  'split_other',
]);
const DATE_KEYS = new Set(['start_date', 'end_date']);
const DATETIME_KEYS = new Set(['processed_at', 'paid_at']);
const SKIP_KEYS = new Set(['split']);
/** Hidden by default — period shown as Month instead. */
const DEFAULT_HIDDEN_KEYS = new Set(['start_date', 'end_date']);

export const salaryTxnColumnLabel = (key) => {
  if (SALARY_TXN_COLUMN_LABELS[key]) return SALARY_TXN_COLUMN_LABELS[key];
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
};

export const formatSalaryTxnMonth = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  const m = raw.match(/^(\d{4})-(\d{2})/);
  if (m) {
    const date = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    }
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }
  return raw;
};

/** Flatten nested `split` into table columns; derive Month from start/end. */
export const normalizeSalaryTxnRow = (row) => {
  if (!row || typeof row !== 'object') return null;
  const split = row.split && typeof row.split === 'object' ? row.split : {};
  const next = { ...row };
  delete next.split;
  if (split.basic != null || row.split_basic != null) {
    next.split_basic = split.basic ?? row.split_basic;
  }
  if (split.pf != null || row.split_pf != null) {
    next.split_pf = split.pf ?? row.split_pf;
  }
  if (split.esi != null || row.split_esi != null) {
    next.split_esi = split.esi ?? row.split_esi;
  }
  if (split.other != null || row.split_other != null) {
    next.split_other = split.other ?? row.split_other;
  }
  next.period_month =
    row.period_month ||
    formatSalaryTxnMonth(row.start_date || row.end_date) ||
    '';
  return next;
};

export const collectSalaryTxnKeys = (rows) => {
  const seen = new Set();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const normalized = normalizeSalaryTxnRow(row) || row;
    if (!normalized || typeof normalized !== 'object') return;
    Object.keys(normalized).forEach((key) => {
      if (SKIP_KEYS.has(key)) return;
      seen.add(key);
    });
  });
  return [...seen];
};

export const mergeSalaryTxnColumnOrder = (preferred, discovered) => {
  const seen = new Set();
  const out = [];
  [...preferred, ...discovered].forEach((key) => {
    if (!key || seen.has(key) || SKIP_KEYS.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return out;
};

export const loadSalaryTxnColumnOrder = (knownKeys = SALARY_TXN_PREFERRED_KEYS) => {
  try {
    const raw = localStorage.getItem(SALARY_TXN_LS_ORDER);
    if (!raw) return [...knownKeys];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...knownKeys];
    return mergeSalaryTxnColumnOrder(parsed, knownKeys);
  } catch {
    return [...knownKeys];
  }
};

export const loadSalaryTxnColumnVisibility = (knownKeys = SALARY_TXN_PREFERRED_KEYS) => {
  const defaults = Object.fromEntries(
    knownKeys.map((id) => [id, !DEFAULT_HIDDEN_KEYS.has(id)]),
  );
  try {
    const raw = localStorage.getItem(SALARY_TXN_LS_VISIBILITY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
};

export const reorderSalaryTxnColumns = (order, sourceId, targetId) => {
  if (!sourceId || !targetId || sourceId === targetId) return order;
  const sourceIndex = order.indexOf(sourceId);
  const targetIndex = order.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return order;
  const updated = [...order];
  const [moved] = updated.splice(sourceIndex, 1);
  updated.splice(targetIndex, 0, moved);
  return updated;
};

const looksLikeIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
const looksLikeIsoDateTime = (value) =>
  /^\d{4}-\d{2}-\d{2}T/.test(String(value || '').trim());

export const formatSalaryTxnDate = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return raw;
};

export const formatSalaryTxnDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatSalaryTxnMoney = (value) => {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatSalaryTxnCellValue = (row, key) => {
  if (!row || !key) return '';
  if (key === 'period_month') {
    return row.period_month || formatSalaryTxnMonth(row.start_date || row.end_date) || '';
  }
  const value = row[key];
  if (value == null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (MONEY_KEYS.has(key)) return formatSalaryTxnMoney(value);
  if (DATE_KEYS.has(key) || looksLikeIsoDate(value)) return formatSalaryTxnDate(value);
  if (DATETIME_KEYS.has(key) || looksLikeIsoDateTime(value)) return formatSalaryTxnDateTime(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item == null) return '';
        if (typeof item === 'object') {
          return item.name || item.title || item.label || item.code || item.id || JSON.stringify(item);
        }
        return String(item);
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    return value.name || value.title || value.label || value.code || JSON.stringify(value);
  }
  if (key === 'payment_method') return String(value).replace(/_/g, ' ');
  return String(value);
};

export const isSalaryTxnMoneyColumn = (key) => MONEY_KEYS.has(key);
export const isSalaryTxnStatusColumn = (key) => key === 'status';
export const isSalaryTxnMethodColumn = (key) => key === 'payment_method';
export const isSalaryTxnDefaultHiddenColumn = (key) => DEFAULT_HIDDEN_KEYS.has(key);