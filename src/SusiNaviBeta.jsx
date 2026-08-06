import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Database,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { readStorage, writeStorage } from "./storage.js";

const STORAGE_KEY = "kd_susi_navi_beta_v1";
const SCHEMA_VERSION = 1;
const PAGE_SIZE = 40;
const CONVERSION_GROUPS = ["전교과", "국수영사과", "국수영과", "국수영사"];

// records compact schema
// [권역, 지역, 세부지역, 대학, 2026모집단위, 2027모집단위, 계열, 교과전형[], 종합전형[], 정시정보]
// 전형: [전형명, 50%, 70%, 50%(5등급), 70%(5등급)]
// 정시정보: [전형명, 모집단위, 70%백분위, 영어/한국사, 반영영역]
// minimums compact schema
// [지역, 대학, 전형유형, 전형명, 계열, 모집단위, 반영영역, 반영영역수, 등급기준, 평균등급, 비고, 변경]
// conversions compact schema
// [5등급, 누적비, 전교과범위, 전교과값, 국수영사과범위, 값, 국수영과범위, 값, 국수영사범위, 값]

let betaCache = null;
let betaCachePromise = null;

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}
function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "").toLowerCase();
}
function cleanCell(value) {
  const text = normalizeText(value);
  return text === "-" || text === "*" || /^#(?:N\/A|REF!|VALUE!|DIV\/0!|NUM!)$/.test(text) ? "" : text;
}
function numberOrNull(value) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}
function clampGrade(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(5, Math.max(1, Math.round(num * 100) / 100));
}
function legacyConvert(value) {
  const num = clampGrade(value);
  return num == null ? null : Math.round((2 * num - 1) * 100) / 100;
}
function sourceDateFromName(name) {
  const match = String(name || "").match(/(?:^|\D)(\d{2})(\d{2})(\d{2})(?:\D|$)/);
  if (!match) return "";
  return `20${match[1]}-${match[2]}-${match[3]}`;
}
function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function humanBytes(bytes) {
  const num = Number(bytes || 0);
  if (num < 1024) return `${num} B`;
  if (num < 1024 ** 2) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / 1024 ** 2).toFixed(1)} MB`;
}
function admissionEntry(row, start) {
  const track = cleanCell(row[start]);
  if (!track) return null;
  return [track, numberOrNull(row[start + 1]), numberOrNull(row[start + 2]), numberOrNull(row[start + 3]), numberOrNull(row[start + 4])];
}
function hasRegular(info) {
  return Array.isArray(info) && info.some(item => cleanCell(item));
}
function unique(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko"));
}

function parseDataRows(rows) {
  const result = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const university = cleanCell(row[3]);
    const targetUnit = cleanCell(row[7]);
    if (!university || !targetUnit) continue;
    const teaching = [admissionEntry(row, 11), admissionEntry(row, 17), admissionEntry(row, 23)].filter(Boolean);
    const holistic = [admissionEntry(row, 29), admissionEntry(row, 35)].filter(Boolean);
    const regular = [cleanCell(row[5]), cleanCell(row[6]), numberOrNull(row[42]), cleanCell(row[43]), cleanCell(row[45])];
    result.push([
      cleanCell(row[0]), cleanCell(row[1]), cleanCell(row[2]), university,
      cleanCell(row[4]), targetUnit, cleanCell(row[8]) || "공통",
      teaching, holistic, hasRegular(regular) ? regular : null,
    ]);
  }
  return result;
}

function parseConversionRows(rows) {
  const result = [];
  for (let index = 3; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const grade5 = numberOrNull(row[6]);
    if (grade5 == null || grade5 < 1 || grade5 > 5) continue;
    result.push([
      grade5,
      cleanCell(row[7]),
      cleanCell(row[8]), numberOrNull(row[9]),
      cleanCell(row[10]), numberOrNull(row[11]),
      cleanCell(row[12]), numberOrNull(row[13]),
      cleanCell(row[14]), numberOrNull(row[15]),
    ]);
  }
  return result.sort((a, b) => a[0] - b[0]);
}

function parseMinimumRows(rows) {
  const result = [];
  for (let index = 15; index < rows.length; index += 1) {
    const row = rows[index] || [];
    if (Number(row[1]) !== 2027) continue;
    const university = cleanCell(row[3]);
    if (!university) continue;
    result.push([
      cleanCell(row[2]), university, cleanCell(row[5]), cleanCell(row[6]),
      cleanCell(row[9]), cleanCell(row[10]), cleanCell(row[13]), numberOrNull(row[16]),
      cleanCell(row[17]), numberOrNull(row[19]), cleanCell(row[20]), cleanCell(row[23]),
    ]);
  }
  return result;
}

export async function parseSusiNaviWorkbook(file, onProgress = () => {}) {
  onProgress("엑셀 파일을 읽는 중입니다.");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, dense: true });
  const dataSheet = workbook.Sheets.data;
  const conversionSheet = workbook.Sheets["기타"];
  const minimumSheet = workbook.Sheets["수능최저"];
  if (!dataSheet) throw new Error("필수 시트 'data'를 찾지 못했습니다.");
  if (!conversionSheet) throw new Error("필수 시트 '기타'를 찾지 못했습니다.");

  onProgress("2027 대학·모집단위 자료를 정리하는 중입니다.");
  const dataRows = XLSX.utils.sheet_to_json(dataSheet, { header: 1, defval: "", raw: true, blankrows: false });
  const records = parseDataRows(dataRows);

  onProgress("5·9등급 통계 변환표를 정리하는 중입니다.");
  const conversionRows = XLSX.utils.sheet_to_json(conversionSheet, { header: 1, defval: "", raw: true, blankrows: false });
  const conversions = parseConversionRows(conversionRows);

  onProgress("2027 수능최저 자료를 정리하는 중입니다.");
  const minimumRows = minimumSheet
    ? XLSX.utils.sheet_to_json(minimumSheet, { header: 1, defval: "", raw: true, blankrows: false })
    : [];
  const minimums = parseMinimumRows(minimumRows);

  if (!records.length) throw new Error("대학·모집단위 자료를 읽지 못했습니다. 파일 버전을 확인해주세요.");
  if (!conversions.length) throw new Error("통계 변환표를 읽지 못했습니다. 파일 버전을 확인해주세요.");

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    source: {
      fileName: file.name,
      fileSize: file.size,
      sourceDate: sourceDateFromName(file.name),
      parsedAt: new Date().toISOString(),
    },
    stats: {
      records: records.length,
      universities: unique(records.map(row => row[3])).length,
      regions: unique(records.map(row => row[1])).length,
      conversions: conversions.length,
      minimums: minimums.length,
    },
    records,
    conversions,
    minimums,
  };
  onProgress("자료 정리가 완료되었습니다.");
  return payload;
}

async function loadBetaData(force = false) {
  if (!force && betaCache) return betaCache;
  if (!force && betaCachePromise) return betaCachePromise;
  betaCachePromise = readStorage(STORAGE_KEY, null).then(value => {
    betaCache = value?.schemaVersion === SCHEMA_VERSION ? value : null;
    betaCachePromise = null;
    return betaCache;
  });
  return betaCachePromise;
}
function updateBetaCache(value) {
  betaCache = value;
  betaCachePromise = null;
}

function nearestConversion(conversions, grade5) {
  const target = clampGrade(grade5);
  if (target == null || !conversions?.length) return null;
  let low = 0;
  let high = conversions.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = conversions[mid][0];
    if (value === target) return conversions[mid];
    if (value < target) low = mid + 1;
    else high = mid - 1;
  }
  const left = conversions[Math.max(0, high)];
  const right = conversions[Math.min(conversions.length - 1, low)];
  return Math.abs((left?.[0] ?? 99) - target) <= Math.abs((right?.[0] ?? 99) - target) ? left : right;
}
function conversionDetails(data, method, group, grade5) {
  const input = clampGrade(grade5);
  if (input == null) return null;
  if (method === "legacy") return { input, value: legacyConvert(input), range: "", cumulative: "", sourceGrade: input };
  const row = nearestConversion(data?.conversions, input);
  if (!row) return null;
  const groupIndex = { 전교과: 2, 국수영사과: 4, 국수영과: 6, 국수영사: 8 }[group] ?? 2;
  return { input, value: row[groupIndex + 1], range: row[groupIndex], cumulative: row[1], sourceGrade: row[0] };
}
function differenceLabel(student, cutoff) {
  if (student == null || cutoff == null) return null;
  const diff = Math.round((student - cutoff) * 100) / 100;
  return { value: diff, text: `${diff > 0 ? "+" : ""}${diff.toFixed(2)}`, favorable: diff <= 0 };
}
function matchesUnit(minimumUnit, recordUnit) {
  const a = compactText(minimumUnit);
  const b = compactText(recordUnit);
  if (!a || !b) return false;
  if (/전체|전모집|전계열/.test(a)) return true;
  return a === b || a.includes(b) || b.includes(a);
}

function EmptyData({ isAdmin }) {
  return (
    <div style={ui.empty}>
      <Database size={34} color="#8a91a2" />
      <strong>아직 반영된 수시NAVI 자료가 없습니다.</strong>
      <span>{isAdmin ? "아래 관리자 자료 관리에서 경기도교육청 수시NAVI 교사용 파일을 업로드해주세요." : "관리자가 수시NAVI 교사용 파일을 반영한 뒤 이용할 수 있습니다."}</span>
    </div>
  );
}

export function SusiNaviBetaAdmin({ showToast }) {
  const [schoolData, setSchoolData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { loadBetaData().then(setSchoolData); }, []);

  const parseFile = async () => {
    if (!file) return showToast?.("수시NAVI 엑셀 파일을 선택해주세요.", "warning");
    setBusy(true);
    try {
      const parsed = await parseSusiNaviWorkbook(file, setStatus);
      setDraft(parsed);
      showToast?.(`${parsed.stats.records.toLocaleString()}개 모집단위를 확인했습니다.`, "success");
    } catch (error) {
      console.error(error);
      showToast?.(error?.message || "파일을 분석하지 못했습니다.", "error");
    } finally {
      setBusy(false);
    }
  };
  const saveSchool = async () => {
    if (!draft) return showToast?.("먼저 파일을 분석해주세요.", "warning");
    setBusy(true);
    setStatus("학교 공용 자료에 저장하는 중입니다.");
    try {
      const result = await writeStorage(STORAGE_KEY, { ...draft, source: { ...draft.source, savedAt: new Date().toISOString() } });
      if (!result?.ok) throw new Error(result?.error || "저장 실패");
      const saved = { ...draft, source: { ...draft.source, savedAt: new Date().toISOString() } };
      updateBetaCache(saved);
      setSchoolData(saved);
      showToast?.("수시NAVI Beta 자료를 학교 공용 자료에 반영했습니다.", "success");
    } catch (error) {
      showToast?.(`저장하지 못했습니다: ${error?.message || error}`, "error");
    } finally {
      setBusy(false);
    }
  };
  const clearSchool = async () => {
    if (!window.confirm("수시NAVI Beta 학교 공용 자료를 초기화할까요? 기존 광덕고 대입 결과에는 영향을 주지 않습니다.")) return;
    setBusy(true);
    try {
      const result = await writeStorage(STORAGE_KEY, null);
      if (!result?.ok) throw new Error(result?.error || "초기화 실패");
      updateBetaCache(null);
      setSchoolData(null);
      setDraft(null);
      showToast?.("수시NAVI Beta 자료를 초기화했습니다.", "success");
    } catch (error) {
      showToast?.(`초기화하지 못했습니다: ${error?.message || error}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={ui.adminWrap}>
      <style>{betaCss}</style>
      <div style={ui.adminHead}>
        <div><span style={ui.betaBadge}>Beta</span><h2 style={ui.adminTitle}>수시NAVI 자료 관리</h2><p style={ui.muted}>기존 광덕고 대입 결과와 분리된 저장 공간을 사용합니다.</p></div>
        {schoolData && <button type="button" style={ui.dangerGhost} onClick={clearSchool} disabled={busy}><X size={14} /> 공용 자료 초기화</button>}
      </div>
      <div className="susi-beta-compare-grid" style={ui.compareGrid}>
        <DataSummary title="학교 반영본" tone="school" data={schoolData} />
        <DataSummary title="현재 업로드 미리보기" tone="draft" data={draft} />
      </div>
      <div className="susi-beta-upload-panel" style={ui.uploadPanel}>
        <input ref={inputRef} type="file" accept=".xlsx,.xlsm" style={{ display: "none" }} onChange={event => { setFile(event.target.files?.[0] || null); setDraft(null); }} />
        <button type="button" style={ui.secondaryBtn} onClick={() => inputRef.current?.click()} disabled={busy}><FileSpreadsheet size={15} /> 파일 선택</button>
        <div style={ui.fileName}>{file ? <><b>{file.name}</b><span>{humanBytes(file.size)}</span></> : <span>경기도교육청 수시NAVI 교사용 XLSX 파일을 선택하세요.</span>}</div>
        <button type="button" style={ui.secondaryBtn} onClick={parseFile} disabled={!file || busy}>{busy ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} 파일 분석</button>
        <button type="button" style={ui.primaryBtn} onClick={saveSchool} disabled={!draft || busy}><Upload size={15} /> 학교 자료에 반영</button>
      </div>
      {status && <div style={ui.statusLine}>{busy && <Loader2 size={13} className="spin" />}{status}</div>}
      <div style={ui.notice}><AlertTriangle size={15} /><span>원본 엑셀 전체를 저장하지 않고, Beta 검색에 필요한 대학·모집단위·입시결과·수능최저·통계 변환 자료만 추출해 저장합니다.</span></div>
    </section>
  );
}

function DataSummary({ title, tone, data }) {
  const school = tone === "school";
  return (
    <article style={{ ...ui.summaryCard, ...(school ? ui.summarySchool : ui.summaryDraft) }}>
      <div style={ui.summaryTop}><div><b>{title}</b><span>{school ? "교사들이 조회하는 공용 자료" : "반영 전 확인 자료"}</span></div><span style={{ ...ui.statePill, ...(school ? ui.stateSchool : ui.stateDraft) }}>{data ? (school ? "반영됨" : "미리보기") : "없음"}</span></div>
      {data ? <>
        <div style={ui.statGrid}>
          <MiniStat label="대학" value={data.stats?.universities} />
          <MiniStat label="모집단위" value={data.stats?.records} />
          <MiniStat label="수능최저" value={data.stats?.minimums} />
          <MiniStat label="변환표" value={data.stats?.conversions} />
        </div>
        <div style={ui.sourceMeta}><b>{data.source?.fileName}</b><span>자료 기준 {data.source?.sourceDate || "확인 필요"} · {school ? `반영 ${formatDate(data.source?.savedAt || data.source?.parsedAt)}` : `분석 ${formatDate(data.source?.parsedAt)}`}</span></div>
      </> : <div style={ui.summaryEmpty}>등록된 자료가 없습니다.</div>}
    </article>
  );
}
function MiniStat({ label, value }) {
  return <div style={ui.miniStat}><span>{label}</span><b>{Number(value || 0).toLocaleString()}</b></div>;
}

export default function SusiNaviBetaView({ isAdmin = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [grade5, setGrade5] = useState("1.80");
  const [conversionMethod, setConversionMethod] = useState("legacy");
  const [conversionGroup, setConversionGroup] = useState("전교과");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("전체");
  const [field, setField] = useState("전체");
  const [admissionType, setAdmissionType] = useState("전체");
  const [minimumFilter, setMinimumFilter] = useState("전체");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    loadBetaData().then(value => { if (active) { setData(value); setLoading(false); } });
    return () => { active = false; };
  }, []);

  const conversion = useMemo(() => conversionDetails(data, conversionMethod, conversionGroup, grade5), [data, conversionMethod, conversionGroup, grade5]);
  const regions = useMemo(() => unique((data?.records || []).map(row => row[1])), [data]);
  const fields = useMemo(() => unique((data?.records || []).map(row => row[6])), [data]);
  const minimumByUniversity = useMemo(() => {
    const map = new Map();
    (data?.minimums || []).forEach(row => {
      const key = compactText(row[1]);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return map;
  }, [data]);

  const enriched = useMemo(() => (data?.records || []).map(row => {
    const minCandidates = minimumByUniversity.get(compactText(row[3])) || [];
    const minimums = minCandidates.filter(item => matchesUnit(item[5], row[5]));
    return { row, minimums };
  }), [data, minimumByUniversity]);

  const filtered = useMemo(() => {
    const needle = compactText(query);
    return enriched.filter(({ row, minimums }) => {
      if (region !== "전체" && row[1] !== region) return false;
      if (field !== "전체" && row[6] !== field) return false;
      if (admissionType === "교과" && !row[7]?.length) return false;
      if (admissionType === "종합" && !row[8]?.length) return false;
      if (admissionType === "정시" && !row[9]) return false;
      if (minimumFilter === "있음" && !minimums.length) return false;
      if (minimumFilter === "없음" && minimums.length) return false;
      if (needle && !compactText([row[0], row[1], row[2], row[3], row[4], row[5], row[6], ...(row[7] || []).flat(), ...(row[8] || []).flat()].join(" ")).includes(needle)) return false;
      return true;
    });
  }, [enriched, query, region, field, admissionType, minimumFilter]);

  useEffect(() => { setPage(1); }, [query, region, field, admissionType, minimumFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) return <div style={ui.loading}><Loader2 className="spin" size={22} /> 수시NAVI Beta 자료를 불러오는 중입니다.</div>;

  return (
    <section style={ui.root}>
      <style>{betaCss}</style>
      <div style={ui.hero}>
        <div><div style={ui.heroEyebrow}><Sparkles size={14} /> 경기도교육청 교사용 자료 기반 · 독립 시험 운영</div><h2 style={ui.heroTitle}>2027 수시NAVI <span>Beta</span></h2><p style={ui.heroText}>광덕고 대입 결과와 분리하여 대학·모집단위와 전년도 입시결과를 조회합니다.</p></div>
        {data && <div style={ui.heroStats}><b>{data.stats?.universities?.toLocaleString()}개 대학</b><span>{data.stats?.records?.toLocaleString()}개 모집단위</span><small>자료 기준 {data.source?.sourceDate || "확인 필요"}</small></div>}
      </div>
      <div style={ui.betaNotice}><AlertTriangle size={15} /><span><b>시험 운영 기능입니다.</b> 2027 모집단위와 2026 입시결과를 연결한 참고자료이며, 기존 광덕고 사례검색·지원구간 판정에는 영향을 주지 않습니다.</span></div>

      {!data ? <EmptyData isAdmin={isAdmin} /> : <>
        <div style={ui.converterPanel}>
          <div style={ui.sectionHeading}><div style={ui.step}>1</div><div><b style={ui.sectionTitle}>5·9등급 환산 기준</b><span style={ui.sectionSub}>현재 방식과 통계 기반 방식을 비교해서 사용할 수 있습니다.</span></div></div>
          <div className="susi-beta-converter-grid" style={ui.converterGrid}>
            <label style={ui.fieldLabel}><span>5등급제 내신</span><input type="number" min="1" max="5" step="0.01" value={grade5} onChange={event => setGrade5(event.target.value)} style={ui.input} /></label>
            <div style={ui.methodBox}><span style={ui.labelText}>환산 방식</span><div style={ui.segmented}>
              <button type="button" onClick={() => setConversionMethod("legacy")} style={{ ...ui.segmentBtn, ...(conversionMethod === "legacy" ? ui.segmentActive : {}) }}>기존 환산</button>
              <button type="button" onClick={() => setConversionMethod("statistical")} style={{ ...ui.segmentBtn, ...(conversionMethod === "statistical" ? ui.segmentActive : {}) }}>통계 기반 <small>Beta</small></button>
            </div></div>
            <label style={{ ...ui.fieldLabel, opacity: conversionMethod === "statistical" ? 1 : .5 }}><span>교과 조합</span><select value={conversionGroup} onChange={event => setConversionGroup(event.target.value)} disabled={conversionMethod !== "statistical"} style={ui.select}>{CONVERSION_GROUPS.map(value => <option key={value}>{value}</option>)}</select></label>
            <div style={ui.conversionResult}>
              <span style={ui.conversionLabel}>{conversionMethod === "legacy" ? "기존 9등급 환산" : "통계 환산 추정값"}</span>
              <b style={ui.conversionValue}>{conversion?.value != null ? Number(conversion.value).toFixed(2) : "-"}</b>
              <small style={ui.conversionHelp}>{conversionMethod === "statistical" ? `예상 범위 ${conversion?.range || "-"}` : "계산식 2×내신−1"}</small>
            </div>
          </div>
          {conversionMethod === "statistical" && <div style={ui.statDisclaimer}>53,149명 일반고 학생 자료를 활용한 통계적 추정값입니다. 대학별 공식 환산등급이 아니며, 예상 범위와 함께 참고해야 합니다.</div>}
        </div>

        <div style={ui.searchPanel}>
          <div style={ui.sectionHeading}><div style={ui.step}>2</div><div><b style={ui.sectionTitle}>대학·모집단위 검색</b><span style={ui.sectionSub}>검색 결과는 2027 모집단위와 2026 입시결과를 명확히 구분해 표시합니다.</span></div></div>
          <div className="susi-beta-filter-grid" style={ui.filterGrid}>
            <label className="susi-beta-query" style={ui.searchBox}><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="대학명·모집단위·전형명 검색" /></label>
            <FilterSelect label="지역" value={region} onChange={setRegion} options={["전체", ...regions]} />
            <FilterSelect label="계열" value={field} onChange={setField} options={["전체", ...fields]} />
            <FilterSelect label="전형" value={admissionType} onChange={setAdmissionType} options={["전체", "교과", "종합", "정시"]} />
            <FilterSelect label="수능최저" value={minimumFilter} onChange={setMinimumFilter} options={["전체", "있음", "없음"]} />
          </div>
          <div style={ui.resultCount}><b>{filtered.length.toLocaleString()}건</b><span>현재 조건에 해당하는 모집단위</span></div>
        </div>

        <div style={ui.resultList}>
          {visible.length ? visible.map(({ row, minimums }, index) => <ResultCard key={`${row[3]}-${row[5]}-${(page - 1) * PAGE_SIZE + index}`} row={row} minimums={minimums} convertedGrade={conversion?.value} />) : <div style={ui.noResult}>조건에 맞는 결과가 없습니다.</div>}
        </div>
        {pageCount > 1 && <div style={ui.pagination}><button disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>이전</button><span>{page} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>다음</button></div>}
      </>}
    </section>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return <label style={ui.filterLabel}><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>;
}

function ResultCard({ row, minimums, convertedGrade }) {
  const [regionGroup, region, detailRegion, university, unit2026, unit2027, field, teaching, holistic, regular] = row;
  return (
    <article className="susi-beta-result-card" style={ui.resultCard}>
      <div style={ui.resultIdentity}>
        <div style={ui.universityLine}><h3 style={ui.universityName}>{university}</h3><span style={ui.fieldBadge}>{field}</span></div>
        <b style={ui.unitTitle}>{unit2027}</b>
        <div style={ui.location}>{[regionGroup, region, detailRegion].filter(Boolean).join(" · ")}</div>
        {unit2026 && unit2026 !== unit2027 && <div style={ui.previousUnit}><span>2026 모집단위</span>{unit2026}</div>}
      </div>
      <div className="susi-beta-admission-columns" style={ui.admissionColumns}>
        <AdmissionGroup title="교과전형 · 2026 입시결과" items={teaching} convertedGrade={convertedGrade} tone="teaching" />
        <AdmissionGroup title="종합전형 · 2026 입시결과" items={holistic} convertedGrade={convertedGrade} tone="holistic" />
        <RegularGroup info={regular} />
        <MinimumGroup rows={minimums} />
      </div>
    </article>
  );
}
function AdmissionGroup({ title, items = [], convertedGrade, tone }) {
  return <div style={ui.resultSection}><div style={ui.resultSectionTitle}>{title}</div>{items.length ? <div style={ui.admissionItems}>{items.map((item, index) => {
    const diff = differenceLabel(convertedGrade, item[1]);
    return <div key={`${item[0]}-${index}`} style={{ ...ui.admissionItem, ...(tone === "teaching" ? ui.teachingItem : ui.holisticItem) }}><b>{item[0]}</b><span>50% {item[1] ?? "-"} · 70% {item[2] ?? "-"}</span>{diff && <small style={{ color: diff.favorable ? "#287348" : "#b05244" }}>학생−50%컷 {diff.text}</small>}</div>;
  })}</div> : <span style={ui.none}>자료 없음</span>}</div>;
}
function RegularGroup({ info }) {
  return <div style={ui.resultSection}><div style={ui.resultSectionTitle}>정시 · 2026 참고</div>{info ? <div style={{ ...ui.admissionItem, ...ui.regularItem }}><b>{info[0] || "정시"}</b><span>70% 백분위 {info[2] ?? "-"} · 영어/한국사 {info[3] || "-"}</span><small>{info[4] || info[1] || "반영영역 확인 필요"}</small></div> : <span style={ui.none}>자료 없음</span>}</div>;
}
function MinimumGroup({ rows = [] }) {
  return <div style={ui.resultSection}><div style={ui.resultSectionTitle}>2027 수능최저</div>{rows.length ? <div style={ui.minimumList}>{rows.slice(0, 2).map((row, index) => <div key={`${row[3]}-${index}`} style={ui.minimumItem}><b>{row[3] || row[2] || "전형"}</b><span>{row[8] || "기준 원문 확인"}</span><small>{[row[6], row[10] && row[10] !== "-" ? row[10] : ""].filter(Boolean).join(" · ")}</small></div>)}</div> : <span style={ui.none}>해당 모집단위 매칭 자료 없음</span>}</div>;
}

const ui = {
  root: { display: "grid", gap: 14, fontFamily: "Pretendard, 'Noto Sans KR', system-ui, sans-serif", color: "#222a3a" },
  loading: { minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#647086", fontWeight: 750 },
  hero: { padding: "23px 25px", borderRadius: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, color: "#fff", background: "linear-gradient(135deg,#63558e,#8a5d82)", boxShadow: "0 14px 34px rgba(86,67,119,.18)" },
  heroEyebrow: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, opacity: .82 },
  heroTitle: { margin: "6px 0 4px", fontSize: 25, lineHeight: 1.15, letterSpacing: "-.03em" },
  heroText: { margin: 0, fontSize: 12.5, lineHeight: 1.55, opacity: .88 },
  heroStats: { minWidth: 170, display: "grid", gap: 4, textAlign: "right" },
  betaBadge: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#eee8ff", color: "#6b55a0", fontSize: 10, fontWeight: 900, verticalAlign: "middle" },
  betaNotice: { display: "flex", gap: 9, alignItems: "flex-start", padding: "11px 14px", border: "1px solid #e5d9b7", borderRadius: 12, background: "#fff9e9", color: "#6e5923", fontSize: 11.5, lineHeight: 1.55 },
  empty: { minHeight: 280, padding: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, border: "1px dashed #cfd5df", borderRadius: 16, background: "#fafbfc", color: "#667085", textAlign: "center" },
  converterPanel: { padding: 18, border: "1px solid #dce2ec", borderRadius: 16, background: "#fff" },
  searchPanel: { padding: 18, border: "1px solid #dce2ec", borderRadius: 16, background: "#fff" },
  sectionHeading: { display: "flex", gap: 10, alignItems: "center", marginBottom: 14 },
  sectionTitle: { display: "block", fontSize: 14, lineHeight: 1.25, color: "#2b3445" },
  sectionSub: { display: "block", marginTop: 3, fontSize: 10.5, lineHeight: 1.45, color: "#7a8495" },
  step: { width: 26, height: 26, borderRadius: 9, background: "#665690", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12 },
  converterGrid: { display: "grid", gridTemplateColumns: "150px minmax(270px,1.4fr) minmax(160px,.8fr) minmax(190px,.9fr)", gap: 10, alignItems: "stretch" },
  fieldLabel: { display: "grid", gap: 6, minWidth: 0, fontSize: 11, fontWeight: 800, color: "#5d6678" },
  labelText: { fontSize: 11, fontWeight: 800, color: "#5d6678" },
  input: { width: "100%", boxSizing: "border-box", height: 42, border: "1px solid #ced7e5", borderRadius: 10, padding: "0 12px", fontSize: 16, fontWeight: 900, color: "#263c62", outline: "none" },
  select: { width: "100%", height: 42, border: "1px solid #ced7e5", borderRadius: 10, padding: "0 10px", background: "#fff", fontWeight: 750, color: "#344054" },
  methodBox: { display: "grid", gap: 6 },
  segmented: { display: "grid", gridTemplateColumns: "1fr 1fr", padding: 4, borderRadius: 11, background: "#eef1f6" },
  segmentBtn: { minHeight: 34, border: 0, borderRadius: 8, background: "transparent", color: "#657085", fontWeight: 800, cursor: "pointer" },
  segmentActive: { background: "#fff", color: "#5c4a89", boxShadow: "0 3px 8px rgba(57,65,83,.12)" },
  conversionResult: { display: "grid", alignContent: "center", gap: 2, padding: "9px 13px", borderRadius: 12, background: "linear-gradient(135deg,#f5f1ff,#faf8ff)", border: "1px solid #dcd2f0" },
  conversionLabel: { fontSize: 10, fontWeight: 850, color: "#73658d" },
  conversionValue: { fontSize: 21, lineHeight: 1.1, color: "#543f82" },
  conversionHelp: { fontSize: 9.5, color: "#817795" },
  statDisclaimer: { marginTop: 10, padding: "9px 11px", borderRadius: 10, background: "#f7f5fb", color: "#6d6381", fontSize: 10.5, lineHeight: 1.5 },
  filterGrid: { display: "grid", gridTemplateColumns: "minmax(260px,2fr) repeat(4,minmax(120px,.65fr))", gap: 9 },
  searchBox: { minHeight: 44, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", border: "1px solid #cdd7e6", borderRadius: 11, background: "#fff" },
  filterLabel: { display: "grid", gridTemplateRows: "auto 1fr", gap: 3, fontSize: 9.5, fontWeight: 800, color: "#758095" },
  resultCount: { marginTop: 11, display: "flex", alignItems: "baseline", gap: 6, color: "#687386", fontSize: 11 },
  resultList: { display: "grid", gap: 10 },
  resultCard: { display: "grid", gridTemplateColumns: "235px 1fr", gap: 14, padding: 14, border: "1px solid #dbe2ec", borderRadius: 15, background: "#fff", boxShadow: "0 4px 13px rgba(52,62,78,.04)" },
  resultIdentity: { minWidth: 0, display: "grid", alignContent: "start", gap: 5, padding: 11, borderRadius: 12, background: "#f7f8fb" },
  universityLine: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" },
  universityName: { margin: 0, fontSize: 16, lineHeight: 1.2, letterSpacing: "-.02em" },
  fieldBadge: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#e9edf5", color: "#526078", fontSize: 9.5, fontWeight: 850 },
  unitTitle: { fontSize: 14, lineHeight: 1.35, wordBreak: "keep-all" },
  location: { fontSize: 10.5, color: "#7c8596" },
  previousUnit: { marginTop: 5, display: "grid", gap: 2, paddingTop: 7, borderTop: "1px solid #e1e5ec", fontSize: 10.5, color: "#697386" },
  admissionColumns: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 9 },
  resultSection: { minWidth: 0, display: "grid", alignContent: "start", gap: 6 },
  resultSectionTitle: { fontSize: 10.5, fontWeight: 900, color: "#596579" },
  admissionItems: { display: "grid", gap: 5 },
  admissionItem: { minWidth: 0, display: "grid", gap: 2, padding: "8px 9px", borderRadius: 10, border: "1px solid #dce3ed", background: "#fbfcfd", fontSize: 10.5 },
  teachingItem: { borderColor: "#d6dfef", background: "#f5f8ff" },
  holisticItem: { borderColor: "#e3dbea", background: "#fbf7fe" },
  regularItem: { borderColor: "#d7e4df", background: "#f4faf7" },
  none: { padding: "10px 8px", borderRadius: 9, background: "#f5f6f8", color: "#9aa1ad", fontSize: 10.5, textAlign: "center" },
  minimumList: { display: "grid", gap: 5 },
  minimumItem: { display: "grid", gap: 2, padding: "8px 9px", borderRadius: 10, border: "1px solid #ead9a9", background: "#fffaf0", fontSize: 10.5 },
  noResult: { padding: 40, borderRadius: 15, border: "1px dashed #d5dae2", textAlign: "center", color: "#838b99" },
  pagination: { display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: 8 },
  adminWrap: { display: "grid", gap: 14, padding: 16, border: "1px solid #dfe3eb", borderRadius: 16, background: "#fff" },
  adminHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  adminTitle: { display: "inline", margin: "0 0 0 7px", fontSize: 18 },
  muted: { margin: "6px 0 0", fontSize: 11.5, color: "#7c8494" },
  compareGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  summaryCard: { padding: 14, borderRadius: 14, border: "1px solid", display: "grid", gap: 11 },
  summarySchool: { background: "#f3faf6", borderColor: "#c9dfd1" },
  summaryDraft: { background: "#f5f8ff", borderColor: "#ccd8ec" },
  summaryTop: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" },
  statePill: { padding: "4px 8px", borderRadius: 999, fontSize: 9.5, fontWeight: 900 },
  stateSchool: { color: "#287348", background: "#e1f3e8" },
  stateDraft: { color: "#315a9b", background: "#e7efff" },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 },
  miniStat: { display: "grid", gap: 2, padding: 8, borderRadius: 9, background: "rgba(255,255,255,.72)", textAlign: "center" },
  sourceMeta: { display: "grid", gap: 3, fontSize: 10.5, color: "#6f7888" },
  summaryEmpty: { padding: 22, textAlign: "center", color: "#9299a6", fontSize: 11 },
  uploadPanel: { display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 8, alignItems: "center", padding: 11, borderRadius: 12, background: "#f7f8fa" },
  fileName: { minWidth: 0, display: "grid", gap: 2, fontSize: 11, color: "#737c8c", overflow: "hidden" },
  statusLine: { display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: 9, background: "#f1f3f7", color: "#667085", fontSize: 10.5 },
  notice: { display: "flex", gap: 7, padding: 10, borderRadius: 10, background: "#fff8e7", color: "#725d26", fontSize: 10.5, lineHeight: 1.5 },
  primaryBtn: { minHeight: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 13px", border: 0, borderRadius: 10, color: "#fff", background: "#66558e", fontWeight: 850, cursor: "pointer" },
  secondaryBtn: { minHeight: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 12px", border: "1px solid #cbd5e3", borderRadius: 10, color: "#455166", background: "#fff", fontWeight: 800, cursor: "pointer" },
  dangerGhost: { minHeight: 34, display: "inline-flex", alignItems: "center", gap: 5, padding: "0 10px", border: "1px solid #ebc7c2", borderRadius: 9, color: "#ae4c42", background: "#fff8f7", fontWeight: 800, cursor: "pointer" },
};

const betaCss = `
.susi-beta-filter-grid input{min-width:0;flex:1;border:0;outline:0;background:transparent;font:inherit;font-size:12px;color:#263244}
.susi-beta-filter-grid select{width:100%;height:38px;border:1px solid #cdd7e6;border-radius:10px;background:#fff;padding:0 9px;font:inherit;font-size:11px;font-weight:750;color:#344054;outline:0}
.susi-beta-filter-grid label>span{padding-left:2px}
@media(max-width:900px){
  .susi-beta-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .susi-beta-query{grid-column:1/-1}
  .susi-beta-result-card{grid-template-columns:1fr!important}
  .susi-beta-admission-columns{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .susi-beta-converter-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .susi-beta-upload-panel{grid-template-columns:auto 1fr!important}
  .susi-beta-compare-grid{grid-template-columns:1fr!important}
}
@media(max-width:720px){
  .susi-beta-filter-grid{grid-template-columns:1fr!important}
  .susi-beta-query{grid-column:auto}
  .susi-beta-admission-columns,.susi-beta-converter-grid{grid-template-columns:1fr!important}
  .susi-beta-upload-panel{grid-template-columns:1fr!important}
}
`;
