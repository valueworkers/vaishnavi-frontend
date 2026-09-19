import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { formatPatientLabel, searchPatients } from '../../api/ermPatientRecordsApi';
import { ERM_TEMPLATES_STORAGE_KEY } from '../../constants/ermStorage';
import { isOcrImageFile, parseOcrTextToFields, runOcrOnImageFile } from '../../utils/ermOcr';
import {
  addPatientDocument,
  clearSelectedPatient,
  deletePatientDocument,
  ermGenId,
  ermPatientKey,
  hydrateErmDocuments,
  selectErmHydrated,
  selectErmLastError,
  selectErmPatientDocuments,
  selectErmSelectedPatient,
  setErmError,
  setSelectedPatient,
  updatePatientDocument,
} from '../../store/slices/ermSlice';

const MAX_FILE_BYTES = 3 * 1024 * 1024;

const loadFormTemplates = () => {
  try {
    const raw = localStorage.getItem(ERM_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });

const kindLabel = (kind) => {
  if (kind === 'ocr') return 'Scanned (OCR)';
  if (kind === 'image') return 'Photo';
  if (kind === 'file') return 'File';
  if (kind === 'form') return 'Form';
  return 'Document';
};

const isEditableFormDoc = (doc) => doc?.kind === 'form' || doc?.kind === 'ocr';

const initFieldValuesFromRecord = (record) => {
  const fv = { ...(record?.field_values || {}) };
  for (const f of record?.fields || []) {
    const k = String(f.id);
    if (fv[k] === undefined || fv[k] === null) fv[k] = '';
    else fv[k] = String(fv[k]);
  }
  return fv;
};

const RecordFieldEditor = ({ fields, values, onChange }) => {
  if (!Array.isArray(fields) || fields.length === 0) {
    return <p className="text-sm text-gray-500">This record has no template fields.</p>;
  }
  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      {fields.map((f) => {
        const k = String(f.id);
        const v = values[k] ?? '';
        const label = f.label || 'Field';
        const common =
          'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';
        if (f.type === 'textarea') {
          return (
            <label key={k} className="block text-sm">
              <span className="font-medium text-gray-800">{label}</span>
              <textarea rows={3} className={common} value={v} onChange={(e) => onChange(k, e.target.value)} />
            </label>
          );
        }
        if (f.type === 'number') {
          return (
            <label key={k} className="block text-sm">
              <span className="font-medium text-gray-800">{label}</span>
              <input type="number" className={common} value={v} onChange={(e) => onChange(k, e.target.value)} />
            </label>
          );
        }
        if (f.type === 'date') {
          return (
            <label key={k} className="block text-sm">
              <span className="font-medium text-gray-800">{label}</span>
              <input type="date" className={common} value={v} onChange={(e) => onChange(k, e.target.value)} />
            </label>
          );
        }
        return (
          <label key={k} className="block text-sm">
            <span className="font-medium text-gray-800">{label}</span>
            <input type="text" className={common} value={v} onChange={(e) => onChange(k, e.target.value)} />
          </label>
        );
      })}
    </div>
  );
};

const DocumentPreview = ({ doc }) => {
  if (doc.kind === 'image' && doc.dataUrl) {
    return (
      <img src={doc.dataUrl} alt={doc.title || 'Document'} className="max-h-[70vh] w-full object-contain rounded-lg" />
    );
  }
  if (doc.dataUrl && doc.mimeType?.startsWith('image/')) {
    return (
      <img src={doc.dataUrl} alt={doc.title || 'Document'} className="max-h-[70vh] w-full object-contain rounded-lg" />
    );
  }
  if (doc.dataUrl) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-700">{doc.fileName || doc.title}</p>
        <a
          href={doc.dataUrl}
          download={doc.fileName || 'document'}
          className="mt-3 inline-block text-sm font-semibold text-indigo-700 hover:underline"
        >
          Download file
        </a>
      </div>
    );
  }
  return <p className="text-sm text-gray-500">No preview available.</p>;
};

const ERMPatientRecords = () => {
  const dispatch = useDispatch();
  const baseUrl = useMemo(() => String(import.meta.env.VITE_BASEURL_CARE || '').trim(), []);

  const hydrated = useSelector(selectErmHydrated);
  const selectedPatient = useSelector(selectErmSelectedPatient);
  const documents = useSelector(selectErmPatientDocuments);
  const storeError = useSelector(selectErmLastError);
  const patientPk = ermPatientKey(selectedPatient);

  const [patientQuery, setPatientQuery] = useState('');
  const [patientHits, setPatientHits] = useState([]);
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientError, setPatientError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const [viewDoc, setViewDoc] = useState(null);
  const [editRecord, setEditRecord] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [mapTitle, setMapTitle] = useState('');
  const [mapNote, setMapNote] = useState('');

  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadNote, setUploadNote] = useState('');
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [ocrDraft, setOcrDraft] = useState(null);

  const pickerRef = useRef(null);
  const scanInputRef = useRef(null);

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

  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!baseUrl) {
        setPatientHits([]);
        setPatientError('Set VITE_BASEURL_CARE to search patients from your API.');
        return;
      }
      setPatientLoading(true);
      setPatientError('');
      try {
        const data = await searchPatients({ search: patientQuery, pageSize: 25 });
        if (!cancelled) setPatientHits(data.results);
      } catch (e) {
        if (!cancelled) {
          setPatientHits([]);
          setPatientError(
            e?.response?.data?.detail || e?.response?.data?.message || e?.message || 'Patient search failed.'
          );
        }
      } finally {
        if (!cancelled) setPatientLoading(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [patientQuery, pickerOpen, baseUrl]);

  const closeOcrModal = useCallback(() => {
    setOcrModalOpen(false);
    setOcrDraft(null);
  }, []);

  const startOcrFromFile = useCallback(
    async (file) => {
      if (!patientPk || !file) return;
      if (!isOcrImageFile(file)) {
        dispatch(setErmError('Choose a photo or scanned image (JPG, PNG, WEBP, etc.) for OCR.'));
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        dispatch(setErmError(`Image is too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB).`));
        return;
      }
      dispatch(setErmError(null));
      const title =
        uploadTitle.trim() || file.name.replace(/\.[^.]+$/, '') || 'Scanned document';
      setOcrDraft({
        file,
        fileName: file.name,
        dataUrl: null,
        title,
        note: uploadNote.trim(),
        ocrProgress: 'Loading image…',
        ocrError: '',
        ocrRawText: '',
        fields: [],
        busy: true,
      });
      setOcrModalOpen(true);
      try {
        const dataUrl = await readFileAsDataUrl(file);
        setOcrDraft((d) => (d ? { ...d, dataUrl } : d));
        const { rawText, fields } = await runOcrOnImageFile(file, {
          enhanceForOcr: true,
          ocrLayout: 'auto',
          secondPassColumn: false,
          onProgress: (msg) => setOcrDraft((d) => (d ? { ...d, ocrProgress: msg } : d)),
        });
        setOcrDraft((d) =>
          d
            ? {
                ...d,
                ocrRawText: rawText,
                fields,
                busy: false,
                ocrProgress: fields.length
                  ? `Found ${fields.length} field(s). Fill values and save.`
                  : 'No fields detected. Edit OCR text below or add fields manually.',
              }
            : d
        );
      } catch (e) {
        setOcrDraft((d) =>
          d
            ? {
                ...d,
                busy: false,
                ocrError: e?.message || 'OCR failed. Try a clearer photo.',
                ocrProgress: null,
              }
            : d
        );
      }
    },
    [dispatch, patientPk, uploadNote, uploadTitle]
  );

  const onScanPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) startOcrFromFile(file);
  };

  const reparseOcrDraft = () => {
    if (!ocrDraft) return;
    const fields = parseOcrTextToFields(ocrDraft.ocrRawText);
    setOcrDraft((d) => ({
      ...d,
      fields,
      ocrProgress: fields.length ? `Re-parsed: ${fields.length} field(s).` : 'No fields matched.',
    }));
  };

  const saveOcrDocument = () => {
    if (!patientPk || !ocrDraft) return;
    if (!ocrDraft.fields?.length) {
      dispatch(setErmError('Add at least one field from OCR before saving.'));
      return;
    }
    const field_values = Object.fromEntries(
      (ocrDraft.fields || []).map((f) => [String(f.id), ''])
    );
    dispatch(
      addPatientDocument({
        id: ermGenId(),
        patientPk,
        kind: 'ocr',
        title: ocrDraft.title.trim() || 'Scanned document',
        note: ocrDraft.note || '',
        fileName: ocrDraft.fileName,
        mimeType: ocrDraft.file?.type || 'image/jpeg',
        dataUrl: ocrDraft.dataUrl,
        ocrRawText: ocrDraft.ocrRawText || '',
        fields: ocrDraft.fields.map(({ id, label, type }) => ({
          id,
          label: String(label).trim() || 'Field',
          type: type || 'text',
        })),
        field_values,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
    setUploadTitle('');
    setUploadNote('');
    closeOcrModal();
  };

  const openMapModal = () => {
    const list = loadFormTemplates();
    setTemplates(list);
    const first = list[0];
    setTemplateId(first?.id || '');
    setMapTitle(first?.name || '');
    setMapNote('');
    setMapModalOpen(true);
  };

  const handleAttachTemplate = () => {
    if (!patientPk) return;
    const tpl = templates.find((x) => String(x.id) === String(templateId));
    if (!tpl) {
      dispatch(setErmError('Choose a saved form template first (build one in “Dynamic forms from image”).'));
      return;
    }
    dispatch(
      addPatientDocument({
        id: ermGenId(),
        patientPk,
        kind: 'form',
        title: mapTitle.trim() || tpl.name,
        note: mapNote.trim(),
        category: tpl.category || 'custom',
        templateId: tpl.id,
        fields: Array.isArray(tpl.fields) ? tpl.fields : [],
        field_values: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
    setMapModalOpen(false);
  };

  const openFieldEditor = (record) => {
    setEditValues(initFieldValuesFromRecord(record));
    setEditRecord(record);
  };

  const handleSaveFieldValues = () => {
    if (!patientPk || !editRecord) return;
    setEditSaving(true);
    dispatch(
      updatePatientDocument({
        patientPk,
        documentId: editRecord.id,
        patch: { field_values: editValues },
      })
    );
    setEditSaving(false);
    setEditRecord(null);
    setEditValues({});
  };

  const handleDeleteDocument = (documentId) => {
    if (!patientPk) return;
    if (!window.confirm('Remove this document from the patient?')) return;
    dispatch(deletePatientDocument({ patientPk, documentId }));
    if (viewDoc?.id === documentId) setViewDoc(null);
  };

  const displayError = patientError || storeError;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <h2 className="text-sm font-bold text-gray-900">Patient documents</h2>
      <p className="mt-0.5 text-[11px] text-gray-600 max-w-3xl leading-snug">
        Step 1: select a patient. Step 2: scan a document photo — OCR reads the form and creates editable fields.
        Saved in Redux and your browser until the ERM API is connected.
      </p>

      <div className="mt-3 space-y-2">
        <label className="block text-xs font-semibold text-gray-800">1. Select patient</label>
        <div className="relative max-w-xl" ref={pickerRef}>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm hover:border-indigo-400"
            onClick={() => {
              setPickerOpen((o) => !o);
              if (!pickerOpen) setPatientQuery('');
            }}
          >
            <span className={selectedPatient ? 'text-gray-900' : 'text-gray-500'}>
              {selectedPatient ? formatPatientLabel(selectedPatient) : 'Search and select a patient…'}
            </span>
            <span className="text-gray-400">{pickerOpen ? '▲' : '▼'}</span>
          </button>
          {pickerOpen && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
              <input
                type="search"
                autoFocus
                placeholder="Search name or patient ID…"
                value={patientQuery}
                onChange={(e) => setPatientQuery(e.target.value)}
                className="w-full border-b border-gray-100 px-3 py-2 text-sm focus:outline-none"
              />
              {patientLoading && <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>}
              {patientError && <div className="px-3 py-2 text-xs text-red-600">{patientError}</div>}
              {!patientLoading && !patientError && patientHits.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-500">No matches. Keep typing…</div>
              )}
              <ul className="max-h-52 overflow-y-auto text-sm">
                {patientHits.map((p) => (
                  <li key={String(p.id ?? p.patient_id ?? '')}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-indigo-50"
                      onClick={() => {
                        dispatch(setSelectedPatient(p));
                        setPickerOpen(false);
                        setPatientHits([]);
                        dispatch(setErmError(null));
                      }}
                    >
                      {formatPatientLabel(p)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {selectedPatient && (
          <button
            type="button"
            className="text-xs font-medium text-indigo-700 hover:underline"
            onClick={() => {
              dispatch(clearSelectedPatient());
              setViewDoc(null);
              setEditRecord(null);
            }}
          >
            Clear patient
          </button>
        )}
      </div>

      {displayError && <p className="mt-2 text-xs text-red-600">{displayError}</p>}

      {selectedPatient && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-gray-900">
              2. Documents ({documents.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <input
                ref={scanInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onScanPick}
              />
              <button
                type="button"
                disabled={ocrDraft?.busy}
                onClick={() => scanInputRef.current?.click()}
                className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
              >
                Scan document (OCR)
              </button>
              <button
                type="button"
                onClick={openMapModal}
                disabled={loadFormTemplates().length === 0}
                className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Add from template
              </button>
            </div>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block text-[11px] sm:col-span-2">
              <span className="font-medium text-gray-700">Title for next scan (optional)</span>
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="e.g. Lab report, Prescription"
                className="mt-0.5 w-full max-w-md rounded-md border border-gray-300 px-2 py-1 text-xs"
              />
            </label>
            <label className="block text-[11px] sm:col-span-2">
              <span className="font-medium text-gray-700">Note (optional)</span>
              <input
                type="text"
                value={uploadNote}
                onChange={(e) => setUploadNote(e.target.value)}
                className="mt-0.5 w-full max-w-md rounded-md border border-gray-300 px-2 py-1 text-xs"
              />
            </label>
          </div>

          {documents.length === 0 && !ocrDraft?.busy && (
            <p className="mt-2 text-xs text-gray-500">
              No documents yet. Scan a form photo (OCR) or attach a saved template.
            </p>
          )}

          {documents.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50/80"
                >
                  <button
                    type="button"
                    className="flex flex-1 flex-col text-left"
                    onClick={() => {
                      if (isEditableFormDoc(doc)) openFieldEditor(doc);
                      else setViewDoc(doc);
                    }}
                  >
                    <div className="flex h-28 items-center justify-center bg-white border-b border-gray-100">
                      {(doc.kind === 'ocr' || doc.kind === 'image') && doc.dataUrl ? (
                        <img src={doc.dataUrl} alt="" className="h-full w-full object-cover" />
                      ) : doc.mimeType?.startsWith('image/') && doc.dataUrl ? (
                        <img src={doc.dataUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-2xl text-gray-400">
                          {isEditableFormDoc(doc) ? '📋' : '📄'}
                        </span>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-semibold text-gray-900 truncate">{doc.title || 'Untitled'}</p>
                      <p className="text-[10px] text-gray-500">
                        {kindLabel(doc.kind)} · {formatDate(doc.createdAt)}
                      </p>
                    </div>
                  </button>
                  <div className="flex border-t border-gray-100">
                    <button
                      type="button"
                      className="flex-1 py-1 text-[10px] font-medium text-indigo-700 hover:bg-indigo-50"
                      onClick={() => {
                        if (isEditableFormDoc(doc)) openFieldEditor(doc);
                        else setViewDoc(doc);
                      }}
                    >
                      {isEditableFormDoc(doc) ? 'Edit fields' : 'View'}
                    </button>
                    <button
                      type="button"
                      className="flex-1 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50"
                      onClick={() => handleDeleteDocument(doc.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {viewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          onClick={() => setViewDoc(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900">{viewDoc.title || 'Document'}</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {kindLabel(viewDoc.kind)} · {formatDate(viewDoc.createdAt)}
              {viewDoc.note ? ` · ${viewDoc.note}` : ''}
            </p>
            <div className="mt-3">
              <DocumentPreview doc={viewDoc} />
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                onClick={() => setViewDoc(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {editRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          onClick={() => setEditRecord(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900">{editRecord.title || 'Form record'}</h3>
            <p className="mt-1 text-xs text-gray-600">
              Values saved for {selectedPatient ? formatPatientLabel(selectedPatient) : 'this patient'} (Redux +
              browser).
            </p>
            <div className="mt-4">
              <RecordFieldEditor
                fields={editRecord.fields}
                values={editValues}
                onChange={(k, v) => setEditValues((prev) => ({ ...prev, [k]: v }))}
              />
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800"
                onClick={() => setEditRecord(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={editSaving}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={handleSaveFieldValues}
              >
                Save field values
              </button>
            </div>
          </div>
        </div>
      )}

      {ocrModalOpen && ocrDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          onClick={closeOcrModal}
        >
          <div
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900">Scan document — OCR</h3>
            <p className="mt-0.5 text-xs text-gray-600">
              Review fields extracted from the image, then save to this patient.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {ocrDraft.dataUrl && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                  <img
                    src={ocrDraft.dataUrl}
                    alt="Scan preview"
                    className="max-h-48 w-full object-contain mx-auto"
                  />
                </div>
              )}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-800">
                  Title
                  <input
                    type="text"
                    value={ocrDraft.title}
                    onChange={(e) => setOcrDraft((d) => ({ ...d, title: e.target.value }))}
                    className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-gray-800">
                  Note (optional)
                  <input
                    type="text"
                    value={ocrDraft.note}
                    onChange={(e) => setOcrDraft((d) => ({ ...d, note: e.target.value }))}
                    className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
              </div>
            </div>

            {ocrDraft.ocrError && (
              <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2 py-1.5">
                {ocrDraft.ocrError}
              </p>
            )}
            {ocrDraft.ocrProgress && !ocrDraft.ocrError && (
              <p className="mt-2 text-xs text-indigo-800">{ocrDraft.ocrProgress}</p>
            )}

            <label className="mt-3 block text-xs font-medium text-gray-800">
              OCR text (edit and re-parse if needed)
              <textarea
                rows={4}
                value={ocrDraft.ocrRawText}
                onChange={(e) => setOcrDraft((d) => ({ ...d, ocrRawText: e.target.value }))}
                className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-xs font-mono"
              />
            </label>
            <button
              type="button"
              disabled={ocrDraft.busy}
              onClick={reparseOcrDraft}
              className="mt-1 text-xs font-semibold text-indigo-700 hover:underline disabled:opacity-50"
            >
              Re-parse fields from text
            </button>

            {ocrDraft.fields?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-800">
                  Extracted fields ({ocrDraft.fields.length})
                </p>
                <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100 text-xs">
                  {ocrDraft.fields.map((f) => (
                    <li key={f.id} className="px-2 py-1.5 text-gray-700">
                      {f.label} <span className="text-gray-400">({f.type})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                onClick={closeOcrModal}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={ocrDraft.busy || !ocrDraft.fields?.length}
                onClick={saveOcrDocument}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save to patient
              </button>
            </div>
          </div>
        </div>
      )}

      {mapModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          onClick={() => setMapModalOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900">Add form from template</h3>
            <p className="mt-1 text-xs text-gray-600">
              For {selectedPatient ? formatPatientLabel(selectedPatient) : 'this patient'}.
            </p>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-gray-800">Template</span>
              <select
                value={templateId}
                onChange={(e) => {
                  const id = e.target.value;
                  setTemplateId(id);
                  const t = templates.find((x) => String(x.id) === String(id));
                  if (t?.name) setMapTitle(t.name);
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {templates.length === 0 ? (
                  <option value="">No templates — create one above first</option>
                ) : (
                  templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="mt-3 block text-sm">
              <span className="font-medium text-gray-800">Title</span>
              <input
                type="text"
                value={mapTitle}
                onChange={(e) => setMapTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="font-medium text-gray-800">Note (optional)</span>
              <textarea
                rows={2}
                value={mapNote}
                onChange={(e) => setMapNote(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800"
                onClick={() => setMapModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!templateId}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                onClick={handleAttachTemplate}
              >
                Add form
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default ERMPatientRecords;
