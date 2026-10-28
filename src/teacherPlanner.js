// 선생님 개인 일정·알림(내 일정). 선생님마다 따로 저장하고, 미리 알림 날짜가 되면 선생님 ZONE 홈에 알려 줍니다.
// 순수 함수만 두어 테스트합니다(화면은 TeacherPlanner.jsx).

export const PLANNER_VERSION = 1;
export const plannerKey = owner => `kd_teacher_planner_v1:${String(owner || "").trim() || "shared"}`;
export const REMIND_OPTIONS = [
  [0, "당일"],
  [1, "하루 전"],
  [3, "3일 전"],
  [7, "1주 전"],
  [-1, "알림 없음"],
];
export const PLANNER_COLORS = ["orange", "blue", "green", "purple", "red"];

const pad = n => String(n).padStart(2, "0");
export const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const isDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
// 날짜 문자열 → 하루 단위 번호(시간대 영향 없이 비교)
export const dayNo = key => { const [y, m, d] = String(key).split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };

export const REPEAT_OPTIONS = [["none", "반복 안 함"], ["weekly", "매주"], ["monthly", "매월"]];
const cleanUrl = value => { const text = String(value || "").trim(); if (!text) return ""; const url = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`; return /^https?:\/\//i.test(url) ? url.slice(0, 600) : ""; };
export const normalizeLinks = list => (Array.isArray(list) ? list : []).map(link => ({ url: cleanUrl(link?.url ?? link), label: String(link?.label || "").trim().slice(0, 60) })).filter(link => link.url).slice(0, 8);
const normalizeFiles = list => (Array.isArray(list) ? list : []).filter(file => file && (file.dataKey || file.url || file.path)).map(file => ({ fileName: String(file.fileName || "첨부파일").slice(0, 120), dataKey: file.dataKey || "", url: file.url || "", path: file.path || "", size: Number(file.size) || 0 })).slice(0, 5);

export function normalizeItem(raw = {}) {
  const remind = Number(raw.remind);
  return {
    id: String(raw.id || `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`),
    date: isDateKey(raw.date) ? raw.date : "",
    time: /^\d{2}:\d{2}$/.test(String(raw.time || "")) ? raw.time : "",
    title: String(raw.title || "").trim().slice(0, 80),
    memo: String(raw.memo || "").trim().slice(0, 500),
    remind: REMIND_OPTIONS.some(([value]) => value === remind) ? remind : 1,
    color: PLANNER_COLORS.includes(raw.color) ? raw.color : "orange",
    important: !!raw.important,
    repeat: REPEAT_OPTIONS.some(([value]) => value === raw.repeat) ? raw.repeat : "none",
    repeatUntil: isDateKey(raw.repeatUntil) ? raw.repeatUntil : "",
    links: normalizeLinks(raw.links),
    files: normalizeFiles(raw.files),
    done: !!raw.done,
    doneDates: Array.isArray(raw.doneDates) ? raw.doneDates.filter(isDateKey).slice(-200) : [],
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}
export const normalizeItems = list => (Array.isArray(list) ? list : []).map(normalizeItem).filter(item => item.date && item.title)
  .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99") || a.title.localeCompare(b.title, "ko"));

const keyOfDay = day => { const d = new Date(day * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

// 반복 일정을 기간 안의 날짜마다 펼칩니다. 반복 일정의 '끝냄'은 날짜마다(doneDates) 따로 기록합니다.
export function expandOccurrences(items, fromKey, toKey) {
  const from = dayNo(fromKey), to = dayNo(toKey);
  const out = [];
  // 받은 일정의 보낸 사람·받는 사람 같은 덧붙은 칸은 그대로 둡니다.
  (Array.isArray(items) ? items : []).map(raw => ({ ...raw, ...normalizeItem(raw) })).filter(item => item.date && item.title).forEach(item => {
    const start = dayNo(item.date);
    const until = item.repeatUntil ? dayNo(item.repeatUntil) : Infinity;
    const push = day => { if (day < from || day > to || day > until || day < start) return; const date = keyOfDay(day); out.push({ ...item, date, baseDate: item.date, occKey: `${item.id}@${date}`, done: item.repeat === "none" ? item.done : item.doneDates.includes(date) }); };
    if (item.repeat === "weekly") { for (let day = start + Math.max(0, Math.ceil((from - start) / 7)) * 7; day <= to; day += 7) push(day); }
    else if (item.repeat === "monthly") {
      const [y, m, d] = item.date.split("-").map(Number);
      for (let i = 0; i < 400; i += 1) { const date = new Date(Date.UTC(y, m - 1 + i, d)); if (date.getUTCDate() !== d) continue; const day = Math.round(date.getTime() / 86400000); if (day > to) break; push(day); }
    } else push(start);
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99") || a.title.localeCompare(b.title, "ko"));
}
export const shiftKey = (key, days) => keyOfDay(dayNo(key) + days);

// 홈 알림: 아직 안 끝낸 일정 중 (1) 미리 알림 날짜가 된 것 (2) 날짜가 지났는데 안 끝낸 것(최근 14일).
export function plannerAlerts(items, now = new Date()) {
  const todayKey = dateKey(now), today = dayNo(todayKey);
  return expandOccurrences(items, shiftKey(todayKey, -14), shiftKey(todayKey, 7)).filter(item => !item.done).map(item => {
    const diff = dayNo(item.date) - today;
    const due = item.remind >= 0 && diff >= 0 && diff <= item.remind;
    // 반복 일정(매주 회의 등)의 지난 날짜는 '지남'으로 쌓지 않습니다.
    const overdue = diff < 0 && item.repeat === "none";
    return due || overdue ? { ...item, diff, overdue } : null;
  }).filter(Boolean).sort((a, b) => a.diff - b.diff);
}
// 마감 2일 전·1일 전 팝업 대상(알림 없음으로 둔 일정은 제외)
export function popupItems(items, now = new Date()) {
  const todayKey = dateKey(now), today = dayNo(todayKey);
  return expandOccurrences(items, shiftKey(todayKey, 1), shiftKey(todayKey, 2)).filter(item => !item.done && item.remind >= 0).map(item => ({ ...item, diff: dayNo(item.date) - today }));
}
// [오늘 할 일]: 오늘 일정 + 지난 미완료(최근 14일)
export function todayItems(items, now = new Date()) {
  const todayKey = dateKey(now), today = dayNo(todayKey);
  return expandOccurrences(items, shiftKey(todayKey, -14), todayKey).filter(item => item.date === todayKey || (!item.done && item.repeat === "none")).map(item => ({ ...item, diff: dayNo(item.date) - today, overdue: item.date !== todayKey }));
}
// 끝냄 표시 바꾸기(반복 일정은 그 날짜만)
export function toggleDoneIn(list, occ) {
  return list.map(item => {
    if (item.id !== occ.id) return item;
    if (item.repeat && item.repeat !== "none") { const dates = new Set(item.doneDates || []); if (dates.has(occ.date)) dates.delete(occ.date); else dates.add(occ.date); return { ...item, doneDates: Array.from(dates).sort() }; }
    return { ...item, done: !item.done };
  });
}

// ---- 받은 일정(관리자·학년부장 등이 지정한 선생님에게 보내는 일정) ----
export const ASSIGN_KEY = "kd_planner_assign_v1";
export function normalizeAssign(raw = {}) {
  const base = normalizeItem(raw);
  return { ...base, repeat: "none", from: { owner: String(raw.from?.owner || ""), name: String(raw.from?.name || "").slice(0, 40) }, to: Array.from(new Set((raw.to || []).map(String).filter(Boolean))), toLabel: String(raw.toLabel || "").slice(0, 80), doneBy: raw.doneBy && typeof raw.doneBy === "object" ? raw.doneBy : {} };
}
export function assignedFor(owner, assigns = []) {
  return (Array.isArray(assigns) ? assigns : []).map(normalizeAssign).filter(item => item.date && item.title && item.to.includes(owner)).map(item => ({ ...item, shared: true, done: !!item.doneBy[owner] }));
}

// ---- 외부 캘린더로 보내기 ----
const icsText = value => String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const compactDate = key => key.replace(/-/g, "");
const timeStamp = (key, time) => `${compactDate(key)}T${time.replace(":", "")}00`;
const plusHour = time => { const [h, m] = time.split(":").map(Number); return `${pad(Math.min(23, h + 1))}:${pad(m)}`; };
export function googleCalendarUrl(item) {
  const dates = item.time ? `${timeStamp(item.date, item.time)}/${timeStamp(item.date, plusHour(item.time))}` : `${compactDate(item.date)}/${compactDate(shiftKey(item.date, 1))}`;
  const details = [item.memo, ...(item.links || []).map(link => link.url)].filter(Boolean).join("\n");
  const params = new URLSearchParams({ action: "TEMPLATE", text: item.title, dates, details, ctz: "Asia/Seoul" });
  if (item.repeat === "weekly") params.set("recur", "RRULE:FREQ=WEEKLY");
  if (item.repeat === "monthly") params.set("recur", "RRULE:FREQ=MONTHLY");
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
export function plannerIcs(items, name = "KDTIME 내 일정") {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KDTIME//Planner//KO", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsText(name)}`, "X-WR-TIMEZONE:Asia/Seoul"];
  normalizeItems(items).forEach(item => {
    lines.push("BEGIN:VEVENT", `UID:${item.id}@kdtime`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`);
    if (item.time) lines.push(`DTSTART;TZID=Asia/Seoul:${timeStamp(item.date, item.time)}`, `DTEND;TZID=Asia/Seoul:${timeStamp(item.date, plusHour(item.time))}`);
    else lines.push(`DTSTART;VALUE=DATE:${compactDate(item.date)}`, `DTEND;VALUE=DATE:${compactDate(shiftKey(item.date, 1))}`);
    lines.push(`SUMMARY:${icsText(item.title)}`);
    const desc = [item.memo, ...(item.links || []).map(link => link.url)].filter(Boolean).join("\n");
    if (desc) lines.push(`DESCRIPTION:${icsText(desc)}`);
    if (item.repeat === "weekly") lines.push("RRULE:FREQ=WEEKLY");
    if (item.repeat === "monthly") lines.push("RRULE:FREQ=MONTHLY");
    if (item.remind > 0) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(item.title)}`, `TRIGGER:-P${item.remind}D`, "END:VALARM");
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
export const dLabel = diff => (diff === 0 ? "오늘" : diff === 1 ? "내일" : diff > 0 ? `D-${diff}` : `${-diff}일 지남`);

// 앞으로 days일 안의 일정(끝낸 것 포함, 오늘부터)
export function upcomingItems(items, now = new Date(), days = 30) {
  const today = dayNo(dateKey(now));
  return normalizeItems(items).filter(item => { const diff = dayNo(item.date) - today; return diff >= 0 && diff <= days; });
}

// 달력: 일요일 시작 6주(42칸). 칸마다 dateKey와 이번 달 여부.
export function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { key: dateKey(date), day: date.getDate(), inMonth: date.getMonth() === month, weekday: date.getDay() };
  });
}

// 학교 학사일정(여러 날 일정 포함)을 날짜별로 펼칩니다.
export function schoolEventsByDate(calendar) {
  const map = {};
  (calendar?.events || []).forEach(event => {
    if (!isDateKey(event?.date) || !event.label) return;
    const start = dayNo(event.date);
    const end = isDateKey(event.endDate) ? Math.max(start, dayNo(event.endDate)) : start;
    for (let day = start; day <= Math.min(end, start + 31); day += 1) {
      const d = new Date(day * 86400000);
      const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      (map[key] = map[key] || []).push(String(event.label));
    }
  });
  return map;
}
