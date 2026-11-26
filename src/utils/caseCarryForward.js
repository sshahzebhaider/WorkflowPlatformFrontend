/** Browser-local shared case data. Keep original intake and every completed step's answers. */
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function carryForwardAnswers(record, submittedByForm = {}) {
    const stepValues = { ...(record.stepValues || {}) };
    const fieldValues = { ...(record.fieldValues || {}) };
    for (const [formId, answers] of Object.entries(submittedByForm || {})) {
        if (!isObject(answers))
            continue;
        stepValues[formId] = { ...(stepValues[formId] || {}), ...answers };
        Object.assign(fieldValues, answers);
    }
    return { ...record, stepValues, fieldValues };
}
/** Prefill a subsequent team's form from the most recent shared values. */
export function stepPrefillValues(record, formDefinition) {
    if (!formDefinition)
        return {};
    const fields = formDefinition.fields || [];
    const currentFormAnswers = record?.stepValues?.[formDefinition.id] || {};
    const shared = record?.fieldValues || {};
    const intake = record?.intakeValues || {};
    return Object.fromEntries(fields.flatMap(field => {
        const value = currentFormAnswers[field.key] ?? shared[field.key] ?? intake[field.key];
        return value === undefined ? [] : [[field.key, value]];
    }));
}
/** Produces only real, named fields; no hardcoded CMU/HR or workflow step assumptions. */
export function caseInformationSections(record) {
    if (!record)
        return [];
    const sections = [];
    const intakeFields = record.intakeSnapshot?.fields || [];
    const intake = record.intakeValues || record.fieldValues || {};
    if (intakeFields.length)
        sections.push({
            key: 'intake', title: record.intakeSnapshot?.name || 'Intake details',
            fields: intakeFields.map(field => ({ ...field, value: intake[field.key] ?? record.fieldValues?.[field.key] }))
        });
    if (record.classificationSnapshot?.length)
        sections.push({
            key: 'classification', title: 'Initial classification',
            fields: record.classificationSnapshot.map(field => ({ ...field, value: record.classificationValues?.[field.key] }))
        });
    const seen = new Set();
    for (const task of record.runtime?.tasks || []) {
        if (task.status !== 'Completed')
            continue;
        for (const [formId, values] of Object.entries(task.formValues || {})) {
            if (!isObject(values))
                continue;
            const definition = record.stepFormSnapshots?.[formId];
            if (!definition)
                continue;
            const fields = (definition.fields || []).filter(field => Object.hasOwn(values, field.key)).map(field => ({ ...field, value: values[field.key] }));
            if (fields.length) {
                sections.push({ key: `step-${task.id}-${formId}`, title: `${definition.name} · Completed step`, fields });
                seen.add(formId);
            }
        }
    }
    for (const [formId, answers] of Object.entries(record.stepValues || {})) {
        if (seen.has(formId))
            continue;
        const definition = record.stepFormSnapshots?.[formId];
        if (definition && isObject(answers))
            sections.push({
                key: `saved-${formId}`, title: `${definition.name} · Saved answers`,
                fields: (definition.fields || []).filter(field => Object.hasOwn(answers, field.key)).map(field => ({ ...field, value: answers[field.key] }))
            });
    }
    const mapped = Object.entries(record.integrationValues || {}).filter(([key]) => !Object.hasOwn(intake, key));
    if (mapped.length)
        sections.push({ key: 'integrations', title: 'Additional information', fields: mapped.map(([key, value]) => ({ key, label: key, value })) });
    return sections.filter(section => section.fields?.length);
}
