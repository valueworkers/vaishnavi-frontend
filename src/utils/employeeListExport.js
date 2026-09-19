import * as XLSX from 'xlsx';
import {
  EMPLOYEE_COLUMN_LABELS,
  EMPLOYEE_DRAG_COLUMN_IDS,
  EMPLOYEE_FIXED_LEADING_IDS,
  getEmployeeCellText,
} from './employeeMasterColumns';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** All Employee Master data columns (excludes Docs / Actions UI columns). */
export const EMPLOYEE_EXPORT_COLUMN_IDS = [
  ...EMPLOYEE_FIXED_LEADING_IDS,
  ...EMPLOYEE_DRAG_COLUMN_IDS,
];

export const EMPLOYEE_LIST_EXPORT_COLUMN_LABELS = EMPLOYEE_EXPORT_COLUMN_IDS.map(
  (id) => EMPLOYEE_COLUMN_LABELS[id] || id
);

export const formatEmployeeSkills = (person) => getEmployeeCellText(person, 'skills');

export const employeeToExportRow = (person) =>
  EMPLOYEE_EXPORT_COLUMN_IDS.map((columnId) => getEmployeeCellText(person, columnId));

export const buildEmployeeExportSubtitle = ({
  exportedCount,
  totalCount,
  currentPage,
  searchTerm,
}) => {
  const parts = [`Exported: ${exportedCount} record(s)`];
  if (totalCount > exportedCount) {
    parts.push(`${totalCount} total in system (current page only)`);
  }
  if (currentPage > 1) {
    parts.push(`Page ${currentPage}`);
  }
  if (searchTerm?.trim()) {
    parts.push(`Search: "${searchTerm.trim()}"`);
  }
  parts.push(`Generated: ${new Date().toLocaleString()}`);
  return parts.join(' · ');
};

export const exportEmployeeListPdf = ({ title, subtitle, rows }) => {
  if (!rows?.length) {
    throw new Error('No records to export.');
  }

  const printWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!printWindow) {
    throw new Error('Unable to open print window. Please allow popups.');
  }

  const headers = EMPLOYEE_LIST_EXPORT_COLUMN_LABELS.map(
    (label) => `<th>${escapeHtml(label)}</th>`
  ).join('');
  const bodyRows = rows
    .map((cells) => {
      const tds = cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1e293b; }
          h2 { margin: 0 0 8px; font-size: 20px; }
          p { margin: 0 0 16px; color: #475569; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f1f5f9; font-weight: 700; }
          tr:nth-child(even) td { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(subtitle || '')}</p>
        <table>
          <thead><tr>${headers}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

export const exportEmployeeListExcel = ({ rows, sheetName, fileNamePrefix }) => {
  if (!rows?.length) {
    throw new Error('No records to export.');
  }

  const sheet = XLSX.utils.aoa_to_sheet([EMPLOYEE_LIST_EXPORT_COLUMN_LABELS, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, (sheetName || 'List').slice(0, 31));
  const stamp = new Date().toISOString().slice(0, 10);
  const prefix = String(fileNamePrefix || 'export').replace(/[^\w-]+/g, '-');
  XLSX.writeFile(workbook, `${prefix}-${stamp}.xlsx`);
};
