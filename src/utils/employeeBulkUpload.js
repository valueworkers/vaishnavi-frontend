import * as XLSX from 'xlsx';
import axios from 'axios';

export const EMPLOYEE_BULK_UPLOAD_PATH = '/accounts/employees-bulk-upload/';

/** Served from `public/templates/` (source: `.cursor/rules/docs/employee_bulk_upload_template.xlsx`). */
export const EMPLOYEE_BULK_UPLOAD_TEMPLATE_URL = '/templates/employee_bulk_upload_template.xlsx';
export const EMPLOYEE_BULK_UPLOAD_TEMPLATE_FILENAME = 'employee_bulk_upload_template.xlsx';

/** Excel column headers for employee bulk upload (must match API template). */
export const EMPLOYEE_BULK_UPLOAD_HEADERS = [
  'Action (Create/Update)',
  'Employee ID',
  'First Name*',
  'Middle Name',
  'Last Name*',
  'Email*',
  'Mobile Number*',
  'Alternate Phone Number',
  'Emergency Contact Name',
  'Emergency Contact Number',
  'User Type',
  'Age',
  'Gender',
  'Permanent Address',
  'Current Address',
  'City',
  'Date Joined (YYYY-MM-DD)',
  'Category',
  'Designation',
  'Grade',
  'Cost Center',
  'Department',
  'Vendor Name',
  'Vendor Phone',
  'Order Types (comma separated)',
  'Skills (comma separated)',
  'Target Percent',
  'Qc Required (TRUE/FALSE)',
  'Pf Applicable (TRUE/FALSE)',
  'Pf Number',
  'Uan Number',
  'Esi Applicable (TRUE/FALSE)',
  'Esi Number',
  'Esi Dispensary',
  'Shift Name',
  'Shift Effective From (YYYY-MM-DD)',
];

export const EMPLOYEE_BULK_UPLOAD_INSTRUCTIONS = [
  'How to use this template',
  '',
  "• Leave 'Action' blank to auto-detect Create vs Update from Mobile Number / Employee ID.",
  '• Fields marked with * are required when creating a new employee.',
  '• Hover over a column header to see its format / allowed values.',
  "• Leave 'Employee ID' blank when creating — it is generated automatically.",
  '• Max 2000 rows per upload.',
  "• 'Category', 'User Type' and 'Gender' must exactly match the choice values your models define.",
  "• Terminate fields are excluded — use terminate / termination_revoke only.",
  '',
  'Boolean fields (API: true / false)',
  '• Qc Required, Pf Applicable, Esi Applicable: enter TRUE or FALSE only.',
  '',
  'Skills (API: array of objects)',
  '• Prefer JSON in the Skills cell, e.g.',
  '  [{"skill":"Nursing","priority":0,"experience":"2 years"}]',
  '• Each object: skill (required), priority (number), experience (text).',
];

const ACCEPT_EXT = /\.(xlsx|xls|csv)$/i;

export const isEmployeeBulkUploadFile = (file) => {
  if (!file) return false;
  const name = String(file.name || '');
  const type = String(file.type || '');
  if (ACCEPT_EXT.test(name)) return true;
  return (
    type.includes('sheet') ||
    type.includes('excel') ||
    type === 'text/csv' ||
    type === 'application/vnd.ms-excel'
  );
};

const triggerBlobDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Fallback if the static template file is missing from public/. */
const downloadGeneratedEmployeeBulkUploadTemplate = () => {
  const employeesSheet = XLSX.utils.aoa_to_sheet([EMPLOYEE_BULK_UPLOAD_HEADERS]);
  employeesSheet['!cols'] = EMPLOYEE_BULK_UPLOAD_HEADERS.map((h) => ({
    wch: Math.min(36, Math.max(14, String(h).length + 2)),
  }));

  const instructionsSheet = XLSX.utils.aoa_to_sheet(
    EMPLOYEE_BULK_UPLOAD_INSTRUCTIONS.map((line) => [line]),
  );
  instructionsSheet['!cols'] = [{ wch: 92 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, employeesSheet, 'Employees');
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');
  XLSX.writeFile(workbook, EMPLOYEE_BULK_UPLOAD_TEMPLATE_FILENAME);
};

/** Download the official template from public/templates (copied from .cursor/rules/docs). */
export const downloadEmployeeBulkUploadTemplate = async () => {
  try {
    const response = await fetch(EMPLOYEE_BULK_UPLOAD_TEMPLATE_URL);
    if (!response.ok) {
      throw new Error(`Template HTTP ${response.status}`);
    }
    const blob = await response.blob();
    if (!blob || blob.size < 32) {
      throw new Error('Template file empty');
    }
    triggerBlobDownload(blob, EMPLOYEE_BULK_UPLOAD_TEMPLATE_FILENAME);
  } catch {
    downloadGeneratedEmployeeBulkUploadTemplate();
  }
};

const userFriendlyBulkError = (err) => {
  const status = err?.response?.status;
  if (status === 401 || status === 403) {
    return 'You do not have permission to bulk upload employees. Please log in again.';
  }
  if (status >= 500) {
    return 'Unable to upload the file right now. Please try again.';
  }
  const data = err?.response?.data;
  if (typeof data === 'string' && data && data.length < 240) return data;
  if (data?.detail && typeof data.detail === 'string' && data.detail.length < 240) {
    return data.detail;
  }
  if (data?.message && typeof data.message === 'string' && data.message.length < 240) {
    return data.message;
  }
  if (data?.file) {
    const fileErr = Array.isArray(data.file) ? data.file[0] : data.file;
    if (typeof fileErr === 'string' && fileErr) return fileErr;
  }
  if (data && typeof data === 'object') {
    const firstKey = Object.keys(data)[0];
    const firstVal = firstKey ? data[firstKey] : null;
    const msg = Array.isArray(firstVal) ? firstVal[0] : firstVal;
    if (typeof msg === 'string' && msg.length < 240) return msg;
  }
  return 'Bulk upload failed. Check the file and try again.';
};

export const uploadEmployeeBulkFile = async (file) => {
  const accessToken = localStorage.getItem('access_token');
  if (!accessToken) {
    throw new Error('Authorization token missing. Please log in again.');
  }
  if (!file) {
    throw new Error('Please choose an Excel file to upload.');
  }
  if (!isEmployeeBulkUploadFile(file)) {
    throw new Error('Please upload an Excel (.xlsx / .xls) or CSV file.');
  }

  const careBase = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '');
  if (!careBase) {
    throw new Error('Unable to upload right now. Please try again later.');
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await axios.post(`${careBase}${EMPLOYEE_BULK_UPLOAD_PATH}`, formData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data;
  } catch (err) {
    const friendly = new Error(userFriendlyBulkError(err));
    friendly.cause = err;
    throw friendly;
  }
};

export const summarizeEmployeeBulkUploadResult = (data) => {
  if (!data || typeof data !== 'object') {
    return 'Bulk upload completed successfully.';
  }
  if (typeof data.detail === 'string' && data.detail.trim()) return data.detail.trim();
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();

  const created = data.created ?? data.created_count ?? data.success_count;
  const updated = data.updated ?? data.updated_count;
  const failed = data.failed ?? data.failed_count ?? data.errors_count;
  const parts = [];
  if (created != null) parts.push(`${created} created`);
  if (updated != null) parts.push(`${updated} updated`);
  if (failed != null) parts.push(`${failed} failed`);
  if (parts.length) return `Bulk upload finished: ${parts.join(', ')}.`;
  return 'Bulk upload completed successfully.';
};
