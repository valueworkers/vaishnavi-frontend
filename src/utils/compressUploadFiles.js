const IMAGE_EXT_RE =
  /^(jpe?g|png|gif|webp|bmp|tiff?|tif|heic|heif|avif|ico|jfif|pjpeg|pjp|apng)$/i;
const VIDEO_EXT_RE =
  /^(mp4|webm|mov|avi|mkv|m4v|ogv|wmv|3gp|3g2|mpeg|mpg|qt|flv)$/i;
const SPREADSHEET_EXT_RE = /^(xlsx?|xls|csv)$/i;
const PDF_EXT_RE = /^pdf$/i;

const SKIP_COMPRESS_EXT_RE = /^(gif|svg)$/i;

const fileExt = (file) =>
  String(file?.name || '')
    .match(/\.([a-z0-9]+)$/i)?.[1]
    ?.toLowerCase() || '';

export const isCompressibleImage = (file) => {
  if (!file) return false;
  const t = String(file.type || '').toLowerCase();
  if (t.startsWith('image/') && !t.includes('gif') && !t.includes('svg')) return true;
  const ext = String(file.name || '')
    .match(/\.([a-z0-9]+)$/i)?.[1]
    ?.toLowerCase();
  return Boolean(ext && IMAGE_EXT_RE.test(ext) && !SKIP_COMPRESS_EXT_RE.test(ext));
};

export const isCompressibleVideo = (file) => {
  if (!file) return false;
  const t = String(file.type || '').toLowerCase();
  if (t.startsWith('video/')) return true;
  return Boolean(fileExt(file) && VIDEO_EXT_RE.test(fileExt(file)));
};

export const isCompressiblePdf = (file) => {
  if (!file) return false;
  const t = String(file.type || '').toLowerCase();
  if (t === 'application/pdf') return true;
  return PDF_EXT_RE.test(fileExt(file));
};

export const isCompressibleSpreadsheet = (file) => {
  if (!file) return false;
  const t = String(file.type || '').toLowerCase();
  if (
    t.includes('spreadsheet') ||
    t.includes('excel') ||
    t.includes('csv') ||
    t === 'text/csv'
  ) {
    return true;
  }
  return Boolean(fileExt(file) && SPREADSHEET_EXT_RE.test(fileExt(file)));
};

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not compress image'))),
      type,
      quality
    );
  });

const compressedFileName = (originalName, newExt) => {
  const base = String(originalName || 'file').replace(/\.[^.]+$/, '');
  return `${base}-compressed.${newExt}`;
};

/**
 * Resize + JPEG re-encode for photos/screenshots.
 */
export async function compressImageFile(file, { maxDimension = 1920, maxBytes } = {}) {
  if (!isCompressibleImage(file)) return { file, compressed: false, originalSize: file.size };

  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const scale = Math.min(1, maxDimension / width, maxDimension / height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { file, compressed: false, originalSize: file.size };
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.82;
    let blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    const target = maxBytes || file.size;
    while (blob.size > target && quality > 0.4) {
      quality -= 0.08;
      blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    }

    const out = new File([blob], compressedFileName(file.name, 'jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
    const compressed = out.size < file.size;
    return {
      file: compressed ? out : file,
      compressed,
      originalSize: file.size,
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Re-encode video at lower resolution/bitrate when MediaRecorder is available.
 * Falls back to original file if compression fails.
 */
export async function compressVideoFile(
  file,
  { maxWidth = 960, videoBitsPerSecond = 700_000, maxBytes } = {}
) {
  if (!isCompressibleVideo(file)) return { file, compressed: false, originalSize: file.size };
  if (typeof MediaRecorder === 'undefined' || !document.createElement('canvas').captureStream) {
    return { file, compressed: false, originalSize: file.size };
  }

  const mimeType = ['video/webm;codecs=vp8', 'video/webm'].find((m) =>
    MediaRecorder.isTypeSupported(m)
  );
  if (!mimeType) return { file, compressed: false, originalSize: file.size };

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not read video'));
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 120) {
      return { file, compressed: false, originalSize: file.size };
    }

    const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
    const w = Math.max(2, Math.round((video.videoWidth || maxWidth) * scale));
    const h = Math.max(2, Math.round((video.videoHeight || maxWidth) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const fps = 20;
    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };

    const recorded = new Promise((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error('Video compression failed'));
    });

    recorder.start(250);
    video.currentTime = 0;
    await video.play();

    await new Promise((resolve) => {
      const start = performance.now();
      const tick = () => {
        if (video.paused || video.ended) {
          resolve();
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        if (performance.now() - start > (duration + 3) * 1000) {
          video.pause();
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });

    video.pause();
    if (recorder.state !== 'inactive') recorder.stop();
    await recorded;

    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) return { file, compressed: false, originalSize: file.size };

    const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
    const out = new File([blob], compressedFileName(file.name, ext), {
      type: mimeType,
      lastModified: Date.now(),
    });

    if (out.size >= file.size) return { file, compressed: false, originalSize: file.size };
    return { file: out, compressed: true, originalSize: file.size };
  } catch {
    return { file, compressed: false, originalSize: file.size };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

/**
 * Re-save PDF with object streams (strips bloat when possible). Encrypted PDFs are skipped.
 */
export async function compressPdfFile(file) {
  if (!isCompressiblePdf(file)) return { file, compressed: false, originalSize: file.size };

  try {
    const { PDFDocument } = await import('pdf-lib');
    const bytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const saved = await pdfDoc.save({ useObjectStreams: true });
    const out = new File([saved], compressedFileName(file.name, 'pdf'), {
      type: 'application/pdf',
      lastModified: Date.now(),
    });
    if (out.size >= file.size) return { file, compressed: false, originalSize: file.size };
    return { file: out, compressed: true, originalSize: file.size };
  } catch {
    return { file, compressed: false, originalSize: file.size };
  }
}

/**
 * Re-export spreadsheet via SheetJS (zip compression for xlsx, trimmed CSV).
 */
export async function compressSpreadsheetFile(file) {
  if (!isCompressibleSpreadsheet(file)) {
    return { file, compressed: false, originalSize: file.size };
  }

  try {
    const XLSX = await import('xlsx');
    const ext = fileExt(file);
    const bookType = ext === 'csv' ? 'csv' : ext === 'xls' ? 'xls' : 'xlsx';
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array', raw: bookType === 'csv' });
    const outArr = XLSX.write(wb, {
      bookType,
      type: 'array',
      compression: bookType === 'xlsx',
    });
    const mime =
      bookType === 'csv'
        ? 'text/csv'
        : bookType === 'xls'
          ? 'application/vnd.ms-excel'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const out = new File([outArr], compressedFileName(file.name, bookType), {
      type: mime,
      lastModified: Date.now(),
    });
    if (out.size >= file.size) return { file, compressed: false, originalSize: file.size };
    return { file: out, compressed: true, originalSize: file.size };
  } catch {
    return { file, compressed: false, originalSize: file.size };
  }
}

export async function compressFileForUpload(file, options = {}) {
  const { quick = false } = options;
  if (isCompressibleImage(file)) return compressImageFile(file, options);
  if (isCompressibleVideo(file)) {
    if (quick) return { file, compressed: false, originalSize: file?.size || 0 };
    return compressVideoFile(file, {
      maxWidth: options.maxWidth,
      videoBitsPerSecond: options.videoBitsPerSecond,
      maxBytes: options.maxBytes,
    });
  }
  if (isCompressiblePdf(file)) return compressPdfFile(file);
  if (isCompressibleSpreadsheet(file)) return compressSpreadsheetFile(file);
  return { file, compressed: false, originalSize: file?.size || 0 };
}

/**
 * Compress images, videos, PDF, and spreadsheets before upload.
 */
export async function compressFilesForUpload(files, { maxTotalBytes, onProgress } = {}) {
  const list = Array.isArray(files) ? files : [];
  const targetPerFile =
    maxTotalBytes && list.length
      ? Math.floor(maxTotalBytes / list.length)
      : undefined;

  const results = [];
  let anyCompressed = false;

  for (let i = 0; i < list.length; i += 1) {
    onProgress?.(i + 1, list.length, list[i]?.name);
    const item = await compressFileForUpload(list[i], {
      maxBytes: targetPerFile,
      maxDimension: 1920,
    });
    if (item.compressed) anyCompressed = true;
    results.push(item);
  }

  return {
    files: results.map((r) => r.file),
    meta: results.map((r) => ({
      originalSize: r.originalSize,
      compressed: r.compressed,
      finalSize: r.file?.size || 0,
    })),
    anyCompressed,
  };
}
