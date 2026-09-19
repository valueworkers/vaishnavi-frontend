import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ERM_TEMPLATES_STORAGE_KEY } from '../../constants/ermStorage';
import { applyStackedLayoutRects, runOcrOnImageFile } from '../../utils/ermOcr';
import { exportErmFormExcel, exportErmFormPdf } from '../../utils/ermFormExport';
import {
  applyLayoutStyleChange,
  extractDataTableFromOcrFields,
  inferFormLayoutStyle,
  valuesForLayout,
} from '../../utils/ermFormLayout';
import ERMStructuredForm from './ERMStructuredForm';
import { useDispatch, useSelector } from 'react-redux';
import {
  addPatientDocument,
  deletePatientDocument,
  ermGenId,
  findErmFormDocForTemplate,
  selectErmDocumentsByPatientKey,
  updatePatientDocument,
} from '../../store/slices/ermSlice';
import { emptyValuesForFields, sanitizeTemplatesList, stripTemplatePatientData } from '../../utils/ermTemplates';

const CATEGORY_OPTIONS = [
  { value: 'patient-summary', label: 'Patient summary' },
  { value: 'vitals', label: 'Vitals form' },
  { value: 'medication', label: 'Medication chart' },
  { value: 'custom', label: 'Other / custom' },
];

/** Pick category from form name keywords; custom uses a title derived from the name. */
const inferCategoryFromFormName = (name) => {
  const n = String(name || '').toLowerCase().trim();
  if (!n) {
    return { value: 'patient-summary', label: 'Patient summary' };
  }
  if (
    /\b(vital|vitals|bp\b|blood\s*pressure|temp|temperature|pulse|heart\s*rate|spo2|o2\b|oxygen|weight|height|bmi|rr\b|resp)\b/.test(
      n
    )
  ) {
    return { value: 'vitals', label: 'Vitals form' };
  }
  if (
    /\b(med|meds|medicine|medication|drug|rx\b|prescription|dosage|dose|pharmacy|tablet|injection)\b/.test(n)
  ) {
    return { value: 'medication', label: 'Medication chart' };
  }
  if (
    /\b(patient|registration|demographic|summary|intake|admission|identity|profile)\b/.test(n)
  ) {
    return { value: 'patient-summary', label: 'Patient summary' };
  }
  const title = String(name)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { value: 'custom', label: title || 'Other / custom' };
};

const buildCategoryOptionsForFormName = (formName) => {
  const inferred = inferCategoryFromFormName(formName);
  return CATEGORY_OPTIONS.map((o) => {
    if (o.value === inferred.value && inferred.value === 'custom' && formName.trim()) {
      return { ...o, label: inferred.label };
    }
    if (o.value === inferred.value && inferred.value !== 'custom') {
      return { ...o, label: inferred.label };
    }
    return o;
  });
};

const FIELD_TYPES = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
];

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const syncValuesForFields = (fieldList, prevValues, layoutStyle) =>
  valuesForLayout(fieldList, layoutStyle, prevValues);

const OCR_LAYOUT_OPTIONS = [
  { value: 'auto', label: 'Auto (best for angled / phone photos)' },
  { value: 'column', label: 'Single column (stacked labels)' },
  { value: 'block', label: 'Single block (dense paragraph)' },
  { value: 'sparse', label: 'Sparse text (scattered labels)' },
];

/** Load file into HTMLImageElement for canvas pipeline. */
const loadImageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image file.'));
    };
    img.src = url;
  });

/**
 * Upscale small phone photos, cap huge images, optional grayscale + contrast for Tesseract.
 * Passing the result to OCR usually reads clearer than the raw camera file alone.
 */
const prepareImageForOcr = async (file, enhance) => {
  const img = await loadImageFromFile(file);
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) throw new Error('Invalid image dimensions.');

  const longSide = Math.max(w0, h0);
  let scale = 1;
  if (longSide < 1100) scale = 1100 / longSide;
  const scaledLong = longSide * scale;
  if (scaledLong > 2600) scale *= 2600 / scaledLong;

  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: Boolean(enhance) });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  if (enhance) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      v = (v - 128) * 1.38 + 128;
      v = Math.max(0, Math.min(255, v));
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas;
};

/** Split one OCR line into multiple candidate labels (tables, tabs, “Name; Age; Sex”). */
const expandLineToCandidates = (line) => {
  const trimmed = String(line || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return [];

  if (trimmed.includes('\t')) {
    return trimmed.split('\t').flatMap((t) => expandLineToCandidates(t));
  }

  if (trimmed.includes(';') && trimmed.length < 160) {
    const parts = trimmed.split(';').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.every((p) => p.length <= 70)) {
      return parts.flatMap((p) => expandLineToCandidates(p));
    }
  }

  const byDoubleSpace = trimmed.split(/\s{2,}/).filter(Boolean);
  if (byDoubleSpace.length >= 2 && byDoubleSpace.length <= 10) {
    const allShort = byDoubleSpace.every((p) => p.length <= 48);
    if (allShort) return byDoubleSpace;
  }

  return [trimmed];
};

/** Fix frequent mis-reads on printed clinical forms (whole line). */
const fixCommonOcrLineTypos = (line) => {
  let s = line;
  s = s.replace(/\bcage\b/gi, 'Age');
  s = s.replace(/\bgander\b/gi, 'Gender');
  s = s.replace(/\brip\b/gi, '');
  s = s.replace(/\bters\b/gi, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
};

/** Normalize for deduplication (merge passes + field list). */
const ocrLineDedupeKey = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[.:;|»?]+$/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isNoiseOnlyLine = (line) => {
  const s = line.trim();
  if (s.length < 2) return true;
  const letters = (s.match(/[a-zA-Z]/g) || []).length;
  if (letters === 0 && s.length < 25) return true;
  if (letters < 3 && s.length < 14 && !s.includes(':')) return true;
  if (letters / s.length < 0.22 && s.length > 10) return true;
  if (/^[|>»§+?@#^*=\\/\d\s.,:;()'"-]+$/i.test(s) && letters < 5) return true;
  if (/^(.)\1{2,}$/.test(s.replace(/\s/g, ''))) return true;
  return false;
};

/** Logo / header fragments (“ters VAISHNAVI MEDICARE”, “AA”, “»”). */
const isBrandingOrHeaderNoise = (line) => {
  const s = line.trim();
  if (s.length <= 2) return true;
  if (/^(aa|o|e|m|tvs?|cane)$/i.test(s)) return true;
  if (/vaishnavi|medicare/i.test(s) && s.length < 55 && (s.match(/[a-zA-Z]/g) || []).length < 18) return true;
  if (/^PATIENT\s+SUMMARY$/i.test(s)) return true;
  if (/patient\s+summary/i.test(s) && s.length < 52) return true;
  if (/cane\s*['']?\s*patient/i.test(s)) return true;
  return false;
};

/**
 * All labels before colons on one line: "Name: Age: Gender:" → Name, Age, Gender.
 * Label must start with a letter or "(" so times like "12:30" are not split as fields.
 */
const extractColonLabelsFromLine = (line) => {
  const re = /([A-Za-z(][A-Za-z0-9 /().,'%|/-]{0,62}?):\s*/g;
  const labels = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    const part = m[1].trim();
    if (part.length >= 2 && part.length <= 68 && /[A-Za-z]/.test(part)) labels.push(part);
  }
  return labels;
};

const normalizeOcrText = (text) =>
  String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\uFF1A/g, ':')
    .trim();

/** Merge several OCR outputs: unique lines (fuzzy key drops “.” / “|” duplicates). */
const mergeUniqueOcrLines = (texts) => {
  const seen = new Set();
  const lines = [];
  for (const t of texts) {
    for (const line of normalizeOcrText(t).split('\n')) {
      const s = line.replace(/\s+/g, ' ').trim();
      if (!s) continue;
      const k = ocrLineDedupeKey(s);
      if (k.length < 2) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      lines.push(s);
    }
  }
  return lines.join('\n');
};

const psmForLayout = (PSM, layout) => {
  if (!PSM) return undefined;
  switch (layout) {
    case 'column':
      return PSM.SINGLE_COLUMN;
    case 'block':
      return PSM.SINGLE_BLOCK;
    case 'sparse':
      return PSM.SPARSE_TEXT;
    default:
      return PSM.AUTO;
  }
};

/** Infer control type from common medical form labels (OCR label is noisy, so this is best-effort). */
const inferFieldType = (label) => {
  const l = String(label || '').toLowerCase();
  if (
    /\b(date|dob|time|admission|discharge)\b/.test(l) ||
    /\b(on|from|to)\s*\d/.test(l)
  ) {
    return 'date';
  }
  if (
    /\b(bp|blood pressure|temp|temperature|pulse|heart rate|spo2|o2|weight|height|bmi|rr|resp)\b/.test(l) ||
    /\b\d{2,3}\s*\/\s*\d{2,3}\b/.test(l)
  ) {
    return 'number';
  }
  if (
    /\b(medication|medicine|drug|allerg|history|notes|comments|plan|diagnosis|chief complaint|instructions)\b/.test(
      l
    )
  ) {
    return 'textarea';
  }
  return 'text';
};

/**
 * Turn raw OCR text into editable field definitions.
 * Drops header/noise lines, splits stacked "Label: Label2:" rows, dedupes near-duplicates.
 */
const parseOcrTextToFields = (rawText) => {
  const text = normalizeOcrText(rawText);
  const rawLines = text.split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const fields = [];
  const seen = new Set();

  const pushLabel = (rawLabel) => {
    let label = String(rawLabel || '')
      .replace(/\s+/g, ' ')
      .replace(/\.$/, '')
      .trim();
    label = fixCommonOcrLineTypos(label);
    if (!label || label.length < 2 || label.length > 200) return;
    if (isNoiseOnlyLine(label) || isBrandingOrHeaderNoise(label)) return;

    const key = ocrLineDedupeKey(label);
    if (key.length < 2) return;
    if (seen.has(key)) return;
    seen.add(key);

    fields.push({
      id: genId(),
      label,
      type: inferFieldType(label),
    });
  };

  for (const rawLine of rawLines) {
    if (/^page\s+\d+/i.test(rawLine)) continue;

    let line = fixCommonOcrLineTypos(rawLine);
    if (isNoiseOnlyLine(line) || isBrandingOrHeaderNoise(line)) continue;

    const colonLabels = extractColonLabelsFromLine(line);

    if (colonLabels.length >= 2) {
      colonLabels.forEach(pushLabel);
      if (fields.length >= 80) return fields;
      continue;
    }

    for (const chunk of expandLineToCandidates(line)) {
      if (isNoiseOnlyLine(chunk) || isBrandingOrHeaderNoise(chunk)) continue;

      const innerColons = extractColonLabelsFromLine(chunk);
      if (innerColons.length >= 2) {
        innerColons.forEach(pushLabel);
      } else if (innerColons.length === 1) {
        pushLabel(innerColons[0]);
      } else {
        const colon = chunk.match(/^(.{1,180}?)[:\uFF1A]\s*(.*)$/);
        if (colon) {
          pushLabel(colon[1].trim());
        } else {
          const noUnderline = chunk.replace(/\s*[-.:…_]{3,}\s*$/u, '').trim();
          if (noUnderline.length >= 3 && /[A-Za-z]{2,}/.test(noUnderline)) pushLabel(noUnderline);
        }
      }
      if (fields.length >= 80) return fields;
    }
  }

  return fields;
};

const loadTemplates = () => {
  try {
    const raw = localStorage.getItem(ERM_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return sanitizeTemplatesList(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
};

const saveTemplates = (list) => {
  try {
    const clean = sanitizeTemplatesList(list);
    localStorage.setItem(ERM_TEMPLATES_STORAGE_KEY, JSON.stringify(clean));
  } catch (e) {
    console.error('ERM: could not save templates', e);
    throw e;
  }
};

const ERMFormFromImage = ({ patientLabel, patientPk }) => {
  const dispatch = useDispatch();
  const patientKey = patientPk != null && patientPk !== '' ? String(patientPk) : '';
  const patientDocuments = useSelector(selectErmDocumentsByPatientKey(patientKey));

  const [templates, setTemplates] = useState([]);
  const [view, setView] = useState('list'); // 'list' | 'create' | 'preview'
  const [previewId, setPreviewId] = useState(null);
  const [linkPromptTemplate, setLinkPromptTemplate] = useState(null);
  const [showSharedForms, setShowSharedForms] = useState(false);

  const [formName, setFormName] = useState('');
  const [category, setCategory] = useState('patient-summary');
  const [categoryManual, setCategoryManual] = useState(false);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(null);
  const [ocrError, setOcrError] = useState('');
  const [ocrRawText, setOcrRawText] = useState('');
  const [fields, setFields] = useState([]);
  const [saveError, setSaveError] = useState('');
  const [enhanceForOcr, setEnhanceForOcr] = useState(true);
  const [ocrLayout, setOcrLayout] = useState('auto');
  const [secondPassColumn, setSecondPassColumn] = useState(false);
  const [layoutImage, setLayoutImage] = useState(null);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [previewValues, setPreviewValues] = useState({});
  const [previewFillValues, setPreviewFillValues] = useState({});
  const [previewFields, setPreviewFields] = useState([]);
  const [previewSaveMsg, setPreviewSaveMsg] = useState('');
  const [previewExportError, setPreviewExportError] = useState('');
  const [previewPatientDocId, setPreviewPatientDocId] = useState(null);
  const [createLayoutStyle, setCreateLayoutStyle] = useState(null);
  const [createTableCols, setCreateTableCols] = useState(3);
  const [previewLayoutStyle, setPreviewLayoutStyle] = useState(null);
  const [previewTableCols, setPreviewTableCols] = useState(3);

  const fileInputRef = useRef(null);

  const inferredCategory = useMemo(() => inferCategoryFromFormName(formName), [formName]);
  const categoryOptions = useMemo(() => buildCategoryOptionsForFormName(formName), [formName]);

  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  useEffect(() => {
    setView('list');
    setPreviewId(null);
    setLinkPromptTemplate(null);
    setPreviewSaveMsg('');
    setShowSharedForms(false);
  }, [patientKey]);

  useEffect(() => {
    if (view !== 'create' || categoryManual) return;
    setCategory(inferredCategory.value);
  }, [view, categoryManual, inferredCategory.value]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const resetCreate = useCallback(() => {
    setFormName('');
    setCategory('patient-summary');
    setCategoryManual(false);
    setFile(null);
    setOcrProgress(null);
    setOcrError('');
    setOcrRawText('');
    setFields([]);
    setSaveError('');
    setEnhanceForOcr(true);
    setOcrLayout('auto');
    setSecondPassColumn(false);
    setLayoutImage(null);
    setLayoutWidth(0);
    setLayoutHeight(0);
    setPreviewValues({});
    setCreateLayoutStyle(null);
    setCreateTableCols(3);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const runOcr = useCallback(async () => {
    if (!file) return;
    setOcrError('');
    setOcrProgress('Preparing image…');
    setFields([]);

    try {
      const { rawText, fields: parsed, imageWidth, imageHeight, sourceImage } = await runOcrOnImageFile(
        file,
        {
          enhanceForOcr,
          ocrLayout,
          secondPassColumn,
          onProgress: setOcrProgress,
        }
      );
      setOcrRawText(rawText);
      const dataTable = extractDataTableFromOcrFields(parsed, {
        formName: formName.trim(),
        category,
      });
      const finalFields = dataTable ? dataTable.columns : parsed;
      setCreateLayoutStyle(dataTable ? 'data-table' : inferFormLayoutStyle(finalFields, null));
      if (dataTable) setCreateTableCols(finalFields.length);
      setFields(finalFields);
      setLayoutWidth(imageWidth);
      setLayoutHeight(imageHeight);
      if (sourceImage) setLayoutImage(sourceImage);
      setPreviewValues(
        dataTable
          ? dataTable.values
          : Object.fromEntries(finalFields.map((f) => [f.id, '']))
      );
      setOcrProgress(
        dataTable
          ? `Vitals log sheet detected — ${finalFields.length} columns, ${dataTable.values.tableRows?.length || 8} rows ready to fill.`
          : parsed.length
            ? `Found ${parsed.length} field(s) on the image. Adjust labels below, then save — layout matches the photo.`
            : 'No clear fields found. Try another page layout, turn off “second pass”, or edit the OCR text manually.'
      );
    } catch (e) {
      console.error(e);
      setOcrError(e?.message || 'OCR failed. Try a clearer photo, straight-on shot, or smaller file.');
      setOcrProgress(null);
    }
  }, [category, file, enhanceForOcr, formName, ocrLayout, secondPassColumn]);

  const reparseFromText = useCallback(() => {
    const parsed = applyStackedLayoutRects(parseOcrTextToFields(ocrRawText));
    const dataTable = extractDataTableFromOcrFields(parsed, {
      formName: formName.trim(),
      category,
    });
    const finalFields = dataTable ? dataTable.columns : parsed;
    setFields(finalFields);
    setPreviewValues(
      dataTable
        ? dataTable.values
        : syncValuesForFields(finalFields, previewValues, inferFormLayoutStyle(finalFields))
    );
    setOcrProgress(
      dataTable
        ? `Log sheet: ${finalFields.length} columns.`
        : parsed.length
          ? `Re-parsed: ${parsed.length} field(s).`
          : 'No fields matched. Try editing the text.'
    );
  }, [category, formName, ocrRawText, previewValues]);

  const updateField = useCallback((id, patch) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const removeField = useCallback((id) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const addBlankField = useCallback(() => {
    setFields((prev) => {
      const maxY = prev.reduce((m, f) => Math.max(m, f.rect?.y ?? 0), 0);
      const next = [
        ...prev,
        {
          id: genId(),
          label: 'New field',
          type: 'text',
          rect: { x: 4, y: Math.min(90, maxY + 7), w: 40, h: 5.5 },
        },
      ];
      return next;
    });
  }, []);

  const handleSaveTemplate = useCallback(() => {
    setSaveError('');
    const name = formName.trim();
    if (!name) {
      setSaveError('Please enter a form name.');
      return;
    }
    if (fields.length === 0) {
      setSaveError('Add at least one field (OCR or manual).');
      return;
    }
    const entry = {
      id: genId(),
      name,
      category,
      sourceImage: layoutImage,
      layoutWidth,
      layoutHeight,
      fields: fields.map(({ id, label, type, rect }) => ({
        id,
        label: String(label).trim() || 'Field',
        type,
        rect: rect || { x: 4, y: 4, w: 40, h: 5 },
      })),
      layoutStyle: createLayoutStyle || inferFormLayoutStyle(fields, null),
      tableColumnsPerRow: createTableCols,
      createdAt: new Date().toISOString(),
    };

    try {
      const next = [entry, ...templates];
      saveTemplates(next);
      setTemplates(next);

      if (patientKey) {
        const docId = ermGenId();
        dispatch(
          addPatientDocument({
            id: docId,
            patientPk: patientKey,
            kind: 'form',
            title: name,
            category,
            templateId: entry.id,
            fields: entry.fields,
            field_values: emptyValuesForFields(entry.fields, entry.layoutStyle),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        );
      }

      setView('list');
      resetCreate();
    } catch {
      setSaveError('Could not save (storage may be full). Remove old templates or shorten field names.');
    }
  }, [category, dispatch, fields, formName, layoutHeight, layoutImage, layoutWidth, patientKey, resetCreate, templates]);

  const deleteTemplate = useCallback((id) => {
    if (!window.confirm('Delete this form template?')) return;
    const next = templates.filter((t) => t.id !== id);
    saveTemplates(next);
    setTemplates(next);
    if (previewId === id) {
      setPreviewId(null);
      setView('list');
    }
  }, [previewId, templates]);

  const previewTemplate = useMemo(() => templates.find((t) => t.id === previewId) || null, [previewId, templates]);

  const { patientLinkedTemplates, sharedTemplates } = useMemo(() => {
    if (!patientKey) {
      return { patientLinkedTemplates: [], sharedTemplates: templates };
    }
    const linkedIds = new Set(
      patientDocuments
        .filter((d) => d?.kind === 'form' && d.templateId)
        .map((d) => String(d.templateId))
    );
    const linked = templates
      .filter((t) => linkedIds.has(String(t.id)))
      .sort((a, b) => {
        const da = findErmFormDocForTemplate(patientDocuments, a.id);
        const db = findErmFormDocForTemplate(patientDocuments, b.id);
        return new Date(db?.updatedAt || 0) - new Date(da?.updatedAt || 0);
      });
    const shared = templates.filter((t) => !linkedIds.has(String(t.id)));
    return { patientLinkedTemplates: linked, sharedTemplates: shared };
  }, [patientDocuments, patientKey, templates]);

  const attachTemplateToPatient = useCallback(
    (tpl, initialValues = null) => {
      if (!patientKey || !tpl) return null;
      const existing = findErmFormDocForTemplate(patientDocuments, tpl.id);
      if (existing) return existing;

      const flds = (tpl.fields || []).map((f) => ({ ...f }));
      const layout = inferFormLayoutStyle(flds, tpl.layoutStyle);
      const values =
        initialValues && typeof initialValues === 'object'
          ? { ...emptyValuesForFields(flds, layout), ...initialValues }
          : emptyValuesForFields(flds, layout);
      const docId = ermGenId();
      dispatch(
        addPatientDocument({
          id: docId,
          patientPk: patientKey,
          kind: 'form',
          title: tpl.name,
          category: tpl.category,
          templateId: tpl.id,
          fields: flds,
          field_values: values,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
      return { id: docId, fields: flds, field_values: values };
    },
    [dispatch, patientDocuments, patientKey]
  );

  const addTemplateToPatient = useCallback(
    (tpl, { openAfter = false } = {}) => {
      if (!tpl || !patientKey) return false;
      const existing = findErmFormDocForTemplate(patientDocuments, tpl.id);
      if (!existing) {
        const legacy = tpl.field_values;
        const hasLegacy =
          legacy && typeof legacy === 'object' && Object.keys(legacy).length > 0;
        attachTemplateToPatient(tpl, hasLegacy ? legacy : null);
        if (hasLegacy) {
          const next = templates.map((t) => stripTemplatePatientData(t));
          saveTemplates(next);
          setTemplates(next);
        }
      }
      if (openAfter) {
        setPreviewId(tpl.id);
        setView('preview');
      } else {
        setPreviewSaveMsg(`"${tpl.name}" added to ${patientLabel || 'this patient'}.`);
        setTimeout(() => setPreviewSaveMsg(''), 2500);
        setShowSharedForms(true);
      }
      return true;
    },
    [attachTemplateToPatient, patientDocuments, patientKey, patientLabel, templates]
  );

  const openTemplatePreview = useCallback(
    (tpl) => {
      if (!tpl) return;
      if (patientKey) {
        const doc = findErmFormDocForTemplate(patientDocuments, tpl.id);
        if (!doc) {
          setLinkPromptTemplate(tpl);
          return;
        }
      }
      setPreviewId(tpl.id);
      setView('preview');
    },
    [patientDocuments, patientKey]
  );

  const confirmUseTemplateForPatient = useCallback(
    (openAfter = false) => {
      if (!linkPromptTemplate) return;
      addTemplateToPatient(linkPromptTemplate, { openAfter });
      setLinkPromptTemplate(null);
    },
    [addTemplateToPatient, linkPromptTemplate]
  );

  const removeFormFromPatient = useCallback(
    (tpl) => {
      if (!patientKey || !tpl) return;
      const doc = findErmFormDocForTemplate(patientDocuments, tpl.id);
      if (!doc) return;
      if (
        !window.confirm(
          `Remove "${tpl.name}" from ${patientLabel || 'this patient'}? The form stays available for other patients.`
        )
      ) {
        return;
      }
      dispatch(deletePatientDocument({ patientPk: patientKey, documentId: doc.id }));
      setPreviewSaveMsg(`"${tpl.name}" removed from this patient.`);
      setTimeout(() => setPreviewSaveMsg(''), 2500);
    },
    [dispatch, patientDocuments, patientKey, patientLabel]
  );

  useEffect(() => {
    if (view !== 'preview' || !previewTemplate) {
      setPreviewFillValues({});
      setPreviewFields([]);
      setPreviewSaveMsg('');
      setPreviewPatientDocId(null);
      return;
    }

    const tplFields = (previewTemplate.fields || []).map((f) => ({ ...f }));
    const doc = patientKey ? findErmFormDocForTemplate(patientDocuments, previewTemplate.id) : null;
    const flds =
      doc?.fields?.length > 0 ? doc.fields.map((f) => ({ ...f })) : tplFields;
    const saved = doc?.field_values || (patientKey ? {} : previewTemplate.field_values || {});
    const style = inferFormLayoutStyle(flds, previewTemplate.layoutStyle);
    const init = valuesForLayout(flds, style, saved);
    setPreviewFields(flds);
    setPreviewFillValues(init);
    setPreviewLayoutStyle(previewTemplate.layoutStyle || style);
    setPreviewTableCols(previewTemplate.tableColumnsPerRow || 3);
    setPreviewPatientDocId(doc?.id || null);
  }, [view, previewTemplate, patientDocuments, patientKey]);

  const handleCreateLayoutStyleChange = useCallback(
    (style) => {
      const result = applyLayoutStyleChange(fields, previewValues, style, {
        columnsPerRow: createTableCols,
        formName: formName.trim(),
        category,
      });
      setCreateLayoutStyle(result.layoutStyle);
      setCreateTableCols(result.tableColumnsPerRow || createTableCols);
      setFields(result.fields);
      setPreviewValues(result.values);
    },
    [category, createTableCols, fields, formName, previewValues]
  );

  const handleCreateTableColumnsChange = useCallback(
    (cols) => {
      setCreateTableCols(cols);
      if ((createLayoutStyle || inferFormLayoutStyle(fields)) === 'table') {
        const result = applyLayoutStyleChange(fields, previewValues, 'table', {
          columnsPerRow: cols,
          formName: formName.trim(),
          category,
        });
        setFields(result.fields);
        setPreviewValues(result.values);
      }
    },
    [category, createLayoutStyle, fields, formName, previewValues]
  );

  const handlePreviewLayoutStyleChange = useCallback(
    (style) => {
      const result = applyLayoutStyleChange(previewFields, previewFillValues, style, {
        columnsPerRow: previewTableCols,
        formName: previewTemplate?.name || '',
        category: previewTemplate?.category || '',
      });
      setPreviewLayoutStyle(result.layoutStyle);
      setPreviewTableCols(result.tableColumnsPerRow || previewTableCols);
      setPreviewFields(result.fields);
      setPreviewFillValues(result.values);
    },
    [previewFields, previewFillValues, previewTableCols, previewTemplate]
  );

  const handlePreviewTableColumnsChange = useCallback(
    (cols) => {
      setPreviewTableCols(cols);
      if ((previewLayoutStyle || inferFormLayoutStyle(previewFields, previewTemplate?.layoutStyle)) === 'table') {
        const result = applyLayoutStyleChange(previewFields, previewFillValues, 'table', {
          columnsPerRow: cols,
          formName: previewTemplate?.name || '',
          category: previewTemplate?.category || '',
        });
        setPreviewFields(result.fields);
        setPreviewFillValues(result.values);
      }
    },
    [previewFields, previewFillValues, previewLayoutStyle, previewTemplate]
  );

  const handlePreviewFieldsChange = useCallback(
    (nextFields) => {
      setPreviewFields(nextFields);
      setPreviewFillValues((prev) =>
        syncValuesForFields(nextFields, prev, inferFormLayoutStyle(nextFields, previewTemplate?.layoutStyle))
      );
    },
    [previewTemplate?.layoutStyle]
  );

  const handleCreateFieldsChange = useCallback((nextFields) => {
    setFields(nextFields);
    setPreviewValues((prev) =>
      syncValuesForFields(nextFields, prev, inferFormLayoutStyle(nextFields))
    );
  }, []);

  const handlePreviewFieldChange = useCallback((fieldId, value) => {
    if (fieldId === '__tableRows__') {
      setPreviewFillValues((prev) => ({ ...prev, tableRows: value }));
      return;
    }
    setPreviewFillValues((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

  const handleCreateFieldChange = useCallback((fieldId, value) => {
    if (fieldId === '__tableRows__') {
      setPreviewValues((prev) => ({ ...prev, tableRows: value }));
      return;
    }
    setPreviewValues((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

  const handleSavePreviewValues = useCallback(() => {
    if (!previewTemplate) return;
    try {
      let patientDocId = previewPatientDocId;

      if (patientKey) {
        if (patientDocId) {
          dispatch(
            updatePatientDocument({
              patientPk: patientKey,
              documentId: patientDocId,
              patch: {
                field_values: { ...previewFillValues },
                fields: previewFields,
                title: previewTemplate.name,
                category: previewTemplate.category,
              },
            })
          );
        } else {
          patientDocId = ermGenId();
          dispatch(
            addPatientDocument({
              id: patientDocId,
              patientPk: patientKey,
              kind: 'form',
              title: previewTemplate.name,
              category: previewTemplate.category,
              templateId: previewTemplate.id,
              fields: previewFields,
              field_values: { ...previewFillValues },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
          );
          setPreviewPatientDocId(patientDocId);
        }
      }

      const next = templates.map((t) =>
        t.id === previewTemplate.id
          ? stripTemplatePatientData({
              ...t,
              fields: previewFields,
              layoutStyle: previewLayoutStyle || inferFormLayoutStyle(previewFields, t.layoutStyle),
              tableColumnsPerRow: previewTableCols,
              updatedAt: new Date().toISOString(),
            })
          : stripTemplatePatientData(t)
      );
      saveTemplates(next);
      setTemplates(next);
      setPreviewSaveMsg(
        patientKey ? `Saved for ${patientLabel || 'this patient'}.` : 'Form layout saved.'
      );
      setTimeout(() => setPreviewSaveMsg(''), 2500);
    } catch {
      setPreviewSaveMsg('Could not save — storage may be full.');
    }
  }, [
    dispatch,
    patientKey,
    patientLabel,
    previewFields,
    previewFillValues,
    previewPatientDocId,
    previewTemplate,
    templates,
  ]);

  const handleExportPdf = useCallback(() => {
    if (!previewTemplate) return;
    setPreviewExportError('');
    try {
      exportErmFormPdf({
        title: previewTemplate.name,
        categoryLabel: categoryLabel(previewTemplate.category, previewTemplate.name),
        patientLabel,
        fields: previewFields,
        values: previewFillValues,
        layoutStyle: inferFormLayoutStyle(previewFields, previewTemplate.layoutStyle),
      });
    } catch (e) {
      setPreviewExportError(e?.message || 'PDF export failed.');
    }
  }, [previewFields, previewFillValues, previewTemplate, patientLabel]);

  const handleExportExcel = useCallback(() => {
    if (!previewTemplate) return;
    setPreviewExportError('');
    try {
      exportErmFormExcel({
        title: previewTemplate.name,
        patientLabel,
        fields: previewFields,
        values: previewFillValues,
        layoutStyle: inferFormLayoutStyle(previewFields, previewTemplate.layoutStyle),
      });
    } catch (e) {
      setPreviewExportError(e?.message || 'Excel export failed.');
    }
  }, [previewFields, previewFillValues, previewTemplate, patientLabel]);

  const renderPreviewFieldInput = (f) => {
    const value = previewFillValues[f.id] ?? '';
    const common =
      'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';
    if (f.type === 'textarea') {
      return (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => handlePreviewFieldChange(f.id, e.target.value)}
          className={common}
        />
      );
    }
    if (f.type === 'number') {
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => handlePreviewFieldChange(f.id, e.target.value)}
          className={common}
        />
      );
    }
    if (f.type === 'date') {
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => handlePreviewFieldChange(f.id, e.target.value)}
          className={common}
        />
      );
    }
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => handlePreviewFieldChange(f.id, e.target.value)}
        className={common}
      />
    );
  };

  const categoryLabel = (value, templateName) => {
    if (value === 'custom' && templateName) {
      return inferCategoryFromFormName(templateName).label;
    }
    return CATEGORY_OPTIONS.find((c) => c.value === value)?.label || value;
  };

  const renderTemplateRow = (t, { linked = false } = {}) => {
    const doc = patientKey ? findErmFormDocForTemplate(patientDocuments, t.id) : null;
    return (
      <li
        key={t.id}
        className="flex flex-wrap items-center justify-between gap-2 bg-gray-50/50 px-3 py-3 sm:px-4"
      >
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{t.name}</p>
          <p className="text-xs text-gray-500">
            {categoryLabel(t.category, t.name)} · {t.fields?.length || 0} fields
            {linked && doc?.updatedAt
              ? ` · Updated ${new Date(doc.updatedAt).toLocaleString()}`
              : t.createdAt
                ? ` · ${new Date(t.createdAt).toLocaleString()}`
                : ''}
          </p>
          {linked ? (
            <p className="text-[11px] text-emerald-700 mt-0.5">This patient&apos;s copy — separate entries from others</p>
          ) : patientKey ? (
            <p className="text-[11px] text-indigo-700 mt-0.5">
              Used by other patients — add here without scanning again
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0 justify-end">
          {linked ? (
            <>
              <button
                type="button"
                onClick={() => openTemplatePreview(t)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => removeFormFromPatient(t)}
                className="rounded-md border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50"
              >
                Remove
              </button>
            </>
          ) : patientKey ? (
            <>
              <button
                type="button"
                onClick={() => addTemplateToPatient(t)}
                className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
              >
                Add to patient
              </button>
              <button
                type="button"
                onClick={() => openTemplatePreview(t)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
              >
                Preview
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openTemplatePreview(t)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => deleteTemplate(t.id)}
                className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <section className="rounded-lg border border-indigo-100 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 pb-2 mb-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Dynamic forms from image</h2>
          <p className="mt-0.5 text-[11px] text-gray-600 max-w-2xl leading-snug">
            {patientLabel ? (
              <>
                For <span className="font-semibold text-indigo-800">{patientLabel}</span>. Upload a form
                photo; OCR extracts field labels to edit and save.
              </>
            ) : (
              'Upload a form photo; OCR extracts field labels to edit and save as a template.'
            )}
          </p>
        </div>
        {view !== 'list' && (
          <button
            type="button"
            onClick={() => {
              setView('list');
              setPreviewId(null);
              resetCreate();
            }}
            className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            ← Back to templates
          </button>
        )}
      </div>

      {view === 'list' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              resetCreate();
              setView('create');
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            New form from image
          </button>

          {previewSaveMsg && view === 'list' && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
              {previewSaveMsg}
            </p>
          )}

          {templates.length === 0 ? (
            <p className="text-sm text-gray-500 py-6">No saved templates yet. Create one from a form photo.</p>
          ) : patientKey ? (
            <div className="space-y-5">
              <p className="text-[11px] text-gray-600 leading-snug">
                Each patient has their own form list and entries. Forms added for one patient appear under{' '}
                <strong>Shared forms</strong> for others until you add them.
              </p>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-700 mb-2">
                  Forms for {patientLabel || 'this patient'} ({patientLinkedTemplates.length})
                </h3>
                {patientLinkedTemplates.length === 0 ? (
                  <p className="text-sm text-gray-500 py-3 rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-3">
                    No forms on this patient yet. Open <strong>Shared forms</strong> to add forms from other
                    patients, or create a new one from an image.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                    {patientLinkedTemplates.map((t) => renderTemplateRow(t, { linked: true }))}
                  </ul>
                )}
              </div>
              {sharedTemplates.length > 0 && (
                <div>
                  {!showSharedForms ? (
                    <button
                      type="button"
                      onClick={() => setShowSharedForms(true)}
                      className="w-full rounded-lg border border-indigo-200 bg-indigo-50/80 px-4 py-2.5 text-sm font-semibold text-indigo-900 hover:bg-indigo-100 text-left"
                    >
                      Shared forms ({sharedTemplates.length} available) — add from other patients
                    </button>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-700">
                          Shared forms (use for this patient)
                        </h3>
                        <button
                          type="button"
                          onClick={() => setShowSharedForms(false)}
                          className="text-xs font-medium text-indigo-700 hover:underline"
                        >
                          Hide
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-600 mb-2">
                        Same layout as other patients — no need to scan the photo again. Each patient keeps their
                        own entries.
                      </p>
                      <ul className="divide-y divide-gray-100 rounded-xl border border-indigo-100 overflow-hidden">
                        {sharedTemplates.map((t) => renderTemplateRow(t, { linked: false }))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
              {templates.map((t) => renderTemplateRow(t))}
            </ul>
          )}
        </div>
      )}

      {view === 'create' && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-gray-800">Form name</span>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Morning vitals sheet"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-800">Category</span>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setCategoryManual(true);
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {categoryOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-500">
                {categoryManual ? (
                  <>
                    Manual category.{' '}
                    <button
                      type="button"
                      className="font-medium text-indigo-700 hover:underline"
                      onClick={() => setCategoryManual(false)}
                    >
                      Use suggestion from form name
                    </button>
                  </>
                ) : (
                  <>
                    Suggested: <span className="font-medium text-indigo-800">{inferredCategory.label}</span>
                  </>
                )}
              </p>
            </label>
          </div>

          <div>
            <span className="font-medium text-gray-800 text-sm">Form image</span>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-gray-800">Page layout (OCR)</span>
                <select
                  value={ocrLayout}
                  onChange={(e) => setOcrLayout(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {OCR_LAYOUT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-2 justify-end text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enhanceForOcr}
                    onChange={(e) => setEnhanceForOcr(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-gray-800">Enhance for OCR (resize, grayscale, contrast)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={secondPassColumn}
                    onChange={(e) => setSecondPassColumn(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-gray-800">Second pass + merge (slower; can duplicate blocks — try off first)</span>
                </label>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-800 hover:file:bg-indigo-100"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setFile(f || null);
                  setOcrRawText('');
                  setFields([]);
                  setOcrProgress(null);
                  setOcrError('');
                  setLayoutImage(null);
                  setLayoutWidth(0);
                  setLayoutHeight(0);
                  setPreviewValues({});
                }}
              />
              <button
                type="button"
                disabled={!file}
                onClick={runOcr}
                className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-100"
              >
                Extract fields (OCR)
              </button>
            </div>
            <ul className="mt-2 text-xs text-gray-600 list-disc list-inside space-y-0.5 max-w-3xl">
              <li>Hold the phone level, fill the frame with the form, and use bright even light (avoid shadow on text).</li>
              <li>If results are still wrong, try another <strong>page layout</strong>, toggle <strong>second pass</strong>, or fix the text in the box below and click <strong>Re-parse</strong>.</li>
              <li>Handwriting and low contrast are often wrong — use printed forms or typed labels when possible.</li>
            </ul>
            <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 inline-block">
              OCR is approximate. Always review fields before saving.
            </p>
          </div>

          {ocrError && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">{ocrError}</p>}
          {ocrProgress && !ocrError && <p className="text-sm text-indigo-800">{ocrProgress}</p>}

          <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900">Form preview (drag to reorder, add fields)</h3>
              <ERMStructuredForm
                formTitle={formName.trim() || 'New form'}
                category={category}
                categoryLabel={categoryOptions.find((o) => o.value === category)?.label}
                patientLabel={patientLabel}
                fields={fields}
                values={previewValues}
                layoutStyle={createLayoutStyle ?? inferFormLayoutStyle(fields, null)}
                tableColumnsPerRow={createTableCols}
                onChange={handleCreateFieldChange}
                layoutEditable
                onFieldsChange={handleCreateFieldsChange}
                onLayoutStyleChange={handleCreateLayoutStyleChange}
                onTableColumnsChange={handleCreateTableColumnsChange}
              />
          </div>

          {(ocrRawText || fields.length > 0) && (
            <div className="space-y-2">
              <label className="block text-sm">
                <span className="font-medium text-gray-800">Raw OCR text (edit and re-parse if needed)</span>
                <textarea
                  value={ocrRawText}
                  onChange={(e) => setOcrRawText(e.target.value)}
                  rows={5}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </label>
              <button
                type="button"
                onClick={reparseFromText}
                className="text-sm font-medium text-indigo-700 hover:underline"
              >
                Re-parse fields from text above
              </button>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-gray-900">Form fields</h3>
              <button
                type="button"
                onClick={addBlankField}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
              >
                + Add field
              </button>
            </div>

            {fields.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">No fields yet. Run OCR on an image or add fields manually.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="px-3 py-2 w-10">#</th>
                      <th className="px-3 py-2">Label</th>
                      <th className="px-3 py-2 w-36">Type</th>
                      <th className="px-3 py-2 w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fields.map((f, i) => (
                      <tr key={f.id} className="bg-white">
                        <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={f.label}
                            onChange={(e) => updateField(f.id, { label: e.target.value })}
                            className="w-full min-w-[140px] rounded border border-gray-200 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={f.type}
                            onChange={(e) => updateField(f.id, { type: e.target.value })}
                            className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                          >
                            {FIELD_TYPES.map((ft) => (
                              <option key={ft.value} value={ft.value}>
                                {ft.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeField(f.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {saveError && <p className="text-sm text-red-700">{saveError}</p>}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={handleSaveTemplate}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
            >
              Save form template
            </button>
          </div>
        </div>
      )}

      {linkPromptTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="erm-link-form-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl border border-gray-200">
            <h3 id="erm-link-form-title" className="text-base font-bold text-gray-900">
              Use &ldquo;{linkPromptTemplate.name}&rdquo; for {patientLabel}?
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              This adds the form only to {patientLabel}. Same layout as other patients — no new photo scan.{' '}
              Other patients keep their own entries; this patient starts with a separate copy.
            </p>
            {linkPromptTemplate.field_values &&
              Object.keys(linkPromptTemplate.field_values).length > 0 && (
                <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
                  Saved entries found on the template will be copied to this patient once.
                </p>
              )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => confirmUseTemplateForPatient(false)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Add to this patient
              </button>
              <button
                type="button"
                onClick={() => confirmUseTemplateForPatient(true)}
                className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
              >
                Add and open form
              </button>
              <button
                type="button"
                onClick={() => setLinkPromptTemplate(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'preview' && previewTemplate && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">{previewTemplate.name}</h3>
            <p className="text-xs text-gray-500">{categoryLabel(previewTemplate.category, previewTemplate.name)}</p>
          </div>
          <p className="text-xs text-gray-600">
            Drag fields to reorder, add new fields (choose text, number, or date), fill values, then save or export.
            {patientLabel ? ` Patient: ${patientLabel}.` : ''}
          </p>
          <ERMStructuredForm
              formTitle={previewTemplate.name}
              category={previewTemplate.category}
              categoryLabel={categoryLabel(previewTemplate.category, previewTemplate.name)}
              patientLabel={patientLabel}
              fields={previewFields}
              values={previewFillValues}
              layoutStyle={previewLayoutStyle ?? inferFormLayoutStyle(previewFields, previewTemplate.layoutStyle)}
              tableColumnsPerRow={previewTableCols}
              onChange={handlePreviewFieldChange}
              layoutEditable
              onFieldsChange={handlePreviewFieldsChange}
              onLayoutStyleChange={handlePreviewLayoutStyleChange}
              onTableColumnsChange={handlePreviewTableColumnsChange}
            />
          {previewExportError && <p className="text-sm text-red-600">{previewExportError}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSavePreviewValues}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Export PDF
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="rounded-lg border border-emerald-600 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              Export Excel
            </button>
            {previewSaveMsg && <span className="text-sm text-green-700">{previewSaveMsg}</span>}
          </div>
        </div>
      )}
    </section>
  );
};

export default ERMFormFromImage;
