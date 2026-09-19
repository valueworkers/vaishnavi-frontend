import { createSlice } from '@reduxjs/toolkit';
import { ERM_PATIENT_DOCUMENTS_KEY, ERM_PATIENT_RECORDS_LOCAL_KEY } from '../../constants/ermStorage';

const genId = () => `erm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const patientKey = (patient) => String(patient?.id ?? patient?.pk ?? '');

const readPersistedDocuments = () => {
  try {
    const raw = localStorage.getItem(ERM_PATIENT_DOCUMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

/** One-time merge from legacy localStorage map used by ermPatientRecordsApi. */
const migrateLegacyRecords = (documentsByPatient) => {
  try {
    const raw = localStorage.getItem(ERM_PATIENT_RECORDS_LOCAL_KEY);
    if (!raw) return documentsByPatient;
    const legacy = JSON.parse(raw);
    if (!legacy || typeof legacy !== 'object') return documentsByPatient;
    const next = { ...documentsByPatient };
    for (const [pk, rows] of Object.entries(legacy)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const existing = Array.isArray(next[pk]) ? next[pk] : [];
      const existingIds = new Set(existing.map((d) => String(d.id)));
      for (const r of rows) {
        if (existingIds.has(String(r.id))) continue;
        existing.push({
          id: r.id || genId(),
          patientPk: pk,
          kind: 'form',
          title: r.title || 'Untitled',
          note: r.note || '',
          category: r.category || '',
          templateId: r.template_id || r.templateId || null,
          fields: Array.isArray(r.fields) ? r.fields : [],
          field_values: r.field_values || r.fieldValues || {},
          createdAt: r.created_at || r.createdAt || new Date().toISOString(),
          updatedAt: r.updated_at || r.updatedAt || new Date().toISOString(),
        });
      }
      next[pk] = existing;
    }
    return next;
  } catch {
    return documentsByPatient;
  }
};

const persistDocuments = (documentsByPatient) => {
  try {
    localStorage.setItem(ERM_PATIENT_DOCUMENTS_KEY, JSON.stringify(documentsByPatient));
  } catch (e) {
    console.warn('ERM: could not persist documents', e);
  }
};

const initialState = {
  selectedPatient: null,
  documentsByPatient: {},
  hydrated: false,
  lastError: null,
};

const ermSlice = createSlice({
  name: 'erm',
  initialState,
  reducers: {
    hydrateErmDocuments: (state) => {
      if (state.hydrated) return;
      const loaded = migrateLegacyRecords(readPersistedDocuments());
      state.documentsByPatient = loaded;
      state.hydrated = true;
    },
    setSelectedPatient: (state, action) => {
      state.selectedPatient = action.payload ?? null;
      state.lastError = null;
    },
    clearSelectedPatient: (state) => {
      state.selectedPatient = null;
      state.lastError = null;
    },
    setErmError: (state, action) => {
      state.lastError = action.payload ?? null;
    },
    addPatientDocument: (state, action) => {
      const doc = action.payload;
      const pk = String(doc.patientPk ?? '');
      if (!pk) return;
      const list = Array.isArray(state.documentsByPatient[pk]) ? [...state.documentsByPatient[pk]] : [];
      list.unshift(doc);
      state.documentsByPatient[pk] = list;
      persistDocuments(state.documentsByPatient);
      state.lastError = null;
    },
    updatePatientDocument: (state, action) => {
      const { patientPk, documentId, patch } = action.payload;
      const pk = String(patientPk ?? '');
      const list = state.documentsByPatient[pk];
      if (!Array.isArray(list)) return;
      state.documentsByPatient[pk] = list.map((d) => {
        if (String(d.id) !== String(documentId)) return d;
        return {
          ...d,
          ...patch,
          updatedAt: new Date().toISOString(),
        };
      });
      persistDocuments(state.documentsByPatient);
    },
    deletePatientDocument: (state, action) => {
      const { patientPk, documentId } = action.payload;
      const pk = String(patientPk ?? '');
      const list = state.documentsByPatient[pk];
      if (!Array.isArray(list)) return;
      state.documentsByPatient[pk] = list.filter((d) => String(d.id) !== String(documentId));
      persistDocuments(state.documentsByPatient);
    },
  },
});

export const {
  hydrateErmDocuments,
  setSelectedPatient,
  clearSelectedPatient,
  setErmError,
  addPatientDocument,
  updatePatientDocument,
  deletePatientDocument,
} = ermSlice.actions;

export const selectErmSelectedPatient = (state) => state.erm.selectedPatient;
export const selectErmSelectedPatientKey = (state) => patientKey(state.erm.selectedPatient);
export const selectErmPatientDocuments = (state) => {
  const pk = patientKey(state.erm.selectedPatient);
  if (!pk) return [];
  return state.erm.documentsByPatient[pk] || [];
};

export const selectErmDocumentsByPatientKey = (patientPk) => (state) => {
  const pk = String(patientPk ?? '');
  if (!pk) return [];
  return state.erm.documentsByPatient[pk] || [];
};

/** Patient form instance linked to a saved template. */
/** Uploaded patient files (pages: PDF, Excel, CSV, images) in Patient details tab. */
export const selectErmPatientFileDocsByKey = (patientPk) => (state) => {
  const pk = String(patientPk ?? '');
  if (!pk) return [];
  return (state.erm.documentsByPatient[pk] || []).filter((d) => d?.kind === 'patient-file');
};

export const findErmFormDocForTemplate = (documents, templateId) => {
  if (!templateId || !Array.isArray(documents)) return null;
  const tid = String(templateId);
  return (
    documents.find(
      (d) => d?.kind === 'form' && d.templateId != null && String(d.templateId) === tid
    ) || null
  );
};
export const selectErmHydrated = (state) => state.erm.hydrated;
export const selectErmLastError = (state) => state.erm.lastError;

export { genId as ermGenId, patientKey as ermPatientKey };

export default ermSlice.reducer;
