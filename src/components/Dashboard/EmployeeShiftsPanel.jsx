import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import AlertModal from '../AlertModal';

const fieldClass =
  'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60';
const labelClass = 'block text-xs font-semibold text-gray-700 mb-1';

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const emptyShiftForm = () => ({
  name: '',
  startTime: '08:00',
  endTime: '17:00',
  isOvernight: false,
  graceMinutes: '0',
  weeklyOffDays: [6],
  isActive: true,
});

const toApiTime = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
  return raw;
};

const toFormTime = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{2}:\d{2}/.test(raw)) return raw.slice(0, 5);
  return raw;
};

const formatDisplayTime = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  return raw.length >= 5 ? raw.slice(0, 5) : raw;
};

const formatWeeklyOffDays = (days) => {
  if (!Array.isArray(days) || days.length === 0) return '—';
  return days
    .map((d) => WEEKDAY_OPTIONS.find((opt) => opt.value === Number(d))?.label || String(d))
    .join(', ');
};

const extractList = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.data?.results)) return payload.data.results;
  return [];
};

const extractErrorMessage = (error, fallback) => {
  const data = error?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data?.detail) return String(data.detail);
  if (data?.message) return String(data.message);
  if (data && typeof data === 'object') {
    const parts = [];
    Object.keys(data).forEach((key) => {
      const val = data[key];
      if (Array.isArray(val) && val.length) parts.push(`${key}: ${val[0]}`);
      else if (typeof val === 'string') parts.push(val);
    });
    if (parts.length) return parts.join(', ');
  }
  return error?.message || fallback;
};

const shiftToForm = (shift) => ({
  name: shift?.name || '',
  startTime: toFormTime(shift?.start_time) || '08:00',
  endTime: toFormTime(shift?.end_time) || '17:00',
  isOvernight: Boolean(shift?.is_overnight),
  graceMinutes:
    shift?.grace_minutes != null && shift.grace_minutes !== ''
      ? String(shift.grace_minutes)
      : '0',
  weeklyOffDays: Array.isArray(shift?.weekly_off_days)
    ? shift.weekly_off_days.map((d) => Number(d)).filter((d) => Number.isFinite(d))
    : [],
  isActive: shift?.is_active !== false,
});

const buildShiftPayload = (form) => {
  const name = String(form.name || '').trim();
  const startTime = toApiTime(form.startTime);
  const endTime = toApiTime(form.endTime);
  const graceMinutes = Number(form.graceMinutes);

  if (!name) return { error: 'Please enter a shift name.' };
  if (!startTime || !endTime) return { error: 'Please enter start and end times.' };
  if (!Number.isFinite(graceMinutes) || graceMinutes < 0) {
    return { error: 'Grace minutes must be 0 or greater.' };
  }

  return {
    payload: {
      name,
      start_time: startTime,
      end_time: endTime,
      is_overnight: Boolean(form.isOvernight),
      grace_minutes: Math.floor(graceMinutes),
      weekly_off_days: Array.isArray(form.weeklyOffDays) ? form.weeklyOffDays : [],
      is_active: Boolean(form.isActive),
    },
  };
};

const EmployeeShiftsPanel = ({ onBack, onAlert }) => {
  const [shifts, setShifts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [form, setForm] = useState(() => emptyShiftForm());
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({
    open: false,
    id: null,
    name: '',
    loading: false,
  });

  const isEditing = editingShiftId != null;

  const fetchShifts = useCallback(async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setListError('Authorization token missing. Please log in again.');
      setShifts([]);
      return;
    }

    setIsLoading(true);
    setListError('');
    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const response = await axios.get(`${baseUrl}/accounts/shifts/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setShifts(extractList(response.data));
    } catch (error) {
      setShifts([]);
      setListError(extractErrorMessage(error, 'Failed to load shifts.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  const toggleWeeklyOffDay = (day) => {
    setForm((prev) => {
      const current = Array.isArray(prev.weeklyOffDays) ? prev.weeklyOffDays : [];
      const exists = current.includes(day);
      return {
        ...prev,
        weeklyOffDays: exists
          ? current.filter((d) => d !== day)
          : [...current, day].sort((a, b) => a - b),
      };
    });
  };

  const resetForm = () => {
    setForm(emptyShiftForm());
    setFormError('');
    setShowForm(false);
    setEditingShiftId(null);
  };

  const openCreateForm = () => {
    setEditingShiftId(null);
    setForm(emptyShiftForm());
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (shift) => {
    if (shift?.id == null) {
      onAlert?.('Shift id is missing. Cannot edit.', 'warning');
      return;
    }
    setEditingShiftId(shift.id);
    setForm(shiftToForm(shift));
    setFormError('');
    setShowForm(true);
  };

  const handleSubmitShift = async (e) => {
    e.preventDefault();
    const built = buildShiftPayload(form);
    if (built.error) {
      setFormError(built.error);
      return;
    }

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      onAlert?.('Authorization token missing. Please log in again.', 'error');
      return;
    }

    setIsSaving(true);
    setFormError('');
    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };

      if (isEditing) {
        await axios.patch(`${baseUrl}/accounts/shifts/${editingShiftId}/`, built.payload, {
          headers,
        });
        onAlert?.('Shift updated successfully.', 'success');
      } else {
        await axios.post(`${baseUrl}/accounts/shifts/`, built.payload, { headers });
        onAlert?.('Shift created successfully.', 'success');
      }

      resetForm();
      await fetchShifts();
    } catch (error) {
      const message = extractErrorMessage(
        error,
        isEditing ? 'Failed to update shift.' : 'Failed to create shift.'
      );
      setFormError(message);
      onAlert?.(`Error: ${message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const requestDeleteShift = (shift) => {
    if (shift?.id == null) {
      onAlert?.('Shift id is missing. Cannot delete.', 'warning');
      return;
    }
    setDeleteConfirm({
      open: true,
      id: shift.id,
      name: shift.name || 'this shift',
      loading: false,
    });
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirm((prev) =>
      prev.loading ? prev : { open: false, id: null, name: '', loading: false }
    );
  };

  const confirmDeleteShift = async () => {
    if (!deleteConfirm.id) return;

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      onAlert?.('Authorization token missing. Please log in again.', 'error');
      setDeleteConfirm({ open: false, id: null, name: '', loading: false });
      return;
    }

    setDeleteConfirm((prev) => ({ ...prev, loading: true }));
    try {
      const baseUrl = `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');
      await axios.delete(`${baseUrl}/accounts/shifts/${deleteConfirm.id}/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (String(editingShiftId) === String(deleteConfirm.id)) {
        resetForm();
      }

      setDeleteConfirm({ open: false, id: null, name: '', loading: false });
      onAlert?.('Shift deleted successfully.', 'success');
      await fetchShifts();
    } catch (error) {
      const message = extractErrorMessage(error, 'Failed to delete shift.');
      setDeleteConfirm((prev) => ({ ...prev, loading: false }));
      onAlert?.(`Error: ${message}`, 'error');
    }
  };

  return (
    <div className="min-w-0 max-w-full rounded-xl border-2 border-gray-200 bg-gray-50 p-3 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          ← Back to employees
        </button>
        <h2 className="text-sm font-semibold text-slate-800">Shifts</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchShifts}
            disabled={isLoading || isSaving || deleteConfirm.loading}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              if (showForm) resetForm();
              else openCreateForm();
            }}
            disabled={isSaving || deleteConfirm.loading}
            className="shrink-0 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {showForm ? 'Cancel' : '+ Add Shift'}
          </button>
        </div>
      </div>

      {showForm ? (
        <form
          onSubmit={handleSubmitShift}
          className="relative mb-4 rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow-sm"
        >
          {isSaving ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80">
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
                <p className="text-xs font-semibold text-gray-700">
                  {isEditing ? 'Updating shift...' : 'Creating shift...'}
                </p>
              </div>
            </div>
          ) : null}

          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {isEditing ? 'Edit shift' : 'New shift'}
          </p>

          {formError ? (
            <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-1">
              <label htmlFor="shift-name" className={labelClass}>
                Name <span className="text-rose-600">*</span>
              </label>
              <input
                id="shift-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className={fieldClass}
                placeholder="Day Shift"
                disabled={isSaving}
                required
              />
            </div>
            <div>
              <label htmlFor="shift-start" className={labelClass}>
                Start time <span className="text-rose-600">*</span>
              </label>
              <input
                id="shift-start"
                type="time"
                step="1"
                value={form.startTime}
                onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
                className={fieldClass}
                disabled={isSaving}
                required
              />
            </div>
            <div>
              <label htmlFor="shift-end" className={labelClass}>
                End time <span className="text-rose-600">*</span>
              </label>
              <input
                id="shift-end"
                type="time"
                step="1"
                value={form.endTime}
                onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
                className={fieldClass}
                disabled={isSaving}
                required
              />
            </div>
            <div>
              <label htmlFor="shift-grace" className={labelClass}>
                Grace minutes
              </label>
              <input
                id="shift-grace"
                type="number"
                min="0"
                step="1"
                value={form.graceMinutes}
                onChange={(e) => setForm((prev) => ({ ...prev, graceMinutes: e.target.value }))}
                className={fieldClass}
                disabled={isSaving}
              />
            </div>
            <div className="flex items-end gap-4 pb-1">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isOvernight}
                  onChange={(e) => setForm((prev) => ({ ...prev, isOvernight: e.target.checked }))}
                  disabled={isSaving}
                  className="h-3.5 w-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                />
                Overnight
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                  disabled={isSaving}
                  className="h-3.5 w-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                />
                Active
              </label>
            </div>
          </div>

          <fieldset className="mt-3">
            <legend className={labelClass}>Weekly off days</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((day) => {
                const selected = form.weeklyOffDays.includes(day.value);
                return (
                  <label
                    key={day.value}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                      selected
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    } ${isSaving ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selected}
                      onChange={() => toggleWeeklyOffDay(day.value)}
                      disabled={isSaving}
                    />
                    {day.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : isEditing ? 'Update Shift' : 'Create Shift'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={isSaving}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-slate-600">Loading shifts...</p>
        </div>
      ) : listError ? (
        <div className="rounded-lg border border-rose-200 bg-white px-4 py-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-rose-700">{listError}</p>
          <button
            type="button"
            onClick={fetchShifts}
            className="mt-3 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      ) : shifts.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-800">No shifts found</p>
          <p className="mt-1 text-xs text-slate-500">
            Use <span className="font-semibold">+ Add Shift</span> to create the first shift.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[48rem] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100">
                <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                  Name
                </th>
                <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                  Start
                </th>
                <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                  End
                </th>
                <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                  Overnight
                </th>
                <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                  Grace
                </th>
                <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                  Weekly off
                </th>
                <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                  Status
                </th>
                <th className="px-2.5 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => {
                const busy =
                  isSaving ||
                  deleteConfirm.loading ||
                  (deleteConfirm.open && String(deleteConfirm.id) === String(shift.id));
                return (
                  <tr
                    key={shift.id ?? `${shift.name}-${shift.start_time}`}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-2.5 py-2 font-semibold text-slate-800">{shift.name || '—'}</td>
                    <td className="px-2.5 py-2 text-slate-700">
                      {formatDisplayTime(shift.start_time)}
                    </td>
                    <td className="px-2.5 py-2 text-slate-700">
                      {formatDisplayTime(shift.end_time)}
                    </td>
                    <td className="px-2.5 py-2 text-slate-700">
                      {shift.is_overnight ? 'Yes' : 'No'}
                    </td>
                    <td className="px-2.5 py-2 text-slate-700">
                      {shift.grace_minutes != null ? `${shift.grace_minutes} min` : '—'}
                    </td>
                    <td className="px-2.5 py-2 text-slate-700">
                      {formatWeeklyOffDays(shift.weekly_off_days)}
                    </td>
                    <td className="px-2.5 py-2">
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          shift.is_active === false
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {shift.is_active === false ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditForm(shift)}
                          disabled={busy || shift.id == null}
                          className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteShift(shift)}
                          disabled={busy || shift.id == null}
                          className="rounded border border-rose-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AlertModal
        open={deleteConfirm.open}
        type="danger"
        message={`Delete shift "${deleteConfirm.name}"? This cannot be undone.`}
        onClose={closeDeleteConfirm}
        onConfirm={confirmDeleteShift}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmLoading={deleteConfirm.loading}
      />
    </div>
  );
};

export default EmployeeShiftsPanel;
