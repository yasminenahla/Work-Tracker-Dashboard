// Client-side constants: column definitions, fallback dropdown lists (used
// only before /api/config has loaded), and frequency options. The lists
// themselves live in the database (tracker_config.lists) and are editable
// from Settings — DEFAULT_LISTS here is just a same-shape fallback.

export const FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual'];

export const DEFAULT_LISTS = {
  types: ['SLA', 'Ad-hoc', 'Project', 'Workstream', 'Recurring Meeting', 'Reporting'],
  functions: ['UK EHS', 'UK QFS', 'KSA QFS', 'Cross-functional', 'Project'],
  priorities: ['High', 'Medium', 'Low'],
  statuses: ['Not Started', 'In Progress', 'On Track', 'At Risk', 'Blocked', 'Completed', 'Overdue'],
};

// All columns except pin/description (always shown) can be hidden via Settings.
export const COLUMN_DEFS = [
  { key: 'id', label: 'ID' },
  { key: 'type', label: 'Type' },
  { key: 'function', label: 'Function' },
  { key: 'owner', label: 'Owner' },
  { key: 'raisedBy', label: 'Raised By' },
  { key: 'dateRaised', label: 'Date Raised' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'due', label: 'Due / Cadence' },
  { key: 'percentComplete', label: '% Complete' },
  { key: 'nextAction', label: 'Next Action' },
  { key: 'stakeholders', label: 'Stakeholders' },
  { key: 'notes', label: 'Notes' },
  { key: 'lastUpdated', label: 'Last Updated' },
  { key: 'risk', label: 'Risk' },
];
export const DEFAULT_VISIBLE_COLUMNS = COLUMN_DEFS.reduce((acc, c) => { acc[c.key] = true; return acc; }, {});

export const DEFAULT_CONFIG = {
  lists: DEFAULT_LISTS,
  visibleColumns: DEFAULT_VISIBLE_COLUMNS,
  riskThresholds: { amberDueWithinDays: 7 },
  staleDays: 7,
  defaultOwner: '',
  lastExportedAt: null,
  sampleDataCleared: false,
};

export const STATUS_SEMANTIC = {
  'not started': 'neutral',
  'in progress': 'info',
  'on track': 'good',
  'at risk': 'warning',
  'blocked': 'critical',
  'completed': 'good',
  'overdue': 'critical',
};
export const PRIORITY_SEMANTIC = { high: 'high', medium: 'medium', low: 'low' };
export const CATEGORICAL_RAMP_SIZE = 8;

export const LIST_GROUPS = [
  { key: 'types', title: 'Type of Work', itemField: 'type' },
  { key: 'functions', title: 'Function', itemField: 'function' },
  { key: 'priorities', title: 'Priority', itemField: 'priority' },
  { key: 'statuses', title: 'Status', itemField: 'status' },
];
