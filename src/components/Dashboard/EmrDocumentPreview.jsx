import { useEffect, useMemo, useState } from 'react'
import { FiChevronLeft, FiDownload } from 'react-icons/fi'

const fileNameFromUrl = (url) => {
  if (!url) return 'document'
  try {
    const path = new URL(String(url)).pathname
    const base = path.split('/').filter(Boolean).pop() || 'document'
    return decodeURIComponent(base)
  } catch {
    const parts = String(url).split('/').filter(Boolean)
    return parts.pop() || 'document'
  }
}

const IMAGE_EXT_RE =
  /^(jpe?g|png|gif|webp|bmp|svg|tiff?|tif|heic|heif|avif|ico|jfif|pjpeg|pjp|apng)$/i
const VIDEO_EXT_RE =
  /^(mp4|webm|mov|avi|mkv|m4v|ogv|wmv|3gp|3g2|mpeg|mpg|qt|flv)$/i

const extOf = (name) => {
  const m = String(name || '').match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : ''
}

const mimeFromFileName = (fileName) => {
  const ext = extOf(fileName)
  if (!ext) return ''
  if (ext === 'pdf') return 'application/pdf'
  if (IMAGE_EXT_RE.test(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`
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
    }
    return videoMap[ext] || 'video/mp4'
  }
  if (ext === 'csv') return 'text/csv'
  if (ext === 'xls') return 'application/vnd.ms-excel'
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  return ''
}

const resolveMime = (page) =>
  String(
    page?.mimeType || page?.type || mimeFromFileName(page?.fileName || fileNameFromUrl(page?.dataUrl || '')) || ''
  ).toLowerCase()

export const getEmrDocPages = (doc) => {
  if (Array.isArray(doc?.pages) && doc.pages.length > 0) {
    return doc.pages.filter((p) => p?.dataUrl)
  }
  const fileUrl = doc?.fileUrl || doc?.file
  if (fileUrl) {
    const fileName = fileNameFromUrl(fileUrl)
    return [
      {
        id: `file-${doc.id}`,
        dataUrl: fileUrl,
        fileName,
        mimeType: mimeFromFileName(fileName),
      },
    ]
  }
  return []
}

const fileKind = (page) => {
  const url = String(page?.dataUrl || '')
  const ext = extOf(page?.fileName || fileNameFromUrl(url))
  const mime = resolveMime(page)

  if (
    mime.startsWith('video/') ||
    VIDEO_EXT_RE.test(ext) ||
    url.includes('/video/upload/') ||
    /\.(mp4|webm|mov|m4v|avi|mkv|wmv|mpeg|mpg|3gp|3g2|ogv)(\?|$)/i.test(url)
  ) {
    return 'video'
  }
  if (
    (url.includes('/image/upload/') || url.includes('res.cloudinary.com')) &&
    !/\.pdf(\?|$)/i.test(url)
  ) {
    if (!ext || IMAGE_EXT_RE.test(ext)) return 'image'
  }
  if (mime.startsWith('image/') || IMAGE_EXT_RE.test(ext)) return 'image'
  if (mime.includes('pdf') || ext === 'pdf') return 'pdf'
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'application/vnd.ms-excel' ||
    /^(xlsx?|xls)$/.test(ext)
  ) {
    return 'excel'
  }
  if (mime.includes('csv') || ext === 'csv') return 'csv'
  return 'other'
}

const pageLabel = (index) => `Page ${index + 1}`

const kindLabel = (page) => {
  const k = fileKind(page)
  if (k === 'pdf') return 'PDF'
  if (k === 'excel') return 'Excel'
  if (k === 'csv') return 'CSV'
  if (k === 'image') return 'Image'
  if (k === 'video') return 'Video'
  return 'File'
}

const downloadFileName = (docTitle, label, page) => {
  if (page?.fileName) return page.fileName
  const safe = String(docTitle || 'document')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
  const ext = extOf(page?.fileName) || (fileKind(page) === 'pdf' ? 'pdf' : 'bin')
  return `${safe}-${label.replace(/\s+/g, '-').toLowerCase()}.${ext}`
}

export const downloadEmrPage = async (page, docTitle, label) => {
  if (!page?.dataUrl) return
  const href = String(page.dataUrl)
  const fileName = downloadFileName(docTitle, label, page)

  try {
    if (href.startsWith('http://') || href.startsWith('https://')) {
      const response = await fetch(href, { mode: 'cors' })
      if (!response.ok) throw new Error('fetch failed')
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      return
    }
  } catch {
    // Fall through to direct link download.
  }

  const a = document.createElement('a')
  a.href = href
  a.download = fileName
  if (href.startsWith('http://') || href.startsWith('https://')) {
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
  }
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const decodeDataUrlText = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return ''
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return ''
  try {
    return decodeURIComponent(escape(atob(dataUrl.slice(comma + 1))))
  } catch {
    try {
      return atob(dataUrl.slice(comma + 1))
    } catch {
      return ''
    }
  }
}

const PdfPreview = ({ src, title, label }) => {
  const [blobUrl, setBlobUrl] = useState('')

  useEffect(() => {
    if (!src) {
      setBlobUrl('')
      return undefined
    }
    if (!String(src).startsWith('data:')) {
      setBlobUrl(src)
      return undefined
    }
    let revoked = ''
    fetch(src)
      .then((r) => r.blob())
      .then((blob) => {
        revoked = URL.createObjectURL(blob)
        setBlobUrl(revoked)
      })
      .catch(() => setBlobUrl(src))
    return () => {
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [src])

  const displaySrc = blobUrl || src
  if (!displaySrc) return null

  return (
    <iframe
      title={`${title} ${label}`}
      src={displaySrc}
      className="h-full min-h-[45vh] w-full rounded-lg border border-slate-300 bg-white sm:min-h-[55vh]"
    />
  )
}

const EmrFilePreview = ({ page, docTitle, label }) => {
  const kind = fileKind(page)
  if (kind === 'image') {
    return (
      <img
        src={page.dataUrl}
        alt={`${docTitle} ${label}`}
        referrerPolicy="no-referrer"
        className="max-h-[min(65vh,720px)] w-auto max-w-full rounded-lg bg-white object-contain shadow-md"
      />
    )
  }
  if (kind === 'pdf') {
    return (
      <div className="flex h-full min-h-[45vh] w-full flex-col sm:min-h-[55vh]">
        <PdfPreview src={page.dataUrl} title={docTitle} label={label} />
      </div>
    )
  }
  if (kind === 'video') {
    return (
      <video
        src={page.dataUrl}
        controls
        playsInline
        className="max-h-[min(65vh,720px)] w-auto max-w-full rounded-lg bg-black shadow-md"
      >
        <track kind="captions" />
        Your browser does not support video playback.
      </video>
    )
  }
  if (kind === 'csv') {
    const text = decodeDataUrlText(page.dataUrl)
    const preview = text.length > 12000 ? `${text.slice(0, 12000)}\n… (truncated)` : text
    return (
      <div className="max-h-[min(65vh,720px)] w-full max-w-4xl overflow-auto rounded-lg border border-slate-300 bg-white p-3 shadow-md">
        <pre className="whitespace-pre-wrap font-mono text-xs text-slate-800">{preview || 'Empty file'}</pre>
      </div>
    )
  }
  return (
    <div className="max-w-md rounded-xl border border-slate-200 bg-white px-8 py-10 text-center shadow-md">
      <p className="text-4xl mb-3" aria-hidden>
        {kind === 'excel' ? '📊' : '📄'}
      </p>
      <p className="text-sm font-semibold text-gray-900">{page.fileName || label}</p>
      <p className="mt-1 text-xs text-slate-500">
        {kindLabel(page)} — preview not available in the browser. Use download to open.
      </p>
    </div>
  )
}

export const EmrDocumentPreviewPanel = ({ doc, onBack }) => {
  const pages = useMemo(() => getEmrDocPages(doc), [doc])
  const [activeIndex, setActiveIndex] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)

  useEffect(() => {
    setActiveIndex(0)
  }, [doc?.id])

  if (!pages.length) {
    return (
      <div className="flex flex-col items-center px-4 py-10 text-center">
        <p className="text-sm text-slate-600">No file attached to this document.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Back to list
        </button>
      </div>
    )
  }

  const page = pages[activeIndex] || pages[0]
  const label = pageLabel(activeIndex)

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      await downloadEmrPage(page, doc.title, label)
    } finally {
      setIsDownloading(false)
    }
  }

  const handleDownloadAll = async () => {
    setIsDownloading(true)
    try {
      for (let i = 0; i < pages.length; i += 1) {
        await downloadEmrPage(pages[i], doc.title, pageLabel(i))
      }
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          <FiChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {pages.length > 1 ? (
            <div className="flex max-w-[min(100%,280px)] flex-wrap gap-1">
              {pages.map((p, i) => (
                <button
                  key={p.id || i}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                    activeIndex === i
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiDownload className="h-3 w-3" aria-hidden="true" />
            {isDownloading ? 'Downloading…' : 'Download'}
          </button>
          {pages.length > 1 ? (
            <button
              type="button"
              onClick={handleDownloadAll}
              disabled={isDownloading}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download all
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-auto py-3">
        <p className="mb-2 text-xs font-medium text-slate-700">{doc.title || 'Document'}</p>
        <p className="mb-3 text-[10px] text-slate-500 sm:text-[11px]">
          {label} · {page.fileName || kindLabel(page)}
          {pages.length > 1 ? ` · ${pages.length} files` : ''}
        </p>
        <div className="flex min-h-[45vh] items-center justify-center rounded-lg bg-slate-100/80 p-2 sm:min-h-[55vh] sm:p-4">
          <EmrFilePreview page={page} docTitle={doc.title} label={label} />
        </div>
      </div>
    </div>
  )
}

export { kindLabel, pageLabel }
