// NAVI 전형 컷 점검: 한 모집단위 안에 이름이 같은 전형이 컷이 다르게 여러 번 들어오거나,
// 50%컷이 70%컷보다 나쁘게(숫자가 크게) 들어온 자료를 찾아냅니다.
// 화면(상담 상세·NAVI)과 관리자 점검이 같은 기준을 쓰도록 순수 함수로 둡니다.

const num = value => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const round2 = value => Math.round(value * 100) / 100;
const median = values => {
  const list = values.filter(value => value != null).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return round2(list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2);
};

// 모집단위·전형 이름 비교용 키(띄어쓰기·괄호·학년도·'전형' 꼬리 무시).
export function naviNameKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/20\d{2}학년도?/g, "")
    .replace(/학생부교과/g, "교과")
    .replace(/학생부종합/g, "종합")
    .replace(/[\s·ㆍ_\-–—()[\]{}（）]/g, "")
    .replace(/전형$/g, "")
    .trim();
}

// 합쳐진 2026 모집단위 표기("가 / 나")를 나눕니다.
export const unitParts = value => String(value || "").split(/\s+\/\s+/).map(part => part.trim()).filter(Boolean);

// 모집단위가 정확히 같은 기록이 있으면 그것만, 없을 때만 이름 일부가 겹치는 기록을 씁니다.
// (부분 일치만 쓰면 '관광경영학과'에 '호텔관광경영학과' 같은 다른 학과 컷이 섞입니다.)
export function pickUnitRecords(records = [], department = "") {
  const target = naviNameKey(department);
  if (!target) return [];
  const keysOf = row => [row?.[5], ...unitParts(row?.[4])].map(naviNameKey).filter(Boolean);
  const exact = records.filter(row => keysOf(row).includes(target));
  if (exact.length) return exact;
  return records.filter(row => keysOf(row).some(key => key.includes(target) || target.includes(key)));
}

export const cutsInverted = (cut50, cut70) => {
  const a = num(cut50), b = num(cut70);
  return a != null && b != null && a > b + 0.005;
};

// rows: [{ kind, name, cut50, cut70, department }]
// 같은 모집단위·같은 전형은 한 줄로 묶고, 컷이 서로 다르면 variants에 원래 값을 남깁니다.
export function collapseCutRows(rows = []) {
  const groups = new Map();
  rows.forEach(row => {
    const key = `${row.kind}|${naviNameKey(row.name)}|${naviNameKey(row.department)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return Array.from(groups.values()).map(list => {
    const seen = new Set();
    const variants = list.filter(row => {
      const sig = `${num(row.cut50) ?? ""}|${num(row.cut70) ?? ""}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    }).map(row => ({ cut50: num(row.cut50), cut70: num(row.cut70), source: row.source || "" }));
    const base = list[0];
    const cut50 = variants.length > 1 ? median(variants.map(v => v.cut50)) : variants[0]?.cut50 ?? null;
    const cut70 = variants.length > 1 ? median(variants.map(v => v.cut70)) : variants[0]?.cut70 ?? null;
    return {
      ...base,
      cut50,
      cut70,
      variants: variants.length > 1 ? variants : [],
      inverted: variants.some(v => cutsInverted(v.cut50, v.cut70)),
    };
  });
}

// 전체 NAVI 기록 점검. records 형식: [지역군, 지역, 세부, 대학, 2026단위, 2027단위, 계열, 교과[], 종합[], ...]
// 전형 항목: [전형명, 50%컷, 70%컷, ..., (선택) 2026 모집단위]
export function auditNaviRecords(records = []) {
  const conflicts = [];
  const inverted = [];
  let tracks = 0;
  records.forEach(row => {
    if (!Array.isArray(row)) return;
    const base = { university: row[3] || "", region: row[1] || "", unit2027: row[5] || "", unit2026: row[4] || "" };
    [["교과", row[7] || []], ["종합", row[8] || []]].forEach(([kind, list]) => {
      const groups = new Map();
      list.forEach(item => {
        if (!Array.isArray(item)) return;
        tracks += 1;
        const cut50 = num(item[1]), cut70 = num(item[2]);
        if (cutsInverted(cut50, cut70)) inverted.push({ ...base, kind, track: item[0] || kind, cut50, cut70 });
        const key = naviNameKey(item[0] || kind);
        if (!groups.has(key)) groups.set(key, { track: item[0] || kind, list: [] });
        groups.get(key).list.push({ cut50, cut70, source: item[5] || "" });
      });
      groups.forEach(({ track, list: entries }) => {
        const distinct = new Map();
        entries.forEach(entry => { const sig = `${entry.cut50 ?? ""}|${entry.cut70 ?? ""}`; if (!distinct.has(sig)) distinct.set(sig, entry); });
        if (distinct.size > 1) {
          conflicts.push({ ...base, kind, track, merged: unitParts(base.unit2026).length > 1, variants: Array.from(distinct.values()) });
        }
      });
    });
  });
  return {
    records: records.length,
    tracks,
    conflicts,
    inverted,
    mergedConflicts: conflicts.filter(item => item.merged).length,
  };
}
