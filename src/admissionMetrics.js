// Patch67: admission statistics and support bands share one missing-value policy.
export function finiteNumber(value) {
  if (value == null || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function validGrade(value) {
  const number = finiteNumber(value);
  return number != null && number >= 1 && number <= 9 ? number : null;
}
export function median(values = []) {
  const sorted = values.map(finiteNumber).filter(value => value != null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function percentile(values = [], ratio) {
  const sorted = values.map(finiteNumber).filter(value => value != null).sort((a, b) => a - b);
  if (!sorted.length || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) return null;
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}
export function supportBandValue(studentGrade, cutoffGrade) {
  const student = validGrade(studentGrade), cutoff = validGrade(cutoffGrade);
  if (student == null || cutoff == null) return null;
  // Compare integer hundredths so 2.20 - 2.00 cannot exceed the 0.20 boundary.
  const units = Math.round((student - cutoff) * 100);
  const label = units > 50 ? "상향" : units > 20 ? "소신" : units < -50 ? "하향" : units < -20 ? "안정" : "적정";
  return { label, diff: units / 100 };
}
export function cutoffRange(items = [], index) {
  const values = items.map(item => validGrade(item?.[index])).filter(value => value != null);
  if (!values.length) return null;
  const low = Math.min(...values), high = Math.max(...values);
  return low === high ? String(low) : `${low}–${high}`;
}
