import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { FiChevronLeft, FiChevronRight, FiSearch, FiGrid, FiList } from 'react-icons/fi';

const YEAR = new Date().getFullYear();

const isLeapYear = (year) => {
  // Gregorian leap year rules
  if (year % 400 === 0) return true;
  if (year % 100 === 0) return false;
  return year % 4 === 0;
};

const daysInMonthByIndex = (monthIndex) => {
  // monthIndex is 0-based for MONTHS above
  const febDays = isLeapYear(YEAR) ? 29 : 28;
  switch (monthIndex) {
    case 0: // Jan
      return 31;
    case 1: // Feb
      return febDays;
    case 2: // Mar
      return 31;
    case 3: // Apr
      return 30;
    case 4: // May
      return 31;
    case 5: // Jun
      return 30;
    default:
      return 31;
  }
};

const pad2 = (n) => String(n).padStart(2, '0');

/** API /analysis/attendance/ nests days under keys like "Jan-2026" */
const attendanceApiMonthKey = (am) => {
  if (!am) return '';
  const d = new Date(am.year, am.month, 1);
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${mon}-${am.year}`;
};

const toINR = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const toNum = (v) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Minimum table scroll area height (header + 6 body rows). */
const TABLE_SCROLL_VISIBLE_ROWS = 6;
const TABLE_SCROLL_MIN_HEIGHT_PX = 40 + TABLE_SCROLL_VISIBLE_ROWS * 38;

const AttendanceMaster = () => {
  const [now, setNow] = useState(() => new Date());
  const [monthIndex, setMonthIndex] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('table');
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  /** API meta: employee count, summary totals, salary pagination (drives Prev/Next with attendance on same page) */
  const [apiMeta, setApiMeta] = useState({
    count: 0,
    summary: null,
    total_pages: 1,
    current_page: 1,
    next: null,
    previous: null,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isAllPageSize, setIsAllPageSize] = useState(false);
  const [selectedRowsById, setSelectedRowsById] = useState({});
  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const columnChooserRef = useRef(null);

  useEffect(() => {
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const msUntilNextDay = nextMidnight.getTime() - now.getTime();
    const timer = setTimeout(() => {
      setNow(new Date());
    }, Math.max(1000, msUntilNextDay));
    return () => clearTimeout(timer);
  }, [now]);

  const monthOptions = useMemo(() => {
    return Array.from({ length: 8 }, (_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - idx, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const days = new Date(year, month + 1, 0).getDate();
      return {
        key: `${year}-${pad2(month + 1)}`,
        label: `${d.toLocaleString('en-US', { month: 'long' })} ${year}`,
        year,
        month,
        startDate: `${year}-${pad2(month + 1)}-01`,
        endDate: `${year}-${pad2(month + 1)}-${pad2(days)}`,
        days,
      };
    });
  }, [now]);

  const activeMonth = monthOptions[monthIndex] || monthOptions[0];
  const monthName = activeMonth?.label || '';

  const dayCols = useMemo(() => {
    const len = activeMonth?.days || 31;
    return Array.from({ length: len }, (_, i) => i + 1);
  }, [activeMonth]);
  const effectivePageSize = useMemo(() => {
    if (!isAllPageSize) return pageSize;
    return Math.max(1, Number(apiMeta.count) || pageSize);
  }, [isAllPageSize, apiMeta.count, pageSize]);
  const selectableColumns = [
    { key: 'empId', label: 'Emp ID' },
    { key: 'name', label: 'Name' },
    { key: 'mobile', label: 'Mobile' },
    { key: 'baseSalary', label: 'Base Salary' },
    { key: 'daysPresent', label: 'Days Present' },
    { key: 'daysAbsent', label: 'Days Absent' },
    { key: 'sal', label: 'Salary' },
    { key: 'paid', label: 'Paid' },
    { key: 'staffStatus', label: 'Staff status' },
    { key: 'balance', label: 'Balance' },
  ];
  const [visibleCols, setVisibleCols] = useState(() =>
    Object.fromEntries(selectableColumns.map((c) => [c.key, true]))
  );

  const getBalanceLabel = (row) => {
    const ex = toNum(row.excess_balance);
    if (ex > 0) return `${toINR(ex)} (E)`;
    if (ex < 0) return `${toINR(Math.abs(ex))} (B)`;
    return '₹0';
  };

  const staffStatusLabel = (row) => (row.staffActive ? 'Active' : 'Terminated');

  /**
   * Raw day value -> any API mark (uppercased) or null (missing / placeholder).
   * Examples: P, A, HD, PL, WO, H, etc.
   */
  const getDayMark = (row, dayNum) => {
    const raw = row.dailyAttendance || {};
    const key = pad2(dayNum);
    const v = raw[key] ?? raw[String(dayNum)];
    if (v == null || v === '') return null;
    const s = String(v).trim().toUpperCase();
    if (/^-+$/.test(s) || s === '—') return null;
    return s;
  };

  const formatDayCell = (mark) => (mark ? String(mark).trim().toUpperCase() : '--');

  const pickPeriodForMonth = (emp, month) => {
    const periods = Array.isArray(emp.periods) ? emp.periods : [];
    if (!month) return periods[0] || null;
    const match = periods.find(
      (p) => p.start_date === month.startDate && p.end_date === month.endDate
    );
    return match || periods[0] || null;
  };

  useEffect(() => {
    const fetchSalary = async () => {
      if (!activeMonth) return;
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        setRows([]);
        setApiMeta({
          count: 0,
          summary: null,
          total_pages: 1,
          current_page: 1,
          next: null,
          previous: null,
        });
        return;
      }
      setIsLoading(true);
      try {
        const ym = `${activeMonth.year}-${pad2(activeMonth.month + 1)}`;
        const pagingParams = `&page=${page}&page_size=${effectivePageSize}`;
        const searchParams = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : '';
        const salaryUrl = `${import.meta.env.VITE_BASEURL_CARE}/analysis/salary/?start_date__gte=${activeMonth.startDate}&end_date__lte=${activeMonth.endDate}${pagingParams}${searchParams}`;
        const attendanceUrl = `${import.meta.env.VITE_BASEURL_CARE}/analysis/attendance/?start_month=${ym}&end_month=${ym}${pagingParams}${searchParams}`;

        const [salaryRes, attendanceRes] = await Promise.all([
          axios.get(salaryUrl, { headers: { Authorization: `Bearer ${accessToken}` } }),
          axios.get(attendanceUrl, { headers: { Authorization: `Bearer ${accessToken}` } }).catch((err) => {
            console.error('Error fetching daily attendance:', err);
            return { data: { results: [] } };
          }),
        ]);

        const resultList = Array.isArray(salaryRes.data?.results) ? salaryRes.data.results : [];
        const count = salaryRes.data?.count ?? resultList.length;
        const summary = salaryRes.data?.summary ?? null;
        const total_pages = salaryRes.data?.total_pages ?? 1;
        const current_page = salaryRes.data?.current_page ?? page;
        setApiMeta({
          count,
          summary,
          total_pages,
          current_page,
          next: salaryRes.data?.next ?? null,
          previous: salaryRes.data?.previous ?? null,
        });

        const monthKey = attendanceApiMonthKey(activeMonth);
        const attResults = Array.isArray(attendanceRes.data?.results) ? attendanceRes.data.results : [];
        const attByUserId = new Map();
        for (const item of attResults) {
          const uid = item.user;
          if (uid == null) continue;
          const attObj = item.attendance && typeof item.attendance === 'object' ? item.attendance : {};
          let dayMap = attObj[monthKey];
          if (!dayMap && Object.keys(attObj).length === 1) {
            dayMap = attObj[Object.keys(attObj)[0]];
          }
          if (dayMap && typeof dayMap === 'object') {
            attByUserId.set(Number(uid), dayMap);
          }
        }

        const mapped = resultList.map((emp) => {
          const period = pickPeriodForMonth(emp, activeMonth);
          const first = emp.first_name || '';
          const middle = emp.middle_name || '';
          const last = emp.last_name || '';
          const fullName = [first, middle, last].filter(Boolean).join(' ').trim();
          // Employee-level status: true = active, false = terminated (do not use period.payment_status in UI)
          const staffActive = typeof emp.status === 'boolean' ? emp.status : true;
          const staffId = emp.id != null ? Number(emp.id) : null;
          const dailyAttendance =
            staffId != null && attByUserId.has(staffId) ? attByUserId.get(staffId) : {};
          return {
            id: emp.id ?? emp.emp_id,
            empId: emp.emp_id || '-',
            name: fullName || '-',
            mobile: emp.mobile_number || '-',
            base_sal: toNum(period?.salary),
            present: toNum(period?.total_payable_days),
            absent: toNum(period?.total_unpaid_days),
            attendance_pct: toNum(period?.attendance_pct),
            sal: toNum(period?.total_salary),
            paid: toNum(period?.amount_paid),
            excess_balance: toNum(period?.excess_balance),
            payment_mode: period?.payment_mode || null,
            paymentDate: period?.payment_date || null,
            staffActive,
            dailyAttendance,
          };
        });
        setRows(mapped);
      } catch (error) {
        console.error('Error fetching salary analysis:', error);
        setRows([]);
        setApiMeta({
          count: 0,
          summary: null,
          total_pages: 1,
          current_page: 1,
          next: null,
          previous: null,
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchSalary();
  }, [activeMonth, page, pageSize, searchTerm, effectivePageSize]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const fok = filter === 'all' ? true : filter === 'absent' ? r.absent > 0 : r.absent === 0;
      return fok;
    });
  }, [rows, filter]);

  const applySearch = () => {
    const trimmed = searchInput.trim();
    setSearchTerm(trimmed);
    setPage(1);
    setSelectedRowsById({});
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchTerm('');
    setPage(1);
    setSelectedRowsById({});
  };

  useEffect(() => {
    // Keep selected row data fresh as pages are revisited/refetched.
    setSelectedRowsById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const r of rows) {
        if (next[r.id]) {
          next[r.id] = r;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

  const selectedCount = useMemo(
    () => Object.keys(selectedRowsById).length,
    [selectedRowsById]
  );
  const selectedExportRows = useMemo(
    () => Object.values(selectedRowsById),
    [selectedRowsById]
  );
  const exportRows = selectedCount > 0 ? selectedExportRows : filtered;
  const allPageSelected =
    filtered.length > 0 && filtered.every((r) => Boolean(selectedRowsById[r.id]));

  const toggleRowSelection = (row) => {
    setSelectedRowsById((prev) => {
      if (prev[row.id]) {
        const next = { ...prev };
        delete next[row.id];
        return next;
      }
      return { ...prev, [row.id]: row };
    });
  };

  const toggleSelectAllPage = () => {
    setSelectedRowsById((prev) => {
      const next = { ...prev };
      if (allPageSelected) {
        for (const r of filtered) {
          delete next[r.id];
        }
      } else {
        for (const r of filtered) {
          next[r.id] = r;
        }
      }
      return next;
    });
  };

  const toggleColumn = (colKey) => {
    setVisibleCols((prev) => ({ ...prev, [colKey]: !prev[colKey] }));
  };

  useEffect(() => {
    const onMouseDown = (event) => {
      if (!showColumnChooser) return;
      if (columnChooserRef.current && !columnChooserRef.current.contains(event.target)) {
        setShowColumnChooser(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [showColumnChooser]);

  const stats = useMemo(() => {
    const totals = apiMeta.summary?.totals;
    const att = apiMeta.summary?.attendance;

    if (totals) {
      const totalSalary = toNum(totals.total_salary);
      const totalAmountPaid = toNum(totals.total_amount_paid);
      const paidTillDate = totalAmountPaid;
      const yetToBePaid = Math.max(0, totalSalary - totalAmountPaid);
      const payroll = totalSalary;
      const rate = att?.total_attendance_pct != null ? toNum(att.total_attendance_pct) : 0;
      const totalEmp = filtered.length;
      return {
        totalEmp,
        p: att?.total_days_present ?? 0,
        a: 0,
        payroll,
        rate,
        paidTillDate,
        yetToBePaid,
      };
    }

    const totalEmp = filtered.length;
    const p = filtered.reduce((s, r) => s + r.present, 0);
    const a = filtered.reduce((s, r) => s + r.absent, 0);
    const payroll = filtered.reduce((s, r) => s + r.sal, 0);
    const rate = p + a > 0 ? Math.round((p / (p + a)) * 100) : 0;
    const paidTillDate = filtered.reduce((s, r) => s + r.paid, 0);
    const yetToBePaid = filtered.reduce((s, r) => {
      const ex = toNum(r.excess_balance);
      return s + (ex < 0 ? Math.abs(ex) : 0);
    }, 0);
    return { totalEmp, p, a, payroll, rate, paidTillDate, yetToBePaid };
  }, [filtered, apiMeta]);

  const exportMonthPdf = () => {
    const headerCols = [
      'Emp ID',
      'Name',
      'Mobile',
      'Base Salary',
      'Days Present',
      'Days Absent',
      'Salary',
      'Paid',
      'Staff status',
      'Balance',
    ];
    const dayHeaders = dayCols.map((d) => `${d}`);
    const rowsHtml = exportRows
      .map((r) => {
        const salAmount = r.sal;
        const paidAmount = r.paid;
        const balanceLabel = getBalanceLabel(r);
        const dayCells = dayCols
          .map((d) => {
            const mark = formatDayCell(getDayMark(r, d));
            return `<td>${mark}</td>`;
          })
          .join('');

        return `
          <tr>
            <td>${r.empId}</td>
            <td>${r.name}</td>
            <td>${r.mobile}</td>
            <td>${toINR(r.base_sal)}</td>
            <td>${r.present}</td>
            <td>${r.absent}</td>
            <td>${toINR(salAmount)}</td>
            <td>${toINR(paidAmount)}</td>
            <td>${staffStatusLabel(r)}</td>
            <td>${balanceLabel}</td>
            ${dayCells}
          </tr>
        `;
      })
      .join('');

    const printHtml = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Attendance Report - ${monthName}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; color: #111827; }
            h1 { margin: 0 0 8px; font-size: 18px; }
            p { margin: 0 0 12px; color: #4b5563; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>Attendance Report - ${monthName}</h1>
          <table>
            <thead>
              <tr>${headerCols.concat(dayHeaders).map((h) => `<th>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 200);
  };

  const exportMonthExcel = () => {
    const baseHeaders = [
      'Emp ID',
      'Name',
      'Mobile',
      'Base Salary',
      'Days Present',
      'Days Absent',
      'Salary',
      'Paid',
      'Staff status',
      'Balance',
    ];
    const dayHeaders = dayCols.map((d) => `${d}`);
    const headers = [...baseHeaders, ...dayHeaders];

    const escapeCsv = (value) => {
      const str = String(value ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvRows = exportRows.map((r) => {
      const salAmount = r.sal;
      const paidAmount = r.paid;
      const balanceLabel = getBalanceLabel(r);

      const dayValues = dayCols.map((d) => formatDayCell(getDayMark(r, d)));
      return [
        r.empId,
        r.name,
        r.mobile,
        toINR(r.base_sal),
        r.present,
        r.absent,
        toINR(salAmount),
        toINR(paidAmount),
        staffStatusLabel(r),
        balanceLabel,
        ...dayValues,
      ];
    });

    const csvContent = [headers, ...csvRows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance_${monthName.toLowerCase()}_2025.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex max-h-[calc(100vh-6rem)] min-h-[380px] flex-col overflow-hidden rounded-lg bg-white text-gray-800 leading-tight">
      <div className="shrink-0 border-b border-gray-200 bg-white px-2 py-1.5">
        <div className="flex items-center gap-3">
             <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setMonthIndex((p) => Math.max(0, p - 1));
                setPage(1);
              }}
              className="rounded border border-gray-300 p-1 text-gray-700 hover:bg-gray-100"
              disabled={monthIndex === 0}
            >
              <FiChevronLeft />
            </button>
            <div className="flex gap-1">
                {monthOptions.map((m, idx) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    setMonthIndex(idx);
                    setPage(1);
                  }}
                  className={`rounded px-2 py-1 text-xs ${
                    idx === monthIndex
                      ? 'bg-indigo-600 text-white'
                      : 'border border-gray-300 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setMonthIndex((p) => Math.min(monthOptions.length - 1, p + 1));
                setPage(1);
              }}
              className="rounded border border-gray-300 p-1 text-gray-700 hover:bg-gray-100"
              disabled={monthIndex === monthOptions.length - 1}
            >
              <FiChevronRight />
            </button>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-b border-gray-200 bg-white p-1 shadow-sm z-10">
        <div className="mb-1 text-[15px] font-bold text-indigo-700">{monthName}</div>

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded border border-indigo-100 bg-indigo-50 px-2 py-1.5">
          {(() => {
            const cur = apiMeta.current_page ?? page;
            const total = Math.max(1, apiMeta.total_pages ?? 1);
            const prevDisabled =
              isLoading ||
              (apiMeta.previous != null ? !apiMeta.previous : cur <= 1);
            const nextDisabled =
              isLoading || (apiMeta.next != null ? !apiMeta.next : cur >= total);
            return (
              <>
                <div className="flex items-center gap-2">
                  <div className="text-xs font-medium text-indigo-800">Pagination</div>
                  <label className="flex items-center gap-1 text-xs text-indigo-800">
                    <span>Page size</span>
                    <select
                      value={isAllPageSize ? 'all' : String(pageSize)}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === 'all') {
                          setIsAllPageSize(true);
                        } else {
                          setIsAllPageSize(false);
                          setPageSize(Number(value));
                        }
                        setPage(1);
                      }}
                      className="rounded border border-indigo-300 bg-white px-1.5 py-1 text-xs text-indigo-700"
                    >
                      {[15, 20, 30].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                      <option value="all">{`All (${Math.max(1, apiMeta.count || 0)})`}</option>
                    </select>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={prevDisabled}
                    className="rounded border border-indigo-300 bg-white px-2.5 py-1 text-xs text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="min-w-32 text-center font-mono text-xs text-indigo-900">
                    Page {cur} of {total}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={nextDisabled}
                    className="rounded border border-indigo-300 bg-white px-2.5 py-1 text-xs text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </>
            );
          })()}
        </div>

        <div className="mb-1 grid grid-cols-2 gap-1 md:grid-cols-5">
          <div className="rounded border border-gray-200 bg-white p-1">
            <div className="text-[9px] uppercase text-gray-500">Employees (this page)</div>
            <div className="font-mono text-base">{stats.totalEmp}</div>
            {apiMeta.count > stats.totalEmp ? (
              <div className="text-[8px] text-gray-400">{apiMeta.count} total</div>
            ) : null}
          </div>
          <div className="rounded border border-gray-200 bg-white p-1">
            <div className="text-[9px] uppercase text-gray-500">Amount Paid Till Date</div>
            <div className="font-mono text-sm text-emerald-600">{toINR(stats.paidTillDate)}</div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-1">
            <div className="text-[9px] uppercase text-gray-500">Amount Yet To Be Paid</div>
            <div className="font-mono text-sm text-red-600">{toINR(stats.yetToBePaid)}</div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-1">
            <div className="text-[9px] uppercase text-gray-500">Attendance Percentage</div>
            <div className="font-mono text-base text-amber-400">{`${stats.rate}%`}</div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-1">
            <div className="text-[9px] uppercase text-gray-500">Payroll</div>
            <div className="font-mono text-sm text-cyan-900">{toINR(stats.payroll)}</div>
          </div>
        </div>

        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          <div className="relative min-w-[220px] flex-1">
            <FiSearch className="pointer-events-none absolute left-2 top-2.5 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applySearch();
              }}
              placeholder="Search employee or mobile... (press Enter)"
              className="w-full rounded border border-gray-300 bg-white py-2 pl-8 pr-2 text-sm text-gray-700 outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="button"
            onClick={clearSearch}
            disabled={!searchInput && !searchTerm}
            className="rounded border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded border px-3 py-2 text-xs ${filter === 'all' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-300 text-gray-600'}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter('absent')}
            className={`rounded border px-3 py-2 text-xs ${filter === 'absent' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-300 text-gray-600'}`}
          >
            Has Absences
          </button>
          <button
            type="button"
            onClick={() => setFilter('full')}
            className={`rounded border px-3 py-2 text-xs ${filter === 'full' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-300 text-gray-600'}`}
          >
            Full Attendance
          </button>
          <button
            type="button"
            onClick={() => setView('table')}
            className={`rounded border px-3 py-2 text-xs ${view === 'table' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-300 text-gray-600'}`}
          >
            <FiList className="mr-1 inline" /> Table
          </button>
          <button
            type="button"
            onClick={() => setView('grid')}
            className={`rounded border px-3 py-2 text-xs ${view === 'grid' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-300 text-gray-600'}`}
          >
            <FiGrid className="mr-1 inline" /> Cards
          </button>
          <button
            type="button"
            onClick={exportMonthPdf}
            disabled={isLoading}
            className="rounded border border-indigo-500 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 hover:bg-indigo-100"
          >
            {selectedCount > 0 ? `Export Selected PDF (${selectedCount})` : 'Export PDF'}
          </button>
          <button
            type="button"
            onClick={exportMonthExcel}
            disabled={isLoading}
            className="rounded border border-emerald-500 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 hover:bg-emerald-100"
          >
            {selectedCount > 0 ? `Export Selected Excel (${selectedCount})` : 'Export Excel'}
          </button>
          <button
            type="button"
            onClick={toggleSelectAllPage}
            disabled={isLoading || filtered.length === 0}
            className="rounded border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allPageSelected ? 'Unselect This Page' : 'Select This Page'}
          </button>
          <button
            type="button"
            onClick={() => setSelectedRowsById({})}
            disabled={selectedCount === 0}
            className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear Selection ({selectedCount})
          </button>
          <div className="relative" ref={columnChooserRef}>
            <button
              type="button"
              onClick={() => setShowColumnChooser((v) => !v)}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
            >
              Column Chooser
            </button>
            {showColumnChooser && (
              <div className="absolute right-0 z-20 mt-1 w-44 rounded border border-gray-200 bg-white p-2 shadow">
                {selectableColumns.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 py-1 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={Boolean(visibleCols[col.key])}
                      onChange={() => toggleColumn(col.key)}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-1">
        {isLoading ? (
          <div className="rounded border border-gray-200 bg-white py-12">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
              Loading month data...
            </div>
          </div>
        ) : view === 'table' ? (
          <div
            className="min-h-0 flex-1 overflow-y-auto overflow-x-auto rounded border border-gray-200"
            style={{ minHeight: `${TABLE_SCROLL_MIN_HEIGHT_PX}px` }}
          >
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-[1] bg-gray-50 shadow-sm">
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAllPage}
                      aria-label="Select all rows on this page"
                    />
                  </th>
                  {visibleCols.empId && <th className="px-2 py-1.5 text-left">Emp ID</th>}
                  {visibleCols.name && <th className="px-2 py-1.5 text-left">Name</th>}
                  {visibleCols.mobile && <th className="px-2 py-1.5 text-left">Mobile</th>}
                  {visibleCols.baseSalary && <th className="px-2 py-1.5 text-left">Base Salary</th>}
                  {visibleCols.daysPresent && <th className="px-2 py-1.5 text-left">Days Present</th>}
                  {visibleCols.daysAbsent && <th className="px-2 py-1.5 text-left">Days Absent</th>}
                  {visibleCols.sal && <th className="px-2 py-1.5 text-left">Salary</th>}
                  {visibleCols.paid && <th className="px-2 py-1.5 text-left">Paid</th>}
                  {visibleCols.staffStatus && <th className="px-2 py-1.5 text-left">Staff status</th>}
                  {visibleCols.balance && <th className="px-2 py-1.5 text-left">Balance</th>}
                  {dayCols.map((d) => (
                    <th key={d} className="px-1 py-1.5 text-center text-[10px]">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    {(() => {
                      const salAmount = r.sal;
                      const paidAmount = r.paid;
                      const balanceLabel = getBalanceLabel(r);
                      return (
                        <>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedRowsById[r.id])}
                        onChange={() => toggleRowSelection(r)}
                        aria-label={`Select ${r.name}`}
                      />
                    </td>
                    {visibleCols.empId && <td className="px-2 py-1 text-gray-700">{r.empId}</td>}
                    {visibleCols.name && <td className="px-2 py-1 text-gray-900">{r.name}</td>}
                    {visibleCols.mobile && <td className="px-2 py-1 text-gray-600">{r.mobile}</td>}
                    {visibleCols.baseSalary && <td className="px-2 py-1 text-cyan-600 font-medium">{toINR(r.base_sal)}</td>}
                    {visibleCols.daysPresent && <td className="px-2 py-1 text-emerald-600 font-medium">{r.present}</td>}
                    {visibleCols.daysAbsent && <td className="px-2 py-1 text-red-600 font-medium">{r.absent}</td>}
                    {visibleCols.sal && <td className="px-2 py-1 text-indigo-700">{toINR(salAmount)}</td>}
                    {visibleCols.paid && <td className="px-2 py-1 text-emerald-600">{toINR(paidAmount)}</td>}
                    {visibleCols.staffStatus && <td className="px-2 py-1 text-gray-700">{staffStatusLabel(r)}</td>}
                    {visibleCols.balance && <td className="px-2 py-1 text-red-600">{balanceLabel}</td>}
                    {dayCols.map((d) => {
                      const v = getDayMark(r, d);
                      return (
                        <td
                          key={`${r.id}-${d}`}
                          className={`px-1 py-1 text-center font-medium whitespace-nowrap ${
                            v === 'P'
                              ? 'text-emerald-600'
                              : v === 'A'
                                ? 'text-red-600'
                                : v === 'HD'
                                  ? 'text-amber-600'
                                  : v === 'PL'
                                    ? 'text-blue-600'
                                    : 'text-gray-400'
                          }`}
                        >
                          {formatDayCell(v)}
                        </td>
                      );
                    })}
                        </>
                      );
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => (
              <div key={r.empId} className="rounded border border-gray-200 bg-white p-3">
                <div className="mb-1">
                  <label className="inline-flex items-center gap-1 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedRowsById[r.id])}
                      onChange={() => toggleRowSelection(r)}
                    />
                    Select
                  </label>
                </div>
                <div className="mb-1 text-sm font-semibold text-gray-900">{r.name}</div>
                <div className="mb-2 text-xs text-gray-500">{r.mobile}</div>
                <div className="mb-2 text-xs text-cyan-600 font-medium">Base: {toINR(r.base_sal)}</div>
                <div className="mb-2 text-xs text-gray-700">Staff status: {staffStatusLabel(r)}</div>
                <div className="mb-1 text-xs text-emerald-600">Days Present: {r.present}</div>
                <div className="mb-2 text-xs text-red-600">Days Absent: {r.absent}</div>
                <div className="mb-2 text-xs text-emerald-600">Net: {toINR(r.paid)}</div>
                <div className="flex flex-wrap gap-0.5">
                  {dayCols.map((d) => {
                    const v = getDayMark(r, d);
                    const bg =
                      v === 'P'
                        ? 'bg-emerald-500'
                        : v === 'A'
                          ? 'bg-red-500'
                          : v === 'HD'
                            ? 'bg-amber-500'
                            : v === 'PL'
                              ? 'bg-blue-500'
                              : 'bg-gray-200';
                    return (
                      <span
                        key={`${r.empId}-${d}`}
                        title={`Day ${d}: ${formatDayCell(v)}`}
                        className={`inline-block h-3 w-1.5 rounded-sm ${bg}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceMaster;