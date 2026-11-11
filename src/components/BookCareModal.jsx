import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { FiX } from 'react-icons/fi'

export const OPEN_BOOK_CARE_EVENT = 'book-care:open'

export const openBookCare = () => {
  window.dispatchEvent(new CustomEvent(OPEN_BOOK_CARE_EVENT))
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const BookCareModal = () => {
  const titleId = useId()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const restoreFocusRef = useRef(null)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_BOOK_CARE_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_BOOK_CARE_EVENT, onOpen)
  }, [])

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return undefined
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const nodes = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter(
        (el) => el instanceof HTMLElement
      )
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      restoreFocusRef.current?.focus?.()
    }
  }, [open, close])

  const isAuthenticated = () => {
    const accessToken = localStorage.getItem('access_token')
    const user = localStorage.getItem('authUser')
    return !!(accessToken || user)
  }

  const go = (path, state) => {
    close()
    if (!isAuthenticated()) {
      navigate('/login')
      return
    }
    navigate(path, { state })
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 transition-opacity duration-200"
        aria-label="Close book care dialog"
        onClick={close}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-md motion-safe:animate-[fadeScaleIn_0.22s_ease-out] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900 sm:text-lg">
            Book care
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 active:scale-[0.98]"
            aria-label="Close"
          >
            <FiX className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-sm text-slate-600">Choose where care should begin.</p>
          <div className="mt-4 space-y-2.5">
            <button
              type="button"
              onClick={() => go('/in-house', { locationType: 'In House' })}
              className="block w-full rounded-xl border border-slate-200 bg-white p-3.5 text-left transition-colors duration-150 hover:border-teal-500 hover:bg-teal-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 active:scale-[0.99] group"
            >
              <h3 className="text-base font-semibold text-slate-900 group-hover:text-teal-700">
                At Vaishnavi Medicare premises
              </h3>
              <p className="mt-0.5 text-sm text-slate-600">In-facility nursing and assisted living</p>
            </button>
            <button
              type="button"
              onClick={() => go('/senior-care', { locationType: 'Client Location' })}
              className="block w-full rounded-xl border border-slate-200 bg-white p-3.5 text-left transition-colors duration-150 hover:border-teal-500 hover:bg-teal-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 active:scale-[0.99] group"
            >
              <h3 className="text-base font-semibold text-slate-900 group-hover:text-teal-700">
                At your location
              </h3>
              <p className="mt-0.5 text-sm text-slate-600">Home nursing and caregiver support</p>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default BookCareModal
