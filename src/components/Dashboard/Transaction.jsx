import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  EMPLOYEE_PAGE_SIZE_OPTIONS,
  resolveEmployeePageSize,
} from '../../utils/employeeListQuery';
import {
  collectSalaryTxnKeys,
  formatSalaryTxnCellValue,
  isSalaryTxnMethodColumn,
  isSalaryTxnMoneyColumn,
  isSalaryTxnStatusColumn,
  loadSalaryTxnColumnOrder,
  loadSalaryTxnColumnVisibility,
  mergeSalaryTxnColumnOrder,
  normalizeSalaryTxnRow,
  reorderSalaryTxnColumns,
  isSalaryTxnDefaultHiddenColumn,
  SALARY_TXN_LS_ORDER,
  SALARY_TXN_LS_VISIBILITY,
  SALARY_TXN_PREFERRED_KEYS,
  salaryTxnColumnLabel,
} from '../../utils/salaryTransactionColumns';

const SALARY_TRANSACTIONS_PATH = '/payroll/salary-transactions/';

const extractList = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.data?.results)) return payload.data.results;
  return [];
};

const buildSalaryTransactionsUrl = (href = null, searchQuery = '', pageSize = null) => {
  const careBase = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '');
  let url = href || `${careBase}${SALARY_TRANSACTIONS_PATH}`;
  if (href && !/^https?:\/\//i.test(href)) {
    url = `${careBase}${href.startsWith('/') ? href : `/${href}`}`;
  }

  const urlObj = new URL(url);
  const search = String(searchQuery || '').trim();
  if (search) urlObj.searchParams.set('search', search);
  else urlObj.searchParams.delete('search');

  if (pageSize != null && pageSize !== '') {
    const size = Number(pageSize);
    if (Number.isFinite(size) && size > 0) {
      urlObj.searchParams.set('page_size', String(Math.floor(size)));
    }
  }

  return urlObj.toString();
};

const exportSalaryTransactionsExcel = (rows, columnIds) => {
  if (!rows?.length) throw new Error('No records to export.');
  const cols = columnIds?.length ? columnIds : SALARY_TXN_PREFERRED_KEYS;
  const headers = cols.map(salaryTxnColumnLabel);
  const data = rows.map((row) => cols.map((key) => formatSalaryTxnCellValue(row, key)));
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Staff Payouts');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `staff-payouts-${stamp}.xlsx`);
};

const userFriendlyError = (err, fallback) => {
  const status = err?.response?.status;
  if (status === 401 || status === 403) return 'You do not have permission to view payouts. Please log in again.';
  if (status >= 500) return 'Unable to load payouts right now. Please try again.';
  const data = err?.response?.data;
  if (typeof data === 'string' && data && data.length < 120) return data;
  if (data?.detail && typeof data.detail === 'string' && data.detail.length < 120) return data.detail;
  if (data?.message && typeof data.message === 'string' && data.message.length < 120) return data.message;
  return fallback;
};

const statusBadgeClass = (status) => {
  if (status === 'SUCCESS') return 'bg-green-100 text-green-800';
  if (status === 'PENDING') return 'bg-yellow-100 text-yellow-800';
  if (status === 'FAILED') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-800';
};

const Transaction = ({ isVsreOwner }) => {
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({
    count: 0,
    totalPages: 0,
    currentPage: 1,
    next: null,
    previous: null,
  });
  const totalCountRef = useRef(0);
  const columnChooserRef = useRef(null);
  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const [dragColId, setDragColId] = useState(null);
  const [columnOrder, setColumnOrder] = useState(() => loadSalaryTxnColumnOrder());
  const [columnVisibility, setColumnVisibility] = useState(() => loadSalaryTxnColumnVisibility());

  const discoveredKeys = useMemo(
    () => mergeSalaryTxnColumnOrder(SALARY_TXN_PREFERRED_KEYS, collectSalaryTxnKeys(transactions)),
    [transactions],
  );

  useEffect(() => {
    setColumnOrder((prev) => mergeSalaryTxnColumnOrder(prev, discoveredKeys));
    setColumnVisibility((prev) => {
      const next = { ...prev };
      discoveredKeys.forEach((key) => {
        if (next[key] === undefined) {
          next[key] = !isSalaryTxnDefaultHiddenColumn(key);
        }
      });
      // Prefer Month over Start/End once period_month is available
      if (discoveredKeys.includes('period_month')) {
        if (next.start_date === true && next.period_month !== false) next.start_date = false;
        if (next.end_date === true && next.period_month !== false) next.end_date = false;
        if (next.period_month === undefined) next.period_month = true;
      }
      return next;
    });
  }, [discoveredKeys]);

  useEffect(() => {
    try {
      localStorage.setItem(SALARY_TXN_LS_ORDER, JSON.stringify(columnOrder));
    } catch {
      /* ignore */
    }
  }, [columnOrder]);

  useEffect(() => {
    try {
      localStorage.setItem(SALARY_TXN_LS_VISIBILITY, JSON.stringify(columnVisibility));
    } catch {
      /* ignore */
    }
  }, [columnVisibility]);

  useEffect(() => {
    if (!showColumnChooser) return undefined;
    const onDocClick = (e) => {
      if (columnChooserRef.current?.contains(e.target)) return;
      setShowColumnChooser(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showColumnChooser]);

  const visibleColumns = useMemo(
    () => columnOrder.filter((key) => discoveredKeys.includes(key) && columnVisibility[key] !== false),
    [columnOrder, columnVisibility, discoveredKeys],
  );

  const fetchTransactions = useCallback(
    async (url = null, searchQuery = '', sizeSelection = 20) => {
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        setError('Authorization token missing. Please log in again.');
        setTransactions([]);
        return;
      }

      setIsLoading(true);
      setError('');
      setExportError('');

      try {
        const resolvedPageSize = resolveEmployeePageSize(sizeSelection, totalCountRef.current);
        let apiUrl = buildSalaryTransactionsUrl(url, searchQuery, resolvedPageSize);
        let response = await axios.get(apiUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        let payload = extractList(response.data).map(normalizeSalaryTxnRow).filter(Boolean);
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
          apiUrl = buildSalaryTransactionsUrl(null, searchQuery, count);
          response = await axios.get(apiUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });
          payload = extractList(response.data).map(normalizeSalaryTxnRow).filter(Boolean);
          next = response.data?.next;
          previous = response.data?.previous;
          count = response.data?.count ?? payload.length;
          pages = response.data?.total_pages ?? 0;
          page = response.data?.current_page;
          totalCountRef.current = count;
        }

        setTransactions(payload);
        setPagination({
          count,
          totalPages: pages || 1,
          currentPage: page || 1,
          next: next && typeof next === 'string' && next.trim() ? next : null,
          previous: previous && typeof previous === 'string' && previous.trim() ? previous : null,
        });
      } catch (err) {
        setError(userFriendlyError(err, 'Failed to fetch transactions. Please try again.'));
        setTransactions([]);
        setPagination({
          count: 0,
          totalPages: 0,
          currentPage: 1,
          next: null,
          previous: null,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isVsreOwner) return;
    fetchTransactions(null, searchTerm, pageSize);
  }, [isVsreOwner, pageSize, fetchTransactions]);

  const handleSearch = () => {
    fetchTransactions(null, searchTerm, pageSize);
  };

  const handleExportExcel = () => {
    if (!transactions.length) {
      setExportError('No payouts to export on this page.');
      return;
    }
    try {
      exportSalaryTransactionsExcel(transactions, visibleColumns.length ? visibleColumns : discoveredKeys);
      setExportError('');
    } catch (err) {
      setExportError(err.message || 'Unable to export Excel file.');
    }
  };

  const resetColumns = () => {
    const keys = discoveredKeys.length ? discoveredKeys : SALARY_TXN_PREFERRED_KEYS;
    setColumnOrder(keys);
    setColumnVisibility(Object.fromEntries(keys.map((id) => [id, true])));
  };

  if (!isVsreOwner) {
    return (
      <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-8 text-center">
        <p className="mb-2 text-lg font-medium text-gray-700">Only VSRE_OWNERs can access this section.</p>
      </div>
    );
  }

  const pagingDisabled = isLoading || pageSize === 'all';

  return (
    <div className="w-full min-w-0 max-w-full">
      <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-gray-900">Staff Payouts</h3>
            {pagination.count > 0 ? (
              <span className="text-xs text-gray-600">Total: {pagination.count}</span>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <div className="relative min-w-[12rem] flex-1">
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                placeholder="Search payouts..."
                aria-label="Search payouts"
                disabled={isLoading}
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 pr-8 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none disabled:opacity-60"
              />
              {isLoading ? (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
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
                    fetchTransactions(null, '', pageSize);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                  title="Clear search"
                  aria-label="Clear search"
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
            <label htmlFor="payouts-page-size" className="shrink-0 text-xs font-semibold text-slate-600">
              Rows
            </label>
            <select
              id="payouts-page-size"
              value={pageSize === 'all' ? 'all' : String(pageSize)}
              onChange={(e) => {
                const next = e.target.value === 'all' ? 'all' : Number(e.target.value) || 20;
                setPageSize(next);
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
              disabled={isLoading || transactions.length === 0}
              className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                isLoading || transactions.length === 0
                  ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                  : 'bg-emerald-700 text-white hover:bg-emerald-800'
              }`}
              title="Export visible columns as Excel"
            >
              Export Excel
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
                    Drag headers to reorder. New API fields appear here automatically.
                  </p>
                  <div className="space-y-1">
                    {columnOrder
                      .filter((colId) => discoveredKeys.includes(colId))
                      .map((colId) => (
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
                          <span>{salaryTxnColumnLabel(colId)}</span>
                        </label>
                      ))}
                  </div>
                  <button
                    type="button"
                    className="mt-2 w-full rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={resetColumns}
                  >
                    Reset columns
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {exportError ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3" role="status">
            <p className="text-xs font-medium text-amber-800">{exportError}</p>
          </div>
        ) : null}

        {error ? (
          <div className="mb-3 rounded-lg border-2 border-red-200 bg-red-50 p-3" role="alert">
            <p className="text-xs font-medium text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => fetchTransactions(null, searchTerm, pageSize)}
              className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Retry
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-xl border-2 border-gray-200 bg-white p-6 text-center">
            <div className="flex items-center justify-center gap-2">
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
              <p className="text-sm text-gray-600">Loading transactions...</p>
            </div>
          </div>
        ) : transactions.length === 0 && !error ? (
          <div className="rounded-xl border-2 border-gray-200 bg-white p-6 text-center">
            <p className="text-sm text-gray-600">
              {searchTerm.trim()
                ? 'No payouts found matching your search.'
                : 'No transaction records found.'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {searchTerm.trim()
                ? 'Try a different search term.'
                : 'Transaction data will appear here once records are available.'}
            </p>
          </div>
        ) : transactions.length > 0 ? (
          <div className="overflow-hidden rounded-xl border-2 border-gray-200 bg-white">
            <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
              <table
                className="w-full border-collapse text-[11px] sm:text-xs"
                style={{ minWidth: `${Math.max(40, visibleColumns.length * 8)}rem` }}
              >
                <thead className="border-b-2 border-gray-300 bg-gray-100">
                  <tr>
                    {visibleColumns.map((colId) => (
                      <th
                        key={colId}
                        draggable
                        onDragStart={(e) => {
                          setDragColId(colId);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => setDragColId(null)}
                        onDragOver={(e) => {
                          if (!dragColId || dragColId === colId) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setColumnOrder((prev) => reorderSalaryTxnColumns(prev, dragColId, colId));
                          setDragColId(null);
                        }}
                        className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-900 ${
                          isSalaryTxnMoneyColumn(colId) ? 'text-right' : 'text-left'
                        }`}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          <span className="text-slate-400">⋮</span>
                          {salaryTxnColumnLabel(colId)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {transactions.map((transaction, rowIndex) => (
                    <tr key={transaction.id ?? transaction.transaction_id ?? rowIndex} className="hover:bg-gray-50">
                      {visibleColumns.map((colId) => {
                        const text = formatSalaryTxnCellValue(transaction, colId);
                        if (isSalaryTxnMoneyColumn(colId)) {
                          return (
                            <td key={colId} className="whitespace-nowrap px-3 py-2 text-right">
                              <span className="text-xs font-semibold text-green-700">
                                {text ? `₹${text}` : '—'}
                              </span>
                            </td>
                          );
                        }
                        if (isSalaryTxnStatusColumn(colId)) {
                          return (
                            <td key={colId} className="whitespace-nowrap px-3 py-2">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(
                                  transaction.status,
                                )}`}
                              >
                                {text || '—'}
                              </span>
                            </td>
                          );
                        }
                        if (isSalaryTxnMethodColumn(colId)) {
                          return (
                            <td key={colId} className="whitespace-nowrap px-3 py-2">
                              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                                {text || '—'}
                              </span>
                            </td>
                          );
                        }
                        return (
                          <td key={colId} className="max-w-[14rem] px-3 py-2 align-top">
                            <div className="truncate text-xs text-gray-700" title={text || undefined}>
                              {text || '—'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.count > 0 ? (
              <div className="flex flex-col items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-3 py-2 sm:flex-row">
                <div className="text-xs text-gray-700">
                  {pageSize === 'all' ? (
                    <>
                      Showing all <span className="font-semibold">{pagination.count}</span> payouts
                    </>
                  ) : (
                    <>
                      Page <span className="font-semibold">{pagination.currentPage}</span>
                      {pagination.totalPages > 0 ? (
                        <>
                          {' '}
                          of <span className="font-semibold">{pagination.totalPages}</span>
                        </>
                      ) : null}
                      {' · '}
                      <span className="font-semibold">{pagination.count}</span> payouts
                      {' · '}
                      <span className="font-semibold">{pageSize}</span> per page
                    </>
                  )}
                  {searchTerm.trim() ? ' (filtered)' : ''}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (pagination.previous && !pagingDisabled) {
                        fetchTransactions(pagination.previous, searchTerm, pageSize);
                      }
                    }}
                    disabled={!pagination.previous || pagingDisabled}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      !pagination.previous || pagingDisabled
                        ? 'cursor-not-allowed bg-gray-200 text-gray-400'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (pagination.next && !pagingDisabled) {
                        fetchTransactions(pagination.next, searchTerm, pageSize);
                      }
                    }}
                    disabled={!pagination.next || pagingDisabled}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      !pagination.next || pagingDisabled
                        ? 'cursor-not-allowed bg-gray-200 text-gray-400'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Transaction;
