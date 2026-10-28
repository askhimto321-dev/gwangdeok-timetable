// 보기 설정(시안 4): 글자 크기 · 표 줄 간격 · 대비 높이기. 이 기기에만 저장하고, 화면 맨 바깥(html)에 표시를 달아
// uiMode.js의 CSS가 사이트 전체에 적용합니다. 인쇄물에는 영향을 주지 않습니다.
const KEY = "kd_view_prefs_v1";
export const FONT_SCALES = [["normal", "보통", "본문 14px"], ["large", "크게", "본문 15~16px"], ["xlarge", "아주 크게", "본문 17~18px"]];
export const DENSITIES = [["normal", "보통", "읽기 편하게"], ["compact", "촘촘", "한 화면에 많이"]];
export const DEFAULT_VIEW_PREFS = { font: "normal", density: "normal", contrast: false };

export function normalizeViewPrefs(value = {}) {
  return {
    font: FONT_SCALES.some(([key]) => key === value?.font) ? value.font : "normal",
    density: DENSITIES.some(([key]) => key === value?.density) ? value.density : "normal",
    contrast: !!value?.contrast,
  };
}
export function readViewPrefs() {
  try { return normalizeViewPrefs(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return { ...DEFAULT_VIEW_PREFS }; }
}
export function applyViewPrefs(prefs = readViewPrefs()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.kdFont = prefs.font;
  root.dataset.kdDensity = prefs.density;
  if (prefs.contrast) root.dataset.kdContrast = "high"; else delete root.dataset.kdContrast;
}
export function saveViewPrefs(next) {
  const prefs = normalizeViewPrefs(next);
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* 저장 못 해도 이번 화면에는 적용 */ }
  applyViewPrefs(prefs);
  return prefs;
}
