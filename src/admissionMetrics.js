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

// UI patch: one shared color/label table for the 상향/소신/적정/안정/하향 support bands so every
// screen (전형 비교표, 지원 구성 카드, 결과 목록) renders the same badge instead of each file
// re-declaring its own slightly different colors. `key` is the ASCII-safe CSS class suffix.
export const SUPPORT_BAND_META = {
  상향: { key: "up", color: "#b3413a", background: "#fdeceb", border: "#eeb9b3", detail: "+0.5 초과" },
  소신: { key: "reach", color: "#9c5a1d", background: "#fff1de", border: "#eecb96", detail: "+0.2~+0.5" },
  적정: { key: "fit", color: "#7a6412", background: "#fdf3bd", border: "#e3cd63", detail: "-0.2~+0.2" },
  안정: { key: "safe", color: "#236b45", background: "#e7f7ee", border: "#aedcc0", detail: "-0.5~-0.2" },
  하향: { key: "down", color: "#2b5588", background: "#e7f0fb", border: "#b7cfe9", detail: "-0.5 미만" },
};
// Returns the shared pill className for a support-band label (falls back to a neutral pill
// when the label is missing, e.g. no grade entered yet).
export function supportBandClassName(label) {
  return `kd-band-pill is-${SUPPORT_BAND_META[label]?.key || "none"}`;
}

// UI patch: 전형(교과/종합/논술/실기)마다 다른 색의 배지를 써서 화면이 파란색 한 가지로만
// 보이지 않게 합니다. 표(AdmissionComparison)와 카드(SupportDecisionCard)가 같은 함수를 써서
// 항상 같은 전형은 같은 색으로 보이게 맞춥니다.
export function trackAccentKey(admissionType) {
  const type = String(admissionType || "");
  if (type.includes("교과")) return "academic";
  if (type.includes("종합")) return "general";
  if (type.includes("논술")) return "essay";
  if (type.includes("실기") || type.includes("특기")) return "talent";
  return "other";
}
export function trackChipClassName(admissionType) {
  return `kd-track-chip is-${trackAccentKey(admissionType)}`;
}
// 7번 요청: 내신컷 위치·최저충족과는 별도로 "지원자격"을 세 번째 판정으로 분리합니다.
// 전형 비고(특이사항) 문구를 해석해서 "지원 가능"이라고 단정하지 않고, 지원 자격을 제한하는
// 표현이 있는지 사실대로만 보여줍니다(재학생 한정, 지역인재, 추천 인원 제한 등). 표현을 못
// 찾았다고 해서 "지원 가능"으로 단정하지도 않습니다 — 원문 확인이 필요하다는 점을 항상 남깁니다.
const ELIGIBILITY_RESTRICTION_PATTERN = /재학생만|재학생\s*한정|졸업생\s*(?:지원\s*)?(?:불가|제외)|재수생\s*(?:지원\s*)?(?:불가|제외)|지역인재|정원\s*외|추천\s*인원|학교장\s*추천\s*\d|인원\s*제한|자격\s*제한|남학생만|여학생만|여자만|남자만|특성화고|마이스터고|졸업\s*예정자만|자격\s*요건/;
export function admissionEligibilityInfo(noteText) {
  const note = String(noteText ?? "").trim();
  if (!note || note === "-") return { status: "none", label: "특이사항 없음" };
  if (ELIGIBILITY_RESTRICTION_PATTERN.test(note)) return { status: "restricted", label: "지원자격 제한 표현 있음 · 원문 확인" };
  return { status: "note", label: "특이사항 있음 · 원문 확인" };
}
export function cutoffRange(items = [], index) {
  const values = items.map(item => validGrade(item?.[index])).filter(value => value != null);
  if (!values.length) return null;
  const low = Math.min(...values), high = Math.max(...values);
  return low === high ? String(low) : `${low}–${high}`;
}
