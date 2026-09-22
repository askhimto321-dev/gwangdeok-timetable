// 권장과목의 판정값은 원문 과목명을 유지하되, 화면에서는 넓은 교과 범주를
// 교육과정의 특정 과목명처럼 오해하지 않도록 '수학·사회·과학'으로만 표시합니다.
// 실제로 일치한 시간표 과목명은 칩의 title(마우스 도움말)에 그대로 남습니다.
export function recommendedCourseDisplayName(value = "") {
  const text = String(value || "").normalize("NFKC").trim();
  const key = text.replace(/\s+/g, "").replace(/[Ⅰ]/g, "I").replace(/[Ⅱ]/g, "II").toLowerCase();
  if (/^(?:공통수학(?:1|2|i|ii)?|공수(?:1|2)?)$/.test(key)) return "수학";
  if (/^(?:통합사회|통사)$/.test(key)) return "사회";
  if (/^(?:통합과학|통과)$/.test(key)) return "과학";
  return text;
}
