// Sample rows inserted by /api/items/seed on first load (empty table only).
// Dates are offsets in days from "today" (computed at insert time) so the
// seed always looks current rather than pinned to a fixed calendar date.
export const SAMPLE_ITEMS = [
  {
    pinned: true, type: 'SLA', description: 'Weekly incident report to UK site leadership',
    function: 'UK EHS', owner: 'R. Match', raisedBy: 'Site Director',
    dateRaisedOffset: -45, priority: 'High', status: 'On Track',
    dueType: 'recurring', dueDateOffset: 3, frequency: 'Weekly',
    percentComplete: 100, nextAction: 'Send Friday summary',
    stakeholders: 'Site Director, HSE Team', notes: 'Stable cadence, no issues.',
    lastUpdatedOffset: -1,
    history: [
      { offset: -1, change: 'Marked On Track for this week' },
      { offset: -15, change: 'Status changed from "In Progress" to "On Track"' },
    ],
  },
  {
    pinned: false, type: 'Ad-hoc', description: 'Investigate near-miss report at Leeds warehouse',
    function: 'UK EHS', owner: 'J. Okafor', raisedBy: 'Warehouse Manager',
    dateRaisedOffset: -6, priority: 'High', status: 'At Risk',
    dueType: 'date', dueDateOffset: 2, frequency: null,
    percentComplete: 40, nextAction: 'Interview two witnesses',
    stakeholders: 'Warehouse Manager, HSE Team', notes: 'Waiting on CCTV footage from site.',
    lastUpdatedOffset: -2,
    history: [
      { offset: -2, change: 'Status changed from "In Progress" to "At Risk" — waiting on CCTV' },
      { offset: -6, change: 'Item created' },
    ],
  },
  {
    pinned: false, type: 'SLA', description: 'Monthly quality metrics pack to plant GM',
    function: 'UK QFS', owner: 'S. Patel', raisedBy: 'Plant GM',
    dateRaisedOffset: -40, priority: 'Medium', status: 'Overdue',
    dueType: 'recurring', dueDateOffset: -4, frequency: 'Monthly',
    percentComplete: 70, nextAction: 'Finalize scorecard and send',
    stakeholders: 'Plant GM, Ops Team', notes: 'Delayed by late lab results.',
    lastUpdatedOffset: -11,
    history: [
      { offset: -11, change: 'Chased lab for outstanding results' },
      { offset: -16, change: 'Draft pack started' },
    ],
  },
  {
    pinned: false, type: 'Project', description: 'KSA QFS lab accreditation renewal',
    function: 'KSA QFS', owner: 'F. Al-Rashid', raisedBy: 'Regional QA Director',
    dateRaisedOffset: -90, priority: 'High', status: 'Blocked',
    dueType: 'date', dueDateOffset: 16, frequency: null,
    percentComplete: 45, nextAction: 'Submit outstanding documentation',
    stakeholders: 'Regional QA Director, External Auditor', notes: 'Documentation gap identified last review.',
    lastUpdatedOffset: -9,
    history: [
      { offset: -9, change: 'Status changed from "At Risk" to "Blocked" — documentation gap' },
    ],
  },
  {
    pinned: true, type: 'Recurring Meeting', description: 'Bi-weekly KSA-UK QFS sync',
    function: 'Cross-functional', owner: 'M. Torres', raisedBy: 'Team Leader',
    dateRaisedOffset: -160, priority: 'Medium', status: 'Not Started',
    dueType: 'recurring', dueDateOffset: 5, frequency: 'Weekly',
    percentComplete: 0, nextAction: 'Prepare agenda',
    stakeholders: 'UK QFS, KSA QFS teams', notes: '',
    lastUpdatedOffset: -7,
    history: [
      { offset: -7, change: 'Reset for new cycle' },
    ],
  },
  {
    pinned: false, type: 'Reporting', description: 'Digital tracker rollout to all functions',
    function: 'Project', owner: 'Team Leader', raisedBy: 'Self-initiated',
    dateRaisedOffset: -30, priority: 'Low', status: 'Completed',
    dueType: 'date', dueDateOffset: -3, frequency: null,
    percentComplete: 100, nextAction: 'None — closed out',
    stakeholders: 'All function owners', notes: 'Signed off and rolled out to KSA team.',
    lastUpdatedOffset: -3,
    history: [
      { offset: -3, change: 'Status changed from "In Progress" to "Completed"' },
    ],
  },
];
