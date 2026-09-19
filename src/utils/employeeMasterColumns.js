import {
  getEmployeeCategoryLabel,
  getEmployeeProfileStatusLabel,
  getEmployeeRehiredLabel,
  getEmployeeTypeLabel,
} from './employeeListQuery';

export const EMPLOYEE_MASTER_LS_ORDER = 'employeeMaster_columnOrder';
export const EMPLOYEE_MASTER_LS_VISIBILITY = 'employeeMaster_columnVisibility';

/** Always after checkbox: positions 2–4 (Status is fixed 4th). */
export const EMPLOYEE_FIXED_LEADING_IDS = ['name', 'employeeId', 'profileStatus'];

/** Always at the end. */
export const EMPLOYEE_FIXED_TRAILING_IDS = ['docs', 'actions'];

/** Chooser + drag-reorderable columns (everything else from API). */
export const EMPLOYEE_DRAG_COLUMN_IDS = [
  'userType',
  'email',
  'mobile',
  'alternatePhone',
  'emergencyContactName',
  'emergencyContactNumber',
  'age',
  'gender',
  'address',
  'city',
  'designation',
  'joiningDate',
  'lastWorkingDay',
  'terminationType',
  'terminationReason',
  'grade',
  'costCenter',
  'department',
  'permanentAddress',
  'currentAddress',
  'rehiredStatus',
  'vendorName',
  'vendorPhone',
  'orderTypes',
  'skills',
  'targetPercent',
  'qcRequired',
  'pfApplicable',
  'pfNumber',
  'uanNumber',
  'esiApplicable',
  'esiNumber',
  'esiDispensary',
  'shift',
  'shiftEffectiveFrom',
  'category',
  'reportsTo',
  'venues',
  'services',
  'resources',
  'firstName',
  'middleName',
  'lastName',
  'profilePic',
];

export const EMPLOYEE_COLUMN_LABELS = {
  name: 'Emp Name',
  employeeId: 'Emp. ID',
  profileStatus: 'Status',
  userType: 'Emp Role',
  email: 'Email',
  mobile: 'Phone',
  alternatePhone: 'Alt. Phone',
  emergencyContactName: 'Emergency Name',
  emergencyContactNumber: 'Emergency No.',
  age: 'Age',
  gender: 'Gender',
  address: 'Address',
  city: 'City',
  designation: 'Designation',
  joiningDate: 'DOJ',
  lastWorkingDay: 'LWD',
  terminationType: 'Termination Type',
  terminationReason: 'Termination Reason',
  grade: 'Grade',
  costCenter: 'Cost Center',
  department: 'Department',
  permanentAddress: 'Permanent Address',
  currentAddress: 'Current Address',
  rehiredStatus: 'Rehired',
  vendorName: 'Vendor Name',
  vendorPhone: 'Vendor Phone',
  orderTypes: 'Order Types',
  skills: 'Skills',
  targetPercent: 'Target %',
  qcRequired: 'QC Required',
  pfApplicable: 'PF Applicable',
  pfNumber: 'PF Number',
  uanNumber: 'UAN Number',
  esiApplicable: 'ESI Applicable',
  esiNumber: 'ESI Number',
  esiDispensary: 'ESI Dispensary',
  shift: 'Shift',
  shiftEffectiveFrom: 'Shift Effective From',
  category: 'Category',
  reportsTo: 'Reports To',
  venues: 'Venues',
  services: 'Services',
  resources: 'Resources',
  firstName: 'First Name',
  middleName: 'Middle Name',
  lastName: 'Last Name',
  profilePic: 'Photo',
  docs: 'Docs',
  actions: 'Actions',
};

export const reorderEmployeeColumns = (order, sourceId, targetId) => {
  if (!sourceId || !targetId || sourceId === targetId) return order;
  if (
    EMPLOYEE_FIXED_LEADING_IDS.includes(sourceId) ||
    EMPLOYEE_FIXED_LEADING_IDS.includes(targetId) ||
    EMPLOYEE_FIXED_TRAILING_IDS.includes(sourceId) ||
    EMPLOYEE_FIXED_TRAILING_IDS.includes(targetId)
  ) {
    return order;
  }
  const sourceIndex = order.indexOf(sourceId);
  const targetIndex = order.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return order;
  const updated = [...order];
  const [moved] = updated.splice(sourceIndex, 1);
  updated.splice(targetIndex, 0, moved);
  return updated;
};

const uniqueKeepKnown = (ids, known) => {
  const seen = new Set();
  const out = [];
  ids.forEach((id) => {
    if (!known.includes(id) || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  known.forEach((id) => {
    if (!seen.has(id)) out.push(id);
  });
  return out;
};

export const loadEmployeeColumnOrder = () => {
  try {
    const raw = localStorage.getItem(EMPLOYEE_MASTER_LS_ORDER);
    if (!raw) return [...EMPLOYEE_DRAG_COLUMN_IDS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...EMPLOYEE_DRAG_COLUMN_IDS];
    return uniqueKeepKnown(parsed, EMPLOYEE_DRAG_COLUMN_IDS);
  } catch {
    return [...EMPLOYEE_DRAG_COLUMN_IDS];
  }
};

export const loadEmployeeColumnVisibility = () => {
  const defaults = Object.fromEntries(EMPLOYEE_DRAG_COLUMN_IDS.map((id) => [id, true]));
  try {
    const raw = localStorage.getItem(EMPLOYEE_MASTER_LS_VISIBILITY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
};

export const formatRelatedList = (items) => {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items
    .map((item) => {
      if (item == null) return '';
      if (typeof item === 'string' || typeof item === 'number') return String(item);
      return item.name || item.title || item.label || item.code || item.id || '';
    })
    .filter(Boolean)
    .join(', ');
};

const formatSkillPriorityLabel = (priority) => {
  if (priority == null || priority === '') return '';
  const raw = String(priority).trim().toLowerCase();
  if (/^p[0-3]$/.test(raw)) return raw.toUpperCase();
  if (raw === 'high') return 'P1';
  if (raw === 'medium') return 'P2';
  if (raw === 'low') return 'P3';
  const numeric = Number(priority);
  if (Number.isFinite(numeric) && numeric >= 0) return `P${numeric}`;
  return '';
};

export const formatEmployeeSkillLines = (person) => {
  if (Array.isArray(person?.skills) && person.skills.length > 0) {
    return person.skills
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        const name = String(entry?.skill || '').trim();
        if (!name) return '';
        const priorityLabel = formatSkillPriorityLabel(entry?.priority);
        return priorityLabel ? `${name} (${priorityLabel})` : name;
      })
      .filter(Boolean);
  }

  const fallback = [];
  for (let n = 1; n <= 5; n += 1) {
    const name = String(person?.[`skill${n}`] || '').trim();
    if (!name) continue;
    const priorityLabel = formatSkillPriorityLabel(person?.[`skill${n}Priority`]);
    fallback.push(priorityLabel ? `${name} (${priorityLabel})` : name);
  }
  return fallback;
};

export const formatEmployeeSkillsText = (person) =>
  formatEmployeeSkillLines(person).join(', ');

export const formatShiftLabel = (person) => {
  const detail = person?.shiftDetail;
  if (detail && typeof detail === 'object') {
    return detail.name || detail.title || detail.code || (detail.id != null ? String(detail.id) : '');
  }
  if (person?.shiftId != null && person.shiftId !== '') return String(person.shiftId);
  return '';
};

export const getEmployeeCellText = (person, columnId) => {
  switch (columnId) {
    case 'name':
      return person?.name || '';
    case 'employeeId':
      return person?.employeeId || '';
    case 'userType':
      return getEmployeeTypeLabel(person?.userType) || person?.userType || '';
    case 'email':
      return person?.email || '';
    case 'mobile':
      return person?.mobile || person?.phone || '';
    case 'alternatePhone':
      return person?.alternatePhone || '';
    case 'emergencyContactName':
      return person?.emergencyContactName || '';
    case 'emergencyContactNumber':
      return person?.emergencyContactNumber || '';
    case 'age':
      return person?.age != null && person.age !== '' ? String(person.age) : '';
    case 'gender':
      return person?.empGender || '';
    case 'address':
      return person?.address || '';
    case 'city':
      return person?.empBaseLocation || '';
    case 'designation':
      return person?.designation || '';
    case 'joiningDate':
      return person?.joiningDate || '';
    case 'lastWorkingDay':
      return person?.lastWorkingDay || '';
    case 'terminationType':
      return person?.terminationType || '';
    case 'terminationReason':
      return person?.terminationReason || '';
    case 'profileStatus':
      return getEmployeeProfileStatusLabel(person?.profileStatus) || person?.profileStatus || '';
    case 'grade':
      return person?.grade || '';
    case 'costCenter':
      return person?.costCenter || '';
    case 'department':
      return person?.workDepartment || '';
    case 'permanentAddress':
      return person?.permanentAddress || '';
    case 'currentAddress':
      return person?.currentAddress || '';
    case 'rehiredStatus':
      return getEmployeeRehiredLabel(person?.rehiredStatus) || '';
    case 'vendorName':
      return person?.vendorName || '';
    case 'vendorPhone':
      return person?.vendorPhone || '';
    case 'orderTypes':
      return person?.orderTypes || '';
    case 'skills':
      return formatEmployeeSkillsText(person);
    case 'targetPercent':
      return person?.targetPercent != null && person.targetPercent !== ''
        ? String(person.targetPercent)
        : '';
    case 'qcRequired':
      return person?.qcRequired ? 'Yes' : 'No';
    case 'pfApplicable':
      return person?.pfApplicable ? 'Yes' : 'No';
    case 'pfNumber':
      return person?.pfNumber || '';
    case 'uanNumber':
      return person?.uanNumber || '';
    case 'esiApplicable':
      return person?.esiApplicable ? 'Yes' : 'No';
    case 'esiNumber':
      return person?.esiNumber || '';
    case 'esiDispensary':
      return person?.esiDispensary || '';
    case 'shift':
      return formatShiftLabel(person);
    case 'shiftEffectiveFrom':
      return person?.shiftEffectiveFrom || '';
    case 'category':
      return getEmployeeCategoryLabel(person?.empCategory) || person?.empCategory || '';
    case 'reportsTo':
      return person?.assignedManager || '';
    case 'venues':
      return formatRelatedList(person?.venuesDetailed || person?.assignedVenuesDetailed);
    case 'services':
      return formatRelatedList(person?.services);
    case 'resources':
      return formatRelatedList(person?.resources);
    case 'firstName':
      return person?.firstName || '';
    case 'middleName':
      return person?.middleName || '';
    case 'lastName':
      return person?.lastName || '';
    case 'profilePic':
      return person?.photo && !String(person.photo).includes('unsplash') ? 'Yes' : '';
    default:
      return '';
  }
};

export const buildEmployeeVisibleColumnIds = (dragOrder, visibility) => {
  const middle = dragOrder.filter((id) => visibility[id] !== false);
  return [...EMPLOYEE_FIXED_LEADING_IDS, ...middle, ...EMPLOYEE_FIXED_TRAILING_IDS];
};
