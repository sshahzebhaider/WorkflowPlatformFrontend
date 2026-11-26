import { DEFAULT_ROLES } from '../auth/permissions';
/** An empty, entirely local development workspace. No CMU or HR seed-project dependency. */
export const seed = {
    users: [
        { id: 'platform-admin', username: 'platform.admin', name: 'Platform Administrator', email: 'admin@example.local', platformAdmin: true },
        { id: 'project-admin', username: 'project.admin', name: 'Project Administrator', email: 'project.admin@example.local', platformAdmin: false },
        { id: 'anita', username: 'anita', name: 'Anita Shah', email: 'anita@example.local', platformAdmin: false },
        { id: 'sara', username: 'sara', name: 'Sara Ahmed', email: 'sara@example.local', platformAdmin: false },
        { id: 'hamza', username: 'hamza', name: 'Hamza Ali', email: 'hamza@example.local', platformAdmin: false },
        { id: 'ali', username: 'ali', name: 'Ali Raza', email: 'ali@example.local', platformAdmin: false }
    ],
    calendars: [], dataSources: [], lookups: [], projects: [],
    teams: [], forms: [], fieldLibrary: [], workflows: [], cases: [], caseTypes: [], notifications: [],
    roles: structuredClone(DEFAULT_ROLES), roleAssignments: [], teamAbsences: [], rcaTemplates: [], projectStatusHistory: [], audits: []
};
export const TERM_KEYS = [
    { key: 'case', label: 'Single record', example: 'Complaint, Request, Application' },
    { key: 'cases', label: 'Plural records', example: 'Complaints, Requests' },
    { key: 'subject', label: 'Person or entity', example: 'Customer, Employee' },
    { key: 'team', label: 'Acting group', example: 'Team, Approvers' },
    { key: 'referencePrefix', label: 'Reference prefix', example: 'CMP, HR' },
    { key: 'resolve', label: 'Completion action', example: 'Resolve, Approve, Complete' }
];
export const defaultTerms = { case: 'Case', cases: 'Cases', subject: 'Customer', team: 'Team', referencePrefix: 'CASE', resolve: 'Resolve' };
export const FIELD_TYPES = [
    { value: 'text', label: 'Short text' }, { value: 'textarea', label: 'Long text' },
    { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' },
    { value: 'select', label: 'Dropdown' }, { value: 'checkbox', label: 'Checkbox' },
    { value: 'email', label: 'Email address' }, { value: 'attachment', label: 'Attachment / document upload' }
];
export const NODE_TYPES = [
    { value: 'start', label: 'Start', group: 'Flow' },
    { value: 'task', label: 'Review / approval', group: 'People' },
    { value: 'officerRouting', label: 'Assign officer', group: 'People' },
    { value: 'requestInfo', label: 'Request information', group: 'People' },
    { value: 'groupReview', label: 'Group review', group: 'People' },
    { value: 'decision', label: 'Decision', group: 'Logic' },
    { value: 'parallel', label: 'Parallel split', group: 'Logic' },
    { value: 'wait', label: 'Wait or timer', group: 'Logic' },
    { value: 'dataSource', label: 'Call data source', group: 'System' },
    { value: 'notify', label: 'Send notification', group: 'System' },
    { value: 'end', label: 'End', group: 'Flow' }
];
export const TEMPLATES = [
    { key: 'blank', name: 'Blank project', desc: 'Start from scratch without a workflow draft.' },
    { key: 'step1', name: '1-step workflow', desc: 'Start → Step 1 → End' },
    { key: 'step2', name: '2-step workflow', desc: 'Start → Step 1 → Step 2 → End' },
    { key: 'step3', name: '3-step workflow', desc: 'Start → Step 1 → Step 2 → Step 3 → End' }
];
