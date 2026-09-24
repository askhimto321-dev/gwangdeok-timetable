import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const workbookPath = process.argv[2];
if (!workbookPath) throw new Error("권장과목 XLSX 경로가 필요합니다.");
const bytes = await fs.readFile(workbookPath);
const server = await createServer({ logLevel: "silent", server: { middlewareMode: true }, appType: "custom" });

try {
  const navi = await server.ssrLoadModule("/src/SusiNaviBeta.jsx");
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const parsed = await navi.parseRecommendedSubjectsWorkbook({
    name: path.basename(workbookPath), size: bytes.byteLength, arrayBuffer: async () => buffer,
  });
  const indexes = navi.buildRecommendationEstimateIndexes(parsed);
  const nonGeneric = parsed.records.filter(item => !navi.isGenericRecommendationRecord(item));
  const generic = parsed.records.filter(item => navi.isGenericRecommendationRecord(item));
  const courseValues = item => [...(item.core || []), ...(item.recommended || []), ...(item.noteRecommended || []), ...(item.reflected || [])];
  const officialFailures = [];
  nonGeneric.forEach(item => {
    const linked = navi.recommendationForUnit(parsed, item.university, item.region, item.department, indexes);
    const expected = new Set(courseValues(item).map(navi.courseMatchKey));
    const actual = new Set(courseValues(linked || {}).map(navi.courseMatchKey));
    const missing = [...expected].filter(course => !actual.has(course));
    if (!linked || linked.estimated || missing.length) officialFailures.push({ university: item.university, region: item.region, department: item.department, missing });
  });
  const suspiciousCourses = parsed.records.flatMap(item => courseValues(item).map(course => ({ item, course })))
    .filter(({ course }) => String(course).length > 28 || /(?:이수할|권장하며|고려하여|선택하여|교과목을|경우에는)/.test(course))
    .map(({ item, course }) => ({ university: item.university, department: item.department, course }));
  const variantFailures = [];
  nonGeneric.filter(item => /학과$/.test(item.department)).forEach(item => {
    [item.department.replace(/학과$/, "학부"), item.department.replace(/학과$/, "전공")].forEach(variant => {
      const linked = navi.recommendationForUnit(parsed, item.university, item.region, variant, indexes);
      if (!linked || linked.estimated) variantFailures.push({ university: item.university, original: item.department, variant });
    });
  });
  const familyCounts = new Map();
  parsed.records.forEach(item => {
    const family = navi.recommendationDepartmentFamily(item.department, item.field);
    const key = family.key || "unclassified";
    familyCounts.set(key, (familyCounts.get(key) || 0) + 1);
  });
  const kyunghee = navi.recommendationForUnit(parsed, "경희대", "서울", "화학공학과", indexes);
  const kyungheeRegionRecovery = navi.recommendationForUnit(parsed, "경희대", "수도권", "화학공학과", indexes);
  const kyungheeHousing = navi.recommendationForUnit(parsed, "경희대", "서울", "주거환경학과", indexes, "인문");
  const chemistry = navi.estimateRecommendationForUnit(indexes, "검증대", "서울", "화학과", "자연계열");
  const chemicalEngineering = navi.estimateRecommendationForUnit(indexes, "검증대", "서울", "화학공학과", "자연계열");
  console.log(JSON.stringify({
    source: parsed.source.fileName,
    stats: parsed.stats,
    parsedRecords: parsed.records.length,
    nonGenericRecords: nonGeneric.length,
    genericGuidanceRecords: generic.length,
    recordsWithCore: parsed.records.filter(item => item.core?.length).length,
    recordsWithRecommended: parsed.records.filter(item => item.recommended?.length).length,
    recordsWithNoteCourses: parsed.records.filter(item => item.noteRecommended?.length).length,
    blankDepartments: parsed.records.filter(item => !item.department).length,
    suspiciousCourseCount: suspiciousCourses.length,
    suspiciousCourses,
    officialFailures: officialFailures.slice(0, 20),
    officialFailureCount: officialFailures.length,
    variantFailureCount: variantFailures.length,
    variantFailures: variantFailures.slice(0, 20),
    familyCounts: Object.fromEntries([...familyCounts.entries()].sort((a, b) => b[1] - a[1])),
    kyunghee: kyunghee && { scope: kyunghee.scope, core: kyunghee.core, recommended: kyunghee.recommended, estimated: !!kyunghee.estimated },
    kyungheeRegionRecovery: kyungheeRegionRecovery && { scope: kyungheeRegionRecovery.scope, coreCount: kyungheeRegionRecovery.core.length, recommendedCount: kyungheeRegionRecovery.recommended.length, estimated: !!kyungheeRegionRecovery.estimated },
    kyungheeHousing: kyungheeHousing && { scope: kyungheeHousing.scope, estimateKind: kyungheeHousing.estimateKind, field: kyungheeHousing.officialFieldLabel, referenceCount: kyungheeHousing.referenceCount, threshold: kyungheeHousing.consensusThreshold, core: kyungheeHousing.core, recommended: kyungheeHousing.recommended },
    chemistryEstimate: chemistry && { scope: chemistry.scope, referenceCount: chemistry.referenceCount, threshold: chemistry.consensusThreshold, core: chemistry.core, recommended: chemistry.recommended, mentions: chemistry.mentionCounts },
    chemicalEngineeringEstimate: chemicalEngineering && { scope: chemicalEngineering.scope, referenceCount: chemicalEngineering.referenceCount, threshold: chemicalEngineering.consensusThreshold, core: chemicalEngineering.core, recommended: chemicalEngineering.recommended, mentions: chemicalEngineering.mentionCounts },
  }, null, 2));
} finally {
  await server.close();
}
