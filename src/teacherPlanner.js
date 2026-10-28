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
    done: !!raw.done,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}
export const normalizeItems = list => (Array.isArray(list) ? list : []).map(normalizeItem).filter(item => item.date && item.title)
  .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99") || a.title.localeCompare(b.title, "ko"));

// 홈 알림: 아직 안 끝낸 일정 중 (1) 미리 알림 날짜가 된 것 (2) 날짜가 지났는데 안 끝낸 것(최근 14일).
export function plannerAlerts(items, now = new Date()) {
  const today = dayNo(dateKey(now));
  return normalizeItems(items).filter(item => !item.done).map(item => {
    const diff = dayNo(item.date) - today;
    const due = item.remind >= 0 && diff >= 0 && diff <= item.remind;
    const overdue = diff < 0 && diff >= -14;
    return due || overdue ? { ...item, diff, overdue } : null;
  }).filter(Boolean).sort((a, b) => a.diff - b.diff);
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
