import * as XLSX from 'xlsx';
import { buildTableMatrix, inferFormLayoutStyle, normalizeTableRows } from './ermFormLayout';

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const safeFilePart = (s) =>
  String(s || 'form')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48) || 'form';

export function exportErmFormPdf({ title, categoryLabel, patientLabel, fields, values, layoutStyle }) {
  const style = inferFormLayoutStyle(fields, layoutStyle);
  const matrix = style === 'table' ? buildTableMatrix(fields) : null;

  let tableBody;
  if (style === 'data-table') {
    const columns = fields || [];
    const rows = normalizeTableRows(values?.tableRows, columns, 1).filter((r) =>
      columns.some((c) => String(r.cells?.[c.id] ?? '').trim())
    );
    const header = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
    const body = (rows.length ? rows : normalizeTableRows([], columns, 1))
      .map(
        (row) => `<tr>${columns
          .map((c) => `<td>${escapeHtml(row.cells?.[c.id] ?? '')}</td>`)
          .join('')}</tr>`
      )
      .join('');
    tableBody = `<thead><tr>${header}</tr></thead><tbody>${body}</tbody>`;
  } else if (matrix?.rows?.length) {
    tableBody = matrix.rows
      .map(
        (row) => `
      <tr>
        ${row
          .map((cell) =>
            cell
              ? `<td style="border:1px solid #cbd5e1;padding:8px;vertical-align:top">
            <div style="font-weight:600;font-size:11px;margin-bottom:4px;color:#334155">${escapeHtml(cell.label)}</div>
            <div>${escapeHtml(values?.[cell.id] ?? '')}</div>
          </td>`
              : '<td style="border:1px solid #e2e8f0;background:#f8fafc"></td>'
          )
          .join('')}
      </tr>`
      )
      .join('');
  } else {
    tableBody = (fields || [])
      .map(
        (f) => `
      <tr>
        <th style="width:32%">${escapeHtml(f.label)}</th>
        <td>${escapeHtml(values?.[f.id] ?? '')}</td>
      </tr>`
      )
      .join('');
  }

  const printWindow = window.open('', '_blank', 'width=900,height=800');
  if (!printWindow) {
    throw new Error('Unable to open print window. Please allow popups.');
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 28px; color: #1e293b; }
          .brand { text-align: center; margin-bottom: 8px; }
          .brand h1 { margin: 0; font-size: 22px; letter-spacing: 0.04em; }
          .brand h2 { margin: 8px 0 0; font-size: 14px; font-weight: 600; text-decoration: underline; }
          .meta { text-align: center; color: #64748b; font-size: 12px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; vertical-align: top; }
          th { background: #f8fafc; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="brand">
          <h1>VAISHNAVI MEDICARE</h1>
          <h2>${escapeHtml(categoryLabel || title)}</h2>
        </div>
        <p class="meta">
          ${patientLabel ? `Patient: ${escapeHtml(patientLabel)} · ` : ''}
          Exported: ${escapeHtml(new Date().toLocaleString())}
        </p>
        <table>
          ${style === 'data-table' ? tableBody : `<tbody>${tableBody}</tbody>`}
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export function exportErmFormExcel({ title, patientLabel, fields, values, layoutStyle }) {
  const style = inferFormLayoutStyle(fields, layoutStyle);
  let sheetData;
  if (style === 'data-table') {
    const columns = fields || [];
    const rows = normalizeTableRows(values?.tableRows, columns, 1);
    sheetData = [
      ['Form', title || ''],
      ['Patient', patientLabel || '—'],
      ['Exported', new Date().toLocaleString()],
      [],
      columns.map((c) => c.label),
      ...rows.map((r) => columns.map((c) => r.cells?.[c.id] ?? '')),
    ];
  } else {
    sheetData = [
      ['Form', title || ''],
      ['Patient', patientLabel || '—'],
      ['Exported', new Date().toLocaleString()],
      [],
      ['Field', 'Value'],
      ...(fields || []).map((f) => [f.label || 'Field', values?.[f.id] ?? '']),
    ];
  }
  const sheet = XLSX.utils.aoa_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Form Data');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${safeFilePart(title)}-${stamp}.xlsx`);
}
