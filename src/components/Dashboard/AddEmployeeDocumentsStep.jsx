import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { compressFileForUpload } from '../../utils/compressUploadFiles';

const DOCUMENT_MAX_UPLOAD_MB = 5;
const DOCUMENT_ACCEPT =
  'image/*,.pdf,.doc,.docx,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const fieldClass =
  'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60';
const labelClass = 'mb-1 block text-xs font-semibold text-gray-700';

const extractFileNameFromUrl = (url) => {
  const cleaned = String(url || '').split('?')[0];
  const lastSegment = cleaned.split('/').pop() || '';
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
};

const inferDocMimeTypeFromName = (nameOrUrl) => {
  const value = String(nameOrUrl || '').toLowerCase();
  if (value.endsWith('.pdf')) return 'application/pdf';
  if (value.endsWith('.png')) return 'image/png';
  if (value.endsWith('.jpg') || value.endsWith('.jpeg')) return 'image/jpeg';
  if (value.endsWith('.gif')) return 'image/gif';
  if (value.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
};

const normalizeDocEntry = (entry, index) => {
  if (!entry || typeof entry !== 'object') return null;
  const documentId = entry.id || entry.document || entry.document_id || entry.parent_document_id || null;
  const sourceFiles = Array.isArray(entry.files) && entry.files.length > 0 ? entry.files : [entry];

  const normalizedFiles = sourceFiles
    .map((fileEntry, fileIndex) => {
      const rawUrl =
        fileEntry?.file ||
        fileEntry?.file_url ||
        fileEntry?.url ||
        fileEntry?.document_url ||
        fileEntry?.document ||
        '';
      if (!rawUrl) return null;
      const fileName =
        fileEntry?.file_name ||
        fileEntry?.filename ||
        fileEntry?.document_name ||
        fileEntry?.name ||
        extractFileNameFromUrl(rawUrl) ||
        `file-${fileIndex + 1}`;
      return {
        id: String(fileEntry?.id || `${documentId || `doc-${index}`}-${fileIndex}`),
        fileName,
        mimeType:
          fileEntry?.mime_type ||
          fileEntry?.content_type ||
          fileEntry?.file_type ||
          inferDocMimeTypeFromName(rawUrl || fileName),
        url: rawUrl,
      };
    })
    .filter(Boolean);

  if (!normalizedFiles.length) return null;

  return {
    id: String(documentId || `doc-${index}`),
    title: entry.title || entry.name || `Document ${index + 1}`,
    remarks: entry.remarks || '',
    files: normalizedFiles,
    fileCount: normalizedFiles.length,
  };
};

const extractApiErrorMessage = (responseData, fallback) => {
  if (typeof responseData === 'string' && responseData.trim()) return responseData;
  if (responseData?.message) return String(responseData.message);
  if (responseData?.detail) return String(responseData.detail);
  if (responseData && typeof responseData === 'object') {
    const firstKey = Object.keys(responseData)[0];
    if (firstKey) {
      const value = responseData[firstKey];
      if (Array.isArray(value) && value[0]) return String(value[0]);
      if (typeof value === 'string') return value;
    }
  }
  return fallback;
};

/**
 * Step 2 after Add Employee create — upload docs via /accounts/user-documents/
 */
const AddEmployeeDocumentsStep = ({
  employee,
  onSkip,
  onDone,
  onAlert,
}) => {
  const [docs, setDocs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [remarks, setRemarks] = useState('');
  const [files, setFiles] = useState([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const loadDocs = useCallback(async () => {
    if (!employee?.id) return;
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      onAlert?.('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const response = await axios.get(`${baseUrl}/accounts/user-documents/`, {
        params: { user: employee.id },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const rawList = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.results)
          ? response.data.results
          : [];
      setDocs(rawList.map(normalizeDocEntry).filter(Boolean));
    } catch (error) {
      const message = extractApiErrorMessage(
        error.response?.data,
        error.message || 'Failed to load documents.',
      );
      setFeedback({ type: 'error', message });
      onAlert?.(message, 'error');
      setDocs([]);
    } finally {
      setIsLoading(false);
    }
  }, [employee?.id, onAlert]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleFileSelect = async (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length) return;

    setIsCompressing(true);
    try {
      const maxBytes = DOCUMENT_MAX_UPLOAD_MB * 1024 * 1024;
      const processed = [];
      for (const raw of selected) {
        const result = await compressFileForUpload(raw, { maxDimension: 1920 });
        const file = result?.file || raw;
        if (file.size > maxBytes) {
          onAlert?.(
            `"${file.name}" is too large after compression (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is ${DOCUMENT_MAX_UPLOAD_MB} MB.`,
            'warning',
          );
          continue;
        }
        processed.push(file);
      }
      if (processed.length) setFiles((prev) => [...prev, ...processed]);
    } catch (error) {
      onAlert?.(error.message || 'Failed to process the selected file(s).', 'error');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleUpload = async (e) => {
    e?.preventDefault?.();
    if (!employee?.id) return;
    if (!files.length) {
      setFeedback({ type: 'error', message: 'Please select at least one document to upload.' });
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFeedback({ type: 'error', message: 'Please enter a document title.' });
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      onAlert?.('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setIsSaving(true);
    setFeedback({ type: '', message: '' });
    try {
      const formData = new FormData();
      formData.append('user', String(employee.id));
      formData.append('title', trimmedTitle);
      formData.append('remarks', remarks.trim());
      for (const file of files) {
        formData.append('files', file);
      }

      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      await axios.post(`${baseUrl}/accounts/user-documents/`, formData, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      setTitle('');
      setRemarks('');
      setFiles([]);
      setFeedback({
        type: 'success',
        message:
          files.length === 1
            ? 'Document uploaded successfully.'
            : `${files.length} documents uploaded successfully.`,
      });
      await loadDocs();
    } catch (error) {
      const message = extractApiErrorMessage(
        error.response?.data,
        error.message || 'Failed to upload document(s).',
      );
      setFeedback({ type: 'error', message });
      onAlert?.(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
            Step 2 of 2
          </p>
          <h2 className="text-lg font-bold text-slate-900">Add documents</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Optional — upload ID proof or other docs for{' '}
            <span className="font-semibold text-slate-800">{employee?.name || 'employee'}</span>.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500" aria-hidden>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">1. Details</span>
          <span aria-hidden>→</span>
          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-white">2. Documents</span>
        </div>
      </div>

      {feedback.message ? (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
          role="status"
        >
          {feedback.message}
        </div>
      ) : null}

      <form
        onSubmit={handleUpload}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <p className="text-xs text-slate-500">
          PDF, Word, Excel, or images. Combined limit: {DOCUMENT_MAX_UPLOAD_MB} MB.
        </p>
        <div>
          <label htmlFor="add-emp-doc-title" className={labelClass}>
            Title <span className="text-rose-600">*</span>
          </label>
          <input
            id="add-emp-doc-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Aadhar"
            disabled={isSaving || isCompressing}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="add-emp-doc-remarks" className={labelClass}>
            Remarks
          </label>
          <input
            id="add-emp-doc-remarks"
            type="text"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Optional remarks"
            disabled={isSaving || isCompressing}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="add-emp-doc-files" className={labelClass}>
            Files <span className="text-rose-600">*</span>
          </label>
          <input
            id="add-emp-doc-files"
            type="file"
            multiple
            accept={DOCUMENT_ACCEPT}
            disabled={isCompressing || isSaving}
            onChange={handleFileSelect}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
          />
          {isCompressing ? (
            <p className="mt-2 text-xs text-indigo-600">Compressing file(s)...</p>
          ) : null}
          {files.length > 0 && !isCompressing ? (
            <ul className="mt-3 max-h-40 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-gray-700"
                >
                  <span className="truncate" title={file.name}>
                    {file.name} ({(file.size / 1024).toFixed(0)} KB)
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                    disabled={isSaving}
                    className="shrink-0 font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="submit"
            disabled={isSaving || isCompressing || !files.length}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving
              ? 'Uploading...'
              : files.length > 1
                ? `Upload ${files.length} files`
                : 'Upload document'}
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-bold text-slate-900">Uploaded documents</h3>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-600">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            Loading documents...
          </div>
        ) : docs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No documents uploaded yet. You can skip this step.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
              >
                <span className="font-semibold text-slate-900">{doc.title}</span>
                {doc.remarks ? (
                  <span className="mt-0.5 block text-slate-500">{doc.remarks}</span>
                ) : null}
                <span className="mt-0.5 block text-slate-500">
                  {doc.fileCount} file{doc.fileCount === 1 ? '' : 's'}
                  {doc.files?.[0]?.fileName ? ` · ${doc.files[0].fileName}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
        <button
          type="button"
          onClick={onSkip}
          disabled={isSaving || isCompressing}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={isSaving || isCompressing}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          Finish
        </button>
      </div>
    </div>
  );
};

export default AddEmployeeDocumentsStep;
