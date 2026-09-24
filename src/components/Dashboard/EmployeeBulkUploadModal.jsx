import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiDownload, FiUpload, FiX } from 'react-icons/fi';
import {
  downloadEmployeeBulkUploadTemplate,
  EMPLOYEE_BULK_UPLOAD_INSTRUCTIONS,
  isEmployeeBulkUploadFile,
  summarizeEmployeeBulkUploadResult,
  uploadEmployeeBulkFile,
} from '../../utils/employeeBulkUpload';

const EmployeeBulkUploadModal = ({ open, onClose, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setFile(null);
    setError('');
    setSuccess('');
    setIsUploading(false);
    const t = window.setTimeout(() => closeButtonRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isUploading) {
        e.preventDefault();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isUploading, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const handleFilePick = (e) => {
    const next = e.target.files?.[0] || null;
    setError('');
    setSuccess('');
    if (!next) {
      setFile(null);
      return;
    }
    if (!isEmployeeBulkUploadFile(next)) {
      setFile(null);
      setError('Please choose an Excel (.xlsx / .xls) or CSV file.');
      e.target.value = '';
      return;
    }
    setFile(next);
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadEmployeeBulkUploadTemplate();
      setError('');
    } catch {
      setError('Unable to download the template. Please try again.');
    }
  };

  const handleUpload = async () => {
    if (!file || isUploading) return;
    setIsUploading(true);
    setError('');
    setSuccess('');
    try {
      const data = await uploadEmployeeBulkFile(file);
      const message = summarizeEmployeeBulkUploadResult(data);
      setSuccess(message);
      onSuccess?.(data, message);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err?.message || 'Bulk upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center p-2 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="employee-bulk-upload-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 transition-opacity duration-200"
        onClick={() => {
          if (!isUploading) onClose?.();
        }}
        aria-label="Close bulk upload"
      />
      <div
        className="relative flex max-h-[min(92vh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h2
              id="employee-bulk-upload-title"
              className="text-sm font-bold text-slate-900 sm:text-base"
            >
              Bulk upload employees
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Download the template, fill rows, then upload the Excel file.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            disabled={isUploading}
            onClick={() => onClose?.()}
            className="rounded-md border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            aria-label="Close bulk upload"
          >
            <FiX className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Instructions
            </p>
            <ul className="space-y-1 text-[11px] leading-snug text-slate-600">
              {EMPLOYEE_BULK_UPLOAD_INSTRUCTIONS.filter((line) => line.startsWith('•')).map(
                (line) => (
                  <li key={line}>{line}</li>
                ),
              )}
            </ul>
            <div className="mt-2 space-y-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] leading-snug text-slate-600">
              <p className="font-semibold text-slate-800">Boolean fields (API: true / false)</p>
              <p>
                Qc Required, Pf Applicable, Esi Applicable — enter <span className="font-semibold">TRUE</span> or{' '}
                <span className="font-semibold">FALSE</span> only.
              </p>
              <p className="font-semibold text-slate-800">Skills (API: array of objects)</p>
              <p>
                Prefer a JSON array in the Skills cell, e.g.{' '}
                <code className="rounded bg-slate-100 px-1 text-[10px]">
                  {`[{"skill":"Nursing","priority":0,"experience":"2 years"}]`}
                </code>
              </p>
              <p>Each object needs skill; priority is a number; experience is text.</p>
            </div>
            <p className="mt-1.5 text-[10px] text-slate-500">
              Template download is headers-only. Full notes are on the Instructions sheet.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            disabled={isUploading}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 transition-colors hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
          >
            <FiDownload className="h-3.5 w-3.5" aria-hidden />
            Download Excel template
          </button>

          <div>
            <label
              htmlFor="employee-bulk-upload-file"
              className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-600"
            >
              Upload file
            </label>
            <input
              ref={fileInputRef}
              id="employee-bulk-upload-file"
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              disabled={isUploading}
              onChange={handleFilePick}
              className="block w-full cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 file:mr-2 file:rounded file:border-0 file:bg-indigo-600 file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-white hover:file:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {file ? (
              <p className="mt-1 truncate text-[11px] text-slate-600" title={file.name}>
                Selected: {file.name}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">
                Accepts .xlsx, .xls, or .csv (max 2000 rows).
              </p>
            )}
          </div>

          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2" role="alert">
              <p className="text-xs font-medium text-rose-700">{error}</p>
            </div>
          ) : null}
          {success ? (
            <div
              className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2"
              role="status"
            >
              <p className="text-xs font-medium text-emerald-800">{success}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-100 bg-slate-50/60 px-3 py-2.5 sm:px-4">
          <button
            type="button"
            disabled={isUploading}
            onClick={() => onClose?.()}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            {success ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || isUploading}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
              !file || isUploading
                ? 'cursor-not-allowed bg-gray-300 text-gray-500'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            <FiUpload className="h-3.5 w-3.5" aria-hidden />
            {isUploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default EmployeeBulkUploadModal;
