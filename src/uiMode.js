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
    if (L < 0.7) return [Math.min(0.95, 0.95 - (Math.max(L, 0.2) - 0.2) * 0.45), C > 0.04 ? Math.min(C, 0.16) : C, H];
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
  if ((role === "bg" || role === "border") && L >= 0.88 && C < 0.03) return [L, Math.min(C, 0.004), 4.4];
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

const ROUND_FONT = "'NanumSquareRound'";
function roleForProperty(name) {
  const p = name.toLowerCase().replace(/-/g, "");
  if (p === "color" || p === "caretcolor" || p === "textdecorationcolor" || p === "webkittextfillcolor") return "text";
  if (p.startsWith("background")) return "bg";
  if (p.startsWith("border") || p.startsWith("outline")) return p.includes("radius") || p.includes("width") || p.includes("style") || p.includes("collapse") || p.includes("spacing") || p.includes("image") ? null : "border";
  if (p === "fill" || p === "stroke" || p === "stopcolor" || p === "floodcolor") return "graphic";
  return null;
}

function mapFontFamily(value, mode) {
  if (mode === "classic" || typeof value !== "string" || !/KDRound/.test(value) || value.includes("NanumSquareRound")) return value;
  return `${ROUND_FONT},${value}`;
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

const styleCache = new WeakMap();
export function mapStyleObject(style, mode = ACTIVE_MODE) {
  if (mode === "classic" || !style || typeof style !== "object") return style;
  const cached = styleCache.get(style);
  if (cached) return cached;
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
    styleCache.set(style, out);
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
  const result = out || style;
  styleCache.set(style, result);
  return result;
}

const cssTextCache = new Map();
export function mapCssText(css, mode = ACTIVE_MODE) {
  if (mode === "classic" || typeof css !== "string") return css;
  const cacheKey = `${mode}|${css}`;
  if (cssTextCache.has(cacheKey)) return cssTextCache.get(cacheKey);
  const result = css.replace(/([a-zA-Z-]+)(\s*:\s*)([^;{}]+)/g, (whole, prop, sep, value) => {
    if (prop.toLowerCase() === "font-family") return prop + sep + mapFontFamily(value, mode);
    const role = roleForProperty(prop);
    return role ? prop + sep + mapColorsInValue(value, role, mode) : whole;
  });
  if (cssTextCache.size > 200) cssTextCache.clear();
  cssTextCache.set(cacheKey, result);
  return result;
}

/* ---------- JSX props 변환 (src/kdjsx 런타임이 호출) ---------- */

const GRAPHIC_ATTRS = ["fill", "stroke", "stopColor", "floodColor"];
export function mapElementProps(type, props, mode = ACTIVE_MODE) {
  if (mode === "classic" || !props) return props;
  let out = null;
  const set = (key, value) => { if (value !== props[key]) { out ??= { ...props }; out[key] = value; } };
  if (props.style && typeof props.style === "object") set("style", mapStyleObject(props.style, mode));
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
      const next = name === "font-family" ? mapFontFamily(value, mode) : (roleForProperty(name) ? mapColorsInValue(value, roleForProperty(name), mode) : value);
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
    :root{color-scheme:dark;--kdn-bg:#1d1e24;--kdn-surface:#272830;--kdn-surface-2:#31323c;--kdn-line:#3b3c47;--kdn-ink:#f4f1ea;--kdn-ink-soft:#e0dcd4;--kdn-muted:#c8c4bc;--kdn-accent:#ff7a3d;--kdn-accent-ink:#1b1006;--kdn-accent-soft:#3a2a20;--kdn-accent-text:#ffb089;--kdn-hero-art:#191a2c;--kdn-panel:#2e3040}
    html,body{background:#1d1e24;color:#f4f1ea}
    ::selection{background:#ff7a3d55}`,
  light: `
    :root{color-scheme:light;--kdn-bg:#f4f5f8;--kdn-surface:#ffffff;--kdn-surface-2:#f0f1f5;--kdn-line:#dfe2e8;--kdn-ink:#1f2430;--kdn-ink-soft:#3a4150;--kdn-muted:#5d6574;--kdn-accent:#cf4a12;--kdn-accent-ink:#ffffff;--kdn-accent-soft:#fff0e6;--kdn-accent-text:#b23e0c;--kdn-hero-art:#e9ebf3;--kdn-panel:#2a3040}
    html,body{background:#f4f5f8;color:#1f2430}`,
};

// 다크 · 라이트 공통: 새 상단 메뉴의 모바일 배치, 겹치는 옛 머리 줄 숨김, 떠 있는 버튼 색 정리.
const SHARED_NEW_CSS = `
  .kdn-mode-short{display:none}
  @media screen{.kdn-print-only{display:none!important}}
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
  if (!document.getElementById("kd-ui-mode-font")) {
    const font = document.createElement("link");
    font.id = "kd-ui-mode-font";
    font.rel = "stylesheet";
    font.href = "https://cdn.jsdelivr.net/gh/moonspam/NanumSquareRound@1.0/nanumsquareround.min.css";
    document.head.appendChild(font);
  }
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
