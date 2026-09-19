import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ERMPatientPicker from './ERMPatientPicker';
import ERMPatientDocuments from './ERMPatientDocuments';
import { clearSelectedPatient, selectErmSelectedPatient } from '../../store/slices/ermSlice';
import { formatPatientLabel } from '../../api/ermPatientRecordsApi';

/** EMR — select patient, search documents by title across all patients, manage uploads. */
const EMR = () => {
  const dispatch = useDispatch();
  const selectedPatient = useSelector(selectErmSelectedPatient);
  const [titleSearchInput, setTitleSearchInput] = useState('');
  const [activeTitleSearch, setActiveTitleSearch] = useState('');

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
    setActiveTitleSearch(term);
  }, [titleSearchInput, dispatch]);

  const clearTitleSearch = useCallback(() => {
    setTitleSearchInput('');
    setActiveTitleSearch('');
  }, []);

  useEffect(() => {
    const key = patientKey != null && patientKey !== '' ? String(patientKey) : null;
    if (key && key !== prevPatientKeyRef.current) {
      clearTitleSearch();
    }
    prevPatientKeyRef.current = key;
  }, [patientKey, clearTitleSearch]);

  const showDocuments = Boolean(selectedPatient) || Boolean(activeTitleSearch);

  return (
    <div className="space-y-2">
      <header className="border-b border-gray-200 pb-2">
        <h1 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
          Electronic Medical Records (EMR)
        </h1>
        <p className="mt-0.5 text-[11px] text-gray-600 max-w-3xl leading-snug">
          Select a patient to upload, view, download, and manage patient documents — including PDFs,
          Excel files, CSVs, MP4 videos, and images. Use search by title to find documents across all
          patients.
        </p>
      </header>

      <ERMPatientPicker
        titleSearchInput={titleSearchInput}
        onTitleSearchInputChange={setTitleSearchInput}
        activeTitleSearch={activeTitleSearch}
        onTitleSearch={runTitleSearch}
        onClearTitleSearch={clearTitleSearch}
      />

      {!showDocuments ? (
        <p className="text-[11px] text-gray-500 text-center py-1">
          Select a patient or search by document title above.
        </p>
      ) : (
        <ERMPatientDocuments
          patientLabel={patientLabel}
          patientPk={patientPk}
          globalTitleSearch={activeTitleSearch}
        />
      )}
    </div>
  );
};

export default EMR;
