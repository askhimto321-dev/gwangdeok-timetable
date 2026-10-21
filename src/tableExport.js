// 화면에 보이는 표를 그대로 엑셀(xlsx)로 저장합니다. 여러 줄 머리글(가로·세로 합치기)은 한 줄로 이어 붙여요.

// 표 → 2차원 칸 목록(합친 칸은 펼쳐서 같은 글자로 채움)
export function gridFromRows(rows) {
  const grid = [];
  rows.forEach((cells, r) => {
    grid[r] ||= [];
    let c = 0;
    cells.forEach(cell => {
      while (grid[r][c] !== undefined) c += 1;
      const rs = Math.max(1, cell.rowSpan || 1), cs = Math.max(1, cell.colSpan || 1);
      for (let i = 0; i < rs; i += 1) for (let j = 0; j < cs; j += 1) { (grid[r + i] ||= [])[c + j] = cell.text; }
      c += cs;
    });
  });
  const width = Math.max(0, ...grid.map(row => row.length));
  return grid.map(row => Array.from({ length: width }, (_, i) => row[i] ?? ""));
}
// 머리글 여러 줄 → 한 줄("학기별 전교과 평균 · 1학년 1학기"), 같은 글자는 한 번만
export function mergeHeader(headRows) {
  if (!headRows.length) return [];
  return headRows[0].map((_, col) => {
    const parts = [];
    headRows.forEach(row => { const t = String(row[col] || "").trim(); if (t && parts[parts.length - 1] !== t) parts.push(t); });
    return parts.join(" · ");
  });
}
// 숫자만 있는 칸은 숫자로(엑셀에서 계산·정렬 가능)
export function cellValue(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return /^-?\d+(\.\d+)?$/.test(t) && t.length < 15 && !/^0\d/.test(t) ? Number(t) : t;
}
// 칸 글자: 안쪽 요소마다 띄어 쓰기(예: '1.00' + '시작' → '1.00 시작'). 숨긴 요소는 뺌.
const textOf = el => {
  if (!el) return "";
  const parts = [];
  const walk = node => {
    if (node.nodeType === 3) { const t = node.nodeValue.trim(); if (t) parts.push(t); return; }
    if (node.nodeType !== 1) return;
    if (node.getAttribute?.("aria-hidden") === "true" || node.hidden) return;
    node.childNodes.forEach(walk);
  };
  walk(el);
  return parts.join(" ").replace(/\s+/g, " ").trim();
};
// 한 칸을 엑셀 여러 열로: 머리글 th data-x-sub="등급,원점수" · 본문 td data-x-parts='[2,88]'
const rowsOf = trs => Array.from(trs).map(tr => Array.from(tr.cells).flatMap(cell => {
  const base = { rowSpan: cell.rowSpan, colSpan: 1 };
  if (cell.dataset?.xHeads) { try { return JSON.parse(cell.dataset.xHeads).map(text => ({ ...base, text: String(text) })); } catch { /* 아래로 */ } }
  const subs = cell.dataset?.xSub ? cell.dataset.xSub.split(",") : null;
  if (subs) { const text = textOf(cell); return subs.map(sub => ({ ...base, text: `${text} ${sub}`.trim() })); }
  if (cell.dataset?.xParts) { try { return JSON.parse(cell.dataset.xParts).map(v => ({ ...base, text: v == null ? "" : String(v) })); } catch { /* 아래로 */ } }
  const span = cell.dataset?.xSpan ? Number(cell.dataset.xSpan) || cell.colSpan : cell.colSpan;
  if (cell.dataset?.x != null) return [{ ...base, colSpan: span, text: cell.dataset.x }];
  return [{ ...base, colSpan: span, text: textOf(cell) }];
}));

// 엑셀용으로 칸 정리: 오르내림 표시(▲0.01·▼0.28·= 0.00)와 '시작'은 빼고, '1위'는 숫자 1로
export function cleanCell(text) {
  let t = String(text ?? "").replace(/[▲▼△▽↑↓=＝]\s*[-+]?\d+(\.\d+)?/g, " ").replace(/(^|\s)시작(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
  const rank = t.match(/^(\d+)\s*위$/);
  if (rank) t = rank[1];
  return t;
}
const PAIR = /^(-?\d+(?:\.\d+)?)\s*→\s*(-?\d+(?:\.\d+)?)$/;
// 'A → B' 칸이 많은 열은 두 열로 나눕니다(머리글 '직전 → 최근 학기' → '직전' · '최근 학기')
export function splitPairColumns(header, body) {
  const width = Math.max(header.length, ...body.map(row => row.length));
  const outHead = [], outBody = body.map(() => []);
  for (let col = 0; col < width; col += 1) {
    const values = body.map(row => String(row[col] ?? "").trim()).filter(Boolean);
    const pairs = values.filter(v => PAIR.test(v)).length;
    if (values.length && pairs / values.length >= 0.5) {
      const h = String(header[col] ?? "");
      const [a, b] = h.includes("→") ? h.split("→").map(x => x.trim()) : [`${h} (이전)`, `${h} (최근)`];
      outHead.push(a || "이전", b || "최근");
      body.forEach((row, r) => { const m = String(row[col] ?? "").trim().match(PAIR); outBody[r].push(m ? m[1] : "", m ? m[2] : String(row[col] ?? "")); });
    } else {
      outHead.push(header[col] ?? "");
      body.forEach((row, r) => outBody[r].push(row[col] ?? ""));
    }
  }
  return { header: outHead, body: outBody };
}

export function tableToAoa(table, { split = true, dropDelta = false } = {}) {
  const headTrs = table.tHead ? table.tHead.rows : [];
  const bodyTrs = Array.from(table.tBodies || []).flatMap(tb => Array.from(tb.rows));
  let header = mergeHeader(gridFromRows(rowsOf(headTrs)));
  let rows = gridFromRows(rowsOf(bodyTrs)).map(row => row.map(v => (split ? cleanCell(v) : v)));
  if (split) ({ header, body: rows } = splitPairColumns(header, rows));
  let body = rows.map(row => row.map(cellValue));
  // 변화량 열 빼기(머리글에 '변화량'이 들어간 열)
  if (dropDelta && header.length) {
    const keepCol = header.map(h => !String(h).includes("변화량"));
    header = header.filter((_, i) => keepCol[i]);
    body = body.map(row => row.filter((_, i) => keepCol[i] !== false));
  }
  const aoa = header.length ? [header, ...body] : body;
  // 내용이 하나도 없는 열은 뺍니다(아이콘 열 등)
  const keep = (aoa[0] || []).map((_, col) => aoa.some(row => String(row[col] ?? "").trim() !== ""));
  return aoa.map(row => row.filter((_, col) => keep[col]));
}
const safeSheet = (name, used) => {
  let base = String(name || "표").replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "표";
  let out = base, n = 2;
  while (used.has(out)) out = `${base.slice(0, 26)} ${n++}`;
  used.add(out);
  return out;
};
const titleFor = table => {
  const label = table.getAttribute("aria-label") || table.caption?.innerText;
  if (label) return label;
  const box = table.closest("section, .cg-card, .mk-card, .kdn-card, [class*='card']");
  const head = box?.querySelector("h2, h3, h4, header b, .cg-table-title, b");
  return head ? textOf(head) : "";
};

// root 안의 보이는 표 → [{ title, aoa }] (칸은 나누고, 변화량은 아직 남겨 둠 → 고르는 창에서 뺄 수 있게)
export function collectVisibleTables(root) {
  if (!root) return [];
  const tables = Array.from(root.querySelectorAll("table")).filter(t => t.offsetParent !== null && t.rows.length > 1 && !t.closest(".no-export"));
  return tables.map((table, i) => ({ title: titleFor(table) || `표${i + 1}`, aoa: tableToAoa(table) })).filter(item => item.aoa.length > 1);
}
// 고른 열만 남기기(머리글 기준)
export function pickColumns(aoa, keep) {
  const set = keep instanceof Set ? keep : new Set(keep);
  const idx = (aoa[0] || []).map((h, i) => (set.has(String(h)) ? i : -1)).filter(i => i >= 0);
  return aoa.map(row => idx.map(i => row[i] ?? ""));
}
// 머리글을 묶음으로: '변화량' 열 / 'A · B' 는 A 묶음 / 나머지 기본 항목
export function columnGroups(headers = []) {
  const groups = [];
  const add = (name, header, label) => { let g = groups.find(x => x.name === name); if (!g) groups.push(g = { name, items: [] }); g.items.push({ header, label }); };
  headers.forEach(h => {
    const text = String(h);
    if (!text.trim()) return;
    if (text.includes("변화량")) add("성적 변화량", text, text.replace(/^.*·\s*/, "").replace(/\s*변화량.*$/, "") || text);
    else if (text.includes(" · ")) { const [head, ...rest] = text.split(" · "); add(head, text, rest.join(" · ")); }
    else add("기본 항목", text, text);
  });
  return groups;
}
// 글자 폭(한글·전각은 2칸) → 열 너비
const textWidth = v => Array.from(String(v ?? "")).reduce((w, ch) => w + (/[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? 2 : 1), 0);
export function columnWidths(aoa) {
  const head = aoa[0] || [];
  return head.map((h, col) => {
    const body = aoa.slice(1, 400).map(row => { const v = row[col]; return typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2) : v; });
    const valueW = Math.max(0, ...body.map(textWidth));
    const headW = Math.min(textWidth(h), 22); // 긴 머리글은 줄바꿈
    return { wch: Math.min(42, Math.max(6, valueW + 2, headW + 2)) };
  });
}
const BORDER = { style: "thin", color: { rgb: "D5DBE3" } };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const FONT = "맑은 고딕";
// 보기 좋게: 머리글(진한 바탕·흰 굵은 글씨·가운데·줄바꿈), 줄무늬, 테두리, 소수 2자리, 변화량 색(+초록/−빨강), 순위 1~3 강조
export function styleSheet(XLSX, sheet, aoa) {
  const head = aoa[0] || [];
  const decimalCol = head.map((_, col) => aoa.slice(1).some(row => typeof row[col] === "number" && !Number.isInteger(row[col])));
  const deltaCol = head.map(h => String(h).includes("변화량"));
  const leftCol = head.map(h => /이름|과목|대학|학과|내용|메모|비고|칸/.test(String(h)));
  const rankCol = head.map(h => /^(순위|등수)/.test(String(h).trim()));
  aoa.forEach((row, r) => row.forEach((value, c) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    const cell = sheet[ref] || (sheet[ref] = { t: "s", v: "" });
    if (r === 0) {
      cell.s = { font: { name: FONT, sz: 11, bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: "1F2937" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: BORDERS };
      return;
    }
    const zebra = r % 2 === 0;
    const style = { font: { name: FONT, sz: 11, color: { rgb: "1F2430" } }, alignment: { horizontal: leftCol[c] ? "left" : "center", vertical: "center" }, border: BORDERS };
    if (zebra) style.fill = { patternType: "solid", fgColor: { rgb: "F5F7FA" } };
    if (typeof value === "number") {
      if (deltaCol[c]) { cell.z = "+0.00;-0.00;0.00"; style.font.color = { rgb: value > 0 ? "15803D" : value < 0 ? "B91C1C" : "6B7280" }; style.font.bold = value !== 0; }
      else if (decimalCol[c]) cell.z = "0.00";
      if (rankCol[c] && value >= 1 && value <= 3) { style.font.bold = true; style.font.color = { rgb: "C2410C" }; style.fill = { patternType: "solid", fgColor: { rgb: "FFF1E6" } }; }
    }
    if (/미응시|미수강/.test(String(value))) style.font.color = { rgb: "B91C1C" };
    cell.s = style;
  }));
  sheet["!cols"] = columnWidths(aoa);
  sheet["!rows"] = [{ hpt: 30 }];
  if (aoa.length > 1 && head.length) sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: head.length - 1 } }) };
  sheet["!views"] = [{ state: "frozen", ySplit: 1, xSplit: 0, topLeftCell: "A2" }];
  return sheet;
}
async function loadStyled(loadXLSX) {
  try { const mod = await import("xlsx-js-style"); return mod.default?.utils ? mod.default : mod; } catch { return loadXLSX ? loadXLSX() : import("xlsx"); }
}
export async function writeWorkbook(tables, fileName, { loadXLSX } = {}) {
  const list = (tables || []).filter(t => t.aoa?.length && t.aoa[0]?.length);
  if (!list.length) return false;
  const XLSX = await loadStyled(loadXLSX);
  const book = XLSX.utils.book_new();
  const used = new Set();
  list.forEach((t, i) => {
    const sheet = XLSX.utils.aoa_to_sheet(t.aoa);
    styleSheet(XLSX, sheet, t.aoa);
    XLSX.utils.book_append_sheet(book, sheet, safeSheet(t.title || `표${i + 1}`, used));
  });
  XLSX.writeFile(book, String(fileName || "성적").replace(/[\\/:*?"<>|\s]+/g, "_").replace(/\.xlsx$/i, "") + ".xlsx", { cellStyles: true });
  return true;
}
// root 안의 보이는 표를 시트로 묶어 바로 저장(고르는 창 없이). 표가 없으면 false.
export async function exportVisibleTables(root, fileName, { loadXLSX, dropDelta = false } = {}) {
  const tables = collectVisibleTables(root).map(t => (dropDelta ? { ...t, aoa: pickColumns(t.aoa, (t.aoa[0] || []).filter(h => !String(h).includes("변화량"))) } : t));
  return writeWorkbook(tables, fileName, { loadXLSX });
}

// 화면의 한 부분을 보이는 모습 그대로 인쇄·PDF로(글꼴·색·표 그대로, 버튼은 빼고 스크롤 상자는 펼침)
export function printElement(el, { title = "인쇄", landscape = true } = {}) {
  if (typeof document === "undefined" || !el) return;
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(node => node.outerHTML).join("\n");
  const htmlAttrs = Array.from(document.documentElement.attributes).map(a => `${a.name}="${String(a.value).replace(/"/g, "&quot;")}"`).join(" ");
  const bodyClass = document.body.className || "";
  const extra = `@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:8mm}
    html,body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{margin:0;padding:0}
    .no-print,.mk-xlsx,.mk-print,.mk-picks,.mk-reset,button.ls-x,[data-print-hide]{display:none!important}
    .mk-scroll,.cg-table-wrap,[style*="max-height"],[style*="overflow"]{max-height:none!important;overflow:visible!important}
    table{page-break-inside:auto}tr{page-break-inside:avoid}thead{display:table-header-group}
    .mk-table th{position:static!important}`;
  const html = `<!doctype html><html ${htmlAttrs}><head><meta charset="utf-8"><title>${String(title).replace(/</g, "&lt;")}</title>${styles}<style>${extra}</style></head><body class="${bodyClass}">${el.outerHTML}</body></html>`;
  const frame = document.createElement("iframe");
  frame.title = title;
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1200px;height:800px;border:0";
  frame.onload = () => { window.setTimeout(() => { try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { frame.remove(); } }, 400); };
  frame.srcdoc = html;
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 300000);
}
