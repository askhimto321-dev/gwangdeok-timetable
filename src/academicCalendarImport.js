// 학사일정 파일 불러오기: 엑셀/CSV 첫 시트에서 '날짜(시작일)·종료일·일정·구분' 열을 찾아 일정 목록으로 바꿉니다.
// 날짜는 엑셀 날짜값, 2026-03-03, 2026.3.3, 2026/3/3, 20260303 형식을 받습니다.
const pad = n => String(n).padStart(2, "0");
const iso = (y, m, d) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : "";
};
export function normalizeCalendarDate(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return iso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const text = String(value).trim();
  let m = text.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  return "";
}
const HEAD = {
  date: /^(날짜|일자|시작일|시작|date)$/i,
  end: /^(종료일|종료|끝|end)$/i,
  label: /^(일정|행사|내용|일정명|label|title)$/i,
  kind: /^(구분|종류|분류|type)$/i,
};
export function parseCalendarRows(rows = []) {
  const clean = v => String(v ?? "").replace(/\s/g, "");
  const headerIndex = rows.findIndex(row => (row || []).some(cell => HEAD.date.test(clean(cell))) && (row || []).some(cell => HEAD.label.test(clean(cell))));
  if (headerIndex < 0) return { events: [], errors: ["'날짜'와 '일정' 열이 있는 머리글 줄을 찾지 못했습니다."] };
  const header = rows[headerIndex].map(clean);
  const col = key => header.findIndex(cell => HEAD[key].test(cell));
  const c = { date: col("date"), end: col("end"), label: col("label"), kind: col("kind") };
  const events = [], errors = [];
  rows.slice(headerIndex + 1).forEach((row, index) => {
    const label = String(row?.[c.label] ?? "").trim();
    const rawDate = row?.[c.date];
    if (!label && (rawDate == null || rawDate === "")) return;
    const date = normalizeCalendarDate(rawDate);
    if (!date || !label) { errors.push(`${headerIndex + index + 2}행: 날짜 또는 일정이 비어 있거나 형식이 맞지 않습니다.`); return; }
    const endDate = c.end >= 0 ? normalizeCalendarDate(row?.[c.end]) : "";
    events.push({ id: `ev-${date}-${events.length}`, date, ...(endDate && endDate > date ? { endDate } : {}), label: label.slice(0, 30), ...(c.kind >= 0 && row?.[c.kind] ? { kind: String(row[c.kind]).trim() } : {}) });
  });
  events.sort((a, b) => a.date.localeCompare(b.date));
  return { events, errors };
}
// '개학식'·'입학식' 일정으로 1·2학기 개학일을 추정합니다(2~4월 → 1학기, 7~9월 → 2학기).
export function semesterStartsFromEvents(events = []) {
  const starts = {};
  events.filter(event => /개학/.test(event.label)).forEach(event => {
    const month = Number(event.date.slice(5, 7));
    if (month >= 2 && month <= 4 && !starts.sem1Start) starts.sem1Start = event.date;
    if (month >= 7 && month <= 9 && !starts.sem2Start) starts.sem2Start = event.date;
  });
  return starts;
}
