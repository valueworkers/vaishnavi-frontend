import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { hasOwnerPrivileges } from '../../utils/authRoles';
import {
  EMPLOYEE_USER_TYPE_MANAGER,
  EMPLOYEE_USER_TYPE_STAFF,
  buildEmployeesListUrl,
  ensureEmployeesListUrl,
} from '../../utils/employeeListQuery';

const DEFAULT_PHOTO = 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8cHJvZmlsZXxlbnwwfHwwfHx8MA%3D%3D';

const Attendence = () => {
  const [authUser, setAuthUser] = useState(null);
  const [mainTab, setMainTab] = useState('attendance'); // attendance
  const [subTab, setSubTab] = useState('my-staff'); // my-staff | my-manager | my | add | reports
  const [attendanceData, setAttendanceData] = useState([]);
  const [managers, setManagers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [isLoadingManagers, setIsLoadingManagers] = useState(false);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [managersError, setManagersError] = useState('');
  const [staffError, setStaffError] = useState('');
  const [detailsData, setDetailsData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageManagers, setCurrentPageManagers] = useState(1);
  const [currentPageStaff, setCurrentPageStaff] = useState(1);
  const [searchStaff, setSearchStaff] = useState('');
  const [searchManager, setSearchManager] = useState('');
  const [nextUrlStaff, setNextUrlStaff] = useState(null);
  const [previousUrlStaff, setPreviousUrlStaff] = useState(null);
  const [totalCountStaff, setTotalCountStaff] = useState(0);
  const [nextUrlManagers, setNextUrlManagers] = useState(null);
  const [previousUrlManagers, setPreviousUrlManagers] = useState(null);
  const [totalCountManagers, setTotalCountManagers] = useState(0);
  const [nextUrlEmployeeList, setNextUrlEmployeeList] = useState(null); // Pagination URLs for employee sidebar list
  const [previousUrlEmployeeList, setPreviousUrlEmployeeList] = useState(null);
  const [totalCountEmployeeList, setTotalCountEmployeeList] = useState(0);
  const [showAttendanceView, setShowAttendanceView] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [attendanceEmployeeList, setAttendanceEmployeeList] = useState([]); // List of employees to show in sidebar
  const [attendanceView, setAttendanceView] = useState('monthly'); // daily | monthly
  const [attendanceCalendarMonth, setAttendanceCalendarMonth] = useState(new Date());
  const [attendanceRecords, setAttendanceRecords] = useState({}); // { employeeId: { date: 'present' | 'absent' | 'halfday' | 'paidleave' } } - Only from API
  const [openDropdownDate, setOpenDropdownDate] = useState(null); // Track which date's dropdown is open
  const [tempAttendanceRecords, setTempAttendanceRecords] = useState({}); // Temporary state for modal changes
  const [attendanceStatuses, setAttendanceStatuses] = useState([]); // Attendance statuses from API
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
  const [isMarkingAttendance, setIsMarkingAttendance] = useState(false); // Loading state for marking attendance
  const [attendanceMessage, setAttendanceMessage] = useState({ type: '', text: '' }); // Success/error message
  const [currentPageEmployeeList, setCurrentPageEmployeeList] = useState(1); // Pagination for employee sidebar list
  const lastSearchQueryRef = useRef(''); // Track last search query to prevent duplicate API calls
  const ITEMS_PER_PAGE = 10;
  const EMPLOYEES_PER_PAGE = 10; // Items per page for employee sidebar list

  // Helper function to calculate total pages
  const getTotalPages = (totalCount, itemsPerPage) => {
    return Math.max(1, Math.ceil(totalCount / itemsPerPage));
  };

  // Helper function to generate page numbers to display (shows up to 7 pages around current)
  const getPageNumbers = (currentPage, totalPages, maxVisible = 7) => {
    const pages = [];
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    // Adjust start page if we're near the end
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  };

  // Helper function to construct URL with page parameter
  const getUrlWithPage = (baseUrl, page) => {
    try {
      const url = new URL(baseUrl);
      url.searchParams.set('page', page);
      return url.toString();
    } catch (e) {
      // If baseUrl is not a full URL, construct it
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}page=${page}`;
    }
  };

  // Navigate to specific page for staff
  const goToStaffPage = async (page) => {
    if (page < 1 || page > getTotalPages(totalCountStaff, ITEMS_PER_PAGE) || isLoadingStaff) return;
    let url = buildEmployeesListUrl(null, searchStaff, '', '', EMPLOYEE_USER_TYPE_STAFF);
    url = getUrlWithPage(url, page);
    await fetchStaff(url, false, searchStaff);
    setCurrentPageStaff(page);
  };

  // Navigate to specific page for managers
  const goToManagerPage = async (page) => {
    if (page < 1 || page > getTotalPages(totalCountManagers, ITEMS_PER_PAGE) || isLoadingManagers) return;
    let url = buildEmployeesListUrl(null, searchManager, '', '', EMPLOYEE_USER_TYPE_MANAGER);
    url = getUrlWithPage(url, page);
    await fetchManagers(url, false, searchManager);
    setCurrentPageManagers(page);
  };

  // Navigate to specific page for employee list
  const goToEmployeeListPage = async (page, isStaff = true) => {
    const totalPages = getTotalPages(totalCountEmployeeList, EMPLOYEES_PER_PAGE);
    if (page < 1 || page > totalPages || (isStaff ? isLoadingStaff : isLoadingManagers)) return;
    if (isStaff) {
      let url = buildEmployeesListUrl(null, searchStaff, '', '', EMPLOYEE_USER_TYPE_STAFF);
      url = getUrlWithPage(url, page);
      await fetchStaff(url, true, searchStaff);
    } else {
      let url = buildEmployeesListUrl(null, searchManager, '', '', EMPLOYEE_USER_TYPE_MANAGER);
      url = getUrlWithPage(url, page);
      await fetchManagers(url, true, searchManager);
    }
    setCurrentPageEmployeeList(page);
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
        setAuthUser(null);
      }
    };

    checkAuthStatus();

    const handleAuthChange = () => checkAuthStatus();
    window.addEventListener('auth-changed', handleAuthChange);
    window.addEventListener('storage', handleAuthChange);

    return () => {
      window.removeEventListener('auth-changed', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  const isVsreOwner = useMemo(() => hasOwnerPrivileges(authUser), [authUser]);

  // Reset sub-tab when main tab changes
  useEffect(() => {
    if (mainTab === 'attendance') {
      setSubTab('my-staff');
    }
    setCurrentPage(1);
    setCurrentPageManagers(1);
    setCurrentPageStaff(1);
    setCurrentPageEmployeeList(1);
    // Reset attendance view when switching tabs
    setShowAttendanceView(false);
    setSelectedEmployee(null);
    setAttendanceEmployeeList([]);
    setTempAttendanceRecords({});
    setOpenDropdownDate(null);
  }, [mainTab]);

  const fetchAttendance = async () => {
    if (!isVsreOwner) {
      setError('Only VSRE_OWNER can access attendance records.');
      return;
    }

    setIsLoading(true);
    setError('');

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setError('Authorization token missing. Please log in again.');
      setIsLoading(false);
      return;
    }

    try {
      // TODO: Replace with actual API endpoint when available
      // const response = await axios.get(
      //   `${import.meta.env.VITE_BASEURL_CARE}/attendance/`,
      //   {
      //     headers: { Authorization: `Bearer ${accessToken}` },
      //     params: { date: selectedDate }
      //   }
      // );
      // setAttendanceData(response.data?.results || response.data?.data || []);

      // Mock data for now
      setAttendanceData([]);
    } catch (error) {
      const responseData = error.response?.data;
      let message =
        (typeof responseData === 'string' && responseData) ||
        responseData?.message ||
        error.message ||
        'Failed to fetch attendance records.';
      setError(message);
      setAttendanceData([]);
    } finally {
      setIsLoading(false);
    }
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

  const extractArray = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.data?.results)) return payload.data.results;
    return [];
  };

  const normalizeManagerFromApi = (data) => {
    if (!data) return null;
    const fullName = [data.first_name, data.middle_name, data.last_name]
      .filter(Boolean)
      .join(' ');
    return {
      id: data.id ?? Date.now(),
      name: fullName || data.name || 'New Manager',
      firstName: data.first_name || '',
      lastName: data.last_name || '',
      mobile: data.mobile_number || data.phone || '',
      email: data.email || '',
      userPersona: 'MANAGER',
      photo: data.profile_pic || data.photo || DEFAULT_PHOTO,
      empActive: data.is_active !== undefined ? data.is_active : true,
      isDeleted: Boolean(data.is_deleted),
    };
  };

  const normalizeStaffFromApi = (data) => {
    if (!data) return null;
    const fullName = [data.first_name, data.middle_name, data.last_name]
      .filter(Boolean)
      .join(' ');
    return {
      id: data.id ?? Date.now(),
      name: fullName || data.name || 'New Staff',
      firstName: data.first_name || '',
      lastName: data.last_name || '',
      mobile: data.mobile_number || data.phone || '',
      email: data.email || '',
      userPersona: 'STAFF',
      photo: data.profile_pic || data.photo || DEFAULT_PHOTO,
      empActive: data.is_active !== undefined ? data.is_active : true,
      isDeleted: Boolean(data.is_deleted),
    };
  };

  const fetchManagers = useCallback(async (url = null, updateEmployeeListPagination = false, searchQuery = '') => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setManagersError('Authorization token missing. Please log in again.');
      return;
    }

    setIsLoadingManagers(true);
    setManagersError('');

    try {
      const apiUrl = ensureEmployeesListUrl(
        url || buildEmployeesListUrl(null, searchQuery, '', '', EMPLOYEE_USER_TYPE_MANAGER),
        EMPLOYEE_USER_TYPE_MANAGER,
        searchQuery
      );

      const response = await axios.get(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const managersPayload = extractArray(response.data);
      
      // Store pagination URLs and current page from API
      // Normalize null/empty string to null for consistent checking
      const nextUrl = response.data?.next;
      const previousUrl = response.data?.previous;
      setNextUrlManagers(nextUrl && typeof nextUrl === 'string' && nextUrl.trim() ? nextUrl : null);
      setPreviousUrlManagers(previousUrl && typeof previousUrl === 'string' && previousUrl.trim() ? previousUrl : null);
      setTotalCountManagers(response.data?.count || managersPayload.length);
      
      // Update current page from API response if available
      if (response.data?.current_page !== undefined) {
        setCurrentPageManagers(response.data.current_page);
      }
      
      // Also update employee list pagination if we're viewing managers in attendance
      if (updateEmployeeListPagination || (mainTab === 'attendance' && subTab === 'my-manager')) {
        setNextUrlEmployeeList(nextUrl && typeof nextUrl === 'string' && nextUrl.trim() ? nextUrl : null);
        setPreviousUrlEmployeeList(previousUrl && typeof previousUrl === 'string' && previousUrl.trim() ? previousUrl : null);
        setTotalCountEmployeeList(response.data?.count || managersPayload.length);
        if (response.data?.current_page !== undefined) {
          setCurrentPageEmployeeList(response.data.current_page);
        }
      }

      const normalizedManagers = managersPayload.map(normalizeManagerFromApi).filter(Boolean);
      setManagers(normalizedManagers);
    } catch (error) {
      const responseData = error.response?.data;
      let message =
        (typeof responseData === 'string' && responseData) ||
        responseData?.message ||
        error.message ||
        'Failed to fetch managers.';
      setManagersError(message);
      setManagers([]);
    } finally {
      setIsLoadingManagers(false);
    }
  }, [mainTab, subTab]);

  const fetchStaff = useCallback(async (url = null, updateEmployeeListPagination = false, searchQuery = '') => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setStaffError('Authorization token missing. Please log in again.');
      return;
    }

    setIsLoadingStaff(true);
    setStaffError('');

    try {
      const apiUrl = ensureEmployeesListUrl(
        url || buildEmployeesListUrl(null, searchQuery, '', '', EMPLOYEE_USER_TYPE_STAFF),
        EMPLOYEE_USER_TYPE_STAFF,
        searchQuery
      );

      const response = await axios.get(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const staffPayload = extractArray(response.data);
      
      // Store pagination URLs and current page from API
      // Normalize null/empty string to null for consistent checking
      const nextUrl = response.data?.next;
      const previousUrl = response.data?.previous;
      setNextUrlStaff(nextUrl && typeof nextUrl === 'string' && nextUrl.trim() ? nextUrl : null);
      setPreviousUrlStaff(previousUrl && typeof previousUrl === 'string' && previousUrl.trim() ? previousUrl : null);
      setTotalCountStaff(response.data?.count || staffPayload.length);
      
      // Update current page from API response if available
      if (response.data?.current_page !== undefined) {
        setCurrentPageStaff(response.data.current_page);
      }
      
      // Also update employee list pagination if we're viewing staff in attendance
      if (updateEmployeeListPagination || (mainTab === 'attendance' && subTab === 'my-staff')) {
        setNextUrlEmployeeList(nextUrl && typeof nextUrl === 'string' && nextUrl.trim() ? nextUrl : null);
        setPreviousUrlEmployeeList(previousUrl && typeof previousUrl === 'string' && previousUrl.trim() ? previousUrl : null);
        setTotalCountEmployeeList(response.data?.count || staffPayload.length);
        if (response.data?.current_page !== undefined) {
          setCurrentPageEmployeeList(response.data.current_page);
        }
      }

      const normalizedStaff = staffPayload.map(normalizeStaffFromApi).filter(Boolean);
      setStaff(normalizedStaff);
    } catch (error) {
      const responseData = error.response?.data;
      let message =
        (typeof responseData === 'string' && responseData) ||
        responseData?.message ||
        error.message ||
        'Failed to fetch staff.';
      setStaffError(message);
      setStaff([]);
    } finally {
      setIsLoadingStaff(false);
    }
  }, [mainTab, subTab]);

  // Fetch attendance statuses with pagination support (optimized with safety limit)
  const fetchAttendanceStatuses = async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      return;
    }

    setIsLoadingStatuses(true);
    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const allStatuses = [];
      let nextUrl = `${baseUrl}/payroll/attendance-status/`;
      const visitedUrls = new Set();
      const maxPages = 10; // Safety limit to prevent infinite loops

      // Fetch all pages with safety limit
      let pageCount = 0;
      while (nextUrl && pageCount < maxPages && !visitedUrls.has(nextUrl)) {
        visitedUrls.add(nextUrl);
        pageCount++;
        
        const response = await axios.get(nextUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        const statuses = extractArray(response.data);
        allStatuses.push(...statuses);
        
        // Check if there's a next page
        nextUrl = response.data?.next || null;
      }
      
      // Filter only active statuses
      setAttendanceStatuses(allStatuses.filter(s => s.is_active));
    } catch (error) {
      // Don't set fallback statuses - show empty state if API fails
      setAttendanceStatuses([]);
    } finally {
      setIsLoadingStatuses(false);
    }
  };

  useEffect(() => {
    if (isVsreOwner && mainTab === 'attendance' && subTab === 'my-manager') {
      // Reset pagination URLs to ensure clean state
      setNextUrlManagers(null);
      setPreviousUrlManagers(null);
      setCurrentPageManagers(1);
      fetchManagers();
    }
    if (isVsreOwner && mainTab === 'attendance' && subTab === 'my-staff') {
      // Reset ref and fetch staff directly when tab changes (without search)
      lastSearchQueryRef.current = '';
      // Reset pagination URLs to ensure clean state
      setNextUrlStaff(null);
      setPreviousUrlStaff(null);
      setCurrentPageStaff(1);
      setCurrentPageEmployeeList(1);
      fetchStaff(null, false, '');
    }
  }, [isVsreOwner, mainTab, subTab, fetchManagers, fetchStaff]);

  // Fetch attendance statuses on mount
  useEffect(() => {
    if (isVsreOwner) {
      fetchAttendanceStatuses();
    }
  }, [isVsreOwner]);

  // Reset subTab when mainTab changes
  useEffect(() => {
    if (mainTab === 'attendance' && subTab !== 'my-staff' && subTab !== 'my-manager' && subTab !== 'reports') {
      setSubTab('my-staff');
    }
  }, [mainTab]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdownDate && !event.target.closest('.dropdown-container')) {
        setOpenDropdownDate(null);
      }
    };
    if (openDropdownDate) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openDropdownDate]);

  const totalPages = useMemo(() => {
    const data = mainTab === 'attendance' ? attendanceData : detailsData;
    return Math.max(1, Math.ceil(data.length / ITEMS_PER_PAGE));
  }, [mainTab, attendanceData.length, detailsData.length]);

  const paginatedData = useMemo(() => {
    const data = mainTab === 'attendance' ? attendanceData : detailsData;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return data.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [mainTab, attendanceData, detailsData, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Use staff directly (no client-side filtering since we use API search)
  const filteredStaff = useMemo(() => {
    return staff;
  }, [staff]);

  // Use managers directly (no client-side filtering since we use API search)
  const filteredManagers = useMemo(() => {
    return managers;
  }, [managers]);

  // Handle search button click or Enter key press
  const handleSearchStaff = () => {
    if (mainTab === 'attendance' && subTab === 'my-staff') {
      // Reset to page 1 when searching
      setCurrentPageStaff(1);
      setCurrentPageEmployeeList(1);
      // Update ref and call API
      lastSearchQueryRef.current = searchStaff;
      fetchStaff(null, false, searchStaff);
    }
  };

  // Handle manager search button click or Enter key press
  const handleSearchManager = () => {
    if (mainTab === 'attendance' && subTab === 'my-manager') {
      // Reset to page 1 when searching
      setCurrentPageManagers(1);
      setCurrentPageEmployeeList(1);
      // Call API with search query
      fetchManagers(null, false, searchManager);
    }
  };

  useEffect(() => {
    if (searchManager.trim()) {
      setCurrentPageManagers(1);
      setCurrentPageEmployeeList(1);
    }
  }, [searchManager]);

  // Calendar helpers
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  const getMonthMeta = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return {
      daysInMonth: lastDay.getDate(),
      startingDay: firstDay.getDay(),
    };
  };

  // Helper function to log attendance details
  const logAttendanceDetails = (employee, month) => {
    if (!employee || !month) return;
    
    const year = month.getFullYear();
    const monthNum = month.getMonth();
    const startDate = new Date(year, monthNum, 1); // 1st of the month
    const endDate = new Date(year, monthNum + 1, 0); // Last day of the month
    
    // Format dates as YYYY-MM-DD
    const startDateStr = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;
    const endDateStr = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
  };

  // Check if a date is allowed for marking attendance
  // Rules:
  // 1. Date must be from August 2025 onwards
  // 2. Date cannot be beyond next month (disable future months)
  // 3. Next month is enabled only on the last day of current month
  const isDateAllowedForAttendance = (date) => {
    const dateToCheck = new Date(date);
    const minDate = new Date('2025-08-01'); // August 1, 2025
    
    // Check minimum date requirement
    if (dateToCheck < minDate) {
      return false;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get last day of current month
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const lastDayOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0);
    const isLastDayOfMonth = today.getDate() === lastDayOfCurrentMonth.getDate();
    
    // Get end of next month (maximum allowed date)
    const endOfNextMonth = new Date(currentYear, currentMonth + 2, 0);
    endOfNextMonth.setHours(23, 59, 59, 999);
    
    // Get end of current month (if not last day)
    const endOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0);
    endOfCurrentMonth.setHours(23, 59, 59, 999);
    
    // If today is the last day of current month, allow up to end of next month
    // Otherwise, allow only up to end of current month
    const maxAllowedDate = isLastDayOfMonth ? endOfNextMonth : endOfCurrentMonth;
    
    dateToCheck.setHours(0, 0, 0, 0);
    
    return dateToCheck <= maxAllowedDate;
  };

  // Map API status code to internal status value (defined early for use in fetchUserAttendance)
  const mapStatusCodeToStatus = (code) => {
    if (!code) return '';
    const codeMap = {
      'P': 'present',
      'A': 'absent',
      'HD': 'halfday',
      'PL': 'paidleave',
      'UL': 'unpaidleave',
      // Legacy codes for backward compatibility
      'PRESENT': 'present',
      'ABSENT': 'absent',
      'HALF-DAY': 'halfday',
      'PAID-LEAVE': 'paidleave',
      'WEEKLY-OFF': 'weeklyoff',
    };
    return codeMap[code] || code.toLowerCase().replace(/-/g, '').replace(/\s+/g, '');
  };

  // Get color classes for status dynamically
  const getStatusColorClasses = (statusCode, isActive = false) => {
    const colorMap = {
      'P': {
        active: 'bg-green-600 text-white',
        inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        badge: 'bg-green-100 text-green-700',
        dropdown: 'bg-green-50 text-green-700 hover:bg-green-100',
      },
      'A': {
        active: 'bg-red-600 text-white',
        inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        badge: 'bg-red-100 text-red-700',
        dropdown: 'bg-red-50 text-red-700 hover:bg-red-100',
      },
      'HD': {
        active: 'bg-yellow-400 text-white',
        inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        badge: 'bg-yellow-100 text-yellow-700',
        dropdown: 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
      },
      'PL': {
        active: 'bg-blue-600 text-white',
        inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        badge: 'bg-blue-100 text-blue-700',
        dropdown: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
      },
      'UL': {
        active: 'bg-purple-400 text-white',
        inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        badge: 'bg-purple-100 text-purple-700',
        dropdown: 'bg-purple-50 text-purple-700 hover:bg-purple-100',
      },
      // Legacy codes for backward compatibility
      'PRESENT': {
        active: 'bg-green-600 text-white',
        inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        badge: 'bg-green-100 text-green-700',
        dropdown: 'bg-green-50 text-green-700 hover:bg-green-100',
      },
      'ABSENT': {
        active: 'bg-red-600 text-white',
        inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        badge: 'bg-red-100 text-red-700',
        dropdown: 'bg-red-50 text-red-700 hover:bg-red-100',
      },
      'HALF-DAY': {
        active: 'bg-yellow-400 text-white',
        inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        badge: 'bg-yellow-100 text-yellow-700',
        dropdown: 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
      },
      'PAID-LEAVE': {
        active: 'bg-blue-600 text-white',
        inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        badge: 'bg-blue-100 text-blue-700',
        dropdown: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
      },
      'WEEKLY-OFF': {
        active: 'bg-purple-400 text-white',
        inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        badge: 'bg-purple-100 text-purple-700',
        dropdown: 'bg-purple-50 text-purple-700 hover:bg-purple-100',
      },
    };
    
    const colors = colorMap[statusCode] || {
      active: 'bg-orange-400 text-white',
      inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
      badge: 'bg-orange-100 text-orange-700',
      dropdown: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
    };
    
    return isActive ? colors.active : colors.inactive;
  };

  // Get badge color for status
  const getStatusBadgeColor = (statusCode) => {
    const colorMap = {
      'P': 'bg-green-100 text-green-700',
      'A': 'bg-red-100 text-red-700',
      'HD': 'bg-yellow-100 text-yellow-700',
      'PL': 'bg-blue-100 text-blue-700',
      'UL': 'bg-purple-100 text-purple-700',
      // Legacy codes for backward compatibility
      'PRESENT': 'bg-green-100 text-green-700',
      'ABSENT': 'bg-red-100 text-red-700',
      'HALF-DAY': 'bg-yellow-100 text-yellow-700',
      'PAID-LEAVE': 'bg-blue-100 text-blue-700',
      'WEEKLY-OFF': 'bg-purple-100 text-purple-700',
    };
    return colorMap[statusCode] || 'bg-orange-100 text-orange-700';
  };

  // Get dropdown color for status
  const getStatusDropdownColor = (statusCode, isActive) => {
    const colorMap = {
      'P': 'bg-green-50 text-green-700 hover:bg-green-100',
      'A': 'bg-red-50 text-red-700 hover:bg-red-100',
      'HD': 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
      'PL': 'bg-blue-50 text-blue-700 hover:bg-blue-100',
      'UL': 'bg-purple-50 text-purple-700 hover:bg-purple-100',
      // Legacy codes for backward compatibility
      'PRESENT': 'bg-green-50 text-green-700 hover:bg-green-100',
      'ABSENT': 'bg-red-50 text-red-700 hover:bg-red-100',
      'HALF-DAY': 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
      'PAID-LEAVE': 'bg-blue-50 text-blue-700 hover:bg-blue-100',
      'WEEKLY-OFF': 'bg-purple-50 text-purple-700 hover:bg-purple-100',
    };
    if (isActive) {
      return colorMap[statusCode] || 'bg-orange-50 text-orange-700 hover:bg-orange-100';
    }
    return 'text-gray-700 hover:bg-gray-50';
  };

  // Get status ID from status code/value - dynamically find from API response
  const getStatusId = (statusValue) => {
    if (!statusValue) return null;
    
    // Map internal status value to status code (supporting both new and legacy codes)
    const statusCodeMap = {
      'present': ['P', 'PRESENT'],
      'absent': ['A', 'ABSENT'],
      'halfday': ['HD', 'HALF-DAY'],
      'paidleave': ['PL', 'PAID-LEAVE'],
      'unpaidleave': ['UL'],
      'weeklyoff': ['WEEKLY-OFF'],
    };
    
    // Try to find status code from map first
    const possibleCodes = statusCodeMap[statusValue];
    
    if (possibleCodes) {
      // Try each possible code
      for (const code of possibleCodes) {
        const statusItem = attendanceStatuses.find(s => s.code === code && s.is_active);
        if (statusItem) {
          return statusItem.id;
        }
      }
    }
    
    // If not found in map, try to find by matching code directly
    const foundStatus = attendanceStatuses.find(s => 
      s.code && (
        s.code.toLowerCase().replace(/-/g, '').replace(/\s+/g, '') === statusValue.toLowerCase() ||
        s.code === statusValue.toUpperCase()
      )
    );
    if (foundStatus) {
      return foundStatus.id;
    }
    
    return null;
  };

  // Fetch attendance data for a user from API
  const fetchUserAttendance = async (userId, startDate, endDate) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      return {};
    }

    if (!userId || !startDate || !endDate) {
      return {};
    }

    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const apiUrl = `${baseUrl}/payroll/attendance/`;
      const params = {
        user_id: userId,
        start_date: startDate,
        end_date: endDate,
      };
      
      const response = await axios.get(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: params,
      });
      
      // Extract array from response (handles both direct array and { results: [...] } format)
      const attendanceData = extractArray(response.data);
      
      // Map API response to internal format: { date: status }
      // API response structure: { id, user, date, status, status_label, status_code, reason, created_at, updated_at }
      const mappedRecords = {};
      attendanceData.forEach((record) => {
        // Use date and status_code from API response
        if (record.date) {
          // Prefer status_code, fallback to status_label if status_code is missing
          let statusValue = null;
          
          if (record.status_code) {
            // Map status_code dynamically using mapStatusCodeToStatus function
            statusValue = mapStatusCodeToStatus(record.status_code);
          } else if (record.status_label) {
            // Fallback: try to find matching status from API response by label
            const matchingStatus = attendanceStatuses.find(s => 
              s.label && s.label.toLowerCase() === record.status_label.toLowerCase()
            );
            if (matchingStatus) {
              statusValue = mapStatusCodeToStatus(matchingStatus.code);
            } else {
              // Last resort: convert label to internal format
              statusValue = record.status_label.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
            }
          }
          
          if (statusValue) {
            mappedRecords[record.date] = statusValue;
          }
        }
      });
      
      return mappedRecords;
    } catch (error) {
      return {};
    }
  };

  const openAttendanceView = async (employee, employeeList) => {
    setSelectedEmployee(employee);
    setAttendanceEmployeeList(employeeList || []);
    setShowAttendanceView(true);
    const currentMonth = new Date();
    setAttendanceCalendarMonth(currentMonth);
    setOpenDropdownDate(null);
    
    // Calculate start and end dates for the current month
    const year = currentMonth.getFullYear();
    const monthNum = currentMonth.getMonth();
    const startDate = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(new Date(year, monthNum + 1, 0).getDate()).padStart(2, '0')}`;
    
    // Fetch attendance data from API
    try {
      const apiRecords = await fetchUserAttendance(employee.id, startDate, endDate);
      
      // Use only API records (no localStorage merge)
      const recordsToUse = apiRecords;
      
      // Update attendance records state with fetched data from API only
      setAttendanceRecords((prev) => {
        const updated = {
          ...prev,
          [employee.id]: recordsToUse,
        };
        return updated;
      });
      
      // Initialize temporary state with API records only
      setTempAttendanceRecords(recordsToUse);
    } catch (error) {
      // Initialize with existing records if API fails
      const existingRecords = attendanceRecords[employee.id] || {};
      setTempAttendanceRecords(existingRecords);
    }
    
    // Log attendance details
    logAttendanceDetails(employee, currentMonth);
  };

  // Sync tempAttendanceRecords when attendanceRecords is updated for selectedEmployee
  useEffect(() => {
    if (selectedEmployee && showAttendanceView && attendanceRecords[selectedEmployee.id]) {
      const currentRecords = attendanceRecords[selectedEmployee.id];
      setTempAttendanceRecords(currentRecords);
    }
  }, [selectedEmployee?.id, attendanceRecords, showAttendanceView]);

  // Automatically open attendance view when switching to my-staff or my-manager
  useEffect(() => {
    if (mainTab === 'attendance' && subTab === 'my-staff' && filteredStaff.length > 0) {
      // Check if currently selected employee is a staff member
      const isSelectedEmployeeStaff = selectedEmployee && filteredStaff.some(s => s.id === selectedEmployee.id);
      // Check if currently showing managers list
      const isShowingManagers = attendanceEmployeeList.length > 0 && 
        filteredManagers.length > 0 && 
        attendanceEmployeeList.some(emp => filteredManagers.some(m => m.id === emp.id));
      
      if (!showAttendanceView || !selectedEmployee || !isSelectedEmployeeStaff || isShowingManagers) {
        const firstStaff = filteredStaff.find((s) => !s.isDeleted) || filteredStaff[0];
        if (firstStaff && !firstStaff.isDeleted) {
          openAttendanceView(firstStaff, filteredStaff);
        }
      }
    }
    if (mainTab === 'attendance' && subTab === 'my-manager' && filteredManagers.length > 0) {
      // Check if currently selected employee is a manager
      const isSelectedEmployeeManager = selectedEmployee && filteredManagers.some(m => m.id === selectedEmployee.id);
      // Check if currently showing staff list
      const isShowingStaff = attendanceEmployeeList.length > 0 && 
        filteredStaff.length > 0 && 
        attendanceEmployeeList.some(emp => filteredStaff.some(s => s.id === emp.id));
      
      if (!showAttendanceView || !selectedEmployee || !isSelectedEmployeeManager || isShowingStaff) {
        const firstManager = filteredManagers.find((m) => !m.isDeleted) || filteredManagers[0];
        if (firstManager && !firstManager.isDeleted) {
          openAttendanceView(firstManager, filteredManagers);
        }
      }
    }
  }, [subTab, mainTab, filteredStaff, filteredManagers, selectedEmployee, showAttendanceView, attendanceEmployeeList]);

  const calculateEmployeeAmount = (employeeId) => {
    // Calculate amount based on attendance (mock calculation)
    // Present days * 1000, Half day * 500, Paid leave * 0, Absent * 0
    const today = new Date();
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const summary = getAttendanceSummary(employeeId, currentMonth, false);
    const present = summary.present || 0;
    const halfday = summary.halfday || 0;
    const amount = (present * 1000) + (halfday * 500);
    return amount;
  };

  // Format date to YYYY-MM-DD using local timezone (not UTC)
  const formatDateKey = (date) => {
    if (date instanceof Date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    if (typeof date === 'string') {
      return date.split('T')[0];
    }
    return date;
  };

  // POST API to mark attendance
  const postAttendance = async (userId, date, statusId) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      return false;
    }

    if (!userId || !date || !statusId) {
      return false;
    }

    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const apiUrl = `${baseUrl}/payroll/attendance/`;
      const payload = {
        user: userId,
        date: date,
        status: statusId,
      };
      
      await axios.post(apiUrl, payload, {
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      return true;
    } catch (error) {
      return false;
    }
  };

  const markAttendance = async (date, status) => {
    if (!selectedEmployee) return;
    
    // Check if date is allowed for marking attendance
    if (!isDateAllowedForAttendance(date)) {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();
      const lastDayOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0);
      const isLastDayOfMonth = today.getDate() === lastDayOfCurrentMonth.getDate();
      
      const dateToCheck = new Date(date);
      const minDate = new Date('2025-08-01');
      
      let errorMessage = 'Cannot mark attendance for this date.';
      if (dateToCheck < minDate) {
        errorMessage = 'Attendance can only be marked from August 2025 onwards.';
      } else {
        // Date is in future month beyond allowed range
        const endOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0);
        const endOfNextMonth = new Date(currentYear, currentMonth + 2, 0);
        const maxAllowedDate = isLastDayOfMonth ? endOfNextMonth : endOfCurrentMonth;
        
        if (dateToCheck > maxAllowedDate) {
          if (isLastDayOfMonth) {
            errorMessage = 'Attendance can only be marked up to the end of next month.';
          } else {
            errorMessage = 'Attendance can only be marked up to the end of current month. Next month will be enabled on the last day of this month.';
          }
        }
      }
      
      setAttendanceMessage({ type: 'error', text: errorMessage });
      setTimeout(() => setAttendanceMessage({ type: '', text: '' }), 5000);
      return;
    }
    
    // Prevent multiple simultaneous API calls
    if (isMarkingAttendance) {
      return;
    }
    
    const dateKey = formatDateKey(date);
    
    // Get status ID from attendance statuses
    const statusId = getStatusId(status);
    if (!statusId) {
      setAttendanceMessage({ type: 'error', text: 'Error: Could not find attendance status. Please refresh the page.' });
      setTimeout(() => setAttendanceMessage({ type: '', text: '' }), 5000);
      return;
    }
    
    // Set loading state
    setIsMarkingAttendance(true);
    setAttendanceMessage({ type: '', text: '' });
    
    // Update UI optimistically
    setTempAttendanceRecords((prev) => ({
      ...prev,
      [dateKey]: status,
    }));
    
    try {
      // Post to API
      const success = await postAttendance(selectedEmployee.id, dateKey, statusId);
      
      if (success) {
        // Update attendance records state after successful API call
        setAttendanceRecords((prev) => {
          const updated = {
            ...prev,
            [selectedEmployee.id]: {
              ...(prev[selectedEmployee.id] || {}),
              [dateKey]: status,
            },
          };
          return updated;
        });
        
        // Show success message
        const statusLabel = attendanceStatuses.find(s => mapStatusCodeToStatus(s.code) === status)?.label || status.toUpperCase();
        setAttendanceMessage({ type: 'success', text: `Attendance marked as ${statusLabel} successfully!` });
        setTimeout(() => setAttendanceMessage({ type: '', text: '' }), 3000);
      } else {
        // Revert UI change if API call failed
        setTempAttendanceRecords((prev) => {
          const updated = { ...prev };
          delete updated[dateKey];
          return updated;
        });
        setAttendanceMessage({ type: 'error', text: 'Failed to mark attendance. Please try again.' });
        setTimeout(() => setAttendanceMessage({ type: '', text: '' }), 5000);
      }
    } catch (error) {
      // Revert UI change
      setTempAttendanceRecords((prev) => {
        const updated = { ...prev };
        delete updated[dateKey];
        return updated;
      });
      setAttendanceMessage({ type: 'error', text: 'An error occurred. Please try again.' });
      setTimeout(() => setAttendanceMessage({ type: '', text: '' }), 5000);
    } finally {
      setIsMarkingAttendance(false);
    }
  };

  const unmarkAttendance = (date) => {
    if (!selectedEmployee) return;
    
    // Check if date is allowed for unmarking attendance
    if (!isDateAllowedForAttendance(date)) {
      return;
    }
    
    const dateKey = formatDateKey(date);
    setTempAttendanceRecords((prev) => {
      const updated = { ...prev };
      delete updated[dateKey];
      return updated;
    });
  };

  const submitAttendance = () => {
    if (!selectedEmployee) return;
    setAttendanceRecords((prev) => {
      const updated = {
        ...prev,
        [selectedEmployee.id]: tempAttendanceRecords,
      };
      return updated;
    });
    setOpenDropdownDate(null);
    // Optionally hide the view after submit, or keep it open
    // setShowAttendanceView(false);
    // setSelectedEmployee(null);
  };

  const getTodayAttendanceStatus = (employeeId) => {
    const today = formatDateKey(new Date());
    return getAttendanceStatus(employeeId, today);
  };

  // Get main statuses (P/Present and A/Absent) and dropdown statuses (others)
  const mainStatuses = useMemo(() => {
    return attendanceStatuses.filter(s => s.code === 'P' || s.code === 'A' || s.code === 'PRESENT' || s.code === 'ABSENT');
  }, [attendanceStatuses]);

  const dropdownStatuses = useMemo(() => {
    return attendanceStatuses.filter(s => s.code !== 'P' && s.code !== 'A' && s.code !== 'PRESENT' && s.code !== 'ABSENT');
  }, [attendanceStatuses]);

  const getAttendanceStatus = (employeeId, date, useTemp = false) => {
    // Normalize date to YYYY-MM-DD format using local timezone
    const dateKey = formatDateKey(date);
    
    if (useTemp && selectedEmployee?.id === employeeId) {
      const status = tempAttendanceRecords[dateKey] || null;
      return status;
    }
    return attendanceRecords[employeeId]?.[dateKey] || null;
  };

  const getAttendanceSummary = (employeeId, month, useTemp = false) => {
    const records = useTemp && selectedEmployee?.id === employeeId 
      ? tempAttendanceRecords 
      : (attendanceRecords[employeeId] || {});
    
    if (!records || Object.keys(records).length === 0) {
      // Initialize summary with all statuses from API
      const summary = {};
      attendanceStatuses.forEach(status => {
        const statusValue = mapStatusCodeToStatus(status.code);
        summary[statusValue] = 0;
      });
      return summary;
    }
    
    const year = month.getFullYear();
    const monthNum = month.getMonth();
    
    // Initialize summary with all statuses from API
    const summary = {};
    attendanceStatuses.forEach(status => {
      const statusValue = mapStatusCodeToStatus(status.code);
      summary[statusValue] = 0;
    });
    
    // Count occurrences of each status
    Object.keys(records).forEach((dateKey) => {
      const date = new Date(dateKey);
      if (date.getFullYear() === year && date.getMonth() === monthNum) {
        const status = records[dateKey];
        if (status && summary.hasOwnProperty(status)) {
          summary[status] = (summary[status] || 0) + 1;
        }
      }
    });
    
    return summary;
  };

  const getMonthDates = (month) => {
    const year = month.getFullYear();
    const monthNum = month.getMonth();
    const daysInMonth = new Date(year, monthNum + 1, 0).getDate();
    const dates = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, monthNum, day);
      dates.push(date);
    }
    
    return dates; // Return dates from start to end of month
  };

  const calendarDays = useMemo(() => {
    const meta = getMonthMeta(attendanceCalendarMonth);
    const days = [];
    for (let i = 0; i < meta.startingDay; i++) {
      days.push({ empty: true, key: `empty-${i}` });
    }
    for (let day = 1; day <= meta.daysInMonth; day++) {
      const date = new Date(attendanceCalendarMonth.getFullYear(), attendanceCalendarMonth.getMonth(), day);
      const dateKey = formatDateKey(date);
      days.push({
        day,
        key: dateKey,
        date,
        status: selectedEmployee ? getAttendanceStatus(selectedEmployee.id, dateKey) : null,
      });
    }
    return days;
  }, [attendanceCalendarMonth, selectedEmployee, attendanceRecords]);

  const goToMonth = async (direction) => {
    if (!selectedEmployee) {
      return;
    }
    
    // Prevent navigation while marking attendance
    if (isMarkingAttendance) {
      return;
    }
    
    const nextMonth = new Date(attendanceCalendarMonth);
    nextMonth.setMonth(attendanceCalendarMonth.getMonth() + direction);
    
    // Update month state first
    setAttendanceCalendarMonth(nextMonth);
    
    // Calculate start and end dates for the new month
    const year = nextMonth.getFullYear();
    const monthNum = nextMonth.getMonth();
    const startDate = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(new Date(year, monthNum + 1, 0).getDate()).padStart(2, '0')}`;
    
    // Fetch attendance data from API for the new month
    try {
      const apiRecords = await fetchUserAttendance(selectedEmployee.id, startDate, endDate);
      
      // Update attendance records state with API data only
      setAttendanceRecords((prev) => {
        const updated = {
          ...prev,
          [selectedEmployee.id]: apiRecords,
        };
        return updated;
      });
      
      // Update temporary records
      setTempAttendanceRecords(apiRecords);
    } catch (error) {
      // Keep existing records if API fails
      const existingRecords = attendanceRecords[selectedEmployee.id] || {};
      setTempAttendanceRecords(existingRecords);
    }
    
    // Log attendance details when month changes
    logAttendanceDetails(selectedEmployee, nextMonth);
  };

  // Reset page when search changes
  useEffect(() => {
    setCurrentPageStaff(1);
  }, [searchStaff]);

  useEffect(() => {
    setCurrentPageManagers(1);
  }, [searchManager]);

  if (!isVsreOwner) {
    return (
      <div className="bg-gray-50 rounded-xl p-8 border-2 border-gray-200 text-center">
        <p className="text-gray-700 text-lg font-medium mb-2">Only VSRE_OWNERs can access this section.</p>
        {authUser ? (
          <p className="text-sm text-gray-500">
            Current user type: <span className="font-semibold">{authUser.user_type || 'Not found'}</span>
          </p>
        ) : (
          <p className="text-sm text-gray-500">No user logged in. Please log in as VSRE_OWNER.</p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Tabs */}
      <div className="flex items-center justify-between gap-1.5 mb-3">
        <button onClick={() => setSubTab('my-staff')} className={`flex-1 px-2 py-1 rounded-md bg-white border border-gray-200 shadow-sm transition-all text-xs ${subTab==='my-staff' ? 'border-indigo-500 bg-indigo-50' : 'hover:border-gray-300'}`}>
          <span className="font-semibold italic text-gray-900">My Staff</span>
        </button>
        <button onClick={() => setSubTab('my-manager')} className={`flex-1 px-2 py-1 rounded-md bg-white border border-gray-200 shadow-sm transition-all text-xs ${subTab==='my-manager' ? 'border-indigo-500 bg-indigo-50' : 'hover:border-gray-300'}`}>
          <span className="font-semibold italic text-gray-900">My Manager</span>
        </button>
      </div>

      {/* Attendance Panels - My Staff */}
      {isVsreOwner && subTab === 'my-staff' && (
        <div className="bg-gray-50 rounded-xl p-3 border-2 border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h3 className="text-lg font-bold text-gray-900">My Staff</h3>
            <div className="flex items-center gap-2">
             
              <div className="flex items-center gap-1">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={searchStaff}
                    onChange={(e) => setSearchStaff(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchStaff();
                      }
                    }}
                    placeholder="Search by name or mobile..."
                    disabled={isLoadingStaff}
                    className={`px-2.5 py-1.5 pr-8 rounded-lg border-2 border-gray-300 bg-white text-xs text-gray-900 focus:outline-none focus:border-indigo-500 w-full sm:w-56 ${isLoadingStaff ? 'opacity-60 cursor-wait' : ''}`}
                  />
                  {isLoadingStaff ? (
                    <div className="absolute right-2">
                      <svg className="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  ) : searchStaff.trim() ? (
                    <button
                      onClick={() => {
                        setSearchStaff('');
                        setCurrentPageStaff(1);
                        setCurrentPageEmployeeList(1);
                        fetchStaff(null, false, '');
                      }}
                      className="absolute right-2 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Clear search"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ) : null}
                </div>
                <button
                  onClick={handleSearchStaff}
                  disabled={isLoadingStaff}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isLoadingStaff
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                  title="Search"
                >
                  Search
                </button>
              </div>
            </div>
          </div>
          {isLoadingStaff ? (
            <div className="text-center text-gray-600 py-12 text-lg">Loading staff...</div>
          ) : staffError ? (
            <div className="text-center text-red-600 py-12 text-lg">{staffError}</div>
          ) : filteredStaff.length === 0 ? (
            <div className="bg-white rounded-xl p-8 border-2 border-gray-200 text-center">
              <p className="text-gray-600 text-lg">
                {searchStaff.trim() ? 'No staff found matching your search.' : 'No staff found.'}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                {searchStaff.trim() ? 'Try a different search term.' : 'Staff data will appear here once records are available.'}
              </p>
            </div>
          ) : showAttendanceView && selectedEmployee ? (
            // Attendance Calendar View - Replaces the table
            (() => {
              const summary = getAttendanceSummary(selectedEmployee.id, attendanceCalendarMonth, true);
              const monthDates = getMonthDates(attendanceCalendarMonth);
              const monthName = attendanceCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              const monthShort = attendanceCalendarMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
              
              return (
                <div className="bg-white rounded-xl border-2 border-gray-300 p-6 flex gap-6">
                  {/* Left Sidebar - Employee List */}
                  <div className="w-64 shrink-0 border-r border-gray-200 pr-4 max-h-[80vh] flex flex-col">
                    {/* Month Navigation */}
                    <div className="mb-4 flex items-center justify-center gap-2">
                      <button
                        onClick={() => goToMonth(-1)}
                        className="px-3 py-1 rounded hover:bg-gray-100 text-gray-700 font-semibold"
                        disabled={isMarkingAttendance}
                      >
                        &lt;
                      </button>
                      <span className="px-4 py-1 text-gray-900 font-semibold text-sm">{monthShort}</span>
                      <button
                        onClick={() => goToMonth(1)}
                        className="px-3 py-1 rounded hover:bg-gray-100 text-gray-700 font-semibold"
                        disabled={isMarkingAttendance}
                      >
                        &gt;
                      </button>
                    </div>
                    
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-900">Employees</h3>
                    </div>
                    <div className="space-y-1 flex-1 overflow-y-auto">
                      {filteredStaff.map((emp) => {
                        const isSelected = selectedEmployee?.id === emp.id;
                        const isDeleted = Boolean(emp.isDeleted);

                        return (
                          <div
                            key={emp.id}
                            role="button"
                            tabIndex={0}
                            aria-disabled={isDeleted}
                            title={isDeleted ? 'Terminated employee' : emp.name}
                            onClick={async () => {
                              if (isDeleted) return;
                              setSelectedEmployee(emp);
                              setOpenDropdownDate(null);
                              
                              // Calculate start and end dates for the current month
                              const year = attendanceCalendarMonth.getFullYear();
                              const monthNum = attendanceCalendarMonth.getMonth();
                              const startDate = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;
                              const endDate = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(new Date(year, monthNum + 1, 0).getDate()).padStart(2, '0')}`;
                              
                              // Fetch attendance data from API
                              try {
                                const apiRecords = await fetchUserAttendance(emp.id, startDate, endDate);
                                
                                // Update attendance records state with API data only
                                setAttendanceRecords((prev) => {
                                  const updated = {
                                    ...prev,
                                    [emp.id]: apiRecords,
                                  };
                                  return updated;
                                });
                                
                                // Update temporary records
                                setTempAttendanceRecords(apiRecords);
                              } catch (error) {
                                // Use existing records if API fails
                                setTempAttendanceRecords(attendanceRecords[emp.id] || {});
                              }
                              
                              // Log attendance details when selecting different employee
                              logAttendanceDetails(emp, attendanceCalendarMonth);
                            }}
                            onKeyDown={(e) => {
                              if (isDeleted) return;
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.currentTarget.click();
                              }
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isDeleted
                                ? 'cursor-not-allowed border-2 border-transparent bg-gray-100 opacity-50 grayscale'
                                : isSelected
                                  ? 'cursor-pointer bg-indigo-50 border-2 border-indigo-500'
                                  : 'cursor-pointer bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <img 
                                src={emp.photo || DEFAULT_PHOTO} 
                                alt={emp.name}
                                className={`w-8 h-8 rounded-full object-cover ${isDeleted ? 'opacity-60' : ''}`}
                                onError={(e) => {
                                  e.target.src = DEFAULT_PHOTO;
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <div
                                  className={`font-semibold text-xs truncate ${
                                    isDeleted ? 'text-gray-400' : 'text-gray-900'
                                  }`}
                                >
                                  {emp.name}
                                </div>
                                {isDeleted ? (
                                  <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                                    Terminated
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Pagination Controls for Employee List - Server-side */}
                    {totalCountEmployeeList > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              if (previousUrlEmployeeList && !isLoadingStaff) {
                                fetchStaff(previousUrlEmployeeList, true, searchStaff);
                              }
                            }}
                            disabled={!previousUrlEmployeeList || isLoadingStaff}
                            className={`px-2 py-1 rounded text-xs font-semibold transition-colors border ${
                              !previousUrlEmployeeList || isLoadingStaff
                                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            Prev
                          </button>
                          
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              if (nextUrlEmployeeList && !isLoadingStaff) {
                                fetchStaff(nextUrlEmployeeList, true, searchStaff);
                              }
                            }}
                            disabled={!nextUrlEmployeeList || isLoadingStaff}
                            className={`px-2 py-1 rounded text-xs font-semibold transition-colors border ${
                              !nextUrlEmployeeList || isLoadingStaff
                                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Content - Attendance Calendar */}
                  <div className="flex-1 overflow-y-auto">
                    {/* Attendance Summary - Dynamic from API */}
                    <div className="mb-6 space-y-2">
                      <div className="flex items-center gap-6 text-sm flex-wrap">
                        {attendanceStatuses.map((statusItem) => {
                          const statusValue = mapStatusCodeToStatus(statusItem.code);
                          const count = summary[statusValue] || 0;
                          return (
                            <div key={statusItem.id} className="flex items-center gap-2">
                              <span className="font-semibold text-gray-700">{statusItem.label || statusItem.code}:</span>
                              <span className={`font-bold ${getStatusBadgeColor(statusItem.code).split(' ')[1]}`}>{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Daily Attendance Log */}
                    <div className="border-t border-gray-200 pt-4">
                      <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
                        <div className="font-semibold text-gray-900 text-sm uppercase tracking-wide">DATE</div>
                        <div className="font-semibold text-gray-900 text-sm uppercase tracking-wide">ATTENDANCE</div>
                      </div>
                      <div className="mt-2 space-y-2 max-h-[400px] overflow-y-auto">
                        {monthDates.map((date) => {
                          const dateKey = formatDateKey(date);
                          const status = getAttendanceStatus(selectedEmployee.id, dateKey, true);
                          const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
                          const isDropdownOpen = openDropdownDate === dateKey;
                          const isDateAllowed = isDateAllowedForAttendance(date);
                          
                          return (
                            <div key={dateKey} className="grid grid-cols-[1fr_auto] gap-4 items-center py-2 border-b border-gray-100 relative">
                              <div className={`text-sm ${isDateAllowed ? 'text-gray-700' : 'text-gray-400'}`}>{dateStr}</div>
                              <div className="flex items-center gap-2 dropdown-container">
                                {/* Main status buttons (PRESENT and ABSENT) */}
                                {mainStatuses.map((statusItem) => {
                                  const statusValue = mapStatusCodeToStatus(statusItem.code);
                                  const isActive = status === statusValue;
                                  
                                  return (
                                    <button
                                      key={statusItem.id}
                                      onClick={() => {
                                        if (!isDateAllowed) return;
                                        if (isActive) {
                                          unmarkAttendance(date);
                                        } else {
                                          markAttendance(date, statusValue);
                                        }
                                        setOpenDropdownDate(null);
                                      }}
                                      onDoubleClick={(e) => {
                                        if (!isDateAllowed) return;
                                        e.preventDefault();
                                        e.stopPropagation();
                                        unmarkAttendance(date);
                                      }}
                                      disabled={!isDateAllowed || isMarkingAttendance}
                                      className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                                        !isDateAllowed || isMarkingAttendance
                                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                                          : getStatusColorClasses(statusItem.code, isActive)
                                      }`}
                                    >
                                      {statusItem.label}
                                    </button>
                                  );
                                })}
                                
                                {/* Dropdown for other statuses */}
                                {dropdownStatuses.length > 0 && (
                                  <div className="relative">
                                    <button
                                      onClick={() => {
                                        if (!isDateAllowed) return;
                                        setOpenDropdownDate(isDropdownOpen ? null : dateKey);
                                      }}
                                      disabled={!isDateAllowed || isMarkingAttendance}
                                      className={`px-2 py-1 ${!isDateAllowed || isMarkingAttendance ? 'text-gray-300 cursor-not-allowed opacity-50' : isDropdownOpen ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                      </svg>
                                    </button>
                                    {isDropdownOpen && isDateAllowed && (
                                      <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                                        {dropdownStatuses.map((statusItem) => {
                                          const statusValue = mapStatusCodeToStatus(statusItem.code);
                                          const isActive = status === statusValue;
                                          
                                          return (
                                            <button
                                              key={statusItem.id}
                                              onClick={() => {
                                                if (!isMarkingAttendance) {
                                                  markAttendance(date, statusValue);
                                                  setOpenDropdownDate(null);
                                                }
                                              }}
                                              disabled={isMarkingAttendance}
                                              className={`w-full text-left px-4 py-2 text-sm transition-colors font-semibold ${
                                                isMarkingAttendance
                                                  ? 'text-gray-400 cursor-not-allowed opacity-50'
                                                  : getStatusDropdownColor(statusItem.code, isActive)
                                              }`}
                                            >
                                              {statusItem.label || statusItem.code}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                {/* Show label for dropdown statuses when active */}
                                {dropdownStatuses.some(s => mapStatusCodeToStatus(s.code) === status) && (
                                  (() => {
                                    const activeStatus = dropdownStatuses.find(s => mapStatusCodeToStatus(s.code) === status);
                                    return (
                                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                        getStatusBadgeColor(activeStatus?.code)
                                      }`}>
                                        {activeStatus?.label || status}
                                      </span>
                                    );
                                  })()
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    
                  </div>
                </div>
              );
            })()
          ) : null}
        </div>
      )}

      {/* Attendance Panels - My Manager */}
      {isVsreOwner && subTab === 'my-manager' && (
        <div className="bg-gray-50 rounded-xl p-3 border-2 border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h3 className="text-lg font-bold text-gray-900">My Manager</h3>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={searchManager}
                    onChange={(e) => setSearchManager(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchManager();
                      }
                    }}
                    placeholder="Search by name or mobile..."
                    disabled={isLoadingManagers}
                    className={`px-2.5 py-1.5 pr-8 rounded-lg border-2 border-gray-300 bg-white text-xs text-gray-900 focus:outline-none focus:border-indigo-500 w-full sm:w-56 ${isLoadingManagers ? 'opacity-60 cursor-wait' : ''}`}
                  />
                  {isLoadingManagers ? (
                    <div className="absolute right-2">
                      <svg className="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  ) : searchManager.trim() ? (
                    <button
                      onClick={() => {
                        setSearchManager('');
                        setCurrentPageManagers(1);
                        setCurrentPageEmployeeList(1);
                        fetchManagers(null, false, '');
                      }}
                      className="absolute right-2 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Clear search"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ) : null}
                </div>
                <button
                  onClick={handleSearchManager}
                  disabled={isLoadingManagers}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isLoadingManagers
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                  title="Search"
                >
                  Search
                </button>
              </div>
            </div>
          </div>
          {isLoadingManagers ? (
            <div className="text-center text-gray-600 py-12 text-lg">Loading managers...</div>
          ) : managersError ? (
            <div className="text-center text-red-600 py-12 text-lg">{managersError}</div>
          ) : filteredManagers.length === 0 ? (
            <div className="bg-white rounded-xl p-8 border-2 border-gray-200 text-center">
              <p className="text-gray-600 text-lg">
                {searchManager.trim() ? 'No managers found matching your search.' : 'No managers found.'}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                {searchManager.trim() ? 'Try a different search term.' : 'Manager data will appear here once records are available.'}
              </p>
            </div>
          ) : showAttendanceView && selectedEmployee ? (
            // Attendance Calendar View - Replaces the table
            (() => {
              const summary = getAttendanceSummary(selectedEmployee.id, attendanceCalendarMonth, true);
              const monthDates = getMonthDates(attendanceCalendarMonth);
              const monthName = attendanceCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              const monthShort = attendanceCalendarMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
              
              return (
                <div className="bg-white rounded-xl border-2 border-gray-300 p-6 flex gap-6">
                  {/* Left Sidebar - Employee List */}
                  <div className="w-64 shrink-0 border-r border-gray-200 pr-4 max-h-[80vh] flex flex-col">
                    {/* Month Navigation */}
                    <div className="mb-4 flex items-center justify-center gap-2">
                      <button
                        onClick={() => goToMonth(-1)}
                        className="px-3 py-1 rounded hover:bg-gray-100 text-gray-700 font-semibold"
                        disabled={isMarkingAttendance}
                      >
                        &lt;
                      </button>
                      <span className="px-4 py-1 text-gray-900 font-semibold text-sm">{monthShort}</span>
                      <button
                        onClick={() => goToMonth(1)}
                        className="px-3 py-1 rounded hover:bg-gray-100 text-gray-700 font-semibold"
                        disabled={isMarkingAttendance}
                      >
                        &gt;
                      </button>
                    </div>
                    
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-900">Managers</h3>
                    </div>
                    <div className="space-y-1 flex-1 overflow-y-auto">
                      {filteredManagers.map((emp) => {
                        const isSelected = selectedEmployee?.id === emp.id;
                        const isDeleted = Boolean(emp.isDeleted);

                        return (
                          <div
                            key={emp.id}
                            role="button"
                            tabIndex={0}
                            aria-disabled={isDeleted}
                            title={isDeleted ? 'Terminated employee' : emp.name}
                            onClick={async () => {
                              if (isDeleted) return;
                              setSelectedEmployee(emp);
                              setOpenDropdownDate(null);
                              
                              // Calculate start and end dates for the current month
                              const year = attendanceCalendarMonth.getFullYear();
                              const monthNum = attendanceCalendarMonth.getMonth();
                              const startDate = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;
                              const endDate = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(new Date(year, monthNum + 1, 0).getDate()).padStart(2, '0')}`;
                              
                              // Fetch attendance data from API
                              try {
                                const apiRecords = await fetchUserAttendance(emp.id, startDate, endDate);
                                
                                // Update attendance records state with API data only
                                setAttendanceRecords((prev) => {
                                  const updated = {
                                    ...prev,
                                    [emp.id]: apiRecords,
                                  };
                                  return updated;
                                });
                                
                                // Update temporary records
                                setTempAttendanceRecords(apiRecords);
                              } catch (error) {
                                // Use existing records if API fails
                                setTempAttendanceRecords(attendanceRecords[emp.id] || {});
                              }
                              
                              // Log attendance details when selecting different employee
                              logAttendanceDetails(emp, attendanceCalendarMonth);
                            }}
                            onKeyDown={(e) => {
                              if (isDeleted) return;
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.currentTarget.click();
                              }
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isDeleted
                                ? 'cursor-not-allowed border-2 border-transparent bg-gray-100 opacity-50 grayscale'
                                : isSelected
                                  ? 'cursor-pointer bg-indigo-50 border-2 border-indigo-500'
                                  : 'cursor-pointer bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <img 
                                src={emp.photo || DEFAULT_PHOTO} 
                                alt={emp.name}
                                className={`w-8 h-8 rounded-full object-cover ${isDeleted ? 'opacity-60' : ''}`}
                                onError={(e) => {
                                  e.target.src = DEFAULT_PHOTO;
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <div
                                  className={`font-semibold text-xs truncate ${
                                    isDeleted ? 'text-gray-400' : 'text-gray-900'
                                  }`}
                                >
                                  {emp.name}
                                </div>
                                {isDeleted ? (
                                  <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                                    Terminated
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Pagination Controls for Manager List - Server-side */}
                    {totalCountEmployeeList > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              if (previousUrlEmployeeList && !isLoadingManagers) {
                                fetchManagers(previousUrlEmployeeList, true, searchManager);
                              }
                            }}
                            disabled={!previousUrlEmployeeList || isLoadingManagers}
                            className={`px-2 py-1 rounded text-xs font-semibold transition-colors border ${
                              !previousUrlEmployeeList || isLoadingManagers
                                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            Prev
                          </button>
                          
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              if (nextUrlEmployeeList && !isLoadingManagers) {
                                fetchManagers(nextUrlEmployeeList, true, searchManager);
                              }
                            }}
                            disabled={!nextUrlEmployeeList || isLoadingManagers}
                            className={`px-2 py-1 rounded text-xs font-semibold transition-colors border ${
                              !nextUrlEmployeeList || isLoadingManagers
                                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Content - Attendance Calendar */}
                  <div className="flex-1 overflow-y-auto">
                    {/* Attendance Summary - Dynamic from API */}
                    <div className="mb-6 space-y-2">
                      <div className="flex items-center gap-6 text-sm flex-wrap">
                        {attendanceStatuses.map((statusItem) => {
                          const statusValue = mapStatusCodeToStatus(statusItem.code);
                          const count = summary[statusValue] || 0;
                          return (
                            <div key={statusItem.id} className="flex items-center gap-2">
                              <span className="font-semibold text-gray-700">{statusItem.label || statusItem.code}:</span>
                              <span className={`font-bold ${getStatusBadgeColor(statusItem.code).split(' ')[1]}`}>{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Daily Attendance Log */}
                    <div className="border-t border-gray-200 pt-4">
                      <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
                        <div className="font-semibold text-gray-900 text-sm uppercase tracking-wide">DATE</div>
                        <div className="font-semibold text-gray-900 text-sm uppercase tracking-wide">ATTENDANCE</div>
                      </div>
                      <div className="mt-2 space-y-2 max-h-[400px] overflow-y-auto">
                        {monthDates.map((date) => {
                          const dateKey = formatDateKey(date);
                          const status = getAttendanceStatus(selectedEmployee.id, dateKey, true);
                          const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
                          const isDropdownOpen = openDropdownDate === dateKey;
                          const isDateAllowed = isDateAllowedForAttendance(date);
                          
                          return (
                            <div key={dateKey} className="grid grid-cols-[1fr_auto] gap-4 items-center py-2 border-b border-gray-100 relative">
                              <div className={`text-sm ${isDateAllowed ? 'text-gray-700' : 'text-gray-400'}`}>{dateStr}</div>
                              <div className="flex items-center gap-2 dropdown-container">
                                {/* Main status buttons (PRESENT and ABSENT) */}
                                {mainStatuses.map((statusItem) => {
                                  const statusValue = mapStatusCodeToStatus(statusItem.code);
                                  const isActive = status === statusValue;
                                  
                                  return (
                                    <button
                                      key={statusItem.id}
                                      onClick={() => {
                                        if (!isDateAllowed) return;
                                        if (isActive) {
                                          unmarkAttendance(date);
                                        } else {
                                          markAttendance(date, statusValue);
                                        }
                                        setOpenDropdownDate(null);
                                      }}
                                      onDoubleClick={(e) => {
                                        if (!isDateAllowed) return;
                                        e.preventDefault();
                                        e.stopPropagation();
                                        unmarkAttendance(date);
                                      }}
                                      disabled={!isDateAllowed || isMarkingAttendance}
                                      className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                                        !isDateAllowed || isMarkingAttendance
                                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                                          : getStatusColorClasses(statusItem.code, isActive)
                                      }`}
                                    >
                                      {statusItem.label}
                                    </button>
                                  );
                                })}
                                
                                {/* Dropdown for other statuses */}
                                {dropdownStatuses.length > 0 && (
                                  <div className="relative">
                                    <button
                                      onClick={() => {
                                        if (!isDateAllowed) return;
                                        setOpenDropdownDate(isDropdownOpen ? null : dateKey);
                                      }}
                                      disabled={!isDateAllowed || isMarkingAttendance}
                                      className={`px-2 py-1 ${!isDateAllowed || isMarkingAttendance ? 'text-gray-300 cursor-not-allowed opacity-50' : isDropdownOpen ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                      </svg>
                                    </button>
                                    {isDropdownOpen && isDateAllowed && (
                                      <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                                        {dropdownStatuses.map((statusItem) => {
                                          const statusValue = mapStatusCodeToStatus(statusItem.code);
                                          const isActive = status === statusValue;
                                          const isHalfDay = statusItem.code === 'HALF-DAY';
                                          
                                          return (
                                            <button
                                              key={statusItem.id}
                                              onClick={() => {
                                                markAttendance(date, statusValue);
                                                setOpenDropdownDate(null);
                                              }}
                                              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                                                isActive 
                                                  ? isHalfDay 
                                                    ? 'bg-yellow-50 text-yellow-700 font-semibold' 
                                                    : 'bg-blue-50 text-blue-700 font-semibold'
                                                  : 'text-gray-700'
                                              }`}
                                            >
                                              {statusItem.code === 'HALF-DAY' ? 'Half-day' : statusItem.code === 'PAID-LEAVE' ? 'Paid Leave' : statusItem.label}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                {/* Show label for dropdown statuses when active */}
                                {dropdownStatuses.some(s => mapStatusCodeToStatus(s.code) === status) && (
                                  (() => {
                                    const activeStatus = dropdownStatuses.find(s => mapStatusCodeToStatus(s.code) === status);
                                    return (
                                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                        getStatusBadgeColor(activeStatus?.code)
                                      }`}>
                                        {activeStatus?.label || status}
                                      </span>
                                    );
                                  })()
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : null}
        </div>
      )}

      {isVsreOwner && subTab === 'reports' && (
        <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Attendance Reports</h3>
          <div className="bg-white rounded-xl p-8 border-2 border-gray-200 text-center">
            <p className="text-gray-600 text-lg">Attendance reports functionality will be available here.</p>
            <p className="text-sm text-gray-500 mt-2">Generate and view attendance reports, summaries, and analytics.</p>
          </div>
        </div>
      )}


      {/* Details Panels */}
      {isVsreOwner && mainTab === 'details' && subTab === 'my' && (
        <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6">My Details</h3>
          <div className="bg-white rounded-xl p-8 border-2 border-gray-200 text-center">
            <p className="text-gray-600 text-lg">No details records found.</p>
            <p className="text-sm text-gray-500 mt-2">Details data will appear here once records are available.</p>
          </div>
        </div>
      )}

      {isVsreOwner && mainTab === 'details' && subTab === 'add' && (
        <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Add Details</h3>
          <div className="bg-white rounded-xl p-8 border-2 border-gray-200 text-center">
            <p className="text-gray-600 text-lg">Add details functionality will be available here.</p>
            <p className="text-sm text-gray-500 mt-2">Create and manage detailed records.</p>
          </div>
        </div>
      )}

      {isVsreOwner && mainTab === 'details' && subTab === 'reports' && (
        <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Details Reports</h3>
          <div className="bg-white rounded-xl p-8 border-2 border-gray-200 text-center">
            <p className="text-gray-600 text-lg">Details reports functionality will be available here.</p>
            <p className="text-sm text-gray-500 mt-2">Generate and view detailed reports, summaries, and analytics.</p>
          </div>
        </div>
      )}


      {/* Old Attendance Calendar View - Removed (now inline in panels) */}
      
    </div>
  );
};

export default Attendence;
