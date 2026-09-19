import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';

const PAYOUT_HISTORY_EXPORT_HEADERS = [
  'Employee',
  'Month',
  'Present',
  'Absent',
  'Half Day',
  'Paid Leave',
  'Payable Days',
  'Advance',
  'Loan',
  'Total Payable Amount',
  'Paid Amount',
  'Monthly Balance',
  'Cumulative Balance',
];

const formatExportMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return Math.round(n * 100) / 100;
};

const formatMonthLabel = (monthKey) => {
  if (!monthKey) return '';
  try {
    return new Date(`${monthKey}-01`).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return String(monthKey);
  }
};

const payoutHistoryToExportRow = (calc, employeeName) => {
  const advance = calc.advanceAmount || 0;
  const loan = calc.loanAmount || 0;
  const paidAmount = calc.paidAmount || 0;
  const totalPayableAmount = calc.totalPayableAmount || calc.finalAmount || 0;
  const monthlyBalance = totalPayableAmount - paidAmount;
  let monthlyBalanceText = 0;
  if (Math.abs(monthlyBalance) >= 0.01) {
    monthlyBalanceText =
      monthlyBalance > 0
        ? formatExportMoney(monthlyBalance)
        : formatExportMoney(monthlyBalance);
  }
  const cumulative =
    calc.remainingPayment !== undefined && calc.remainingPayment !== null
      ? formatExportMoney(calc.remainingPayment)
      : '';
  const payableDays =
    calc.payableDays ||
    (() => {
      try {
        const monthDate = new Date(`${calc.month}-01`);
        return new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
      } catch {
        return '';
      }
    })();

  return [
    employeeName || '',
    formatMonthLabel(calc.month),
    calc.present ?? '',
    calc.absent ?? '',
    calc.halfday ?? '',
    calc.paidleave ?? '',
    payableDays,
    formatExportMoney(advance),
    formatExportMoney(loan),
    formatExportMoney(totalPayableAmount),
    formatExportMoney(paidAmount),
    monthlyBalanceText,
    cumulative,
  ];
};

const exportPayoutHistoryExcel = (rows, employeeName) => {
  if (!rows?.length) throw new Error('Select at least one month to export.');
  const sheet = XLSX.utils.aoa_to_sheet([
    PAYOUT_HISTORY_EXPORT_HEADERS,
    ...rows.map((calc) => payoutHistoryToExportRow(calc, employeeName)),
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Payout History');
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = String(employeeName || 'employee')
    .trim()
    .replace(/[^\w-]+/g, '-')
    .slice(0, 40);
  XLSX.writeFile(workbook, `payout-history-${safeName || 'employee'}-${stamp}.xlsx`);
};

const PayrollForm = ({ employee, isOpen, onClose, attendanceRecords = {}, viewMode = 'full' }) => {
  const structuresInflightRef = useRef(null);
  const attendanceInflightRef = useRef(null);
  const salaryReportInflightRef = useRef(null);
  const calculateInflightRef = useRef(null);
  const skipPeriodEffectRef = useRef(true);
  const [activeTab, setActiveTab] = useState(
    viewMode === 'calculation' ? 'calculation' : 'structure'
  ); // 'structure' | 'calculation'
  const [fetchedAttendanceRecords, setFetchedAttendanceRecords] = useState({}); // Store attendance data from API
  const [apiAttendanceData, setApiAttendanceData] = useState([]); // Store raw API response data
  const [salaryStructures, setSalaryStructures] = useState([]); // Array of salary structures for different months
  const [payrollMessage, setPayrollMessage] = useState({ type: '', text: '' });
  const [payrollCalculations, setPayrollCalculations] = useState([]); // Calculated payroll for each month
  const [isCalculating, setIsCalculating] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('6months'); // '6months' | '1year'
  const [paymentModal, setPaymentModal] = useState({ isOpen: false, month: '', amount: 0, paidAmount: '', salaryReportId: null }); // Payment modal state
  const [selectedPaymentMode, setSelectedPaymentMode] = useState(''); // Selected payment mode in modal
  const [isProcessingPayment, setIsProcessingPayment] = useState(false); // Loading state for payment processing
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false); // Loading state for attendance API
  const [isLoadingSalaryReport, setIsLoadingSalaryReport] = useState(false); // Loading state for salary-report API
  const [selectedExportMonths, setSelectedExportMonths] = useState([]); // month keys YYYY-MM
  const [exportFeedback, setExportFeedback] = useState('');

  // Form state for adding/editing salary structure
  const [formData, setFormData] = useState({
    startDate: new Date().toISOString().slice(0, 10), // YYYY-MM-DD format for specific date
    salaryType: 'MONTHLY', // HOURLY, DAILY, WEEKLY, FORTNIGHTLY, MONTHLY
    salaryAmount: '',
    amountType: 'BASE_SALARY', // 'BASE_SALARY' | 'INCREMENT' | 'ADVANCE' | 'LOAN'
    hours: '', // For hourly type
    hourlyRate: '', // For hourly type
  });
  const [editingStructure, setEditingStructure] = useState(null); // Structure being edited
  const [isLoadingStructures, setIsLoadingStructures] = useState(false); // Loading state for structures
  const [isSavingStructure, setIsSavingStructure] = useState(false); // Loading state for saving structure
  const [paginationInfo, setPaginationInfo] = useState({
    next: null,
    previous: null,
    count: 0,
  }); // Pagination info from API

  // Map API response to component format
  const mapApiToComponent = (apiStructure) => {
    return {
      id: apiStructure.id,
      start_date: apiStructure.effective_from,
      effective_from: apiStructure.effective_from,
      salary_type: apiStructure.salary_type,
      salary_amount: parseFloat(apiStructure.final_salary || apiStructure.amount || 0),
      amountType: apiStructure.change_type,
      change_type: apiStructure.change_type,
      amount: parseFloat(apiStructure.amount || 0),
      final_salary: parseFloat(apiStructure.final_salary || apiStructure.amount || 0),
      // For advance/loan, check if change_type indicates it
      advance_amount: apiStructure.change_type === 'ADVANCE' ? parseFloat(apiStructure.amount || 0) : 0,
      loan_amount: apiStructure.change_type === 'LOAN' ? parseFloat(apiStructure.amount || 0) : 0,
    };
  };

  // Load salary structures from API (deduped — one in-flight request at a time)
  const loadSalaryStructures = async (url = null) => {
    if (!employee) return [];
    if (structuresInflightRef.current) return structuresInflightRef.current;

    structuresInflightRef.current = (async () => {
      setIsLoadingStructures(true);
      try {
        const accessToken = localStorage.getItem('access_token');
        if (!accessToken) {
          setPayrollMessage({ type: 'error', text: 'Authorization token missing. Please log in again.' });
          setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
          return [];
        }

        const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
        const apiUrl = url || `${baseUrl}/payroll/salary-structures/?user_id=${employee.id}`;

        const response = await axios.get(apiUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const results = Array.isArray(response.data)
          ? response.data
          : response.data?.results || response.data?.data || [];

        setPaginationInfo({
          next: response.data?.next || null,
          previous: response.data?.previous || null,
          count: response.data?.count || 0,
        });

        const mappedStructures = results.map(mapApiToComponent);
        mappedStructures.sort((a, b) => {
          const dateA = new Date(a.effective_from || a.start_date);
          const dateB = new Date(b.effective_from || b.start_date);
          return dateB - dateA;
        });

        setSalaryStructures(mappedStructures);
        return mappedStructures;
      } catch (error) {
        const responseData = error.response?.data;
        let message =
          (typeof responseData === 'string' && responseData) ||
          responseData?.message ||
          error.message ||
          'Failed to load salary structures.';
        setPayrollMessage({ type: 'error', text: message });
        setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
        setSalaryStructures([]);
        setPaginationInfo({ next: null, previous: null, count: 0 });
        return [];
      } finally {
        setIsLoadingStructures(false);
        structuresInflightRef.current = null;
      }
    })();

    return structuresInflightRef.current;
  };

  // Fetch attendance data from API (deduped)
  const fetchAttendanceData = async (startDate, endDate) => {
    if (!employee) return { attendanceData: {}, apiReports: [] };
    if (attendanceInflightRef.current) return attendanceInflightRef.current;

    attendanceInflightRef.current = (async () => {
    setIsLoadingAttendance(true);
    try {
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        setPayrollMessage({ type: 'error', text: 'Authorization token missing. Please log in again.' });
        setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
        setIsLoadingAttendance(false);
        return { attendanceData: {}, apiReports: [] };
      }

      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const apiUrl = `${baseUrl}/attendance/total-attendance/?user_id=${employee.id}`;
      
      const response = await axios.get(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // Handle the new paginated API response format
      // Response format: { count, total_pages, current_page, next, previous, results: [...] }
      let responseData = response.data;
      
      // Store raw API response - convert to array format for compatibility
      let apiReports = [];
      if (responseData.results && Array.isArray(responseData.results)) {
        // Transform results array to match expected format for apiAttendanceData
        const apiDataArray = responseData.results.map(report => ({
          status: 'success',
          period: {
            start_date: report.start_date,
            end_date: report.end_date,
          },
          data: {
            attendance: {
              present_days: parseFloat(report.present_days) || 0,
              absent_days: parseFloat(report.absent_days) || 0,
              half_day_count: parseFloat(report.half_day_count) || 0,
              paid_leave_days: parseFloat(report.paid_leave_days) || 0,
              weekly_Offs: parseFloat(report.weekly_Offs) || 0,
              unpaid_leaves: parseFloat(report.unpaid_leaves) || 0,
            },
            salary_info: {
              total_payable_days: parseFloat(report.total_payable_days) || 0,
              total_payable_hours: parseFloat(report.total_payable_hours) || 0,
            },
          },
        }));
        setApiAttendanceData(apiDataArray);
        // Store raw reports for matching with months
        apiReports = responseData.results;
      } else {
        setApiAttendanceData([]);
      }

      // Transform API response to the format expected by calculation functions
      // The API returns aggregated monthly data, so we need to convert it to daily records
      const attendanceData = {};
      
      // Process each report in the response
      if (responseData.results && Array.isArray(responseData.results)) {
        responseData.results.forEach(report => {
          if (report.start_date && report.end_date) {
            // Distribute the aggregated attendance counts across the period
            const start = new Date(report.start_date);
            const end = new Date(report.end_date);
            const currentDate = new Date(start);
            
            let presentCount = parseFloat(report.present_days) || 0;
            let absentCount = parseFloat(report.absent_days) || 0;
            let halfDayCount = parseFloat(report.half_day_count) || 0;
            let paidLeaveCount = parseFloat(report.paid_leave_days) || 0;
            let weeklyOffCount = parseFloat(report.weekly_Offs) || 0;
            let unpaidLeaveCount = parseFloat(report.unpaid_leaves) || 0;
            
            // Create arrays of days to distribute
            const daysToDistribute = [];
            
            // Add present days
            for (let i = 0; i < Math.round(presentCount); i++) {
              daysToDistribute.push('present');
            }
            
            // Add paid leave days
            for (let i = 0; i < Math.round(paidLeaveCount); i++) {
              daysToDistribute.push('paidleave');
            }
            
            // Add half days
            for (let i = 0; i < Math.round(halfDayCount); i++) {
              daysToDistribute.push('halfday');
            }
            
            // Add absent/unpaid leave days
            const totalAbsent = Math.round(absentCount + unpaidLeaveCount);
            for (let i = 0; i < totalAbsent; i++) {
              daysToDistribute.push('absent');
            }
            
            // Distribute days across the period
            // We'll distribute work days (present/paid leave/half day) first, then absent days
            let dayIndex = 0;
            while (currentDate <= end) {
              const dateKey = currentDate.toISOString().slice(0, 10);
              
              if (dayIndex < daysToDistribute.length) {
                attendanceData[dateKey] = daysToDistribute[dayIndex];
                dayIndex++;
              } else {
                // If we've distributed all counted days, mark remaining as absent
                attendanceData[dateKey] = 'absent';
              }
              
              currentDate.setDate(currentDate.getDate() + 1);
            }
          }
        });
      }
      
      return { attendanceData, apiReports };
    } catch (error) {
      const responseData = error.response?.data;
      let message =
        (typeof responseData === 'string' && responseData) ||
        responseData?.message ||
        error.message ||
        'Failed to fetch attendance data.';
      setPayrollMessage({ type: 'error', text: message });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
      return { attendanceData: {}, apiReports: [] };
    } finally {
      setIsLoadingAttendance(false);
      attendanceInflightRef.current = null;
    }
    })();

    return attendanceInflightRef.current;
  };

  const toPayrollMonthKey = (value) => {
    if (value == null || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
      return '';
    }
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}$/.test(raw)) return raw;
    const ymd = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
    if (ymd) return `${ymd[1]}-${ymd[2]}`;
    return '';
  };

  const getSalaryReportMonthKey = (report) => {
    if (!report || typeof report !== 'object') return '';
    const fromFields =
      toPayrollMonthKey(report.month) ||
      toPayrollMonthKey(report.salary_month) ||
      toPayrollMonthKey(report.period_month) ||
      toPayrollMonthKey(report.start_date) ||
      toPayrollMonthKey(report.payment_period_start) ||
      toPayrollMonthKey(report.end_date) ||
      toPayrollMonthKey(report.payment_period_end);
    if (fromFields) return fromFields;

    const year = report.year ?? report.salary_year;
    const monthNum = report.month_number ?? report.month_index;
    const y = Number(year);
    const m = Number(monthNum);
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
      return `${y}-${String(m).padStart(2, '0')}`;
    }
    return '';
  };

  const getSalaryReportId = (report) => {
    if (!report || typeof report !== 'object') return null;
    const nested = report.salary_report;
    const id =
      report.salary_report_id ??
      report.salaryReportId ??
      (nested && typeof nested === 'object' ? nested.id : null) ??
      report.id ??
      null;
    return id != null && id !== '' ? id : null;
  };

  const normalizeSalaryReports = (responseData) => {
    let items = [];
    if (Array.isArray(responseData)) items = responseData;
    else if (Array.isArray(responseData?.results)) items = responseData.results;
    else if (Array.isArray(responseData?.data)) items = responseData.data;
    else if (Array.isArray(responseData?.data?.results)) items = responseData.data.results;

    const flat = [];
    items.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      if (Array.isArray(item.periods) && item.periods.length > 0) {
        item.periods.forEach((period) => {
          if (!period || typeof period !== 'object') return;
          flat.push({
            ...item,
            ...period,
            id: period.salary_report_id ?? period.id ?? item.salary_report_id ?? item.id,
            salary_report_id:
              period.salary_report_id ?? period.id ?? item.salary_report_id ?? item.id,
          });
        });
        return;
      }
      flat.push(item);
    });
    return flat;
  };

  const findSalaryReportForMonth = (reports, monthKey) => {
    if (!Array.isArray(reports) || !monthKey) return null;
    return (
      reports.find((report) => {
        if (getSalaryReportMonthKey(report) === monthKey) return true;
        const start = report.start_date || report.payment_period_start;
        const end = report.end_date || report.payment_period_end;
        return toPayrollMonthKey(start) === monthKey || toPayrollMonthKey(end) === monthKey;
      }) || null
    );
  };

  // Fetch salary reports from API (deduped; used for salary_report_id when paying)
  const fetchSalaryTransactions = async () => {
    if (!employee) return [];
    if (salaryReportInflightRef.current) return salaryReportInflightRef.current;

    salaryReportInflightRef.current = (async () => {
    setIsLoadingSalaryReport(true);
    try {
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        setPayrollMessage({ type: 'error', text: 'Authorization token missing. Please log in again.' });
        setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
        setIsLoadingSalaryReport(false);
        return [];
      }

      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const apiUrl = `${baseUrl}/payroll/salary-report/?user_id=${employee.id}`;
      
      const response = await axios.get(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return normalizeSalaryReports(response.data);
    } catch (error) {
      const responseData = error.response?.data;
      let message =
        (typeof responseData === 'string' && responseData) ||
        responseData?.message ||
        error.message ||
        'Failed to fetch salary transactions.';
      setPayrollMessage({ type: 'error', text: message });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
      return [];
    } finally {
      setIsLoadingSalaryReport(false);
      salaryReportInflightRef.current = null;
    }
    })();

    return salaryReportInflightRef.current;
  };

  const resolveSalaryReportIdForMonth = async (monthKey) => {
    if (!monthKey) return null;
    const reports = await fetchSalaryTransactions();
    return getSalaryReportId(findSalaryReportForMonth(reports, monthKey));
  };

  // Open payment modal
  const handleOpenPaymentModal = (month, amount) => {
    // Get calculation data to determine how much should be paid
    const calculation = payrollCalculations.find(calc => calc.month === month);
    const totalPayableAmount = calculation?.totalPayableAmount || amount || 0;
    const alreadyPaidAmount = calculation?.paidAmount || 0;
    // Calculate remaining amount to pay (what should be paid now)
    // If already paid more than total, show 0 (already overpaid)
    const remainingAmountToPay = Math.max(0, totalPayableAmount - alreadyPaidAmount);
    
    setPaymentModal({
      isOpen: true,
      month,
      amount: remainingAmountToPay,
      paidAmount: '',
      salaryReportId: calculation?.salaryReportId ?? null,
    });
    setSelectedPaymentMode(calculation?.paymentMethod || '');
  };

  // Close payment modal
  const handleClosePaymentModal = () => {
    setPaymentModal({ isOpen: false, month: '', amount: 0, paidAmount: '', salaryReportId: null });
    setSelectedPaymentMode('');
    setIsProcessingPayment(false); // Reset loading state when modal is closed
  };

  // Calculate excess or balance for payment modal
  const calculatePaymentDifference = () => {
    const calculatedAmount = paymentModal.amount || 0;
    const paidAmount = parseFloat(paymentModal.paidAmount) || 0;
    const difference = paidAmount - calculatedAmount;
    return {
      calculatedAmount,
      paidAmount,
      difference,
      isExcess: difference > 0,
      isBalance: difference < 0,
    };
  };

  // Proceed to payment
  const handleProceedPayment = async () => {
    if (!paymentModal.paidAmount || isNaN(parseFloat(paymentModal.paidAmount))) {
      setPayrollMessage({ type: 'error', text: 'Please enter a valid payment amount.' });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 3000);
      return;
    }

    if (!selectedPaymentMode) {
      setPayrollMessage({ type: 'error', text: 'Please select a payment mode.' });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 3000);
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setPayrollMessage({ type: 'error', text: 'Authorization token missing. Please log in again.' });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
      return;
    }

    const calculation = payrollCalculations.find((calc) => calc.month === paymentModal.month);
    let salaryReportId =
      paymentModal.salaryReportId ??
      calculation?.salaryReportId ??
      null;

    // Set loading early: may re-fetch salary-report before payment POST
    setIsProcessingPayment(true);

    // Resolve salary_report_id from /payroll/salary-report/ for this month
    if (!salaryReportId) {
      try {
        salaryReportId = await resolveSalaryReportIdForMonth(paymentModal.month);
        if (salaryReportId) {
          setPaymentModal((prev) => ({ ...prev, salaryReportId }));
          setPayrollCalculations((prev) =>
            prev.map((row) =>
              row.month === paymentModal.month ? { ...row, salaryReportId } : row
            )
          );
        }
      } catch {
        salaryReportId = null;
      }
    }

    if (!salaryReportId) {
      setIsProcessingPayment(false);
      setPayrollMessage({
        type: 'error',
        text: 'Salary report id is missing for this month. Payment cannot be processed until the salary-report API returns an id.',
      });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
      return;
    }

    const paidAmount = parseFloat(paymentModal.paidAmount);
    
    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const apiUrl = `${baseUrl}/payroll/salary-transactions/`;
      
      // Prepare payload
      const payload = {
        salary_report_id: salaryReportId,
        amount_paid: paidAmount.toFixed(2),
        payment_method: selectedPaymentMode.toUpperCase(),
      };

      const response = await axios.post(apiUrl, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      // Payment successful - check response
      if (response.data && response.data.action === 'created' && response.data.transaction) {
        // Close modal first
        handleClosePaymentModal();
        
        // Show success message
        const transaction = response.data.transaction;
        const calc = calculatePaymentDifference();
        let message = `Payment of ₹${paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} processed via ${selectedPaymentMode.replace(/_/g, ' ').toUpperCase()}!`;
        if (calc.isExcess) {
          message += ` Excess: ₹${Math.abs(calc.difference).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else if (calc.isBalance) {
          message += ` Balance due: ₹${Math.abs(calc.difference).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        
        setPayrollMessage({ type: 'success', text: message });
        
        // Reload calculation and attendance APIs
        setIsCalculating(true);
        await calculatePayroll(true);
        
        setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
      } else {
        // Unexpected response format
        handleClosePaymentModal();
        setPayrollMessage({ type: 'success', text: 'Payment processed successfully!' });
        
        // Reload calculation and attendance APIs
        setIsCalculating(true);
        await calculatePayroll(true);
        
        setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
      }
      // Set loading to false on success
      setIsProcessingPayment(false);
    } catch (error) {
      const responseData = error.response?.data;
      let message =
        (typeof responseData === 'string' && responseData) ||
        responseData?.message ||
        responseData?.detail ||
        error.message ||
        'Failed to process payment. Please try again.';
      
      // Check for field-specific errors
      if (responseData && typeof responseData === 'object') {
        const errorMessages = [];
        Object.keys(responseData).forEach(key => {
          if (Array.isArray(responseData[key]) && responseData[key].length > 0) {
            errorMessages.push(`${key}: ${responseData[key][0]}`);
          } else if (typeof responseData[key] === 'string') {
            errorMessages.push(responseData[key]);
          }
        });
        if (errorMessages.length > 0) {
          message = errorMessages.join(', ');
        }
      }
      
      setPayrollMessage({ type: 'error', text: message });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
      // Set loading to false on error
      setIsProcessingPayment(false);
    }
  };


  // Calculate payroll for a date range using attendance records
  const calculatePayrollForPeriod = (structure, attendanceRecords, startDate, endDate, totalDaysInMonth) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let present = 0, absent = 0, halfday = 0, paidleave = 0;
    let daysInPeriod = 0;

    // Count attendance for the period
    const currentDate = new Date(start);
    while (currentDate <= end) {
      daysInPeriod++;
      const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      const status = attendanceRecords[dateKey];
      if (status === 'present') present++;
      else if (status === 'absent') absent++;
      else if (status === 'halfday') halfday++;
      else if (status === 'paidleave') paidleave++;
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    let calculatedAmount = 0;
    let dailyRate = 0;
    let workedDays = 0; // Days actually worked (present + halfday*0.5 + paidleave)
    let calculationDetails = '';

    // Normalize salary_type to uppercase for comparison (handle both old and new formats)
    const salaryType = structure.salary_type ? structure.salary_type.toUpperCase() : 'MONTHLY';
    
    if (salaryType === 'HOURLY') {
      // For hourly: only count present and half-day hours (absent days = 0 hours)
      const totalHours = structure.hours 
        ? parseFloat(structure.hours) * ((present + halfday + paidleave) / totalDaysInMonth) // Pro-rate based on total days
        : (present * 8 + halfday * 4 + paidleave * 8); // 8 hours for present/paid leave, 4 for half day, 0 for absent
      const hourlyRate = parseFloat(structure.hourly_rate || structure.hourlyRate || 0);
      calculatedAmount = totalHours * hourlyRate;
      workedDays = present + (halfday * 0.5) + paidleave;
      calculationDetails = `${totalHours.toFixed(2)} hrs × ₹${hourlyRate.toFixed(2)}/hr`;
    } else if (salaryType === 'DAILY') {
      // Daily: Daily rate = Daily salary amount
      // Pay only for: present (full day) + halfday (0.5 day) + paidleave (full day)
      const salaryAmount = parseFloat(structure.salary_amount || structure.salaryAmount || 0);
      dailyRate = salaryAmount; // Daily rate is the salary amount itself
      workedDays = present + (halfday * 0.5) + paidleave;
      calculatedAmount = dailyRate * workedDays;
      calculationDetails = `${workedDays.toFixed(1)} worked days × ₹${dailyRate.toFixed(2)}/day`;
    } else if (salaryType === 'WEEKLY') {
      // Weekly: Daily rate = Weekly salary / 7 days
      // Pay only for: present (full day) + halfday (0.5 day) + paidleave (full day)
      const salaryAmount = parseFloat(structure.salary_amount || structure.salaryAmount || 0);
      dailyRate = salaryAmount / 7; // Daily rate based on 7 days per week
      workedDays = present + (halfday * 0.5) + paidleave;
      calculatedAmount = dailyRate * workedDays;
      calculationDetails = `${workedDays.toFixed(1)} worked days × ₹${dailyRate.toFixed(2)}/day (out of 7 days/week)`;
    } else if (salaryType === 'FORTNIGHTLY') {
      // Fortnightly: Daily rate = Fortnightly salary / Total days in period
      // But only pay for: present (full day) + halfday (0.5 day) + paidleave (full day)
      const salaryAmount = parseFloat(structure.salary_amount || structure.salaryAmount || 0);
      dailyRate = salaryAmount / daysInPeriod; // Daily rate based on total days in period
      // Pay only for: present (full day) + halfday (0.5 day) + paidleave (full day)
      workedDays = present + (halfday * 0.5) + paidleave;
      calculatedAmount = dailyRate * workedDays;
      calculationDetails = `${workedDays.toFixed(1)} worked days × ₹${dailyRate.toFixed(2)}/day (out of ${daysInPeriod} days)`;
    } else if (salaryType === 'MONTHLY' || salaryType === 'FULLTIME' || salaryType === 'FIXED') {
      // Monthly/Full-time/Fixed: Daily rate = Monthly salary / Total days in month (e.g., 31 for December)
      // But only pay for: present (full day) + halfday (0.5 day) + paidleave (full day)
      // Absent days = 0 payment
      const salaryAmount = parseFloat(structure.salary_amount || structure.salaryAmount || 0);
      dailyRate = salaryAmount / totalDaysInMonth; // Daily rate based on total days in month
      // Pay only for: present (full day) + halfday (0.5 day) + paidleave (full day)
      workedDays = present + (halfday * 0.5) + paidleave;
      calculatedAmount = dailyRate * workedDays;
      calculationDetails = `${workedDays.toFixed(1)} worked days × ₹${dailyRate.toFixed(2)}/day (out of ${totalDaysInMonth} days)`;
    }

    return {
      present,
      absent,
      halfday,
      paidleave,
      calculatedAmount: Math.round(calculatedAmount * 100) / 100,
      daysInPeriod,
      payableDays: totalDaysInMonth, // Show total days in month (passed as parameter)
      workedDays: Math.round(workedDays * 10) / 10, // Days actually worked
      dailyRate: Math.round(dailyRate * 100) / 100,
      calculationDetails,
    };
  };

  // Calculate payroll for a month with multiple structures
  const calculateMonthlyPayroll = (structures, attendanceRecords, year, month) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    // Get all structures that apply to this month, sorted by start date
    const applicableStructures = structures
      .filter(s => {
        const structDate = new Date(s.effective_from || s.start_date || s.startDate || s.start_month || s.startMonth || s.month + '-01');
        const structYear = structDate.getFullYear();
        const structMonth = structDate.getMonth();
        return structYear === year && structMonth === month;
      })
      .sort((a, b) => {
        const dateA = new Date(a.effective_from || a.start_date || a.startDate || a.start_month || a.startMonth || a.month + '-01');
        const dateB = new Date(b.effective_from || b.start_date || b.startDate || b.start_month || b.startMonth || b.month + '-01');
        return dateA - dateB;
      });

    // If no structure for this month, find the most recent one before this month
    if (applicableStructures.length === 0) {
      const previousStructure = structures
        .filter(s => {
          const structDate = new Date(s.effective_from || s.start_date || s.startDate || s.start_month || s.startMonth || s.month + '-01');
          return structDate < new Date(year, month, 1);
        })
        .sort((a, b) => {
          const dateA = new Date(a.start_date || a.startDate || a.start_month || a.startMonth || a.month + '-01');
          const dateB = new Date(b.start_date || b.startDate || b.start_month || b.startMonth || b.month + '-01');
          return dateB - dateA;
        })[0];

      if (previousStructure) {
        const periodResult = calculatePayrollForPeriod(previousStructure, attendanceRecords, monthStart, monthEnd, daysInMonth);
        const advanceAmount = parseFloat(previousStructure?.advance_amount || previousStructure?.advanceAmount || 0);
        const loanAmount = parseFloat(previousStructure?.loan_amount || previousStructure?.loanAmount || 0);
        const finalAmount = Math.max(0, periodResult.calculatedAmount - advanceAmount - loanAmount);
        
        return {
          month: `${year}-${String(month + 1).padStart(2, '0')}`,
          ...periodResult,
          advanceAmount: Math.round(advanceAmount * 100) / 100,
          loanAmount: Math.round(loanAmount * 100) / 100,
          finalAmount: Math.round(finalAmount * 100) / 100,
          structure: previousStructure,
          payableDays: daysInMonth, // Total days in month
          workedDays: periodResult.workedDays,
          dailyRate: periodResult.dailyRate,
          calculationDetails: periodResult.calculationDetails,
        };
      }
      return null;
    }

    // Calculate for each period within the month
    let totalPresent = 0, totalAbsent = 0, totalHalfday = 0, totalPaidleave = 0, totalAmount = 0;
    let totalWorkedDays = 0;
    let calculationDetails = '';
    const totalDaysInMonth = daysInMonth; // Total days in the month (e.g., 31 for December)
    const periodCalculations = []; // Store individual period calculations for display

    for (let i = 0; i < applicableStructures.length; i++) {
      const structure = applicableStructures[i];
      const structureStartDate = new Date(structure.effective_from || structure.start_date || structure.startDate || structure.start_month || structure.startMonth || structure.month + '-01');
      const structureStartDay = structureStartDate.getDate();
      
      // Determine period start and end dates
      let periodStartDate;
      if (i === 0) {
        // First structure starts from beginning of month (Dec 1)
        periodStartDate = monthStart;
      } else {
        // Subsequent structures: if structure date is Dec 10, it applies from Dec 11
        // So period starts from structureStartDay + 1
        const periodStartDay = structureStartDay + 1;
        periodStartDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(periodStartDay).padStart(2, '0')}`;
      }
      
      // Period ends at the day before next structure's effective start, or end of month
      let periodEndDate;
      if (i < applicableStructures.length - 1) {
        const nextStructure = applicableStructures[i + 1];
        const nextStart = new Date(nextStructure.effective_from || nextStructure.start_date || nextStructure.startDate || nextStructure.start_month || nextStructure.startMonth || nextStructure.month + '-01');
        const nextStartDay = nextStart.getDate();
        // If next structure starts on Dec 10, current structure applies until Dec 10
        // Example: Structure 1 (Dec 1) applies Dec 1-10, Structure 2 (Dec 10) applies Dec 11-31
        periodEndDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(nextStartDay).padStart(2, '0')}`;
      } else {
        // Last structure applies until end of month
        periodEndDate = monthEnd;
      }

      const periodResult = calculatePayrollForPeriod(structure, attendanceRecords, periodStartDate, periodEndDate, totalDaysInMonth);
      totalPresent += periodResult.present;
      totalAbsent += periodResult.absent;
      totalHalfday += periodResult.halfday;
      totalPaidleave += periodResult.paidleave;
      totalAmount += periodResult.calculatedAmount;
      totalWorkedDays += periodResult.workedDays;
      
      // Store period calculation for display
      periodCalculations.push({
        startDate: periodStartDate,
        endDate: periodEndDate,
        workedDays: periodResult.workedDays,
        dailyRate: periodResult.dailyRate,
        amount: periodResult.calculatedAmount,
        salaryAmount: parseFloat(structure.salary_amount || structure.salaryAmount || 0),
      });
    }

    // Calculate average daily rate for display (effective rate = total amount / total worked days)
    const avgDailyRate = totalWorkedDays > 0 ? totalAmount / totalWorkedDays : 0;
    
    // Build calculation details - always use the effective daily rate to match the actual calculation
    if (applicableStructures.length > 1) {
      // Multiple structures: show breakdown with effective rate
      const parts = periodCalculations.map((p, idx) => {
        const startDay = new Date(p.startDate).getDate();
        const endDay = new Date(p.endDate).getDate();
        return `${startDay}-${endDay}: ${p.workedDays.toFixed(1)} days × ₹${p.dailyRate.toFixed(2)}/day = ₹${p.amount.toFixed(2)}`;
      });
      calculationDetails = `${parts.join('; ')} = ₹${totalAmount.toFixed(2)} (Effective: ${totalWorkedDays.toFixed(1)} days × ₹${avgDailyRate.toFixed(2)}/day)`;
    } else {
      // Single structure: show calculation using effective rate
      calculationDetails = `${totalWorkedDays.toFixed(1)} worked days × ₹${avgDailyRate.toFixed(2)}/day (out of ${totalDaysInMonth} days)`;
    }

    // Get advance and loan amounts from the latest structure
    const latestStructure = applicableStructures[applicableStructures.length - 1];
    const advanceAmount = parseFloat(latestStructure?.advance_amount || latestStructure?.advanceAmount || 0);
    const loanAmount = parseFloat(latestStructure?.loan_amount || latestStructure?.loanAmount || 0);
    
    // Calculate final amount (salary - advance - loan)
    const finalAmount = Math.max(0, totalAmount - advanceAmount - loanAmount);

    return {
      month: `${year}-${String(month + 1).padStart(2, '0')}`,
      present: totalPresent,
      absent: totalAbsent,
      halfday: totalHalfday,
      paidleave: totalPaidleave,
      calculatedAmount: Math.round(totalAmount * 100) / 100, // Base salary amount
      advanceAmount: Math.round(advanceAmount * 100) / 100,
      loanAmount: Math.round(loanAmount * 100) / 100,
      finalAmount: Math.round(finalAmount * 100) / 100, // Final amount after deductions
      structure: latestStructure, // Latest structure
      payableDays: totalDaysInMonth, // Total days in month (e.g., 31 for December)
      workedDays: Math.round(totalWorkedDays * 10) / 10, // Days actually worked
      dailyRate: Math.round(avgDailyRate * 100) / 100, // Average daily rate (weighted)
      calculationDetails,
    };
  };


  // Calculate payroll for all months (deduped — one in-flight calc at a time)
  const calculatePayroll = async (skipTabChange = false, structuresOverride = null) => {
    if (calculateInflightRef.current) return calculateInflightRef.current;

    calculateInflightRef.current = (async () => {
    const structures = Array.isArray(structuresOverride) ? structuresOverride : salaryStructures;
    if (!employee || structures.length === 0) {
      setPayrollMessage({ type: 'error', text: 'Please set up salary structure first.' });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
      return;
    }

    setIsCalculating(true);
    setPayrollMessage({ type: '', text: '' });

    try {
      const today = new Date();
      // For 6months: 6 months including current month (current month + 5 previous months)
      // For 1year: 12 months including current month (current month + 11 previous months)
      const monthsToCalculate = selectedPeriod === '6months' ? 6 : 12;
      
      // Calculate date range for API call
      // end_date must always be the present month's end date
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();
      const endDate = new Date(currentYear, currentMonth + 1, 0); // Last day of current month
      
      // Calculate start date based on selected period
      // For 6 months: go back 5 months from current month (currentMonth - 5)
      // For 1 year: go back 11 months from current month (currentMonth - 11)
      const startDate = new Date(currentYear, currentMonth - (monthsToCalculate - 1), 1); // First day of oldest month
      
      // Format dates as YYYY-MM-DD (format directly to avoid timezone issues)
      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);
      
      // Always fetch attendance + salary-report together (interdependent)
      const [attendanceDataResult, salaryTransactions] = await Promise.all([
        fetchAttendanceData(startDateStr, endDateStr),
        fetchSalaryTransactions()
      ]);
      
      const attendanceData = attendanceDataResult.attendanceData || {};
      const apiReports = attendanceDataResult.apiReports || [];
      setFetchedAttendanceRecords(attendanceData);
      
      // Use fetched attendance data, fallback to prop if API data is empty
      const recordsToUse = Object.keys(attendanceData).length > 0 ? attendanceData : attendanceRecords;
      
      // Create a map of API reports by month (YYYY-MM format) for quick lookup
      const apiReportsByMonth = {};
      apiReports.forEach((report) => {
        const monthKey =
          getSalaryReportMonthKey(report) ||
          toPayrollMonthKey(report.start_date) ||
          toPayrollMonthKey(report.end_date);
        if (monthKey) {
          apiReportsByMonth[monthKey] = report;
        }
      });
      
      // Create a map of salary reports by month (YYYY-MM) for quick lookup
      const transactionsByMonth = {};
      salaryTransactions.forEach((transaction) => {
        const monthKey =
          getSalaryReportMonthKey(transaction) ||
          toPayrollMonthKey(transaction.start_date || transaction.payment_period_start) ||
          toPayrollMonthKey(transaction.end_date || transaction.payment_period_end);
        if (monthKey) {
          transactionsByMonth[monthKey] = transaction;
        }
      });
      
      const calculations = [];

      for (let i = 0; i < monthsToCalculate; i++) {
        const calcDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const year = calcDate.getFullYear();
        const month = calcDate.getMonth();
        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        
        // Calculate payroll for the month (handles multiple structures within the month)
        const calculation = calculateMonthlyPayroll(structures, recordsToUse, year, month);
        if (calculation) {
          // Use API report values if available
          // Map API response fields to UI:
          // - present_days, absent_days, half_day_count, paid_leave_days → Attendance columns
          // - total_payable_days → Payable Days column
          const apiReport = apiReportsByMonth[monthKey];
          const transaction = transactionsByMonth[monthKey];

          // Always attach salary_report id when the salary-report API has this month
          calculation.salaryReportId = getSalaryReportId(transaction);
          
          if (apiReport) {
            // Attendance data from API response
            if ('present_days' in apiReport && apiReport.present_days !== undefined) {
              calculation.present = Math.round(parseFloat(apiReport.present_days) || 0);
            }
            if ('absent_days' in apiReport && apiReport.absent_days !== undefined) {
              calculation.absent = Math.round(parseFloat(apiReport.absent_days) || 0);
            }
            if ('half_day_count' in apiReport && apiReport.half_day_count !== undefined) {
              calculation.halfday = Math.round(parseFloat(apiReport.half_day_count) || 0);
            }
            if ('paid_leave_days' in apiReport && apiReport.paid_leave_days !== undefined) {
              calculation.paidleave = Math.round(parseFloat(apiReport.paid_leave_days) || 0);
            }
            if ('total_payable_days' in apiReport && apiReport.total_payable_days !== undefined) {
              calculation.payableDays = parseFloat(apiReport.total_payable_days) || 0;
            }
          }
          
          // Use transaction data for payment information
          if (transaction) {
            // Use advance_amount from transaction if available
            if ('advance_amount' in transaction && transaction.advance_amount !== undefined && transaction.advance_amount !== null) {
              const advanceAmount = parseFloat(transaction.advance_amount);
              if (!isNaN(advanceAmount)) {
                calculation.advanceAmount = Math.round(advanceAmount * 100) / 100;
              }
            }
            
            // Final Amount (UI): Use final_salary from transaction
            if ('final_salary' in transaction && transaction.final_salary !== undefined && transaction.final_salary !== null) {
              const finalSalary = parseFloat(transaction.final_salary);
              if (!isNaN(finalSalary)) {
                calculation.calculatedAmount = Math.round(finalSalary * 100) / 100;
              }
            } else if ('total_payable_amount' in transaction && transaction.total_payable_amount !== undefined && transaction.total_payable_amount !== null) {
              // Fallback to total_payable_amount if final_salary is not available
              const totalPayableAmount = parseFloat(transaction.total_payable_amount);
              if (!isNaN(totalPayableAmount)) {
                calculation.calculatedAmount = Math.round(totalPayableAmount * 100) / 100;
              }
            }
            
            // Current Amount (UI): Use total_payable_amount from transaction
            if ('total_payable_amount' in transaction && transaction.total_payable_amount !== undefined && transaction.total_payable_amount !== null) {
              const totalPayableAmount = parseFloat(transaction.total_payable_amount);
              if (!isNaN(totalPayableAmount)) {
                calculation.finalAmount = Math.round(totalPayableAmount * 100) / 100;
              } else {
                calculation.finalAmount = 0;
              }
            } else {
              calculation.finalAmount = 0;
            }
            
            // Store transaction status and amounts for reference
            calculation.transactionStatus = transaction.status || 'PENDING';
            calculation.transactionId = transaction.transaction_id || null;
            // Store payment method from transaction
            if ('payment_method' in transaction && transaction.payment_method) {
              // Convert API format (e.g., "CASH", "BANK_TRANSFER") to lowercase format matching modal options
              calculation.paymentMethod = transaction.payment_method.toLowerCase();
            }
            // Store amounts for total calculation
            if ('total_payable_amount' in transaction) {
              calculation.totalPayableAmount = parseFloat(transaction.total_payable_amount) || 0;
            }
            if ('paid_amount' in transaction) {
              calculation.paidAmount = parseFloat(transaction.paid_amount) || 0;
            }
            if ('remaining_payment' in transaction) {
              calculation.remainingPayment = parseFloat(transaction.remaining_payment) || 0;
            }
            if ('final_salary' in transaction) {
              calculation.finalSalary = parseFloat(transaction.final_salary) || 0;
            }
            if ('advance_amount' in transaction) {
              calculation.transactionAdvanceAmount = parseFloat(transaction.advance_amount) || 0;
            }
          } else {
            // No salary report found for this month - use calculated amount as total payable amount
            calculation.finalAmount = calculation.calculatedAmount || 0;
            // Store amounts for total calculation (no payment made yet)
            calculation.totalPayableAmount = calculation.calculatedAmount || 0;
            calculation.paidAmount = 0;
            calculation.remainingPayment = calculation.calculatedAmount || 0;
          }
          
          calculations.push(calculation);
        }
      }

      setPayrollCalculations(calculations); // Show current month first, then descending to older months
      if (!skipTabChange) {
        setActiveTab('calculation');
      }
    } catch (error) {
      const responseData = error.response?.data;
      let message =
        (typeof responseData === 'string' && responseData) ||
        responseData?.message ||
        error.message ||
        'Error calculating payroll. Please try again.';
      setPayrollMessage({ type: 'error', text: message });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
    } finally {
      setIsCalculating(false);
      calculateInflightRef.current = null;
    }
    })();

    return calculateInflightRef.current;
  };

  // Submit salary structure (save to API)
  const submitSalaryStructure = async () => {
    if (!employee) {
      setPayrollMessage({ type: 'error', text: 'No employee selected.' });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
      return;
    }

    // Validation
    if (!formData.startDate) {
      setPayrollMessage({ type: 'error', text: 'Please select a start date.' });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
      return;
    }

    if (!formData.salaryType) {
      setPayrollMessage({ type: 'error', text: 'Please select a salary type.' });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
      return;
    }

    if (formData.salaryType === 'HOURLY') {
      if (!formData.hours || !formData.hourlyRate) {
        setPayrollMessage({ type: 'error', text: 'Please enter hours and hourly rate for hourly salary type.' });
        setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
        return;
      }
    } else {
      if (!formData.salaryAmount) {
        setPayrollMessage({ type: 'error', text: 'Please enter salary amount.' });
        setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
        return;
      }
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setPayrollMessage({ type: 'error', text: 'Authorization token missing. Please log in again.' });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
      return;
    }

    setIsSavingStructure(true);
    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      
      // Calculate amount based on salary type
      let amount = 0;
      if (formData.salaryType === 'HOURLY') {
        amount = parseFloat(formData.hours) * parseFloat(formData.hourlyRate);
      } else {
        amount = parseFloat(formData.salaryAmount);
      }

      // Format amount as string with 2 decimal places
      const formattedAmount = amount.toFixed(2);

      // Prepare payload
      const payload = {
        user: employee.id,
        salary_type: formData.salaryType,
        change_type: formData.amountType,
        amount: formattedAmount,
        effective_from: formData.startDate,
      };

      let response;
      if (editingStructure) {
        // Update existing structure
        const apiUrl = `${baseUrl}/payroll/salary-structures/${editingStructure.id}/`;
        response = await axios.put(apiUrl, payload, {
          headers: { 
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        setPayrollMessage({ type: 'success', text: 'Salary structure updated successfully!' });
      } else {
        // Create new structure - use query parameter format
        const apiUrl = `${baseUrl}/payroll/salary-structures/?user_id=${employee.id}`;
        response = await axios.post(apiUrl, payload, {
          headers: { 
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        const successMessage = formData.amountType === 'INCREMENT' 
          ? `Salary structure saved! New salary: ₹${response.data?.final_salary ? parseFloat(response.data.final_salary).toLocaleString('en-IN') : amount.toLocaleString('en-IN')}`
          : 'Salary structure saved successfully!';
        setPayrollMessage({ type: 'success', text: successMessage });
      }

      // Reload structures from API
      await loadSalaryStructures();
      
      // Reset form
      setFormData({
        startDate: new Date().toISOString().slice(0, 10),
        salaryType: 'MONTHLY',
        salaryAmount: '',
        amountType: 'BASE_SALARY',
        hours: '',
        hourlyRate: '',
      });
      setEditingStructure(null);

      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 2000);
    } catch (error) {
      const responseData = error.response?.data;
      let message = 'Failed to save salary structure. Please try again.';
      
      // Check for 400 error with specific change_type message
      if (error.response?.status === 400 && responseData) {
        // Check if response has change_type array with error message
        if (responseData.change_type && Array.isArray(responseData.change_type) && responseData.change_type.length > 0) {
          message = responseData.change_type[0];
        } else if (typeof responseData === 'string') {
          message = responseData;
        } else if (responseData.message) {
          message = responseData.message;
        } else if (responseData.error) {
          message = responseData.error;
        } else if (error.message) {
          message = error.message;
        }
      } else {
        // For other errors, use standard error handling
        message =
          (typeof responseData === 'string' && responseData) ||
          responseData?.message ||
          responseData?.error ||
          error.message ||
          'Failed to save salary structure. Please try again.';
      }
      
      setPayrollMessage({ type: 'error', text: message });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
    } finally {
      setIsSavingStructure(false);
    }
  };

  // Edit salary structure
  const handleEditStructure = (structure) => {
    setEditingStructure(structure);
    
    // Get amount from API response (amount field) or component format
    const amount = structure.amount || structure.salary_amount || structure.salaryAmount || 0;
    const changeType = structure.change_type || structure.amountType || 'BASE_SALARY';
    
    // Determine display amount based on change type
    let displayAmount = '';
    if (changeType === 'ADVANCE' || changeType === 'LOAN') {
      displayAmount = String(amount);
    } else {
      // Check if salary type is hourly (handle both old and new formats)
      const isHourlyType = structure.salary_type && (structure.salary_type.toUpperCase() === 'HOURLY');
      displayAmount = isHourlyType ? '' : String(amount);
    }
    
    // Map API salary_type to form values (handle both lowercase and uppercase)
    const mapSalaryType = (apiType) => {
      if (!apiType) return 'MONTHLY';
      const upperType = apiType.toUpperCase();
      if (['HOURLY', 'DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY'].includes(upperType)) {
        return upperType;
      }
      // Legacy mapping for old values
      if (apiType.toLowerCase() === 'hourly') return 'HOURLY';
      if (apiType.toLowerCase() === 'fulltime') return 'MONTHLY';
      if (apiType.toLowerCase() === 'fortnightly') return 'FORTNIGHTLY';
      if (apiType.toLowerCase() === 'fixed') return 'MONTHLY';
      return 'MONTHLY';
    };
    
    setFormData({
      startDate: structure.effective_from || structure.start_date || structure.startDate || (structure.start_month || structure.startMonth || structure.month + '-01').slice(0, 10) || new Date().toISOString().slice(0, 10),
      salaryType: mapSalaryType(structure.salary_type) || 'MONTHLY',
      salaryAmount: displayAmount || '',
      amountType: changeType,
      hours: structure.hours || '',
      hourlyRate: structure.hourly_rate || structure.hourlyRate || '',
    });
  };

  // Delete salary structure
  const handleDeleteStructure = async (structureId) => {
    if (!window.confirm('Are you sure you want to delete this salary structure?')) {
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setPayrollMessage({ type: 'error', text: 'Authorization token missing. Please log in again.' });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
      return;
    }

    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const apiUrl = `${baseUrl}/payroll/salary-structures/${structureId}/`;
      
      await axios.delete(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // Reload structures from API
      await loadSalaryStructures();
      
      setPayrollMessage({ type: 'success', text: 'Salary structure deleted successfully!' });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 2000);
    } catch (error) {
      const responseData = error.response?.data;
      let message =
        (typeof responseData === 'string' && responseData) ||
        responseData?.message ||
        responseData?.error ||
        error.message ||
        'Failed to delete salary structure. Please try again.';
      setPayrollMessage({ type: 'error', text: message });
      setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingStructure(null);
    setFormData({
      startDate: new Date().toISOString().slice(0, 10),
      salaryType: 'MONTHLY',
      salaryAmount: '',
      amountType: 'regular',
      hours: '',
      hourlyRate: '',
    });
  };

  // Load data when modal opens — always refresh both calc APIs for calculation mode
  useEffect(() => {
    if (!isOpen || !employee?.id) return;

    skipPeriodEffectRef.current = true;
    const nextTab = viewMode === 'calculation' ? 'calculation' : 'structure';
    setActiveTab(nextTab);
    setPayrollCalculations([]);
    setSelectedExportMonths([]);
    setExportFeedback('');
    setFetchedAttendanceRecords({});
    setApiAttendanceData([]);
    setPayrollMessage({ type: '', text: '' });
    setFormData({
      startDate: new Date().toISOString().slice(0, 10),
      salaryType: 'MONTHLY',
      salaryAmount: '',
      amountType: 'BASE_SALARY',
      hours: '',
      hourlyRate: '',
    });
    setEditingStructure(null);

    (async () => {
      const structures = await loadSalaryStructures();
      if (nextTab !== 'calculation') {
        skipPeriodEffectRef.current = false;
        return;
      }
      if (structures.length > 0) {
        await calculatePayroll(true, structures);
      } else {
        setPayrollCalculations([]);
        setPayrollMessage({ type: 'error', text: 'Please set up salary structure first.' });
        setTimeout(() => setPayrollMessage({ type: '', text: '' }), 5000);
      }
      skipPeriodEffectRef.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, employee?.id, viewMode]);

  // Recalculate only when period/tab changes after the initial open load
  useEffect(() => {
    if (!isOpen || !employee?.id || activeTab !== 'calculation') return;
    if (salaryStructures.length === 0) return;
    if (skipPeriodEffectRef.current) return;
    calculatePayroll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedPeriod]);

  const handleClose = () => {
    setActiveTab(viewMode === 'calculation' ? 'calculation' : 'structure');
    setPayrollCalculations([]);
    setSelectedExportMonths([]);
    setExportFeedback('');
    setFetchedAttendanceRecords({});
    setApiAttendanceData([]);
    setSalaryStructures([]);
    setPayrollMessage({ type: '', text: '' });
    onClose();
  };

  // Keep export selection in sync with visible calculation rows
  useEffect(() => {
    const validMonths = new Set(
      payrollCalculations.map((calc) => calc.month).filter(Boolean),
    );
    setSelectedExportMonths((prev) => prev.filter((month) => validMonths.has(month)));
  }, [payrollCalculations]);

  const allExportMonthsSelected =
    payrollCalculations.length > 0 &&
    payrollCalculations.every((calc) => selectedExportMonths.includes(calc.month));

  const toggleExportMonth = (monthKey) => {
    if (!monthKey) return;
    setSelectedExportMonths((prev) =>
      prev.includes(monthKey) ? prev.filter((m) => m !== monthKey) : [...prev, monthKey],
    );
    setExportFeedback('');
  };

  const toggleSelectAllExportMonths = () => {
    if (allExportMonthsSelected) {
      setSelectedExportMonths([]);
    } else {
      setSelectedExportMonths(
        payrollCalculations.map((calc) => calc.month).filter(Boolean),
      );
    }
    setExportFeedback('');
  };

  const handleExportSelectedMonths = () => {
    const selectedRows = payrollCalculations.filter((calc) =>
      selectedExportMonths.includes(calc.month),
    );
    if (!selectedRows.length) {
      setExportFeedback('Select one or more months to export.');
      return;
    }
    try {
      exportPayoutHistoryExcel(selectedRows, employee?.name || '');
      setExportFeedback('');
    } catch (err) {
      setExportFeedback(err.message || 'Unable to export Excel file.');
    }
  };

  if (!isOpen || !employee) {
    return null;
  }

  

  return (
    <div className="fixed inset-0 bg-transparent backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border-2 border-gray-300 p-2.5 max-w-6xl w-full max-h-[85vh] overflow-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold text-gray-900">
            Payroll - {employee.name}
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 text-xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Tabs — hidden when opened as calculation-only (e.g. Payout History) */}
        {viewMode !== 'calculation' ? (
          <div className="flex items-center gap-2 mb-2 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('structure')}
              className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
                activeTab === 'structure'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Salary Structure
            </button>
            <button
              onClick={() => setActiveTab('calculation')}
              className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
                activeTab === 'calculation'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Payout History
            </button>
          </div>
        ) : (
          <div className="mb-2 border-b border-gray-200 pb-1.5">
            <h4 className="text-sm font-semibold text-indigo-700">Payout History</h4>
          </div>
        )}

        {/* Message Display */}
        {payrollMessage.text && (
          <div className={`mb-2 p-1.5 rounded-lg flex items-center gap-1.5 ${
            payrollMessage.type === 'success' 
              ? 'bg-green-50 border border-green-200 text-green-800' 
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {payrollMessage.type === 'success' ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
            <span className="text-xs font-medium">{payrollMessage.text}</span>
          </div>
        )}

        {/* Salary Structure Tab */}
        {activeTab === 'structure' && (
          <div className="space-y-2">
            {/* Add/Edit Salary Structure Form */}
            <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-xs font-bold text-gray-900">
                  {editingStructure ? 'Edit Salary Structure' : 'Add Salary Structure'}
                </h4>
                {editingStructure && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="text-xs text-gray-600 hover:text-gray-900"
                  >
                    Cancel
                  </button>
                )}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); submitSalaryStructure(); }} className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Start Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.startDate || ''}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value || '' })}
                      className="w-full px-3 py-1.5 rounded-lg border-2 border-gray-300 bg-white text-gray-900 focus:outline-none focus:border-indigo-500 text-sm"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-0.5">Select the date when this structure becomes effective</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Salary Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.salaryType || 'MONTHLY'}
                      onChange={(e) => setFormData({ ...formData, salaryType: e.target.value || 'MONTHLY', salaryAmount: '', hours: '', hourlyRate: '' })}
                      className="w-full px-3 py-1.5 rounded-lg border-2 border-gray-300 bg-white text-gray-900 focus:outline-none focus:border-indigo-500 text-sm"
                      required
                    >
                      <option value="HOURLY">Hourly</option>
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="FORTNIGHTLY">Fortnightly</option>
                      <option value="MONTHLY">Monthly</option>
                    </select>
                  </div>
                </div>

                {formData.salaryType !== 'HOURLY' ? (
                  <div>
                    <div className="mb-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Structure Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.amountType || 'BASE_SALARY'}
                        onChange={(e) => setFormData({ ...formData, amountType: e.target.value || 'BASE_SALARY', salaryAmount: '' })}
                        className="w-full px-3 py-1.5 rounded-lg border-2 border-gray-300 bg-white text-gray-900 focus:outline-none focus:border-indigo-500 text-sm"
                        required
                      >
                        <option value="BASE_SALARY">Base Salary</option>
                        {!editingStructure && <option value="INCREMENT">Increment</option>}
                        <option value="ADVANCE">Advance</option>
                        <option value="LOAN">Loan</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formData.amountType === 'INCREMENT' 
                          ? 'Select this to add an increment to the previous salary structure'
                          : formData.amountType === 'ADVANCE'
                          ? 'Select this if the amount is an advance payment'
                          : formData.amountType === 'LOAN'
                          ? 'Select this if the amount is a loan'
                          : 'Base salary amount'}
                      </p>
                    </div>
                    
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {formData.amountType === 'INCREMENT'
                        ? 'Increment Amount (₹)' 
                        : formData.amountType === 'ADVANCE'
                          ? 'Advance Amount (₹)' 
                          : formData.amountType === 'LOAN'
                            ? 'Loan Amount (₹)' 
                            : 'Salary Amount (₹)'} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.salaryAmount || ''}
                      onChange={(e) => setFormData({ ...formData, salaryAmount: e.target.value || '' })}
                      placeholder={
                        formData.amountType === 'INCREMENT'
                          ? "Enter increment amount (e.g., 2000)" 
                          : formData.amountType === 'ADVANCE'
                            ? "Enter advance amount" 
                            : formData.amountType === 'LOAN'
                              ? "Enter loan amount" 
                              : "Enter salary amount"
                      }
                      className="w-full px-3 py-1.5 rounded-lg border-2 border-gray-300 bg-white text-gray-900 focus:outline-none focus:border-indigo-500 text-sm"
                      required
                    />
                    {formData.amountType === 'INCREMENT' && formData.salaryAmount && !editingStructure && (() => {
                      const startDate = new Date(formData.startDate);
                      const previousStructure = salaryStructures
                        .filter(s => {
                          const structDate = new Date(s.effective_from || s.start_date || s.startDate || s.start_month || s.startMonth || s.month + '-01');
                          return structDate < startDate && s.salary_type === formData.salaryType;
                        })
                        .sort((a, b) => {
                          const dateA = new Date(a.start_date || a.startDate || a.start_month || a.startMonth || a.month + '-01');
                          const dateB = new Date(b.start_date || b.startDate || b.start_month || b.startMonth || b.month + '-01');
                          return dateB - dateA;
                        })[0];
                      
                      if (previousStructure) {
                        const previousSalary = parseFloat(previousStructure.salary_amount || previousStructure.salaryAmount || 0);
                        const increment = parseFloat(formData.salaryAmount);
                        const finalSalary = previousSalary + increment;
                        return (
                          <div className="mt-1.5 p-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-xs text-gray-600">
                              Previous Salary: <span className="font-semibold">₹{previousSalary.toLocaleString('en-IN')}</span>
                            </p>
                            <p className="text-xs text-gray-600">
                              Increment: <span className="font-semibold">₹{increment.toLocaleString('en-IN')}</span>
                            </p>
                            <p className="text-xs font-bold text-blue-700 mt-0.5">
                              New Salary: ₹{finalSalary.toLocaleString('en-IN')}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Hours <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.hours || ''}
                        onChange={(e) => setFormData({ ...formData, hours: e.target.value || '' })}
                        placeholder="Enter hours"
                        className="w-full px-3 py-1.5 rounded-lg border-2 border-gray-300 bg-white text-gray-900 focus:outline-none focus:border-indigo-500 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Hourly Rate (₹) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.hourlyRate || ''}
                        onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value || '' })}
                        placeholder="Enter hourly rate"
                        className="w-full px-3 py-1.5 rounded-lg border-2 border-gray-300 bg-white text-gray-900 focus:outline-none focus:border-indigo-500 text-sm"
                        required
                      />
                    </div>
                  </div>
                )}


                <div className="flex items-center gap-1.5">
                  <button
                    type="submit"
                    disabled={isSavingStructure}
                    className={`px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                      isSavingStructure ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  >
                    {isSavingStructure ? (
                      <>
                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Saving...</span>
                      </>
                    ) : (
                      editingStructure ? 'Update Structure' : 'Save Salary Structure'
                    )}
                  </button>
                  {editingStructure && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={isSavingStructure}
                      className={`px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-semibold transition-colors ${
                        isSavingStructure ? 'opacity-60 cursor-not-allowed' : ''
                      }`}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Existing Salary Structures */}
            <div>
              <h4 className="text-xs font-bold text-gray-900 mb-1.5">Existing Salary Structures</h4>
              {isLoadingStructures ? (
                <div className="bg-gray-50 rounded-lg p-2.5 text-center border border-gray-200">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-xs text-gray-600">Loading salary structures...</p>
                  </div>
                </div>
              ) : salaryStructures.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-2.5 text-center border border-gray-200">
                  <p className="text-xs text-gray-600">No salary structures found. Add one above to get started.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-100 border-b-2 border-gray-300">
                        <th className="text-left py-2 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Start Date</th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Salary Type</th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Change Type</th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Amount</th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Final Salary</th>
                        {salaryStructures.some(s => s.salary_type && s.salary_type.toUpperCase() === 'HOURLY') && (
                          <th className="text-left py-2 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Hours / Rate</th>
                        )}
                        <th className="text-center py-2 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salaryStructures.map((structure, index) => (
                        <tr key={structure.id || index} className="border-b border-gray-200 bg-white hover:bg-gray-50">
                          <td className="py-2 px-2 text-gray-700">
                            {new Date(structure.effective_from || structure.start_date || structure.startDate || structure.start_month || structure.startMonth || structure.month + '-01').toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </td>
                          <td className="py-2 px-2 text-gray-700 text-xs">
                            {(() => {
                              const salaryType = structure.salary_type ? structure.salary_type.toUpperCase() : 'MONTHLY';
                              const typeLabels = {
                                'HOURLY': 'Hourly',
                                'DAILY': 'Daily',
                                'WEEKLY': 'Weekly',
                                'FORTNIGHTLY': 'Fortnightly',
                                'MONTHLY': 'Monthly',
                                'FULLTIME': 'Monthly',
                                'FIXED': 'Monthly',
                              };
                              return typeLabels[salaryType] || salaryType;
                            })()}
                          </td>
                          <td className="py-2 px-2 text-gray-700 text-xs">
                            {(() => {
                              const changeType = structure.change_type || structure.amountType || 'BASE_SALARY';
                              const changeTypeLabels = {
                                'BASE_SALARY': 'Base Salary',
                                'INCREMENT': 'Increment',
                                'ADVANCE': 'Advance',
                                'LOAN': 'Loan',
                              };
                              return changeTypeLabels[changeType] || changeType;
                            })()}
                          </td>
                          <td className="py-2 px-2 font-semibold text-gray-900 text-xs">
                            ₹{parseFloat(structure.amount || structure.salary_amount || structure.salaryAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-2 font-semibold text-indigo-600 text-xs">
                            ₹{parseFloat(structure.final_salary || structure.salary_amount || structure.salaryAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          {salaryStructures.some(s => s.salary_type && s.salary_type.toUpperCase() === 'HOURLY') && (
                            <td className="py-2 px-2 text-gray-700 text-xs">
                              {(structure.salary_type && structure.salary_type.toUpperCase() === 'HOURLY') 
                                ? `${structure.hours || 'N/A'} hrs @ ₹${structure.hourly_rate || structure.hourlyRate || '0'}/hr`
                                : '-'
                              }
                            </td>
                          )}
                          <td className="py-2 px-2">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleEditStructure(structure)}
                                className="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
                                title="Edit"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteStructure(structure.id)}
                                className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors"
                                title="Delete"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {/* Pagination Controls */}
                  {(paginationInfo.next || paginationInfo.previous) && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                      <div className="text-xs text-gray-600">
                        Total: {paginationInfo.count} structure{paginationInfo.count !== 1 ? 's' : ''}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => loadSalaryStructures(paginationInfo.previous)}
                          disabled={!paginationInfo.previous || isLoadingStructures}
                          className={`px-3 py-1.5 text-xs rounded transition-colors ${
                            !paginationInfo.previous || isLoadingStructures
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700'
                          }`}
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => loadSalaryStructures(paginationInfo.next)}
                          disabled={!paginationInfo.next || isLoadingStructures}
                          className={`px-3 py-1.5 text-xs rounded transition-colors ${
                            !paginationInfo.next || isLoadingStructures
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700'
                          }`}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payroll Calculation Tab */}
        {activeTab === 'calculation' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-semibold text-gray-700" htmlFor="payout-history-period">
                Period:
              </label>
              <select
                id="payout-history-period"
                value={selectedPeriod || '6months'}
                onChange={(e) => setSelectedPeriod(e.target.value || '6months')}
                className="rounded-lg border-2 border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none"
              >
                <option value="6months">6 Months Including Current Month</option>
                <option value="1year">1 Year Including Current Month</option>
              </select>
              {payrollCalculations.length > 0 ? (
                <button
                  type="button"
                  onClick={handleExportSelectedMonths}
                  disabled={
                    isCalculating ||
                    isLoadingAttendance ||
                    isLoadingSalaryReport ||
                    isProcessingPayment
                  }
                  className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    isCalculating ||
                    isLoadingAttendance ||
                    isLoadingSalaryReport ||
                    isProcessingPayment
                      ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                      : 'bg-emerald-700 text-white hover:bg-emerald-800'
                  }`}
                  title="Export selected months to Excel"
                >
                  Export Excel
                  {selectedExportMonths.length > 0 ? ` (${selectedExportMonths.length})` : ''}
                </button>
              ) : null}
              {(isCalculating || isLoadingAttendance || isLoadingSalaryReport || isProcessingPayment) && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>
                    {isProcessingPayment && 'Processing payment...'}
                    {!isProcessingPayment && isLoadingAttendance && 'Loading attendance...'}
                    {!isProcessingPayment && !isLoadingAttendance && isLoadingSalaryReport && 'Loading salary report...'}
                    {!isProcessingPayment && !isLoadingAttendance && !isLoadingSalaryReport && isCalculating && 'Calculating...'}
                  </span>
                </div>
              )}
            </div>
            {exportFeedback ? (
              <p className="text-xs font-medium text-amber-700" role="status">
                {exportFeedback}
              </p>
            ) : null}

            {payrollCalculations.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-200">
                <p className="text-xs text-gray-600 mb-1">No payroll calculations available.</p>
                <p className="text-xs text-gray-500">Payroll calculations are generated automatically based on attendance and salary structure. Please set up salary structure first if calculations are not showing.</p>
              </div>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-2">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-xs text-blue-800">
                      <span className="font-semibold">Tip:</span> Click on the <span className="font-bold text-indigo-700">"Current Amount"</span> button in each row to process payment for that month.
                      {' '}Select one or more months with the checkboxes, then use <span className="font-bold text-emerald-700">Export Excel</span>.
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-100 border-b-2 border-gray-300">
                        <th className="py-1.5 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={allExportMonthsSelected}
                            onChange={toggleSelectAllExportMonths}
                            className="h-3.5 w-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                            aria-label="Select all months for export"
                            title="Select all months"
                          />
                        </th>
                        <th className="text-left py-1.5 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Month</th>
                        <th className="text-center py-1.5 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Present</th>
                        <th className="text-center py-1.5 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Absent</th>
                        <th className="text-center py-1.5 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Half Day</th>
                        <th className="text-center py-1.5 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Paid Leave</th>
                        <th className="text-center py-1.5 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Payable Days</th>
                        <th className="text-right py-1.5 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Advance</th>
                        <th className="text-right py-1.5 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Loan</th>
                        <th className="text-right py-1.5 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Total Payable Amount</th>
                        <th className="text-right py-1.5 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Paid Amount (₹)</th>
                        <th className="text-right py-1.5 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Monthly Balance</th>
                        <th className="text-right py-1.5 px-2 font-semibold text-gray-900 text-xs uppercase tracking-wide">Cumulative Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollCalculations.map((calc, index) => {
                        const advance = calc.advanceAmount || 0;
                        const loan = calc.loanAmount || 0;
                        const paidAmount = calc.paidAmount || 0;
                        const totalPayableAmount = calc.totalPayableAmount || calc.finalAmount || 0;
                        // Determine payment status
                        const isPaid = Math.abs(totalPayableAmount - paidAmount) < 0.01 && totalPayableAmount > 0 && paidAmount > 0;
                        const isPartiallyPaid = paidAmount > 0 && paidAmount < totalPayableAmount;
                        const isAmountExceeded = paidAmount > totalPayableAmount && totalPayableAmount > 0;
                        const isMonthSelected = selectedExportMonths.includes(calc.month);
                        return (
                          <tr key={index} className="border-b border-gray-200 bg-white hover:bg-gray-50">
                            <td className="py-1.5 px-2 text-center">
                              <input
                                type="checkbox"
                                checked={isMonthSelected}
                                onChange={() => toggleExportMonth(calc.month)}
                                className="h-3.5 w-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                                aria-label={`Select ${formatMonthLabel(calc.month)} for export`}
                              />
                            </td>
                            <td className="py-1.5 px-2 text-gray-700 text-xs">
                              {formatMonthLabel(calc.month)}
                            </td>
                            <td className="py-1.5 px-2 text-center text-green-600 font-semibold text-xs">{calc.present}</td>
                            <td className="py-1.5 px-2 text-center text-red-600 font-semibold text-xs">{calc.absent}</td>
                            <td className="py-1.5 px-2 text-center text-yellow-600 font-semibold text-xs">{calc.halfday}</td>
                            <td className="py-1.5 px-2 text-center text-blue-600 font-semibold text-xs">{calc.paidleave}</td>
                            <td className="py-1.5 px-2 text-center text-gray-700 font-semibold text-xs">
                              {calc.payableDays || (() => {
                                const monthDate = new Date(calc.month + '-01');
                                return new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
                              })()}
                            </td>
                            <td className="py-1.5 px-2 text-right text-orange-600 text-xs">
                              {advance > 0 ? `₹${advance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                            </td>
                            <td className="py-1.5 px-2 text-right text-purple-600 text-xs">
                              {loan > 0 ? `₹${loan.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                            </td>
                            <td className="py-1.5 px-2 text-right text-gray-700 text-xs">
                              ₹{totalPayableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              <button
                                onClick={() => handleOpenPaymentModal(calc.month, totalPayableAmount)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold text-xs transition-all ${
                                  isPaid
                                    ? 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200' 
                                    : isAmountExceeded
                                    ? 'bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200'
                                    : isPartiallyPaid
                                    ? 'bg-yellow-100 text-yellow-700 border border-yellow-300 hover:bg-yellow-200'
                                    : 'bg-indigo-100 text-indigo-700 border border-indigo-300 hover:bg-indigo-200 hover:shadow-sm'
                                }`}
                                title={
                                  isPaid
                                    ? `Payment completed (Paid: ₹${paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                                    : isAmountExceeded
                                    ? `Amount exceeded by ₹${(paidAmount - totalPayableAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : isPartiallyPaid
                                    ? `Partially paid (₹${paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} of ₹${totalPayableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                                    : 'Click to process payment'
                                }
                              >
                                {isPaid ? (
                                  <>
                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <span>₹{paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </>
                                ) : isAmountExceeded ? (
                                  <>
                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <span>₹{paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </>
                                ) : isPartiallyPaid ? (
                                  <>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>₹{paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    <span className="text-[10px] opacity-75">Partially Paid</span>
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                    </svg>
                                    <span>₹{paidAmount > 0 ? paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</span>
                                    <span className="text-[10px] opacity-75">Pay</span>
                                  </>
                                )}
                              </button>
                            </td>
                            <td className="py-1.5 px-2 text-right text-xs">
                              {(() => {
                                const monthlyBalance = totalPayableAmount - paidAmount;
                                if (Math.abs(monthlyBalance) < 0.01) {
                                  return <span className="text-gray-500">₹0.00</span>;
                                }
                                if (monthlyBalance > 0) {
                                  return (
                                    <span className="text-red-600 font-semibold">
                                      ₹{monthlyBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} due
                                    </span>
                                  );
                                }
                                return (
                                  <span className="text-green-600 font-semibold">
                                    +₹{Math.abs(monthlyBalance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} overpaid
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="py-1.5 px-2 text-right text-xs">
                              {(() => {
                                const remainingPayment = calc.remainingPayment !== undefined ? calc.remainingPayment : null;
                                if (remainingPayment !== null && remainingPayment !== undefined) {
                                  if (remainingPayment < 0) {
                                    // Positive remaining = balance due (amount owed)
                                    return (
                                      <span className="text-red-600 font-semibold">
                                        {remainingPayment.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₹
                                      </span>
                                    );
                                  } else if (remainingPayment > 0) {
                                    // Negative remaining = excess payment (overpayment)
                                    return (
                                      <span className="text-green-600 font-semibold">
                                        +{remainingPayment.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₹
                                      </span>
                                    );
                                  } else {
                                    // Zero = exact payment
                                    return <span className="text-gray-600 font-semibold">₹0.00</span>;
                                  }
                                }
                                return <span className="text-gray-400">-</span>;
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* Close Button */}
        <div className="flex justify-end mt-2 pt-2 border-t border-gray-200">
          <button
            onClick={handleClose}
            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Payment Modal */}
      {paymentModal.isOpen && (
        <div className="fixed inset-0 bg-transparent backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border-2 border-gray-300 p-3 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-gray-900">Process Payment</h3>
              <button
                onClick={handleClosePaymentModal}
                className="text-gray-500 hover:text-gray-700 text-xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="space-y-2">
              <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                <p className="text-xs text-gray-600 mb-0.5">Month</p>
                <p className="text-sm font-semibold text-gray-900">
                  {new Date(paymentModal.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
              </div>

              {(() => {
                const calculation = payrollCalculations.find(calc => calc.month === paymentModal.month);
                const totalPayableAmount = calculation?.totalPayableAmount || paymentModal.amount || 0;
                const alreadyPaidAmount = calculation?.paidAmount || 0;
                const remainingAmountToPay = Math.max(0, totalPayableAmount - alreadyPaidAmount);
                
                return (
                  <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                    <p className="text-xs text-gray-600 mb-1.5">Payment Details</p>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-600">Total Payable Amount:</span>
                        <span className="font-medium text-gray-900">
                          ₹{totalPayableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      {alreadyPaidAmount > 0 && (
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-600">Already Paid:</span>
                          <span className="font-medium text-gray-700">
                            ₹{alreadyPaidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      <div className="border-t border-gray-300 pt-1 mt-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold text-gray-900">Amount to Pay:</span>
                          <span className="text-sm font-bold text-indigo-700">
                            ₹{remainingAmountToPay.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Actual Paid Amount (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentModal.paidAmount || ''}
                  onChange={(e) => setPaymentModal({ ...paymentModal, paidAmount: e.target.value || '' })}
                  placeholder="Enter actual amount paid"
                  className="w-full px-3 py-1.5 rounded-lg border-2 border-gray-300 bg-white text-gray-900 focus:outline-none focus:border-indigo-500 text-sm"
                  required
                />
              </div>

              {paymentModal.paidAmount && !isNaN(parseFloat(paymentModal.paidAmount)) && (() => {
                const calc = calculatePaymentDifference();
                return (
                  <div className={`rounded-lg p-2 border-2 ${
                    calc.isExcess 
                      ? 'bg-green-50 border-green-200' 
                      : calc.isBalance 
                        ? 'bg-red-50 border-red-200'
                        : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Amount to Pay:</span>
                        <span className="font-semibold text-gray-900">₹{calc.calculatedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Paid Amount:</span>
                        <span className="font-semibold text-gray-900">₹{calc.paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="border-t border-gray-300 pt-1 mt-1">
                        <div className="flex justify-between items-center">
                          <span className={`text-xs font-bold ${
                            calc.isExcess ? 'text-green-700' : calc.isBalance ? 'text-red-700' : 'text-gray-700'
                          }`}>
                            {calc.isExcess ? 'Excess:' : calc.isBalance ? 'Balance (Due):' : 'Difference:'}
                          </span>
                          <span className={`text-sm font-bold ${
                            calc.isExcess ? 'text-green-700' : calc.isBalance ? 'text-red-700' : 'text-gray-700'
                          }`}>
                            {calc.isExcess ? '+' : ''}₹{Math.abs(calc.difference).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Payment Mode <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedPaymentMode || ''}
                  onChange={(e) => setSelectedPaymentMode(e.target.value || '')}
                  className="w-full px-3 py-1.5 rounded-lg border-2 border-gray-300 bg-white text-gray-900 focus:outline-none focus:border-indigo-500 text-sm"
                >
                  <option value="">Select Payment Mode</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="CASH">Cash</option>
                  <option value="CHECK">Cheque</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                {(() => {
                  const calculation = payrollCalculations.find(calc => calc.month === paymentModal.month);
                  const totalPayableAmount = calculation?.totalPayableAmount || paymentModal.amount || 0;
                  const alreadyPaidAmount = calculation?.paidAmount || 0;
                  const remainingAmountToPay = Math.max(0, totalPayableAmount - alreadyPaidAmount);
                  const isAmountExceeded = alreadyPaidAmount > totalPayableAmount && totalPayableAmount > 0;
                  // Allow owners to process extra payments even when remaining is 0
                  const isDisabled = isProcessingPayment;
                  
                  return (
                    <button
                      onClick={handleProceedPayment}
                      disabled={isDisabled}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 ${
                        isDisabled
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      }`}
                      title={
                        isProcessingPayment
                          ? 'Processing payment...'
                          : 'Process payment'
                      }
                    >
                      {isProcessingPayment ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Processing...</span>
                        </>
                      ) : (
                        'Proceed to Payment'
                      )}
                    </button>
                  );
                })()}
                <button
                  onClick={handleClosePaymentModal}
                  className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PayrollForm;
