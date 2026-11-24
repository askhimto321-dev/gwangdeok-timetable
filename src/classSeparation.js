// 2027 반편성용 '분리희망학생' 자료: 2학년 학급담임이 자기 반 학생마다 함께 반이 되면 안 되는 학생(최대 10명)을 적습니다.
// 반마다 따로 저장해 여러 담임이 동시에 써도 서로 덮어쓰지 않습니다.
export const MAX_TARGETS = 10;
// 분리 등급(강한 순). 예전 자료의 '반드시 분리'·'되도록 분리'도 그대로 쓰입니다.
export const SEPARATION_LEVELS = ["반드시 분리", "되도록 분리", "가능하면 분리", "참고"];
export const LEVEL_INFO = {
  "반드시 분리": { tone: "must", hint: "같은 반이 되면 안 됨", example: "학교폭력 가해·피해, 심의·조치 중인 관계" },
  "되도록 분리": { tone: "high", hint: "특별한 사정이 없으면 분리", example: "지속적인 갈등, 괴롭힘·따돌림 의심" },
  "가능하면 분리": { tone: "mid", hint: "반 배정 여유가 있으면 분리", example: "교우관계 불편, 본인·보호자 요청" },
  "참고": { tone: "low", hint: "배정할 때 참고만", example: "서로 영향이 큰 관계(수업 방해 등)" },
};
export const levelRank = level => { const i = SEPARATION_LEVELS.indexOf(level); return i < 0 ? SEPARATION_LEVELS.length : i; };
// 사유 고르기(마지막 '직접 입력'을 고르면 글로 적습니다)
export const REASON_PRESETS = ["학교폭력 가해·피해", "학교폭력 심의·조치 중", "지속적인 갈등", "괴롭힘·따돌림 의심", "교우관계 불편", "본인·보호자 요청", "이성 문제", "수업 방해·서로 영향", "담임 판단"];
export const CUSTOM_REASON = "직접 입력";
export const SHEET_TITLE = "분리희망학생(2학년부)";

export const separationKey = (year, grade, classNo) => `kd_class_separation_v1:${Number(year)}:${String(grade)}:${Number(classNo)}`;

const clean = value => String(value ?? "").normalize("NFKC").trim();

// 저장 전 정리: 빈 줄·자기 자신·중복 학생을 빼고 최대 10명까지
export function normalizeTargets(targets = [], selfSid = "") {
  const seen = new Set();
  return (targets || []).map(item => ({
    sid: clean(item?.sid),
    level: SEPARATION_LEVELS.includes(item?.level) ? item.level : SEPARATION_LEVELS[0],
    reason: clean(item?.reason).slice(0, 200),
  })).filter(item => {
    if (!item.sid || item.sid === clean(selfSid) || seen.has(item.sid)) return false;
    seen.add(item.sid);
    return true;
  }).slice(0, MAX_TARGETS);
}

// 학번·이름으로 2학년 학생 찾기(학번 앞자리, 이름 일부)
export function searchStudents(roster = {}, query = "", { exclude = [], limit = 8 } = {}) {
  const q = clean(query).replace(/\s+/g, "");
  if (!q) return [];
  return Object.entries(roster || {})
    .filter(([sid, student]) => !exclude.includes(sid) && (sid.startsWith(q) || clean(student?.name).replace(/\s+/g, "").includes(q)))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([sid, student]) => ({ sid, name: clean(student?.name), class: student?.class, number: student?.number, gender: clean(student?.gender) }));
}

// 여러 반 자료 → 양식 행([순번, 학번, 이름, 성별, (학번, 이름, 등급, 사유) × 10])
export function separationRows(classData = [], roster = {}) {
  const entries = [];
  classData.forEach(data => Object.entries(data?.entries || {}).forEach(([sid, entry]) => {
    const targets = normalizeTargets(entry?.targets, sid);
    if (targets.length) entries.push([sid, targets]);
  }));
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([sid, targets], index) => {
    const student = roster?.[sid] || {};
    const row = [index + 1, sid, clean(student.name), clean(student.gender)];
    for (let i = 0; i < MAX_TARGETS; i += 1) {
      const target = targets[i];
      row.push(target ? target.sid : "", target ? clean(roster?.[target.sid]?.name) : "", target ? target.level : "", target ? target.reason : "");
    }
    return row;
  });
}

// 양식 머리글 2줄과 병합 범위(0부터 센 행·열)
export function separationHeader() {
  const top = ["순번", "학번", "이름", "성별"];
  const sub = ["", "", "", ""];
  const merges = [0, 1, 2, 3].map(c => ({ s: { r: 0, c }, e: { r: 1, c } }));
  for (let i = 1; i <= MAX_TARGETS; i += 1) {
    const c = top.length;
    top.push(`분리희망학생${i}`, "", `학생${i}\n분리\n등급`, `학생${i}\n사유`);
    sub.push("학번", "이름", "", "");
    merges.push({ s: { r: 0, c }, e: { r: 0, c: c + 1 } }, { s: { r: 0, c: c + 2 }, e: { r: 1, c: c + 2 } }, { s: { r: 0, c: c + 3 }, e: { r: 1, c: c + 3 } });
  }
  return { top, sub, merges };
}

export const SEPARATION_COL_WIDTHS = [5.2, 9.2, 11.2, 5.2, ...Array.from({ length: MAX_TARGETS }, () => [8.2, 9.2, 10.2, 23.2]).flat()];

// 분리 쌍: A가 B를 적었든 B가 A를 적었든 한 쌍으로 묶습니다(더 강한 등급 기준).
// classData: { 반: { entries } } → [{ a, b, level, reasons: [], from: [적은 학생 학번], mutual }]
export function separationPairs(classData = {}) {
  const map = new Map();
  Object.values(classData || {}).forEach(data => Object.entries(data?.entries || {}).forEach(([sid, entry]) => {
    normalizeTargets(entry?.targets, sid).forEach(target => {
      const [a, b] = [sid, target.sid].sort();
      const key = `${a}|${b}`;
      const pair = map.get(key) || { a, b, level: target.level, reasons: [], from: [] };
      if (levelRank(target.level) < levelRank(pair.level)) pair.level = target.level;
      if (target.reason && !pair.reasons.includes(target.reason)) pair.reasons.push(target.reason);
      if (!pair.from.includes(sid)) pair.from.push(sid);
      map.set(key, pair);
    });
  }));
  return Array.from(map.values()).map(pair => ({ ...pair, mutual: pair.from.length > 1 }))
    .sort((x, y) => levelRank(x.level) - levelRank(y.level) || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}

// 이 학생을 분리 희망으로 적은 다른 학생들
export function reverseTargets(classData = {}, sid = "") {
  const out = [];
  Object.values(classData || {}).forEach(data => Object.entries(data?.entries || {}).forEach(([other, entry]) => {
    if (other === sid) return;
    const hit = normalizeTargets(entry?.targets, other).find(target => target.sid === sid);
    if (hit) out.push({ sid: other, level: hit.level, reason: hit.reason, by: entry?.by || "", updatedAt: entry?.updatedAt || "" });
  }));
  return out.sort((x, y) => levelRank(x.level) - levelRank(y.level) || x.sid.localeCompare(y.sid));
}

// 분리희망 엑셀 한꺼번에 읽기(학년부에서 모은 시트·학교 양식): 한 줄 = 학생 1명(학번) + '분리희망학생N' 묶음(학번·이름·분리 등급·사유)
// 돌려주는 값: { rows: [{ sid, targets: [{ sid, level, reason }] }], skipped: [{ sid, target, raw }] } — 분리가 아닌 등급(예: '반드시 세트')은 건너뛰어요.
export function parseSeparationSheet(aoa = []) {
  const rows = (aoa || []).map(r => (r || []).map(c => String(c ?? "").replace(/\s+/g, " ").trim()));
  const hi = rows.slice(0, 10).findIndex(r => r.some(c => /분리\s*희망\s*학생\s*1/.test(c)));
  if (hi < 0) return null;
  const head = rows[hi];
  const sidCol = head.findIndex(c => /^학번$/.test(c));
  const starts = head.map((c, i) => (/분리\s*희망\s*학생\s*\d+/.test(c) ? i : -1)).filter(i => i >= 0);
  if (sidCol < 0 || !starts.length) return null;
  const sub = rows[hi + 1] || [];
  const dataFrom = sub.some(c => /^학번$/.test(c)) ? hi + 2 : hi + 1;
  const levelOf = raw => { const v = raw.replace(/\s+/g, ""); if (/세트|동반|함께|같은반/.test(v)) return ""; if (/반드시/.test(v)) return "반드시 분리"; if (/되도록/.test(v)) return "되도록 분리"; if (/가능/.test(v)) return "가능하면 분리"; if (/참고/.test(v)) return "참고"; return v ? "" : "되도록 분리"; };
  const out = []; const skipped = [];
  rows.slice(dataFrom).forEach(r => {
    const sid = String(r[sidCol] || "").replace(/\D/g, "");
    if (!/^\d{5}$/.test(sid)) return;
    const targets = [];
    starts.forEach(i => {
      const t = String(r[i] || "").replace(/\D/g, ""); if (!/^\d{5}$/.test(t)) return;
      // 묶음 안 열: 학번, 이름, 등급, 사유(머리글에 '등급'·'사유'가 있으면 그 위치를 써요)
      const span = head.slice(i + 1, i + 5);
      const li = span.findIndex(c => /등급/.test(c)); const ri = span.findIndex(c => /사유/.test(c));
      const rawLevel = r[i + 1 + (li >= 0 ? li : 1)] || ""; const reason = r[i + 1 + (ri >= 0 ? ri : 2)] || "";
      const level = levelOf(rawLevel);
      if (!level) { skipped.push({ sid, target: t, raw: rawLevel }); return; }
      targets.push({ sid: t, level, reason });
    });
    if (targets.length) out.push({ sid, targets: normalizeTargets(targets, sid) });
  });
  return { rows: out, skipped };
}
