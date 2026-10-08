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
const DARK_PAGE_BG = "#1d1e24";

function swapKey(rgb, a) { return a >= 0.999 ? formatColor(rgb, 1) : null; }

// 다크 모드: 역할별 밝기 재배치. L/C는 OKLCH 기준(0~1).
function darkMap(role, [L, C, H]) {
  if (role === "bg") {
    if (L >= 0.8) return [0.28 + (1 - L) * 1.0, Math.min(C * 1.6, 0.06), H];
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
    if (L >= 0.75) return [0.38 + (1 - L) * 0.3, C * 0.8, H];
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
export function mapElementProps(type, props, mode = ACTIVE_MODE) {
  if (mode === "classic" || !props) return props;
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
    :root{color-scheme:dark;--kdn-bg:#1d1e24;--kdn-surface:#272830;--kdn-surface-2:#31323c;--kdn-line:#3b3c47;--kdn-ink:#f4f1ea;--kdn-ink-soft:#e8e5df;--kdn-muted:#cfccc5;--kdn-accent:#ff7a3d;--kdn-accent-ink:#1b1006;--kdn-accent-soft:#3a2a20;--kdn-accent-text:#ffb089;--kdn-hero-art:#1f2238;--kdn-panel:#2e3040;--kdn-control-line:#50525f}
    html,body{background:#1d1e24;color:#f4f1ea;word-break:keep-all;overflow-wrap:break-word}
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
  .kdn-step-back{margin-bottom:12px;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--kdn-control-line);background:var(--kdn-surface);color:var(--kdn-ink-soft);font-size:13.5px;font-weight:600;cursor:pointer}
  /* 성적 산출·최성보: 진한 배너 대신 대시보드식 페이지 머리(큰 제목 + 설명 + 오른쪽 버튼).
     주요 동작(학교 공동 저장 / 출결 확인 저장)만 강조색, 나머지는 테두리 버튼 */
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
