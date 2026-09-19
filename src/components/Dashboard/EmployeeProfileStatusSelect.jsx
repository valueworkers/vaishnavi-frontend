import React from 'react';
import { EMPLOYEE_PROFILE_STATUS_OPTIONS } from '../../utils/employeeListQuery';

const STATUS_STYLES = {
  ACTIVE: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  INACTIVE: 'border-slate-300 bg-slate-100 text-slate-700',
  TERMINATED: 'border-rose-300 bg-rose-50 text-rose-800',
};

const EmployeeProfileStatusSelect = ({
  value = 'ACTIVE',
  onChange,
  disabled = false,
}) => {
  const key = String(value || 'ACTIVE').trim().toUpperCase() || 'ACTIVE';
  const style = STATUS_STYLES[key] || STATUS_STYLES.INACTIVE;

  if (key === 'TERMINATED') {
    return (
      <span
        className={`inline-flex max-w-[7.5rem] items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}
        title="Terminated"
      >
        Terminated
      </span>
    );
  }

  return (
    <select
      value={EMPLOYEE_PROFILE_STATUS_OPTIONS.some((opt) => opt.value === key) ? key : 'ACTIVE'}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      aria-label="Employee status"
      title="Change status"
      className={`max-w-[7.5rem] rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 disabled:cursor-wait disabled:opacity-60 ${style}`}
    >
      {EMPLOYEE_PROFILE_STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

export default EmployeeProfileStatusSelect;
