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

// 성적 확인 기간 팝업을 그만 띄워도 되는지: 내 담당 과목마다 시험이 끝난 날 이후 저장한 성적 산출 작업이 있으면 '산출 끝'으로 봅니다.
// assignedSubjects: 담당 과목 이름들, workspaces: [{ subject, updatedAt }], examEnd: "YYYY-MM-DD"
export function gradeCheckDone(assignedSubjects = [], workspaces = [], examEnd = "") {
  const key = value => String(value || "").normalize("NFC").replace(/Ⅰ/g, "1").replace(/Ⅱ/g, "2").replace(/[\s·ㆍ()]/g, "").replace(/II$/, "2").replace(/I$/, "1").toLowerCase();
  const subjects = Array.from(new Set(assignedSubjects.map(key).filter(Boolean)));
  if (!subjects.length || !examEnd) return false;
  const since = new Date(`${examEnd}T00:00:00`).getTime();
  if (!Number.isFinite(since)) return false;
  return subjects.every(subject => workspaces.some(ws => {
    const own = key(ws?.subject);
    const saved = new Date(ws?.updatedAt || 0).getTime();
    return own && (own === subject || own.includes(subject) || subject.includes(own)) && saved >= since;
  }));
}
