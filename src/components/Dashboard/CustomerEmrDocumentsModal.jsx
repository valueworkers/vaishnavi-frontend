import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiAlertCircle, FiDownload, FiEye, FiFileText, FiLoader, FiX } from 'react-icons/fi'
import {
  fetchPatientDocuments,
  PATIENT_DOCUMENTS_PAGE_SIZE,
} from '../../api/ermPatientRecordsApi'
import {
  downloadEmrPage,
  EmrDocumentPreviewPanel,
  getEmrDocPages,
  pageLabel,
} from './EmrDocumentPreview'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const formatWhen = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('en-IN')
}

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

const patientLabel = (patient) => {
  const full = String(patient?.full_name ?? '').trim()
  if (full) return full
  if (patient?.patient_id) return `Patient ${patient.patient_id}`
  if (patient?.id != null) return `Patient #${patient.id}`
  return 'Patient'
}

const friendlyLoadError = (error) => {
  const status = error?.response?.status
  if (status === 401 || status === 403) {
    return 'You do not have permission to view these documents. Please sign in again.'
  }
  if (status === 404) return 'No documents were found for this patient.'
  if (status >= 500) return 'The server is unavailable right now. Please try again shortly.'
  if (!error?.response && String(error?.message || '').toLowerCase().includes('network')) {
    return 'Network error. Check your connection and try again.'
  }
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  return 'Could not load EMR documents. Please try again.'
}

const DocumentSkeleton = () => (
  <li className="animate-pulse rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2.5">
    <div className="h-4 w-3/5 rounded bg-slate-200" />
    <div className="h-3 w-full rounded bg-slate-100" />
    <div className="h-3 w-2/5 rounded bg-slate-100" />
    <div className="h-7 w-24 rounded-md bg-slate-200" />
  </li>
)

const CustomerEmrDocumentsModal = ({ patient, onClose }) => {
  const patientPk = patient?.id
  const panelRef = useRef(null)
  const closeButtonRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [documents, setDocuments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [downloadingDocId, setDownloadingDocId] = useState(null)
  const [pagination, setPagination] = useState({
    count: 0,
    current_page: 1,
    total_pages: 1,
    next: null,
    previous: null,
  })

  const loadDocuments = useCallback(
    async ({ page = 1, url } = {}) => {
      if (patientPk == null || patientPk === '') {
        setError('Patient id is missing.')
        setDocuments([])
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError('')
      try {
        const data = await fetchPatientDocuments(patientPk, {
          page,
          pageSize: PATIENT_DOCUMENTS_PAGE_SIZE,
          url,
        })
        setDocuments(Array.isArray(data?.results) ? data.results : [])
        setPagination({
          count: data?.count ?? 0,
          current_page: data?.current_page ?? page,
          total_pages: data?.total_pages ?? 1,
          next: data?.next ?? null,
          previous: data?.previous ?? null,
        })
      } catch (e) {
        setDocuments([])
        setError(friendlyLoadError(e))
      } finally {
        setIsLoading(false)
      }
    },
    [patientPk]
  )

  useEffect(() => {
    loadDocuments({ page: 1 })
  }, [loadDocuments])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (selectedDoc) {
          setSelectedDoc(null)
          return
        }
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, selectedDoc])

  useEffect(() => {
    if (selectedDoc) return
    closeButtonRef.current?.focus()
  }, [selectedDoc])

  useEffect(() => {
    const root = panelRef.current
    if (!root) return undefined

    const handleTab = (e) => {
      if (e.key !== 'Tab') return
      const focusable = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    root.addEventListener('keydown', handleTab)
    return () => root.removeEventListener('keydown', handleTab)
  }, [isLoading, error, documents.length, pagination.current_page, selectedDoc])

  const handleDownloadDoc = async (doc) => {
    const pages = getEmrDocPages(doc)
    if (!pages.length) return
    setDownloadingDocId(doc.id)
    try {
      if (pages.length === 1) {
        await downloadEmrPage(pages[0], doc.title, pageLabel(0))
      } else {
        for (let i = 0; i < pages.length; i += 1) {
          await downloadEmrPage(pages[i], doc.title, pageLabel(i))
        }
      }
    } finally {
      setDownloadingDocId(null)
    }
  }

  const label = patientLabel(patient)
  const emrCount = Number(patient?.emr_count)
  const countHint = Number.isFinite(emrCount) && emrCount > 0 ? emrCount : pagination.count
  const showInitialSkeleton = isLoading && documents.length === 0
  const isPreviewMode = Boolean(selectedDoc)

  const modalContent = (
    <div
      className={`fixed inset-0 z-[9999] flex items-end justify-center p-2 sm:items-center sm:p-4 motion-reduce:transition-none transition-opacity duration-200 ease-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-emr-modal-title"
      aria-describedby="customer-emr-modal-desc"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 motion-reduce:transition-none transition-opacity duration-200 ease-out"
        onClick={onClose}
        aria-label="Close EMR documents dialog"
      />

      <div
        ref={panelRef}
        className={`relative flex max-h-[min(92vh,900px)] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl motion-reduce:transition-none transition-all duration-200 ease-out ${
          isPreviewMode ? 'max-w-5xl' : 'max-w-2xl'
        } ${visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.98] opacity-0 sm:translate-y-0'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-3 py-3 sm:px-4">
          <div className="min-w-0">
            <h2 id="customer-emr-modal-title" className="text-sm font-bold text-slate-900 sm:text-base">
              {isPreviewMode ? selectedDoc?.title || 'Document preview' : 'EMR Documents'}
            </h2>
            <p id="customer-emr-modal-desc" className="mt-0.5 text-[11px] text-slate-600 sm:text-xs">
              {label}
              {patient?.patient_id ? (
                <span className="text-slate-500"> · ID {patient.patient_id}</span>
              ) : null}
              {!isPreviewMode && countHint ? (
                <span className="text-slate-500">
                  {' '}
                  · {countHint} document{countHint !== 1 ? 's' : ''}
                </span>
              ) : null}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 p-1.5 text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            aria-label="Close EMR documents"
          >
            <FiX className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4">
          {isPreviewMode ? (
            <EmrDocumentPreviewPanel doc={selectedDoc} onBack={() => setSelectedDoc(null)} />
          ) : (
            <div className="relative min-h-0 flex-1 overflow-y-auto">
              {isLoading && documents.length > 0 ? (
                <div
                  className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/60"
                  aria-live="polite"
                  aria-busy="true"
                >
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
                    <FiLoader className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    Loading…
                  </span>
                </div>
              ) : null}

              {showInitialSkeleton ? (
                <ul className="space-y-2" aria-busy="true" aria-label="Loading documents">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <DocumentSkeleton key={`doc-skeleton-${index}`} />
                  ))}
                </ul>
              ) : error ? (
                <div className="flex flex-col items-center rounded-lg border border-rose-200 bg-rose-50 px-4 py-8 text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
                    <FiAlertCircle className="h-6 w-6 text-rose-600" aria-hidden="true" />
                  </span>
                  <h3 className="text-sm font-semibold text-rose-900">Could not load documents</h3>
                  <p className="mt-1 max-w-sm text-xs text-rose-800">{error}</p>
                  <button
                    type="button"
                    onClick={() => loadDocuments({ page: pagination.current_page })}
                    className="mt-4 rounded-md border border-rose-300 bg-white px-4 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                  >
                    Retry
                  </button>
                </div>
              ) : documents.length === 0 ? (
                <div className="flex flex-col items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <FiFileText className="h-6 w-6 text-slate-400" aria-hidden="true" />
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900">No documents yet</h3>
                  <p className="mt-1 max-w-sm text-xs text-slate-600">
                    This patient has no EMR documents on file. Documents uploaded from the EMR section will appear here.
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-4 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <ul className="space-y-2" aria-live="polite">
                  {documents.map((doc) => {
                    const pages = getEmrDocPages(doc)
                    const fileUrl = pages[0]?.dataUrl || ''
                    const fileName = fileNameFromUrl(fileUrl)
                    const pageCount = pages.length
                    const isDownloading = downloadingDocId === doc.id
                    return (
                      <li
                        key={doc.id}
                        className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 transition-shadow hover:shadow-sm sm:p-3"
                      >
                        <p className="text-sm font-semibold text-slate-900">{doc.title || 'Document'}</p>
                        {doc.remarks ? (
                          <p className="mt-0.5 text-[11px] text-slate-600">{doc.remarks}</p>
                        ) : null}
                        <p className="mt-1 text-[10px] text-slate-500 sm:text-[11px]">
                          {doc.uploadedByName ? (
                            <span>
                              Uploaded by{' '}
                              <span className="font-medium text-slate-700">{doc.uploadedByName}</span>
                              {' · '}
                            </span>
                          ) : null}
                          {formatWhen(doc.createdAt)}
                          {pageCount > 1 ? ` · ${pageCount} files` : fileName ? ` · ${fileName}` : ''}
                        </p>
                        {pageCount > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedDoc(doc)}
                              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                            >
                              <FiEye className="h-3 w-3" aria-hidden="true" />
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadDoc(doc)}
                              disabled={isDownloading}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <FiDownload className="h-3 w-3" aria-hidden="true" />
                              {isDownloading ? 'Downloading…' : 'Download'}
                            </button>
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] text-slate-500">No file attached.</p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {!isPreviewMode && !error && (pagination.total_pages > 1 || pagination.next || pagination.previous) ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 sm:px-4">
            <p className="text-[11px] text-slate-600">
              Page {pagination.current_page} of {pagination.total_pages}
              {pagination.count ? ` (${pagination.count} total)` : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!pagination.previous || isLoading}
                onClick={() => loadDocuments({ url: pagination.previous })}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!pagination.next || isLoading}
                onClick={() => loadDocuments({ url: pagination.next })}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null
}

export default CustomerEmrDocumentsModal
