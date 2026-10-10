/* 화면 모드(기존 UI / 새로운 UI 다크 / 새로운 UI 라이트) 선택과 색 변환 엔진.

   이 앱의 색은 대부분 컴포넌트마다 인라인 style 객체에 직접 적힌 hex 값(4천 개 이상)이라
   화면을 하나씩 고치는 대신, 색이 쓰이는 "역할"(배경 · 글자 · 테두리 · 그래픽)을 보고
   한 곳에서 일괄 변환합니다.
   - 인라인 style · <style> 문자열 · SVG fill/stroke: src/kdjsx/의 JSX 런타임이 렌더 직전에 변환
   - .css 파일: 문서에 붙은 스타일시트 규칙을 CSSOM으로 한 번 변환 (나중에 붙는 시트도 감시)
   '기존 UI'(classic)를 고르면 아무것도 바꾸지 않으므로 이전 화면과 완전히 같습니다. */

export const UI_MODES = [
  { key: "classic", label: "기존 UI", short: "기존" },
  { key: "dark", label: "새 UI · 다크", short: "다크" },
  { key: "light", label: "새 UI · 라이트", short: "라이트" },
];
const STORAGE_KEY = "kd_ui_mode";
// 처음 방문한 사람에게 보여줄 모드. "다크모드를 기본값으로" 요청에 따라 dark입니다.
export const DEFAULT_UI_MODE = "dark";

function readStoredMode() {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (UI_MODES.some(mode => mode.key === value)) return value;
  } catch { /* localStorage unavailable */ }
  return DEFAULT_UI_MODE;
}

// 페이지를 여는 순간 한 번 정해지고, 바꿀 때는 저장 후 새로고침합니다. 화면 전체(모듈 상수 스타일,
// 이미 붙은 CSS 규칙 포함)가 같은 모드로 다시 그려져야 섞이지 않기 때문입니다.
const ACTIVE_MODE = typeof window === "undefined" ? "classic" : readStoredMode();

export function getUiMode() { return ACTIVE_MODE; }
export function isNewUi(mode = ACTIVE_MODE) { return mode !== "classic"; }

export function setUiMode(next) {
  if (!UI_MODES.some(mode => mode.key === next) || next === ACTIVE_MODE) return;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* localStorage unavailable */ }
  window.location.reload();
}

/* ---------- 색 계산 (sRGB ↔ OKLab/OKLCH) ---------- */

const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1] };

function parseColor(token) {
  const t = token.trim().toLowerCase();
  if (NAMED[t]) return NAMED[t];
  if (t[0] === "#") {
    let h = t.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split("").map(c => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return n.some(Number.isNaN) ? null : [...n, a];
  }
  const m = t.match(/^rgba?\(([^)]*)\)$/);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const rgb = parts.slice(0, 3).map(p => p.endsWith("%") ? parseFloat(p) * 2.55 : parseFloat(p));
  let a = parts[3] == null ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  if (rgb.some(Number.isNaN) || Number.isNaN(a)) return null;
  return [...rgb, a];
}

const toLinear = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLinear = c => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, v)) * 255); };

function rgbToOklch([r, g, b]) {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function oklchToRgb([L, C, H]) {
  // 색역 밖이면 채도를 줄여 맞춥니다(밝기 유지).
  for (let c = C; ; c *= 0.85) {
    const A = c * Math.cos(H), B = c * Math.sin(H);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const lin = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    if (c < 0.002 || lin.every(v => v >= -0.0005 && v <= 1.0005)) return lin.map(fromLinear);
  }
}

const hex = n => n.toString(16).padStart(2, "0");
function formatColor([r, g, b], a) {
  if (a >= 0.999) return `#${hex(r)}${hex(g)}${hex(b)}`;
  return `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`;
}

/* ---------- 새 UI 팔레트 ---------- */

// 새 UI(다크·라이트 공통)에서 기존 브랜드 색을 새 색으로 바꾸는 표. 값은 '라이트 기준'이고,
// 다크 모드에서는 이 결과에 다시 역할별 다크 변환이 적용됩니다.
const NEW_UI_SWAPS = {
  "#faf8f3": "#f4f5f8", // 페이지 바탕(따뜻한 미색 → 중립)
  "#2b2620": "#1f2430", // 기본 글자색
  "#3d5c3a": "#cf4a12", // 기존 초록 강조색 → 새 주황 강조색
  "#eaf0e8": "#fff0e6",
  "#9a3412": "#cf4a12", // 브랜드 테라코타 → 새 주황
  "#7a290d": "#a83a0c",
  "#fff4e9": "#fff0e6",
  "#c36e3e": "#ef8a55",
};
const DARK_PAGE_BG = "#111215";
const WARM_HUE = (55 * Math.PI) / 180;

function swapKey(rgb, a) { return a >= 0.999 ? formatColor(rgb, 1) : null; }

// 다크 모드: 역할별 밝기 재배치. L/C는 OKLCH 기준(0~1).
function darkMap(role, [L, C, H]) {
  if (role === "bg") {
    if (L >= 0.8) return [0.225 + (1 - L) * 1.0, Math.min(C * 1.6, 0.06), H];
    if (L >= 0.55) return [0.4 + (0.8 - L) * 0.4, C * 0.9, H];
    if (C < 0.03 && L < 0.42) return [0.42, C, H];
    return [L, C, H];
  }
  if (role === "text") {
    // 핵심 글자(진한 잉크)는 거의 흰색으로, 보조 글자(중간 회색)도 어두운 바탕에서 또렷한 밝은 회색으로.
    if (L < 0.45) return [C > 0.04 ? 0.86 : 0.965, C > 0.04 ? Math.min(C, 0.16) : C, H];
    if (L < 0.7) return [0.9 - (L - 0.45) * 0.36, C > 0.04 ? Math.min(C, 0.16) : C, H];
    return [L, C, H];
  }
  if (role === "border") {
    // 옅은 회색 선은 어두운 바탕에서 주황빛이 도는 가는 선으로(따뜻한 경계선)
    if (L >= 0.75) return C < 0.03 ? [0.34 + (1 - L) * 0.3, 0.03, WARM_HUE] : [0.36 + (1 - L) * 0.3, C * 0.8, H];
    if (C < 0.03 && L < 0.45) return [0.5, C, H];
    return [L, C, H];
  }
  // graphic(SVG 채우기·선): 아주 밝은 면만 어둡게, 진한 회색 선은 밝게.
  if (L >= 0.85) return darkMap("bg", [L, C, H]);
  if (C < 0.03 && L < 0.4) return darkMap("text", [L, C, H]);
  return [L, C, H];
}

// 라이트 모드: 따뜻한 미색 계열 바탕을 중립 회색으로만 정리합니다.
function lightMap(role, [L, C, H]) {
  // 미색(따뜻한 회백색)만 중립으로 바꾸고, 파랑·초록 같은 옅은 색 바탕은 그대로 둡니다.
  // 라이트 모드의 아주 옅은 테두리(흰 바탕 위에서 거의 안 보이는 선)는 한 단계 진하게 해서 상자 경계를 드러냅니다.
  if (role === "border" && L >= 0.86 && L <= 0.975 && C < 0.05) return [0.86 + (L - 0.86) * 0.45, C < 0.015 ? Math.min(C, 0.006) : C, C < 0.015 ? 4.4 : H];
  if ((role === "bg" || role === "border") && L >= 0.88 && C < 0.015) return [L, Math.min(C, 0.004), 4.4];
  if (role === "text" && L < 0.5 && C < 0.03) return [L, Math.min(C, 0.012), 4.4];
  // 흰 바탕 위 옅은 회색 보조 글자(학년·학기 칩, 비활성 탭, 안내 문구)는 대비 4.5:1 이상이 되도록 한 단계 진하게.
  if (role === "text" && C < 0.05 && L >= 0.5 && L < 0.78) return [0.47 + (L - 0.5) * 0.12, Math.min(C, 0.02), C < 0.015 ? 4.4 : H];
  return [L, C, H];
}

const colorCache = new Map();
export function mapColor(token, role, mode = ACTIVE_MODE) {
  if (mode === "classic") return token;
  const cacheKey = `${mode}|${role}|${token}`;
  const cached = colorCache.get(cacheKey);
  if (cached !== undefined) return cached;
  let result = token;
  const parsed = parseColor(token);
  if (parsed && parsed[3] > 0.02) {
    let rgb = parsed.slice(0, 3), a = parsed[3];
    const swap = NEW_UI_SWAPS[swapKey(rgb, a)];
    if (swap) rgb = parseColor(swap).slice(0, 3);
    if (mode === "dark" && role === "bg" && swap === "#f4f5f8") {
      result = DARK_PAGE_BG;
    } else {
      const lch = rgbToOklch(rgb);
      result = formatColor(oklchToRgb(mode === "dark" ? darkMap(role, lch) : lightMap(role, lch)), a);
    }
  }
  colorCache.set(cacheKey, result);
  return result;
}

const COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b/g;
export function mapColorsInValue(value, role, mode = ACTIVE_MODE) {
  if (mode === "classic" || typeof value !== "string") return value;
  return value.replace(COLOR_TOKEN, token => mapColor(token, role, mode));
}

/* ---------- 스타일 속성 → 역할 ---------- */

// 새 UI 본문 서체: 둥근 서체는 작은 글씨에서 뭉개져 보여, 획이 또렷한 Pretendard를 맨 앞에 둡니다
// (index.html에서 이미 불러오는 서체입니다).
const NEW_UI_FONT = "'Pretendard'";
function roleForProperty(name) {
  const p = name.toLowerCase().replace(/-/g, "");
  if (p === "color" || p === "caretcolor" || p === "textdecorationcolor" || p === "webkittextfillcolor") return "text";
  if (p.startsWith("background")) return "bg";
  if (p.startsWith("border") || p.startsWith("outline")) return p.includes("radius") || p.includes("width") || p.includes("style") || p.includes("collapse") || p.includes("spacing") || p.includes("image") ? null : "border";
  if (p === "fill" || p === "stroke" || p === "stopcolor" || p === "floodcolor") return "graphic";
  return null;
}

function mapFontFamily(value, mode) {
  if (mode === "classic" || typeof value !== "string" || !/KDRound/.test(value) || /^\s*'?Pretendard/.test(value)) return value;
  return `${NEW_UI_FONT},${value}`;
}

/* 강조 요소 통일: 새 UI에서는 '흰 글자 + 진한 채움' 요소(주요 버튼 · 선택된 탭 · 활성 칩)를
   화면마다 제각각이던 파랑 · 초록 · 갈색 · 보라 대신 하나의 강조색(주황)으로 맞춥니다.
   빨강(경고)과 초록(충족)처럼 의미가 있는 상태색은 그대로 둡니다.
   그라데이션 배너(섹션 머리)는 강조색 대신 차분한 단색 패널로 바꿉니다. */
const isWhiteish = value => {
  const c = typeof value === "string" ? parseColor(value.trim()) : null;
  return !!c && c[3] > 0.9 && rgbToOklch(c).at(0) > 0.92;
};
function emphasisKind(token) {
  const c = parseColor(token);
  if (!c || c[3] < 0.9) return null;
  const [L, C, H] = rgbToOklch(c);
  if (L < 0.18 || L > 0.66) return null;
  const hue = ((H * 180) / Math.PI + 360) % 360;
  const semanticRed = C >= 0.1 && (hue < 45 || hue > 345);
  const semanticGreen = C >= 0.08 && hue >= 120 && hue <= 185;
  if (semanticRed || semanticGreen) return null;
  return (hue >= 200 && hue <= 330) || C < 0.08 ? "accent" : null;
}
function emphasisFill(style) {
  if (!isWhiteish(style.color)) return null;
  const bg = style.background ?? style.backgroundColor ?? style.backgroundImage;
  if (typeof bg !== "string" || bg.includes("var(") || bg.includes("url(")) return null;
  const tokens = bg.match(COLOR_TOKEN) || [];
  if (!tokens.length || !tokens.every(token => emphasisKind(token))) return null;
  return /gradient/.test(bg) ? "panel" : "accent";
}

// 가독성: 새 UI에서는 9~11px처럼 너무 작은 글자를 한 단계 키웁니다(12.5px 이상은 그대로).
export function readableFontSize(value) {
  const px = typeof value === "number" ? value : (typeof value === "string" && /^\d+(\.\d+)?px$/.test(value.trim()) ? parseFloat(value) : null);
  if (px == null || px >= 12.5 || px <= 0) return value;
  const next = Math.max(11.5, Math.round((px + 1) * 2) / 2);
  return typeof value === "number" ? next : `${next}px`;
}

// 해상도 활용: 새 UI에서는 화면 너비용 컨테이너(1000~1300px 고정)를 넓은 모니터에서 최대 1440px까지 넓힙니다.
export function wideMaxWidth(value) {
  if (typeof value !== "number" || value < 1000 || value > 1300) return value;
  return "min(1440px, calc(100vw - 48px))";
}

const styleCache = new WeakMap();
/* 라이트 모드 깊이감: 흰 바탕 + 테두리 + 둥근 모서리(14px 이상)인 '카드'에 아주 옅은 그림자를 더해
   바탕과 카드가 평평하게 붙어 보이지 않게 합니다(이미 그림자가 있으면 그대로). */
const LIGHT_CARD_SHADOW = "0 1px 2px rgba(20,24,33,.04), 0 6px 20px rgba(20,24,33,.05)";
function lightCardShadow(style) {
  if (style.boxShadow || (pxOf(style.borderRadius) ?? 0) < 14) return style;
  const bg = style.background ?? style.backgroundColor;
  if (typeof bg !== "string" || !isWhiteish(bg) || !hasVisibleBorder(style)) return style;
  return { ...style, boxShadow: LIGHT_CARD_SHADOW };
}
/* 글자 위계(대시보드와 같은 규칙): 제목·큰 숫자(18px 이상)는 굵게 두고, 작은 이름표의 지나친 굵기(850~950)는
   한 단계 낮추며, 회색 보조 글자는 보통 굵기(500)로. 화면 전체가 '전부 굵은 글씨'로 딱딱해 보이던 문제를 줄입니다. */
export function softenType(style) {
  const weight = Number(style.fontWeight);
  if (!weight || weight < 650) return style;
  const size = pxOf(style.fontSize);
  if (size != null && size >= 18) return style;
  let next = weight >= 850 ? 750 : weight;
  const color = typeof style.color === "string" ? parseColor(style.color.trim()) : null;
  if (color && color[3] > 0.5) {
    const [L, C] = rgbToOklch(color);
    if (L >= 0.42 && L <= 0.78 && C < 0.06) next = 500;
  }
  return next === weight ? style : { ...style, fontWeight: next };
}
export function mapStyleObject(style, mode = ACTIVE_MODE) {
  if (mode === "classic" || !style || typeof style !== "object") return style;
  const cached = styleCache.get(style);
  if (cached) return cached;
  const shaped = softenType(mode === "light" ? lightCardShadow(style) : style);
  const result = mapStyleColors(shaped, mode);
  const size = readableFontSize(result.fontSize);
  const width = wideMaxWidth(result.maxWidth);
  const finalStyle = size !== result.fontSize || width !== result.maxWidth ? { ...result, fontSize: size, maxWidth: width } : result;
  styleCache.set(style, finalStyle);
  return finalStyle;
}

function mapStyleColors(style, mode) {
  const fill = emphasisFill(style);
  if (fill) {
    const out = { ...style };
    for (const key of ["background", "backgroundColor", "backgroundImage"]) if (key in out) out[key] = undefined;
    out.background = fill === "accent" ? "var(--kdn-accent)" : "var(--kdn-panel)";
    out.color = fill === "accent" ? "var(--kdn-accent-ink)" : "#ffffff";
    for (const key of Object.keys(out)) {
      if (typeof out[key] !== "string") continue;
      if (/^(border|outline)/.test(key) && roleForProperty(key)) {
        out[key] = out[key].replace(COLOR_TOKEN, token => emphasisKind(token) ? (fill === "accent" ? "var(--kdn-accent)" : "var(--kdn-panel)") : mapColor(token, "border", mode));
      } else if (key === "fontFamily") out[key] = mapFontFamily(out[key], mode);
      else if (key !== "background" && key !== "color" && roleForProperty(key)) out[key] = mapColorsInValue(out[key], roleForProperty(key), mode);
    }
    return out;
  }
  let out = null;
  for (const key of Object.keys(style)) {
    const value = style[key];
    if (typeof value !== "string") continue;
    let next = value;
    if (key === "fontFamily") next = mapFontFamily(value, mode);
    else {
      const role = roleForProperty(key);
      if (role) next = mapColorsInValue(value, role, mode);
    }
    if (next !== value) { out ??= { ...style }; out[key] = next; }
  }
  return out || style;
}

const cssTextCache = new Map();
export function mapCssText(css, mode = ACTIVE_MODE) {
  if (mode === "classic" || typeof css !== "string") return css;
  const cacheKey = `${mode}|${css}`;
  if (cssTextCache.has(cacheKey)) return cssTextCache.get(cacheKey);
  const result = css.replace(/([a-zA-Z-]+)(\s*:\s*)([^;{}]+)/g, (whole, prop, sep, value) => {
    if (prop.toLowerCase() === "font-family") return prop + sep + mapFontFamily(value, mode);
    if (prop.toLowerCase() === "font-size") return prop + sep + readableFontSize(value.trim());
    const role = roleForProperty(prop);
    return role ? prop + sep + mapColorsInValue(value, role, mode) : whole;
  });
  if (cssTextCache.size > 200) cssTextCache.clear();
  cssTextCache.set(cacheKey, result);
  return result;
}

/* ---------- JSX props 변환 (src/kdjsx 런타임이 호출) ---------- */

const GRAPHIC_ATTRS = ["fill", "stroke", "stopColor", "floodColor"];
/* 표 가독성: 넓은 화면에서 표가 9~11px 글자로 남아 잘 안 보이던 문제. 표 전체 글자는 14px(열이 아주 많은
   '전체 열' 표는 12.5px)로, 칸마다 따로 작게 지정한 글자는 12.5px 이상으로 올립니다. 시간표 표는 칸이 좁아 제외합니다. */
const tableCache = new WeakMap();
function tableReadable(type, style, className = "") {
  if (/timetable/.test(className || "")) return style;
  const cached = tableCache.get(style);
  if (cached) return cached;
  const px = typeof style.fontSize === "number" ? style.fontSize : (typeof style.fontSize === "string" && /^\d+(\.\d+)?px$/.test(style.fontSize) ? parseFloat(style.fontSize) : null);
  let next = style;
  if (type === "table" && px != null && px < 13.5) next = { ...style, fontSize: px < 9.5 ? 12.5 : 14 };
  else if (type !== "table" && px != null && px < 12.5) next = { ...style, fontSize: 12.5 };
  tableCache.set(style, next);
  return next;
}
/* 버튼 경계: 새 UI에서 테두리도 채움도 없는(또는 흰색·옅은 회색 채움) 버튼은 바탕과 구분되지 않아
   눌러지는 요소인지 알기 어렵습니다. 크기(높이·좌우 여백)로 보아 '버튼 모양'인 것에만 1px 테두리를
   붙입니다. 글자 링크처럼 여백이 없는 버튼과 data-kdn-bare 표시가 있는 버튼은 그대로 둡니다. */
const pxOf = value => (typeof value === "number" ? value : typeof value === "string" && /^-?\d+(\.\d+)?px$/.test(value.trim()) ? parseFloat(value) : null);
function looksLikeControl(style) {
  if ((pxOf(style.minHeight) ?? 0) >= 26 || (pxOf(style.height) ?? 0) >= 26) return true;
  const pad = style.padding;
  if (typeof pad === "number") return pad >= 8;
  if (typeof pad === "string") { const parts = pad.trim().split(/\s+/); return (pxOf(parts[1] ?? parts[0]) ?? 0) >= 8; }
  return (pxOf(style.paddingLeft) ?? pxOf(style.paddingInline) ?? 0) >= 8;
}
function hasVisibleBorder(style) {
  for (const key of Object.keys(style)) {
    if (!/^border/.test(key) || /Radius$/.test(key) || key === "borderCollapse" || key === "borderSpacing") continue;
    const value = style[key];
    if (key === "border" && (value === 0 || /^(0(px)?|none)$/.test(String(value).trim()) || /transparent/.test(String(value)))) continue;
    if (style.borderColor === "transparent" && (key === "borderColor" || key === "borderWidth" || key === "borderStyle")) continue;
    if (value == null || value === "") continue;
    return true;
  }
  return false;
}
function plainBackground(style) {
  const bg = style.background ?? style.backgroundColor;
  if (bg == null || bg === "") return true;
  if (typeof bg !== "string") return false;
  const v = bg.trim();
  if (/^(transparent|none|inherit)$/.test(v) || /^var\(--kdn-(surface|surface-2|bg)/.test(v)) return true;
  if (/gradient|url\(/.test(v)) return false;
  const c = parseColor(v);
  if (!c) return false;
  if (c[3] < 0.1) return true;
  const [L, C] = rgbToOklch(c);
  return L >= 0.9 && C < 0.03;
}
const controlCache = new WeakMap();
export function withControlBorder(style) {
  if (!style || typeof style !== "object") return style;
  const cached = controlCache.get(style);
  if (cached) return cached;
  let out = style;
  if (!hasVisibleBorder(style) && plainBackground(style) && looksLikeControl(style)) {
    out = { ...style };
    if (out.borderColor === "transparent") out.borderColor = "var(--kdn-control-line)";
    else if (typeof out.border === "string" && /transparent/.test(out.border)) out.border = out.border.replace("transparent", "var(--kdn-control-line)");
    else out.border = "1px solid var(--kdn-control-line)";
  }
  controlCache.set(style, out);
  return out;
}
/* 인쇄용 종이 양식처럼 화면 모드와 상관없이 원래 색(흰 종이)으로 그려야 하는 부분은
   rawColors(() => <...>)로 감싸면 그 안에서 만들어지는 요소의 색을 변환하지 않습니다.
   (개발 서버는 JSX 런타임을 따로 묶어 이 모듈이 두 벌 생기므로 카운터는 globalThis에 둡니다.) */
const RAW_KEY = "__kdRawColorDepth";
export function rawColors(render) {
  globalThis[RAW_KEY] = (globalThis[RAW_KEY] || 0) + 1;
  try { return render(); } finally { globalThis[RAW_KEY] -= 1; }
}
export function mapElementProps(type, props, mode = ACTIVE_MODE) {
  if (mode === "classic" || globalThis[RAW_KEY] > 0 || !props) return props;
  let out = null;
  const set = (key, value) => { if (value !== props[key]) { out ??= { ...props }; out[key] = value; } };
  if (props.style && typeof props.style === "object" && (type === "table" || type === "td" || type === "th")) {
    const tuned = tableReadable(type, props.style, props.className);
    if (tuned !== props.style) props = { ...props, style: tuned };
  }
  if (props.style && typeof props.style === "object") {
    const base = type === "button" && !props["data-kdn-bare"] && !/^(menuitem|option)/.test(props.role || "") ? withControlBorder(props.style) : props.style;
    set("style", base === props.style ? mapStyleObject(props.style, mode) : mapStyleObject(base, mode));
  }
  if (typeof type === "string") {
    if (type === "style" && typeof props.children === "string") set("children", mapCssText(props.children, mode));
    for (const attr of GRAPHIC_ATTRS) if (typeof props[attr] === "string") set(attr, mapColorsInValue(props[attr], "graphic", mode));
  } else if (typeof props.color === "string" && props.color !== "currentColor") {
    // lucide 아이콘 등 color prop으로 색을 받는 컴포넌트
    set("color", mapColorsInValue(props.color, "text", mode));
  }
  return out || props;
}

/* ---------- 문서 전체 적용 (main.jsx에서 1회 호출) ---------- */

const processedSheets = new WeakSet();
function mapRules(rules, mode) {
  for (const rule of Array.from(rules || [])) {
    if (rule.cssRules && !rule.style) { mapRules(rule.cssRules, mode); continue; }
    const style = rule.style;
    if (!style) continue;
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      const value = style.getPropertyValue(name);
      const next = name === "font-family" ? mapFontFamily(value, mode) : name === "font-size" ? readableFontSize(value) : (roleForProperty(name) ? mapColorsInValue(value, roleForProperty(name), mode) : value);
      if (next !== value) style.setProperty(name, next, style.getPropertyPriority(name));
    }
  }
}
function mapSheet(sheet, mode) {
  if (!sheet || processedSheets.has(sheet)) return;
  if (sheet.ownerNode?.id === "kd-ui-mode-base") { processedSheets.add(sheet); return; }
  try { mapRules(sheet.cssRules, mode); processedSheets.add(sheet); } catch { /* 다른 출처(CDN 폰트) 시트는 읽을 수 없음 */ }
}

const BASE_CSS = {
  dark: `
    :root{color-scheme:dark;--kdn-bg:#111215;--kdn-surface:#18191d;--kdn-surface-2:#212227;--kdn-line:#3a2d24;--kdn-ink:#f4f1ea;--kdn-ink-soft:#e8e5df;--kdn-muted:#cfccc5;--kdn-accent:#ff7a3d;--kdn-accent-ink:#1b1006;--kdn-accent-soft:#3a2a20;--kdn-accent-text:#ffb089;--kdn-hero-art:#1f2238;--kdn-panel:#2e3040;--kdn-control-line:#50525f}
    html,body{background:#111215;color:#f4f1ea;word-break:keep-all;overflow-wrap:break-word}
    /* 위쪽에 은은한 주황 빛 번짐(어두운 바탕 + 강조색 글로우) */
    body,.kdn-app{background:radial-gradient(1100px 520px at 18% -40px,rgba(255,122,61,.13) 0,rgba(255,122,61,0) 70%),#111215!important;background-repeat:no-repeat!important}
    .kdn-top-nav{background:rgba(10,10,12,.88)!important;border-bottom-color:#3a2a1e!important;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
    .kdn-work-bar{background:rgba(17,18,21,.82)!important;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
    ::selection{background:#ff7a3d55}`,
  light: `
    :root{color-scheme:light;--kdn-bg:#f4f5f8;--kdn-surface:#ffffff;--kdn-surface-2:#f0f1f5;--kdn-line:#dfe2e8;--kdn-ink:#1f2430;--kdn-ink-soft:#3a4150;--kdn-muted:#5d6574;--kdn-accent:#cf4a12;--kdn-accent-ink:#ffffff;--kdn-accent-soft:#fff0e6;--kdn-accent-text:#b23e0c;--kdn-hero-art:#1f2238;--kdn-panel:#2a3040;--kdn-control-line:#c3c9d3}
    html,body{background:#f4f5f8;color:#1f2430;word-break:keep-all;overflow-wrap:break-word}
    body,.kdn-app{background:radial-gradient(1100px 520px at 6% 0,#ffe3d1 0,rgba(255,227,209,0) 72%),radial-gradient(1000px 520px at 98% 0,#dbe6ff 0,rgba(219,230,255,0) 72%),#f4f5f8!important;background-repeat:no-repeat!important}
    /* 위쪽 메뉴·작업 줄은 반투명 + 흐림으로, 뒤의 옅은 색 번짐이 비쳐 화면이 덜 밋밋하게 */
    .kdn-work-bar{background:rgba(255,255,255,.62)!important;-webkit-backdrop-filter:saturate(1.4) blur(14px);backdrop-filter:saturate(1.4) blur(14px)}
    /* 라이트 모드에도 다크 모드의 상단 메뉴를 그대로 씁니다(밝은 본문 + 진한 머리 줄로 화면에 무게 중심). */
    .kdn-top-nav{color-scheme:dark;--kdn-bg:#1d1e24;--kdn-surface:#272830;--kdn-surface-2:#31323c;--kdn-line:#3b3c47;--kdn-ink:#f4f1ea;--kdn-ink-soft:#e8e5df;--kdn-muted:#cfccc5;--kdn-accent:#ff7a3d;--kdn-accent-ink:#1b1006;--kdn-accent-soft:#3a2a20;--kdn-accent-text:#ffb089;--kdn-control-line:#50525f;background:rgba(26,27,33,.94)!important;border-bottom-color:#2c2d36!important;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}`,
};

// 다크 · 라이트 공통: 새 상단 메뉴의 모바일 배치, 겹치는 옛 머리 줄 숨김, 떠 있는 버튼 색 정리.
const SHARED_NEW_CSS = `
  :root:root{--kd-brand:#c8470f;--kd-brand-dark:#a0390b;--kd-brand-border:#e07a45}
  .kdn-mode-short{display:none}
  /* 포커스: 마우스 클릭 뒤 남는 검은 기본 테두리 대신, 키보드로 이동할 때만 강조색 링 */
  button:focus:not(:focus-visible),summary:focus:not(:focus-visible){outline:none}
  button:focus-visible,summary:focus-visible,a:focus-visible{outline:2px solid var(--kdn-accent);outline-offset:2px}
  /* 숫자는 고정폭(표·카드에서 자릿수가 흔들리지 않게) */
  b,strong{font-variant-numeric:tabular-nums}
  @media screen{.kdn-print-only{display:none!important}}
  /* 학생 작업 줄: 안내 문구를 줄이고 버튼을 크게 */
  .kdn-hide-new{display:none!important}
  .kd-workspace-top-row{grid-template-columns:minmax(260px,.8fr) minmax(0,1.6fr)!important;align-items:center!important}
  .kdn-openers{border:0!important;background:transparent!important;padding:0!important}
  .kdn-openers button{min-height:40px!important;font-size:13.5px!important;border-radius:11px!important}
  .kdn-openers .kd-workspace-opener-row>span{font-size:13px!important;min-height:40px;display:inline-flex!important;align-items:center;justify-content:center}
  .kdn-search-wrap input{min-height:48px!important;font-size:16px!important}
  @media (max-width:760px){
    .kdn-work-bar{position:static!important}
    .kdn-current-student{flex:1 1 100%}
    .kdn-current-student>span:nth-child(2){flex:1}
    .kdn-recent-students>span{white-space:nowrap}
    .kdn-current-student{min-width:0;box-sizing:border-box}
    .kdn-recent-students{flex:1 1 100%;min-width:0;max-width:100%;flex-wrap:nowrap!important;overflow-x:auto;scrollbar-width:none;border-left:0!important;padding-left:0!important}
    .kdn-recent-students::-webkit-scrollbar{display:none}
    .kdn-recent-students>button{flex:none}
  }
  /* 시간표: 넓은 화면에서는 표 옆에 공지(학급·수업 공지)를 나란히 */
  @media screen and (min-width:1100px){
    .kdn-tt-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
    .kdn-tt-layout>.kdn-tt-side{position:sticky;top:150px;max-height:calc(100vh - 170px);overflow:auto}
    .kdn-tt-layout>.kdn-tt-side>*{margin-top:0!important}
  }
  /* 선생님 ZONE 공지: 대상 선택·단계는 왼쪽 고정 패널, 작성 화면은 오른쪽 */
  @media screen and (min-width:1000px){
    .kdn-notice-layout{display:grid;grid-template-columns:300px minmax(0,1fr);column-gap:20px;align-items:start}
    .kdn-notice-layout>*{grid-column:2;min-width:0}
    .kdn-notice-layout>.kdn-notice-hero{grid-column:1/-1}
    .kdn-notice-layout>.kdn-notice-side{grid-column:1;grid-row:2/span 40;position:sticky;top:90px}
    .kdn-notice-side .teacher-workflow-steps{display:grid!important;grid-template-columns:1fr!important;gap:6px!important}
    .kdn-notice-side .teacher-workflow-steps+div{margin-top:12px}
    .kdn-notice-side button{width:100%;justify-content:flex-start}
    .kdn-notice-side .teacher-zone-target-row,.kdn-notice-side .teacher-zone-target-row>div{display:grid!important;grid-template-columns:1fr!important;gap:6px!important}
  }
  /* 성적·진학: 교사용 분석 도구는 눈에 덜 띄는 보조 도구 줄로 */
  .kdn-staff-tools{background:transparent!important;border:0!important;box-shadow:none!important;padding:4px 0!important}
  .kdn-staff-tools-head span{display:none!important}
  /* 상담 4단계: 바깥 상자 없이 단계 버튼만 한 줄로 */
  .kd-counsel-flow{border:0!important;background:transparent!important;box-shadow:none!important;padding:0!important;margin-bottom:10px!important}
  .kd-counsel-flow>div:last-child{gap:12px!important}
  .kd-counsel-flow button{min-height:58px!important;padding:10px 14px!important}
  .kdn-staff-tools{margin:6px 0 16px!important}
  .kdn-staff-tools button{min-height:38px!important;padding:0 12px!important}
  /* NAVI: 시험 운영 안내는 한 줄로, 자동 반영 설명 문단은 숨김, 필터 글자 크게 */
  .susi-beta-beta-notice{padding-top:10px!important;padding-bottom:10px!important}
  .susi-beta-beta-notice>div{display:flex!important;flex-wrap:wrap;gap:4px 10px;align-items:baseline;min-width:0}
  .susi-beta-beta-notice br{display:none}
  .susi-beta-beta-notice span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;min-width:0;flex:1 1 300px}
  .susi-beta-student-auto p{display:none!important}
  .susi-beta-filter-grid label,.susi-beta-filter-grid button{font-size:14px!important}
  .susi-beta-query input{font-size:16px!important}
  /* NAVI 기준 설정: 작은 이름표 글자를 읽을 수 있는 크기로, 회차 버튼 상자는 바탕 없이 */
  .susi-beta-student-auto span,.susi-beta-student-auto small{font-size:13px!important;font-weight:750;color:var(--kdn-muted)}
  .susi-beta-student-auto b{font-size:16px!important}
  .kdn-mock-rounds{background:transparent!important;border-color:var(--kdn-line)!important}
  .kdn-mock-rounds span{font-size:13px!important}
  .kdn-mock-rounds b{font-size:15px!important}
  .kdn-mock-rounds p{font-size:12.5px!important;color:var(--kdn-muted)!important}
  :root .susi-beta-support-filter [aria-label="지원 구간 비교 기준"] button small{color:var(--kdn-muted)!important;font-size:12px}
  :root .susi-beta-support-filter [aria-label="지원 구간 비교 기준"] button[aria-pressed="true"] small{color:var(--kdn-accent-text)!important}
  .susi-beta-view-tabs button small{font-size:12.5px}
  /* 선택된 탭·버튼 안의 보조 글자: 예전 '진한 채움' 기준의 흰 글자 규칙이 남아 옅은 강조 바탕에서 안 보이던 문제 */
  :root .susi-beta-view-tabs button[role="tab"] small{color:var(--kdn-muted)!important}
  :root .susi-beta-view-tabs button[role="tab"][aria-selected="true"] small{color:var(--kdn-accent-text)!important;opacity:.9}
  :root .susi-beta-view-toolbar [role="tab"][aria-selected="true"]>span{background:var(--kdn-accent)!important;color:var(--kdn-accent-ink)!important}
  :root .susi-beta-view-toolbar [role="tab"]>span{background:var(--kdn-surface-2);color:var(--kdn-ink-soft)}
  :root .susi-beta-connection-panel [role="tab"][aria-selected="true"]>span{background:var(--kdn-accent)!important;color:var(--kdn-accent-ink)!important}
  .susi-beta-tab-panel details>summary>span:first-child{font-size:13px!important;font-weight:800;color:var(--kdn-ink-soft)}
  /* 화면 정리: 학생 작업 줄(상단 탭)이 있으면 같은 이동을 하는 상담 4단계 카드와 중복 버튼은 숨깁니다. */
  body:has(.kdn-work-bar) .kd-counsel-flow{display:none!important}
  body:has(.kdn-work-bar) .kdn-staff-tools .kdn-dup-nav{display:none!important}
  .kdn-staff-tools{display:flex!important;justify-content:flex-end!important;align-items:center!important;gap:10px!important}
  .kdn-staff-tools-head{opacity:.85}
  /* NAVI 머리: 한 줄 제목 + 자료 수치. 설명 문장·지원 구성 버튼(요약 카드·4번 탭과 중복)은 숨김 */
  /* NAVI 머리: 대시보드 섹션 제목처럼 상자 없이 큰 제목 + 오른쪽 자료 수치 알약 */
  .susi-beta-hero p,.susi-beta-hero .kd-support-plan-button{display:none!important}
  .susi-beta-hero h2{margin:4px 0 0!important;font-size:28px!important;font-weight:900!important;letter-spacing:-.025em!important}
  .susi-beta-hero h2 span{font-size:14px;font-weight:700;vertical-align:middle;padding:3px 9px;border-radius:999px;background:var(--kdn-accent-soft);color:var(--kdn-accent-text)}
  .susi-beta-hero>div:first-child>div:first-child{font-size:13px!important;font-weight:500!important;color:var(--kdn-accent-text)!important}
  .susi-beta-hero>div:last-child>div{display:flex!important;gap:8px;align-items:center;min-width:0!important}
  .susi-beta-hero>div:last-child>div>*{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border-radius:999px;background:var(--kdn-surface);border:1px solid var(--kdn-line);font-size:13px!important;font-weight:600!important;color:var(--kdn-ink-soft)!important;white-space:nowrap}
  .susi-beta-hero>div:last-child>div>b{color:var(--kdn-ink)!important;font-weight:800!important}
  /* 상담 작업 바로가기(1~4)와 성적 기준 안내: 알약 버튼 + 상자 없는 보조 문장 */
  .kd-workspace-jumps{display:flex!important;flex-wrap:wrap;gap:8px!important;border:0!important;background:none!important;padding:0!important}
  .kd-workspace-jumps button{min-height:38px!important;padding:0 16px!important;border-radius:999px!important;border:1px solid var(--kdn-line)!important;background:var(--kdn-surface)!important;color:var(--kdn-ink-soft)!important;font-size:14px!important;font-weight:600!important;box-shadow:none!important}
  .kd-workspace-jumps button:hover{border-color:var(--kdn-accent)!important;color:var(--kdn-accent-text)!important}
  .kd-comparison-note{border:0!important;background:none!important;padding:0 4px!important;margin:0!important;font-size:13px!important;font-weight:500!important;color:var(--kdn-muted)!important}
  .susi-beta-beta-notice{border:0!important;background:transparent!important;padding:0 4px!important;font-size:12.5px!important;color:var(--kdn-muted)!important}
  .susi-beta-beta-notice svg{color:#c08a1e}
  /* 수시 지원 구성: 섹션 제목과 설명을 두 줄로, 빈 자리는 번호만 작게(같은 안내 문장 6번 반복 금지) */
  .kd-plan-section>div:first-child>div:first-child{display:grid!important;gap:4px}
  .kd-plan-section>div:first-child>div:first-child>b{font-size:20px;font-weight:850!important;letter-spacing:-.02em;color:var(--kdn-ink)}
  .kd-plan-section>div:first-child>div:first-child>span{font-size:14px;font-weight:500;color:var(--kdn-muted)}
  .susi-beta-plan-empty{min-height:0!important;padding:14px!important;display:flex!important;align-items:center;justify-content:center;gap:8px!important}
  .susi-beta-plan-empty small{display:none}
  .susi-beta-plan-empty:first-of-type small{display:block;flex-basis:100%;text-align:center}
  .susi-beta-plan-empty:first-of-type{flex-wrap:wrap}
  /* 관심대학 카드: 학생↔컷 막대가 좁은 칸에 눌려 겹치던 문제 — 줄바꿈을 허용하고 막대 줄은 카드 폭을 씁니다 */
  .kd-consultation-ui .favorite-print-item-detail>summary{flex-wrap:wrap!important;align-items:flex-start!important;row-gap:8px!important}
  .kd-consultation-ui .favorite-print-item-text{flex:1 1 560px!important;min-width:0!important}
  .kd-consultation-ui .favorite-print-item-text>span.no-print{width:100%;max-width:880px}
  .kd-consultation-ui .favorite-print-course-preview{flex:1 1 100%!important;margin:2px 0 0 39px!important}
  .kd-consultation-ui .favorite-print-course-preview em{font-size:12.5px!important}
  .kd-consultation-ui .favorite-print-course-preview small{font-size:12px!important;padding:3px 8px!important}
  /* 표: 머리 줄은 진하게, 줄마다 마우스를 올리면 옅은 강조(시간표 제외) */
  table:not(.student-timetable-table) thead th{color:var(--kdn-ink)!important;font-weight:800}
  table:not(.student-timetable-table) tbody tr:hover>td{box-shadow:inset 0 0 0 999px rgba(207,74,18,.045)}
  table:not(.student-timetable-table) td{color:var(--kdn-ink)}
  /* NAVI 기준 설정 2단계: 위쪽 단계 표시 + 단계별 다음/이전 버튼 */
  .kdn-search-steps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .kdn-search-steps button{display:grid;grid-template-columns:32px minmax(0,1fr);grid-template-rows:auto auto;column-gap:10px;align-items:center;text-align:left;padding:12px 16px;border-radius:14px;border:1px solid var(--kdn-control-line);background:var(--kdn-surface);color:var(--kdn-ink-soft);cursor:pointer;font:inherit}
  .kdn-search-steps button>span{grid-row:1/3;width:32px;height:32px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:var(--kdn-surface-2);font-weight:800;font-size:15px}
  .kdn-search-steps button>b{font-size:16px;font-weight:800;color:var(--kdn-ink)}
  .kdn-search-steps button>small{font-size:13px;font-weight:500;color:var(--kdn-muted)}
  .kdn-search-steps button.is-active{border-color:var(--kdn-accent);background:var(--kdn-accent-soft);box-shadow:inset 0 0 0 1px var(--kdn-accent)}
  .kdn-search-steps button.is-active>span{background:var(--kdn-accent);color:var(--kdn-accent-ink)}
  .kdn-search-steps button.is-active>b{color:var(--kdn-accent-text)}
  .kdn-step-next{display:flex;align-items:center;justify-content:flex-end;gap:14px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--kdn-line)}
  .kdn-step-next span{font-size:14px;color:var(--kdn-muted)}
  .kdn-step-next button{min-height:46px;padding:0 20px;border-radius:12px;border:0;background:var(--kdn-accent);color:var(--kdn-accent-ink);font-size:15px;font-weight:800;cursor:pointer}
  .kdn-step-next .kdn-step-prev{background:var(--kdn-surface);color:var(--kdn-ink-soft);border:1px solid var(--kdn-control-line);font-weight:700}
  .kdn-calc-steps{grid-template-columns:repeat(3,minmax(0,1fr));margin:2px 0 4px}
  @media (max-width:760px){.kdn-search-steps{grid-template-columns:1fr}}
  .kdn-step-back{margin-bottom:12px;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--kdn-control-line);background:var(--kdn-surface);color:var(--kdn-ink-soft);font-size:13.5px;font-weight:600;cursor:pointer}
  /* 공지 작성 페이지 나누기: ① 대상 선택(전체 폭) → ② 작성(대상 선택 패널 숨김) → ③ 내 공지 관리 */
  .kdn-notice-layout.kdn-notice-staged{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:14px}
  .kdn-notice-staged>*{grid-column:1!important;grid-row:auto!important}
  .kdn-notice-staged .kdn-notice-side{position:static!important;max-width:none}
  .kdn-notice-staged .teacher-workflow-steps{display:none!important}
  .kdn-notice-staged.is-compose .kdn-notice-side,.kdn-notice-staged.is-manage .kdn-notice-side{display:none!important}
  .kdn-notice-staged.is-select .kdn-notice-side button{width:auto!important}
  .kdn-notice-staged.is-select .teacher-zone-target-row>div:last-child{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))!important;gap:10px!important}
  .kdn-notice-staged.is-select .teacher-zone-target-row>div:last-child>button{min-height:72px!important;width:100%!important;justify-content:flex-start;text-align:left;font-size:16px!important}
  .kdn-notice-steps{grid-template-columns:repeat(3,minmax(0,1fr))}
  .kdn-notice-steps button:disabled{opacity:.5;cursor:not-allowed}
  .kdn-notice-compose-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-radius:12px;border:1px solid var(--kdn-line);background:var(--kdn-surface);font-size:14px;color:var(--kdn-ink-soft)}
  .kdn-notice-compose-bar b{color:var(--kdn-ink)}
  .kdn-notice-compose-bar button{min-height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--kdn-control-line);background:var(--kdn-surface);color:var(--kdn-ink-soft);font-weight:600;cursor:pointer}
  /* KDTIME 이름 아래 날짜·시간 줄(머리 줄 디자인에 맞춘 작은 줄) */
  .kdn-nav-clock{display:inline-flex;align-items:center;gap:6px;margin-top:3px;font-size:12px;color:var(--kdn-muted);white-space:nowrap;line-height:1}
  .kdn-nav-clock-sem{display:inline-flex;align-items:center;height:17px;padding:0 6px;border-radius:5px;background:var(--kdn-accent);color:var(--kdn-accent-ink);font-size:11px;font-weight:800}
  .kdn-nav-clock-date{font-weight:600;color:var(--kdn-ink-soft);font-variant-numeric:tabular-nums}
  .kdn-nav-clock-date small{font-weight:500;color:var(--kdn-muted);font-size:11px}
  .kdn-nav-clock-time{font-family:var(--kdn-num-font);font-weight:700;font-size:12.5px;color:var(--kdn-ink);font-variant-numeric:tabular-nums}
  .kdn-nav-clock-time i{font-style:normal;color:var(--kdn-accent);animation:kdn-blink 1s steps(1) infinite}
  .kdn-nav-clock-period{font-size:11px;font-weight:800;color:var(--kdn-accent-text)}
  @keyframes kdn-blink{50%{opacity:.25}}
  /* 대시보드 그림 위 시계 배지 */
  .kdn-hero-clock{position:absolute;left:22px;top:20px;display:grid;gap:4px;padding:12px 16px 12px;border-radius:18px;background:rgba(12,13,18,.42);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#fff;border:1px solid rgba(255,255,255,.18)}
  .kdn-hero-clock-date{font-size:12.5px;font-weight:600;opacity:.9;letter-spacing:.02em}
  .kdn-hero-clock-time{font-family:var(--kdn-num-font);font-size:40px;line-height:1;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
  .kdn-hero-clock-time i{font-style:normal;color:#ffb089;animation:kdn-blink 1s steps(1) infinite}
  .kdn-hero-clock-time small{font-size:16px;margin-left:6px;opacity:.75}
  .kdn-hero-clock-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
  .kdn-hero-clock-chips em{font-style:normal;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.18)}
  .kdn-hero-clock-chips em:first-child{background:#ff7a3d;color:#1b1006}
  .kdn-hero-clock-chips em.is-dday{background:#ffffff;color:#1b1006}
  @media (prefers-reduced-motion:reduce){.kdn-nav-clock-time i,.kdn-hero-clock-time i{animation:none}}
  /* 현재 학생 · 상담 요약 이름 칸: KDTIME 머리 줄과 같은 진한 그라데이션 패널 */
  .kdn-current-student{background:linear-gradient(135deg,#1c1d24 0%,#2b2621 100%)!important;border:1px solid #3a2d24!important;box-shadow:0 10px 26px rgba(20,12,6,.22)!important}
  .kdn-current-student b{color:#ffffff!important}
  .kdn-current-student>span:first-child{box-shadow:0 0 0 3px rgba(255,122,61,.35)}
  .kdn-current-student>span:nth-child(2) small:first-child{color:#ffb089!important}
  .kdn-current-student>span:nth-child(2) small,.kdn-current-student b span{color:#cfccc5!important}
  .kdn-current-student>button{background:rgba(255,255,255,.12)!important;color:#ffffff!important}
  @media (max-width:900px){.kdn-sum{grid-template-columns:minmax(0,1fr)!important}.kdn-sum>div:first-child{border-right:0!important;padding-right:0!important}}
  @media (max-width:560px){.kdn-sum>div:last-child{grid-template-columns:minmax(0,1fr)!important}}
  /* NAVI 기준 설정 ① 계산기형(시안 A) */
  :root{--kdn-num-font:Pretendard,KDRound,'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif}
  /* 상담 요약 카드 모양 전환 + 시안 B(리포트형) */
  .kdn-sum-switch{display:inline-flex;padding:3px;border-radius:10px;background:var(--kdn-surface-2);border:1px solid var(--kdn-line);gap:2px}
  .kdn-sum-switch button{min-height:30px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:var(--kdn-muted);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
  .kdn-sum-switch button.is-on{background:var(--kdn-surface);color:var(--kdn-ink);box-shadow:0 1px 3px rgba(20,24,33,.18)}
  .kdn-sumb{display:flex;flex-direction:column;gap:24px;padding:28px 32px;border-radius:24px;background:radial-gradient(700px 260px at 0% 0%,rgba(255,122,61,.26),rgba(255,122,61,0) 70%),linear-gradient(135deg,#17181d 0%,#23201d 100%)!important;color:#f4f1ea;border:1px solid #3a2d24;box-shadow:0 14px 34px rgba(20,12,6,.22)}
  .kdn-sumb-top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap}
  .kdn-sumb-id{display:flex;flex-direction:column;gap:10px;min-width:0}
  .kdn-sumb-eyebrow{font-size:13px;font-weight:600;color:#ffb089;letter-spacing:.08em}
  .kdn-sumb-name{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
  .kdn-sumb-name b{font-size:40px;font-weight:800;letter-spacing:-.02em;line-height:1;color:#ffffff}
  .kdn-sumb-name span{font-family:var(--kdn-num-font);font-size:18px;font-weight:600;color:#cfccc5;font-variant-numeric:tabular-nums;letter-spacing:.04em}
  .kdn-sumb-chips{display:flex;gap:6px;flex-wrap:wrap}
  .kdn-sumb-chips span{padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.1);color:#f4f1ea;font-size:13px;font-weight:600}
  .kdn-sumb-chips span.is-accent{background:#ff7a3d;color:#1b1006;font-weight:700}
  .kdn-sumb-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .kdn-sumb .kdn-sum-switch{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.14)}
  .kdn-sumb .kdn-sum-switch button{color:#cfccc5}
  .kdn-sumb .kdn-sum-switch button.is-on{background:#ffffff;color:#1f2430}
  .kdn-sumb-cta{min-height:42px;padding:0 18px;border-radius:12px;border:0!important;background:#ff7a3d!important;color:#1b1006!important;font:inherit;font-size:14px;font-weight:800;cursor:pointer}
  .kdn-sumb-scale{display:flex;flex-direction:column;gap:10px}
  .kdn-sumb-scale-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:13.5px;color:#cfccc5}
  .kdn-sumb-track{position:relative;height:56px}
  .kdn-sumb-track i{position:absolute;display:block}
  .kdn-sumb-track .bar{left:0;right:0;top:26px;height:12px;border-radius:999px;background:linear-gradient(90deg,#ff7a3d 0%,#f6c37a 30%,#5a5e6b 60%,#3a3d47 100%)}
  .kdn-sumb-track .band{top:21px;height:22px;min-width:8px;border-radius:6px;background:rgba(255,255,255,.26);border:1px solid rgba(255,255,255,.6);box-sizing:border-box}
  .kdn-sumb-track .ghost{top:18px;width:3px;height:28px;margin-left:-1.5px;border-radius:2px;background:#9aa0ab}
  .kdn-sumb-track .mark{top:14px;width:4px;height:36px;margin-left:-2px;border-radius:2px;background:#ffffff;box-shadow:0 0 0 3px rgba(255,122,61,.45)}
  .kdn-sumb-track .tip{position:absolute;top:-8px;transform:translateX(-50%);font-family:var(--kdn-num-font);font-size:18px;font-weight:800;color:#ffffff;font-variant-numeric:tabular-nums;white-space:nowrap}
  .kdn-sumb-axis{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));font-size:12px;color:#9aa0ab}
  .kdn-sumb-axis span:last-child{text-align:right}
  .kdn-sumb-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));border-top:1px solid rgba(255,255,255,.14);padding-top:18px}
  .kdn-sumb-stats>div{display:flex;flex-direction:column;gap:6px;padding:0 18px;border-left:1px solid rgba(255,255,255,.14)}
  .kdn-sumb-stats>div:first-child{padding-left:0;border-left:0}
  .kdn-sumb-stats span{font-size:13px;color:#cfccc5}
  .kdn-sumb-stats b{font-family:var(--kdn-num-font);font-size:30px;font-weight:800;line-height:1;color:#ffffff;font-variant-numeric:tabular-nums}
  .kdn-sumb-stats b small{font-size:13px;font-weight:500;color:#9aa0ab}
  .kdn-sumb-stats b.is-accent{color:#ffb089}
  @media (max-width:720px){.kdn-sumb{padding:22px}.kdn-sumb-name b{font-size:32px}.kdn-sumb-stats>div{padding:10px 0;border-left:0}}
  /* NAVI 기준 설정(시안 B): 단계 목록 | 질문 | 결과 패널 */
  .kdn-wiz{display:grid;grid-template-columns:250px minmax(0,1fr) minmax(330px,400px);gap:18px;align-items:stretch}
  @media (max-width:1280px){.kdn-wiz{grid-template-columns:230px minmax(0,1fr)}.kdn-wiz>.kdn-calc-result{grid-column:1/-1}}
  @media (max-width:820px){.kdn-wiz{grid-template-columns:minmax(0,1fr)}}
  .kdn-wiz-steps{display:flex;flex-direction:column;gap:4px;padding:20px 14px;border-radius:22px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kdn-wiz-eyebrow{font-size:13px;font-weight:700;color:var(--kdn-accent-text);letter-spacing:.03em;padding:0 8px 10px}
  .kdn-wiz-steps>button{display:flex!important;gap:12px;align-items:flex-start;padding:11px 10px!important;border-radius:14px!important;border:0!important;background:transparent!important;text-align:left;font:inherit;color:var(--kdn-ink);cursor:pointer;box-shadow:none!important;min-height:0!important}
  .kdn-wiz-steps>button:hover{background:var(--kdn-surface-2)!important}
  .kdn-wiz-steps>button.is-on{background:var(--kdn-accent-soft)!important;box-shadow:inset 3px 0 0 var(--kdn-accent)!important}
  .kdn-wiz-dot{width:28px;height:28px;flex:none;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;border:1.5px solid var(--kdn-control-line);color:var(--kdn-muted);box-sizing:border-box}
  .kdn-wiz-steps>button.is-done .kdn-wiz-dot{background:#16a34a;border-color:#16a34a;color:#ffffff}
  .kdn-wiz-steps>button.is-on .kdn-wiz-dot{background:var(--kdn-accent);border-color:var(--kdn-accent);color:var(--kdn-accent-ink)}
  .kdn-wiz-label{display:flex;flex-direction:column;gap:2px;min-width:0}
  .kdn-wiz-label b{font-size:15px;font-weight:700;color:var(--kdn-ink)}
  .kdn-wiz-steps>button.is-on .kdn-wiz-label b{color:var(--kdn-accent-text)}
  .kdn-wiz-label small{font-size:12.5px;line-height:1.45;color:var(--kdn-muted);word-break:keep-all}
  .kdn-wiz-steps p{margin:auto 0 0;padding:12px;border-radius:12px;background:var(--kdn-surface-2);font-size:12.5px;line-height:1.6;color:var(--kdn-ink-soft)}
  .kdn-wiz-main{display:flex;flex-direction:column;border-radius:22px;background:var(--kdn-surface);border:1px solid var(--kdn-line);overflow:hidden;min-width:0}
  .kdn-wiz-body{display:flex;flex-direction:column;gap:20px;padding:28px 30px;flex:1}
  .kdn-wiz-q{display:flex;flex-direction:column;gap:6px}
  .kdn-wiz-q>span{font-family:var(--kdn-num-font);font-size:13.5px;font-weight:700;color:var(--kdn-accent-text);letter-spacing:.04em}
  .kdn-wiz-q>b{font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--kdn-ink);line-height:1.3;word-break:keep-all}
  .kdn-wiz-q>small{font-size:15px;line-height:1.6;color:var(--kdn-muted);word-break:keep-all}
  .kdn-wiz-student{display:flex;align-items:center;gap:14px;padding:16px 18px;border-radius:16px;background:var(--kdn-surface-2);border:1px solid var(--kdn-line)}
  .kdn-wiz-student>div{display:flex;flex-direction:column;gap:3px}
  .kdn-wiz-student b{font-size:20px;font-weight:800;color:var(--kdn-ink)}
  .kdn-wiz-student small{font-size:14px;color:var(--kdn-muted)}
  .kdn-wiz-avatar{width:48px;height:48px;flex:none;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#ff9a5c,#e2531a);color:#ffffff;font-size:20px;font-weight:800}
  .kdn-wiz-rounds{display:flex;flex-wrap:wrap;gap:8px}
  .kdn-wiz-rounds button{display:inline-flex!important;align-items:center;gap:8px;min-height:46px!important;padding:0 16px!important;border-radius:12px!important;border:1.5px solid var(--kdn-control-line)!important;background:var(--kdn-surface)!important;color:var(--kdn-ink)!important;font:inherit;cursor:pointer;box-shadow:none!important}
  .kdn-wiz-rounds button b{font-size:15px;font-weight:700}
  .kdn-wiz-rounds button small{font-family:var(--kdn-num-font);font-size:13px;font-weight:700;color:var(--kdn-muted)}
  .kdn-wiz-rounds button.is-on{border:2px solid var(--kdn-accent)!important;background:var(--kdn-accent-soft)!important}
  .kdn-wiz-rounds button.is-on small{color:var(--kdn-accent-text)}
  .kdn-calc-choices.is-three{grid-template-columns:repeat(3,minmax(0,1fr))}
  @media (max-width:980px){.kdn-calc-choices.is-three{grid-template-columns:minmax(0,1fr)}}
  .kdn-calc-choice{position:relative}
  .kdn-wiz-radio{position:absolute;top:16px;right:16px;width:20px;height:20px;border-radius:999px;border:2px solid var(--kdn-control-line);box-sizing:border-box}
  .kdn-calc-choice.is-on .kdn-wiz-radio{border:6px solid var(--kdn-accent)}
  .kdn-calc-choice input{width:100%;height:52px;margin-top:4px;padding:0 14px;border-radius:12px;border:1.5px solid var(--kdn-control-line);background:var(--kdn-surface);color:var(--kdn-ink);font-family:var(--kdn-num-font);font-size:22px;font-weight:700;box-sizing:border-box}
  .kdn-wiz-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 30px;border-top:1px solid var(--kdn-line);background:var(--kdn-surface-2)}
  .kdn-wiz-now{font-size:14px;color:var(--kdn-muted)}
  .kdn-wiz-now b{margin-left:6px;padding:6px 12px;border-radius:999px;background:var(--kdn-ink);color:var(--kdn-surface);font-size:13.5px;font-weight:700}
  .kdn-wiz-prev{margin-left:auto;min-height:46px;padding:0 18px;border-radius:12px;font:inherit;font-size:15px;font-weight:600;cursor:pointer}
  .kdn-wiz-next{min-height:46px;padding:0 22px;border-radius:12px;border:0!important;background:var(--kdn-accent)!important;color:var(--kdn-accent-ink)!important;font:inherit;font-size:15px;font-weight:800;cursor:pointer}
  .kdn-wiz-prev+.kdn-wiz-next{margin-left:0}
  .kdn-wiz-now+.kdn-wiz-next{margin-left:auto}
  /* 보기 전환 공용(표/카드/지도 등) */
  .kdn-view-switch{display:flex;justify-content:flex-end;align-items:center;gap:4px;margin:0 0 12px;flex-wrap:wrap}
  .kdn-view-switch>span{font-size:13px;font-weight:700;color:var(--kdn-muted);margin-right:6px}
  .kdn-view-switch button{min-height:38px;padding:0 14px;border-radius:10px;border:1px solid var(--kdn-line);background:var(--kdn-surface);color:var(--kdn-ink-soft);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
  .kdn-view-switch button.is-on{background:var(--kdn-ink);border-color:var(--kdn-ink);color:var(--kdn-surface)}
  /* NAVI 결과 B: 카드 격자 */
  .kdn-rgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
  .kdn-rcard{position:relative;display:flex;flex-direction:column;gap:10px;padding:20px 20px 16px;border-radius:20px;background:var(--kdn-surface);border:1px solid var(--kdn-line);overflow:hidden}
  .kdn-rcard::before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:var(--band)}
  .kdn-rcard-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
  .kdn-rcard-head>div{display:flex;flex-direction:column;gap:3px;min-width:0}
  .kdn-rcard-head small{font-size:13px;font-weight:600;color:var(--kdn-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .kdn-rcard-head b{font-size:18px;font-weight:800;color:var(--kdn-ink);line-height:1.3;word-break:keep-all}
  .kdn-rcard-tag{flex:none;padding:4px 11px;border-radius:999px;background:var(--band-bg);color:var(--band);font-size:13px;font-weight:800;border:1px solid var(--band)}
  .kdn-rcard-tag.is-none{color:var(--kdn-muted);border-color:var(--kdn-line)}
  .kdn-rcard-gap{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
  .kdn-rcard-gap b{font-family:var(--kdn-num-font);font-size:32px;font-weight:800;line-height:1;color:var(--band);font-variant-numeric:tabular-nums}
  .kdn-rcard-gap span{font-size:13.5px;color:var(--kdn-muted)}
  .kdn-rcard-scale{position:relative;height:26px}
  .kdn-rcard-scale i{position:absolute;display:block}
  .kdn-rcard-scale .t{left:0;right:0;top:10px;height:6px;border-radius:999px;background:var(--kdn-surface-2);box-shadow:inset 0 0 0 1px var(--kdn-line)}
  .kdn-rcard-scale .z{top:7px;height:12px;min-width:8px;border-radius:6px;background:rgba(79,70,229,.55)}
  .kdn-rcard-scale .me{top:1px;width:4px;height:24px;margin-left:-2px;border-radius:2px;background:#e2531a}
  .kdn-rcard-axis{display:flex;justify-content:space-between;margin-top:-6px;font-family:var(--kdn-num-font);font-size:12px;color:var(--kdn-muted)}
  .kdn-rcard-foot{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;margin-top:auto;padding-top:12px;border-top:1px solid var(--kdn-line)}
  .kdn-rcard-foot small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .kdn-rcard-foot>span{padding:4px 9px;border-radius:8px;background:var(--kdn-surface-2);font-size:13px;font-weight:700;color:var(--kdn-ink-soft)}
  .kdn-rcard-foot>span.is-ok{background:#e7f7ee;color:#236b45}
  .kdn-rcard-foot>span.is-bad{background:#fdeceb;color:#b3413a}
  .kdn-rcard-foot small{font-size:12.5px;color:var(--kdn-muted)}
  .kdn-rcard-foot button{display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:0 12px;border-radius:10px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
  .kdn-rcard-foot button[aria-pressed="true"]{color:#b07800}
  /* NAVI 결과 C: 컷 분포 지도 */
  .kdn-rmap{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px}
  @media (max-width:1100px){.kdn-rmap{grid-template-columns:minmax(0,1fr)}}
  .kdn-rmap-chart{display:flex;flex-direction:column;gap:14px;padding:22px 24px;border-radius:20px;background:var(--kdn-surface);border:1px solid var(--kdn-line);min-width:0}
  .kdn-rmap-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .kdn-rmap-head>div:first-child{display:flex;flex-direction:column;gap:4px}
  .kdn-rmap-head b{font-size:19px;font-weight:800;color:var(--kdn-ink)}
  .kdn-rmap-head span{font-size:13.5px;color:var(--kdn-muted)}
  .kdn-rmap-legend{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
  .kdn-rmap-legend span{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:800}
  .kdn-rmap-legend i{width:10px;height:10px;border-radius:999px}
  .kdn-rmap-plot{position:relative;display:grid;grid-template-rows:repeat(var(--lanes),minmax(64px,1fr));padding-bottom:28px}
  .kdn-rmap-lane{display:grid;grid-template-columns:96px minmax(0,1fr);align-items:center}
  .kdn-rmap-lane span{font-size:13px;font-weight:700;color:var(--kdn-ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:8px}
  .kdn-rmap-lane div{height:1px;background:var(--kdn-line)}
  .kdn-rmap-dots{position:absolute;left:96px;right:0;top:0;bottom:28px}
  .kdn-rmap-dots button{position:absolute;width:12px!important;height:12px!important;min-height:0!important;padding:0!important;border-radius:999px!important;border:2px solid var(--kdn-surface)!important;transform:translate(-50%,-50%);cursor:pointer;box-shadow:0 1px 3px rgba(20,24,33,.3)}
  .kdn-rmap-dots button:hover,.kdn-rmap-dots button.is-on{width:18px!important;height:18px!important;border:3px solid var(--kdn-ink)!important;z-index:2}
  :root[data-kd-ui="dark"] .kdn-rmap-dots button,:root[data-kd-ui="dark"] .kdn-gr-plot>button{filter:brightness(1.45) saturate(1.15)}
  .kdn-rmap-me{position:absolute;top:-6px;bottom:0;width:3px;margin-left:-1.5px;border-radius:2px;background:#e2531a;z-index:1;pointer-events:none}
  .kdn-rmap-me-tip{position:absolute;bottom:-26px;transform:translateX(-50%);padding:2px 8px;border-radius:7px;background:#e2531a;color:#ffffff;font-family:var(--kdn-num-font);font-size:12.5px;font-weight:800;z-index:3}
  .kdn-rmap-axis{position:absolute;left:96px;right:0;bottom:0;display:flex;justify-content:space-between;font-family:var(--kdn-num-font);font-size:12px;color:var(--kdn-muted)}
  .kdn-rmap-note,.kdn-rmap-empty{font-size:13px;color:var(--kdn-muted)}
  .kdn-rmap-detail{display:flex;flex-direction:column;gap:14px;padding:22px;border-radius:20px;background:linear-gradient(160deg,#17181d 0%,#26211d 100%)!important;color:#f4f1ea;border:1px solid #3a2d24;align-self:start}
  .kdn-rmap-eyebrow{font-size:13px;font-weight:700;color:#ffb089;letter-spacing:.04em}
  .kdn-rmap-detail>div:not(.kdn-rmap-verdict){display:flex;flex-direction:column;gap:4px}
  .kdn-rmap-detail small{font-size:13.5px;color:#cfccc5}
  .kdn-rmap-detail>div>b{font-size:23px;font-weight:800;color:#ffffff;line-height:1.3;word-break:keep-all}
  .kdn-rmap-verdict{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .kdn-rmap-verdict span{padding:5px 12px;border-radius:999px;color:#ffffff;font-size:14px;font-weight:800}
  .kdn-rmap-verdict em{font-style:normal;font-size:14px;color:#cfccc5}
  .kdn-rmap-verdict em b{font-family:var(--kdn-num-font);color:#ffffff}
  .kdn-rmap-detail dl{margin:0;display:flex;flex-direction:column}
  .kdn-rmap-detail dl>div{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.1);font-size:14px}
  .kdn-rmap-detail dt{color:#9aa0ab}
  .kdn-rmap-detail dd{margin:0;font-weight:700;color:#ffffff;font-family:var(--kdn-num-font)}
  .kdn-rmap-fav{min-height:46px;display:inline-flex!important;align-items:center;justify-content:center;gap:6px;border-radius:12px!important;border:0!important;background:#ff7a3d!important;color:#1b1006!important;font:inherit;font-size:14px;font-weight:800;cursor:pointer}
  .kdn-rmap-fav:disabled{opacity:.5;cursor:default}
  .kdn-view-switch.is-left{justify-content:flex-start}
  /* 성적 리포트(시안 C): 인사이트 + 교과별 큰 그래프 + 과목×학기 히트맵 */
  .kdn-gi{display:flex;flex-direction:column;gap:16px}
  .kdn-gi-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,340px);gap:24px;align-items:center;padding:26px 30px;border-radius:22px;background:radial-gradient(600px 240px at 0% 0%,rgba(255,122,61,.3),rgba(255,122,61,0) 70%),linear-gradient(135deg,#17181d 0%,#23201d 100%)!important;color:#f4f1ea;border:1px solid #3a2d24}
  @media (max-width:760px){.kdn-gi-hero{grid-template-columns:minmax(0,1fr)}}
  .kdn-gi-hero-copy{display:flex;flex-direction:column;gap:10px;min-width:0}
  .kdn-gi-hero-copy>span{font-size:13px;font-weight:700;color:#ffb089;letter-spacing:.05em}
  .kdn-gi-hero-copy>b{font-size:30px;font-weight:800;line-height:1.35;letter-spacing:-.02em;color:#ffffff;word-break:keep-all}
  .kdn-gi-hero-copy>b em{font-style:normal;font-family:var(--kdn-num-font);color:#ff9a66;font-variant-numeric:tabular-nums}
  .kdn-gi-hero-copy>small{font-size:14px;color:#cfccc5}
  .kdn-gi-spark{width:100%;height:auto;overflow:visible}
  .kdn-gi-spark .area{fill:rgba(255,122,61,.18)}
  .kdn-gi-spark .line{fill:none;stroke:#ff7a3d;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
  .kdn-gi-spark .dot{fill:#17181d;stroke:#ff7a3d;stroke-width:3}
  .kdn-gi-spark .dot.is-last{fill:#ff7a3d}
  .kdn-gi-spark .val{fill:#cfccc5;font-size:13px;font-weight:600;font-family:var(--kdn-num-font)}
  .kdn-gi-spark .val.is-last{fill:#ffffff;font-weight:800}
  .kdn-gi-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  @media (max-width:900px){.kdn-gi-cards{grid-template-columns:minmax(0,1fr)}}
  .kdn-gi-card{display:flex;flex-direction:column;gap:8px;padding:18px 20px;border-radius:18px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kdn-gi-card .tag{align-self:flex-start;padding:4px 10px;border-radius:999px;font-size:13px;font-weight:800}
  .kdn-gi-card.is-good .tag{background:#dcfce7;color:#166534}
  .kdn-gi-card.is-grow .tag{background:#dbeafe;color:#1e40af}
  .kdn-gi-card.is-care .tag{background:#ffedd5;color:#b23e0c}
  .kdn-gi-card>b{font-size:18px;font-weight:800;color:var(--kdn-ink);line-height:1.4;font-variant-numeric:tabular-nums}
  .kdn-gi-card p{margin:0;font-size:14px;line-height:1.6;color:var(--kdn-muted);word-break:keep-all}
  .kdn-gi-subs{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
  .kdn-gi-sub{display:flex;flex-direction:column;gap:4px;padding:16px 16px 10px;border-radius:18px;background:var(--kdn-surface);border:1px solid var(--kdn-line);box-shadow:inset 0 3px 0 var(--c)}
  .kdn-gi-sub-head{display:flex;justify-content:space-between;align-items:center}
  .kdn-gi-sub-head b{font-size:16px;font-weight:800;color:var(--kdn-ink)}
  .kdn-gi-sub-head span{font-size:13px;font-weight:800;font-family:var(--kdn-num-font)}
  .kdn-gi-sub-head .is-up{color:#16a34a}.kdn-gi-sub-head .is-down{color:#dc2626}
  .kdn-gi-sub-value{display:flex;align-items:baseline;gap:6px;font-family:var(--kdn-num-font);font-size:28px;font-weight:800;color:var(--c);font-variant-numeric:tabular-nums}
  .kdn-gi-sub-value small{font-family:inherit;font-size:12.5px;font-weight:600;color:var(--kdn-muted)}
  .kdn-gi-sub svg{width:100%;height:auto;overflow:visible}
  .kdn-gi-sub .grid{stroke:var(--kdn-line);stroke-width:1}
  .kdn-gi-sub .axis{fill:var(--kdn-muted);font-size:11px;font-family:var(--kdn-num-font)}
  .kdn-gi-sub .line{fill:none;stroke:var(--c);stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round}
  .kdn-gi-sub .dot{fill:var(--kdn-surface);stroke:var(--c);stroke-width:3}
  .kdn-gi-sub .dot.is-last{fill:var(--c)}
  .kdn-gi-sub .val{fill:var(--kdn-ink);font-size:13px;font-weight:800;font-family:var(--kdn-num-font)}
  .kdn-gi-sub .sem{fill:var(--kdn-muted);font-size:12px;font-weight:600;font-family:var(--kdn-num-font)}
  .kdn-gi-empty{padding:24px;text-align:center;font-size:14px;color:var(--kdn-muted)}
  .kdn-gi-heat-wrap{display:flex;flex-direction:column;gap:14px;overflow-x:auto}
  .kdn-gi-heat-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
  .kdn-gi-heat-head>div:first-child{display:flex;flex-direction:column;gap:4px}
  .kdn-gi-heat-head b{font-size:18px;font-weight:800;color:var(--kdn-ink)}
  .kdn-gi-heat-head span{font-size:13.5px;color:var(--kdn-muted)}
  .kdn-gi-legend{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .kdn-gi-legend span{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;color:var(--kdn-muted)}
  .kdn-gi-legend i{width:22px;height:14px;min-height:0!important;border-radius:4px;display:inline-block}
  .kdn-gi-heat{display:grid;gap:6px;align-items:stretch;min-width:420px}
  .kdn-gi-col{font-size:13px;font-weight:700;color:var(--kdn-muted);text-align:center;padding-bottom:2px;font-family:var(--kdn-num-font)}
  .kdn-gi-name{display:flex;flex-direction:column;justify-content:center;padding:0 6px;min-width:0}
  .kdn-gi-name b{font-size:14.5px;font-weight:700;color:var(--kdn-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .kdn-gi-name small{font-size:12px;color:var(--kdn-muted)}
  .kdn-gi-name.is-total{border-top:2px solid var(--kdn-ink);padding-top:6px}
  .kdn-gi-cell{display:flex;align-items:center;justify-content:center;min-height:40px;border-radius:10px;font-size:13px;font-style:normal}
  .kdn-gi-cell b{font-family:var(--kdn-num-font);font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
  .kdn-gi-cell.l1{background:#e2531a;color:#ffffff}
  .kdn-gi-cell.l2{background:#f6a37a;color:#3b1505}
  .kdn-gi-cell.l3{background:#fde3d3;color:#7a2a08}
  .kdn-gi-cell.l4{background:#e5e7eb;color:#374151}
  .kdn-gi-cell.l0{background:repeating-linear-gradient(45deg,var(--kdn-surface-2) 0 6px,var(--kdn-surface) 6px 12px);color:var(--kdn-muted);box-shadow:inset 0 0 0 1px var(--kdn-line)}
  .kdn-gi-cell.is-total{border-top:2px solid var(--kdn-ink);border-radius:0 0 10px 10px;background:var(--kdn-accent-soft);color:var(--kdn-accent-text)}
  .kdn-gi-dist{display:flex;flex-direction:column;gap:8px}
  .kdn-gi-dist>span{font-size:13px;font-weight:700;color:var(--kdn-muted)}
  .kdn-gi-dist-bar{display:flex;height:30px;border-radius:10px;overflow:hidden;gap:2px}
  .kdn-gi-dist-bar i{min-height:30px;border-radius:0;font-size:12.5px;font-weight:800;white-space:nowrap;overflow:hidden}
  /* 성적 산출 결과 B: 학생 목록 + 상세 */
  .kdn-gr-empty{padding:28px;text-align:center;font-size:14px;color:var(--kdn-muted)}
  .kdn-gr-split{display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);gap:16px;align-items:start}
  @media (max-width:860px){.kdn-gr-split{grid-template-columns:minmax(0,1fr)}}
  .kdn-gr-list{display:flex;flex-direction:column;gap:2px;max-height:620px;overflow:auto;padding:12px;border-radius:20px;background:var(--kdn-surface);border:1px solid var(--kdn-line);outline:none}
  .kdn-gr-list:focus-visible{box-shadow:0 0 0 3px var(--kdn-accent-soft)}
  .kdn-gr-list-head{display:flex;justify-content:space-between;align-items:baseline;padding:4px 8px 10px;position:sticky;top:-12px;background:var(--kdn-surface);z-index:1}
  .kdn-gr-list-head b{font-size:16px;font-weight:800;color:var(--kdn-ink)}
  .kdn-gr-list-head span{font-size:12.5px;color:var(--kdn-muted)}
  .kdn-gr-list>button{flex:none;display:grid!important;grid-template-columns:34px minmax(0,1fr) auto 30px;gap:10px;align-items:center;padding:9px 10px!important;border-radius:12px!important;border:0!important;background:transparent!important;text-align:left;font:inherit;color:var(--kdn-ink);cursor:pointer;box-shadow:none!important;min-height:0!important}
  .kdn-gr-list>button:hover{background:var(--kdn-surface-2)!important}
  .kdn-gr-list>button.is-on{background:var(--kdn-accent-soft)!important;box-shadow:inset 3px 0 0 var(--kdn-accent)!important}
  .kdn-gr-list .no{font-family:var(--kdn-num-font);font-size:13px;font-weight:700;color:var(--kdn-muted);text-align:center}
  .kdn-gr-list .who{display:flex;flex-direction:column;min-width:0}
  .kdn-gr-list .who b{font-size:15px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .kdn-gr-list .who small{font-size:12px;color:var(--kdn-muted)}
  .kdn-gr-list .sc{font-family:var(--kdn-num-font);font-size:15.5px;font-weight:800;font-variant-numeric:tabular-nums}
  .kdn-gr-list .gr{display:inline-flex;align-items:center;justify-content:center;width:28px;height:26px;border-radius:8px;color:#ffffff;font-family:var(--kdn-num-font);font-size:13.5px;font-weight:800}
  .kdn-gr-list .gr.is-none{background:var(--kdn-surface-2);color:var(--kdn-muted)}
  .kdn-gr-detail{display:flex;flex-direction:column;gap:18px;padding:24px 26px;border-radius:20px;background:var(--kdn-surface);border:1px solid var(--kdn-line);min-width:0}
  .kdn-gr-detail-head{display:flex;align-items:center;gap:14px}
  .kdn-gr-detail-head>div{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
  .kdn-gr-detail-head b{font-size:24px;font-weight:800;color:var(--kdn-ink);letter-spacing:-.02em}
  .kdn-gr-detail-head small{font-size:14px;color:var(--kdn-muted)}
  .kdn-gr-detail-head button{min-height:42px;padding:0 16px;border-radius:12px;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
  .kdn-gr-avatar{width:52px;height:52px;flex:none;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#ff9a66,#e2531a);color:#ffffff;font-size:22px;font-weight:800}
  .kdn-gr-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
  .kdn-gr-kpis>div{display:flex;flex-direction:column;gap:3px;padding:14px 16px;border-radius:14px;background:var(--kdn-surface-2)}
  .kdn-gr-kpis span{font-size:12.5px;font-weight:600;color:var(--kdn-muted)}
  .kdn-gr-kpis b{font-family:var(--kdn-num-font);font-size:28px;font-weight:800;line-height:1.1;color:var(--kdn-ink);font-variant-numeric:tabular-nums}
  .kdn-gr-kpis b small{font-size:14px;font-weight:600;color:var(--kdn-muted)}
  .kdn-gr-kpis>div>small{font-size:12.5px;color:var(--kdn-muted)}
  .kdn-gr-kpis>div.is-dark{background:linear-gradient(160deg,#17181d,#26211d)!important}
  .kdn-gr-kpis>div.is-dark span{color:#ffb089}.kdn-gr-kpis>div.is-dark b{color:#ffffff}.kdn-gr-kpis>div.is-dark small{color:#cfccc5}
  .kdn-gr-kpis>div.is-accent{background:var(--kdn-accent-soft)}
  .kdn-gr-kpis>div.is-accent b{color:var(--kdn-accent-text)}
  .kdn-gr-parts,.kdn-gr-pos{display:flex;flex-direction:column;gap:8px}
  .kdn-gr-parts-head{display:flex;justify-content:space-between;align-items:baseline}
  .kdn-gr-parts-head b{font-size:15px;font-weight:800;color:var(--kdn-ink)}
  .kdn-gr-parts-head span{font-size:12.5px;color:var(--kdn-muted)}
  .kdn-gr-part{display:grid;grid-template-columns:minmax(90px,150px) minmax(0,1fr) 92px;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--kdn-line)}
  .kdn-gr-part>span{font-size:14px;font-weight:600;color:var(--kdn-ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .kdn-gr-part .bar{height:10px;border-radius:999px;background:var(--kdn-surface-2);overflow:hidden}
  .kdn-gr-part .bar i{display:block;height:100%;border-radius:999px;background:var(--kdn-accent)}
  .kdn-gr-part>b{font-family:var(--kdn-num-font);font-size:15px;font-weight:800;text-align:right;color:var(--kdn-ink)}
  .kdn-gr-part>b small{font-size:12px;font-weight:500;color:var(--kdn-muted)}
  .kdn-gr-pos .track{position:relative;height:12px;border-radius:999px;background:linear-gradient(90deg,#e2531a,#f6b26b 30%,#cbd5e1 70%,#64748b)}
  .kdn-gr-pos .track i{position:absolute;top:-6px;width:6px;height:24px;margin-left:-3px;border-radius:3px;background:var(--kdn-ink);box-shadow:0 0 0 2px var(--kdn-surface)}
  .kdn-gr-pos .axis{display:flex;justify-content:space-between;font-family:var(--kdn-num-font);font-size:12px;color:var(--kdn-muted)}
  /* 성적 산출 결과 C: 분포 차트 */
  .kdn-gr-dist{display:flex;flex-direction:column;gap:18px;padding:26px 30px;border-radius:22px;background:radial-gradient(700px 300px at 100% 0%,rgba(255,122,61,.18),rgba(255,122,61,0) 70%),linear-gradient(160deg,#17181d 0%,#23201d 100%)!important;color:#f4f1ea;border:1px solid #3a2d24;margin-bottom:14px}
  .kdn-gr-dist-head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .kdn-gr-dist-head>div:first-child{display:flex;flex-direction:column;gap:6px}
  .kdn-gr-dist-head>div:first-child>span{font-size:13px;font-weight:700;color:#ffb089;letter-spacing:.05em}
  .kdn-gr-dist-head>div:first-child>b{font-size:26px;font-weight:800;letter-spacing:-.02em;color:#ffffff}
  .kdn-gr-dist-head>div:first-child>small{font-size:14px;color:#cfccc5}
  .kdn-gr-legend{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;max-width:420px}
  .kdn-gr-legend span{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700;color:#e7e3dc}
  .kdn-gr-legend i{width:11px;height:11px;border-radius:999px}
  .kdn-gr-plot{position:relative;margin:30px 10px 0}
  .kdn-gr-plot>button{position:absolute;transform:translateX(-50%);padding:0!important;min-height:0!important;border-radius:999px!important;border:1.5px solid rgba(23,24,29,.85)!important;cursor:pointer;box-shadow:none!important}
  .kdn-gr-plot>button.is-on,.kdn-gr-plot>button:hover{outline:3px solid #ffffff;z-index:3}
  .kdn-gr-plot .zone{position:absolute;top:22px;bottom:26px;background:color-mix(in srgb,var(--zc) 16%,transparent);border-top:3px solid color-mix(in srgb,var(--zc) 80%,transparent)}
  .kdn-gr-plot .zone em{position:absolute;left:50%;bottom:6px;transform:translateX(-50%);font-style:normal;font-size:13px;font-weight:800;color:color-mix(in srgb,var(--zc) 70%,#ffffff);white-space:nowrap;opacity:.95}
  .kdn-gr-plot .cut{position:absolute;top:22px;bottom:26px;z-index:1;border-left:2px solid rgba(255,255,255,.75)}
  .kdn-gr-plot .cut span{position:absolute;top:-22px;left:0;transform:translateX(-50%);padding:2px 8px;border-radius:7px;background:#ffffff;color:#1f2430;font-size:12px;font-weight:700;white-space:nowrap;font-family:var(--kdn-num-font);box-shadow:0 2px 6px rgba(0,0,0,.25)}
  .kdn-gr-plot .cut span b{color:#c2410c}
  .kdn-gr-plot .cut.alt span{top:-2px}
  .kdn-gr-plot .avg{position:absolute;top:40px;bottom:26px;z-index:1;border-left:2px dashed #ffb089}
  .kdn-gr-plot .avg span{position:absolute;top:0;left:5px;font-size:12px;font-weight:800;color:#ffb089;white-space:nowrap}
  .kdn-gr-plot .axis{position:absolute;left:0;right:0;bottom:0;height:24px;border-top:2px solid rgba(255,255,255,.2)}
  .kdn-gr-plot .axis span{position:absolute;top:6px;transform:translateX(-50%);font-family:var(--kdn-num-font);font-size:12.5px;color:#9aa0ab}
  .kdn-gr-dist-foot{display:grid;grid-template-columns:minmax(220px,2fr) repeat(4,minmax(80px,1fr));gap:10px}
  @media (max-width:760px){.kdn-gr-dist-foot{grid-template-columns:repeat(2,minmax(0,1fr))}.kdn-gr-dist-foot .tip{grid-column:1/-1}}
  .kdn-gr-dist-foot>div{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.07)}
  .kdn-gr-dist-foot .tip{background:#ffffff}
  .kdn-gr-dist-foot .tip b{font-size:15px;font-weight:800;color:#1f2430}
  .kdn-gr-dist-foot .tip span{font-size:13px;color:#4a5262}
  .kdn-gr-dist-foot .stat span{font-size:12px;color:#9aa0ab}
  .kdn-gr-dist-foot .stat b{font-family:var(--kdn-num-font);font-size:22px;font-weight:800;color:#ffffff}
  /* 오른쪽 아래 떠 있는 바로가기·건의 버튼이 페이지 마지막 버튼(다음 단계 등)을 가리지 않도록 아래 여백 */
  .kdn-app{padding-bottom:max(110px,var(--kdn-float-gap,0px))!important}
  /* 학생 성적 시뮬레이터 */
  .kdn-sim{display:flex;flex-direction:column;gap:16px}
  .kdn-sim-empty{padding:28px;text-align:center;font-size:14px;color:var(--kdn-muted)}
  .kdn-sim-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,360px);gap:24px;align-items:center;padding:24px 28px;border-radius:22px;background:radial-gradient(600px 240px at 0% 0%,rgba(255,122,61,.3),rgba(255,122,61,0) 70%),linear-gradient(135deg,#17181d 0%,#23201d 100%)!important;color:#f4f1ea;border:1px solid #3a2d24}
  @media (max-width:820px){.kdn-sim-hero{grid-template-columns:minmax(0,1fr)}}
  .kdn-sim-hero-copy{display:flex;flex-direction:column;gap:10px;min-width:0}
  .kdn-sim-hero-copy>span{font-size:13px;font-weight:700;color:#ffb089;letter-spacing:.05em}
  .kdn-sim-hero-copy>b{font-size:28px;font-weight:800;line-height:1.35;color:#ffffff;word-break:keep-all}
  .kdn-sim-hero-copy>b em{font-style:normal;font-family:var(--kdn-num-font);color:#ff9a66;font-variant-numeric:tabular-nums}
  .kdn-sim-hero-copy>b small{margin-left:10px;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.12);font-size:14px;font-weight:700;color:#e7e3dc;vertical-align:middle}
  .kdn-sim-hero-copy>b small.is-up{background:rgba(34,197,94,.2);color:#86efac}
  .kdn-sim-hero-copy>b small.is-down{background:rgba(239,68,68,.2);color:#fca5a5}
  .kdn-sim-hero-copy>p{margin:0;font-size:14.5px;color:#cfccc5}
  .kdn-sim-hero-copy>p strong{color:#ffffff;font-family:var(--kdn-num-font)}
  .kdn-sim-spark{width:100%;height:auto;overflow:visible}
  .kdn-sim-spark .line{stroke:#ff7a3d;stroke-width:3.5;stroke-linecap:round}
  .kdn-sim-spark .line.is-sim{stroke-dasharray:5 7;stroke:#ffb089}
  .kdn-sim-spark .dot{fill:#ff7a3d;stroke:#17181d;stroke-width:2}
  .kdn-sim-spark .dot.is-sim{fill:#17181d;stroke:#ffb089;stroke-width:2.5;stroke-dasharray:3 2}
  .kdn-sim-spark .val{fill:#ffffff;font-size:12.5px;font-weight:700;font-family:var(--kdn-num-font)}
  .kdn-sim-spark .sem{fill:#9aa0ab;font-size:11.5px;font-family:var(--kdn-num-font)}
  .kdn-sim-body{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
  @media (max-width:1100px){.kdn-sim-body{grid-template-columns:minmax(0,1fr)}}
  .kdn-sim-editor,.kdn-sim-side>div{display:flex;flex-direction:column;gap:12px;padding:20px 22px;border-radius:20px;background:var(--kdn-surface);border:1px solid var(--kdn-line);min-width:0}
  .kdn-sim-side{display:flex;flex-direction:column;gap:12px}
  .kdn-sim-tabs{display:flex;gap:6px;flex-wrap:wrap}
  .kdn-sim-tabs button{display:flex!important;flex-direction:column;align-items:flex-start;gap:2px;min-height:0!important;padding:10px 16px!important;border-radius:12px!important;border:1.5px solid var(--kdn-line)!important;background:var(--kdn-surface)!important;color:var(--kdn-ink)!important;font:inherit;cursor:pointer;box-shadow:none!important}
  .kdn-sim-tabs button b{font-size:14.5px;font-weight:700}
  .kdn-sim-tabs button small{font-size:12px;color:var(--kdn-muted)}
  .kdn-sim-tabs button.is-on{border:2px solid var(--kdn-accent)!important;background:var(--kdn-accent-soft)!important}
  .kdn-sim-tabs button.is-on small{color:var(--kdn-accent-text)}
  .kdn-sim-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13.5px;color:var(--kdn-ink-soft)}
  .kdn-sim-tools>button{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:0 12px;border-radius:10px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
  .kdn-sim-tools label{display:inline-flex;align-items:center;gap:6px;font-weight:600}
  .kdn-sim-tools select{height:38px;padding:0 10px;border-radius:10px;border:1.5px solid var(--kdn-control-line);background:var(--kdn-surface);color:var(--kdn-ink);font:inherit;font-size:13.5px}
  .kdn-sim-check input{width:16px;height:16px;accent-color:var(--kdn-accent)}
  .kdn-sim-table{display:flex;flex-direction:column;gap:6px;overflow-x:auto}
  .kdn-sim-row{display:grid;grid-template-columns:minmax(120px,1.3fr) minmax(96px,.8fr) 64px minmax(200px,1.6fr) 74px 38px;gap:8px;align-items:center;min-width:640px}
  .kdn-sim-row.is-head{font-size:12.5px;font-weight:700;color:var(--kdn-muted);padding:0 2px}
  .kdn-sim-row input,.kdn-sim-row select{height:40px;padding:0 10px;border-radius:10px;border:1.5px solid var(--kdn-control-line);background:var(--kdn-surface);color:var(--kdn-ink);font:inherit;font-size:14px;box-sizing:border-box;min-width:0;width:100%}
  .kdn-sim-row input[type=number]{font-family:var(--kdn-num-font);text-align:center}
  .kdn-sim-grades{display:flex;gap:4px;align-items:center}
  .kdn-sim-grades button{flex:1;min-width:30px;height:36px;min-height:0!important;padding:0!important;border-radius:9px!important;border:1.5px solid var(--kdn-control-line)!important;background:var(--kdn-surface)!important;color:var(--kdn-ink-soft)!important;font-family:var(--kdn-num-font);font-size:14px;font-weight:700;cursor:pointer;box-shadow:none!important}
  .kdn-sim-grades button.is-on{border-color:transparent!important;color:#ffffff!important}
  .kdn-sim-grades button.g1{background:#e2531a!important}.kdn-sim-grades button.g2{background:#f08a4b!important}.kdn-sim-grades button.g3{background:#d39a3a!important}
  .kdn-sim-grades button.g4{background:#64748b!important}.kdn-sim-grades button.g5,.kdn-sim-grades button.g6,.kdn-sim-grades button.g7,.kdn-sim-grades button.g8,.kdn-sim-grades button.g9{background:#475569!important}
  .kdn-sim-grades span{font-size:11.5px;color:var(--kdn-muted);white-space:nowrap;min-width:46px}
  .kdn-sim-grades span:not(.is-none){display:none}
  .kdn-sim-del{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border-radius:10px;cursor:pointer}
  .kdn-sim-blank{padding:18px;border-radius:12px;background:var(--kdn-surface-2);font-size:14px;color:var(--kdn-muted);text-align:center}
  .kdn-sim-add{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:10px;border:1.5px dashed var(--kdn-control-line)!important;background:transparent!important;color:var(--kdn-ink)!important;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
  .kdn-sim-note{margin:0;font-size:12.5px;line-height:1.6;color:var(--kdn-muted)}
  .kdn-sim-groups-head,.kdn-sim-group{display:grid;grid-template-columns:minmax(0,1fr) 54px 64px 56px;gap:6px;align-items:baseline}
  .kdn-sim-groups-head{display:flex;justify-content:space-between}
  .kdn-sim-groups-head b,.kdn-sim-save>b,.kdn-sim-presets>b{font-size:15px;font-weight:800;color:var(--kdn-ink)}
  .kdn-sim-groups-head span{font-size:12.5px;color:var(--kdn-muted)}
  .kdn-sim-group{padding:8px 0;border-bottom:1px solid var(--kdn-line)}
  .kdn-sim-group span{font-size:14px;font-weight:600;color:var(--kdn-ink-soft)}
  .kdn-sim-group em{font-style:normal;font-family:var(--kdn-num-font);font-size:14px;color:var(--kdn-muted);text-align:right}
  .kdn-sim-group b{font-family:var(--kdn-num-font);font-size:19px;font-weight:800;color:var(--kdn-ink);text-align:right}
  .kdn-sim-group small{font-family:var(--kdn-num-font);font-size:12.5px;font-weight:700;color:var(--kdn-muted);text-align:right}
  .kdn-sim-group small.is-up{color:#16a34a}.kdn-sim-group small.is-down{color:#dc2626}
  .kdn-sim-save>div{display:flex;gap:6px}
  .kdn-sim-save input{flex:1;min-width:0;height:42px;padding:0 12px;border-radius:10px;border:1.5px solid var(--kdn-control-line);background:var(--kdn-surface);color:var(--kdn-ink);font:inherit;font-size:14px}
  .kdn-sim-save button{display:inline-flex;align-items:center;gap:6px;min-height:42px;padding:0 14px;border-radius:10px;border:0!important;background:var(--kdn-accent)!important;color:var(--kdn-accent-ink)!important;font:inherit;font-size:14px;font-weight:800;cursor:pointer}
  .kdn-sim-save button:disabled{opacity:.45;cursor:default}
  .kdn-sim-save small,.kdn-sim-presets small{font-size:12.5px;color:var(--kdn-muted);line-height:1.5}
  .kdn-sim-msg{color:var(--kdn-accent-text)!important;font-weight:600}
  .kdn-sim-preset{display:flex;gap:6px;align-items:stretch}
  .kdn-sim-preset>button:first-child{flex:1;display:flex!important;flex-direction:column;align-items:flex-start;gap:2px;min-height:0!important;padding:10px 12px!important;border-radius:12px!important;border:1px solid var(--kdn-line)!important;background:var(--kdn-surface-2)!important;color:var(--kdn-ink)!important;font:inherit;text-align:left;cursor:pointer;box-shadow:none!important}
  .kdn-sim-preset>button:first-child b{font-size:14.5px;font-weight:700}
  .kdn-sim-preset>button:first-child small{font-family:var(--kdn-num-font)}
  .kdn-sim-chips{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .kdn-sim-chips>span:first-child{font-size:13px;font-weight:700;color:var(--kdn-muted);margin-right:4px}
  .kdn-sim-chips button,.kdn-sim-chip{display:inline-flex!important;align-items:baseline;gap:6px;min-height:36px!important;padding:6px 12px!important;border-radius:999px!important;border:1.5px dashed var(--kdn-accent)!important;background:var(--kdn-surface)!important;color:var(--kdn-ink)!important;font:inherit;font-size:13.5px;cursor:pointer;box-shadow:none!important;box-sizing:border-box}
  .kdn-sim-chip{cursor:default}
  .kdn-sim-chips b{font-weight:700}
  .kdn-sim-chips small{font-family:var(--kdn-num-font);font-size:13px;font-weight:700;color:var(--kdn-accent-text)}
  .kdn-sim-chips button.is-on{border-style:solid!important;background:var(--kdn-accent-soft)!important}
  /* 학생 성적 비교 */
  .kdn-cmp{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:14px}
  @media (max-width:900px){.kdn-cmp{grid-template-columns:minmax(0,1fr)}}
  .kdn-cmp-card{display:flex;flex-direction:column;gap:12px;padding:18px 20px;border-radius:18px;background:var(--kdn-surface);border:1px solid var(--kdn-line);min-width:0}
  .kdn-cmp-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
  .kdn-cmp-head b{font-size:16px;font-weight:800;color:var(--kdn-ink)}
  .kdn-cmp-head span{font-size:12.5px;color:var(--kdn-muted)}
  .kdn-cmp-bars{display:flex;flex-direction:column;gap:8px}
  .kdn-cmp-bar{display:grid;grid-template-columns:24px minmax(90px,130px) minmax(0,1fr) 88px;gap:10px;align-items:center}
  .kdn-cmp-bar .rk{font-family:var(--kdn-num-font);font-size:14px;font-weight:800;color:var(--kdn-muted);text-align:center}
  .kdn-cmp-bar .nm{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:var(--kdn-ink);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .kdn-cmp-bar .nm i{width:9px;height:9px;border-radius:99px;flex:none}
  .kdn-cmp-bar .nm small{font-size:11.5px;font-weight:500;color:var(--kdn-muted)}
  .kdn-cmp-bar .tr{height:14px;border-radius:999px;background:var(--kdn-surface-2);overflow:hidden}
  .kdn-cmp-bar .tr i{display:block;height:100%;border-radius:999px}
  .kdn-cmp-bar .vl{display:flex;flex-direction:column;align-items:flex-end;line-height:1.15}
  .kdn-cmp-bar .vl b{font-family:var(--kdn-num-font);font-size:17px;font-weight:800;color:var(--kdn-ink)}
  .kdn-cmp-bar .vl small{font-size:11.5px;color:var(--kdn-muted)}
  .kdn-cmp-svg{width:100%;height:auto}
  .kdn-cmp-svg .grid{stroke:var(--kdn-line)}
  .kdn-cmp-svg .axis,.kdn-cmp-svg .sem{fill:var(--kdn-muted);font-size:11.5px;font-family:var(--kdn-num-font)}
  .kdn-cmp-legend{display:flex;gap:12px;flex-wrap:wrap}
  .kdn-cmp-legend span{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700;color:var(--kdn-ink-soft)}
  .kdn-cmp-legend i{width:12px;height:4px;border-radius:2px}
  .kdn-cmp-chips{display:flex;gap:5px;flex-wrap:wrap}
  .kdn-cmp-chip{display:inline-flex;align-items:stretch;border-radius:8px;overflow:hidden;border:1px solid var(--kdn-line)}
  .kdn-cmp-chip small{display:flex;align-items:center;padding:4px 7px;background:var(--kdn-surface-2);font-size:11.5px;font-weight:600;color:var(--kdn-muted)}
  .kdn-cmp-chip b{display:flex;align-items:center;padding:4px 8px;font-family:var(--kdn-num-font);font-size:14px;font-weight:800;color:var(--kdn-ink)}
  .kdn-mpage-off{display:none!important}
  @media print{body.print-minimum-dashboard .kdn-mpage-off{display:block!important}body.print-minimum-dashboard .minimum-rule-grid.kdn-mpage-off{display:grid!important}}
  /* NAVI 상세 카드(접힌 상태): 왼쪽 대학 요약 · 오른쪽 전형별 컷 비교를 나란히 두어 세로 길이를 줄입니다 */
  .kdn-rc-top{display:grid;grid-template-columns:minmax(250px,320px) minmax(0,1fr);grid-template-areas:"id cuts" "key cuts" "act act";column-gap:18px;row-gap:10px;padding:16px 18px 12px;align-items:start}
  @media (max-width:980px){.kdn-rc-top{grid-template-columns:minmax(0,1fr);grid-template-areas:"id" "key" "cuts" "act"}}
  .kdn-rc-top>.kdn-rc-summary{display:contents!important}
  .kdn-rc-top>.kdn-rc-summary>div:first-child{grid-area:id;min-width:0}
  .kdn-rc-top>.kdn-rc-summary>div:nth-child(2):not(:last-child){grid-area:key;display:flex!important;align-items:baseline;flex-wrap:wrap;gap:8px!important;padding:8px 12px!important;border-left:0!important;border-radius:12px;background:var(--kdn-surface-2);min-width:0!important}
  .kdn-rc-top>.kdn-rc-summary>div:nth-child(2):not(:last-child) b{font-size:22px!important}
  .kdn-rc-top>.kdn-rc-summary>div:last-child{grid-area:act;display:flex!important;flex-wrap:wrap!important;gap:6px!important;justify-content:flex-end!important;padding-top:10px;border-top:1px solid var(--kdn-line)}
  .kdn-rc-top>.kdn-rc-summary>div:last-child button{min-height:36px!important;padding:0 12px!important;font-size:13px!important}
  .kdn-rc-cuts{grid-area:cuts;min-width:0}
  .kdn-rc-nocut{padding:14px;border-radius:12px;background:var(--kdn-surface-2);font-size:13.5px;color:var(--kdn-muted)}
  .kdn-rc-compact{border-left:4px solid var(--kdn-accent)!important}
  .kdn-nrt-row:hover{background:var(--kdn-surface-2)!important}
  /* 광덕고 대입 결과(새 UI) */
  .kdn-case-hero{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;padding:26px 30px;border-radius:24px;background:radial-gradient(700px 260px at 0% 0%,rgba(255,122,61,.28),rgba(255,122,61,0) 70%),linear-gradient(135deg,#17181d 0%,#23201d 100%)!important;color:#f4f1ea;border:1px solid #3a2d24}
  .kdn-case-hero-copy span{font-size:13px;font-weight:700;color:#ffb089;letter-spacing:.05em}
  .kdn-case-hero-copy h2{margin:6px 0 6px;font-size:30px;font-weight:800;letter-spacing:-.02em;color:#ffffff}
  .kdn-case-hero-copy p{margin:0;font-size:14.5px;color:#cfccc5}
  .kdn-case-hero-copy p b{color:#ffffff}
  .kdn-case-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
  @media (max-width:900px){.kdn-case-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
  .kdn-case-kpis>div{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.07)}
  .kdn-case-kpis>div.is-accent{background:rgba(255,122,61,.16)}
  .kdn-case-kpis span{font-size:12.5px;color:#cfccc5}
  .kdn-case-kpis b{font-family:var(--kdn-num-font);font-size:30px;font-weight:800;line-height:1.05;color:#ffffff;font-variant-numeric:tabular-nums}
  .kdn-case-kpis b em{font-style:normal;font-size:16px;margin-left:2px;color:#ffb089}
  .kdn-case-kpis small{font-size:12px;color:#9aa0ab}
  .kdn-case-stack{display:flex;flex-direction:column;gap:8px}
  .kdn-case-stack .bar{display:flex;height:14px;border-radius:999px;overflow:hidden;gap:2px;background:rgba(255,255,255,.08)}
  .kdn-case-stack .bar i{display:block;height:100%}
  .kdn-case-stack .legend{display:flex;gap:16px;flex-wrap:wrap}
  .kdn-case-stack .legend span{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#cfccc5}
  .kdn-case-stack .legend i{width:10px;height:10px;border-radius:3px}
  .kdn-case-stack .legend b{font-family:var(--kdn-num-font);color:#ffffff}
  .kdn-case-stack .legend small{color:#9aa0ab}
  .kdn-case-top{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:14px;align-items:stretch}
  .kdn-case-top>*{margin:0!important;min-width:0}
  @media (max-width:980px){.kdn-case-top{grid-template-columns:minmax(0,1fr)}}
  .kdn-case-tabs{display:flex!important;gap:4px!important;padding:5px!important;border-radius:14px!important;background:var(--kdn-surface-2)!important;border:1px solid var(--kdn-line)}
  .kdn-case-tabs button{flex:1;min-height:44px;font-size:14.5px!important;border-radius:10px!important}
  .kdn-case-tabs button[style*="box-shadow"]{box-shadow:0 1px 3px rgba(20,24,33,.16),inset 0 -3px 0 var(--kdn-accent)!important;color:var(--kdn-accent-text)!important}
  .kdn-case-filterbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 18px;border-radius:16px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kdn-case-filterbar-title{display:inline-flex;align-items:center;gap:8px;color:var(--kdn-ink)}
  .kdn-case-filterbar-title b{font-size:16px;font-weight:800}
  .kdn-case-filterbar-title span{padding:3px 10px;border-radius:999px;background:var(--kdn-accent-soft);color:var(--kdn-accent-text);font-size:12.5px;font-weight:700}
  .kdn-case-filterbar-chips{display:flex;gap:6px;flex-wrap:wrap;flex:1;min-width:0;align-items:center}
  .kdn-case-filterbar-chips em{font-style:normal;padding:4px 10px;border-radius:999px;background:var(--kdn-surface-2);border:1px solid var(--kdn-line);font-size:13px;font-weight:600;color:var(--kdn-ink-soft)}
  .kdn-case-filterbar-chips small{font-size:13px;color:var(--kdn-muted)}
  .kdn-case-reset,.kdn-case-open,.kdn-case-close{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:11px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
  .kdn-case-open{border:0!important;background:var(--kdn-ink)!important;color:var(--kdn-surface)!important}
  .kdn-case-close{float:right;margin:-4px 0 6px 10px}
  .kdn-case-table-toggle>summary{cursor:pointer;font-size:13.5px;font-weight:700;color:var(--kdn-ink-soft);padding:8px 0}
  .kdn-gband{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
  .kdn-gband-legend{display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:13px;color:var(--kdn-ink-soft)}
  .kdn-gband-legend span{display:inline-flex;align-items:center;gap:5px;font-weight:600}
  .kdn-gband-legend i{width:11px;height:11px;border-radius:3px}
  .kdn-gband-legend small{margin-left:auto;color:var(--kdn-muted)}
  .kdn-gband-row{display:grid;grid-template-columns:80px minmax(0,1fr) 84px 96px;gap:12px;align-items:center;padding:6px 0;border-bottom:1px solid var(--kdn-line)}
  .kdn-gband-row .lb{font-size:14.5px;font-weight:800;color:var(--kdn-ink)}
  .kdn-gband-row .tr{display:flex;align-items:center;gap:8px;min-width:0}
  .kdn-gband-row .fill{display:flex;height:18px;border-radius:6px;overflow:hidden;gap:1px;min-width:4px}
  .kdn-gband-row .fill i{display:block;height:100%}
  .kdn-gband-row .tr span{font-family:var(--kdn-num-font);font-size:12.5px;color:var(--kdn-muted);white-space:nowrap}
  .kdn-gband-row .rt,.kdn-gband-row .ct{display:flex;flex-direction:column;align-items:flex-end;line-height:1.15}
  .kdn-gband-row .rt b{font-family:var(--kdn-num-font);font-size:16px;font-weight:800;color:#15803d}
  .kdn-gband-row .ct b{font-family:var(--kdn-num-font);font-size:16px;font-weight:800;color:var(--kdn-ink)}
  .kdn-gband-row small{font-size:11.5px;color:var(--kdn-muted)}
  .kdn-case-strip{display:flex;gap:16px;flex-wrap:wrap;align-items:center;padding:12px 16px;border-radius:14px;background:var(--kdn-surface);border:1px solid var(--kdn-line);font-size:14px;color:var(--kdn-muted)}
  .kdn-case-strip>span{display:inline-flex;align-items:center;gap:6px}
  .kdn-case-strip b{font-family:var(--kdn-num-font);font-size:17px;font-weight:800;color:var(--kdn-ink)}
  .kdn-case-strip button{min-height:30px;padding:0 10px;border-radius:8px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
  .kdn-case-strip button.is-on{background:var(--kdn-ink)!important;color:var(--kdn-surface)!important;border-color:var(--kdn-ink)!important}
  .kdn-case-table-wrap{overflow-x:auto;border-radius:14px;border:1px solid var(--kdn-line)}
  .kdn-case-table{width:100%;min-width:900px;border-collapse:collapse;font-size:14px}
  .kdn-case-table th{padding:11px 12px;text-align:left;font-size:12.5px;font-weight:700;color:var(--kdn-muted);background:var(--kdn-surface-2);border-bottom:1px solid var(--kdn-line);white-space:nowrap}
  .kdn-case-table td{padding:11px 12px;border-bottom:1px solid var(--kdn-line);color:var(--kdn-ink-soft);vertical-align:middle}
  .kdn-case-table tbody tr{cursor:pointer;transition:background .12s}
  .kdn-case-table tbody tr:nth-child(even){background:rgba(100,116,139,.04)}
  .kdn-case-table tbody tr:hover{background:var(--kdn-accent-soft)}
  .kdn-case-table .n{text-align:right;font-family:var(--kdn-num-font);font-variant-numeric:tabular-nums}
  .kdn-case-table td.n b{font-size:15.5px;font-weight:800;color:var(--kdn-ink)}
  .kdn-case-table td.ok{color:#15803d;font-weight:800}.kdn-case-table td.no{color:#b91c1c;font-weight:700}
  .kdn-case-table .uni{display:inline-flex;align-items:center;gap:8px}
  .kdn-case-table .uni b{font-size:15px;font-weight:800;color:var(--kdn-ink)}
  .kdn-case-table .fav{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border-radius:8px;border:1px solid var(--kdn-line);background:var(--kdn-surface);color:var(--kdn-muted);cursor:pointer}
  .kdn-case-table .fav.is-on{color:#e0a000;border-color:#f3d27a}
  .kdn-case-table .rate{display:inline-flex;align-items:center;gap:8px}
  .kdn-case-table .rate i{display:block;width:80px;height:8px;border-radius:999px;background:var(--kdn-surface-2);overflow:hidden}
  .kdn-case-table .rate em{display:block;height:100%;background:#16a34a;border-radius:999px}
  .kdn-case-table .rate small{font-family:var(--kdn-num-font);font-size:12.5px;font-weight:700;color:var(--kdn-ink-soft)}
  .kdn-case-table .go{color:var(--kdn-muted);text-align:right}
  /* 교과 × 학기 성취 지도 */
  .kdn-gh{display:grid;gap:6px;min-width:560px}
  .kdn-gh-corner{display:flex;align-items:flex-end;padding:0 8px 6px;font-size:12px;font-weight:700;color:var(--kdn-muted)}
  .kdn-gh-col{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:10px 8px;border-radius:12px;background:var(--kdn-ink);color:var(--kdn-surface)}
  .kdn-gh-col b{font-size:14.5px;font-weight:800}
  .kdn-gh-col small{font-family:var(--kdn-num-font);font-size:12px;opacity:.75}
  .kdn-gh-row{display:flex;flex-direction:column;justify-content:center;gap:2px;padding:10px 12px;border-radius:12px;background:var(--kdn-surface-2);box-shadow:inset 4px 0 0 var(--c)}
  .kdn-gh-row b{font-size:15px;font-weight:800;color:var(--kdn-ink)}
  .kdn-gh-row small{font-family:var(--kdn-num-font);font-size:12px;color:var(--kdn-muted)}
  .kdn-gh-cell{display:flex;flex-wrap:wrap;align-content:center;gap:5px;padding:8px;border-radius:12px;border:1px solid var(--kdn-line);background:var(--kdn-surface);min-height:46px}
  .kdn-gh-cell.is-empty{justify-content:center;background:repeating-linear-gradient(45deg,var(--kdn-surface-2) 0 6px,var(--kdn-surface) 6px 12px)}
  .kdn-gh-cell.is-empty small{font-size:12px;color:var(--kdn-muted)}
  .kdn-gh-chip{display:inline-flex;align-items:stretch;border-radius:9px;overflow:hidden;font-size:13px;max-width:100%}
  .kdn-gh-chip em{font-style:normal;padding:5px 8px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;background:rgba(255,255,255,.55);color:#1f2430}
  .kdn-gh-chip b{display:flex;align-items:center;padding:5px 9px;font-family:var(--kdn-num-font);font-size:15px;font-weight:800}
  .kdn-gh-chip.l1{background:#e2531a;color:#ffffff}.kdn-gh-chip.l2{background:#f6a37a;color:#3b1505}.kdn-gh-chip.l3{background:#fde3d3;color:#7a2a08}.kdn-gh-chip.l4{background:#e5e7eb;color:#374151}.kdn-gh-chip.l0{background:#f1f5f9;color:#475569;box-shadow:inset 0 0 0 1px #e2e8f0}
  .kdn-uni-panel{display:grid;gap:14px;padding:18px;border-radius:18px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kdn-uni-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .kdn-uni-toolbar>small{font-size:13px;color:var(--kdn-muted);font-family:var(--kdn-num-font)}
  .kdn-uni-search{display:inline-flex;align-items:center;gap:8px;flex:1 1 260px;min-width:0;max-width:420px;height:42px;padding:0 12px;border-radius:12px;border:1px solid var(--kdn-line);background:var(--kdn-surface-2);color:var(--kdn-muted)}
  .kdn-uni-search input{flex:1;min-width:0;border:0!important;outline:0;background:transparent!important;font:inherit;font-size:15px;color:var(--kdn-ink);box-shadow:none!important}
  .kdn-uni-search button{border:0;background:transparent;color:var(--kdn-muted);font-size:18px;cursor:pointer;padding:0 4px}
  .kdn-uni-sort{display:inline-flex;gap:4px;padding:3px;border-radius:11px;background:var(--kdn-surface-2);border:1px solid var(--kdn-line)}
  .kdn-uni-sort button{min-height:34px;padding:0 12px;border-radius:8px;border:0!important;background:transparent;font:inherit;font-size:13px;font-weight:700;color:var(--kdn-muted);cursor:pointer}
  .kdn-uni-sort button.is-on{background:var(--kdn-surface);color:var(--kdn-ink);box-shadow:0 1px 3px rgba(0,0,0,.12)}
  .kdn-uni-clear{margin-left:auto;min-height:34px;padding:0 12px;border-radius:9px;font:inherit;font-size:13px;font-weight:700;color:var(--kdn-accent);background:var(--kdn-accent-soft);cursor:pointer}
  .kdn-uni-table{min-width:760px}
  .kdn-uni-table td:first-child,.kdn-uni-table th:first-child{text-align:left!important}
  .kdn-uni-table tbody tr.is-selected{background:var(--kdn-accent-soft)!important}
  .kdn-uni-chip{padding:2px 8px;border-radius:999px;background:var(--kdn-accent);color:var(--kdn-accent-ink);font-size:11.5px;font-weight:800}
  .kdn-uni-pager{display:flex;align-items:center;justify-content:center;gap:10px;font-size:14px;color:var(--kdn-muted)}
  .kdn-uni-toolbar .kdn-uni-pager{margin-left:auto}
  .kdn-uni-pager b{font-family:var(--kdn-num-font);color:var(--kdn-ink)}
  .kdn-uni-pager button{min-height:32px;padding:0 12px;border-radius:8px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
  .kdn-uni-pager button:disabled{opacity:.4;cursor:default}
  .kdn-uni-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:14px}
  .kdn-uni-card{display:grid;align-content:start;gap:12px;padding:16px;border-radius:14px;border:1px solid var(--kdn-line);background:var(--kdn-surface-2);min-width:0}
  .kdn-uni-card-title{font-size:15px;font-weight:800;color:var(--kdn-ink)}
  .kdn-uni-empty{font-size:14px;color:var(--kdn-muted)}
  .kdn-uni-next{display:flex;justify-content:flex-end}
  .kdn-uni-next button{display:inline-flex;align-items:center;gap:6px;min-height:42px;padding:0 18px;border-radius:12px;font:inherit;font-size:14.5px;font-weight:800;background:var(--kdn-accent)!important;color:var(--kdn-accent-ink)!important;border:0!important;cursor:pointer}
  @media (max-width:640px){.kdn-uni-two{grid-template-columns:1fr}.kdn-uni-panel{padding:12px}.kdn-uni-clear{margin-left:0}}
  .kdn-conn{display:grid;gap:14px;padding:20px;border-radius:20px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kdn-conn-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
  .kdn-conn-head b{display:block;font-size:20px;font-weight:800;color:var(--kdn-ink)}
  .kdn-conn-head span{font-size:14px;color:var(--kdn-muted)}
  .kdn-conn-ghost{min-height:34px;padding:0 12px;border-radius:9px;font:inherit;font-size:13.5px;font-weight:700;background:var(--kdn-surface);color:var(--kdn-ink-soft);cursor:pointer}
  .kdn-conn-bar{display:flex;align-items:stretch;gap:10px;flex-wrap:wrap;padding:12px;border-radius:14px;background:var(--kdn-surface-2);border:1px solid var(--kdn-line)}
  .kdn-conn-seg{display:inline-flex;gap:3px;padding:3px;border-radius:11px;background:var(--kdn-surface);border:1px solid var(--kdn-line);align-self:center}
  .kdn-conn-seg button{min-height:38px;padding:0 14px;border-radius:8px;border:0!important;background:transparent;font:inherit;font-size:14px;font-weight:700;color:var(--kdn-muted);cursor:pointer;white-space:nowrap}
  .kdn-conn-seg.sm button{min-height:32px;font-size:13px;padding:0 11px}
  .kdn-conn-seg button.is-on{background:var(--kdn-ink);color:var(--kdn-surface)}
  .kdn-conn-crit{display:flex;gap:6px;flex-wrap:wrap}
  .kdn-conn-crit span,.kdn-conn-field,.kdn-conn-total{display:flex;flex-direction:column;justify-content:center;gap:2px;padding:6px 12px;border-radius:10px;background:var(--kdn-surface);border:1px solid var(--kdn-line);min-width:0}
  .kdn-conn-crit small,.kdn-conn-field small,.kdn-conn-total small{font-size:11.5px;font-weight:600;color:var(--kdn-muted)}
  .kdn-conn-crit b{font-family:var(--kdn-num-font);font-size:17px;font-weight:800;color:var(--kdn-ink)}
  .kdn-conn-crit b.sm{font-family:inherit;font-size:13px;font-weight:700}
  .kdn-conn-field select{border:0!important;background:transparent!important;font:inherit;font-size:15px;font-weight:800;color:var(--kdn-ink);padding:0;min-width:110px;box-shadow:none!important}
  .kdn-conn-total{margin-left:auto;flex-direction:row;align-items:baseline;gap:5px;background:var(--kdn-accent-soft);border-color:transparent}
  .kdn-conn-total b{font-family:var(--kdn-num-font);font-size:24px;font-weight:800;color:var(--kdn-accent-text)}
  .kdn-conn-total span{font-size:13px;color:var(--kdn-accent-text)}
  .kdn-conn-bands{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .kdn-conn-bands .lb{font-size:13px;font-weight:700;color:var(--kdn-muted);margin-right:4px}
  .kdn-conn-bands>button:not(.kdn-conn-ghost){display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 12px;border-radius:999px;border:1px solid;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer}
  .kdn-conn-bands>button em{font-style:normal;font-family:var(--kdn-num-font);font-size:12px;opacity:.85}
  .kdn-conn-bands>button:disabled{opacity:.45;cursor:default}
  .kdn-conn-src{margin-left:auto;font-size:12.5px;color:var(--kdn-muted)}.kdn-conn-src b{font-family:var(--kdn-num-font);color:var(--kdn-ink-soft)}
  .kdn-conn-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .kdn-conn-search{display:inline-flex;align-items:center;gap:8px;flex:1 1 260px;height:40px;padding:0 12px;border-radius:11px;border:1px solid var(--kdn-line);background:var(--kdn-surface-2);color:var(--kdn-muted)}
  .kdn-conn-search input{flex:1;min-width:0;border:0!important;outline:0;background:transparent!important;font:inherit;font-size:14.5px;color:var(--kdn-ink);box-shadow:none!important}
  .kdn-conn-search button{border:0;background:transparent;color:var(--kdn-muted);cursor:pointer;display:flex}
  .kdn-conn-table{min-width:980px}
  .kdn-conn-table th{padding:11px 14px!important;font-size:12.5px!important;font-weight:700!important;color:var(--kdn-muted)!important}
  .kdn-conn-table td{padding:11px 14px!important;border-bottom:1px solid var(--kdn-line)!important}
  .kdn-conn-table tbody tr:nth-child(even){background:transparent!important}
  .kdn-conn-table tbody tr:hover{background:var(--kdn-surface-2)!important}
  .kdn-conn-table .u{font-size:14.5px!important;font-weight:700!important}
  .kdn-conn-table .d{font-size:13.5px!important;font-weight:500!important}
  .kdn-conn-table td.n b{font-size:15px!important;font-weight:700!important}
  .kdn-conn-table td.n b[style]{font-size:14px!important}
  .kdn-conn-table .kdn-conn-band{display:inline-block;padding:3px 10px!important;border-radius:999px!important;border:1px solid!important;font-size:12.5px!important;font-weight:700!important}
  .kdn-conn-table td:nth-child(7){color:var(--kdn-muted);font-size:13px}
  .kdn-conn-table .kdn-conn-school{border:0!important;background:transparent!important;padding:0!important;gap:7px!important}
  .kdn-conn-table .kdn-conn-school .rate i{width:64px!important;height:7px!important}
  .kdn-conn-table .kdn-conn-school small{min-width:40px;text-align:right;font-family:var(--kdn-num-font);font-weight:700;color:var(--kdn-ink-soft)}
  .kdn-conn-table td.go{width:36px;color:var(--kdn-muted)}
  .kdn-conn-table td{vertical-align:middle}
  .kdn-conn-table .u{display:block;font-size:15px;font-weight:800;color:var(--kdn-ink)}
  .kdn-conn-table .d{display:block;font-size:14px;font-weight:600;color:var(--kdn-ink-soft)}
  .kdn-conn-table .m{font-size:12px;color:var(--kdn-muted)}.kdn-conn-table .warn{font-style:normal;color:#b91c1c;font-weight:700}
  .kdn-conn-table .t{display:block;font-size:13.5px;color:var(--kdn-ink-soft)}
  .kdn-conn-table .src{display:inline-block;margin-top:3px;padding:1px 7px;border-radius:6px;font-size:11.5px;font-weight:700}
  .kdn-conn-table .src.off{background:#e6f4ea;color:#15803d}.kdn-conn-table .src.int{background:#eef2ff;color:#4338ca}
  [data-kd-ui="dark"] .kdn-conn-table .src.off{background:rgba(34,197,94,.14);color:#86efac}[data-kd-ui="dark"] .kdn-conn-table .src.int{background:rgba(129,140,248,.16);color:#c7d2fe}
  .kdn-conn-table tr.is-selected{background:var(--kdn-accent-soft)!important}
  .kdn-conn-table td.fv{width:44px}
  .kdn-conn-school{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:8px;border:1px solid var(--kdn-line)!important;background:var(--kdn-surface);font:inherit;font-size:13px;color:var(--kdn-muted);cursor:pointer;white-space:nowrap}
  .kdn-conn-school b{font-family:var(--kdn-num-font);font-size:14px;color:var(--kdn-ink)}.kdn-conn-school b.ok{color:#15803d}
  .kdn-conn-school .rate i{display:block;width:44px;height:6px;border-radius:99px;background:var(--kdn-surface-2);overflow:hidden}.kdn-conn-school .rate em{display:block;height:100%;background:#16a34a}
  .kdn-conn-school:hover{border-color:var(--kdn-accent)!important;color:var(--kdn-accent-text)}
  .kdn-conn-empty{padding:28px;text-align:center;border-radius:14px;border:1px dashed var(--kdn-line);color:var(--kdn-muted);font-size:14.5px}
  .kdn-conn-note{margin:0;font-size:12.5px;line-height:1.6;color:var(--kdn-muted)}
  .kdn-conn-card{display:grid;gap:10px;padding:14px;border-radius:14px;border:1px solid var(--kdn-line);background:var(--kdn-surface);cursor:pointer}
  .kdn-conn-card:hover{border-color:var(--kdn-accent)}
  .kdn-conn-card .top{display:flex;justify-content:space-between;gap:8px}.kdn-conn-card .top b{display:block;font-size:16px;font-weight:800;color:var(--kdn-ink)}.kdn-conn-card .top span{display:block;font-size:14px;color:var(--kdn-ink-soft)}.kdn-conn-card .top small{font-size:12px;color:var(--kdn-muted)}
  .kdn-conn-card .nums{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.kdn-conn-card .nums span{padding:7px 9px;border-radius:9px;background:var(--kdn-surface-2)}.kdn-conn-card .nums small{display:block;font-size:11.5px;color:var(--kdn-muted)}.kdn-conn-card .nums b{font-family:var(--kdn-num-font);font-size:16px;font-weight:800;color:var(--kdn-ink)}
  .kdn-conn-card .foot{display:flex;justify-content:space-between;align-items:center}
  .kdn-conn-link{border:0;background:transparent;font:inherit;font-size:13px;font-weight:700;color:var(--kdn-accent-text);cursor:pointer}
  .kdn-conn .fav{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border-radius:8px;border:1px solid var(--kdn-line);background:var(--kdn-surface);color:var(--kdn-muted);cursor:pointer}
  .kdn-conn .fav.is-on{color:#e0a000;border-color:#f3d27a}
  @media (max-width:640px){.kdn-conn{padding:12px}.kdn-conn-total{margin-left:0}.kdn-conn-src{margin-left:0;width:100%}}
  .kdn-case-layout-switch{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}
  .kdn-case-layout-switch>span{font-size:13px;font-weight:700;color:var(--kdn-muted)}
  .kdn-case-layout-switch>div{display:inline-flex;gap:3px;padding:3px;border-radius:11px;background:var(--kdn-surface-2);border:1px solid var(--kdn-line)}
  .kdn-case-layout-switch button{min-height:32px;padding:0 13px;border-radius:8px;border:0!important;background:transparent;font:inherit;font-size:13px;font-weight:700;color:var(--kdn-muted);cursor:pointer}
  .kdn-case-layout-switch button.is-on{background:var(--kdn-ink);color:var(--kdn-surface)}
  .kdn-case-a-grid{display:grid;grid-template-columns:230px minmax(0,1fr);gap:18px;align-items:start}
  .kdn-case-a-side{position:sticky;top:76px;display:grid;gap:12px}
  .kdn-case-a-main{display:grid;gap:14px;min-width:0}
  .kdn-case-a-main>*{margin:0!important}
  .kdn-case-a-nav{display:grid;gap:2px;padding:8px;border-radius:16px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kdn-case-a-nav button{display:flex;align-items:center;justify-content:space-between;min-height:44px;padding:0 12px;border-radius:11px;border:0;background:transparent;font:inherit;font-size:14.5px;font-weight:700;color:var(--kdn-ink-soft);cursor:pointer;text-align:left}
  .kdn-case-a-nav button svg{opacity:.35}
  .kdn-case-a-nav button:hover{background:var(--kdn-surface-2)}
  .kdn-case-a-nav button.is-on{background:var(--kdn-accent-soft);color:var(--kdn-accent-text)}.kdn-case-a-nav button.is-on svg{opacity:1}
  .kdn-case-a-cond{display:grid;gap:8px;padding:14px;border-radius:16px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kdn-case-a-cond>b{font-size:13.5px;color:var(--kdn-ink)}
  .kdn-case-a-cond .cnt{display:flex;align-items:baseline;gap:5px}.kdn-case-a-cond .cnt b{font-family:var(--kdn-num-font);font-size:24px;font-weight:800;color:var(--kdn-accent-text)}.kdn-case-a-cond .cnt span{font-size:12.5px;color:var(--kdn-muted)}
  .kdn-case-a-cond .chips{display:flex;flex-wrap:wrap;gap:5px}.kdn-case-a-cond .chips span{padding:3px 9px;border-radius:999px;background:var(--kdn-surface-2);font-size:12px;font-weight:700;color:var(--kdn-ink-soft)}
  .kdn-case-a-cond small{font-size:12.5px;color:var(--kdn-muted)}
  .kdn-case-a-cond>button{justify-self:start;min-height:30px;padding:0 10px;border-radius:8px;font:inherit;font-size:12.5px;font-weight:700;color:var(--kdn-accent-text);background:transparent;cursor:pointer}
  .kdn-case-a-cond .stu{display:grid;gap:2px;padding-top:8px;border-top:1px solid var(--kdn-line)}.kdn-case-a-cond .stu b{font-size:15px;color:var(--kdn-ink)}.kdn-case-a-cond .stu span{font-size:12.5px;color:var(--kdn-muted)}
  @media (max-width:900px){.kdn-case-a-grid{grid-template-columns:minmax(0,1fr)}.kdn-case-a-side{position:static}.kdn-case-a-nav{grid-auto-flow:column;grid-auto-columns:max-content;overflow-x:auto}.kdn-case-a-nav button svg{display:none}}
  .kdn-case-b-step{display:grid;gap:14px;padding:18px;border-radius:20px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kdn-case-b-step>*{margin:0!important}
  .kdn-case-b-step.is-result{padding:14px}
  .kdn-case-b-guide{display:grid;gap:4px;padding:14px 16px;border-radius:14px;background:linear-gradient(160deg,#17181d,#2a221c);color:#f4f1ea}
  .kdn-case-b-guide b{font-size:17px;color:#ffffff}.kdn-case-b-guide span{font-size:13.5px;color:#cfccc5}
  .kdn-case-b-next{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
  .kdn-case-b-next button{min-height:42px;padding:0 18px;border-radius:12px;font:inherit;font-size:14.5px;font-weight:800;cursor:pointer;background:var(--kdn-accent)!important;color:var(--kdn-accent-ink)!important;border:0!important}
  .kdn-case-b-next button.ghost{background:var(--kdn-surface)!important;color:var(--kdn-ink-soft)!important;border:1px solid var(--kdn-line)!important}
  .kdn-case-c-hero{display:grid;gap:14px;padding:26px 28px;border-radius:24px;background:radial-gradient(700px 260px at 0% 0%,rgba(255,122,61,.28),rgba(255,122,61,0)),linear-gradient(160deg,#17181d,#2a221c);color:#f4f1ea}
  .kdn-case-c-copy span{font-size:13px;font-weight:700;color:#ffb089}
  .kdn-case-c-copy h2{margin:4px 0;font-size:26px;font-weight:800;color:#ffffff}
  .kdn-case-c-copy small{font-size:13.5px;color:#cfccc5}
  .kdn-case-c-search{display:flex;align-items:center;gap:10px;height:56px;padding:0 18px;border-radius:15px;background:#ffffff;color:#5d6574}
  .kdn-case-c-search input{flex:1;min-width:0;border:0!important;outline:0;background:transparent!important;font:inherit;font-size:18px;font-weight:600;color:#1f2430!important;box-shadow:none!important}
  .kdn-case-c-search button{border:0;background:transparent;color:#5d6574;font-size:22px;cursor:pointer}
  .kdn-case-c-results{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
  .kdn-case-c-results>div{display:grid;align-content:start;gap:4px;padding:10px;border-radius:14px;background:rgba(255,255,255,.06)}
  .kdn-case-c-results small,.kdn-case-c-chips small{font-size:12.5px;font-weight:700;color:#ffb089;padding:2px 6px}
  .kdn-case-c-results button{display:flex;justify-content:space-between;gap:10px;align-items:baseline;padding:9px 10px;border-radius:10px;border:0;background:transparent;font:inherit;text-align:left;cursor:pointer;color:#f4f1ea}
  .kdn-case-c-results button:hover{background:rgba(255,255,255,.1)}
  .kdn-case-c-results button b{font-size:15px;font-weight:700}.kdn-case-c-results button span{font-size:12.5px;color:#cfccc5;white-space:nowrap}
  .kdn-case-c-results em{font-style:normal;font-size:13px;color:#a8a49c;padding:6px}
  .kdn-case-c-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
  .kdn-case-c-chips button{min-height:32px;padding:0 12px;border-radius:999px;border:0;background:#2e3040;color:#f4f1ea;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
  .kdn-case-c-chips button:hover{background:#e2531a}
  .kdn-case-c-tabs{display:flex;gap:6px;flex-wrap:wrap;padding-top:12px;border-top:1px solid rgba(255,255,255,.12)}
  .kdn-case-c-tabs button{min-height:36px;padding:0 14px;border-radius:10px;border:0;background:transparent;color:#cfccc5;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
  .kdn-case-c-tabs button.is-on{background:#ffffff;color:#1f2430}
  .kdn-case-c-more{border-radius:16px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kdn-case-c-more>summary{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:14px 18px;font-size:14.5px;font-weight:700;color:var(--kdn-ink);cursor:pointer}
  .kdn-case-c-more>summary span{font-size:13px;font-weight:600;color:var(--kdn-muted)}
  .kdn-case-c-more-body{display:grid;gap:14px;padding:0 14px 14px}.kdn-case-c-more-body>*{margin:0!important}
  .admission-case-ui .admission-quick-filter{background:var(--kdn-surface)!important;border:1px solid var(--kdn-line)!important;border-radius:16px!important}
  .admission-case-ui .admission-quick-filter-group{background:var(--kdn-surface-2)!important;border-color:var(--kdn-line)!important}
  .admission-case-ui .admission-filter-chip{min-height:36px!important;border-radius:999px!important;background:var(--kdn-surface)!important;color:var(--kdn-ink-soft)!important;border:1px solid var(--kdn-line)!important;font-weight:700!important;box-shadow:none!important}
  .admission-case-ui .admission-filter-chip.is-active{background:var(--kdn-ink)!important;color:var(--kdn-surface)!important;border-color:var(--kdn-ink)!important}
  .admission-case-ui .admission-quick-filter-note{color:var(--kdn-muted)!important;font-size:12.5px!important}
  .kdn-minb{display:grid;gap:12px}
  .kdn-minb-sum{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px}
  .kdn-minb-sum button{display:grid;gap:2px;min-width:110px;padding:10px 14px;border-radius:14px;border:1px solid var(--kdn-line);background:var(--kdn-surface);text-align:left;font:inherit;cursor:pointer}
  .kdn-minb-sum button small{font-size:12.5px;font-weight:700;color:var(--kdn-muted)}
  .kdn-minb-sum button b{font-family:var(--kdn-num-font);font-size:22px;font-weight:800;color:var(--kdn-ink)}
  .kdn-minb-sum button.ok b{color:#15803d}.kdn-minb-sum button.no b{color:#b91c1c}.kdn-minb-sum button.rv b{color:#a16207}
  .kdn-minb-sum button.is-on{border-color:var(--kdn-accent);box-shadow:0 0 0 2px var(--kdn-accent-soft);background:var(--kdn-accent-soft)}
  .kdn-minb-sum .hint{align-self:center;font-size:12.5px;color:var(--kdn-muted);margin-left:4px}
  .kdn-minb-uni{border:1px solid var(--kdn-line);border-radius:16px;background:var(--kdn-surface);overflow:hidden}
  .kdn-minb-uni>header{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 16px;background:var(--kdn-surface-2);border-bottom:1px solid var(--kdn-line)}
  .kdn-minb-uni>header>b{font-size:16px;font-weight:800;color:var(--kdn-ink)}
  .kdn-minb-uni>header .rg{padding:2px 9px;border-radius:999px;background:var(--kdn-surface);border:1px solid var(--kdn-line);font-size:12px;font-weight:700;color:var(--kdn-ink-soft)}
  .kdn-minb-uni>header .ct{font-size:13px;color:var(--kdn-muted)}.kdn-minb-uni>header .ct b{color:#15803d;font-family:var(--kdn-num-font)}
  .kdn-minb-uni>header .cs{margin-left:auto;border:0;background:transparent;font:inherit;font-size:13px;font-weight:700;color:var(--kdn-accent-text);cursor:pointer}
  .kdn-minb-row{border-top:1px solid var(--kdn-line)}
  .kdn-minb-row:first-of-type{border-top:0}
  .kdn-minb-row .line{display:grid;grid-template-columns:34px minmax(170px,1.25fr) minmax(150px,1fr) minmax(240px,1.25fr) 122px 112px;gap:12px;align-items:center;padding:9px 14px}
  .kdn-minb-row.s-unsatisfied .line{box-shadow:inset 3px 0 0 #dc2626}
  .kdn-minb-row.s-satisfied .line,.kdn-minb-row.s-no-minimum .line{box-shadow:inset 3px 0 0 #16a34a}
  .kdn-minb-row .fav{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border-radius:8px;border:1px solid var(--kdn-line);background:var(--kdn-surface);color:var(--kdn-muted);cursor:pointer}
  .kdn-minb-row .fav.is-on{color:#e0a000;border-color:#f3d27a}
  .kdn-minb-row .dep{display:grid;gap:1px;min-width:0}.kdn-minb-row .dep b{font-size:14.5px;font-weight:800;color:var(--kdn-ink)}.kdn-minb-row .dep span{font-size:13px;color:var(--kdn-ink-soft)}.kdn-minb-row .dep small{font-size:11.5px;color:var(--kdn-muted)}
  .kdn-minb-row .subj{min-width:0;font-size:12.5px}
  .kdn-minb-row .cmp{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .kdn-minb-row .cmp .need,.kdn-minb-row .cmp .mine{display:grid;gap:0;padding:4px 10px;border-radius:9px}
  .kdn-minb-row .cmp .need{background:#fff7e6;color:#8a5a12}.kdn-minb-row .cmp .mine{background:#eef4ff;color:#2b5588}
  .kdn-minb-row .cmp small{font-size:10.5px;font-weight:700;opacity:.85}.kdn-minb-row .cmp b{font-family:var(--kdn-num-font);font-size:15px;font-weight:800}
  .kdn-minb-row .cmp .arrow{color:var(--kdn-muted);font-size:13px}
  .kdn-minb-row .cmp em{font-style:normal;font-size:12.5px;font-weight:800;padding:2px 8px;border-radius:999px}.kdn-minb-row .cmp em.up{background:#e6f4ea;color:#15803d}.kdn-minb-row .cmp em.down{background:#fdecea;color:#b91c1c}
  .kdn-minb-row .cmp .none{font-size:13px;font-weight:700;color:var(--kdn-muted)}
  .kdn-minb-row .mt{color:var(--kdn-muted)}
  .kdn-minb-row .st{justify-self:start;padding:4px 10px!important;border-radius:999px!important;font-size:12.5px!important;font-weight:800!important;white-space:nowrap}
  .kdn-minb-row .act{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}
  .kdn-minb-row .more{min-height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--kdn-line);background:var(--kdn-surface);font:inherit;font-size:12.5px;font-weight:700;color:var(--kdn-ink-soft);cursor:pointer}
  .kdn-minb-row.is-open .more{background:var(--kdn-ink);color:var(--kdn-surface);border-color:var(--kdn-ink)}
  .kdn-minb-row .detail{display:flex;flex-wrap:wrap;gap:6px 14px;padding:10px 16px 12px 60px;background:var(--kdn-surface-2);font-size:13px;line-height:1.55;color:var(--kdn-ink-soft)}
  .kdn-minb-row .detail span{max-width:100%;overflow-wrap:anywhere}.kdn-minb-row .detail .src{color:var(--kdn-muted)}.kdn-minb-row .detail .adv{color:#a16207;font-weight:700}.kdn-minb-row .detail .elg{color:#9c5a1d}
  .kdn-minb-pager{display:flex;align-items:center;justify-content:center;gap:10px;font-size:13.5px;color:var(--kdn-muted)}.kdn-minb-pager b{color:var(--kdn-ink)}
  .kdn-minb-pager button{min-height:32px;padding:0 12px;border-radius:8px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.kdn-minb-pager button:disabled{opacity:.4}
  [data-kd-ui="dark"] .kdn-minb-row .cmp .need{background:rgba(245,158,11,.16);color:#fcd27a}
  [data-kd-ui="dark"] .kdn-minb-row .cmp .mine{background:rgba(96,165,250,.16);color:#a9c8ff}
  [data-kd-ui="dark"] .kdn-minb-row .cmp em.up{background:rgba(34,197,94,.16);color:#86efac}
  [data-kd-ui="dark"] .kdn-minb-row .cmp em.down{background:rgba(239,68,68,.18);color:#fca5a5}
  @media (max-width:900px){.kdn-minb-row .line{grid-template-columns:30px minmax(0,1fr) auto;row-gap:6px}.kdn-minb-row .subj,.kdn-minb-row .cmp{grid-column:2/-1}.kdn-minb-row .act{grid-column:2/-1;justify-content:flex-start}.kdn-minb-row .detail{padding-left:16px}}
  .kd-consult-body{display:grid;gap:14px;align-items:start}
  .kd-consult-body>*{min-width:0;margin:0!important}
  .kd-consult-body.is-workbench{grid-template-columns:minmax(0,1.45fr) minmax(360px,1fr)}
  .kd-consult-body.is-workbench>.counseling-print-notes{position:sticky;top:76px;max-height:calc(100vh - 96px);overflow:auto}
  .kd-consult-body.is-timeline{grid-template-columns:280px minmax(0,1fr);grid-template-areas:"side notes" "fav fav"}
  .kd-consult-body.is-timeline>.kd-consult-side{grid-area:side;position:sticky;top:76px}
  .kd-consult-body.is-timeline>.counseling-print-notes{grid-area:notes}
  .kd-consult-body.is-timeline>.counseling-print-favorites{grid-area:fav}
  .kd-consult-body.is-board{grid-template-columns:minmax(0,1.45fr) minmax(340px,1fr)}
  @media (max-width:1000px){.kd-consult-body.is-workbench,.kd-consult-body.is-board{grid-template-columns:minmax(0,1fr)}.kd-consult-body.is-workbench>.counseling-print-notes{position:static;max-height:none}.kd-consult-body.is-timeline{grid-template-columns:minmax(0,1fr);grid-template-areas:"side" "notes" "fav"}.kd-consult-body.is-timeline>.kd-consult-side{position:static}}
  .kd-consult-side{display:grid;gap:12px}
  .kd-consult-side>section{display:grid;gap:8px;padding:14px;border-radius:16px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kd-consult-side b{font-size:14.5px;color:var(--kdn-ink)}
  .kd-consult-side small{font-size:12.5px;color:var(--kdn-muted)}
  .kd-consult-side p{margin:0;font-size:13.5px;line-height:1.6;color:var(--kdn-ink-soft)}
  .kd-consult-side .slots{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}.kd-consult-side .slots i{height:10px;border-radius:4px;background:var(--kdn-surface-2);border:1px solid var(--kdn-line)}
  .kd-consult-side .slots i.is-on{background:#3b82f6;border-color:#3b82f6}.kd-consult-side .slots i.is-h{background:#a855f7;border-color:#a855f7}
  .kd-consult-side .chips{display:flex;flex-wrap:wrap;gap:5px}.kd-consult-side .chips span{padding:3px 9px;border-radius:999px;background:var(--kdn-surface-2);font-size:12px;font-weight:700;color:var(--kdn-ink-soft)}
  .kd-consult-side button{justify-self:start;min-height:30px;padding:0 10px;border-radius:8px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
  .kd-consult-side .links{display:flex;gap:6px;flex-wrap:wrap}
  .kd-consult-todo{display:grid;gap:8px;padding:14px;border-radius:16px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kd-consult-todo>b{font-size:14.5px;color:var(--kdn-ink)}.kd-consult-todo>b small{font-size:12px;font-weight:700;color:var(--kdn-accent-text);margin-left:6px}
  .kd-consult-todo>small{font-size:12.5px;color:var(--kdn-muted)}.kd-consult-todo .err{color:#b91c1c}
  .kd-consult-todo ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
  .kd-consult-todo li{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;background:var(--kdn-surface-2)}
  .kd-consult-todo li label{display:flex;align-items:center;gap:8px;flex:1;min-width:0;font-size:13.5px;color:var(--kdn-ink);cursor:pointer}
  .kd-consult-todo li input{width:16px;height:16px;accent-color:var(--kdn-accent);flex:none}
  .kd-consult-todo li.is-done label span{color:var(--kdn-muted);text-decoration:line-through}
  .kd-consult-todo li button{border:0;background:transparent;color:var(--kdn-muted);cursor:pointer;font-size:12px}
  .kd-consult-todo .add{display:flex;gap:6px}
  .kd-consult-todo .add input{flex:1;min-width:0;height:34px;padding:0 10px;border-radius:9px;border:1px solid var(--kdn-line);background:var(--kdn-surface-2);font:inherit;font-size:13.5px;color:var(--kdn-ink)}
  .kd-consult-todo .add button{min-height:34px;padding:0 12px;border-radius:9px;font:inherit;font-size:13px;font-weight:800;background:var(--kdn-accent)!important;color:var(--kdn-accent-ink)!important;border:0!important;cursor:pointer}
  .kd-consult-todo .add button:disabled{opacity:.45}
  .kd-consult-todo-row .kd-consult-todo{grid-template-columns:auto minmax(0,1fr) minmax(260px,auto);align-items:center}
  .kd-consult-todo-row .kd-consult-todo ul{display:flex;flex-wrap:wrap}
  @media (max-width:900px){.kd-consult-todo-row .kd-consult-todo{grid-template-columns:minmax(0,1fr)}}
  .kd-consult-board{display:grid;gap:12px;padding:16px;border-radius:20px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kd-consult-board>header{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.kd-consult-board>header b{font-size:17px;color:var(--kdn-ink)}.kd-consult-board>header span{font-size:13px;color:var(--kdn-muted)}
  .kd-consult-board>header button{margin-left:auto;min-height:32px;padding:0 12px;border-radius:9px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
  .kd-consult-board .slots{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
  .kd-consult-board .slot{display:grid;align-content:start;gap:3px;min-height:118px;padding:11px 12px;border-radius:14px;border:1px solid var(--kdn-line);background:var(--kdn-surface-2)}
  .kd-consult-board .slot.t-교과{background:rgba(59,130,246,.08);border-color:rgba(59,130,246,.35)}
  .kd-consult-board .slot.t-종합{background:rgba(168,85,247,.08);border-color:rgba(168,85,247,.35)}
  .kd-consult-board .slot .top{display:flex;align-items:center;gap:6px}
  .kd-consult-board .slot .top b{font-family:var(--kdn-num-font);font-size:13px;color:var(--kdn-muted)}
  .kd-consult-board .slot .top em{font-style:normal;font-size:11.5px;font-weight:800;padding:1px 7px;border-radius:999px;background:var(--kdn-surface);color:var(--kdn-ink-soft)}
  .kd-consult-board .slot .top button{margin-left:auto;width:24px;height:24px;border-radius:7px;border:1px solid var(--kdn-line);background:var(--kdn-surface);color:var(--kdn-muted);cursor:pointer;font-size:12px}
  .kd-consult-board .slot strong{font-size:15px;font-weight:800;color:var(--kdn-ink);line-height:1.3}
  .kd-consult-board .slot span{font-size:13.5px;color:var(--kdn-ink-soft)}.kd-consult-board .slot small{font-size:12px;color:var(--kdn-muted)}
  .kd-consult-board .slot.is-empty{border:2px dashed var(--kdn-line);background:transparent;justify-items:center;align-content:center;text-align:center}
  .kd-consult-board .slot.is-empty b{font-family:var(--kdn-num-font);font-size:13px;color:var(--kdn-muted)}
  .kd-consult-board .pool{display:grid;gap:8px;padding-top:12px;border-top:1px solid var(--kdn-line)}
  .kd-consult-board .pool>b{font-size:14.5px;color:var(--kdn-ink)}.kd-consult-board .pool>small{font-size:13px;color:var(--kdn-muted)}
  .kd-consult-board .pool .chips{display:flex;flex-wrap:wrap;gap:8px}
  .kd-consult-board .pool button{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 6px 0 12px;border-radius:999px;border:1px solid var(--kdn-line);background:var(--kdn-surface-2);font:inherit;font-size:13.5px;font-weight:700;color:var(--kdn-ink);cursor:pointer}
  .kd-consult-board .pool button small{font-size:12px;color:var(--kdn-muted);font-weight:600}
  .kd-consult-board .pool button em{font-style:normal;padding:3px 9px;border-radius:999px;background:var(--kdn-accent);color:var(--kdn-accent-ink);font-size:12px;font-weight:800}
  .kd-consult-board .pool button:disabled{opacity:.5;cursor:default}
  .kd-consult-board .err{padding:8px 12px;border-radius:10px;background:#fdecea;color:#b91c1c;font-size:13px}
  @media (max-width:1000px){.kd-consult-board .slots{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media (max-width:560px){.kd-consult-board .slots{grid-template-columns:repeat(2,minmax(0,1fr))}}
  .kdn-cs-table{min-width:900px}
  .admission-case-ui .kdn-cs-table th,.admission-case-ui .kdn-cs-table td{text-align:left!important;border-left:0!important;border-right:0!important;vertical-align:middle}
  .admission-case-ui .kdn-cs-table th.n,.admission-case-ui .kdn-cs-table td.n{text-align:right!important}
  .kdn-cs-table tbody tr{cursor:default}
  .kdn-cs-table td{padding:9px 12px}
  .kdn-cs-table td.fv{width:44px}
  .kdn-cs-table .fav{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border-radius:8px;border:1px solid var(--kdn-line);background:var(--kdn-surface);color:var(--kdn-muted);cursor:pointer}
  .kdn-cs-table .fav.is-on{color:#e0a000;border-color:#f3d27a}
  .kdn-cs-table .u{display:block;font-size:14.5px;font-weight:800;color:var(--kdn-ink)}
  .kdn-cs-table .d{display:block;font-size:13.5px;font-weight:600;color:var(--kdn-ink-soft)}
  .kdn-cs-table .m{display:block;font-size:12px;color:var(--kdn-muted)}
  .kdn-cs-table .t{display:block;font-size:13.5px;font-weight:700;color:var(--kdn-ink-soft)}
  .kdn-cs-table td.n{text-align:right}
  .kdn-cs-table .g{display:block;font-family:var(--kdn-num-font);font-size:17px;font-weight:800;color:var(--kdn-ink)}
  .kdn-cs-table .kdn-cs-band{display:inline-block;margin-top:3px;font-size:11.5px!important}
  .kdn-cs-table td.sub span{display:block;font-family:var(--kdn-num-font);font-size:13.5px;font-weight:700;color:var(--kdn-ink-soft)}
  .kdn-cs-table td.sub small{font-family:inherit;font-size:11px;font-weight:600;color:var(--kdn-muted);margin-right:5px}
  .kdn-cs-result{display:inline-block;padding:3px 10px;border-radius:999px;border:1px solid;font-size:12.5px;font-weight:800;white-space:nowrap}
  .kdn-cs-table .reg{display:block;margin-top:3px;font-size:12px;font-weight:700}
  .kdn-cs-table td.act{white-space:nowrap}
  .kdn-cs-btn{min-height:30px;padding:0 10px;margin-right:4px;border-radius:8px;border:1px solid var(--kdn-line);background:var(--kdn-surface);font:inherit;font-size:12.5px;font-weight:800;color:var(--kdn-ink-soft);cursor:pointer}
  .kdn-cs-btn.is-accent{background:var(--kdn-accent-soft);color:var(--kdn-accent-text);border-color:transparent}
  .kdn-cs-btn:hover{border-color:var(--kdn-accent)}
  .admission-case-ui .admission-case-search-actions{display:flex!important;flex-wrap:wrap!important;align-items:stretch!important;gap:8px!important}
  .admission-case-ui .admission-case-search-actions>*{flex:1 1 auto;min-width:0}
  .admission-case-ui .admission-case-range-filter{flex:0 1 auto;overflow:visible!important;flex-wrap:nowrap!important}
  .admission-case-ui .admission-case-sort-control{flex:1 1 200px}
  .admission-case-ui .admission-case-print-control{flex:0 0 auto!important}
  .admission-case-ui .admission-case-print-control{display:flex!important;align-items:center!important;gap:8px!important;min-width:0}
  .admission-case-ui .admission-case-print-control label{flex:1 1 auto;min-width:96px}
  .admission-case-ui .admission-case-print-control select{min-width:88px;font-size:13px!important;padding-right:22px!important}
  .admission-case-ui .admission-case-print-control .admission-case-print-button{flex:none;width:auto!important;white-space:nowrap;font-size:12.5px!important}
  .admission-case-ui .admission-case-compact-control>span,.admission-case-ui .admission-case-compact-control label>span{font-size:11.5px!important}
  body{padding-bottom:120px}
  .kd-history-edge{top:auto!important;bottom:20px!important;transform:none!important;width:40px!important;height:40px!important;border-radius:999px!important;box-shadow:0 4px 14px rgba(20,24,33,.12)}
  .kd-history-edge-left{left:18px!important}.kd-history-edge-right{left:64px!important;right:auto!important}
  @media print{body{padding-bottom:0}}
  .kdn-tz{display:grid;gap:14px}
  .kdn-tz-hero{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:18px 22px;border-radius:20px;background:radial-gradient(420px 160px at 100% 0%,rgba(226,83,26,.35),transparent),linear-gradient(160deg,#17181d,#2a221c);color:#f4f1ea}
  .kdn-tz-hero .av{width:46px;height:46px;border-radius:14px;background:#e2531a;color:#fff;display:grid;place-items:center;flex:none}
  .kdn-tz-hero small{display:block;font-size:13px;font-weight:700;color:#ffb089}
  .kdn-tz-hero b{display:block;font-size:21px;font-weight:800;color:#ffffff;line-height:1.35}
  .kdn-tz-hero button{margin-left:auto;min-height:42px;padding:0 18px;border-radius:12px;border:0!important;background:#e2531a!important;color:#fff!important;font:inherit;font-size:14.5px;font-weight:800;cursor:pointer}
  .kdn-tz-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
  @media (max-width:1000px){.kdn-tz-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media (max-width:640px){.kdn-tz-grid{grid-template-columns:minmax(0,1fr)}.kdn-tz-hero button{margin-left:0}}
  .kdn-tz-card{position:relative;display:flex;flex-direction:column;gap:10px;padding:20px 18px 18px;border-radius:18px;background:var(--kdn-surface);border:1px solid var(--kdn-line);overflow:hidden}
  .kdn-tz-card::before{content:"";position:absolute;inset:0 0 auto 0;height:5px;background:var(--a)}
  .kdn-tz-card.is-last{border-color:var(--a);box-shadow:0 10px 26px rgba(20,24,33,.10)}
  .kdn-tz-card .top{display:flex;align-items:center;gap:10px}
  .kdn-tz-card .ic{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:var(--s);color:var(--a);flex:none}
  .kdn-tz-card h4{margin:0;font-size:17px;font-weight:800;color:var(--kdn-ink)}
  .kdn-tz-card .tag{margin-left:auto;padding:3px 10px;border-radius:999px;border:1.5px solid var(--a);color:var(--a);background:var(--kdn-surface);font-size:12px;font-weight:800;white-space:nowrap}
  .kdn-tz-card p{margin:0;font-size:14px;line-height:1.6;color:var(--kdn-ink-soft)}
  .kdn-tz-card ul{margin:0;padding:10px 12px;list-style:none;display:grid;gap:5px;border-radius:12px;background:var(--kdn-surface-2);border:1px solid var(--kdn-line)}
  .kdn-tz-card li{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--kdn-ink-soft)}
  .kdn-tz-card li::before{content:"";width:6px;height:6px;border-radius:99px;background:var(--a);flex:none}
  .kdn-tz-card .acts{margin-top:auto;display:flex;gap:6px}
  .kdn-tz-card .acts .p{min-height:38px;padding:0 14px;border-radius:10px;border:0!important;background:var(--a)!important;color:#fff!important;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer}
  [data-kd-ui="dark"] .kdn-tz-card .ic{background:rgba(255,255,255,.06);color:#f4f1ea}
  [data-kd-ui="dark"] .kdn-tz-card .tag{color:#f4f1ea}
  .kdn-ttb-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start;margin-top:6px}
  .kdn-ttb{display:grid;gap:10px;padding:14px;border-radius:18px;background:var(--kdn-surface);border:1px solid var(--kdn-line);min-width:0}
  .kdn-ttb-grid{display:grid;grid-template-columns:58px repeat(5,minmax(0,1fr));gap:6px}
  .kdn-ttb-dh{display:flex;align-items:center;justify-content:center;gap:6px;height:36px;border-radius:10px;background:var(--kdn-surface-2);font-size:14px;font-weight:700;color:var(--kdn-muted)}
  .kdn-ttb-dh.is-today{background:var(--kdn-ink);color:var(--kdn-surface)}
  .kdn-ttb-dh span{padding:1px 8px;border-radius:999px;background:#e2531a;color:#fff;font-size:11px;font-weight:800}
  .kdn-ttb-pt{display:grid;align-content:center;justify-items:center}.kdn-ttb-pt b{font-size:15px;font-weight:800;color:var(--kdn-ink)}.kdn-ttb-pt small{font-size:11px;color:var(--kdn-muted);font-family:var(--kdn-num-font)}
  .kdn-ttb-cell{position:relative;display:grid;align-content:center;gap:2px;min-height:64px;padding:6px 10px 6px 12px;border-radius:12px;background:var(--bg);border-left:4px solid var(--fg);min-width:0}
  .kdn-ttb-cell b{font-size:14px;font-weight:800;color:var(--fg);line-height:1.3;word-break:keep-all}
  .kdn-ttb-cell small{font-size:11.5px;color:#5d6574;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .kdn-ttb-cell em{position:absolute;top:6px;right:7px;font-style:normal;font-size:10.5px;font-weight:800;padding:1px 6px;border-radius:999px;background:#ffffff;color:var(--fg)}
  .kdn-ttb-cell i{position:absolute;bottom:6px;right:7px;font-style:normal;font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:999px;background:#e2531a;color:#fff}
  .kdn-ttb-cell .mv{display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-width:0}
  .kdn-ttb-cell .mv .g{font-size:11.5px;font-weight:600;color:#5d6574}
  .kdn-ttb-cell .mv .rm{padding:1px 7px;border-radius:6px;background:#ffffff;border:1px solid var(--fg);color:var(--fg);font-size:12px;font-weight:800;white-space:nowrap}
  .kdn-ttb-cell .mv .rm.go{background:var(--fg);color:#ffffff}
  [data-kd-ui="dark"] .kdn-ttb-cell .mv .g{color:#b8b4ac}
  [data-kd-ui="dark"] .kdn-ttb-cell .mv .rm{background:#18191d;color:color-mix(in srgb,var(--fg) 45%,#ffffff);border-color:color-mix(in srgb,var(--fg) 60%,#ffffff)}
  [data-kd-ui="dark"] .kdn-ttb-cell .mv .rm.go{background:color-mix(in srgb,var(--fg) 70%,#ffffff);color:#111215}
  .kdn-ttb-cell.is-empty{background:repeating-linear-gradient(135deg,var(--kdn-surface-2) 0 6px,transparent 6px 12px);border-left:4px solid var(--kdn-line)}
  .kdn-ttb-cell.is-today{box-shadow:inset 0 0 0 1px rgba(226,83,26,.22)}
  .kdn-ttb-cell.is-past{opacity:.45}
  .kdn-ttb-cell.is-now{outline:3px solid #e2531a;outline-offset:1px;box-shadow:0 8px 20px rgba(226,83,26,.25)}
  .kdn-ttb-legend{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--kdn-muted)}
  .kdn-ttb-legend span{display:inline-flex;align-items:center;gap:5px}.kdn-ttb-legend i{width:12px;height:12px;border-radius:3px;border-left:3px solid}
  .kdn-ttb-legend .r{margin-left:auto}
  [data-kd-ui="dark"] .kdn-ttb-cell:not(.is-empty){background:color-mix(in srgb,var(--fg) 20%,#18191d)}
  [data-kd-ui="dark"] .kdn-ttb-cell b{color:color-mix(in srgb,var(--fg) 45%,#ffffff)}
  [data-kd-ui="dark"] .kdn-ttb-cell small{color:#b8b4ac}
  [data-kd-ui="dark"] .kdn-ttb-cell em{background:#18191d;color:color-mix(in srgb,var(--fg) 45%,#ffffff)}
  .kdn-ttb-side{display:grid;gap:12px;position:sticky;top:76px}
  .kdn-ttl{display:grid;gap:8px;padding:18px;border-radius:18px;background:radial-gradient(260px 140px at 100% 0%,rgba(226,83,26,.45),transparent),linear-gradient(160deg,#17181d,#2a221c);color:#f4f1ea}
  .kdn-ttl .k{display:flex;align-items:center;gap:8px}.kdn-ttl .k span{padding:2px 9px;border-radius:999px;font-size:12px;font-weight:800}.kdn-ttl .k .live{background:#e2531a;color:#fff}.kdn-ttl .k .next{background:#2e3040;color:#f4f1ea}
  .kdn-ttl .k small{font-size:12.5px;font-weight:700;color:#ffb089}
  .kdn-ttl>b{font-size:26px;font-weight:800;color:#ffffff;line-height:1.2}
  .kdn-ttl .pl{font-size:14px;color:#cfccc5}
  .kdn-ttl .bar{height:8px;border-radius:99px;background:rgba(255,255,255,.15);overflow:hidden}.kdn-ttl .bar i{display:block;height:100%;background:linear-gradient(90deg,#ff9a66,#e2531a)}
  .kdn-ttl .ft{display:flex;justify-content:space-between;font-size:12.5px;color:#cfccc5}.kdn-ttl .ft b{color:#ffffff}
  .kdn-ttl.is-off>b{font-size:18px}.kdn-ttl.is-off small{font-size:12.5px;font-weight:700;color:#ffb089}.kdn-ttl.is-off span{font-size:13px;color:#cfccc5}
  .kdn-ttr{display:grid;gap:9px;padding:14px 16px;border-radius:18px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kdn-ttr .h{font-size:14.5px;font-weight:800;color:var(--kdn-ink)}
  .kdn-ttr .row{display:grid;grid-template-columns:44px 12px minmax(0,1fr);gap:8px;align-items:center;font-size:13.5px;color:var(--kdn-ink-soft)}
  .kdn-ttr .row b{font-size:12.5px;color:var(--kdn-muted)}
  .kdn-ttr .row i{width:12px;height:12px;border-radius:99px;border:3px solid var(--kdn-line);background:var(--kdn-surface)}
  .kdn-ttr .row span{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .kdn-ttr .row small{font-size:12px;color:var(--kdn-muted)}
  .kdn-ttr .row em{font-style:normal;padding:1px 7px;border-radius:7px;background:#dff4f7;color:#0e7490;font-size:12px;font-weight:700}
  [data-kd-ui="dark"] .kdn-ttr .row em{background:rgba(14,116,144,.25);color:#9be3ef}
  .kdn-ttr .row.done{opacity:.5}.kdn-ttr .row.done i{background:var(--kdn-line)}
  .kdn-ttr .row.cur b{color:#c2410c}.kdn-ttr .row.cur i{border-color:#e2531a;background:#e2531a;box-shadow:0 0 0 4px rgba(226,83,26,.18)}
  @media print{
    html,body{background:#ffffff!important}
    .kdn-ttb-printwrap{margin-top:3mm}
    .student-timetable-card{background:#ffffff!important;color:#1f2430!important;border-color:#e3e6ec!important;box-shadow:none!important}
    .student-timetable-card .timetable-print-header,.student-timetable-card .timetable-print-header *{color:#1f2430!important;background:transparent!important}
    .student-timetable-card .timetable-print-meta,.student-timetable-card .timetable-print-class{color:#5d6574!important}
    .kdn-ttb.is-print{padding:0!important;border:0!important;border-radius:0!important;gap:2mm!important;background:#ffffff!important}
    .kdn-ttb.is-print *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    .kdn-ttb.is-print .kdn-ttb-grid{grid-template-columns:13mm repeat(5,minmax(0,1fr))!important;gap:1.4mm!important}
    .kdn-ttb.is-print .kdn-ttb-dh{height:8mm!important;font-size:10pt!important;background:#f1f3f6!important;color:#1f2430!important}
    .kdn-ttb.is-print .kdn-ttb-pt b{font-size:11pt!important;color:#1f2430!important}.kdn-ttb.is-print .kdn-ttb-pt small{font-size:7.5pt!important;color:#5d6574!important}
    .kdn-ttb.is-print .kdn-ttb-cell{min-height:18mm!important;padding:1.4mm 2mm 1.4mm 2.6mm!important;border-radius:2.4mm!important;box-shadow:none!important;outline:0!important;opacity:1!important;break-inside:avoid}
    .kdn-ttb.is-print .kdn-ttb-cell:not(.is-empty){background:var(--bg)!important}
    .kdn-ttb.is-print .kdn-ttb-cell b{font-size:10.5pt!important;color:var(--fg)!important}
    .kdn-ttb.is-print .kdn-ttb-cell small,.kdn-ttb.is-print .kdn-ttb-cell .mv .g{font-size:7.5pt!important;color:#5d6574!important}
    .kdn-ttb.is-print .kdn-ttb-cell .mv .rm{font-size:8pt!important;background:#ffffff!important;color:var(--fg)!important;border-color:var(--fg)!important}
    .kdn-ttb.is-print .kdn-ttb-cell .mv .rm.go{background:var(--fg)!important;color:#ffffff!important}
    .kdn-ttb.is-print .kdn-ttb-cell em{font-size:7pt!important;background:#ffffff!important;color:var(--fg)!important}
    .kdn-ttb.is-print .kdn-ttb-cell.is-empty{background:repeating-linear-gradient(135deg,#f1f3f6 0 4px,#ffffff 4px 8px)!important;border-left-color:#e3e6ec!important}
    .kdn-ttb.is-print .kdn-ttb-legend{font-size:8pt!important;color:#5d6574!important}
    .kdn-ttb.is-print .kdn-ttb-legend i{border-left-width:2px!important}
    .per-page-2 .kdn-ttb.is-print .kdn-ttb-cell{min-height:9.5mm!important;padding:0.8mm 1.6mm 0.8mm 2.2mm!important}
    .per-page-2 .kdn-ttb.is-print .kdn-ttb-cell b{font-size:8.5pt!important}
    .per-page-2 .kdn-ttb.is-print .kdn-ttb-cell small,.per-page-2 .kdn-ttb.is-print .kdn-ttb-cell em{display:none!important}
    .per-page-2 .kdn-ttb.is-print .kdn-ttb-dh{height:6mm!important;font-size:9pt!important}
    .per-page-2 .kdn-ttb.is-print .kdn-ttb-legend{display:none!important}
  }
  @media (max-width:1000px){.kdn-ttb-layout{grid-template-columns:minmax(0,1fr)}.kdn-ttb-side{position:static}}
  @media (max-width:640px){.kdn-ttb{padding:8px}.kdn-ttb-grid{grid-template-columns:34px repeat(5,minmax(0,1fr));gap:3px}.kdn-ttb-cell{min-height:52px;padding:4px 4px 4px 6px;border-left-width:3px}.kdn-ttb-cell b{font-size:11.5px;word-break:break-all;letter-spacing:-.03em}.kdn-ttb-cell small,.kdn-ttb-cell em,.kdn-ttb-cell i,.kdn-ttb-dh span,.kdn-ttb-cell .mv .g{display:none}.kdn-ttb-cell .mv .rm{font-size:10px;padding:0 4px}.kdn-ttb-pt small{display:none}.kdn-ttb-legend .r{margin-left:0}}
  .admission-case-ui .kdn-case-table th,.admission-case-ui .kdn-case-table td{text-align:left!important;border-left:0!important;border-right:0!important}
  .admission-case-ui .kdn-case-table th.n,.admission-case-ui .kdn-case-table td.n{text-align:right!important}
  .admission-case-ui .kdn-case-table td.go,.admission-case-ui .kdn-case-table th:last-child:empty{text-align:center!important;width:40px}
  .kdn-case-table th{font-size:12.5px!important}
  /* 대입결과 · 학생 연동 + 비교 기준 한 장 (CaseStudentBar) */
  .kdn-csb{container-type:inline-size;position:relative;background:var(--kdn-surface);border:1px solid var(--kdn-line);border-radius:18px;box-shadow:0 6px 18px rgba(31,36,48,.05);min-width:0}
  .kdn-csb-top{display:grid;grid-template-columns:minmax(180px,280px) minmax(0,1fr) auto auto;gap:16px;align-items:center;padding:14px 16px}
  .kdn-csb-top:has(>.kdn-csb-res){grid-template-columns:minmax(170px,230px) minmax(0,1fr) auto auto}
  .kdn-csb.is-empty .kdn-csb-top{grid-template-columns:minmax(200px,300px) minmax(0,1fr)}
  .kdn-csb.is-empty p{margin:0;font-size:14px;line-height:1.5;color:var(--kdn-muted);word-break:keep-all}
  .kdn-csb-search{position:relative;display:flex;align-items:center;gap:8px;height:44px;padding:0 12px;border:1.5px solid var(--kdn-control-line);border-radius:12px;background:var(--kdn-surface-2);color:var(--kdn-muted)}
  .kdn-csb-search:focus-within{border-color:var(--kdn-accent)}
  .kdn-csb-search input{flex:1;min-width:0;height:100%;border:0!important;outline:0;background:transparent!important;box-shadow:none!important;padding:0!important;font:inherit;font-size:15px;font-weight:600;color:var(--kdn-ink)}
  .kdn-csb-hits{position:absolute;z-index:30;top:calc(100% + 6px);left:0;right:0;display:grid;padding:6px;border-radius:12px;background:var(--kdn-surface);border:1px solid var(--kdn-line);box-shadow:0 14px 30px rgba(20,24,32,.16)}
  .kdn-csb-hits button{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:8px 10px;border:0;border-radius:9px;background:transparent;color:var(--kdn-ink);font:inherit;text-align:left;cursor:pointer}
  .kdn-csb-hits button:hover{background:var(--kdn-surface-2)}
  .kdn-csb-hits span{font-variant-numeric:tabular-nums;color:var(--kdn-muted);font-size:13px}.kdn-csb-hits b{font-size:14px}.kdn-csb-hits small{font-size:12px;color:var(--kdn-accent-text)}
  .kdn-csb-who{display:flex;align-items:center;gap:12px;min-width:0}
  .kdn-csb-who .av{flex:none;width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:var(--kdn-accent-soft);color:var(--kdn-accent-text);font-weight:800;font-size:16px}
  .kdn-csb-who .sid{margin-right:6px;font-size:14px;color:var(--kdn-muted);font-variant-numeric:tabular-nums}.kdn-csb-who b{font-size:19px;color:var(--kdn-ink)}
  .kdn-csb-who .tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}.kdn-csb-who .tags span{white-space:nowrap;padding:2px 8px;border-radius:7px;background:var(--kdn-surface-2);font-size:12px;font-weight:600;color:var(--kdn-ink-soft)}
  .kdn-csb-mock{display:flex;gap:6px}
  .kdn-csb-mock>span{display:grid;justify-items:center;min-width:54px;padding:6px 8px;border-radius:12px;background:var(--kdn-surface-2);border:1px solid var(--kdn-line)}
  .kdn-csb-mock>span small{font-size:11.5px;color:var(--kdn-muted)}.kdn-csb-mock>span b{font-size:19px;color:var(--kdn-ink);font-variant-numeric:tabular-nums}
  .kdn-csb-mock>.lbl{align-content:center;justify-items:start;min-width:0;padding:0 4px 0 0;background:none;border:0}.kdn-csb-mock>.lbl small:first-child{font-weight:700;color:var(--kdn-ink-soft)}
  .kdn-csb-flow{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:14px 16px;background:color-mix(in srgb,var(--kdn-accent) 5%,var(--kdn-surface));border-top:1px solid color-mix(in srgb,var(--kdn-accent) 14%,var(--kdn-line))}
  .kdn-csb-flow .arr{font-size:18px;color:color-mix(in srgb,var(--kdn-accent) 45%,var(--kdn-muted))}
  .kdn-csb-cell{display:grid;gap:2px;padding:10px 14px;border-radius:13px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kdn-csb-cell small{font-size:12px;font-weight:600;color:var(--kdn-muted)}.kdn-csb-cell b{font-size:22px;color:var(--kdn-ink);font-variant-numeric:tabular-nums}.kdn-csb-cell em{font-style:normal;font-size:11.5px;color:var(--kdn-muted)}
  .kdn-csb-pick{display:flex;flex-wrap:wrap;gap:10px 12px;align-items:end;min-width:0}
  .kdn-csb-seg{display:flex;gap:4px;padding:4px;border-radius:12px;background:var(--kdn-surface-2)}
  .kdn-csb-seg button{display:grid;gap:1px;padding:7px 14px;border:0;border-radius:9px;background:transparent;color:var(--kdn-muted);font:inherit;font-size:14px;font-weight:700;text-align:left;cursor:pointer}
  .kdn-csb-seg button small{font-size:11.5px;font-weight:500}
  .kdn-csb-seg button em{display:inline-block;margin-left:4px;padding:1px 5px;border-radius:5px;background:#ede9fe;color:#6d28d9;font-style:normal;font-size:10.5px}
  .kdn-csb-seg button[aria-pressed="true"]{background:var(--kdn-surface);color:var(--kdn-ink);box-shadow:0 2px 8px rgba(80,50,20,.12)}
  .kdn-csb-sel{display:grid;gap:3px;min-width:150px}.kdn-csb-sel small{font-size:12px;font-weight:600;color:var(--kdn-muted)}
  .kdn-csb-sel select{height:38px;padding:0 10px;border:1.5px solid var(--kdn-control-line);border-radius:10px;background:var(--kdn-surface);color:var(--kdn-ink);font:inherit;font-size:14px;font-weight:700}
  .kdn-csb-res{display:grid;gap:2px;padding:10px 18px;border-radius:14px;background:var(--kdn-accent);color:var(--kdn-accent-ink);box-shadow:0 8px 18px color-mix(in srgb,var(--kdn-accent) 30%,transparent)}
  .kdn-csb-res small{font-size:12px;font-weight:600;opacity:.9}.kdn-csb-res b{font-size:28px;line-height:1.05;font-variant-numeric:tabular-nums}.kdn-csb-res em{font-style:normal;font-size:11.5px;opacity:.92}
  .kdn-csb-res.is-dark{background:var(--kdn-panel);color:#fff;box-shadow:none}
  .kdn-csb-note{margin:0;padding:9px 16px;border-top:1px dashed var(--kdn-line);font-size:12.5px;line-height:1.5;color:var(--kdn-muted);word-break:keep-all}
  .kdn-csb-note.is-warning{color:#9a5b16;background:color-mix(in srgb,#f59e0b 8%,var(--kdn-surface))}
  [data-kd-ui="dark"] .kdn-csb-seg button em{background:#3b2f5c;color:#d8c8ff}
  [data-kd-ui="dark"] .kdn-csb-note.is-warning{color:#f5c27a}
  @container (max-width:820px){.kdn-csb-top{grid-template-columns:minmax(0,1fr) auto}.kdn-csb-top>.kdn-csb-search{grid-column:1/-1}.kdn-csb-top>.kdn-csb-res{grid-column:1/-1;justify-self:start}.kdn-csb-flow{grid-template-columns:auto auto;justify-content:start}.kdn-csb-flow .arr{display:none}.kdn-csb-pick{grid-column:1/-1;order:3}}
  @container (max-width:600px){.kdn-csb-top,.kdn-csb.is-empty .kdn-csb-top{grid-template-columns:minmax(0,1fr);gap:12px;padding:12px}.kdn-csb-flow{grid-template-columns:1fr 1fr;justify-content:stretch;padding:12px}.kdn-csb-seg{flex:1 1 100%}.kdn-csb-seg button{flex:1}.kdn-csb-sel{flex:1 1 100%}}
  /* 수시 지원 구성 · 6칸 리본 + 균형 (PlanOverview) */
  .kdn-spw{display:grid;gap:14px;margin-bottom:14px;padding:16px 18px;border-radius:18px;background:var(--kdn-surface);border:1px solid var(--kdn-line);box-shadow:0 6px 18px rgba(31,36,48,.05);--b-up:#dc2626;--b-reach:#ea580c;--b-fit:#ca8a04;--b-safe:#16a34a;--b-down:#2563eb;--b-none:#94a3b8}
  .kdn-spw-head{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
  .kdn-spw-head small{font-size:12.5px;font-weight:700;color:var(--kdn-accent-text)}
  .kdn-spw-head b{display:block;font-size:21px;color:var(--kdn-ink)}.kdn-spw-head b span{font-size:14px;font-weight:500;color:var(--kdn-muted)}
  .kdn-spw-tools{margin-left:auto;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .kdn-spw-tools .kd-plan-action,.kdn-spw-tools>button{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 13px;border-radius:10px;border:1px solid var(--kdn-control-line);background:var(--kdn-surface);color:var(--kdn-ink-soft);font:inherit;font-size:13px;font-weight:700;box-shadow:none;cursor:pointer;white-space:nowrap}
  .kdn-spw-tools .kd-plan-action[aria-pressed="true"]{background:var(--kdn-panel);border-color:var(--kdn-panel);color:#fff}
  .kdn-spw-tools .kd-plan-action.is-summary-print{border-style:dashed}
  .kdn-spw-tools .kd-plan-action.is-print{background:var(--kdn-accent)!important;border-color:var(--kdn-accent)!important;color:var(--kdn-accent-ink)!important}
  .kdn-spw-tools button:disabled{opacity:.5;cursor:not-allowed}
  .kdn-spw-slots{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
  .kdn-spw-slot{--c:var(--b-none);position:relative;display:grid;align-content:start;gap:3px;min-width:0;padding:11px 12px 10px;border-radius:13px;border:1.5px solid color-mix(in srgb,var(--c) 35%,var(--kdn-line));background:color-mix(in srgb,var(--c) 7%,var(--kdn-surface))}
  .kdn-spw-slot.is-up{--c:var(--b-up)}.kdn-spw-slot.is-reach{--c:var(--b-reach)}.kdn-spw-slot.is-fit{--c:var(--b-fit)}.kdn-spw-slot.is-safe{--c:var(--b-safe)}.kdn-spw-slot.is-down{--c:var(--b-down)}
  .kdn-spw-slot .no{position:absolute;top:9px;right:10px;font-size:12px;font-weight:800;color:var(--c)}
  .kdn-spw-slot b{padding-right:16px;font-size:14.5px;color:var(--kdn-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .kdn-spw-slot small{font-size:12px;color:var(--kdn-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .kdn-spw-slot .band{justify-self:start;margin-top:4px;padding:2px 9px;border-radius:7px;background:var(--c);color:#fff;font-size:12px;font-weight:700}
  .kdn-spw-slot.is-empty{place-content:center;justify-items:center;text-align:center;border-style:dashed;border-color:var(--kdn-control-line);background:var(--kdn-surface-2)}
  .kdn-spw-slot.is-empty b{padding:0;font-size:13px;color:var(--kdn-muted)}
  .kdn-spw-stats{display:grid;grid-template-columns:minmax(0,1.4fr) repeat(3,minmax(0,1fr));gap:10px}
  .kdn-spw-stat{display:grid;align-content:start;gap:6px;min-width:0;padding:12px 14px;border-radius:13px;background:var(--kdn-surface-2);border:1px solid var(--kdn-line)}
  .kdn-spw-stat>small{font-size:12px;font-weight:600;color:var(--kdn-muted)}
  .kdn-spw-stat>b{font-size:18px;color:var(--kdn-ink)}.kdn-spw-stat>b .ok{color:#15803d}.kdn-spw-stat>b .ng{font-size:14px;color:#b42318}
  .kdn-spw-stat>em{font-style:normal;font-size:12px;color:var(--kdn-muted)}
  .kdn-spw-stat.is-balance{background:var(--kdn-surface)}
  .kdn-spw-meter{display:flex;height:12px;border-radius:99px;overflow:hidden;background:var(--kdn-line)}
  .kdn-spw-meter i{display:block;height:100%}
  .kdn-spw-meter .is-up{background:var(--b-up)}.kdn-spw-meter .is-reach{background:var(--b-reach)}.kdn-spw-meter .is-fit{background:var(--b-fit)}.kdn-spw-meter .is-safe{background:var(--b-safe)}.kdn-spw-meter .is-down{background:var(--b-down)}
  .kdn-spw-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px;font-weight:600;color:var(--kdn-ink-soft)}
  .kdn-spw-legend span{display:inline-flex;align-items:center;gap:5px}.kdn-spw-legend span::before{content:"";width:9px;height:9px;border-radius:3px;background:var(--c,var(--b-none))}
  .kdn-spw-legend .is-up{--c:var(--b-up)}.kdn-spw-legend .is-reach{--c:var(--b-reach)}.kdn-spw-legend .is-fit{--c:var(--b-fit)}.kdn-spw-legend .is-safe{--c:var(--b-safe)}.kdn-spw-legend .is-down{--c:var(--b-down)}
  .kdn-spw-legend .is-zero{opacity:.5}
  .kdn-spw-chips{display:flex;flex-wrap:wrap;gap:5px}.kdn-spw-chips span{padding:2px 8px;border-radius:7px;font-size:12px;font-weight:700;background:var(--kdn-surface);color:var(--kdn-ink-soft);border:1px solid var(--kdn-line)}
  .kdn-spw-chips .is-academic{background:#eaf3fc;color:#1f5f9e;border-color:#b9d7f0}.kdn-spw-chips .is-general{background:#f3edfb;color:#6a3fa0;border-color:#d7c3ee}.kdn-spw-chips .is-essay{background:#fdf1e2;color:#a3631b;border-color:#eecfa0}.kdn-spw-chips .is-talent{background:#e8f7f1;color:#1c7a63;border-color:#b7e2d1}
  .kdn-spw-tip{margin:0;padding:9px 12px;border-radius:11px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px;font-weight:600;line-height:1.5;word-break:keep-all}
  .kdn-spw-tip::before{content:"⚠ "}
  [data-kd-ui="dark"] .kdn-spw-tip{background:#3a2616;border-color:#6b3d1c;color:#ffc79a}
  [data-kd-ui="dark"] .kdn-spw-stat>b .ok{color:#6ee7a0}[data-kd-ui="dark"] .kdn-spw-stat>b .ng{color:#ff9b8f}
  [data-kd-ui="dark"] .kdn-spw-chips .is-academic{background:#1b2c40;color:#9cc8f2;border-color:#2d4766}[data-kd-ui="dark"] .kdn-spw-chips .is-general{background:#2a2140;color:#cdb4f2;border-color:#45366a}[data-kd-ui="dark"] .kdn-spw-chips .is-essay{background:#3a2a17;color:#f2c58a;border-color:#5c4224}[data-kd-ui="dark"] .kdn-spw-chips .is-talent{background:#15302a;color:#8fe0c4;border-color:#24503f}
  @media screen{
    .susi-beta-workspace .kd-decision-card{border-top:5px solid var(--b-c,#94a3b8)!important}
    .susi-beta-workspace .kd-decision-card.is-band-up{--b-c:#dc2626}.susi-beta-workspace .kd-decision-card.is-band-reach{--b-c:#ea580c}.susi-beta-workspace .kd-decision-card.is-band-fit{--b-c:#ca8a04}.susi-beta-workspace .kd-decision-card.is-band-safe{--b-c:#16a34a}.susi-beta-workspace .kd-decision-card.is-band-down{--b-c:#2563eb}
  }
  .susi-beta-workspace .kd-decision-primary{grid-template-columns:minmax(0,1fr)!important}
  .susi-beta-workspace .kd-decision-numbers{display:grid!important;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)}
  .susi-beta-workspace .kd-decision-num-box{display:grid;justify-items:center;align-content:center;writing-mode:horizontal-tb}
  .susi-beta-workspace .kd-decision-num-box.is-student{background:var(--kdn-accent-soft);border-color:color-mix(in srgb,var(--kdn-accent) 35%,var(--kdn-line))}
  .susi-beta-workspace .kd-decision-card .kd-decision-num-box.is-student b,.susi-beta-workspace .kd-decision-card .kd-decision-num-box.is-student small{color:var(--kdn-accent-text)}
  @media (max-width:1100px){.kdn-spw-slots{grid-template-columns:repeat(3,minmax(0,1fr))}.kdn-spw-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media (max-width:640px){.kdn-spw{padding:14px}.kdn-spw-slots{grid-template-columns:repeat(2,minmax(0,1fr))}.kdn-spw-stats{grid-template-columns:minmax(0,1fr)}.kdn-spw-tools{margin-left:0}}
  /* 수시 지원 구성 · 판정 카드 보기 A/B/C (SupportPlanViews) */
  .kdn-pv-bar{display:flex;align-items:center;gap:10px;margin:4px 0 10px}.kdn-pv-bar>b{font-size:16px;color:var(--kdn-ink)}.kdn-pv-bar .kdn-view-switch{margin:0 0 0 auto}
  .kdn-pv-grid,.kdn-pv-split,.kdn-pv-tablewrap{--b-up:#dc2626;--b-reach:#ea580c;--b-fit:#ca8a04;--b-safe:#16a34a;--b-down:#2563eb;--b-none:#94a3b8;margin-bottom:12px}
  .kdn-pv-grid .is-up,.kdn-pv-split .is-up,.kdn-pv-tablewrap .is-up{--c:var(--b-up)}.kdn-pv-grid .is-reach,.kdn-pv-split .is-reach,.kdn-pv-tablewrap .is-reach{--c:var(--b-reach)}.kdn-pv-grid .is-fit,.kdn-pv-split .is-fit,.kdn-pv-tablewrap .is-fit{--c:var(--b-fit)}.kdn-pv-grid .is-safe,.kdn-pv-split .is-safe,.kdn-pv-tablewrap .is-safe{--c:var(--b-safe)}.kdn-pv-grid .is-down,.kdn-pv-split .is-down,.kdn-pv-tablewrap .is-down{--c:var(--b-down)}
  .kdn-pv-band{display:inline-block;padding:1px 8px;border-radius:6px;background:var(--c,var(--b-none));color:#fff;font-size:12px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
  .kdn-pv-no{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:8px;background:var(--c,var(--kdn-panel));color:#fff;font-size:12px;font-weight:800}
  .kdn-pv-track{display:inline-block;padding:1px 7px;border-radius:6px;font-size:11.5px;font-weight:700;white-space:nowrap;background:var(--kdn-surface-2);color:var(--kdn-ink-soft)}
  .kdn-pv-track.is-academic{background:#eaf3fc;color:#1f5f9e}.kdn-pv-track.is-general{background:#f3edfb;color:#6a3fa0}.kdn-pv-track.is-essay{background:#fdf1e2;color:#a3631b}.kdn-pv-track.is-talent{background:#e8f7f1;color:#1c7a63}
  .kdn-pv-min{display:inline-block;padding:1px 8px;border-radius:6px;font-size:12px;font-weight:700;white-space:nowrap;background:var(--kdn-surface-2);color:var(--kdn-muted)}
  .kdn-pv-min.is-ok{background:#e7f7ee;color:#15803d}.kdn-pv-min.is-ng{background:#fdeceb;color:#b42318}.kdn-pv-min.is-warn{background:#fff4d9;color:#8a5a0b}
  .kdn-pv-acts{display:inline-flex;gap:4px;margin-left:auto}
  .kdn-pv-acts button,.kdn-pv-more{display:inline-flex;align-items:center;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--kdn-control-line);background:var(--kdn-surface);color:var(--kdn-ink-soft);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap}
  .kdn-pv-acts button:disabled{opacity:.5;cursor:not-allowed}
  .kdn-pv-empty{padding:18px;border-radius:14px;border:1.5px dashed var(--kdn-control-line);color:var(--kdn-muted);font-size:14px;text-align:center;margin-bottom:12px}
  /* A */
  .kdn-pv-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:start}
  .kdn-pv-tile{position:relative;display:grid;gap:8px;min-width:0;padding:12px 14px;border-radius:14px;background:var(--kdn-surface);border:1px solid var(--kdn-line);border-left:5px solid var(--c,var(--b-none))}
  .kdn-pv-tile.is-open{grid-column:span 2}
  .kdn-pv-tile>.kdn-pv-no{position:absolute;top:10px;right:12px;background:var(--kdn-panel)}
  .kdn-pv-name{display:flex;align-items:baseline;gap:8px;min-width:0;padding-right:30px}.kdn-pv-name b{font-size:16px;color:var(--kdn-ink);white-space:nowrap}.kdn-pv-name small{font-size:12.5px;color:var(--kdn-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .kdn-pv-cmp{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:var(--kdn-surface-2)}
  .kdn-pv-cmp .v{display:grid;line-height:1.15}.kdn-pv-cmp .v small{font-size:11px;color:var(--kdn-muted)}.kdn-pv-cmp .v b{font-size:18px;color:var(--kdn-ink);font-variant-numeric:tabular-nums}.kdn-pv-cmp .me b{color:var(--kdn-accent-text)}
  .kdn-pv-cmp i{font-style:normal;font-size:12px;color:var(--kdn-muted)}
  .kdn-pv-cmp .r{margin-left:auto;display:grid;justify-items:end;gap:2px}.kdn-pv-cmp .r small{font-size:11.5px;color:var(--kdn-muted)}
  .kdn-pv-line{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.kdn-pv-line small{font-size:12px;color:var(--kdn-muted)}
  .kdn-pv-foot{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--kdn-muted)}.kdn-pv-foot b{color:var(--kdn-ink)}
  /* 상세 */
  .kdn-pv-detail{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;align-items:start}
  .kdn-pv-dbox{display:grid;gap:6px;min-width:0;padding:11px 12px;border-radius:12px;background:var(--kdn-surface);border:1px solid var(--kdn-line);font-size:13px;color:var(--kdn-ink-soft)}
  .kdn-pv-dbox h5{display:flex;justify-content:space-between;align-items:center;gap:6px;margin:0;font-size:13px;color:var(--kdn-ink)}
  .kdn-pv-dbox.is-satisfied{background:color-mix(in srgb,#16a34a 6%,var(--kdn-surface));border-color:color-mix(in srgb,#16a34a 28%,var(--kdn-line))}
  .kdn-pv-dbox.is-unsatisfied{background:color-mix(in srgb,#dc2626 6%,var(--kdn-surface));border-color:color-mix(in srgb,#dc2626 28%,var(--kdn-line))}
  .kdn-pv-year{padding:1px 7px;border-radius:99px;background:var(--kdn-surface-2);font-size:11px;font-weight:700;color:var(--kdn-muted)}
  .kdn-pv-dbox .kd-course-details{margin:0;border:0;padding:0;background:transparent}
  .kdn-pv-evidence p{margin:0;font-size:12.5px}.kdn-pv-evidence p b{display:inline-block;min-width:92px;color:var(--kdn-muted);font-weight:600}.kdn-pv-evidence small{font-size:11.5px;color:var(--kdn-muted);line-height:1.5}
  .kdn-pv-evidence{grid-column:1/-1}
  .kdn-pv-ev2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .kdn-pv-ev2 .col{display:grid;align-content:start;gap:5px;padding:10px 12px;border-radius:11px;background:var(--kdn-surface-2);border-top:3px solid #2563eb}
  .kdn-pv-ev2 .col.is-school{border-top-color:var(--kdn-accent)}.kdn-pv-ev2 .col.is-none{border-top-color:var(--kdn-control-line)}
  .kdn-pv-ev2 .col>b{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--kdn-ink)}
  .kdn-pv-ev2 .tier{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:var(--kdn-accent);color:var(--kdn-accent-ink);font-style:normal;font-size:12px;font-weight:800}
  .kdn-pv-ev2 .tier-C .tier,.kdn-pv-ev2 .tier-D .tier{background:var(--kdn-control-line);color:var(--kdn-ink)}
  .kdn-pv-ev2 p{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;margin:0;font-size:13px;color:var(--kdn-ink);font-variant-numeric:tabular-nums}
  .kdn-pv-ev2 p span{min-width:84px;font-size:12px;font-weight:600;color:var(--kdn-muted)}
  .kdn-pv-ev2 p em{font-style:normal;font-size:12px;color:var(--kdn-muted)}
  .kdn-pv-ev2 p.lv{font-size:12.5px;font-weight:700;color:var(--kdn-accent-text)}.kdn-pv-ev2 .is-none p.lv{color:var(--kdn-muted)}
  .kdn-pv-ev2 p.me{padding-top:5px;border-top:1px dashed var(--kdn-line);font-weight:700}
  @media (max-width:640px){.kdn-pv-ev2{grid-template-columns:minmax(0,1fr)}}
  .kdn-pv-warn{grid-column:1/-1;margin:0;padding:8px 10px;border-radius:9px;background:#fff4d9;color:#8a5a0b;font-size:12.5px}
  /* B */
  .kdn-pv-tablewrap{container-type:inline-size;overflow-x:auto;border-radius:16px;border:1px solid var(--kdn-line);background:var(--kdn-surface)}
  .kdn-pv-table{width:100%;min-width:900px;border-collapse:collapse;font-size:13.5px;color:var(--kdn-ink)}
  .kdn-pv-table th{padding:9px 12px;text-align:left;font-size:12px;font-weight:600;color:var(--kdn-muted);background:var(--kdn-surface-2);border-bottom:1px solid var(--kdn-line);white-space:nowrap}
  .kdn-pv-table th small{font-weight:500}
  .kdn-pv-table td{padding:10px 12px;border-bottom:1px solid var(--kdn-line);vertical-align:middle}
  .kdn-pv-table .c{width:40px;text-align:center}.kdn-pv-table .n{white-space:nowrap;font-variant-numeric:tabular-nums}.kdn-pv-table .nw{white-space:nowrap}
  .kdn-pv-table .u{font-size:15px}.kdn-pv-table .d{display:block;font-size:12px;color:var(--kdn-muted);font-weight:500}
  .kdn-pv-table .me{color:var(--kdn-accent-text)}.kdn-pv-table .sl{color:var(--kdn-muted)}.kdn-pv-table .df{margin-left:6px;font-size:12px;color:var(--kdn-muted);font-variant-numeric:tabular-nums}
  .kdn-pv-table tr.is-open td{background:color-mix(in srgb,var(--kdn-accent) 4%,var(--kdn-surface))}
  .kdn-pv-detailrow td{background:var(--kdn-surface-2)!important;padding:12px 14px}
  .kdn-pv-rowacts{display:flex;margin-top:10px}
  .kdn-pv-detailrow .kdn-pv-detail,.kdn-pv-detailrow .kdn-pv-rowacts{position:sticky;left:14px;box-sizing:border-box;width:calc(100cqw - 28px)}
  .kdn-pv-scale{position:relative;width:180px;height:22px}
  .kdn-pv-scale .ln{position:absolute;top:10px;left:0;right:0;height:3px;border-radius:2px;background:var(--kdn-line)}
  .kdn-pv-scale .cut{position:absolute;top:4px;width:3px;height:15px;margin-left:-1px;border-radius:2px;background:var(--kdn-ink)}
  .kdn-pv-scale .me{position:absolute;top:5px;width:12px;height:12px;margin-left:-6px;border-radius:99px;background:var(--kdn-accent);border:2px solid var(--kdn-surface);box-shadow:0 0 0 1px var(--kdn-accent)}
  /* C */
  .kdn-pv-split{display:grid;grid-template-columns:minmax(260px,360px) minmax(0,1fr);gap:12px;align-items:start}
  .kdn-pv-list{display:grid;gap:6px}
  .kdn-pv-item{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 12px;border-radius:12px;background:var(--kdn-surface);border:1px solid var(--kdn-line);color:var(--kdn-ink);font:inherit;text-align:left;cursor:pointer}
  .kdn-pv-item.is-on{border-color:var(--kdn-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--kdn-accent) 22%,transparent)}
  .kdn-pv-item .t{min-width:0}.kdn-pv-item .t b{display:block;font-size:14.5px}.kdn-pv-item .t small{display:block;font-size:12px;color:var(--kdn-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .kdn-pv-item .r{display:grid;justify-items:end;gap:3px}
  .kdn-pv-pane{display:grid;gap:12px;min-width:0;padding:16px 18px;border-radius:16px;background:var(--kdn-surface);border:1px solid var(--kdn-line);border-top:5px solid var(--c,var(--b-none))}
  .kdn-pv-panehead{display:flex;align-items:flex-start;gap:10px}.kdn-pv-panehead h3{margin:0;font-size:19px;color:var(--kdn-ink);word-break:keep-all}.kdn-pv-panehead .sub{margin-top:5px;font-size:12.5px;color:var(--kdn-muted)}
  .kdn-pv-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  .kdn-pv-kpis span{display:grid;gap:2px;padding:10px 12px;border-radius:12px;background:var(--kdn-surface-2)}.kdn-pv-kpis small{font-size:11.5px;color:var(--kdn-muted)}.kdn-pv-kpis b{font-size:20px;color:var(--kdn-ink);font-variant-numeric:tabular-nums}
  .kdn-pv-kpis .me{background:var(--kdn-accent-soft)}.kdn-pv-kpis .me b{color:var(--kdn-accent-text)}
  .kdn-pv-kpis .band{background:var(--c,var(--b-none))}.kdn-pv-kpis .band small,.kdn-pv-kpis .band b{color:#fff}
  [data-kd-ui="dark"] .kdn-pv-track.is-academic{background:#1b2c40;color:#9cc8f2}[data-kd-ui="dark"] .kdn-pv-track.is-general{background:#2a2140;color:#cdb4f2}[data-kd-ui="dark"] .kdn-pv-track.is-essay{background:#3a2a17;color:#f2c58a}[data-kd-ui="dark"] .kdn-pv-track.is-talent{background:#15302a;color:#8fe0c4}
  [data-kd-ui="dark"] .kdn-pv-min.is-ok{background:#15302a;color:#6ee7a0}[data-kd-ui="dark"] .kdn-pv-min.is-ng{background:#3a1d1b;color:#ff9b8f}[data-kd-ui="dark"] .kdn-pv-min.is-warn,[data-kd-ui="dark"] .kdn-pv-warn{background:#3a2a17;color:#f2c58a}
  [data-kd-ui="dark"] .kdn-pv-dbox .kd-status-pill.is-satisfied{background:#15302a;color:#6ee7a0;border-color:#24503f}[data-kd-ui="dark"] .kdn-pv-dbox .kd-status-pill.is-unsatisfied{background:#3a1d1b;color:#ff9b8f;border-color:#5c2c28}
  @media (max-width:1100px){.kdn-pv-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.kdn-pv-split{grid-template-columns:minmax(0,1fr)}.kdn-pv-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media (max-width:640px){.kdn-pv-grid{grid-template-columns:minmax(0,1fr)}.kdn-pv-tile.is-open{grid-column:auto}.kdn-pv-bar{flex-wrap:wrap}.kdn-pv-bar .kdn-view-switch{margin:0}}
  /* 성적 산출 · 산출 기준 설정 (새 UI) */
  .kdn-cc{display:grid;gap:12px}
  .kdn-cc-top,.kdn-cc-sec,.kdn-cc-opts,.kdn-cc-rules{background:var(--kdn-surface);border:1px solid var(--kdn-line);border-radius:16px}
  .kdn-cc-top{display:grid;gap:12px;padding:16px 18px}
  .kdn-cc-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
  .kdn-cc-head small{display:block;font-size:13px;font-weight:700;color:var(--kdn-accent-text)}.kdn-cc-head b{display:block;font-size:21px;color:var(--kdn-ink)}
  .kdn-cc-total{margin-left:auto;padding:5px 13px;border-radius:99px;font-size:14px;font-weight:700}
  .kdn-cc-total.is-ok{background:#e7f7ee;color:#15803d}.kdn-cc-total.is-warn{background:#fff4d9;color:#8a5a0b}
  .kdn-cc-save{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 16px;border-radius:11px;border:0;background:var(--kdn-accent);color:var(--kdn-accent-ink);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
  .kdn-cc-save:disabled{opacity:.55;cursor:not-allowed}
  .kdn-cc-bar{display:flex;gap:2px;height:36px;border-radius:10px;overflow:hidden;background:var(--kdn-surface-2)}
  .kdn-cc-bar i{display:grid;place-items:center;min-width:0;padding:0 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-style:normal;font-size:13px;font-weight:700;color:#fff}
  .kdn-cc-bar .is-w.n0{background:#2563eb}.kdn-cc-bar .is-w.n1{background:#3b82f6}.kdn-cc-bar .is-w.n2{background:#60a5fa}
  .kdn-cc-bar .is-p.n0{background:#e2531a}.kdn-cc-bar .is-p.n1{background:#f08a5d}.kdn-cc-bar .is-p.n2{background:#f6b896;color:#7a2a08}
  .kdn-cc-bar .is-empty{background:repeating-linear-gradient(45deg,var(--kdn-surface-2),var(--kdn-surface-2) 6px,var(--kdn-line) 6px,var(--kdn-line) 7px);color:var(--kdn-muted)}
  .kdn-cc-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.35fr);gap:12px;align-items:start}
  .kdn-cc-sec{display:grid;gap:8px;padding:14px 16px}
  .kdn-cc-sec h4{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0;font-size:16px;color:var(--kdn-ink)}
  .kdn-cc-sec .dot{width:10px;height:10px;border-radius:3px;background:#2563eb}.kdn-cc-sec.is-p .dot{background:#e2531a}
  .kdn-cc-sec .sum{margin-left:auto;font-size:21px;color:#2563eb;font-variant-numeric:tabular-nums}.kdn-cc-sec.is-p .sum{color:var(--kdn-accent-text)}
  .kdn-cc-file{padding:2px 9px;border-radius:7px;border:0;background:var(--kdn-surface-2);color:var(--kdn-ink-soft);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
  .kdn-cc-row{display:grid;grid-template-columns:minmax(0,1fr) auto 32px;gap:10px;align-items:center;padding:10px 12px;border-radius:12px;background:var(--kdn-surface-2)}
  .kdn-cc-row>div{min-width:0}
  .kdn-cc-row b{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:15px;color:var(--kdn-ink)}
  .kdn-cc-row small{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:2px;font-size:12.5px;color:var(--kdn-muted)}
  .kdn-cc-row .tag{padding:1px 7px;border-radius:6px;font-size:11.5px;font-weight:700}.kdn-cc-row .tag.is-ok{background:#e7f7ee;color:#15803d}.kdn-cc-row .tag.is-plan{background:#fff4d9;color:#8a5a0b}
  .kdn-cc-name{width:100%;box-sizing:border-box;height:34px;padding:0 10px;border:1.5px solid var(--kdn-control-line);border-radius:9px;background:var(--kdn-surface);color:var(--kdn-ink);font:inherit;font-size:14.5px;font-weight:700}
  .kdn-cc-max{display:inline-flex;align-items:center;gap:3px}.kdn-cc-max input{width:56px;height:26px;padding:0 6px;border:1px solid var(--kdn-control-line);border-radius:7px;background:var(--kdn-surface);color:var(--kdn-ink);font:inherit;font-size:12.5px}
  .kdn-cc-inp{display:inline-flex;align-items:center;gap:4px;font-size:15px;font-weight:700;color:var(--kdn-muted)}
  .kdn-cc-inp input{width:72px;height:40px;box-sizing:border-box;padding:0 8px;border:1.5px solid var(--kdn-control-line);border-radius:10px;background:var(--kdn-surface);color:var(--kdn-ink);font:inherit;font-size:17px;font-weight:700;text-align:center;font-variant-numeric:tabular-nums}
  .kdn-cc-inp input:focus{outline:none;border-color:var(--kdn-accent)}
  .kdn-cc-x{width:32px;height:32px;border-radius:9px;border:1px solid color-mix(in srgb,#dc2626 30%,var(--kdn-line));background:var(--kdn-surface);color:#c0262d;font-size:14px;cursor:pointer}
  .kdn-cc-x:disabled{opacity:.4;cursor:not-allowed}
  .kdn-cc-add{padding:10px;border-radius:12px;border:1.5px dashed var(--kdn-control-line);background:transparent;color:var(--kdn-muted);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
  .kdn-cc-add:hover{color:var(--kdn-accent-text);border-color:var(--kdn-accent)}
  .kdn-cc-empty{margin:0;padding:12px;border-radius:12px;background:var(--kdn-surface-2);font-size:14px;color:var(--kdn-muted)}
  .kdn-cc-opts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(0,1.3fr);gap:12px;align-items:start;padding:14px 16px}
  .kdn-cc-opt small{display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--kdn-muted)}
  .kdn-cc-seg{display:flex;gap:3px;padding:3px;border-radius:11px;background:var(--kdn-surface-2)}
  .kdn-cc-seg button{flex:1;min-height:38px;padding:0 8px;border:0;border-radius:9px;background:transparent;color:var(--kdn-muted);font:inherit;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap}
  .kdn-cc-seg button[aria-pressed="true"]{background:var(--kdn-panel);color:#fff}
  .kdn-cc-seg button:disabled{cursor:not-allowed}
  .kdn-cc-rule{display:grid;gap:3px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--kdn-accent) 7%,var(--kdn-surface));font-size:13.5px;line-height:1.55}
  .kdn-cc-rule b{color:var(--kdn-ink)}.kdn-cc-rule span{color:var(--kdn-muted)}
  .kdn-cc-manual{grid-column:1/-1}
  .kdn-cc-rules{padding:0}
  .kdn-cc-rules summary{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:13px 16px;cursor:pointer;font-size:14px;color:var(--kdn-muted)}
  .kdn-cc-rules summary b{font-size:14.5px;color:var(--kdn-ink)}
  .kdn-cc-rules ol{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0 16px 4px;list-style:none;counter-reset:r}
  .kdn-cc-rules li{counter-increment:r;padding:5px 10px;border-radius:9px;background:var(--kdn-surface-2);font-size:13.5px;font-weight:600;color:var(--kdn-ink-soft)}
  .kdn-cc-rules li::before{content:counter(r) ". ";color:var(--kdn-accent-text);font-weight:800}
  .kdn-cc-rules p{margin:8px 16px;font-size:13.5px;line-height:1.6;color:var(--kdn-muted)}
  .kdn-cc-rules p:last-child{margin-bottom:14px}
  [data-kd-ui="dark"] .kdn-cc-total.is-ok,[data-kd-ui="dark"] .kdn-cc-row .tag.is-ok{background:#15302a;color:#6ee7a0}
  [data-kd-ui="dark"] .kdn-cc-total.is-warn,[data-kd-ui="dark"] .kdn-cc-row .tag.is-plan{background:#3a2a17;color:#f2c58a}
  @media (max-width:1000px){.kdn-cc-cols{grid-template-columns:minmax(0,1fr)}.kdn-cc-opts{grid-template-columns:repeat(3,minmax(0,1fr))}.kdn-cc-rule{grid-column:1/-1}}
  @media (max-width:640px){.kdn-cc-opts{grid-template-columns:minmax(0,1fr)}.kdn-cc-head .kdn-cc-total{margin-left:0}.kdn-cc-row{grid-template-columns:minmax(0,1fr) auto}.kdn-cc-row>.kdn-cc-x,.kdn-cc-row>span:last-child{grid-column:2;grid-row:1}.kdn-cc-row>.kdn-cc-inp{grid-column:1/-1}}
  /* 성적 산출 결과 표 (새 UI): 이름·학번 왼쪽, 숫자 가운데, 행 간격·구분선 정리 */
  .teacher-grade-analyzer .teacher-grade-result-table{border-collapse:separate!important;border-spacing:0!important}
  .teacher-grade-analyzer .teacher-grade-result-table th{padding:12px 12px!important;font-size:13px!important;font-weight:700!important;color:var(--kdn-ink-soft)!important;background:var(--kdn-surface-2)!important;border-right:1px solid var(--kdn-line)!important;border-bottom:1.5px solid var(--kdn-control-line)!important;text-align:center!important;white-space:nowrap}
  .teacher-grade-analyzer .teacher-grade-result-table td{padding:12px 12px!important;font-size:14px!important;line-height:1.35!important;color:var(--kdn-ink-soft)!important;border-right:1px solid var(--kdn-line)!important;border-bottom:1px solid var(--kdn-line)!important;text-align:center!important;font-variant-numeric:tabular-nums}
  .teacher-grade-analyzer .teacher-grade-result-table tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--kdn-surface-2) 55%,var(--kdn-surface))!important}
  .teacher-grade-analyzer .teacher-grade-result-table tbody tr:hover td{background:color-mix(in srgb,var(--kdn-accent) 6%,var(--kdn-surface))!important}
  .teacher-grade-analyzer .teacher-grade-result-table th.student-id-head,.teacher-grade-analyzer .teacher-grade-result-table th.student-name-head,.teacher-grade-analyzer .teacher-grade-result-table td.student-id-cell,.teacher-grade-analyzer .teacher-grade-result-table td.student-name-cell{text-align:center!important}
  .teacher-grade-analyzer .teacher-grade-result-table td.student-id-cell b{font-size:14px!important;font-weight:600!important;color:var(--kdn-muted)!important;letter-spacing:.02em}
  .teacher-grade-analyzer .teacher-grade-result-table td.student-name-cell b{font-size:15px!important;font-weight:700!important;color:var(--kdn-ink)!important}
  .teacher-grade-analyzer .teacher-grade-result-table td.student-class-cell b,.teacher-grade-analyzer .teacher-grade-result-table td.student-number-cell b{font-weight:600!important;color:var(--kdn-ink-soft)!important}
  .teacher-grade-analyzer .teacher-grade-result-table td.score-cell b{font-size:16px!important;font-weight:800!important;color:var(--kdn-ink)!important;letter-spacing:.01em}
  .teacher-grade-analyzer .teacher-grade-result-table td.rank-cell{font-size:15px!important;font-weight:700!important;color:var(--kdn-ink)!important}
  .teacher-grade-analyzer .teacher-grade-result-table td.rank-cell small{display:table;margin:4px auto 0;padding:1px 7px;border-radius:6px;background:#ede9fe;font-size:11.5px!important;font-weight:700!important;color:#5b21b6!important;white-space:nowrap}
  [data-kd-ui="dark"] .teacher-grade-analyzer .teacher-grade-result-table td.rank-cell small{background:#2e2547;color:#cdb4f2!important}
  .teacher-grade-analyzer .teacher-grade-result-table td.rank-cell.is-tied{color:#5b21b6!important}
  [data-kd-ui="dark"] .teacher-grade-analyzer .teacher-grade-result-table td.rank-cell.is-tied{color:#cdb4f2!important}
  .teacher-grade-analyzer .teacher-grade-result-table .student-row-edit{min-height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--kdn-control-line);background:var(--kdn-surface);color:var(--kdn-ink-soft);font-size:13px;font-weight:700}
  .kdn-gbadge{display:inline-flex;align-items:center;justify-content:center;min-width:54px;padding:4px 10px;border-radius:999px;font-size:13px;font-weight:800;white-space:nowrap}
  .kdn-gbadge.g1{background:#e2531a;color:#fff}.kdn-gbadge.g2{background:#fde4d6;color:#b23e0c}.kdn-gbadge.g3{background:#fef3c7;color:#8a5a0b}.kdn-gbadge.g4{background:#e5e9f0;color:#3a4150}.kdn-gbadge.g5{background:#d4d9e2;color:#2a3040}
  [data-kd-ui="dark"] .kdn-gbadge.g2{background:#4a2617;color:#ffb089}[data-kd-ui="dark"] .kdn-gbadge.g3{background:#3a2f17;color:#f2d38a}[data-kd-ui="dark"] .kdn-gbadge.g4{background:#2e3240;color:#d6dae3}[data-kd-ui="dark"] .kdn-gbadge.g5{background:#3a3f4e;color:#e8ebf0}
  .kdn-top-nav .kdn-brand-home{color:var(--kdn-ink)!important;border:0!important;box-shadow:none!important;outline:none}
  .kdn-top-nav .kdn-brand-home:focus-visible{outline:2px solid var(--kdn-accent);outline-offset:4px;border-radius:12px}
  .kdn-top-nav .kdn-brand-home:hover>span:first-child{filter:brightness(1.08)}
  [data-kd-ui="dark"] .kdn-recog{background:#2e2547;color:#cdb4f2}[data-kd-ui="dark"] .kdn-recog-btn,[data-kd-ui="dark"] .student-score-recog-helper button{background:#1d1b26;border-color:#4c3d7a;color:#cdb4f2}
  [data-kd-ui="dark"] .student-score-recog-wrap.is-on{background:#221d33;border-color:#3b2f5c}[data-kd-ui="dark"] .student-score-editor label.student-score-recog{color:#cdb4f2}[data-kd-ui="dark"] .student-score-recog-helper{color:#d6d3e6}
  /* 성적 산출 결과 · 반별 비교 */
  .kdn-gr-cls{display:grid;gap:14px;margin-bottom:14px}
  .kdn-gr-cls-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-end}
  .kdn-gr-cls-head>div:first-child{display:grid;gap:4px}
  .kdn-gr-cls-head>div:first-child>span{font-size:13px;font-weight:700;color:var(--kdn-accent-text)}
  .kdn-gr-cls-head>div:first-child>b{font-size:22px;color:var(--kdn-ink)}
  .kdn-gr-cls-head>div:first-child>small{font-size:13px;color:var(--kdn-muted)}
  .kdn-gr-cls-sort{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.kdn-gr-cls-sort>span{font-size:13px;font-weight:700;color:var(--kdn-muted)}
  .kdn-gr-cls-sort button{min-height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--kdn-line);background:var(--kdn-surface);color:var(--kdn-ink-soft);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
  .kdn-gr-cls-sort button[aria-pressed="true"]{background:var(--kdn-panel);border-color:var(--kdn-panel);color:#fff}
  .kdn-gr-cls-chart{display:grid;gap:4px;padding:14px 16px;border-radius:16px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kdn-gr-cls-row,.kdn-gr-cls-colhead{display:grid;grid-template-columns:118px minmax(0,1fr) 78px minmax(160px,300px);gap:16px;align-items:center}
  .kdn-gr-cls-colhead{padding-bottom:6px;font-size:12.5px;font-weight:700;color:var(--kdn-muted)}.kdn-gr-cls-colhead small{font-weight:500}
  .kdn-gr-cls-row{padding:9px 0;border-top:1px solid var(--kdn-line)}
  .kdn-gr-cls-row .lbl{display:flex;align-items:center;gap:8px}.kdn-gr-cls-row .lbl b{font-size:15.5px;color:var(--kdn-ink)}.kdn-gr-cls-row .lbl small{font-size:12px;color:var(--kdn-muted)}
  .kdn-gr-cls .rk{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:999px;background:var(--kdn-surface-2);color:var(--kdn-ink-soft);font-size:12.5px;font-weight:800}
  .kdn-gr-cls .rk.top{background:var(--kdn-accent-soft);color:var(--kdn-accent-text);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--kdn-accent) 45%,transparent)}
  .kdn-gr-cls-row .bartrack{position:relative;height:30px;border-radius:8px;background:var(--kdn-surface-2)}
  .kdn-gr-cls-row .bar{position:absolute;left:0;top:0;bottom:0;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;border-radius:8px;background:color-mix(in srgb,var(--kdn-ink-soft) 30%,var(--kdn-surface-2));box-sizing:border-box;min-width:46px}
  .kdn-gr-cls-row.is-top .bar{background:var(--kdn-accent)}
  .kdn-gr-cls-row .bar b{font-size:14.5px;font-weight:800;color:var(--kdn-ink);font-variant-numeric:tabular-nums}
  .kdn-gr-cls-row.is-top .bar b{color:var(--kdn-accent-ink)}
  .kdn-gr-cls-row .avgline{position:absolute;top:-4px;bottom:-4px;z-index:1;border-left:2px dashed var(--kdn-ink);opacity:.55}
  .kdn-gr-cls-row .gap{font-size:13.5px;font-weight:800;text-align:right;font-variant-numeric:tabular-nums}
  .kdn-gr-cls .up{color:#15803d}.kdn-gr-cls .down{color:#c0262d}
  [data-kd-ui="dark"] .kdn-gr-cls .up{color:#6ee7a0}[data-kd-ui="dark"] .kdn-gr-cls .down{color:#ff9b8f}
  .kdn-gr-cls-row .grades{display:flex;gap:2px;height:30px;border-radius:8px;overflow:hidden}
  .kdn-gr-cls-row .grades span{display:grid;place-items:center;min-width:0;font-size:12.5px;font-weight:800}
  .kdn-gr-cls-chart .legend{display:flex;flex-wrap:wrap;gap:6px 14px;padding-top:8px;border-top:1px solid var(--kdn-line);font-size:12px;color:var(--kdn-muted)}
  .kdn-gr-cls-chart .legend span{display:inline-flex;align-items:center;gap:5px}.kdn-gr-cls-chart .legend i{display:inline-block;width:10px;height:10px;border-radius:3px}
  .kdn-gr-cls-chart .legend i.bar{background:var(--kdn-accent)}.kdn-gr-cls-chart .legend i.avgline{width:0;height:12px;border-left:1.5px dashed var(--kdn-muted);border-radius:0}
  .kdn-gr-cls-tablewrap{overflow-x:auto;border-radius:16px;border:1px solid var(--kdn-line);background:var(--kdn-surface)}
  .kdn-gr-cls-table{width:100%;min-width:720px;border-collapse:collapse;font-size:14px;color:var(--kdn-ink-soft)}
  .kdn-gr-cls-table caption{caption-side:top;text-align:left;padding:12px 14px 4px;font-size:14px;font-weight:800;color:var(--kdn-ink)}
  .kdn-gr-cls-table th{padding:10px 12px;font-size:12.5px;font-weight:700;color:var(--kdn-ink-soft);background:var(--kdn-surface-2);border-bottom:1.5px solid var(--kdn-control-line);border-right:1px solid var(--kdn-line);text-align:center;white-space:nowrap}
  .kdn-gr-cls-table td{padding:10px 12px;border-bottom:1px solid var(--kdn-line);border-right:1px solid var(--kdn-line);text-align:center;font-variant-numeric:tabular-nums;white-space:nowrap}
  .kdn-gr-cls-table th:last-child,.kdn-gr-cls-table td:last-child{border-right:0}
  .kdn-gr-cls-table td b{color:var(--kdn-ink)}.kdn-gr-cls-table td small{font-size:11.5px}
  .kdn-gr-cls-table tr.total td{background:var(--kdn-surface-2)}
  @media (max-width:900px){.kdn-gr-cls-row,.kdn-gr-cls-colhead{grid-template-columns:92px minmax(0,1fr) 60px}.kdn-gr-cls-row .grades{grid-column:1/-1}.kdn-gr-cls-colhead>span:last-child{display:none}}
  /* 성적 산출 결과 확인 (새 UI): 시험 탭 · 요약 줄 · 등급컷 카드 */
  .kdn-rs-tabs{display:inline-flex;flex-wrap:wrap;gap:3px;padding:3px;margin:4px 0 12px;border-radius:12px;background:var(--kdn-surface-2)}
  .kdn-rs-tabs button{display:inline-flex;align-items:center;gap:5px;min-height:38px;padding:0 15px;border:0;border-radius:9px;background:transparent;color:var(--kdn-muted);font:inherit;font-size:14.5px;font-weight:700;cursor:pointer}
  .kdn-rs-tabs button[aria-selected="true"]{background:var(--kdn-panel);color:#fff}
  .kdn-rs-tabs button.is-min[aria-selected="true"]{background:#15803d}
  .kdn-rs-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px}
  .kdn-rs-bar .kdn-view-switch{margin:0 0 0 auto!important}
  .kdn-rs-stats{display:flex;flex-wrap:wrap;gap:8px}
  .kdn-rs-stats>span{display:inline-flex;align-items:baseline;gap:5px;padding:7px 12px;border-radius:10px;background:var(--kdn-surface-2);font-size:13px;color:var(--kdn-muted)}
  .kdn-rs-stats b{font-size:18px;color:var(--kdn-ink);font-variant-numeric:tabular-nums}.kdn-rs-stats small{font-size:12px}
  .kdn-rs-stats .is-warn{background:#fff4d9;color:#8a5a0b}.kdn-rs-stats .is-warn b{color:#8a5a0b}
  [data-kd-ui="dark"] .kdn-rs-stats .is-warn{background:#3a2a17;color:#f2c58a}[data-kd-ui="dark"] .kdn-rs-stats .is-warn b{color:#f2c58a}
  .kdn-cutcards-hint{margin-left:8px;font-size:12px;font-weight:500;color:var(--kdn-muted)}
  .kdn-cutcards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:10px}
  .kdn-cutcards.is-9{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}
  .kdn-cutcard{display:grid;gap:5px;padding:12px 14px;border-radius:14px;background:var(--kdn-surface-2);border-top:4px solid var(--c)}
  .kdn-cutcard .g{justify-self:start;padding:2px 10px;border-radius:99px;background:var(--c);color:#fff;font-size:13px;font-weight:800}
  .kdn-cutcard small{font-size:12px;color:var(--kdn-muted)}
  .kdn-cutcard .v{font-size:25px;font-weight:800;color:var(--kdn-ink);font-variant-numeric:tabular-nums}
  .kdn-cutcard .meter{position:relative;height:8px;border-radius:99px;background:var(--kdn-line)}
  .kdn-cutcard .meter i{position:absolute;left:0;top:0;bottom:0;border-radius:99px;background:var(--c)}
  .kdn-cutcard .meter em{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;background:var(--kdn-ink)}
  .kdn-cutcard .cnt{display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 6px;font-size:12.5px;color:var(--kdn-muted)}.kdn-cutcard .cnt b{color:var(--kdn-ink)}
  @media (max-width:900px){.kdn-cutcards{grid-template-columns:repeat(2,minmax(0,1fr))}.kdn-rs-bar .kdn-view-switch{margin:0!important}}
  .kdn-calc{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,460px);gap:18px}
  @media (max-width:980px){.kdn-calc{grid-template-columns:minmax(0,1fr)}}
  .kdn-calc-input{display:flex;flex-direction:column;gap:20px;padding:26px 28px;border-radius:22px;background:var(--kdn-surface);border:1px solid var(--kdn-line)}
  .kdn-calc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
  .kdn-calc-head>div{display:grid;gap:4px}
  .kdn-calc-head b{font-size:22px;font-weight:800;color:var(--kdn-ink)}
  .kdn-calc-head span{font-size:14px;color:var(--kdn-muted)}
  .kdn-calc-head em{font-style:normal;padding:6px 12px;border-radius:999px;background:#e8f7ee;color:#166534;font-size:13px;font-weight:600;white-space:nowrap}
  .kdn-calc-row{display:grid;grid-template-columns:200px minmax(0,1fr);gap:16px}
  @media (max-width:640px){.kdn-calc-row{grid-template-columns:minmax(0,1fr)}}
  .kdn-calc-field{display:flex;flex-direction:column;gap:8px;font-size:14px;font-weight:600;color:var(--kdn-ink-soft)}
  .kdn-calc-field input,.kdn-calc-field select,.kdn-calc-static{height:60px;padding:0 16px;border-radius:14px;border:1.5px solid var(--kdn-control-line);background:var(--kdn-surface);color:var(--kdn-ink);font:inherit;font-size:17px;font-weight:600;box-sizing:border-box;display:flex;align-items:center}
  .kdn-calc-field.is-grade input{font-family:var(--kdn-num-font);font-size:28px;font-weight:700}
  .kdn-calc-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .kdn-calc-choice{display:flex;flex-direction:column;gap:6px;align-items:flex-start;padding:16px 18px;border-radius:16px;border:1.5px solid var(--kdn-control-line);background:var(--kdn-surface);font:inherit;text-align:left;color:var(--kdn-ink);cursor:pointer}
  .kdn-calc-choice.is-on{border:2px solid var(--kdn-accent);background:var(--kdn-accent-soft)}
  .kdn-calc-choice b{font-size:16px;font-weight:800;display:inline-flex;gap:6px;align-items:center}
  .kdn-calc-choice b em{font-style:normal;font-size:11.5px;padding:2px 7px;border-radius:999px;background:var(--kdn-accent);color:var(--kdn-accent-ink)}
  .kdn-calc-choice span{font-size:13px;font-weight:500;color:var(--kdn-muted)}
  .kdn-calc-choice strong{font-family:var(--kdn-num-font);font-size:22px;font-weight:700;color:var(--kdn-ink-soft)}
  .kdn-calc-inline{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:14px;font-weight:600;color:var(--kdn-ink-soft)}
  .kdn-calc-inline select{height:44px;padding:0 14px;border-radius:12px;border:1.5px solid var(--kdn-control-line);background:var(--kdn-surface);color:var(--kdn-ink);font:inherit;font-size:15px}
  .kdn-calc-inline select:disabled{opacity:.5}
  .kdn-calc-inline small{font-size:13px;font-weight:500;color:var(--kdn-muted)}
  .kdn-calc-result{display:flex;flex-direction:column;gap:14px;padding:26px 28px;border-radius:22px;background:linear-gradient(160deg,#17181d 0%,#27211c 100%)!important;color:#f4f1ea;border:1px solid #3a2d24}
  .kdn-calc-eyebrow{font-size:14px;font-weight:600;color:#ffb089;letter-spacing:.04em}
  .kdn-calc-big{display:flex;align-items:baseline;gap:12px}
  .kdn-calc-big b{font-family:var(--kdn-num-font);font-size:80px;font-weight:700;line-height:.95;letter-spacing:-.03em;color:#ffffff}
  .kdn-calc-big span{font-size:16px;color:#cfccc5}
  .kdn-calc-sub{font-size:15px;color:#cfccc5}
  .kdn-calc-sub b{color:#ffffff;font-weight:600}
  .kdn-calc-scale{position:relative;height:40px;margin-top:4px}
  .kdn-calc-scale .track{position:absolute;left:0;right:0;top:16px;height:8px;border-radius:999px;background:rgba(255,255,255,.14)}
  .kdn-calc-scale .band{position:absolute;top:12px;height:16px;min-width:8px;border-radius:6px;background:rgba(255,122,61,.45)}
  .kdn-calc-scale .ghost{position:absolute;top:8px;width:3px;height:24px;margin-left:-1.5px;border-radius:2px;background:#9aa0ab}
  .kdn-calc-scale .mark{position:absolute;top:4px;width:4px;height:32px;margin-left:-2px;border-radius:2px;background:#ff7a3d}
  .kdn-calc-axis{display:flex;justify-content:space-between;font-size:12px;color:#9aa0ab;margin-top:-8px}
  .kdn-calc-compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .kdn-calc-compare>div{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.06)}
  .kdn-calc-compare>div.is-accent{background:rgba(255,122,61,.14)}
  .kdn-calc-compare span{font-size:12.5px;color:#9aa0ab}
  .kdn-calc-compare>div.is-accent span{color:#ffb089}
  .kdn-calc-compare b{font-family:var(--kdn-num-font);font-size:22px;color:#ffffff}
  .kdn-calc-compare b small{font-size:13px;color:#ffb089}
  .kdn-calc-result p{margin:0;font-size:12.5px;line-height:1.6;color:#9aa0ab}
  .kdn-calc-next{margin-top:auto;min-height:52px;border-radius:14px;border:0;background:#ff7a3d;color:#1b1006;font:inherit;font-size:16px;font-weight:800;cursor:pointer}
  /* NAVI: 선택된 큰 탭은 주황 그라데이션, 기준 설정 안 작은 단계는 얇은 진행 줄, 패널 위쪽 강조선 */
  :root .susi-beta-view-tabs button[role="tab"][aria-selected="true"]{background:linear-gradient(135deg,#ff8a4c,#d9480f)!important;border-color:transparent!important;box-shadow:0 8px 20px rgba(217,72,15,.28)!important;color:#ffffff!important}
  :root .susi-beta-view-tabs button[role="tab"][aria-selected="true"] b,:root .susi-beta-view-tabs button[role="tab"][aria-selected="true"] small{color:#ffffff!important;opacity:.95}
  :root .susi-beta-view-toolbar [role="tab"][aria-selected="true"]>span{background:#ffffff!important;color:#d9480f!important}
  /* 페이지 단계 탭: 각 단계를 테두리 있는 칸으로 나누고, 현재 단계는 진한 칸으로 확실히 구분 */
  .kdn-substeps{display:grid!important;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:10px!important;padding:0!important;margin:20px 0 16px!important;background:transparent!important;border:0!important}
  @media (max-width:760px){.kdn-substeps{grid-auto-flow:row}}
  .kdn-substeps button{position:relative;padding:12px 16px!important;border-radius:14px!important;border:1.5px solid var(--kdn-line)!important;background:var(--kdn-surface)!important;box-shadow:none!important;transition:border-color .15s,background .15s}
  .kdn-substeps button:hover{border-color:var(--kdn-control-line)!important;background:var(--kdn-surface-2)!important}
  .kdn-substeps button.is-active{background:var(--kdn-ink)!important;border-color:var(--kdn-ink)!important;box-shadow:0 8px 20px rgba(20,24,33,.18)!important}
  .kdn-substeps button.is-active>b{color:var(--kdn-surface)!important}
  .kdn-substeps button.is-active>small{color:var(--kdn-surface)!important;opacity:.75}
  .kdn-substeps button.is-active>span{background:var(--kdn-accent)!important;color:var(--kdn-accent-ink)!important}
  .kdn-substeps button+button::before{content:"›";position:absolute;left:-9px;top:50%;transform:translateY(-50%);color:var(--kdn-muted);font-size:16px;font-weight:700}
  @media (max-width:760px){.kdn-substeps button+button::before{display:none}}
  .kdn-accent-panel{position:relative;overflow:hidden}
  .kdn-accent-panel::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,#ff8a4c,#d9480f 60%,transparent)}
  .kdn-step-badge{background:linear-gradient(135deg,#ff8a4c,#d9480f)!important;color:#ffffff!important;border-radius:999px!important;box-shadow:0 3px 8px rgba(217,72,15,.3)}
  /* 관리자 시간표 데이터: 4단계 + 보조 보기 탭, 업로드 안의 파일 선택 → 미리보기 → 반영 표시 */
  .kdn-admin-steps{grid-template-columns:repeat(4,minmax(0,1fr));margin:6px 0 14px}
  .kdn-admin-aux-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 10px}
  .kdn-admin-aux-tabs button{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border-radius:999px;border:1px solid var(--kdn-control-line);background:var(--kdn-surface);color:var(--kdn-ink-soft);font-size:13px;font-weight:600;cursor:pointer}
  .kdn-admin-aux-tabs button[aria-pressed="true"]{border-color:var(--kdn-accent);background:var(--kdn-accent-soft);color:var(--kdn-accent-text);font-weight:800}
  .kdn-upload-stages{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}
  .kdn-upload-stages span{display:inline-flex;align-items:center;gap:8px;min-height:34px;padding:0 14px 0 6px;border-radius:999px;border:1px solid var(--kdn-line);background:var(--kdn-surface);color:var(--kdn-muted);font-size:13.5px;font-weight:600}
  .kdn-upload-stages span b{width:24px;height:24px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:var(--kdn-surface-2);color:var(--kdn-ink-soft);font-size:12.5px}
  .kdn-upload-stages span.is-active{border-color:var(--kdn-accent);background:var(--kdn-accent-soft);color:var(--kdn-accent-text)}
  .kdn-upload-stages span.is-active b{background:var(--kdn-accent);color:var(--kdn-accent-ink)}
  .kdn-upload-stages span.is-done{color:var(--kdn-ink-soft)}
  .kdn-upload-box.is-collapsed{display:none!important}
  .kdn-upload-done{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 12px;padding:12px 16px;border-radius:12px;border:1px solid #9fd6b2;background:#eaf8ef;color:#1d5c34;font-size:14px}
  .kdn-upload-done button{min-height:40px;padding:0 16px;border-radius:10px;border:0;background:var(--kdn-accent);color:var(--kdn-accent-ink);font-weight:800;cursor:pointer}
  /* 성적 산출·최성보: 진한 배너 대신 대시보드식 페이지 머리(큰 제목 + 설명 + 오른쪽 버튼).
     주요 동작(학교 공동 저장 / 출결 확인 저장)만 강조색, 나머지는 테두리 버튼 */
  .kdn-notice-hero{background:transparent!important;border:0!important;box-shadow:none!important;padding:6px 2px 4px!important;color:var(--kdn-ink)!important}
  .kdn-notice-hero span{color:var(--kdn-accent-text)!important;font-size:13px!important;font-weight:600!important;opacity:1!important}
  .kdn-notice-hero h1{color:var(--kdn-ink)!important;font-size:30px!important;font-weight:900!important;letter-spacing:-.025em!important;margin:4px 0!important}
  .kdn-notice-hero p{color:var(--kdn-muted)!important;font-size:15px!important;font-weight:500!important;opacity:1!important;margin:0!important}
  .teacher-grade-hero,.minimum-hero{background:transparent!important;border:0!important;box-shadow:none!important;padding:6px 2px 4px!important;color:var(--kdn-ink)!important;align-items:end!important}
  .teacher-grade-hero::before,.teacher-grade-hero::after,.minimum-hero::before,.minimum-hero::after{display:none!important}
  .teacher-grade-hero-copy>div:first-child,.minimum-hero>div:first-child>span:first-child{color:var(--kdn-accent-text)!important;font-size:13px!important;font-weight:600!important;opacity:1!important;letter-spacing:.01em}
  .teacher-grade-hero h2,.minimum-hero h2{color:var(--kdn-ink)!important;font-size:30px!important;font-weight:900!important;letter-spacing:-.025em!important;margin:4px 0 4px!important;line-height:1.2!important}
  .teacher-grade-hero p,.minimum-hero p{color:var(--kdn-muted)!important;font-size:15px!important;font-weight:500!important;opacity:1!important;margin:0!important}
  .teacher-grade-hero-actions button,.minimum-hero-actions button{min-height:42px!important;padding:0 16px!important;border-radius:12px!important;border:1px solid var(--kdn-control-line)!important;background:var(--kdn-surface)!important;color:var(--kdn-ink)!important;font-size:14px!important;font-weight:700!important;box-shadow:none!important;opacity:1}
  .teacher-grade-hero-actions button:nth-child(2),.minimum-hero-actions button:nth-child(2){background:var(--kdn-accent)!important;border-color:var(--kdn-accent)!important;color:var(--kdn-accent-ink)!important}
  .teacher-grade-hero-actions button:disabled,.minimum-hero-actions button:disabled{opacity:.45!important;cursor:not-allowed}
  .teacher-grade-hero-actions,.minimum-hero-actions{display:flex!important;flex-wrap:wrap;gap:8px!important;justify-content:flex-end}
  /* 화면 안 보조 탭(성적 산출/데이터 관리, 현황 확인/데이터 관리): 알약 묶음 */
  .teacher-grade-module-tabs{justify-self:start;align-self:start}
  .teacher-grade-module-tabs,.minimum-module-toolbar>div:first-child{display:inline-flex!important;gap:2px!important;padding:4px!important;border-radius:14px!important;background:var(--kdn-surface-2)!important;border:1px solid var(--kdn-line)!important;box-shadow:none!important;width:auto!important}
  .teacher-grade-module-tabs button,.minimum-module-toolbar>div:first-child button{min-height:38px!important;padding:0 14px!important;border-radius:10px!important;border:0!important;background:transparent!important;color:var(--kdn-ink-soft)!important;font-size:14px!important;font-weight:600!important;box-shadow:none!important}
  .teacher-grade-module-tabs button[style*="kdn-accent"],.minimum-module-toolbar>div:first-child button[style*="kdn-accent"]{background:var(--kdn-surface)!important;color:var(--kdn-accent-text)!important;font-weight:800!important;box-shadow:0 1px 3px rgba(20,24,33,.14)!important}
  .minimum-open-gradecalc{color:var(--kdn-ink-soft)!important}
  /* NAVI 대학 상세: 검색·필터·적용 조건을 한 상자(툴바)로. 검색 줄이 맨 위 */
  .kdn-navi-toolbar{display:flex;flex-direction:column;gap:14px;padding:16px 18px;border:1px solid var(--kdn-line);border-radius:16px;background:var(--kdn-surface)}
  .kdn-navi-toolbar>*{border:0!important;background:transparent!important;box-shadow:none!important;padding:0!important}
  .kdn-navi-toolbar>.susi-beta-detail-search{order:-1}
  .kdn-navi-toolbar>.susi-beta-result-controls+div{padding-top:12px!important;border-top:1px solid var(--kdn-line)!important}
  .kdn-navi-toolbar label>span{font-size:13px!important}
  /* NAVI 결과 카드: 전형별 '수시지원 추가'는 테두리 버튼으로(강조 버튼이 너무 많지 않게), 펼친 상세는 전형 카드를 넓게 */
  .susi-beta-result-card button.kd-support-plan-button.kd-support-plan-button.is-compact:not(.is-saved){background:transparent;color:var(--kdn-accent-text);border-color:var(--kdn-accent);box-shadow:none;min-height:38px}
  .susi-beta-result-card button.kd-support-plan-button.kd-support-plan-button.is-compact:not(.is-saved):hover{background:var(--kdn-accent);color:var(--kdn-accent-ink)}
  .kdn-result-body{display:grid!important;grid-template-columns:minmax(0,1fr)!important}
  .kdn-result-body>.susi-beta-result-identity{order:2;display:grid!important;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;align-items:start}
  /* 관리자: 상단 탭 줄을 왼쪽 메뉴로 */
  .kdn-admin-layout{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
  .kdn-admin-layout>.kdn-admin-nav{flex:1 1 210px;max-width:260px;flex-direction:column!important;flex-wrap:nowrap!important;gap:4px!important;padding:10px;border-radius:20px;background:var(--kdn-surface);border:1px solid var(--kdn-line);position:sticky;top:84px}
  .kdn-admin-layout>.kdn-admin-nav>button{width:100%;justify-content:flex-start;min-height:44px;padding:0 14px!important;font-size:14px!important;border-radius:12px!important;border-color:transparent!important}
  .kdn-admin-layout>.kdn-admin-main{flex:999 1 640px;min-width:0}
  @media (max-width:760px){.kdn-admin-layout>.kdn-admin-nav{max-width:none;flex-direction:row!important;overflow-x:auto;position:static}.kdn-admin-layout>.kdn-admin-nav>button{width:auto;flex:none;white-space:nowrap}}
  /* 시간표: 지금 교시 칸 강조(화면에서만) */
  @media screen{.kdn-now-cell{box-shadow:inset 0 0 0 3px var(--kdn-accent)!important;position:relative}}
  /* 상담 기록: 날짜순 타임라인(최근 기록에 강조색 점) */
  .kdn-note-timeline:has(>.counseling-print-note){position:relative;margin-left:6px;padding-left:22px!important;border-left:2px solid var(--kdn-line)}
  .kdn-note-timeline>.counseling-print-note{position:relative}
  .kdn-note-timeline>.counseling-print-note::before{content:"";position:absolute;left:-31px;top:18px;width:12px;height:12px;border-radius:50%;background:var(--kdn-line);box-shadow:0 0 0 3px var(--kdn-bg)}
  .kdn-note-timeline>.counseling-print-note:first-child::before{background:var(--kdn-accent)}
  .kd-legacy-section-header{display:none!important}
  .kd-quick-links-trigger{background:var(--kdn-surface-2)!important;color:var(--kdn-ink)!important;border-color:var(--kdn-line)!important}
  .kd-history-edge{background:var(--kdn-surface)!important;color:var(--kdn-ink-soft)!important;border-color:var(--kdn-line)!important}
  .kd-history-edge:hover:not(:disabled){background:var(--kdn-accent)!important;color:var(--kdn-accent-ink)!important;border-color:var(--kdn-accent)!important}
  @media (max-width: 760px){
    .kdn-nav-inner{gap:10px!important;padding:10px 14px 0!important}
    .kdn-nav-tabs{order:3;flex:1 1 100%!important;flex-wrap:nowrap!important;overflow-x:auto;scrollbar-width:none;margin:0 -14px;padding:0 6px}
    .kdn-nav-tabs::-webkit-scrollbar{display:none}
    .kdn-nav-tabs>button{white-space:nowrap;padding:12px 10px 10px!important;flex:none}
    .kdn-nav-actions{gap:6px!important}
    .kdn-brand-sub{display:none}
    .kdn-nav-clock-date,.kdn-nav-clock-period{display:none}
    .kdn-mode-long{display:none}.kdn-mode-short{display:inline}
  }`;

export function applyUiModeToDocument(mode = ACTIVE_MODE) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.kdUi = mode;
  if (mode === "classic") return;
  if (!document.getElementById("kd-ui-mode-base")) {
    const base = document.createElement("style");
    base.id = "kd-ui-mode-base";
    base.textContent = (BASE_CSS[mode] || "") + SHARED_NEW_CSS;
    document.head.appendChild(base);
  }
  const sweep = () => { for (const sheet of Array.from(document.styleSheets)) mapSheet(sheet, mode); };
  sweep();
  // 지연 로딩되는 화면이 나중에 붙이는 CSS(<style>/<link>)도 같은 모드로 변환합니다.
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeName === "LINK") node.addEventListener("load", () => mapSheet(node.sheet, mode), { once: true });
      if (node.nodeName === "STYLE" || node.nodeName === "LINK") mapSheet(node.sheet, mode);
    }
  }).observe(document.head, { childList: true });
}
