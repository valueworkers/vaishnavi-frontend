import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  FiCalendar, 
  FiUser, 
  FiPhone, 
  FiMail, 
  FiMapPin, 
  FiPackage, 
  FiSearch,
  FiFilter,
  FiTrendingUp,
  FiTrendingDown,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiRefreshCw,
  FiColumns,
  FiX,
  FiMoreVertical,
  FiPlus,
} from 'react-icons/fi';
import axios from 'axios';
import * as XLSX from 'xlsx';
import PatientSearchDropdown from './PatientSearchDropdown';
import MonthlyPayments from './MonthlyPayments';
import { hasOwnerPrivileges } from '../../utils/authRoles';

const parseInvoiceMoney = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

const formatBookingLocationType = (value) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '—';
  if (raw === 'IN_HOUSE') return 'In House';
  if (raw === 'CLIENT_SIDE') return 'Client Side';
  if (raw === 'OPD') return 'OPD';
  return raw.replace(/_/g, ' ');
};

/** Prefer booking.locality; if null/empty use booking.address. */
const resolveBookingLocality = (booking) => {
  const locality = String(booking?.locality ?? '').trim();
  if (locality) return locality;
  const address = String(booking?.address ?? '').trim();
  return address || '—';
};

/** Strip minus and non-numeric chars; keep one decimal point. */
const sanitizeNonNegativeAmountInput = (value) => {
  let v = String(value ?? '').replace(/[^\d.]/g, '');
  if (!v) return '';
  const dot = v.indexOf('.');
  if (dot !== -1) {
    v = `${v.slice(0, dot + 1)}${v.slice(dot + 1).replace(/\./g, '')}`;
  }
  if (v.startsWith('.')) v = `0${v}`;
  return v;
};

const blockNegativeNumberInputKey = (e) => {
  if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') {
    e.preventDefault();
  }
};

const PAYMENT_CLOCK_HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const PAYMENT_CLOCK_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

/** API format: `2026-05-28 18:29:59+05:30` from 12-hour clock (hour 1–12, minute, AM/PM). */
const buildIstPaidDateTimeFrom12h = (dateStr, hour12, minute, ampm) => {
  const date = String(dateStr || '').trim();
  if (!date || hour12 == null || hour12 === '' || minute == null || minute === '') return null;

  let h = parseInt(String(hour12), 10);
  const m = parseInt(String(minute), 10);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 1 || h > 12 || m < 0 || m > 59) return null;

  const period = String(ampm || '').trim().toUpperCase();
  if (period === 'AM') {
    if (h === 12) h = 0;
  } else if (period === 'PM') {
    if (h !== 12) h += 12;
  } else {
    return null;
  }

  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${date} ${hh}:${mm}:00+05:30`;
};

const PAYMENT_SECTIONS = {
  customer: 'customer',
  monthly: 'monthly',
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

const withOrdering = (requestUrl, ordering) => {
  if (!requestUrl) return null;
  try {
    const base = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '');
    const url = /^https?:\/\//i.test(requestUrl)
      ? new URL(requestUrl)
      : new URL(requestUrl.startsWith('/') ? requestUrl : `/${requestUrl}`, base);
    const order = String(ordering || '').trim();
    if (
      order === 'total_invoice_amount' ||
      order === '-total_invoice_amount' ||
      order === 'patient_first_name' ||
      order === '-patient_first_name'
    ) {
      url.searchParams.set('ordering', order);
    } else {
      url.searchParams.delete('ordering');
    }
    return url.toString();
  } catch {
    return requestUrl;
  }
};

const isPatientNameOrdering = (ordering) => {
  const order = String(ordering || '').trim();
  return order === 'patient_first_name' || order === '-patient_first_name';
};

const isTotalInvoiceOrdering = (ordering) => {
  const order = String(ordering || '').trim();
  return order === 'total_invoice_amount' || order === '-total_invoice_amount';
};

const PATIENT_NAME_ORDERING_OPTIONS = [
  { value: 'patient_first_name', label: 'A to Z' },
  { value: '-patient_first_name', label: 'Z to A' },
];

const TOTAL_INVOICE_ORDERING_OPTIONS = [
  { value: 'total_invoice_amount', label: 'Low to high' },
  { value: '-total_invoice_amount', label: 'High to low' },
];

const formatExportAmount = (amount) => {
  if (amount == null || amount === '') return '—';
  const raw = String(amount).trim();
  if (!raw) return '—';
  if (/^-?\d+(\.\d+)?$/.test(raw)) return `₹${raw}`;
  const numAmount = Number(amount);
  if (Number.isFinite(numAmount)) return `₹${raw}`;
  return '—';
};

const getCustomerPaymentExportCell = (customer, columnId) => {
  switch (columnId) {
    case 'customer':
      return customer.customerName || '—';
    case 'patient':
      return customer.patientName || 'N/A';
    case 'patientId':
      return customer.patientId != null && customer.patientId !== ''
        ? String(customer.patientId).padStart(5, '0')
        : '—';
    case 'patientPhone':
      return customer.patientPhone || '—';
    case 'onboardedDate':
      return formatExportDate(customer.onboardedDate);
    case 'totalInvoice':
      return formatExportAmount(customer.totalInvoice);
    case 'totalPayment':
      return formatExportAmount(customer.totalPayment);
    case 'balanceExcess': {
      const label = customer.balanceExcess >= 0 ? '(E)' : '(B)';
      return `${formatExportAmount(Math.abs(customer.balanceExcess))} ${label}`;
    }
    default:
      return '—';
  }
};

const formatExportDate = (dateString) => {
  if (!dateString) return '—';
  try {
    const normalized =
      typeof dateString === 'string' && dateString.includes(' ') && dateString.includes('+')
        ? dateString.replace(' ', 'T')
        : dateString;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return '—';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  } catch {
    return '—';
  }
};

const findInvoiceForTransaction = (invoicesList, transaction) =>
  invoicesList.find(
    (inv) =>
      inv.invoice_number === transaction.invoiceId ||
      inv.invoice_number === transaction.invoice ||
      inv.id === transaction.invoiceId
  ) || null;

const getInvoicePaymentsForExport = (invoice) => {
  if (!invoice) return [];
  if (Array.isArray(invoice.payments) && invoice.payments.length > 0) {
    return invoice.payments;
  }
  if (Array.isArray(invoice.payment_details)) {
    return invoice.payment_details.map((p) => ({
      id: p.id,
      created_at: p.payment_date,
      paid_date: p.paid_date || p.payment_date,
      amount: p.amount != null && p.amount !== '' ? String(p.amount) : '0',
      method: p.method,
      reference: p.reference,
      is_verified: p.is_verified,
    }));
  }
  return [];
};

const EXPORT_SKIP_INVOICE_COLUMNS = new Set(['paymentAction']);

const getInvoicePaymentExportCell = (transaction, invoice, columnId) => {
  const invoicePayments = getInvoicePaymentsForExport(invoice);
  const balanceExcess = (transaction.invoiceAmount || 0) - (transaction.amountPaid || 0);

  switch (columnId) {
    case 'invoiceDate':
      return formatExportDate(transaction.invoiceDate);
    case 'invoiceNumber':
      return transaction.invoice || invoice?.invoice_number || '—';
    case 'periodStart':
      return invoice?.period_start ? formatExportDate(invoice.period_start) : '—';
    case 'periodEnd':
      return invoice?.period_end ? formatExportDate(invoice.period_end) : '—';
    case 'bookingId':
      return invoice?.booking?.order_id || '—';
    case 'service':
      return invoice?.booking?.service || '—';
    case 'package':
      return invoice?.booking?.package || '—';
    case 'locationType':
      return formatBookingLocationType(invoice?.booking?.location_type);
    case 'venue':
      return invoice?.booking?.venue || '—';
    case 'locality':
      return resolveBookingLocality(invoice?.booking);
    case 'status':
      return invoice?.status || transaction.status || '—';
    case 'invoiceAmount':
      return formatExportAmount(transaction.invoiceAmount);
    case 'paid':
      return formatExportAmount(transaction.amountPaid);
    case 'balance': {
      const label = balanceExcess >= 0 ? '(B)' : '(E)';
      return `${formatExportAmount(Math.abs(balanceExcess))} ${label}`;
    }
    case 'paymentDetails':
      if (!invoicePayments.length) return '—';
      return invoicePayments
        .map((p) => {
          const parts = [
            formatExportDate(p.paid_date || p.created_at),
            p.method || '',
            p.amount != null && p.amount !== '' ? formatExportAmount(p.amount) : '',
            p.reference || '',
          ].filter(Boolean);
          return parts.join(' · ');
        })
        .join('; ');
    case 'discountPremium': {
      const discount = invoice?.discount_amount;
      const premium = invoice?.premium_amount;
      const parts = [];
      if (discount != null && String(discount) !== '' && Number(discount) !== 0) {
        parts.push(`Discount: ${formatExportAmount(discount)}`);
      }
      if (premium != null && String(premium) !== '' && Number(premium) !== 0) {
        parts.push(`Premium: ${formatExportAmount(premium)}`);
      }
      return parts.length ? parts.join('; ') : '—';
    }
    default:
      return '—';
  }
};

const CustomerPayment = () => {
  const [paymentSection, setPaymentSection] = useState(PAYMENT_SECTIONS.customer);
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]); // Store original invoice data with payments array
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedServiceType, setSelectedServiceType] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoiceStatus, setSelectedInvoiceStatus] = useState('');
  const [listOrdering, setListOrdering] = useState('');
  const [showPatientNameOrderingMenu, setShowPatientNameOrderingMenu] = useState(false);
  const [showTotalInvoiceOrderingMenu, setShowTotalInvoiceOrderingMenu] = useState(false);
  const [expandedPayments, setExpandedPayments] = useState(new Set());
  const [expandedCustomers, setExpandedCustomers] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false); // For next/previous pagination loading
  const [authUser, setAuthUser] = useState(null);
  const [nextUrl, setNextUrl] = useState(null);
  const [previousUrl, setPreviousUrl] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const pageSizeRef = useRef(DEFAULT_PAGE_SIZE);
  const listOrderingRef = useRef('');
  const patientNameOrderingRef = useRef(null);
  const totalInvoiceOrderingRef = useRef(null);
  const [error, setError] = useState('');
  const [summaryData, setSummaryData] = useState(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  // Member payment history (last 6 months) section
  const [selectedMember, setSelectedMember] = useState(null); // { customerId, customerName, patientId, patientName }
  const [memberHistoryPayments, setMemberHistoryPayments] = useState([]);
  const [isLoadingMemberHistory, setIsLoadingMemberHistory] = useState(false);
  const [filterMonths, setFilterMonths] = useState(6); // Number of months to filter (1-12)
  const [patientDropdownOptions, setPatientDropdownOptions] = useState([]); // Patient dropdown options from API
  const [isLoadingPatientDropdown, setIsLoadingPatientDropdown] = useState(false);
  // Pay invoice modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payModalInvoice, setPayModalInvoice] = useState(null); // raw invoice from API (has id, invoice_number, etc.)
  const [payModalTransaction, setPayModalTransaction] = useState(null);
  const [addPaymentModalOpen, setAddPaymentModalOpen] = useState(false);
  const [addPaymentPatient, setAddPaymentPatient] = useState(null);
  const [payForm, setPayForm] = useState({
    method: 'CASH',
    reference: '',
    amount: '',
    paidDate: '',
    paidHour: '12',
    paidMinute: '00',
    paidAmPm: 'AM',
  });
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Adjust discount/premium modal (loads invoice via GET /booking/invoices/:id/)
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustInvoice, setAdjustInvoice] = useState(null);
  const [adjustTransaction, setAdjustTransaction] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ discount: '', premium: '', issuedDate: '' });
  const [isLoadingAdjustInvoice, setIsLoadingAdjustInvoice] = useState(false);
  const [adjustLoadError, setAdjustLoadError] = useState('');
  const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);
  // Edit/delete CASH payment modal
  const [editPaymentModalOpen, setEditPaymentModalOpen] = useState(false);
  const [editPayment, setEditPayment] = useState(null); // {id, amount, method, paid_date, reference, is_verified}
  const [editPaymentInvoice, setEditPaymentInvoice] = useState(null); // parent invoice (for info)
  const [editPaymentModalAction, setEditPaymentModalAction] = useState('edit'); // 'edit' | 'delete'
  const [isSavingPaymentEdit, setIsSavingPaymentEdit] = useState(false);
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);
  const [editPaymentForm, setEditPaymentForm] = useState({ amount: '', method: 'CASH', paidDate: '', reference: '', isVerified: true });
  const [openPaymentActionMenu, setOpenPaymentActionMenu] = useState(null); // payment id for 3-dot menu
  const [paymentDetailsModal, setPaymentDetailsModal] = useState({ open: false, invoiceNumber: '', payments: [] });
  const paymentActionMenuRef = useRef(null);

  // Column configuration for main customer table
  const [allColumns] = useState([
    { id: 'customer', label: 'Customer', width: '150px', visible: true },
    { id: 'patient', label: 'Patient', width: '150px', visible: true },
    { id: 'patientId', label: 'Patient ID', width: '100px', visible: true },
    { id: 'patientPhone', label: 'Patient phone', width: '120px', visible: true },
    { id: 'onboardedDate', label: 'Onboarded date', width: '120px', visible: true },
    { id: 'totalInvoice', label: 'Total Invoice', width: '120px', visible: true },
    { id: 'totalPayment', label: 'Total Payment', width: '120px', visible: true },
    { id: 'balanceExcess', label: 'Balance/Excess', width: '130px', visible: true },
  ]);

  // Initialize column visibility and order from localStorage
  const [columnVisibility, setColumnVisibility] = useState(() => {
    const defaultVisibility = allColumns.reduce((acc, col) => ({ ...acc, [col.id]: col.visible }), {});
    try {
      const saved = localStorage.getItem('customerPayment_columnVisibility');
      if (saved) {
        const savedVisibility = JSON.parse(saved);
        // Merge with defaults to ensure new columns are included
        return { ...defaultVisibility, ...savedVisibility };
      }
    } catch (error) {
      console.error('Error loading column visibility:', error);
    }
    return defaultVisibility;
  });

  const [columnOrder, setColumnOrder] = useState(() => {
    const defaultOrder = allColumns.map(col => col.id);
    try {
      const saved = localStorage.getItem('customerPayment_columnOrder');
      if (saved) {
        const savedOrder = JSON.parse(saved);
        // Merge with defaults: add any new columns that aren't in saved order
        const newColumns = defaultOrder.filter(colId => !savedOrder.includes(colId));
        const mergedOrder = [...savedOrder, ...newColumns];
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

  // Column configuration for invoice detail table (expanded rows)
  const [invoiceAllColumns] = useState([
    { id: 'invoiceDate', label: 'Invoice Date', width: '110px', visible: true },
    { id: 'invoiceNumber', label: 'Invoice', width: '110px', visible: true },
    { id: 'periodStart', label: 'Period Start', width: '120px', visible: true },
    { id: 'periodEnd', label: 'Period End', width: '120px', visible: true },
    { id: 'bookingId', label: 'Booking ID', width: '110px', visible: true },
    { id: 'service', label: 'Service', width: '140px', visible: true },
    { id: 'package', label: 'Package', width: '160px', visible: true },
    { id: 'locationType', label: 'Location type', width: '110px', visible: true },
    { id: 'venue', label: 'Venue', width: '160px', visible: true },
    { id: 'locality', label: 'Locality', width: '140px', visible: true },
    { id: 'status', label: 'Status', width: '100px', visible: true },
    { id: 'invoiceAmount', label: 'Invoice Amt', width: '110px', visible: true },
    { id: 'paid', label: 'Paid', width: '90px', visible: true },
    { id: 'balance', label: 'Balance/Excess', width: '120px', visible: true },
    { id: 'paymentDetails', label: 'Payment details', width: '180px', visible: true },
    { id: 'discountPremium', label: 'Discount/Premium', width: '120px', visible: true },
    { id: 'paymentAction', label: 'Payment Action', width: '120px', visible: true },
  ]);

  const [invoiceColumnVisibility, setInvoiceColumnVisibility] = useState(() => {
    const def = invoiceAllColumns.reduce((acc, col) => ({ ...acc, [col.id]: col.visible }), {});
    try {
      const saved = localStorage.getItem('customerPayment_invoiceColumnVisibility');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...def, ...parsed };
      }
    } catch (error) {
      console.error('Error loading invoice column visibility:', error);
    }
    return def;
  });

  const [invoiceColumnOrder, setInvoiceColumnOrder] = useState(() => {
    const def = invoiceAllColumns.map(col => col.id);
    try {
      const saved = localStorage.getItem('customerPayment_invoiceColumnOrder');
      if (saved) {
        const parsed = JSON.parse(saved);
        const newOnes = def.filter(id => !parsed.includes(id));
        return [...parsed, ...newOnes];
      }
    } catch (error) {
      console.error('Error loading invoice column order:', error);
    }
    return def;
  });

  const [draggedInvoiceColumn, setDraggedInvoiceColumn] = useState(null);
  const [invoiceColumnSearchTerm, setInvoiceColumnSearchTerm] = useState('');

  // Save column visibility to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('customerPayment_columnVisibility', JSON.stringify(columnVisibility));
    } catch (error) {
      console.error('Error saving column visibility:', error);
    }
  }, [columnVisibility]);

  // Save column order to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('customerPayment_columnOrder', JSON.stringify(columnOrder));
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

  // Persist invoice detail column settings
  useEffect(() => {
    try {
      localStorage.setItem('customerPayment_invoiceColumnVisibility', JSON.stringify(invoiceColumnVisibility));
    } catch (error) {
      console.error('Error saving invoice column visibility:', error);
    }
  }, [invoiceColumnVisibility]);

  useEffect(() => {
    try {
      localStorage.setItem('customerPayment_invoiceColumnOrder', JSON.stringify(invoiceColumnOrder));
    } catch (error) {
      console.error('Error saving invoice column order:', error);
    }
  }, [invoiceColumnOrder]);

  const visibleInvoiceColumns = useMemo(() => {
    return invoiceColumnOrder
      .filter(id => invoiceColumnVisibility[id])
      .map(id => invoiceAllColumns.find(col => col.id === id))
      .filter(Boolean);
  }, [invoiceColumnOrder, invoiceColumnVisibility, invoiceAllColumns]);

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

  useEffect(() => {
    if (!openPaymentActionMenu) return;

    const handleClickOutside = (event) => {
      if (paymentActionMenuRef.current && !paymentActionMenuRef.current.contains(event.target)) {
        setOpenPaymentActionMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [openPaymentActionMenu]);

  const isVsreOwner = useMemo(() => hasOwnerPrivileges(authUser), [authUser]);

  // Fetch invoices from API
  const loadPayments = useCallback(async (url = null, searchQuery = '', append = false, monthFilter = null, statusFilter = '') => {
    const accessToken = localStorage.getItem('access_token');
    
    if (!accessToken) {
      setError('Authorization token missing. Please log in again.');
      setIsLoading(false);
      return;
    }

    // Set loading state - use isLoadingMore for next/previous pagination, isLoading for initial load
    if (url) {
      setIsLoadingMore(true);
    } else if (!append) {
      setIsLoading(true);
      setError('');
    }

    try {
      let apiUrl;
      if (url) {
        apiUrl = withOrdering(withPageSize(url, pageSizeRef.current), listOrderingRef.current);
      } else {
        // Build URL with query parameters
        const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}/booking/invoices/`;
        const params = [];
        
        // Add search query if provided
        if (searchQuery && searchQuery.trim()) {
          params.push(`search=${encodeURIComponent(searchQuery.trim())}`);
        }
        
        // Add month filter: selectedMonth is "YYYY-MM", API expects period_start__month=1..12 (1=Jan, 12=Dec)
        if (monthFilter && monthFilter.length >= 7) {
          const monthNum = parseInt(monthFilter.split('-')[1], 10);
          if (monthNum >= 1 && monthNum <= 12) {
            params.push(`period_start__month=${monthNum}`);
          }
        }
        
        // Add status filter if provided
        if (statusFilter) {
          params.push(`status=${encodeURIComponent(statusFilter)}`);
        }

        const ordering = listOrderingRef.current;
        if (
          ordering === 'total_invoice_amount' ||
          ordering === '-total_invoice_amount' ||
          ordering === 'patient_first_name' ||
          ordering === '-patient_first_name'
        ) {
          params.push(`ordering=${encodeURIComponent(ordering)}`);
        }

        params.push(`page_size=${clampPageSize(pageSizeRef.current)}`);
        
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

      // Store pagination from API: { count, total_pages, current_page, next, previous, results[] }
      setNextUrl(response.data?.next || null);
      setPreviousUrl(response.data?.previous || null);
      setTotalCount(response.data?.count || 0);
      setCurrentPage(response.data?.current_page || 1);
      setTotalPages(response.data?.total_pages || 1);

      // API shape (updated):
      // results[] = { user_id, user_name, patient_id, patient_name, patient_registration_date, patient_phone, total_invoice_amount, total_paid, total_balance, invoices[] }
      // invoices[] = { id, invoice_number, issued_date, total_amount, paid_amount, remaining_amount, status, payments[], booking: { service, package, locality, ... } }
      // payments[] = { id, amount, method, paid_date, reference, is_verified, created_at }
      const resultsData = response.data?.results || [];
      
      // Flatten the structure: extract all invoices from all results
      const allInvoices = [];
      resultsData.forEach(result => {
        if (result.invoices && Array.isArray(result.invoices)) {
          result.invoices.forEach(invoice => {
            // Store full invoice data with parent result info
            allInvoices.push({
              ...invoice,
              user_id: result.user_id,
              user_name: result.user_name,
              patient_id: result.patient_id,
              patient_name: result.patient_name,
              patient_registration_date: result.patient_registration_date,
              patient_phone: result.patient_phone,
              total_invoice_amount: result.total_invoice_amount,
              total_paid: result.total_paid,
              total_balance: result.total_balance,
            });
          });
        }
      });
      
      // Append or replace invoices based on append flag
      if (append) {
        setInvoices(prev => [...prev, ...allInvoices]);
      } else {
        setInvoices(allInvoices);
      }
      
      // Transform invoices to payments format
      // Each invoice becomes ONE transaction entry (not one per payment)
      const mappedPayments = allInvoices.map((invoice, index) => {
        // Get payment details from invoice (updated field: payments)
        const paymentDetails = invoice.payments || invoice.payment_details || [];
        const lastPayment = paymentDetails.length > 0 ? paymentDetails[paymentDetails.length - 1] : null;
        
        return {
          id: `invoice_${invoice.invoice_number}_${index}`,
          invoiceId: invoice.invoice_number, // Use invoice_number as ID since we don't have invoice.id
          invoiceNumber: invoice.invoice_number,
          invoiceDate: invoice.issued_date,
          timestamp: invoice.issued_date,
          patientId: invoice.patient_id,
          patientName: invoice.patient_name || `Patient #${invoice.patient_id}`,
          patientPhone: invoice.patient_phone || '',
          onboardedDate: invoice.patient_registration_date || null,
          userId: invoice.user_id,
          userName: invoice.user_name || `User #${invoice.user_id}`,
          groupTotalInvoiceAmount:
            invoice.total_invoice_amount != null && invoice.total_invoice_amount !== ''
              ? parseFloat(invoice.total_invoice_amount)
              : null,
          groupTotalPaid:
            invoice.total_paid != null && invoice.total_paid !== ''
              ? parseFloat(invoice.total_paid)
              : null,
          groupTotalBalance:
            invoice.total_balance != null && invoice.total_balance !== ''
              ? parseFloat(invoice.total_balance)
              : null,
          totalAmount: parseFloat(invoice.total_amount || invoice.invoice_amount || 0),
          paidAmount: parseFloat(invoice.paid_amount || invoice.paid || 0),
          remainingAmount: parseFloat(invoice.remaining_amount || invoice.balance || 0),
          status: invoice.status || (parseFloat(invoice.remaining_amount || invoice.balance || 0) <= 0 ? 'PAID' : 'PENDING'),
          dueDate: invoice.issued_date, // Use issued_date as due date
          // Store payment details for later use
          payments: paymentDetails.map(payment => ({
            id: payment.id,
            created_at: payment.created_at,
            paid_date: payment.paid_date || payment.created_at,
            amount:
              payment.amount != null && payment.amount !== ''
                ? String(payment.amount)
                : '0',
            method: payment.method,
            reference: payment.reference,
            is_verified: payment.is_verified === 'True' || payment.is_verified === true,
          })),
          // For backward compatibility with existing code
          totalPayableAmount: parseFloat(invoice.total_amount || invoice.invoice_amount || 0),
          invoiceAmount: parseFloat(invoice.total_amount || invoice.invoice_amount || 0),
          amountPaid: parseFloat(invoice.paid_amount || invoice.paid || 0),
          paymentDate: lastPayment ? (lastPayment.paid_date || lastPayment.created_at) : null,
          paymentMode: lastPayment ? lastPayment.method : null,
          paymentMethod: lastPayment ? lastPayment.method : null,
          date: invoice.issued_date, // For filtering
          booking: invoice.booking || null,
        };
      });

      // Append or replace payments based on append flag
      if (append) {
        setPayments(prev => [...prev, ...mappedPayments]);
      } else {
        setPayments(mappedPayments);
      }
    } catch (err) {
      console.error('Error fetching invoices:', err);
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.detail || 
                          err.message || 
                          'Failed to fetch invoices. Please try again.';
      if (!append) {
        setError(errorMessage);
        setPayments([]);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  // Fetch patient dropdown options from API
  const loadPatientDropdown = useCallback(async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return;

    setIsLoadingPatientDropdown(true);
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/patients/patient_dropdown/`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // API response is an array of { id, name }
      const patients = Array.isArray(response.data) ? response.data : [];
      setPatientDropdownOptions(patients);
    } catch (err) {
      console.error('Error fetching patient dropdown:', err);
      setPatientDropdownOptions([]);
    } finally {
      setIsLoadingPatientDropdown(false);
    }
  }, []);

  // Fetch payment history for a specific member using patient ID and filter_months
  const loadMemberPaymentHistory = useCallback(async (member, months = filterMonths) => {
    if (!member || !member.patientId) {
      setMemberHistoryPayments([]);
      return;
    }
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return;

    setIsLoadingMemberHistory(true);
    setMemberHistoryPayments([]);
    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}/booking/invoices/`;
      const params = [
        `patient=${member.patientId}`,
        `filter_months=${Math.max(1, Math.min(12, months))}`,
        'page_size=200'
      ];
      const apiUrl = `${baseUrl}?${params.join('&')}`;
      const response = await axios.get(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const resultsData = response.data?.results || [];
      const allInvoices = [];
      resultsData.forEach(result => {
        if (result.invoices && Array.isArray(result.invoices)) {
          result.invoices.forEach(invoice => {
            allInvoices.push({
              ...invoice,
              user_id: result.user_id,
              user_name: result.user_name,
              patient_id: result.patient_id,
              patient_name: result.patient_name,
            });
          });
        }
      });

      const mapped = allInvoices
        .map((invoice, index) => {
          const paymentDetails = invoice.payments || invoice.payment_details || [];
          const lastPayment = paymentDetails.length > 0 ? paymentDetails[paymentDetails.length - 1] : null;
          const paid = parseFloat(invoice.paid_amount || invoice.paid || 0);
          const balance = parseFloat(invoice.remaining_amount || invoice.balance || 0);
          const invoiceAmount = parseFloat(invoice.total_amount || invoice.invoice_amount || 0);
          return {
            id: `invoice_${invoice.invoice_number}_${index}`,
            invoiceNumber: invoice.invoice_number,
            invoiceDate: invoice.issued_date,
            patientId: invoice.patient_id,
            patientName: invoice.patient_name,
            userId: invoice.user_id,
            userName: invoice.user_name,
            totalAmount: invoiceAmount,
            paidAmount: paid,
            remainingAmount: balance,
            status: invoice.status || (balance <= 0 ? 'PAID' : 'PENDING'),
          };
        })
        .filter(
          (p) => {
            // Filter by patientId (required)
            const patientMatch = String(p.patientId) === String(member.patientId);
            // Filter by customerId only if it's provided
            if (member.customerId != null) {
              return patientMatch && String(p.userId) === String(member.customerId);
            }
            return patientMatch;
          }
        );

      mapped.sort((a, b) => {
        const da = new Date(a.invoiceDate || 0);
        const db = new Date(b.invoiceDate || 0);
        return db - da;
      });
      setMemberHistoryPayments(mapped);
    } catch (err) {
      console.error('Error fetching member payment history:', err);
      setMemberHistoryPayments([]);
    } finally {
      setIsLoadingMemberHistory(false);
    }
  }, [filterMonths]);

  // Fetch summary data from API
  const loadSummary = useCallback(async () => {
    const accessToken = localStorage.getItem('access_token');
    
    if (!accessToken) {
      return;
    }

    setIsLoadingSummary(true);
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/invoices/summary`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      setSummaryData(response.data);
    } catch (error) {
      console.error('Error fetching summary:', error);
      // Don't set error state for summary, just log it
    } finally {
      setIsLoadingSummary(false);
    }
  }, []);

  // Payment method options for Pay modal (value = API value, label = display)
  const PAYMENT_METHODS = [
    { value: 'CASH', label: 'Cash' },
    { value: 'UPI', label: 'UPI' },
    { value: 'CARD', label: 'Card' },
    { value: 'BANK', label: 'Bank' },
    { value: 'CHEQUE', label: 'Cheque' },
  ];

  const getDefaultIstDateAndTime = useCallback(() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
    const hours24 = ist.getUTCHours();
    const minutes = ist.getUTCMinutes();
    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    let hours12 = hours24 % 12;
    if (hours12 === 0) hours12 = 12;
    return {
      paidDate: `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`,
      paidHour: String(hours12),
      paidMinute: pad(minutes),
      paidAmPm: ampm,
    };
  }, []);

  const openPayModal = useCallback((invoice, transaction, balanceAmount) => {
    setAddPaymentModalOpen(false);
    setPayModalInvoice(invoice);
    setPayModalTransaction(transaction);
    const { paidDate } = getDefaultIstDateAndTime();
    setPayForm({
      method: 'CASH',
      reference: '',
      amount: balanceAmount > 0 ? Number(balanceAmount).toFixed(2) : '0.00',
      paidDate,
    });
    setPayModalOpen(true);
  }, [getDefaultIstDateAndTime]);

  const closePayModal = useCallback(() => {
    setPayModalOpen(false);
    setPayModalInvoice(null);
    setPayModalTransaction(null);
    setPayForm({
      method: 'CASH',
      reference: '',
      amount: '',
      paidDate: '',
      paidHour: '12',
      paidMinute: '00',
      paidAmPm: 'AM',
    });
    setError('');
  }, []);

  const handleSubmitPayment = useCallback(async () => {
    if (!payModalInvoice) return;
    const invoiceId = payModalInvoice.id;
    if (invoiceId == null || invoiceId === '') {
      setError('Invoice ID not found. Cannot submit payment.');
      return;
    }
    const amount = parseFloat(payForm.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      setError('Please enter an amount greater than zero.');
      return;
    }
    if (!payForm.paidDate) {
      setError('Please enter paid date.');
      return;
    }
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setError('Please log in to record payment.');
      return;
    }
    setIsSubmittingPayment(true);
    setError('');
    try {
      const paid_date = `${payForm.paidDate}T00:00:00+05:30`;

      await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/payments/`,
        {
          invoice_id: Number(invoiceId),
          amount: amount.toFixed(2),
          method: payForm.method,
          paid_date,
          is_verified: true,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      closePayModal();
      await loadPayments(null, searchQuery, false, selectedMonth, selectedInvoiceStatus);
      loadSummary();
    } catch (err) {
      console.error('Error submitting payment:', err);
      const msg = err.response?.data?.message ?? err.response?.data?.detail ?? err.message ?? 'Failed to record payment.';
      setError(msg);
    } finally {
      setIsSubmittingPayment(false);
    }
  }, [payModalInvoice, payForm, searchQuery, closePayModal, loadSummary, loadPayments, selectedMonth, selectedInvoiceStatus]);

  const openAddPaymentModal = useCallback(() => {
    setPayModalOpen(false);
    setPayModalInvoice(null);
    setPayModalTransaction(null);
    const { paidDate, paidHour, paidMinute, paidAmPm } = getDefaultIstDateAndTime();
    setAddPaymentPatient(null);
    setPayForm({
      method: 'CASH',
      reference: '',
      amount: '',
      paidDate,
      paidHour,
      paidMinute,
      paidAmPm,
    });
    setError('');
    setAddPaymentModalOpen(true);
  }, [getDefaultIstDateAndTime]);

  const closeAddPaymentModal = useCallback(() => {
    setAddPaymentModalOpen(false);
    setAddPaymentPatient(null);
    setPayForm({
      method: 'CASH',
      reference: '',
      amount: '',
      paidDate: '',
      paidHour: '12',
      paidMinute: '00',
      paidAmPm: 'AM',
    });
    setError('');
  }, []);

  const handleSubmitAddPayment = useCallback(async () => {
    const patientId = addPaymentPatient?.id ?? addPaymentPatient?.patient_id;
    const amount = parseFloat(payForm.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      setError('Please enter an amount greater than zero.');
      return;
    }
    if (!payForm.paidDate || !payForm.paidHour || !payForm.paidMinute || !payForm.paidAmPm) {
      setError('Please enter paid date and time.');
      return;
    }
    const paid_date = buildIstPaidDateTimeFrom12h(
      payForm.paidDate,
      payForm.paidHour,
      payForm.paidMinute,
      payForm.paidAmPm,
    );
    if (!paid_date) {
      setError('Invalid paid date or time.');
      return;
    }
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setError('Please log in to record payment.');
      return;
    }
    setIsSubmittingPayment(true);
    setError('');
    try {
      const payload = {
        amount,
        method: payForm.method,
        paid_date,
        is_verified: true,
        reference: payForm.reference?.trim() || '',
      };
      if (patientId != null && patientId !== '') {
        payload.patient_id = Number(patientId);
      }
      await axios.post(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/payments/create-unmapped/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      closeAddPaymentModal();
      await loadPayments(null, searchQuery, false, selectedMonth, selectedInvoiceStatus);
      loadSummary();
    } catch (err) {
      console.error('Error submitting payment:', err);
      const msg = err.response?.data?.message ?? err.response?.data?.detail ?? err.message ?? 'Failed to record payment.';
      setError(msg);
    } finally {
      setIsSubmittingPayment(false);
    }
  }, [
    addPaymentPatient,
    payForm,
    closeAddPaymentModal,
    loadPayments,
    searchQuery,
    selectedMonth,
    selectedInvoiceStatus,
    loadSummary,
  ]);

  const closeAdjustModal = () => {
    setAdjustModalOpen(false);
    setAdjustInvoice(null);
    setAdjustTransaction(null);
    setAdjustForm({ discount: '', premium: '', issuedDate: '' });
    setIsLoadingAdjustInvoice(false);
    setAdjustLoadError('');
  };

  const applyAdjustFormFromInvoice = (inv) => {
    if (!inv) return;
    setAdjustForm({
      discount:
        inv.discount_amount != null && inv.discount_amount !== ''
          ? String(inv.discount_amount)
          : '',
      premium:
        inv.premium_amount != null && inv.premium_amount !== ''
          ? String(inv.premium_amount)
          : '',
      issuedDate: inv.issued_date ? String(inv.issued_date).slice(0, 10) : '',
    });
  };

  const openAdjustModalForInvoice = useCallback(async (inv, tx) => {
    if (!inv?.id) return;

    setAdjustTransaction(tx);
    setAdjustInvoice(null);
    setAdjustForm({ discount: '', premium: '', issuedDate: '' });
    setAdjustLoadError('');
    setAdjustModalOpen(true);
    setIsLoadingAdjustInvoice(true);

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setAdjustLoadError('Please log in to load invoice details.');
      setIsLoadingAdjustInvoice(false);
      return;
    }

    try {
      const response = await axios.get(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/invoices/${inv.id}/`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const detail = response.data;
      setAdjustInvoice(detail);
      applyAdjustFormFromInvoice(detail);
    } catch (err) {
      console.error('Error loading invoice for adjustment:', err);
      const msg =
        err.response?.data?.message ??
        err.response?.data?.detail ??
        err.message ??
        'Failed to load invoice details.';
      setAdjustLoadError(msg);
    } finally {
      setIsLoadingAdjustInvoice(false);
    }
  }, []);

  const openEditPaymentModal = useCallback((invoice, payment, action = 'edit') => {
    if (!payment?.id) return;
    setEditPaymentModalAction(action);
    const paidDate = payment.paid_date ? String(payment.paid_date).slice(0, 10) : '';
    setEditPaymentInvoice(invoice || null);
    setEditPayment(payment);
    setEditPaymentForm({
      amount: payment.amount != null ? String(payment.amount) : '',
      method: payment.method || 'CASH',
      paidDate,
      reference: payment.reference || '',
      isVerified: payment.is_verified === true || payment.is_verified === 'True',
    });
    setEditPaymentModalOpen(true);
  }, []);

  const openPaymentDetailsModal = useCallback((invoiceNumber, invoicePayments) => {
    setPaymentDetailsModal({
      open: true,
      invoiceNumber: invoiceNumber || '',
      payments: Array.isArray(invoicePayments) ? invoicePayments : [],
    });
  }, []);

  const closePaymentDetailsModal = useCallback(() => {
    setPaymentDetailsModal({ open: false, invoiceNumber: '', payments: [] });
  }, []);

  const closeEditPaymentModal = useCallback(() => {
    setEditPaymentModalOpen(false);
    setEditPayment(null);
    setEditPaymentInvoice(null);
    setEditPaymentModalAction('edit');
    setEditPaymentForm({ amount: '', method: 'CASH', paidDate: '', reference: '', isVerified: true });
  }, []);

  const handleSavePaymentEdit = useCallback(async () => {
    if (!editPayment?.id) return;
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setError('Please log in to update payment.');
      return;
    }

    const payload = {};
    if (editPaymentForm.amount !== '') {
      const editAmount = parseFloat(editPaymentForm.amount);
      if (Number.isNaN(editAmount) || editAmount <= 0) {
        setError('Please enter an amount greater than zero.');
        return;
      }
      payload.amount = editAmount.toFixed(2);
    }
    if (editPaymentForm.method) payload.method = editPaymentForm.method;
    if (editPaymentForm.paidDate) payload.paid_date = `${editPaymentForm.paidDate}T00:00:00+05:30`;
    if (editPaymentForm.reference !== '') payload.reference = editPaymentForm.reference;
    payload.is_verified = Boolean(editPaymentForm.isVerified);

    try {
      setIsSavingPaymentEdit(true);
      setError('');
      await axios.patch(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/payments/${editPayment.id}/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      closeEditPaymentModal();
      await loadPayments(null, searchQuery, false, selectedMonth, selectedInvoiceStatus);
      loadSummary();
    } catch (err) {
      console.error('Error updating payment:', err);
      const msg =
        err.response?.data?.message ??
        err.response?.data?.detail ??
        err.message ??
        'Failed to update payment.';
      setError(msg);
    } finally {
      setIsSavingPaymentEdit(false);
    }
  }, [editPayment, editPaymentForm, closeEditPaymentModal, loadPayments, searchQuery, selectedMonth, selectedInvoiceStatus, loadSummary]);

  const handleDeletePayment = useCallback(async () => {
    if (!editPayment?.id) return;
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setError('Please log in to delete payment.');
      return;
    }
    try {
      setIsDeletingPayment(true);
      setError('');
      await axios.delete(`${import.meta.env.VITE_BASEURL_CARE}/booking/payments/${editPayment.id}/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      closeEditPaymentModal();
      await loadPayments(null, searchQuery, false, selectedMonth, selectedInvoiceStatus);
      loadSummary();
    } catch (err) {
      console.error('Error deleting payment:', err);
      const msg =
        err.response?.data?.message ??
        err.response?.data?.detail ??
        err.message ??
        'Failed to delete payment.';
      setError(msg);
    } finally {
      setIsDeletingPayment(false);
    }
  }, [editPayment, closeEditPaymentModal, loadPayments, searchQuery, selectedMonth, selectedInvoiceStatus, loadSummary]);

  useEffect(() => {
    if (isVsreOwner && paymentSection === PAYMENT_SECTIONS.customer) {
      loadPayments(null, '', false, selectedMonth, selectedInvoiceStatus);
      loadSummary();
      loadPatientDropdown();
    } else if (!isVsreOwner) {
      setIsLoading(false);
    }
  }, [
    isVsreOwner,
    paymentSection,
    loadSummary,
    selectedMonth,
    selectedInvoiceStatus,
    listOrdering,
    loadPayments,
    loadPatientDropdown,
  ]);

  // Handle search on Enter key press
  const handleSearch = useCallback(() => {
    if (isVsreOwner && paymentSection === PAYMENT_SECTIONS.customer && loadPayments) {
      loadPayments(null, searchQuery, false, selectedMonth, selectedInvoiceStatus);
    }
  }, [
    searchQuery,
    loadPayments,
    isVsreOwner,
    paymentSection,
    selectedMonth,
    selectedInvoiceStatus,
  ]);

  // Helper function to safely get month key from date
  const getMonthKeyFromDate = (dateValue) => {
    if (!dateValue) return null;
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return null;
      return date.toISOString().slice(0, 7);
    } catch (error) {
      console.error('Error parsing date:', dateValue, error);
      return null;
    }
  };

  // Helper function to safely format date
  const formatDateSafely = (dateValue) => {
    if (!dateValue) return 'Unknown';
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return 'Unknown';
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch (error) {
      console.error('Error formatting date:', dateValue, error);
      return 'Unknown';
    }
  };

  // Group payments by month
  const paymentsByMonth = useMemo(() => {
    const grouped = {};
    payments.forEach(payment => {
      // Try to get monthKey from payment.monthKey, or derive from timestamp, or use invoiceDate as fallback
      let monthKey = payment.monthKey;
      if (!monthKey && payment.timestamp) {
        monthKey = getMonthKeyFromDate(payment.timestamp);
      }
      if (!monthKey && payment.invoiceDate) {
        monthKey = getMonthKeyFromDate(payment.invoiceDate);
      }
      if (!monthKey && payment.date) {
        monthKey = getMonthKeyFromDate(payment.date);
      }
      
      // Skip if we still don't have a valid monthKey
      if (!monthKey) {
        console.warn('Payment missing valid date:', payment);
        return;
      }
      
      if (!grouped[monthKey]) {
        // Try to get month name from payment.month, or derive from timestamp/invoiceDate
        let monthName = payment.month;
        if (!monthName && payment.timestamp) {
          monthName = formatDateSafely(payment.timestamp);
        }
        if (!monthName && payment.invoiceDate) {
          monthName = formatDateSafely(payment.invoiceDate);
        }
        if (!monthName && payment.date) {
          monthName = formatDateSafely(payment.date);
        }
        
        grouped[monthKey] = {
          monthKey,
          month: monthName || 'Unknown',
          payments: [],
          totalAmount: 0
        };
      }
      grouped[monthKey].payments.push(payment);
      grouped[monthKey].totalAmount += payment.amount || 0;
    });
    
    return Object.values(grouped).sort((a, b) => {
      try {
        const dateA = new Date(a.monthKey + '-01');
        const dateB = new Date(b.monthKey + '-01');
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
        return dateB - dateA;
      } catch (error) {
        return 0;
      }
    });
  }, [payments]);

  // Months dropdown: present month + previous 8 months (9 options total)
  const availableMonths = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 0; i < 9; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      months.push({ key, label });
    }
    return months;
  }, []);

  const availableServiceTypes = useMemo(() => {
    const types = [...new Set(payments.map(p => p.serviceType).filter(Boolean))];
    return types;
  }, [payments]);

  // Map service type display names
  const getServiceTypeDisplayName = (serviceType) => {
    if (serviceType === 'Senior Care') {
      return 'Client location';
    }
    return serviceType;
  };

  // Group payments by customer and patient
  // IMPORTANT: Customer and Patient are DIFFERENT entities:
  // - Customer = ALWAYS the logged-in user (VSRE_OWNER viewing the dashboard)
  // - Patient = the person receiving care (from payment data)
  // Keep API result order (e.g. ordering=total_invoice_amount) — do not re-sort by name.
  const customersData = useMemo(() => {
    const customerPatientMap = {};
    const customerOrder = [];
    
    payments.forEach(payment => {
      // CUSTOMER: Use user_id and user_name from API response
      const customerId = payment.userId || payment.userName || authUser?.id || authUser?.email || authUser?.mobile_number || 'customer';
      const customerName = payment.userName || (authUser ? `${authUser.first_name || ''} ${authUser.last_name || ''}`.trim() || authUser.email || 'Customer' : 'Customer');
      const customerEmail = authUser?.email || '';
      const customerPhone = authUser?.mobile_number || '';
      
      // PATIENT: The person receiving care (separate entity)
      // Use patient-specific fields from payment data
      const patientId = payment.patientId || `patient_${payment.id}`;
      const patientName = payment.patientName || payment.customerName || 'Patient';
      const patientPhone = payment.patientPhone || '';
      const onboardedDate = payment.onboardedDate || null;
      
      // Ensure customer and patient are treated as different entities
      // Create unique key combining customer AND patient IDs
      const customerPatientKey = `customer_${customerId}_patient_${patientId}`;
      
      if (!customerPatientMap[customerPatientKey]) {
        customerOrder.push(customerPatientKey);
        const hasGroupTotals =
          payment.groupTotalInvoiceAmount != null ||
          payment.groupTotalPaid != null ||
          payment.groupTotalBalance != null;
        customerPatientMap[customerPatientKey] = {
          customerId,
          customerName,
          customerEmail,
          customerPhone,
          patientId,
          patientName,
          patientPhone,
          onboardedDate,
          transactions: [],
          totalInvoice: hasGroupTotals ? Number(payment.groupTotalInvoiceAmount) || 0 : 0,
          totalPayment: hasGroupTotals ? Number(payment.groupTotalPaid) || 0 : 0,
          balanceExcess: hasGroupTotals
            ? (Number(payment.groupTotalPaid) || 0) - (Number(payment.groupTotalInvoiceAmount) || 0)
            : 0,
          usedApiGroupTotals: hasGroupTotals,
        };
      }
      
      // Add transaction
      // Use finalAmount or invoiceAmount as total payable, fallback to amount for backward compatibility
      const totalPayable = payment.totalPayableAmount || payment.invoiceAmount || payment.finalAmount || payment.amount || 0;
      // Use amountPaid if explicitly set, otherwise use amount
      const paidAmount = payment.amountPaid || payment.amount || 0;
      
      const transaction = {
        id: payment.id,
        invoiceId: payment.invoiceId, // Store invoice ID to link back to original invoice
        date: payment.date || payment.timestamp || payment.invoiceDate, // Keep for backward compatibility
        invoiceDate: payment.invoiceDate || payment.invoice_date || payment.timestamp || payment.date, // Invoice date
        paidDate: payment.paidDate || payment.paid_date || payment.paymentDate || payment.payment_date || payment.timestamp || payment.date, // Payment/Paid date
        invoice: payment.invoiceNumber || payment.invoice_number || `${payment.invoiceId || payment.id}`,
        invoiceAmount: totalPayable, // Total payable amount (after discount)
        amountPaid: paidAmount, // Amount actually paid
        paymentMode: payment.paymentMode || payment.paymentMethod || payment.payment_method || 'Cash', // Default to Cash if not available
        serviceType: payment.serviceType,
        serviceDetails: payment.serviceDetails,
      };
      
      customerPatientMap[customerPatientKey].transactions.push(transaction);
      if (!customerPatientMap[customerPatientKey].usedApiGroupTotals) {
        customerPatientMap[customerPatientKey].totalInvoice += totalPayable;
        customerPatientMap[customerPatientKey].totalPayment += paidAmount;
      }
    });
    
    return customerOrder.map((key) => {
      const customer = customerPatientMap[key];
      if (customer.usedApiGroupTotals) {
        return customer;
      }
      return {
        ...customer,
        balanceExcess: customer.totalPayment - customer.totalInvoice,
      };
    });
  }, [payments, authUser]);

  // Filter customers based on search and filters
  const filteredCustomers = useMemo(() => {
    let filtered = customersData;

    // Filter by month
    if (selectedMonth) {
      filtered = filtered.map(customer => ({
        ...customer,
        transactions: customer.transactions.filter(t => {
          if (!t.date) return false;
          try {
            const transactionDate = new Date(t.date);
            if (isNaN(transactionDate.getTime())) return false;
            const monthKey = transactionDate.toISOString().slice(0, 7);
            return monthKey === selectedMonth;
          } catch (error) {
            console.error('Error filtering transaction by month:', t.date, error);
            return false;
          }
        })
      })).filter(customer => customer.transactions.length > 0);
    }

    // Filter by service type
    if (selectedServiceType) {
      filtered = filtered.map(customer => ({
        ...customer,
        transactions: customer.transactions.filter(t => t.serviceType === selectedServiceType)
      })).filter(customer => customer.transactions.length > 0);
    }

    // Search filtering is now handled by API - no client-side filtering needed

    // Recalculate totals after client filters; keep API group totals when unfiltered
    const customersWithTotals = filtered.map(customer => {
      if (customer.usedApiGroupTotals && !selectedMonth && !selectedServiceType) {
        return customer;
      }
      const totalInvoice = customer.transactions.reduce((sum, t) => sum + (t.invoiceAmount || 0), 0);
      const totalPayment = customer.transactions.reduce((sum, t) => sum + (t.amountPaid || 0), 0);
      return {
        ...customer,
        totalInvoice,
        totalPayment,
        balanceExcess: totalPayment - totalInvoice,
      };
    });

    return customersWithTotals;
  }, [customersData, selectedMonth, selectedServiceType, searchQuery]);

  // Filter and search payments
  const filteredPayments = useMemo(() => {
    let filtered = paymentsByMonth;

    // Filter by month
    if (selectedMonth) {
      filtered = filtered.filter(group => group.monthKey === selectedMonth);
    }

    // Filter by service type
    if (selectedServiceType) {
      filtered = filtered.map(group => ({
        ...group,
        payments: group.payments.filter(p => p.serviceType === selectedServiceType)
      })).filter(group => group.payments.length > 0);
    }

    // Search filtering is now handled by API - no client-side filtering needed

    return filtered;
  }, [paymentsByMonth, selectedMonth, selectedServiceType, searchQuery]);

  // Calculate statistics from API summary data
  const totalStats = useMemo(() => {
    if (summaryData) {
      // Use API summary data with new response structure
      // New API response: { total_invoices, total_amount, paid_amount, remaining_amount, unpaid_count, partially_paid_count, paid_count }
      const totalPaymentDue = parseFloat(summaryData.remaining_amount || 0);

      return {
        unpaidCount: summaryData.unpaid_count || 0,
        partiallyPaidCount: summaryData.partially_paid_count || 0,
        totalPaymentDue,
        totalInvoices: summaryData.total_invoices || 0,
        totalAmount: parseFloat(summaryData.total_amount || 0),
        paidAmount: parseFloat(summaryData.paid_amount || 0),
        paidCount: summaryData.paid_count || 0,
      };
    }

    // Fallback to calculated stats if API data not available
    const customersWithPending = customersData.filter((customer) => customer.balanceExcess < 0);
    const totalPaymentDue = Math.abs(
      customersWithPending.reduce((sum, customer) => sum + customer.balanceExcess, 0)
    );
    const totalAmount = customersData.reduce((sum, customer) => sum + (customer.totalInvoice || 0), 0);
    let unpaidCount = 0;
    let partiallyPaidCount = 0;
    for (const customer of customersData) {
      for (const t of customer.transactions || []) {
        const status = String(t.status || t.invoice?.status || '').toUpperCase();
        if (status === 'UNPAID') unpaidCount += 1;
        else if (status === 'PARTIALLY_PAID') partiallyPaidCount += 1;
      }
    }

    return {
      unpaidCount,
      partiallyPaidCount,
      totalPaymentDue,
      totalAmount,
    };
  }, [summaryData, customersData]);

  /** Exact amount from API (e.g. "35000.00") — no k/rounding shorthand. */
  const formatAmount = (amount) => {
    if (amount == null || amount === '') return '—';
    const raw = String(amount).trim();
    if (!raw) return '—';
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      return `₹${raw}`;
    }
    const numAmount = Number(amount);
    if (Number.isFinite(numAmount)) {
      return `₹${raw}`;
    }
    return '—';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return 'N/A';
    }
  };

  const formatShortDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting short date:', dateString, error);
      return 'N/A';
    }
  };

  const formatTableDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      // Support API format "2026-01-31 18:29:59+05:30" (space before timezone)
      const normalized = typeof dateString === 'string' && dateString.includes(' ') && dateString.includes('+')
        ? dateString.replace(' ', 'T')
        : dateString;
      const date = new Date(normalized);
      if (isNaN(date.getTime())) return 'N/A';
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      return `${day}-${month}-${year}`;
    } catch (error) {
      console.error('Error formatting table date:', dateString, error);
      return 'N/A';
    }
  };

  const togglePaymentExpansion = (paymentId) => {
    setExpandedPayments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(paymentId)) {
        newSet.delete(paymentId);
      } else {
        newSet.add(paymentId);
      }
      return newSet;
    });
  };

  const toggleCustomerExpansion = (customerId) => {
    setExpandedCustomers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(customerId)) {
        newSet.delete(customerId);
      } else {
        newSet.add(customerId);
      }
      return newSet;
    });
  };

  const applyListOrdering = useCallback(
    (nextOrdering) => {
      const value =
        nextOrdering === 'total_invoice_amount' ||
        nextOrdering === '-total_invoice_amount' ||
        nextOrdering === 'patient_first_name' ||
        nextOrdering === '-patient_first_name'
          ? nextOrdering
          : '';
      setListOrdering(value);
      listOrderingRef.current = value;
      setShowPatientNameOrderingMenu(false);
      setShowTotalInvoiceOrderingMenu(false);
      if (isVsreOwner && loadPayments) {
        loadPayments(null, searchQuery, false, selectedMonth, selectedInvoiceStatus);
      }
    },
    [isVsreOwner, loadPayments, searchQuery, selectedMonth, selectedInvoiceStatus]
  );

  const patientNameOrderingLabel = useMemo(
    () =>
      PATIENT_NAME_ORDERING_OPTIONS.find((option) => option.value === listOrdering)?.label ||
      '',
    [listOrdering]
  );

  const totalInvoiceOrderingLabel = useMemo(
    () =>
      TOTAL_INVOICE_ORDERING_OPTIONS.find((option) => option.value === listOrdering)?.label ||
      '',
    [listOrdering]
  );

  const clearFilters = useCallback(() => {
    setSelectedMonth(null);
    setSelectedServiceType(null);
    setSearchQuery('');
    setSelectedInvoiceStatus('');
    setListOrdering('');
    listOrderingRef.current = '';
    setShowPatientNameOrderingMenu(false);
    setShowTotalInvoiceOrderingMenu(false);
    if (isVsreOwner && loadPayments) {
      loadPayments(null, '', false, null, '');
    }
  }, [isVsreOwner, loadPayments]);

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

  // Invoice detail column drag handlers
  const handleInvoiceDragStart = (e, index) => {
    setDraggedInvoiceColumn(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleInvoiceDragOver = (e, index) => {
    e.preventDefault();
    if (draggedInvoiceColumn === null || draggedInvoiceColumn === index) return;

    const visibleIds = visibleInvoiceColumns.map(col => col.id);
    const draggedId = visibleIds[draggedInvoiceColumn];
    const targetId = visibleIds[index];

    const newOrder = [...invoiceColumnOrder];
    const draggedIndex = newOrder.indexOf(draggedId);
    const targetIndex = newOrder.indexOf(targetId);

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedId);

    setInvoiceColumnOrder(newOrder);
    setDraggedInvoiceColumn(index);
  };

  const handleInvoiceDragEnd = () => {
    setDraggedInvoiceColumn(null);
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

  const filteredInvoiceColumns = useMemo(() => {
    return invoiceAllColumns.filter(col =>
      col.label.toLowerCase().includes(invoiceColumnSearchTerm.toLowerCase())
    );
  }, [invoiceAllColumns, invoiceColumnSearchTerm]);

  const hasActiveFilters = selectedServiceType || searchQuery.trim() || selectedInvoiceStatus;

  const exportExcel = useCallback(() => {
    const exportInvoiceColumns = visibleInvoiceColumns.filter(
      (col) => !EXPORT_SKIP_INVOICE_COLUMNS.has(col.id)
    );

    if (!visibleColumns.length && !exportInvoiceColumns.length) {
      setError('Please keep at least one visible column before exporting.');
      return;
    }
    if (!filteredCustomers.length) {
      setError('No customer payment rows to export.');
      return;
    }

    try {
      setError('');
      const headerRow = [
        ...visibleColumns.map((col) => col.label),
        ...exportInvoiceColumns.map((col) => col.label),
      ];

      const dataRows = [];
      filteredCustomers.forEach((customer) => {
        const transactions =
          customer.transactions?.length > 0 ? customer.transactions : [null];

        transactions.forEach((transaction) => {
          const invoice = transaction ? findInvoiceForTransaction(invoices, transaction) : null;
          dataRows.push([
            ...visibleColumns.map((col) => getCustomerPaymentExportCell(customer, col.id)),
            ...exportInvoiceColumns.map((col) =>
              transaction
                ? getInvoicePaymentExportCell(transaction, invoice, col.id)
                : '—'
            ),
          ]);
        });
      });

      const sheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Customer Payments');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `customer-payments-${stamp}.xlsx`);
    } catch (e) {
      setError(e?.message || 'Unable to export Excel file.');
    }
  }, [visibleColumns, visibleInvoiceColumns, filteredCustomers, invoices]);

  useEffect(() => {
    pageSizeRef.current = pageSize;
  }, [pageSize]);

  useEffect(() => {
    listOrderingRef.current = listOrdering;
  }, [listOrdering]);

  useEffect(() => {
    if (!showPatientNameOrderingMenu && !showTotalInvoiceOrderingMenu) return;
    const onDocClick = (event) => {
      if (
        showPatientNameOrderingMenu &&
        patientNameOrderingRef.current &&
        !patientNameOrderingRef.current.contains(event.target)
      ) {
        setShowPatientNameOrderingMenu(false);
      }
      if (
        showTotalInvoiceOrderingMenu &&
        totalInvoiceOrderingRef.current &&
        !totalInvoiceOrderingRef.current.contains(event.target)
      ) {
        setShowTotalInvoiceOrderingMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showPatientNameOrderingMenu, showTotalInvoiceOrderingMenu]);

  const handlePageSizeChange = useCallback(
    (e) => {
      const next = clampPageSize(Number(e.target.value));
      setPageSize(next);
      pageSizeRef.current = next;
      if (isVsreOwner && loadPayments) {
        loadPayments(null, searchQuery, false, selectedMonth, selectedInvoiceStatus);
      }
    },
    [isVsreOwner, loadPayments, searchQuery, selectedMonth, selectedInvoiceStatus]
  );

  const adjustAmountPreview = useMemo(() => {
    const amount = parseInvoiceMoney(
      adjustInvoice?.subtotal ??
        adjustInvoice?.total_amount ??
        adjustInvoice?.invoice_amount ??
        adjustTransaction?.invoiceAmount
    );
    // Fixed from API load — does not change when discount/premium inputs are edited
    const alreadyDiscounted = parseInvoiceMoney(adjustInvoice?.discount_amount);
    const savedPremium = parseInvoiceMoney(adjustInvoice?.premium_amount);
    const hasPremium = savedPremium > 0;
    return { amount, alreadyDiscounted, savedPremium, hasPremium };
  }, [adjustInvoice, adjustTransaction]);

  const handleSaveAdjustment = useCallback(async () => {
    if (!adjustInvoice?.id) {
      closeAdjustModal();
      return;
    }
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setError('Please log in to update invoice.');
      return;
    }

    const payload = {};
    if (adjustForm.discount !== '') {
      payload.discount_amount = Number(adjustForm.discount || 0).toFixed(2);
    }
    if (adjustForm.premium !== '') {
      payload.premium_amount = Number(adjustForm.premium || 0).toFixed(2);
    }
    if (adjustForm.issuedDate) {
      payload.issued_date = adjustForm.issuedDate;
    }

    if (Object.keys(payload).length === 0) {
      closeAdjustModal();
      return;
    }

    try {
      setIsSavingAdjustment(true);
      setError('');
      await axios.patch(
        `${import.meta.env.VITE_BASEURL_CARE}/booking/invoices/${adjustInvoice.id}/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      closeAdjustModal();
      await loadPayments(null, searchQuery, false, selectedMonth, selectedInvoiceStatus);
      loadSummary();
    } catch (err) {
      console.error('Error updating invoice:', err);
      const msg =
        err.response?.data?.message ??
        err.response?.data?.detail ??
        err.message ??
        'Failed to update invoice.';
      setError(msg);
    } finally {
      setIsSavingAdjustment(false);
    }
  }, [adjustInvoice, adjustForm, closeAdjustModal, loadPayments, searchQuery, selectedMonth, selectedInvoiceStatus, loadSummary]);

  if (!isVsreOwner) {
    return (
      <div className="py-3 px-1">
        <div className="w-full">
          <div className="bg-gray-50 rounded-xl p-8 border-2 border-gray-200 text-center">
            <p className="text-gray-700 text-lg font-medium mb-2">Only VSRE_OWNER can access this section.</p>
            {authUser ? (
              <p className="text-sm text-gray-500">
                Current user type: <span className="font-semibold">{authUser.user_type || 'Not found'}</span>
              </p>
            ) : (
              <p className="text-sm text-gray-500">No user logged in. Please log in as VSRE_OWNER.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const paymentSectionToggle = (
    <div
      className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-0.5"
      role="tablist"
      aria-label="Payment view"
    >
      <button
        type="button"
        role="tab"
        aria-selected={paymentSection === PAYMENT_SECTIONS.customer}
        onClick={() => setPaymentSection(PAYMENT_SECTIONS.customer)}
        className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
          paymentSection === PAYMENT_SECTIONS.customer
            ? 'bg-white text-indigo-700 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Customer Invoices
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={paymentSection === PAYMENT_SECTIONS.monthly}
        onClick={() => setPaymentSection(PAYMENT_SECTIONS.monthly)}
        className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
          paymentSection === PAYMENT_SECTIONS.monthly
            ? 'bg-white text-indigo-700 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Monthly Payments
      </button>
    </div>
  );

  return (
    <div className="py-1 px-1">
      <div className="w-full">
        <div className="mb-1">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
            <div className="flex flex-wrap items-center gap-2">
             
              {paymentSectionToggle}
            </div>
            {paymentSection === PAYMENT_SECTIONS.customer ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowColumnChooser(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-colors"
                  title="Column Chooser"
                >
                  <FiColumns className="w-3.5 h-3.5 text-gray-600" />
                  <span className="text-gray-700">Columns</span>
                </button>
                <button
                  type="button"
                  onClick={exportExcel}
                  disabled={isLoading || filteredCustomers.length === 0}
                  className="rounded-lg border border-emerald-700 bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Export current list to Excel"
                >
                  Export Excel
                </button>
                <label className="text-xs font-medium text-gray-600" htmlFor="customer-payment-page-size">
                  Rows:
                </label>
                <select
                  id="customer-payment-page-size"
                  value={String(pageSize)}
                  onChange={handlePageSizeChange}
                  className="min-w-[4.5rem] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-300"
                  title="Rows per page (max 100)"
                >
                  {PAGE_SIZE_PRESETS.map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-gray-500">
                  Main {visibleColumns.length}/{allColumns.length} · Invoice{' '}
                  {visibleInvoiceColumns.length}/{invoiceAllColumns.length}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {paymentSection === PAYMENT_SECTIONS.monthly ? (
          <MonthlyPayments />
        ) : isLoading ? (
          <div className="bg-white rounded-lg shadow-md p-6 text-center border border-gray-200">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600 mx-auto" />
            <p className="text-gray-600 mt-3 text-xs">Loading payment data...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow-md p-6 text-center border border-red-200">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl text-red-600 font-bold">!</span>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-2">Error Loading Invoices</h3>
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <button
              onClick={() => {
                loadPayments(null, searchQuery, false, selectedMonth, selectedInvoiceStatus);
                loadSummary();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              Retry
            </button>
          </div>
        ) : (
          <>

          {/* Statistics Cards */}
          <div className="mb-0.5 grid w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
            <div className="flex min-h-[3.25rem] w-full items-center gap-1.5 rounded border border-indigo-200 bg-linear-to-br from-indigo-50 to-indigo-100 p-2 shadow-sm">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-indigo-200">
                <FiUser className="h-3.5 w-3.5 text-indigo-800" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] leading-tight text-indigo-600">Customers</p>
                <p className="text-sm font-bold leading-tight text-indigo-900">{totalCount ?? 0}</p>
              </div>
            </div>

            <div className="flex min-h-[3.25rem] w-full items-center gap-1.5 rounded border border-red-200 bg-linear-to-br from-red-50 to-red-100 p-2 shadow-sm">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-red-200">
                <span className="text-red-800 text-xs font-bold">!</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] leading-tight text-red-600">Unpaid invoices</p>
                <p className="text-sm font-bold leading-tight text-red-900">{totalStats.unpaidCount ?? 0}</p>
              </div>
            </div>

            <div className="flex min-h-[3.25rem] w-full items-center gap-1.5 rounded border border-amber-200 bg-linear-to-br from-amber-50 to-amber-100 p-2 shadow-sm">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-amber-200">
                <span className="text-amber-800 text-xs font-bold">◐</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] leading-tight text-amber-700">Partially paid invoices</p>
                <p className="text-sm font-bold leading-tight text-amber-900">{totalStats.partiallyPaidCount ?? 0}</p>
              </div>
            </div>

            <div className="flex min-h-[3.25rem] w-full items-center gap-1.5 rounded border border-orange-200 bg-linear-to-br from-orange-50 to-orange-100 p-2 shadow-sm">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-orange-200">
                <span className="text-orange-800 text-xs font-bold">₹</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] leading-tight text-orange-700">Total payment due</p>
                <p className="truncate text-sm font-bold leading-tight text-orange-900">
                  {formatAmount(totalStats.totalPaymentDue)}
                </p>
              </div>
            </div>

            <div className="flex min-h-[3.25rem] w-full items-center gap-1.5 rounded border border-blue-200 bg-linear-to-br from-blue-50 to-blue-100 p-2 shadow-sm">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-blue-200">
                <span className="text-blue-700 text-xs font-bold">₹</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] leading-tight text-blue-600">Total amount</p>
                <p className="truncate text-sm font-bold leading-tight text-blue-900">
                  {formatAmount(totalStats.totalAmount || 0)}
                </p>
              </div>
            </div>
          </div>

        {/* Search and Filters */}
        <div className="bg-white rounded shadow-sm p-1.5 mb-1 border border-gray-200 overflow-hidden">
          <div className="space-y-1.5 min-w-0">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-1.5">
              <div className="md:col-span-5 min-w-0">
                <div className="flex items-stretch gap-1.5">
                  <div className="relative min-w-0 flex-1">
                    <FiSearch className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by patient, phone, id..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSearch();
                        }
                      }}
                      className="w-full rounded border border-gray-300 py-1.5 pl-8 pr-2 text-xs text-gray-900 focus:border-blue-300 focus:ring-1 focus:ring-blue-300"
                      aria-label="Search by patient, phone, or id"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSearch}
                    className="inline-flex shrink-0 items-center justify-center gap-1 rounded border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    title="Search"
                  >
                    <FiSearch className="h-3.5 w-3.5 shrink-0" />
                    <span>Search</span>
                  </button>
                </div>
              </div>

              <div className="md:col-span-4 min-w-0">
                <select
                  value={selectedInvoiceStatus}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedInvoiceStatus(value);
                    if (isVsreOwner && loadPayments) {
                      loadPayments(null, searchQuery, false, selectedMonth, value);
                    }
                  }}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-300 focus:border-blue-300 text-gray-900 bg-white"
                >
                  <option value="">Filter by Status</option>
                  <option value="UNPAID">Unpaid</option>
                  <option value="PARTIALLY_PAID">Partially Paid</option>
                  <option value="PAID">Paid</option>
                  <option value="OVERDUE">Overdue</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="REFUNDED">Refunded</option>
                </select>
              </div>

              <div className="md:col-span-3 min-w-0">
                <button
                  type="button"
                  onClick={openAddPaymentModal}
                  className="flex w-full items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                  title="Record a payment against an invoice"
                >
                  <FiPlus className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Add Payment</span>
                </button>
              </div>

              {hasActiveFilters ? (
                <div className="md:col-span-12">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded border border-red-300 bg-red-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-600 transition-colors"
                  >
                    Clear filters
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Member payment history by patient */}
        {/* <div className="bg-white rounded shadow-sm p-1 mb-0.5 border border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1">
              <FiUser className="w-3.5 h-3.5 text-indigo-600" />
              Payment history by Patient
            </h3>
            <div className="flex flex-wrap items-center gap-1 min-w-0 max-w-full">
              <label className="text-[11px] text-gray-600 whitespace-nowrap">Select Patient:</label>
            <select
              value={selectedMember ? String(selectedMember.patientId) : ''}
              onChange={(e) => {
                const key = e.target.value;
                if (!key) {
                  setSelectedMember(null);
                  setMemberHistoryPayments([]);
                  return;
                }
                // Find patient from API dropdown options
                const selectedPatientId = parseInt(key, 10);
                const selectedPatient = patientDropdownOptions.find(p => p.id === selectedPatientId);
                
                if (selectedPatient) {
                  // Find corresponding customer-patient combination from customersData
                  const m = customersData.find((c) => String(c.patientId) === String(selectedPatientId));
                  if (m) {
                    const member = {
                      customerId: m.customerId,
                      customerName: m.customerName,
                      patientId: m.patientId,
                      patientName: m.patientName,
                    };
                    setSelectedMember(member);
                    loadMemberPaymentHistory(member, filterMonths);
                  } else {
                    // If not found in customersData, create member from API data only
                    const member = {
                      customerId: null,
                      customerName: null,
                      patientId: selectedPatient.id,
                      patientName: selectedPatient.name,
                    };
                    setSelectedMember(member);
                    loadMemberPaymentHistory(member, filterMonths);
                  }
                }
              }}
              disabled={isLoadingPatientDropdown}
              className="min-w-0 w-full max-w-56 flex-1 px-2 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-blue-300 focus:border-blue-300 text-gray-900 bg-white disabled:opacity-50 disabled:cursor-not-allowed sm:w-56 sm:flex-none"
            >
              <option value="">Select a patient...</option>
              {isLoadingPatientDropdown ? (
                <option value="" disabled>Loading patients...</option>
              ) : (
                patientDropdownOptions.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))
              )}
            </select>
              <label className="text-[11px] text-gray-600 whitespace-nowrap">Months:</label>
              <select
                value={filterMonths}
                onChange={(e) => {
                  const months = parseInt(e.target.value, 10);
                  setFilterMonths(months);
                  if (selectedMember) {
                    loadMemberPaymentHistory(selectedMember, months);
                  }
                }}
                className="w-24 px-2 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-blue-300 focus:border-blue-300 text-gray-900 bg-white"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m} {m === 1 ? 'month' : 'months'}
                  </option>
                ))}
              </select>
              {selectedMember && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMember(null);
                    setMemberHistoryPayments([]);
                  }}
                  className="px-2.5 py-0.5 text-[11px] font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          {selectedMember && (
            <>
              {isLoadingMemberHistory ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-7 w-7 border-2 border-blue-200 border-t-blue-600" />
                  <span className="ml-2 text-xs text-gray-600">Loading payment history...</span>
                </div>
              ) : memberHistoryPayments.length === 0 ? (
                <p className="text-xs text-gray-500 py-2">No payments found for this patient in the selected period.</p>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-1.5 py-1 text-left font-semibold text-gray-700">Month</th>
                        <th className="px-1.5 py-1 text-left font-semibold text-gray-700">Invoice #</th>
                        <th className="px-1.5 py-1 text-left font-semibold text-gray-700">Invoice Date</th>
                        <th className="px-1.5 py-1 text-left font-semibold text-gray-700">Amount (₹)</th>
                        <th className="px-1.5 py-1 text-left font-semibold text-gray-700">Paid (₹)</th>
                        <th className="px-1.5 py-1 text-left font-semibold text-gray-700">Balance (₹)</th>
                        <th className="px-1.5 py-1 text-center font-semibold text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {memberHistoryPayments.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-1.5 py-1 text-gray-700">
                            {p.invoiceDate ? formatDateSafely(p.invoiceDate) : '–'}
                          </td>
                          <td className="px-1.5 py-1 text-gray-900">{p.invoiceNumber || '–'}</td>
                          <td className="px-1.5 py-1 text-gray-700">{formatTableDate(p.invoiceDate)}</td>
                          <td className="px-1.5 py-1 text-left text-gray-900">
                            {(p.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-1.5 py-1 text-left text-green-700">
                            {(p.paidAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-1.5 py-1 text-left text-red-600 font-medium">
                            {(p.remainingAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-1.5 py-1 text-center">
                            <span
                              className={`px-1 py-0.5 rounded font-medium ${
                                p.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div> */}

        {/* Customer Payments Table */}
        {filteredCustomers.length === 0 ? (
          <div className="bg-white rounded shadow-sm p-3 text-center border border-gray-200">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-xl text-gray-400 font-bold">₹</span>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              {hasActiveFilters ? 'No Customers Match Your Filters' : 'No Customers Found'}
            </h3>
            <p className="text-xs text-gray-600 mb-2">
              {hasActiveFilters 
                ? 'Try adjusting your search or filter criteria'
                : 'No customer payment transactions have been recorded yet.'
              }
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-2.5 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors border border-blue-200"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded shadow-sm border border-gray-200 overflow-visible">
            <div className="overflow-x-auto overflow-y-visible">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-1.5 py-1 text-left text-xs font-semibold text-gray-700 uppercase w-10"></th>
                    {visibleColumns.map((column, index) => (
                      <th
                        key={column.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        style={{ width: column.width }}
                        className={`px-1.5 py-1 text-xs font-semibold text-gray-700 uppercase border-b border-gray-200 cursor-move select-none transition-all ${
                          column.id === 'totalInvoice' || column.id === 'totalPayment' || column.id === 'balanceExcess' ? 'text-left' : 'text-left'
                        } ${
                          draggedColumn === index ? 'opacity-50 bg-indigo-50' : 'hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-400 text-base leading-none" style={{ fontFamily: 'monospace' }}>⋮⋮</span>
                          <span className="min-w-0">{column.label}</span>
                          {column.id === 'patient' ? (
                            <span className="relative shrink-0" ref={patientNameOrderingRef}>
                              <button
                                type="button"
                                draggable={false}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowTotalInvoiceOrderingMenu(false);
                                  setShowPatientNameOrderingMenu((prev) => !prev);
                                }}
                                className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none transition-colors hover:bg-indigo-100 ${
                                  isPatientNameOrdering(listOrdering) ? 'text-indigo-600' : 'text-gray-400'
                                }`}
                                title={
                                  isPatientNameOrdering(listOrdering)
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
                                        listOrdering === option.value
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
                                      applyListOrdering('');
                                    }}
                                    disabled={!isPatientNameOrdering(listOrdering)}
                                    className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-gray-50 ${
                                      isPatientNameOrdering(listOrdering)
                                        ? 'text-gray-700'
                                        : 'cursor-not-allowed text-gray-400'
                                    }`}
                                  >
                                    Clear
                                  </button>
                                </div>
                              ) : null}
                            </span>
                          ) : null}
                          {column.id === 'totalInvoice' ? (
                            <span className="relative shrink-0" ref={totalInvoiceOrderingRef}>
                              <button
                                type="button"
                                draggable={false}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowPatientNameOrderingMenu(false);
                                  setShowTotalInvoiceOrderingMenu((prev) => !prev);
                                }}
                                className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[9px] leading-none transition-colors hover:bg-indigo-100 ${
                                  isTotalInvoiceOrdering(listOrdering)
                                    ? 'text-indigo-600'
                                    : 'text-gray-400'
                                }`}
                                title={
                                  isTotalInvoiceOrdering(listOrdering)
                                    ? `Sort total invoice: ${totalInvoiceOrderingLabel}`
                                    : 'Sort total invoice'
                                }
                                aria-label="Sort total invoice"
                                aria-expanded={showTotalInvoiceOrderingMenu}
                              >
                                ▼
                              </button>
                              {showTotalInvoiceOrderingMenu ? (
                                <div
                                  className="absolute right-0 top-full z-20 mt-1 min-w-[8.5rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  {TOTAL_INVOICE_ORDERING_OPTIONS.map((option) => (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        applyListOrdering(option.value);
                                      }}
                                      className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-gray-50 ${
                                        listOrdering === option.value
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
                                      applyListOrdering('');
                                    }}
                                    className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-gray-50 ${
                                      isTotalInvoiceOrdering(listOrdering)
                                        ? 'font-semibold text-indigo-700'
                                        : 'text-gray-700'
                                    }`}
                                  >
                                    Default
                                  </button>
                                </div>
                              ) : null}
                            </span>
                          ) : null}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredCustomers.map((customer, index) => {
                    // Use composite key for customer-patient combination (ensuring they're separate entities)
                    const customerPatientKey = `customer_${customer.customerId}_patient_${customer.patientId}`;
                    const isExpanded = expandedCustomers.has(customerPatientKey);
                    return (
                      <React.Fragment key={customerPatientKey}>
                        <tr 
                          className="hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => toggleCustomerExpansion(customerPatientKey)}
                        >
                          <td className="px-1.5 py-1 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCustomerExpansion(customerPatientKey);
                              }}
                              className="text-gray-600 hover:text-gray-900 font-bold text-base"
                            >
                              {isExpanded ? '−' : '+'}
                            </button>
                          </td>
                          {visibleColumns.map((column) => {
                            let cellContent;
                            let cellClassName = `px-1.5 py-1 text-xs ${
                              column.id === 'totalInvoice' || column.id === 'totalPayment' || column.id === 'balanceExcess' 
                                ? 'text-left' 
                                : 'text-left'
                            }`;

                            switch (column.id) {
                              case 'customer':
                                cellContent = customer.customerName || `Customer ${index + 1}`;
                                cellClassName += ' text-gray-900';
                                break;
                              case 'patient':
                                cellContent = customer.patientName || 'N/A';
                                cellClassName += ' text-gray-600';
                                break;
                              case 'patientId':
                                cellContent =
                                  customer.patientId != null && customer.patientId !== ''
                                    ? String(customer.patientId).padStart(5, '0')
                                    : '—';
                                cellClassName += ' text-gray-600 whitespace-nowrap';
                                break;
                              case 'patientPhone':
                                cellContent = customer.patientPhone || '—';
                                cellClassName += ' text-gray-600 whitespace-nowrap';
                                break;
                              case 'onboardedDate':
                                cellContent = formatTableDate(customer.onboardedDate);
                                cellClassName += ' text-gray-600 whitespace-nowrap';
                                break;
                              case 'totalInvoice':
                                cellContent = formatAmount(customer.totalInvoice);
                                cellClassName += ' text-gray-900 font-medium';
                                break;
                              case 'totalPayment':
                                cellContent = formatAmount(customer.totalPayment);
                                cellClassName += ' text-green-600 font-medium';
                                break;
                              case 'balanceExcess':
                                cellContent = (
                                  <>
                                    {formatAmount(Math.abs(customer.balanceExcess))}
                                    <span className="text-gray-500 text-xs ml-1">
                                      {customer.balanceExcess >= 0 ? '(E)' : '(B)'}
                                    </span>
                                  </>
                                );
                                cellClassName += ' font-semibold text-red-600';
                                break;
                              default:
                                cellContent = '';
                            }

                            return (
                              <td key={column.id} className={cellClassName}>
                                {cellContent}
                              </td>
                            );
                          })}
                        </tr>
                        {isExpanded && customer.transactions.length > 0 && (
                          <tr>
                            <td colSpan={visibleColumns.length + 1} className="px-1.5 py-1 bg-gray-50">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-gray-700">Invoices</span>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full">
                                  <thead>
                                    <tr className="border-b border-gray-300">
                                      {visibleInvoiceColumns.map((col, index) => (
                                        <th
                                          key={col.id}
                                          draggable
                                          onDragStart={(e) => handleInvoiceDragStart(e, index)}
                                          onDragOver={(e) => handleInvoiceDragOver(e, index)}
                                          onDragEnd={handleInvoiceDragEnd}
                                          style={{ width: col.width }}
                                          className={`px-1.5 py-1 text-left text-xs font-semibold text-gray-600 uppercase cursor-move select-none ${
                                            draggedInvoiceColumn === index ? 'opacity-50 bg-indigo-50' : 'hover:bg-gray-100'
                                          }`}
                                        >
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-gray-400 text-base leading-none" style={{ fontFamily: 'monospace' }}>⋮⋮</span>
                                            {col.label}
                                          </div>
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {customer.transactions.map((transaction) => {
                                      // Find invoice by invoice_number (new API structure) or id (old structure)
                                      const invoice = invoices.find(inv => 
                                        inv.invoice_number === transaction.invoiceId || 
                                        inv.invoice_number === transaction.invoice ||
                                        inv.id === transaction.invoiceId
                                      );
                                      // Get payments from invoice - check both new structure (payment_details) and old structure (payments)
                                      const invoicePayments = invoice?.payments || 
                                                              (invoice?.payment_details ? invoice.payment_details.map(p => ({
                                                                id: p.id,
                                                                created_at: p.payment_date,
                                                                paid_date: p.paid_date || p.payment_date,
                                                                amount:
                                                                  p.amount != null && p.amount !== ''
                                                                    ? String(p.amount)
                                                                    : '0',
                                                                method: p.method,
                                                                reference: p.reference,
                                                                is_verified: p.is_verified,
                                                              })) : []);
                                      const balanceExcess = (transaction.invoiceAmount || 0) - (transaction.amountPaid || 0);
                                      return (
                                        <tr key={transaction.id} className="hover:bg-white">
                                          {visibleInvoiceColumns.map((col) => {
                                            let content = null;
                                            let className = 'px-1.5 py-0.5 text-xs text-left';

                                            switch (col.id) {
                                              case 'invoiceDate':
                                                {
                                                  const cashPayments = invoicePayments.filter(
                                                    (p) => String(p.method || '').toUpperCase() === 'CASH' && p.id
                                                  );
                                                  const cashPaymentForAction =
                                                    cashPayments.length > 0 ? cashPayments[cashPayments.length - 1] : null;
                                                  const invoiceMenuKey = cashPaymentForAction
                                                    ? `invoice-cash-${invoice?.id || transaction.id}-${cashPaymentForAction.id}`
                                                    : null;
                                                  const isInvoiceMenuOpen = invoiceMenuKey && openPaymentActionMenu === invoiceMenuKey;
                                                  const dateNode = invoice?.id ? (
                                                    <button
                                                      type="button"
                                                      onClick={() => openAdjustModalForInvoice(invoice, transaction)}
                                                      className="text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer font-medium text-left whitespace-nowrap"
                                                    >
                                                      {formatTableDate(transaction.invoiceDate)}
                                                    </button>
                                                  ) : (
                                                    <span className="whitespace-nowrap">{formatTableDate(transaction.invoiceDate)}</span>
                                                  );

                                                  content = (
                                                    <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                                      <div
                                                        ref={isInvoiceMenuOpen ? paymentActionMenuRef : null}
                                                        className="relative shrink-0 w-5 h-5 flex items-center justify-center"
                                                      >
                                                        {cashPaymentForAction ? (
                                                          <>
                                                            <button
                                                              type="button"
                                                              onClick={() => setOpenPaymentActionMenu(prev => (prev === invoiceMenuKey ? null : invoiceMenuKey))}
                                                              className="p-0.5 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 leading-none"
                                                              title="Payment actions"
                                                            >
                                                              <span className="text-xs leading-none">⋮</span>
                                                            </button>
                                                            {isInvoiceMenuOpen && (
                                                              <div className="absolute left-0 top-full mt-1 z-20 min-w-[96px] bg-white border border-gray-200 rounded shadow-md overflow-hidden">
                                                                <button
                                                                  type="button"
                                                                  onClick={() => {
                                                                    setOpenPaymentActionMenu(null);
                                                                    openEditPaymentModal(invoice, cashPaymentForAction, 'edit');
                                                                  }}
                                                                  className="block w-full text-left px-2 py-1.5 text-[11px] text-gray-700 hover:bg-gray-50 border-b border-gray-100"
                                                                >
                                                                  Edit
                                                                </button>
                                                                <button
                                                                  type="button"
                                                                  onClick={() => {
                                                                    setOpenPaymentActionMenu(null);
                                                                    openEditPaymentModal(invoice, cashPaymentForAction, 'delete');
                                                                  }}
                                                                  className="block w-full text-left px-2 py-1.5 text-[11px] text-red-700 hover:bg-red-50"
                                                                >
                                                                  Delete
                                                                </button>
                                                              </div>
                                                            )}
                                                          </>
                                                        ) : null}
                                                      </div>
                                                      {dateNode}
                                                    </div>
                                                  );
                                                }
                                                className += ' text-gray-700 whitespace-nowrap';
                                                break;
                                              case 'invoiceNumber':
                                                content = transaction.invoice;
                                                className += ' text-gray-700';
                                                break;
                                              case 'periodStart':
                                                content = invoice?.period_start ? formatTableDate(invoice.period_start) : '—';
                                                className += ' text-[11px] text-gray-700 whitespace-nowrap';
                                                break;
                                              case 'periodEnd':
                                                content = invoice?.period_end ? formatTableDate(invoice.period_end) : '—';
                                                className += ' text-[11px] text-gray-700 whitespace-nowrap';
                                                break;
                                              case 'bookingId':
                                                content = invoice?.booking?.order_id || '—';
                                                className += ' text-[11px] text-gray-700';
                                                break;
                                              case 'service':
                                                content = invoice?.booking?.service || '—';
                                                className += ' text-[11px] text-gray-800 font-medium';
                                                break;
                                              case 'package':
                                                content = invoice?.booking?.package || '—';
                                                className += ' text-[11px] text-gray-700';
                                                break;
                                              case 'locationType':
                                                content = formatBookingLocationType(invoice?.booking?.location_type);
                                                className += ' text-[11px] text-gray-700 whitespace-nowrap';
                                                break;
                                              case 'venue': {
                                                const venueText = invoice?.booking?.venue || '—';
                                                content =
                                                  venueText === '—' ? (
                                                    '—'
                                                  ) : (
                                                    <span
                                                      className="block max-w-[12rem] whitespace-normal break-words leading-snug"
                                                      title={venueText}
                                                    >
                                                      {venueText}
                                                    </span>
                                                  );
                                                className += ' text-[11px] text-gray-700 align-middle';
                                                break;
                                              }
                                              case 'locality': {
                                                const locText = resolveBookingLocality(invoice?.booking);
                                                content =
                                                  locText === '—' ? (
                                                    '—'
                                                  ) : (
                                                    <span
                                                      className="block max-w-[12rem] whitespace-normal break-words leading-snug"
                                                      title={locText}
                                                    >
                                                      {locText}
                                                    </span>
                                                  );
                                                className += ' text-[11px] text-gray-500 align-middle';
                                                break;
                                              }
                                              case 'invoiceAmount':
                                                content = formatAmount(transaction.invoiceAmount);
                                                className += ' text-gray-900 font-medium';
                                                break;
                                              case 'status': {
                                                const s = invoice?.status || transaction.status || '';
                                                const baseChip =
                                                  'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold';
                                                let chipClass = `${baseChip} bg-gray-100 text-gray-700`;
                                                if (s === 'PAID') chipClass = `${baseChip} bg-green-100 text-green-700`;
                                                else if (s === 'PARTIALLY_PAID') chipClass = `${baseChip} bg-amber-100 text-amber-700`;
                                                else if (s === 'UNPAID') chipClass = `${baseChip} bg-red-100 text-red-700`;
                                                content = s ? <span className={chipClass}>{s}</span> : '—';
                                                className += ' text-center';
                                                break;
                                              }
                                              case 'paid':
                                                content = formatAmount(transaction.amountPaid);
                                                className += ' text-green-600 font-medium';
                                                break;
                                              case 'balance':
                                                content = (
                                                  <>
                                                    {formatAmount(Math.abs(balanceExcess))}
                                                    <span className="text-gray-500 text-xs ml-0.5">
                                                      {balanceExcess >= 0 ? '(B)' : '(E)'}
                                                    </span>
                                                  </>
                                                );
                                                className += ' text-red-600 font-semibold';
                                                break;
                                              case 'paymentDetails':
                                                content = invoicePayments.length > 0 ? (
                                                  <div>
                                                    <ul className="space-y-0.5 m-0 p-0" style={{ listStyle: 'none' }}>
                                                      {invoicePayments.slice(0, 3).map((p, idx) => (
                                                        <li key={p.id || idx} className="leading-tight list-none">
                                                          <span className="min-w-0">
                                                            {formatTableDate(p.paid_date || p.created_at)}
                                                            {p.method ? ` · ${p.method}` : ''}
                                                            {p.amount != null && !isNaN(p.amount) ? ` · ${formatAmount(p.amount)}` : ''}
                                                          </span>
                                                        </li>
                                                      ))}
                                                    </ul>
                                                    {invoicePayments.length > 3 ? (
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          openPaymentDetailsModal(
                                                            transaction.invoice || invoice?.invoice_number,
                                                            invoicePayments
                                                          )
                                                        }
                                                        className="mt-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                                                      >
                                                        More ({invoicePayments.length - 3})
                                                      </button>
                                                    ) : null}
                                                  </div>
                                                ) : '—';
                                                className += ' text-gray-600 align-top';
                                                break;
                                              case 'discountPremium':
                                                content = (
                                                  <button
                                                    type="button"
                                                    onClick={() => openAdjustModalForInvoice(invoice, transaction)}
                                                    className="px-2 py-0.5 text-[11px] font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
                                                  >
                                                    Modify
                                                  </button>
                                                );
                                                className += ' text-[11px] text-gray-600 align-top';
                                                break;
                                              case 'paymentAction':
                                                content = (
                                                  <button
                                                    type="button"
                                                    onClick={() => openPayModal(invoice, transaction, balanceExcess)}
                                                    className="px-2 py-1 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                                                  >
                                                    Update Payment
                                                  </button>
                                                );
                                                className += ' align-top';
                                                break;
                                              default:
                                                content = '';
                                            }

                                            return (
                                              <td key={col.id} className={className}>
                                                {content}
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
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
            
            {/* Pagination */}
            {(nextUrl || previousUrl || totalCount > 0) && (
              <div className="border-t border-gray-200 px-1.5 py-1.5 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="text-xs text-gray-600">
                  Showing {filteredCustomers.length} of {totalCount} customer{totalCount !== 1 ? 's' : ''}
                  {totalPages > 1 ? (
                    <span className="text-gray-500"> · Page {currentPage} of {totalPages}</span>
                  ) : null}
                  <span className="text-gray-500"> · {pageSize} per page</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadPayments(previousUrl, searchQuery, false)}
                    disabled={!previousUrl || isLoadingMore}
                    className="px-2 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => loadPayments(nextUrl, searchQuery, false)}
                    disabled={!nextUrl || isLoadingMore}
                    className="px-2 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                  >
                    Next
                  </button>
                </div>
                {isLoadingMore && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-gray-300 border-t-blue-600" />
                    <span>Loading...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      {/* Add payment modal */}
      {addPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={closeAddPaymentModal}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-visible" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between rounded-t-xl">
              <h2 className="text-lg font-semibold text-gray-800">Add payment</h2>
              <button type="button" onClick={closeAddPaymentModal} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Patient <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <PatientSearchDropdown
                  value={addPaymentPatient}
                  onChange={setAddPaymentPatient}
                  disabled={isSubmittingPayment}
                  placeholder="Select patient (optional)…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paid date (IST)</label>
                  <input
                    type="date"
                    value={payForm.paidDate}
                    onChange={(e) => setPayForm((prev) => ({ ...prev, paidDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paid time (IST)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={payForm.paidHour}
                      onChange={(e) => setPayForm((prev) => ({ ...prev, paidHour: e.target.value }))}
                      className="w-full px-2 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      aria-label="Hour"
                    >
                      {PAYMENT_CLOCK_HOURS.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <select
                      value={payForm.paidMinute}
                      onChange={(e) => setPayForm((prev) => ({ ...prev, paidMinute: e.target.value }))}
                      className="w-full px-2 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      aria-label="Minute"
                    >
                      {PAYMENT_CLOCK_MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={payForm.paidAmPm}
                      onChange={(e) => setPayForm((prev) => ({ ...prev, paidAmPm: e.target.value }))}
                      className="w-full px-2 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white font-medium"
                      aria-label="AM or PM"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {payForm.paidHour}:{payForm.paidMinute} {payForm.paidAmPm}
                  </p>
                </div>
              </div>
              {error && addPaymentModalOpen && !payModalOpen ? (
                <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
              ) : null}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={payForm.amount}
                  onKeyDown={blockNegativeNumberInputKey}
                  onChange={(e) =>
                    setPayForm((prev) => ({
                      ...prev,
                      amount: sanitizeNonNegativeAmountInput(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                <select
                  value={payForm.method}
                  onChange={(e) => setPayForm((prev) => ({ ...prev, method: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                <input
                  type="text"
                  placeholder="e.g. UPI123, cheque number"
                  value={payForm.reference}
                  onChange={(e) => setPayForm((prev) => ({ ...prev, reference: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
              <button
                type="button"
                onClick={closeAddPaymentModal}
                disabled={isSubmittingPayment}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitAddPayment}
                disabled={isSubmittingPayment}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingPayment ? 'Submitting...' : 'Submit payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay invoice modal */}
      {payModalOpen && payModalInvoice && payModalTransaction && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={closePayModal}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Pay invoice</h2>
              <button type="button" onClick={closePayModal} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-gray-600">
                Invoice: <span className="font-medium text-gray-900">{payModalTransaction.invoice || payModalInvoice.invoice_number}</span>
                {' · '}
                Balance: <span className="font-medium text-red-600">{formatAmount((payModalTransaction.invoiceAmount || 0) - (payModalTransaction.amountPaid || 0))}</span>
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Paid date (IST)</label>
                <input
                  type="date"
                  value={payForm.paidDate}
                  onChange={(e) => setPayForm(prev => ({ ...prev, paidDate: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              {error && (
                <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={payForm.amount}
                  onKeyDown={blockNegativeNumberInputKey}
                  onChange={(e) =>
                    setPayForm((prev) => ({
                      ...prev,
                      amount: sanitizeNonNegativeAmountInput(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                <select
                  value={payForm.method}
                  onChange={(e) => setPayForm(prev => ({ ...prev, method: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                <input
                  type="text"
                  placeholder="e.g. UPI123, cheque number"
                  value={payForm.reference}
                  onChange={(e) => setPayForm(prev => ({ ...prev, reference: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
              <button
                type="button"
                onClick={closePayModal}
                disabled={isSubmittingPayment}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitPayment}
                disabled={isSubmittingPayment}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingPayment ? 'Submitting...' : 'Submit payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Discount / Premium Modal (per invoice) */}
      {adjustModalOpen && adjustTransaction && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Adjust discount & premium</h2>
              <button type="button" onClick={closeAdjustModal} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {isLoadingAdjustInvoice ? (
                <div className="py-10 flex flex-col items-center justify-center gap-2 text-sm text-gray-500">
                  <FiRefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                  Loading invoice details…
                </div>
              ) : adjustLoadError ? (
                <p className="text-sm text-red-600">{adjustLoadError}</p>
              ) : adjustInvoice ? (
                <>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>
                      Invoice:{' '}
                      <span className="font-medium text-gray-900">
                        {adjustInvoice.invoice_number || adjustTransaction.invoice}
                      </span>
                      {' · '}
                      Amount:{' '}
                      <span className="font-medium text-gray-900">{formatAmount(adjustAmountPreview.amount)}</span>
                      {' · '}
                      Already discounted:{' '}
                      <span
                        className="font-medium text-gray-900"
                        title="Saved discount from invoice (does not change while you edit the field below)"
                      >
                        {formatAmount(adjustAmountPreview.alreadyDiscounted)}
                      </span>
                    </p>
                    <p>
                      Premium:{' '}
                      {adjustAmountPreview.hasPremium ? (
                        <span
                          className="font-medium text-gray-900"
                          title="Saved premium from invoice (does not change while you edit the field below)"
                        >
                          Yes · {formatAmount(adjustAmountPreview.savedPremium)}
                        </span>
                      ) : (
                        <span className="font-medium text-gray-500" title="No premium on this invoice">
                          Not applied
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Discount (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={adjustForm.discount}
                        onChange={(e) => setAdjustForm(prev => ({ ...prev, discount: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Premium (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={adjustForm.premium}
                        onChange={(e) => setAdjustForm(prev => ({ ...prev, premium: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Issued date</label>
                    <input
                      type="date"
                      value={adjustForm.issuedDate}
                      onChange={(e) => setAdjustForm(prev => ({ ...prev, issuedDate: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    You can update discount, premium, and issued date for this invoice. Leave a field blank to keep it unchanged.
                  </p>
                </>
              ) : null}
            </div>
            <div className="px-6 py-3 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeAdjustModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveAdjustment}
                disabled={isSavingAdjustment || isLoadingAdjustInvoice || !adjustInvoice || Boolean(adjustLoadError)}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingAdjustment ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
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

            {/* Search */}
            <div className="px-6 py-3 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search columns..."
                value={columnSearchTerm}
                onChange={(e) => setColumnSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            {/* Column List */}
            <div className="flex-1 overflow-y-auto px-6 py-3">
              <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Main table columns</h3>
              {filteredColumns.map((column) => (
                <label
                  key={column.id}
                  className="flex items-center gap-3 py-2.5 px-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group"
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
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">No columns found</p>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-gray-200">
                <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Invoice detail table columns</h3>
                <input
                  type="text"
                  placeholder="Search invoice columns..."
                  value={invoiceColumnSearchTerm}
                  onChange={(e) => setInvoiceColumnSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm mb-2"
                />
                {filteredInvoiceColumns.map((column) => (
                  <label
                    key={`invoice-${column.id}`}
                    className="flex items-center gap-3 py-2.5 px-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group"
                  >
                    <input
                      type="checkbox"
                      checked={invoiceColumnVisibility[column.id] || false}
                      onChange={() =>
                        setInvoiceColumnVisibility(prev => ({
                          ...prev,
                          [column.id]: !prev[column.id],
                        }))
                      }
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 font-medium">
                      {column.label}
                    </span>
                  </label>
                ))}
                {filteredInvoiceColumns.length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    <p className="text-sm">No invoice columns found</p>
                  </div>
                )}
              </div>
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

      {/* Payment Details Modal */}
      {paymentDetailsModal.open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={closePaymentDetailsModal}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">All payment details</h2>
              <button type="button" onClick={closePaymentDetailsModal} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4">
              {paymentDetailsModal.invoiceNumber ? (
                <p className="text-sm text-gray-600 mb-3">
                  Invoice: <span className="font-medium text-gray-900">{paymentDetailsModal.invoiceNumber}</span>
                </p>
              ) : null}
              <div className="max-h-[50vh] overflow-y-auto border border-gray-100 rounded-lg">
                <ul className="divide-y divide-gray-100">
                  {paymentDetailsModal.payments.map((p, idx) => (
                    <li key={p.id || idx} className="px-3 py-2 text-sm text-gray-700">
                      <span>{formatTableDate(p.paid_date || p.created_at)}</span>
                      <span>{p.method ? ` · ${p.method}` : ''}</span>
                      <span>{p.amount != null && !isNaN(p.amount) ? ` · ${formatAmount(p.amount)}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end bg-gray-50">
              <button
                type="button"
                onClick={closePaymentDetailsModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Delete CASH Payment Modal */}
      {editPaymentModalOpen && editPayment && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={closeEditPaymentModal}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">
                {editPaymentModalAction === 'delete' ? 'Delete payment' : 'Edit payment'}
              </h2>
              <button type="button" onClick={closeEditPaymentModal} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {editPaymentInvoice?.invoice_number && (
                <p className="text-sm text-gray-600">
                  Invoice: <span className="font-medium text-gray-900">{editPaymentInvoice.invoice_number}</span>
                </p>
              )}

              {editPaymentModalAction === 'delete' ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  This will permanently delete this CASH payment entry.
                </div>
              ) : null}

              <div className={editPaymentModalAction === 'delete' ? 'opacity-60 pointer-events-none' : ''}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editPaymentForm.amount}
                      onKeyDown={blockNegativeNumberInputKey}
                      onChange={(e) =>
                        setEditPaymentForm((prev) => ({
                          ...prev,
                          amount: sanitizeNonNegativeAmountInput(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Paid date</label>
                    <input
                      type="date"
                      value={editPaymentForm.paidDate}
                      onChange={(e) => setEditPaymentForm(prev => ({ ...prev, paidDate: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                    <select
                      value={editPaymentForm.method}
                      onChange={(e) => setEditPaymentForm(prev => ({ ...prev, method: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Verified</label>
                    <select
                      value={editPaymentForm.isVerified ? 'true' : 'false'}
                      onChange={(e) => setEditPaymentForm(prev => ({ ...prev, isVerified: e.target.value === 'true' }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                  <input
                    type="text"
                    value={editPaymentForm.reference}
                    onChange={(e) => setEditPaymentForm(prev => ({ ...prev, reference: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {error && (
                <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm">
                  {error}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
              <button
                type="button"
                onClick={closeEditPaymentModal}
                disabled={isSavingPaymentEdit || isDeletingPayment}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              {editPaymentModalAction === 'delete' ? (
                <button
                  type="button"
                  onClick={handleDeletePayment}
                  disabled={isDeletingPayment}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeletingPayment ? 'Deleting...' : 'Delete'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSavePaymentEdit}
                  disabled={isSavingPaymentEdit}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingPaymentEdit ? 'Saving...' : 'Save'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
          </>
        )}
      </div>
    </div>
  );
};

export default CustomerPayment;
