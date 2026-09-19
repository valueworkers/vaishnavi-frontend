/** Build row-based layout for native ERM forms (no scanned image background). */

const getFieldRect = (f) => f?.rect || f?.layoutRect || null;

const nearestColumnIndex = (x, centers) => {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const d = Math.abs(x - centers[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
};

const columnCentersForCount = (xs, count) => {
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  if (count <= 1) return [sorted[0]];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const step = (max - min) / count;
  return Array.from({ length: count }, (_, i) => min + step * (i + 0.5));
};

/**
 * Cluster fields by OCR position into table rows/columns (percent rects from scan).
 * @returns {{ rows: (object|null)[][], columnCount: number } | null}
 */
export function buildTableMatrix(fields) {
  const list = (Array.isArray(fields) ? fields : []).filter((f) => {
    const r = getFieldRect(f);
    return r && Number.isFinite(r.x) && Number.isFinite(r.y);
  });
  if (list.length < 4) return null;

  const sorted = [...list].sort((a, b) => {
    const ra = getFieldRect(a);
    const rb = getFieldRect(b);
    if (Math.abs(ra.y - rb.y) > 0.5) return ra.y - rb.y;
    return ra.x - rb.x;
  });

  const rowThreshold = 3.5;
  const rawRows = [];
  let bucket = [];
  let anchorY = null;

  for (const f of sorted) {
    const y = getFieldRect(f).y;
    if (anchorY === null || Math.abs(y - anchorY) <= rowThreshold) {
      bucket.push(f);
      anchorY = anchorY === null ? y : (anchorY + y) / 2;
    } else {
      if (bucket.length) {
        bucket.sort((a, b) => getFieldRect(a).x - getFieldRect(b).x);
        rawRows.push(bucket);
      }
      bucket = [f];
      anchorY = y;
    }
  }
  if (bucket.length) {
    bucket.sort((a, b) => getFieldRect(a).x - getFieldRect(b).x);
    rawRows.push(bucket);
  }

  const multiColRows = rawRows.filter((r) => r.length >= 2);
  if (multiColRows.length < 2) return null;

  const maxCols = Math.max(...rawRows.map((r) => r.length));
  if (maxCols < 2) return null;

  const alignedRatio = multiColRows.length / rawRows.length;
  if (rawRows.length >= 4 && alignedRatio < 0.3) return null;

  const xCenters = list.map((f) => {
    const r = getFieldRect(f);
    return r.x + (r.w || 12) / 2;
  });
  const colCenters = columnCentersForCount(xCenters, maxCols);

  const matrix = rawRows.map((row) => {
    const cells = Array(maxCols).fill(null);
    for (const f of row) {
      const r = getFieldRect(f);
      const cx = r.x + (r.w || 12) / 2;
      let col = nearestColumnIndex(cx, colCenters);
      if (cells[col]) {
        const free = cells.findIndex((c) => !c);
        if (free >= 0) col = free;
      }
      cells[col] = f;
    }
    return cells;
  });

  return { rows: matrix, columnCount: maxCols };
}

/** Manual tabular layout: chunk fields into rows (left-to-right, top-to-bottom). */
export function fieldsToTableMatrix(fields, columnsPerRow = 3) {
  const list = Array.isArray(fields) ? fields.filter(Boolean) : [];
  const cols = Math.max(1, Math.min(12, Number(columnsPerRow) || 3));
  const rows = [];
  for (let i = 0; i < list.length; i += cols) {
    const slice = list.slice(i, i + cols);
    rows.push(Array.from({ length: cols }, (_, j) => slice[j] || null));
  }
  return { rows, columnCount: cols };
}

export function resolveTableMatrix(fields, { columnsPerRow = 3 } = {}) {
  return buildTableMatrix(fields) || fieldsToTableMatrix(fields, columnsPerRow);
}

export function flattenTableMatrixToFields(matrix) {
  if (!matrix?.rows) return [];
  const out = [];
  for (const row of matrix.rows) {
    for (const cell of row) {
      if (cell) out.push(cell);
    }
  }
  return out;
}

export function assignTableRects(fields, columnsPerRow = 3) {
  const cols = Math.max(1, Math.min(12, Number(columnsPerRow) || 3));
  const colW = Math.floor(96 / cols);
  return (fields || []).map((f, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const hasRect = f?.rect && Number.isFinite(f.rect.x);
    return {
      ...f,
      rect: hasRect
        ? f.rect
        : { x: col * colW + 2, y: row * 6 + 4, w: Math.max(8, colW - 2), h: 5 },
    };
  });
}

export const LAYOUT_STYLE_OPTIONS = [
  { value: 'grid', label: 'Grid', hint: '3-column cards; drag to reorder' },
  { value: 'table', label: 'Tabular', hint: 'Rows & columns; drag cells to rearrange' },
  { value: 'data-table', label: 'Log sheet', hint: 'Header row + many entry rows (vitals)' },
];

const HEADER_HINT =
  /\b(date|time|temp|temperature|pulse|respiratory|resp|blood|pressure|bp\b|oxygen|spo2|saturation|grbs|glucose|sign|initial|remark|weight|height)\b/i;

/** Standard vitals log columns when OCR misses the header row. */
export const VITALS_LOG_COLUMNS = [
  { label: 'DATE', type: 'date' },
  { label: 'TIME', type: 'text' },
  { label: 'TEMPERATURE', type: 'text' },
  { label: 'PULSE RATE', type: 'text' },
  { label: 'RESPIRATORY RATE', type: 'text' },
  { label: 'BLOOD PRESSURE', type: 'text' },
  { label: 'OXYGEN SATURATION', type: 'text' },
  { label: 'GRBS', type: 'text' },
  { label: 'SIGN', type: 'text' },
];

export const inferColumnTypeFromLabel = (label) => {
  const s = String(label || '').toLowerCase();
  if (/\bdate\b/.test(s)) return 'date';
  if (/\b(time|temp|pulse|rate|pressure|oxygen|saturation|grbs|glucose|sign)\b/.test(s)) return 'text';
  if (/\b(weight|height|age|count|no\.?|number)\b/.test(s)) return 'number';
  return 'text';
};

const looksLikeHeaderCell = (f) => {
  const lab = String(f?.label || '').trim();
  if (!lab || lab.length > 40) return false;
  if (HEADER_HINT.test(lab)) return true;
  if (lab.length <= 22 && lab === lab.toUpperCase() && /[A-Z]/.test(lab)) return true;
  return false;
};

/**
 * Vitals / log sheet: one header row of column names + many empty data rows.
 * @returns {{ columns: object[], initialRowCount: number } | null}
 */
export function buildDataTableSpec(fields, { formName = '', category = '' } = {}) {
  const matrix = buildTableMatrix(fields);
  let headerCells = null;

  if (matrix?.rows?.length) {
    const first = matrix.rows[0].filter(Boolean);
    const headerHits = first.filter(looksLikeHeaderCell).length;
    if (first.length >= 4 && headerHits >= Math.min(3, Math.ceil(first.length * 0.4))) {
      headerCells = first;
    }
  }

  const nameHint = /vital\s*sign|vitals?\s*(record|chart|sheet|log)/i.test(formName);
  const catHint = category === 'vitals';

  if (!headerCells && (nameHint || catHint)) {
    const mkId = () => `col-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return {
      columns: VITALS_LOG_COLUMNS.map((c) => ({
        id: mkId(),
        label: c.label,
        type: c.type,
      })),
      initialRowCount: 8,
    };
  }

  if (!headerCells) return null;

  const bodyRows = matrix.rows.slice(1);
  const bodyFilled = bodyRows.filter((r) => r.filter(Boolean).length >= 2).length;
  if (bodyFilled >= 2) return null;

  return {
    columns: headerCells.map((f) => ({
      id: f.id,
      label: String(f.label).trim(),
      type: f.type || inferColumnTypeFromLabel(f.label),
    })),
    initialRowCount: Math.max(6, Math.min(20, bodyRows.length + 5)),
  };
}

export const emptyTableRow = (columns) => {
  const cells = {};
  for (const c of columns || []) {
    if (c?.id) cells[c.id] = '';
  }
  return { id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, cells };
};

export const defaultTableRows = (columns, count = 6) =>
  Array.from({ length: count }, () => emptyTableRow(columns));

export const normalizeTableRows = (rows, columns, minRows = 6) => {
  const cols = columns || [];
  const list = Array.isArray(rows) ? rows : [];
  const normalized = list.map((r) => {
    const cells = { ...emptyTableRow(cols).cells, ...(r?.cells || r?.values || {}) };
    for (const c of cols) {
      if (cells[c.id] == null) cells[c.id] = '';
      else cells[c.id] = String(cells[c.id]);
    }
    return { id: r?.id || emptyTableRow(cols).id, cells };
  });
  while (normalized.length < minRows) normalized.push(emptyTableRow(cols));
  return normalized;
};

/** After OCR: convert to column defs + log-sheet values when detected. */
export function extractDataTableFromOcrFields(fields, { formName = '', category = '' } = {}) {
  const spec = buildDataTableSpec(fields, { formName, category });
  if (!spec) return null;
  return {
    layoutStyle: 'data-table',
    columns: spec.columns,
    values: { tableRows: defaultTableRows(spec.columns, spec.initialRowCount) },
  };
}

/** @returns {'data-table'|'table'|'grid'} */
export function inferFormLayoutStyle(fields, savedStyle) {
  if (savedStyle === 'data-table' || savedStyle === 'table' || savedStyle === 'grid') {
    if (savedStyle === 'data-table') return 'data-table';
    if (savedStyle === 'table') return 'table';
    return 'grid';
  }
  if (buildDataTableSpec(fields)) return 'data-table';
  if (buildTableMatrix(fields)) return 'table';
  return 'grid';
}

export function isDataTableLayout(fields, savedStyle) {
  return inferFormLayoutStyle(fields, savedStyle) === 'data-table';
}

export function valuesForLayout(fields, savedStyle, prevValues) {
  if (isDataTableLayout(fields, savedStyle)) {
    return {
      tableRows: normalizeTableRows(prevValues?.tableRows, fields, 6),
    };
  }
  const next = { ...(prevValues || {}) };
  delete next.tableRows;
  const ids = new Set((fields || []).map((f) => f.id));
  for (const id of Object.keys(next)) {
    if (!ids.has(id)) delete next[id];
  }
  for (const f of fields || []) {
    if (f?.id && next[f.id] == null) next[f.id] = '';
  }
  return next;
}

/** Switch layout mode when user picks Grid / Tabular / Log sheet. */
export function applyLayoutStyleChange(
  fields,
  values,
  newStyle,
  { columnsPerRow = 3, formName = '', category = '' } = {}
) {
  const style = newStyle === 'data-table' || newStyle === 'table' || newStyle === 'grid' ? newStyle : 'grid';

  if (style === 'data-table') {
    const spec = buildDataTableSpec(fields, { formName, category });
    const cols =
      spec?.columns ||
      (fields || []).map((f) => ({
        ...f,
        type: f.type || inferColumnTypeFromLabel(f.label),
      }));
    return {
      fields: cols,
      values: { tableRows: defaultTableRows(cols, spec?.initialRowCount || 8) },
      layoutStyle: 'data-table',
      tableColumnsPerRow: cols.length,
    };
  }

  if (style === 'table') {
    const cols = Math.max(1, Math.min(12, Number(columnsPerRow) || 3));
    const nextFields = assignTableRects(fields, cols);
    return {
      fields: nextFields,
      values: valuesForLayout(nextFields, 'grid', values),
      layoutStyle: 'table',
      tableColumnsPerRow: cols,
    };
  }

  return {
    fields: fields || [],
    values: valuesForLayout(fields, 'grid', values),
    layoutStyle: 'grid',
    tableColumnsPerRow: columnsPerRow,
  };
}

const isLongField = (f) => f?.type === 'textarea' || /\b(diagnosis|history|notes|comments|plan|instructions|allergy)\b/i.test(f?.label || '');

/** Two-field row: wide + narrow (e.g. Allergy + Blood Group). */
const isWideNarrowPair = (a, b) => {
  if (!a || !b) return false;
  const la = String(a.label || '').toLowerCase();
  const lb = String(b.label || '').toLowerCase();
  return (
    (la.includes('allergy') && lb.includes('blood')) ||
    (lb.includes('allergy') && la.includes('blood'))
  );
};

/**
 * @returns {Array<{ type: 'row'|'full', fields: object[], grid?: string }>}
 */
export function groupFieldsIntoRows(fields) {
  const list = Array.isArray(fields) ? fields : [];
  const rows = [];
  let pending = [];

  const flushRow = () => {
    if (pending.length === 0) return;
    if (pending.length === 2 && isWideNarrowPair(pending[0], pending[1])) {
      rows.push({ type: 'row', fields: pending, grid: 'grid-cols-3 wide-narrow' });
    } else if (pending.length === 2) {
      rows.push({ type: 'row', fields: pending, grid: 'grid-cols-2' });
    } else {
      rows.push({ type: 'row', fields: pending, grid: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' });
    }
    pending = [];
  };

  for (const f of list) {
    if (isLongField(f)) {
      flushRow();
      rows.push({ type: 'full', fields: [f] });
    } else {
      pending.push(f);
      if (pending.length >= 3) flushRow();
    }
  }
  flushRow();
  return rows;
}

export const categoryFormHeading = (category, formName) => {
  const n = String(formName || '').trim();
  if (category === 'patient-summary' || /patient\s*summary/i.test(n)) return 'PATIENT SUMMARY';
  if (category === 'vitals') return 'VITALS RECORD';
  if (category === 'medication') return 'MEDICATION CHART';
  return (n || 'MEDICAL FORM').toUpperCase();
};
