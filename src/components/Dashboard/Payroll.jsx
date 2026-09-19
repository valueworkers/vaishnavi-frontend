import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import PayrollForm from './PayrollForm';
import AlertModal from '../AlertModal';
import EmployeeCategoryFilterButton from './EmployeeCategoryFilterButton';
import EmployeeNameSortButton from './EmployeeNameSortButton';
import {
  EMPLOYEE_PAGE_SIZE_OPTIONS,
  getEmployeeCategoryLabel,
  resolveEmployeePageSize,
} from '../../utils/employeeListQuery';

const EMPLOYEE_PAYROLL_PATH = '/payroll/employee-payroll/';

const SALARY_TYPE_OPTIONS = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'FORTNIGHTLY', label: 'Fortnightly' },
  { value: 'HOURLY', label: 'Hourly' },
];

const CHANGE_TYPE_OPTIONS = [
  { value: 'BASE_SALARY', label: 'Base Salary' },
  { value: 'INCREMENT', label: 'Increment' },
  { value: 'ADVANCE', label: 'Advance' },
  { value: 'LOAN', label: 'Loan' },
];

const emptyStructureForm = () => ({
  salaryType: 'MONTHLY',
  changeType: 'INCREMENT',
  pfAmount: '0.00',
  esiAmount: '0.00',
  amount: '',
  effectiveFrom: new Date().toISOString().slice(0, 10),
});

const toFormMoney = (value) => {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(2);
};

const toFormDate = (value) => {
  if (!value) return new Date().toISOString().slice(0, 10);
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return new Date().toISOString().slice(0, 10);
};

const formFromSalaryStructure = (row) => ({
  ...emptyStructureForm(),
  salaryType: String(row?.salary_type || 'MONTHLY').toUpperCase(),
  changeType: String(row?.change_type || 'INCREMENT').toUpperCase(),
  amount: toFormMoney(row?.amount),
  pfAmount: toFormMoney(row?.pf_amount) || '0.00',
  esiAmount: toFormMoney(row?.esi_amount) || '0.00',
  effectiveFrom: toFormDate(row?.effective_from),
});

const emptyStructureEditState = () => ({
  open: false,
  employee: null,
  rows: [],
  selectedId: null,
  mode: 'edit', // 'add' | 'edit'
  step: 'select',
  form: emptyStructureForm(),
  loading: false,
  saving: false,
  error: '',
});

const fieldClass =
  'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60';
const labelClass = 'mb-1 block text-xs font-semibold text-gray-700';

const formatMoney = (value) => {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (value) => {
  if (!value) return '—';
  const raw = String(value).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return raw;
};

const formatPayoutMode = (value) => {
  if (!value) return '—';
  return String(value).replace(/_/g, ' ');
};

const extractArray = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.data?.results)) return payload.data.results;
  return [];
};

const buildEmployeePayrollUrl = (
  href = null,
  searchQuery = '',
  category = '',
  ordering = '',
  pageSize = null,
) => {
  const careBase = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '');
  let url = href || `${careBase}${EMPLOYEE_PAYROLL_PATH}`;
  if (href && !/^https?:\/\//i.test(href)) {
    url = `${careBase}${href.startsWith('/') ? href : `/${href}`}`;
  }

  const urlObj = new URL(url);
  const search = String(searchQuery || '').trim();
  if (search) urlObj.searchParams.set('search', search);
  else urlObj.searchParams.delete('search');

  const cat = String(category || '').trim().toUpperCase();
  if (cat) urlObj.searchParams.set('employee_profile__category', cat);
  else urlObj.searchParams.delete('employee_profile__category');

  const order = String(ordering || '').trim();
  if (order === 'first_name' || order === '-first_name') {
    urlObj.searchParams.set('ordering', order);
  } else {
    urlObj.searchParams.delete('ordering');
  }

  if (pageSize != null && pageSize !== '') {
    const size = Number(pageSize);
    if (Number.isFinite(size) && size > 0) {
      urlObj.searchParams.set('page_size', String(Math.floor(size)));
    }
  }

  return urlObj.toString();
};

const PAYROLL_EXPORT_HEADERS = [
  'Employee Name',
  'Emp. ID',
  'Email',
  'Mobile',
  'Category',
  'Vendor',
  'Basic',
  'PF',
  'ESI',
  'Recent Payment',
  'Payout Mode',
  'Effective Date',
];

const exportMoney = (value) => {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(2);
};

const employeePayrollToExportRow = (emp) => [
  emp?.name || '',
  emp?.employeeId || '',
  emp?.email || '',
  emp?.mobile || '',
  getEmployeeCategoryLabel(emp?.employeeCategory) || emp?.employeeCategory || '',
  emp?.vendorName || '',
  exportMoney(emp?.basicSalary),
  exportMoney(emp?.pfAmount),
  exportMoney(emp?.esiAmount),
  exportMoney(emp?.recentPayment),
  emp?.payoutMode ? formatPayoutMode(emp.payoutMode) : '',
  emp?.effectiveDate ? formatDate(emp.effectiveDate) : '',
];

const exportPayrollExcel = (rows) => {
  if (!rows?.length) throw new Error('No records to export.');
  const sheet = XLSX.utils.aoa_to_sheet([
    PAYROLL_EXPORT_HEADERS,
    ...rows.map(employeePayrollToExportRow),
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Employee Payroll');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `employee-payroll-${stamp}.xlsx`);
};

const normalizeEmployeePayroll = (data) => {
  if (!data) return null;
  const fullName = [data.first_name, data.middle_name, data.last_name]
    .filter(Boolean)
    .join(' ');
  return {
    id: data.id ?? Date.now(),
    name: fullName || data.name || 'Employee',
    firstName: data.first_name || '',
    lastName: data.last_name || '',
    employeeId: data.employee_id || '',
    email: data.email || '',
    mobile: data.mobile_number || data.phone || '',
    employeeCategory: data.employee_category || '',
    vendorName: data.vendor_name || '',
    basicSalary: data.basic_salary,
    pfAmount: data.pf_amount,
    esiAmount: data.esi_amount,
    recentPayment: data.recent_payment,
    payoutMode: data.payout_mode || '',
    effectiveDate: data.effective_date || '',
  };
};

const formatLabel = (value) => {
  if (!value) return '—';
  return String(value).replace(/_/g, ' ');
};

const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
};

const Payroll = ({ isVsreOwner, attendanceRecords = {} }) => {
  const [employees, setEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [nameOrdering, setNameOrdering] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [nextUrl, setNextUrl] = useState(null);
  const [previousUrl, setPreviousUrl] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const totalCountRef = useRef(0);
  const [showPayrollForm, setShowPayrollForm] = useState(false);
  const [selectedPayrollEmployee, setSelectedPayrollEmployee] = useState(null);
  const [structureHistory, setStructureHistory] = useState({
    open: false,
    employee: null,
    rows: [],
    loading: false,
    error: '',
  });
  const [structureEdit, setStructureEdit] = useState(emptyStructureEditState);
  const [structureDelete, setStructureDelete] = useState({
    open: false,
    employee: null,
    rows: [],
    selectedId: null,
    loading: false,
    deleting: false,
    error: '',
  });
  const [alertState, setAlertState] = useState({ open: false, type: 'info', message: '' });

  const showAlert = useCallback((message, type = 'info') => {
    setAlertState({ open: true, type, message: String(message) });
  }, []);
  const closeAlert = useCallback(() => setAlertState((prev) => ({ ...prev, open: false })), []);

  const getAuthHeaders = () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return null;
    return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  };

  const fetchSalaryStructuresForUser = async (userId) => {
    const headers = getAuthHeaders();
    if (!headers) throw new Error('Authorization token missing. Please log in again.');
    const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
    const response = await axios.get(`${baseUrl}/payroll/salary-structures/?user_id=${userId}`, {
      headers: { Authorization: headers.Authorization },
    });
    return extractArray(response.data);
  };

  const fetchEmployees = useCallback(
    async (url = null, searchQuery = '', category = '', ordering = '', sizeSelection = 20) => {
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        setListError('Authorization token missing. Please log in again.');
        setEmployees([]);
        return;
      }

      setIsLoading(true);
      setListError('');

      try {
        const resolvedPageSize = resolveEmployeePageSize(sizeSelection, totalCountRef.current);
        const apiUrl = buildEmployeePayrollUrl(
          url,
          searchQuery,
          category,
          ordering,
          resolvedPageSize,
        );
        const response = await axios.get(apiUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        let payload = extractArray(response.data);
        let next = response.data?.next;
        let previous = response.data?.previous;
        let count = response.data?.count ?? payload.length;
        let pages = response.data?.total_pages ?? 0;
        let page = response.data?.current_page;

        totalCountRef.current = count;

        if (
          sizeSelection === 'all' &&
          count > 0 &&
          payload.length < count &&
          resolvedPageSize < count &&
          !url
        ) {
          const allUrl = buildEmployeePayrollUrl(null, searchQuery, category, ordering, count);
          const allResponse = await axios.get(allUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          payload = extractArray(allResponse.data);
          next = allResponse.data?.next;
          previous = allResponse.data?.previous;
          count = allResponse.data?.count ?? payload.length;
          pages = allResponse.data?.total_pages ?? 0;
          page = allResponse.data?.current_page;
          totalCountRef.current = count;
        }

        setNextUrl(next && typeof next === 'string' && next.trim() ? next : null);
        setPreviousUrl(previous && typeof previous === 'string' && previous.trim() ? previous : null);
        setTotalCount(count);
        setTotalPages(pages);
        if (page !== undefined) {
          setCurrentPage(page);
        }

        setEmployees(payload.map(normalizeEmployeePayroll).filter(Boolean));
      } catch (error) {
        const responseData = error.response?.data;
        const message =
          (typeof responseData === 'string' && responseData) ||
          responseData?.message ||
          responseData?.detail ||
          error.message ||
          'Failed to fetch employee payroll list.';
        setListError(String(message));
        setEmployees([]);
        setNextUrl(null);
        setPreviousUrl(null);
        setTotalCount(0);
        setTotalPages(0);
        totalCountRef.current = 0;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isVsreOwner) return;
    setNextUrl(null);
    setPreviousUrl(null);
    setCurrentPage(1);
    fetchEmployees(null, searchTerm, categoryFilter, nameOrdering, pageSize);
  }, [isVsreOwner, categoryFilter, nameOrdering, pageSize, fetchEmployees]);

  const handleSearch = () => {
    setCurrentPage(1);
    fetchEmployees(null, searchTerm, categoryFilter, nameOrdering, pageSize);
  };

  const hasActiveFilters = Boolean(
    searchTerm.trim() || categoryFilter || nameOrdering,
  );

  const handleClearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('');
    setNameOrdering('');
    setCurrentPage(1);
    fetchEmployees(null, '', '', '', pageSize);
  };

  const reloadEmployees = () =>
    fetchEmployees(null, searchTerm, categoryFilter, nameOrdering, pageSize);

  const handleExportExcel = () => {
    if (!employees.length) {
      showAlert('No employees to export on this page.', 'info');
      return;
    }
    try {
      exportPayrollExcel(employees);
    } catch (error) {
      showAlert(error.message || 'Unable to export Excel file.', 'error');
    }
  };

  const openPayoutCalculation = (employee) => {
    setSelectedPayrollEmployee(employee);
    setShowPayrollForm(true);
  };

  const closeStructureHistory = () => {
    setStructureHistory({
      open: false,
      employee: null,
      rows: [],
      loading: false,
      error: '',
    });
  };

  const openStructureHistory = async (employee) => {
    if (!employee?.id) return;

    setStructureHistory({
      open: true,
      employee,
      rows: [],
      loading: true,
      error: '',
    });

    try {
      const rows = await fetchSalaryStructuresForUser(employee.id);
      setStructureHistory({
        open: true,
        employee,
        rows,
        loading: false,
        error: '',
      });
    } catch (error) {
      const responseData = error.response?.data;
      const message =
        (typeof responseData === 'string' && responseData) ||
        responseData?.message ||
        responseData?.detail ||
        error.message ||
        'Failed to load salary structure history.';
      setStructureHistory({
        open: true,
        employee,
        rows: [],
        loading: false,
        error: String(message),
      });
    }
  };

  const openStructureAdd = (employee) => {
    if (!employee?.id) return;
    setStructureEdit({
      ...emptyStructureEditState(),
      open: true,
      employee,
      mode: 'add',
      step: 'form',
      form: emptyStructureForm(),
    });
  };

  const openStructureEdit = async (employee) => {
    if (!employee?.id) return;
    setStructureEdit({
      ...emptyStructureEditState(),
      open: true,
      employee,
      mode: 'edit',
      loading: true,
    });

    try {
      const rows = await fetchSalaryStructuresForUser(employee.id);
      if (!rows.length) {
        setStructureEdit({
          ...emptyStructureEditState(),
          open: true,
          employee,
          mode: 'edit',
          error: 'No salary structures found to edit.',
        });
        return;
      }
      setStructureEdit({
        ...emptyStructureEditState(),
        open: true,
        employee,
        mode: 'edit',
        rows,
        selectedId: rows[0]?.id ?? null,
        step: 'select',
      });
    } catch (error) {
      const responseData = error.response?.data;
      const message =
        (typeof responseData === 'string' && responseData) ||
        responseData?.message ||
        responseData?.detail ||
        error.message ||
        'Failed to load salary structures.';
      setStructureEdit({
        ...emptyStructureEditState(),
        open: true,
        employee,
        mode: 'edit',
        error: String(message),
      });
    }
  };

  const closeStructureEdit = () => {
    if (structureEdit.saving) return;
    setStructureEdit(emptyStructureEditState());
  };

  const continueStructureEdit = () => {
    if (!structureEdit.selectedId) {
      setStructureEdit((prev) => ({
        ...prev,
        error: 'Please select a salary structure to edit.',
      }));
      return;
    }
    const selected = structureEdit.rows.find(
      (row) => String(row.id) === String(structureEdit.selectedId),
    );
    if (!selected) {
      setStructureEdit((prev) => ({
        ...prev,
        error: 'Please select a salary structure to edit.',
      }));
      return;
    }
    setStructureEdit((prev) => ({
      ...prev,
      step: 'form',
      form: formFromSalaryStructure(selected),
      error: '',
    }));
  };

  const submitStructureEdit = async (e) => {
    e.preventDefault();
    const employee = structureEdit.employee;
    const isAdd = structureEdit.mode === 'add';
    const structureId = structureEdit.selectedId;
    if (!employee?.id) return;
    if (!isAdd && !structureId) return;

    const amountNum = Number(structureEdit.form.amount);
    if (!Number.isFinite(amountNum)) {
      setStructureEdit((prev) => ({ ...prev, error: 'Please enter a valid amount.' }));
      return;
    }
    if (!structureEdit.form.effectiveFrom) {
      setStructureEdit((prev) => ({ ...prev, error: 'Please select effective from date.' }));
      return;
    }

    const headers = getAuthHeaders();
    if (!headers) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setStructureEdit((prev) => ({ ...prev, saving: true, error: '' }));
    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const payload = {
        user: employee.id,
        salary_type: structureEdit.form.salaryType,
        change_type: structureEdit.form.changeType,
        pf_amount: Number(structureEdit.form.pfAmount || 0).toFixed(2),
        esi_amount: Number(structureEdit.form.esiAmount || 0).toFixed(2),
        amount: amountNum.toFixed(2),
        effective_from: structureEdit.form.effectiveFrom,
      };

      if (isAdd) {
        await axios.post(`${baseUrl}/payroll/salary-structures/?user_id=${employee.id}`, payload, {
          headers,
        });
      } else {
        await axios.patch(`${baseUrl}/payroll/salary-structures/${structureId}/`, payload, {
          headers,
        });
      }

      setStructureEdit(emptyStructureEditState());
      showAlert(
        isAdd ? 'Salary structure added successfully.' : 'Salary structure updated successfully.',
        'success',
      );
      await reloadEmployees();
    } catch (error) {
      const responseData = error.response?.data;
      let message = isAdd ? 'Failed to add salary structure.' : 'Failed to update salary structure.';
      if (responseData?.change_type && Array.isArray(responseData.change_type)) {
        message = responseData.change_type[0];
      } else if (typeof responseData === 'string') {
        message = responseData;
      } else if (responseData?.message || responseData?.detail) {
        message = responseData.message || responseData.detail;
      } else if (error.message) {
        message = error.message;
      }
      setStructureEdit((prev) => ({ ...prev, saving: false, error: String(message) }));
    }
  };

  const openStructureDelete = async (employee) => {
    if (!employee?.id) return;
    setStructureDelete({
      open: true,
      employee,
      rows: [],
      selectedId: null,
      loading: true,
      deleting: false,
      error: '',
    });

    try {
      const rows = await fetchSalaryStructuresForUser(employee.id);
      if (!rows.length) {
        setStructureDelete({
          open: true,
          employee,
          rows: [],
          selectedId: null,
          loading: false,
          deleting: false,
          error: 'No salary structures found to delete.',
        });
        return;
      }
      setStructureDelete({
        open: true,
        employee,
        rows,
        selectedId: rows[0]?.id ?? null,
        loading: false,
        deleting: false,
        error: '',
      });
    } catch (error) {
      const responseData = error.response?.data;
      const message =
        (typeof responseData === 'string' && responseData) ||
        responseData?.message ||
        responseData?.detail ||
        error.message ||
        'Failed to load salary structures.';
      setStructureDelete({
        open: true,
        employee,
        rows: [],
        selectedId: null,
        loading: false,
        deleting: false,
        error: String(message),
      });
    }
  };

  const closeStructureDelete = () => {
    if (structureDelete.deleting) return;
    setStructureDelete({
      open: false,
      employee: null,
      rows: [],
      selectedId: null,
      loading: false,
      deleting: false,
      error: '',
    });
  };

  const confirmStructureDelete = async () => {
    if (!structureDelete.selectedId) {
      setStructureDelete((prev) => ({
        ...prev,
        error: 'Please select a salary structure to delete.',
      }));
      return;
    }

    const headers = getAuthHeaders();
    if (!headers) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setStructureDelete((prev) => ({ ...prev, deleting: true, error: '' }));
    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      await axios.delete(`${baseUrl}/payroll/salary-structures/${structureDelete.selectedId}/`, {
        headers: { Authorization: headers.Authorization },
      });
      setStructureDelete({
        open: false,
        employee: null,
        rows: [],
        selectedId: null,
        loading: false,
        deleting: false,
        error: '',
      });
      showAlert('Salary structure deleted successfully.', 'success');
      await reloadEmployees();
    } catch (error) {
      const responseData = error.response?.data;
      const message =
        (typeof responseData === 'string' && responseData) ||
        responseData?.message ||
        responseData?.detail ||
        error.message ||
        'Failed to delete salary structure.';
      setStructureDelete((prev) => ({ ...prev, deleting: false, error: String(message) }));
    }
  };

  if (!isVsreOwner) {
    return (
      <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-8 text-center">
        <p className="mb-2 text-lg font-medium text-gray-700">
          Only VSRE_OWNERs can access this section.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <section aria-labelledby="payout-details-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="payout-details-heading" className="text-base font-bold text-slate-900 sm:text-lg">
            Employee Payroll
          </h2>
        </div>

        <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-3 sm:p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="relative flex min-w-[12rem] flex-1 items-center sm:flex-none">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch();
                    }
                  }}
                  placeholder="Search by name, ID, or mobile..."
                  disabled={isLoading}
                  className={`w-full rounded-lg border-2 border-gray-300 bg-white px-2.5 py-1.5 pr-8 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none sm:w-64 ${
                    isLoading ? 'cursor-wait opacity-60' : ''
                  }`}
                  aria-label="Search employees"
                />
                {isLoading ? (
                  <div className="absolute right-2">
                    <svg
                      className="h-4 w-4 animate-spin text-indigo-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                ) : searchTerm.trim() ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setCurrentPage(1);
                      fetchEmployees(null, '', categoryFilter, nameOrdering, pageSize);
                    }}
                    className="absolute right-2 text-gray-400 transition-colors hover:text-gray-600"
                    title="Clear search"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleSearch}
                disabled={isLoading}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isLoading
                    ? 'cursor-not-allowed bg-gray-300 text-gray-500'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                Search
              </button>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  disabled={isLoading}
                  className={`rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isLoading
                      ? 'cursor-not-allowed text-gray-400'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  title="Clear search, category, and sort"
                >
                  Clear filters
                </button>
              ) : null}
              <label htmlFor="payroll-page-size" className="shrink-0 text-xs font-semibold text-slate-600">
                Rows
              </label>
              <select
                id="payroll-page-size"
                value={pageSize === 'all' ? 'all' : String(pageSize)}
                onChange={(e) => {
                  const next = e.target.value === 'all' ? 'all' : Number(e.target.value) || 20;
                  setPageSize(next);
                  setCurrentPage(1);
                }}
                disabled={isLoading}
                className="min-w-[4.5rem] shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 focus:border-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
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
                onClick={handleExportExcel}
                disabled={isLoading || employees.length === 0}
                className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  isLoading || employees.length === 0
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                    : 'bg-emerald-700 text-white hover:bg-emerald-800'
                }`}
                title="Export current page as Excel"
              >
                Export Excel
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-lg text-gray-600">Loading employees...</div>
          ) : listError ? (
            <div className="rounded-xl border border-rose-200 bg-white px-4 py-10 text-center">
              <p className="text-sm font-semibold text-rose-700">{listError}</p>
              <button
                type="button"
                onClick={() => fetchEmployees(null, searchTerm, categoryFilter, nameOrdering, pageSize)}
                className="mt-3 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Retry
              </button>
            </div>
          ) : employees.length === 0 ? (
            <div className="rounded-xl border-2 border-gray-200 bg-white p-8 text-center">
              <p className="text-lg text-gray-600">
                {hasActiveFilters
                  ? 'No employees found matching your filters.'
                  : 'No employee payroll records found.'}
              </p>
              <p className="mt-2 text-sm text-gray-500">
                {hasActiveFilters
                  ? 'Try a different search or category, or clear filters to see all employees.'
                  : 'Records will appear here once available.'}
              </p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  disabled={isLoading}
                  className="mt-4 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[72rem] border-collapse text-[11px] sm:text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100">
                      <th className="w-8 px-1.5 py-2 text-center" aria-label="Expand salary history" />
                      <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        <EmployeeNameSortButton
                          value={nameOrdering}
                          onChange={(next) => {
                            setCurrentPage(1);
                            setNameOrdering(next);
                          }}
                          disabled={isLoading}
                          compact
                          label="Employee Name"
                        />
                      </th>
                      <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        Emp. ID
                      </th>
                      <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        Email
                      </th>
                      <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        Mobile
                      </th>
                      <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        <EmployeeCategoryFilterButton
                          value={categoryFilter}
                          onChange={(next) => {
                            setCurrentPage(1);
                            setCategoryFilter(next);
                          }}
                          disabled={isLoading}
                          compact
                          label="Category"
                        />
                      </th>
                      <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        Vendor
                      </th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        Basic
                      </th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        PF
                      </th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        ESI
                      </th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        Recent Payment
                      </th>
                      <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        Payout Mode
                      </th>
                      <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        Effective Date
                      </th>
                      <th className="whitespace-nowrap px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        Payout History
                      </th>
                      <th className="whitespace-nowrap px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr
                        key={emp.id}
                        className="border-b border-slate-100 bg-white transition-colors hover:bg-slate-50"
                      >
                        <td className="px-1.5 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => openStructureHistory(emp)}
                            className="text-base font-bold text-gray-600 transition-colors hover:text-gray-900"
                            title={`View salary structure history for ${emp.name}`}
                            aria-label={`View salary structure history for ${emp.name}`}
                          >
                            +
                          </button>
                        </td>
                        <td className="px-2 py-2 font-semibold text-slate-800">
                          <span className="block max-w-[10rem] truncate" title={emp.name}>
                            {emp.name}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-slate-700">{emp.employeeId || '—'}</td>
                        <td className="max-w-[10rem] px-2 py-2 text-slate-700">
                          {emp.email ? (
                            <a
                              href={`mailto:${emp.email}`}
                              className="block truncate text-indigo-600 hover:underline"
                              title={emp.email}
                            >
                              {emp.email}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-slate-700">
                          {emp.mobile || '—'}
                        </td>
                        <td className="px-2 py-2 text-slate-700">
                          {emp.employeeCategory || '—'}
                        </td>
                        <td className="px-2 py-2 text-slate-700">{emp.vendorName || '—'}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right text-slate-700">
                          {formatMoney(emp.basicSalary)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right text-slate-700">
                          {formatMoney(emp.pfAmount)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right text-slate-700">
                          {formatMoney(emp.esiAmount)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right text-slate-700">
                          {formatMoney(emp.recentPayment)}
                        </td>
                        <td className="px-2 py-2 text-slate-700">
                          {formatPayoutMode(emp.payoutMode)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-slate-700">
                          {formatDate(emp.effectiveDate)}
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <div className="flex justify-center">
                            <button
                              type="button"
                              onClick={() => openPayoutCalculation(emp)}
                              className="inline-flex min-h-7 w-[4.5rem] flex-col items-center justify-center rounded-md bg-indigo-600 px-1 py-0.5 text-center text-[8px] font-semibold leading-[1.05] text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 sm:text-[9px]"
                              title={`Open payroll history for ${emp.name}`}
                              aria-label={`Payroll history for ${emp.name}`}
                            >
                              <span className="block w-full whitespace-normal break-words">
                                Payroll
                                <br />
                                History
                              </span>
                            </button>
                          </div>
                        </td>
                        <td className="min-w-[11rem] px-2 py-2 align-middle">
                          <div className="flex flex-nowrap items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openStructureAdd(emp)}
                              className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border border-indigo-200 bg-indigo-50 px-2 text-[10px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 sm:px-2.5 sm:text-xs"
                              title="Add salary structure"
                              aria-label={`Add structure for ${emp.name}`}
                            >
                              Add Structure
                            </button>
                            <button
                              type="button"
                              onClick={() => openStructureEdit(emp)}
                              className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 sm:px-2.5 sm:text-xs"
                              title="Edit salary structure"
                              aria-label={`Edit structure for ${emp.name}`}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => openStructureDelete(emp)}
                              className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border border-rose-200 bg-rose-50 px-2 text-[10px] font-semibold text-rose-700 transition-colors hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-1 sm:px-2.5 sm:text-xs"
                              title="Delete salary structure"
                              aria-label={`Delete structure for ${emp.name}`}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalCount > 0 ? (
                <div className="mt-3 flex flex-col items-center justify-between gap-2 sm:flex-row">
                  <div className="text-xs text-gray-600">
                    {pageSize === 'all' ? (
                      <>
                        Showing all <span className="font-semibold">{totalCount}</span> employees
                      </>
                    ) : (
                      <>
                        Page <span className="font-semibold">{currentPage}</span>
                        {totalPages > 0 ? (
                          <>
                            {' '}
                            of <span className="font-semibold">{totalPages}</span>
                          </>
                        ) : null}
                        {' · '}
                        <span className="font-semibold">{totalCount}</span> employees
                        {' · '}
                        <span className="font-semibold">{pageSize}</span> per page
                      </>
                    )}
                    {searchTerm.trim() || categoryFilter ? ' (filtered)' : ''}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (previousUrl && !isLoading && pageSize !== 'all') {
                          fetchEmployees(
                            previousUrl,
                            searchTerm,
                            categoryFilter,
                            nameOrdering,
                            pageSize,
                          );
                        }
                      }}
                      disabled={!previousUrl || isLoading || pageSize === 'all'}
                      className={`rounded-lg border px-2 py-1 text-xs font-semibold transition-colors ${
                        !previousUrl || isLoading || pageSize === 'all'
                          ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 opacity-60'
                          : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (nextUrl && !isLoading && pageSize !== 'all') {
                          fetchEmployees(
                            nextUrl,
                            searchTerm,
                            categoryFilter,
                            nameOrdering,
                            pageSize,
                          );
                        }
                      }}
                      disabled={!nextUrl || isLoading || pageSize === 'all'}
                      className={`rounded-lg border px-2 py-1 text-xs font-semibold transition-colors ${
                        !nextUrl || isLoading || pageSize === 'all'
                          ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 opacity-60'
                          : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {structureHistory.open ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="salary-structure-history-title"
              className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div>
                  <h3
                    id="salary-structure-history-title"
                    className="text-sm font-bold text-slate-900 sm:text-base"
                  >
                    Salary Structure History
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {structureHistory.employee?.name || 'Employee'}
                    {structureHistory.employee?.employeeId
                      ? ` · ${structureHistory.employee.employeeId}`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeStructureHistory}
                  className="rounded-md px-2 py-1 text-lg font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Close salary structure history"
                >
                  ×
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-4">
                {structureHistory.loading ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
                    <p className="text-sm text-slate-600">Loading salary structures...</p>
                  </div>
                ) : structureHistory.error ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-rose-700">{structureHistory.error}</p>
                    <button
                      type="button"
                      onClick={() => openStructureHistory(structureHistory.employee)}
                      className="mt-3 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      Retry
                    </button>
                  </div>
                ) : structureHistory.rows.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-12 text-center">
                    <p className="text-sm font-semibold text-slate-800">No salary structures found</p>
                    <p className="mt-1 text-xs text-slate-500">
                      This employee has no salary structure history yet.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[40rem] border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-100">
                          <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                            Type
                          </th>
                          <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                            Change
                          </th>
                          <th className="px-2.5 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                            Amount
                          </th>
                          <th className="px-2.5 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                            PF
                          </th>
                          <th className="px-2.5 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                            ESI
                          </th>
                          <th className="px-2.5 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                            Final Salary
                          </th>
                          <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                            Effective From
                          </th>
                          <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                            Updated
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {structureHistory.rows.map((row) => (
                          <tr
                            key={row.id ?? `${row.effective_from}-${row.amount}`}
                            className="border-b border-slate-100 hover:bg-slate-50"
                          >
                            <td className="px-2.5 py-2 text-slate-700">
                              {formatLabel(row.salary_type)}
                            </td>
                            <td className="px-2.5 py-2 text-slate-700">
                              {formatLabel(row.change_type)}
                            </td>
                            <td className="whitespace-nowrap px-2.5 py-2 text-right text-slate-700">
                              {formatMoney(row.amount)}
                            </td>
                            <td className="whitespace-nowrap px-2.5 py-2 text-right text-slate-700">
                              {formatMoney(row.pf_amount)}
                            </td>
                            <td className="whitespace-nowrap px-2.5 py-2 text-right text-slate-700">
                              {formatMoney(row.esi_amount)}
                            </td>
                            <td className="whitespace-nowrap px-2.5 py-2 text-right font-semibold text-slate-800">
                              {formatMoney(row.final_salary)}
                            </td>
                            <td className="whitespace-nowrap px-2.5 py-2 text-slate-700">
                              {formatDate(row.effective_from)}
                            </td>
                            <td className="whitespace-nowrap px-2.5 py-2 text-slate-700">
                              {formatDateTime(row.updated_at || row.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end border-t border-slate-200 px-4 py-3">
                <button
                  type="button"
                  onClick={closeStructureHistory}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {structureEdit.open ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="salary-structure-edit-title"
              className="relative w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            >
              {structureEdit.saving ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
                    <p className="text-xs font-semibold text-gray-700">Saving...</p>
                  </div>
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div>
                  <h3
                    id="salary-structure-edit-title"
                    className="text-sm font-bold text-slate-900 sm:text-base"
                  >
                    {structureEdit.mode === 'add'
                      ? 'Add Salary Structure'
                      : structureEdit.step === 'form'
                        ? 'Edit Salary Structure'
                        : 'Select Salary Structure'}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {structureEdit.employee?.name || 'Employee'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeStructureEdit}
                  disabled={structureEdit.saving}
                  className="rounded-md px-2 py-1 text-lg font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                  aria-label="Close edit salary structure"
                >
                  ×
                </button>
              </div>

              {structureEdit.step === 'select' ? (
                <div className="space-y-3 p-4">
                  {structureEdit.loading ? (
                    <div className="flex flex-col items-center gap-2 py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
                      <p className="text-sm text-slate-600">Loading structures...</p>
                    </div>
                  ) : structureEdit.error && !structureEdit.rows.length ? (
                    <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {structureEdit.error}
                    </div>
                  ) : (
                    <>
                      {structureEdit.error ? (
                        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                          {structureEdit.error}
                        </div>
                      ) : null}
                      <p className="text-xs text-slate-600">
                        Select the salary structure to edit.
                      </p>
                      <div className="max-h-56 space-y-1.5 overflow-y-auto">
                        {structureEdit.rows.map((row) => (
                          <label
                            key={row.id}
                            className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors ${
                              String(structureEdit.selectedId) === String(row.id)
                                ? 'border-indigo-300 bg-indigo-50'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name="edit-structure"
                              className="mt-0.5"
                              checked={String(structureEdit.selectedId) === String(row.id)}
                              onChange={() =>
                                setStructureEdit((prev) => ({
                                  ...prev,
                                  selectedId: row.id,
                                  error: '',
                                }))
                              }
                              disabled={structureEdit.loading || structureEdit.saving}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-semibold text-slate-800">
                                {formatLabel(row.change_type)} · {formatMoney(row.amount)}
                              </span>
                              <span className="mt-0.5 block text-slate-600">
                                {formatLabel(row.salary_type)} · Effective{' '}
                                {formatDate(row.effective_from)} · Final{' '}
                                {formatMoney(row.final_salary)}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={closeStructureEdit}
                      disabled={structureEdit.saving}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={continueStructureEdit}
                      disabled={
                        structureEdit.loading ||
                        structureEdit.saving ||
                        !structureEdit.selectedId
                      }
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={submitStructureEdit} className="space-y-3 p-4">
                  {structureEdit.error ? (
                    <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {structureEdit.error}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="ss-salary-type" className={labelClass}>
                        Salary type
                      </label>
                      <select
                        id="ss-salary-type"
                        value={structureEdit.form.salaryType}
                        onChange={(e) =>
                          setStructureEdit((prev) => ({
                            ...prev,
                            form: { ...prev.form, salaryType: e.target.value },
                          }))
                        }
                        className={fieldClass}
                        disabled={structureEdit.saving}
                      >
                        {SALARY_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="ss-change-type" className={labelClass}>
                        Change type
                      </label>
                      <select
                        id="ss-change-type"
                        value={structureEdit.form.changeType}
                        onChange={(e) =>
                          setStructureEdit((prev) => ({
                            ...prev,
                            form: { ...prev.form, changeType: e.target.value },
                          }))
                        }
                        className={fieldClass}
                        disabled={structureEdit.saving}
                      >
                        {CHANGE_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="ss-amount" className={labelClass}>
                        Amount <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="ss-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={structureEdit.form.amount}
                        onChange={(e) =>
                          setStructureEdit((prev) => ({
                            ...prev,
                            form: { ...prev.form, amount: e.target.value },
                          }))
                        }
                        className={fieldClass}
                        disabled={structureEdit.saving}
                      />
                    </div>
                    <div>
                      <label htmlFor="ss-effective" className={labelClass}>
                        Effective from <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="ss-effective"
                        type="date"
                        required
                        value={structureEdit.form.effectiveFrom}
                        onChange={(e) =>
                          setStructureEdit((prev) => ({
                            ...prev,
                            form: { ...prev.form, effectiveFrom: e.target.value },
                          }))
                        }
                        className={fieldClass}
                        disabled={structureEdit.saving}
                      />
                    </div>
                    <div>
                      <label htmlFor="ss-pf" className={labelClass}>
                        PF amount
                      </label>
                      <input
                        id="ss-pf"
                        type="number"
                        min="0"
                        step="0.01"
                        value={structureEdit.form.pfAmount}
                        onChange={(e) =>
                          setStructureEdit((prev) => ({
                            ...prev,
                            form: { ...prev.form, pfAmount: e.target.value },
                          }))
                        }
                        className={fieldClass}
                        disabled={structureEdit.saving}
                      />
                    </div>
                    <div>
                      <label htmlFor="ss-esi" className={labelClass}>
                        ESI amount
                      </label>
                      <input
                        id="ss-esi"
                        type="number"
                        min="0"
                        step="0.01"
                        value={structureEdit.form.esiAmount}
                        onChange={(e) =>
                          setStructureEdit((prev) => ({
                            ...prev,
                            form: { ...prev.form, esiAmount: e.target.value },
                          }))
                        }
                        className={fieldClass}
                        disabled={structureEdit.saving}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    {structureEdit.mode === 'add' ? (
                      <button
                        type="button"
                        onClick={closeStructureEdit}
                        disabled={structureEdit.saving}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setStructureEdit((prev) => ({
                            ...prev,
                            step: 'select',
                            error: '',
                          }))
                        }
                        disabled={structureEdit.saving}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Back
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={structureEdit.saving}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {structureEdit.saving
                        ? structureEdit.mode === 'add'
                          ? 'Adding...'
                          : 'Saving...'
                        : structureEdit.mode === 'add'
                          ? 'Add Structure'
                          : 'Save'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        ) : null}

        {structureDelete.open ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="salary-structure-delete-title"
              className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div>
                  <h3
                    id="salary-structure-delete-title"
                    className="text-sm font-bold text-slate-900 sm:text-base"
                  >
                    Delete Salary Structure
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {structureDelete.employee?.name || 'Employee'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeStructureDelete}
                  disabled={structureDelete.deleting}
                  className="rounded-md px-2 py-1 text-lg font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                  aria-label="Close delete salary structure"
                >
                  ×
                </button>
              </div>
              <div className="space-y-3 p-4">
                {structureDelete.loading ? (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
                    <p className="text-sm text-slate-600">Loading structures...</p>
                  </div>
                ) : structureDelete.error && !structureDelete.rows.length ? (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {structureDelete.error}
                  </div>
                ) : (
                  <>
                    {structureDelete.error ? (
                      <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {structureDelete.error}
                      </div>
                    ) : null}
                    <p className="text-xs text-slate-600">
                      Select the salary structure to delete. This cannot be undone.
                    </p>
                    <div className="max-h-56 space-y-1.5 overflow-y-auto">
                      {structureDelete.rows.map((row) => (
                        <label
                          key={row.id}
                          className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors ${
                            String(structureDelete.selectedId) === String(row.id)
                              ? 'border-rose-300 bg-rose-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="delete-structure"
                            className="mt-0.5"
                            checked={String(structureDelete.selectedId) === String(row.id)}
                            onChange={() =>
                              setStructureDelete((prev) => ({ ...prev, selectedId: row.id }))
                            }
                            disabled={structureDelete.deleting}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-semibold text-slate-800">
                              {formatLabel(row.change_type)} · {formatMoney(row.amount)}
                            </span>
                            <span className="mt-0.5 block text-slate-600">
                              {formatLabel(row.salary_type)} · Effective{' '}
                              {formatDate(row.effective_from)} · Final{' '}
                              {formatMoney(row.final_salary)}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeStructureDelete}
                    disabled={structureDelete.deleting}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmStructureDelete}
                    disabled={
                      structureDelete.deleting ||
                      structureDelete.loading ||
                      !structureDelete.selectedId
                    }
                    className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {structureDelete.deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {showPayrollForm && selectedPayrollEmployee ? (
          <PayrollForm
            key={`payroll-calc-${selectedPayrollEmployee.id}`}
            employee={selectedPayrollEmployee}
            isOpen
            viewMode="calculation"
            attendanceRecords={attendanceRecords[selectedPayrollEmployee.id] || {}}
            onClose={() => {
              setShowPayrollForm(false);
              setSelectedPayrollEmployee(null);
            }}
          />
        ) : null}
        <AlertModal
          open={alertState.open}
          type={alertState.type}
          message={alertState.message}
          onClose={closeAlert}
        />
      </section>
    </div>
  );
};

export default Payroll;
