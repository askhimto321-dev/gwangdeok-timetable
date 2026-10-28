// 시험 일정만 고릅니다: '기말고사 성적 확인', '지필평가 이의신청', '학기말 방학'처럼 시험 뒤 일정은 빼야
// 시험이 끝난 날을 잘못 늦게 잡지 않습니다(그러면 D+6이 지나도 성적 확인 팝업이 계속 떴습니다).
const EXAM_LABEL = /(중간|기말)\s*(고사|평가|시험)|정기\s*(고사|시험|평가)|지필|^\s*(\d학기\s*)?(중간|기말)\s*$/;
const NOT_EXAM = /성적|확인|이의|결과|공개|방학|휴업|처리|채점|열람|발표|안내|원서|연수|회의|협의|출제|검토|제출|입력|마감|정정|재시험|대비/;
export const isExamEvent = label => EXAM_LABEL.test(String(label || "")) && !NOT_EXAM.test(String(label || ""));

const dayNumber = value => { const t = new Date(`${value}T00:00:00`).getTime(); return Number.isFinite(t) ? Math.round(t / 86400000) : NaN; };

// 시험 날마다 따로 적은 일정(1일차·2일차…)과 주말을 사이에 둔 일정은 한 번의 시험 기간으로 묶습니다.
export function examPeriods(calendar) {
  const items = (calendar?.events || [])
    .filter(event => event?.date && isExamEvent(event.label))
    .map(event => ({ ...event, start: dayNumber(event.date), end: dayNumber(event.endDate || event.date) }))
    .filter(event => Number.isFinite(event.start) && Number.isFinite(event.end))
    .sort((a, b) => a.start - b.start);
  const periods = [];
  items.forEach(event => {
    const last = periods[periods.length - 1];
    if (last && event.start <= last.end + 3) { last.end = Math.max(last.end, event.end); last.events.push(event); return; }
    periods.push({ ...event, end: Math.max(event.start, event.end), events: [event] });
  });
  return periods.map(period => {
    const endDate = new Date(period.end * 86400000).toISOString().slice(0, 10);
    const label = String(period.events[0].label || "").replace(/\s*\(?\d\s*일\s*차\)?\s*$/, "").trim() || period.label;
    return { ...period.events[0], label, date: period.events[0].date, endDate: endDate > period.events[0].date ? endDate : undefined, start: period.start, end: period.end };
  });
}

// 정기시험 기간: 관리자 학사일정의 시험 일정 7일 전부터 끝난 뒤 6일(성적 확인 기간)까지만 강조합니다.
export const EXAM_AFTER_DAYS = 6;
export function examPeriodFromCalendar(calendar, now = new Date()) {
  const today = Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  const items = examPeriods(calendar)
    .map(period => {
      const dStart = period.start - today;
      const dEnd = period.end - today;
      // 시작 전엔 시작일 기준, 시험 중엔 D-day, 끝난 뒤엔 마지막 날 기준으로 셉니다.
      return { ...period, d: dStart > 0 ? dStart : dEnd < 0 ? dEnd : 0 };
    })
    .filter(event => Number.isFinite(event.d) && event.d >= -EXAM_AFTER_DAYS && event.d <= 7)
    .sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
  if (!items.length) return null;
  const { start, end, ...event } = items[0];
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
