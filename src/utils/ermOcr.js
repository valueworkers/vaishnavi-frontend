/** Shared ERM OCR pipeline (Tesseract.js) for form builder and patient documents. */

export const ermFieldId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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

export const prepareImageForOcr = async (file, enhance = true) => {
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

const fixCommonOcrLineTypos = (line) => {
  let s = line;
  s = s.replace(/\bcage\b/gi, 'Age');
  s = s.replace(/\bgander\b/gi, 'Gender');
  s = s.replace(/\brip\b/gi, '');
  s = s.replace(/\bters\b/gi, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
};

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

export const normalizeOcrText = (text) =>
  String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\uFF1A/g, ':')
    .trim();

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

const inferFieldType = (label) => {
  const l = String(label || '').toLowerCase();
  if (/\b(date|dob|time|admission|discharge)\b/.test(l) || /\b(on|from|to)\s*\d/.test(l)) {
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

export const parseOcrTextToFields = (rawText) => {
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
      id: ermFieldId(),
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

const readBbox = (bbox) => {
  if (!bbox) return null;
  const x0 = Number(bbox.x0 ?? bbox.left ?? 0);
  const y0 = Number(bbox.y0 ?? bbox.top ?? 0);
  const x1 = Number(bbox.x1 ?? bbox.right ?? x0);
  const y1 = Number(bbox.y1 ?? bbox.bottom ?? y0);
  if (!Number.isFinite(x0 + y0 + x1 + y1)) return null;
  return { x0, y0, x1, y1 };
};

/** Percent rect (0–100) relative to OCR image size — used to overlay fields on the saved form image. */
export const bboxToPercentRect = (bbox, imageWidth, imageHeight) => {
  const b = readBbox(bbox);
  const w = Math.max(1, imageWidth || 1);
  const h = Math.max(1, imageHeight || 1);
  if (!b) return { x: 4, y: 4, w: 40, h: 5 };
  const padX = w * 0.004;
  const padY = h * 0.006;
  const x0 = Math.max(0, b.x0 - padX);
  const y0 = Math.max(0, b.y0 - padY);
  const x1 = Math.min(w, b.x1 + padX);
  const y1 = Math.min(h, b.y1 + padY);
  return {
    x: (x0 / w) * 100,
    y: (y0 / h) * 100,
    w: Math.min(92, Math.max(6, ((x1 - x0) / w) * 100)),
    h: Math.min(20, Math.max(3.5, ((y1 - y0) / h) * 100)),
  };
};

const splitBboxSlices = (bbox, count) => {
  const b = readBbox(bbox);
  if (!b || count < 2) return [bbox];
  const sliceW = (b.x1 - b.x0) / count;
  return Array.from({ length: count }, (_, i) => ({
    x0: b.x0 + sliceW * i,
    y0: b.y0,
    x1: b.x0 + sliceW * (i + 1),
    y1: b.y1,
  }));
};

const collectOcrLinesWithBbox = (ocrData) => {
  const out = [];
  const push = (text, bbox) => {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    const b = readBbox(bbox);
    if (t && b) out.push({ text: t, bbox: b });
  };
  if (Array.isArray(ocrData?.lines)) {
    for (const line of ocrData.lines) push(line.text, line.bbox);
  }
  if (out.length === 0 && Array.isArray(ocrData?.words)) {
    for (const word of ocrData.words) push(word.text, word.bbox);
  }
  if (out.length === 0 && Array.isArray(ocrData?.paragraphs)) {
    for (const p of ocrData.paragraphs) {
      if (Array.isArray(p.lines)) {
        for (const line of p.lines) push(line.text, line.bbox);
      }
    }
  }
  return out;
};

/** Build fields with layout rects from Tesseract line/word boxes. */
export const parseOcrDataToLayoutFields = (ocrData, imageWidth, imageHeight) => {
  const fields = [];
  const seen = new Set();

  const pushLabel = (rawLabel, bbox) => {
    let label = String(rawLabel || '')
      .replace(/\s+/g, ' ')
      .replace(/\.$/, '')
      .trim();
    label = fixCommonOcrLineTypos(label);
    if (!label || label.length < 2 || label.length > 200) return;
    if (isNoiseOnlyLine(label) || isBrandingOrHeaderNoise(label)) return;
    const key = ocrLineDedupeKey(label);
    if (key.length < 2 || seen.has(key)) return;
    seen.add(key);
    fields.push({
      id: ermFieldId(),
      label,
      type: inferFieldType(label),
      rect: bboxToPercentRect(bbox, imageWidth, imageHeight),
    });
  };

  for (const { text, bbox } of collectOcrLinesWithBbox(ocrData)) {
    if (/^page\s+\d+/i.test(text)) continue;
    let line = fixCommonOcrLineTypos(text);
    if (isNoiseOnlyLine(line) || isBrandingOrHeaderNoise(line)) continue;

    const colonLabels = extractColonLabelsFromLine(line);
    if (colonLabels.length >= 2) {
      const slices = splitBboxSlices(bbox, colonLabels.length);
      colonLabels.forEach((lab, i) => pushLabel(lab, slices[i] || bbox));
      if (fields.length >= 80) return fields;
      continue;
    }

    for (const chunk of expandLineToCandidates(line)) {
      if (isNoiseOnlyLine(chunk) || isBrandingOrHeaderNoise(chunk)) continue;
      const innerColons = extractColonLabelsFromLine(chunk);
      if (innerColons.length >= 2) {
        const slices = splitBboxSlices(bbox, innerColons.length);
        innerColons.forEach((lab, i) => pushLabel(lab, slices[i] || bbox));
      } else if (innerColons.length === 1) {
        pushLabel(innerColons[0], bbox);
      } else {
        const colon = chunk.match(/^(.{1,180}?)[:\uFF1A]\s*(.*)$/);
        if (colon) pushLabel(colon[1].trim(), bbox);
        else {
          const noUnderline = chunk.replace(/\s*[-.:…_]{3,}\s*$/u, '').trim();
          if (noUnderline.length >= 3 && /[A-Za-z]{2,}/.test(noUnderline)) pushLabel(noUnderline, bbox);
        }
      }
      if (fields.length >= 80) return fields;
    }
  }

  return fields;
};

/** Fallback vertical stack when OCR has text but no usable boxes (re-parse from text). */
export const applyStackedLayoutRects = (fields) => {
  let y = 3;
  return fields.map((f) => {
    if (f.rect && typeof f.rect.x === 'number') return f;
    const rect = { x: 3, y, w: 44, h: 5.5 };
    y = Math.min(92, y + 6.5);
    return { ...f, rect };
  });
};

export const canvasToJpegDataUrl = (canvas, quality = 0.88) => {
  try {
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
};

export const isOcrImageFile = (file) => {
  if (!file) return false;
  const t = String(file.type || '').toLowerCase();
  if (t.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(file.name || '');
};

/**
 * Run Tesseract on an image file. Returns extracted fields and raw OCR text.
 */
export async function runOcrOnImageFile(
  file,
  { enhanceForOcr = true, ocrLayout = 'auto', secondPassColumn = false, onProgress } = {}
) {
  const report = (msg) => {
    if (typeof onProgress === 'function') onProgress(msg);
  };

  report('Preparing image…');
  const image = await prepareImageForOcr(file, enhanceForOcr);

  report('Loading OCR engine…');
  const Tesseract = await import('tesseract.js');
  const createWorker = Tesseract.createWorker || Tesseract.default?.createWorker;
  const PSM = Tesseract.PSM || Tesseract.default?.PSM;
  if (!createWorker) throw new Error('OCR module did not load correctly.');

  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        report(`Reading image… ${Math.round(m.progress * 100)}%`);
      }
    },
  });

  const baseParams = {
    user_defined_dpi: '300',
    preserve_interword_spaces: '1',
  };

  const primaryPsm = psmForLayout(PSM, ocrLayout) ?? PSM?.AUTO;
  if (PSM && primaryPsm !== undefined) {
    await worker.setParameters({ ...baseParams, tessedit_pageseg_mode: primaryPsm });
  } else {
    await worker.setParameters(baseParams);
  }

  report('Reading image…');
  const { data: dataPrimary } = await worker.recognize(image);

  let combinedText = dataPrimary?.text || '';
  let layoutData = dataPrimary;

  if (secondPassColumn && PSM) {
    report('Second pass (column layout)…');
    const secondaryPsm = ocrLayout === 'column' ? PSM.AUTO : PSM.SINGLE_COLUMN;
    await worker.setParameters({ ...baseParams, tessedit_pageseg_mode: secondaryPsm });
    const { data: dataColumn } = await worker.recognize(image);
    combinedText = mergeUniqueOcrLines([dataPrimary?.text, dataColumn?.text]);
    if (!layoutData?.lines?.length && dataColumn?.lines?.length) layoutData = dataColumn;
  }

  await worker.terminate();

  const imageWidth = image.width;
  const imageHeight = image.height;
  const rawText = normalizeOcrText(combinedText);
  let fields = parseOcrDataToLayoutFields(layoutData, imageWidth, imageHeight);
  if (fields.length === 0) {
    fields = applyStackedLayoutRects(parseOcrTextToFields(rawText));
  }
  const sourceImage = canvasToJpegDataUrl(image);

  return { rawText, fields, imageWidth, imageHeight, sourceImage };
}
