import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FiFolder, FiX } from 'react-icons/fi';
import ERMPatientPicker from './ERMPatientPicker';
import ERMPatientDocuments from './ERMPatientDocuments';
import { clearSelectedPatient, selectErmSelectedPatient } from '../../store/slices/ermSlice';
import { formatPatientLabel } from '../../api/ermPatientRecordsApi';

/** EMR — patient folders; open a folder to manage documents in a modal. */
const EMR = () => {
  const dispatch = useDispatch();
  const selectedPatient = useSelector(selectErmSelectedPatient);
  const [titleSearchInput, setTitleSearchInput] = useState('');
  const [activeTitleSearch, setActiveTitleSearch] = useState('');
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const closeButtonRef = useRef(null);

  const patientLabel = selectedPatient ? formatPatientLabel(selectedPatient) : '';
  const patientPk = selectedPatient?.id ?? selectedPatient?.pk;
  const prevPatientKeyRef = useRef(null);
  const patientKey =
    selectedPatient?.id ?? selectedPatient?.pk ?? selectedPatient?.patient_id ?? null;

  const runTitleSearch = useCallback(() => {
    const term = titleSearchInput.trim();
    if (!term) {
      setActiveTitleSearch('');
      return;
    }
    dispatch(clearSelectedPatient());
    prevPatientKeyRef.current = null;
    setFolderModalVisible(false);
    setActiveTitleSearch(term);
  }, [titleSearchInput, dispatch]);

  const clearTitleSearch = useCallback(() => {
    setTitleSearchInput('');
    setActiveTitleSearch('');
  }, []);

  const closeFolderModal = useCallback(() => {
    setFolderModalVisible(false);
    dispatch(clearSelectedPatient());
  }, [dispatch]);

  useEffect(() => {
    const key = patientKey != null && patientKey !== '' ? String(patientKey) : null;
    if (key && key !== prevPatientKeyRef.current) {
      clearTitleSearch();
      setFolderModalVisible(true);
    }
    if (!key) {
      setFolderModalVisible(false);
    }
    prevPatientKeyRef.current = key;
  }, [patientKey, clearTitleSearch]);

  useEffect(() => {
    if (!folderModalVisible || !selectedPatient) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeFolderModal();
      }
    };
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => closeButtonRef.current?.focus(), 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [folderModalVisible, selectedPatient, closeFolderModal]);

  const showFolderModal = Boolean(selectedPatient) && !activeTitleSearch && folderModalVisible;

  const folderModal =
    showFolderModal && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-center p-2 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="erm-folder-modal-title"
            aria-describedby="erm-folder-modal-desc"
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] transition-opacity duration-200 ease-out motion-reduce:backdrop-blur-none"
              onClick={closeFolderModal}
              aria-label="Close patient folder"
            />
            <div
              className="relative flex max-h-[min(92vh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl motion-safe:animate-[fadeScaleIn_0.22s_ease-out] motion-reduce:animate-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-amber-50/80 via-white to-indigo-50/40 px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 shadow-sm">
                    <FiFolder className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/70">
                      Patient folder
                    </p>
                    <h2
                      id="erm-folder-modal-title"
                      className="truncate text-sm font-bold text-slate-900"
                    >
                      {patientLabel || 'Patient folder'}
                    </h2>
                    <p
                      id="erm-folder-modal-desc"
                      className="mt-0.5 text-[11px] leading-snug text-slate-600"
                    >
                      Upload, view, download, and manage documents in this folder.
                    </p>
                  </div>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={closeFolderModal}
                  className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  aria-label="Close patient folder"
                >
                  <FiX className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 px-3 py-2.5 sm:px-4 sm:py-3">
                <ERMPatientDocuments patientLabel={patientLabel} patientPk={patientPk} />
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="space-y-2">
      <header className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 px-3 py-2.5 shadow-sm sm:px-4">
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-100 bg-white text-indigo-600 shadow-sm">
            <FiFolder className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
              Electronic Medical Records
            </h1>
            <p className="mt-0.5 max-w-2xl text-[11px] leading-snug text-slate-600 sm:text-xs">
              Browse patients as folders, open one to manage documents, or search titles across
              everyone.
            </p>
          </div>
        </div>
      </header>

      <ERMPatientPicker
        titleSearchInput={titleSearchInput}
        onTitleSearchInputChange={setTitleSearchInput}
        activeTitleSearch={activeTitleSearch}
        onTitleSearch={runTitleSearch}
        onClearTitleSearch={clearTitleSearch}
        titleSearchPanel={
          activeTitleSearch ? (
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-slate-900">
                Documents matching &quot;{activeTitleSearch}&quot;
              </h2>
              <ERMPatientDocuments globalTitleSearch={activeTitleSearch} />
            </div>
          ) : null
        }
      />

      {folderModal}
    </div>
  );
};

export default EMR;
