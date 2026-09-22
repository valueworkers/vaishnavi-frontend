export const EMPLOYEE_CATEGORY_OPTIONS = [
  { value: 'REGULAR', label: 'Regular' },
  { value: 'FULLTIME', label: 'Fulltime' },
  { value: 'PARTTIME', label: 'Parttime' },
  { value: 'PPO', label: 'PPO' },
  { value: 'VENDOR', label: 'Vendor' },
];

export const getEmployeeCategoryLabel = (value) => {
  const key = String(value || '').trim().toUpperCase();
  if (!key) return '';
  return EMPLOYEE_CATEGORY_OPTIONS.find((opt) => opt.value === key)?.label || value;
};

/** UI status values for row status dropdown / create-edit (Terminate is Delete action). */
export const EMPLOYEE_PROFILE_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'ACTIVE' },
  { value: 'INACTIVE', label: 'INACTIVE' },
];

/** Column Status filter options (Active / Inactive / Terminated). */
export const EMPLOYEE_STATUS_FILTER_OPTIONS = [
  { value: 'ACTIVE', label: 'ACTIVE' },
  { value: 'INACTIVE', label: 'INACTIVE' },
  { value: 'TERMINATED', label: 'TERMINATED' },
];

/** @deprecated Prefer EMPLOYEE_STATUS_FILTER_OPTIONS for filters */
export const EMPLOYEE_STATUS_OPTIONS = EMPLOYEE_STATUS_FILTER_OPTIONS;

export const EMPLOYEE_REHIRED_STATUS_OPTIONS = [
  { value: 'YES', label: 'YES' },
  { value: 'NO', label: 'NO' },
];

const isTruthyFlag = (value) =>
  value === true || String(value).trim().toLowerCase() === 'true';

const isFalsyFlag = (value) =>
  value === false || String(value).trim().toLowerCase() === 'false';

/** Map API flags → ACTIVE | INACTIVE | TERMINATED (is_deleted wins). */
export const deriveEmployeeStatusFromFlags = (isActive, isDeleted) => {
  if (isTruthyFlag(isDeleted)) return 'TERMINATED';
  if (isFalsyFlag(isActive)) return 'INACTIVE';
  return 'ACTIVE';
};

/** Map UI status → PATCH/POST body (is_active only). */
export const buildEmployeeStatusApiFlags = (status) => {
  const key = String(status || '').trim().toUpperCase();
  return { is_active: key === 'ACTIVE' };
};

export const getEmployeeProfileStatusLabel = (value) => {
  const key = String(value || '').trim().toUpperCase();
  if (key === 'ACTIVE') return 'Active';
  if (key === 'INACTIVE') return 'Inactive';
  if (key === 'TERMINATED') return 'Terminated';
  if (!key) return '';
  return value;
};

export const getEmployeeRehiredLabel = (value) => {
  const key = String(value || '').trim().toUpperCase();
  if (key === 'YES' || key === 'TRUE') return 'Yes';
  if (key === 'NO' || key === 'FALSE') return 'No';
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (!key) return '';
  return value;
};

export const getEmployeeStatusLabel = (value) => {
  const profileLabel = getEmployeeProfileStatusLabel(value);
  if (profileLabel) return profileLabel;
  const key = String(value ?? '').trim().toLowerCase();
  if (key === 'true') return 'Active';
  if (key === 'false') return 'Inactive';
  return value ? String(value) : '';
};

export const EMPLOYEES_LIST_PATH = '/accounts/employees/';
export const EMPLOYEE_USER_TYPE_STAFF = 'VSRE_STAFF';
export const EMPLOYEE_USER_TYPE_MANAGER = 'VSRE_MANAGER';
export const EMPLOYEE_USER_TYPE_LINE_MANAGER = 'LINE_MANAGER';

export const EMPLOYEE_TYPE_OPTIONS = [
  { value: EMPLOYEE_USER_TYPE_STAFF, label: 'Staff' },
  { value: EMPLOYEE_USER_TYPE_MANAGER, label: 'Manager' },
];

/** user_type values allowed on create employee */
export const EMPLOYEE_CREATE_USER_TYPE_OPTIONS = [
  { value: EMPLOYEE_USER_TYPE_STAFF, label: 'VSRE_STAFF' },
  { value: EMPLOYEE_USER_TYPE_MANAGER, label: 'VSRE_MANAGER' },
  { value: EMPLOYEE_USER_TYPE_LINE_MANAGER, label: 'LINE_MANAGER' },
];

export const EMPLOYEE_NAME_ORDERING_OPTIONS = [
  { value: 'first_name', label: 'A to Z' },
  { value: '-first_name', label: 'Z to A' },
];

export const EMPLOYEE_PAGE_SIZE_OPTIONS = [
  { value: 20, label: '20' },
  { value: 40, label: '40' },
  { value: 60, label: '60' },
  { value: 100, label: '100' },
  { value: 'all', label: 'All' },
];

export const resolveEmployeePageSize = (selection, totalCount) => {
  if (selection === 'all') {
    return totalCount > 0 ? totalCount : 10000;
  }
  const n = Number(selection);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 20;
};

export const buildEmployeeListApiUrl = (
  listPath,
  href,
  searchQuery,
  category,
  status,
  userType,
  pageSize,
  ordering
) => {
  const careBase = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '');
  const path = listPath.startsWith('/') ? listPath : `/${listPath}`;
  let url = href || `${careBase}${path}`;
  if (href && !/^https?:\/\//i.test(href)) {
    url = `${careBase}${href.startsWith('/') ? href : `/${href}`}`;
  }

  const urlObj = new URL(url);
  const search = String(searchQuery || '').trim();
  if (search) urlObj.searchParams.set('search', search);
  else urlObj.searchParams.delete('search');

  const cat = String(category || '').trim();
  urlObj.searchParams.delete('category');
  if (cat) urlObj.searchParams.set('employee_profile__category', cat);
  else urlObj.searchParams.delete('employee_profile__category');

  urlObj.searchParams.delete('is_active');
  urlObj.searchParams.delete('is_deleted');
  urlObj.searchParams.delete('employee_profile__status');
  const statusKey = String(status ?? '').trim().toUpperCase();
  if (statusKey === 'TRUE' || statusKey === 'ACTIVE') {
    urlObj.searchParams.set('is_active', 'true');
  } else if (statusKey === 'FALSE' || statusKey === 'INACTIVE') {
    urlObj.searchParams.set('is_active', 'false');
    urlObj.searchParams.set('is_deleted', 'false');
  } else if (statusKey === 'TERMINATED') {
    urlObj.searchParams.set('is_deleted', 'true');
  }

  const type = String(userType || '').trim().toUpperCase();
  if (type) urlObj.searchParams.set('user_type', type);
  else urlObj.searchParams.delete('user_type');

  if (pageSize != null && pageSize !== '') {
    const size = Number(pageSize);
    if (Number.isFinite(size) && size > 0) {
      urlObj.searchParams.set('page_size', String(Math.floor(size)));
    }
  }

  const order = String(ordering || '').trim();
  if (order) urlObj.searchParams.set('ordering', order);
  else urlObj.searchParams.delete('ordering');

  return urlObj.toString();
};

/** Unified employees list (staff + managers). Optional userType / pageSize / ordering. */
export const buildEmployeesListUrl = (
  href,
  searchQuery,
  category,
  status,
  userType,
  pageSize,
  ordering
) =>
  buildEmployeeListApiUrl(
    EMPLOYEES_LIST_PATH,
    href,
    searchQuery,
    category,
    status,
    userType,
    pageSize,
    ordering
  );

/** @deprecated Use buildEmployeesListUrl — both roles now share /accounts/employees/ */
export const buildVsreStaffListUrl = (href, searchQuery, category, status) =>
  buildEmployeesListUrl(href, searchQuery, category, status, EMPLOYEE_USER_TYPE_STAFF);

/** @deprecated Use buildEmployeesListUrl — both roles now share /accounts/employees/ */
export const buildVsreManagerListUrl = (href, searchQuery, category, status) =>
  buildEmployeesListUrl(href, searchQuery, category, status, EMPLOYEE_USER_TYPE_MANAGER);

export const getEmployeeTypeLabel = (userType) => {
  const key = String(userType || '').trim().toUpperCase();
  if (key === 'VSRE_MANAGER') return 'Manager';
  if (key === 'LINE_MANAGER') return 'Line Manager';
  if (key === 'VSRE_STAFF') return 'Staff';
  if (!key) return '';
  return key.replace(/^VSRE_/, '').replace(/_/g, ' ');
};

/** Ensure a pagination/search URL targets /accounts/employees/ with the given user_type. */
export const ensureEmployeesListUrl = (urlOrHref, userType, searchQuery = '') => {
  const careBase = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '');
  let raw = String(urlOrHref || '').trim();
  if (!raw) {
    return buildEmployeesListUrl(null, searchQuery, '', '', userType);
  }
  if (!/^https?:\/\//i.test(raw)) {
    raw = `${careBase}${raw.startsWith('/') ? raw : `/${raw}`}`;
  }

  try {
    const urlObj = new URL(raw);
    if (urlObj.pathname.includes('/vsre-staff/') || urlObj.pathname.includes('/vsre-manager/')) {
      urlObj.pathname = '/accounts/employees/';
    }
    if (!urlObj.pathname.includes('/accounts/employees')) {
      urlObj.pathname = '/accounts/employees/';
    }
    const type = String(userType || '').trim().toUpperCase();
    if (type) urlObj.searchParams.set('user_type', type);
    const search = String(searchQuery || '').trim();
    if (search && !urlObj.searchParams.has('search')) {
      urlObj.searchParams.set('search', search);
    }
    return urlObj.toString();
  } catch {
    return buildEmployeesListUrl(null, searchQuery, '', '', userType);
  }
};
