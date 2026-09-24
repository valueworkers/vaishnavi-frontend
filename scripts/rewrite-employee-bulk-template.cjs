const XLSX = require('xlsx');
const path = require('path');

const headers = [
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

const instructions = [
  ['How to use this template'],
  [''],
  ["• Leave 'Action' blank to auto-detect Create vs Update from Mobile Number / Employee ID."],
  ['• Fields marked with * are required when creating a new employee.'],
  ['• Hover over a column header to see its format / allowed values.'],
  ["• Leave 'Employee ID' blank when creating — it is generated automatically."],
  ['• Max 2000 rows per upload.'],
  ["• 'Category', 'User Type' and 'Gender' must exactly match the choice values your models define."],
  [
    "• 'termination_type', 'termination_reason', 'last_working_day' and 'rehired_status' are excluded — use terminate / termination_revoke flows only.",
  ],
  [''],
  ['Boolean fields (API payload: true / false)'],
  ['• Columns: Qc Required (TRUE/FALSE), Pf Applicable (TRUE/FALSE), Esi Applicable (TRUE/FALSE).'],
  ['• Enter exactly TRUE or FALSE (uppercase). These map to JSON booleans true / false.'],
  ['• Do not use Yes/No or 1/0.'],
  [''],
  ['Skills (API payload: array of objects)'],
  ['• API skills shape:'],
  ['  [{"skill":"Nursing","priority":0,"experience":"2 years"},{"skill":"First Aid","priority":1,"experience":"1 year"}]'],
  ['• Put that JSON array in the Skills column (one cell per employee row).'],
  ['• Each object needs skill (required). priority is a number (0–3 typical). experience is text.'],
  ['• Comma-separated skill names alone are only OK if your backend accepts that shorthand — prefer the JSON object array.'],
  [''],
  ['Other notes'],
  ['• Order Types: comma-separated values.'],
  ['• Date Joined / Shift Effective From: YYYY-MM-DD.'],
];

const employeesSheet = XLSX.utils.aoa_to_sheet([headers]);
employeesSheet['!cols'] = headers.map((h) => ({
  wch: Math.min(36, Math.max(12, String(h).length + 2)),
}));

const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
instructionsSheet['!cols'] = [{ wch: 110 }];

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, employeesSheet, 'Employees');
XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');

const root = path.resolve(__dirname, '..');
const targets = [
  path.join(root, '.cursor', 'rules', 'docs', 'employee_bulk_upload_template.xlsx'),
  path.join(root, 'public', 'templates', 'employee_bulk_upload_template.xlsx'),
];

for (const target of targets) {
  XLSX.writeFile(workbook, target);
  console.log('wrote', target);
}

const check = XLSX.readFile(targets[0]);
const rows = XLSX.utils.sheet_to_json(check.Sheets.Employees, { header: 1, defval: '' });
console.log('Employees rows:', rows.length, 'cols:', rows[0]?.length);
