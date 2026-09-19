import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FiArrowLeft, FiCheck, FiLock, FiRefreshCw, FiShield, FiUser, FiUsers, FiX } from 'react-icons/fi'
import { isMasterAdmin } from '../utils/authRoles'

const ACTION_KEYS = [
  { id: 'read', label: 'Read' },
  { id: 'write', label: 'Write' },
  { id: 'edit', label: 'Edit' },
  { id: 'delete', label: 'Delete' },
]

const MODULE_KEYS = [
  {
    id: 'venues',
    label: 'Venues',
    description: 'Venue list and venue management.',
    group: 'Core',
  },
  {
    id: 'services',
    label: 'Services',
    description: 'Service catalog and packages.',
    group: 'Core',
  },
  {
    id: 'resources',
    label: 'Resources',
    description: 'Resource inventory and assignments.',
    group: 'Core',
  },
  {
    id: 'emr',
    label: 'EMR',
    description: 'Electronic medical records.',
    group: 'Core',
  },
  {
    id: 'customer_details',
    label: 'Customer details',
    description: 'Customer Master, Booking, Lobby, Invoices, and Payments.',
    group: 'Manage Customer',
  },
  {
    id: 'analytics_details',
    label: 'Analytics details',
    description: 'Attendance, payments, wallet, reminders, and analytics views.',
    group: 'Analytics',
  },
  {
    id: 'manage_staff',
    label: 'Manage Staff',
    description: 'Managers, staff, hire, payroll, attendance, and payouts.',
    group: 'Staff',
  },
  {
    id: 'my_schedule',
    label: 'My Schedule',
    description: 'Personal staff schedule view.',
    group: 'Staff',
  },
  {
    id: 'location_package',
    label: 'Location & Package',
    description: 'Location and package configuration.',
    group: 'Owner tools',
  },
  {
    id: 'n8n_templates',
    label: 'N8N Templates',
    description: 'Automation and WhatsApp template guides.',
    group: 'Owner tools',
  },
]

const FULL_ACTIONS = { read: true, write: true, edit: true, delete: true }
const READ_ONLY_ACTIONS = { read: true, write: false, edit: false, delete: false }

const ALL_MODULES_ON = Object.fromEntries(MODULE_KEYS.map((m) => [m.id, true]))
const STAFF_MODULES = {
  venues: true,
  services: true,
  resources: true,
  emr: true,
  customer_details: false,
  analytics_details: true,
  manage_staff: false,
  my_schedule: true,
  location_package: false,
  n8n_templates: false,
}

const PERSONA_DEFAULTS = [
  {
    id: 'vsre_owner',
    label: 'VSRE Owner',
    code: 'VSRE_OWNER',
    description: 'Full access across the care portal.',
    actions: { ...FULL_ACTIONS },
    modules: { ...ALL_MODULES_ON },
  },
  {
    id: 'staff',
    label: 'Staff',
    code: 'VSRE_STAFF',
    description: 'Read-only access on selected modules (no customer details by default).',
    actions: { ...READ_ONLY_ACTIONS },
    modules: { ...STAFF_MODULES },
  },
  {
    id: 'operational_admin',
    label: 'Operational Admin',
    code: 'OPERATIONAL_ADMIN',
    description: 'Same access level as VSRE Owner.',
    actions: { ...FULL_ACTIONS },
    modules: { ...ALL_MODULES_ON },
  },
]

const clonePersonaDefaults = () =>
  PERSONA_DEFAULTS.map((persona) => ({
    ...persona,
    actions: { ...persona.actions },
    modules: { ...persona.modules },
  }))

const ToggleSwitch = ({ checked, onChange, label, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
      checked ? 'bg-teal-600' : 'bg-slate-300'
    } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
        checked ? 'translate-x-4' : 'translate-x-0.5'
      }`}
    />
  </button>
)

const PersonaPermissions = () => {
  const navigate = useNavigate()
  const [authUser, setAuthUser] = useState(null)
  const [selectedPersonaId, setSelectedPersonaId] = useState(PERSONA_DEFAULTS[0].id)
  const [personas, setPersonas] = useState(() => clonePersonaDefaults())
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('authUser')
      setAuthUser(raw ? JSON.parse(raw) : null)
    } catch {
      setAuthUser(null)
    }
  }, [])

  const allowed = useMemo(() => isMasterAdmin(authUser), [authUser])

  const selectedPersona = useMemo(
    () => personas.find((p) => p.id === selectedPersonaId) || personas[0],
    [personas, selectedPersonaId]
  )

  const moduleGroups = useMemo(() => {
    const groups = []
    const seen = new Map()
    MODULE_KEYS.forEach((module) => {
      if (!seen.has(module.group)) {
        seen.set(module.group, [])
        groups.push({ name: module.group, items: seen.get(module.group) })
      }
      seen.get(module.group).push(module)
    })
    return groups
  }, [])

  useEffect(() => {
    if (authUser && !allowed) {
      navigate('/dashboard', { replace: true })
    }
  }, [authUser, allowed, navigate])

  const updateSelectedPersona = (updater) => {
    setPersonas((prev) =>
      prev.map((persona) => (persona.id === selectedPersonaId ? updater(persona) : persona))
    )
    setIsDirty(true)
  }

  const toggleAction = (actionId) => {
    updateSelectedPersona((persona) => ({
      ...persona,
      actions: {
        ...persona.actions,
        [actionId]: !persona.actions[actionId],
      },
    }))
  }

  const toggleModule = (moduleId) => {
    updateSelectedPersona((persona) => ({
      ...persona,
      modules: {
        ...persona.modules,
        [moduleId]: !persona.modules[moduleId],
      },
    }))
  }

  const setAllModules = (enabled) => {
    updateSelectedPersona((persona) => ({
      ...persona,
      modules: Object.fromEntries(MODULE_KEYS.map((m) => [m.id, enabled])),
    }))
  }

  const resetSelectedPersona = () => {
    const defaults = PERSONA_DEFAULTS.find((p) => p.id === selectedPersonaId)
    if (!defaults) return
    setPersonas((prev) =>
      prev.map((persona) =>
        persona.id === selectedPersonaId
          ? {
              ...defaults,
              actions: { ...defaults.actions },
              modules: { ...defaults.modules },
            }
          : persona
      )
    )
    setIsDirty(true)
  }

  const resetAll = () => {
    setPersonas(clonePersonaDefaults())
    setIsDirty(false)
  }

  if (!authUser) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <p className="text-sm text-slate-600">Please log in as Master Admin to manage permissions.</p>
        <Link to="/login" className="mt-4 inline-flex text-sm font-medium text-teal-700 hover:underline">
          Go to login
        </Link>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <p className="text-sm text-slate-600">Only Master Admin can manage persona permissions.</p>
        <Link to="/dashboard" className="mt-4 inline-flex text-sm font-medium text-teal-700 hover:underline">
          Back to dashboard
        </Link>
      </div>
    )
  }

  const enabledModuleCount = MODULE_KEYS.filter((m) => selectedPersona.modules[m.id]).length

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-teal-700"
        >
          <FiArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Permissions</h1>
            <p className="mt-1 text-sm text-slate-500">
              Choose which actions and modules each persona can use — for example Customer details or
              Analytics details for Staff.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            <FiLock className="h-3 w-3" aria-hidden />
            UI preview — APIs coming soon
          </span>
        </div>
      </div>

      <div
        className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        role="status"
      >
        You can adjust permissions in this screen now. Saving to the server is not available yet —
        changes stay in this browser session until the permissions APIs are ready.
        {isDirty ? (
          <span className="mt-1 block text-xs font-medium text-amber-800">Unsaved local changes.</span>
        ) : null}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Persona">
        {personas.map((persona) => {
          const selected = selectedPersonaId === persona.id
          return (
            <button
              key={persona.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setSelectedPersonaId(persona.id)}
              className={`rounded-xl border px-4 py-3 text-left transition-colors duration-200 ${
                selected
                  ? 'border-teal-500 bg-teal-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <span className="flex items-start gap-3">
                <span
                  className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    selected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {persona.id === 'staff' ? (
                    <FiUser className="h-4 w-4" aria-hidden />
                  ) : persona.id === 'operational_admin' ? (
                    <FiShield className="h-4 w-4" aria-hidden />
                  ) : (
                    <FiUsers className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{persona.label}</span>
                  <span className="mt-0.5 block font-mono text-[10px] text-slate-400">{persona.code}</span>
                  <span className="mt-1 block text-xs text-slate-500">{persona.description}</span>
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <section
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        aria-labelledby="actions-heading"
      >
        <div className="mb-4">
          <h2 id="actions-heading" className="text-sm font-semibold text-slate-800">
            {selectedPersona.label} — actions
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Global action rights for <span className="font-mono">{selectedPersona.code}</span>
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ACTION_KEYS.map((action) => {
            const enabled = Boolean(selectedPersona.actions[action.id])
            return (
              <li
                key={action.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
                  enabled ? 'border-teal-200 bg-teal-50/60' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <span className="text-sm font-medium text-slate-800">{action.label}</span>
                <ToggleSwitch
                  checked={enabled}
                  label={`${action.label} for ${selectedPersona.label}`}
                  onChange={() => toggleAction(action.id)}
                />
              </li>
            )
          })}
        </ul>
      </section>

      <section
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        aria-labelledby="modules-heading"
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="modules-heading" className="text-sm font-semibold text-slate-800">
              {selectedPersona.label} — module access
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Turn areas on or off (e.g. Customer details, Analytics details). {enabledModuleCount} of{' '}
              {MODULE_KEYS.length} enabled.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAllModules(true)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Enable all
            </button>
            <button
              type="button"
              onClick={() => setAllModules(false)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Disable all
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {moduleGroups.map((group) => (
            <div key={group.name}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {group.name}
              </h3>
              <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {group.items.map((module) => {
                  const enabled = Boolean(selectedPersona.modules[module.id])
                  return (
                    <li
                      key={module.id}
                      className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        enabled ? 'border-teal-200 bg-teal-50/60' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{module.label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{module.description}</p>
                      </div>
                      <ToggleSwitch
                        checked={enabled}
                        label={`${module.label} for ${selectedPersona.label}`}
                        onChange={() => toggleModule(module.id)}
                      />
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-slate-200 px-3 py-2 text-sm font-medium text-slate-500"
            title="Permissions API is still in progress"
          >
            <FiLock className="h-3.5 w-3.5" aria-hidden />
            Save permissions
          </button>
          <button
            type="button"
            onClick={resetSelectedPersona}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <FiRefreshCw className="h-3.5 w-3.5" aria-hidden />
            Reset {selectedPersona.label}
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Reset all personas
          </button>
          <span className="text-xs text-slate-400">Server save will unlock when the API is ready.</span>
        </div>
      </section>

      <section
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        aria-labelledby="modules-matrix-heading"
      >
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 id="modules-matrix-heading" className="text-sm font-semibold text-slate-800">
            Module access overview
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Compare which modules each persona can access (current local draft).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Module
                </th>
                {personas.map((persona) => (
                  <th
                    key={persona.id}
                    scope="col"
                    className={`px-3 py-2.5 text-center text-xs font-semibold text-slate-700 ${
                      selectedPersonaId === persona.id ? 'bg-teal-50 text-teal-800' : ''
                    }`}
                  >
                    {persona.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MODULE_KEYS.map((module) => (
                <tr key={module.id} className="hover:bg-slate-50/80">
                  <th scope="row" className="px-4 py-2.5 text-sm font-medium text-slate-800">
                    {module.label}
                  </th>
                  {personas.map((persona) => {
                    const enabled = Boolean(persona.modules[module.id])
                    return (
                      <td
                        key={`${persona.id}-${module.id}`}
                        className={`px-3 py-2.5 text-center ${
                          selectedPersonaId === persona.id ? 'bg-teal-50/50' : ''
                        }`}
                      >
                        <span className="sr-only">
                          {persona.label}: {enabled ? 'allowed' : 'not allowed'}
                        </span>
                        {enabled ? (
                          <FiCheck className="mx-auto h-4 w-4 text-teal-600" aria-hidden />
                        ) : (
                          <FiX className="mx-auto h-4 w-4 text-slate-300" aria-hidden />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default PersonaPermissions
