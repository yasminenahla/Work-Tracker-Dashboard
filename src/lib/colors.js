// Color assignment. Function values are pure categories -> colored by their
// stable position in config.lists.functions (ramp wraps past 8 distinct
// values — a deliberate pragmatic fallback for this small personal list).
// Status/Priority carry fixed meaning -> colored by reserved semantic role,
// with the same ramp as a fallback for renamed/custom values.
import { CATEGORICAL_RAMP_SIZE, STATUS_SEMANTIC, PRIORITY_SEMANTIC } from './constants.js';

export function categoricalRgbVar(index) {
  const slot = (index % CATEGORICAL_RAMP_SIZE) + 1;
  return `--c-cat-${slot}-rgb`;
}

export function functionColorVar(value, lists) {
  const idx = lists.functions.indexOf(value);
  return categoricalRgbVar(idx < 0 ? 0 : idx);
}

export function statusColorVar(value, lists) {
  const role = STATUS_SEMANTIC[String(value).toLowerCase()];
  if (role) return `--c-status-${role}-rgb`;
  const idx = lists.statuses.indexOf(value);
  return categoricalRgbVar(idx < 0 ? 0 : idx);
}

export function priorityColorVar(value, lists) {
  const role = PRIORITY_SEMANTIC[String(value).toLowerCase()];
  if (role) return `--c-priority-${role}-rgb`;
  const idx = lists.priorities.indexOf(value);
  return categoricalRgbVar(idx < 0 ? 0 : idx);
}

export function riskColorVar(flag) {
  if (flag === 'Red') return '--c-status-critical-rgb';
  if (flag === 'Amber') return '--c-status-warning-rgb';
  return '--c-status-good-rgb';
}

export function solidColor(rgbVar) { return `rgb(var(${rgbVar}))`; }
export function tintColor(rgbVar, alpha) { return `rgba(var(${rgbVar}), ${alpha})`; }

export function progressColorVar(pct) {
  if (pct >= 100) return '--c-status-good-rgb';
  if (pct >= 50) return '--c-status-info-rgb';
  return '--c-status-warning-rgb';
}
