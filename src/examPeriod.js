// 정기시험 기간: 관리자 학사일정의 '중간·기말·정기·지필' 일정 7일 전부터 21일 뒤(채점·성적 처리)까지.
export function examPeriodFromCalendar(calendar, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const items = (calendar?.events || [])
    .filter(event => event?.date && /중간|기말|정기|지필/.test(String(event.label || "")))
    .map(event => {
      const dStart = Math.round((new Date(`${event.date}T00:00:00`) - today) / 86400000);
      const dEnd = event.endDate ? Math.round((new Date(`${event.endDate}T00:00:00`) - today) / 86400000) : dStart;
      // 여러 날 시험은 시작 전엔 시작일 기준, 시험 중엔 D-day, 끝난 뒤엔 마지막 날 기준으로 셉니다.
      return { ...event, d: dStart > 0 ? dStart : dEnd < 0 ? dEnd : 0 };
    })
    .filter(event => Number.isFinite(event.d) && event.d >= -21 && event.d <= 7)
    .sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
  if (!items.length) return null;
  const event = items[0];
  const phase = event.d > 0 ? "before" : event.d === 0 ? "today" : "after";
  return { ...event, phase, dLabel: event.d > 0 ? `D-${event.d}` : event.d === 0 ? "D-day" : `D+${-event.d}` };
}
