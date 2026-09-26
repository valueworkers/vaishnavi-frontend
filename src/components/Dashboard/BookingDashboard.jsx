import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUser, FiEdit, FiSearch, FiMail, FiPhone, FiMapPin, FiChevronLeft, FiChevronRight, FiPlus, FiMinus, FiChevronDown, FiChevronUp, FiX, FiCheck, FiColumns, FiClock, FiCalendar } from 'react-icons/fi';
import axios from 'axios';
import * as XLSX from 'xlsx';
import AlertModal from '../AlertModal';
import BookingAvailabilityCalendar from './BookingAvailabilityCalendar';
import PatientSearchDropdown from './PatientSearchDropdown';
import TwelveHourTimeSelect from './TwelveHourTimeSelect';
import { hasOwnerPrivileges } from '../../utils/authRoles';
import {
  BOOKING_CREATE_TYPE_OPTIONS,
  BOOKING_CREATE_TYPES,
  getBookingCreatePath,
  getInHouseLocationType,
} from '../../utils/bookingPatientPrefill';

/** Local calendar date as `YYYY-MM-DD` (avoids UTC day-shift from toISOString). */
const localTodayYmd = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Keep booking date filters as plain `YYYY-MM-DD` (no time component). */
const bookingFilterDateToStartIso = (yyyyMmDd) => {
  const s = String(yyyyMmDd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
};

/** Keep booking date filters as plain `YYYY-MM-DD` (no time component). */
const bookingFilterDateToEndIso = (yyyyMmDd) => {
  const s = String(yyyyMmDd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
};

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const PAGE_SIZE_PRESETS = [10, 30, 60, 100];

const clampPageSize = (value) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
};

const withPageSize = (requestUrl, pageSize) => {
  if (!requestUrl) return null;
  try {
    const base = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '');
    const url = /^https?:\/\//i.test(requestUrl)
      ? new URL(requestUrl)
      : new URL(requestUrl.startsWith('/') ? requestUrl : `/${requestUrl}`, base);
    url.searchParams.set('page_size', String(clampPageSize(pageSize)));
    return url.toString();
  } catch {
    return requestUrl;
  }
};

const BOOKING_LOCATION_TYPE_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'CLIENT_SIDE', label: 'Client Side' },
  { value: 'IN_HOUSE', label: 'In House' },
  { value: 'OPD', label: 'OPD' },
];

const BOOKING_STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'YET_TO_START', label: 'Yet to start' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'FULFILLED', label: 'Fulfilled' },
  { value: 'UNFULFILLED', label: 'Unfulfilled' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

/** Map UI location filter to `booking_type=` API value (IN_HOUSE | OPD | CLIENT_SIDE). */
const toApiBookingType = (location) => {
  if (!location) return null;
  if (location === 'Client') return 'CLIENT_SIDE';
  return location;
};

const isValidBookingOrdering = (ordering) => {
  const order = String(ordering || '').trim();
  return (
    order === 'end_datetime' ||
    order === '-end_datetime' ||
    order === 'auto_continue' ||
    order === '-auto_continue' ||
    order === 'patient__first_name' ||
    order === '-patient__first_name'
  );
};

const DEFAULT_BOOKING_ORDERING = '-end_datetime';

const PATIENT_NAME_ORDERING_OPTIONS = [
  { value: 'patient__first_name', label: 'A to Z' },
  { value: '-patient__first_name', label: 'Z to A' },
];

const isPatientNameOrdering = (ordering) => {
  const order = String(ordering || '').trim();
  return order === 'patient__first_name' || order === '-patient__first_name';
};

const withOrdering = (requestUrl, ordering) => {
  if (!requestUrl) return null;
  try {
    const base = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '');
    const url = /^https?:\/\//i.test(requestUrl)
      ? new URL(requestUrl)
      : new URL(requestUrl.startsWith('/') ? requestUrl : `/${requestUrl}`, base);
    const order = String(ordering || '').trim();
    if (isValidBookingOrdering(order)) {
      url.searchParams.set('ordering', order);
    } else {
      url.searchParams.delete('ordering');
    }
    return url.toString();
  } catch {
    return requestUrl;
  }
};

const formatBookingLocationType = (value) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '-';
  if (raw === 'IN_HOUSE') return 'In House';
  if (raw === 'CLIENT_SIDE') return 'Client Side';
  if (raw === 'OPD') return 'OPD';
  return raw.replace(/_/g, ' ');
};

/** First non-empty `location_locality` from `secondary_orders` (booking list API). */
const getSecondaryLocationLocality = (secondaryOrders) => {
  if (!Array.isArray(secondaryOrders)) return '';
  for (const so of secondaryOrders) {
    const loc = so?.location_locality;
    if (loc != null && String(loc).trim()) return String(loc).trim();
  }
  return '';
};

/** Prefer `location_locality`, else `client_address` (ternary/secondary OPD rows). */
const resolveOrderLocationText = (row, fallback = '') => {
  const locality = String(row?.location_locality ?? '').trim();
  if (locality) return locality;
  const clientAddr = String(row?.client_address ?? '').trim();
  if (clientAddr) return clientAddr;
  const fb = String(fallback ?? '').trim();
  return fb;
};

const BookingDashboard = () => {
  const [activeTab, setActiveTab] = useState('view');
  const [authUser, setAuthUser] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [nextUrl, setNextUrl] = useState(null);
  const [previousUrl, setPreviousUrl] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const fetchInProgressRef = useRef(false);
  const pageSizeRef = useRef(DEFAULT_PAGE_SIZE);
  const endDatetimeOrderingRef = useRef('-end_datetime');
  const [alertState, setAlertState] = useState({ open: false, type: 'info', message: '' });

  const showAlert = useCallback((message, type = 'info') => {
    setAlertState({ open: true, type, message: String(message) });
  }, []);
  const closeAlert = useCallback(() => setAlertState(prev => ({ ...prev, open: false })), []);

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

    const handleAuthChange = () => checkAuthStatus();
    window.addEventListener('auth-changed', handleAuthChange);
    window.addEventListener('storage', handleAuthChange);

    return () => {
      window.removeEventListener('auth-changed', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  const isVsreOwner = useMemo(() => hasOwnerPrivileges(authUser), [authUser]);

  // Fetch invoice bookings from API
  const fetchCustomers = useCallback(async (url = null, searchQuery = '', orderFilter = null, serviceId = null, bookingType = null, statusFilter = '', startDate = '', endDate = '') => {
    // Prevent duplicate concurrent calls
    if (fetchInProgressRef.current) {
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    
    if (!accessToken) {
      setError('Authorization token missing. Please log in again.');
      setIsLoading(false);
      return;
    }

    fetchInProgressRef.current = true;
    setIsLoading(true);
    setError('');
    
    // Clear customers immediately when fetching with order filter to avoid showing stale data
    if (orderFilter) {
      setCustomers([]);
      setTotalCount(0);
    }

    try {
      let apiUrl;
      if (url) {
        apiUrl = withOrdering(withPageSize(url, pageSizeRef.current), endDatetimeOrderingRef.current);
      } else {
        // Build URL with query parameters
        const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}/booking/bookings/`;
        const params = [];
        
        // Add search query if provided
        if (searchQuery && searchQuery.trim()) {
          params.push(`search=${encodeURIComponent(searchQuery.trim())}`);
        }
        
        // Add order filter if provided (for order view mode)
        if (orderFilter) {
          if (orderFilter === 'past') {
            params.push('past_order=true');
          } else if (orderFilter === 'present') {
            params.push('ongoing=true');
          } else if (orderFilter === 'upcoming') {
            params.push('upcoming=true');
          }
        }
        
        // Add service filter if provided
        if (serviceId) {
          params.push(`service_id=${serviceId}`);
        }
        
        // Add booking type filter if provided
        if (bookingType) {
          // Map UI values to API values
          // API endpoints: /booking/bookings/?booking_type=OPD, /booking/bookings/?booking_type=IN_HOUSE, /booking/bookings/?booking_type=CLIENT_SIDE
          const apiBookingType = bookingType === 'Client' ? 'CLIENT_SIDE' : bookingType;
          params.push(`booking_type=${apiBookingType}`);
        }

        // Add status filter if provided
        if (statusFilter) {
          params.push(`status=${encodeURIComponent(statusFilter)}`);
        }

        // Add booking date range filters if provided (IST offset, e.g. 2026-01-01T00:00:00+05:30)
        if (startDate) {
          params.push(`start_date=${encodeURIComponent(bookingFilterDateToStartIso(startDate))}`);
        }
        if (endDate) {
          params.push(`end_date=${encodeURIComponent(bookingFilterDateToEndIso(endDate))}`);
        }

        params.push(`page_size=${clampPageSize(pageSizeRef.current)}`);

        const ordering = endDatetimeOrderingRef.current;
        if (isValidBookingOrdering(ordering)) {
          params.push(`ordering=${encodeURIComponent(ordering)}`);
        }
        
        // Build final URL
        if (params.length > 0) {
          apiUrl = `${baseUrl}?${params.join('&')}`;
        } else {
          apiUrl = baseUrl;
        }
      }
      
      const response = await axios.get(apiUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // Store pagination URLs
      setNextUrl(response.data?.next || null);
      setPreviousUrl(response.data?.previous || null);
      setTotalCount(response.data?.count || 0);
      setCurrentPage(response.data?.current_page || 1);
      setTotalPages(response.data?.total_pages || 1);

      // Handle paginated response (backend may return result[] or results[])
      const bookingsData = response.data?.result ?? response.data?.results ?? [];

      // Log if results are empty for order filters
      if (bookingsData.length === 0 && orderFilter) {
        console.warn(`⚠️ No results returned for order filter: ${orderFilter}`);
        console.warn('This might indicate:');
        console.warn('1. No data exists for this filter');
        console.warn('2. API parameter might be incorrect');
        console.warn('3. Backend filtering logic issue');
      }

      // Flatten secondary_orders[].ternary_orders into children; if a secondary has no tertiaries (e.g. CLIENT_SIDE day rows), use the secondary itself as a line item.
      const getChildrenFromBooking = (booking) => {
        if (booking.children && booking.children.length > 0) return booking.children;
        const secondaries = booking.secondary_orders || [];
        return secondaries.flatMap((so) => {
          const tert = so.ternary_orders || [];
          if (tert.length > 0) return tert;
          return [
            {
              id: so.id,
              order_id: so.order_id,
              service_name: so.service_name,
              // Secondary rows often omit `service`; fall back to parent booking.service for package lookup
              service: so.service ?? booking.service ?? null,
              package_name: so.package_name,
              location_locality: so.location_locality,
              start_datetime: so.start_datetime,
              end_datetime: so.end_datetime,
              subtotal: so.subtotal,
              status: so.status,
              booking_type: so.booking_type,
              booking_entity: so.booking_entity,
              created_at: so.created_at,
              updated_at: so.updated_at,
              modified_at: so.modified_at,
            },
          ];
        });
      };

      // Map API response to component format
      const mappedCustomers = bookingsData.map(booking => {
        const patient = booking.patient || {};
        const nameParts = (patient.name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        const bookingType = String(booking.booking_type || '').toUpperCase();
        const isClientSideBooking = bookingType === 'CLIENT_SIDE';
        const clientAddress = booking.client_address || '';
        const children = getChildrenFromBooking(booking);
        const mainAmount = booking.total_bill ?? booking.subtotal ?? '0';

        // Map children (or ternary_orders) to the expected service format
        const mappedServices = children.map(child => ({
          id: child.id,
          order_id: child.order_id || '',
          service_name: child.service_name || '',
          service_id: child.service || booking.service || null,
          package_name: child.package_name || '',
          location_locality: resolveOrderLocationText(child, isClientSideBooking ? clientAddress : booking.location_locality || ''),
          client_address: child.client_address || '',
          venue_name: child.venue_name || '',
          start_datetime: child.start_datetime || null,
          end_datetime: child.end_datetime || null,
          status: child.status || '',
          subtotal: child.subtotal || '0',
          booking_type: child.booking_type || '',
          booking_entity: child.booking_entity || '',
          created_at: child.created_at || null,
          updated_at: child.updated_at || null,
          modified_at: child.modified_at || null,
        }));

        return {
          id: booking.id,
          bookingId: booking.id,
          orderId: booking.order_id || '',
          patientId: patient.id ?? booking.patient_id ?? booking.id,
          patient_id: patient.patient_id || '',
          name: patient.name || 'Unknown',
          firstName: firstName,
          lastName: lastName,
          email: patient.email || '',
          phone: patient.phone || '',
          address: '',
          age: patient.age || null,
          gender: '',
          emergencyContact: patient.emergency_contact || '',
          emergencyPhone: patient.emergency_phone || '',
          medicalConditions: '',
          isActive: booking.status !== 'CANCELLED',
          package: {
            name: booking.package_name || '',
            price: mainAmount,
            duration: null,
          },
          // Primary-level service/package/location info from booking API
          serviceName: booking.service_name || '',
          packageName: booking.package_name || '',
          locationLocality: isClientSideBooking
            ? (clientAddress || booking.location_locality || booking.venue_name || '')
            : (booking.location_locality || booking.venue_name || ''),
          secondaryLocationLocality: getSecondaryLocationLocality(booking.secondary_orders),
          clientAddress,
          nameRegisteredBy: booking.user_email || '',
          advancePayment: null,
          registrationFee: mainAmount,
          registrationDate: booking.start_datetime || null,
          selectedDates: booking.start_datetime ? [booking.start_datetime] : null,
          startDatetime: booking.start_datetime || null,
          endDatetime: booking.end_datetime || null,
          venueName: booking.venue_name || '',
          venueCost: '0',
          servicesCost: mainAmount,
          subtotal: mainAmount,
          discount: '0',
          finalAmount: mainAmount,
          status: booking.status || '',
          continueBooking: Boolean(booking.auto_continue),
          isUpcoming: false,
          isOngoing: booking.status === 'BOOKED' || booking.status === 'IN_PROGRESS',
          invoiceNumber: booking.invoice_number,
          bookingType: booking.booking_type,
          bookingEntity: booking.booking_entity,
          userId: booking.user,
          venueId: booking.venue,
          serviceId: booking.service,
          packageId: booking.package,
          services: mappedServices,
          children,
          secondary_orders: booking.secondary_orders || [],
        };
      });

      // Set customers - bookingServices will be populated in ViewCustomers component
      setCustomers(mappedCustomers);
    } catch (err) {
      // Handle 404 as "no data" instead of error
      if (err.response?.status === 404) {
        setCustomers([]);
        setError('');
        setNextUrl(null);
        setPreviousUrl(null);
        setTotalCount(0);
      } else {
        console.error('Error fetching invoice bookings:', err);
        const errorMessage = err.response?.data?.message || 
                            err.response?.data?.detail || 
                            err.message || 
                            'Failed to fetch bookings. Please try again.';
        setError(errorMessage);
        setCustomers([]);
      }
    } finally {
      setIsLoading(false);
      fetchInProgressRef.current = false;
    }
  }, []); // Empty dependency array - function doesn't depend on any props or state

  return (
    <div className="w-full">
      {/* Header */}
      {/* <div className="flex flex-row items-center gap-3 mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Manage Dashboard</h2>
        <span className="text-gray-400">|</span>
        <p className="text-sm text-gray-600">Manage customers and their packages</p>
      </div> */}

      {/* Tabs */}
      {/* <div className="flex items-center justify-between gap-2 mb-4">
        <button
          onClick={() => setActiveTab('view')}
          className={`flex-1 px-3 py-1.5 rounded-lg bg-white border-2 shadow-sm transition-all text-xs font-semibold flex items-center justify-center gap-1.5 ${
            activeTab === 'view'
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
              : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <FiUser className="w-3.5 h-3.5" />
          <span>View Customers</span>
        </button>
        <button
          onClick={() => setActiveTab('edit')}
          className={`flex-1 px-3 py-1.5 rounded-lg bg-white border-2 shadow-sm transition-all text-xs font-semibold flex items-center justify-center gap-1.5 ${
            activeTab === 'edit'
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
              : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <FiEdit className="w-3.5 h-3.5" />
          <span>Edit Services</span>
        </button>
      </div> */}

      {/* Tab Content */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
        {activeTab === 'view' && (
          <ViewCustomers 
            customers={customers}
            setCustomers={setCustomers}
            isLoading={isLoading}
            error={error}
            nextUrl={nextUrl}
            previousUrl={previousUrl}
            totalCount={totalCount}
            currentPage={currentPage}
            totalPages={totalPages}
            fetchCustomers={fetchCustomers}
            showAlert={showAlert}
            isVsreOwner={isVsreOwner}
            pageSizeRef={pageSizeRef}
            endDatetimeOrderingRef={endDatetimeOrderingRef}
          />
        )}
        {activeTab === 'edit' && (
          <EditCustomers 
            customers={customers}
            isLoading={isLoading}
            error={error}
            nextUrl={nextUrl}
            previousUrl={previousUrl}
            totalCount={totalCount}
            fetchCustomers={fetchCustomers}
            showAlert={showAlert}
          />
        )}
      </div>

      <AlertModal
        open={alertState.open}
        type={alertState.type}
        message={alertState.message}
        onClose={closeAlert}
      />
    </div>
  );
};

// Extract error message from API response (message, detail, error, errors)
const getResponseErrorMessage = (error, fallback = 'Something went wrong.') => {
  const d = error?.response?.data;
  if (!d) return error?.message || fallback;
  if (typeof d === 'string') return d;
  if (d.message) return typeof d.message === 'string' ? d.message : JSON.stringify(d.message);
  if (d.detail) {
    if (typeof d.detail === 'string') return d.detail;
    if (Array.isArray(d.detail)) return d.detail.join('. ');
    return JSON.stringify(d.detail);
  }
  if (d.error) return typeof d.error === 'string' ? d.error : JSON.stringify(d.error);
  if (Array.isArray(d.errors)) return d.errors.map((e) => (typeof e === 'string' ? e : e.message || JSON.stringify(e))).join('. ');
  if (d.errors && typeof d.errors === 'object') return Object.entries(d.errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('. ');
  // Field-level validation: { start_datetime: ["msg"], package: ["msg2"] }
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const stripParenthetical = (s) => (typeof s === 'string' && s.includes(' (')) ? s.substring(0, s.indexOf(' (')).trim() : s;
    const parts = Object.entries(d).map(([k, v]) => {
      const raw = Array.isArray(v) ? v.join('. ') : (typeof v === 'string' ? v : String(v));
      const msg = Array.isArray(v) ? v.map((m) => stripParenthetical(m)).join('. ') : stripParenthetical(raw);
      return msg ? msg : null;
    }).filter(Boolean);
    if (parts.length > 0) return parts.join('. ');
  }
  return error?.message || fallback;
};

const formatBookingExportDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getBookingCustomerExportCell = (customer, columnId) => {
  const mergedSecondaryOrders = customer.secondary_orders || [];
  const packageName = customer.package?.name || customer.package?.package_name || '';
  const fullName =
    `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.name || '-';
  const startingDateDisplay = customer.startDatetime
    ? formatBookingExportDate(customer.startDatetime)
    : '-';
  const endingDateDisplay = customer.endDatetime ? formatBookingExportDate(customer.endDatetime) : '-';

  switch (columnId) {
    case 'order_id':
      return customer.orderId || '-';
    case 'name':
      return fullName;
    case 'patient_id':
      return customer.patient_id || '-';
    case 'phone':
      return customer.phone || '-';
    case 'age':
      return customer.age !== null && customer.age !== undefined ? String(customer.age) : '-';
    case 'serviceOpted':
      return customer.packageName || packageName || '-';
    case 'serviceName':
      return customer.serviceName || '-';
    case 'location': {
      const customerLocation =
        customer.locationLocality ||
        customer.venueName ||
        (mergedSecondaryOrders.length > 0 ? mergedSecondaryOrders[0].location_locality || '' : '');
      return customerLocation || '-';
    }
    case 'locationType':
      return formatBookingLocationType(customer.bookingType);
    case 'locationLocality':
      return (
        customer.secondaryLocationLocality ||
        getSecondaryLocationLocality(mergedSecondaryOrders) ||
        '-'
      );
    case 'startingDate':
      return startingDateDisplay;
    case 'endingDate':
      return endingDateDisplay;
    case 'status':
      return customer.status ? String(customer.status).replace(/_/g, ' ') : '-';
    case 'autoRenew':
      return customer.continueBooking ? 'ON' : 'OFF';
    case 'emergencyContact': {
      const parts = [customer.emergencyContact, customer.emergencyPhone].filter(Boolean);
      return parts.length ? parts.join(' / ') : '-';
    }
    default:
      return '-';
  }
};

const getBookingOrderExportCell = (order, columnId) => {
  switch (columnId) {
    case 'orderId':
      return order.orderId || '-';
    case 'patientId':
      return order.patientId || '-';
    case 'service':
      return order.packageType || '-';
    case 'package':
      return order.serviceType || '-';
    case 'status':
      return order.status ? String(order.status).replace(/_/g, ' ') : '-';
    case 'customer':
      return order.customerName || '-';
    case 'age':
      return order.age ?? '-';
    case 'phone':
      return order.phone || '-';
    case 'startDate':
      return formatBookingExportDate(order.startDate);
    case 'endDate':
      return formatBookingExportDate(order.endDate);
    case 'location':
      return order.location || '-';
    case 'locationType':
      return formatBookingLocationType(order.bookingType);
    case 'locationLocality':
      return order.locationLocality || '-';
    case 'emergencyContact':
      return order.emergencyContact || '-';
    default:
      return '-';
  }
};

// View Customers Component
const ViewCustomers = ({ customers, setCustomers, isLoading, error, nextUrl, previousUrl, totalCount, currentPage, totalPages, fetchCustomers, showAlert, isVsreOwner = false, pageSizeRef, endDatetimeOrderingRef }) => {
  const navigate = useNavigate();
  const STATUS_TRANSITIONS = {
    DRAFT: ["BOOKED", "CANCELLED"],
    BOOKED: ["CANCELLED", "HOLD", "DELAYED"],
    YET_TO_START: ["CANCELLED", "HOLD","MODIFIED", "RESCHEDULED"],
    IN_PROGRESS: ["CANCELLED", "UNFULFILLED", "PARTIALLY_FULFILLED", "MODIFIED", "RESCHEDULED"],
    HOLD: ["BOOKED", "CANCELLED", "IN_PROGRESS"],
    UNFULFILLED: ["FULFILLED", "PARTIALLY_FULFILLED"],
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState(''); // Only updated on Enter or clear — used for API
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const isInitialMountRef = useRef(true);
  const [openStatusDropdown, setOpenStatusDropdown] = useState(null); // 'order-{customerId}' or 'service-{serviceId}'
  const [isChangingStatus, setIsChangingStatus] = useState({}); // serviceId or 'order-{customerId}' -> loading state
  const [togglingAutoRenewId, setTogglingAutoRenewId] = useState(null);
  // Store counts for each order tab separately
  const [orderTabCounts, setOrderTabCounts] = useState({
    past: 0,
    present: 0,
    upcoming: 0
  });
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [expandedOrderSummaryRows, setExpandedOrderSummaryRows] = useState(new Set());
  const [selectedService, setSelectedService] = useState(null); // Single service selection instead of array
  const [showCreateBookingModal, setShowCreateBookingModal] = useState(false);
  const [createBookingType, setCreateBookingType] = useState(BOOKING_CREATE_TYPES.IN_HOUSE);
  const [createBookingPatient, setCreateBookingPatient] = useState(null);
  const [createBookingError, setCreateBookingError] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState(null); // Store service ID for API calls
  const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);
  const serviceFilterRef = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState(null); // '', CLIENT_SIDE, IN_HOUSE, OPD
  const [showLocationTypeFilterMenu, setShowLocationTypeFilterMenu] = useState(false);
  const locationTypeFilterRef = useRef(null);
  const [showStatusFilterMenu, setShowStatusFilterMenu] = useState(false);
  const statusFilterRef = useRef(null);
  const [showStartDateFilterMenu, setShowStartDateFilterMenu] = useState(false);
  const startDateFilterRef = useRef(null);
  const [showEndDateFilterMenu, setShowEndDateFilterMenu] = useState(false);
  const endDateFilterRef = useRef(null);
  const [selectedStatus, setSelectedStatus] = useState(''); // '', IN_PROGRESS, YET_TO_START, FULFILLED, UNFULFILLED, CANCELLED
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [endDatetimeOrdering, setEndDatetimeOrdering] = useState(DEFAULT_BOOKING_ORDERING);
  const [showPatientNameOrderingMenu, setShowPatientNameOrderingMenu] = useState(false);
  const patientNameOrderingRef = useRef(null);
  const hasStartDateFilter = Boolean(String(startDateFilter || '').trim());
  const hasEndDateFilter = Boolean(String(endDateFilter || '').trim());
  const [viewMode, setViewMode] = useState('customer'); // 'customer' or 'order'
  const [activeOrdersTab, setActiveOrdersTab] = useState('present'); // 'past', 'present', 'upcoming'
  const [bookingServices, setBookingServices] = useState({}); // patientId -> array of services
  const [detailSecondaryOrdersByBookingId, setDetailSecondaryOrdersByBookingId] = useState({}); // GET /bookings/:id/ when list omits secondary_orders
  const [loadingServices, setLoadingServices] = useState({}); // patientId -> loading state
  const [servicePagination, setServicePagination] = useState({}); // patientId -> { count, next, previous, current_page, total_pages }
  const [serviceForms, setServiceForms] = useState({}); // customerId -> { serviceType: '', serviceDate: '', startDate: '', endDate: '', serviceTime: '' }
  const [availableServices, setAvailableServices] = useState([]); // Services from /management/services/ API (toolbar filter)
  const [isLoadingAvailableServices, setIsLoadingAvailableServices] = useState(false);
  const [addServiceDropdownByBookingId, setAddServiceDropdownByBookingId] = useState({}); // bookingId -> services for + add form
  const [loadingAddServiceDropdown, setLoadingAddServiceDropdown] = useState({}); // bookingId -> loading
  const serviceDropdownByTypeCacheRef = useRef({}); // service_type -> services[]
  const [servicePackages, setServicePackages] = useState({}); // customerId -> array of packages for selected service
  const [isLoadingServicePackages, setIsLoadingServicePackages] = useState({}); // customerId -> loading state
  const [isAddingService, setIsAddingService] = useState({}); // bookingId -> loading state for adding service
  const [editingService, setEditingService] = useState(null); // { serviceId, bookingId, serviceName, start_datetime, end_datetime }
  const [editServiceForm, setEditServiceForm] = useState({ startDate: '', startTime: '00:00', endDate: '', endTime: '23:59', packageId: '', discount: '', premium: '', status: '' });
  const initialEditServiceFormRef = useRef(null); // snapshot when modal opened (to detect only-status change)
  const [editServicePackages, setEditServicePackages] = useState([]);
  const [isLoadingEditServicePackages, setIsLoadingEditServicePackages] = useState(false);
  const [isUpdatingService, setIsUpdatingService] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedBookingForCancel, setSelectedBookingForCancel] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [customCancelReason, setCustomCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Orders main table (View -> Orders) column visibility
  const [orderSummaryColumnVisibility, setOrderSummaryColumnVisibility] = useState({
    orderId: true,
    patientId: true,
    customer: true,
    service: true,
    package: true,
    status: true,
    age: true,
    startDate: true,
    endDate: true,
    locationType: true,
    locationLocality: true,
    location: true,
    emergencyContact: true,
    phone: true,
  });

  const toggleOrderSummaryColumn = (id) => {
    setOrderSummaryColumnVisibility((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Per-booking orders (periods & services) column visibility
  const [orderDetailColumnVisibility, setOrderDetailColumnVisibility] = useState({
    orderId: true,
    service: true,
    package: true,
    location: true,
    start: true,
    end: true,
    created: true,
    modified: true,
    status: true,
    actions: true,
  });

  const toggleOrderDetailColumn = (id) => {
    setOrderDetailColumnVisibility((prev) => ({
      ...prev,
      [id]: !(prev[id] !== false),
    }));
  };

  // Orders main table (summary) draggable columns
  const ORDER_SUMMARY_COLUMN_IDS = [
    'orderId',
    'patientId',
    'service',
    'package',
    'status',
    'customer',
    'age',
    'phone',
    'startDate',
    'endDate',
    'locationType',
    'locationLocality',
    'location',
    'emergencyContact',
  ];
  const orderSummaryColumnsConfig = useMemo(() => [
    { id: 'orderId', label: 'Order ID' },
    { id: 'patientId', label: 'Patient ID' },
    { id: 'service', label: 'Package Name' },
    { id: 'package', label: 'Service Name' },
    { id: 'status', label: 'Status' },
    { id: 'customer', label: 'Patient Name' },
    { id: 'age', label: 'Age' },
    { id: 'phone', label: 'Phone' },
    { id: 'startDate', label: 'Starting Date' },
    { id: 'endDate', label: 'Ending Date' },
    { id: 'locationType', label: 'Location type' },
    { id: 'locationLocality', label: 'Locality' },
    { id: 'location', label: 'Location' },
    { id: 'emergencyContact', label: 'Emergency Contact' },
  ], []);

  const [orderSummaryColumnOrder, setOrderSummaryColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('bookingDashboard_orderSummaryColumnOrder');
      if (saved) {
        const savedOrder = JSON.parse(saved);
        const merged = [...savedOrder.filter(id => ORDER_SUMMARY_COLUMN_IDS.includes(id)), ...ORDER_SUMMARY_COLUMN_IDS.filter(id => !savedOrder.includes(id))];
        return merged.length ? merged : [...ORDER_SUMMARY_COLUMN_IDS];
      }
    } catch (e) { /* ignore */ }
    return [...ORDER_SUMMARY_COLUMN_IDS];
  });

  const [orderSummaryDraggedColumn, setOrderSummaryDraggedColumn] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem('bookingDashboard_orderSummaryColumnOrder', JSON.stringify(orderSummaryColumnOrder));
    } catch (e) { /* ignore */ }
  }, [orderSummaryColumnOrder]);

  const visibleOrderSummaryColumns = useMemo(() => {
    return orderSummaryColumnOrder
      .filter(id => orderSummaryColumnVisibility[id] !== false)
      .map(id => orderSummaryColumnsConfig.find(c => c.id === id))
      .filter(Boolean);
  }, [orderSummaryColumnOrder, orderSummaryColumnVisibility, orderSummaryColumnsConfig]);

  const handleOrderSummaryDragStart = (e, index) => {
    setOrderSummaryDraggedColumn(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleOrderSummaryDragOver = (e, index) => {
    e.preventDefault();
    if (orderSummaryDraggedColumn === null || orderSummaryDraggedColumn === index) return;
    const visibleIds = visibleOrderSummaryColumns.map(c => c.id);
    const draggedId = visibleIds[orderSummaryDraggedColumn];
    const targetId = visibleIds[index];
    const newOrder = [...orderSummaryColumnOrder];
    const di = newOrder.indexOf(draggedId);
    const ti = newOrder.indexOf(targetId);
    newOrder.splice(di, 1);
    newOrder.splice(ti, 0, draggedId);
    setOrderSummaryColumnOrder(newOrder);
    setOrderSummaryDraggedColumn(index);
  };

  const handleOrderSummaryDragEnd = () => {
    setOrderSummaryDraggedColumn(null);
  };

  // Orders table column definitions (for drag reorder)
  const ORDER_DETAIL_COLUMN_IDS = ['orderId', 'service', 'package', 'location', 'start', 'end', 'created', 'modified', 'status', 'actions'];
  const orderDetailColumnsConfig = useMemo(() => [
    { id: 'orderId', label: 'Order ID', width: '110px' },
    { id: 'service', label: 'Service', width: '180px' },
    { id: 'package', label: 'Package', width: '180px' },
    { id: 'location', label: 'Location', width: '140px' },
    { id: 'start', label: 'Start Date', width: '160px' },
    { id: 'end', label: 'End Date', width: '160px' },
    { id: 'created', label: 'Created Date', width: '110px' },
    { id: 'modified', label: 'Modified Date', width: '110px' },
    { id: 'status', label: 'Status', width: '130px' },
    { id: 'actions', label: 'Actions', width: '100px' },
  ], []);

  const [orderDetailColumnOrder, setOrderDetailColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('bookingDashboard_orderDetailColumnOrder');
      if (saved) {
        const savedOrder = JSON.parse(saved);
        const merged = [...savedOrder.filter(id => ORDER_DETAIL_COLUMN_IDS.includes(id)), ...ORDER_DETAIL_COLUMN_IDS.filter(id => !savedOrder.includes(id))];
        return merged.length ? merged : [...ORDER_DETAIL_COLUMN_IDS];
      }
    } catch (e) { /* ignore */ }
    return [...ORDER_DETAIL_COLUMN_IDS];
  });

  const [orderDetailDraggedColumn, setOrderDetailDraggedColumn] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem('bookingDashboard_orderDetailColumnOrder', JSON.stringify(orderDetailColumnOrder));
    } catch (e) { /* ignore */ }
  }, [orderDetailColumnOrder]);

  const visibleOrderDetailColumns = useMemo(() => {
    return orderDetailColumnOrder
      .filter(id => orderDetailColumnVisibility[id])
      .map(id => orderDetailColumnsConfig.find(c => c.id === id))
      .filter(Boolean);
  }, [orderDetailColumnOrder, orderDetailColumnVisibility, orderDetailColumnsConfig]);

  const handleOrderDetailDragStart = (e, index) => {
    setOrderDetailDraggedColumn(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleOrderDetailDragOver = (e, index) => {
    e.preventDefault();
    if (orderDetailDraggedColumn === null || orderDetailDraggedColumn === index) return;
    const visibleIds = visibleOrderDetailColumns.map(c => c.id);
    const draggedId = visibleIds[orderDetailDraggedColumn];
    const targetId = visibleIds[index];
    const newOrder = [...orderDetailColumnOrder];
    const di = newOrder.indexOf(draggedId);
    const ti = newOrder.indexOf(targetId);
    newOrder.splice(di, 1);
    newOrder.splice(ti, 0, draggedId);
    setOrderDetailColumnOrder(newOrder);
    setOrderDetailDraggedColumn(index);
  };

  const handleOrderDetailDragEnd = () => {
    setOrderDetailDraggedColumn(null);
  };

  // Column configuration
  const [allColumns] = useState([
    { id: 'order_id', label: 'Order ID', width: '130px', visible: true },
    { id: 'name', label: 'Patient Name', width: '150px', visible: true },
    { id: 'patient_id', label: 'Patient ID', width: '90px', visible: true },
    { id: 'phone', label: 'Phone', width: '110px', visible: true },
    { id: 'age', label: 'Age', width: '50px', visible: true },
    { id: 'serviceOpted', label: 'Package Name', width: '150px', visible: true },
    { id: 'serviceName', label: 'Service Name', width: '140px', visible: true },
    { id: 'locationType', label: 'Location type', width: '120px', visible: true },
    { id: 'locationLocality', label: 'Locality', width: '140px', visible: true },
    { id: 'location', label: 'Location', width: '180px', visible: true },
    { id: 'startingDate', label: 'Starting Date', width: '110px', visible: true },
    { id: 'endingDate', label: 'Ending Date', width: '110px', visible: true },
    { id: 'status', label: 'Status', width: '120px', visible: true },
    { id: 'autoRenew', label: 'Auto-renew', width: '130px', visible: true },
    { id: 'emergencyContact', label: 'Emergency Contact', width: '140px', visible: true },
  ]);

  // Initialize column visibility and order from localStorage
  const [columnVisibility, setColumnVisibility] = useState(() => {
    const defaultVisibility = allColumns.reduce((acc, col) => ({ ...acc, [col.id]: col.visible }), {});
    try {
      const saved = localStorage.getItem('bookingDashboard_columnVisibility');
      if (saved) {
        const savedVisibility = JSON.parse(saved);
        // Merge with defaults to ensure new columns are included
        // Ensure cancelBooking is always visible
        return { ...defaultVisibility, ...savedVisibility, cancelBooking: true };
      }
    } catch (error) {
      console.error('Error loading column visibility:', error);
    }
    return defaultVisibility;
  });

  const [columnOrder, setColumnOrder] = useState(() => {
    const defaultOrder = allColumns.map(col => col.id);
    try {
      const saved = localStorage.getItem('bookingDashboard_columnOrder');
      if (saved) {
        const savedOrder = JSON.parse(saved);
        // Merge with defaults: add any new columns that aren't in saved order
        const newColumns = defaultOrder.filter(colId => !savedOrder.includes(colId));
        const mergedOrder = [...savedOrder, ...newColumns];
        // Ensure cancelBooking is always included
        if (!mergedOrder.includes('cancelBooking')) {
          mergedOrder.push('cancelBooking');
        }
        return mergedOrder;
      }
    } catch (error) {
      console.error('Error loading column order:', error);
    }
    return defaultOrder;
  });

  const [draggedColumn, setDraggedColumn] = useState(null);
  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const [columnSearchTerm, setColumnSearchTerm] = useState('');

  // Save column visibility to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('bookingDashboard_columnVisibility', JSON.stringify(columnVisibility));
    } catch (error) {
      console.error('Error saving column visibility:', error);
    }
  }, [columnVisibility]);

  // Save column order to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('bookingDashboard_columnOrder', JSON.stringify(columnOrder));
    } catch (error) {
      console.error('Error saving column order:', error);
    }
  }, [columnOrder]);

  // Get visible columns in the correct order
  const visibleColumns = useMemo(() => {
    return columnOrder
      .filter(colId => columnVisibility[colId])
      .map(colId => allColumns.find(col => col.id === colId))
      .filter(Boolean);
  }, [columnOrder, columnVisibility, allColumns]);

  // Handle click outside to close service column filter
  useEffect(() => {
    if (!isServiceDropdownOpen) return;
    const handleClickOutside = (event) => {
      if (serviceFilterRef.current && !serviceFilterRef.current.contains(event.target)) {
        setIsServiceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isServiceDropdownOpen]);

  // Extract services from customers data and populate bookingServices
  // Use booking ID as key (not patientId) since multiple bookings can have same patient
  useEffect(() => {
    const servicesMap = {};
    const paginationMap = {};

    const secondaryListHasNestedTertiaries = (secondaries) =>
      (secondaries || []).some((so) => (so.ternary_orders || []).length > 0);

    customers.forEach(customer => {
      // Use booking ID as the key to uniquely identify each booking's services
      const bookingId = customer.id || customer.bookingId;
      const secondaries = customer.secondary_orders || [];
      const hasNested = secondaryListHasNestedTertiaries(secondaries);

      // When API sends secondary_orders that are leaf rows only (CLIENT_SIDE dates), show them only in the secondary table — do not duplicate into bookingServices.
      const useChildrenForTertiaryTable =
        customer.children &&
        customer.children.length > 0 &&
        (hasNested || secondaries.length === 0);

      const servicesData = useChildrenForTertiaryTable ? customer.children : [];
      
      if (servicesData.length > 0) {
        servicesMap[bookingId] = servicesData.map(service => ({
          id: service.id,
          order_id: service.order_id || '',
          service_name: service.service_name || '',
          start_datetime: service.start_datetime,
          end_datetime: service.end_datetime,
          service_total_price: service.subtotal || service.service_total_price,
          status: service.status,
          invoice_number: service.invoice_number,
          service_id: service.service || service.service_id || customer.serviceId,
          // Package/location info for tertiary rows
          package_name: service.package_name || service.service_package_name || '',
          location_locality: resolveOrderLocationText(service, customer.locationLocality || ''),
          client_address: service.client_address || '',
          venue_name: service.venue_name || '',
          service_package_name: service.service_package_name,
          booking_type: service.booking_type,
          booking_entity: service.booking_entity,
          created_at: service.created_at || null,
          updated_at: service.updated_at || null,
          modified_at: service.modified_at || null,
        }));
        
        paginationMap[bookingId] = {
          count: servicesData.length,
          next: null,
          previous: null,
          current_page: 1,
          total_pages: 1
        };
      } else {
        // Initialize empty services and pagination for bookings without children/services
        servicesMap[bookingId] = [];
        paginationMap[bookingId] = {
          count: 0,
          next: null,
          previous: null,
          current_page: 1,
          total_pages: 1
        };
      }
    });
    
    setBookingServices(servicesMap);
    setServicePagination(paginationMap);
  }, [customers]);

  // Search API runs only when user presses Enter (not on every keystroke)
  const clearSearchAndReload = useCallback(() => {
    setSearchQuery('')
    setAppliedSearchQuery('')
    if (!fetchCustomers || viewMode !== 'customer') return
    const apiBookingType = toApiBookingType(selectedLocation)
    fetchCustomers(null, '', null, selectedServiceId, apiBookingType, selectedStatus, startDateFilter, endDateFilter)
  }, [fetchCustomers, viewMode, selectedLocation, selectedServiceId, selectedStatus, startDateFilter, endDateFilter])

  const handleSearchInputChange = useCallback(
    (e) => {
      const value = e.target.value
      setSearchQuery(value)
      if (!value.trim() && appliedSearchQuery.trim()) {
        clearSearchAndReload()
      }
    },
    [appliedSearchQuery, clearSearchAndReload]
  )

  const runSearch = useCallback(() => {
    if (!fetchCustomers || viewMode !== 'customer') return;
    setAppliedSearchQuery(searchQuery);
    const apiBookingType = toApiBookingType(selectedLocation);
    fetchCustomers(null, searchQuery, null, selectedServiceId, apiBookingType, selectedStatus, startDateFilter, endDateFilter);
  }, [fetchCustomers, viewMode, searchQuery, selectedLocation, selectedServiceId, selectedStatus, startDateFilter, endDateFilter]);

  const handlePageSizeChange = useCallback(
    (e) => {
      const next = clampPageSize(Number(e.target.value));
      setPageSize(next);
      if (pageSizeRef) pageSizeRef.current = next;
      if (!fetchCustomers) return;
      const orderFilter = viewMode === 'order' ? activeOrdersTab : null;
      const apiBookingType = toApiBookingType(selectedLocation);
      fetchCustomers(
        null,
        appliedSearchQuery,
        orderFilter,
        selectedServiceId,
        apiBookingType,
        selectedStatus,
        startDateFilter,
        endDateFilter
      );
    },
    [
      pageSizeRef,
      fetchCustomers,
      viewMode,
      activeOrdersTab,
      appliedSearchQuery,
      selectedServiceId,
      selectedLocation,
      selectedStatus,
      startDateFilter,
      endDateFilter,
    ]
  );

  useEffect(() => {
    if (pageSizeRef) pageSizeRef.current = pageSize;
  }, [pageSize, pageSizeRef]);

  useEffect(() => {
    if (endDatetimeOrderingRef) {
      endDatetimeOrderingRef.current = endDatetimeOrdering;
    }
  }, [endDatetimeOrdering, endDatetimeOrderingRef]);

  const applyListOrdering = useCallback(
    (nextOrdering) => {
      const raw = String(nextOrdering || '').trim();
      const value = isValidBookingOrdering(raw) ? raw : DEFAULT_BOOKING_ORDERING;
      setEndDatetimeOrdering(value);
      setShowPatientNameOrderingMenu(false);
      if (endDatetimeOrderingRef) {
        endDatetimeOrderingRef.current = value;
      }
      if (!fetchCustomers) return;
      const orderFilter = viewMode === 'order' ? activeOrdersTab : null;
      const apiBookingType = toApiBookingType(selectedLocation);
      fetchCustomers(
        null,
        appliedSearchQuery,
        orderFilter,
        selectedServiceId,
        apiBookingType,
        selectedStatus,
        startDateFilter,
        endDateFilter
      );
    },
    [
      fetchCustomers,
      endDatetimeOrderingRef,
      viewMode,
      activeOrdersTab,
      appliedSearchQuery,
      selectedServiceId,
      selectedLocation,
      selectedStatus,
      startDateFilter,
      endDateFilter,
    ]
  );

  const patientNameOrderingLabel = useMemo(
    () =>
      PATIENT_NAME_ORDERING_OPTIONS.find((option) => option.value === endDatetimeOrdering)?.label ||
      '',
    [endDatetimeOrdering]
  );

  // Track previous view mode to detect when switching to order view
  const previousViewModeRef = useRef(viewMode);

  // Keep order tab counts stable while loading new data.
  // We now compute counts via dedicated API calls; avoid overwriting them from totalCount in Orders view.
  useEffect(() => {
    if (viewMode !== 'order' && activeOrdersTab) {
      setOrderTabCounts(prev => ({
        ...prev,
        [activeOrdersTab]: totalCount
      }));
    }
  }, [totalCount, activeOrdersTab, viewMode]);

  // Initial load when component mounts and user is VSRE owner
  // useEffect(() => {
  //   if (isVsreOwner) {
  //     fetchCustomers();
  //   }
  // }, [isVsreOwner, fetchCustomers]);

  // When in Orders view, fetch counts for Past / Present / Upcoming tabs by calling all three endpoints
  useEffect(() => {
    if (viewMode !== 'order') return;

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return;

    const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}/booking/bookings/`;
    const params = [];

    if (appliedSearchQuery && appliedSearchQuery.trim()) {
      params.push(`search=${encodeURIComponent(appliedSearchQuery.trim())}`);
    }
    if (selectedServiceId) {
      params.push(`service_id=${selectedServiceId}`);
    }
    const apiBookingType = toApiBookingType(selectedLocation);
    if (apiBookingType) {
      params.push(`booking_type=${apiBookingType}`);
    }
    if (selectedStatus) {
      params.push(`status=${encodeURIComponent(selectedStatus)}`);
    }
    if (hasStartDateFilter) {
      params.push(`start_date=${encodeURIComponent(bookingFilterDateToStartIso(startDateFilter))}`);
    }
    if (hasEndDateFilter) {
      params.push(`end_date=${encodeURIComponent(bookingFilterDateToEndIso(endDateFilter))}`);
    }

    const buildUrl = (flag) => {
      const allParams = [...params, flag];
      return allParams.length ? `${baseUrl}?${allParams.join('&')}` : `${baseUrl}?${flag}`;
    };

    const fetchCounts = async () => {
      try {
        const [pastRes, presentRes, upcomingRes] = await Promise.all([
          axios.get(buildUrl('past_order=true'), { headers: { Authorization: `Bearer ${accessToken}` } }),
          axios.get(buildUrl('ongoing=true'), { headers: { Authorization: `Bearer ${accessToken}` } }),
          axios.get(buildUrl('upcoming=true'), { headers: { Authorization: `Bearer ${accessToken}` } }),
        ]);

        setOrderTabCounts({
          past: pastRes.data?.count ?? 0,
          present: presentRes.data?.count ?? 0,
          upcoming: upcomingRes.data?.count ?? 0,
        });
      } catch (error) {
        console.error('Error fetching order tab counts:', error);
      }
    };

    fetchCounts();
  }, [viewMode, appliedSearchQuery, selectedLocation, selectedServiceId, selectedStatus, startDateFilter, endDateFilter, hasStartDateFilter, hasEndDateFilter]);

  // Fetch data when switching between customer and order view modes
  useEffect(() => {
    const viewModeChanged = previousViewModeRef.current !== viewMode;

    // Skip initial mount call (parent already fetches without filter)
    if (isInitialMountRef.current) {
      previousViewModeRef.current = viewMode;
      return;
    }

    // When switching to customer view, reload API without order filters or status filter
    if (viewMode === 'customer' && viewModeChanged) {
      if (fetchCustomers) {
        const apiBookingType = toApiBookingType(selectedLocation);
        fetchCustomers(null, appliedSearchQuery, null, selectedServiceId, apiBookingType, '', startDateFilter, endDateFilter);
      }
    }
    // When switching to order view, always default to Present tab and fetch its data (no status filter here)
    else if (viewMode === 'order' && viewModeChanged) {
      if (fetchCustomers) {
        const defaultTab = 'present';
        setActiveOrdersTab(defaultTab);
        const apiBookingType = toApiBookingType(selectedLocation);
        fetchCustomers(null, appliedSearchQuery, defaultTab, selectedServiceId, apiBookingType, selectedStatus, startDateFilter, endDateFilter);
      }
    }

    previousViewModeRef.current = viewMode;
  }, [viewMode, fetchCustomers, appliedSearchQuery, activeOrdersTab, selectedServiceId, selectedLocation, selectedStatus, startDateFilter, endDateFilter]);

  // Set initial mount flag to false after first render
  useEffect(() => {
    isInitialMountRef.current = false;
  }, []);

  // Fetch data when booking type filter changes
  useEffect(() => {
    // Skip initial mount call (parent already fetches without filter)
    if (isInitialMountRef.current) {
      return;
    }

    if (fetchCustomers) {
      const orderFilter = viewMode === 'order' ? activeOrdersTab : null;
      // Map UI booking type to API booking type
      // API endpoints: /booking/bookings/?booking_type=OPD, /booking/bookings/?booking_type=IN_HOUSE, /booking/bookings/?booking_type=CLIENT_SIDE
      const apiBookingType = toApiBookingType(selectedLocation);
      const statusFilter = selectedStatus;
      fetchCustomers(null, appliedSearchQuery, orderFilter, selectedServiceId, apiBookingType, statusFilter, startDateFilter, endDateFilter);
    }
  }, [selectedLocation, selectedStatus, fetchCustomers, appliedSearchQuery, viewMode, activeOrdersTab, selectedServiceId, startDateFilter, endDateFilter]);

  // Fetch all services for toolbar filter (no service_type)
  useEffect(() => {
    const fetchAvailableServices = async () => {
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        console.error('Authorization token missing');
        setAvailableServices([]);
        setIsLoadingAvailableServices(false);
        return;
      }

      setIsLoadingAvailableServices(true);
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_BASEURL_CARE}/management/services/service_dropdown/`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            }
          }
        );

        // Handle response - API returns direct array of services with venue list
        const servicesData = Array.isArray(response.data) ? response.data : [];
        setAvailableServices(servicesData);
      } catch (error) {
        console.error('Error fetching available services:', error);
        setAvailableServices([]);
      } finally {
        setIsLoadingAvailableServices(false);
      }
    };

    fetchAvailableServices();
  }, []);

  const normalizeServiceTypeParam = (bookingType) => {
    const t = String(bookingType || '')
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    if (t === 'CLIENT' || t === 'CLIENT_SIDE') return 'CLIENT_SIDE';
    if (t === 'IN_HOUSE') return 'IN_HOUSE';
    if (t === 'OPD') return 'OPD';
    return null;
  };

  // Add-service dropdown: always GET /management/services/service_dropdown/?service_type=OPD
  const fetchAddServiceDropdown = async (bookingId) => {
    if (!bookingId) return;
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setAddServiceDropdownByBookingId((prev) => ({ ...prev, [bookingId]: [] }));
      return;
    }

    const serviceType = 'OPD';
    const cached = serviceDropdownByTypeCacheRef.current[serviceType];
    if (cached) {
      setAddServiceDropdownByBookingId((prev) => ({ ...prev, [bookingId]: cached }));
      return;
    }

    setLoadingAddServiceDropdown((prev) => ({ ...prev, [bookingId]: true }));
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_BASEURL_CARE}/management/services/service_dropdown/`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { service_type: serviceType },
        }
      );
      const raw = Array.isArray(response.data) ? response.data : [];
      const servicesData = raw.map((s) => ({
        ...s,
        service_type: s.service_type || serviceType,
      }));
      serviceDropdownByTypeCacheRef.current[serviceType] = servicesData;
      setAddServiceDropdownByBookingId((prev) => ({ ...prev, [bookingId]: servicesData }));
    } catch (error) {
      console.error('Error fetching add-service dropdown:', error);
      setAddServiceDropdownByBookingId((prev) => ({ ...prev, [bookingId]: [] }));
    } finally {
      setLoadingAddServiceDropdown((prev) => {
        const next = { ...prev };
        delete next[bookingId];
        return next;
      });
    }
  };

  const getAddServiceOptions = (bookingId) =>
    addServiceDropdownByBookingId[bookingId] || [];

  const findAddServiceOption = (bookingId, serviceId) => {
    const fromBooking = getAddServiceOptions(bookingId).find(
      (s) => String(s.id) === String(serviceId)
    );
    if (fromBooking) return fromBooking;
    return availableServices.find((s) => String(s.id) === String(serviceId)) || null;
  };

  // Enrich service names in bookingServices when availableServices loads
  // This is mainly for backward compatibility - new API includes service_name in children
  useEffect(() => {
    if (availableServices.length > 0 && Object.keys(bookingServices).length > 0) {
      setBookingServices(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(patientId => {
          updated[patientId] = updated[patientId].map(service => {
            // Only enrich if service_name is missing or empty (fallback for legacy data)
            if ((!service.service_name || service.service_name === '') && service.service_id) {
              const foundService = availableServices.find(s => s.id === service.service_id);
              if (foundService && foundService.name) {
                return { ...service, service_name: foundService.name };
              }
            }
            return service;
          });
        });
        return updated;
      });
    }
  }, [availableServices]);

  // Load line items: list API may omit secondary_orders (create response includes them). Fetch booking detail on expand when needed.
  const fetchBookingServices = async (bookingId, forceRefresh = false, url = null) => {
    const customer = customers.find((c) => String(c.id || c.bookingId) === String(bookingId));
    const listSecondaries = customer?.secondary_orders || [];

    if (!forceRefresh) {
      if (bookingServices[bookingId]?.length > 0) return;
      if (listSecondaries.length > 0) return;
      if (detailSecondaryOrdersByBookingId[bookingId] !== undefined) return;
    }

    setLoadingServices((prev) => ({ ...prev, [bookingId]: true }));
    try {
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        setDetailSecondaryOrdersByBookingId((prev) => ({ ...prev, [bookingId]: [] }));
        setBookingServices((prev) => ({ ...prev, [bookingId]: [] }));
        return;
      }
      const root = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '');
      const { data: booking } = await axios.get(`${root}/booking/bookings/${bookingId}/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const secondaries = booking.secondary_orders || [];
      setDetailSecondaryOrdersByBookingId((prev) => ({ ...prev, [bookingId]: secondaries }));
      if (booking && typeof booking.auto_continue === 'boolean') {
        setCustomers((prev) =>
          prev.map((c) =>
            String(c.id || c.bookingId) === String(bookingId)
              ? { ...c, continueBooking: Boolean(booking.auto_continue) }
              : c
          )
        );
      }

      const nested = secondaries.some((so) => (so.ternary_orders || []).length > 0);
      const mapServiceRow = (service) => ({
        id: service.id,
        order_id: service.order_id || '',
        service_name: service.service_name || '',
        start_datetime: service.start_datetime,
        end_datetime: service.end_datetime,
        service_total_price: service.subtotal || service.service_total_price,
        status: service.status,
        invoice_number: service.invoice_number,
        service_id: service.service || service.service_id,
        package_name: service.package_name || service.service_package_name || '',
        location_locality: resolveOrderLocationText(service, customer?.locationLocality || ''),
        client_address: service.client_address || '',
        venue_name: service.venue_name || '',
        service_package_name: service.service_package_name,
        booking_type: service.booking_type,
        booking_entity: service.booking_entity,
        created_at: service.created_at || null,
        updated_at: service.updated_at || null,
        modified_at: service.modified_at || null,
      });

      if (nested) {
        const flat = secondaries.flatMap((so) => so.ternary_orders || []);
        setBookingServices((prev) => ({
          ...prev,
          [bookingId]: flat.map(mapServiceRow),
        }));
      } else {
        setBookingServices((prev) => ({ ...prev, [bookingId]: [] }));
      }

      const tertiaryCount = nested
        ? secondaries.reduce((acc, so) => acc + (so.ternary_orders || []).length, 0)
        : 0;
      setServicePagination((prev) => ({
        ...prev,
        [bookingId]: {
          count: tertiaryCount || secondaries.length,
          next: null,
          previous: null,
          current_page: 1,
          total_pages: 1,
        },
      }));
    } catch (e) {
      console.error('Error loading booking detail:', e);
      setDetailSecondaryOrdersByBookingId((prev) => ({ ...prev, [bookingId]: [] }));
      setBookingServices((prev) => ({ ...prev, [bookingId]: [] }));
    } finally {
      setLoadingServices((prev) => ({ ...prev, [bookingId]: false }));
    }
  };

  const toggleRow = async (customerId, patientId) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(customerId)) {
        newSet.delete(customerId);
      } else {
        newSet.add(customerId);
        // Fetch services when expanding - use bookingId (customerId) for fetching services
        if (customerId) {
          fetchBookingServices(customerId);
          fetchAddServiceDropdown(customerId);
        }
      }
      return newSet;
    });
  };

  const calculateServiceEndDate = (registrationDate, duration) => {
    if (!registrationDate) return null;
    try {
      const startDate = new Date(registrationDate);
      if (isNaN(startDate.getTime())) return null;
      
      if (duration) {
        // Parse duration (e.g., "30 days", "3 months", "1 year")
        const durationLower = duration.toLowerCase();
        const daysMatch = durationLower.match(/(\d+)\s*days?/);
        const monthsMatch = durationLower.match(/(\d+)\s*months?/);
        const yearsMatch = durationLower.match(/(\d+)\s*years?/);
        
        if (daysMatch) {
          startDate.setDate(startDate.getDate() + parseInt(daysMatch[1]));
        } else if (monthsMatch) {
          startDate.setMonth(startDate.getMonth() + parseInt(monthsMatch[1]));
        } else if (yearsMatch) {
          startDate.setFullYear(startDate.getFullYear() + parseInt(yearsMatch[1]));
        }
      }
      
      return startDate.toLocaleDateString('en-IN', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch (error) {
      return null;
    }
  };

  const calculateLastDayFromSelectedDates = (selectedDates) => {
    if (!selectedDates || !Array.isArray(selectedDates) || selectedDates.length === 0) {
      return null;
    }
    
    try {
      // Handle different date formats
      const dates = selectedDates.map(dateStr => {
        // If it's already a Date object string or ISO string
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date;
        }
        return null;
      }).filter(date => date !== null);
      
      if (dates.length === 0) return null;
      
      // Find the maximum (latest) date
      const lastDate = new Date(Math.max(...dates.map(d => d.getTime())));
      
      return lastDate.toLocaleDateString('en-IN', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch (error) {
      return null;
    }
  };

  const calculateFirstDayFromSelectedDates = (selectedDates) => {
    if (!selectedDates || !Array.isArray(selectedDates) || selectedDates.length === 0) {
      return null;
    }
    
    try {
      // Handle different date formats
      const dates = selectedDates.map(dateStr => {
        // If it's already a Date object string or ISO string
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date;
        }
        return null;
      }).filter(date => date !== null);
      
      if (dates.length === 0) return null;
      
      // Find the minimum (earliest) date
      const firstDate = new Date(Math.min(...dates.map(d => d.getTime())));
      
      return firstDate.toLocaleDateString('en-IN', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch (error) {
      return null;
    }
  };

  const handleServiceSelect = (serviceName, serviceId) => {
    // Toggle: if same service is clicked, deselect it; otherwise select the new one
    if (selectedService === serviceName) {
      setSelectedService(null);
      setSelectedServiceId(null);
      // Fetch all data when filter is cleared
      if (fetchCustomers) {
        const orderFilter = viewMode === 'order' ? activeOrdersTab : null;
        const apiBookingType = toApiBookingType(selectedLocation);
        const statusFilter = selectedStatus;
        fetchCustomers(null, appliedSearchQuery, orderFilter, null, apiBookingType, statusFilter, startDateFilter, endDateFilter);
      }
    } else {
      setSelectedService(serviceName);
      setSelectedServiceId(serviceId);
      // Fetch data filtered by service ID
      if (fetchCustomers) {
        const orderFilter = viewMode === 'order' ? activeOrdersTab : null;
        const apiBookingType = toApiBookingType(selectedLocation);
        const statusFilter = selectedStatus;
        fetchCustomers(null, appliedSearchQuery, orderFilter, serviceId, apiBookingType, statusFilter, startDateFilter, endDateFilter);
      }
    }
    // Close dropdown after selection
    setIsServiceDropdownOpen(false);
  };

  // Check if service type is monthly package
  const isMonthlyPackage = (serviceType) => {
    return serviceType && serviceType.toLowerCase().includes('monthly');
  };

  // Check if service type is hourly package
  const isHourlyPackage = (serviceType) => {
    return serviceType && serviceType.toLowerCase().includes('hourly');
  };

  const CLIENT_LOCATION_OPTION = '__client_location__';

  const getServiceVenues = (service) => {
    const venues = service?.venue || service?.venues || [];
    return Array.isArray(venues) ? venues : [];
  };

  const isClientLocationSelection = (form) =>
    String(form?.selectedVenueId || '') === CLIENT_LOCATION_OPTION;

  const handleServiceInputChange = async (customerId, field, value) => {
    const todayStr = localTodayYmd();
    if (field === 'startDate' && value) {
      if (value < todayStr) {
        showAlert('Cannot select previous dates. Please choose today or a future date.', 'warning');
        return;
      }
    }
    if (field === 'endDate' && value) {
      const start = serviceForms[customerId]?.startDate || serviceForms[customerId]?.serviceDate || todayStr;
      if (value < start) {
        showAlert('End date cannot be before start date. Please choose start date or later.', 'warning');
        return;
      }
      if (value < todayStr) {
        showAlert('Cannot select previous dates. Please choose today or a future date.', 'warning');
        return;
      }
    }
    if (field === 'startTime' && value) {
      const startDate = serviceForms[customerId]?.startDate || serviceForms[customerId]?.serviceDate || '';
      if (startDate === todayStr) {
        const now = new Date();
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (value < currentTimeStr) {
          showAlert('Cannot select past time when start date is today. Please choose current time or later.', 'warning');
          return;
        }
      }
    }
    if (field === 'endTime' && value) {
      const startDate = serviceForms[customerId]?.startDate || serviceForms[customerId]?.serviceDate || '';
      const endDate = serviceForms[customerId]?.endDate || '';
      const startTime = serviceForms[customerId]?.startTime || serviceForms[customerId]?.serviceTime || '';
      if (endDate === todayStr) {
        const now = new Date();
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (value < currentTimeStr) {
          showAlert('Cannot select past time when end date is today. Please choose current time or later.', 'warning');
          return;
        }
      }
      if (startDate && endDate && startDate === endDate && startTime && value <= startTime) {
        showAlert('End time must be after start time.', 'warning');
        return;
      }
    }

    // Validate discount/premium to prevent negative final price
    if (field === 'discount' || field === 'premium') {
      const packages = servicePackages[customerId] || [];
      const selectedPackageId = field === 'discount' 
        ? (serviceForms[customerId]?.selectedPackageId || (packages.length === 1 ? packages[0]?.id : null))
        : (serviceForms[customerId]?.selectedPackageId || (packages.length === 1 ? packages[0]?.id : null));
      
      if (selectedPackageId) {
        const pkg = packages.find(p => p.id === selectedPackageId) || packages[0];
        const basePrice = parseFloat(pkg?.price || 0);
        const currentDiscount = field === 'discount' ? parseFloat(value || 0) : parseFloat(serviceForms[customerId]?.discount || 0);
        const currentPremium = field === 'premium' ? parseFloat(value || 0) : parseFloat(serviceForms[customerId]?.premium || 0);
        const finalPrice = basePrice - currentDiscount + currentPremium;
        
        // Prevent negative final price
        if (finalPrice < 0) {
          if (field === 'discount') {
            // Limit discount to basePrice + premium
            value = (basePrice + currentPremium).toString();
          } else {
            // This shouldn't happen for premium, but just in case
            value = Math.max(0, currentDiscount - basePrice).toString();
          }
        }
      }
    }
    
    // Keep one state update per field so related clears never drop the field value.
    setServiceForms((prev) => {
      const current = prev[customerId] || {};
      const next = { ...current, [field]: value };

      if (field === 'serviceType') {
        next.selectedPackageId = '';
        next.selectedVenueId = '';
        next.clientAddress = '';
        next.discount = '';
        next.premium = '';
        next.startDate = '';
        next.endDate = '';
        next.serviceDate = '';
      } else if (field === 'selectedVenueId') {
        next.clientAddress =
          value === CLIENT_LOCATION_OPTION ? current.clientAddress || '' : '';
      } else if (field === 'selectedPackageId') {
        next.startDate = '';
        next.endDate = '';
        next.serviceDate = '';
      } else if (field === 'startDate') {
        next.serviceDate = value || '';
        if (value && !next.endDate) {
          next.endDate = value;
        } else if (next.endDate && value && next.endDate < value) {
          next.endDate = value;
        }
      }

      return { ...prev, [customerId]: next };
    });

    if (field === 'serviceType' && value) {
      await fetchServicePackages(customerId, value);
      const selectedSvc = findAddServiceOption(customerId, value);
      const booking = customers.find((c) => String(c.id) === String(customerId));
      const venues = getServiceVenues(selectedSvc);
      const defaultVenueId = venues.length === 0 ? CLIENT_LOCATION_OPTION : '';
      const defaultClientLocation =
        defaultVenueId === CLIENT_LOCATION_OPTION
          ? (booking?.clientAddress ||
              booking?.locationLocality ||
              serviceForms[customerId]?.clientAddress ||
              '')
          : '';
      // Only set venue defaults here — do not wipe selectedPackageId (auto-selected in fetch).
      setServiceForms((prev) => ({
        ...prev,
        [customerId]: {
          ...(prev[customerId] || {}),
          selectedVenueId: defaultVenueId || prev[customerId]?.selectedVenueId || '',
          clientAddress:
            defaultVenueId === CLIENT_LOCATION_OPTION
              ? defaultClientLocation
              : prev[customerId]?.clientAddress || '',
        },
      }));
    } else if (field === 'serviceType' && !value) {
      setServicePackages((prev) => {
        const updated = { ...prev };
        delete updated[customerId];
        return updated;
      });
    }
  };

  const handleAddServiceDateRangeChange = useCallback((customerId, { startDate, endDate }) => {
    setServiceForms((prev) => ({
      ...prev,
      [customerId]: {
        ...(prev[customerId] || {}),
        startDate: startDate || '',
        endDate: endDate || '',
        serviceDate: startDate || '',
      },
    }));
  }, []);

  // Fetch packages for selected service
  const fetchServicePackages = async (customerId, serviceId) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      console.error('Authorization token missing');
      return;
    }

    setIsLoadingServicePackages(prev => ({ ...prev, [customerId]: true }));

    try {
      const response = await axios.get(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/packages/by_belongs_to/`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            entity: 'service',
            id: serviceId
          }
        }
      );

      // Handle response - API returns direct array
      const packagesData = Array.isArray(response.data) ? response.data : [];
      setServicePackages(prev => ({
        ...prev,
        [customerId]: packagesData
      }));

      // Auto-select if only one package is available
      if (packagesData.length === 1) {
        setServiceForms(prev => ({
          ...prev,
          [customerId]: {
            ...(prev[customerId] || {}),
            selectedPackageId: packagesData[0].id
          }
        }));
      }
    } catch (error) {
      console.error('Error fetching service packages:', error);
      setServicePackages(prev => ({
        ...prev,
        [customerId]: []
      }));
    } finally {
      setIsLoadingServicePackages(prev => ({ ...prev, [customerId]: false }));
    }
  };

  const handleAddService = async (bookingId, patientId) => {
    const form = serviceForms[bookingId] || {};
    
    // Validation
    if (!form.serviceType) {
      showAlert('Please select a service type', 'warning');
      return;
    }

    const selectedServiceObj = form.serviceType
      ? findAddServiceOption(bookingId, form.serviceType)
      : null;
    const candidateVenues = getServiceVenues(selectedServiceObj);
    const usingClientLocation = isClientLocationSelection(form);
    const clientLocationText = String(form.clientAddress || '').trim();

    if (usingClientLocation) {
      if (!clientLocationText) {
        showAlert('Please enter the client location for this service', 'warning');
        return;
      }
    } else if (!form.selectedVenueId) {
      showAlert(
        candidateVenues.length > 0
          ? 'Please select a location for this service'
          : 'Please select Client location and enter the address',
        'warning'
      );
      return;
    }

    // Get packages and determine service_package_id
    const packages = servicePackages[bookingId] || [];
    let servicePackageId = null;
    
    if (packages.length === 0) {
      showAlert('No packages available for this service', 'warning');
      return;
    }
    
    if (packages.length === 1) {
      // Auto-select if only one package
      servicePackageId = packages[0].id;
    } else if (packages.length > 1) {
      // Require selection if multiple packages
      if (!form.selectedPackageId) {
        showAlert('Please select a package', 'warning');
        return;
      }
      servicePackageId = form.selectedPackageId;
    }

    const startDate = form.startDate || form.serviceDate || '';
    const startTime = form.startTime || form.serviceTime || '00:00';
    const endDate = form.endDate || '';
    const endTime = form.endTime || '23:59';

    if (!startDate) {
      showAlert('Please fill in the start date', 'warning');
      return;
    }

    if (!endDate) {
      showAlert('Please fill in the end date', 'warning');
      return;
    }

    const todayStr = localTodayYmd();
    if (startDate < todayStr) {
      showAlert('Cannot select previous dates. Please choose today or a future date for start date.', 'warning');
      return;
    }
    if (endDate < todayStr) {
      showAlert('Cannot select previous dates. Please choose today or a future date for end date.', 'warning');
      return;
    }
    if (endDate < startDate) {
      showAlert('End date cannot be before start date. Please choose a valid end date.', 'warning');
      return;
    }
    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (startDate === todayStr && startTime < currentTimeStr) {
      showAlert('Cannot select past time when start date is today. Please choose current time or later.', 'warning');
      return;
    }
    if (endDate === todayStr && endTime < currentTimeStr) {
      showAlert('Cannot select past time when end date is today. Please choose current time or later.', 'warning');
      return;
    }
    if (startDate === endDate && endTime <= startTime) {
      showAlert('End time must be after start time.', 'warning');
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    // Set loading state
    setIsAddingService(prev => ({ ...prev, [bookingId]: true }));

    try {
      // Build ISO datetimes (Z/UTC) for API: "2026-03-04T11:00:00Z"
      const toApiDatetime = (dateStr, timeStr) =>
        new Date(`${dateStr}T${timeStr}:00+05:30`).toISOString().replace(/\.\d{3}Z$/, 'Z');

      const payload = {
        service: parseInt(form.serviceType, 10),
        package: parseInt(servicePackageId, 10),
        start_datetime: toApiDatetime(startDate, startTime),
        end_datetime: toApiDatetime(endDate, endTime),
        discount_amount: (form.discount != null && form.discount !== '') ? String(parseFloat(form.discount).toFixed(2)) : '0.00',
        premium_amount: (form.premium != null && form.premium !== '') ? String(parseFloat(form.premium).toFixed(2)) : '0.00',
      };

      if (usingClientLocation) {
        payload.client_address = clientLocationText;
      } else if (form.selectedVenueId) {
        payload.venue = parseInt(form.selectedVenueId, 10);
      }

      await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/bookings/${bookingId}/add_service/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      showAlert('Service added successfully!', 'success');
      
      // Clear form
      setServiceForms(prev => ({
        ...prev,
        [bookingId]: { 
          serviceType: '', 
          serviceDate: '', 
          startDate: '', 
          endDate: '', 
          serviceTime: '',
          startTime: '',
          endTime: '',
          selectedPackageId: '',
          selectedVenueId: '',
          clientAddress: '',
          discount: '',
          premium: ''
        }
      }));
      
      // Clear packages
      setServicePackages(prev => {
        const updated = { ...prev };
        delete updated[bookingId];
        return updated;
      });

      // Refresh bookings list to get updated services
      if (fetchCustomers) {
        const orderFilter = viewMode === 'order' ? activeOrdersTab : null;
        const apiBookingType = toApiBookingType(selectedLocation);
        await fetchCustomers(null, appliedSearchQuery, orderFilter, selectedServiceId, apiBookingType, selectedStatus, startDateFilter, endDateFilter);
      }
    } catch (error) {
      console.error('Error adding service:', error);
      showAlert(getResponseErrorMessage(error, 'Failed to add service. Please try again.'), 'error');
    } finally {
      // Clear loading state
      setIsAddingService(prev => {
        const updated = { ...prev };
        delete updated[bookingId];
        return updated;
      });
    }
  };

  // Cancellation reasons
  const cancellationReasons = [
    'Customer Request',
    'Service Not Available',
    'Payment Issue',
    'Schedule Conflict',
    'Medical Emergency',
    'Death',
    'Other'
  ];

  // Mock function - API integration removed
  const handleCancelBooking = async () => {
    if (!selectedBookingForCancel) return;
    
    if (!cancelReason) {
      showAlert('Please select a cancellation reason', 'warning');
      return;
    }

    if (cancelReason === 'Other' && !customCancelReason.trim()) {
      showAlert('Please specify the cancellation reason', 'warning');
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setIsCancelling(true);

    try {
      // Use custom reason if "Other" is selected, otherwise use selected reason
      const reasonToSend = cancelReason === 'Other' ? customCancelReason : cancelReason;
      
      const bookingId = selectedBookingForCancel.bookingId || selectedBookingForCancel.id;
      
      const response = await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/bookings/${bookingId}/cancel_venue/`,
        {
          reason: reasonToSend
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      showAlert('Booking cancelled successfully!', 'success');
      setShowCancelModal(false);
      setSelectedBookingForCancel(null);
      setCancelReason('');
      setCustomCancelReason('');
      
      // Refresh bookings list
      if (fetchCustomers) {
        const orderFilter = viewMode === 'order' ? activeOrdersTab : null;
        const apiBookingType = toApiBookingType(selectedLocation);
        await fetchCustomers(null, appliedSearchQuery, orderFilter, selectedServiceId, apiBookingType, selectedStatus, startDateFilter, endDateFilter);
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      showAlert(getResponseErrorMessage(error, 'Failed to cancel booking. Please try again.'), 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  // Open edit service modal and pre-fill start/end dates, status, etc.
  // service = secondary/ternary row; packages API needs management service id (booking.service), not secondary order id
  const openEditService = (service, bookingId) => {
    const startDt = service.start_datetime ? new Date(service.start_datetime) : null;
    const endDt = service.end_datetime ? new Date(service.end_datetime) : null;
    const toDateStr = (d) => d ? d.toISOString().slice(0, 10) : '';
    const toTimeStr = (d) => {
      if (!d) return '00:00';
      const h = d.getHours();
      const m = d.getMinutes();
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    const booking = customers.find((c) => String(c.id) === String(bookingId));
    const rowServiceId = service.service_id ?? service.service ?? null;
    // Never use secondary/ternary order id as service id for by_belongs_to
    const serviceIdFromApi = rowServiceId ?? booking?.serviceId ?? null;
    // status from booking/bookings API response under children
    const initialStatus = service.status || 'BOOKED';
    setEditingService({
      serviceId: serviceIdFromApi,
      childBookingId: service.id,
      bookingId,
      serviceName: service.service_name || 'Service',
      start_datetime: service.start_datetime,
      end_datetime: service.end_datetime,
      status: initialStatus,
    });
    const initialForm = {
      startDate: toDateStr(startDt),
      startTime: toTimeStr(startDt),
      endDate: toDateStr(endDt),
      endTime: toTimeStr(endDt),
      packageId: '',
      discount: '',
      premium: '',
      status: initialStatus,
    };
    setEditServiceForm(initialForm);
    initialEditServiceFormRef.current = {
      startDate: initialForm.startDate,
      startTime: initialForm.startTime,
      endDate: initialForm.endDate,
      endTime: initialForm.endTime,
      packageId: initialForm.packageId,
    };
  };

  const closeEditService = () => {
    setEditingService(null);
    setEditServiceForm({ startDate: '', startTime: '00:00', endDate: '', endTime: '23:59', packageId: '', discount: '', premium: '', status: '' });
    initialEditServiceFormRef.current = null;
    setEditServicePackages([]);
  };

  // When only status is changed (date, package, time unchanged) — e.g. for future status-only API
  const handleUpdateServiceStatusOnly = (status, editingServiceContext) => {
    // Status-only update (e.g. for future API)
  };

  // Toggle booking auto_continue via PATCH /booking/bookings/{id}/
  const handleToggleAutoRenew = useCallback(async (bookingId, currentlyOn) => {
    const id = bookingId;
    if (id == null || id === '') {
      showAlert('Booking ID missing. Cannot update auto-renew.', 'error');
      return;
    }
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }

    const nextValue = !currentlyOn;
    setTogglingAutoRenewId(String(id));
    try {
      const { data } = await axios.patch(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/bookings/${id}/`,
        { auto_continue: nextValue },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const resolved =
        typeof data?.auto_continue === 'boolean' ? Boolean(data.auto_continue) : nextValue;
      if (typeof setCustomers === 'function') {
        setCustomers((prev) =>
          (Array.isArray(prev) ? prev : []).map((c) =>
            String(c.id || c.bookingId) === String(id)
              ? { ...c, continueBooking: resolved }
              : c
          )
        );
      }
      showAlert(
        resolved ? 'Auto-renew turned On.' : 'Auto-renew turned Off.',
        'success'
      );
    } catch (error) {
      console.error('Error updating auto-renew:', error);
      showAlert(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          error?.message ||
          'Failed to update auto-renew. Please try again.',
        'error'
      );
    } finally {
      setTogglingAutoRenewId(null);
    }
  }, [setCustomers, showAlert]);

  // Change primary booking status via API: PATCH /booking/bookings/{id}/change_status/ body: { status }
  const handleChangeOrderStatus = useCallback(async (bookingId, newStatus) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }
    const statusKey = `order-${bookingId}`;
    setIsChangingStatus(prev => ({ ...prev, [statusKey]: true }));
    try {
      await axios.patch(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/bookings/${bookingId}/change_status/`,
        { status: newStatus },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      showAlert(`Order status updated to ${newStatus.replace(/_/g, ' ')} successfully!`, 'success');
      setOpenStatusDropdown(null);
      // Refresh bookings/services
      if (fetchCustomers) {
        const orderFilter = viewMode === 'order' ? activeOrdersTab : null;
        const apiBookingType = toApiBookingType(selectedLocation);
        await fetchCustomers(null, appliedSearchQuery, orderFilter, selectedServiceId, apiBookingType, selectedStatus, startDateFilter, endDateFilter);
      }
    } catch (error) {
      console.error('Error changing order status:', error);
      showAlert(getResponseErrorMessage(error, 'Failed to update status.'), 'error');
    } finally {
      setIsChangingStatus(prev => {
        const updated = { ...prev };
        delete updated[statusKey];
        return updated;
      });
    }
  }, [fetchCustomers, viewMode, activeOrdersTab, selectedLocation, appliedSearchQuery, selectedServiceId, showAlert]);

  // Change service status via API
  const handleChangeServiceStatus = useCallback(async (bookingId, serviceBookingId, newStatus) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }
    setIsChangingStatus(prev => ({ ...prev, [serviceBookingId]: true }));
    try {
      await axios.patch(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/bookings/${bookingId}/change_status/`,
        {
          ternary_order_id: serviceBookingId,
          status: newStatus,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      showAlert(`Status updated to ${newStatus.replace(/_/g, ' ')} successfully!`, 'success');
      setOpenStatusDropdown(null);
      // Refresh bookings/services
      if (fetchCustomers) {
        const orderFilter = viewMode === 'order' ? activeOrdersTab : null;
        const apiBookingType = toApiBookingType(selectedLocation);
        await fetchCustomers(null, appliedSearchQuery, orderFilter, selectedServiceId, apiBookingType, selectedStatus, startDateFilter, endDateFilter);
      }
    } catch (error) {
      console.error('Error changing service status:', error);
      showAlert(getResponseErrorMessage(error, 'Failed to update status.'), 'error');
    } finally {
      setIsChangingStatus(prev => {
        const updated = { ...prev };
        delete updated[serviceBookingId];
        return updated;
      });
    }
  }, [fetchCustomers, viewMode, activeOrdersTab, selectedLocation, appliedSearchQuery, selectedServiceId, showAlert]);

  // Change secondary (period-level) order status via API
  const handleChangeSecondaryStatus = useCallback(async (bookingId, secondaryOrderId, newStatus) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }
    const statusKey = `secondary-${bookingId}-${secondaryOrderId}`;
    setIsChangingStatus(prev => ({ ...prev, [statusKey]: true }));
    try {
      await axios.patch(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/bookings/${bookingId}/change_status/`,
        {
          secondary_order_id: secondaryOrderId,
          status: newStatus,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      showAlert(`Secondary order status updated to ${newStatus.replace(/_/g, ' ')} successfully!`, 'success');
      setOpenStatusDropdown(null);
      if (fetchCustomers) {
        const orderFilter = viewMode === 'order' ? activeOrdersTab : null;
        const apiBookingType = toApiBookingType(selectedLocation);
        await fetchCustomers(null, appliedSearchQuery, orderFilter, selectedServiceId, apiBookingType, selectedStatus, startDateFilter, endDateFilter);
      }
    } catch (error) {
      console.error('Error changing secondary order status:', error);
      showAlert(getResponseErrorMessage(error, 'Failed to update status.'), 'error');
    } finally {
      setIsChangingStatus(prev => {
        const updated = { ...prev };
        delete updated[statusKey];
        return updated;
      });
    }
  }, [fetchCustomers, viewMode, activeOrdersTab, selectedLocation, appliedSearchQuery, selectedServiceId, showAlert]);

  // Fetch packages for the service when Edit modal opens (by_belongs_to?entity=service&id=serviceId)
  useEffect(() => {
    if (!editingService || editingService.serviceId == null) {
      setEditServicePackages([]);
      return;
    }
    const fetchEditServicePackages = async () => {
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) return;
      setIsLoadingEditServicePackages(true);
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_BASEURL_CARE}/booking/packages/by_belongs_to/`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { entity: 'service', id: editingService.serviceId },
          }
        );
        const packagesData = Array.isArray(response.data) ? response.data : [];
        setEditServicePackages(packagesData);
      } catch (error) {
        console.error('Error fetching packages for edit service:', error);
        setEditServicePackages([]);
      } finally {
        setIsLoadingEditServicePackages(false);
      }
    };
    fetchEditServicePackages();
  }, [editingService?.serviceId]);

  const handleEditServiceFormChange = (field, value) => {
    if (field === 'endDate' && value) {
      setEditServiceForm(prev => {
        const start = prev.startDate || '';
        if (start && value < start) {
          showAlert('End date cannot be before start date. Please choose start date or later.', 'warning');
          return prev;
        }
        return { ...prev, [field]: value };
      });
      return;
    }
    if (field === 'endTime' && value) {
      const startDate = editServiceForm.startDate || '';
      const endDate = editServiceForm.endDate || '';
      const startTime = editServiceForm.startTime || '';
      if (startDate && endDate && startDate === endDate && startTime && value <= startTime) {
        showAlert('End time must be after start time.', 'warning');
        return;
      }
    }
    setEditServiceForm(prev => ({ ...prev, [field]: value }));
  };

  const handleUpdateServiceDates = async () => {
    if (!editingService) return;
    const { serviceId, bookingId, childBookingId } = editingService;
    const { startDate, startTime, endDate, endTime, packageId, discount, premium, status } = editServiceForm;
    if (!startDate || !endDate) {
      showAlert('Please fill in both start and end date.', 'warning');
      return;
    }
    if (endDate < startDate) {
      showAlert('End date cannot be before start date. Please choose a valid end date.', 'warning');
      return;
    }
    if (startDate === endDate && endTime <= startTime) {
      showAlert('End time must be after start time.', 'warning');
      return;
    }

    const initial = initialEditServiceFormRef.current;
    const dateTimeUnchanged = initial &&
      initial.startDate === startDate &&
      initial.startTime === startTime &&
      initial.endDate === endDate &&
      initial.endTime === endTime &&
      (initial.packageId || '') === (packageId || '');

    if (dateTimeUnchanged) {
      // Only status (and possibly discount/premium) changed — use status-only flow
      handleUpdateServiceStatusOnly(status, editingService);
      closeEditService();
      return;
    }

    // Package or start/end date or time changed — call reschedule_service API
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      showAlert('Authorization token missing. Please log in again.', 'error');
      return;
    }
    const toApiDatetime = (d, t) => new Date(`${d}T${t}:00+05:30`).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const payload = {
      ternary_order_id: childBookingId,
      start_datetime: toApiDatetime(startDate, startTime),
      end_datetime: toApiDatetime(endDate, endTime),
      package: packageId ? parseInt(packageId, 10) : null,
      discount_amount: (discount != null && discount !== '') ? parseFloat(discount) : 0,
      premium_amount: (premium != null && premium !== '') ? parseFloat(premium) : 0,
    };
    setIsUpdatingService(true);
    try {
      await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/bookings/${bookingId}/reschedule_service/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      showAlert('Service updated successfully!', 'success');
      closeEditService();
      if (fetchCustomers) {
        const orderFilter = viewMode === 'order' ? activeOrdersTab : null;
        const apiBookingType = toApiBookingType(selectedLocation);
        await fetchCustomers(null, appliedSearchQuery, orderFilter, selectedServiceId, apiBookingType, selectedStatus, startDateFilter, endDateFilter);
      }
      if (bookingId && fetchBookingServices) {
        fetchBookingServices(bookingId, false);
      }
    } catch (error) {
      console.error('Error updating service dates:', error);
      showAlert(getResponseErrorMessage(error, 'Failed to update service.'), 'error');
    } finally {
      setIsUpdatingService(false);
    }
  };

  // Column chooser handlers
  const handleDragStart = (e, index) => {
    setDraggedColumn(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedColumn === null || draggedColumn === index) return;

    const visibleColIds = visibleColumns.map(col => col.id);
    const draggedColId = visibleColIds[draggedColumn];
    const targetColId = visibleColIds[index];

    const newOrder = [...columnOrder];
    const draggedIndex = newOrder.indexOf(draggedColId);
    const targetIndex = newOrder.indexOf(targetColId);

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedColId);

    setColumnOrder(newOrder);
    setDraggedColumn(index);
  };

  const handleDragEnd = () => {
    setDraggedColumn(null);
  };

  const toggleColumnVisibility = (columnId) => {
    setColumnVisibility(prev => ({
      ...prev,
      [columnId]: !prev[columnId]
    }));
  };

  const filteredColumns = useMemo(() => {
    return allColumns.filter(col =>
      col.label.toLowerCase().includes(columnSearchTerm.toLowerCase())
    );
  }, [allColumns, columnSearchTerm]);

  // Helper function to get booking type from customer
  const getCustomerBookingType = (customer) => {
    return customer.bookingType || null;
  };

  // Check if any filter is active
  const locationTypeFilterLabel = useMemo(
    () =>
      BOOKING_LOCATION_TYPE_FILTER_OPTIONS.find(
        (option) => option.value === (selectedLocation === 'Client' ? 'CLIENT_SIDE' : selectedLocation || '')
      )?.label || 'All',
    [selectedLocation]
  );

  useEffect(() => {
    if (!showLocationTypeFilterMenu) return;
    const onDocClick = (event) => {
      if (locationTypeFilterRef.current && !locationTypeFilterRef.current.contains(event.target)) {
        setShowLocationTypeFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showLocationTypeFilterMenu]);

  useEffect(() => {
    if (!showStatusFilterMenu) return;
    const onDocClick = (event) => {
      if (statusFilterRef.current && !statusFilterRef.current.contains(event.target)) {
        setShowStatusFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showStatusFilterMenu]);

  useEffect(() => {
    if (!showStartDateFilterMenu) return;
    const onDocClick = (event) => {
      if (startDateFilterRef.current && !startDateFilterRef.current.contains(event.target)) {
        setShowStartDateFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showStartDateFilterMenu]);

  useEffect(() => {
    if (!showEndDateFilterMenu) return;
    const onDocClick = (event) => {
      if (endDateFilterRef.current && !endDateFilterRef.current.contains(event.target)) {
        setShowEndDateFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showEndDateFilterMenu]);

  useEffect(() => {
    if (!showPatientNameOrderingMenu) return;
    const onDocClick = (event) => {
      if (
        patientNameOrderingRef.current &&
        !patientNameOrderingRef.current.contains(event.target)
      ) {
        setShowPatientNameOrderingMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showPatientNameOrderingMenu]);

  const statusFilterLabel = useMemo(
    () =>
      BOOKING_STATUS_FILTER_OPTIONS.find((option) => option.value === (selectedStatus || ''))?.label ||
      'All',
    [selectedStatus]
  );

  const renderPatientNameOrderingControl = () => (
    <span className="relative shrink-0" ref={patientNameOrderingRef}>
      <button
        type="button"
        draggable={false}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setShowPatientNameOrderingMenu((prev) => !prev);
          setShowLocationTypeFilterMenu(false);
          setShowStatusFilterMenu(false);
          setShowStartDateFilterMenu(false);
          setShowEndDateFilterMenu(false);
          setIsServiceDropdownOpen(false);
        }}
        className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none transition-colors hover:bg-indigo-100 ${
          isPatientNameOrdering(endDatetimeOrdering) ? 'text-indigo-600' : 'text-gray-400'
        }`}
        title={
          isPatientNameOrdering(endDatetimeOrdering)
            ? `Sort patient name: ${patientNameOrderingLabel}`
            : 'Sort patient name'
        }
        aria-label="Sort patient name"
        aria-expanded={showPatientNameOrderingMenu}
      >
        ▼
      </button>
      {showPatientNameOrderingMenu ? (
        <div
          className="absolute right-0 top-full z-20 mt-1 min-w-[7.5rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {PATIENT_NAME_ORDERING_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                applyListOrdering(option.value);
              }}
              className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-gray-50 ${
                endDatetimeOrdering === option.value
                  ? 'font-semibold text-indigo-700'
                  : 'text-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
          <div className="my-1 border-t border-gray-100" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              applyListOrdering(DEFAULT_BOOKING_ORDERING);
            }}
            className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-gray-50 ${
              isPatientNameOrdering(endDatetimeOrdering)
                ? 'font-semibold text-indigo-700'
                : 'text-gray-700'
            }`}
          >
            Default
          </button>
        </div>
      ) : null}
    </span>
  );

  const renderLocationTypeFilterControl = () => (
    <span className="relative shrink-0" ref={locationTypeFilterRef}>
      <button
        type="button"
        draggable={false}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setShowLocationTypeFilterMenu((prev) => !prev);
          setShowStatusFilterMenu(false);
          setShowStartDateFilterMenu(false);
          setShowEndDateFilterMenu(false);
          setShowPatientNameOrderingMenu(false);
          setIsServiceDropdownOpen(false);
        }}
        className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none transition-colors hover:bg-indigo-100 ${
          selectedLocation ? 'text-indigo-600' : 'text-gray-400'
        }`}
        title={`Filter by location type${selectedLocation ? `: ${locationTypeFilterLabel}` : ''}`}
        aria-label="Filter by location type"
        aria-expanded={showLocationTypeFilterMenu}
      >
        ▼
      </button>
      {showLocationTypeFilterMenu ? (
        <div
          className="absolute right-0 top-full z-20 mt-1 min-w-[8.5rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {BOOKING_LOCATION_TYPE_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value || 'all'}
              type="button"
              onClick={() => {
                setSelectedLocation(option.value || null);
                setShowLocationTypeFilterMenu(false);
              }}
              className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-gray-50 ${
                (selectedLocation || '') === option.value
                  ? 'font-semibold text-indigo-700'
                  : 'text-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );

  const renderServiceFilterControl = () => (
    <span className="relative shrink-0" ref={serviceFilterRef}>
      <button
        type="button"
        draggable={false}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setIsServiceDropdownOpen((prev) => !prev);
          setShowLocationTypeFilterMenu(false);
          setShowStatusFilterMenu(false);
          setShowStartDateFilterMenu(false);
          setShowEndDateFilterMenu(false);
          setShowPatientNameOrderingMenu(false);
        }}
        className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none transition-colors hover:bg-indigo-100 ${
          selectedService ? 'text-indigo-600' : 'text-gray-400'
        }`}
        title={selectedService ? `Filter by service: ${selectedService}` : 'Filter by service'}
        aria-label="Filter by service"
        aria-expanded={isServiceDropdownOpen}
      >
        ▼
      </button>
      {isServiceDropdownOpen ? (
        <div
          className="absolute right-0 top-full z-20 mt-1 max-h-60 min-w-[14rem] overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              if (!selectedService && !selectedServiceId) {
                setIsServiceDropdownOpen(false);
                return;
              }
              setSelectedService(null);
              setSelectedServiceId(null);
              setIsServiceDropdownOpen(false);
              if (fetchCustomers) {
                const orderFilter = viewMode === 'order' ? activeOrdersTab : null;
                const apiBookingType = toApiBookingType(selectedLocation);
                fetchCustomers(
                  null,
                  appliedSearchQuery,
                  orderFilter,
                  null,
                  apiBookingType,
                  selectedStatus,
                  startDateFilter,
                  endDateFilter
                );
              }
            }}
            className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-gray-50 ${
              !selectedService ? 'font-semibold text-indigo-700' : 'text-gray-700'
            }`}
          >
            All
          </button>
          {isLoadingAvailableServices ? (
            <div className="px-2 py-1.5 text-[11px] text-gray-500">Loading services...</div>
          ) : availableServices.length > 0 ? (
            availableServices.map((service) => {
              const serviceName = service.name;
              const isSelected = selectedService === serviceName;
              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => handleServiceSelect(serviceName, service.id)}
                  className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-gray-50 ${
                    isSelected ? 'font-semibold text-indigo-700' : 'text-gray-700'
                  }`}
                >
                  {serviceName}
                </button>
              );
            })
          ) : (
            <div className="px-2 py-1.5 text-[11px] text-gray-500">No services available</div>
          )}
        </div>
      ) : null}
    </span>
  );

  const renderStatusFilterControl = () => (
    <span className="relative shrink-0" ref={statusFilterRef}>
      <button
        type="button"
        draggable={false}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setShowStatusFilterMenu((prev) => !prev);
          setShowLocationTypeFilterMenu(false);
          setShowStartDateFilterMenu(false);
          setShowEndDateFilterMenu(false);
          setShowPatientNameOrderingMenu(false);
          setIsServiceDropdownOpen(false);
        }}
        className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none transition-colors hover:bg-indigo-100 ${
          selectedStatus ? 'text-indigo-600' : 'text-gray-400'
        }`}
        title={`Filter by status${selectedStatus ? `: ${statusFilterLabel}` : ''}`}
        aria-label="Filter by status"
        aria-expanded={showStatusFilterMenu}
      >
        ▼
      </button>
      {showStatusFilterMenu ? (
        <div
          className="absolute right-0 top-full z-20 mt-1 min-w-[8.5rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {BOOKING_STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value || 'all'}
              type="button"
              onClick={() => {
                setSelectedStatus(option.value);
                setShowStatusFilterMenu(false);
              }}
              className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-gray-50 ${
                (selectedStatus || '') === option.value
                  ? 'font-semibold text-indigo-700'
                  : 'text-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );

  const renderStartDateFilterControl = () => (
    <span className="relative shrink-0" ref={startDateFilterRef}>
      <button
        type="button"
        draggable={false}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setShowStartDateFilterMenu((prev) => !prev);
          setShowEndDateFilterMenu(false);
          setShowStatusFilterMenu(false);
          setShowLocationTypeFilterMenu(false);
          setShowPatientNameOrderingMenu(false);
          setIsServiceDropdownOpen(false);
        }}
        className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-indigo-100 ${
          startDateFilter ? 'text-indigo-600' : 'text-gray-400'
        }`}
        title={startDateFilter ? `Start date filter: ${startDateFilter}` : 'Filter by start date'}
        aria-label="Filter by start date"
        aria-expanded={showStartDateFilterMenu}
      >
        <FiCalendar className="h-3.5 w-3.5" />
      </button>
      {showStartDateFilterMenu ? (
        <div
          className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] rounded-md border border-gray-200 bg-white p-2 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <label className="mb-1 block text-[10px] font-medium text-gray-600" htmlFor="booking-col-start-date">
            Start date
          </label>
          <input
            id="booking-col-start-date"
            type="date"
            value={startDateFilter}
            onChange={(e) => {
              const v = e.target.value;
              setStartDateFilter(v);
              if (endDateFilter && v && endDateFilter < v) {
                setEndDateFilter('');
              }
            }}
            className="w-full rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300"
          />
          {startDateFilter ? (
            <button
              type="button"
              onClick={() => setStartDateFilter('')}
              className="mt-1.5 text-[10px] font-medium text-indigo-600 hover:text-indigo-800"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
    </span>
  );

  const renderEndDateFilterControl = () => (
    <span className="relative shrink-0" ref={endDateFilterRef}>
      <button
        type="button"
        draggable={false}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setShowEndDateFilterMenu((prev) => !prev);
          setShowStartDateFilterMenu(false);
          setShowStatusFilterMenu(false);
          setShowLocationTypeFilterMenu(false);
          setShowPatientNameOrderingMenu(false);
          setIsServiceDropdownOpen(false);
        }}
        className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-indigo-100 ${
          endDateFilter ? 'text-indigo-600' : 'text-gray-400'
        }`}
        title={endDateFilter ? `End date filter: ${endDateFilter}` : 'Filter by end date'}
        aria-label="Filter by end date"
        aria-expanded={showEndDateFilterMenu}
      >
        <FiCalendar className="h-3.5 w-3.5" />
      </button>
      {showEndDateFilterMenu ? (
        <div
          className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] rounded-md border border-gray-200 bg-white p-2 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <label className="mb-1 block text-[10px] font-medium text-gray-600" htmlFor="booking-col-end-date">
            End date
          </label>
          <input
            id="booking-col-end-date"
            type="date"
            value={endDateFilter}
            min={startDateFilter || undefined}
            onChange={(e) => {
              const v = e.target.value;
              if (v && startDateFilter && v < startDateFilter) {
                showAlert('End date cannot be before start date. Please choose a valid end date.', 'warning');
                return;
              }
              setEndDateFilter(v);
            }}
            className="w-full rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300"
          />
          {endDateFilter ? (
            <button
              type="button"
              onClick={() => setEndDateFilter('')}
              className="mt-1.5 text-[10px] font-medium text-indigo-600 hover:text-indigo-800"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
    </span>
  );

  const hasActiveFilters = useMemo(() => {
    return !!(
      searchQuery?.trim() ||
      selectedService ||
      selectedLocation ||
      selectedStatus ||
      startDateFilter ||
      endDateFilter
    );
  }, [
    searchQuery,
    selectedService,
    selectedLocation,
    selectedStatus,
    startDateFilter,
    endDateFilter,
  ]);

  // Clear all filters function
  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setAppliedSearchQuery('');
    setSelectedService(null);
    setSelectedServiceId(null);
    setSelectedLocation(null);
    setSelectedStatus('');
    setStartDateFilter('');
    setEndDateFilter('');
    setShowStatusFilterMenu(false);
    setShowStartDateFilterMenu(false);
    setShowEndDateFilterMenu(false);
    setShowLocationTypeFilterMenu(false);
    setShowPatientNameOrderingMenu(false);
    setIsServiceDropdownOpen(false);
    
    // Refetch data without filters
    if (fetchCustomers) {
      const orderFilter = viewMode === 'order' ? activeOrdersTab : null;
      fetchCustomers(null, '', orderFilter, null, null, '', '', '');
    }
  }, [fetchCustomers, viewMode, activeOrdersTab]);

  // Filter customers - booking type filtering is now handled by API
  const filteredCustomers = useMemo(() => {
    // No client-side filtering needed since booking_type is filtered by API
    return customers;
  }, [customers]);

  // Alias for compatibility (dummy data removed; same as filteredCustomers)
  const customersWithDummy = filteredCustomers;

  // Get all orders from API bookings data
  const getAllOrders = useMemo(() => {
    return customers.map(customer => {
      const orderDate = customer.startDatetime ? new Date(customer.startDatetime) : null;
      const endDateObj = customer.endDatetime ? new Date(customer.endDatetime) : null;
      
      // Determine if monthly or hourly based on package name
      const packageName = (customer.package?.name || '').toLowerCase();
      const isMonthly = packageName.includes('month') || customer.endDatetime;
      const isHourly = packageName.includes('hourly') || packageName.includes('hour');
      
      // Derive location from booking or first secondary order
      const primaryLocation =
        (String(customer.bookingType || '').toUpperCase() === 'CLIENT_SIDE'
          ? (customer.clientAddress || customer.locationLocality || '')
          : customer.locationLocality) ||
        (Array.isArray(customer.secondary_orders) && customer.secondary_orders.length > 0
          ? customer.secondary_orders[0].location_locality || ''
          : '');
      const secondaryLocality =
        customer.secondaryLocationLocality ||
        getSecondaryLocationLocality(customer.secondary_orders);

      // Secondary & tertiary counts for summary table
      const secondaryCount = Array.isArray(customer.secondary_orders) ? customer.secondary_orders.length : 0;
      const tertiaryCount = Array.isArray(customer.children) ? customer.children.length : 0;

      return {
        id: customer.bookingId || customer.id,
        customerId: customer.id,
        orderId: customer.orderId || '',
        patientId: customer.patient_id || '',
        customerName: customer.name,
        serviceType: customer.serviceName || 'Service',
        packageType: customer.packageName || customer.package?.name || '-',
        serviceDate: customer.startDatetime,
        startDate: customer.startDatetime,
        endDate: customer.endDatetime,
        serviceTime: customer.startDatetime ? new Date(customer.startDatetime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null,
        orderDate,
        endDateObj,
        isMonthly,
        isHourly,
        // Additional booking fields
        venueName: customer.venueName,
        venueCost: customer.venueCost,
        servicesCost: customer.servicesCost,
        subtotal: customer.subtotal,
        location: primaryLocation,
        locationLocality: secondaryLocality,
        bookingType: customer.bookingType,
        age: customer.age,
        phone: customer.phone,
        emergencyContact: customer.emergencyContact,
        secondaryCount,
        tertiaryCount,
        discount: customer.discount,
        finalAmount: customer.finalAmount,
        status: customer.status,
        continueBooking: customer.continueBooking,
        isUpcoming: customer.isUpcoming,
        isOngoing: customer.isOngoing,
      };
    }).filter(order => order.orderDate !== null)
      .sort((a, b) => {
        if (!a.orderDate || !b.orderDate) return 0;
        return b.orderDate - a.orderDate;
      });
  }, [customers]);

  // Categorize orders into past, present, and upcoming using API fields
  const categorizedOrders = useMemo(() => {
    const past = [];
    const present = [];
    const upcoming = [];
    
    getAllOrders.forEach(order => {
      // Use API fields if available
      if (order.isOngoing !== undefined || order.isUpcoming !== undefined) {
        if (order.isOngoing) {
          present.push(order);
        } else if (order.isUpcoming) {
          upcoming.push(order);
        } else {
          // If neither ongoing nor upcoming, it's past
          past.push(order);
        }
      } else {
        // Fallback to date-based categorization
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (order.isMonthly && order.endDateObj) {
          // For monthly packages, check if current date is between start and end
          if (order.endDateObj < today) {
            past.push(order);
          } else if (order.orderDate && order.orderDate <= today) {
            present.push(order);
          } else {
            upcoming.push(order);
          }
        } else {
          // For single date services
          if (order.orderDate) {
            if (order.orderDate < today) {
              past.push(order);
            } else if (order.orderDate.getTime() === today.getTime()) {
              present.push(order);
            } else {
              upcoming.push(order);
            }
          }
        }
      }
    });
    
    return { past, present, upcoming };
  }, [getAllOrders]);

  // Get orders for active tab
  const activeOrders = useMemo(() => {
    // When in order view mode, API already filters the data, so use it directly
    if (viewMode === 'order') {
      return getAllOrders;
    }
    
    // For customer view mode, use client-side categorization
    switch (activeOrdersTab) {
      case 'past':
        return categorizedOrders.past;
      case 'upcoming':
        return categorizedOrders.upcoming;
      default:
        return categorizedOrders.present;
    }
  }, [activeOrdersTab, categorizedOrders, getAllOrders, viewMode]);

  const exportExcel = useCallback(() => {
    const isOrderView = viewMode === 'order';
    const exportCols = isOrderView ? visibleOrderSummaryColumns : visibleColumns;
    const rows = isOrderView ? activeOrders : customers;

    if (!exportCols.length) {
      showAlert('Please keep at least one visible column before exporting.', 'warning');
      return;
    }
    if (!rows.length) {
      showAlert('No bookings to export on this page.', 'warning');
      return;
    }

    try {
      const headerRow = exportCols.map((col) => col.label);
      const dataRows = rows.map((row) =>
        exportCols.map((col) =>
          isOrderView
            ? getBookingOrderExportCell(row, col.id)
            : getBookingCustomerExportCell(row, col.id)
        )
      );
      const sheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, isOrderView ? 'Orders' : 'Bookings');
      const stamp = new Date().toISOString().slice(0, 10);
      const viewSlug = isOrderView ? `orders-${activeOrdersTab}` : 'customers';
      XLSX.writeFile(workbook, `bookings-${viewSlug}-p${currentPage}-${stamp}.xlsx`);
    } catch (e) {
      showAlert(e?.message || 'Unable to export Excel file.', 'error');
    }
  }, [
    viewMode,
    visibleOrderSummaryColumns,
    visibleColumns,
    activeOrders,
    customers,
    showAlert,
    activeOrdersTab,
    currentPage,
  ]);

  const openCreateBookingModal = () => {
    setCreateBookingType(BOOKING_CREATE_TYPES.IN_HOUSE);
    setCreateBookingPatient(null);
    setCreateBookingError('');
    setShowCreateBookingModal(true);
  };

  const closeCreateBookingModal = () => {
    setShowCreateBookingModal(false);
    setCreateBookingPatient(null);
    setCreateBookingError('');
  };

  const handleContinueCreateBooking = () => {
    if (!createBookingPatient) {
      setCreateBookingError('Select a patient to continue.');
      return;
    }
    if (!createBookingType) {
      setCreateBookingError('Select a booking type to continue.');
      return;
    }

    const path = getBookingCreatePath(createBookingType);
    navigate(path, {
      state: {
        fromDashboardBooking: true,
        returnTo: '/dashboard?section=booking',
        bookingCreateType: createBookingType,
        preferredLocationType: getInHouseLocationType(createBookingType),
        prefillPatient: createBookingPatient,
      },
    });
  };

  // Don't show full-page loading - only show loading in table area

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FiUser className="w-8 h-8 text-red-400" />
        </div>
        <h4 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Customers</h4>
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button
          onClick={() => fetchCustomers()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full space-y-2">
      <div className="mb-2 flex w-full min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5">
        <div className="flex shrink-0 items-center gap-1">
          <span className={`whitespace-nowrap text-[10px] font-medium transition-colors ${viewMode === 'customer' ? 'text-indigo-700' : 'text-gray-500'}`}>
            Customers
          </span>
          <button
            type="button"
            onClick={() => {
              setViewMode(viewMode === 'customer' ? 'order' : 'customer');
            }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
              viewMode === 'order' ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
            aria-label={viewMode === 'order' ? 'Switch to customers view' : 'Switch to orders view'}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                viewMode === 'order' ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className={`whitespace-nowrap text-[10px] font-medium transition-colors ${viewMode === 'order' ? 'text-indigo-700' : 'text-gray-500'}`}>
            Orders
          </span>
        </div>

        {viewMode === 'customer' && (
          <div className="relative min-w-0 flex-1 basis-24">
            <FiSearch className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, phone, id..."
              value={searchQuery}
              onChange={handleSearchInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runSearch();
                }
              }}
              className={`h-7 w-full min-w-0 rounded-md border border-gray-300 pl-6 text-[10px] focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 ${searchQuery ? 'pr-6' : 'pr-1.5'}`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearchAndReload}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                title="Clear search"
              >
                <FiX className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {(viewMode === 'customer' || viewMode === 'order') && (
          <div className="flex shrink-0 items-center gap-1">
            <label className="whitespace-nowrap text-[10px] font-medium text-gray-600" htmlFor="booking-page-size">
              Rows
            </label>
            <select
              id="booking-page-size"
              value={String(pageSize)}
              onChange={handlePageSizeChange}
              className="h-7 w-12 shrink-0 rounded-md border border-gray-300 bg-white px-1 text-[10px] text-gray-700 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300"
              title="Rows per page (max 100)"
            >
              {PAGE_SIZE_PRESETS.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowColumnChooser(true)}
              className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-gray-300 bg-white px-1.5 text-[10px] transition-colors hover:bg-gray-50 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300"
              title="Column Chooser"
            >
              <FiColumns className="h-3 w-3 shrink-0 text-gray-600" />
              <span className="text-gray-700">Columns</span>
            </button>
            <button
              type="button"
              onClick={exportExcel}
              disabled={isLoading || (viewMode === 'order' ? activeOrders.length === 0 : customers.length === 0)}
              className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-md border border-emerald-700 bg-emerald-700 px-1.5 text-[10px] font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              title="Export current page to Excel"
            >
              Export
            </button>
            <button
              type="button"
              onClick={openCreateBookingModal}
              className="inline-flex h-7 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md border border-teal-600 bg-teal-600 px-1.5 text-[10px] font-semibold text-white hover:bg-teal-700"
              title="Create a new booking for any patient"
            >
              <FiPlus className="h-3 w-3 shrink-0" aria-hidden="true" />
              Create
            </button>
            <button
              type="button"
              onClick={clearAllFilters}
              disabled={!hasActiveFilters}
              className={`inline-flex h-7 shrink-0 items-center justify-center gap-0.5 whitespace-nowrap rounded-md border px-1.5 text-[10px] font-medium transition-colors ${
                hasActiveFilters
                  ? 'border-red-200 bg-white text-red-600 hover:bg-red-50 hover:text-red-700'
                  : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              }`}
              title="Clear all filters"
            >
              <FiX className="h-3 w-3 shrink-0" />
              Clear
            </button>
            <span className="whitespace-nowrap text-[10px] text-gray-500">
              {viewMode === 'customer'
                ? `${visibleColumns.length}/${allColumns.length}`
                : `${Object.values(orderSummaryColumnVisibility).filter(Boolean).length}/${Object.keys(orderSummaryColumnVisibility).length}`}
            </span>
          </div>
        )}
      </div>

      {showCreateBookingModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-booking-title"
          onClick={closeCreateBookingModal}
        >
          <div
            className="flex max-h-[min(92vh,680px)] w-full max-w-lg flex-col overflow-visible rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 id="create-booking-title" className="text-sm font-semibold text-slate-900">
                  Create new booking
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Choose In House, OPD, or Client Location, select a patient, then continue the existing booking steps.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateBookingModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close create booking dialog"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            <div className="relative z-10 space-y-4 overflow-visible px-4 py-4">
              <div className="relative z-20">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Patient
                </label>
                <PatientSearchDropdown
                  value={createBookingPatient}
                  onChange={(patient) => {
                    setCreateBookingPatient(patient);
                    setCreateBookingError('');
                  }}
                  placeholder="Search and select patient…"
                  listMaxHeightClassName="max-h-48"
                />
              </div>

              <fieldset>
                <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Booking type
                </legend>
                <div className="space-y-2">
                  {BOOKING_CREATE_TYPE_OPTIONS.map((option) => {
                    const selected = createBookingType === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors ${
                          selected
                            ? 'border-teal-500 bg-teal-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="create-booking-type"
                          value={option.value}
                          checked={selected}
                          onChange={() => {
                            setCreateBookingType(option.value);
                            setCreateBookingError('');
                          }}
                          className="mt-1"
                        />
                        <span>
                          <span className="block text-xs font-semibold text-slate-900">{option.label}</span>
                          <span className="block text-[11px] text-slate-500">{option.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {createBookingError ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
                  {createBookingError}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={closeCreateBookingModal}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContinueCreateBooking}
                className="inline-flex items-center gap-1.5 rounded-md border border-teal-600 bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {viewMode === 'customer' ? (
        <>
      {isLoading ? (
        <div className="flex items-center justify-center py-12 border border-gray-200 rounded-lg">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="text-sm text-gray-600">Loading customers...</p>
          </div>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FiUser className="w-8 h-8 text-gray-400" />
          </div>
          <h4 className="text-lg font-semibold text-gray-900 mb-2">
            {appliedSearchQuery ? 'No Customers Match Your Search' : 'No Customers Found'}
          </h4>
          <p className="text-sm text-gray-600">
            {appliedSearchQuery 
              ? 'Try adjusting your search query.' 
              : 'Customer list will be displayed here once data is available.'}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 rounded-lg" style={{ maxWidth: '100%' }}>
            <table className="w-full divide-y divide-gray-200 table-auto text-xs" style={{ minWidth: '600px' }}>
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-1.5 py-1.5 text-center text-xs font-medium text-gray-700 uppercase tracking-wider border-b border-gray-200 w-10 sticky left-0 bg-gray-50 z-10">
                    
                  </th>
                  {visibleColumns.map((column, index) => (
                    <th
                      key={column.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      style={{ width: column.width }}
                      className={`px-2 py-1.5 text-xs font-medium text-gray-700 uppercase tracking-wider border-b border-gray-200 cursor-move select-none transition-all ${
                        column.id === 'age' ? 'text-center' : 'text-left'
                      } ${
                        draggedColumn === index ? 'opacity-50 bg-indigo-50' : 'hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400 text-base leading-none" style={{ fontFamily: 'monospace' }}>⋮⋮</span>
                        <span className="min-w-0">{column.label}</span>
                        {column.id === 'name' ? renderPatientNameOrderingControl() : null}
                        {column.id === 'locationType' ? renderLocationTypeFilterControl() : null}
                        {column.id === 'serviceName' ? renderServiceFilterControl() : null}
                        {column.id === 'status' ? renderStatusFilterControl() : null}
                        {column.id === 'startingDate' ? renderStartDateFilterControl() : null}
                        {column.id === 'endingDate' ? renderEndDateFilterControl() : null}
                        {column.id === 'autoRenew' ? (
                          <span
                            className="ml-0.5 inline-flex flex-col items-center justify-center gap-0"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              draggable={false}
                              onClick={(e) => {
                                e.stopPropagation();
                                applyListOrdering(
                                  endDatetimeOrdering === 'auto_continue'
                                    ? '-end_datetime'
                                    : 'auto_continue'
                                );
                              }}
                              className={`rounded p-0 leading-none transition-colors hover:bg-indigo-100 ${
                                endDatetimeOrdering === 'auto_continue'
                                  ? 'text-indigo-600'
                                  : 'text-gray-400'
                              }`}
                              title="Sort auto-renew ascending (Off → On)"
                              aria-label="Sort auto-renew ascending"
                              aria-pressed={endDatetimeOrdering === 'auto_continue'}
                            >
                              <FiChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              draggable={false}
                              onClick={(e) => {
                                e.stopPropagation();
                                applyListOrdering(
                                  endDatetimeOrdering === '-auto_continue'
                                    ? '-end_datetime'
                                    : '-auto_continue'
                                );
                              }}
                              className={`-mt-0.5 rounded p-0 leading-none transition-colors hover:bg-indigo-100 ${
                                endDatetimeOrdering === '-auto_continue'
                                  ? 'text-indigo-600'
                                  : 'text-gray-400'
                              }`}
                              title="Sort auto-renew descending (On → Off)"
                              aria-label="Sort auto-renew descending"
                              aria-pressed={endDatetimeOrdering === '-auto_continue'}
                            >
                              <FiChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ) : null}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCustomers.map((customer) => {
                  const isExpanded = expandedRows.has(customer.id);
                  const mergedSecondaryOrders =
                    (customer.secondary_orders || []).length > 0
                      ? customer.secondary_orders
                      : (detailSecondaryOrdersByBookingId[customer.id] ||
                          detailSecondaryOrdersByBookingId[customer.bookingId] ||
                          []);
                  const packageName = customer.package?.name || customer.package?.package_name || 'No package assigned';
                  const packagePrice = customer.package?.price || customer.package?.package_price || customer.registrationFee || '0';
                  const packageDuration = customer.package?.duration || customer.package?.package_duration || null;
                  const amountPaid = customer.advancePayment ? parseFloat(customer.advancePayment) : 0;
                  const totalAmount = customer.registrationFee ? parseFloat(customer.registrationFee) : (packagePrice ? parseFloat(packagePrice) : 0);
                  const balance = totalAmount - amountPaid;
                  const serviceEndDate = calculateServiceEndDate(customer.registrationDate, packageDuration);
                  const lastDayFromSelectedDates = calculateLastDayFromSelectedDates(customer.selectedDates);
                  const firstDayFromSelectedDates = calculateFirstDayFromSelectedDates(customer.selectedDates);
                  // Use booking start/end from API when available; fallback to selected-dates helpers
                  const startingDateDisplay = customer.startDatetime
                    ? new Date(customer.startDatetime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : (firstDayFromSelectedDates || '-');
                  const endingDateDisplay = customer.endDatetime
                    ? new Date(customer.endDatetime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : (lastDayFromSelectedDates || '-');
                  const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.name || '-';
                  
                  return (
                    <React.Fragment key={customer.id}>
                      <tr className="hover:bg-gray-50 transition-colors group">
                        <td className="px-1.5 py-1.5 text-center w-10 sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-r border-gray-200 transition-colors">
                          <button
                            onClick={() => toggleRow(customer.id, customer.patientId)}
                            className="p-1 rounded hover:bg-gray-200 transition-colors"
                            title={isExpanded ? 'Hide details' : 'Show details'}
                          >
                            {isExpanded ? (
                              <FiMinus className="w-3.5 h-3.5 text-gray-600" />
                            ) : (
                              <FiPlus className="w-3.5 h-3.5 text-gray-600" />
                            )}
                          </button>
                        </td>
                        {visibleColumns.map((column) => {
                          let cellValue = '-';
                          let cellClassName = 'px-2 py-1.5 text-xs text-gray-900';
                          
                          switch (column.id) {
                            case 'order_id':
                              cellValue = customer.orderId || '-';
                              cellClassName += ' whitespace-nowrap font-medium';
                              break;
                            case 'name':
                              cellValue = fullName;
                              cellClassName += ' whitespace-nowrap';
                              break;
                            case 'patient_id':
                              cellValue = customer.patient_id || '-';
                              cellClassName += ' whitespace-nowrap';
                              break;
                            case 'phone':
                              cellValue = customer.phone || '-';
                              cellClassName += ' whitespace-nowrap';
                              break;
                            case 'age':
                              cellValue = customer.age !== null && customer.age !== undefined ? String(customer.age) : '-';
                              cellClassName += ' whitespace-nowrap text-center';
                              break;
                            case 'serviceOpted': {
                              // Customer table: show package_name in Package Name column
                              cellValue = customer.packageName || packageName || '-';
                              break;
                            }
                            case 'serviceName': {
                              // Customer table: show service_name from booking/bookings API
                              cellValue = customer.serviceName || '-';
                              break;
                            }
                            case 'locationType':
                              cellValue = formatBookingLocationType(customer.bookingType);
                              cellClassName += ' whitespace-nowrap';
                              break;
                            case 'locationLocality': {
                              const localityText =
                                customer.secondaryLocationLocality ||
                                getSecondaryLocationLocality(mergedSecondaryOrders) ||
                                '-';
                              cellValue =
                                localityText === '-' ? (
                                  '-'
                                ) : (
                                  <span className="block max-w-[12rem] whitespace-normal break-words leading-snug" title={localityText}>
                                    {localityText}
                                  </span>
                                );
                              cellClassName += ' align-middle min-w-[7rem] max-w-[12rem]';
                              break;
                            }
                            case 'location': {
                              const customerLocation =
                                customer.locationLocality ||
                                customer.venueName ||
                                customer.clientAddress ||
                                (Array.isArray(mergedSecondaryOrders) && mergedSecondaryOrders.length > 0
                                  ? mergedSecondaryOrders[0].location_locality || ''
                                  : '');
                              const locationText = customerLocation || '-';
                              cellValue =
                                locationText === '-' ? (
                                  '-'
                                ) : (
                                  <span className="block max-w-[14rem] whitespace-normal break-words leading-snug" title={locationText}>
                                    {locationText}
                                  </span>
                                );
                              cellClassName += ' align-middle min-w-[8rem] max-w-[14rem]';
                              break;
                            }
                            case 'startingDate':
                              cellValue = startingDateDisplay;
                              cellClassName += ' whitespace-nowrap';
                              break;
                            case 'endingDate':
                              cellValue = endingDateDisplay;
                              cellClassName += ' whitespace-nowrap';
                              break;
                            case 'status': {
                              const primaryStatus = customer.status || '-';
                              const statusLabel = typeof primaryStatus === 'string' ? primaryStatus.replace(/_/g, ' ') : primaryStatus;
                              const primaryStatusKey = `primary-${customer.id}`;
                              const orderStatusKey = `order-${customer.id}`;
                              const isPrimaryDropdownOpen = openStatusDropdown === primaryStatusKey;
                              const isChangingPrimary = isChangingStatus[orderStatusKey];
                              const statusBtnClass = primaryStatus === 'CANCELLED' ? 'bg-red-50 text-red-700' :
                                primaryStatus === 'DRAFT' ? 'bg-gray-100 text-gray-700' :
                                primaryStatus === 'BOOKED' || primaryStatus === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700' :
                                primaryStatus === 'FULFILLED' || primaryStatus === 'COMPLETED' || primaryStatus === 'PARTIALLY_FULFILLED' ? 'bg-green-50 text-green-700' :
                                primaryStatus === 'UNFULFILLED' ? 'bg-amber-50 text-amber-700' :
                                primaryStatus === 'YET_TO_START' ? 'bg-amber-50 text-amber-700' :
                                'bg-slate-100 text-slate-700';
                              cellValue = statusLabel !== '-' ? (
                                <div className="relative">
                                  {isPrimaryDropdownOpen ? (
                                    <select
                                      autoFocus
                                      disabled={isChangingPrimary}
                                      onBlur={() => {
                                        if (!isChangingPrimary) setOpenStatusDropdown(null);
                                      }}
                                      onChange={(e) => {
                                        const newStatus = e.target.value;
                                        if (newStatus) handleChangeOrderStatus(customer.id || customer.bookingId, newStatus);
                                      }}
                                      className={`font-medium border border-gray-300 rounded px-1.5 py-0.5 text-xs cursor-pointer whitespace-nowrap w-full min-w-[100px] ${statusBtnClass} ${isChangingPrimary ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      defaultValue=""
                                    >
                                      <option value="">Select status...</option>
                                      {(STATUS_TRANSITIONS[primaryStatus] || []).map((status) => (
                                        <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setOpenStatusDropdown(primaryStatusKey)}
                                      className={`font-medium underline decoration-dotted cursor-pointer hover:opacity-80 inline-flex items-center gap-0.5 whitespace-nowrap px-1.5 py-0.5 rounded text-xs ${statusBtnClass}`}
                                    >
                                      {statusLabel}
                                      <FiChevronDown className="w-3.5 h-3.5 opacity-70" />
                                    </button>
                                  )}
                                </div>
                              ) : '-';
                              cellClassName += ' whitespace-nowrap';
                              break;
                            }
                            case 'autoRenew': {
                              const isAutoRenew = Boolean(customer.continueBooking);
                              const bookingId = customer.id || customer.bookingId;
                              const isToggling =
                                togglingAutoRenewId != null &&
                                String(togglingAutoRenewId) === String(bookingId);
                              cellValue = (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleAutoRenew(bookingId, isAutoRenew);
                                  }}
                                  disabled={isToggling}
                                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                                    isAutoRenew
                                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100'
                                      : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200'
                                  } ${isToggling ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
                                  title={
                                    isAutoRenew
                                      ? 'Auto-renew is ON — click to turn OFF'
                                      : 'Auto-renew is OFF — click to turn ON'
                                  }
                                  aria-pressed={isAutoRenew}
                                  aria-label={isAutoRenew ? 'Auto-renew ON' : 'Auto-renew OFF'}
                                >
                                  {isToggling
                                    ? '…'
                                    : isAutoRenew
                                      ? 'ON'
                                      : 'OFF'}
                                </button>
                              );
                              cellClassName += ' whitespace-nowrap';
                              break;
                            }
                            case 'emergencyContact':
                              // Show both name and phone in stacked format
                              const contactName = customer.emergencyContact || '';
                              const contactPhone = customer.emergencyPhone || '';
                              const hasContact = contactName || contactPhone;
                              cellValue = hasContact ? (
                                <div className="flex flex-col">
                                  {contactName && (
                                    <span className="text-gray-900 text-xs">{contactName}</span>
                                  )}
                                  {contactPhone && (
                                    <span className="text-gray-600 text-xs mt-0.5">{contactPhone}</span>
                                  )}
                                </div>
                              ) : '-';
                              cellClassName += ' align-top';
                              break;
                            case 'cancelBooking':
                              cellValue = (
                                <button
                                  onClick={() => {
                                    setSelectedBookingForCancel(customer);
                                    setShowCancelModal(true);
                                  }}
                                  disabled={customer.status === 'CANCELLED'}
                                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                                    customer.status === 'CANCELLED'
                                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                                  }`}
                                >
                                  {customer.status === 'CANCELLED' ? 'Cancelled' : 'Cancel'}
                                </button>
                              );
                              cellClassName += ' text-center';
                              break;
                            default:
                              cellValue = '-';
                          }
                          
                          return (
                            <td key={column.id} className={cellClassName}>
                              {cellValue}
                            </td>
                          );
                        })}
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={1 + visibleColumns.length} className="px-2 py-1 bg-gray-50 border-t border-gray-200">
                        <div className="space-y-1">
                          {/* Periods & Services Section (Secondary + Tertiary in one table) */}
                          <div className={(mergedSecondaryOrders.length > 0 || (bookingServices[customer.id] && bookingServices[customer.id].length)) ? 'mt-2' : ''}>
                            <div className="flex items-center justify-between mb-0.5">
                              <h4 className="text-xs font-semibold text-gray-700">Orders </h4>
                            </div>
                            {loadingServices[customer.id] ? (
                              <div className="text-xs text-gray-500 py-2">Loading services...</div>
                            ) : (
                              <>
                                {/* Services Table */}
                                {(mergedSecondaryOrders.length > 0) ||
                                 (bookingServices[customer.id] && bookingServices[customer.id].length > 0) ? (
                                  <div 
                                    key={`services-${customer.id}-${servicePagination[customer.id]?.current_page || 1}`}
                                    className="border border-gray-200 rounded mb-1 transition-opacity duration-300 ease-in-out overflow-x-auto"
                                  >
                                    <table className="w-full text-xs leading-tight" style={{ minWidth: '1200px' }}>
                                      <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                          {visibleOrderDetailColumns.map((col, index) => (
                                            <th
                                              key={col.id}
                                              draggable
                                              onDragStart={(e) => handleOrderDetailDragStart(e, index)}
                                              onDragOver={(e) => handleOrderDetailDragOver(e, index)}
                                              onDragEnd={handleOrderDetailDragEnd}
                                              style={{ width: col.width }}
                                              className={`px-2 py-0.5 text-left text-xs font-semibold text-gray-700 cursor-move select-none transition-all ${
                                                orderDetailDraggedColumn === index ? 'opacity-50 bg-indigo-50' : 'hover:bg-gray-100'
                                              }`}
                                            >
                                              <div className="flex items-center gap-1">
                                                <span className="text-gray-400 text-sm leading-none" style={{ fontFamily: 'monospace' }}>⋮⋮</span>
                                                {col.label}
                                              </div>
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody className="bg-white divide-y divide-gray-200">
                                        {/* Secondary rows first (list API or GET /bookings/:id/) */}
                                        {mergedSecondaryOrders.length > 0 && mergedSecondaryOrders.map((so) => (
                                          <tr key={`secondary-${so.id}`} className="hover:bg-gray-50">
                                            {visibleOrderDetailColumns.map((col) => {
                                              if (col.id === 'orderId') return <td key={col.id} className="px-2 py-0.5 text-gray-700 whitespace-nowrap font-medium">{so.order_id || `#${so.id}`}</td>;
                                              if (col.id === 'service') return (
                                                <td key={col.id} className="px-2 py-0.5 whitespace-nowrap text-xs text-gray-900">
                                                  {so.service_name || 'Secondary period'}
                                                </td>
                                              );
                                              if (col.id === 'package') return (
                                                <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                  {so.package_name || '-'}
                                                </td>
                                              );
                                              if (col.id === 'location') {
                                                const locText =
                                                  resolveOrderLocationText(
                                                    so,
                                                    String(customer.bookingType || '').toUpperCase() === 'CLIENT_SIDE'
                                                      ? customer.clientAddress
                                                      : ''
                                                  ) || '-';
                                                return (
                                                  <td
                                                    key={col.id}
                                                    className="px-2 py-0.5 text-gray-600 align-middle min-w-[8rem] max-w-[14rem]"
                                                    title={locText}
                                                  >
                                                    <span className="block max-w-[14rem] whitespace-normal break-words leading-snug">
                                                      {locText}
                                                    </span>
                                                  </td>
                                                );
                                              }
                                              if (col.id === 'start') return (
                                                <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                  {so.start_datetime ? new Date(so.start_datetime).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                </td>
                                              );
                                              if (col.id === 'end') return (
                                                <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                  {so.end_datetime ? new Date(so.end_datetime).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                </td>
                                              );
                                              if (col.id === 'created') return (
                                                <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                  {so.created_at ? new Date(so.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                                                </td>
                                              );
                                              if (col.id === 'modified') return (
                                                <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                  {so.updated_at ? new Date(so.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                                                </td>
                                              );
                                              if (col.id === 'status') return (
                                                <td key={col.id} className="px-2 py-0.5 whitespace-nowrap">
                                                  <div className="relative">
                                                    {openStatusDropdown === `secondary-${customer.id}-${so.id}` ? (
                                                      <select
                                                        autoFocus
                                                        disabled={isChangingStatus[`secondary-${customer.id}-${so.id}`]}
                                                        onBlur={() => { if (!isChangingStatus[`secondary-${customer.id}-${so.id}`]) setOpenStatusDropdown(null); }}
                                                        onChange={(e) => {
                                                          const newStatus = e.target.value;
                                                          if (newStatus) handleChangeSecondaryStatus(customer.id || customer.bookingId, so.id, newStatus);
                                                        }}
                                                        className={`font-medium border border-gray-300 rounded px-1.5 py-0.5 text-xs cursor-pointer whitespace-nowrap ${
                                                          so.status === 'DRAFT' ? 'bg-gray-100 text-gray-700' :
                                                          so.status === 'BOOKED' || so.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700' :
                                                          so.status === 'COMPLETED' ? 'bg-green-50 text-green-700' :
                                                          so.status === 'CANCELLED' ? 'bg-red-50 text-red-700' :
                                                          'bg-slate-100 text-slate-700'
                                                        } ${isChangingStatus[`secondary-${customer.id}-${so.id}`] ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        defaultValue=""
                                                      >
                                                        <option value="">Select status...</option>
                                                        {(STATUS_TRANSITIONS[so.status] || []).filter((s) => s !== 'MODIFIED' && s !== 'RESCHEDULED').map((status) => (
                                                          <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
                                                        ))}
                                                      </select>
                                                    ) : (
                                                      <button
                                                        type="button"
                                                        onClick={() => setOpenStatusDropdown(`secondary-${customer.id}-${so.id}`)}
                                                        className={`font-medium underline decoration-dotted cursor-pointer hover:opacity-80 inline-flex items-center gap-0.5 whitespace-nowrap px-1.5 py-0.5 rounded text-xs ${
                                                          so.status === 'DRAFT' ? 'bg-gray-100 text-gray-700' :
                                                          so.status === 'BOOKED' || so.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700' :
                                                          so.status === 'COMPLETED' ? 'bg-green-50 text-green-700' :
                                                          so.status === 'CANCELLED' ? 'bg-red-50 text-red-700' :
                                                          'bg-slate-100 text-slate-700'
                                                        }`}
                                                      >
                                                        {so.status?.replace(/_/g, ' ') || '-'}
                                                        <FiChevronDown className="w-3.5 h-3.5 opacity-70" />
                                                      </button>
                                                    )}
                                                  </div>
                                                </td>
                                              );
                                              if (col.id === 'actions') {
                                                const editDisabled =
                                                  so.status === 'CANCELLED' || so.status === 'FULFILLED';
                                                return (
                                                  <td key={col.id} className="px-2 py-0.5 whitespace-nowrap">
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        openEditService(
                                                          {
                                                            ...so,
                                                            service: so.service ?? customer.serviceId,
                                                            service_id: so.service_id ?? so.service ?? customer.serviceId,
                                                          },
                                                          customer.id
                                                        )
                                                      }
                                                      disabled={editDisabled}
                                                      className={`px-1.5 py-0.5 text-xs font-medium rounded transition-colors ${
                                                        editDisabled
                                                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                                          : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                                      }`}
                                                    >
                                                      Edit
                                                    </button>
                                                  </td>
                                                );
                                              }
                                              return null;
                                            })}
                                          </tr>
                                        ))}

                                        {/* Tertiary service rows */}
                                        {bookingServices[customer.id] && bookingServices[customer.id].map((service) => (
                                          <tr key={service.id} className="hover:bg-gray-50">
                                            {visibleOrderDetailColumns.map((col) => {
                                              if (col.id === 'orderId') return <td key={col.id} className="px-2 py-0.5 text-gray-700 whitespace-nowrap font-medium">{service.order_id || '-'}</td>;
                                              if (col.id === 'service') return (
                                                <td key={col.id} className="px-2 py-0.5 text-gray-900 whitespace-nowrap">
                                                  {service.service_name || 'Service'}
                                                </td>
                                              );
                                              if (col.id === 'package') return (
                                                <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                  {service.package_name || '-'}
                                                </td>
                                              );
                                              if (col.id === 'location') {
                                                const locText =
                                                  resolveOrderLocationText(service, customer.clientAddress || '') || '-';
                                                return (
                                                  <td
                                                    key={col.id}
                                                    className="px-2 py-0.5 text-gray-600 align-middle min-w-[8rem] max-w-[14rem]"
                                                    title={locText}
                                                  >
                                                    <span className="block max-w-[14rem] whitespace-normal break-words leading-snug">
                                                      {locText}
                                                    </span>
                                                  </td>
                                                );
                                              }
                                              if (col.id === 'start') return (
                                                <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                  {service.start_datetime ? new Date(service.start_datetime).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                </td>
                                              );
                                              if (col.id === 'end') return (
                                                <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                  {service.end_datetime ? new Date(service.end_datetime).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                </td>
                                              );
                                              if (col.id === 'created') return (
                                                <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                  {service.created_at ? new Date(service.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                                                </td>
                                              );
                                              if (col.id === 'modified') return (
                                                <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                  {service.updated_at || service.modified_at ? new Date(service.updated_at || service.modified_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                                                </td>
                                              );
                                              if (col.id === 'status') return (
                                                <td key={col.id} className="px-2 py-0.5 whitespace-nowrap">
                                                  {service.status && (
                                                    openStatusDropdown === `service-${service.id}` ? (
                                                      <select
                                                        autoFocus
                                                        disabled={isChangingStatus[service.id]}
                                                        onBlur={() => { if (!isChangingStatus[service.id]) setOpenStatusDropdown(null); }}
                                                        onChange={(e) => {
                                                          const newStatus = e.target.value;
                                                          if (newStatus) handleChangeServiceStatus(customer.id || customer.bookingId, service.id, newStatus);
                                                        }}
                                                        className={`font-medium border border-gray-300 rounded px-1.5 py-0.5 text-xs cursor-pointer whitespace-nowrap ${
                                                          service.status === 'BOOKED' ? 'text-green-600 bg-green-50' :
                                                          service.status === 'DRAFT' ? 'text-yellow-600 bg-yellow-50' :
                                                          service.status === 'CANCELLED' ? 'text-red-600 bg-red-50' :
                                                          'text-gray-600 bg-gray-50'
                                                        } ${isChangingStatus[service.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        defaultValue=""
                                                      >
                                                        <option value="">Select status...</option>
                                                        {(STATUS_TRANSITIONS[service.status] || []).filter((status) => status !== 'MODIFIED' && status !== 'RESCHEDULED').map((status) => (
                                                          <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
                                                        ))}
                                                      </select>
                                                    ) : (
                                                      <button
                                                        type="button"
                                                        onClick={() => setOpenStatusDropdown(`service-${service.id}`)}
                                                        className={`font-medium underline decoration-dotted cursor-pointer hover:opacity-80 inline-flex items-center gap-0.5 whitespace-nowrap ${
                                                          service.status === 'BOOKED' ? 'text-green-600' :
                                                          service.status === 'DRAFT' ? 'text-yellow-600' :
                                                          service.status === 'CANCELLED' ? 'text-red-600' :
                                                          'text-gray-600'
                                                        }`}
                                                      >
                                                        {service.status}
                                                        <FiChevronDown className="w-3.5 h-3.5 opacity-70" />
                                                      </button>
                                                    )
                                                  )}
                                                </td>
                                              );
                                              if (col.id === 'actions') {
                                                return (
                                                <td key={col.id} className="px-2 py-0.5 whitespace-nowrap">
                                                    <button
                                                    type="button"
                                                    onClick={() => openEditService(service, customer.id)}
                                                    disabled={service.status === 'CANCELLED' || service.status === 'FULFILLED'}
                                                    className={`px-1.5 py-0.5 text-xs font-medium rounded transition-colors ${
                                                      service.status === 'CANCELLED' || service.status === 'FULFILLED'
                                                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                                        : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                                    }`}
                                                  >
                                                    Edit
                                                  </button>
                                                </td>
                                              );
                                              }
                                              return null;
                                            })}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-500 py-1 mb-1">No services found</div>
                                )}

                                {/* Pagination Controls - Show when count > 10 */}
                                {servicePagination[customer.id]?.count > 10 && (
                                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-200">
                                    <div className="text-xs text-gray-600">
                                      Page {servicePagination[customer.id]?.current_page || 1} of {servicePagination[customer.id]?.total_pages || 1}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => {
                                          if (servicePagination[customer.id]?.previous) {
                                            fetchBookingServices(customer.id, false, servicePagination[customer.id].previous);
                                          }
                                        }}
                                        disabled={!servicePagination[customer.id]?.previous || loadingServices[customer.id]}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                                          !servicePagination[customer.id]?.previous || loadingServices[customer.id]
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                                        }`}
                                      >
                                        <FiChevronLeft className="w-3.5 h-3.5" />
                                        Previous
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (servicePagination[customer.id]?.next) {
                                            fetchBookingServices(customer.id, false, servicePagination[customer.id].next);
                                          }
                                        }}
                                        disabled={!servicePagination[customer.id]?.next || loadingServices[customer.id]}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                                          !servicePagination[customer.id]?.next || loadingServices[customer.id]
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                                        }`}
                                      >
                                        Next
                                        <FiChevronRight className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Add Service Form */}
                                <div className="space-y-1.5 border-t border-gray-200 pt-1.5">
                                  {(() => {
                                    const form = serviceForms[customer.id] || {};
                                    const selectedServiceId = form.serviceType;
                                    const addServiceOptions = getAddServiceOptions(customer.id);
                                    const isLoadingAddServices = Boolean(loadingAddServiceDropdown[customer.id]);
                                    const selectedServiceObj = selectedServiceId
                                      ? findAddServiceOption(customer.id, selectedServiceId)
                                      : null;
                                    const venues = getServiceVenues(selectedServiceObj);
                                    const usingClientLocation = isClientLocationSelection(form);
                                    return (
                                      <>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                          <select
                                            value={selectedServiceId || ''}
                                            onChange={(e) => handleServiceInputChange(customer.id, 'serviceType', e.target.value)}
                                            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300"
                                            disabled={isLoadingAddServices}
                                          >
                                            <option value="">
                                              {isLoadingAddServices ? 'Loading services...' : 'Select service...'}
                                            </option>
                                            {addServiceOptions.map((service) => (
                                              <option key={service.id} value={service.id}>{service.name}</option>
                                            ))}
                                          </select>
                                          <select
                                            value={form.selectedVenueId || ''}
                                            onChange={(e) => handleServiceInputChange(customer.id, 'selectedVenueId', e.target.value)}
                                            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300"
                                            disabled={!selectedServiceId}
                                            aria-label="Location"
                                          >
                                            {!selectedServiceId && (
                                              <option value="">Select service first</option>
                                            )}
                                            {selectedServiceId && (
                                              <>
                                                <option value="">Select location...</option>
                                                {venues.map((v) => (
                                                  <option key={v.id} value={v.id}>
                                                    {v.name}{v.locality ? ` (${v.locality})` : ''}
                                                  </option>
                                                ))}
                                                <option value={CLIENT_LOCATION_OPTION}>Client location</option>
                                              </>
                                            )}
                                          </select>
                                          <button
                                            onClick={() => handleAddService(customer.id, customer.patientId)}
                                            disabled={isAddingService[customer.id] || !selectedServiceId}
                                            className={`px-3 py-1 bg-indigo-600 text-white text-xs font-medium rounded transition-colors whitespace-nowrap flex items-center gap-2 ${
                                              isAddingService[customer.id] || !selectedServiceId
                                                ? 'opacity-50 cursor-not-allowed'
                                                : 'hover:bg-indigo-700'
                                            }`}
                                          >
                                            {isAddingService[customer.id] ? (
                                              <>
                                                <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                                                <span>Adding...</span>
                                              </>
                                            ) : (
                                              'Add'
                                            )}
                                          </button>
                                        </div>
                                        {selectedServiceId && usingClientLocation ? (
                                          <input
                                            type="text"
                                            value={form.clientAddress || ''}
                                            onChange={(e) => handleServiceInputChange(customer.id, 'clientAddress', e.target.value)}
                                            placeholder="Enter client location"
                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300"
                                            aria-label="Client location"
                                          />
                                        ) : null}
                                      </>
                                    );
                                  })()}

                                  {/* Service Package Information */}
                                  {(() => {
                                    const selectedServiceId = serviceForms[customer.id]?.serviceType;
                                    if (!selectedServiceId) return null;

                                    const packages = servicePackages[customer.id] || [];
                                    const isLoading = isLoadingServicePackages[customer.id];
                                    const selectedPackageId = serviceForms[customer.id]?.selectedPackageId;

                                    if (isLoading) {
                                      return (
                                        <div className="text-xs text-gray-500 py-2">Loading packages...</div>
                                      );
                                    }

                                    if (packages.length === 0 && selectedServiceId) {
                                      return (
                                        <div className="text-xs text-gray-500 py-2">No packages available for this service</div>
                                      );
                                    }

                                    // If only one package, show it as selected
                                    if (packages.length === 1) {
                                      const pkg = packages[0];
                                      const basePrice = parseFloat(pkg.price || 0);
                                      const discount = parseFloat(serviceForms[customer.id]?.discount || 0);
                                      const premium = parseFloat(serviceForms[customer.id]?.premium || 0);
                                      const adjustedPrice = Math.max(0, basePrice - discount + premium); // Ensure price never goes negative
                                      const hasAdjustments = discount > 0 || premium > 0;
                                      const maxDiscount = basePrice + premium; // Maximum discount allowed
                                      
                                      return (
                                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-1.5">
                                          <table className="w-full text-xs">
                                            <tbody>
                                              <tr>
                                                <td className="py-0.5 px-1 font-semibold text-gray-900 w-1/3">Package:</td>
                                                <td className="py-0.5 px-1 text-gray-700">{pkg.name}</td>
                                              </tr>
                                              <tr>
                                                <td className="py-0.5 px-1 font-semibold text-gray-900">Type:</td>
                                                <td className="py-0.5 px-1 text-gray-700">{pkg.package_type}</td>
                                              </tr>
                                              {hasAdjustments ? (
                                                <>
                                                  <tr>
                                                    <td className="py-0.5 px-1 font-semibold text-gray-900">Base Price:</td>
                                                    <td className="py-0.5 px-1 text-gray-500 line-through">₹{basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                  </tr>
                                                  {discount > 0 && (
                                                    <tr>
                                                      <td className="py-0.5 px-1 font-semibold text-gray-900">Discount:</td>
                                                      <td className="py-0.5 px-1 text-red-600">- ₹{discount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    </tr>
                                                  )}
                                                  {premium > 0 && (
                                                    <tr>
                                                      <td className="py-0.5 px-1 font-semibold text-gray-900">Premium:</td>
                                                      <td className="py-0.5 px-1 text-green-600">+ ₹{premium.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    </tr>
                                                  )}
                                                  <tr className="border-t border-indigo-200">
                                                    <td className="py-0.5 px-1 font-semibold text-gray-900">Final Price:</td>
                                                    <td className={`py-0.5 px-1 font-semibold ${adjustedPrice <= 0 ? 'text-red-600' : 'text-indigo-700'}`}>
                                                      ₹{adjustedPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                  </tr>
                                                </>
                                              ) : (
                                                <tr>
                                                  <td className="py-0.5 px-1 font-semibold text-gray-900">Price:</td>
                                                  <td className="py-0.5 px-1 font-semibold text-indigo-700">₹{basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                </tr>
                                              )}
                                              {pkg.created_at && (
                                                <tr className="border-t border-indigo-200">
                                                  <td className="py-0.5 px-1 font-semibold text-gray-900">Created:</td>
                                                  <td className="py-0.5 px-1 text-gray-600 text-[10px]">
                                                    {new Date(pkg.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                  </td>
                                                </tr>
                                              )}
                                              {pkg.updated_at && (
                                                <tr>
                                                  <td className="py-0.5 px-1 font-semibold text-gray-900">Modified:</td>
                                                  <td className="py-0.5 px-1 text-gray-600 text-[10px]">
                                                    {new Date(pkg.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                  </td>
                                                </tr>
                                              )}
                                            </tbody>
                                          </table>
                                          {adjustedPrice <= 0 && (
                                            <p className="text-[10px] text-red-600 mt-1 px-1">Max discount: ₹{maxDiscount.toFixed(2)}</p>
                                          )}
                                          <div className="grid grid-cols-2 gap-1.5 mt-1.5 pt-1.5 border-t border-indigo-200">
                                            <div>
                                              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Discount (₹)</label>
                                              <input
                                                type="number"
                                                min="0"
                                                max={maxDiscount}
                                                step="0.01"
                                                value={serviceForms[customer.id]?.discount || ''}
                                                onChange={(e) => handleServiceInputChange(customer.id, 'discount', e.target.value)}
                                                placeholder="0.00"
                                                className={`w-full px-1.5 py-1 text-[11px] border rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white ${
                                                  adjustedPrice <= 0 ? 'border-red-300' : 'border-gray-300'
                                                }`}
                                                title={adjustedPrice <= 0 ? `Maximum discount: ₹${maxDiscount.toFixed(2)}` : ''}
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">Premium (₹)</label>
                                              <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={serviceForms[customer.id]?.premium || ''}
                                                onChange={(e) => handleServiceInputChange(customer.id, 'premium', e.target.value)}
                                                placeholder="0.00"
                                                className="w-full px-1.5 py-1 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    }

                                    // If multiple packages, show selection
                                    if (packages.length > 1) {
                                      return (
                                        <div className="space-y-2">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Select Package:</label>
                                          <div className="space-y-2">
                                            {packages.map((pkg) => {
                                              const basePrice = parseFloat(pkg.price || 0);
                                              const discount = String(selectedPackageId) === String(pkg.id) ? parseFloat(serviceForms[customer.id]?.discount || 0) : 0;
                                              const premium = String(selectedPackageId) === String(pkg.id) ? parseFloat(serviceForms[customer.id]?.premium || 0) : 0;
                                              const adjustedPrice = Math.max(0, basePrice - discount + premium); // Ensure price never goes negative
                                              const hasAdjustments = String(selectedPackageId) === String(pkg.id) && (discount > 0 || premium > 0);
                                              const maxDiscount = basePrice + premium; // Maximum discount allowed
                                              
                                              return (
                                                <label
                                                  key={pkg.id}
                                                  className={`flex items-start gap-2 p-2 border rounded-lg cursor-pointer transition-colors ${
                                                    String(selectedPackageId) === String(pkg.id)
                                                      ? 'bg-indigo-50 border-indigo-500'
                                                      : 'bg-white border-gray-200 hover:border-gray-300'
                                                  }`}
                                                >
                                                  <input
                                                    type="radio"
                                                    name={`package-${customer.id}`}
                                                    value={pkg.id}
                                                    checked={String(selectedPackageId) === String(pkg.id)}
                                                    onChange={(e) => handleServiceInputChange(customer.id, 'selectedPackageId', e.target.value)}
                                                    className="mt-0.5 w-3.5 h-3.5 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                                  />
                                                  <div className="flex-1">
                                                    <table className="w-full text-xs">
                                                      <tbody>
                                                        <tr>
                                                          <td className="py-0.5 px-1 font-semibold text-gray-900 w-1/3">{pkg.name}</td>
                                                          <td className="py-0.5 px-1 text-gray-600">Type: <span className="font-medium">{pkg.package_type}</span></td>
                                                        </tr>
                                                        <tr>
                                                          <td className="py-0.5 px-1 text-gray-600">
                                                            {hasAdjustments ? (
                                                              <>
                                                                <span className="text-gray-500 line-through">₹{basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                <span className={`ml-1 font-medium ${adjustedPrice <= 0 ? 'text-red-600' : 'text-indigo-700'}`}>
                                                                  ₹{adjustedPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                </span>
                                                              </>
                                                            ) : (
                                                              <span className="font-medium text-indigo-700">₹{basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                            )}
                                                          </td>
                                                          <td className="py-0.5 px-1 text-gray-500 text-[10px]">
                                                            {pkg.created_at && `Created: ${new Date(pkg.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                                                            {pkg.updated_at && ` | Modified: ${new Date(pkg.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                                                          </td>
                                                        </tr>
                                                      </tbody>
                                                    </table>
                                                  </div>
                                                </label>
                                              );
                                            })}
                                          </div>
                                          {/* Discount and Premium Fields - Show when package is selected */}
                                          {selectedPackageId && (() => {
                                            const selectedPkg = packages.find(p => p.id === selectedPackageId);
                                            const basePrice = parseFloat(selectedPkg?.price || 0);
                                            const discount = parseFloat(serviceForms[customer.id]?.discount || 0);
                                            const premium = parseFloat(serviceForms[customer.id]?.premium || 0);
                                            const adjustedPrice = Math.max(0, basePrice - discount + premium); // Ensure price never goes negative
                                            const hasAdjustments = discount > 0 || premium > 0;
                                            const maxDiscount = basePrice + premium; // Maximum discount allowed
                                            
                                            return (
                                              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 mt-2">
                                                {/* Adjusted Price Display */}
                                                {hasAdjustments && (
                                                  <div className="mb-2 pb-2 border-b border-indigo-200">
                                                    <div className="flex items-center justify-between text-xs">
                                                      <span className="text-gray-600">Base Price:</span>
                                                      <span className="text-gray-500 line-through">₹{basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                    {discount > 0 && (
                                                      <div className="flex items-center justify-between text-xs text-red-600">
                                                        <span>Discount:</span>
                                                        <span>- ₹{discount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                      </div>
                                                    )}
                                                    {premium > 0 && (
                                                      <div className="flex items-center justify-between text-xs text-green-600">
                                                        <span>Premium:</span>
                                                        <span>+ ₹{premium.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                      </div>
                                                    )}
                                                    <div className="flex items-center justify-between text-xs font-semibold mt-1 pt-1 border-t border-indigo-200">
                                                      <span className="text-gray-700">Final Price:</span>
                                                      <span className={adjustedPrice <= 0 ? 'text-red-600' : 'text-indigo-700'}>
                                                        ₹{adjustedPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                      </span>
                                                    </div>
                                                    {adjustedPrice <= 0 && (
                                                      <p className="text-xs text-red-600 mt-1">Price cannot be negative. Discount limited.</p>
                                                    )}
                                                  </div>
                                                )}
                                                <div className="grid grid-cols-2 gap-2">
                                                  <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                      Discount (₹)
                                                    </label>
                                                    <input
                                                      type="number"
                                                      min="0"
                                                      max={maxDiscount}
                                                      step="0.01"
                                                      value={serviceForms[customer.id]?.discount || ''}
                                                      onChange={(e) => handleServiceInputChange(customer.id, 'discount', e.target.value)}
                                                      placeholder="0.00"
                                                      className={`w-full px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white ${
                                                        adjustedPrice <= 0 ? 'border-red-300' : 'border-gray-300'
                                                      }`}
                                                      title={adjustedPrice <= 0 ? `Maximum discount: ₹${maxDiscount.toFixed(2)}` : ''}
                                                    />
                                                    {adjustedPrice <= 0 && (
                                                      <p className="text-xs text-red-600 mt-0.5">Max discount: ₹{maxDiscount.toFixed(2)}</p>
                                                    )}
                                                  </div>
                                                  <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                      Premium (₹)
                                                    </label>
                                                    <input
                                                      type="number"
                                                      min="0"
                                                      step="0.01"
                                                      value={serviceForms[customer.id]?.premium || ''}
                                                      onChange={(e) => handleServiceInputChange(customer.id, 'premium', e.target.value)}
                                                      placeholder="0.00"
                                                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white"
                                                    />
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      );
                                    }

                                    return null;
                                  })()}

                                  {/* Date/Time: availability calendar + time pickers */}
                                  {(() => {
                                    const form = serviceForms[customer.id] || {};
                                    const selectedServiceId = form.serviceType;
                                    if (!selectedServiceId) return null;

                                    const packages = servicePackages[customer.id] || [];
                                    const selectedPackageId =
                                      form.selectedPackageId || (packages.length === 1 ? packages[0]?.id : null);
                                    if (!selectedPackageId) return null;

                                    const usingClientLocation = isClientLocationSelection(form);
                                    if (usingClientLocation) {
                                      if (!String(form.clientAddress || '').trim()) return null;
                                    } else if (!form.selectedVenueId) {
                                      return null;
                                    }

                                    const selectedPkg =
                                      packages.find((p) => String(p.id) === String(selectedPackageId)) || packages[0];
                                    const packagePeriod = (() => {
                                      const period = String(selectedPkg?.period || '').toUpperCase();
                                      if (period) return period;
                                      const type = String(selectedPkg?.package_type || '').toUpperCase();
                                      if (type.includes('MONTH')) return 'MONTHLY';
                                      if (type.includes('WEEK')) return 'WEEKLY';
                                      if (type.includes('HOUR')) return 'HOURLY';
                                      return 'DAILY';
                                    })();

                                    return (
                                      <div className="space-y-3">
                                        <BookingAvailabilityCalendar
                                          patientId={customer.patientId}
                                          serviceId={selectedServiceId}
                                          packagePeriod={packagePeriod}
                                          startDate={form.startDate || form.serviceDate || ''}
                                          endDate={form.endDate || ''}
                                          isVsreOwner={isVsreOwner}
                                          opdOnOccupiedAllowed
                                          onRangeChange={(range) =>
                                            handleAddServiceDateRangeChange(customer.id, range)
                                          }
                                          onUnavailableSelect={(message) =>
                                            showAlert(
                                              message ||
                                                'This date is past or blocked. Choose another date.',
                                              'warning'
                                            )
                                          }
                                          className="max-w-sm"
                                        />
                                        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                                          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                                            <FiClock className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
                                            Service schedule
                                          </div>
                                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                                Start
                                              </p>
                                              <div>
                                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                                  Date
                                                </label>
                                                <input
                                                  type="date"
                                                  value={form.startDate || form.serviceDate || ''}
                                                  min={localTodayYmd()}
                                                  onChange={(e) =>
                                                    handleServiceInputChange(customer.id, 'startDate', e.target.value)
                                                  }
                                                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                                                  aria-label="Start date"
                                                />
                                                <p className="mt-1 text-[10px] text-gray-500">
                                                  Or click a date on the calendar above
                                                </p>
                                              </div>
                                              <div>
                                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                                  Time
                                                </label>
                                                <TwelveHourTimeSelect
                                                  id={`add-service-start-${customer.id}`}
                                                  value={form.startTime || form.serviceTime || '00:00'}
                                                  onChange={(next) =>
                                                    handleServiceInputChange(customer.id, 'startTime', next)
                                                  }
                                                  aria-label="Start time"
                                                />
                                              </div>
                                            </div>
                                            <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                                End
                                              </p>
                                              <div>
                                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                                  Date
                                                </label>
                                                <input
                                                  type="date"
                                                  value={form.endDate || ''}
                                                  min={form.startDate || form.serviceDate || localTodayYmd()}
                                                  onChange={(e) =>
                                                    handleServiceInputChange(customer.id, 'endDate', e.target.value)
                                                  }
                                                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                                                  aria-label="End date"
                                                />
                                                <p className="mt-1 text-[10px] text-gray-500">
                                                  Or click a date on the calendar above
                                                </p>
                                              </div>
                                              <div>
                                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                                  Time
                                                </label>
                                                <TwelveHourTimeSelect
                                                  id={`add-service-end-${customer.id}`}
                                                  value={form.endTime || '23:59'}
                                                  onChange={(next) =>
                                                    handleServiceInputChange(customer.id, 'endTime', next)
                                                  }
                                                  aria-label="End time"
                                                />
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {customers.length > 0 && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-gray-600">
                  {totalCount > 0 && (
                    <span>
                      {appliedSearchQuery ? (
                        <>
                          {totalCount} result{totalCount !== 1 ? 's' : ''} for &quot;{appliedSearchQuery}&quot;
                        </>
                      ) : (
                        <>Total: {totalCount} customers</>
                      )}
                      {totalPages > 1 ? (
                        <span className="text-gray-500">
                          {' '}
                          · Page {currentPage} of {totalPages}
                        </span>
                      ) : null}
                      <span className="text-gray-500"> · {pageSize} per page</span>
                    </span>
                  )}
                </div>
                {(nextUrl || previousUrl || totalPages > 1) && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchCustomers(previousUrl)}
                    disabled={!previousUrl || isLoading}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                      !previousUrl || isLoading
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <FiChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <button
                    onClick={() => fetchCustomers(nextUrl)}
                    disabled={!nextUrl || isLoading}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                      !nextUrl || isLoading
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Next
                    <FiChevronRight className="w-4 h-4" />
                  </button>
                </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
        </>
      ) : (
        /* Orders View */
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex items-center gap-2 border-b border-gray-200 overflow-x-auto whitespace-nowrap">
            <button
              onClick={() => {
                setActiveOrdersTab('past');
                // Immediately fetch data for past orders when in order view mode
                if (viewMode === 'order' && fetchCustomers) {
                  const apiBookingType = toApiBookingType(selectedLocation);
                  fetchCustomers(null, appliedSearchQuery, 'past', selectedServiceId, apiBookingType, selectedStatus, startDateFilter, endDateFilter);
                }
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeOrdersTab === 'past'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Past ({viewMode === 'order' ? orderTabCounts.past : categorizedOrders.past.length})
            </button>
            <button
              onClick={() => {
                setActiveOrdersTab('present');
                // Immediately fetch data for present orders when in order view mode
                if (viewMode === 'order' && fetchCustomers) {
                  const apiBookingType = toApiBookingType(selectedLocation);
                  fetchCustomers(null, appliedSearchQuery, 'present', selectedServiceId, apiBookingType, selectedStatus, startDateFilter, endDateFilter);
                }
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeOrdersTab === 'present'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Present ({viewMode === 'order' ? orderTabCounts.present : categorizedOrders.present.length})
            </button>
            <button
              onClick={() => {
                setActiveOrdersTab('upcoming');
                // Immediately fetch data for upcoming orders when in order view mode
                if (viewMode === 'order' && fetchCustomers) {
                  const apiBookingType = toApiBookingType(selectedLocation);
                  fetchCustomers(null, appliedSearchQuery, 'upcoming', selectedServiceId, apiBookingType, selectedStatus, startDateFilter, endDateFilter);
                }
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeOrdersTab === 'upcoming'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Upcoming ({viewMode === 'order' ? orderTabCounts.upcoming : categorizedOrders.upcoming.length})
            </button>
          </div>

          {/* Loading State - Show below tabs */}
          {isLoading && viewMode === 'order' ? (
            <div className="flex items-center justify-center py-12 border border-gray-200 rounded-lg">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <p className="text-sm text-gray-600">Loading {activeOrdersTab} orders...</p>
              </div>
            </div>
          ) : activeOrders.length === 0 ? (
            <div className="text-center py-12 border border-gray-200 rounded-lg">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiUser className="w-8 h-8 text-gray-400" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                {activeOrdersTab === 'past' ? 'Past Orders' : activeOrdersTab === 'present' ? 'Present Orders' : 'Upcoming Orders'}
              </h4>
              <p className="text-sm text-gray-600">No {activeOrdersTab} orders to display</p>
            </div>
          ) : (
            <div>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-2 py-3 w-8 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider"></th>
                      {visibleOrderSummaryColumns.map((col, index) => (
                        <th
                          key={col.id}
                          draggable
                          onDragStart={(e) => handleOrderSummaryDragStart(e, index)}
                          onDragOver={(e) => handleOrderSummaryDragOver(e, index)}
                          onDragEnd={handleOrderSummaryDragEnd}
                          className={`px-2 py-2 text-left text-[11px] font-semibold text-gray-700 uppercase tracking-wider cursor-move select-none transition-all ${
                            orderSummaryDraggedColumn === index ? 'opacity-50 bg-indigo-50' : 'hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400 text-sm leading-none" style={{ fontFamily: 'monospace' }}>⋮⋮</span>
                            <span className="min-w-0">{col.label}</span>
                            {col.id === 'customer' ? renderPatientNameOrderingControl() : null}
                            {col.id === 'locationType' ? renderLocationTypeFilterControl() : null}
                            {col.id === 'package' ? renderServiceFilterControl() : null}
                            {col.id === 'status' ? renderStatusFilterControl() : null}
                            {col.id === 'startDate' ? renderStartDateFilterControl() : null}
                            {col.id === 'endDate' ? renderEndDateFilterControl() : null}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {activeOrders.map((order) => {
                      const isExpandedOrder = expandedOrderSummaryRows.has(order.id);
                      const originalBooking = customers.find(c => (c.bookingId || c.id) === order.id);
                      const secondaryOrders = originalBooking?.secondary_orders || [];
                      const ternaryOrders = (secondaryOrders || []).flatMap(so => so.ternary_orders || []);

                      return (
                        <React.Fragment key={order.id}>
                          <tr className="hover:bg-gray-50">
                            <td className="px-2 py-3 text-center">
                              {secondaryOrders.length > 0 || ternaryOrders.length > 0 ? (
                                <button
                                  onClick={() => {
                                    setExpandedOrderSummaryRows(prev => {
                                      const next = new Set(prev);
                                      if (next.has(order.id)) next.delete(order.id);
                                      else next.add(order.id);
                                      return next;
                                    });
                                  }}
                                  className="p-1 rounded hover:bg-gray-200 transition-colors"
                                  title={isExpandedOrder ? 'Hide order details' : 'Show order details'}
                                >
                                  {isExpandedOrder ? (
                                    <FiMinus className="w-3.5 h-3.5 text-gray-600" />
                                  ) : (
                                    <FiPlus className="w-3.5 h-3.5 text-gray-600" />
                                  )}
                                </button>
                              ) : null}
                            </td>
                            {visibleOrderSummaryColumns.map((col) => {
                              if (col.id === 'orderId') {
                                return (
                                  <td key={col.id} className="px-2 py-2 text-gray-700 font-medium whitespace-nowrap">
                                    {order.orderId || '-'}
                                  </td>
                                );
                              }
                              if (col.id === 'patientId') {
                                return (
                                  <td key={col.id} className="px-2 py-2 text-gray-700 whitespace-nowrap">
                                    {order.patientId || '-'}
                                  </td>
                                );
                              }
                              if (col.id === 'service') {
                                return (
                                  <td key={col.id} className="px-2 py-2">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-800 max-w-[120px] truncate">
                                      {order.packageType || '-'}
                                    </span>
                                  </td>
                                );
                              }
                              if (col.id === 'package') {
                                return (
                                  <td key={col.id} className="px-2 py-2 text-gray-700 whitespace-nowrap max-w-[140px] truncate">
                                    {order.serviceType || '-'}
                                  </td>
                                );
                              }
                              if (col.id === 'status') {
                                const statusLabel = order.status ? String(order.status).replace(/_/g, ' ') : '-';
                                const statusClass = order.status === 'CANCELLED' ? 'bg-red-50 text-red-700' :
                                  order.status === 'FULFILLED' ? 'bg-green-50 text-green-700' :
                                  order.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700' :
                                  order.status === 'YET_TO_START' ? 'bg-amber-50 text-amber-700' :
                                  order.status === 'UNFULFILLED' ? 'bg-orange-50 text-orange-700' :
                                  'bg-slate-100 text-slate-700';
                                return (
                                  <td key={col.id} className="px-2 py-2 whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${statusClass}`}>
                                      {statusLabel}
                                    </span>
                                  </td>
                                );
                              }
                              if (col.id === 'customer') {
                                return (
                                  <td key={col.id} className="px-2 py-2 text-gray-900 whitespace-nowrap max-w-[140px] truncate">
                                    {order.customerName}
                                  </td>
                                );
                              }
                              if (col.id === 'age') {
                                return (
                                  <td key={col.id} className="px-2 py-2 text-gray-700 whitespace-nowrap">
                                    {order.age ?? '-'}
                                  </td>
                                );
                              }
                              if (col.id === 'phone') {
                                return (
                                  <td key={col.id} className="px-2 py-2 text-gray-600 whitespace-nowrap">
                                    {order.phone || '-'}
                                  </td>
                                );
                              }
                              if (col.id === 'startDate') {
                                return (
                                  <td key={col.id} className="px-2 py-2 text-gray-600 whitespace-nowrap">
                                    {order.startDate
                                      ? new Date(order.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                      : '-'}
                                  </td>
                                );
                              }
                              if (col.id === 'endDate') {
                                return (
                                  <td key={col.id} className="px-2 py-2 text-gray-600 whitespace-nowrap">
                                    {order.endDate
                                      ? new Date(order.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                      : '-'}
                                  </td>
                                );
                              }
                              if (col.id === 'location') {
                                return (
                                  <td key={col.id} className="px-2 py-2 text-gray-600 align-middle min-w-[8rem] max-w-[14rem]" title={order.location || '-'}>
                                    <span className="block max-w-[14rem] whitespace-normal break-words leading-snug">
                                      {order.location || '-'}
                                    </span>
                                  </td>
                                );
                              }
                              if (col.id === 'locationType') {
                                return (
                                  <td key={col.id} className="px-2 py-2 text-gray-700 whitespace-nowrap">
                                    {formatBookingLocationType(order.bookingType)}
                                  </td>
                                );
                              }
                              if (col.id === 'locationLocality') {
                                const localityText = order.locationLocality || '-';
                                return (
                                  <td
                                    key={col.id}
                                    className="px-2 py-2 text-gray-600 align-middle min-w-[7rem] max-w-[12rem]"
                                    title={localityText}
                                  >
                                    <span className="block max-w-[12rem] whitespace-normal break-words leading-snug">
                                      {localityText}
                                    </span>
                                  </td>
                                );
                              }
                              if (col.id === 'emergencyContact') {
                                return (
                                  <td key={col.id} className="px-2 py-2 text-gray-600 whitespace-nowrap max-w-[140px] truncate">
                                    {order.emergencyContact || '-'}
                                  </td>
                                );
                              }
                              return null;
                            })}
                          </tr>

                          {isExpandedOrder && (secondaryOrders.length > 0 || ternaryOrders.length > 0) && (
                            <tr>
                              <td
                                colSpan={
                                  1 +
                                  (orderSummaryColumnVisibility.orderId ? 1 : 0) +
                                  (orderSummaryColumnVisibility.patientId ? 1 : 0) +
                                  (orderSummaryColumnVisibility.service ? 1 : 0) +
                                  (orderSummaryColumnVisibility.package ? 1 : 0) +
                                  (orderSummaryColumnVisibility.status ? 1 : 0) +
                                  (orderSummaryColumnVisibility.customer ? 1 : 0) +
                                  (orderSummaryColumnVisibility.age ? 1 : 0) +
                                  (orderSummaryColumnVisibility.phone ? 1 : 0) +
                                  (orderSummaryColumnVisibility.startDate ? 1 : 0) +
                                  (orderSummaryColumnVisibility.endDate ? 1 : 0) +
                                  (orderSummaryColumnVisibility.locationType ? 1 : 0) +
                                  (orderSummaryColumnVisibility.locationLocality ? 1 : 0) +
                                  (orderSummaryColumnVisibility.location ? 1 : 0) +
                                  (orderSummaryColumnVisibility.emergencyContact ? 1 : 0)
                                }
                                className="px-2 py-1 bg-gray-50 border-t border-gray-200"
                              >
                                <div className="space-y-1">
                                  <div className={secondaryOrders.length ? 'mt-2' : ''}>
                                    <div className="flex items-center justify-between mb-0.5">
                                      <h4 className="text-xs font-semibold text-gray-700">Orders</h4>
                                    </div>
                                    {secondaryOrders.length === 0 && ternaryOrders.length === 0 ? (
                                      <div className="text-xs text-gray-500 py-2">No secondary or tertiary orders.</div>
                                    ) : (
                                      <div className="border border-gray-200 rounded mb-1 overflow-x-auto">
                                        <table className="w-full text-xs leading-tight" style={{ minWidth: '1000px' }}>
                                          <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                              {visibleOrderDetailColumns.map((col, index) => (
                                                <th
                                                  key={col.id}
                                                  draggable
                                                  onDragStart={(e) => handleOrderDetailDragStart(e, index)}
                                                  onDragOver={(e) => handleOrderDetailDragOver(e, index)}
                                                  onDragEnd={handleOrderDetailDragEnd}
                                                  style={{ width: col.width }}
                                                  className={`px-2 py-0.5 text-left text-xs font-semibold text-gray-700 cursor-move select-none transition-all ${
                                                    orderDetailDraggedColumn === index ? 'opacity-50 bg-indigo-50' : 'hover:bg-gray-100'
                                                  }`}
                                                >
                                                  <div className="flex items-center gap-1">
                                                    <span className="text-gray-400 text-sm leading-none" style={{ fontFamily: 'monospace' }}>⋮⋮</span>
                                                    {col.label}
                                                  </div>
                                                </th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody className="bg-white divide-y divide-gray-200">
                                            {secondaryOrders.map((so) => (
                                              <tr key={`secondary-${so.id}`} className="hover:bg-gray-50">
                                                {visibleOrderDetailColumns.map((col) => {
                                                  if (col.id === 'orderId') return <td key={col.id} className="px-2 py-0.5 text-gray-700 whitespace-nowrap font-medium">{so.order_id || `#${so.id}`}</td>;
                                                  if (col.id === 'service') return (
                                                    <td key={col.id} className="px-2 py-0.5 whitespace-nowrap text-xs text-gray-900">
                                                      {so.service_name || 'Secondary period'}
                                                    </td>
                                                  );
                                                  if (col.id === 'package') return (
                                                    <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                      {so.package_name || '-'}
                                                    </td>
                                                  );
                                                  if (col.id === 'location') {
                                                    const locText =
                                                      resolveOrderLocationText(
                                                        so,
                                                        String(originalBooking?.bookingType || '').toUpperCase() ===
                                                          'CLIENT_SIDE'
                                                          ? originalBooking?.clientAddress || ''
                                                          : ''
                                                      ) || '-';
                                                    return (
                                                      <td
                                                        key={col.id}
                                                        className="px-2 py-0.5 text-gray-600 align-middle min-w-[8rem] max-w-[14rem]"
                                                        title={locText}
                                                      >
                                                        <span className="block max-w-[14rem] whitespace-normal break-words leading-snug">
                                                          {locText}
                                                        </span>
                                                      </td>
                                                    );
                                                  }
                                                  if (col.id === 'start') return (
                                                    <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                      {so.start_datetime ? new Date(so.start_datetime).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                    </td>
                                                  );
                                                  if (col.id === 'end') return (
                                                    <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                      {so.end_datetime ? new Date(so.end_datetime).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                    </td>
                                                  );
                                                  if (col.id === 'created') return (
                                                    <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                      {so.created_at ? new Date(so.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                                                    </td>
                                                  );
                                                  if (col.id === 'status') return (
                                                    <td key={col.id} className="px-2 py-0.5 whitespace-nowrap">
                                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-800">
                                                        {so.status || '-'}
                                                      </span>
                                                    </td>
                                                  );
                                                  return <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">-</td>;
                                                })}
                                              </tr>
                                            ))}

                                            {secondaryOrders.flatMap(so => (so.ternary_orders || []).map(to => ({ parentId: so.id, ...to }))).map((to) => (
                                              <tr key={`ternary-${to.id}`} className="hover:bg-gray-50 bg-white">
                                                {visibleOrderDetailColumns.map((col) => {
                                                  if (col.id === 'orderId') return <td key={col.id} className="px-2 py-0.5 text-gray-700 whitespace-nowrap font-medium">{to.order_id || `#${to.id}`}</td>;
                                                  if (col.id === 'service') return (
                                                    <td key={col.id} className="px-2 py-0.5 whitespace-nowrap text-xs text-gray-900">
                                                      {to.service_name || 'Service'}
                                                    </td>
                                                  );
                                                  if (col.id === 'package') return (
                                                    <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                      {to.package_name || '-'}
                                                    </td>
                                                  );
                                                  if (col.id === 'location') {
                                                    const locText =
                                                      resolveOrderLocationText(
                                                        to,
                                                        String(originalBooking?.bookingType || '').toUpperCase() ===
                                                          'CLIENT_SIDE'
                                                          ? originalBooking?.clientAddress || ''
                                                          : ''
                                                      ) || '-';
                                                    return (
                                                      <td
                                                        key={col.id}
                                                        className="px-2 py-0.5 text-gray-600 align-middle min-w-[8rem] max-w-[14rem]"
                                                        title={locText}
                                                      >
                                                        <span className="block max-w-[14rem] whitespace-normal break-words leading-snug">
                                                          {locText}
                                                        </span>
                                                      </td>
                                                    );
                                                  }
                                                  if (col.id === 'start') return (
                                                    <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                      {to.start_datetime ? new Date(to.start_datetime).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                    </td>
                                                  );
                                                  if (col.id === 'end') return (
                                                    <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                      {to.end_datetime ? new Date(to.end_datetime).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                    </td>
                                                  );
                                                  if (col.id === 'created') return (
                                                    <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">
                                                      {to.created_at ? new Date(to.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                                                    </td>
                                                  );
                                                  if (col.id === 'status') return (
                                                    <td key={col.id} className="px-2 py-0.5 whitespace-nowrap">
                                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-800">
                                                        {to.status || '-'}
                                                      </span>
                                                    </td>
                                                  );
                                                  return <td key={col.id} className="px-2 py-0.5 text-gray-600 whitespace-nowrap">-</td>;
                                                })}
                      </tr>
                    ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls for Orders */}
              {viewMode === 'order' && activeOrders.length > 0 && (
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-gray-600">
                      {totalCount > 0 && (
                        <span>
                          {appliedSearchQuery ? (
                            <>
                              {totalCount} result{totalCount !== 1 ? 's' : ''} for &quot;{appliedSearchQuery}&quot;
                            </>
                          ) : (
                            <>
                              Total: {totalCount} {activeOrdersTab === 'past' ? 'past' : activeOrdersTab === 'present' ? 'present' : 'upcoming'} orders
                            </>
                          )}
                          {totalPages > 1 ? (
                            <span className="text-gray-500">
                              {' '}
                              · Page {currentPage} of {totalPages}
                            </span>
                          ) : null}
                          <span className="text-gray-500"> · {pageSize} per page</span>
                        </span>
                      )}
                    </div>
                    {(nextUrl || previousUrl || totalPages > 1) && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => fetchCustomers(previousUrl)}
                        disabled={!previousUrl || isLoading}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                          !previousUrl || isLoading
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <FiChevronLeft className="w-4 h-4" />
                        Previous
                      </button>
                      <button
                        onClick={() => fetchCustomers(nextUrl)}
                        disabled={!nextUrl || isLoading}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                          !nextUrl || isLoading
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Next
                        <FiChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Column Chooser Modal */}
      {showColumnChooser && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowColumnChooser(false)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800">Column Chooser</h2>
              <button
                onClick={() => setShowColumnChooser(false)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <FiX className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Search – only relevant when editing main table columns (customer view) */}
            {viewMode === 'customer' && (
              <div className="px-6 py-3 border-b border-gray-200">
                <input
                  type="text"
                  placeholder="Search columns..."
                  value={columnSearchTerm}
                  onChange={(e) => setColumnSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
            )}

            {/* Column List */}
            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-4">
              {/* Main booking columns – only for customer view */}
              {viewMode === 'customer' && (
                <>
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 mb-1.5">Main table columns</h3>
                    {filteredColumns.map((column) => (
                      <label
                        key={column.id}
                        className="flex items-center gap-3 py-2 px-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group"
                      >
                        <input
                          type="checkbox"
                          checked={columnVisibility[column.id] || false}
                          onChange={() => toggleColumnVisibility(column.id)}
                          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span className="text-sm text-gray-700 group-hover:text-gray-900 font-medium">
                          {column.label}
                        </span>
                      </label>
                    ))}
                    {filteredColumns.length === 0 && (
                      <div className="text-center py-4 text-gray-500">
                        <p className="text-sm">No columns found</p>
                      </div>
                    )}
                  </div>

                  {/* Orders (periods & services) columns – for expanded per-booking table */}
                  <div className="border-t border-gray-200 pt-3">
                    <h3 className="text-xs font-semibold text-gray-500 mb-1.5">Secondary Order Columns</h3>
                    {[
                      { id: 'orderId', label: 'Order ID' },
                      { id: 'service', label: 'Service' },
                      { id: 'package', label: 'Package' },
                      { id: 'location', label: 'Location' },
                      { id: 'start', label: 'Start Date' },
                      { id: 'end', label: 'End Date' },
                      { id: 'created', label: 'Created Date' },
                      { id: 'modified', label: 'Modified Date' },
                      { id: 'status', label: 'Status' },
                      { id: 'actions', label: 'Actions' },
                    ].map((col) => (
                      <label
                        key={col.id}
                        className="flex items-center gap-3 py-1.5 px-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group"
                      >
                        <input
                          type="checkbox"
                          checked={orderDetailColumnVisibility[col.id] !== false}
                          onChange={() => toggleOrderDetailColumn(col.id)}
                          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span className="text-sm text-gray-700 group-hover:text-gray-900">
                          {col.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {/* Orders main table columns – only for Orders view */}
              {viewMode === 'order' && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 mb-1.5">Orders table columns</h3>
                  {[
                    { id: 'orderId', label: 'Order ID' },
                    { id: 'patientId', label: 'Patient ID' },
                    { id: 'service', label: 'Package Name' },
                    { id: 'package', label: 'Service Name' },
                    { id: 'status', label: 'Status' },
                    { id: 'customer', label: 'Patient Name' },
                    { id: 'age', label: 'Age' },
                    { id: 'phone', label: 'Phone' },
                    { id: 'startDate', label: 'Starting Date' },
                    { id: 'endDate', label: 'Ending Date' },
                    { id: 'locationType', label: 'Location type' },
                    { id: 'locationLocality', label: 'Locality' },
                    { id: 'location', label: 'Location' },
                    { id: 'emergencyContact', label: 'Emergency Contact' },
                  ].map((col) => (
                    <label
                      key={col.id}
                      className="flex items-center gap-3 py-1.5 px-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group"
                    >
                      <input
                        type="checkbox"
                        checked={orderSummaryColumnVisibility[col.id] !== false}
                        onChange={() => toggleOrderSummaryColumn(col.id)}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-gray-900">
                        {col.label}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowColumnChooser(false)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Service Modal - dates, package, and other fields */}
      {editingService && (() => {
        const currentStatus = editingService.status || '';
        // Determine which fields can be edited based on status
        const canEditPackage = currentStatus !== 'IN_PROGRESS' && currentStatus !== 'PARTIALLY_FULFILLED';
        const canEditStartDate = currentStatus === 'YET_TO_START' || currentStatus === 'UNFULFILLED' || currentStatus === 'HOLD' || currentStatus === 'DRAFT' || currentStatus === 'BOOKED';
        const canEditStartTime = currentStatus === 'YET_TO_START' || currentStatus === 'UNFULFILLED' || currentStatus === 'HOLD' || currentStatus === 'DRAFT' || currentStatus === 'BOOKED';
        const canEditEndDate = currentStatus === 'IN_PROGRESS' || currentStatus === 'PARTIALLY_FULFILLED' || currentStatus === 'YET_TO_START' || currentStatus === 'UNFULFILLED' || currentStatus === 'HOLD' || currentStatus === 'DRAFT' || currentStatus === 'BOOKED';
        const canEditEndTime = currentStatus === 'IN_PROGRESS' || currentStatus === 'PARTIALLY_FULFILLED' || currentStatus === 'YET_TO_START' || currentStatus === 'UNFULFILLED' || currentStatus === 'HOLD' || currentStatus === 'DRAFT' || currentStatus === 'BOOKED';
        return (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={closeEditService}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800">Edit service</h2>
              <button onClick={closeEditService} className="p-1 hover:bg-gray-100 rounded transition-colors">
                <FiX className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Service:</span> {editingService.serviceName}
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Package</label>
                {isLoadingEditServicePackages ? (
                  <p className="text-xs text-gray-500 py-1">Loading packages...</p>
                ) : (
                  <select
                    value={editServiceForm.packageId || ''}
                    onChange={(e) => handleEditServiceFormChange('packageId', e.target.value)}
                    disabled={!canEditPackage}
                    className={`w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 ${
                      !canEditPackage ? 'bg-gray-100 cursor-not-allowed opacity-60' : 'bg-white'
                    }`}
                  >
                    <option value="">Select package</option>
                    {editServicePackages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name || `Package ${pkg.id}`}
                        {pkg.price != null && pkg.price !== '' ? ` — ₹${parseFloat(pkg.price).toLocaleString('en-IN')}` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {!canEditPackage && (
                  <p className="text-xs text-gray-500 mt-0.5">Package cannot be modified for this status</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Discount amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={editServiceForm.discount ?? ''}
                  onChange={(e) => handleEditServiceFormChange('discount', e.target.value)}
                  disabled={!canEditPackage}
                  className={`w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 ${
                    !canEditPackage ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''
                  }`}
                />
                {!canEditPackage && (
                  <p className="text-xs text-gray-500 mt-0.5">Discount cannot be modified for this status</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Premium amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={editServiceForm.premium ?? ''}
                  onChange={(e) => handleEditServiceFormChange('premium', e.target.value)}
                  disabled={!canEditPackage}
                  className={`w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 ${
                    !canEditPackage ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''
                  }`}
                />
                {!canEditPackage && (
                  <p className="text-xs text-gray-500 mt-0.5">Premium cannot be modified for this status</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={editServiceForm.startDate}
                  onChange={(e) => handleEditServiceFormChange('startDate', e.target.value)}
                  disabled={!canEditStartDate}
                  className={`w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 ${
                    !canEditStartDate ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''
                  }`}
                />
                {!canEditStartDate && (
                  <p className="text-xs text-gray-500 mt-0.5">Start date cannot be modified for this status</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start Time</label>
                <TwelveHourTimeSelect
                  id="edit-service-start-time"
                  value={editServiceForm.startTime || '00:00'}
                  onChange={(next) => handleEditServiceFormChange('startTime', next)}
                  disabled={!canEditStartTime}
                  selectClassName={`w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60`}
                  aria-label="Start time"
                />
                {!canEditStartTime && (
                  <p className="text-xs text-gray-500 mt-0.5">Start time cannot be modified for this status</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={editServiceForm.endDate}
                  onChange={(e) => handleEditServiceFormChange('endDate', e.target.value)}
                  disabled={!canEditEndDate}
                  className={`w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 ${
                    !canEditEndDate ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''
                  }`}
                />
                {!canEditEndDate && (
                  <p className="text-xs text-gray-500 mt-0.5">End date cannot be modified for this status</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End Time</label>
                <TwelveHourTimeSelect
                  id="edit-service-end-time"
                  value={editServiceForm.endTime || '23:59'}
                  onChange={(next) => handleEditServiceFormChange('endTime', next)}
                  disabled={!canEditEndTime}
                  selectClassName={`w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60`}
                  aria-label="End time"
                />
                {!canEditEndTime && (
                  <p className="text-xs text-gray-500 mt-0.5">End time cannot be modified for this status</p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={closeEditService}
                disabled={isUpdatingService}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateServiceDates}
                disabled={isUpdatingService || !editServiceForm.startDate || !editServiceForm.endDate}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdatingService ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      
      
    </div>
  );
};

// Edit Customers Component
const EditCustomers = ({ customers, isLoading, error, nextUrl, previousUrl, totalCount, fetchCustomers, showAlert }) => {
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Mock function - API integration removed
  const handleSave = async () => {
    if (!selectedCustomer) {
      showAlert('Please select a customer to edit.', 'warning');
      return;
    }

    setIsSaving(true);

    // Mock success - no API call
    setTimeout(() => {
      showAlert('Customer updated successfully! (UI only - API removed)', 'success');
      // Reset form
      setSelectedCustomer(null);
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
      });
      setIsSaving(false);
    }, 500);
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-200 border-t-indigo-600 mx-auto mb-4"></div>
        <p className="text-sm text-gray-600">Loading customers...</p>
      </div>
    );
  }

  if (error && customers.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FiEdit className="w-8 h-8 text-red-400" />
        </div>
        <h4 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Customers</h4>
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button
        onClick={() => fetchCustomers()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Services</h3>

      {customers.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FiEdit className="w-8 h-8 text-gray-400" />
          </div>
          <h4 className="text-lg font-semibold text-gray-900 mb-2">No Customers Available</h4>
          <p className="text-sm text-gray-600">Select a customer to edit their details.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Customer List */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Select Customer</h4>
            <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => {
                    setSelectedCustomer(customer);
                    setFormData({
                      firstName: customer.firstName || '',
                      lastName: customer.lastName || '',
                      email: customer.email || '',
                      phone: customer.phone || '',
                      address: customer.address || '',
                    });
                  }}
                  className={`w-full text-left p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    selectedCustomer?.id === customer.id ? 'bg-indigo-50 border-indigo-200' : ''
                  }`}
                >
                  <p className="font-medium text-gray-900">{customer.name}</p>
                  <p className="text-xs text-gray-600">{customer.email}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Edit Form */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-700">Services</h4>
            {selectedCustomer ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
                  />
                </div>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                Select a customer from the list to edit
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {customers.length > 0 && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {totalCount > 0 && (
                <span>Total: {totalCount} customers</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchCustomers(previousUrl)}
                disabled={!previousUrl || isLoading}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                  !previousUrl || isLoading
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <FiChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={() => fetchCustomers(nextUrl)}
                disabled={!nextUrl || isLoading}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                  !nextUrl || isLoading
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Next
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default BookingDashboard;

