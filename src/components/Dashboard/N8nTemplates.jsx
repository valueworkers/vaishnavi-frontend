import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FiCheck, FiChevronDown, FiCopy, FiSearch } from 'react-icons/fi'
import {
  N8N_CATEGORIES,
  N8N_HOW_TO_STEPS,
  N8N_QUICK_PICKS,
  N8N_TEMPLATE_INTRO,
  N8N_TEMPLATES,
} from '../../constants/n8nTemplates'

const SectionDropdown = ({ id, title, subtitle, open, onToggle, children, tone = 'slate' }) => {
  const tones = {
    slate: {
      border: 'border-slate-200',
      head: 'bg-slate-50 hover:bg-slate-100',
      title: 'text-slate-900',
      sub: 'text-slate-500',
    },
    emerald: {
      border: 'border-emerald-100',
      head: 'bg-emerald-50/80 hover:bg-emerald-50',
      title: 'text-emerald-900',
      sub: 'text-emerald-800/80',
    },
    indigo: {
      border: 'border-indigo-100',
      head: 'bg-indigo-50/70 hover:bg-indigo-50',
      title: 'text-indigo-900',
      sub: 'text-indigo-800/80',
    },
  }
  const t = tones[tone] || tones.slate

  return (
    <section className={`overflow-hidden rounded-xl border ${t.border} bg-white shadow-sm`}>
      <button
        type="button"
        id={`${id}-trigger`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
        className={`flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition-colors sm:px-4 ${t.head}`}
      >
        <span className="min-w-0">
          <span className={`block text-sm font-semibold ${t.title}`}>{title}</span>
          {subtitle ? <span className={`mt-0.5 block text-xs ${t.sub}`}>{subtitle}</span> : null}
        </span>
        <FiChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>
      {open ? (
        <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-trigger`} className="border-t border-slate-100 px-3 py-3 sm:px-4">
          {children}
        </div>
      ) : null}
    </section>
  )
}

const N8nTemplates = () => {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [copiedId, setCopiedId] = useState('')
  const [highlightId, setHighlightId] = useState('')
  const [openSections, setOpenSections] = useState({
    howto: true,
    quick: false,
  })
  const [openTemplates, setOpenTemplates] = useState({})
  const cardRefs = useRef({})

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return N8N_TEMPLATES.filter((t) => {
      if (!showAdvanced && t.advanced) return false
      if (category !== 'All' && t.category !== category) return false
      if (!q) return true
      const hay = [
        t.plainTitle,
        t.title,
        t.purpose,
        t.howToSend,
        t.format,
        t.category,
        ...(t.tips || []),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [search, category, showAdvanced])

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleTemplate = (id) => {
    setOpenTemplates((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const isTemplateOpen = (id) => Boolean(openTemplates[id]) || highlightId === id

  const getCopyText = (tpl) => {
    if (!tpl.joinWithPipe) return tpl.format
    return tpl.format
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('|')
  }

  const copyFormat = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId(''), 1600)
    } catch {
      setCopiedId('')
    }
  }

  const jumpTo = (id) => {
    const tpl = N8N_TEMPLATES.find((t) => t.id === id)
    if (tpl?.advanced) setShowAdvanced(true)
    setCategory('All')
    setSearch('')
    setHighlightId(id)
    setOpenTemplates((prev) => ({ ...prev, [id]: true }))
  }

  useEffect(() => {
    if (!highlightId) return
    const el = cardRefs.current[highlightId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    const t = window.setTimeout(() => setHighlightId(''), 2200)
    return () => window.clearTimeout(t)
  }, [highlightId, filtered])

  return (
    <div className="w-full min-w-0">
      <header className="mb-4">
        <h2 className="text-lg font-bold text-gray-800 sm:text-xl">WhatsApp message guides</h2>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">{N8N_TEMPLATE_INTRO}</p>
        <p className="mt-1 text-xs text-gray-500">
          Also listed in the sidebar as <span className="font-medium text-gray-700">n8n Templates</span>.
        </p>
      </header>

      <div className="mb-4 space-y-2">
        <SectionDropdown
          id="n8n-howto"
          title="How to use (4 steps)"
          subtitle={openSections.howto ? undefined : 'Click to expand'}
          open={Boolean(openSections.howto)}
          onToggle={() => toggleSection('howto')}
          tone="emerald"
        >
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-800">
            {N8N_HOW_TO_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </SectionDropdown>

        <SectionDropdown
          id="n8n-quick"
          title="I want to…"
          subtitle="Tap a task to jump to the right message"
          open={Boolean(openSections.quick)}
          onToggle={() => toggleSection('quick')}
          tone="indigo"
        >
          <div className="flex flex-wrap gap-2">
            {N8N_QUICK_PICKS.map((pick) => (
              <button
                key={pick.id}
                type="button"
                onClick={() => jumpTo(pick.id)}
                className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-800 transition-colors hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {pick.label}
              </button>
            ))}
          </div>
        </SectionDropdown>
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by category">
          {N8N_CATEGORIES.filter((c) => showAdvanced || c !== 'Technical setup').map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                category === c
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={showAdvanced}
              onChange={(e) => {
                setShowAdvanced(e.target.checked)
                if (!e.target.checked && category === 'Technical setup') setCategory('All')
              }}
              className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Show IT / auto jobs
          </label>
          <label className="relative block w-full sm:w-56">
            <span className="sr-only">Search</span>
            <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search (payment, booking…)"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-8 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center shadow-sm">
          <p className="text-sm font-medium text-gray-800">Nothing matched</p>
          <p className="mt-1 text-xs text-gray-500">Try another word, or choose “All”.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((tpl) => {
            const open = isTemplateOpen(tpl.id)
            return (
              <article
                key={tpl.id}
                ref={(node) => {
                  cardRefs.current[tpl.id] = node
                }}
                className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow ${
                  highlightId === tpl.id
                    ? 'border-indigo-400 ring-2 ring-indigo-200'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-stretch gap-1">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleTemplate(tpl.id)}
                    className="flex min-w-0 flex-1 items-start justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 sm:px-4"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {!tpl.whatsappMessage ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                            No WhatsApp message
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                            Send on WhatsApp
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-gray-900">{tpl.plainTitle}</span>
                    </span>
                    <FiChevronDown
                      className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                        open ? 'rotate-180' : ''
                      }`}
                      aria-hidden
                    />
                  </button>
                  {tpl.whatsappMessage ? (
                    <div className="flex items-center border-l border-slate-100 pr-2 sm:pr-3">
                      <button
                        type="button"
                        onClick={() => copyFormat(tpl.id, getCopyText(tpl))}
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      >
                        {copiedId === tpl.id ? (
                          <>
                            <FiCheck className="h-3.5 w-3.5" />
                            Copied
                          </>
                        ) : (
                          <>
                            <FiCopy className="h-3.5 w-3.5" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  ) : null}
                </div>

                {open ? (
                  <div className="border-t border-slate-100 px-3 py-3 sm:px-4">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                        <p className="text-[11px] font-semibold text-slate-500">What this does</p>
                        <p className="mt-0.5 text-sm text-gray-800">{tpl.purpose}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                        <p className="text-[11px] font-semibold text-slate-500">How to send it</p>
                        <p className="mt-0.5 text-sm text-gray-800">{tpl.howToSend}</p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <p className="mb-1.5 text-[11px] font-semibold text-slate-500">{tpl.formatLabel}</p>
                      {tpl.joinWithPipe ? (
                        <p className="mb-1 text-xs text-indigo-700">
                          Shown on multiple lines for reading. <span className="font-semibold">Copy</span> joins them
                          into one WhatsApp line with |.
                        </p>
                      ) : null}
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-slate-50 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-gray-900 sm:text-sm">
                        {tpl.format}
                      </pre>
                    </div>

                    {tpl.tips?.length ? (
                      <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2">
                        <p className="text-[11px] font-semibold text-amber-900">Tips</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-950/90 sm:text-sm">
                          {tpl.tips.map((tip) => (
                            <li key={tip}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default N8nTemplates
