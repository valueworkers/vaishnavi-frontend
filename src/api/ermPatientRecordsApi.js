import axios from 'axios';
import { ERM_PATIENT_RECORDS_LOCAL_KEY } from '../constants/ermStorage';

/**
 * ERM patient-record API (Django / care backend).
 *
 * Expected routes (Bearer auth, same as /booking/patients/):
 *   GET    {VITE_BASEURL_CARE}/erm/patients/{patientPk}/records/
 *   POST   {VITE_BASEURL_CARE}/erm/patients/{patientPk}/records/
 *   PATCH  {VITE_BASEURL_CARE}/erm/patients/{patientPk}/records/{recordId}/
 *
 * GET/POST body shape (POST):
 *   { title: string, category?: string, template_id?: string, fields?: array, note?: string, field_values?: object }
 *
 * PATCH body:
 *   { field_values: { [fieldId: string]: string } }
 *
 * Record object (minimum):
 *   { id, patient, title, category, template_id, fields, field_values, note, created_at, updated_at }
 *
 * Set VITE_ERM_RECORDS_MODE=api when the backend routes are implemented.
 * Default is local (browser) so the dashboard works before /erm/ exists.
 */

const getBase = () => String(import.meta.env.VITE_BASEURL_CARE || '').replace(/\/$/, '');

/** Resolve relative or absolute pagination URLs from the care API. */
export const resolveCareApiPageUrl = (href) => {
  const base = getBase();
  if (href == null || href === '') return null;
  const raw = String(href).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!base) return raw;
  return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`;
};

const buildPatientDocumentsPageUrl = (patientId, page, pageSize, titleSearch) => {
  const base = getBase();
  const built = new URL(`${base}/booking/patients-documents/`);
  const id = String(patientId ?? '').trim();
  if (id) built.searchParams.set('patient', id);
  built.searchParams.set('page', String(page));
  built.searchParams.set('page_size', String(pageSize));
  const title = String(titleSearch ?? '').trim();
  if (title) built.searchParams.set('title__icontains', title);
  return built.toString();
};

/** Keep optional patient + title filter on API pagination links. */
const normalizePatientDocumentsPageUrl = (pageUrl, patientId, titleSearch) => {
  const resolved = resolveCareApiPageUrl(pageUrl);
  if (!resolved) return null;
  try {
    const u = new URL(resolved);
    const id = String(patientId ?? '').trim();
    if (id) u.searchParams.set('patient', id);
    else u.searchParams.delete('patient');
    const title = String(titleSearch ?? '').trim();
    if (title) u.searchParams.set('title__icontains', title);
    else u.searchParams.delete('title__icontains');
    return u.toString();
  } catch {
    return resolved;
  }
};

const resolvePatientDocumentsPagination = (data, { page, pageSize, patientId, titleSearch }) => {
  const results = normalizeList(data);
  const pageSizeNum = Number(pageSize) || PATIENT_DOCUMENTS_PAGE_SIZE;
  const count = Number(data?.count ?? results.length) || 0;
  const current_page = Math.max(1, Number(data?.current_page ?? page) || 1);
  const apiTotalPages = Number(data?.total_pages);
  const total_pages =
    apiTotalPages > 0 ? apiTotalPages : Math.max(1, Math.ceil(count / pageSizeNum) || 1);

  const title = String(titleSearch ?? '').trim();
  let next = normalizePatientDocumentsPageUrl(data?.next, patientId, title);
  let previous = normalizePatientDocumentsPageUrl(data?.previous, patientId, title);

  if (!next && current_page < total_pages) {
    next = buildPatientDocumentsPageUrl(patientId, current_page + 1, pageSizeNum, title);
  }
  if (!previous && current_page > 1) {
    previous = buildPatientDocumentsPageUrl(patientId, current_page - 1, pageSizeNum, title);
  }
  if (current_page <= 1) previous = null;
  if (current_page >= total_pages) next = null;

  return { count, total_pages, current_page, next, previous };
};

const getToken = () => localStorage.getItem('access_token');

const authHeaders = () => {
  const token = getToken();
  if (!token) throw new Error('Authorization token missing. Please log in again.');
  return { Authorization: `Bearer ${token}` };
};

const recordsMode = () => {
  const m = String(import.meta.env.VITE_ERM_RECORDS_MODE || '').toLowerCase().trim();
  if (m === 'api') return 'api';
  if (m === 'local') return 'local';
  return 'local';
};

const recordsUrl = (patientPk) => `${getBase()}/erm/patients/${patientPk}/records/`;

const readLocalMap = () => {
  try {
    const raw = localStorage.getItem(ERM_PATIENT_RECORDS_LOCAL_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
};

const writeLocalMap = (map) => {
  localStorage.setItem(ERM_PATIENT_RECORDS_LOCAL_KEY, JSON.stringify(map));
};

const genLocalId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const normalizeList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};

export const PATIENT_SEARCH_PAGE_SIZE = 25;

export async function searchPatients({
  search = '',
  pageSize = PATIENT_SEARCH_PAGE_SIZE,
  page = 1,
  url: pageUrl,
} = {}) {
  const base = getBase();
  const empty = {
    results: [],
    count: 0,
    next: null,
    previous: null,
    current_page: 1,
    total_pages: 1,
  };
  if (!base) return empty;

  const q = String(search || '').trim();
  let requestUrl = String(pageUrl || '').trim();
  if (!requestUrl) {
    const built = new URL(`${base}/booking/patients/`);
    if (q) {
      built.searchParams.set('search', q);
    } else {
      built.searchParams.set('page_size', String(pageSize));
      built.searchParams.set('page', String(page));
    }
    requestUrl = built.toString();
  }

  const res = await axios.get(requestUrl, { headers: authHeaders() });
  const data = res.data || {};
  const results = normalizeList(data);
  const count = Number(data.count ?? results.length) || 0;
  const pageSizeNum = Number(pageSize) || PATIENT_SEARCH_PAGE_SIZE;
  const current_page = Math.max(1, Number(data.current_page ?? page) || 1);
  const total_pages =
    Number(data.total_pages) > 0
      ? Number(data.total_pages)
      : Math.max(1, Math.ceil(count / pageSizeNum) || 1);

  let next = resolveCareApiPageUrl(data.next);
  if (!next && !q && current_page < total_pages) {
    const built = new URL(`${base}/booking/patients/`);
    built.searchParams.set('page_size', String(pageSizeNum));
    built.searchParams.set('page', String(current_page + 1));
    next = built.toString();
  }
  if (current_page >= total_pages) next = null;

  return {
    results,
    count,
    next,
    previous: resolveCareApiPageUrl(data.previous),
    current_page,
    total_pages,
  };
}

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

const VIDEO_EXT_MIME = {
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

const mimeFromFileName = (fileName) => {
  const ext = String(fileName || '')
    .match(/\.([a-z0-9]+)$/i)?.[1]
    ?.toLowerCase();
  if (!ext) return '';
  if (ext === 'pdf') return 'application/pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif', 'avif'].includes(ext)) {
    return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  }
  if (VIDEO_EXT_MIME[ext]) return VIDEO_EXT_MIME[ext];
  if (ext === 'csv') return 'text/csv';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return '';
};

const fileUrlFromApiItem = (item) => {
  if (!item) return '';
  if (typeof item === 'string') return String(item).trim();
  return String(item.file || item.url || item.file_url || '').trim();
};

const pagesFromApiRow = (row) => {
  const rawFiles = row?.files;
  if (Array.isArray(rawFiles) && rawFiles.length > 0) {
    return rawFiles
      .map((item, index) => {
        const dataUrl = fileUrlFromApiItem(item);
        if (!dataUrl) return null;
        const fileName = fileNameFromUrl(dataUrl);
        return {
          id: `api-page-${row?.id}-${index}`,
          dataUrl,
          fileName,
          mimeType: mimeFromFileName(fileName),
        };
      })
      .filter(Boolean);
  }
  const fileUrl = String(row?.file || '').trim();
  if (!fileUrl) return [];
  const fileName = fileNameFromUrl(fileUrl);
  return [{ id: `api-page-${row?.id}`, dataUrl: fileUrl, fileName, mimeType: mimeFromFileName(fileName) }];
};

/** GET /booking/patients/{id}/documents/ — paginated patient file list. */
export function mapPatientDocumentFromApi(row) {
  const pages = pagesFromApiRow(row);
  const fileUrl = pages[0]?.dataUrl || String(row?.file || '').trim();
  return {
    source: 'api',
    id: row?.id,
    patient: row?.patient,
    title: String(row?.title || '').trim() || 'Document',
    fileUrl,
    uploadedBy: row?.uploaded_by,
    uploadedByName: String(row?.uploaded_by_name || '').trim(),
    remarks: String(row?.remarks || '').trim(),
    createdAt: row?.created_at,
    updatedAt: row?.updated_at,
    pages,
  };
}

export const PATIENT_DOCUMENTS_PAGE_SIZE = 10;

/** Max combined upload size per document request (files + form fields). */
export const PATIENT_DOCUMENT_MAX_UPLOAD_MB = 5;
export const PATIENT_DOCUMENT_MAX_UPLOAD_BYTES = PATIENT_DOCUMENT_MAX_UPLOAD_MB * 1024 * 1024;

/** Rough multipart size (file bytes + boundaries + title/remarks fields). */
export const estimateDocumentUploadBytes = (files, { title = '', remarks = '' } = {}) => {
  const list = Array.isArray(files) ? files : [];
  const fileBytes = list.reduce((sum, f) => sum + (f?.size || 0), 0);
  const fieldBytes = String(title).length + String(remarks).length;
  return fileBytes + fieldBytes + list.length * 600 + 1200;
};

export function formatPatientDocumentUploadError(error) {
  const status = error?.response?.status;
  if (status === 413) {
    return `Upload too large — maximum ${PATIENT_DOCUMENT_MAX_UPLOAD_MB} MB total per upload. Compress the file or remove attachments.`;
  }
  if (!error?.response && String(error?.message || '').toLowerCase() === 'network error') {
    return `Upload failed. Keep the total upload under ${PATIENT_DOCUMENT_MAX_UPLOAD_MB} MB or check your connection.`;
  }
  const data = error?.response?.data;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (data?.detail) return String(data.detail);
  if (data?.message) return String(data.message);
  if (error?.message) return error.message;
  return 'Could not upload document.';
}

export async function fetchPatientDocuments(
  patientPk,
  { page = 1, pageSize = PATIENT_DOCUMENTS_PAGE_SIZE, url: pageUrl, titleSearch } = {}
) {
  const base = getBase();
  if (!base) throw new Error('Set VITE_BASEURL_CARE to load patient documents.');
  const id = String(patientPk ?? '').trim();
  const title = String(titleSearch ?? '').trim();
  if (!id && !title && !String(pageUrl || '').trim()) {
    throw new Error('Patient or title search is required.');
  }

  let requestUrl = String(pageUrl || '').trim();
  if (!requestUrl) {
    requestUrl = buildPatientDocumentsPageUrl(
      id,
      page,
      pageSize || PATIENT_DOCUMENTS_PAGE_SIZE,
      title
    );
  } else {
    requestUrl = normalizePatientDocumentsPageUrl(pageUrl, id, title) || requestUrl;
  }

  const res = await axios.get(requestUrl, { headers: authHeaders() });
  const data = res.data || {};
  const results = normalizeList(data).map(mapPatientDocumentFromApi);
  const pagination = resolvePatientDocumentsPagination(data, {
    page,
    pageSize,
    patientId: id,
    titleSearch: title,
  });
  return { results, ...pagination };
}

/**
 * POST patient documents.
 *
 * Backend has changed: `patient` is now passed in multipart form-data (not in the URL path).
 *
 * New:
 *   POST {VITE_BASEURL_CARE}/booking/patients-documents/
 *   multipart: patient, title, remarks, files (repeat key per file)
 */
export async function createPatientDocument(patientPk, { title, remarks = '', files, file }) {
  const base = getBase();
  if (!base) throw new Error('Set VITE_BASEURL_CARE to upload patient documents.');
  const patientId = String(patientPk ?? '').trim();
  if (!patientId) throw new Error('Patient is required.');
  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) throw new Error('Document title is required.');

  const fileList = [];
  if (Array.isArray(files)) {
    for (const f of files) {
      if (f instanceof File) fileList.push(f);
    }
  } else if (file instanceof File) {
    fileList.push(file);
  }
  if (!fileList.length) throw new Error('At least one file is required.');

  const formData = new FormData();
  // Backend expects patient id in form-data.
  formData.append('patient', patientId);
  formData.append('title', trimmedTitle);
  const remarkText = String(remarks || '').trim();
  if (remarkText) formData.append('remarks', remarkText);
  for (const f of fileList) formData.append('files', f);

  const fileBytes = fileList.reduce((sum, f) => sum + (f?.size || 0), 0);
  if (fileBytes > PATIENT_DOCUMENT_MAX_UPLOAD_BYTES) {
    const err = new Error(formatPatientDocumentUploadError({ response: { status: 413 } }));
    err.code = 'UPLOAD_TOO_LARGE';
    throw err;
  }

  const urlNew = `${base}/booking/patients-documents/`;
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let res;
  try {
    res = await axios.post(urlNew, formData, { headers });
  } catch (error) {
    const wrapped = new Error(formatPatientDocumentUploadError(error));
    wrapped.cause = error;
    wrapped.response = error?.response;
    throw wrapped;
  }
  const row = res.data?.id != null ? res.data : res.data?.data ?? res.data;
  return mapPatientDocumentFromApi(row);
}

/** PATCH /booking/patients/{patient_id}/documents/{document_id}/ — multipart: title, remarks, files (optional) */
export async function updatePatientDocument(
  patientPk,
  documentId,
  { title, remarks, files, file } = {}
) {
  const base = getBase();
  if (!base) throw new Error('Set VITE_BASEURL_CARE to update patient documents.');
  const patientId = String(patientPk ?? '').trim();
  const docId = String(documentId ?? '').trim();
  if (!patientId || !docId) throw new Error('Patient and document are required.');

  const trimmedTitle = title !== undefined ? String(title || '').trim() : undefined;
  if (trimmedTitle !== undefined && !trimmedTitle) {
    throw new Error('Document title is required.');
  }

  const fileList = [];
  if (Array.isArray(files)) {
    for (const f of files) {
      if (f instanceof File) fileList.push(f);
    }
  } else if (file instanceof File) {
    fileList.push(file);
  }

  const formData = new FormData();
  if (trimmedTitle !== undefined) formData.append('title', trimmedTitle);
  if (remarks !== undefined) formData.append('remarks', String(remarks || '').trim());
  if (fileList.length) {
    const fileBytes = fileList.reduce((sum, f) => sum + (f?.size || 0), 0);
    if (fileBytes > PATIENT_DOCUMENT_MAX_UPLOAD_BYTES) {
      const err = new Error(formatPatientDocumentUploadError({ response: { status: 413 } }));
      err.code = 'UPLOAD_TOO_LARGE';
      throw err;
    }
    for (const f of fileList) formData.append('files', f);
  }

  const url = `${base}/booking/patients/${encodeURIComponent(patientId)}/documents/${encodeURIComponent(docId)}/`;
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let res;
  try {
    res = await axios.patch(url, formData, { headers });
  } catch (error) {
    const wrapped = new Error(formatPatientDocumentUploadError(error));
    wrapped.cause = error;
    wrapped.response = error?.response;
    throw wrapped;
  }
  const row = res.data?.id != null ? res.data : res.data?.data ?? res.data;
  return mapPatientDocumentFromApi(row);
}

/**
 * DELETE patient document.
 *
 * Backend changed:
 * - old: DELETE /booking/patients/{patient_id}/documents/{document_id}/
 * - new: DELETE /booking/patients-documents/{document_id}/
 *   and patient id is provided via query param `patient` (not in the path).
 */
export async function deletePatientDocumentFromApi(patientPk, documentId) {
  const base = getBase();
  if (!base) throw new Error('Set VITE_BASEURL_CARE to delete patient documents.');
  const patientId = String(patientPk ?? '').trim();
  const docId = String(documentId ?? '').trim();
  if (!patientId || !docId) throw new Error('Patient and document are required.');

  const urlNewBase = `${base}/booking/patients-documents/${encodeURIComponent(docId)}/`;
  const urlNew = `${urlNewBase}?patient=${encodeURIComponent(patientId)}`;
  const urlOld = `${base}/booking/patients/${encodeURIComponent(patientId)}/documents/${encodeURIComponent(docId)}/`;

  try {
    await axios.delete(urlNew, { headers: authHeaders() });
  } catch (error) {
    // fallback for older backend that still expects patient id in the URL
    await axios.delete(urlOld, { headers: authHeaders() });
  }
}

export function formatPatientLabel(p) {
  const first = String(p?.first_name ?? '').trim();
  const last = String(p?.last_name ?? '').trim();
  const name = [first, last].filter(Boolean).join(' ').trim() || String(p?.full_name || '').trim() || 'Patient';
  const pid = p?.patient_id ?? p?.id ?? '';
  return pid ? `${name} (ID: ${pid})` : name;
}

export async function listPatientErmRecords(patientPk) {
  if (recordsMode() === 'local') {
    const map = readLocalMap();
    const key = String(patientPk);
    return Array.isArray(map[key]) ? map[key] : [];
  }
  const res = await axios.get(recordsUrl(patientPk), { headers: authHeaders() });
  return normalizeList(res.data);
}

export async function createPatientErmRecord(patientPk, payload) {
  const body = {
    title: String(payload?.title || '').trim(),
    category: payload?.category || '',
    template_id: payload?.template_id || null,
    fields: Array.isArray(payload?.fields) ? payload.fields : [],
    field_values:
      payload?.field_values && typeof payload.field_values === 'object' ? payload.field_values : {},
    note: payload?.note != null ? String(payload.note) : '',
  };
  if (!body.title) throw new Error('Title is required.');

  if (recordsMode() === 'local') {
    const map = readLocalMap();
    const key = String(patientPk);
    const list = Array.isArray(map[key]) ? [...map[key]] : [];
    const row = {
      id: genLocalId(),
      patient: patientPk,
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.unshift(row);
    map[key] = list;
    writeLocalMap(map);
    return row;
  }

  const res = await axios.post(recordsUrl(patientPk), body, { headers: authHeaders() });
  return res.data;
}

export async function updatePatientErmRecord(patientPk, recordId, { field_values: fieldValues } = {}) {
  if (fieldValues == null || typeof fieldValues !== 'object') {
    throw new Error('field_values object is required.');
  }

  if (recordsMode() === 'local') {
    const map = readLocalMap();
    const key = String(patientPk);
    const list = Array.isArray(map[key]) ? map[key] : [];
    const next = list.map((r) => {
      if (String(r.id) !== String(recordId)) return r;
      return {
        ...r,
        field_values: { ...fieldValues },
        updated_at: new Date().toISOString(),
      };
    });
    if (!next.some((r) => String(r.id) === String(recordId))) {
      throw new Error('Record not found for this patient.');
    }
    map[key] = next;
    writeLocalMap(map);
    return next.find((r) => String(r.id) === String(recordId));
  }

  const res = await axios.patch(
    `${recordsUrl(patientPk)}${encodeURIComponent(recordId)}/`,
    { field_values: fieldValues },
    { headers: authHeaders() }
  );
  return res.data;
}

export async function deletePatientErmRecord(patientPk, recordId) {
  if (recordsMode() === 'local') {
    const map = readLocalMap();
    const key = String(patientPk);
    const list = Array.isArray(map[key]) ? map[key].filter((r) => String(r.id) !== String(recordId)) : [];
    map[key] = list;
    writeLocalMap(map);
    return;
  }
  await axios.delete(`${recordsUrl(patientPk)}${encodeURIComponent(recordId)}/`, { headers: authHeaders() });
}

export function ermRecordsStorageHint() {
  return recordsMode() === 'api'
    ? `Using API: ${getBase()}/erm/patients/{id}/records/`
    : `Using browser storage (${ERM_PATIENT_RECORDS_LOCAL_KEY}). Set VITE_ERM_RECORDS_MODE=api after the backend is ready.`;
}
