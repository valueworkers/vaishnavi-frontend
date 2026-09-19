import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiSearch, FiUserCheck } from 'react-icons/fi';
import axios from 'axios';

const STAFF_FOR_HIRE_LIST_PATH = '/accounts/staff-for-hire/?is_available=true';
const STAFF_FOR_HIRE_BULK_HIRE_PATH = '/accounts/staff-for-hire/bulk-hire/';

const resolveApiUrl = (href) => {
  if (!href) return null;
  const raw = String(href).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '');
  if (!base) return null;
  return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`;
};

const normalizeStaffForHire = (item, index) => {
  const availableFor = Array.isArray(item?.available_for)
    ? item.available_for.filter(Boolean).join('\n')
    : String(item?.available_for ?? '').trim();
  const language = Array.isArray(item?.language)
    ? item.language.filter(Boolean).join(', ')
    : String(item?.language ?? '').trim();
  const skill = Array.isArray(item?.skill)
    ? item.skill.filter(Boolean).join(', ')
    : String(item?.skill ?? '').trim();

  return {
    id: item?.id ?? `sfh_${index}`,
    name: item?.staff_name ?? '',
    vendor: item?.vendor_name ?? '',
    availableFrom: item?.available_from ?? '',
    availableFor,
    language,
    price: item?.price ?? '',
    skill,
    isActive: item?.is_active !== false,
  };
};

const formatDisplayDate = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  return raw;
};

const formatPrice = (value) => {
  if (value == null || value === '') return '—';
  const n = parseFloat(value);
  if (Number.isFinite(n)) {
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
  return String(value);
};

const formatCell = (value) => {
  const text = String(value ?? '').trim();
  return text || '—';
};

const formatFailedHireItems = (failedItems) =>
  failedItems
    .map((item) => {
      const rawError = String(item?.error || item?.detail || item?.message || 'Unknown error');
      const singleLineError = rawError.replace(/\s+/g, ' ').trim();
      return `ID ${item?.id ?? '-'}: ${singleLineError}`;
    })
    .join(' | ');

const StaffForHire = () => {
  const [rows, setRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [hireNotice, setHireNotice] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isHiring, setIsHiring] = useState(false);
  const [hiringRowId, setHiringRowId] = useState(null);
  const [error, setError] = useState('');
  const [failedHireMessage, setFailedHireMessage] = useState('');
  const [isFailedHireModalOpen, setIsFailedHireModalOpen] = useState(false);
  const [nextUrl, setNextUrl] = useState(null);
  const [previousUrl, setPreviousUrl] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const lastListUrlRef = useRef(null);

  const fetchStaffForHire = useCallback(
    async (url = null, searchQuery = activeSearch) => {
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        setError('Authorization token missing. Please log in again.');
        setRows([]);
        return;
      }

      const base = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '');
      if (!base) {
        setError('API base URL is not configured.');
        setRows([]);
        return;
      }

      setIsLoading(true);
      setError('');

      try {
        let requestUrl = resolveApiUrl(url) || `${base}${STAFF_FOR_HIRE_LIST_PATH}`;
        const q = String(searchQuery || '').trim();
        const params = {};

        if (!url && q) {
          params.search = q;
        } else if (url) {
          const urlObj = new URL(requestUrl);
          if (q) {
            // Keep pagination and force active search from input.
            urlObj.searchParams.set('search', q);
          } else {
            urlObj.searchParams.delete('search');
          }
          requestUrl = urlObj.toString();
        }

        const response = await axios.get(requestUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params,
        });

        lastListUrlRef.current = requestUrl;

        const payload = response.data || {};
        const list = Array.isArray(payload.results) ? payload.results : [];
        const normalized = list.map((item, idx) => normalizeStaffForHire(item, idx));

        setRows(normalized);
        setNextUrl(resolveApiUrl(payload.next));
        setPreviousUrl(resolveApiUrl(payload.previous));
        setCurrentPage(Number(payload.current_page) || 1);
        setTotalPages(Number(payload.total_pages) || 1);
        setTotalCount(Number(payload.count) || normalized.length);
        setSelectedIds((prev) =>
          prev.filter((id) => normalized.some((row) => String(row.id) === String(id))),
        );
      } catch (err) {
        const msg =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load staff for hire.';
        setError(msg);
        setRows([]);
      } finally {
        setIsLoading(false);
      }
    },
    [activeSearch],
  );

  useEffect(() => {
    fetchStaffForHire(null, activeSearch);
  }, [fetchStaffForHire, activeSearch]);

  const handleSearch = () => {
    setActiveSearch(searchTerm.trim());
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setActiveSearch('');
  };
  const filteredRows = useMemo(() => rows, [rows]);

  const isSelected = (id) => selectedIds.some((sid) => String(sid) === String(id));

  const areAllVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((row) => isSelected(row.id));

  const toggleRowSelection = (id) => {
    setSelectedIds((prev) =>
      isSelected(id)
        ? prev.filter((sid) => String(sid) !== String(id))
        : [...prev, id],
    );
  };

  const toggleSelectAllVisible = () => {
    if (areAllVisibleSelected) {
      const visibleSet = new Set(filteredRows.map((r) => String(r.id)));
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(String(id))));
      return;
    }
    setSelectedIds((prev) => {
      const map = new Map(prev.map((id) => [String(id), id]));
      filteredRows.forEach((row) => map.set(String(row.id), row.id));
      return Array.from(map.values());
    });
  };

  const hireByIds = useCallback(
    async (ids) => {
      const staffList = [...new Set(ids.map((id) => Number(id)).filter((n) => Number.isFinite(n)))];
      if (staffList.length === 0) return;

      const accessToken = localStorage.getItem('access_token');
      const base = String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '');
      if (!accessToken) {
        setHireNotice(null);
        setError('Authorization token missing. Please log in again.');
        return;
      }
      if (!base) {
        setError('API base URL is not configured.');
        return;
      }

      const isSingle = staffList.length === 1;
      if (isSingle) setHiringRowId(staffList[0]);
      setIsHiring(true);
      setError('');

      try {
        const response = await axios.post(
          `${base}${STAFF_FOR_HIRE_BULK_HIRE_PATH}`,
          { staff_list: staffList },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        );

        const idSet = new Set(staffList.map((id) => String(id)));
        const hiredNames = rows
          .filter((row) => idSet.has(String(row.id)))
          .map((row) => row.name)
          .filter(Boolean);

        const failedItems = Array.isArray(response.data?.failed) ? response.data.failed : [];
        const failedIdSet = new Set(
          failedItems
            .map((item) => String(item?.id ?? ''))
            .filter(Boolean),
        );
        const successfulIds = staffList.filter((id) => !failedIdSet.has(String(id)));

        setSelectedIds((prev) =>
          prev.filter((id) => {
            const idStr = String(id);
            if (!idSet.has(idStr)) return true;
            return failedIdSet.has(idStr);
          }),
        );

        if (successfulIds.length > 0) {
          setHireNotice(
            response.data?.message
              || `Successfully hired ${successfulIds.length} staff member${successfulIds.length > 1 ? 's' : ''}${
                hiredNames.length ? `: ${hiredNames.join(', ')}` : ''
              }.`,
          );
        } else {
          setHireNotice(null);
        }

        const failedMessage = formatFailedHireItems(failedItems);

        await fetchStaffForHire(lastListUrlRef.current, activeSearch);

        if (failedItems.length > 0) {
          setFailedHireMessage(failedMessage);
          setIsFailedHireModalOpen(true);
          setError('');
        } else {
          setError('');
        }
      } catch (err) {
        const failedItems = Array.isArray(err?.response?.data?.failed) ? err.response.data.failed : [];
        if (failedItems.length > 0) {
          const failedMessage = formatFailedHireItems(failedItems);
          setFailedHireMessage(failedMessage);
          setIsFailedHireModalOpen(true);
          setError('');
          setHireNotice(null);
          return;
        }
        const msg =
          err?.response?.data?.detail
          || err?.response?.data?.message
          || err?.message
          || 'Failed to hire staff.';
        setError(msg);
        setHireNotice(null);
      } finally {
        setIsHiring(false);
        setHiringRowId(null);
      }
    },
    [rows, activeSearch, fetchStaffForHire],
  );

  const handleHireSelected = () => {
    hireByIds(selectedIds);
  };

  const handleHireOne = (id) => {
    hireByIds([id]);
  };

  const handleClearFailedHireModal = async () => {
    setIsFailedHireModalOpen(false);
    setFailedHireMessage('');
    await fetchStaffForHire(lastListUrlRef.current, activeSearch);
  };

  return (
    <>
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold italic text-gray-900 underline decoration-indigo-300 underline-offset-4">
          Staff for hire
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          External staff and vendor partners who are ready to work with us.
        </p>
      </div>

      {hireNotice ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>{hireNotice}</span>
          <button
            type="button"
            onClick={() => setHireNotice(null)}
            className="shrink-0 text-emerald-700 hover:text-emerald-900 font-medium"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
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
            placeholder="Search name, vendor, skill, language…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Search
        </button>
        {activeSearch ? (
          <button
            type="button"
            onClick={handleClearSearch}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleHireSelected}
          disabled={selectedIds.length === 0 || isHiring || isLoading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FiUserCheck className="h-4 w-4" />
          {isHiring && !hiringRowId ? 'Hiring…' : `Hire selected${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`}
        </button>
      </div>

      <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4 sm:p-6">
        {error ? (
          <p className="py-12 text-center text-sm text-red-600">{error}</p>
        ) : isLoading ? (
          <p className="py-12 text-center text-sm text-gray-600">Loading staff for hire…</p>
        ) : filteredRows.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-600">
            {activeSearch
              ? `No staff for hire match "${activeSearch}".`
              : 'No staff for hire found.'}
          </p>
        ) : (
          <div className="w-full overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[800px] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-gray-300 bg-gray-100">
                  <th className="w-10 px-2 py-2.5 text-left">
                    <input
                      type="checkbox"
                      checked={areAllVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      disabled={isHiring || isLoading}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                      aria-label="Select all visible staff"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-900">
                    Name
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-900">
                    Vendor
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-900">
                    Available from
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-900">
                    Available for
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-900">
                    Language
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-900">
                    Price
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-900">
                    Skill
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-900">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-900">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const checked = isSelected(row.id);
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-gray-200 transition-colors ${
                        checked ? 'bg-indigo-50/60' : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-2 py-2.5 align-top">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRowSelection(row.id)}
                          disabled={isHiring || isLoading}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                          aria-label={`Select ${row.name}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-gray-900">{formatCell(row.name)}</td>
                      <td className="px-3 py-2.5 text-gray-700">{formatCell(row.vendor)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                        {formatDisplayDate(row.availableFrom)}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">
                        <div className="whitespace-pre-line">{formatCell(row.availableFor)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{formatCell(row.language)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-gray-900">
                        {formatPrice(row.price)}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{formatCell(row.skill)}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            row.isActive
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {row.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right align-top">
                        <button
                          type="button"
                          onClick={() => handleHireOne(row.id)}
                          disabled={isHiring || isLoading}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <FiUserCheck className="h-3.5 w-3.5" />
                          {isHiring && String(hiringRowId) === String(row.id) ? 'Hiring…' : 'Hire'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!error && !isLoading ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              Showing {filteredRows.length} on this page
              {totalCount > 0 ? ` · total ${totalCount}` : ''}
              {selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : ''}
              {activeSearch ? ` · filtered by "${activeSearch}"` : ''}.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fetchStaffForHire(previousUrl, activeSearch)}
                disabled={!previousUrl || isLoading}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-gray-600">
                Page {currentPage} of {Math.max(totalPages, 1)}
              </span>
              <button
                type="button"
                onClick={() => fetchStaffForHire(nextUrl, activeSearch)}
                disabled={!nextUrl || isLoading}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

    </div>
    {isFailedHireModalOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
          <h3 className="text-lg font-bold text-gray-900">Bulk hire failed</h3>
          <p className="mt-2 text-sm text-gray-700 wrap-break-words">{failedHireMessage}</p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={handleClearFailedHireModal}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
};

export default StaffForHire;
