// 정기시험 기간: 관리자 학사일정의 '중간·기말·정기·지필' 일정 7일 전부터 21일 뒤(채점·성적 처리)까지.
export function examPeriodFromCalendar(calendar, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const items = (calendar?.events || [])
    .filter(event => event?.date && /중간|기말|정기|지필/.test(String(event.label || "")))
    .map(event => ({ ...event, d: Math.round((new Date(`${event.date}T00:00:00`) - today) / 86400000) }))
    .filter(event => Number.isFinite(event.d) && event.d >= -21 && event.d <= 7)
    .sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
  if (!items.length) return null;
  const event = items[0];
  const phase = event.d > 0 ? "before" : event.d === 0 ? "today" : "after";
  return { ...event, phase, dLabel: event.d > 0 ? `D-${event.d}` : event.d === 0 ? "D-day" : `D+${-event.d}` };
}
