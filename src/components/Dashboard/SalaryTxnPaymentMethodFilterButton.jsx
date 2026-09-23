import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { SALARY_TXN_PAYMENT_METHOD_OPTIONS } from '../../utils/salaryTransactionColumns';

const MENU_MIN_WIDTH = 168;

const SalaryTxnPaymentMethodFilterButton = ({
  value = '',
  onChange,
  disabled = false,
  compact = false,
  label = 'Payment Method',
  options = SALARY_TXN_PAYMENT_METHOD_OPTIONS,
  allLabel = 'All methods',
}) => {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState(null);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const filterOptions = Array.isArray(options) && options.length
    ? options
    : SALARY_TXN_PAYMENT_METHOD_OPTIONS;
  const selectedLabel = filterOptions.find((opt) => opt.value === value)?.label;

  const updateMenuPosition = () => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, MENU_MIN_WIDTH),
    });
  };

  useEffect(() => {
    if (!open) {
      setMenuRect(null);
      return undefined;
    }
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      const target = e.target;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const pick = (next) => {
    onChange?.(next);
    setOpen(false);
  };

  const filterTitle = value
    ? `${label}: ${selectedLabel}. Click to change.`
    : `Filter by ${label.toLowerCase()}`;

  const menu =
    open && !disabled && menuRect
      ? createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            style={{
              position: 'fixed',
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              zIndex: 9999,
            }}
            className="overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          >
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => pick('')}
                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${
                  !value ? 'bg-indigo-50 font-semibold text-indigo-800' : 'text-gray-800'
                }`}
              >
                {allLabel}
              </button>
            </li>
            {filterOptions.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === opt.value}
                  onClick={() => pick(opt.value)}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${
                    value === opt.value
                      ? 'bg-indigo-50 font-semibold text-indigo-800'
                      : 'text-gray-800'
                  }`}
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null;

  return (
    <>
      <div className={`relative ${compact ? 'inline-flex max-w-full' : 'shrink-0'}`} ref={rootRef}>
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((prev) => !prev)}
          title={filterTitle}
          className={
            compact
              ? `inline-flex max-w-full items-center gap-0.5 rounded px-0.5 py-0 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                  disabled
                    ? 'cursor-not-allowed text-gray-400'
                    : value
                      ? 'text-indigo-700'
                      : 'text-gray-900 hover:text-indigo-700'
                }`
              : `inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  disabled
                    ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                    : value
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`
          }
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className={compact ? 'truncate' : undefined}>{label}</span>
          {!compact && selectedLabel ? <span className="font-bold">({selectedLabel})</span> : null}
          {compact && value ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" aria-hidden />
          ) : null}
          {open ? (
            <FiChevronUp className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} shrink-0`} aria-hidden />
          ) : (
            <FiChevronDown className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} shrink-0`} aria-hidden />
          )}
        </button>
      </div>
      {menu}
    </>
  );
};

export default SalaryTxnPaymentMethodFilterButton;
