/** Remove per-patient data from a template (values live on patient documents only). */
export const stripTemplatePatientData = (template) => {
  if (!template || typeof template !== 'object') return template;
  const { field_values, patientDocId, patientPk, ...rest } = template;
  return rest;
};

export const sanitizeTemplatesList = (list) =>
  Array.isArray(list) ? list.map(stripTemplatePatientData) : [];

import { defaultTableRows, isDataTableLayout } from './ermFormLayout';

export const emptyValuesForFields = (fields, layoutStyle) => {
  if (isDataTableLayout(fields, layoutStyle)) {
    return { tableRows: defaultTableRows(fields, 8) };
  }
  const values = {};
  for (const f of fields || []) {
    if (f?.id) values[f.id] = '';
  }
  return values;
};
