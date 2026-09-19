import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatPatientLabel, searchPatients } from '../../api/ermPatientRecordsApi';

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

const PatientSearchDropdown = ({
  value = null,
  onChange,
  disabled = false,
  placeholder = 'Search and select patient…',
  /** Prefer opening the menu above the trigger (useful inside bottom-of-modal forms). */
  openUpward = false,
  listMaxHeightClassName = 'max-h-52',
}) => {
  const [open, setOpen] = useState(false);
  const [inputQuery, setInputQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [hits, setHits] = useState([]);
  const [nextUrl, setNextUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [placementUp, setPlacementUp] = useState(openUpward);

  const rootRef = useRef(null);
  const listRef = useRef(null);
  const loadGenRef = useRef(0);
  const loadPatientsRef = useRef(null);
  const searchDebounceRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    if (openUpward) {
      setPlacementUp(true);
      return undefined;
    }
    const el = rootRef.current;
    if (!el) return undefined;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    // Prefer up when below space is tight (dropdown ~14rem + search)
    setPlacementUp(spaceBelow < 260 && spaceAbove > spaceBelow);
    return undefined;
  }, [open, openUpward]);

  const loadPatients = useCallback(async ({ append = false, nextUrl: pageUrl = null, search: searchTerm } = {}) => {
    const q = searchTerm !== undefined ? String(searchTerm || '').trim() : activeSearch;
    const isSearch = Boolean(q);

    const gen = loadGenRef.current + 1;
    loadGenRef.current = gen;

    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError('');
    }

    try {
      const data = await searchPatients({
        search: q,
        url: append ? pageUrl : undefined,
      });
      if (gen !== loadGenRef.current) return;

      setHits((prev) => (append ? mergePatientHits(prev, data.results) : data.results));
      setNextUrl(isSearch ? null : data.next);
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      if (!append) {
        setHits([]);
        setNextUrl(null);
        setError(
          e?.response?.data?.detail
            || e?.response?.data?.message
            || e?.message
            || 'Failed to load patients.',
        );
      }
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [activeSearch]);

  loadPatientsRef.current = loadPatients;

  useEffect(() => {
    if (!open) return undefined;
    setInputQuery('');
    setActiveSearch('');
    setHits([]);
    setNextUrl(null);
    setError('');
    loadPatientsRef.current?.({ append: false, search: '' });
    return undefined;
  }, [open]);

  const scheduleSearch = useCallback((query) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const q = String(query || '').trim();
      setActiveSearch(q);
      loadPatientsRef.current?.({ append: false, search: q });
    }, 350);
  }, []);

  useEffect(() => () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  const handleInputChange = (nextValue) => {
    setInputQuery(nextValue);
    scheduleSearch(nextValue);
  };

  const handleListScroll = useCallback(() => {
    if (activeSearch) return;
    const el = listRef.current;
    if (!el || loading || loadingMore || !nextUrl) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (nearBottom) {
      loadPatients({ append: true, nextUrl, search: activeSearch });
    }
  }, [activeSearch, loading, loadingMore, nextUrl, loadPatients]);

  const selectPatient = (patient) => {
    onChange?.(patient);
    setOpen(false);
    setInputQuery('');
    setActiveSearch('');
    setHits([]);
    setNextUrl(null);
  };

  const clearSelection = () => {
    onChange?.(null);
  };

  const inputTrimmed = inputQuery.trim();
  const listMatchesInput = !inputTrimmed || inputTrimmed === activeSearch;
  const visibleHits = listMatchesInput ? hits : [];

  return (
    <div className="relative w-full" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
          disabled
            ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
            : 'border-gray-300 bg-white hover:border-indigo-400 focus:border-indigo-500'
        }`}
      >
        <span className={`truncate ${value ? 'text-gray-900' : 'text-gray-500'}`}>
          {value ? formatPatientLabel(value) : placeholder}
        </span>
        <span className="ml-2 shrink-0 text-xs text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {value && !disabled ? (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-indigo-700 hover:underline"
          onClick={clearSelection}
        >
          Clear patient
        </button>
      ) : null}

      {open && !disabled ? (
        <div
          className={`absolute z-50 w-full rounded-lg border border-gray-200 bg-white shadow-lg ${
            placementUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          <input
            type="search"
            autoFocus
            placeholder="Search by name or patient ID…"
            value={inputQuery}
            onChange={(e) => handleInputChange(e.target.value)}
            className="w-full border-b border-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-0"
          />
          {loading && visibleHits.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-500">Loading patients…</div>
          ) : null}
          {error ? <div className="px-3 py-2 text-xs text-red-600">{error}</div> : null}
          {!loading && !error && visibleHits.length === 0 && activeSearch ? (
            <div className="px-3 py-2 text-xs text-gray-500">No patients found.</div>
          ) : null}
          {!loading && !error && visibleHits.length === 0 && !activeSearch ? (
            <div className="px-3 py-2 text-xs text-gray-500">No patients available.</div>
          ) : null}
          <ul
            ref={listRef}
            className={`${listMaxHeightClassName} overflow-y-auto overscroll-contain text-sm`}
            onScroll={handleListScroll}
          >
            {visibleHits.map((p) => (
              <li key={patientRowKey(p)}>
                <button
                  type="button"
                  className={`w-full px-3 py-2 text-left hover:bg-indigo-50 ${
                    value && patientRowKey(value) === patientRowKey(p) ? 'bg-indigo-50 font-medium' : ''
                  }`}
                  onClick={() => selectPatient(p)}
                >
                  {formatPatientLabel(p)}
                </button>
              </li>
            ))}
          </ul>
          {loadingMore ? (
            <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
              Loading more…
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default PatientSearchDropdown;
