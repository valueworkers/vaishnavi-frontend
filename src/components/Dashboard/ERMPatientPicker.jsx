import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  formatPatientLabel,
  PATIENT_SEARCH_PAGE_SIZE,
  searchPatients,
} from '../../api/ermPatientRecordsApi';
import {
  clearSelectedPatient,
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

const ERMPatientPicker = ({
  titleSearchInput = '',
  onTitleSearchInputChange,
  activeTitleSearch = '',
  onTitleSearch,
  onClearTitleSearch,
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
  const [pickerOpen, setPickerOpen] = useState(false);

  const pickerRef = useRef(null);
  const listRef = useRef(null);
  const loadGenRef = useRef(0);
  const loadPatientsRef = useRef(null);

  useEffect(() => {
    if (!hydrated) dispatch(hydrateErmDocuments());
  }, [dispatch, hydrated]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pickerOpen]);

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
    if (!pickerOpen) return undefined;
    setInputQuery('');
    setActiveSearch('');
    loadPatientsRef.current?.({ append: false, search: '' });
  }, [pickerOpen]);

  const submitSearch = useCallback(() => {
    const q = inputQuery.trim();
    setActiveSearch(q);
    loadPatients({ append: false, search: q });
  }, [inputQuery, loadPatients]);

  const handleInputChange = useCallback(
    (value) => {
      setInputQuery(value);
      if (!String(value || '').trim()) {
        setActiveSearch('');
        setPatientHits([]);
        setPatientNext(null);
        setPatientError('');
        loadPatientsRef.current?.({ append: false, search: '' });
      }
    },
    []
  );

  const handleListScroll = useCallback(() => {
    if (activeSearch) return;
    const el = listRef.current;
    if (!el || patientLoading || patientLoadingMore || !patientNext) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    if (nearBottom) loadPatients({ append: true, nextUrl: patientNext });
  }, [activeSearch, patientLoading, patientLoadingMore, patientNext, loadPatients]);

  const displayError = patientError || storeError;
  const inputTrimmed = inputQuery.trim();
  const listMatchesInput = !inputTrimmed || inputTrimmed === activeSearch;
  const visibleHits = listMatchesInput ? patientHits : [];

  const showEnterHint =
    pickerOpen && inputTrimmed && inputTrimmed !== activeSearch && !patientLoading;
  const showNoResults =
    !patientLoading && !patientError && visibleHits.length === 0 && activeSearch && listMatchesInput;
  const showBrowseEmpty =
    !patientLoading && !patientError && visibleHits.length === 0 && !activeSearch;

  return (
    <section className="rounded-md border border-gray-200 bg-white px-2 py-2 shadow-sm">
      <div className="min-w-0">
        <h2 className="text-xs font-bold text-gray-900">Patient &amp; documents</h2>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
        <div className="min-w-0">
        <label className="block text-[10px] font-semibold text-gray-700 mb-0.5">Select patient</label>
        <div className="relative w-full" ref={pickerRef}>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-left text-sm hover:border-indigo-400"
            onClick={() => setPickerOpen((o) => !o)}
          >
            <span className={`truncate ${selectedPatient ? 'text-gray-900' : 'text-gray-500'}`}>
              {selectedPatient ? formatPatientLabel(selectedPatient) : 'Search and select a patient…'}
            </span>
            <span className="ml-2 shrink-0 text-gray-400 text-xs">{pickerOpen ? '▲' : '▼'}</span>
          </button>
          {pickerOpen && (
            <div className="absolute z-20 mt-0.5 w-full rounded-md border border-gray-200 bg-white shadow-lg">
              <input
                type="search"
                autoFocus
                placeholder="Search name or patient ID — press Enter"
                value={inputQuery}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitSearch();
                  }
                }}
                className="w-full border-b border-gray-100 px-2.5 py-1.5 text-sm focus:outline-none"
              />
              {patientLoading && visibleHits.length === 0 && (
                <div className="px-2.5 py-1.5 text-xs text-gray-500">Searching…</div>
              )}
              {patientError && <div className="px-2.5 py-1.5 text-xs text-red-600">{patientError}</div>}
              {showEnterHint && (
                <div className="px-2.5 py-1.5 text-xs text-gray-500">Press Enter to search</div>
              )}
              {showNoResults && (
                <div className="px-2.5 py-1.5 text-xs text-gray-500">No patients found.</div>
              )}
              {showBrowseEmpty && (
                <div className="px-2.5 py-1.5 text-xs text-gray-500">No patients in list.</div>
              )}
              <ul
                ref={listRef}
                className="max-h-48 overflow-y-auto text-sm"
                onScroll={handleListScroll}
              >
                {visibleHits.map((p) => (
                  <li key={patientRowKey(p)}>
                    <button
                      type="button"
                      className="w-full px-2.5 py-1.5 text-left hover:bg-indigo-50"
                      onClick={() => {
                        dispatch(setSelectedPatient(p));
                        dispatch(setErmError(null));
                        onClearTitleSearch?.();
                        setPickerOpen(false);
                        setPatientHits([]);
                        setPatientNext(null);
                        setInputQuery('');
                        setActiveSearch('');
                      }}
                    >
                      {formatPatientLabel(p)}
                    </button>
                  </li>
                ))}
              </ul>
              {patientLoadingMore && (
                <div className="border-t border-gray-100 px-2.5 py-1.5 text-xs text-gray-500">
                  Loading more…
                </div>
              )}
            </div>
          )}
        </div>
        {selectedPatient && (
          <button
            type="button"
            className="mt-1 text-[10px] font-medium text-indigo-700 hover:underline"
            onClick={() => dispatch(clearSelectedPatient())}
          >
            Clear patient
          </button>
        )}
        </div>

        <div className="min-w-0">
          <label className="block text-[10px] font-semibold text-gray-700 mb-0.5">
            Search by title (all patients)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
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
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => onTitleSearch?.()}
              className="shrink-0 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
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
          ) : (
            <p className="mt-1 text-[10px] text-slate-500">
              Owners can find documents by title without selecting a patient first.
            </p>
          )}
        </div>
      </div>

      {displayError && <p className="mt-1.5 text-xs text-red-600">{displayError}</p>}
    </section>
  );
};

export default ERMPatientPicker;
