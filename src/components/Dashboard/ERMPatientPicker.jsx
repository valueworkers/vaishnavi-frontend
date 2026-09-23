import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FiFolder, FiSearch, FiX } from 'react-icons/fi';
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
        setPatientError('Set VITE_BASEURL_CARE to search patients from your API.');
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
      } catch (e) {
        if (gen !== loadGenRef.current) return;
        if (!append) {
          setPatientHits([]);
          setPatientNext(null);
          setPatientError(
            e?.response?.data?.detail ||
              e?.response?.data?.message ||
              e?.message ||
              'Patient search failed.'
          );
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

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-3 py-2.5 sm:px-4">
        <h2 className="text-sm font-bold text-slate-900">
          {activeTitleSearch ? 'Document search' : 'Patient folders'}
        </h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {activeTitleSearch
            ? 'Title search results replace the folder grid. Clear search to browse folders again.'
            : 'Open a patient folder to view and manage their documents.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-3 py-3 sm:px-4 md:grid-cols-2">
        <div className="min-w-0">
          <label
            htmlFor="erm-patient-folder-search"
            className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-600"
          >
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
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-8 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {inputQuery ? (
                <button
                  type="button"
                  onClick={() => handleInputChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"
                  aria-label="Clear patient search"
                >
                  <FiX className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={submitSearch}
              disabled={patientLoading}
              className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Search
            </button>
          </div>
        </div>

        <div className="min-w-0">
          <label
            htmlFor="erm-doc-title-search"
            className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-600"
          >
            Search by title (all patients)
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
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
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => onTitleSearch?.()}
              className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Search
            </button>
            {activeTitleSearch ? (
              <button
                type="button"
                onClick={() => onClearTitleSearch?.()}
                className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear
              </button>
            ) : null}
          </div>
          {activeTitleSearch ? (
            <p className="mt-1 text-[10px] text-slate-600">
              Showing titles containing &quot;{activeTitleSearch}&quot; across all patients.
            </p>
          ) : null}
        </div>
      </div>

      {displayError && !activeTitleSearch ? (
        <p className="border-b border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:px-4">
          {displayError}
        </p>
      ) : null}

      {activeTitleSearch && titleSearchPanel ? (
        <div className="max-h-[min(70vh,40rem)] overflow-y-auto px-3 py-3 sm:px-4">
          {titleSearchPanel}
        </div>
      ) : (
      <div
        ref={listRef}
        onScroll={handleListScroll}
        className="max-h-[min(70vh,40rem)] overflow-y-auto px-3 py-3 sm:px-4"
        aria-label="Patient folders"
      >
        {patientLoading && visibleHits.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading patients…</p>
        ) : null}
        {showEnterHint ? (
          <p className="py-3 text-center text-xs text-slate-500">Press Enter to search</p>
        ) : null}
        {showNoResults ? (
          <p className="py-8 text-center text-sm text-slate-500">No patients found.</p>
        ) : null}
        {showBrowseEmpty ? (
          <p className="py-8 text-center text-sm text-slate-500">No patients in list.</p>
        ) : null}

        {visibleHits.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleHits.map((p) => {
              const key = patientRowKey(p);
              const isOpen = highlightOpen && key === selectedKey;
              const label = formatPatientLabel(p);
              return (
                <li key={key || label} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => openFolder(p)}
                    disabled={Boolean(activeTitleSearch)}
                    aria-pressed={isOpen}
                    title={`Open folder: ${label}`}
                    className={`flex h-full w-full flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center transition-colors duration-200 ${
                      activeTitleSearch
                        ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-50'
                        : isOpen
                          ? 'border-indigo-400 bg-indigo-50 shadow-sm ring-2 ring-indigo-200'
                          : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/40 hover:shadow-sm'
                    }`}
                  >
                    <span
                      className={`flex h-14 w-14 items-center justify-center rounded-xl border ${
                        isOpen
                          ? 'border-indigo-200 bg-indigo-100 text-indigo-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {isOpen ? (
                        <FaFolderOpen className="h-8 w-8" aria-hidden />
                      ) : (
                        <FiFolder className="h-8 w-8" aria-hidden />
                      )}
                    </span>
                    <span className="line-clamp-2 w-full text-xs font-semibold leading-snug text-slate-900 sm:text-sm">
                      {label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {patientLoadingMore ? (
          <p className="mt-3 text-center text-xs text-slate-500">Loading more…</p>
        ) : null}
      </div>
      )}
    </section>
  );
};

export default ERMPatientPicker;
