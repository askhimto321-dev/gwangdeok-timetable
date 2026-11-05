// 업무 인수인계: 부서 → 담당(자리) → 세부 업무. 세부 업무마다 타임라인 · 자료(시트·파일 링크) · 코멘트를 남겨
// 다음 해 담당 선생님이 그대로 이어받게 합니다.
// 저장: 구조(부서·담당·세부 업무) = HANDOVER_KEY 한 곳, 세부 업무 내용 = handoverTaskKey(업무 id)마다 따로
// (여러 선생님이 동시에 자기 업무를 적어도 서로 덮어쓰지 않게).

export const HANDOVER_KEY = "kd_handover_v1";
export const handoverTaskKey = id => `kd_handover_task_v1_${id}`;

const uid = (prefix = "h") => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 학교 한 해: 3월부터 다음 해 2월까지
export const SCHOOL_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
export const monthRank = month => { const i = SCHOOL_MONTHS.indexOf(Number(month)); return i < 0 ? 99 : i; };

// 2026학년도 업무분장(2학년부) 기본 틀. 담당 선생님 이름은 넣지 않고, 선생님마다 '내 담당으로'를 눌러 정해요.
const SEED_2 = [
  ["부장", ["학년운영 총괄(운영계획 및 추진)", "학생 생활교육", "타부서 업무 협조 및 조율", "학년협의회 운영", "학부모 상담", "학년 분리수거 지도"]],
  ["", ["지필평가 업무(학년 답안지 점검 및 리딩)", "교수부 지원(전국연합학력평가 협조, 평가 일람표)", "UNIV 운영 및 자료 관리"]],
  ["", ["따라체험(꿈따라 세상 속으로) 1", "교육과정부 지원(진급학급 편성 조정)"]],
  ["", ["출결총괄(짝수반)", "급식지도 계획 및 운영", "교수부 지원(최성보 운영 지원, 과목별 출결마감 확인 협조)"]],
  ["", ["출결(홀수반)", "자기주도학습 계획 및 운영"]],
  ["", ["따라체험(꿈따라 세상 속으로) 2", "보건실 업무 지원 및 물품 관리", "어울림한마당 및 동아리발표회 운영 협조"]],
  ["", ["학년 기획", "회계 및 특근매식비 관리", "학년 프로젝트 봉사활동 운영", "사정안 및 학생비상연락망", "교무실 비품 및 소모품(청소도구, 복사용품) 신청 및 관리"]],
  ["", ["교육안전부 지원(학년생활교육협의회 업무 및 확인서 관리)", "선도학생 지도 협조", "엘리베이터 탑승카드 관리"]],
  ["", ["교육안전부 지원(학생생활교육위원회 업무 및 선도학생 지도 총괄)", "학년생활교육협의회 업무 협조", "학생회 조직 및 안전 관리"]],
  ["", ["교무부 지원(학교생활기록부 점검, 장학 및 포상)", "진로진학 업무 협조(진로진학컨설팅)"]],
  ["", ["교육과정부 지원(봉사활동, 학교자율시간)", "교수부 지원(기초학력 및 학습코칭 운영: 개설 가수요조사, 개설 강좌 확정, 희망 학생 가통 배부 및 수합, 강좌 종료 후 출석부와 사진 제출)", "학습지원대상학생 지원협의회 참석(학기당 1회)"]],
];
export function seedHandover() {
  let n = 0;
  const id = () => `seed2_${++n}`;
  return {
    depts: [{ id: "dept_g2", name: "2학년부", order: 0, common: "학생지도(생활, 학습, 진로진학), 학생과 학부모 상담, 교무실과 학급 관리" }],
    roles: SEED_2.map(([title, duties], index) => ({ id: `role_g2_${index + 1}`, deptId: "dept_g2", title, ownerId: "", ownerName: "", order: index, duties: duties.map(text => ({ id: id(), text })) })),
    year: "2026",
  };
}
export function normalizeHandover(raw) {
  const v = raw && typeof raw === "object" && Array.isArray(raw.depts) ? raw : seedHandover();
  return {
    ...v,
    depts: v.depts.map((d, i) => ({ id: String(d.id || uid("dept_")), name: String(d.name || "부서"), order: Number.isFinite(d.order) ? d.order : i, common: String(d.common || "") })).sort((a, b) => a.order - b.order),
    roles: (v.roles || []).map((r, i) => ({ id: String(r.id || uid("role_")), deptId: String(r.deptId || ""), title: String(r.title || ""), ownerId: String(r.ownerId || ""), ownerName: String(r.ownerName || ""), order: Number.isFinite(r.order) ? r.order : i, duties: (r.duties || []).map(d => ({ id: String(d.id || uid("duty_")), text: String(d.text || "") })) })).sort((a, b) => a.order - b.order),
  };
}

// 세부 업무 한 건의 인수인계 내용
export const emptyTask = () => ({ summary: "", must: "", changes: "", steps: [], links: [], files: [], comments: [], updatedAt: "", updatedBy: "" });
export function normalizeTask(raw) {
  const t = { ...emptyTask(), ...(raw && typeof raw === "object" ? raw : {}) };
  return {
    ...t,
    steps: (t.steps || []).map(s => ({ id: String(s.id || uid("st_")), month: s.month ? Number(s.month) : 0, when: String(s.when || ""), title: String(s.title || ""), detail: String(s.detail || ""), done: !!s.done, links: (s.links || []).map(normLink).filter(l => l.url), files: Array.isArray(s.files) ? s.files : [] })),
    links: (t.links || []).map(normLink).filter(l => l.url),
    files: Array.isArray(t.files) ? t.files : [],
    comments: (t.comments || []).map(c => ({ id: String(c.id || uid("cm_")), by: String(c.by || ""), byId: String(c.byId || ""), at: String(c.at || ""), text: String(c.text || "") })).filter(c => c.text),
  };
}
const normLink = l => ({ id: String(l?.id || uid("ln_")), label: String(l?.label || ""), url: String(l?.url || "").trim() });
export const newStep = (patch = {}) => ({ id: uid("st_"), month: 0, when: "", title: "", detail: "", done: false, links: [], files: [], ...patch });
export const newLink = (label = "", url = "") => ({ id: uid("ln_"), label, url: url.trim() });
export const newComment = (text, actor) => ({ id: uid("cm_"), text: String(text || "").trim(), by: String(actor?.name || "선생님"), byId: String(actor?.id || ""), at: new Date().toISOString() });

// 타임라인: 학교 달(3월→2월) 순서, 같은 달은 적은 순서대로. 시기를 안 정한 건 맨 뒤 '시기 미정'.
export function groupSteps(steps = []) {
  const groups = new Map();
  steps.forEach((step, index) => { const key = step.month || 0; if (!groups.has(key)) groups.set(key, []); groups.get(key).push({ ...step, index }); });
  return Array.from(groups.entries()).sort(([a], [b]) => (a ? monthRank(a) : 100) - (b ? monthRank(b) : 100)).map(([month, list]) => ({ month, label: month ? `${month}월` : "시기 미정", steps: list }));
}

// 링크 종류(아이콘·이름 표시용)
export function linkKind(url = "") {
  const u = String(url);
  if (/docs\.google\.com\/spreadsheets/.test(u)) return { kind: "sheet", label: "구글 시트" };
  if (/docs\.google\.com\/document/.test(u)) return { kind: "doc", label: "구글 문서" };
  if (/docs\.google\.com\/presentation/.test(u)) return { kind: "slide", label: "구글 프레젠테이션" };
  if (/docs\.google\.com\/forms|forms\.gle/.test(u)) return { kind: "form", label: "구글 설문" };
  if (/drive\.google\.com/.test(u)) return { kind: "drive", label: "구글 드라이브" };
  if (/canva\.com|miricanvas\.com/.test(u)) return { kind: "design", label: "디자인" };
  if (/youtu\.?be/.test(u)) return { kind: "video", label: "영상" };
  return { kind: "web", label: "링크" };
}
export const safeUrl = url => { const v = String(url || "").trim(); if (!v) return ""; if (/^https?:\/\//i.test(v)) return v; if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return `https://${v}`; return ""; };

// 업무 이름으로 맞는 예시 타임라인(선생님이 고쳐 쓰는 초안)
export function stepTemplate(dutyText = "") {
  if (/따라\s*체험/.test(dutyText)) return [
    newStep({ title: "운영 계획 수립", detail: "작년 운영 결과와 개선점 확인, 계획서와 예산안 작성, 학년협의회 협의" }),
    newStep({ title: "학생 희망 분야 조사", detail: "희망 진로 분야 조사(설문), 분야별 인원 정리" }),
    newStep({ title: "체험처 섭외 및 협조", detail: "체험처 연락과 일정 조율, 협조 공문, 체험처 목록 정리" }),
    newStep({ title: "사전 준비", detail: "학생 배정과 명단, 가정통신문(학부모 동의), 사전교육과 안전교육, 보험과 이동 계획" }),
    newStep({ title: "체험 실시", detail: "당일 인솔과 출결 확인, 비상 연락 체계" }),
    newStep({ title: "사후 활동", detail: "소감문 수합, 결과물 정리" }),
    newStep({ title: "결과 공유(팜플렛 제작)", detail: "평가회 영상 대신 분야별 팜플렛을 제작해 공유" }),
    newStep({ title: "생기부 기재 자료 정리", detail: "진로활동 특기사항 자료(행사 세특 파일) 작성과 담임 배부" }),
    newStep({ title: "결과 보고 및 정산", detail: "결과 보고서 작성, 예산 정산" }),
  ];
  return [
    newStep({ title: "계획 수립", detail: "" }),
    newStep({ title: "준비", detail: "" }),
    newStep({ title: "실시", detail: "" }),
    newStep({ title: "마무리(결과 보고·정리)", detail: "" }),
  ];
}

// 한 업무가 얼마나 채워졌는지(목록 표시용)
export function taskProgress(task) {
  const t = normalizeTask(task);
  const filled = [t.summary.trim(), t.must.trim(), t.steps.length, t.links.length + t.files.length].filter(Boolean).length;
  return { filled, total: 4, steps: t.steps.length, done: t.steps.filter(s => s.done).length, files: t.links.length + t.files.length + t.steps.reduce((n, s) => n + s.links.length + s.files.length, 0), comments: t.comments.length };
}
