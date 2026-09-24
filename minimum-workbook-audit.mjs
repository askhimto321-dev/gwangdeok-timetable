import fs from "node:fs/promises";
import { createServer } from "vite";
import * as XLSX from "xlsx";

const workbookPath = process.argv[2];
if (!workbookPath) throw new Error("XLSX 경로가 필요합니다.");
const bytes = await fs.readFile(workbookPath);
const server = await createServer({ logLevel: "silent", server: { middlewareMode: true }, appType: "custom" });
try {
  const catalog = await server.ssrLoadModule("/src/minimumCatalog.js");
  const mapping = await server.ssrLoadModule("/src/minimumMapping.js");
  const book = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const parsed = catalog.parseMinimumWorkbook(book, XLSX);
  const rows = catalog.normalizeMinimumCatalog(parsed.rows);
  const reasonCounts = new Map();
  const dispositionCounts = new Map();
  const patternCounts = new Map();
  for (const row of rows.filter(row => row.reviewStatus === "검토필요")) {
    for (const reason of String(row.reviewReason || "사유없음").split(" · ").filter(Boolean)) reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    const disposition = mapping.minimumReviewDisposition(row);
    dispositionCounts.set(disposition.code, (dispositionCounts.get(disposition.code) || 0) + 1);
    const pattern = mapping.minimumRulePattern(row);
    patternCounts.set(pattern?.code || "none", (patternCounts.get(pattern?.code || "none") || 0) + 1);
  }
  const sampleStudent = { admissionYear: 2028, latestMockGrades: { 국어: 3, 수학: 3, 영어: 3, 통합사회: 3, 통합과학: 3, 한국사: 3 } };
  const evaluationCounts = new Map();
  for (const row of rows.filter(row => row.admissionYear === 2028 && row.season === "수시" && row.reviewStatus !== "사용안함")) {
    const result = catalog.evaluateCatalogMinimum(row, sampleStudent);
    evaluationCounts.set(result.status, (evaluationCounts.get(result.status) || 0) + 1);
  }
  const top = map => Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));
  console.log(JSON.stringify({
    parseErrors: parsed.errors,
    stats: catalog.minimumCatalogStats(rows),
    byYear: Object.fromEntries([2027, 2028].map(year => [year, catalog.minimumCatalogStats(rows.filter(row => row.admissionYear === year))])),
    reasonCounts: top(reasonCounts),
    dispositionCounts: top(dispositionCounts),
    patternCounts: top(patternCounts),
    evaluationCounts: top(evaluationCounts),
    unresolved: rows.filter(row => row.reviewStatus === "검토필요").slice(0, 40).map(row => ({ id: row.id, year: row.admissionYear, university: row.university, track: row.track, scope: `${row.scopeType}:${row.department}`, ruleText: row.ruleText, note: row.note, reason: row.reviewReason })),
  }, null, 2));
} finally {
  await server.close();
}
