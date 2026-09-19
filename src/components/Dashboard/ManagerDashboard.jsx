import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import AlertModal from '../AlertModal';
import { compressFileForUpload } from '../../utils/compressUploadFiles';
import { hasOwnerPrivileges } from '../../utils/authRoles';
import {
  buildEmployeeExportSubtitle,
  employeeToExportRow,
  exportEmployeeListExcel,
  exportEmployeeListPdf,
} from '../../utils/employeeListExport';
import {
  buildEmployeesListUrl,
  getEmployeeCategoryLabel,
  getEmployeeStatusLabel,
} from '../../utils/employeeListQuery';
import EmployeeCategoryFilterButton from './EmployeeCategoryFilterButton';
import EmployeeStatusFilterButton from './EmployeeStatusFilterButton';
import EmployeeActiveToggle from './EmployeeActiveToggle';

const DEFAULT_MANAGER_PHOTO = 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8cHJvZmlsZXxlbnwwfHwwfHx8MA%3D%3D';

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
  High: 1,
  Medium: 2,
  Low: 3,
};

const priorityNumberToLabel = (value) => {
  if (value === 1) return 'High';
  if (value === 2) return 'Medium';
  if (value === 3) return 'Low';
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
  if (!label) return fallback;
  const normalized = PRIORITY_LABEL_TO_NUMBER[label];
  if (normalized) return normalized;
  const numericValue = parseInt(label, 10);
  return Number.isNaN(numericValue) ? fallback : numericValue;
};

const resolveNextPageUrl = (payload) => {
  if (!payload) return null;
  return (
    payload.next ||
    payload.links?.next ||
    payload.data?.next ||
    payload.data?.links?.next ||
    null
  );
};

const ITEMS_PER_PAGE = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MANAGER_DOCUMENT_MAX_UPLOAD_MB = 5;
const MANAGER_DOCUMENT_ACCEPT =
  'image/*,.pdf,.doc,.docx,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const inferManagerDocMimeTypeFromName = (nameOrUrl) => {
  const value = String(nameOrUrl || '').toLowerCase();
  if (value.endsWith('.pdf')) return 'application/pdf';
  if (value.endsWith('.png')) return 'image/png';
  if (value.endsWith('.jpg') || value.endsWith('.jpeg')) return 'image/jpeg';
  if (value.endsWith('.gif')) return 'image/gif';
  if (value.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
};

const extractManagerFileNameFromUrl = (url) => {
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

const normalizeApiManagerDocEntry = (entry, index) => {
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
        extractManagerFileNameFromUrl(rawUrl) ||
        `file-${fileIndex + 1}`;

      return {
        id: String(fileEntry?.id || `${documentId || `doc-${index}`}-${fileIndex}`),
        fileName,
        mimeType:
          fileEntry?.mime_type ||
          fileEntry?.content_type ||
          fileEntry?.file_type ||
          inferManagerDocMimeTypeFromName(rawUrl || fileName),
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
  {
    key: 'venues',
    label: 'Venues',
    description: 'Allocate venues to this manager',
  },
  {
    key: 'services',
    label: 'Services',
    description: 'Assign service responsibilities',
  },
  {
    key: 'resources',
    label: 'Resources',
    description: 'Map resource ownership',
  },
];

const validateAddManagerForm = (formState) => {
  const trimmedFirstName = formState.firstName?.trim();
  if (!trimmedFirstName) return 'First Name is required.';

  const trimmedLastName = formState.lastName?.trim();
  if (!trimmedLastName) return 'Last Name is required.';

  const email = formState.email?.trim();
  if (email && !EMAIL_REGEX.test(email)) return 'Please enter a valid email address.';

  const mobile = formState.mobile?.trim();
  if (!mobile) return 'Mobile number is required.';
  const mobileDigits = mobile.replace(/\D/g, '');
  if (mobileDigits.length < 10) {
    return 'Please enter a valid mobile number with at least 10 digits.';
  }

  const password = formState.password || '';
  if (!password) return 'Password is required.';
  if (password.length < 6) return 'Password must be at least 6 characters long.';

  const confirmPassword = formState.confirmPassword || '';
  if (!confirmPassword) return 'Confirm Password is required.';
  if (password !== confirmPassword) return 'Password and Confirm Password must match.';

  const baseCity = formState.empBaseLocation?.trim();
  if (!baseCity) return 'Base City is required.';

  const address = formState.address?.trim();
  if (!address) return 'Address is required.';

  const gender = formState.empGender?.trim();
  if (!gender) return 'Gender is required.';

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
        const nested = extractApiErrorMessage(value, null, statusCode);
        if (nested) {
          return nested;
        }
      }
    }
  }

  return fallbackMessage;
};

const ManagerDashboard = () => {
  const [authUser, setAuthUser] = useState(null);
  const [activeTab, setActiveTab] = useState('my'); // my | add
  const [managers, setManagers] = useState([]);
  const [isLoadingManagers, setIsLoadingManagers] = useState(false);
  const [managersError, setManagersError] = useState('');
  const [alertState, setAlertState] = useState({ open: false, type: 'info', message: '' });
  const [terminateConfirm, setTerminateConfirm] = useState({
    open: false,
    id: null,
    name: '',
    loading: false,
  });
  const showAlert = useCallback((message, type = 'info') => {
    setAlertState({ open: true, type, message: String(message) });
  }, []);
  const closeAlert = useCallback(() => setAlertState(prev => ({ ...prev, open: false })), []);
  const closeTerminateConfirm = useCallback(() => {
    setTerminateConfirm((prev) => (prev.loading ? prev : { open: false, id: null, name: '', loading: false }));
  }, []);
  const [form, setForm] = useState({ 
    firstName: '', 
    middleName: '', 
    lastName: '', 
    address: '', 
    mobile: '', 
    email: '', 
    emergencyContactNumber: '', 
    reportingManagerId: '',
    joiningDate: '',
    empLevel: '',
    empBaseLocation: '',
    empCategory: '',
    workDepartment: '',
    empGender: '',
    empActive: true,
    lastWorkingDay: '',
    skill1: '',
    skill1Priority: '',
    skill1Experience: '',
    skill2: '',
    skill2Priority: '',
    skill2Experience: '',
    skill3: '',
    skill3Priority: '',
    skill3Experience: '',
    photo: null, // Changed to File object
    password: '',
    confirmPassword: '',
    verified_document: null,
  });
  const [showAssignVenueModal, setShowAssignVenueModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignReportingManagerModal, setShowAssignReportingManagerModal] = useState(false);
  const [showVenuesListModal, setShowVenuesListModal] = useState(false);
  const [selectedManagerForVenue, setSelectedManagerForVenue] = useState(null);
  const [selectedManagerForEdit, setSelectedManagerForEdit] = useState(null);
  const [selectedManagerForVenuesList, setSelectedManagerForVenuesList] = useState(null);
  const [newlyCreatedManager, setNewlyCreatedManager] = useState(null);
  const [selectedReportingManagerId, setSelectedReportingManagerId] = useState('');
  const [selectedVenueIds, setSelectedVenueIds] = useState([]);
  const [assignActionModalManager, setAssignActionModalManager] = useState(null);
  const [assignModalStep, setAssignModalStep] = useState('options'); // options | entities
  const [selectedAssignCategory, setSelectedAssignCategory] = useState(null);
  const [assignableEntities, setAssignableEntities] = useState([]);
  const [isLoadingAssignableEntities, setIsLoadingAssignableEntities] = useState(false);
  const [assignableEntitiesError, setAssignableEntitiesError] = useState('');
  const [selectedAssignableEntityId, setSelectedAssignableEntityId] = useState('');
  const [isAssigningEntity, setIsAssigningEntity] = useState(false);
  const [selectedManagerIds, setSelectedManagerIds] = useState([]);
  const [assignManagerIds, setAssignManagerIds] = useState([]);
  const [managerDocAddTarget, setManagerDocAddTarget] = useState(null);
  const [managerDocAddFiles, setManagerDocAddFiles] = useState([]);
  const [managerDocEditTarget, setManagerDocEditTarget] = useState(null);
  const [managerDocTitle, setManagerDocTitle] = useState('');
  const [managerDocRemarks, setManagerDocRemarks] = useState('');
  const [managerDocAddCompressing, setManagerDocAddCompressing] = useState(false);
  const [managerApiDocsByUser, setManagerApiDocsByUser] = useState({});
  const [isLoadingManagerDocuments, setIsLoadingManagerDocuments] = useState(false);
  const [managerDocSaving, setManagerDocSaving] = useState(false);
  const [managerDocViewTarget, setManagerDocViewTarget] = useState(null);
  const [managerDocSelectedId, setManagerDocSelectedId] = useState(null);
  const [managerDocSelectedFileId, setManagerDocSelectedFileId] = useState(null);
  const [managerDocViewDeleting, setManagerDocViewDeleting] = useState(false);

  const normalizeManagerIdList = (ids) => {
    if (!ids || ids.length === 0) return [];
    const normalizedList = [];
    const seen = new Set();
    ids.forEach((id) => {
      if (id === null || id === undefined) return;
      const numeric = Number(id);
      const normalized = Number.isNaN(numeric) ? String(id) : numeric;
      const key = String(normalized);
      if (!seen.has(key)) {
        seen.add(key);
        normalizedList.push(normalized);
      }
    });
    return normalizedList;
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdatingManager, setIsUpdatingManager] = useState(false);
  const [isLoadingManagerDetails, setIsLoadingManagerDetails] = useState(false);
  const [formFeedback, setFormFeedback] = useState({ type: null, message: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [assignableParents, setAssignableParents] = useState([]);
  const [isLoadingAssignableParents, setIsLoadingAssignableParents] = useState(false);
  const [isAssigningReportingManager, setIsAssigningReportingManager] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [togglingManagerActiveId, setTogglingManagerActiveId] = useState(null);
  const [nextUrl, setNextUrl] = useState(null);
  const [previousUrl, setPreviousUrl] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  
  // Get venues from Redux store
  const venues = useSelector(state => state.venues.venues || []);

  const fetchManagers = useCallback(async (url = null, searchQuery = '') => {
    const accessToken = localStorage.getItem('access_token');

    if (!accessToken) {
      setManagers([]);
      setManagersError('Authorization token missing. Please log in again.');
      return;
    }

    setIsLoadingManagers(true);
    setManagersError('');

    const extractManagersArray = (payload) => {
      if (!payload) return [];
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload.results)) return payload.results;
      if (Array.isArray(payload.data)) return payload.data;
      if (Array.isArray(payload.data?.results)) return payload.data.results;
      return [];
    };

    try {
      const apiUrl = buildEmployeesListUrl(url, searchQuery, categoryFilter, statusFilter);

      const response = await axios.get(apiUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const managersPayload = extractManagersArray(response.data);
      
      // Store pagination URLs
      setNextUrl(response.data?.next || null);
      setPreviousUrl(response.data?.previous || null);
      setTotalCount(response.data?.count || managersPayload.length);

      // Normalize managers data efficiently
      const normalizedManagers = managersPayload
        .map(normalizeManagerFromApi)
        .filter(Boolean);

      setManagers(normalizedManagers);
    } catch (error) {
      console.error('Error fetching managers:', error);
      const responseData = error.response?.data;
      const statusCode = error.response?.status;
      const message = extractApiErrorMessage(responseData, error.message || 'Failed to fetch managers.', statusCode);

      setManagersError(message);
      setManagers([]);
    } finally {
      setIsLoadingManagers(false);
    }
  }, [categoryFilter, statusFilter]);

  useEffect(() => {
    if (selectedManagerIds.length === 0) return;
    setSelectedManagerIds(prev =>
      prev.filter(selectedId =>
        managers.some(manager => String(manager.id) === String(selectedId))
      )
    );
  }, [managers]);

  const buildSkillsPayloadFromForm = (formState) => {
    const skillEntries = [
      {
        skill: formState.skill1?.trim(),
        priorityLabel: formState.skill1Priority,
        experience: formState.skill1Experience?.trim(),
      },
      {
        skill: formState.skill2?.trim(),
        priorityLabel: formState.skill2Priority,
        experience: formState.skill2Experience?.trim(),
      },
      {
        skill: formState.skill3?.trim(),
        priorityLabel: formState.skill3Priority,
        experience: formState.skill3Experience?.trim(),
      },
    ];

    return skillEntries
      .map((entry, index) => ({
        skill: entry.skill,
        priority: priorityLabelToNumber(entry.priorityLabel, index + 1),
        experience: entry.experience || '',
      }))
      .filter(entry => entry.skill);
  };

  const buildManagerApiPayload = (formState, options = {}) => {
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

  const createManagerFromFormState = (formState, overrides = {}) => {
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
      userPersona: 'MANAGER',
      reportingManagerId: formState.reportingManagerId || null,
      joiningDate: formState.joiningDate,
      empLevel: formState.empLevel,
      empBaseLocation: formState.empBaseLocation,
      empCategory: formState.empCategory,
      workDepartment: formState.workDepartment,
      empGender: formState.empGender,
      empActive: formState.empActive,
      lastWorkingDay: formState.lastWorkingDay,
      skill1: formState.skill1,
      skill1Priority: formState.skill1Priority,
      skill1Experience: formState.skill1Experience,
      skill2: formState.skill2,
      skill2Priority: formState.skill2Priority,
      skill2Experience: formState.skill2Experience,
      skill3: formState.skill3,
      skill3Priority: formState.skill3Priority,
      skill3Experience: formState.skill3Experience,
      skills: skillsArray,
      photo: formState.photo || DEFAULT_MANAGER_PHOTO,
      assignedVenues: overrides.assignedVenues || [],
    };
  };

  const normalizeSkillsFromApi = (skills) => {
    if (!Array.isArray(skills)) return [];
    return skills
      .map((item, index) => {
        if (typeof item === 'string') {
          return {
            skill: item.trim(),
            priority: index + 1,
            experience: '',
          };
        }

        return {
          skill: item?.skill?.trim() || '',
          priority: priorityLabelToNumber(item?.priority, index + 1),
          experience: item?.experience?.trim() || '',
        };
      })
      .filter(item => item.skill);
  };

  const normalizeManagerFromApi = (data) => {
    if (!data) return null;

    const normalizedSkills = normalizeSkillsFromApi(data.skills);
    const parentInfo = data.reports_to;
    const [skill1Data, skill2Data, skill3Data] = [...normalizedSkills, {}, {}, {}];

    const fullName = [data.first_name, data.middle_name, data.last_name]
      .filter(Boolean)
      .join(' ');

    const managedVenues = Array.isArray(data.managed_venues) ? data.managed_venues : [];
    const managedVenueIds = managedVenues.map(venue => {
      if (venue && typeof venue === 'object') {
        return venue.id ?? venue.object_id ?? Date.now();
      }
      return venue ?? Date.now();
    });

    return {
      id: data.id ?? Date.now(),
      employeeId: data.employee_id || '',
      name: fullName || data.name || 'New Manager',
      firstName: data.first_name || '',
      middleName: data.middle_name || '',
      lastName: data.last_name || '',
      address: data.address || '',
      mobile: data.mobile_number || data.phone || '',
      phone: data.mobile_number || data.phone || '',
      email: data.email || '',
      emergencyContactNumber: data.emergency_contact || '',
      userPersona: 'MANAGER',
      reportingManagerId: parentInfo?.id ?? data.reporting_manager ?? null,
      assignedManager: parentInfo?.name || data.assigned_manager || null,
      joiningDate: data.date_joined || '',
      empLevel: data.emp_level || '',
      empBaseLocation: data.city || '',
      empCategory: data.category || '',
      workDepartment: data.department || '',
      empGender: mapGenderCodeToLabel(data.gender) || '',
      empActive: data.is_active !== undefined ? data.is_active : true,
      lastWorkingDay: data.last_working_day || '',
      skill1: skill1Data.skill || '',
      skill1Priority: priorityNumberToLabel(skill1Data.priority) || '',
      skill1Experience: skill1Data.experience || '',
      skill2: skill2Data.skill || '',
      skill2Priority: priorityNumberToLabel(skill2Data.priority) || '',
      skill2Experience: skill2Data.experience || '',
      skill3: skill3Data.skill || '',
      skill3Priority: priorityNumberToLabel(skill3Data.priority) || '',
      skill3Experience: skill3Data.experience || '',
      skills: normalizedSkills,
      photo: data.profile_pic || data.photo || DEFAULT_MANAGER_PHOTO,
      assignedVenues: managedVenueIds.length > 0
        ? managedVenueIds
        : data.assigned_venues || data.assignedVenues || [],
      managedVenuesDetailed: managedVenues.length > 0 ? managedVenues : undefined,
    };
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

  useEffect(() => {
    if (activeTab !== 'add' && formFeedback.type) {
      setFormFeedback({ type: null, message: '' });
    }
  }, [activeTab, formFeedback.type]);

  // Venues are now loaded from Redux store, no need to fetch separately

  const isVsreOwner = useMemo(() => hasOwnerPrivileges(authUser), [authUser]);

  useEffect(() => {
    if (isVsreOwner) {
      setCurrentPage(1);
      fetchManagers(null, searchTerm);
    } else {
      setManagers([]);
      setManagersError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVsreOwner, categoryFilter, statusFilter]);

  // Use managers directly (no client-side filtering since we use API search)
  const filteredManagers = useMemo(() => {
    return managers;
  }, [managers]);

  // Handle search button click or Enter key press
  const handleSearchManagers = () => {
    // Reset to page 1 when searching
    setCurrentPage(1);
    fetchManagers(null, searchTerm);
  };

  // Reset to page 1 when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
  }, [totalCount]);

  const hasMultiplePages = totalPages > 1;

  const managerExportRows = useMemo(
    () => filteredManagers.map(employeeToExportRow),
    [filteredManagers]
  );

  const managerExportSubtitle = useMemo(
    () =>
      buildEmployeeExportSubtitle({
        exportedCount: filteredManagers.length,
        totalCount,
        currentPage,
        searchTerm,
      }),
    [filteredManagers.length, totalCount, currentPage, searchTerm]
  );

  const handleExportManagerPdf = () => {
    if (!managerExportRows.length) {
      showAlert('No managers to export on this page.', 'info');
      return;
    }
    try {
      exportEmployeeListPdf({
        title: 'Manager List',
        subtitle: managerExportSubtitle,
        rows: managerExportRows,
      });
    } catch (error) {
      console.error('Manager PDF export failed:', error);
      showAlert(error.message || 'Unable to export PDF.', 'error');
    }
  };

  const handleExportManagerExcel = () => {
    if (!managerExportRows.length) {
      showAlert('No managers to export on this page.', 'info');
      return;
    }
    try {
      exportEmployeeListExcel({
        rows: managerExportRows,
        sheetName: 'Managers',
        fileNamePrefix: 'manager-list',
      });
    } catch (error) {
      console.error('Manager Excel export failed:', error);
      showAlert(error.message || 'Unable to export Excel file.', 'error');
    }
  };
  const shouldShowPagination = filteredManagers.length > 0;

  const paginatedManagers = filteredManagers;

  const addManager = async () => {
    if (!isVsreOwner) {
      setFormFeedback({ type: 'error', message: 'Only owners can add managers.' });
      return;
    }

    setFormFeedback({ type: null, message: '' });

    const validationError = validateAddManagerForm(form);
    if (validationError) {
      setFormFeedback({ type: 'error', message: validationError });
      return;
    }

    if (!form.empCategory) {
      setFormFeedback({ type: 'error', message: 'Please select an employee category.' });
      return;
    }

    const payload = buildManagerApiPayload(form, { includeCredentials: true });

    const accessToken = localStorage.getItem('access_token');

    if (!accessToken) {
      setFormFeedback({ type: 'error', message: 'Authorization token missing. Please log in again.' });
      return;
    }

    setIsSubmitting(true);

    try {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
      };

      // If payload is FormData, don't set Content-Type (browser will set it with boundary)
      if (!(payload instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/accounts/vsre-manager/`,
        payload,
        {
          headers,
        }
      );

      const responseData = response.data?.data || response.data;
      const normalizedManager = normalizeManagerFromApi(responseData);
      const managerForModal = normalizedManager || createManagerFromFormState(form, { id: responseData?.id });
      const successMessage = response.data?.message || 'Manager created successfully.';

      setForm({ 
        firstName: '', 
        middleName: '', 
        lastName: '', 
        address: '', 
        mobile: '', 
        email: '', 
        emergencyContactNumber: '', 
        reportingManagerId: '',
        joiningDate: '',
        empLevel: '',
        empBaseLocation: '',
        empCategory: '',
        workDepartment: '',
        empGender: '',
        empActive: true,
        lastWorkingDay: '',
        skill1: '',
        skill1Priority: '',
        skill1Experience: '',
        skill2: '',
        skill2Priority: '',
        skill2Experience: '',
        skill3: '',
        skill3Priority: '',
        skill3Experience: '',
        photo: null,
        password: '',
        confirmPassword: '',
        verified_document: null,
      });

      setFormFeedback({ type: 'success', message: successMessage });
      setActiveTab('my');

      await fetchManagers(null, searchTerm);
    } catch (error) {
      console.error('Error creating manager:', error);
      const responseData = error.response?.data;
      const statusCode = error.response?.status;
      const message = extractApiErrorMessage(responseData, error.message || 'Failed to add manager.', statusCode);

      setFormFeedback({ type: 'error', message });
      showAlert(message, 'info');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleManagerActiveStatus = async (manager, nextActive) => {
    if (!manager?.id) {
      showAlert('Manager ID is missing. Cannot update status.', 'warning');
      return;
    }
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setTogglingManagerActiveId(manager.id);

    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      await axios.patch(
        `${baseUrl}/accounts/vsre-manager/${manager.id}/`,
        { is_active: nextActive },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (statusFilter) {
        await fetchManagers(null, searchTerm);
      } else {
        setManagers((prev) =>
          prev.map((item) =>
            String(item.id) === String(manager.id)
              ? { ...item, empActive: nextActive }
              : item,
          ),
        );
      }

      setSelectedManagerIds((prev) =>
        prev.filter((id) => String(id) !== String(manager.id) || nextActive),
      );

      showAlert(
        `Manager ${nextActive ? 'activated' : 'deactivated'} successfully.`,
        'success',
      );
    } catch (error) {
      console.error('Error updating manager status:', error);
      const responseData = error.response?.data;
      const statusCode = error.response?.status;
      const message = extractApiErrorMessage(
        responseData,
        error.message || 'Failed to update manager status.',
        statusCode,
      );
      showAlert(`Error: ${message}`, 'error');
    } finally {
      setTogglingManagerActiveId(null);
    }
  };

  const requestTerminateManager = useCallback((manager) => {
    if (!manager?.id) {
      showAlert('Manager ID is missing. Cannot terminate this manager.', 'warning');
      return;
    }
    setTerminateConfirm({
      open: true,
      id: manager.id,
      name: manager.name || 'this manager',
      loading: false,
    });
  }, [showAlert]);

  const terminateManager = async (id) => {
    if (!id) {
      showAlert('Manager ID is missing. Cannot terminate this manager.', 'warning');
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      await axios.delete(
        `${baseUrl}/accounts/vsre-manager/${id}/`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      setManagers(prev => prev.filter(m => m.id !== id));
      showAlert('Manager terminated successfully!', 'success');
    } catch (error) {
      console.error('Error terminating manager:', error);
      const responseData = error.response?.data;
      const statusCode = error.response?.status;
      const errorMessage = extractApiErrorMessage(responseData, error.message || 'Failed to terminate manager.', statusCode);
      showAlert(`Error: ${errorMessage}`, 'error');
    }
  };

  const confirmTerminateManager = useCallback(async () => {
    const id = terminateConfirm.id;
    if (!id) {
      setTerminateConfirm({ open: false, id: null, name: '', loading: false });
      return;
    }
    setTerminateConfirm((prev) => ({ ...prev, loading: true }));
    await terminateManager(id);
    setTerminateConfirm({ open: false, id: null, name: '', loading: false });
  }, [terminateConfirm.id]);

  const handleEditManager = async (manager) => {
    if (!manager || !manager.id) {
      showAlert('Manager ID is missing. Cannot fetch details.', 'warning');
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setIsLoadingManagerDetails(true);
    setShowEditModal(true);
    setSelectedManagerForEdit(manager); // Set temporarily for loading state

    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const apiUrl = `${baseUrl}/accounts/vsre-manager/${manager.id}/`;

      const response = await axios.get(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const managerData = response.data;
      const skillsArray = Array.isArray(managerData.skills) ? managerData.skills : [];
      const [skill1Data, skill2Data, skill3Data] = [...skillsArray, {}, {}, {}];

      // Extract reporting manager ID from reports_to object if it exists
      const reportingManagerId = managerData.reports_to?.id || 
                                  managerData.reporting_manager_id || 
                                  managerData.reportingManagerId || 
                                  '';

      // Map API response to form fields
      setForm({
        firstName: managerData.first_name || managerData.firstName || '',
        middleName: managerData.middle_name || managerData.middleName || '',
        lastName: managerData.last_name || managerData.lastName || '',
        address: managerData.address || '',
        mobile: managerData.mobile_number || managerData.mobile || managerData.phone || '',
        email: managerData.email || '',
        emergencyContactNumber: managerData.emergency_contact || managerData.emergency_contact_number || managerData.emergencyContactNumber || '',
        reportingManagerId: reportingManagerId,
        joiningDate: managerData.date_joined || managerData.joining_date || managerData.joiningDate || '',
        empLevel: managerData.emp_level || managerData.level || managerData.empLevel || '',
        empBaseLocation: managerData.city || managerData.emp_base_location || managerData.empBaseLocation || '',
        empCategory: managerData.category || managerData.emp_category || managerData.empCategory || '',
        workDepartment: managerData.department || managerData.work_department || managerData.workDepartment || '',
        empGender: mapGenderCodeToLabel(managerData.gender || managerData.emp_gender || managerData.empGender) || '',
        empActive: managerData.is_active !== undefined ? managerData.is_active : (managerData.empActive !== undefined ? managerData.empActive : true),
        lastWorkingDay: managerData.last_working_day || managerData.lastWorkingDay || '',
        skill1: managerData.skill1 || skill1Data.skill || '',
        skill1Priority: managerData.skill1_priority || managerData.skill1Priority || priorityNumberToLabel(skill1Data.priority) || '',
        skill1Experience: managerData.skill1_experience || managerData.skill1Experience || skill1Data.experience || '',
        skill2: managerData.skill2 || skill2Data.skill || '',
        skill2Priority: managerData.skill2_priority || managerData.skill2Priority || priorityNumberToLabel(skill2Data.priority) || '',
        skill2Experience: managerData.skill2_experience || managerData.skill2Experience || skill2Data.experience || '',
        skill3: managerData.skill3 || skill3Data.skill || '',
        skill3Priority: managerData.skill3_priority || managerData.skill3Priority || priorityNumberToLabel(skill3Data.priority) || '',
        skill3Experience: managerData.skill3_experience || managerData.skill3Experience || skill3Data.experience || '',
        photo: null, // File inputs can't be pre-populated (profile_pic is a URL, not a file)
        password: '',
        confirmPassword: '',
        verified_document: null, // File inputs can't be pre-populated
      });

      // Update selectedManagerForEdit with fetched data
      setSelectedManagerForEdit({
        ...manager,
        ...managerData,
        id: managerData.id || manager.id,
      });
    } catch (error) {
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.detail || 
                          error.message || 
                          'Failed to fetch manager details.';
      showAlert(`Error: ${errorMessage}`, 'error');
      setShowEditModal(false);
      setSelectedManagerForEdit(null);
    } finally {
      setIsLoadingManagerDetails(false);
    }
  };

  const handleUpdateManager = async () => {
    if (!selectedManagerForEdit) return;
    
    if (!form.firstName || !form.lastName || !form.email || !form.mobile) {
      showAlert('Please fill in all required fields: First Name, Last Name, Email, and Mobile', 'warning');
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    const payload = buildManagerApiPayload(form);

    setIsUpdatingManager(true);

    try {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
      };

      // If payload is FormData, don't set Content-Type (browser will set it with boundary)
      if (!(payload instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }

      await axios.patch(
        `${import.meta.env.VITE_BASEURL_CARE}/accounts/vsre-manager/${selectedManagerForEdit.id}/`,
        payload,
        {
          headers,
        }
      );

      // Close modal and clear loading state immediately
      setShowEditModal(false);
      setSelectedManagerForEdit(null);
      setIsUpdatingManager(false);

      // Fetch updated managers list - maintain current page if possible
      if (currentPage === 1) {
        await fetchManagers(null, searchTerm);
      } else {
        await fetchManagers(null, searchTerm);
        setCurrentPage(1);
      }
      
      setForm({ 
      firstName: '', 
      middleName: '', 
      lastName: '', 
      address: '', 
      mobile: '', 
      email: '', 
      emergencyContactNumber: '', 
      reportingManagerId: '',
      joiningDate: '',
      empLevel: '',
      empBaseLocation: '',
      empCategory: '',
      workDepartment: '',
      empGender: '',
      empActive: true,
      lastWorkingDay: '',
      skill1: '',
      skill1Priority: '',
      skill1Experience: '',
      skill2: '',
      skill2Priority: '',
      skill2Experience: '',
      skill3: '',
      skill3Priority: '',
      skill3Experience: '',
      photo: null,
      password: '',
      confirmPassword: '',
      verified_document: null,
      });
    } catch (error) {
      console.error('Error updating manager:', error);
      const responseData = error.response?.data;
      const statusCode = error.response?.status;
      const message = extractApiErrorMessage(responseData, error.message || 'Failed to update manager.', statusCode);

      showAlert(message, 'info');
      setIsUpdatingManager(false);
    }
  };

  const fetchManagerDocuments = useCallback(
    async (managerId) => {
      if (!managerId) return [];
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        showAlert('Authorization token missing. Please log in again.', 'error');
        return [];
      }

      setIsLoadingManagerDocuments(true);
      try {
        const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
        const response = await axios.get(`${baseUrl}/accounts/user-documents/`, {
          params: { user: managerId },
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
              console.error(`Failed to fetch manager document details for ${documentId}:`, detailError);
              return entry;
            }
          })
        );

        const normalized = detailedList
          .map((entry, index) => normalizeApiManagerDocEntry(entry, index))
          .filter(Boolean);

        setManagerApiDocsByUser((prev) => ({ ...prev, [String(managerId)]: normalized }));
        return normalized;
      } catch (error) {
        console.error('Failed to fetch manager documents:', error);
        const message = extractApiErrorMessage(
          error.response?.data,
          'Failed to load documents.',
          error.response?.status
        );
        showAlert(message, 'error');
        return [];
      } finally {
        setIsLoadingManagerDocuments(false);
      }
    },
    [showAlert]
  );

  const getManagerDocsForDisplay = useCallback(
    (managerId) => {
      const key = String(managerId);
      if (Object.prototype.hasOwnProperty.call(managerApiDocsByUser, key)) {
        const docs = managerApiDocsByUser[key];
        return Array.isArray(docs) ? docs : [];
      }
      return [];
    },
    [managerApiDocsByUser]
  );

  const managerDocViewedList = useMemo(
    () => (managerDocViewTarget ? getManagerDocsForDisplay(managerDocViewTarget.id) : []),
    [managerDocViewTarget, getManagerDocsForDisplay]
  );

  const managerDocViewedDoc = useMemo(() => {
    if (!managerDocSelectedId) return null;
    return managerDocViewedList.find(doc => doc.id === managerDocSelectedId) || null;
  }, [managerDocViewedList, managerDocSelectedId]);

  const managerDocViewedFile = useMemo(() => {
    const files = Array.isArray(managerDocViewedDoc?.files) ? managerDocViewedDoc.files : [];
    if (!files.length) return null;
    if (!managerDocSelectedFileId) return files[0];
    return files.find(file => file.id === managerDocSelectedFileId) || files[0];
  }, [managerDocViewedDoc, managerDocSelectedFileId]);

  const closeManagerDocumentViewModal = () => {
    if (managerDocViewDeleting) return;
    setManagerDocViewTarget(null);
    setManagerDocSelectedId(null);
    setManagerDocSelectedFileId(null);
  };

  const handleViewManagerDocument = async (manager) => {
    if (!manager?.id) return;
    setManagerDocViewTarget(manager);
    setManagerDocSelectedId(null);
    setManagerDocSelectedFileId(null);
    const docs = await fetchManagerDocuments(manager.id);
    const firstDoc = docs[0] || null;
    setManagerDocSelectedId(firstDoc?.id ?? null);
    setManagerDocSelectedFileId(firstDoc?.files?.[0]?.id ?? null);
  };

  const handleUploadFromManagerDocumentView = () => {
    const manager = managerDocViewTarget;
    if (!manager?.id) return;
    closeManagerDocumentViewModal();
    openManagerDocumentAddModal(manager);
  };

  const downloadManagerLocalDoc = (file) => {
    const docUrl = file?.url;
    if (!docUrl) return;
    const link = document.createElement('a');
    link.href = docUrl;
    link.download = file.fileName || 'manager-document';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadManagerDocument = () => {
    if (!managerDocViewedFile) {
      showAlert('Select a document to download.', 'info');
      return;
    }
    downloadManagerLocalDoc(managerDocViewedFile);
  };

  const openManagerDocumentAddModal = (manager) => {
    setManagerDocAddTarget(manager);
    setManagerDocEditTarget(null);
    setManagerDocAddFiles([]);
    setManagerDocTitle('');
    setManagerDocRemarks('');
    setManagerDocAddCompressing(false);
  };

  const closeManagerDocumentAddModal = () => {
    setManagerDocAddTarget(null);
    setManagerDocEditTarget(null);
    setManagerDocAddFiles([]);
    setManagerDocTitle('');
    setManagerDocRemarks('');
    setManagerDocAddCompressing(false);
  };

  const handleManagerDocumentFileSelect = async (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length) return;

    setManagerDocAddCompressing(true);
    try {
      const maxBytes = MANAGER_DOCUMENT_MAX_UPLOAD_MB * 1024 * 1024;
      const processed = [];
      for (const raw of selected) {
        const result = await compressFileForUpload(raw, { maxDimension: 1920 });
        const file = result?.file || raw;
        if (file.size > maxBytes) {
          showAlert(
            `"${file.name}" is too large after compression (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is ${MANAGER_DOCUMENT_MAX_UPLOAD_MB} MB.`,
            'warning'
          );
          continue;
        }
        processed.push(file);
      }
      if (processed.length) {
        setManagerDocAddFiles(prev => [...prev, ...processed]);
      }
    } catch (error) {
      console.error('Manager document compression failed:', error);
      showAlert(error.message || 'Failed to process the selected file(s).', 'error');
    } finally {
      setManagerDocAddCompressing(false);
    }
  };

  const removeManagerDocAddFile = (index) => {
    setManagerDocAddFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveManagerDocument = async () => {
    if (!managerDocAddTarget?.id) return;
    const isEditMode = Boolean(managerDocEditTarget?.documentId);
    if (!isEditMode && !managerDocAddFiles.length) {
      showAlert('Please select at least one document to save.', 'warning');
      return;
    }
    const title = managerDocTitle.trim();
    if (!title) {
      showAlert('Please enter a document title.', 'warning');
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setManagerDocSaving(true);
    try {
      const formData = new FormData();
      formData.append('user', String(managerDocAddTarget.id));
      formData.append('title', title);
      formData.append('remarks', managerDocRemarks.trim());
      for (const file of managerDocAddFiles) {
        formData.append('files', file);
      }

      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      if (isEditMode) {
        await axios.patch(
          `${baseUrl}/accounts/user-documents/${managerDocEditTarget.documentId}/`,
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

      await fetchManagerDocuments(managerDocAddTarget.id);
      if (isEditMode) {
        showAlert('Document updated successfully.', 'success');
      } else {
        showAlert(
          managerDocAddFiles.length === 1
            ? 'Document uploaded successfully.'
            : `${managerDocAddFiles.length} documents uploaded successfully.`,
          'success'
        );
      }
      closeManagerDocumentAddModal();
    } catch (error) {
      console.error(`Failed to ${isEditMode ? 'update' : 'upload'} manager document(s):`, error);
      const message = extractApiErrorMessage(
        error.response?.data,
        error.message || `Failed to ${isEditMode ? 'update' : 'upload'} document(s).`,
        error.response?.status
      );
      showAlert(message, 'error');
    } finally {
      setManagerDocSaving(false);
    }
  };

  const handleDeleteManagerDocumentByDoc = async (doc) => {
    if (!doc?.id) return;
    setManagerDocSelectedId(doc.id);
    setManagerDocSelectedFileId(doc.files?.[0]?.id ?? null);
    const currentDoc = managerDocViewedDoc?.id === doc.id ? managerDocViewedDoc : doc;
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

    setManagerDocViewDeleting(true);
    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      await axios.delete(`${baseUrl}/accounts/user-documents/${currentDoc.documentId}/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const refreshedDocs = await fetchManagerDocuments(managerDocViewTarget?.id);
      showAlert('Document deleted successfully.', 'success');
      if (refreshedDocs.length) {
        setManagerDocSelectedId(refreshedDocs[0].id);
        setManagerDocSelectedFileId(refreshedDocs[0]?.files?.[0]?.id ?? null);
      } else {
        setManagerDocViewTarget(null);
        setManagerDocSelectedId(null);
        setManagerDocSelectedFileId(null);
      }
    } catch (error) {
      console.error('Failed to delete manager document from API:', error);
      const message = extractApiErrorMessage(
        error.response?.data,
        error.message || 'Failed to delete document.',
        error.response?.status
      );
      showAlert(message, 'error');
    } finally {
      setManagerDocViewDeleting(false);
    }
  };

  const openManagerDocumentEditModal = (doc) => {
    if (!doc?.documentId || !managerDocViewTarget?.id) {
      showAlert('Missing document id. Unable to edit.', 'error');
      return;
    }
    setManagerDocAddTarget(managerDocViewTarget);
    setManagerDocEditTarget(doc);
    setManagerDocTitle(doc.title || '');
    setManagerDocRemarks(doc.remarks || '');
    setManagerDocAddFiles([]);
    setManagerDocAddCompressing(false);
  };

  const openAssignVenueModal = (manager) => {
    setSelectedManagerForVenue(manager);
    setSelectedVenueIds(manager.assignedVenues || []);
    setShowAssignVenueModal(true);
  };

  const toggleManagerSelection = (managerId) => {
    setSelectedManagerIds(prev => {
      const idStr = String(managerId);
      const exists = prev.some(id => String(id) === idStr);
      if (exists) {
        return prev.filter(id => String(id) !== idStr);
      }
      return [...prev, managerId];
    });
  };

  const areAllVisibleManagersSelected = (visibleManagers) => {
    if (!visibleManagers || visibleManagers.length === 0) return false;
    return visibleManagers.every(manager =>
      selectedManagerIds.some(id => String(id) === String(manager.id))
    );
  };

  const toggleSelectAllVisibleManagers = (visibleManagers) => {
    if (!visibleManagers || visibleManagers.length === 0) return;
    const allSelected = areAllVisibleManagersSelected(visibleManagers);
    if (allSelected) {
      setSelectedManagerIds(prev =>
        prev.filter(
          id => !visibleManagers.some(manager => String(manager.id) === String(id))
        )
      );
    } else {
      const visibleIds = visibleManagers.map(manager => manager.id);
      setSelectedManagerIds(prev => {
        const map = new Map(prev.map(id => [String(id), id]));
        visibleIds.forEach(id => {
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
    const managerIdForFetch = assignManagerIds[0];

    if (!managerIdForFetch) {
      setAssignModalStep('options');
      setAssignableEntitiesError('Select at least one manager before assigning.');
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
          params: { user_id: managerIdForFetch },
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
      !assignActionModalManager ||
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
          manager_ids: assignManagerIds.map(id => Number(id) || id),
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      await fetchManagers(null, searchTerm);
      setSelectedManagerIds(prev =>
        prev.filter(
          id => !assignManagerIds.some(assignId => String(assignId) === String(id))
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

  const openAssignActionModal = (manager, overrideManagerIds = null) => {
    const fallbackIds =
      overrideManagerIds && overrideManagerIds.length > 0
        ? overrideManagerIds
        : selectedManagerIds.length > 0
          ? selectedManagerIds
          : manager
            ? [manager.id]
            : [];

    const normalizedIds = normalizeManagerIdList(fallbackIds);

    if (normalizedIds.length === 0) {
      showAlert('Select at least one manager to assign.', 'warning');
      return;
    }

    const primaryManager =
      manager ||
      managers.find(m => normalizedIds.some(id => String(id) === String(m.id))) ||
      null;

    setAssignManagerIds(normalizedIds);
    setAssignActionModalManager(primaryManager);
    setAssignModalStep('options');
    setSelectedAssignCategory(null);
    setAssignableEntities([]);
    setAssignableEntitiesError('');
    setSelectedAssignableEntityId('');
    setIsLoadingAssignableEntities(false);
    setIsAssigningEntity(false);
  };

  const closeAssignActionModal = () => {
    setAssignActionModalManager(null);
    setAssignModalStep('options');
    setSelectedAssignCategory(null);
    setAssignableEntities([]);
    setAssignableEntitiesError('');
    setSelectedAssignableEntityId('');
    setIsLoadingAssignableEntities(false);
    setIsAssigningEntity(false);
    setAssignManagerIds([]);
  };

  const assignVenues = () => {
    if (!selectedManagerForVenue) return;
    
    const normalizedSelectedIds = selectedVenueIds.map(id => Number(id) || id);

    const resolvedVenuesDetails = normalizedSelectedIds
      .map(id => {
        const venue = venues.find(v => v.id === id || String(v.id) === String(id));
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

    setManagers(prev => prev.map(m => 
      m.id === selectedManagerForVenue.id 
        ? { 
            ...m, 
            assignedVenues: normalizedSelectedIds,
            managedVenuesDetailed: resolvedVenuesDetails,
          }
        : m
    ));
    
    setShowAssignVenueModal(false);
    setSelectedManagerForVenue(null);
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

  const fetchAssignableParents = useCallback(async (managerId) => {
    const accessToken = localStorage.getItem('access_token');
    
    if (!accessToken) {
      console.error('Authorization token missing. Please log in again.');
      return;
    }

    if (!managerId) {
      console.error('Manager ID is required to fetch assignable parents.');
      return;
    }

    setIsLoadingAssignableParents(true);
    setAssignableParents([]);

    try {
      const response = await axios.get(
        `${import.meta.env.VITE_BASEURL_CARE}/accounts/assign/${managerId}/parent/`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      
      const parentsData = response.data?.assignable_parents || [];
      setAssignableParents(Array.isArray(parentsData) ? parentsData : []);
    } catch (error) {
      console.error('Error fetching assignable parents:', error);
      const responseData = error.response?.data;
      console.error('Error response data:', responseData);
      setAssignableParents([]);
    } finally {
      setIsLoadingAssignableParents(false);
    }
  }, []);

  const openReportingManagerAssignment = (manager) => {
    if (!manager) return;
    setNewlyCreatedManager(manager);
    // Reset to empty string so "Select from list" is the default
    setSelectedReportingManagerId('');
    setShowAssignReportingManagerModal(true);
    // Fetch assignable parents when modal opens
    if (manager.id) {
      fetchAssignableParents(manager.id);
    }
  };

  const handleAssignReportingManager = async () => {
    if (!newlyCreatedManager) return;

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    const rawValue = selectedReportingManagerId?.trim();
    
    // If no manager is selected, show message (or handle unassign if needed)
    if (!rawValue) {
      showAlert('Please select a reporting manager from the list.', 'warning');
      return;
    }

    const parentManagerId = Number(rawValue);
    if (Number.isNaN(parentManagerId)) {
      showAlert('Invalid reporting manager selected.', 'warning');
      return;
    }

    const managerId = newlyCreatedManager.id;
    if (!managerId) {
      showAlert('Manager ID is missing.', 'warning');
      return;
    }

    setIsAssigningReportingManager(true);

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/accounts/assign/${managerId}/parent/`,
        {
          parent_id: parentManagerId
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Update local state
      setManagers(prev =>
        prev.map(m =>
          m.id === managerId ? { ...m, reportingManagerId: parentManagerId } : m
        )
      );

      // Refresh managers list to get updated data
      await fetchManagers(null, searchTerm);

      // Close modal and reset
      setShowAssignReportingManagerModal(false);
      setNewlyCreatedManager(null);
      setSelectedReportingManagerId('');
      setAssignableParents([]);
    } catch (error) {
      console.error('Error assigning reporting manager:', error);
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
    setNewlyCreatedManager(null);
    setSelectedReportingManagerId('');
    setAssignableParents([]);
  };

  return (
    <>
    <div className="w-full relative">
      {/* Loading Overlay */}
      {(isLoadingManagers || isSubmitting) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 shadow-2xl flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
            <p className="text-gray-700 font-semibold">
              {isLoadingManagers ? 'Loading managers...' : 'Creating manager...'}
            </p>
          </div>
        </div>
      )}
      
      {/* Panels */}
      {!isVsreOwner && (
        <div className="bg-gray-50 rounded-xl p-8 border-2 border-gray-200 text-center">
          <p className="text-gray-700 text-lg font-medium mb-2">Only VSRE_OWNERs can manage managers.</p>
          {authUser ? (
            <p className="text-sm text-gray-500">Current user type: <span className="font-semibold">{authUser.user_type || 'Not found'}</span></p>
          ) : (
            <p className="text-sm text-gray-500">No user logged in. Please log in as VSRE_OWNER.</p>
          )}
        </div>
      )}

      {isVsreOwner && activeTab === 'my' && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('add')}
            className="shrink-0 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            + Add Manager
          </button>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearchManagers();
              }
            }}
            placeholder="Search managers by name, city, or contact"
            className="min-w-40 flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCurrentPage(1);
                fetchManagers(null, '');
              }}
              className="shrink-0 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={handleSearchManagers}
            disabled={isLoadingManagers}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              isLoadingManagers
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
            title="Search"
          >
            Search
          </button>
          <button
            type="button"
            onClick={handleExportManagerPdf}
            disabled={isLoadingManagers || filteredManagers.length === 0}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              isLoadingManagers || filteredManagers.length === 0
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
            title="Export current page as PDF"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={handleExportManagerExcel}
            disabled={isLoadingManagers || filteredManagers.length === 0}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              isLoadingManagers || filteredManagers.length === 0
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-emerald-700 text-white hover:bg-emerald-800'
            }`}
            title="Export current page as Excel"
          >
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => openAssignActionModal(null, selectedManagerIds)}
            disabled={selectedManagerIds.length === 0}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
              selectedManagerIds.length === 0
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
            title="Assign selected managers"
          >
            Assign Selected {selectedManagerIds.length > 0 ? `(${selectedManagerIds.length})` : ''}
          </button>
        </div>
      )}

      {isVsreOwner && activeTab === 'my' && (
        <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200">
          {isLoadingManagers ? (
            <div className="text-center text-gray-600 py-12 text-lg">Loading managers...</div>
          ) : managersError ? (
            <div className="text-center text-red-600 py-12 text-lg">{managersError}</div>
          ) : (
            <>
            <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
              <table className="w-full min-w-4xl table-fixed border-collapse text-[11px] sm:text-xs">
                <colgroup>
                  <col style={{ width: '3.5%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '10%' }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="text-left py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                        checked={areAllVisibleManagersSelected(paginatedManagers)}
                        onChange={() => toggleSelectAllVisibleManagers(paginatedManagers)}
                        aria-label="Select all managers on this page"
                      />
                    </th>
                    <th className="text-left py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight">Name</th>
                    <th className="text-left py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight whitespace-nowrap">Emp. ID</th>
                    <th className="text-left py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight">Email</th>
                    <th className="text-left py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight">Phone</th>
                    <th className="text-right py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight">
                      <span className="inline-flex justify-end">
                        <EmployeeStatusFilterButton
                          value={statusFilter}
                          onChange={setStatusFilter}
                          disabled={isLoadingManagers}
                          compact
                        />
                      </span>
                    </th>
                    <th className="text-left py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight">
                      <EmployeeCategoryFilterButton
                        value={categoryFilter}
                        onChange={setCategoryFilter}
                        disabled={isLoadingManagers}
                        compact
                      />
                    </th>
                    <th className="text-left py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight">Docs</th>
                    <th className="text-left py-1.5 px-1.5 font-semibold text-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wide leading-tight">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedManagers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 px-4 text-center text-sm text-slate-600">
                        {searchTerm.trim() ? (
                          <span>
                            No managers match &quot;
                            <span className="font-semibold text-slate-800">{searchTerm.trim()}</span>&quot;.
                          </span>
                        ) : categoryFilter || statusFilter ? (
                          <span>
                            No managers match the current filters
                            {categoryFilter ? (
                              <>
                                {' '}
                                (Category:{' '}
                                <span className="font-semibold text-slate-800">
                                  {getEmployeeCategoryLabel(categoryFilter)}
                                </span>
                                )
                              </>
                            ) : null}
                            {statusFilter ? (
                              <>
                                {categoryFilter ? ', ' : ' ('}
                                Status:{' '}
                                <span className="font-semibold text-slate-800">
                                  {getEmployeeStatusLabel(statusFilter)}
                                </span>
                                {!categoryFilter ? ')' : ''}
                              </>
                            ) : null}
                            . Use the header filters to adjust.
                          </span>
                        ) : (
                          'No managers found.'
                        )}
                      </td>
                    </tr>
                  ) : null}
                  {paginatedManagers.map(m => {
                    const isInactive = m.empActive === false;
                    const rowDocCount = getManagerDocsForDisplay(m.id).length;
                    const email = String(m.email || '').trim();

                    return (
                      <tr 
                        key={m.id} 
                        className={`border-b border-slate-100 transition-colors ${
                          isInactive 
                            ? 'bg-slate-50 opacity-75' 
                            : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-1.5 px-1.5 align-top">
                          <input
                            type="checkbox"
                            checked={selectedManagerIds.some(id => String(id) === String(m.id))}
                            onChange={() => toggleManagerSelection(m.id)}
                            disabled={isInactive}
                            className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                            aria-label={`Select ${m.name || 'manager'}`}
                          />
                        </td>
                        <td className="py-1.5 px-1.5 align-top overflow-hidden">
                          <div
                            className={`font-semibold truncate ${isInactive ? 'text-slate-500' : 'text-slate-900'}`}
                            title={m.name || undefined}
                          >
                            {m.name || '—'}
                          </div>
                        </td>
                        <td className="py-1.5 px-1.5 align-top overflow-hidden">
                          <div
                            className={`truncate ${isInactive ? 'text-slate-400' : 'text-slate-700'}`}
                            title={m.employeeId || undefined}
                          >
                            {m.employeeId || '—'}
                          </div>
                        </td>
                        <td className="py-1.5 px-1.5 align-top overflow-hidden min-w-0 max-w-[9.5rem]">
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
                            <span className={`block truncate ${isInactive ? 'text-slate-400' : 'text-slate-500'}`}>—</span>
                          )}
                        </td>
                        <td className="py-1.5 px-1.5 align-top overflow-hidden">
                          <div
                            className={`truncate ${isInactive ? 'text-slate-400' : 'text-slate-700'}`}
                            title={m.mobile || m.phone || undefined}
                          >
                            {m.mobile || m.phone || '—'}
                          </div>
                        </td>
                        <td className="py-1.5 px-1.5 align-top text-right">
                          <EmployeeActiveToggle
                            checked={!isInactive}
                            disabled={
                              togglingManagerActiveId != null
                              && String(togglingManagerActiveId) === String(m.id)
                            }
                            onChange={(e) => toggleManagerActiveStatus(m, e.target.checked)}
                          />
                        </td>
                        <td className="py-1.5 px-1.5 align-top overflow-hidden">
                          <div
                            className={`truncate ${isInactive ? 'text-slate-400' : 'text-slate-700'}`}
                            title={getEmployeeCategoryLabel(m.empCategory) || m.empCategory || undefined}
                          >
                            {getEmployeeCategoryLabel(m.empCategory) || m.empCategory || '—'}
                          </div>
                        </td>
                        <td className="py-1.5 px-1.5 align-top overflow-hidden">
                          <div className="flex flex-col gap-0.5 items-start w-fit max-w-full">
                            <button
                              type="button"
                              onClick={() => handleViewManagerDocument(m)}
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
                              onClick={() => openManagerDocumentAddModal(m)}
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
                        <td className="py-1.5 px-1.5 align-top overflow-hidden">
                          <div className="flex flex-col gap-0.5 items-start w-fit max-w-full">
                            <button
                              type="button"
                              onClick={() => !isInactive && openAssignActionModal(m, [m.id])}
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
                              onClick={() => handleEditManager(m)}
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
                              onClick={() => !isInactive && requestTerminateManager(m)}
                              disabled={isInactive}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap transition-colors ${
                                isInactive
                                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                  : 'bg-red-600 hover:bg-red-700 text-white'
                              }`}
                              title={`Terminate ${m.name || 'manager'}`}
                            >
                              Terminate
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>

            {shouldShowPagination && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
                <div className="text-sm text-gray-600">
                  Showing{' '}
                  <span className="font-semibold">
                    {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
                    {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)}
                  </span>{' '}
                  of <span className="font-semibold">{totalCount}</span> managers
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      if (previousUrl) {
                        setCurrentPage((prev) => prev - 1);
                        fetchManagers(previousUrl, searchTerm);
                      }
                    }}
                    disabled={!previousUrl}
                    className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                      !previousUrl
                        ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Previous
                  </button>
                  <span className="text-sm font-semibold text-gray-700">
                    Page {currentPage}{totalCount > 0 && totalPages > 1 ? ` of ${totalPages}` : ''}
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      if (nextUrl) {
                        setCurrentPage((prev) => prev + 1);
                        fetchManagers(nextUrl, searchTerm);
                      }
                    }}
                    disabled={!nextUrl}
                    className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                      !nextUrl
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
      {showAssignVenueModal && selectedManagerForVenue && (
        <div className="fixed inset-0 backdrop-blur-md bg-white/10 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto border border-black">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Assign Venues to {selectedManagerForVenue.name}
            </h3>
            <div className="space-y-2 mb-4">
              {venues.length === 0 ? (
                <p className="text-gray-500">No venues available.</p>
              ) : (
                venues.map(venue => (
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
                  setSelectedManagerForVenue(null);
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

      {isVsreOwner && activeTab === 'add' && (
        <div className={`bg-gray-50 rounded-xl p-6 border-2 border-gray-200 relative ${isSubmitting ? 'opacity-75 pointer-events-none' : ''}`}>
          {isSubmitting && (
            <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent"></div>
                <p className="text-gray-700 font-semibold">Creating manager...</p>
              </div>
            </div>
          )}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('my')}
              disabled={isSubmitting}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              ← Back to list
            </button>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-6">Add New Manager</h3>
          <div className="space-y-4">
            {/* Name Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">First Name <span className="text-red-500">*</span></label>
                <input 
                  value={form.firstName} 
                  onChange={(e)=>setForm(prev=>({...prev,firstName:e.target.value}))} 
                  placeholder="First Name" 
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Middle Name</label>
                <input 
                  value={form.middleName} 
                  onChange={(e)=>setForm(prev=>({...prev,middleName:e.target.value}))} 
                  placeholder="Middle Name (optional)" 
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Last Name <span className="text-red-500">*</span></label>
                <input 
                  value={form.lastName} 
                  onChange={(e)=>setForm(prev=>({...prev,lastName:e.target.value}))} 
                  placeholder="Last Name" 
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  required
                />
              </div>
            </div>

            {/* Contact Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                <input 
                  value={form.email} 
                  onChange={(e)=>setForm(prev=>({...prev,email:e.target.value}))} 
                  placeholder="Email Address" 
                  type="email" 
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Mobile <span className="text-red-500">*</span></label>
                <input 
                  value={form.mobile} 
                  onChange={(e)=>setForm(prev=>({...prev,mobile:e.target.value}))} 
                  placeholder="Mobile Number" 
                  type="tel"
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Password <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    value={form.password}
                    onChange={(e)=>setForm(prev=>({...prev,password:e.target.value}))}
                    placeholder="Password"
                    type={showPassword ? 'text' : 'password'}
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 pr-16 text-gray-900 focus:outline-none focus:border-indigo-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute inset-y-0 right-3 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm Password <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    value={form.confirmPassword}
                    onChange={(e)=>setForm(prev=>({...prev,confirmPassword:e.target.value}))}
                    placeholder="Confirm Password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 pr-16 text-gray-900 focus:outline-none focus:border-indigo-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(prev => !prev)}
                    className="absolute inset-y-0 right-3 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Address <span className="text-red-500">*</span>
              </label>
              <textarea 
                value={form.address} 
                onChange={(e)=>setForm(prev=>({...prev,address:e.target.value}))} 
                placeholder="Full Address" 
                rows="3"
                className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500 resize-none" 
              />
            </div>

            {/* Emergency Contact */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Emergency Contact Number</label>
              <input 
                value={form.emergencyContactNumber} 
                onChange={(e)=>setForm(prev=>({...prev,emergencyContactNumber:e.target.value}))} 
                placeholder="Emergency Contact" 
                type="tel"
                className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
              />
            </div>


            {/* Employee Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Joining Date</label>
                <input 
                  value={form.joiningDate} 
                  onChange={(e)=>setForm(prev=>({...prev,joiningDate:e.target.value}))} 
                  type="date"
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Employee Level</label>
                <input 
                  value={form.empLevel} 
                  onChange={(e)=>setForm(prev=>({...prev,empLevel:e.target.value}))} 
                  placeholder="e.g. Level 1, Level 2"
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Base Location <span className="text-red-500">*</span>
                </label>
                <input 
                  value={form.empBaseLocation} 
                  onChange={(e)=>setForm(prev=>({...prev,empBaseLocation:e.target.value}))} 
                  placeholder="Base Location"
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Employee Category</label>
                <select 
                  value={form.empCategory} 
                  onChange={(e)=>setForm(prev=>({...prev,empCategory:e.target.value}))} 
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                >
                  <option value="">Select Employee Category</option>
                  <option value="FULLTIME">Fulltime</option>
                  <option value="PARTTIME">Parttime</option>
                  <option value="VIRTUAL">Virtual</option>
                  <option value="REGULAR">Regular</option>
                  <option value="PPO">PPO</option>
                  <option value="VENDOR">Vendor</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Work Department</label>
                <input 
                  value={form.workDepartment} 
                  onChange={(e)=>setForm(prev=>({...prev,workDepartment:e.target.value}))} 
                  placeholder="Work Department"
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Gender <span className="text-red-500">*</span>
                </label>
                <select 
                  value={form.empGender} 
                  onChange={(e)=>setForm(prev=>({...prev,empGender:e.target.value}))} 
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Employee Active</label>
                <select 
                  value={form.empActive ? 'true' : 'false'} 
                  onChange={(e)=>setForm(prev=>({...prev,empActive:e.target.value === 'true'}))} 
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Last Working Day</label>
                <input 
                  value={form.lastWorkingDay} 
                  onChange={(e)=>setForm(prev=>({...prev,lastWorkingDay:e.target.value}))} 
                  type="date"
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                />
              </div>
            </div>

            {/* Skills */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Skill 1</label>
                  <input 
                    value={form.skill1} 
                    onChange={(e)=>setForm(prev=>({...prev,skill1:e.target.value}))} 
                    placeholder="Skill 1"
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  />
                  <label className="block text-xs font-medium text-gray-600 mt-2 mb-1">Experience (optional)</label>
                  <input
                    value={form.skill1Experience}
                    onChange={(e)=>setForm(prev=>({...prev,skill1Experience:e.target.value}))}
                    placeholder="e.g., 2 years"
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-gray-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Priority</label>
                  <select 
                    value={form.skill1Priority} 
                    onChange={(e)=>setForm(prev=>({...prev,skill1Priority:e.target.value}))} 
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  >
                    <option value="">Select Priority</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Skill 2</label>
                  <input 
                    value={form.skill2} 
                    onChange={(e)=>setForm(prev=>({...prev,skill2:e.target.value}))} 
                    placeholder="Skill 2"
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  />
                  <label className="block text-xs font-medium text-gray-600 mt-2 mb-1">Experience (optional)</label>
                  <input
                    value={form.skill2Experience}
                    onChange={(e)=>setForm(prev=>({...prev,skill2Experience:e.target.value}))}
                    placeholder="e.g., 3 years"
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-gray-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Priority</label>
                  <select 
                    value={form.skill2Priority} 
                    onChange={(e)=>setForm(prev=>({...prev,skill2Priority:e.target.value}))} 
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  >
                    <option value="">Select Priority</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Skill 3</label>
                  <input 
                    value={form.skill3} 
                    onChange={(e)=>setForm(prev=>({...prev,skill3:e.target.value}))} 
                    placeholder="Skill 3"
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  />
                  <label className="block text-xs font-medium text-gray-600 mt-2 mb-1">Experience (optional)</label>
                  <input
                    value={form.skill3Experience}
                    onChange={(e)=>setForm(prev=>({...prev,skill3Experience:e.target.value}))}
                    placeholder="e.g., 1 year"
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-gray-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Priority</label>
                  <select 
                    value={form.skill3Priority} 
                    onChange={(e)=>setForm(prev=>({...prev,skill3Priority:e.target.value}))} 
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  >
                    <option value="">Select Priority</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Photo */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Photo (optional)</label>
              <input 
                type="file"
                accept="image/*"
                onChange={(e)=>{
                  const file = e.target.files[0];
                  if (file) {
                    if (file.type.startsWith('image/')) {
                      setForm(prev=>({...prev,photo:file}));
                    } else {
                      showAlert('Please select an image file only (jpg, png, gif, etc.)', 'warning');
                      e.target.value = ''; // Reset input
                      setForm(prev=>({...prev,photo:null}));
                    }
                  } else {
                    setForm(prev=>({...prev,photo:null}));
                  }
                }} 
                className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
              />
              {form.photo && (
                <p className="text-xs text-gray-600 mt-1">Selected: {form.photo.name || 'Photo selected'}</p>
              )}
            </div>

            {/* Upload Document */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Upload document(ID)</label>
              <input 
                type="file"
                onChange={(e)=>setForm(prev=>({...prev,verified_document:e.target.files[0] || null}))} 
                className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              />
              {form.verified_document && (
                <p className="text-xs text-gray-600 mt-1">Selected: {form.verified_document.name}</p>
              )}
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button 
              onClick={addManager} 
              disabled={isSubmitting}
              className={`bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-semibold shadow-md transition-colors ${isSubmitting ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              {isSubmitting ? 'Adding...' : 'Add Manager'}
            </button>
          </div>
          {formFeedback.message && (
            <div className={`mt-4 text-sm ${formFeedback.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
              {formFeedback.message}
            </div>
          )}
        </div>
      )}

      {/* Edit Manager Modal */}
      {showEditModal && selectedManagerForEdit && (
        <div className="fixed inset-0 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto relative">
            {isLoadingManagerDetails ? (
              <div className="absolute inset-0 bg-white/95 rounded-xl flex items-center justify-center z-100 min-h-full">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
                  <p className="text-gray-700 font-semibold text-lg">Loading manager details...</p>
                </div>
              </div>
            ) : null}
            {isUpdatingManager && (
              <div className="absolute inset-0 bg-white/95 rounded-xl flex items-center justify-center z-100 min-h-full">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
                  <p className="text-gray-700 font-semibold text-lg">Updating manager...</p>
                </div>
              </div>
            )}
            <div className={(isUpdatingManager || isLoadingManagerDetails) ? 'pointer-events-none opacity-50' : ''}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Edit Manager Profile</h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedManagerForEdit(null);
                  setForm({ 
                    firstName: '', 
                    middleName: '', 
                    lastName: '', 
                    address: '', 
                    mobile: '', 
                    email: '', 
                    emergencyContactNumber: '', 
                    reportingManagerId: '',
                    joiningDate: '',
                    empLevel: '',
                    empBaseLocation: '',
                    empCategory: '',
                    workDepartment: '',
                    empGender: '',
                    empActive: true,
                    lastWorkingDay: '',
                    skill1: '',
                    skill1Priority: '',
                    skill1Experience: '',
                    skill2: '',
                    skill2Priority: '',
                    skill2Experience: '',
                    skill3: '',
                    skill3Priority: '',
                    skill3Experience: '',
                    photo: null,
                    password: '',
                    confirmPassword: '',
                    verified_document: null,
                  });
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              {/* Name Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">First Name <span className="text-red-500">*</span></label>
                  <input 
                    value={form.firstName} 
                    onChange={(e)=>setForm(prev=>({...prev,firstName:e.target.value}))} 
                    placeholder="First Name" 
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Middle Name</label>
                  <input 
                    value={form.middleName} 
                    onChange={(e)=>setForm(prev=>({...prev,middleName:e.target.value}))} 
                    placeholder="Middle Name (optional)" 
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Last Name <span className="text-red-500">*</span></label>
                  <input 
                    value={form.lastName} 
                    onChange={(e)=>setForm(prev=>({...prev,lastName:e.target.value}))} 
                    placeholder="Last Name" 
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                    required
                  />
                </div>
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email <span className="text-red-500">*</span></label>
                  <input 
                    value={form.email} 
                    onChange={(e)=>setForm(prev=>({...prev,email:e.target.value}))} 
                    placeholder="Email Address" 
                    type="email" 
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mobile <span className="text-red-500">*</span></label>
                  <input 
                    value={form.mobile} 
                    onChange={(e)=>setForm(prev=>({...prev,mobile:e.target.value}))} 
                    placeholder="Mobile Number" 
                    type="tel"
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                    required
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                <textarea 
                  value={form.address} 
                  onChange={(e)=>setForm(prev=>({...prev,address:e.target.value}))} 
                  placeholder="Full Address" 
                  rows="3"
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500 resize-none" 
                />
              </div>

              {/* Emergency Contact */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Emergency Contact Number</label>
                <input 
                  value={form.emergencyContactNumber} 
                  onChange={(e)=>setForm(prev=>({...prev,emergencyContactNumber:e.target.value}))} 
                  placeholder="Emergency Contact" 
                  type="tel"
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                />
              </div>


              {/* Employee Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Joining Date</label>
                  <input 
                    value={form.joiningDate} 
                    onChange={(e)=>setForm(prev=>({...prev,joiningDate:e.target.value}))} 
                    type="date"
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Employee Level</label>
                  <input 
                    value={form.empLevel} 
                    onChange={(e)=>setForm(prev=>({...prev,empLevel:e.target.value}))} 
                    placeholder="e.g. Level 1, Level 2"
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Base Location</label>
                  <input 
                    value={form.empBaseLocation} 
                    onChange={(e)=>setForm(prev=>({...prev,empBaseLocation:e.target.value}))} 
                    placeholder="Base Location"
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Employee Category</label>
                  <select 
                    value={form.empCategory} 
                    onChange={(e)=>setForm(prev=>({...prev,empCategory:e.target.value}))} 
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  >
                    <option value="">Select Employee Category</option>
                    <option value="FULLTIME">Fulltime</option>
                    <option value="PARTTIME">Parttime</option>
                    <option value="VIRTUAL">Virtual</option>
                    <option value="REGULAR">Regular</option>
                    <option value="PPO">PPO</option>
                    <option value="VENDOR">Vendor</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Work Department</label>
                  <input 
                    value={form.workDepartment} 
                    onChange={(e)=>setForm(prev=>({...prev,workDepartment:e.target.value}))} 
                    placeholder="Work Department"
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Gender</label>
                  <select 
                    value={form.empGender} 
                    onChange={(e)=>setForm(prev=>({...prev,empGender:e.target.value}))} 
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Employee Active</label>
                  <select 
                    value={form.empActive ? 'true' : 'false'} 
                    onChange={(e)=>setForm(prev=>({...prev,empActive:e.target.value === 'true'}))} 
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Last Working Day</label>
                  <input 
                    value={form.lastWorkingDay} 
                    onChange={(e)=>setForm(prev=>({...prev,lastWorkingDay:e.target.value}))} 
                    type="date"
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  />
                </div>
              </div>

              {/* Skills */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Skill 1</label>
                    <input 
                      value={form.skill1} 
                      onChange={(e)=>setForm(prev=>({...prev,skill1:e.target.value}))} 
                      placeholder="Skill 1"
                      className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Priority</label>
                    <select 
                      value={form.skill1Priority} 
                      onChange={(e)=>setForm(prev=>({...prev,skill1Priority:e.target.value}))} 
                      className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                    >
                      <option value="">Select Priority</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Skill 2</label>
                    <input 
                      value={form.skill2} 
                      onChange={(e)=>setForm(prev=>({...prev,skill2:e.target.value}))} 
                      placeholder="Skill 2"
                      className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Priority</label>
                    <select 
                      value={form.skill2Priority} 
                      onChange={(e)=>setForm(prev=>({...prev,skill2Priority:e.target.value}))} 
                      className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                    >
                      <option value="">Select Priority</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Skill 3</label>
                    <input 
                      value={form.skill3} 
                      onChange={(e)=>setForm(prev=>({...prev,skill3:e.target.value}))} 
                      placeholder="Skill 3"
                      className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Priority</label>
                    <select 
                      value={form.skill3Priority} 
                      onChange={(e)=>setForm(prev=>({...prev,skill3Priority:e.target.value}))} 
                      className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                    >
                      <option value="">Select Priority</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Photo */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Photo (optional)</label>
                <input 
                  type="file"
                  accept="image/*"
                  onChange={(e)=>{
                    const file = e.target.files[0];
                    if (file) {
                      if (file.type.startsWith('image/')) {
                        setForm(prev=>({...prev,photo:file}));
                      } else {
                        showAlert('Please select an image file only (jpg, png, gif, etc.)', 'warning');
                        e.target.value = ''; // Reset input
                        setForm(prev=>({...prev,photo:null}));
                      }
                    } else {
                      setForm(prev=>({...prev,photo:null}));
                    }
                  }} 
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                />
                {form.photo && (
                  <p className="text-xs text-gray-600 mt-1">Selected: {form.photo.name || 'Photo selected'}</p>
                )}
              </div>

              {/* Upload Document */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Upload document</label>
                <input 
                  type="file"
                  onChange={(e)=>setForm(prev=>({...prev,verified_document:e.target.files[0] || null}))} 
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500" 
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                />
                {form.verified_document && (
                  <p className="text-xs text-gray-600 mt-1">Selected: {form.verified_document.name}</p>
                )}
              </div>
            </div>
            </div>
            <div className={`mt-6 flex justify-end gap-3 ${isUpdatingManager ? 'pointer-events-none opacity-50' : ''}`}>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedManagerForEdit(null);
                  setForm({ 
                    firstName: '', 
                    middleName: '', 
                    lastName: '', 
                    address: '', 
                    mobile: '', 
                    email: '', 
                    emergencyContactNumber: '', 
                    reportingManagerId: '',
                    joiningDate: '',
                    empLevel: '',
                    empBaseLocation: '',
                    empCategory: '',
                    workDepartment: '',
                    empGender: '',
                    empActive: true,
                    lastWorkingDay: '',
                    skill1: '',
                    skill1Priority: '',
                    skill1Experience: '',
                    skill2: '',
                    skill2Priority: '',
                    skill2Experience: '',
                    skill3: '',
                    skill3Priority: '',
                    skill3Experience: '',
                    photo: null,
                    password: '',
                    confirmPassword: '',
                    verified_document: null,
                  });
                }}
                className="px-5 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateManager}
                disabled={isUpdatingManager}
                className={`px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold ${isUpdatingManager ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isUpdatingManager ? 'Updating...' : 'Update Manager'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Reporting Manager Modal */}
      {showAssignReportingManagerModal && newlyCreatedManager && (
        <div className="fixed inset-0 backdrop-blur-md bg-white/10 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 border border-black">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Assign Reporting Manager</h3>
            <p className="text-gray-700 mb-6">
              Assign or update who <span className="font-semibold">{newlyCreatedManager.name}</span> reports to.
            </p>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Select Reporting Manager
              </label>
              {isLoadingAssignableParents ? (
                <div className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-600 text-center">
                  Loading assignable managers...
                </div>
              ) : (
                <select
                  value={selectedReportingManagerId}
                  onChange={(e) => setSelectedReportingManagerId(e.target.value)}
                  disabled={isAssigningReportingManager}
                  className={`w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500 ${
                    isAssigningReportingManager ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                >
                  <option value="">Select from list</option>
                  {assignableParents.length > 0 ? (
                    assignableParents.map((parent) => {
                      // Handle different possible data structures from API
                      const parentId = parent.id || parent.manager_id || parent.managerId;
                      const parentName = parent.name || 
                                       `${parent.first_name || ''} ${parent.middle_name || ''} ${parent.last_name || ''}`.trim() ||
                                       `${parent.firstName || ''} ${parent.middleName || ''} ${parent.lastName || ''}`.trim() ||
                                       parent.email ||
                                       'Unknown Manager';
                      
                      return (
                        <option key={parentId} value={parentId}>
                          {parentName}
                        </option>
                      );
                    })
                  ) : (
                    <option value="" disabled>No assignable managers available</option>
                  )}
                </select>
              )}
              <p className="text-xs text-gray-500 mt-2">
                {selectedReportingManagerId ? 'Selected manager will be assigned as reporting manager.' : 'Select a manager from the list above.'}
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleCloseAssignReportingManagerModal}
                disabled={isAssigningReportingManager}
                className={`px-5 py-2 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-semibold ${
                  isAssigningReportingManager ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleAssignReportingManager}
                disabled={isAssigningReportingManager || !selectedReportingManagerId}
                className={`px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold ${
                  isAssigningReportingManager || !selectedReportingManagerId
                    ? 'opacity-70 cursor-not-allowed'
                    : ''
                }`}
              >
                {isAssigningReportingManager ? 'Assigning...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Venues List Modal */}
      {showVenuesListModal && selectedManagerForVenuesList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              All Assigned Venues - {selectedManagerForVenuesList.name}
            </h3>
            <div className="space-y-2 mb-4">
              {selectedManagerForVenuesList.assignedVenues && selectedManagerForVenuesList.assignedVenues.length > 0 ? (
                selectedManagerForVenuesList.assignedVenues.map(venueId => {
                  const venue =
                    venues.find(v => v.id === venueId || String(v.id) === String(venueId)) ||
                    selectedManagerForVenuesList.managedVenuesDetailed?.find(
                      v => v.id === venueId || String(v.id) === String(venueId)
                    );
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
                      <div className="text-sm text-gray-600">{venue.city || venue.locality || 'Location not specified'}</div>
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
                  setSelectedManagerForVenuesList(null);
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
      {assignActionModalManager && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Assign</p>
                <p className="text-lg font-bold text-gray-900">
                  {assignManagerIds.length > 1
                    ? `${assignManagerIds.length} managers selected`
                    : assignActionModalManager?.name || 'Manager'}
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

      {managerDocViewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col p-6">
            <h3 className="text-lg font-bold text-gray-900">Manager documents</h3>
            <p className="mt-1 text-sm text-gray-600">
              {managerDocViewTarget.name || 'Manager'}
              {managerDocViewedList.length > 0
                ? ` — ${managerDocViewedList.length} document${managerDocViewedList.length === 1 ? '' : 's'}`
                : ' — no documents yet'}
            </p>
            {isLoadingManagerDocuments && (
              <p className="mt-2 text-xs text-indigo-600">Loading documents...</p>
            )}
            {managerDocViewedList.length === 0 ? (
              <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 px-4 text-center">
                <p className="text-sm text-gray-600">Upload PDF, Excel, or image files for this manager.</p>
                <button
                  type="button"
                  onClick={handleUploadFromManagerDocumentView}
                  className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                >
                  Upload documents
                </button>
              </div>
            ) : (
            <div className="mt-4 flex-1 min-h-0 flex flex-col sm:flex-row gap-4 overflow-hidden">
              <ul className="sm:w-56 shrink-0 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-[40vh] sm:max-h-none">
                {managerDocViewedList.map(doc => {
                  const isSelected = doc.id === managerDocSelectedId;
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
                              setManagerDocSelectedId(doc.id);
                              setManagerDocSelectedFileId(doc.files?.[0]?.id ?? null);
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
                              onClick={() => openManagerDocumentEditModal(doc)}
                              disabled={managerDocViewDeleting}
                              className="px-1.5 py-0.5 text-[10px] rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteManagerDocumentByDoc(doc)}
                              disabled={managerDocViewDeleting}
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
                {managerDocViewedDoc?.files?.length > 1 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {managerDocViewedDoc.files.map((file) => {
                      const isFileSelected = file.id === managerDocViewedFile?.id;
                      return (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => setManagerDocSelectedFileId(file.id)}
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
                {managerDocViewedFile?.url &&
                  String(managerDocViewedFile.mimeType || '').startsWith('image/') && (
                    <img
                      src={managerDocViewedFile.url}
                      alt={managerDocViewedFile.fileName || 'Manager document'}
                      className="max-w-full h-auto mx-auto rounded"
                    />
                  )}
                {managerDocViewedFile?.url &&
                  String(managerDocViewedFile.mimeType || '').includes('pdf') &&
                  !String(managerDocViewedFile.mimeType || '').startsWith('image/') && (
                    <iframe
                      title={managerDocViewedFile.fileName || 'Manager document'}
                      src={managerDocViewedFile.url}
                      className="w-full h-[min(50vh,420px)] rounded bg-white"
                    />
                  )}
                {managerDocViewedFile?.url &&
                  !String(managerDocViewedFile.mimeType || '').startsWith('image/') &&
                  !String(managerDocViewedFile.mimeType || '').includes('pdf') && (
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
                onClick={closeManagerDocumentViewModal}
                disabled={managerDocViewDeleting}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Close
              </button>
              {managerDocViewedList.length > 0 && (
                <button
                  type="button"
                  onClick={handleUploadFromManagerDocumentView}
                  disabled={managerDocViewDeleting}
                  className="px-4 py-2 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-semibold hover:bg-emerald-50 disabled:opacity-60"
                >
                  Upload more
                </button>
              )}
              <button
                type="button"
                onClick={handleDownloadManagerDocument}
                disabled={managerDocViewDeleting || !managerDocViewedFile?.url}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      {managerDocAddTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900">
              {managerDocEditTarget ? 'Edit manager document' : 'Add manager document'}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {managerDocAddTarget.name || 'Manager'} — PDF, Excel, or images.
              Combined total limit: {MANAGER_DOCUMENT_MAX_UPLOAD_MB} MB.
            </p>
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={managerDocTitle}
                onChange={(e) => setManagerDocTitle(e.target.value)}
                placeholder="e.g. Aadhar"
                disabled={managerDocSaving}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <label className="block text-xs font-semibold text-gray-700 mt-3 mb-1">Remarks</label>
              <input
                type="text"
                value={managerDocRemarks}
                onChange={(e) => setManagerDocRemarks(e.target.value)}
                placeholder="Optional remarks"
                disabled={managerDocSaving}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <input
                type="file"
                multiple
                accept={MANAGER_DOCUMENT_ACCEPT}
                disabled={managerDocAddCompressing || managerDocSaving}
                onChange={handleManagerDocumentFileSelect}
                className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {managerDocAddCompressing && (
                <p className="mt-2 text-xs text-indigo-600">Compressing file(s)...</p>
              )}
              {managerDocAddFiles.length > 0 && !managerDocAddCompressing && (
                <ul className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {managerDocAddFiles.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-gray-700"
                    >
                      <span className="truncate" title={file.name}>
                        {file.name} ({(file.size / 1024).toFixed(0)} KB)
                      </span>
                      <button
                        type="button"
                        onClick={() => removeManagerDocAddFile(index)}
                        disabled={managerDocSaving}
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
                onClick={closeManagerDocumentAddModal}
                disabled={managerDocSaving}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveManagerDocument}
                disabled={managerDocSaving || managerDocAddCompressing || (!managerDocEditTarget && !managerDocAddFiles.length)}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {managerDocSaving
                  ? 'Uploading...'
                  : managerDocEditTarget
                    ? 'Update'
                    : managerDocAddFiles.length > 1
                    ? `Upload ${managerDocAddFiles.length} files`
                    : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

    <AlertModal open={alertState.open} type={alertState.type} message={alertState.message} onClose={closeAlert} />
    <AlertModal
      open={terminateConfirm.open}
      type="danger"
      title="Terminate manager"
      message={`Are you sure you want to terminate ${terminateConfirm.name}? This action cannot be undone.`}
      onClose={closeTerminateConfirm}
      onConfirm={confirmTerminateManager}
      confirmLabel="Terminate"
      cancelLabel="Cancel"
      confirmLoading={terminateConfirm.loading}
    />
    </>
  );
};

export default ManagerDashboard;

