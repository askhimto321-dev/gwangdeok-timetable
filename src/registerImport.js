// 학적(학생 명렬표) 엑셀 → 학생 명단(roster).
// 1학년처럼 이동수업이 없는 학년은 출석부 시트가 없어 명단을 만들 수 없었습니다.
// 시트마다 '성명/이름'과 ('학번' 또는 '반'+'번호')가 있는 머리글 줄을 찾아 읽습니다.
// 학번이 없으면 학년 + 반(2자리) + 번호(2자리)로 만듭니다(예: 1학년 3반 7번 → 10307).

const clean = value => String(value ?? "").replace(/\s+/g, "").trim();
const HEADERS = {
  sid: ["학번"],
  name: ["성명", "이름", "학생명", "학생이름"],
  grade: ["학년"],
  class: ["반", "학급"],
  number: ["번호", "출석번호", "번"],
  gender: ["성별"],
  status: ["학적상태", "학적변동", "상태", "비고"],
};
const toInt = value => {
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : null;
};

function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = (rows[r] || []).map(clean);
    const col = {};
    Object.entries(HEADERS).forEach(([key, names]) => {
      const index = row.findIndex(cell => names.includes(cell));
      if (index >= 0) col[key] = index;
    });
    if (col.name != null && (col.sid != null || (col.class != null && col.number != null))) return { at: r, col };
  }
  return null;
}

// sheets: [{ name, rows: [[...]] }], grade: "1"
// → { roster: { sid: {name, class, number, gender} }, count, sheetsUsed, skipped: [문장], otherGrade }
export function parseRegisterSheets(sheets = [], grade = "") {
  const roster = {};
  const skipped = [];
  let sheetsUsed = 0;
  let otherGrade = 0;
  const left = /전출|자퇴|퇴학|제적|유학|면제/;
  sheets.forEach(sheet => {
    const rows = sheet.rows || [];
    const header = findHeader(rows);
    if (!header) return;
    sheetsUsed += 1;
    const { at, col } = header;
    for (let r = at + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const name = String(row[col.name] ?? "").trim();
      if (!name || clean(name) === "성명") continue;
      if (col.status != null && left.test(String(row[col.status] ?? ""))) { skipped.push(`${name}: ${String(row[col.status]).trim()} (제외)`); continue; }
      let sid = col.sid != null ? String(toInt(row[col.sid]) ?? "") : "";
      const classNo = col.class != null ? toInt(row[col.class]) : null;
      const number = col.number != null ? toInt(row[col.number]) : null;
      const rowGrade = col.grade != null ? toInt(row[col.grade]) : null;
      if (!sid && classNo != null && number != null) {
        const g = rowGrade ?? toInt(grade);
        if (g != null) sid = `${g}${String(classNo).padStart(2, "0")}${String(number).padStart(2, "0")}`;
      }
      if (!/^\d{5}$/.test(sid)) { skipped.push(`${name}: 학번을 만들 수 없음`); continue; }
      if (grade && sid.charAt(0) !== String(grade)) { otherGrade += 1; continue; }
      roster[sid] = {
        name,
        class: classNo ?? Number(sid.slice(1, 3)),
        number: number ?? Number(sid.slice(3, 5)),
        ...(col.gender != null && row[col.gender] ? { gender: String(row[col.gender]).trim() } : {}),
      };
    }
  });
  return { roster, count: Object.keys(roster).length, sheetsUsed, skipped, otherGrade };
}
