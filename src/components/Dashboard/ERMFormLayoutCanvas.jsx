import React from 'react';

const defaultRect = { x: 4, y: 4, w: 40, h: 5 };

/**
 * Renders form fields overlaid on the source image at OCR-derived positions (% of image size).
 */
const ERMFormLayoutCanvas = ({
  imageSrc,
  layoutWidth,
  layoutHeight,
  fields = [],
  values = {},
  onChange,
  readOnly = false,
  showLabels = true,
  className = '',
}) => {
  if (!imageSrc) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center rounded-lg border border-dashed border-gray-200">
        Upload and run OCR to see the form layout on the image.
      </p>
    );
  }

  const aspect =
    layoutWidth > 0 && layoutHeight > 0 ? `${layoutWidth} / ${layoutHeight}` : '3 / 4';

  return (
    <div
      className={`relative w-full max-w-3xl mx-auto overflow-hidden rounded-lg border border-gray-300 bg-gray-100 shadow-inner ${className}`}
      style={{ aspectRatio: aspect }}
    >
      <img
        src={imageSrc}
        alt="Form layout"
        className="absolute inset-0 h-full w-full object-fill pointer-events-none select-none"
        draggable={false}
      />
      {fields.map((f) => {
        const r = f.rect || defaultRect;
        const inputType =
          f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text';
        const commonClass =
          'w-full rounded border border-indigo-400/80 bg-white/95 px-1 py-0.5 text-[10px] sm:text-xs text-gray-900 shadow-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-500';

        return (
          <div
            key={f.id}
            className="absolute flex flex-col justify-start gap-0"
            style={{
              left: `${r.x}%`,
              top: `${r.y}%`,
              width: `${r.w}%`,
              minHeight: `${r.h}%`,
            }}
            title={f.label}
          >
            {showLabels && !readOnly && (
              <span className="truncate text-[8px] sm:text-[9px] font-semibold leading-tight text-indigo-900 bg-white/90 px-0.5 rounded max-w-full">
                {f.label}
              </span>
            )}
            {showLabels && readOnly && (
              <span className="truncate text-[8px] sm:text-[9px] font-semibold leading-tight text-gray-800 bg-white/90 px-0.5 rounded max-w-full">
                {f.label}
              </span>
            )}
            {f.type === 'textarea' ? (
              <textarea
                readOnly={readOnly}
                rows={2}
                value={values[f.id] ?? ''}
                onChange={(e) => onChange?.(f.id, e.target.value)}
                placeholder=""
                className={`${commonClass} resize-none min-h-[2rem]`}
              />
            ) : (
              <input
                type={inputType}
                readOnly={readOnly}
                value={values[f.id] ?? ''}
                onChange={(e) => onChange?.(f.id, e.target.value)}
                placeholder=""
                className={commonClass}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ERMFormLayoutCanvas;
