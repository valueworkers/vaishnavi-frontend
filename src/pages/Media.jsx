import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FiBookOpen,
  FiEdit2,
  FiImage,
  FiMessageCircle,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiVideo,
  FiX,
} from 'react-icons/fi'
import AlertModal from '../components/AlertModal'
import { hasOwnerPrivileges } from '../utils/authRoles'

const TABS = [
  { id: 'photos', label: 'Photos', icon: FiImage },
  { id: 'blogs', label: 'Blogs', icon: FiBookOpen },
  { id: 'videos', label: 'Videos', icon: FiVideo },
  { id: 'discussions', label: 'Discussions', icon: FiMessageCircle },
]

const EMPTY_FORMS = {
  photos: { title: '', caption: '', imageUrl: '' },
  blogs: { title: '', excerpt: '', content: '', coverUrl: '' },
  videos: { title: '', description: '', embedUrl: '' },
  discussions: { title: '', body: '', author: '' },
}

const INITIAL_DATA = {
  photos: [
    {
      id: 'photo-1',
      title: 'Malleshwaram care facility',
      caption: 'Our primary care unit near Spire Hospital.',
      imageUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800&q=80',
      createdAt: '2026-08-12',
    },
    {
      id: 'photo-2',
      title: 'Home nursing visit',
      caption: 'Care professionals supporting families at home.',
      imageUrl: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&q=80',
      createdAt: '2026-08-20',
    },
    {
      id: 'photo-3',
      title: 'Team training day',
      caption: 'Ongoing clinical and patient-communication training.',
      imageUrl: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&q=80',
      createdAt: '2026-09-01',
    },
  ],
  blogs: [
    {
      id: 'blog-1',
      title: 'How to prepare your home for senior care',
      excerpt: 'Simple steps families can take before a caregiver arrives.',
      content:
        'Preparing a safe, calm space helps your loved one settle into care. Clear walkways, keep medications organized, and share daily routines with the care team.',
      coverUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=80',
      createdAt: '2026-07-18',
    },
    {
      id: 'blog-2',
      title: 'What to expect in the first week of home nursing',
      excerpt: 'A practical guide for families starting care services.',
      content:
        'The first week focuses on assessment, trust-building, and routine. Families receive updates, medication schedules, and clear escalation paths for concerns.',
      coverUrl: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=800&q=80',
      createdAt: '2026-08-05',
    },
  ],
  videos: [
    {
      id: 'video-1',
      title: 'About our care approach',
      description: 'A quick overview of how we support patients and families.',
      embedUrl: 'https://www.youtube.com/embed/2GQM8XfOO58',
      createdAt: '2026-06-10',
    },
    {
      id: 'video-2',
      title: 'Services & patient journey',
      description: 'Understand service flow from booking to active care.',
      embedUrl: 'https://www.youtube.com/embed/othxZeNjJrI?start=305',
      createdAt: '2026-06-22',
    },
  ],
  discussions: [
    {
      id: 'disc-1',
      title: 'Tips for coordinating care with NRI families',
      body: 'Share what worked for regular updates, hospital coordination, and emergency handoffs when relatives live abroad.',
      author: 'Care Coordinator',
      createdAt: '2026-08-28',
      replies: [
        {
          id: 'reply-1',
          author: 'Priya S.',
          body: 'Weekly WhatsApp updates with vitals and meal photos helped our family in the US stay confident.',
          createdAt: '2026-08-29',
        },
        {
          id: 'reply-2',
          author: 'Rahul M.',
          body: 'Having one care coordinator as the single point of contact made hospital visits much easier.',
          createdAt: '2026-08-30',
        },
      ],
    },
    {
      id: 'disc-2',
      title: 'Questions about palliative support at home',
      body: 'Open thread for families seeking clarity on end-of-life comfort care, symptom monitoring, and caregiver roles.',
      author: 'Community',
      createdAt: '2026-09-04',
      replies: [
        {
          id: 'reply-3',
          author: 'Anita K.',
          body: 'How often does the nurse visit for pain and symptom checks in a typical week?',
          createdAt: '2026-09-05',
        },
      ],
    },
  ],
}

const FIELD_CONFIG = {
  photos: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'caption', label: 'Caption', type: 'textarea', required: false },
    { key: 'imageUrl', label: 'Image URL', type: 'url', required: true },
  ],
  blogs: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'excerpt', label: 'Excerpt', type: 'textarea', required: true },
    { key: 'content', label: 'Content', type: 'textarea', required: true },
    { key: 'coverUrl', label: 'Cover image URL', type: 'url', required: false },
  ],
  videos: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'description', label: 'Description', type: 'textarea', required: false },
    { key: 'embedUrl', label: 'YouTube embed URL', type: 'url', required: true },
  ],
  discussions: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'body', label: 'Discussion', type: 'textarea', required: true },
    { key: 'author', label: 'Author', type: 'text', required: false },
  ],
}

const tabSingular = {
  photos: 'photo',
  blogs: 'blog',
  videos: 'video',
  discussions: 'discussion',
}

const formatDate = (value) => {
  if (!value) return ''
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return value
  }
}

const itemSearchText = (tabId, item) => {
  if (!item) return ''
  const parts = [item.title, item.caption, item.excerpt, item.content, item.description, item.body, item.author]
  if (tabId === 'discussions' && Array.isArray(item.replies)) {
    item.replies.forEach((reply) => {
      parts.push(reply?.author, reply?.body)
    })
  }
  return parts.filter(Boolean).join(' ').toLowerCase()
}

const matchesSearch = (tabId, item, query) => {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  return itemSearchText(tabId, item).includes(q)
}

const Media = () => {
  const [activeTab, setActiveTab] = useState('photos')
  const [searchQuery, setSearchQuery] = useState('')
  const [itemsByTab, setItemsByTab] = useState(INITIAL_DATA)
  const [authUser, setAuthUser] = useState(null)
  const [isLoading] = useState(false)
  const [alertState, setAlertState] = useState({ open: false, type: 'info', message: '' })
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState('add')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORMS.photos)
  const [formErrors, setFormErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, title: '', loading: false })
  const [selectedBlog, setSelectedBlog] = useState(null)
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  const [selectedDiscussion, setSelectedDiscussion] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [isReplying, setIsReplying] = useState(false)

  const canManage = useMemo(() => hasOwnerPrivileges(authUser), [authUser])
  const isLoggedIn = Boolean(authUser)

  const filteredByTab = useMemo(() => {
    const next = {}
    TABS.forEach((tab) => {
      next[tab.id] = (itemsByTab[tab.id] || []).filter((item) => matchesSearch(tab.id, item, searchQuery))
    })
    return next
  }, [itemsByTab, searchQuery])

  const items = filteredByTab[activeTab] || []
  const hasSearch = Boolean(String(searchQuery || '').trim())
  const totalSearchMatches = useMemo(
    () => TABS.reduce((sum, tab) => sum + (filteredByTab[tab.id]?.length || 0), 0),
    [filteredByTab]
  )

  useEffect(() => {
    const syncAuth = () => {
      const stored = localStorage.getItem('authUser')
      setAuthUser(stored ? JSON.parse(stored) : null)
    }
    syncAuth()
    window.addEventListener('storage', syncAuth)
    window.addEventListener('auth-changed', syncAuth)
    return () => {
      window.removeEventListener('storage', syncAuth)
      window.removeEventListener('auth-changed', syncAuth)
    }
  }, [])

  const showAlert = useCallback((message, type = 'info') => {
    setAlertState({ open: true, type, message: String(message) })
  }, [])

  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, open: false }))
  }, [])

  const openAdd = () => {
    setEditorMode('add')
    setEditingId(null)
    setForm({ ...EMPTY_FORMS[activeTab] })
    setFormErrors({})
    setEditorOpen(true)
  }

  const openEdit = (item) => {
    setEditorMode('edit')
    setEditingId(item.id)
    setForm({ ...EMPTY_FORMS[activeTab], ...item })
    setFormErrors({})
    setEditorOpen(true)
  }

  const closeEditor = () => {
    if (isSaving) return
    setEditorOpen(false)
    setEditingId(null)
    setFormErrors({})
  }

  const validateForm = () => {
    const fields = FIELD_CONFIG[activeTab] || []
    const next = {}
    fields.forEach((field) => {
      const value = String(form[field.key] ?? '').trim()
      if (field.required && !value) next[field.key] = `${field.label} is required.`
    })
    setFormErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSave = async () => {
    if (!canManage) {
      showAlert('Only owners can manage media content.', 'warning')
      return
    }
    if (!validateForm()) return

    setIsSaving(true)
    try {
      // API under progress — local mock mutate for UI preview
      await new Promise((r) => setTimeout(r, 350))

      const payload = {
        ...form,
        title: String(form.title || '').trim(),
        createdAt: form.createdAt || new Date().toISOString().slice(0, 10),
      }

      setItemsByTab((prev) => {
        const list = prev[activeTab] || []
        if (editorMode === 'edit' && editingId) {
          return {
            ...prev,
            [activeTab]: list.map((item) => (item.id === editingId ? { ...item, ...payload, id: editingId } : item)),
          }
        }
        return {
          ...prev,
          [activeTab]: [{ ...payload, id: `${activeTab}-${Date.now()}` }, ...list],
        }
      })

      setEditorOpen(false)
      showAlert(
        editorMode === 'edit'
          ? `${tabSingular[activeTab]} updated (UI preview — API coming soon).`
          : `${tabSingular[activeTab]} added (UI preview — API coming soon).`,
        'success'
      )
    } catch {
      showAlert('Something went wrong while saving. Please try again.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const requestDelete = (item) => {
    setDeleteConfirm({
      open: true,
      id: item.id,
      title: item.title || `this ${tabSingular[activeTab]}`,
      loading: false,
    })
  }

  const closeDeleteConfirm = () => {
    setDeleteConfirm((prev) => (prev.loading ? prev : { open: false, id: null, title: '', loading: false }))
  }

  const openDiscussion = (item) => {
    setSelectedDiscussion(item)
    setReplyText('')
  }

  const closeDiscussion = () => {
    if (isReplying) return
    setSelectedDiscussion(null)
    setReplyText('')
  }

  const getReplyAuthorName = () => {
    if (!authUser) return 'Guest'
    const first = authUser.first_name || ''
    const last = authUser.last_name || ''
    const name = `${first} ${last}`.trim()
    return name || authUser.email || 'Member'
  }

  const handlePostReply = async () => {
    if (!selectedDiscussion?.id) return
    if (!isLoggedIn) {
      showAlert('Please log in to reply to a discussion.', 'info')
      return
    }
    const body = replyText.trim()
    if (!body) {
      showAlert('Write a reply before posting.', 'warning')
      return
    }

    setIsReplying(true)
    try {
      await new Promise((r) => setTimeout(r, 300))
      const newReply = {
        id: `reply-${Date.now()}`,
        author: getReplyAuthorName(),
        body,
        createdAt: new Date().toISOString().slice(0, 10),
      }

      setItemsByTab((prev) => {
        const list = (prev.discussions || []).map((item) =>
          item.id === selectedDiscussion.id
            ? { ...item, replies: [...(item.replies || []), newReply] }
            : item
        )
        const updated = list.find((item) => item.id === selectedDiscussion.id)
        if (updated) setSelectedDiscussion(updated)
        return { ...prev, discussions: list }
      })
      setReplyText('')
      showAlert('Reply posted (UI preview — API coming soon).', 'success')
    } catch {
      showAlert('Could not post reply. Please try again.', 'error')
    } finally {
      setIsReplying(false)
    }
  }

  const confirmDelete = async () => {
    if (!canManage || !deleteConfirm.id) {
      closeDeleteConfirm()
      return
    }
    setDeleteConfirm((prev) => ({ ...prev, loading: true }))
    try {
      await new Promise((r) => setTimeout(r, 300))
      setItemsByTab((prev) => ({
        ...prev,
        [activeTab]: (prev[activeTab] || []).filter((item) => item.id !== deleteConfirm.id),
      }))
      setDeleteConfirm({ open: false, id: null, title: '', loading: false })
      showAlert(`${tabSingular[activeTab]} deleted (UI preview — API coming soon).`, 'success')
    } catch {
      setDeleteConfirm((prev) => ({ ...prev, loading: false }))
      showAlert('Could not delete. Please try again.', 'error')
    }
  }

  const OwnerActions = ({ item }) => {
    if (!canManage) return null
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            openEdit(item)
          }}
          className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
          aria-label={`Edit ${item.title}`}
        >
          <FiEdit2 className="h-3 w-3" />
          Edit
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            requestDelete(item)
          }}
          className="inline-flex items-center gap-0.5 rounded-md border border-red-200 bg-white px-1.5 py-1 text-[10px] font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400"
          aria-label={`Delete ${item.title}`}
        >
          <FiTrash2 className="h-3 w-3" />
          Delete
        </button>
      </div>
    )
  }

  const EmptyState = ({ label }) => (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-800">
        {hasSearch ? `No ${label} match your search` : `No ${label} yet`}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {hasSearch
          ? 'Try another keyword, or switch tabs to see matches in Photos, Blogs, Videos, or Discussions.'
          : canManage
            ? `Add the first ${tabSingular[activeTab]} to get started.`
            : 'Check back soon for new content.'}
      </p>
      {hasSearch ? (
        <button
          type="button"
          onClick={() => setSearchQuery('')}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Clear search
        </button>
      ) : canManage ? (
        <button
          type="button"
          onClick={openAdd}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-700"
        >
          <FiPlus className="h-3.5 w-3.5" />
          Add {tabSingular[activeTab]}
        </button>
      ) : null}
    </div>
  )

  const renderPhotos = () => {
    if (!items.length) return <EmptyState label="photos" />
    return (
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item) => (
          <article
            key={item.id}
            className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md"
          >
            <button
              type="button"
              className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-500"
              onClick={() => setLightboxPhoto(item)}
            >
              <div className="aspect-[5/4] max-h-28 overflow-hidden bg-slate-100 sm:max-h-32">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-400">
                    <FiImage className="h-5 w-5" />
                  </div>
                )}
              </div>
            </button>
            <div className="space-y-1.5 p-2">
              <div className="min-w-0">
                <h3 className="truncate text-xs font-semibold text-slate-900">{item.title}</h3>
                {item.caption ? <p className="mt-0.5 text-[11px] text-slate-600 line-clamp-2">{item.caption}</p> : null}
                <p className="mt-1 text-[10px] text-slate-400">{formatDate(item.createdAt)}</p>
              </div>
              <OwnerActions item={item} />
            </div>
          </article>
        ))}
      </div>
    )
  }

  const renderBlogs = () => {
    if (!items.length) return <EmptyState label="blogs" />
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => (
          <article
            key={item.id}
            className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md"
          >
            {item.coverUrl ? (
              <div className="aspect-[16/9] max-h-24 overflow-hidden bg-slate-100">
                <img src={item.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              </div>
            ) : null}
            <div className="flex flex-1 flex-col gap-1.5 p-2.5">
              <div>
                <p className="text-[10px] text-slate-400">{formatDate(item.createdAt)}</p>
                <h3 className="mt-0.5 text-xs font-semibold text-slate-900 line-clamp-2">{item.title}</h3>
                <p className="mt-1 text-[11px] leading-snug text-slate-600 line-clamp-2">{item.excerpt}</p>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedBlog(item)}
                  className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Read more
                </button>
                <OwnerActions item={item} />
              </div>
            </div>
          </article>
        ))}
      </div>
    )
  }

  const renderVideos = () => {
    if (!items.length) return <EmptyState label="videos" />
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm transition-shadow duration-200 hover:shadow-md"
          >
            <div className="aspect-video max-h-28 overflow-hidden rounded-md bg-slate-100 sm:max-h-32">
              {item.embedUrl ? (
                <iframe
                  className="h-full w-full"
                  src={item.embedUrl}
                  title={item.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ) : (
                <div className="flex h-full items-center justify-center text-slate-400">
                  <FiVideo className="h-5 w-5" />
                </div>
              )}
            </div>
            <div className="mt-1.5 space-y-1 px-1 pb-0.5">
              <h3 className="text-xs font-semibold text-slate-900 line-clamp-1">{item.title}</h3>
              {item.description ? <p className="text-[11px] text-slate-600 line-clamp-2">{item.description}</p> : null}
              <p className="text-[10px] text-slate-400">{formatDate(item.createdAt)}</p>
              <OwnerActions item={item} />
            </div>
          </article>
        ))}
      </div>
    )
  }

  const renderDiscussions = () => {
    if (!items.length) return <EmptyState label="discussions" />
    return (
      <>
        <p className="mb-2 text-[11px] text-slate-500">
          Click a discussion to open the thread and reply. Login is required to post a reply.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const replyCount = item.replies?.length || 0
            return (
              <article
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => openDiscussion(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openDiscussion(item)
                  }
                }}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-sm transition-all duration-200 hover:border-teal-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label={`Open discussion: ${item.title}`}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xs font-semibold text-slate-900 line-clamp-2">{item.title}</h3>
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {item.author || 'Community'} · {formatDate(item.createdAt)}
                    </p>
                    <p className="mt-1.5 text-[11px] leading-snug text-slate-600 line-clamp-3">{item.body}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-teal-600">Open thread →</span>
                    <OwnerActions item={item} />
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </>
    )
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="animate-pulse rounded-lg border border-slate-200 bg-white p-2">
              <div className="aspect-[5/4] max-h-28 rounded-md bg-slate-200" />
              <div className="mt-2 h-3 w-2/3 rounded bg-slate-200" />
              <div className="mt-1 h-2 w-full rounded bg-slate-100" />
            </div>
          ))}
        </div>
      )
    }
    if (activeTab === 'photos') return renderPhotos()
    if (activeTab === 'blogs') return renderBlogs()
    if (activeTab === 'videos') return renderVideos()
    return renderDiscussions()
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-600">Media</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Photos, blogs & conversations</h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600">
              Explore stories, videos, and community discussions from Vaishnavi Medicare.
            </p>
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
            >
              <FiPlus className="h-4 w-4" />
              Add {tabSingular[activeTab]}
            </button>
          ) : null}
        </div>

        <div
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          Media APIs are under progress. This page uses preview content so you can review layout and owner
          add / edit / delete flows.
        </div>

        <div className="mt-5">
          <label htmlFor="media-search" className="sr-only">
            Search photos, blogs, videos, and discussions
          </label>
          <div className="relative">
            <FiSearch
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              id="media-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search photos, blogs, videos, discussions…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
            {hasSearch ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Clear search"
              >
                <FiX className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {hasSearch ? (
            <p className="mt-2 text-xs text-slate-500" aria-live="polite">
              {totalSearchMatches === 0
                ? 'No matches across Photos, Blogs, Videos, or Discussions.'
                : `${totalSearchMatches} match${totalSearchMatches === 1 ? '' : 'es'} across all media · showing ${items.length} in ${TABS.find((t) => t.id === activeTab)?.label || 'this tab'}`}
            </p>
          ) : null}
        </div>

        <div className="mt-5 border-b border-slate-200">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Media sections">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              const count = (filteredByTab[tab.id] || []).length
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    isActive
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      isActive ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </nav>
        </div>

        <div className="mt-5">{renderContent()}</div>

        <div className="mt-12 rounded-2xl border border-slate-200 p-4 sm:p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500">Learn more</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              to="/about"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              About us
            </Link>
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>

      {editorOpen ? (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={closeEditor} />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {editorMode === 'edit' ? 'Edit' : 'Add'} {tabSingular[activeTab]}
              </h2>
              <button
                type="button"
                onClick={closeEditor}
                disabled={isSaving}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                aria-label="Close"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              {(FIELD_CONFIG[activeTab] || []).map((field) => (
                <div key={field.key}>
                  <label htmlFor={`media-${field.key}`} className="block text-sm font-medium text-slate-700">
                    {field.label}
                    {field.required ? <span className="text-red-500"> *</span> : null}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      id={`media-${field.key}`}
                      rows={field.key === 'content' || field.key === 'body' ? 5 : 3}
                      value={form[field.key] || ''}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                        setFormErrors((prev) => ({ ...prev, [field.key]: '' }))
                      }}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                    />
                  ) : (
                    <input
                      id={`media-${field.key}`}
                      type={field.type === 'url' ? 'url' : 'text'}
                      value={form[field.key] || ''}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                        setFormErrors((prev) => ({ ...prev, [field.key]: '' }))
                      }}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                    />
                  )}
                  {formErrors[field.key] ? (
                    <p className="mt-1 text-xs text-red-600">{formErrors[field.key]}</p>
                  ) : null}
                </div>
              ))}
              <p className="text-xs text-slate-500">Saves locally for now. API wiring will replace this soon.</p>
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
              <button
                type="button"
                onClick={closeEditor}
                disabled={isSaving}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? 'Saving…' : editorMode === 'edit' ? 'Save changes' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedBlog ? (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedBlog(null)} />
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
              <div>
                <p className="text-xs text-slate-400">{formatDate(selectedBlog.createdAt)}</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">{selectedBlog.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBlog(null)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-5">
              {selectedBlog.coverUrl ? (
                <img
                  src={selectedBlog.coverUrl}
                  alt=""
                  className="mb-5 aspect-[16/9] w-full rounded-xl object-cover"
                />
              ) : null}
              <p className="text-[15px] leading-relaxed text-slate-700 whitespace-pre-wrap">
                {selectedBlog.content || selectedBlog.excerpt}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {selectedDiscussion ? (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={closeDiscussion} />
          <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400">
                  {selectedDiscussion.author || 'Community'} · {formatDate(selectedDiscussion.createdAt)}
                </p>
                <h2 className="mt-0.5 text-sm font-semibold text-slate-900">{selectedDiscussion.title}</h2>
              </div>
              <button
                type="button"
                onClick={closeDiscussion}
                disabled={isReplying}
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                aria-label="Close"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <p className="text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {selectedDiscussion.body}
                </p>
              </div>

              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Replies ({selectedDiscussion.replies?.length || 0})
                </p>
                <div className="mt-2 space-y-2">
                  {(selectedDiscussion.replies || []).length ? (
                    selectedDiscussion.replies.map((reply) => (
                      <div key={reply.id} className="rounded-lg border border-slate-100 bg-white p-2">
                        <p className="text-[10px] font-medium text-slate-800">
                          {reply.author}
                          <span className="ml-1.5 font-normal text-slate-400">· {formatDate(reply.createdAt)}</span>
                        </p>
                        <p className="mt-1 text-[11px] leading-snug text-slate-600 whitespace-pre-wrap">{reply.body}</p>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-500">
                      No replies yet. Be the first to respond.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3">
              {isLoggedIn ? (
                <>
                  <label htmlFor="discussion-reply" className="block text-[10px] font-medium text-slate-700">
                    Your reply
                  </label>
                  <textarea
                    id="discussion-reply"
                    rows={3}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Share your experience or ask a follow-up question…"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handlePostReply}
                      disabled={isReplying || !replyText.trim()}
                      className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isReplying ? 'Posting…' : 'Post reply'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center">
                  <p className="text-[11px] text-slate-600">Log in to join the conversation.</p>
                  <Link
                    to="/login"
                    className="mt-1.5 inline-flex text-[11px] font-semibold text-teal-600 hover:text-teal-700"
                    onClick={() => setSelectedDiscussion(null)}
                  >
                    Go to login →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {lightboxPhoto ? (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70" onClick={() => setLightboxPhoto(null)} />
          <div className="relative w-full max-w-3xl">
            <button
              type="button"
              onClick={() => setLightboxPhoto(null)}
              className="absolute -top-10 right-0 rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <FiX className="h-6 w-6" />
            </button>
            <img
              src={lightboxPhoto.imageUrl}
              alt={lightboxPhoto.title}
              className="max-h-[80vh] w-full rounded-2xl object-contain bg-black"
            />
            <p className="mt-3 text-center text-sm text-white">{lightboxPhoto.title}</p>
          </div>
        </div>
      ) : null}

      <AlertModal open={alertState.open} type={alertState.type} message={alertState.message} onClose={closeAlert} />
      <AlertModal
        open={deleteConfirm.open}
        type="danger"
        title={`Delete ${tabSingular[activeTab]}`}
        message={`Are you sure you want to delete "${deleteConfirm.title}"? This cannot be undone.`}
        onClose={closeDeleteConfirm}
        onConfirm={confirmDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmLoading={deleteConfirm.loading}
      />
    </div>
  )
}

export default Media
