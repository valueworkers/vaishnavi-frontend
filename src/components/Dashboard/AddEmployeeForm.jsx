import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { FiEye, FiEyeOff, FiPlus, FiTrash2 } from 'react-icons/fi';
import {
  EMPLOYEE_CATEGORY_OPTIONS,
  EMPLOYEE_CREATE_USER_TYPE_OPTIONS,
  EMPLOYEE_PROFILE_STATUS_OPTIONS,
  EMPLOYEE_REHIRED_STATUS_OPTIONS,
} from '../../utils/employeeListQuery';

const fieldClass =
  'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-500';
const labelClass = 'block text-xs font-semibold text-gray-700 mb-1';
const sectionClass = 'pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500';

const SKILL_PRIORITY_OPTIONS = [
  { value: 'p0', label: 'p0' },
  { value: 'p1', label: 'p1' },
  { value: 'p2', label: 'p2' },
  { value: 'p3', label: 'p3' },
];

const getSkillSlotLabel = (n) => {
  if (n === 1) return 'Top Skill';
  if (n === 2) return 'Secondary Skill';
  if (n === 3) return 'Tertiary Skill';
  return `Skill ${n}`;
};

const digitsOnly10 = (value) => String(value || '').replace(/\D/g, '').slice(0, 10);

const extractShiftList = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.data?.results)) return payload.data.results;
  return [];
};

const extractServiceList = (payload) => extractShiftList(payload);

const extractPackageList = (payload) => extractShiftList(payload);

const formatShiftOptionLabel = (shift) => {
  const name = shift?.name || `Shift ${shift?.id ?? ''}`.trim();
  const start = String(shift?.start_time || '').slice(0, 5);
  const end = String(shift?.end_time || '').slice(0, 5);
  const time = start && end ? ` (${start}–${end})` : '';
  const inactive = shift?.is_active === false ? ' — Inactive' : '';
  return `${name}${time}${inactive}`;
};

const AddEmployeeForm = ({
  form,
  setForm,
  isSubmitting,
  formFeedback,
  onBack,
  onSubmit,
  onInvalidPhoto,
  mode = 'add',
  stepLabel = '',
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [shiftOptions, setShiftOptions] = useState([]);
  const [isLoadingShifts, setIsLoadingShifts] = useState(false);
  const [shiftsError, setShiftsError] = useState('');
  const [serviceOptions, setServiceOptions] = useState([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [servicesError, setServicesError] = useState('');
  const [packagesByServiceId, setPackagesByServiceId] = useState({});
  const [loadingPackagesFor, setLoadingPackagesFor] = useState({});
  const [packageErrors, setPackageErrors] = useState({});
  const fetchedPackageServiceIds = useRef(new Set());
  const isEdit = mode === 'edit';

  const careBaseUrl = () => `${import.meta.env.VITE_BASEURL_CARE}`.replace(/\/$/, '');

  const fetchShifts = useCallback(async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setShiftsError('Authorization token missing.');
      setShiftOptions([]);
      return;
    }

    setIsLoadingShifts(true);
    setShiftsError('');
    try {
      const response = await axios.get(`${careBaseUrl()}/accounts/shifts/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setShiftOptions(extractShiftList(response.data));
    } catch (error) {
      setShiftOptions([]);
      const data = error?.response?.data;
      const message =
        (typeof data === 'string' && data) ||
        data?.detail ||
        data?.message ||
        error?.message ||
        'Failed to load shifts.';
      setShiftsError(String(message));
    } finally {
      setIsLoadingShifts(false);
    }
  }, []);

  const fetchServices = useCallback(async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setServicesError('Authorization token missing.');
      setServiceOptions([]);
      return;
    }

    setIsLoadingServices(true);
    setServicesError('');
    try {
      const response = await axios.get(`${careBaseUrl()}/management/services/service_dropdown/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setServiceOptions(extractServiceList(response.data));
    } catch (error) {
      setServiceOptions([]);
      const data = error?.response?.data;
      const message =
        (typeof data === 'string' && data) ||
        data?.detail ||
        data?.message ||
        error?.message ||
        'Failed to load services.';
      setServicesError(String(message));
    } finally {
      setIsLoadingServices(false);
    }
  }, []);

  const fetchPackagesForService = useCallback(async (serviceId, { force = false } = {}) => {
    const id = String(serviceId || '').trim();
    if (!id) return;
    if (!force && fetchedPackageServiceIds.current.has(id)) return;

    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      setPackageErrors((prev) => ({ ...prev, [id]: 'Authorization token missing.' }));
      return;
    }

    fetchedPackageServiceIds.current.add(id);
    setLoadingPackagesFor((prev) => ({ ...prev, [id]: true }));
    setPackageErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    try {
      const response = await axios.get(`${careBaseUrl()}/booking/packages/by_belongs_to/`, {
        params: { entity: 'service', id },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setPackagesByServiceId((prev) => ({
        ...prev,
        [id]: extractPackageList(response.data),
      }));
    } catch (error) {
      fetchedPackageServiceIds.current.delete(id);
      setPackagesByServiceId((prev) => ({ ...prev, [id]: [] }));
      const data = error?.response?.data;
      const message =
        (typeof data === 'string' && data) ||
        data?.detail ||
        data?.message ||
        error?.message ||
        'Failed to load packages.';
      setPackageErrors((prev) => ({ ...prev, [id]: String(message) }));
    } finally {
      setLoadingPackagesFor((prev) => ({ ...prev, [id]: false }));
    }
  }, []);

  useEffect(() => {
    fetchShifts();
    fetchServices();
  }, [fetchShifts, fetchServices]);

  useEffect(() => {
    const slotCount = Math.min(5, Math.max(1, Number(form.skillSlotCount) || 1));
    for (let n = 1; n <= slotCount; n += 1) {
      const serviceId = String(form[`skill${n}ServiceId`] || '').trim();
      if (serviceId) fetchPackagesForService(serviceId);
    }
  }, [
    form.skillSlotCount,
    form.skill1ServiceId,
    form.skill2ServiceId,
    form.skill3ServiceId,
    form.skill4ServiceId,
    form.skill5ServiceId,
    fetchPackagesForService,
  ]);

  const skillSlotCount = Math.min(5, Math.max(1, Number(form.skillSlotCount) || 1));

  const handleSkillServiceChange = (slot, serviceId) => {
    setForm((prev) => ({
      ...prev,
      [`skill${slot}ServiceId`]: serviceId,
      [`skill${slot}`]: '',
    }));
    if (serviceId) {
      fetchPackagesForService(serviceId);
    }
  };

  const addSkillSlot = () => {
    setForm((prev) => {
      const current = Math.min(5, Math.max(1, Number(prev.skillSlotCount) || 1));
      if (current >= 5) return prev;
      return { ...prev, skillSlotCount: current + 1 };
    });
  };

  const removeSkillSlot = (slot) => {
    setForm((prev) => {
      const current = Math.min(5, Math.max(1, Number(prev.skillSlotCount) || 1));
      if (current <= 1 || slot < 1 || slot > current) return prev;
      const next = { ...prev, skillSlotCount: current - 1 };
      for (let i = slot; i < current; i += 1) {
        next[`skill${i}ServiceId`] = prev[`skill${i + 1}ServiceId`] || '';
        next[`skill${i}`] = prev[`skill${i + 1}`] || '';
        next[`skill${i}Priority`] = prev[`skill${i + 1}Priority`] || '';
        next[`skill${i}Experience`] = prev[`skill${i + 1}Experience`] || '';
      }
      next[`skill${current}ServiceId`] = '';
      next[`skill${current}`] = '';
      next[`skill${current}Priority`] = '';
      next[`skill${current}Experience`] = '';
      return next;
    });
  };

  return (
    <div
      className={`relative rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4 ${
        isSubmitting ? 'pointer-events-none opacity-75' : ''
      }`}
    >
      {isSubmitting ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <p className="font-semibold text-gray-700">
              {isEdit ? 'Updating employee...' : 'Creating employee...'}
            </p>
          </div>
        </div>
      ) : null}

      {onBack ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            {isEdit ? '← Cancel' : '← Back to list'}
          </button>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          {!isEdit && stepLabel ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
              {stepLabel}
            </p>
          ) : null}
          <h3 className="text-base font-bold text-gray-900">
            {isEdit ? 'Edit Employee' : 'Add New Employee'}
          </h3>
        </div>
        {!isEdit && stepLabel ? (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500" aria-hidden>
            <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-white">1. Details</span>
            <span aria-hidden>→</span>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600">2. Documents</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <p className={sectionClass}>Basic details</p>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <div>
            <label className={labelClass}>
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.firstName}
              onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
              placeholder="First Name"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Middle Name</label>
            <input
              value={form.middleName}
              onChange={(e) => setForm((prev) => ({ ...prev, middleName: e.target.value }))}
              placeholder="Middle Name (optional)"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.lastName}
              onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
              placeholder="Last Name"
              className={fieldClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <div>
            <label className={labelClass}>Email</label>
            <input
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="Email Address"
              type="email"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Mobile <span className="text-red-500">*</span>
            </label>
            <input
              value={form.mobile}
              onChange={(e) => setForm((prev) => ({ ...prev, mobile: digitsOnly10(e.target.value) }))}
              placeholder="10-digit mobile"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Alternate Phone</label>
            <input
              value={form.alternatePhone}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, alternatePhone: digitsOnly10(e.target.value) }))
              }
              placeholder="10-digit alternate phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <div>
            <label className={labelClass}>Age</label>
            <input
              value={form.age}
              onChange={(e) => setForm((prev) => ({ ...prev, age: e.target.value }))}
              placeholder="Age"
              type="number"
              min="0"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Gender <span className="text-red-500">*</span>
            </label>
            <select
              value={form.empGender}
              onChange={(e) => setForm((prev) => ({ ...prev, empGender: e.target.value }))}
              className={fieldClass}
            >
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>
              City / Base Location <span className="text-red-500">*</span>
            </label>
            <input
              value={form.empBaseLocation}
              onChange={(e) => setForm((prev) => ({ ...prev, empBaseLocation: e.target.value }))}
              placeholder="City"
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>
            Address <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.address}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
            placeholder="Full Address"
            rows="2"
            className={`${fieldClass} resize-none`}
          />
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <div>
            <label className={labelClass}>Emergency Contact Name</label>
            <input
              value={form.emergencyContactName}
              onChange={(e) => setForm((prev) => ({ ...prev, emergencyContactName: e.target.value }))}
              placeholder="Emergency contact name"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Emergency Contact Number</label>
            <input
              value={form.emergencyContactNumber}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  emergencyContactNumber: digitsOnly10(e.target.value),
                }))
              }
              placeholder="10-digit emergency number"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <div>
            <label className={labelClass}>
              Password{isEdit ? '' : <span className="text-red-500"> *</span>}
              {isEdit ? (
                <span className="ml-1 font-normal text-slate-500">(leave blank to keep)</span>
              ) : null}
            </label>
            <div className="relative">
              <input
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className={`${fieldClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:text-slate-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className={labelClass}>
              Confirm Password{isEdit ? '' : <span className="text-red-500"> *</span>}
            </label>
            <div className="relative">
              <input
                value={form.confirmPassword}
                onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className={`${fieldClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:text-slate-700"
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirmPassword ? (
                  <FiEyeOff className="h-4 w-4" />
                ) : (
                  <FiEye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        <p className={sectionClass}>Employee profile</p>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <div>
            <label className={labelClass}>
              User Roll <span className="text-red-500">*</span>
            </label>
            <select
              value={form.userType}
              onChange={(e) => setForm((prev) => ({ ...prev, userType: e.target.value }))}
              className={fieldClass}
            >
              <option value="">Select user roll</option>
              {EMPLOYEE_CREATE_USER_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>
              Category <span className="text-red-500">*</span>
            </label>
            <select
              value={form.empCategory}
              onChange={(e) => {
                const next = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  empCategory: next,
                  vendorName: next === 'VENDOR' ? prev.vendorName : '',
                  vendorPhone: next === 'VENDOR' ? prev.vendorPhone : '',
                  shiftId: next === 'PARTTIME' ? prev.shiftId : '',
                  shiftEffectiveFrom: next === 'PARTTIME' ? prev.shiftEffectiveFrom : '',
                }));
              }}
              className={fieldClass}
            >
              <option value="">Select category</option>
              {EMPLOYEE_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>
              Status <span className="text-red-500">*</span>
            </label>
            <select
              value={form.profileStatus}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  profileStatus: e.target.value,
                  empActive: e.target.value === 'ACTIVE',
                }))
              }
              className={fieldClass}
            >
              {EMPLOYEE_PROFILE_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <div>
            <label className={labelClass}>Employee ID</label>
            <input
              value={form.employeeId}
              onChange={(e) => setForm((prev) => ({ ...prev, employeeId: e.target.value }))}
              placeholder="Employee ID"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Designation</label>
            <input
              value={form.designation}
              onChange={(e) => setForm((prev) => ({ ...prev, designation: e.target.value }))}
              placeholder="Designation"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Grade</label>
            <input
              value={form.grade}
              onChange={(e) => setForm((prev) => ({ ...prev, grade: e.target.value }))}
              placeholder="Grade"
              className={fieldClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <div>
            <label className={labelClass}>Cost Center</label>
            <input
              value={form.costCenter}
              onChange={(e) => setForm((prev) => ({ ...prev, costCenter: e.target.value }))}
              placeholder="Cost center"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Department</label>
            <input
              value={form.workDepartment}
              onChange={(e) => setForm((prev) => ({ ...prev, workDepartment: e.target.value }))}
              placeholder="Department"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Joining Date</label>
            <input
              value={form.joiningDate}
              onChange={(e) => setForm((prev) => ({ ...prev, joiningDate: e.target.value }))}
              type="date"
              className={fieldClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <div>
            <label className={labelClass}>Last Working Day</label>
            <input
              value={form.lastWorkingDay}
              onChange={(e) => setForm((prev) => ({ ...prev, lastWorkingDay: e.target.value }))}
              type="date"
              className={fieldClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <div>
            <label className={labelClass}>Permanent Address</label>
            <textarea
              value={form.permanentAddress}
              onChange={(e) => setForm((prev) => ({ ...prev, permanentAddress: e.target.value }))}
              rows="2"
              className={`${fieldClass} resize-none`}
            />
          </div>
          <div>
            <label className={labelClass}>Current Address</label>
            <textarea
              value={form.currentAddress}
              onChange={(e) => setForm((prev) => ({ ...prev, currentAddress: e.target.value }))}
              rows="2"
              className={`${fieldClass} resize-none`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <div>
            <label className={labelClass}>Rehired Status</label>
            <select
              value={form.rehiredStatus || 'NO'}
              onChange={(e) => setForm((prev) => ({ ...prev, rehiredStatus: e.target.value }))}
              className={fieldClass}
            >
              {EMPLOYEE_REHIRED_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Target %</label>
            <input
              value={form.targetPercent}
              onChange={(e) => setForm((prev) => ({ ...prev, targetPercent: e.target.value }))}
              type="number"
              placeholder="Target percent"
              className={fieldClass}
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(form.qcRequired)}
                onChange={(e) => setForm((prev) => ({ ...prev, qcRequired: e.target.checked }))}
                className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              QC required
            </label>
          </div>
        </div>

        {form.empCategory === 'VENDOR' ? (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            <div>
              <label className={labelClass}>
                Vendor Name <span className="text-red-500">*</span>
              </label>
              <input
                value={form.vendorName}
                onChange={(e) => setForm((prev) => ({ ...prev, vendorName: e.target.value }))}
                placeholder="Vendor name"
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Vendor Phone <span className="text-red-500">*</span>
              </label>
              <input
                value={form.vendorPhone}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, vendorPhone: digitsOnly10(e.target.value) }))
                }
                placeholder="10-digit vendor phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                className={fieldClass}
              />
            </div>
          </div>
        ) : null}

        <div className="space-y-2.5 rounded-lg border border-slate-200 bg-white p-2.5">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-800">
            <input
              type="checkbox"
              checked={Boolean(form.pfApplicable)}
              onChange={(e) => setForm((prev) => ({ ...prev, pfApplicable: e.target.checked }))}
              className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            PF applicable
          </label>
          {form.pfApplicable ? (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  PF Number <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.pfNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, pfNumber: e.target.value }))}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  UAN Number <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.uanNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, uanNumber: e.target.value }))}
                  className={fieldClass}
                />
              </div>
            </div>
          ) : null}

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-800">
            <input
              type="checkbox"
              checked={Boolean(form.esiApplicable)}
              onChange={(e) => setForm((prev) => ({ ...prev, esiApplicable: e.target.checked }))}
              className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            ESI applicable
          </label>
          {form.esiApplicable ? (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  ESI Number <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.esiNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, esiNumber: e.target.value }))}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>ESI Dispensary</label>
                <input
                  value={form.esiDispensary}
                  onChange={(e) => setForm((prev) => ({ ...prev, esiDispensary: e.target.value }))}
                  className={fieldClass}
                />
              </div>
            </div>
          ) : null}
        </div>

        {form.empCategory === 'PARTTIME' ? (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            <div>
              <label className={labelClass}>Shift</label>
              <select
                value={form.shiftId || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, shiftId: e.target.value }))}
                disabled={isSubmitting || isLoadingShifts}
                className={`${fieldClass} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70`}
                aria-busy={isLoadingShifts}
              >
                <option value="">
                  {isLoadingShifts ? 'Loading shifts...' : 'Select shift'}
                </option>
                {shiftOptions.map((shift) => (
                  <option key={shift.id} value={String(shift.id)}>
                    {formatShiftOptionLabel(shift)}
                  </option>
                ))}
              </select>
              {shiftsError ? (
                <p className="mt-1 text-[10px] text-rose-600">
                  {shiftsError}{' '}
                  <button
                    type="button"
                    onClick={fetchShifts}
                    className="font-semibold underline hover:no-underline"
                  >
                    Retry
                  </button>
                </p>
              ) : !isLoadingShifts && shiftOptions.length === 0 ? (
                <p className="mt-1 text-[10px] text-slate-500">
                  No shifts found. Create one from Employee Master → Shifts.
                </p>
              ) : (
                <p className="mt-1 text-[10px] text-slate-500">
                  Loaded from shifts API.
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>Shift Effective From</label>
              <input
                value={form.shiftEffectiveFrom}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, shiftEffectiveFrom: e.target.value }))
                }
                type="date"
                className={fieldClass}
                disabled={isSubmitting}
              />
            </div>
          </div>
        ) : null}

        <p className={sectionClass}>Skills</p>
        {servicesError ? (
          <p className="mb-2 text-xs text-red-600" role="alert">
            {servicesError}
          </p>
        ) : null}
        <div className="space-y-3">
          {Array.from({ length: skillSlotCount }, (_, idx) => {
            const n = idx + 1;
            const serviceKey = `skill${n}ServiceId`;
            const skillKey = `skill${n}`;
            const priKey = `skill${n}Priority`;
            const serviceId = String(form[serviceKey] || '').trim();
            const packages = serviceId ? packagesByServiceId[serviceId] || [] : [];
            const isLoadingPkgs = Boolean(serviceId && loadingPackagesFor[serviceId]);
            const pkgError = serviceId ? packageErrors[serviceId] : '';
            const currentSkill = form[skillKey] || '';
            const hasCurrentInPackages = packages.some(
              (pkg) => String(pkg?.name || '') === String(currentSkill),
            );

            return (
              <div
                key={n}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800">{getSkillSlotLabel(n)}</p>
                  {skillSlotCount > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeSkillSlot(n)}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50"
                      aria-label={`Remove ${getSkillSlotLabel(n)}`}
                    >
                      <FiTrash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                  <div>
                    <label className={labelClass} htmlFor={`skill-service-${n}`}>
                      Service
                    </label>
                    <select
                      id={`skill-service-${n}`}
                      value={serviceId}
                      onChange={(e) => handleSkillServiceChange(n, e.target.value)}
                      className={fieldClass}
                      disabled={isSubmitting || isLoadingServices}
                    >
                      <option value="">
                        {isLoadingServices ? 'Loading services...' : 'Select service'}
                      </option>
                      {serviceOptions.map((svc) => (
                        <option key={svc.id} value={String(svc.id)}>
                          {svc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`skill-package-${n}`}>
                      Skill
                    </label>
                    {!serviceId && currentSkill ? (
                      <input
                        id={`skill-package-${n}`}
                        value={currentSkill}
                        readOnly
                        className={`${fieldClass} bg-slate-50 text-slate-700`}
                        title="Select a service to change this skill"
                      />
                    ) : (
                      <select
                        id={`skill-package-${n}`}
                        value={currentSkill}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, [skillKey]: e.target.value }))
                        }
                        className={fieldClass}
                        disabled={isSubmitting || !serviceId || isLoadingPkgs}
                      >
                        <option value="">
                          {!serviceId
                            ? 'Select service first'
                            : isLoadingPkgs
                              ? 'Loading packages...'
                              : 'Select skill'}
                        </option>
                        {currentSkill && !hasCurrentInPackages ? (
                          <option value={currentSkill}>{currentSkill}</option>
                        ) : null}
                        {packages.map((pkg) => {
                          const name = pkg?.name || '';
                          if (!name) return null;
                          return (
                            <option key={pkg.id ?? name} value={name}>
                              {name}
                            </option>
                          );
                        })}
                      </select>
                    )}
                    {!serviceId && currentSkill ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Select a service to change this skill from packages.
                      </p>
                    ) : null}
                    {pkgError ? (
                      <p className="mt-1 text-[11px] text-red-600" role="alert">
                        {pkgError}
                      </p>
                    ) : null}
                    {serviceId && !isLoadingPkgs && !pkgError && packages.length === 0 ? (
                      <p className="mt-1 text-[11px] text-slate-500">No packages for this service.</p>
                    ) : null}
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`skill-priority-${n}`}>
                      Priority
                    </label>
                    <select
                      id={`skill-priority-${n}`}
                      value={form[priKey] || ''}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, [priKey]: e.target.value }))
                      }
                      className={fieldClass}
                      disabled={isSubmitting}
                    >
                      <option value="">Select priority</option>
                      {SKILL_PRIORITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {skillSlotCount < 5 ? (
          <button
            type="button"
            onClick={addSkillSlot}
            disabled={isSubmitting}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 disabled:opacity-50"
          >
            <FiPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Add new skill
          </button>
        ) : null}

        <div>
          <label className={labelClass}>Photo (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (file.type.startsWith('image/')) {
                  setForm((prev) => ({ ...prev, photo: file }));
                } else {
                  onInvalidPhoto?.();
                  e.target.value = '';
                  setForm((prev) => ({ ...prev, photo: null }));
                }
              } else {
                setForm((prev) => ({ ...prev, photo: null }));
              }
            }}
            className={fieldClass}
          />
          {form.photo ? (
            <p className="mt-1 text-xs text-gray-600">Selected: {form.photo.name || 'Photo selected'}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        {isEdit && onBack ? (
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className={`rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 ${
            isSubmitting ? 'cursor-not-allowed opacity-75' : ''
          }`}
        >
          {isSubmitting
            ? isEdit
              ? 'Updating...'
              : 'Saving...'
            : isEdit
              ? 'Update Employee'
              : 'Save & continue'}
        </button>
      </div>

      {formFeedback?.message ? (
        <div
          className={`mt-4 text-sm ${
            formFeedback.type === 'error' ? 'text-red-600' : 'text-green-600'
          }`}
        >
          {formFeedback.message}
        </div>
      ) : null}
    </div>
  );
};

export default AddEmployeeForm;
