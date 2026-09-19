import React from 'react';

const EmployeeActiveToggle = ({ checked = false, onChange, disabled = false }) => (
  <label
    className={`inline-flex items-center justify-end ${
      disabled ? 'cursor-wait opacity-60' : 'cursor-pointer'
    }`}
    title={checked ? 'Active — switch off to deactivate' : 'Inactive — switch on to activate'}
    onMouseDown={(e) => {
      // Avoid focus scrollIntoView jumping wide-table ancestors.
      e.preventDefault();
    }}
  >
    <span className="sr-only">{checked ? 'Active' : 'Inactive'}</span>
    <input
      type="checkbox"
      role="switch"
      aria-checked={checked}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      className="sr-only peer"
      tabIndex={-1}
    />
    <span
      className="relative inline-flex h-5 w-9 shrink-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-emerald-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-indigo-500 peer-disabled:opacity-50 after:pointer-events-none after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4"
      aria-hidden
    />
  </label>
);

export default EmployeeActiveToggle;
