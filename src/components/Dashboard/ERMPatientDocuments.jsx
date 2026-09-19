import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  createPatientDocument,
  deletePatientDocumentFromApi,
  updatePatientDocument,
  fetchPatientDocuments,
  formatPatientDocumentUploadError,
  PATIENT_DOCUMENT_MAX_UPLOAD_BYTES,
  PATIENT_DOCUMENT_MAX_UPLOAD_MB,
  PATIENT_DOCUMENTS_PAGE_SIZE,
  resolveCareApiPageUrl,
} from '../../api/ermPatientRecordsApi';
import { selectErmLastError, setErmError } from '../../store/slices/ermSlice';
import AlertModal from '../AlertModal';
import {
  compressFileForUpload,
  isCompressiblePdf,
  isCompressibleSpreadsheet,
  isCompressibleVideo,
} from '../../utils/compressUploadFiles';

const fileNameFromUrl = (url) => {
  if (!url) return 'document';
  try {
    const path = new URL(String(url)).pathname;
    const base = path.split('/').filter(Boolean).pop() || 'document';
    return decodeURIComponent(base);
  } catch {
    const parts = String(url).split('/').filter(Boolean);
    return parts.pop() || 'document';
  }
};

const IMAGE_EXT_RE =
  /^(jpe?g|png|gif|webp|bmp|svg|tiff?|tif|heic|heif|avif|ico|jfif|pjpeg|pjp|apng)$/i;
const VIDEO_EXT_RE =
  /^(mp4|webm|mov|avi|mkv|m4v|ogv|wmv|3gp|3g2|mpeg|mpg|qt|flv)$/i;
const SPREADSHEET_EXT_RE = /^(xlsx?|xls|csv)$/i;

const mimeFromFileName = (fileName) => {
  const ext = String(fileName || '')
    .match(/\.([a-z0-9]+)$/i)?.[1]
    ?.toLowerCase();
  if (!ext) return '';
  if (ext === 'pdf') return 'application/pdf';
  if (IMAGE_EXT_RE.test(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  if (VIDEO_EXT_RE.test(ext)) {
    const videoMap = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
      mkv: 'video/x-matroska',
      m4v: 'video/x-m4v',
      ogv: 'video/ogg',
      wmv: 'video/x-ms-wmv',
      '3gp': 'video/3gpp',
      '3g2': 'video/3gpp2',
      mpeg: 'video/mpeg',
      mpg: 'video/mpeg',
    };
    return videoMap[ext] || 'video/mp4';
  }
  if (ext === 'csv') return 'text/csv';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return '';
};

const MAX_UPLOAD_MB = PATIENT_DOCUMENT_MAX_UPLOAD_MB;
const MAX_UPLOAD_BYTES = PATIENT_DOCUMENT_MAX_UPLOAD_BYTES;

const totalFileBytes = (files) =>
  (Array.isArray(files) ? files : []).reduce((sum, f) => sum + (f?.size || 0), 0);

const validateCombinedUploadSize = (files, { fileName } = {}) => {
  const total = totalFileBytes(files);
  if (total <= MAX_UPLOAD_BYTES) return '';
  const mb = (total / 1024 / 1024).toFixed(1);
  const prefix = fileName ? `"${fileName}" — ` : '';
  return `${prefix}total is ${mb} MB (max ${MAX_UPLOAD_MB} MB combined for all files).`;
};
const MAX_PAGES_PER_DOC = 20;
const ACCEPT_UPLOAD = [
  'image/*',
  'video/*',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'application/pdf',
  '.pdf',
  '.mp4',
  '.m4v',
  '.mov',
  '.webm',
  '.avi',
  '.mkv',
  '.wmv',
  '.mpeg',
  '.mpg',
  '.3gp',
  '.3g2',
  '.ogv',
  '.xlsx',
  '.xls',
  '.csv',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

const UPLOAD_TYPE_HINT =
  'images (all common formats), videos, PDF, Excel (.xls/.xlsx), or CSV';

const extOf = (name) => {
  const m = String(name || '').match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
};

const resolveMime = (page) =>
  String(
    page?.mimeType || page?.type || mimeFromFileName(page?.fileName || fileNameFromUrl(page?.dataUrl || '')) || ''
  ).toLowerCase();

const fileKindFromFile = (file) => {
  if (!file) return 'other';
  const mime = String(file.type || mimeFromFileName(file.name) || '').toLowerCase();
  const ext = extOf(file.name);
  if (mime.startsWith('video/') || VIDEO_EXT_RE.test(ext)) return 'video';
  if (mime.startsWith('image/') || IMAGE_EXT_RE.test(ext)) return 'image';
  if (mime.includes('pdf') || ext === 'pdf') return 'pdf';
  if (mime.includes('spreadsheet') || mime.includes('excel') || /^(xlsx?|xls)$/.test(ext)) return 'excel';
  if (mime.includes('csv') || ext === 'csv') return 'csv';
  return fileKind({ fileName: file.name, mimeType: file.type, dataUrl: '' });
};

const fileKind = (page) => {
  const url = String(page?.dataUrl || '');
  const ext = extOf(page?.fileName || fileNameFromUrl(url));
  const mime = resolveMime(page);

  if (
    mime.startsWith('video/') ||
    VIDEO_EXT_RE.test(ext) ||
    url.includes('/video/upload/') ||
    /\.(mp4|webm|mov|m4v|avi|mkv|wmv|mpeg|mpg|3gp|3g2|ogv)(\?|$)/i.test(url)
  ) {
    return 'video';
  }
  if (
    (url.includes('/image/upload/') || url.includes('res.cloudinary.com')) &&
    !/\.pdf(\?|$)/i.test(url)
  ) {
    if (!ext || IMAGE_EXT_RE.test(ext)) return 'image';
  }
  if (mime.startsWith('image/') || IMAGE_EXT_RE.test(ext)) return 'image';
  if (mime.includes('pdf') || ext === 'pdf') return 'pdf';
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'application/vnd.ms-excel' ||
    /^(xlsx?|xls)$/.test(ext)
  ) {
    return 'excel';
  }
  if (mime.includes('csv') || ext === 'csv') return 'csv';
  return 'other';
};

const isAllowedFile = (file) => {
  if (!file) return false;
  const t = String(file.type || '').toLowerCase();
  if (t.startsWith('image/') || t.startsWith('video/') || t === 'application/pdf') return true;
  if (t.includes('spreadsheet') || t.includes('excel') || t.includes('csv')) return true;
  const name = file.name || '';
  const ext = extOf(name);
  if (IMAGE_EXT_RE.test(ext) || VIDEO_EXT_RE.test(ext) || SPREADSHEET_EXT_RE.test(ext)) return true;
  if (/\.pdf$/i.test(name)) return true;
  if ((t === 'application/octet-stream' || t === '') && (VIDEO_EXT_RE.test(ext) || IMAGE_EXT_RE.test(ext))) {
    return true;
  }
  return false;
};

const formatWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
};

/** API `file` URL, `pages[]`, or legacy front/back. */
const getDocPages = (doc) => {
  if (Array.isArray(doc?.pages) && doc.pages.length > 0) {
    return doc.pages.filter((p) => p?.dataUrl);
  }
  const fileUrl = doc?.fileUrl || doc?.file;
  if (fileUrl) {
    const fileName = fileNameFromUrl(fileUrl);
    return [
      {
        id: `file-${doc.id}`,
        dataUrl: fileUrl,
        fileName,
        mimeType: mimeFromFileName(fileName),
      },
    ];
  }
  const legacy = [];
  if (doc?.front?.dataUrl) legacy.push({ id: 'legacy-front', ...doc.front });
  if (doc?.back?.dataUrl) legacy.push({ id: 'legacy-back', ...doc.back });
  return legacy;
};

const pageLabel = (index) => `Page ${index + 1}`;

const kindLabel = (page) => {
  const k = fileKind(page);
  if (k === 'pdf') return 'PDF';
  if (k === 'excel') return 'Excel';
  if (k === 'csv') return 'CSV';
  if (k === 'image') return 'Image';
  if (k === 'video') return 'Video';
  return 'File';
};

const downloadFileName = (docTitle, label, page) => {
  if (page?.fileName) return page.fileName;
  const safe = String(docTitle || 'document')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
  const ext = extOf(page?.fileName) || (fileKind(page) === 'pdf' ? 'pdf' : 'bin');
  return `${safe}-${label.replace(/\s+/g, '-').toLowerCase()}.${ext}`;
};

const downloadPage = (page, docTitle, label) => {
  if (!page?.dataUrl) return;
  const href = String(page.dataUrl);
  const a = document.createElement('a');
  a.href = href;
  if (href.startsWith('http://') || href.startsWith('https://')) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  a.download = downloadFileName(docTitle, label, page);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const decodeDataUrlText = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return '';
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return '';
  try {
    return decodeURIComponent(escape(atob(dataUrl.slice(comma + 1))));
  } catch {
    try {
      return atob(dataUrl.slice(comma + 1));
    } catch {
      return '';
    }
  }
};

const PdfPreview = ({ src, title, label }) => {
  const [blobUrl, setBlobUrl] = useState('');

  useEffect(() => {
    if (!src) {
      setBlobUrl('');
      return undefined;
    }
    if (!String(src).startsWith('data:')) {
      setBlobUrl(src);
      return undefined;
    }
    let revoked = '';
    fetch(src)
      .then((r) => r.blob())
      .then((blob) => {
        revoked = URL.createObjectURL(blob);
        setBlobUrl(revoked);
      })
      .catch(() => setBlobUrl(src));
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [src]);

  const displaySrc = blobUrl || src;
  if (!displaySrc) return null;

  return (
    <div className="w-full h-full min-h-[50vh] sm:min-h-[65vh] flex flex-col gap-2">
      <iframe
        title={`${title} ${label}`}
        src={displaySrc}
        className="w-full flex-1 min-h-[50vh] sm:min-h-[65vh] rounded-lg border border-slate-300 bg-white"
      />
      <p className="text-center text-xs text-slate-600">
        If the PDF does not display,{' '}
        <button
          type="button"
          className="font-semibold text-indigo-700 hover:underline"
          onClick={() => window.open(displaySrc, '_blank', 'noopener,noreferrer')}
        >
          open in new tab
        </button>{' '}
        or download.
      </p>
    </div>
  );
};

const FilePreview = ({ page, docTitle, label }) => {
  const kind = fileKind(page);
  if (kind === 'image') {
    return (
      <img
        src={page.dataUrl}
        alt={`${docTitle} ${label}`}
        referrerPolicy="no-referrer"
        className="max-w-full max-h-[min(78vh,900px)] w-auto h-auto object-contain rounded shadow-lg bg-white"
      />
    );
  }
  if (kind === 'pdf') {
    return <PdfPreview src={page.dataUrl} title={docTitle} label={label} />;
  }
  if (kind === 'video') {
    return (
      <video
        src={page.dataUrl}
        controls
        playsInline
        className="max-w-full max-h-[min(78vh,900px)] w-auto rounded shadow-lg bg-black"
      >
        <track kind="captions" />
        Your browser does not support video playback.
      </video>
    );
  }
  if (kind === 'csv') {
    const text = decodeDataUrlText(page.dataUrl);
    const preview = text.length > 12000 ? `${text.slice(0, 12000)}\n… (truncated)` : text;
    return (
      <div className="w-full max-w-4xl max-h-[min(78vh,900px)] overflow-auto rounded-lg border border-slate-300 bg-white p-3 shadow-lg">
        <pre className="text-xs text-slate-800 whitespace-pre-wrap font-mono">{preview || 'Empty file'}</pre>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-8 py-10 text-center shadow-lg max-w-md">
      <p className="text-4xl mb-3" aria-hidden>
        {kind === 'excel' ? '📊' : kind === 'video' ? '🎬' : '📄'}
      </p>
      <p className="text-sm font-semibold text-gray-900">{page.fileName || label}</p>
      <p className="mt-1 text-xs text-slate-500">
        {kindLabel(page)} — preview not available in the browser. Download to open.
      </p>
      <button
        type="button"
        onClick={() => downloadPage(page, docTitle, label)}
        className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
      >
        Download {kindLabel(page)}
      </button>
    </div>
  );
};

const PendingFileRow = ({ file, index, onRemove, originalSize, compressed }) => {
  const [previewUrl, setPreviewUrl] = useState(null);
  const kind = fileKindFromFile(file);

  useEffect(() => {
    if (kind !== 'image' && kind !== 'pdf' && kind !== 'video') {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, kind]);

  const pendingIcon =
    kind === 'pdf'
      ? '📕'
      : kind === 'excel'
        ? '📊'
        : kind === 'csv'
          ? '📄'
          : kind === 'video'
            ? '🎬'
            : '📎';

  return (
    <li className="flex items-start gap-2 px-2 py-1.5 text-xs border-b border-slate-100 last:border-0">
      <div className="shrink-0 w-14">
        {kind === 'image' && previewUrl ? (
          <img src={previewUrl} alt="" className="h-12 w-14 rounded border border-slate-200 object-cover bg-white" />
        ) : kind === 'video' && previewUrl ? (
          <video
            src={previewUrl}
            muted
            playsInline
            className="h-12 w-14 rounded border border-slate-200 object-cover bg-black"
          />
        ) : (
          <span className="flex h-12 w-14 items-center justify-center rounded border border-slate-200 bg-slate-50 text-lg">
            {pendingIcon}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-indigo-800">{pageLabel(index)}</p>
        <p className="truncate text-gray-800" title={file.name}>
          {file.name}
        </p>
        <p className="text-[10px] text-slate-500">
          {(file.size / 1024).toFixed(0)} KB
          {compressed && originalSize > file.size
            ? ` (was ${(originalSize / 1024 / 1024).toFixed(2)} MB, compressed)`
            : ''}{' '}
          · {kindLabel({ fileName: file.name, mimeType: file.type })}
          {kind === 'excel' || kind === 'csv' ? ' · opens after download' : ''}
          {kind === 'video' ? ' · preview in viewer' : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="shrink-0 text-red-600 hover:underline"
        aria-label={`Remove ${file.name}`}
      >
        Remove
      </button>
    </li>
  );
};

const DocumentViewModal = ({ doc, onClose }) => {
  const pages = useMemo(() => getDocPages(doc), [doc]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [doc?.id]);

  if (!pages.length) return null;

  const page = pages[activeIndex] || pages[0];
  const label = pageLabel(activeIndex);
  const kind = fileKind(page);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`View ${doc.title}`}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col min-h-0 rounded-xl bg-white shadow-2xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 sm:px-4 bg-slate-50">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-gray-900 truncate">{doc.title}</h3>
            <p className="text-[10px] sm:text-xs text-slate-500">
              {label} · {page.fileName || kindLabel(page)}
              {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ''}
              {pages.length > 1 ? ` · ${pages.length} pages` : ''}
            </p>
            {doc.remarks ? (
              <p className="text-[10px] text-slate-600 mt-0.5 line-clamp-2">{doc.remarks}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pages.length > 1 && (
              <div className="flex flex-wrap gap-1 max-w-[min(100%,320px)]">
                {pages.map((_, i) => (
                  <button
                    key={pages[i].id || i}
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                      activeIndex === i ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => downloadPage(page, doc.title, label)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Download
            </button>
            {pages.length > 1 && (
              <button
                type="button"
                onClick={() => pages.forEach((p, i) => downloadPage(p, doc.title, pageLabel(i)))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                Download all
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-100 p-2 sm:p-4 overflow-auto">
          <FilePreview page={page} docTitle={doc.title} label={label} />
        </div>
      </div>
    </div>
  );
};

const ERMPatientDocuments = ({ patientLabel, patientPk, globalTitleSearch = '' }) => {
  const dispatch = useDispatch();
  const pk = patientPk != null && patientPk !== '' ? String(patientPk) : '';
  const titleSearchTerm = String(globalTitleSearch ?? '').trim();
  /** Cross-patient title search only when no patient is selected. */
  const globalSearch = Boolean(titleSearchTerm) && !pk;
  const docPatientId = (doc) => {
    const fromDoc = doc?.patient != null && doc?.patient !== '' ? String(doc.patient) : '';
    return fromDoc || pk;
  };
  const storeError = useSelector(selectErmLastError);
  const fileInputRef = useRef(null);
  const pendingEntriesRef = useRef([]);

  const [apiDocuments, setApiDocuments] = useState([]);
  const [docPagination, setDocPagination] = useState({
    count: 0,
    total_pages: 1,
    current_page: 1,
    next: null,
    previous: null,
  });
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [docName, setDocName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [pendingEntries, setPendingEntries] = useState([]);
  const [saving, setSaving] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [uploadStatusMessage, setUploadStatusMessage] = useState('');
  const [localError, setLocalError] = useState('');
  const [uploadErrorModal, setUploadErrorModal] = useState({ open: false, message: '' });
  const [viewDoc, setViewDoc] = useState(null);
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState(null);
  const [editDoc, setEditDoc] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editEntries, setEditEntries] = useState([]);
  const [editStatusMessage, setEditStatusMessage] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [compressingEdit, setCompressingEdit] = useState(false);
  const editFileInputRef = useRef(null);
  const editEntriesRef = useRef([]);

  const loadApiDocuments = useCallback(
    async (opts = 1) => {
      if (!globalSearch && !pk) return;
      const page = typeof opts === 'number' ? opts : opts?.page ?? 1;
      const pageUrl = typeof opts === 'object' && opts?.url ? opts.url : undefined;
      const titleFilter = globalSearch ? titleSearchTerm : '';
      setLoadingDocs(true);
      setLocalError('');
      dispatch(setErmError(null));
      try {
        const data = await fetchPatientDocuments(globalSearch ? null : pk, {
          page,
          pageSize: PATIENT_DOCUMENTS_PAGE_SIZE,
          url: pageUrl,
          titleSearch: titleFilter,
        });
        setApiDocuments(data.results);
        setDocPagination({
          count: data.count,
          total_pages: data.total_pages,
          current_page: data.current_page,
          next: data.next,
          previous: data.previous,
        });
      } catch (e) {
        setApiDocuments([]);
        setDocPagination({
          count: 0,
          total_pages: 1,
          current_page: 1,
          next: null,
          previous: null,
        });
        const msg =
          e?.response?.data?.detail ||
          e?.response?.data?.message ||
          e?.message ||
          'Could not load patient documents.';
        setLocalError(msg);
        dispatch(setErmError(msg));
      } finally {
        setLoadingDocs(false);
      }
    },
    [pk, dispatch, globalSearch, globalTitleSearch]
  );

  useEffect(() => {
    setShowUpload(false);
    setDocName('');
    setRemarks('');
    setPendingEntries([]);
    setLocalError('');
    setUploadErrorModal({ open: false, message: '' });
    setCompressing(false);
    setUploadStatusMessage('');
    setViewDoc(null);
    setPendingDeleteDoc(null);
    setDeletingDocId(null);
    setEditDoc(null);
    setEditTitle('');
    setEditRemarks('');
    setEditEntries([]);
    setEditStatusMessage('');
    editEntriesRef.current = [];
    setApiDocuments([]);
    setDocPagination({
      count: 0,
      total_pages: 1,
      current_page: 1,
      next: null,
      previous: null,
    });
  }, [pk]);

  useEffect(() => {
    if (!globalSearch && !pk) return;
    loadApiDocuments(1);
  }, [pk, globalSearch, globalTitleSearch, loadApiDocuments]);

  useEffect(() => {
    if (!pendingDeleteDoc) return undefined;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape' && !deletingDocId) setPendingDeleteDoc(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [pendingDeleteDoc, deletingDocId]);

  useEffect(() => {
    if (!editDoc) return undefined;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape' && !savingEdit && !compressingEdit) closeEditModal();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [editDoc, savingEdit, compressingEdit]);

  const closeEditModal = useCallback(() => {
    if (savingEdit || compressingEdit) return;
    setEditDoc(null);
    setEditTitle('');
    setEditRemarks('');
    setEditEntries([]);
    setEditStatusMessage('');
    editEntriesRef.current = [];
  }, [savingEdit, compressingEdit]);

  const openEditModal = (doc) => {
    if (!doc?.id) return;
    setViewDoc(null);
    setPendingDeleteDoc(null);
    setEditDoc(doc);
    setEditTitle(doc.title || '');
    setEditRemarks(doc.remarks || '');
    setEditEntries([]);
    setEditStatusMessage('');
    editEntriesRef.current = [];
  };

  useEffect(() => {
    editEntriesRef.current = editEntries;
  }, [editEntries]);

  const addEditFiles = async (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    setCompressingEdit(true);
    setEditStatusMessage('Compressing selected files…');

    const errors = [];
    let nextEntries = [...editEntriesRef.current];

    for (let i = 0; i < incoming.length; i += 1) {
      const raw = incoming[i];
      if (nextEntries.length >= MAX_PAGES_PER_DOC) {
        errors.push(`Maximum ${MAX_PAGES_PER_DOC} files per document.`);
        break;
      }

      const pickErr = validatePick(raw, pageLabel(nextEntries.length));
      if (pickErr) {
        errors.push(pickErr);
        continue;
      }

      try {
        const usedBytes = totalFileBytes(nextEntries.map((e) => e.file));
        const remainingBytes = Math.max(150_000, MAX_UPLOAD_BYTES - usedBytes);
        const isVideo = isCompressibleVideo(raw);
        const isPdf = isCompressiblePdf(raw);
        const isSheet = isCompressibleSpreadsheet(raw);
        if (isVideo) {
          setEditStatusMessage(`Compressing video "${raw.name}"… this may take a minute.`);
        } else if (isPdf) {
          setEditStatusMessage(`Optimizing PDF "${raw.name}"…`);
        } else if (isSheet) {
          setEditStatusMessage(`Optimizing spreadsheet "${raw.name}"…`);
        }
        const result = await compressFileForUpload(raw, {
          quick: !isVideo,
          maxDimension: 1920,
          maxBytes: remainingBytes,
          maxWidth: 960,
          videoBitsPerSecond: 700_000,
        });

        const entry = {
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
          file: result.file,
          originalSize: result.originalSize,
          compressed: result.compressed,
        };

        const dup = nextEntries.some(
          (e) => e.file.name === entry.file.name && e.file.size === entry.file.size
        );
        if (dup) continue;

        const trialFiles = [...nextEntries.map((e) => e.file), entry.file];
        const sizeErr = validateCombinedUploadSize(trialFiles, { fileName: entry.file.name });
        if (sizeErr) {
          errors.push(sizeErr);
          continue;
        }

        nextEntries = [...nextEntries, entry];
        editEntriesRef.current = nextEntries;
        setEditEntries(nextEntries);
      } catch {
        errors.push(`Could not process "${raw.name}".`);
      }
    }

    setCompressingEdit(false);
    const anyCompressed = nextEntries.some((e) => e.compressed);
    setEditStatusMessage(
      anyCompressed ? 'Files compressed for upload — quality may be lower than originals.' : ''
    );
    if (errors.length) showUploadError(errors[0]);
  };

  const removeEditFile = (index) => {
    setEditEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const editFiles = useMemo(() => editEntries.map((e) => e.file), [editEntries]);

  const handleSaveEdit = async () => {
    const patientId = docPatientId(editDoc);
    if (!patientId || !editDoc?.id) return;
    const title = editTitle.trim();
    if (!title) {
      showUploadError('Enter a document title.');
      return;
    }
    if (editFiles.length) {
      for (let i = 0; i < editFiles.length; i += 1) {
        const err = validatePick(editFiles[i], pageLabel(i));
        if (err) {
          showUploadError(err);
          return;
        }
      }
      const sizeErr = validateCombinedUploadSize(editFiles, { title: editTitle, remarks: editRemarks });
      if (sizeErr) {
        showUploadError(sizeErr);
        return;
      }
    }

    setSavingEdit(true);
    setLocalError('');
    dispatch(setErmError(null));
    try {
      await updatePatientDocument(patientId, editDoc.id, {
        title,
        remarks: editRemarks.trim(),
        files: editFiles.length ? editFiles : undefined,
      });
      closeEditModal();
      closeUploadErrorModal();
      await loadApiDocuments(docPagination.current_page);
      if (viewDoc?.id === editDoc.id) setViewDoc(null);
    } catch (e) {
      const msg = formatPatientDocumentUploadError(e?.cause || e);
      showUploadError(msg);
      dispatch(setErmError(msg));
    } finally {
      setSavingEdit(false);
    }
  };

  const resetUploadForm = useCallback(() => {
    setDocName('');
    setRemarks('');
    setPendingEntries([]);
    setLocalError('');
    setUploadStatusMessage('');
    setCompressing(false);
  }, []);

  const showUploadError = useCallback((message) => {
    setUploadErrorModal({
      open: true,
      message: message || 'Could not upload document.',
    });
  }, []);

  const closeUploadErrorModal = useCallback(() => {
    setUploadErrorModal({ open: false, message: '' });
  }, []);

  const validatePick = (file, label) => {
    if (!isAllowedFile(file)) {
      return `${label}: use ${UPLOAD_TYPE_HINT}.`;
    }
    return '';
  };

  const addPendingFiles = async (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    setCompressing(true);
    setUploadStatusMessage('Compressing selected files…');
    setLocalError('');

    const errors = [];
    let nextEntries = [...pendingEntriesRef.current];

    for (let i = 0; i < incoming.length; i += 1) {
      const raw = incoming[i];
      if (nextEntries.length >= MAX_PAGES_PER_DOC) {
        errors.push(`Maximum ${MAX_PAGES_PER_DOC} files per document.`);
        break;
      }

      const pickErr = validatePick(raw, pageLabel(nextEntries.length));
      if (pickErr) {
        errors.push(pickErr);
        continue;
      }

      try {
        const usedBytes = totalFileBytes(nextEntries.map((e) => e.file));
        const remainingBytes = Math.max(150_000, MAX_UPLOAD_BYTES - usedBytes);
        const isVideo = isCompressibleVideo(raw);
        const isPdf = isCompressiblePdf(raw);
        const isSheet = isCompressibleSpreadsheet(raw);
        if (isVideo) {
          setUploadStatusMessage(
            `Compressing video "${raw.name}"… this may take a minute.`
          );
        } else if (isPdf) {
          setUploadStatusMessage(`Optimizing PDF "${raw.name}"…`);
        } else if (isSheet) {
          setUploadStatusMessage(`Optimizing spreadsheet "${raw.name}"…`);
        }
        const result = await compressFileForUpload(raw, {
          quick: !isVideo,
          maxDimension: 1920,
          maxBytes: remainingBytes,
          maxWidth: 960,
          videoBitsPerSecond: 700_000,
        });

        const entry = {
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
          file: result.file,
          originalSize: result.originalSize,
          compressed: result.compressed,
        };

        const dup = nextEntries.some(
          (e) => e.file.name === entry.file.name && e.file.size === entry.file.size
        );
        if (dup) continue;

        const trialFiles = [...nextEntries.map((e) => e.file), entry.file];
        const sizeErr = validateCombinedUploadSize(trialFiles, { fileName: entry.file.name });
        if (sizeErr) {
          errors.push(sizeErr);
          continue;
        }

        nextEntries = [...nextEntries, entry];
        pendingEntriesRef.current = nextEntries;
        setPendingEntries(nextEntries);
      } catch {
        errors.push(`Could not process "${raw.name}".`);
      }
    }

    setCompressing(false);
    const anyCompressed = nextEntries.some((e) => e.compressed);
    setUploadStatusMessage(
      anyCompressed
        ? 'Files compressed for upload — quality may be lower than originals.'
        : ''
    );
    if (errors.length) setLocalError(errors[0]);
    else if (!nextEntries.length && incoming.length) setLocalError('');
    else setLocalError('');
  };

  const removePendingFile = (index) => {
    setPendingEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const pendingFiles = useMemo(
    () => pendingEntries.map((e) => e.file),
    [pendingEntries]
  );

  useEffect(() => {
    pendingEntriesRef.current = pendingEntries;
  }, [pendingEntries]);

  const handleSaveUpload = async () => {
    if (!pk) return;
    const title = docName.trim();
    if (!title) {
      showUploadError('Enter a name for this document (e.g. Lab report, Insurance policy).');
      return;
    }
    if (!pendingFiles.length) {
      showUploadError('Add at least one file (page).');
      return;
    }
    for (let i = 0; i < pendingFiles.length; i += 1) {
      const err = validatePick(pendingFiles[i], pageLabel(i));
      if (err) {
        showUploadError(err);
        return;
      }
    }
    const sizeErr = validateCombinedUploadSize(pendingFiles, { title: docName, remarks });
    if (sizeErr) {
      showUploadError(sizeErr);
      return;
    }

    setLocalError('');
    dispatch(setErmError(null));
    setSaving(true);
    const anyCompressed = pendingEntries.some((e) => e.compressed);
    setUploadStatusMessage(
      anyCompressed
        ? 'Uploading compressed files — quality may be lower than the originals.'
        : 'Uploading document…'
    );

    try {
      await createPatientDocument(pk, {
        title,
        remarks: remarks.trim(),
        files: pendingFiles,
      });
      closeUploadErrorModal();
      resetUploadForm();
      setShowUpload(false);
      await loadApiDocuments(1);
    } catch (e) {
      const msg =
        e?.message?.includes('compress') || e?.message?.includes('Could not')
          ? e.message
          : formatPatientDocumentUploadError(e?.cause || e);
      showUploadError(msg);
      dispatch(setErmError(msg));
    } finally {
      setSaving(false);
      setUploadStatusMessage('');
    }
  };

  const requestDelete = (doc) => {
    if (!docPatientId(doc) || doc?.id == null || doc?.id === '') return;
    setViewDoc(null);
    setPendingDeleteDoc({ ...doc, id: doc.id });
  };

  const cancelDelete = useCallback(() => {
    if (deletingDocId) return;
    setPendingDeleteDoc(null);
  }, [deletingDocId]);

  const confirmDelete = useCallback(async () => {
    const doc = pendingDeleteDoc;
    const patientId = docPatientId(doc);
    if (!patientId || doc?.id == null || doc?.id === '' || deletingDocId) return;

    const docId = String(doc.id);
    setDeletingDocId(docId);
    setLocalError('');
    dispatch(setErmError(null));

    try {
      await deletePatientDocumentFromApi(patientId, doc.id);
      setPendingDeleteDoc(null);
      if (viewDoc?.id === doc.id) setViewDoc(null);
      await loadApiDocuments(docPagination.current_page);
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        'Could not delete document.';
      setLocalError(msg);
      dispatch(setErmError(msg));
    } finally {
      setDeletingDocId(null);
    }
  }, [pendingDeleteDoc, pk, deletingDocId, dispatch, loadApiDocuments, docPagination.current_page, viewDoc?.id]);

  const sortedDocs = useMemo(
    () =>
      [...apiDocuments].sort(
        (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
      ),
    [apiDocuments]
  );

  const displayError = localError || storeError;

  return (
    <section className="rounded-md border border-gray-200 bg-white px-2 py-2 shadow-sm space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-gray-900">
            {globalSearch ? 'Document search results' : 'Patient documents'}
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">
            {globalSearch ? (
              <>
                All patients · title contains &quot;{globalTitleSearch}&quot;
                {docPagination.count > 0 ? ` · ${docPagination.count}` : ''}
              </>
            ) : (
              <>
                Documents for <span className="font-semibold text-indigo-800">{patientLabel}</span>
                {docPagination.count > 0 ? ` · ${docPagination.count}` : ''}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loadingDocs}
            onClick={() => loadApiDocuments(docPagination.current_page)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingDocs ? 'Loading…' : 'Refresh'}
          </button>
          {!showUpload && pk && (
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              + Upload document
            </button>
          )}
        </div>
      </div>

      {globalSearch && !pk ? (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
          Select a patient to upload new documents. You can view, download, edit, and delete from search
          results below.
        </p>
      ) : null}

      {displayError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-md px-2 py-1.5">
          {displayError}
        </p>
      )}

      {showUpload && (
        <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-gray-900">New document</h3>
            <button
              type="button"
              onClick={() => {
                resetUploadForm();
                setShowUpload(false);
              }}
              className="text-xs text-gray-600 hover:underline"
            >
              Cancel
            </button>
          </div>

          <label className="block text-xs">
            <span className="font-semibold text-gray-800">Title</span>
            <span className="text-red-600"> *</span>
            <input
              type="text"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. Blood Test Report, Insurance policy"
              className="mt-0.5 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>

          <label className="block text-xs">
            <span className="font-semibold text-gray-800">Remarks</span>
            <span className="text-slate-500"> (optional)</span>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Annual checkup results"
              className="mt-0.5 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>

          <p className="text-[10px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1">
            All selected files upload as one document on the server. Images, videos, PDF, and Excel/CSV are
            optimized when you add them (videos may take longer). Max {MAX_UPLOAD_MB} MB total per upload (all
            files combined).
          </p>

          {(compressing || uploadStatusMessage) && (
            <p className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              {uploadStatusMessage ||
                'Compressing files for upload — images and videos will be reduced in quality.'}
            </p>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-800">
                File(s) <span className="text-red-600">*</span>
              </span>
              <span className="text-[10px] text-slate-500">
                Images, videos, PDF, Excel, CSV — max {MAX_UPLOAD_MB} MB total per upload, up to{' '}
                {MAX_PAGES_PER_DOC} files
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT_UPLOAD}
              className="hidden"
              onChange={(e) => {
                void addPendingFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={compressing || saving}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md border border-indigo-300 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
              >
                + Add files
              </button>
              {pendingFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPendingEntries([]);
                    setUploadStatusMessage('');
                  }}
                  className="text-xs text-slate-600 hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
            {pendingFiles.length > 0 ? (
              <>
                <ul className="mt-1.5 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white">
                  {pendingEntries.map((entry, i) => (
                    <PendingFileRow
                      key={entry.id}
                      file={entry.file}
                      index={i}
                      originalSize={entry.originalSize}
                      compressed={entry.compressed}
                      onRemove={removePendingFile}
                    />
                  ))}
                </ul>
                <p
                  className={`mt-1 text-[10px] ${
                    totalFileBytes(pendingFiles) > MAX_UPLOAD_BYTES ? 'text-red-700 font-semibold' : 'text-slate-500'
                  }`}
                >
                  Selected: {(totalFileBytes(pendingFiles) / 1024 / 1024).toFixed(2)} / {MAX_UPLOAD_MB} MB total
                </p>
              </>
            ) : (
              <p className="mt-1 text-[10px] text-slate-500">No files yet — add one or more pages.</p>
            )}
          </div>

          <button
            type="button"
            disabled={compressing || saving || !pendingFiles.length}
            onClick={handleSaveUpload}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {compressing
              ? 'Compressing…'
              : saving
                ? 'Uploading…'
                : `Upload document (${pendingFiles.length} file${pendingFiles.length !== 1 ? 's' : ''})`}
          </button>
        </div>
      )}

      {loadingDocs && sortedDocs.length === 0 ? (
        <p className="text-[11px] text-gray-500 rounded-md border border-dashed border-gray-200 bg-gray-50 px-2 py-4 text-center">
          Loading documents…
        </p>
      ) : sortedDocs.length === 0 ? (
        <p className="text-[11px] text-gray-500 rounded-md border border-dashed border-gray-200 bg-gray-50 px-2 py-4 text-center">
          {globalSearch
            ? 'No documents match this title.'
            : 'No documents for this patient yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {sortedDocs.map((doc) => {
            const pages = getDocPages(doc);
            const thumb =
              pages.find((p) => fileKind(p) === 'image') ||
              pages.find((p) => fileKind(p) === 'video');
            return (
              <li
                key={doc.id}
                className="rounded-md border border-gray-200 bg-gray-50/50 p-2 flex flex-wrap gap-2 justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-gray-900">{doc.title}</p>
                  {globalSearch && doc.patient != null && doc.patient !== '' ? (
                    <p className="text-[11px] font-medium text-indigo-800 mt-0.5">
                      Patient ID: {doc.patient}
                    </p>
                  ) : null}
                  {doc.remarks ? (
                    <p className="text-[11px] text-slate-600 mt-0.5">{doc.remarks}</p>
                  ) : null}
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {doc.uploadedByName ? (
                      <span>
                        Uploaded by <span className="font-medium text-slate-700">{doc.uploadedByName}</span>
                        {' · '}
                      </span>
                    ) : null}
                    {formatWhen(doc.createdAt)}
                    {pages[0] ? ` · ${kindLabel(pages[0])}` : ''}
                  </p>
                  <div className="relative z-10 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {pages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setViewDoc(doc)}
                        className="text-xs font-semibold text-indigo-700 hover:underline"
                      >
                        View large
                      </button>
                    )}
                    {pages.length === 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => downloadPage(pages[0], doc.title, pageLabel(0))}
                          className="text-xs font-medium text-slate-700 hover:underline"
                        >
                          Download
                        </button>
                        {String(pages[0].dataUrl || '').startsWith('http') && (
                          <a
                            href={pages[0].dataUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-slate-700 hover:underline"
                          >
                            Open file
                          </a>
                        )}
                      </>
                    )}
                    {pages.length > 1 && (
                      <button
                        type="button"
                        onClick={() => pages.forEach((p, i) => downloadPage(p, doc.title, pageLabel(i)))}
                        className="text-xs font-medium text-slate-700 hover:underline"
                      >
                        Download all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditModal(doc)}
                      className="relative z-20 rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deletingDocId === String(doc.id)}
                      onClick={() => requestDelete(doc)}
                      className="relative z-20 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                    >
                      {deletingDocId === String(doc.id) ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 items-center">
                  {thumb ? (
                    fileKind(thumb) === 'video' ? (
                      <video
                        src={thumb.dataUrl}
                        muted
                        playsInline
                        className="h-12 w-16 rounded border border-slate-200 object-cover bg-black"
                      />
                    ) : (
                      <img
                        src={thumb.dataUrl}
                        alt=""
                        className="h-12 w-16 rounded border border-slate-200 object-cover bg-white"
                        referrerPolicy="no-referrer"
                      />
                    )
                  ) : pages[0] ? (
                    <span className="h-12 w-16 rounded border border-slate-200 bg-white flex items-center justify-center text-lg">
                      {fileKind(pages[0]) === 'excel'
                        ? '📊'
                        : fileKind(pages[0]) === 'pdf'
                          ? '📕'
                          : fileKind(pages[0]) === 'video'
                            ? '🎬'
                            : '📄'}
                    </span>
                  ) : null}
                  {pages.length > 1 && (
                    <span className="text-[10px] font-semibold text-slate-500">+{pages.length - 1}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {docPagination.count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 pt-2 mt-1 border-t border-slate-200">
          <span>
            Page {docPagination.current_page} of {docPagination.total_pages} ({docPagination.count} total)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!docPagination.previous || loadingDocs}
              onClick={() => {
                const url = resolveCareApiPageUrl(docPagination.previous);
                if (url) loadApiDocuments({ url });
                else loadApiDocuments(Math.max(1, docPagination.current_page - 1));
              }}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!docPagination.next || loadingDocs}
              onClick={() => {
                const url = resolveCareApiPageUrl(docPagination.next);
                if (url) loadApiDocuments({ url });
                else loadApiDocuments(docPagination.current_page + 1);
              }}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {pendingDeleteDoc &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-99999 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="emr-delete-doc-title"
            onClick={cancelDelete}
          >
            <div
              className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-gray-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 id="emr-delete-doc-title" className="text-sm font-bold text-gray-900">
                  Remove document?
                </h3>
              </div>
              <div className="px-4 py-3">
                <p className="text-sm text-gray-700">
                  Remove{' '}
                  <span className="font-semibold text-gray-900">
                    &quot;{pendingDeleteDoc.title}&quot;
                  </span>{' '}
                  from this patient?
                </p>
                <p className="text-xs text-red-600 mt-2">This action cannot be undone.</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2 px-4 py-3 bg-gray-50 border-t border-gray-100">
                <button
                  type="button"
                  disabled={Boolean(deletingDocId)}
                  onClick={cancelDelete}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={Boolean(deletingDocId)}
                  onClick={confirmDelete}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                >
                  {deletingDocId ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {editDoc &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-99999 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="emr-edit-doc-title"
            onClick={closeEditModal}
          >
            <div
              className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 id="emr-edit-doc-title" className="text-sm font-bold text-gray-900">
                  Edit document
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{editDoc.title}</p>
              </div>
              <div className="px-4 py-3 space-y-3">
                <label className="block text-xs">
                  <span className="font-semibold text-gray-800">Title</span>
                  <span className="text-red-600"> *</span>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="mt-0.5 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
                <label className="block text-xs">
                  <span className="font-semibold text-gray-800">Remarks</span>
                  <input
                    type="text"
                    value={editRemarks}
                    onChange={(e) => setEditRemarks(e.target.value)}
                    placeholder="Optional"
                    className="mt-0.5 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-800">
                      Add / replace files
                      <span className="text-slate-500 font-normal"> (optional)</span>
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Max {MAX_UPLOAD_MB} MB combined · up to {MAX_PAGES_PER_DOC} files
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Leave empty to keep existing files. New files are compressed before upload.
                  </p>
                  {(compressingEdit || editStatusMessage) && (
                    <p className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                      {editStatusMessage || 'Compressing files…'}
                    </p>
                  )}
                  <input
                    ref={editFileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPT_UPLOAD}
                    className="hidden"
                    disabled={compressingEdit || savingEdit}
                    onChange={(e) => {
                      void addEditFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={compressingEdit || savingEdit}
                      onClick={() => editFileInputRef.current?.click()}
                      className="rounded-md border border-indigo-300 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      + Add files
                    </button>
                    {editFiles.length > 0 && (
                      <button
                        type="button"
                        disabled={compressingEdit || savingEdit}
                        onClick={() => {
                          setEditEntries([]);
                          setEditStatusMessage('');
                          editEntriesRef.current = [];
                        }}
                        className="text-xs text-slate-600 hover:underline"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  {editFiles.length > 0 ? (
                    <>
                      <ul className="mt-1.5 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white">
                        {editEntries.map((entry, i) => (
                          <PendingFileRow
                            key={entry.id}
                            file={entry.file}
                            index={i}
                            originalSize={entry.originalSize}
                            compressed={entry.compressed}
                            onRemove={removeEditFile}
                          />
                        ))}
                      </ul>
                      <p
                        className={`mt-1 text-[10px] ${
                          totalFileBytes(editFiles) > MAX_UPLOAD_BYTES
                            ? 'text-red-700 font-semibold'
                            : 'text-slate-500'
                        }`}
                      >
                        Selected: {(totalFileBytes(editFiles) / 1024 / 1024).toFixed(2)} / {MAX_UPLOAD_MB}{' '}
                        MB total
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-[10px] text-slate-500">No new files — existing document files unchanged.</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2 px-4 py-3 bg-gray-50 border-t border-gray-100">
                <button
                  type="button"
                  disabled={savingEdit || compressingEdit}
                  onClick={closeEditModal}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingEdit || compressingEdit}
                  onClick={() => {
                    void handleSaveEdit();
                  }}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  {savingEdit ? 'Saving…' : compressingEdit ? 'Compressing…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <AlertModal
        open={uploadErrorModal.open}
        type="error"
        title={editDoc ? 'Update failed' : 'Upload failed'}
        message={uploadErrorModal.message}
        onClose={closeUploadErrorModal}
      />

      {viewDoc && <DocumentViewModal doc={viewDoc} onClose={() => setViewDoc(null)} />}
    </section>
  );
};

export default ERMPatientDocuments;
