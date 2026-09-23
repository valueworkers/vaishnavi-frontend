import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FiFolder, FiFileText, FiSearch, FiUser, FiX } from 'react-icons/fi';
import { FaFolderOpen } from 'react-icons/fa';
import {
  formatPatientLabel,
  PATIENT_SEARCH_PAGE_SIZE,
  searchPatients,
} from '../../api/ermPatientRecordsApi';
import {
  hydrateErmDocuments,
  selectErmHydrated,
  selectErmLastError,
  selectErmSelectedPatient,
  setErmError,
  setSelectedPatient,
} from '../../store/slices/ermSlice';

const patientRowKey = (p) => String(p?.id ?? p?.patient_id ?? '');

const patientDisplayName = (p) => {
  const first = String(p?.first_name ?? '').trim();
  const last = String(p?.last_name ?? '').trim();
  return (
    [first, last].filter(Boolean).join(' ').trim() ||
    String(p?.full_name || '').trim() ||
    'Patient'
  );
};

const patientIdText = (p) => {
  const pid = p?.patient_id ?? p?.id;
  return pid != null && String(pid).trim() ? String(pid).trim() : '';
};

const mergePatientHits = (prev, incoming) => {
  const seen = new Set(prev.map(patientRowKey));
  const added = [];
  for (const p of incoming) {
    const k = patientRowKey(p);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    added.push(p);
  }
  return [...prev, ...added];
};

const FolderSkeleton = () => (
  <li className="min-w-0" aria-hidden>
    <div className="flex h-full flex-col items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-2 py-3">
      <div className="h-11 w-11 animate-pulse rounded-xl bg-slate-200/80 motion-reduce:animate-none" />
      <div className="h-2.5 w-[80%] max-w-[6rem] animate-pulse rounded bg-slate-200/80 motion-reduce:animate-none" />
      <div className="h-2 w-[40%] max-w-[3.5rem] animate-pulse rounded bg-slate-200/60 motion-reduce:animate-none" />
    </div>
  </li>
);

/**
 * EMR patient browser — patients as folders; open one to view nested documents.
 */
const ERMPatientPicker = ({
  titleSearchInput = '',
  onTitleSearchInputChange,
  activeTitleSearch = '',
  onTitleSearch,
  onClearTitleSearch,
  titleSearchPanel = null,
}) => {
  const dispatch = useDispatch();
  const baseUrl = useMemo(() => String(import.meta.env.VITE_BASEURL_CARE || '').trim(), []);

  const hydrated = useSelector(selectErmHydrated);
  const selectedPatient = useSelector(selectErmSelectedPatient);
  const storeError = useSelector(selectErmLastError);

  const [inputQuery, setInputQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [patientHits, setPatientHits] = useState([]);
  const [patientNext, setPatientNext] = useState(null);
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientLoadingMore, setPatientLoadingMore] = useState(false);
  const [patientError, setPatientError] = useState('');

  const listRef = useRef(null);
  const loadGenRef = useRef(0);
  const loadPatientsRef = useRef(null);

  useEffect(() => {
    if (!hydrated) dispatch(hydrateErmDocuments());
  }, [dispatch, hydrated]);

  const loadPatients = useCallback(
    async ({ append = false, nextUrl = null, search: searchTerm } = {}) => {
      if (!baseUrl) {
        setPatientHits([]);
        setPatientNext(null);
        setPatientError('Patient search is unavailable. Please try again later.');
        return;
      }

      const q = searchTerm !== undefined ? String(searchTerm || '').trim() : activeSearch;
      const isSearch = Boolean(q);

      const gen = loadGenRef.current + 1;
      loadGenRef.current = gen;

      if (append) setPatientLoadingMore(true);
      else {
        setPatientLoading(true);
        setPatientError('');
      }

      try {
        const data = await searchPatients({
          search: q,
          pageSize: PATIENT_SEARCH_PAGE_SIZE,
          page: 1,
          url: append ? nextUrl : undefined,
        });
        if (gen !== loadGenRef.current) return;

        setPatientHits((prev) =>
          append ? mergePatientHits(prev, data.results) : data.results
        );
        setPatientNext(isSearch ? null : data.next);
      } catch {
        if (gen !== loadGenRef.current) return;
        if (!append) {
          setPatientHits([]);
          setPatientNext(null);
          setPatientError('Unable to load patients right now. Please try again.');
        }
      } finally {
        if (gen === loadGenRef.current) {
          setPatientLoading(false);
          setPatientLoadingMore(false);
        }
      }
    },
    [baseUrl, activeSearch]
  );

  loadPatientsRef.current = loadPatients;

  useEffect(() => {
    loadPatientsRef.current?.({ append: false, search: '' });
  }, []);

  const submitSearch = useCallback(() => {
    const q = inputQuery.trim();
    setActiveSearch(q);
    loadPatients({ append: false, search: q });
  }, [inputQuery, loadPatients]);

  const handleInputChange = useCallback((value) => {
    setInputQuery(value);
    if (!String(value || '').trim()) {
      setActiveSearch('');
      setPatientHits([]);
      setPatientNext(null);
      setPatientError('');
      loadPatientsRef.current?.({ append: false, search: '' });
    }
  }, []);

  const handleListScroll = useCallback(() => {
    if (activeSearch) return;
    const el = listRef.current;
    if (!el || patientLoading || patientLoadingMore || !patientNext) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 48;
    if (nearBottom) loadPatients({ append: true, nextUrl: patientNext });
  }, [activeSearch, patientLoading, patientLoadingMore, patientNext, loadPatients]);

  const openFolder = useCallback(
    (patient) => {
      dispatch(setSelectedPatient(patient));
      dispatch(setErmError(null));
      onClearTitleSearch?.();
    },
    [dispatch, onClearTitleSearch]
  );

  const displayError = patientError || storeError;
  const inputTrimmed = inputQuery.trim();
  const listMatchesInput = !inputTrimmed || inputTrimmed === activeSearch;
  const visibleHits = listMatchesInput ? patientHits : [];

  const showEnterHint =
    inputTrimmed && inputTrimmed !== activeSearch && !patientLoading;
  const showNoResults =
    !patientLoading && !patientError && visibleHits.length === 0 && activeSearch && listMatchesInput;
  const showBrowseEmpty =
    !patientLoading && !patientError && visibleHits.length === 0 && !activeSearch;

  const selectedKey = patientRowKey(selectedPatient);
  const highlightOpen = Boolean(selectedPatient) && !activeTitleSearch;
  const folderCount = visibleHits.length;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-col gap-0.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-amber-50/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-amber-200/80 bg-amber-50 text-amber-700">
              {activeTitleSearch ? (
                <FiFileText className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <FiFolder className="h-3.5 w-3.5" aria-hidden />
              )}
            </span>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">
              {activeTitleSearch ? 'Document search' : 'Patient folders'}
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500 sm:pl-7">
            {activeTitleSearch
              ? 'Title matches replace the folder grid. Clear search to browse folders again.'
              : 'Open a folder to upload, view, and manage documents for that patient.'}
          </p>
        </div>
        {!activeTitleSearch && folderCount > 0 && !patientLoading ? (
          <p className="shrink-0 text-[11px] font-medium text-slate-500">
            {folderCount} folder{folderCount === 1 ? '' : 's'}
            {patientNext ? '+' : ''}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 border-b border-slate-100 bg-slate-50/40 p-2 sm:p-2.5 lg:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-slate-200/90 bg-white p-2 shadow-sm">
          <label
            htmlFor="erm-patient-folder-search"
            className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
          >
            <FiUser className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
            Find patient
          </label>
          <div className="flex gap-1.5">
            <div className="relative min-w-0 flex-1">
              <FiSearch
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                id="erm-patient-folder-search"
                type="search"
                placeholder="Name or patient ID — press Enter"
                value={inputQuery}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitSearch();
                  }
                }}
                disabled={Boolean(activeTitleSearch)}
                className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60"
              />
              {inputQuery ? (
                <button
                  type="button"
                  onClick={() => handleInputChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition-colors hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Clear patient search"
                >
                  <FiX className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={submitSearch}
              disabled={patientLoading || Boolean(activeTitleSearch)}
              className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:bg-indigo-700 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:active:scale-100"
            >
              Search
            </button>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-slate-200/90 bg-white p-2 shadow-sm">
          <label
            htmlFor="erm-doc-title-search"
            className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
          >
            <FiFileText className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
            Search by title (all patients)
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative min-w-0 flex-1 basis-[10rem]">
              <FiSearch
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                id="erm-doc-title-search"
                type="search"
                value={titleSearchInput}
                onChange={(e) => onTitleSearchInputChange?.(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onTitleSearch?.();
                  }
                }}
                placeholder="Search document titles…"
                className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              />
            </div>
            <button
              type="button"
              onClick={() => onTitleSearch?.()}
              className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:bg-indigo-700 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 motion-reduce:active:scale-100"
            >
              Search
            </button>
            {activeTitleSearch ? (
              <button
                type="button"
                onClick={() => onClearTitleSearch?.()}
                className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
              >
                Clear
              </button>
            ) : null}
          </div>
          {activeTitleSearch ? (
            <p className="mt-1.5 rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-800">
              Showing titles containing &quot;{activeTitleSearch}&quot; across all patients.
            </p>
          ) : null}
        </div>
      </div>

      {displayError && !activeTitleSearch ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-100 bg-rose-50 px-3 py-2 sm:px-4"
          role="alert"
        >
          <p className="text-xs text-rose-700">{displayError}</p>
          <button
            type="button"
            onClick={() => loadPatients({ append: false, search: activeSearch })}
            className="rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1"
          >
            Retry
          </button>
        </div>
      ) : null}

      {activeTitleSearch && titleSearchPanel ? (
        <div className="max-h-[min(70vh,40rem)] overflow-y-auto px-3 py-2.5 sm:px-4">
          {titleSearchPanel}
        </div>
      ) : (
        <div
          ref={listRef}
          onScroll={handleListScroll}
          className="max-h-[min(70vh,40rem)] overflow-y-auto px-3 py-2.5 sm:px-4"
          aria-label="Patient folders"
        >
          {patientLoading && visibleHits.length === 0 ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <FolderSkeleton key={`sk-${i}`} />
              ))}
              <span className="sr-only">Loading patients…</span>
            </ul>
          ) : null}

          {showEnterHint ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50/80 py-2.5 text-center text-xs text-slate-500">
              Press Enter or Search to find patients
            </p>
          ) : null}

          {showNoResults ? (
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
                <FiSearch className="h-4 w-4" aria-hidden />
              </span>
              <p className="text-sm font-semibold text-slate-800">No patients found</p>
              <p className="max-w-xs text-[11px] text-slate-500">
                Try another name or patient ID, or clear the search to browse all folders.
              </p>
            </div>
          ) : null}

          {showBrowseEmpty ? (
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-600 shadow-sm ring-1 ring-amber-100">
                <FiFolder className="h-4 w-4" aria-hidden />
              </span>
              <p className="text-sm font-semibold text-slate-800">No patient folders yet</p>
              <p className="max-w-xs text-[11px] text-slate-500">
                Patients will appear here as folders once they are available.
              </p>
            </div>
          ) : null}

          {visibleHits.length > 0 ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {visibleHits.map((p, index) => {
                const key = patientRowKey(p);
                const isOpen = highlightOpen && key === selectedKey;
                const name = patientDisplayName(p);
                const pid = patientIdText(p);
                const fullLabel = formatPatientLabel(p);
                return (
                  <li
                    key={key || fullLabel}
                    className="min-w-0 motion-safe:animate-[fadeSlideIn_0.28s_ease-out_both]"
                    style={{ animationDelay: `${Math.min(index, 11) * 28}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => openFolder(p)}
                      disabled={Boolean(activeTitleSearch)}
                      aria-pressed={isOpen}
                      title={`Open folder: ${fullLabel}`}
                      className={`group flex h-full w-full flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
                        activeTitleSearch
                          ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-50'
                          : isOpen
                            ? 'border-indigo-300 bg-indigo-50/90 shadow-sm ring-2 ring-indigo-200'
                            : 'border-slate-200/90 bg-white shadow-sm hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/50 hover:shadow-md motion-reduce:hover:translate-y-0'
                      }`}
                    >
                      <span className="relative flex h-12 w-14 items-end justify-center">
                        <span
                          className={`absolute left-1.5 top-0 h-2.5 w-6 rounded-t-md ${
                            isOpen ? 'bg-indigo-300' : 'bg-amber-300 group-hover:bg-amber-400'
                          } transition-colors duration-200`}
                          aria-hidden
                        />
                        <span
                          className={`relative flex h-11 w-11 items-center justify-center rounded-lg border shadow-sm transition-colors duration-200 ${
                            isOpen
                              ? 'border-indigo-200 bg-indigo-100 text-indigo-700'
                              : 'border-amber-200 bg-gradient-to-b from-amber-50 to-amber-100/80 text-amber-700 group-hover:border-amber-300'
                          }`}
                        >
                          {isOpen ? (
                            <FaFolderOpen className="h-6 w-6" aria-hidden />
                          ) : (
                            <FiFolder className="h-6 w-6" aria-hidden />
                          )}
                        </span>
                      </span>
                      <span className="line-clamp-2 w-full text-[11px] font-semibold leading-snug text-slate-900 sm:text-xs">
                        {name}
                      </span>
                      {pid ? (
                        <span className="max-w-full truncate rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-600">
                          ID {pid}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {patientLoadingMore ? (
            <div className="mt-2.5 flex items-center justify-center gap-2 text-xs text-slate-500">
              <svg
                className="h-3.5 w-3.5 animate-spin text-indigo-600 motion-reduce:animate-none"
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
              Loading more folders…
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
};

export default ERMPatientPicker;
