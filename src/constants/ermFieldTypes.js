/** ERM form field value types (label + input control). */
export const ERM_FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text (string)' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'textarea', label: 'Long text' },
];

export const ermFieldId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const reorderFieldsById = (fields, dragId, targetId) => {
  if (!dragId || !targetId || dragId === targetId) return fields;
  const list = [...fields];
  const from = list.findIndex((f) => f.id === dragId);
  const to = list.findIndex((f) => f.id === targetId);
  if (from < 0 || to < 0) return fields;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return list;
};
