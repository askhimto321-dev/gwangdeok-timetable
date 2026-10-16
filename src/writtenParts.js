// 지필평가를 객관식 + 논술형(서술형) 두 파일로 나눠 받는 기능.
// 시험 항목에 split({mcMax, essayMax})이 있으면 parts.mc / parts.essay에 파일별 학생 점수를 따로 두고,
// item.students[sid].score는 두 점수의 합으로 다시 계산합니다(나머지 산출 로직은 합계만 사용).
// 논술형 파일이 아직 없으면 객관식 점수만으로 계산하고 essayPending으로 '임시'임을 표시합니다.

export const WRITTEN_PARTS = [
  { key: "mc", label: "객관식" },
  { key: "essay", label: "논술형" },
];

export function partLabel(part) {
  return WRITTEN_PARTS.find(item => item.key === part)?.label || part;
}

export function isSplitWritten(item) {
  return !!(item?.split && Number(item.split.mcMax) > 0 && Number(item.split.essayMax) > 0);
}

// 처음 나눌 때 기본 배점: 파일 만점이 100 미만이면 그 점수를 객관식으로, 아니면 90 + 10.
export function defaultWrittenSplit(maxScore) {
  const max = Number(maxScore) || 100;
  const mcMax = max > 0 && max < 100 ? max : 90;
  return { mcMax, essayMax: Math.max(1, 100 - mcMax) };
}

const round2 = value => Math.round(value * 100) / 100;

export function recombineWritten(item) {
  if (!isSplitWritten(item)) return item;
  const mc = item.parts?.mc || null;
  const essay = item.parts?.essay || null;
  const sids = new Set([...Object.keys(mc?.students || {}), ...Object.keys(essay?.students || {})]);
  const students = {};
  sids.forEach(sid => {
    const a = mc?.students?.[sid];
    const b = essay?.students?.[sid];
    const base = a || b || {};
    const mcScore = a?.score ?? null;
    const essayScore = b?.score ?? null;
    let score = null;
    let status = "";
    if (!mc) status = "객관식 미입력";
    else if (mcScore == null) status = a?.status || "객관식 점수 없음";
    else if (!essay) score = mcScore;
    else if (essayScore == null) status = b?.status || "논술형 점수 없음";
    else score = round2(mcScore + essayScore);
    students[sid] = { sid, classNumber: base.classNumber, number: base.number, score, status, parts: { mc: mcScore, essay: essayScore } };
  });
  return {
    ...item,
    maxScore: round2(Number(item.split.mcMax) + Number(item.split.essayMax)),
    students,
    fileName: [mc?.fileName, essay?.fileName].filter(Boolean).join(" + ") || item.fileName,
    essayPending: !essay,
    mcPending: !mc,
  };
}

// 시험을 객관식/논술형으로 나눕니다. 이미 올린 점수 파일은 객관식 파일로 봅니다.
export function splitWritten(item, split = defaultWrittenSplit(item?.maxScore)) {
  const parts = item.parts?.mc || item.parts?.essay
    ? item.parts
    : { mc: { fileName: item.fileName, uploadedAt: item.uploadedAt, maxScore: item.maxScore, students: item.students || {} } };
  return recombineWritten({ ...item, split: { mcMax: Number(split.mcMax), essayMax: Number(split.essayMax) }, parts, wholeMax: item.wholeMax ?? item.maxScore });
}

// 나누기 해제: 객관식 파일 점수를 다시 시험 전체 점수로 씁니다.
export function unsplitWritten(item) {
  if (!isSplitWritten(item)) return item;
  const mc = item.parts?.mc;
  const { split, parts, essayPending, mcPending, wholeMax, ...rest } = item;
  return { ...rest, maxScore: mc?.maxScore ?? wholeMax ?? item.maxScore, students: mc?.students || {}, fileName: mc?.fileName || item.fileName };
}

// 파트 파일 하나를 넣거나 바꿉니다(file은 parseWrittenWorkbook 결과).
export function setWrittenPart(item, part, file) {
  if (!isSplitWritten(item)) return item;
  const parts = { ...(item.parts || {}), [part]: { fileName: file.fileName, uploadedAt: file.uploadedAt || new Date().toISOString(), maxScore: file.maxScore, students: file.students || {} } };
  return recombineWritten({ ...item, parts });
}

export function removeWrittenPart(item, part) {
  if (!isSplitWritten(item)) return item;
  const parts = { ...(item.parts || {}) };
  delete parts[part];
  return recombineWritten({ ...item, parts });
}

// 나뉜 시험에 같은 시험 파일이 또 올라오면 파일 만점으로 어느 파트인지 고릅니다(모르면 null).
export function pickWrittenPart(item, fileMaxScore) {
  if (!isSplitWritten(item)) return null;
  const max = Number(fileMaxScore);
  const essayMatch = max === Number(item.split.essayMax);
  const mcMatch = max === Number(item.split.mcMax);
  if (essayMatch && !mcMatch) return "essay";
  if (mcMatch && !essayMatch) return "mc";
  // 객관식+논술형이 합쳐진 파일(만점 = 두 배점의 합)이면 시험 전체 점수로 씁니다.
  if (max === Number(item.split.mcMax) + Number(item.split.essayMax)) return "whole";
  return null;
}

// 시험 전체 점수 파일(객관식+논술형 합산)로 바꿉니다. 나뉜 시험이면 나누기를 풀고 이 파일 점수를 씁니다.
export function replaceWholeWritten(item, file) {
  const base = isSplitWritten(item) ? unsplitWritten(item) : item;
  return { ...base, students: file.students || {}, fileName: file.fileName, maxScore: file.maxScore, uploadedAt: file.uploadedAt || new Date().toISOString() };
}

// 파트 점수가 배점을 넘는 학생 수(배점 설정이나 파일 선택이 잘못됐을 때 알려 줍니다).
export function countOverMax(file, max) {
  const limit = Number(max);
  if (!(limit > 0)) return 0;
  return Object.values(file?.students || {}).filter(student => student?.score != null && student.score > limit + 1e-9).length;
}
