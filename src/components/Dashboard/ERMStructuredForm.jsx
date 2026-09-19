import React, { useMemo, useState } from 'react';
import {
  categoryFormHeading,
  emptyTableRow,
  groupFieldsIntoRows,
  inferFormLayoutStyle,
  LAYOUT_STYLE_OPTIONS,
  normalizeTableRows,
  resolveTableMatrix,
} from '../../utils/ermFormLayout';
import { ERM_FIELD_TYPE_OPTIONS, ermFieldId, reorderFieldsById } from '../../constants/ermFieldTypes';

const fieldInputClass =
  'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50';

const ERMStructuredForm = ({
  formTitle = 'Medical form',
  category = 'patient-summary',
  categoryLabel = '',
  patientLabel = '',
  fields = [],
  values = {},
  onChange,
  readOnly = false,
  layoutEditable = false,
  layoutStyle: layoutStyleProp,
  tableColumnsPerRow: tableColumnsProp = 3,
  onFieldsChange,
  onLayoutStyleChange,
  onTableColumnsChange,
}) => {
  const [dragId, setDragId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('text');
  const [showAddField, setShowAddField] = useState(false);
  const [tabularCols, setTabularCols] = useState(Math.max(1, Math.min(12, Number(tableColumnsProp) || 3)));

  const heading = categoryFormHeading(category, formTitle);
  const subtitle = categoryLabel || formTitle;
  const resolvedLayoutStyle = useMemo(() => {
    if (layoutStyleProp === 'grid' || layoutStyleProp === 'table' || layoutStyleProp === 'data-table') {
      return layoutStyleProp;
    }
    return inferFormLayoutStyle(fields, layoutStyleProp);
  }, [fields, layoutStyleProp]);

  const tableMatrix = useMemo(() => {
    if (resolvedLayoutStyle !== 'table') return null;
    return resolveTableMatrix(fields, { columnsPerRow: tabularCols });
  }, [fields, resolvedLayoutStyle, tabularCols]);
  const useDataTableLayout = resolvedLayoutStyle === 'data-table';
  const useTableLayout = !useDataTableLayout && Boolean(tableMatrix?.rows?.length);
  const useSmartRows =
    !layoutEditable && !useTableLayout && !useDataTableLayout && category === 'patient-summary';

  const tableRows = useMemo(
    () => (useDataTableLayout ? normalizeTableRows(values?.tableRows, fields, 6) : []),
    [useDataTableLayout, values?.tableRows, fields]
  );

  const emitTableRows = (nextRows) => {
    onChange?.('__tableRows__', nextRows);
  };

  const emitFields = (next) => {
    if (typeof onFieldsChange === 'function') onFieldsChange(next);
  };

  const handleDrop = (targetId) => {
    if (!dragId || !layoutEditable) return;
    emitFields(reorderFieldsById(fields, dragId, targetId));
    setDragId(null);
    setDropTargetId(null);
  };

  const updateFieldMeta = (id, patch) => {
    emitFields(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeField = (id) => {
    if (!window.confirm('Remove this field from the form?')) return;
    emitFields(fields.filter((f) => f.id !== id));
  };

  const addField = () => {
    const label = newLabel.trim();
    if (!label) return;
    emitFields([
      ...fields,
      {
        id: ermFieldId(),
        label,
        type: newType,
      },
    ]);
    setNewLabel('');
    setNewType('text');
    setShowAddField(false);
  };

  const renderValueInput = (f) => {
    const value = values[f.id] ?? '';
    const disabled = readOnly && !layoutEditable;
    if (f.type === 'textarea') {
      return (
        <textarea
          rows={3}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange?.(f.id, e.target.value)}
          className={`${fieldInputClass} resize-y min-h-[4rem]`}
        />
      );
    }
    if (f.type === 'number') {
      return (
        <input
          type="number"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange?.(f.id, e.target.value)}
          className={fieldInputClass}
        />
      );
    }
    if (f.type === 'date') {
      return (
        <input
          type="date"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange?.(f.id, e.target.value)}
          className={fieldInputClass}
        />
      );
    }
    return (
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(f.id, e.target.value)}
        className={fieldInputClass}
      />
    );
  };

  const renderFieldCell = (f) => {
    const isDropTarget = dropTargetId === f.id && dragId && dragId !== f.id;
    const isDragging = dragId === f.id;

    return (
      <div
        key={f.id}
        draggable={layoutEditable}
        onDragStart={(e) => {
          if (!layoutEditable) return;
          setDragId(f.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => {
          setDragId(null);
          setDropTargetId(null);
        }}
        onDragOver={(e) => {
          if (!layoutEditable || !dragId) return;
          e.preventDefault();
          setDropTargetId(f.id);
        }}
        onDragLeave={() => {
          if (dropTargetId === f.id) setDropTargetId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDrop(f.id);
        }}
        className={`rounded-lg border bg-white p-2.5 transition-shadow ${
          isDropTarget
            ? 'border-indigo-500 ring-2 ring-indigo-200'
            : 'border-slate-200'
        } ${isDragging ? 'opacity-40' : ''} ${layoutEditable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        {layoutEditable && (
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 select-none">
              ⋮⋮ Drag
            </span>
            <button
              type="button"
              onClick={() => removeField(f.id)}
              className="text-[11px] font-medium text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        )}
        {layoutEditable ? (
          <div className="space-y-1.5 mb-1">
            <input
              type="text"
              value={f.label}
              onChange={(e) => updateFieldMeta(f.id, { label: e.target.value })}
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-800"
              placeholder="Field label"
            />
            <select
              value={f.type || 'text'}
              onChange={(e) => updateFieldMeta(f.id, { type: e.target.value })}
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
            >
              {ERM_FIELD_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <span className="mb-1 block text-sm font-semibold text-slate-800">{f.label}</span>
        )}
        {renderValueInput(f)}
      </div>
    );
  };

  const renderDataTableLayout = () => {
    const compactInput = `${fieldInputClass} mt-0 py-1.5 text-xs w-full min-w-[4.5rem]`;
    const columns = fields || [];

    const renderCellInput = (col, row) => {
      const val = row.cells?.[col.id] ?? '';
      const disabled = readOnly && !layoutEditable;
      if (col.type === 'date') {
        return (
          <input
            type="date"
            value={val}
            disabled={disabled}
            onChange={(e) => {
              const next = tableRows.map((r) =>
                r.id === row.id ? { ...r, cells: { ...r.cells, [col.id]: e.target.value } } : r
              );
              emitTableRows(next);
            }}
            className={compactInput}
          />
        );
      }
      if (col.type === 'number') {
        return (
          <input
            type="number"
            value={val}
            disabled={disabled}
            onChange={(e) => {
              const next = tableRows.map((r) =>
                r.id === row.id ? { ...r, cells: { ...r.cells, [col.id]: e.target.value } } : r
              );
              emitTableRows(next);
            }}
            className={compactInput}
          />
        );
      }
      return (
        <input
          type="text"
          value={val}
          disabled={disabled}
          onChange={(e) => {
            const next = tableRows.map((r) =>
              r.id === row.id ? { ...r, cells: { ...r.cells, [col.id]: e.target.value } } : r
            );
            emitTableRows(next);
          }}
          className={compactInput}
        />
      );
    };

    return (
      <div className="space-y-2">
        <p className="text-[11px] text-slate-600">
          Log sheet — add a row for each reading (e.g. every 8 hours). Column headers match your scanned
          form.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-400">
          <table className="w-full border-collapse text-xs min-w-[640px]">
            <thead>
              <tr className="bg-slate-100">
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className="border border-slate-400 px-1.5 py-2 text-left font-bold text-slate-900 uppercase tracking-wide whitespace-nowrap"
                  >
                    {layoutEditable ? (
                      <input
                        type="text"
                        value={col.label}
                        onChange={(e) => updateFieldMeta(col.id, { label: e.target.value })}
                        className="w-full min-w-[3.5rem] bg-transparent font-bold uppercase text-[10px]"
                      />
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
                {!readOnly && (
                  <th className="border border-slate-400 w-10 bg-slate-100" aria-label="Remove row" />
                )}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, rowIdx) => (
                <tr key={row.id} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}>
                  {columns.map((col) => (
                    <td key={`${row.id}-${col.id}`} className="border border-slate-300 p-1 align-middle">
                      {renderCellInput(col, row)}
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="border border-slate-300 p-1 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => emitTableRows(tableRows.filter((r) => r.id !== row.id))}
                        className="text-[10px] text-red-600 hover:underline"
                        title="Remove row"
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => emitTableRows([...tableRows, emptyTableRow(columns)])}
              className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
            >
              + Add row
            </button>
            {layoutEditable && (
              <button
                type="button"
                onClick={() =>
                  emitFields([
                    ...columns,
                    {
                      id: ermFieldId(),
                      label: 'NEW COLUMN',
                      type: 'text',
                    },
                  ])
                }
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                + Add column
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderLayoutToolbar = () => {
    if (!layoutEditable || !onLayoutStyleChange) return null;
    return (
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-800">Form layout</p>
        <div className="flex flex-wrap gap-2">
          {LAYOUT_STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onLayoutStyleChange(opt.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold border transition-colors ${
                resolvedLayoutStyle === opt.value
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 bg-white text-slate-800 hover:border-indigo-400'
              }`}
              title={opt.hint}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {resolvedLayoutStyle === 'table' && (
          <label className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <span className="font-medium">Columns per row</span>
            <select
              value={tabularCols}
              onChange={(e) => {
                const n = Number(e.target.value);
                setTabularCols(n);
                onTableColumnsChange?.(n);
              }}
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            >
              {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="text-slate-500">Drag cells to rearrange.</span>
          </label>
        )}
        <p className="text-[10px] text-slate-600">
          {LAYOUT_STYLE_OPTIONS.find((o) => o.value === resolvedLayoutStyle)?.hint}
        </p>
      </div>
    );
  };

  const renderTableLayout = () => {
    if (!tableMatrix) return null;
    const compactInput = `${fieldInputClass} mt-0.5 py-1.5 text-xs`;

    const renderTableCell = (f, rowIdx, colIdx) => {
      if (!f) {
        return (
          <td
            key={`empty-${rowIdx}-${colIdx}`}
            className="border border-slate-200 bg-slate-50/30 p-2 min-w-[3rem]"
          />
        );
      }
      const value = values[f.id] ?? '';
      const disabled = readOnly && !layoutEditable;
      const isDropTarget = dropTargetId === f.id && dragId && dragId !== f.id;
      const isDragging = dragId === f.id;
      return (
        <td
          key={f.id}
          draggable={layoutEditable}
          onDragStart={(e) => {
            if (!layoutEditable) return;
            setDragId(f.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => {
            setDragId(null);
            setDropTargetId(null);
          }}
          onDragOver={(e) => {
            if (!layoutEditable || !dragId) return;
            e.preventDefault();
            setDropTargetId(f.id);
          }}
          onDragLeave={() => {
            if (dropTargetId === f.id) setDropTargetId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(f.id);
          }}
          className={`border bg-white p-2 align-top min-w-[5rem] transition-shadow ${
            isDropTarget ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-300'
          } ${isDragging ? 'opacity-40' : ''} ${layoutEditable ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
          {layoutEditable && (
            <div className="mb-1 flex items-center justify-between gap-1">
              <span className="text-[9px] font-semibold uppercase text-slate-400">⋮⋮</span>
              <button
                type="button"
                onClick={() => removeField(f.id)}
                className="text-[10px] text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          )}
          {layoutEditable ? (
            <div className="space-y-1">
              <input
                type="text"
                value={f.label}
                onChange={(e) => updateFieldMeta(f.id, { label: e.target.value })}
                className="w-full rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-semibold"
              />
              <select
                value={f.type || 'text'}
                onChange={(e) => updateFieldMeta(f.id, { type: e.target.value })}
                className="w-full rounded border border-slate-200 px-1.5 py-0.5 text-[10px]"
              >
                {ERM_FIELD_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-[11px] font-semibold text-slate-800 leading-tight mb-1">{f.label}</div>
          )}
          {f.type === 'textarea' ? (
            <textarea
              rows={2}
              value={value}
              disabled={disabled}
              onChange={(e) => onChange?.(f.id, e.target.value)}
              className={`${compactInput} resize-y min-h-[2.5rem]`}
            />
          ) : f.type === 'number' ? (
            <input
              type="number"
              value={value}
              disabled={disabled}
              onChange={(e) => onChange?.(f.id, e.target.value)}
              className={compactInput}
            />
          ) : f.type === 'date' ? (
            <input
              type="date"
              value={value}
              disabled={disabled}
              onChange={(e) => onChange?.(f.id, e.target.value)}
              className={compactInput}
            />
          ) : (
            <input
              type="text"
              value={value}
              disabled={disabled}
              onChange={(e) => onChange?.(f.id, e.target.value)}
              className={compactInput}
            />
          )}
        </td>
      );
    };

    return (
      <div className="overflow-x-auto rounded-lg border border-slate-300">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {tableMatrix.rows.map((row, rowIdx) => (
              <tr key={`trow-${rowIdx}`} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                {row.map((cell, colIdx) => renderTableCell(cell, rowIdx, colIdx))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderGridLayout = () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((f) => renderFieldCell(f))}
    </div>
  );

  const renderSmartRowsLayout = () => {
    const rows = groupFieldsIntoRows(fields);
    return rows.map((row, rowIdx) => {
      if (row.type === 'full') {
        const f = row.fields[0];
        return (
          <div key={f.id || rowIdx} className="col-span-full">
            {renderFieldCell(f)}
          </div>
        );
      }
      const gridClass =
        row.grid === 'grid-cols-3 wide-narrow'
          ? 'grid grid-cols-1 gap-4 sm:grid-cols-3'
          : row.grid === 'grid-cols-2'
            ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
            : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';
      return (
        <div key={`row-${rowIdx}`} className={gridClass}>
          {row.fields.map((f) => renderFieldCell(f))}
        </div>
      );
    });
  };

  return (
    <div className="mx-auto max-w-5xl rounded-xl border-2 border-slate-300 bg-white shadow-md overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-5 text-center sm:px-6">
        <p className="text-lg font-bold tracking-wide text-slate-900 sm:text-xl">VAISHNAVI MEDICARE</p>
        <p className="mt-2 text-sm font-semibold text-slate-800 underline underline-offset-4">{heading}</p>
        {subtitle && subtitle.toUpperCase() !== heading ? (
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        ) : null}
        {patientLabel ? (
          <p className="mt-2 text-xs font-medium text-indigo-800">Patient: {patientLabel}</p>
        ) : null}
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        {renderLayoutToolbar()}

        {fields.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No fields yet. Add fields below or run OCR.</p>
        ) : useDataTableLayout ? (
          renderDataTableLayout()
        ) : useTableLayout ? (
          renderTableLayout()
        ) : useSmartRows ? (
          <div className="space-y-4">{renderSmartRowsLayout()}</div>
        ) : (
          renderGridLayout()
        )}

        {layoutEditable && (
          <div className="border-t border-slate-200 pt-4">
            {!showAddField ? (
              <button
                type="button"
                onClick={() => setShowAddField(true)}
                className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
              >
                + Add field
              </button>
            ) : (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-800">New field</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-xs">
                    <span className="font-medium text-slate-700">Field label</span>
                    <input
                      type="text"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="e.g. Psychological status"
                      className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="font-medium text-slate-700">Field type</span>
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      {ERM_FIELD_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addField}
                    disabled={!newLabel.trim()}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Add to form
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddField(false);
                      setNewLabel('');
                    }}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ERMStructuredForm;
