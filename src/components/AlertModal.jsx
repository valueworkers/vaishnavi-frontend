import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiCheckCircle, FiAlertCircle, FiAlertTriangle, FiInfo, FiX } from 'react-icons/fi';

const typeConfig = {
  success: {
    icon: FiCheckCircle,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    titleColor: 'text-emerald-800',
    borderColor: 'border-emerald-200',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
  },
  error: {
    icon: FiAlertCircle,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    titleColor: 'text-red-800',
    borderColor: 'border-red-200',
    buttonClass: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  },
  warning: {
    icon: FiAlertTriangle,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-800',
    borderColor: 'border-amber-200',
    buttonClass: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
  },
  info: {
    icon: FiInfo,
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
    titleColor: 'text-indigo-800',
    borderColor: 'border-indigo-200',
    buttonClass: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500',
  },
  danger: {
    icon: FiAlertTriangle,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    titleColor: 'text-red-800',
    borderColor: 'border-red-200',
    buttonClass: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  },
};

const AlertModal = ({
  open,
  type = 'info',
  message,
  title,
  onClose,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmLoading = false,
}) => {
  const config = typeConfig[type] || typeConfig.info;
  const Icon = config.icon;
  const isConfirm = typeof onConfirm === 'function';

  const defaultTitles = {
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Notice',
    danger: 'Confirm',
  };
  const displayTitle = title ?? defaultTitles[type] ?? 'Notice';

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape' && !confirmLoading) onClose?.();
    };
    const scrollbarGap = window.innerWidth - document.documentElement.clientWidth;
    window.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    if (scrollbarGap > 0) {
      document.body.style.paddingRight = `${scrollbarGap}px`;
    }
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [open, onClose, confirmLoading]);

  if (!open) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-title"
      aria-describedby="alert-message"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          if (!confirmLoading) onClose?.();
        }}
      />
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`border-b px-6 pb-4 pt-6 ${config.borderColor} border-opacity-50`}>
          <div className="flex items-start gap-4">
            <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${config.iconBg}`}>
              <Icon className={`h-6 w-6 ${config.iconColor}`} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h3 id="alert-title" className={`text-lg font-semibold ${config.titleColor}`}>
                {displayTitle}
              </h3>
              <p id="alert-message" className="mt-1 text-sm leading-relaxed text-gray-600">
                {message}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={confirmLoading}
              className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
              aria-label="Close"
            >
              <FiX className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4">
          {isConfirm ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={confirmLoading}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirmLoading}
                className={`rounded-lg px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${config.buttonClass}`}
              >
                {confirmLoading ? 'Please wait…' : confirmLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${config.buttonClass}`}
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

export default AlertModal;
