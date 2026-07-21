// Row<->entry mapping for feedback_notes, same pattern as _itemLogic.js's
// rowToItem/WRITABLE_ITEM_COLUMNS.
export function rowToFeedback(row) {
  return {
    id: row.id,
    person: row.person,
    reviewDate: dateOnly(row.review_date),
    strengths: row.strengths,
    areasForGrowth: row.areas_for_growth,
    goals: row.goals,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dateOnly(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return new Date(v).toISOString().slice(0, 10);
}

export const WRITABLE_FEEDBACK_COLUMNS = {
  person: 'person',
  reviewDate: 'review_date',
  strengths: 'strengths',
  areasForGrowth: 'areas_for_growth',
  goals: 'goals',
  notes: 'notes',
};
