import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { FiAlertTriangle, FiX } from 'react-icons/fi';
import AlertModal from '../AlertModal';
import { compressFileForUpload } from '../../utils/compressUploadFiles';
import { canManageStaff as userCanManageStaff } from '../../utils/authRoles';
import {
  buildEmployeeExportSubtitle,
  employeeToExportRow,
  exportEmployeeListExcel,
  exportEmployeeListPdf,
} from '../../utils/employeeListExport';
import {
  buildEmployeeVisibleColumnIds,
  EMPLOYEE_COLUMN_LABELS,
  EMPLOYEE_DRAG_COLUMN_IDS,
  EMPLOYEE_FIXED_LEADING_IDS,
  EMPLOYEE_FIXED_TRAILING_IDS,
  EMPLOYEE_MASTER_LS_ORDER,
  EMPLOYEE_MASTER_LS_VISIBILITY,
  getEmployeeCellText,
  formatEmployeeSkillLines,
  loadEmployeeColumnOrder,
  loadEmployeeColumnVisibility,
  reorderEmployeeColumns,
} from '../../utils/employeeMasterColumns';
import {
  buildEmployeeStatusApiFlags,
  buildEmployeesListUrl,
  deriveEmployeeStatusFromFlags,
  EMPLOYEE_PAGE_SIZE_OPTIONS,
  getEmployeeCategoryLabel,
  getEmployeeStatusLabel,
  getEmployeeTypeLabel,
  resolveEmployeePageSize,
} from '../../utils/employeeListQuery';
import EmployeeCategoryFilterButton from './EmployeeCategoryFilterButton';
import EmployeeStatusFilterButton from './EmployeeStatusFilterButton';
import EmployeeTypeFilterButton from './EmployeeTypeFilterButton';
import EmployeeNameSortButton from './EmployeeNameSortButton';
import EmployeeProfileStatusSelect from './EmployeeProfileStatusSelect';
import EmployeeShiftsPanel from './EmployeeShiftsPanel';
import AddEmployeeForm from './AddEmployeeForm';
import AddEmployeeDocumentsStep from './AddEmployeeDocumentsStep';
import EmployeeBulkUploadModal from './EmployeeBulkUploadModal';

const DEFAULT_STAFF_PHOTO = 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8cHJvZmlsZXxlbnwwfHwwfHx8MA%3D%3D';

const GENDER_LABEL_TO_CODE = {
  Male: 'M',
  Female: 'F',
  Other: 'O',
  'Prefer not to say': 'N',
};

const GENDER_CODE_TO_LABEL = {
  M: 'Male',
  F: 'Female',
  O: 'Other',
  N: 'Prefer not to say',
};

const PRIORITY_LABEL_TO_NUMBER = {
  p0: 0,
  p1: 1,
  p2: 2,
  p3: 3,
  High: 1,
  Medium: 2,
  Low: 3,
};

const priorityNumberToLabel = (value) => {
  if (value === 0 || value === '0' || String(value).toLowerCase() === 'p0') return 'p0';
  if (value === 1 || value === '1' || String(value).toLowerCase() === 'p1') return 'p1';
  if (value === 2 || value === '2' || String(value).toLowerCase() === 'p2') return 'p2';
  if (value === 3 || value === '3' || String(value).toLowerCase() === 'p3') return 'p3';
  if (value === 'High') return 'p1';
  if (value === 'Medium') return 'p2';
  if (value === 'Low') return 'p3';
  return '';
};

const mapGenderCodeToLabel = (value) => {
  if (!value) return '';
  const upperValue = String(value).toUpperCase();
  return GENDER_CODE_TO_LABEL[upperValue] || value;
};

const mapGenderLabelToCode = (label) => {
  if (!label) return 'N';
  const normalized = label.trim();
  if (GENDER_LABEL_TO_CODE[normalized]) {
    return GENDER_LABEL_TO_CODE[normalized];
  }

  const upper = normalized.toUpperCase();
  if (upper === 'MALE' || upper === 'M') return 'M';
  if (upper === 'FEMALE' || upper === 'F') return 'F';
  if (upper === 'OTHER' || upper === 'OTHERS' || upper === 'O') return 'O';
  if (upper === 'NOT TO PREFER' || upper === 'PREFER NOT TO SAY' || upper === 'NOT TO SAY' || upper === 'N') return 'N';
  return 'N';
};

const priorityLabelToNumber = (label, fallback) => {
  if (label == null || label === '') return fallback;
  const raw = String(label).trim();
  const lower = raw.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(PRIORITY_LABEL_TO_NUMBER, raw)) {
    return PRIORITY_LABEL_TO_NUMBER[raw];
  }
  if (Object.prototype.hasOwnProperty.call(PRIORITY_LABEL_TO_NUMBER, lower)) {
    return PRIORITY_LABEL_TO_NUMBER[lower];
  }
  const numericValue = parseInt(raw, 10);
  return Number.isNaN(numericValue) ? fallback : numericValue;
};

const extractApiArray = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.data?.results)) return payload.data.results;
  return [];
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getEmptyEmployeeForm = () => ({
  firstName: '',
  middleName: '',
  lastName: '',
  address: '',
  mobile: '',
  alternatePhone: '',
  email: '',
  emergencyContactName: '',
  emergencyContactNumber: '',
  age: '',
  reportingManagerId: '',
  joiningDate: '',
  empLevel: '',
  empBaseLocation: '',
  empCategory: '',
  workDepartment: '',
  empGender: '',
  userType: '',
  empActive: true,
  profileStatus: 'ACTIVE',
  lastWorkingDay: '',
  employeeId: '',
  designation: '',
  grade: '',
  costCenter: '',
  permanentAddress: '',
  currentAddress: '',
  rehiredStatus: 'NO',
  vendorName: '',
  vendorPhone: '',
  orderTypes: '',
  targetPercent: '',
  qcRequired: false,
  pfApplicable: false,
  pfNumber: '',
  uanNumber: '',
  esiApplicable: false,
  esiNumber: '',
  esiDispensary: '',
  shiftId: '',
  shiftEffectiveFrom: '',
  skillSlotCount: 1,
  skill1ServiceId: '',
  skill1: '',
  skill1Priority: '',
  skill1Experience: '',
  skill2ServiceId: '',
  skill2: '',
  skill2Priority: '',
  skill2Experience: '',
  skill3ServiceId: '',
  skill3: '',
  skill3Priority: '',
  skill3Experience: '',
  skill4ServiceId: '',
  skill4: '',
  skill4Priority: '',
  skill4Experience: '',
  skill5ServiceId: '',
  skill5: '',
  skill5Priority: '',
  skill5Experience: '',
  photo: null,
  password: '',
  confirmPassword: '',
  verified_document: null,
});

const mapSkillsArrayToFormFields = (skills) => {
  const list = Array.isArray(skills) ? skills : [];
  const normalized = list
    .map((item, index) => {
      if (typeof item === 'string') {
        return { skill: item.trim(), priority: index, experience: '' };
      }
      return {
        skill: item?.skill?.trim() || '',
        priority: priorityLabelToNumber(item?.priority, index),
        experience: item?.experience?.trim() || '',
      };
    })
    .filter((item) => item.skill)
    .slice(0, 5);
  const slots = [...normalized, {}, {}, {}, {}, {}].slice(0, 5);
  const fields = { skillSlotCount: Math.max(1, normalized.length) };
  slots.forEach((entry, index) => {
    const n = index + 1;
    fields[`skill${n}ServiceId`] = '';
    fields[`skill${n}`] = entry.skill || '';
    fields[`skill${n}Priority`] = priorityNumberToLabel(entry.priority) || '';
    fields[`skill${n}Experience`] = entry.experience || '';
  });
  return fields;
};

const mapEmployeeApiToForm = (data) => {
  const empty = getEmptyEmployeeForm();
  if (!data) return empty;
  const profile =
    data.employee_profile && typeof data.employee_profile === 'object'
      ? data.employee_profile
      : {};
  const reportingManagerId =
    data.reports_to?.id ||
    data.reporting_manager_id ||
    data.reportingManagerId ||
    '';
  const profileStatus = deriveEmployeeStatusFromFlags(data.is_active, data.is_deleted);
  const rehiredRaw = profile.rehired_status;
  let rehiredStatus = 'NO';
  if (rehiredRaw === true || String(rehiredRaw).toUpperCase() === 'YES' || String(rehiredRaw).toUpperCase() === 'TRUE') {
    rehiredStatus = 'YES';
  } else if (
    rehiredRaw === false ||
    String(rehiredRaw).toUpperCase() === 'NO' ||
    String(rehiredRaw).toUpperCase() === 'FALSE'
  ) {
    rehiredStatus = 'NO';
  }

  const shiftId =
    profile.shift ??
    profile.shift_detail?.id ??
    profile.shift_id ??
    '';

  return {
    ...empty,
    firstName: data.first_name || '',
    middleName: data.middle_name || '',
    lastName: data.last_name || '',
    address: data.address || profile.current_address || profile.permanent_address || '',
    mobile: String(data.mobile_number || data.phone || '').replace(/\D/g, '').slice(0, 10),
    alternatePhone: String(data.alternate_phone_number || '').replace(/\D/g, '').slice(0, 10),
    email: data.email || '',
    emergencyContactName: data.emergency_contact_name || '',
    emergencyContactNumber: String(
      data.emergency_contact_number || data.emergency_contact || ''
    )
      .replace(/\D/g, '')
      .slice(0, 10),
    age: data.age != null && data.age !== '' ? String(data.age) : '',
    reportingManagerId: reportingManagerId ? String(reportingManagerId) : '',
    joiningDate: profile.date_joined || data.date_joined || '',
    empBaseLocation: data.city || '',
    empCategory: profile.category || data.category || '',
    workDepartment: profile.department || data.department || '',
    empGender: mapGenderCodeToLabel(data.gender) || '',
    userType: data.user_type || '',
    empActive: profileStatus === 'ACTIVE',
    profileStatus,
    lastWorkingDay: profile.last_working_day || data.last_working_day || '',
    employeeId: profile.employee_id || data.employee_id || '',
    designation: profile.designation || '',
    grade: profile.grade || '',
    costCenter: profile.cost_center || '',
    permanentAddress: profile.permanent_address || '',
    currentAddress: profile.current_address || '',
    rehiredStatus,
    vendorName: profile.vendor_name || '',
    vendorPhone: profile.vendor_phone || '',
    orderTypes: profile.order_types != null ? String(profile.order_types) : '',
    targetPercent:
      profile.target_percent != null && profile.target_percent !== ''
        ? String(profile.target_percent)
        : '',
    qcRequired: Boolean(profile.qc_required),
    pfApplicable: Boolean(profile.pf_applicable),
    pfNumber: profile.pf_number || '',
    uanNumber: profile.uan_number || '',
    esiApplicable: Boolean(profile.esi_applicable),
    esiNumber: profile.esi_number || '',
    esiDispensary: profile.esi_dispensary || '',
    shiftId: shiftId !== null && shiftId !== undefined ? String(shiftId) : '',
    shiftEffectiveFrom: profile.shift_effective_from || '',
    ...mapSkillsArrayToFormFields(profile.skills ?? data.skills),
    photo: null,
    password: '',
    confirmPassword: '',
    verified_document: null,
  };
};

const validateAddStaffForm = (formState, options = {}) => {
  const { requirePassword = true } = options;
  const firstName = formState.firstName?.trim();
  if (!firstName) return 'First Name is required.';

  const lastName = formState.lastName?.trim();
  if (!lastName) return 'Last Name is required.';

  const email = formState.email?.trim();
  if (email && !EMAIL_REGEX.test(email)) return 'Please enter a valid email address.';

  const mobile = formState.mobile?.trim();
  if (!mobile) return 'Mobile number is required.';
  const mobileDigits = mobile.replace(/\D/g, '');
  if (mobileDigits.length !== 10) return 'Mobile number must be exactly 10 digits.';

  const alternateDigits = String(formState.alternatePhone || '').replace(/\D/g, '');
  if (alternateDigits && alternateDigits.length !== 10) {
    return 'Alternate phone number must be exactly 10 digits.';
  }

  const emergencyDigits = String(formState.emergencyContactNumber || '').replace(/\D/g, '');
  if (emergencyDigits && emergencyDigits.length !== 10) {
    return 'Emergency contact number must be exactly 10 digits.';
  }

  const password = formState.password || '';
  const confirmPassword = formState.confirmPassword || '';
  if (requirePassword) {
    if (!password) return 'Password is required.';
    if (password.length < 6) return 'Password must be at least 6 characters long.';
    if (!confirmPassword) return 'Confirm Password is required.';
    if (password !== confirmPassword) return 'Password and Confirm Password must match.';
  } else if (password || confirmPassword) {
    if (password.length < 6) return 'Password must be at least 6 characters long.';
    if (password !== confirmPassword) return 'Password and Confirm Password must match.';
  }

  const baseCity = formState.empBaseLocation?.trim();
  if (!baseCity) return 'Base Location (city) is required.';

  const address = formState.address?.trim();
  if (!address) return 'Address is required.';

  const gender = formState.empGender?.trim();
  if (!gender) return 'Gender is required.';

  if (!formState.empCategory) return 'Please select an employee category.';
  if (!formState.profileStatus) return 'Please select employee status.';
  if (!formState.userType) return 'Please select a user roll.';

  if (formState.empCategory === 'VENDOR') {
    if (!String(formState.vendorName || '').trim()) return 'Vendor name is required for Vendor category.';
    const vendorDigits = String(formState.vendorPhone || '').replace(/\D/g, '');
    if (vendorDigits.length !== 10) return 'Vendor phone must be exactly 10 digits.';
  }

  if (formState.pfApplicable) {
    if (!String(formState.pfNumber || '').trim()) return 'PF number is required when PF is applicable.';
    if (!String(formState.uanNumber || '').trim()) return 'UAN number is required when PF is applicable.';
  }
  if (formState.esiApplicable) {
    if (!String(formState.esiNumber || '').trim()) return 'ESI number is required when ESI is applicable.';
  }

  return null;
};

const extractApiErrorMessage = (payload, fallbackMessage, statusCode = null) => {
  // Handle 500 Internal Server Error with meaningful message
  if (statusCode === 500) {
    return 'An internal server error occurred. Please try again later or contact support if the problem persists.';
  }

  if (!payload) return fallbackMessage;
  if (typeof payload === 'string') return payload;
  if (typeof payload.detail === 'string') return payload.detail;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.error === 'string') return payload.error;

  if (typeof payload === 'object') {
    for (const [key, value] of Object.entries(payload)) {
      if (Array.isArray(value) && value.length > 0) {
        return `${key}: ${value[0]}`;
      }
      if (typeof value === 'string') {
        return `${key}: ${value}`;
      }
      if (value && typeof value === 'object') {
        const nested = extractApiErrorMessage(value, null);
        if (nested) return nested;
      }
    }
  }

  return fallbackMessage;
};

const STAFF_ASSIGNMENTS_KEY = 'staffAssignments';
const STAFF_DOCUMENT_MAX_UPLOAD_MB = 5;
const STAFF_DOCUMENT_ACCEPT =
  'image/*,.pdf,.doc,.docx,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const inferDocMimeTypeFromName = (nameOrUrl) => {
  const value = String(nameOrUrl || '').toLowerCase();
  if (value.endsWith('.pdf')) return 'application/pdf';
  if (value.endsWith('.png')) return 'image/png';
  if (value.endsWith('.jpg') || value.endsWith('.jpeg')) return 'image/jpeg';
  if (value.endsWith('.gif')) return 'image/gif';
  if (value.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
};

const extractFileNameFromUrl = (url) => {
  const value = String(url || '');
  if (!value) return '';
  const cleaned = value.split('?')[0];
  const lastSegment = cleaned.split('/').pop() || '';
  try {
    return decodeURIComponent(lastSegment);
  } catch (_error) {
    return lastSegment;
  }
};

const normalizeApiStaffDocEntry = (entry, index) => {
  if (!entry || typeof entry !== 'object') return null;
  const documentId = entry.id || entry.document || entry.document_id || entry.parent_document_id || null;
  const sourceFiles = Array.isArray(entry.files) && entry.files.length > 0 ? entry.files : [entry];

  const normalizedFiles = sourceFiles
    .map((fileEntry, fileIndex) => {
      const rawUrl =
        fileEntry?.file ||
        fileEntry?.file_url ||
        fileEntry?.url ||
        fileEntry?.document_url ||
        fileEntry?.document ||
        '';
      if (!rawUrl) return null;

      const fileName =
        fileEntry?.file_name ||
        fileEntry?.filename ||
        fileEntry?.document_name ||
        fileEntry?.name ||
        extractFileNameFromUrl(rawUrl) ||
        `file-${fileIndex + 1}`;

      return {
        id: String(fileEntry?.id || `${documentId || `doc-${index}`}-${fileIndex}`),
        fileName,
        mimeType:
          fileEntry?.mime_type ||
          fileEntry?.content_type ||
          fileEntry?.file_type ||
          inferDocMimeTypeFromName(rawUrl || fileName),
        url: rawUrl,
        uploadedAt: fileEntry?.uploaded_at || fileEntry?.created_at || fileEntry?.updated_at || '',
      };
    })
    .filter(Boolean);

  if (!normalizedFiles.length) return null;

  return {
    id: String(documentId || `doc-${index}`),
    documentId: documentId || null,
    title: entry.title || entry.name || `Document ${index + 1}`,
    remarks: entry.remarks || '',
    uploadedAt: entry.created_at || entry.updated_at || normalizedFiles[0]?.uploadedAt || '',
    files: normalizedFiles,
    fileCount: normalizedFiles.length,
  };
};


const ASSIGNMENT_OPTIONS = [
  { key: 'venues', label: 'Venues', description: 'Allocate venues to staff' },
  { key: 'services', label: 'Services', description: 'Assign service resources' },
  { key: 'resources', label: 'Resources', description: 'Map resource ownership' },
];

const getStoredStaffAssignments = () => {
  try {
    const raw = localStorage.getItem(STAFF_ASSIGNMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('Error parsing staff assignments from localStorage:', error);
    return {};
  }
};

const setStoredStaffAssignments = (assignments) => {
  try {
    localStorage.setItem(STAFF_ASSIGNMENTS_KEY, JSON.stringify(assignments));
  } catch (error) {
    console.error('Error saving staff assignments to localStorage:', error);
  }
};

const StaffDashboard = () => {
  const [authUser, setAuthUser] = useState(null);
  const [activeTab, setActiveTab] = useState('my'); // my | add | shifts
  const [staff, setStaff] = useState([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [isExportingStaff, setIsExportingStaff] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [alertState, setAlertState] = useState({ open: false, type: 'info', message: '' });
  const [terminateConfirm, setTerminateConfirm] = useState({
    open: false,
    id: null,
    name: '',
    reason: '',
    lastWorkingDay: '',
    loading: false,
    loadingType: null,
    fieldError: '',
  });
  const showAlert = useCallback((message, type = 'info') => {
    setAlertState({ open: true, type, message: String(message) });
  }, []);
  const closeAlert = useCallback(() => setAlertState(prev => ({ ...prev, open: false })), []);
  const getEmptyTerminateConfirm = useCallback(
    () => ({
      open: false,
      id: null,
      name: '',
      reason: '',
      lastWorkingDay: '',
      loading: false,
      loadingType: null,
      fieldError: '',
    }),
    [],
  );
  const closeTerminateConfirm = useCallback(() => {
    setTerminateConfirm((prev) => (prev.loading ? prev : getEmptyTerminateConfirm()));
  }, [getEmptyTerminateConfirm]);
  const [form, setForm] = useState(() => getEmptyEmployeeForm());
  const [showAssignVenueModal, setShowAssignVenueModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignReportingManagerModal, setShowAssignReportingManagerModal] = useState(false);
  const [showVenuesListModal, setShowVenuesListModal] = useState(false);
  const [selectedStaffForVenue, setSelectedStaffForVenue] = useState(null);
  const [selectedStaffForEdit, setSelectedStaffForEdit] = useState(null);
  const [selectedStaffForVenuesList, setSelectedStaffForVenuesList] = useState(null);
  const [newlyCreatedStaff, setNewlyCreatedStaff] = useState(null);
  const [addEmployeeStep, setAddEmployeeStep] = useState(1);
  const [pendingAssignManagerAfterDocs, setPendingAssignManagerAfterDocs] = useState(false);
  const [selectedReportingManagerId, setSelectedReportingManagerId] = useState('');
  const [selectedVenueIds, setSelectedVenueIds] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdatingStaff, setIsUpdatingStaff] = useState(false);
  const [isLoadingStaffDetails, setIsLoadingStaffDetails] = useState(false);
  const [formFeedback, setFormFeedback] = useState({ type: null, message: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const employeeTableScrollRef = useRef(null);
  const columnChooserRef = useRef(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState('');
  const [nameOrdering, setNameOrdering] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [columnOrder, setColumnOrder] = useState(() => loadEmployeeColumnOrder());
  const [columnVisibility, setColumnVisibility] = useState(() => loadEmployeeColumnVisibility());
  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const [dragColId, setDragColId] = useState(null);
  const totalCountRef = useRef(0);
  const [togglingStaffStatusId, setTogglingStaffStatusId] = useState(null);
  const [assignableParents, setAssignableParents] = useState([]);
  const [isLoadingAssignableParents, setIsLoadingAssignableParents] = useState(false);
  const [isAssigningReportingManager, setIsAssigningReportingManager] = useState(false);
  const [nextUrl, setNextUrl] = useState(null);
  const [previousUrl, setPreviousUrl] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedStaffIds, setSelectedStaffIds] = useState([]);
  const [isRevokingTermination, setIsRevokingTermination] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState({
    open: false,
    id: null,
    name: '',
    rehiredStatus: false,
  });
  const [assignActionModalStaff, setAssignActionModalStaff] = useState(null);
  const [assignStaffIds, setAssignStaffIds] = useState([]);
  const [assignModalStep, setAssignModalStep] = useState('options');
  const [selectedAssignCategory, setSelectedAssignCategory] = useState(null);
  const [assignableEntities, setAssignableEntities] = useState([]);
  const [assignableEntitiesError, setAssignableEntitiesError] = useState('');
  const [selectedAssignableEntityId, setSelectedAssignableEntityId] = useState('');
  const [isLoadingAssignableEntities, setIsLoadingAssignableEntities] = useState(false);
  const [isAssigningEntity, setIsAssigningEntity] = useState(false);
  const [staffDocAddTarget, setStaffDocAddTarget] = useState(null);
  const [staffDocAddFiles, setStaffDocAddFiles] = useState([]);
  const [staffDocEditTarget, setStaffDocEditTarget] = useState(null);
  const [staffDocTitle, setStaffDocTitle] = useState('');
  const [staffDocRemarks, setStaffDocRemarks] = useState('');
  const [staffDocAddCompressing, setStaffDocAddCompressing] = useState(false);
  const [staffApiDocsByUser, setStaffApiDocsByUser] = useState({});
  const [isLoadingStaffDocuments, setIsLoadingStaffDocuments] = useState(false);
  const [staffDocSaving, setStaffDocSaving] = useState(false);
  const [staffDocViewTarget, setStaffDocViewTarget] = useState(null);
  const [staffDocSelectedId, setStaffDocSelectedId] = useState(null);
  const [staffDocSelectedFileId, setStaffDocSelectedFileId] = useState(null);
  const [staffDocViewDeleting, setStaffDocViewDeleting] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  
  // Get venues from Redux store
  const venues = useSelector(state => state.venues.venues || []);
  const effectiveVenues = venues;

  const buildSkillsPayloadFromForm = (formState) => {
    const slotCount = Math.min(5, Math.max(1, Number(formState.skillSlotCount) || 1));
    const skillEntries = [];
    for (let n = 1; n <= slotCount; n += 1) {
      skillEntries.push({
        skill: formState[`skill${n}`]?.trim(),
        priorityLabel: formState[`skill${n}Priority`],
        experience: formState[`skill${n}Experience`]?.trim(),
      });
    }

    return skillEntries
      .map((entry, index) => ({
        skill: entry.skill,
        priority: priorityLabelToNumber(entry.priorityLabel, index),
        experience: entry.experience || '',
      }))
      .filter((entry) => entry.skill);
  };

  const buildEmployeeCreatePayload = (formState, options = {}) => {
    const { omitEmptyPassword = false } = options;
    const skills = buildSkillsPayloadFromForm(formState);
    const ageRaw = String(formState.age ?? '').trim();
    const ageNum = ageRaw === '' ? null : Number(ageRaw);
    const targetRaw = String(formState.targetPercent ?? '').trim();
    const targetNum = targetRaw === '' ? null : Number(targetRaw);
    const rehired =
      formState.rehiredStatus === 'YES' || formState.rehiredStatus === 'NO'
        ? formState.rehiredStatus
        : 'NO';
    const profileStatus = formState.profileStatus || 'ACTIVE';
    const statusFlags = buildEmployeeStatusApiFlags(profileStatus);
    const isVendor = formState.empCategory === 'VENDOR';
    const isParttime = formState.empCategory === 'PARTTIME';
    const shiftIdRaw = String(formState.shiftId || '').trim();
    const shiftId = shiftIdRaw === '' ? null : Number(shiftIdRaw);

    const employeeProfile = {
      employee_id: formState.employeeId?.trim() || '',
      category: formState.empCategory?.trim() || null,
      designation: formState.designation?.trim() || '',
      grade: formState.grade?.trim() || '',
      cost_center: formState.costCenter?.trim() || '',
      department: formState.workDepartment?.trim() || '',
      permanent_address: formState.permanentAddress?.trim() || '',
      current_address: formState.currentAddress?.trim() || '',
      rehired_status: rehired,
      vendor_name: isVendor ? formState.vendorName?.trim() || '' : '',
      vendor_phone: isVendor ? formState.vendorPhone?.trim() || '' : '',
      date_joined: formState.joiningDate || null,
      last_working_day: formState.lastWorkingDay || null,
      order_types: formState.orderTypes?.trim() || null,
      skills: skills.length ? skills : null,
      target_percent: Number.isFinite(targetNum) ? targetNum : null,
      qc_required: Boolean(formState.qcRequired),
      pf_applicable: Boolean(formState.pfApplicable),
      pf_number: formState.pfApplicable ? formState.pfNumber?.trim() || '' : '',
      uan_number: formState.pfApplicable ? formState.uanNumber?.trim() || '' : '',
      esi_applicable: Boolean(formState.esiApplicable),
      esi_number: formState.esiApplicable ? formState.esiNumber?.trim() || '' : '',
      esi_dispensary: formState.esiApplicable ? formState.esiDispensary?.trim() || '' : '',
      shift: isParttime && Number.isFinite(shiftId) ? shiftId : null,
      shift_effective_from: isParttime ? formState.shiftEffectiveFrom || null : null,
    };

    const payload = {
      profile_pic: null,
      first_name: formState.firstName.trim(),
      middle_name: formState.middleName?.trim() || '',
      last_name: formState.lastName.trim(),
      email: formState.email?.trim() || '',
      mobile_number: formState.mobile.trim(),
      alternate_phone_number: formState.alternatePhone?.trim() || '',
      emergency_contact_name: formState.emergencyContactName?.trim() || '',
      emergency_contact_number: formState.emergencyContactNumber?.trim() || '',
      age: Number.isFinite(ageNum) ? ageNum : null,
      gender: mapGenderLabelToCode(formState.empGender) || null,
      address: formState.address.trim(),
      city: formState.empBaseLocation?.trim() || '',
      date_joined: formState.joiningDate || null,
      is_active: statusFlags.is_active,
      user_type: formState.userType || null,
      employee_profile: employeeProfile,
    };

    const hasPassword = Boolean(formState.password);
    if (!omitEmptyPassword || hasPassword) {
      payload.password = formState.password;
      payload.confirm_password = formState.confirmPassword;
    }

    if (formState.photo instanceof File && formState.photo.type.startsWith('image/')) {
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (key === 'employee_profile') {
          formData.append('employee_profile', JSON.stringify(value));
        } else if (key === 'profile_pic') {
          // set below as file
        } else if (value === null || value === undefined) {
          formData.append(key, '');
        } else if (typeof value === 'boolean') {
          formData.append(key, String(value));
        } else {
          formData.append(key, String(value));
        }
      });
      formData.append('profile_pic', formState.photo);
      if (formState.verified_document instanceof File) {
        formData.append('verified_document', formState.verified_document);
      }
      return formData;
    }

    return payload;
  };

  const normalizeSkillsFromApi = (skills) => {
    if (!Array.isArray(skills)) return [];
    return skills
      .map((item, index) => {
        if (typeof item === 'string') {
          return {
            skill: item.trim(),
            priority: index,
            experience: '',
          };
        }

        return {
          skill: item?.skill?.trim() || '',
          priority: priorityLabelToNumber(item?.priority, index),
          experience: item?.experience?.trim() || '',
        };
      })
      .filter((item) => item.skill)
      .slice(0, 5);
  };

  const createStaffFromFormState = (formState, overrides = {}) => {
    const skillsArray = buildSkillsPayloadFromForm(formState);
    const fullName = [formState.firstName, formState.middleName, formState.lastName]
      .filter(Boolean)
      .join(' ');

    return {
      id: overrides.id ?? Date.now(),
      name: fullName,
      firstName: formState.firstName,
      middleName: formState.middleName,
      lastName: formState.lastName,
      address: formState.address,
      mobile: formState.mobile,
      phone: formState.mobile,
      email: formState.email,
      emergencyContactNumber: formState.emergencyContactNumber,
      userPersona: 'STAFF',
      reportingManagerId: formState.reportingManagerId || null,
      joiningDate: formState.joiningDate,
      empLevel: formState.empLevel,
      empBaseLocation: formState.empBaseLocation,
      empCategory: formState.empCategory,
      workDepartment: formState.workDepartment,
      empGender: formState.empGender,
      empActive: formState.empActive,
      lastWorkingDay: formState.lastWorkingDay,
      ...mapSkillsArrayToFormFields(skillsArray),
      skills: skillsArray,
      photo: formState.photo || DEFAULT_STAFF_PHOTO,
      assignedVenues: overrides.assignedVenues || [],
    };
  };

  const normalizeStaffFromApi = (data) => {
    if (!data) return null;

    const profile = data.employee_profile && typeof data.employee_profile === 'object'
      ? data.employee_profile
      : {};
    const normalizedSkills = normalizeSkillsFromApi(profile.skills ?? data.skills);
    const parentInfo = data.reports_to;
    const skillFields = mapSkillsArrayToFormFields(normalizedSkills);
    const fullName = [data.first_name, data.middle_name, data.last_name]
      .filter(Boolean)
      .join(' ');
    const pick = (...vals) => {
      for (const value of vals) {
        if (value != null && value !== '') return value;
      }
      return '';
    };

    return {
      id: data.id ?? Date.now(),
      employeeId: pick(profile.employee_id, data.employee_id),
      name: fullName || data.name || 'New Staff',
      firstName: data.first_name || '',
      middleName: data.middle_name || '',
      lastName: data.last_name || '',
      address: pick(data.address, profile.current_address, profile.permanent_address),
      mobile: data.mobile_number || data.phone || '',
      phone: data.mobile_number || data.phone || '',
      alternatePhone: data.alternate_phone_number || '',
      email: data.email || '',
      emergencyContactName: data.emergency_contact_name || '',
      emergencyContactNumber:
        data.emergency_contact_number || data.emergency_contact || '',
      userPersona: data.user_type || 'STAFF',
      userType: data.user_type || '',
      reportingManagerId: parentInfo?.id ?? data.reporting_manager ?? null,
      assignedManager: parentInfo?.name || data.assigned_manager || null,
      joiningDate: pick(profile.date_joined, data.date_joined),
      lastWorkingDay: pick(profile.last_working_day, data.last_working_day),
      terminationType: pick(profile.termination_type, data.termination_type),
      terminationReason: pick(profile.termination_reason, data.termination_reason),
      designation: pick(profile.designation, data.designation),
      profileStatus: deriveEmployeeStatusFromFlags(data.is_active, data.is_deleted),
      isDeleted: Boolean(data.is_deleted),
      grade: pick(profile.grade, data.grade),
      costCenter: pick(profile.cost_center, data.cost_center),
      permanentAddress: pick(profile.permanent_address, data.permanent_address),
      currentAddress: pick(profile.current_address, data.current_address),
      rehiredStatus: pick(profile.rehired_status, data.rehired_status),
      vendorName: pick(profile.vendor_name, data.vendor_name),
      vendorPhone: pick(profile.vendor_phone, data.vendor_phone),
      orderTypes: (() => {
        const value = pick(profile.order_types, data.order_types);
        return value !== '' ? String(value) : '';
      })(),
      targetPercent: pick(profile.target_percent, data.target_percent),
      qcRequired: Boolean(profile.qc_required ?? data.qc_required),
      pfApplicable: Boolean(profile.pf_applicable ?? data.pf_applicable),
      pfNumber: pick(profile.pf_number, data.pf_number),
      uanNumber: pick(profile.uan_number, data.uan_number),
      esiApplicable: Boolean(profile.esi_applicable ?? data.esi_applicable),
      esiNumber: pick(profile.esi_number, data.esi_number),
      esiDispensary: pick(profile.esi_dispensary, data.esi_dispensary),
      shiftId: pick(profile.shift, profile.shift_detail?.id, profile.shift_id, data.shift, data.shift_id),
      shiftDetail: profile.shift_detail || data.shift_detail || null,
      shiftEffectiveFrom: pick(profile.shift_effective_from, data.shift_effective_from),
      empLevel: data.emp_level || parentInfo?.level || '',
      empBaseLocation: data.city || '',
      empCategory: pick(profile.category, data.category, data.employee_category),
      workDepartment: pick(profile.department, data.department),
      empGender: mapGenderCodeToLabel(data.gender) || '',
      empActive: deriveEmployeeStatusFromFlags(data.is_active, data.is_deleted) === 'ACTIVE',
      age: data.age ?? '',
      ...skillFields,
      skills: normalizedSkills,
      photo: data.profile_pic || data.photo || DEFAULT_STAFF_PHOTO,
      services: Array.isArray(data.services) ? data.services : [],
      resources: Array.isArray(data.resources) ? data.resources : [],
      venuesDetailed: (() => {
        const assignedVenuesArray = Array.isArray(data.venues)
          ? data.venues
          : Array.isArray(data.assigned_venues)
            ? data.assigned_venues
            : [];
        return assignedVenuesArray.length > 0 ? assignedVenuesArray : [];
      })(),
      assignedVenues: (() => {
        const assignedVenuesArray = Array.isArray(data.venues)
          ? data.venues
          : Array.isArray(data.assigned_venues)
            ? data.assigned_venues
            : [];
        if (assignedVenuesArray.length > 0 && typeof assignedVenuesArray[0] === 'object') {
          return assignedVenuesArray.map(venue => {
            if (venue && typeof venue === 'object') {
              return venue.id ?? venue.object_id ?? Date.now();
            }
            return venue ?? Date.now();
          });
        }
        return assignedVenuesArray.length > 0 ? assignedVenuesArray : (data.assignedVenues || []);
      })(),
      assignedVenuesDetailed: (() => {
        const assignedVenuesArray = Array.isArray(data.venues)
          ? data.venues
          : Array.isArray(data.assigned_venues)
            ? data.assigned_venues
            : [];
        return assignedVenuesArray.length > 0 ? assignedVenuesArray : undefined;
      })(),
    };
  };

  const fetchStaff = useCallback(async (url = null, searchQuery = '') => {
    const accessToken = localStorage.getItem('access_token');

    if (!accessToken) {
      setStaff([]);
      setStaffError('Authorization token missing. Please log in again.');
      return;
    }

    setIsLoadingStaff(true);
    setStaffError('');

    try {
      const resolvedPageSize = resolveEmployeePageSize(pageSize, totalCountRef.current);
      const apiUrl = buildEmployeesListUrl(
        url,
        searchQuery,
        categoryFilter,
        statusFilter,
        userTypeFilter,
        resolvedPageSize,
        nameOrdering
      );

      const response = await axios.get(apiUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const staffPayload = extractApiArray(response.data);
      
      // Store pagination URLs
      setNextUrl(response.data?.next || null);
      setPreviousUrl(response.data?.previous || null);
      const count = response.data?.count || staffPayload.length;
      setTotalCount(count);
      totalCountRef.current = count;

      // If "All" was selected before count was known, refetch once with exact total
      if (
        pageSize === 'all' &&
        count > 0 &&
        staffPayload.length < count &&
        resolvedPageSize < count &&
        !url
      ) {
        const allUrl = buildEmployeesListUrl(
          null,
          searchQuery,
          categoryFilter,
          statusFilter,
          userTypeFilter,
          count,
          nameOrdering
        );
        const allResponse = await axios.get(allUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const allPayload = extractApiArray(allResponse.data);
        setNextUrl(allResponse.data?.next || null);
        setPreviousUrl(allResponse.data?.previous || null);
        const allCount = allResponse.data?.count || allPayload.length;
        setTotalCount(allCount);
        totalCountRef.current = allCount;

        const normalizedAll = allPayload.map(normalizeStaffFromApi).filter(Boolean);
        const storedAssignments = getStoredStaffAssignments();
        const hasStoredAssignments = Object.keys(storedAssignments).length > 0;
        const mergedAll = hasStoredAssignments
          ? normalizedAll.map((member) => {
              const stored = storedAssignments[String(member.id)];
              if (!stored) return member;
              return {
                ...member,
                assignedVenues: member.assignedVenues ?? stored.assignedVenues ?? [],
                reportingManagerId: member.reportingManagerId ?? stored.reportingManagerId,
                assignedManager: member.assignedManager ?? stored.assignedManager,
              };
            })
          : normalizedAll;
        setStaff(mergedAll);
        return;
      }

      // Normalize staff data
      const normalizedStaff = staffPayload
        .map(normalizeStaffFromApi)
        .filter(Boolean);

      // Merge with stored assignments only if there are stored assignments
      const storedAssignments = getStoredStaffAssignments();
      const hasStoredAssignments = Object.keys(storedAssignments).length > 0;
      
      const mergedStaff = hasStoredAssignments
        ? normalizedStaff.map((member) => {
            const stored = storedAssignments[String(member.id)];
            if (!stored) return member;
            return {
              ...member,
              assignedVenues: member.assignedVenues ?? stored.assignedVenues ?? [],
              reportingManagerId: member.reportingManagerId ?? stored.reportingManagerId,
              assignedManager: member.assignedManager ?? stored.assignedManager
            };
          })
        : normalizedStaff;

      setStaff(mergedStaff);
    } catch (error) {
      console.error('Error fetching staff:', error);
      const responseData = error.response?.data;
      const statusCode = error.response?.status;
      const message = extractApiErrorMessage(responseData, error.message || 'Failed to fetch staff.', statusCode);

      setStaffError(message);
      setStaff([]);
    } finally {
      setIsLoadingStaff(false);
    }
  }, [categoryFilter, statusFilter, userTypeFilter, pageSize, nameOrdering]);

  const fetchAssignableParents = useCallback(async (staffId) => {
    const accessToken = localStorage.getItem('access_token');

    if (!accessToken) {
      console.error('Authorization token missing. Please log in again.');
      return;
    }

    if (!staffId) {
      console.error('Staff ID is required to fetch assignable parents.');
      return;
    }

    setIsLoadingAssignableParents(true);
    setAssignableParents([]);

    try {
      const response = await axios.get(
        `${import.meta.env.VITE_BASEURL_CARE}/accounts/assign/${staffId}/parent/`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const parentsData = response.data?.assignable_parents || [];
      setAssignableParents(Array.isArray(parentsData) ? parentsData : []);
    } catch (error) {
      console.error('Error fetching assignable parents for staff:', error);
      const responseData = error.response?.data;
      console.error('Assignable parents error payload:', responseData);
      setAssignableParents([]);
    } finally {
      setIsLoadingAssignableParents(false);
    }
  }, []);

  const buildStaffApiPayload = (formState, options = {}) => {
    // If photo or verified_document file is present, use FormData
    if (formState.photo instanceof File || formState.verified_document instanceof File) {
      const formData = new FormData();
      
      // Required fields
      formData.append('email', formState.email.trim());
      formData.append('mobile_number', formState.mobile.trim());
      formData.append('emergency_contact', formState.emergencyContactNumber.trim());
      formData.append('first_name', formState.firstName.trim());
      formData.append('last_name', formState.lastName.trim());
      
      // Optional fields - only append if they have values
      if (formState.middleName?.trim()) {
        formData.append('middle_name', formState.middleName.trim());
      }
      if (formState.empGender) {
        formData.append('gender', mapGenderLabelToCode(formState.empGender));
      }
      if (formState.empCategory?.trim()) {
        formData.append('category', formState.empCategory.trim());
      }
      if (formState.address?.trim()) {
        formData.append('address', formState.address.trim());
      }
      if (formState.empBaseLocation?.trim()) {
        formData.append('city', formState.empBaseLocation.trim());
      }
      if (formState.joiningDate) {
        formData.append('date_joined', formState.joiningDate);
      }
      if (formState.lastWorkingDay) {
        formData.append('last_working_day', formState.lastWorkingDay);
      }
      if (formState.empLevel?.trim()) {
        formData.append('emp_level', formState.empLevel.trim());
      }
      if (formState.workDepartment?.trim()) {
        formData.append('department', formState.workDepartment.trim());
      }
      
      // Skills - always append, even if empty
      formData.append('skills', JSON.stringify(buildSkillsPayloadFromForm(formState)));
      
      // Boolean as string
      formData.append('is_active', String(formState.empActive));
      
      // Append photo file if present (only image files)
      if (formState.photo instanceof File && formState.photo.type.startsWith('image/')) {
        formData.append('profile_pic', formState.photo);
      }
      
      // Reporting manager - only append if it has a value
      if (formState.reportingManagerId) {
        const reportingIdNumber = Number(formState.reportingManagerId);
        if (!Number.isNaN(reportingIdNumber)) {
          formData.append('reporting_manager', reportingIdNumber);
        }
      }

      if (options.includeCredentials) {
        if (formState.password) {
          formData.append('password', formState.password);
        }
        if (formState.confirmPassword) {
          formData.append('confirm_password', formState.confirmPassword);
        }
      }

      // Append verified_document file if present
      if (formState.verified_document instanceof File) {
        formData.append('verified_document', formState.verified_document);
      }
      
      return formData;
    }

    // Otherwise, use regular JSON payload
    const payload = {
      email: formState.email.trim(),
      mobile_number: formState.mobile.trim(),
      emergency_contact: formState.emergencyContactNumber.trim(),
      first_name: formState.firstName.trim(),
      middle_name: formState.middleName.trim(),
      last_name: formState.lastName.trim(),
      gender: mapGenderLabelToCode(formState.empGender),
      category: formState.empCategory?.trim() || '',
      address: formState.address.trim(),
      city: (formState.empBaseLocation || '').trim(),
      date_joined: formState.joiningDate || null,
      last_working_day: formState.lastWorkingDay || null,
      emp_level: formState.empLevel?.trim() || '',
      department: formState.workDepartment?.trim() || '',
      skills: buildSkillsPayloadFromForm(formState),
      is_active: formState.empActive,
      // profile_pic and verified_document are only sent as files in FormData, not in JSON payload
    };

    if (formState.reportingManagerId) {
      const reportingIdNumber = Number(formState.reportingManagerId);
      payload.reporting_manager = Number.isNaN(reportingIdNumber)
        ? formState.reportingManagerId
        : reportingIdNumber;
    } else {
      payload.reporting_manager = null;
    }

    if (options.includeCredentials) {
      payload.password = formState.password;
      payload.confirm_password = formState.confirmPassword;
    }

    return payload;
  };

  useEffect(() => {
    const checkAuthStatus = () => {
      try {
        const raw = localStorage.getItem('authUser');
        if (raw) {
          const parsed = JSON.parse(raw);
          setAuthUser(parsed);
        } else {
          setAuthUser(null);
        }
      } catch (error) {
        console.error('Error parsing authUser from localStorage:', error);
        setAuthUser(null);
      }
    };

    checkAuthStatus();

    // Listen for auth changes
    const handleAuthChange = () => checkAuthStatus();
    window.addEventListener('auth-changed', handleAuthChange);
    window.addEventListener('storage', handleAuthChange);

    return () => {
      window.removeEventListener('auth-changed', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  // Venues are now loaded from Redux store, no need to fetch separately

  useEffect(() => {
    if (activeTab !== 'add' && formFeedback.type) {
      setFormFeedback({ type: null, message: '' });
    }
  }, [activeTab, formFeedback.type]);

  const canManageStaff = useMemo(() => userCanManageStaff(authUser), [authUser]);

  useEffect(() => {
    if (canManageStaff) {
      setCurrentPage(1);
      fetchStaff(null, searchTerm);
    } else {
      setStaff([]);
      setStaffError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageStaff, categoryFilter, statusFilter, userTypeFilter, pageSize, nameOrdering]);

  const addStaff = async () => {
    setFormFeedback({ type: null, message: '' });

    const validationError = validateAddStaffForm(form);
    if (validationError) {
      setFormFeedback({ type: 'error', message: validationError });
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setFormFeedback({ type: 'error', message: 'Authorization token missing. Please log in again.' });
      return;
    }

    const payload = buildEmployeeCreatePayload(form);

    setIsSubmitting(true);

    try {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
      };

      if (!(payload instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/accounts/employees/`,
        payload,
        {
          headers,
        }
      );

      const responseData = response.data?.data || response.data;
      const normalizedStaff = normalizeStaffFromApi(responseData);
      const staffForModal = normalizedStaff || createStaffFromFormState(form, { id: responseData?.id });
      const successMessage = response.data?.message || 'Employee created successfully.';
      const needsReportingManager = !form.reportingManagerId;

      setForm(getEmptyEmployeeForm());
      setFormFeedback({ type: 'success', message: successMessage });
      await fetchStaff(null, searchTerm);

      if (!staffForModal?.id) {
        setActiveTab('my');
        showAlert(
          `${successMessage} Documents step skipped because the new employee id was missing.`,
          'warning',
        );
        return;
      }

      setNewlyCreatedStaff(staffForModal);
      setPendingAssignManagerAfterDocs(needsReportingManager);
      setAddEmployeeStep(2);
      setSelectedReportingManagerId('');

      if (needsReportingManager) {
        fetchAssignableParents(staffForModal.id);
      }
    } catch (error) {
      console.error('Error creating employee:', error);
      const responseData = error.response?.data;
      const statusCode = error.response?.status;
      const message = extractApiErrorMessage(responseData, error.message || 'Failed to add employee.', statusCode);

      setFormFeedback({ type: 'error', message });
      showAlert(message, 'info');
    } finally {
      setIsSubmitting(false);
    }
  };

  const finishAddEmployeeDocsStep = () => {
    const staff = newlyCreatedStaff;
    const shouldAssignManager = pendingAssignManagerAfterDocs;
    setAddEmployeeStep(1);
    setPendingAssignManagerAfterDocs(false);
    setFormFeedback({ type: null, message: '' });
    setActiveTab('my');

    if (shouldAssignManager && staff?.id) {
      setNewlyCreatedStaff(staff);
      setSelectedReportingManagerId('');
      setShowAssignReportingManagerModal(true);
      fetchAssignableParents(staff.id);
    } else {
      setNewlyCreatedStaff(null);
    }
  };

  const updateEmployeeProfileStatus = async (staffMember, nextStatus) => {
    if (!staffMember?.id) {
      showAlert('Staff ID is missing. Cannot update status.', 'warning');
      return;
    }
    const statusValue = String(nextStatus || '').trim().toUpperCase();
    if (!['ACTIVE', 'INACTIVE'].includes(statusValue)) {
      showAlert('Please select a valid status.', 'warning');
      return;
    }
    if (String(staffMember.profileStatus || '').toUpperCase() === statusValue) {
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    const tableScrollLeft = employeeTableScrollRef.current?.scrollLeft ?? 0;
    const windowScrollX = window.scrollX;
    const windowScrollY = window.scrollY;
    const restoreScroll = () => {
      if (employeeTableScrollRef.current) {
        employeeTableScrollRef.current.scrollLeft = tableScrollLeft;
      }
      window.scrollTo(windowScrollX, windowScrollY);
      document.documentElement.scrollLeft = windowScrollX;
      document.body.scrollLeft = windowScrollX;
    };

    setTogglingStaffStatusId(staffMember.id);

    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const statusPayload = buildEmployeeStatusApiFlags(statusValue);
      await axios.patch(
        `${baseUrl}/accounts/employees/${staffMember.id}/`,
        statusPayload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const nextActive = statusValue === 'ACTIVE';
      if (statusFilter) {
        await fetchStaff(null, searchTerm);
      } else {
        setStaff((prev) =>
          prev.map((member) =>
            String(member.id) === String(staffMember.id)
              ? {
                  ...member,
                  profileStatus: statusValue,
                  empActive: nextActive,
                }
              : member,
          ),
        );
      }

      setSelectedStaffIds((prev) =>
        prev.filter((id) => String(id) !== String(staffMember.id) || nextActive),
      );
    } catch (error) {
      console.error('Error updating employee status:', error);
      const responseData = error.response?.data;
      const statusCode = error.response?.status;
      const message = extractApiErrorMessage(
        responseData,
        error.message || 'Failed to update employee status.',
        statusCode,
      );
      showAlert(`Error: ${message}`, 'error');
    } finally {
      setTogglingStaffStatusId(null);
      requestAnimationFrame(() => {
        restoreScroll();
        requestAnimationFrame(restoreScroll);
      });
    }
  };

  const requestTerminateStaff = useCallback((staffMember) => {
    if (!staffMember?.id) {
      showAlert('Staff ID is missing. Cannot delete this employee.', 'warning');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    setTerminateConfirm({
      open: true,
      id: staffMember.id,
      name: staffMember.name || 'this employee',
      reason: '',
      lastWorkingDay: staffMember.lastWorkingDay || today,
      loading: false,
      loadingType: null,
      fieldError: '',
    });
  }, [showAlert]);

  const terminateStaff = async (id, { terminationType, reason, lastWorkingDay }) => {
    if (!id) {
      showAlert('Staff ID is missing. Cannot delete this employee.', 'warning');
      return false;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return false;
    }

    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      await axios.delete(`${baseUrl}/accounts/employees/${id}/`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          termination_type: terminationType,
          reason,
          last_working_day: lastWorkingDay,
        },
      });

      setStaff((prev) => prev.filter((s) => s.id !== id));
      showAlert('Employee terminated successfully.', 'success');
      return true;
    } catch (error) {
      console.error('Error deleting employee:', error);
      const responseData = error.response?.data;
      const statusCode = error.response?.status;
      const errorMessage = extractApiErrorMessage(
        responseData,
        error.message || 'Failed to delete employee.',
        statusCode,
      );
      showAlert(`Error: ${errorMessage}`, 'error');
      return false;
    }
  };

  const confirmTermination = useCallback(
    async (loadingType, terminationType) => {
      const id = terminateConfirm.id;
      if (!id) {
        setTerminateConfirm(getEmptyTerminateConfirm());
        return;
      }

      const reason = String(terminateConfirm.reason || '').trim();
      const lastWorkingDay = String(terminateConfirm.lastWorkingDay || '').trim();
      if (!reason) {
        setTerminateConfirm((prev) => ({
          ...prev,
          fieldError: 'Please enter a termination reason.',
        }));
        return;
      }
      if (!lastWorkingDay) {
        setTerminateConfirm((prev) => ({
          ...prev,
          fieldError: 'Please select the last working day.',
        }));
        return;
      }

      setTerminateConfirm((prev) => ({
        ...prev,
        loading: true,
        loadingType,
        fieldError: '',
      }));
      const ok = await terminateStaff(id, {
        terminationType,
        reason,
        lastWorkingDay,
      });
      if (ok) {
        setTerminateConfirm(getEmptyTerminateConfirm());
      } else {
        setTerminateConfirm((prev) => ({
          ...prev,
          loading: false,
          loadingType: null,
        }));
      }
    },
    [
      terminateConfirm.id,
      terminateConfirm.reason,
      terminateConfirm.lastWorkingDay,
      getEmptyTerminateConfirm,
    ],
  );

  const confirmInvoluntaryTermination = useCallback(() => {
    confirmTermination('involuntary', 'INVOLUNTARY');
  }, [confirmTermination]);

  const confirmVoluntaryTermination = useCallback(() => {
    confirmTermination('voluntary', 'VOLUNTARY');
  }, [confirmTermination]);

  const closeRevokeConfirm = useCallback(() => {
    if (isRevokingTermination) return;
    setRevokeConfirm({ open: false, id: null, name: '', rehiredStatus: false });
  }, [isRevokingTermination]);

  const requestRevokeTermination = useCallback(() => {
    if (selectedStaffIds.length !== 1) {
      showAlert('Select exactly one terminated employee to revoke.', 'warning');
      return;
    }
    const selectedId = selectedStaffIds[0];
    const person =
      staff.find((s) => String(s.id) === String(selectedId)) || null;
    if (!person) {
      showAlert('Selected employee was not found on this page.', 'warning');
      return;
    }
    const isTerminated =
      person.profileStatus === 'TERMINATED' || Boolean(person.isDeleted);
    if (!isTerminated) {
      showAlert('Only a terminated employee can be revoked.', 'warning');
      return;
    }
    setRevokeConfirm({
      open: true,
      id: person.id,
      name: person.name || 'this employee',
      rehiredStatus: false,
    });
  }, [selectedStaffIds, staff, showAlert]);

  const confirmRevokeTermination = useCallback(async () => {
    const id = revokeConfirm.id;
    if (!id) {
      setRevokeConfirm({ open: false, id: null, name: '', rehiredStatus: false });
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setIsRevokingTermination(true);
    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      await axios.post(
        `${baseUrl}/accounts/employees/${id}/termination-revoke/`,
        { rehired_status: Boolean(revokeConfirm.rehiredStatus) },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      setRevokeConfirm({ open: false, id: null, name: '', rehiredStatus: false });
      setSelectedStaffIds((prev) =>
        prev.filter((selectedId) => String(selectedId) !== String(id)),
      );
      await fetchStaff(null, searchTerm);
      showAlert('Termination revoked successfully.', 'success');
    } catch (error) {
      console.error('Error revoking termination:', error);
      const responseData = error.response?.data;
      const statusCode = error.response?.status;
      const errorMessage = extractApiErrorMessage(
        responseData,
        error.message || 'Failed to revoke termination.',
        statusCode,
      );
      showAlert(`Error: ${errorMessage}`, 'error');
    } finally {
      setIsRevokingTermination(false);
    }
  }, [
    revokeConfirm.id,
    revokeConfirm.rehiredStatus,
    showAlert,
    fetchStaff,
    searchTerm,
  ]);

  const handleEditStaff = async (staffMember) => {
    if (!staffMember || !staffMember.id) {
      showAlert('Staff ID is missing. Cannot fetch details.', 'warning');
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setIsLoadingStaffDetails(true);
    setShowEditModal(true);
    setSelectedStaffForEdit(staffMember);
    setFormFeedback({ type: null, message: '' });

    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const apiUrl = `${baseUrl}/accounts/employees/${staffMember.id}/`;

      const response = await axios.get(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const staffData = response.data?.data || response.data;
      setForm(mapEmployeeApiToForm(staffData));
      setSelectedStaffForEdit({
        ...staffMember,
        ...staffData,
        id: staffData.id || staffMember.id,
      });
    } catch (error) {
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.detail ||
                          error.message ||
                          'Failed to fetch staff details.';
      showAlert(`Error: ${errorMessage}`, 'error');
      setShowEditModal(false);
      setSelectedStaffForEdit(null);
      setForm(getEmptyEmployeeForm());
    } finally {
      setIsLoadingStaffDetails(false);
    }
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setSelectedStaffForEdit(null);
    setForm(getEmptyEmployeeForm());
    setFormFeedback({ type: null, message: '' });
  };

  const handleUpdateStaff = async () => {
    if (!selectedStaffForEdit) return;

    setFormFeedback({ type: null, message: '' });
    const validationError = validateAddStaffForm(form, { requirePassword: false });
    if (validationError) {
      setFormFeedback({ type: 'error', message: validationError });
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    const payload = buildEmployeeCreatePayload(form, { omitEmptyPassword: true });
    setIsUpdatingStaff(true);

    try {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
      };

      if (!(payload instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }

      await axios.patch(
        `${import.meta.env.VITE_BASEURL_CARE}/accounts/employees/${selectedStaffForEdit.id}/`,
        payload,
        {
          headers,
        }
      );

      closeEditModal();
      setIsUpdatingStaff(false);
      await fetchStaff(null, searchTerm);
      showAlert('Employee updated successfully.', 'success');
    } catch (error) {
      console.error('Error updating staff:', error);
      const responseData = error.response?.data;
      const statusCode = error.response?.status;
      const message = extractApiErrorMessage(responseData, error.message || 'Failed to update staff.', statusCode);

      setFormFeedback({ type: 'error', message });
      showAlert(message, 'info');
      setIsUpdatingStaff(false);
    }
  };

  const fetchStaffDocuments = useCallback(
    async (staffId) => {
      if (!staffId) return [];
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        showAlert('Authorization token missing. Please log in again.', 'error');
        return [];
      }

      setIsLoadingStaffDocuments(true);
      try {
        const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
        const response = await axios.get(`${baseUrl}/accounts/user-documents/`, {
          params: { user: staffId },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const rawList = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.results)
            ? response.data.results
            : [];

        const detailedList = await Promise.all(
          rawList.map(async (entry) => {
            const documentId = entry?.id;
            if (!documentId) return entry;
            try {
              const detailResponse = await axios.get(
                `${baseUrl}/accounts/user-documents/${documentId}/`,
                {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                  },
                }
              );
              return detailResponse.data || entry;
            } catch (detailError) {
              console.error(`Failed to fetch staff document details for ${documentId}:`, detailError);
              return entry;
            }
          })
        );

        const normalized = detailedList
          .map((entry, index) => normalizeApiStaffDocEntry(entry, index))
          .filter(Boolean);

        setStaffApiDocsByUser((prev) => ({ ...prev, [String(staffId)]: normalized }));
        return normalized;
      } catch (error) {
        console.error('Failed to fetch staff documents:', error);
        const message = extractApiErrorMessage(
          error.response?.data,
          'Failed to load documents.',
          error.response?.status
        );
        showAlert(message, 'error');
        return [];
      } finally {
        setIsLoadingStaffDocuments(false);
      }
    },
    [showAlert]
  );

  const getStaffDocsForDisplay = useCallback(
    (staffId) => {
      const key = String(staffId);
      if (Object.prototype.hasOwnProperty.call(staffApiDocsByUser, key)) {
        const docs = staffApiDocsByUser[key];
        return Array.isArray(docs) ? docs : [];
      }
      return [];
    },
    [staffApiDocsByUser]
  );

  const staffDocViewedList = useMemo(
    () => (staffDocViewTarget ? getStaffDocsForDisplay(staffDocViewTarget.id) : []),
    [staffDocViewTarget, getStaffDocsForDisplay]
  );

  const staffDocViewedDoc = useMemo(() => {
    if (!staffDocSelectedId) return null;
    return staffDocViewedList.find(doc => doc.id === staffDocSelectedId) || null;
  }, [staffDocViewedList, staffDocSelectedId]);

  const staffDocViewedFile = useMemo(() => {
    const files = Array.isArray(staffDocViewedDoc?.files) ? staffDocViewedDoc.files : [];
    if (!files.length) return null;
    if (!staffDocSelectedFileId) return files[0];
    return files.find(file => file.id === staffDocSelectedFileId) || files[0];
  }, [staffDocViewedDoc, staffDocSelectedFileId]);

  const closeStaffDocumentViewModal = () => {
    if (staffDocViewDeleting) return;
    setStaffDocViewTarget(null);
    setStaffDocSelectedId(null);
    setStaffDocSelectedFileId(null);
  };

  const handleViewStaffDocument = async (staffMember) => {
    if (!staffMember?.id) return;
    setStaffDocViewTarget(staffMember);
    setStaffDocSelectedId(null);
    setStaffDocSelectedFileId(null);
    const docs = await fetchStaffDocuments(staffMember.id);
    const firstDoc = docs[0] || null;
    setStaffDocSelectedId(firstDoc?.id ?? null);
    setStaffDocSelectedFileId(firstDoc?.files?.[0]?.id ?? null);
  };

  const handleUploadFromStaffDocumentView = () => {
    const staffMember = staffDocViewTarget;
    if (!staffMember?.id) return;
    closeStaffDocumentViewModal();
    openStaffDocumentAddModal(staffMember);
  };

  const downloadStaffLocalDoc = (file) => {
    const docUrl = file?.url;
    if (!docUrl) return;
    const link = document.createElement('a');
    link.href = docUrl;
    link.download = file.fileName || 'staff-document';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadStaffDocument = () => {
    if (!staffDocViewedFile) {
      showAlert('Select a document to download.', 'info');
      return;
    }
    downloadStaffLocalDoc(staffDocViewedFile);
  };

  const openStaffDocumentAddModal = (staffMember) => {
    setStaffDocAddTarget(staffMember);
    setStaffDocEditTarget(null);
    setStaffDocAddFiles([]);
    setStaffDocTitle('');
    setStaffDocRemarks('');
    setStaffDocAddCompressing(false);
  };

  const closeStaffDocumentAddModal = () => {
    setStaffDocAddTarget(null);
    setStaffDocEditTarget(null);
    setStaffDocAddFiles([]);
    setStaffDocTitle('');
    setStaffDocRemarks('');
    setStaffDocAddCompressing(false);
  };

  const handleStaffDocumentFileSelect = async (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length) return;

    setStaffDocAddCompressing(true);
    try {
      const maxBytes = STAFF_DOCUMENT_MAX_UPLOAD_MB * 1024 * 1024;
      const processed = [];
      for (const raw of selected) {
        const result = await compressFileForUpload(raw, { maxDimension: 1920 });
        const file = result?.file || raw;
        if (file.size > maxBytes) {
          showAlert(
            `"${file.name}" is too large after compression (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is ${STAFF_DOCUMENT_MAX_UPLOAD_MB} MB.`,
            'warning'
          );
          continue;
        }
        processed.push(file);
      }
      if (processed.length) {
        setStaffDocAddFiles(prev => [...prev, ...processed]);
      }
    } catch (error) {
      console.error('Staff document compression failed:', error);
      showAlert(error.message || 'Failed to process the selected file(s).', 'error');
    } finally {
      setStaffDocAddCompressing(false);
    }
  };

  const removeStaffDocAddFile = (index) => {
    setStaffDocAddFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveStaffDocument = async () => {
    if (!staffDocAddTarget?.id) return;
    const isEditMode = Boolean(staffDocEditTarget?.documentId);
    if (!isEditMode && !staffDocAddFiles.length) {
      showAlert('Please select at least one document to save.', 'warning');
      return;
    }
    const title = staffDocTitle.trim();
    if (!title) {
      showAlert('Please enter a document title.', 'warning');
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setStaffDocSaving(true);
    try {
      const formData = new FormData();
      formData.append('user', String(staffDocAddTarget.id));
      formData.append('title', title);
      formData.append('remarks', staffDocRemarks.trim());
      for (const file of staffDocAddFiles) {
        formData.append('files', file);
      }

      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      if (isEditMode) {
        await axios.patch(
          `${baseUrl}/accounts/user-documents/${staffDocEditTarget.documentId}/`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
      } else {
        await axios.post(`${baseUrl}/accounts/user-documents/`, formData, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }

      await fetchStaffDocuments(staffDocAddTarget.id);
      if (isEditMode) {
        showAlert('Document updated successfully.', 'success');
      } else {
        showAlert(
          staffDocAddFiles.length === 1
            ? 'Document uploaded successfully.'
            : `${staffDocAddFiles.length} documents uploaded successfully.`,
          'success'
        );
      }
      closeStaffDocumentAddModal();
    } catch (error) {
      console.error(`Failed to ${isEditMode ? 'update' : 'upload'} staff document(s):`, error);
      const message = extractApiErrorMessage(
        error.response?.data,
        error.message || `Failed to ${isEditMode ? 'update' : 'upload'} document(s).`,
        error.response?.status
      );
      showAlert(message, 'error');
    } finally {
      setStaffDocSaving(false);
    }
  };

  const openStaffDocumentEditModal = (doc) => {
    if (!doc?.documentId || !staffDocViewTarget?.id) {
      showAlert('Missing document id. Unable to edit.', 'error');
      return;
    }
    setStaffDocAddTarget(staffDocViewTarget);
    setStaffDocEditTarget(doc);
    setStaffDocTitle(doc.title || '');
    setStaffDocRemarks(doc.remarks || '');
    setStaffDocAddFiles([]);
    setStaffDocAddCompressing(false);
  };

  const handleDeleteStaffDocumentByDoc = async (doc) => {
    if (!doc?.id) return;
    setStaffDocSelectedId(doc.id);
    setStaffDocSelectedFileId(doc.files?.[0]?.id ?? null);
    const currentDoc = staffDocViewedDoc?.id === doc.id ? staffDocViewedDoc : doc;
    if (!currentDoc?.documentId) {
      showAlert('Missing document id. Unable to delete.', 'error');
      return;
    }

    const fileCount = Number(currentDoc.fileCount || currentDoc.files?.length || 0);
    const deleteLabel = currentDoc.title || 'this document';
    const confirmMessage =
      fileCount > 1
        ? `Delete "${deleteLabel}" and all ${fileCount} files inside it?`
        : `Delete "${deleteLabel}"?`;
    if (!window.confirm(confirmMessage)) return;

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setStaffDocViewDeleting(true);
    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      await axios.delete(`${baseUrl}/accounts/user-documents/${currentDoc.documentId}/`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const refreshedDocs = await fetchStaffDocuments(staffDocViewTarget?.id);
      showAlert('Document deleted successfully.', 'success');
      if (refreshedDocs.length) {
        setStaffDocSelectedId(refreshedDocs[0].id);
        setStaffDocSelectedFileId(refreshedDocs[0]?.files?.[0]?.id ?? null);
      } else {
        setStaffDocViewTarget(null);
        setStaffDocSelectedId(null);
        setStaffDocSelectedFileId(null);
      }
    } catch (error) {
      console.error('Failed to delete staff document from API:', error);
      const message = extractApiErrorMessage(
        error.response?.data,
        error.message || 'Failed to delete document.',
        error.response?.status
      );
      showAlert(message, 'error');
    } finally {
      setStaffDocViewDeleting(false);
    }
  };


  const openAssignVenueModal = (staffMember) => {
    setSelectedStaffForVenue(staffMember);
    setSelectedVenueIds(staffMember.assignedVenues || []);
    setShowAssignVenueModal(true);
  };

  const toggleStaffSelection = (staffId) => {
    setSelectedStaffIds(prev => {
      const idStr = String(staffId);
      const exists = prev.some(id => String(id) === idStr);
      if (exists) {
        return prev.filter(id => String(id) !== idStr);
      }
      return [...prev, staffId];
    });
  };

  const areAllVisibleStaffSelected = (visibleStaff) => {
    const selectable = (visibleStaff || []).filter(
      (person) => String(person.profileStatus || '').trim().toUpperCase() !== 'INACTIVE',
    );
    if (selectable.length === 0) return false;
    return selectable.every((person) =>
      selectedStaffIds.some((id) => String(id) === String(person.id)),
    );
  };

  const toggleSelectAllVisibleStaff = (visibleStaff) => {
    if (!visibleStaff || visibleStaff.length === 0) return;
    const selectable = visibleStaff.filter(
      (person) => String(person.profileStatus || '').trim().toUpperCase() !== 'INACTIVE',
    );
    if (selectable.length === 0) return;
    const allSelected = areAllVisibleStaffSelected(visibleStaff);
    if (allSelected) {
      setSelectedStaffIds((prev) =>
        prev.filter(
          (id) => !selectable.some((person) => String(person.id) === String(id)),
        ),
      );
    } else {
      const visibleIds = selectable.map((person) => person.id);
      setSelectedStaffIds((prev) => {
        const map = new Map(prev.map((id) => [String(id), id]));
        visibleIds.forEach((id) => {
          const key = String(id);
          if (!map.has(key)) {
            map.set(key, id);
          }
        });
        return Array.from(map.values());
      });
    }
  };

  const ENTITY_TYPE_MAP = {
    venues: 'venue',
    services: 'service',
    resources: 'resource',
  };
  const ASSIGN_CATEGORY_LABELS = {
    venues: 'Venues',
    services: 'Services',
    resources: 'Resources',
  };

  const handleAssignOptionSelect = (optionKey) => {
    if (!optionKey) return;
    fetchAssignableEntities(optionKey);
  };

  const fetchAssignableEntities = async (optionKey) => {
    const entityType = ENTITY_TYPE_MAP[optionKey] || optionKey;
    const accessToken = localStorage.getItem('access_token');
    const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
    const staffIdForFetch = assignStaffIds[0];

    if (!staffIdForFetch) {
      setAssignModalStep('options');
      setAssignableEntitiesError('Select at least one staff before assigning.');
      return;
    }

    setAssignModalStep('entities');
    setSelectedAssignCategory(optionKey);
    setAssignableEntities([]);
    setAssignableEntitiesError('');
    setSelectedAssignableEntityId('');
    setIsLoadingAssignableEntities(true);
    setIsAssigningEntity(false);

    if (!accessToken) {
      setAssignableEntitiesError('Authorization token missing. Please log in again.');
      setIsLoadingAssignableEntities(false);
      return;
    }

    try {
      const response = await axios.get(
        `${baseUrl}/management/assign-users/${entityType}/`,
        {
          params: { user_id: staffIdForFetch },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const entitiesPayload =
        response.data?.assignable_entities ||
        response.data?.data?.assignable_entities ||
        [];

      setAssignableEntities(Array.isArray(entitiesPayload) ? entitiesPayload : []);
      setAssignableEntitiesError('');
    } catch (error) {
      console.error('Failed to fetch assignable entities:', error);
      const responseData = error.response?.data;
      const statusCode = error.response?.status;
      const message =
        extractApiErrorMessage(responseData, 'Failed to load assignable items.', statusCode);
      setAssignableEntitiesError(message);
      setAssignableEntities([]);
    } finally {
      setIsLoadingAssignableEntities(false);
    }
  };

  const handleConfirmEntityAssignment = async () => {
    if (
      !assignActionModalStaff ||
      !selectedAssignCategory ||
      !selectedAssignableEntityId
    ) {
      return;
    }

    const entityType = ENTITY_TYPE_MAP[selectedAssignCategory] || selectedAssignCategory;
    const accessToken = localStorage.getItem('access_token');
    const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');

    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setIsAssigningEntity(true);

    try {
      await axios.post(
        `${baseUrl}/management/assign-users/${entityType}/`,
        {
          entity_id: Number(selectedAssignableEntityId),
          staff_ids: assignStaffIds.map(id => Number(id) || id),
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      await fetchStaff(null, searchTerm);
      setSelectedStaffIds(prev =>
        prev.filter(
          id => !assignStaffIds.some(assignId => String(assignId) === String(id))
        )
      );
      showAlert('Assignment saved successfully.', 'success');
      closeAssignActionModal();
    } catch (error) {
      console.error('Failed to assign entity:', error);
      const responseData = error.response?.data;
      const statusCode = error.response?.status;
      const message = extractApiErrorMessage(responseData, 'Failed to assign. Please try again.', statusCode);
      showAlert(message, 'info');
    } finally {
      setIsAssigningEntity(false);
    }
  };

  const openAssignActionModal = (staffMember, overrideStaffIds = null) => {
    const fallbackIds =
      overrideStaffIds && overrideStaffIds.length > 0
        ? overrideStaffIds
        : selectedStaffIds.length > 0
          ? selectedStaffIds
          : staffMember
            ? [staffMember.id]
            : [];

    if (!fallbackIds || fallbackIds.length === 0) {
      showAlert('Select at least one staff to assign.', 'warning');
      return;
    }

    const normalizedIds = fallbackIds.map(id => Number(id) || id);
    const primaryStaff =
      staffMember ||
      staff.find(s => normalizedIds.some(id => String(id) === String(s.id))) ||
      null;

    setAssignStaffIds(normalizedIds);
    setAssignActionModalStaff(primaryStaff);
    setAssignModalStep('options');
    setSelectedAssignCategory(null);
    setAssignableEntities([]);
    setAssignableEntitiesError('');
    setSelectedAssignableEntityId('');
    setIsLoadingAssignableEntities(false);
    setIsAssigningEntity(false);
  };

  const closeAssignActionModal = () => {
    setAssignActionModalStaff(null);
    setAssignModalStep('options');
    setSelectedAssignCategory(null);
    setAssignableEntities([]);
    setAssignableEntitiesError('');
    setSelectedAssignableEntityId('');
    setIsLoadingAssignableEntities(false);
    setIsAssigningEntity(false);
    setAssignStaffIds([]);
  };

  const assignVenues = () => {
    if (!selectedStaffForVenue) return;

    const normalizedSelectedIds = selectedVenueIds.map(id => Number(id) || id);

    const resolvedVenuesDetails = normalizedSelectedIds.map(id => {
      const venue = effectiveVenues.find(v => v.id === id || String(v.id) === String(id));
      if (venue) {
        return {
          id: venue.id,
          name: venue.name,
          city: venue.city || venue.location?.city || venue.locality || '',
          is_active: venue.enabled !== false,
        };
      }
      return {
        id,
        name: `Venue #${id}`,
        city: '',
        is_active: true,
      };
    });

    setStaff(prev => prev.map(s =>
      s.id === selectedStaffForVenue.id
        ? { 
            ...s, 
            assignedVenues: normalizedSelectedIds,
            assignedVenuesDetailed: resolvedVenuesDetails,
          }
        : s
    ));

    const assignments = getStoredStaffAssignments();
    const key = String(selectedStaffForVenue.id);
    assignments[key] = {
      ...(assignments[key] || {}),
      assignedVenues: normalizedSelectedIds
    };
    setStoredStaffAssignments(assignments);

    setShowAssignVenueModal(false);
    setSelectedStaffForVenue(null);
    setSelectedVenueIds([]);
  };

  const toggleVenueSelection = (venueId) => {
    setSelectedVenueIds(prev => {
      const venueIdStr = String(venueId);
      const hasId = prev.some(id => String(id) === venueIdStr);
      return hasId
        ? prev.filter(id => String(id) !== venueIdStr)
        : [...prev, venueId];
    });
  };

  const openReportingManagerAssignment = (staffMember) => {
    if (!staffMember) return;
    setNewlyCreatedStaff(staffMember);
    setSelectedReportingManagerId(
      staffMember.reportingManagerId ? String(staffMember.reportingManagerId) : ''
    );
    setShowAssignReportingManagerModal(true);
    if (staffMember.id) {
      fetchAssignableParents(staffMember.id);
    }
  };

  const handleAssignReportingManager = async () => {
    if (!newlyCreatedStaff) return;

    const rawValue = selectedReportingManagerId?.trim();
    if (!rawValue) {
      showAlert('Please select a reporting manager from the list.', 'warning');
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    const staffId = newlyCreatedStaff.id;
    if (!staffId) {
      showAlert('Staff ID is missing.', 'warning');
      return;
    }

    const parsedId = Number(rawValue);
    const parentManagerId = Number.isNaN(parsedId) ? rawValue : parsedId;

    const parentManager = assignableParents.find(
      (parent) => String(parent.id) === String(parentManagerId)
    );

    const parentManagerName =
      parentManager?.name ||
      `${parentManager?.first_name || ''} ${parentManager?.last_name || ''}`.trim() ||
      `Manager #${parentManagerId}`;

    setIsAssigningReportingManager(true);

    try {
      await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/accounts/assign/${staffId}/parent/`,
        {
          parent_id: parentManagerId,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      setStaff((prev) =>
        prev.map((staffMember) =>
          staffMember.id === newlyCreatedStaff.id
            ? {
                ...staffMember,
                reportingManagerId: parentManagerId,
                assignedManager: parentManagerName,
              }
            : staffMember
        )
      );

      const assignments = getStoredStaffAssignments();
      const key = String(newlyCreatedStaff.id);
      assignments[key] = {
        ...(assignments[key] || {}),
        reportingManagerId: parentManagerId,
        assignedManager: parentManagerName,
      };
      setStoredStaffAssignments(assignments);

      handleCloseAssignReportingManagerModal();
    } catch (error) {
      console.error('Error assigning reporting manager to staff:', error);
      const responseData = error.response?.data;
      const statusCode = error.response?.status;
      const message = extractApiErrorMessage(
        responseData,
        error.message || 'Failed to assign reporting manager.',
        statusCode
      );
      showAlert(message, 'info');
    } finally {
      setIsAssigningReportingManager(false);
    }
  };

  const handleCloseAssignReportingManagerModal = () => {
    setShowAssignReportingManagerModal(false);
    setNewlyCreatedStaff(null);
    setSelectedReportingManagerId('');
    setAssignableParents([]);
  };

  // Use staff directly (no client-side filtering since we use API search)
  const filteredStaff = useMemo(() => {
    return staff;
  }, [staff]);

  const visibleEmployeeColumns = useMemo(
    () => buildEmployeeVisibleColumnIds(columnOrder, columnVisibility),
    [columnOrder, columnVisibility]
  );

  useEffect(() => {
    try {
      localStorage.setItem(EMPLOYEE_MASTER_LS_ORDER, JSON.stringify(columnOrder));
    } catch {
      /* ignore */
    }
  }, [columnOrder]);

  useEffect(() => {
    try {
      localStorage.setItem(EMPLOYEE_MASTER_LS_VISIBILITY, JSON.stringify(columnVisibility));
    } catch {
      /* ignore */
    }
  }, [columnVisibility]);

  useEffect(() => {
    if (!showColumnChooser) return undefined;
    const onDocClick = (event) => {
      if (columnChooserRef.current && !columnChooserRef.current.contains(event.target)) {
        setShowColumnChooser(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showColumnChooser]);

  const effectivePageSize = useMemo(
    () => resolveEmployeePageSize(pageSize, totalCount),
    [pageSize, totalCount]
  );

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalCount / effectivePageSize));
  }, [totalCount, effectivePageSize]);
  
  const paginatedStaff = filteredStaff;

  const canRevokeSelectedTermination = useMemo(() => {
    if (selectedStaffIds.length !== 1) return false;
    const person = staff.find((s) => String(s.id) === String(selectedStaffIds[0]));
    if (!person) return false;
    return person.profileStatus === 'TERMINATED' || Boolean(person.isDeleted);
  }, [selectedStaffIds, staff]);

  // Handle search button click or Enter key press
  const handleSearchStaff = () => {
    // Reset to page 1 when searching
    setCurrentPage(1);
    fetchStaff(null, searchTerm);
  };

  // Reset to page 1 when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const staffExportSubtitle = useMemo(
    () =>
      buildEmployeeExportSubtitle({
        exportedCount: filteredStaff.length,
        totalCount,
        currentPage,
        searchTerm,
      }),
    [filteredStaff.length, totalCount, currentPage, searchTerm]
  );

  const fetchEmployeeDetailsForExport = async (person) => {
    if (!person?.id) return person;
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return person;
    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const response = await axios.get(`${baseUrl}/accounts/employees/${person.id}/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const raw = response.data?.data || response.data;
      return normalizeStaffFromApi(raw) || person;
    } catch {
      return person;
    }
  };

  const buildEnrichedExportRows = async () => {
    const enriched = await Promise.all(filteredStaff.map(fetchEmployeeDetailsForExport));
    return enriched.map(employeeToExportRow);
  };

  const handleExportStaffPdf = async () => {
    if (!filteredStaff.length) {
      showAlert('No employees to export on this page.', 'info');
      return;
    }
    setIsExportingStaff(true);
    try {
      const rows = await buildEnrichedExportRows();
      exportEmployeeListPdf({
        title: 'Employee Master',
        subtitle: staffExportSubtitle,
        rows,
      });
    } catch (error) {
      console.error('Employee PDF export failed:', error);
      showAlert(error.message || 'Unable to export PDF.', 'error');
    } finally {
      setIsExportingStaff(false);
    }
  };

  const handleExportStaffExcel = async () => {
    if (!filteredStaff.length) {
      showAlert('No employees to export on this page.', 'info');
      return;
    }
    setIsExportingStaff(true);
    try {
      const rows = await buildEnrichedExportRows();
      exportEmployeeListExcel({
        rows,
        sheetName: 'Employees',
        fileNamePrefix: 'employee-master',
      });
    } catch (error) {
      console.error('Staff Excel export failed:', error);
      showAlert(error.message || 'Unable to export Excel file.', 'error');
    } finally {
      setIsExportingStaff(false);
    }
  };

  return (
    <>
    <div className="relative w-full min-w-0 max-w-full">
      {/* Loading Overlay */}
      {(isLoadingStaff || isSubmitting || isExportingStaff) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 shadow-2xl flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
            <p className="text-gray-700 font-semibold">
              {isExportingStaff
                ? 'Preparing export...'
                : isLoadingStaff
                  ? 'Loading employees...'
                  : 'Creating employee...'}
            </p>
          </div>
        </div>
      )}
      
      {/* Panels */}
      {!canManageStaff && (
        <div className="bg-gray-50 rounded-xl p-8 border-2 border-gray-200 text-center">
          <p className="text-gray-700 text-lg font-medium mb-2">Only VSRE_OWNERs and VSRE_MANAGERs can manage staff.</p>
          {authUser ? (
            <p className="text-sm text-gray-500">Current user type: <span className="font-semibold">{authUser.user_type || 'Not found'}</span></p>
          ) : (
            <p className="text-sm text-gray-500">No user logged in. Please log in as VSRE_OWNER or VSRE_MANAGER.</p>
          )}
        </div>
      )}

      {canManageStaff && activeTab === 'my' && (
        <div className="mb-3 flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setAddEmployeeStep(1);
              setPendingAssignManagerAfterDocs(false);
              setNewlyCreatedStaff(null);
              setFormFeedback({ type: null, message: '' });
              setActiveTab('add');
            }}
            className="shrink-0 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            + Add Employee
          </button>
          <button
            type="button"
            onClick={() => setShowBulkUploadModal(true)}
            disabled={isLoadingStaff}
            className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              isLoadingStaff
                ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                : 'border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
            }`}
            title="Bulk upload employees from Excel"
          >
            Bulk Upload
          </button>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearchStaff();
              }
            }}
            placeholder="Search employees by name, ID, or contact"
            className="min-w-40 flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCurrentPage(1);
                fetchStaff(null, '');
              }}
              className="shrink-0 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={handleSearchStaff}
            disabled={isLoadingStaff}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              isLoadingStaff
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
            title="Search"
          >
            Search
          </button>
          <label htmlFor="employee-page-size" className="shrink-0 text-xs font-semibold text-slate-600">
            Rows
          </label>
          <select
            id="employee-page-size"
            value={pageSize === 'all' ? 'all' : String(pageSize)}
            onChange={(e) => {
              const next = e.target.value === 'all' ? 'all' : Number(e.target.value) || 20;
              setPageSize(next);
              setCurrentPage(1);
            }}
            disabled={isLoadingStaff}
            className="shrink-0 min-w-[4.5rem] rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 focus:border-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            title="Rows per page"
          >
            {EMPLOYEE_PAGE_SIZE_OPTIONS.map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExportStaffPdf}
            disabled={isLoadingStaff || isExportingStaff || filteredStaff.length === 0}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              isLoadingStaff || isExportingStaff || filteredStaff.length === 0
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
            title="Export current page as PDF"
          >
            {isExportingStaff ? 'Exporting...' : 'Export PDF'}
          </button>
          <button
            type="button"
            onClick={handleExportStaffExcel}
            disabled={isLoadingStaff || isExportingStaff || filteredStaff.length === 0}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              isLoadingStaff || isExportingStaff || filteredStaff.length === 0
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-emerald-700 text-white hover:bg-emerald-800'
            }`}
            title="Export current page as Excel"
          >
            {isExportingStaff ? 'Exporting...' : 'Export Excel'}
          </button>
          <div className="relative shrink-0" ref={columnChooserRef}>
            <button
              type="button"
              onClick={() => setShowColumnChooser((prev) => !prev)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Column Chooser
            </button>
            {showColumnChooser ? (
              <div className="absolute right-0 top-full z-30 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Choose columns
                </p>
                <p className="mb-2 text-[11px] text-slate-400">
                  Emp Name, Emp. ID, and Status stay fixed (Status is 4th). Drag other headers to reorder.
                </p>
                <div className="space-y-1">
                  {columnOrder.map((colId) => (
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
                      <span>{EMPLOYEE_COLUMN_LABELS[colId] || colId}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-2 w-full rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                  onClick={() => {
                    setColumnOrder([...EMPLOYEE_DRAG_COLUMN_IDS]);
                    setColumnVisibility(
                      Object.fromEntries(EMPLOYEE_DRAG_COLUMN_IDS.map((id) => [id, true]))
                    );
                  }}
                >
                  Reset columns
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('shifts')}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            title="Manage shifts"
          >
            Shifts
          </button>
          <button
            type="button"
            onClick={() => openAssignActionModal(null, selectedStaffIds)}
            disabled={selectedStaffIds.length === 0}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
              selectedStaffIds.length === 0
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
            title="Assign selected staff"
          >
            Assign Selected {selectedStaffIds.length > 0 ? `(${selectedStaffIds.length})` : ''}
          </button>
          <button
            type="button"
            onClick={requestRevokeTermination}
            disabled={isRevokingTermination || !canRevokeSelectedTermination}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
              isRevokingTermination || !canRevokeSelectedTermination
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
            title="Revoke termination for one selected employee"
          >
            {isRevokingTermination ? 'Revoking…' : 'Revoke Termination'}
          </button>
        </div>
      )}

      {canManageStaff && activeTab === 'shifts' && (
        <EmployeeShiftsPanel
          onBack={() => setActiveTab('my')}
          onAlert={showAlert}
        />
      )}

      {canManageStaff && activeTab === 'my' && (
        <div className="min-w-0 max-w-full rounded-xl border-2 border-gray-200 bg-gray-50 p-3 sm:p-6">
          {isLoadingStaff ? (
            <div className="text-center text-gray-600 py-12 text-lg">Loading employees...</div>
          ) : staffError ? (
            <div className="text-center text-red-600 py-12 text-lg">{staffError}</div>
          ) : (
            <>
            <div className="w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white shadow-sm">
              <div
                ref={employeeTableScrollRef}
                className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain"
              >
              <table className="w-full border-collapse text-[11px] sm:text-xs" style={{ minWidth: `${Math.max(56, 8 + visibleEmployeeColumns.length * 7)}rem` }}>
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="text-left py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight">
                      <input
                        type="checkbox"
                        checked={areAllVisibleStaffSelected(paginatedStaff)}
                        onChange={() => toggleSelectAllVisibleStaff(paginatedStaff)}
                        className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500"
                        aria-label="Select all employees on this page"
                      />
                    </th>
                    {visibleEmployeeColumns.map((colId) => {
                      const isFixed =
                        EMPLOYEE_FIXED_LEADING_IDS.includes(colId) ||
                        EMPLOYEE_FIXED_TRAILING_IDS.includes(colId);
                      const label = EMPLOYEE_COLUMN_LABELS[colId] || colId;
                      if (colId === 'profileStatus') {
                        return (
                          <th
                            key={colId}
                            className="text-left py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight whitespace-nowrap"
                          >
                            <span className="inline-flex justify-start">
                              <EmployeeStatusFilterButton
                                value={statusFilter}
                                onChange={setStatusFilter}
                                disabled={isLoadingStaff}
                                compact
                                label="Status"
                              />
                            </span>
                          </th>
                        );
                      }
                      if (colId === 'name') {
                        return (
                          <th
                            key={colId}
                            className="text-left py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight whitespace-nowrap"
                          >
                            <EmployeeNameSortButton
                              value={nameOrdering}
                              onChange={(next) => {
                                setNameOrdering(next);
                                setCurrentPage(1);
                              }}
                              disabled={isLoadingStaff}
                              compact
                              label="Emp Name"
                            />
                          </th>
                        );
                      }
                      if (colId === 'userType') {
                        return (
                          <th
                            key={colId}
                            draggable={!isFixed}
                            onDragStart={(e) => {
                              if (isFixed) return;
                              setDragColId(colId);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => setDragColId(null)}
                            onDragOver={(e) => {
                              if (!dragColId || dragColId === colId || isFixed) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (isFixed) return;
                              setColumnOrder((prev) => reorderEmployeeColumns(prev, dragColId, colId));
                              setDragColId(null);
                            }}
                            className="text-left py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight whitespace-nowrap"
                          >
                            <span className="inline-flex items-center gap-0.5">
                              {!isFixed ? <span className="text-slate-400">⋮</span> : null}
                              <EmployeeTypeFilterButton
                                value={userTypeFilter}
                                onChange={setUserTypeFilter}
                                disabled={isLoadingStaff}
                                compact
                              />
                            </span>
                          </th>
                        );
                      }
                      if (colId === 'category') {
                        return (
                          <th
                            key={colId}
                            draggable={!isFixed}
                            onDragStart={(e) => {
                              if (isFixed) return;
                              setDragColId(colId);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => setDragColId(null)}
                            onDragOver={(e) => {
                              if (!dragColId || dragColId === colId || isFixed) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (isFixed) return;
                              setColumnOrder((prev) => reorderEmployeeColumns(prev, dragColId, colId));
                              setDragColId(null);
                            }}
                            className="text-left py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight whitespace-nowrap"
                          >
                            <span className="inline-flex items-center gap-0.5">
                              {!isFixed ? <span className="text-slate-400">⋮</span> : null}
                              <EmployeeCategoryFilterButton
                                value={categoryFilter}
                                onChange={setCategoryFilter}
                                disabled={isLoadingStaff}
                                compact
                              />
                            </span>
                          </th>
                        );
                      }
                      return (
                        <th
                          key={colId}
                          draggable={!isFixed}
                          onDragStart={(e) => {
                            if (isFixed) return;
                            setDragColId(colId);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => setDragColId(null)}
                          onDragOver={(e) => {
                            if (!dragColId || dragColId === colId || isFixed) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (isFixed) return;
                            setColumnOrder((prev) => reorderEmployeeColumns(prev, dragColId, colId));
                            setDragColId(null);
                          }}
                          className="text-left py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight whitespace-nowrap"
                          title={isFixed ? label : `Drag to reorder · ${label}`}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {!isFixed ? <span className="text-slate-400">⋮</span> : null}
                            {label}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {paginatedStaff.length === 0 ? (
                    <tr>
                      <td
                        colSpan={visibleEmployeeColumns.length + 1}
                        className="py-10 px-4 text-center text-sm text-slate-600"
                      >
                        {searchTerm.trim() ? (
                          <span>
                            No employees match &quot;
                            <span className="font-semibold text-slate-800">{searchTerm.trim()}</span>&quot;.
                          </span>
                        ) : categoryFilter || statusFilter || userTypeFilter ? (
                          <span>
                            No employees match the current filters
                            {[
                              userTypeFilter
                                ? `Emp Role: ${getEmployeeTypeLabel(userTypeFilter)}`
                                : null,
                              categoryFilter
                                ? `Category: ${getEmployeeCategoryLabel(categoryFilter)}`
                                : null,
                              statusFilter
                                ? `Status: ${getEmployeeStatusLabel(statusFilter)}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(', ')
                              .replace(/^/, ' (')
                              .concat(')')}
                            . Use the header filters to adjust.
                          </span>
                        ) : (
                          'No employees found.'
                        )}
                      </td>
                    </tr>
                  ) : null}
                  {paginatedStaff.map((s) => {
                    const profileStatus =
                      String(s.profileStatus || '').trim().toUpperCase() || 'ACTIVE';
                    const isInactive =
                      profileStatus === 'INACTIVE' || profileStatus === 'TERMINATED';
                    const canSelectRow = profileStatus !== 'INACTIVE';
                    const rowDocCount = getStaffDocsForDisplay(s.id).length;
                    const muted = isInactive ? 'text-slate-400' : 'text-slate-700';
                    return (
                      <tr
                        key={s.id}
                        className={`border-b border-slate-100 transition-colors ${
                          isInactive ? 'bg-slate-50 opacity-75' : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-1.5 px-1.5 align-top">
                          <input
                            type="checkbox"
                            checked={selectedStaffIds.some((id) => String(id) === String(s.id))}
                            onChange={() => toggleStaffSelection(s.id)}
                            disabled={!canSelectRow}
                            className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500 disabled:cursor-not-allowed"
                            aria-label={`Select ${s.name || 'staff'}`}
                          />
                        </td>
                        {visibleEmployeeColumns.map((colId) => {
                          if (colId === 'profileStatus') {
                            return (
                              <td key={colId} className="py-1.5 px-1.5 align-top">
                                <EmployeeProfileStatusSelect
                                  value={profileStatus || 'ACTIVE'}
                                  disabled={
                                    togglingStaffStatusId != null &&
                                    String(togglingStaffStatusId) === String(s.id)
                                  }
                                  onChange={(nextStatus) =>
                                    updateEmployeeProfileStatus(s, nextStatus)
                                  }
                                />
                              </td>
                            );
                          }
                          if (colId === 'userType') {
                            return (
                              <td key={colId} className="py-1.5 px-1.5 align-top overflow-hidden">
                                <span
                                  className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
                                    String(s.userType || '').toUpperCase() === 'VSRE_MANAGER'
                                      ? 'bg-violet-100 text-violet-700'
                                      : String(s.userType || '').toUpperCase() === 'LINE_MANAGER'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-sky-100 text-sky-700'
                                  }`}
                                >
                                  {getEmployeeTypeLabel(s.userType) || '—'}
                                </span>
                              </td>
                            );
                          }
                          if (colId === 'email') {
                            const email = String(s.email || '').trim();
                            return (
                              <td key={colId} className="py-1.5 px-1.5 align-top overflow-hidden min-w-0 max-w-[9.5rem]">
                                {email ? (
                                  <a
                                    href={`mailto:${email}`}
                                    className={`block truncate hover:underline ${isInactive ? 'text-slate-400' : 'text-indigo-600'}`}
                                    title={email}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {email}
                                  </a>
                                ) : (
                                  <span className={`block truncate ${muted}`}>—</span>
                                )}
                              </td>
                            );
                          }
                          if (colId === 'profilePic') {
                            return (
                              <td key={colId} className="py-1.5 px-1.5 align-top">
                                <img
                                  src={s.photo || DEFAULT_STAFF_PHOTO}
                                  alt=""
                                  className="h-8 w-8 rounded-full object-cover border border-slate-200"
                                />
                              </td>
                            );
                          }
                          if (colId === 'docs') {
                            return (
                              <td key={colId} className="py-1.5 px-1.5 align-top overflow-hidden">
                                <div className="flex flex-col gap-0.5 items-start w-fit max-w-full">
                                  <button
                                    type="button"
                                    onClick={() => handleViewStaffDocument(s)}
                                    disabled={isInactive}
                                    className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap transition-colors ${
                                      isInactive
                                        ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
                                    }`}
                                    title={
                                      rowDocCount
                                        ? `View ${rowDocCount} document(s)`
                                        : 'View documents (none uploaded yet)'
                                    }
                                  >
                                    View
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openStaffDocumentAddModal(s)}
                                    disabled={isInactive}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap transition-colors ${
                                      isInactive
                                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    }`}
                                  >
                                    Add
                                  </button>
                                </div>
                              </td>
                            );
                          }
                          if (colId === 'actions') {
                            return (
                              <td key={colId} className="py-1.5 px-1.5 align-top overflow-hidden">
                                <div className="flex flex-col gap-0.5 items-start w-fit max-w-full">
                                  <button
                                    type="button"
                                    onClick={() => !isInactive && openAssignActionModal(s, [s.id])}
                                    disabled={isInactive}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap transition-colors ${
                                      isInactive
                                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                    }`}
                                  >
                                    Assign
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEditStaff(s)}
                                    disabled={isInactive}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap transition-colors ${
                                      isInactive
                                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                        : 'bg-slate-600 hover:bg-slate-700 text-white'
                                    }`}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => !isInactive && requestTerminateStaff(s)}
                                    disabled={isInactive}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap transition-colors ${
                                      isInactive
                                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                        : 'bg-red-600 hover:bg-red-700 text-white'
                                    }`}
                                    title={`Delete ${s.name || 'employee'}`}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            );
                          }
                          if (colId === 'name') {
                            return (
                              <td key={colId} className="py-1.5 px-1.5 align-top overflow-hidden">
                                <div
                                  className={`font-semibold truncate max-w-[10rem] ${isInactive ? 'text-slate-500' : 'text-slate-900'}`}
                                  title={s.name || undefined}
                                >
                                  {s.name || '—'}
                                </div>
                              </td>
                            );
                          }
                          if (colId === 'skills') {
                            const skillLines = formatEmployeeSkillLines(s);
                            const titleText = skillLines.join(', ');
                            return (
                              <td
                                key={colId}
                                className="py-1.5 px-1.5 align-top"
                                style={{ width: '16rem', maxWidth: '16rem' }}
                              >
                                {skillLines.length > 0 ? (
                                  <ul
                                    className={`m-0 list-none space-y-1 p-0 text-[11px] leading-snug ${muted}`}
                                    title={titleText}
                                  >
                                    {skillLines.map((line, idx) => (
                                      <li
                                        key={`${line}-${idx}`}
                                        className="block whitespace-normal break-words"
                                        style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                                      >
                                        {line}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className={muted}>—</span>
                                )}
                              </td>
                            );
                          }
                          const textVal = getEmployeeCellText(s, colId);
                          return (
                            <td key={colId} className="py-1.5 px-1.5 align-top overflow-hidden">
                              <div
                                className={`truncate max-w-[10rem] ${muted}`}
                                title={textVal || undefined}
                              >
                                {textVal || '—'}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>

            {filteredStaff.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
                <div className="text-sm text-gray-600">
                  Showing{' '}
                  <span className="font-semibold">
                    {(currentPage - 1) * effectivePageSize + 1}-
                    {Math.min(
                      pageSize === 'all'
                        ? filteredStaff.length
                        : currentPage * effectivePageSize,
                      totalCount
                    )}
                  </span>{' '}
                  of <span className="font-semibold">{totalCount}</span> employees
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      if (previousUrl) {
                        setCurrentPage((prev) => prev - 1);
                        fetchStaff(previousUrl, searchTerm);
                      }
                    }}
                    disabled={!previousUrl || pageSize === 'all'}
                    className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                      !previousUrl || pageSize === 'all'
                        ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Previous
                  </button>
                  <span className="text-sm font-semibold text-gray-700">
                    Page {currentPage}
                    {totalCount > 0 && totalPages > 1 && pageSize !== 'all' ? ` of ${totalPages}` : ''}
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      if (nextUrl) {
                        setCurrentPage((prev) => prev + 1);
                        fetchStaff(nextUrl, searchTerm);
                      }
                    }}
                    disabled={!nextUrl || pageSize === 'all'}
                    className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                      !nextUrl || pageSize === 'all'
                        ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      )}

      {/* Assign Venue Modal */}
      {showAssignVenueModal && selectedStaffForVenue && (
        <div className="fixed inset-0 backdrop-blur-md bg-white/10 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto border border-black ">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Assign Venues to {selectedStaffForVenue.name}
            </h3>
            <div className="space-y-2 mb-4">
              {effectiveVenues.length === 0 ? (
                <p className="text-gray-500">No venues available.</p>
              ) : (
                effectiveVenues.map(venue => (
                  <label key={venue.id} className="flex items-center gap-3 p-3 border-2 border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedVenueIds.some(id => String(id) === String(venue.id))}
                      onChange={() => toggleVenueSelection(venue.id)}
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{venue.name}</div>
                      <div className="text-sm text-gray-600">{venue.locality || venue.location?.city || venue.location || venue.city || 'Location not specified'}</div>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAssignVenueModal(false);
                  setSelectedStaffForVenue(null);
                  setSelectedVenueIds([]);
                }}
                className="px-5 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={assignVenues}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold"
              >
                Assign Venues
              </button>
            </div>
          </div>
        </div>
      )}

      {canManageStaff && activeTab === 'add' && (
        addEmployeeStep === 2 && newlyCreatedStaff?.id ? (
          <AddEmployeeDocumentsStep
            employee={newlyCreatedStaff}
            onSkip={finishAddEmployeeDocsStep}
            onDone={finishAddEmployeeDocsStep}
            onAlert={showAlert}
          />
        ) : (
          <AddEmployeeForm
            form={form}
            setForm={setForm}
            isSubmitting={isSubmitting}
            formFeedback={formFeedback}
            onSubmit={addStaff}
            onBack={() => {
              setActiveTab('my');
              setAddEmployeeStep(1);
              setPendingAssignManagerAfterDocs(false);
              setNewlyCreatedStaff(null);
              setForm(getEmptyEmployeeForm());
              setFormFeedback({ type: null, message: '' });
            }}
            onInvalidPhoto={() => showAlert('Please select a valid image file.', 'warning')}
            stepLabel="Step 1 of 2"
          />
        )
      )}

      {/* Edit Employee Modal */}
      {showEditModal && selectedStaffForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="relative mx-4 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-4 sm:p-6">
            {isLoadingStaffDetails ? (
              <div className="absolute inset-0 z-[100] flex min-h-[12rem] items-center justify-center rounded-xl bg-white/95">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
                  <p className="text-lg font-semibold text-gray-700">Loading employee details...</p>
                </div>
              </div>
            ) : null}
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-gray-900">Edit Employee</h3>
              <button
                type="button"
                onClick={closeEditModal}
                className="text-2xl font-bold text-gray-500 hover:text-gray-700"
                aria-label="Close edit employee"
              >
                ×
              </button>
            </div>
            {!isLoadingStaffDetails ? (
              <AddEmployeeForm
                mode="edit"
                form={form}
                setForm={setForm}
                isSubmitting={isUpdatingStaff}
                formFeedback={formFeedback}
                onSubmit={handleUpdateStaff}
                onBack={closeEditModal}
                onInvalidPhoto={() => showAlert('Please select a valid image file.', 'warning')}
              />
            ) : (
              <div className="min-h-[12rem]" />
            )}
          </div>
        </div>
      )}

      {/* Assign Reporting Manager Modal */}
      {showAssignReportingManagerModal && newlyCreatedStaff && (
        <div className="fixed inset-0 backdrop-blur-md bg-white/10 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 border border-black">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Assign Reporting Manager</h3>
            <p className="text-gray-700 mb-6">
              Assign or update who <span className="font-semibold">{newlyCreatedStaff.name}</span> reports to.
            </p>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Select Reporting Manager
              </label>
              {isLoadingAssignableParents ? (
                <div className="py-3 text-sm text-gray-500">Loading managers...</div>
              ) : assignableParents.length === 0 ? (
                <div className="py-3 text-sm text-gray-500">
                  No assignable managers returned for this staff member.
                </div>
              ) : (
                <>
                  <select
                    value={selectedReportingManagerId}
                    onChange={(e) => setSelectedReportingManagerId(e.target.value)}
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">No Reporting Manager</option>
                    {assignableParents.map((parent) => (
                      <option key={parent.id} value={parent.id}>
                        {parent.name}
                        {typeof parent.level === 'number' ? ` (Level ${parent.level})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    Choose "No Reporting Manager" to keep this staff unassigned.
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleCloseAssignReportingManagerModal}
                className="px-5 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignReportingManager}
                disabled={isAssigningReportingManager || isLoadingAssignableParents || assignableParents.length === 0}
                className={`px-5 py-2 rounded-lg font-semibold text-white ${
                  isAssigningReportingManager || isLoadingAssignableParents || assignableParents.length === 0
                    ? 'bg-indigo-300 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {isAssigningReportingManager ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Venues List Modal */}
      {showVenuesListModal && selectedStaffForVenuesList && (
        <div className="fixed inset-0 backdrop-blur-md bg-white/10 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto border border-black">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              All Assigned Venues - {selectedStaffForVenuesList.name}
            </h3>
            <div className="space-y-2 mb-4">
              {selectedStaffForVenuesList.assignedVenues && selectedStaffForVenuesList.assignedVenues.length > 0 ? (
                selectedStaffForVenuesList.assignedVenues.map(venueId => {
                  const venue =
                    effectiveVenues.find(v => v.id === venueId || String(v.id) === String(venueId)) ||
                    selectedStaffForVenuesList.assignedVenuesDetailed?.find(v => v.id === venueId || String(v.id) === String(venueId));
                  if (!venue) {
                    return (
                      <div key={venueId} className="p-3 border-2 border-gray-200 rounded-lg">
                        <div className="font-semibold text-gray-900">Venue #{venueId}</div>
                        <div className="text-sm text-gray-600">Location not specified</div>
                      </div>
                    );
                  }
                  return (
                    <div key={venueId} className="p-3 border-2 border-gray-200 rounded-lg">
                      <div className="font-semibold text-gray-900">{venue.name}</div>
                      <div className="text-sm text-gray-600">{venue.city || venue.locality || venue.location?.city || venue.location || 'Location not specified'}</div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500">No venues assigned.</p>
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setShowVenuesListModal(false);
                  setSelectedStaffForVenuesList(null);
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign action popup */}
      {assignActionModalStaff && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Assign</p>
                <p className="text-lg font-bold text-gray-900">
                  {assignStaffIds.length > 1
                    ? `${assignStaffIds.length} staff selected`
                    : assignActionModalStaff?.name || 'Staff'}
                </p>
              </div>
              <button
                onClick={closeAssignActionModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              {assignModalStep === 'options' && (
                <>
                  {ASSIGNMENT_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => handleAssignOptionSelect(option.key)}
                      className="w-full text-left px-4 py-3 border border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition"
                    >
                      <div className="text-base font-semibold text-gray-900">{option.label}</div>
                      <div className="text-xs text-gray-500">{option.description}</div>
                    </button>
                  ))}
                </>
              )}

              {assignModalStep === 'entities' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Assign</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {ASSIGN_CATEGORY_LABELS[selectedAssignCategory] || 'Entities'}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setAssignModalStep('options');
                        setSelectedAssignCategory(null);
                        setAssignableEntities([]);
                        setAssignableEntitiesError('');
                        setSelectedAssignableEntityId('');
                        setIsAssigningEntity(false);
                      }}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      ← Back
                    </button>
                  </div>

                  {assignableEntitiesError && (
                    <div className="p-3 border border-red-200 rounded-lg text-sm text-red-700 bg-red-50">
                      {assignableEntitiesError}
                    </div>
                  )}

                  {isLoadingAssignableEntities ? (
                    <div className="text-center py-6 text-sm text-gray-600">Loading options...</div>
                  ) : assignableEntities.length > 0 ? (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-700">
                        Select {ASSIGN_CATEGORY_LABELS[selectedAssignCategory] || 'item'}
                      </label>
                      <select
                        value={selectedAssignableEntityId}
                        onChange={(e) => setSelectedAssignableEntityId(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">Choose an option</option>
                        {assignableEntities.map((entity) => (
                          <option key={entity.id} value={entity.id}>
                            {entity.name}
                            {entity.city ? ` — ${entity.city}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 text-center py-4">
                      No assignable {ASSIGN_CATEGORY_LABELS[selectedAssignCategory]?.toLowerCase() || 'items'} found.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeAssignActionModal}
                disabled={isAssigningEntity || isLoadingAssignableEntities}
                className={`px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 ${
                  isAssigningEntity || isLoadingAssignableEntities ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              >
                Cancel
              </button>
              {assignModalStep === 'entities' && (
                <button
                  onClick={handleConfirmEntityAssignment}
                  disabled={
                    isAssigningEntity ||
                    isLoadingAssignableEntities ||
                    !selectedAssignableEntityId
                  }
                  className={`px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 ${
                    isAssigningEntity ||
                    isLoadingAssignableEntities ||
                    !selectedAssignableEntityId
                      ? 'opacity-60 cursor-not-allowed'
                      : ''
                  }`}
                >
                  {isAssigningEntity ? 'Assigning...' : 'Assign'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
      {staffDocViewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col p-6">
            <h3 className="text-lg font-bold text-gray-900">Staff documents</h3>
            <p className="mt-1 text-sm text-gray-600">
              {staffDocViewTarget.name || 'Staff member'}
              {staffDocViewedList.length > 0
                ? ` — ${staffDocViewedList.length} document${staffDocViewedList.length === 1 ? '' : 's'}`
                : ' — no documents yet'}
            </p>
            {isLoadingStaffDocuments && (
              <p className="mt-2 text-xs text-indigo-600">Loading documents...</p>
            )}
            {staffDocViewedList.length === 0 ? (
              <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 px-4 text-center">
                <p className="text-sm text-gray-600">Upload PDF, Excel, or image files for this staff member.</p>
                <button
                  type="button"
                  onClick={handleUploadFromStaffDocumentView}
                  className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                >
                  Upload documents
                </button>
              </div>
            ) : (
            <div className="mt-4 flex-1 min-h-0 flex flex-col sm:flex-row gap-4 overflow-hidden">
              <ul className="sm:w-56 shrink-0 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-[40vh] sm:max-h-none">
                {staffDocViewedList.map(doc => {
                  const isSelected = doc.id === staffDocSelectedId;
                  const uploadedLabel = doc.uploadedAt
                    ? new Date(doc.uploadedAt).toLocaleDateString()
                    : '';
                  return (
                    <li key={doc.id}>
                      <div
                        className={`w-full px-3 py-2.5 text-sm transition-colors ${
                          isSelected
                            ? 'bg-indigo-50 text-indigo-900 font-semibold'
                            : 'hover:bg-gray-50 text-gray-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setStaffDocSelectedId(doc.id);
                              setStaffDocSelectedFileId(doc.files?.[0]?.id ?? null);
                            }}
                            className="text-left min-w-0 flex-1"
                          >
                            <span className="block truncate" title={doc.title || 'Document'}>
                              {doc.title || 'Document'}
                              {doc.fileCount > 1 ? ` +${doc.fileCount - 1}` : ''}
                            </span>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openStaffDocumentEditModal(doc)}
                              disabled={staffDocViewDeleting}
                              className="px-1.5 py-0.5 text-[10px] rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteStaffDocumentByDoc(doc)}
                              disabled={staffDocViewDeleting}
                              className="px-1.5 py-0.5 text-[10px] rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        {uploadedLabel && (
                          <span className="block text-xs text-gray-500 mt-0.5 font-normal">
                            {uploadedLabel}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
                {staffDocViewedDoc?.files?.length > 1 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {staffDocViewedDoc.files.map((file) => {
                      const isFileSelected = file.id === staffDocViewedFile?.id;
                      return (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => setStaffDocSelectedFileId(file.id)}
                          className={`px-2 py-1 rounded text-xs border ${
                            isFileSelected
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {file.fileName}
                        </button>
                      );
                    })}
                  </div>
                )}
                {staffDocViewedFile?.url &&
                  String(staffDocViewedFile.mimeType || '').startsWith('image/') && (
                    <img
                      src={staffDocViewedFile.url}
                      alt={staffDocViewedFile.fileName || 'Staff document'}
                      className="max-w-full h-auto mx-auto rounded"
                    />
                  )}
                {staffDocViewedFile?.url &&
                  String(staffDocViewedFile.mimeType || '').includes('pdf') &&
                  !String(staffDocViewedFile.mimeType || '').startsWith('image/') && (
                    <iframe
                      title={staffDocViewedFile.fileName || 'Staff document'}
                      src={staffDocViewedFile.url}
                      className="w-full h-[min(50vh,420px)] rounded bg-white"
                    />
                  )}
                {staffDocViewedFile?.url &&
                  !String(staffDocViewedFile.mimeType || '').startsWith('image/') &&
                  !String(staffDocViewedFile.mimeType || '').includes('pdf') && (
                    <p className="text-sm text-gray-600 text-center py-8">
                      Preview not available for this file type. Use Download to open the file.
                    </p>
                  )}
              </div>
            </div>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeStaffDocumentViewModal}
                disabled={staffDocViewDeleting}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Close
              </button>
              {staffDocViewedList.length > 0 && (
                <button
                  type="button"
                  onClick={handleUploadFromStaffDocumentView}
                  disabled={staffDocViewDeleting}
                  className="px-4 py-2 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-semibold hover:bg-emerald-50 disabled:opacity-60"
                >
                  Upload more
                </button>
              )}
              <button
                type="button"
                onClick={handleDownloadStaffDocument}
                disabled={staffDocViewDeleting || !staffDocViewedFile?.url}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      {staffDocAddTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900">
              {staffDocEditTarget ? 'Edit staff document' : 'Add staff document'}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {staffDocAddTarget.name || 'Staff member'} — PDF, Excel, or images.
              Combined total limit: {STAFF_DOCUMENT_MAX_UPLOAD_MB} MB.
            </p>
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={staffDocTitle}
                onChange={(e) => setStaffDocTitle(e.target.value)}
                placeholder="e.g. Aadhar"
                disabled={staffDocSaving}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <label className="block text-xs font-semibold text-gray-700 mt-3 mb-1">Remarks</label>
              <input
                type="text"
                value={staffDocRemarks}
                onChange={(e) => setStaffDocRemarks(e.target.value)}
                placeholder="Optional remarks"
                disabled={staffDocSaving}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <input
                type="file"
                multiple
                accept={STAFF_DOCUMENT_ACCEPT}
                disabled={staffDocAddCompressing || staffDocSaving}
                onChange={handleStaffDocumentFileSelect}
                className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {staffDocAddCompressing && (
                <p className="mt-2 text-xs text-indigo-600">Compressing file(s)...</p>
              )}
              {staffDocAddFiles.length > 0 && !staffDocAddCompressing && (
                <ul className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {staffDocAddFiles.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-gray-700"
                    >
                      <span className="truncate" title={file.name}>
                        {file.name} ({(file.size / 1024).toFixed(0)} KB)
                      </span>
                      <button
                        type="button"
                        onClick={() => removeStaffDocAddFile(index)}
                        disabled={staffDocSaving}
                        className="shrink-0 text-red-600 hover:text-red-700 font-semibold disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeStaffDocumentAddModal}
                disabled={staffDocSaving}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveStaffDocument}
                disabled={staffDocSaving || staffDocAddCompressing || (!staffDocEditTarget && !staffDocAddFiles.length)}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {staffDocSaving
                  ? 'Uploading...'
                  : staffDocEditTarget
                    ? 'Update'
                    : staffDocAddFiles.length > 1
                    ? `Upload ${staffDocAddFiles.length} files`
                    : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

    <EmployeeBulkUploadModal
      open={showBulkUploadModal}
      onClose={() => setShowBulkUploadModal(false)}
      onSuccess={(_data, message) => {
        showAlert(message || 'Bulk upload completed successfully.', 'success');
        setCurrentPage(1);
        fetchStaff(null, searchTerm);
      }}
    />
    <AlertModal open={alertState.open} type={alertState.type} message={alertState.message} onClose={closeAlert} />
    {revokeConfirm.open && (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="revoke-title"
        aria-describedby="revoke-message"
      >
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => {
            if (!isRevokingTermination) closeRevokeConfirm();
          }}
        />
        <div
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-emerald-200/50 px-6 pb-4 pt-6">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
                <FiAlertTriangle className="h-6 w-6 text-emerald-700" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <h3 id="revoke-title" className="text-lg font-semibold text-emerald-900">
                  Revoke termination
                </h3>
                <p id="revoke-message" className="mt-1 text-sm leading-relaxed text-gray-600">
                  Revoke termination for{' '}
                  <span className="font-medium text-gray-800">{revokeConfirm.name}</span>.
                  Choose whether they are rehired, then confirm.
                </p>
              </div>
              <button
                type="button"
                onClick={closeRevokeConfirm}
                disabled={isRevokingTermination}
                className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
                aria-label="Close"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="space-y-4 px-6 py-4">
            <fieldset disabled={isRevokingTermination}>
              <legend className="mb-2 text-sm font-medium text-gray-700">
                Rehired status
              </legend>
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="revoke-rehired"
                    checked={revokeConfirm.rehiredStatus === true}
                    onChange={() =>
                      setRevokeConfirm((prev) => ({ ...prev, rehiredStatus: true }))
                    }
                    className="h-4 w-4 border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Yes (True)
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="revoke-rehired"
                    checked={revokeConfirm.rehiredStatus === false}
                    onChange={() =>
                      setRevokeConfirm((prev) => ({ ...prev, rehiredStatus: false }))
                    }
                    className="h-4 w-4 border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  No (False)
                </label>
              </div>
            </fieldset>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={confirmRevokeTermination}
                disabled={isRevokingTermination}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isRevokingTermination ? 'Please wait…' : 'Revoke Termination'}
              </button>
              <button
                type="button"
                onClick={closeRevokeConfirm}
                disabled={isRevokingTermination}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    {terminateConfirm.open && (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminate-title"
        aria-describedby="terminate-message"
      >
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => {
            if (!terminateConfirm.loading) closeTerminateConfirm();
          }}
        />
        <div
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-red-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-red-200/50 px-6 pb-4 pt-6">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <FiAlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <h3 id="terminate-title" className="text-lg font-semibold text-red-800">
                  Terminate employee
                </h3>
                <p id="terminate-message" className="mt-1 text-sm leading-relaxed text-gray-600">
                  Enter details and choose how to terminate{' '}
                  <span className="font-medium text-gray-800">{terminateConfirm.name}</span>.
                  This action cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={closeTerminateConfirm}
                disabled={terminateConfirm.loading}
                className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
                aria-label="Close"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="space-y-4 px-6 py-4">
            <div>
              <label htmlFor="terminate-reason" className="mb-1.5 block text-sm font-medium text-gray-700">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                id="terminate-reason"
                rows={3}
                value={terminateConfirm.reason}
                disabled={terminateConfirm.loading}
                onChange={(e) =>
                  setTerminateConfirm((prev) => ({
                    ...prev,
                    reason: e.target.value,
                    fieldError: '',
                  }))
                }
                placeholder="e.g. Employee Resigned"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:bg-gray-50"
              />
            </div>
            <div>
              <label
                htmlFor="terminate-lwd"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Last working day <span className="text-red-500">*</span>
              </label>
              <input
                id="terminate-lwd"
                type="date"
                value={terminateConfirm.lastWorkingDay}
                disabled={terminateConfirm.loading}
                onChange={(e) =>
                  setTerminateConfirm((prev) => ({
                    ...prev,
                    lastWorkingDay: e.target.value,
                    fieldError: '',
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:bg-gray-50"
              />
            </div>
            {terminateConfirm.fieldError ? (
              <p className="text-sm text-red-600" role="alert">
                {terminateConfirm.fieldError}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={confirmVoluntaryTermination}
                disabled={terminateConfirm.loading}
                className="w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 shadow-sm transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {terminateConfirm.loading && terminateConfirm.loadingType === 'voluntary'
                  ? 'Please wait…'
                  : 'Voluntary Terminate'}
              </button>
              <button
                type="button"
                onClick={confirmInvoluntaryTermination}
                disabled={terminateConfirm.loading}
                className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {terminateConfirm.loading && terminateConfirm.loadingType === 'involuntary'
                  ? 'Please wait…'
                  : 'Involuntary Termination'}
              </button>
              <button
                type="button"
                onClick={closeTerminateConfirm}
                disabled={terminateConfirm.loading}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default StaffDashboard;


