import React, { useEffect, useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Loader2, Save, Trash2, Search, GraduationCap, Database, AlertTriangle, CheckCircle2, Filter, RotateCcw, ChevronUp, ChevronDown, ArrowLeft, ChevronRight, Star, ExternalLink, Printer } from "lucide-react";
import { computeAllGroupAverages, computeMockExamSums, grade5to9, parseAdmissionCaseRows, summarizeAdmissionCases } from "./gradeEngine.js";

const SEMESTERS=["1-1","1-2","2-1","2-2","3-1","3-2"];
const MOCKS=["1-3","1-6","1-9","1-10","2-3","2-6","2-9","3-3","3-6","3-9"];
const PAGE_SIZE=50;
const COLORS={blue:"#315a9b",green:"#39724c",purple:"#6b4f91",red:"#9a3f3f",gold:"#8a641d",line:"#e2ded3",muted:"#777167"};
function printAdmissionCaseSearch(orientation="portrait"){
  if(typeof window==="undefined"||typeof document==="undefined")return;
  const className="print-admission-case-search";
  const orientationClass=orientation==="landscape"?"print-admission-landscape":"print-admission-portrait";
  let pageStyle=document.getElementById("admission-case-dynamic-page");
  if(!pageStyle){pageStyle=document.createElement("style");pageStyle.id="admission-case-dynamic-page";document.head.appendChild(pageStyle)}
  pageStyle.textContent=`@page{size:A4 ${orientation==="landscape"?"landscape":"portrait"};margin:${orientation==="landscape"?"7mm":"8mm"}}`;
  const cleanup=()=>{document.body.classList.remove(className,"print-admission-landscape","print-admission-portrait");pageStyle?.remove()};
  document.body.classList.add(className,orientationClass);
  window.addEventListener("afterprint",cleanup,{once:true});
  window.requestAnimationFrame(()=>window.print());
  window.setTimeout(cleanup,15000);
}
const CSS=`
.admission-case-ui{
  font-family:Pretendard,"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  color:#202832;
  letter-spacing:-.015em;
  line-height:1.45;
  font-size:14px;
}
.admission-case-ui *{box-sizing:border-box}
.admission-case-ui h2,.admission-case-ui h3,.admission-case-ui h4,.admission-case-ui p{margin:0}
.admission-case-ui h2{font-size:24px;line-height:1.25;font-weight:800}
.admission-case-ui h3{font-size:18px;line-height:1.35;font-weight:800}
.admission-case-ui table{width:100%;border-collapse:collapse;text-align:center;font-size:13px;line-height:1.4}
.admission-case-ui th,.admission-case-ui td{border-right:1px solid #e5e0d6;border-bottom:1px solid #e5e0d6;padding:10px 9px;vertical-align:middle;word-break:keep-all}
.admission-case-ui th{background:#f4f2ed;font-weight:800;white-space:nowrap;color:#303741}
.admission-case-ui td{color:#313842}
.admission-case-ui th:last-child,.admission-case-ui td:last-child{border-right:0}
.admission-case-ui input,.admission-case-ui select,.admission-case-ui button{font:inherit}
.admission-case-ui button:disabled{opacity:.45;cursor:not-allowed}
.admission-case-ui [style*="studentMetrics"]{}
.admission-case-ui small{line-height:1.35}
.admission-student-profile-badges span{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;background:#fff;border:1px solid #dbe3ef;color:#5b6879;font-size:10.5px;font-weight:800;white-space:nowrap}
.admission-student-score-groups{display:grid;grid-template-columns:minmax(210px,.9fr) minmax(245px,1.1fr);gap:9px;min-width:0;width:100%;max-width:100%;align-items:stretch}
.admission-student-score-group{display:grid;grid-template-rows:auto minmax(0,1fr);gap:8px;padding:10px;border-radius:13px;border:1px solid #d7e1ee;background:linear-gradient(145deg,#ffffff,#f7faff);min-width:0;max-width:100%;overflow:hidden}
.admission-student-score-group.is-school-group{border:2px solid #8da9cc;background:linear-gradient(145deg,#f7fbff,#edf4ff);box-shadow:0 7px 18px rgba(49,95,149,.10)}
.admission-student-score-group.is-mock-group{background:linear-gradient(145deg,#ffffff,#f9f7ff);border-color:#ddd9ee}
.admission-score-group-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.admission-score-group-head strong{font-size:12px;color:#33465f;white-space:nowrap}
.admission-score-group-head span{font-size:9.5px;color:#7a8798;font-weight:800;white-space:nowrap}
.admission-student-metrics{display:grid;gap:7px;min-width:0}
.admission-student-metrics.is-school{grid-template-columns:repeat(2,minmax(0,1fr))}
.admission-student-metrics.is-mock{grid-template-columns:repeat(3,minmax(56px,1fr));gap:5px}
.admission-student-metrics>div{display:grid;gap:4px;align-content:center;min-height:54px;padding:7px 6px;border-radius:10px;background:#fff;border:1px solid #e0e6ef;text-align:center;min-width:0;overflow:hidden}
.admission-student-metrics.is-school>div{min-height:68px;border-color:#ccd9ea}
.admission-student-metrics.is-school>div.is-current-grade{background:#fff}
.admission-student-metrics.is-school>div.is-converted-grade{background:#315f95;border-color:#315f95}
.admission-student-metrics small{font-size:9.5px;color:#6f7d90;font-weight:850;white-space:normal;word-break:keep-all;line-height:1.28}
.admission-student-metrics b{font-size:15.5px;color:#263345;white-space:nowrap;line-height:1.12}
.admission-student-metrics.is-school b{font-size:17px;font-weight:950;letter-spacing:-.025em}
.admission-student-metrics.is-mock b{font-size:18.5px;font-weight:950;letter-spacing:-.03em}
.admission-student-metrics.is-mock small{font-size:9.5px;color:#738094;font-weight:850;white-space:nowrap}.admission-student-metrics.is-mock .is-four-sum{padding-left:4px;padding-right:4px}.admission-student-metrics.is-mock .is-four-sum b{font-size:18px}
.admission-student-metrics.is-school>div.is-converted-grade small,.admission-student-metrics.is-school>div.is-converted-grade b{color:#fff!important}
.admission-case-search button{display:block;width:100%;padding:9px 11px;border:0;background:#fff;text-align:left;cursor:pointer;font-size:13px}
.admission-case-search button:hover{background:#edf3ff}
.admission-favorite-button{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9px;border:1px solid #dce2eb;background:#fff;color:#8993a0;cursor:pointer;flex:0 0 auto}
.admission-favorite-button:hover{border-color:#f0c94d;background:#fffaf0;color:#c69600}
.admission-favorite-button.is-active{background:#0f1a2e;border-color:#0f1a2e;color:#ffd84d}
.admission-favorite-button svg{fill:currentColor}
.admission-link-button{display:inline-flex;align-items:center;gap:4px;border:1px solid #d5deea;background:#fff;color:#315a86;border-radius:8px;padding:5px 8px;font-size:10.5px;font-weight:850;cursor:pointer}
.admission-link-button:hover{background:#edf3fb}
.admission-filter-chip{
  display:inline-flex;align-items:center;justify-content:center;gap:5px;
  min-height:34px;padding:7px 12px;border:1px solid #d7dfe9;border-radius:999px;
  background:#fff;color:#465466;font-size:12.5px;font-weight:700;cursor:pointer;
  transition:transform .15s,background .15s,border-color .15s,color .15s,box-shadow .15s;
  white-space:nowrap;
}
.admission-filter-chip:hover{transform:translateY(-1px);border-color:#8ca6c4;background:#f6f9fc}
.admission-filter-chip.is-active{background:#315f95;border-color:#315f95;color:#fff;box-shadow:0 4px 10px rgba(49,95,149,.18)}
.admission-filter-group{display:grid;gap:10px;padding:13px;border:1px solid #e1e6ec;border-radius:14px;background:#fafcfe}
.admission-filter-group-title{font-size:14px!important;font-weight:950!important;color:#26384f!important;letter-spacing:-.02em}
.admission-filter-group-count{font-size:10.8px!important;color:#708095!important;font-weight:850!important}
.admission-filter-options{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.admission-filter-group.is-region .admission-filter-options{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:8px}
.admission-filter-group.is-region .admission-filter-chip{width:100%;padding-left:6px;padding-right:6px}
.admission-filter-group.is-field{background:linear-gradient(135deg,#f8fbff,#fbf9ff);border-color:#dce4ef}
.admission-filter-group.is-field .admission-filter-options{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.admission-filter-group.is-field .admission-filter-chip{width:100%;min-height:38px}
.admission-filter-group.is-field .admission-filter-chip.is-active{background:linear-gradient(135deg,#315f95,#5d69a4);border-color:transparent}
.admission-filter-group.is-admission-type{background:linear-gradient(135deg,#f8fbff,#fcfbff);border-color:#dce4ef}
.admission-filter-priority{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.admission-filter-secondary-options{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.admission-filter-priority .admission-filter-chip,.admission-filter-secondary-options .admission-filter-chip{width:100%;min-height:38px}
.admission-filter-priority .admission-filter-chip{background:#f5f8fd;border-color:#cdd9ea;color:#294c76}
.admission-filter-priority .admission-filter-chip.is-active{background:linear-gradient(135deg,#294f7f,#536e9a);border-color:transparent;color:#fff}
.admission-filter-secondary-options .admission-filter-chip.is-active{background:#5b6374;border-color:#5b6374;color:#fff}
.admission-cut-arrow{display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;font-weight:900}
.admission-holistic-notice{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:10px;background:#fff8e8;border:1px solid #ecd69e;color:#755b20;font-size:11.5px;line-height:1.45}
.admission-university-picker{display:grid;grid-template-columns:minmax(240px,1fr) minmax(250px,.9fr);gap:10px;align-items:end}
.admission-university-picker select{width:100%;height:42px;border:1px solid #cfd8e5;border-radius:11px;background:#fff;padding:0 12px;font-weight:800;color:#2d3948;outline:none}
.admission-university-picker select:focus{border-color:#6e8db8;box-shadow:0 0 0 3px rgba(64,101,151,.12)}
.admission-range-button{
  min-width:66px;padding:8px 13px;border:1px solid #d5deea;border-radius:10px;
  background:#fff;color:#465466;font-size:13px;font-weight:700;cursor:pointer;
}
.admission-range-button.is-active{background:#334f78;border-color:#334f78;color:#fff;box-shadow:0 3px 8px rgba(51,79,120,.18)}
.admission-filter-primary,.admission-filter-secondary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.admission-case-count-pill{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:5px 9px;font-size:11.5px;font-weight:800;white-space:nowrap}
.admission-case-count-pill.support{background:#edf3ff;color:#315a9b;border:1px solid #cfdbef}
.admission-case-count-pill.accept{background:#edf8f0;color:#2f7347;border:1px solid #c7e4cf}
.admission-case-count-pill.reject{background:#fff0f0;color:#9a3f3f;border:1px solid #efcaca}
.admission-case-count-pill.first{background:#eef4ff;color:#315a9b;border:1px solid #cedbef}
.admission-case-count-pill.wait{background:#f4effb;color:#6b4f91;border:1px solid #d9cdeb}
.admission-case-comparison{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.admission-case-comparison>div{display:grid;gap:2px;padding:9px 10px;border-radius:10px;background:#f7f9fc;border:1px solid #e0e6ef}
.admission-case-comparison small{color:#6e7785;font-size:10.5px;font-weight:700}
.admission-case-comparison b{font-size:14px}
.admission-comparison-summary>div,.admission-detail-compare>div,.admission-detail-metrics>div{display:grid;gap:5px;align-content:center;min-width:0}
.admission-comparison-summary small,.admission-detail-compare small,.admission-detail-metrics small{display:block;color:#6f7b8b;font-size:10px;font-weight:850;line-height:1.35}
.admission-comparison-summary b,.admission-detail-compare b,.admission-detail-metrics b{display:block;font-size:15px;line-height:1.2;white-space:nowrap}
.admission-comparison-summary>div{padding:10px 11px;border-radius:10px;background:#fff;border:1px solid #dfe5ee}
.admission-detail-compare>div{padding:10px 11px;border-radius:10px;background:#f7f9fc;border:1px solid #e0e6ef;text-align:center}
.admission-detail-metrics>div{padding:10px 11px;border-radius:10px;background:#fbfcfe;border:1px solid #e3e7ed;text-align:center}
.admission-case-ui .metric-card{}
.admission-search-shell{display:flex;align-items:center;gap:10px;border:1px solid #cfd9e7;border-radius:13px;background:#fff;padding:10px 12px;box-shadow:0 4px 14px rgba(48,65,88,.06)}
.admission-search-shell input{flex:1;min-width:0;border:0;outline:0;background:transparent;font-size:13.5px;font-weight:650;color:#273344}
.admission-search-count{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:#eef3fa;color:#315a86;padding:4px 9px;font-size:11px;font-weight:900;white-space:nowrap}
.admission-university-card{transition:transform .15s,box-shadow .15s,border-color .15s;background:#fff;text-align:left;width:100%;font:inherit;color:inherit;cursor:pointer}
.admission-university-card:focus-visible{outline:3px solid rgba(49,95,149,.22);outline-offset:2px}
.admission-sample-badge{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:5px 9px;background:#20242a;color:#ffd45d;border:1px solid #20242a;font-size:10px;font-weight:900;line-height:1;white-space:nowrap;box-shadow:0 3px 8px rgba(20,24,29,.13)}
.admission-band-badge{display:inline-flex;align-items:center;justify-content:center;border-radius:8px;padding:5px 9px;font-size:11px;font-weight:900;line-height:1;white-space:nowrap;border:1px solid}
.admission-detail-table{table-layout:fixed}
.admission-detail-table td,.admission-detail-table th{overflow-wrap:anywhere}
.admission-grade-row-1 td{background:#f0f7ff}
.admission-grade-row-1 td:first-child{background:#315f95;color:#fff}
.admission-grade-row-2 td{background:#f5f8ff}
.admission-grade-row-2 td:first-child{background:#dbe8fb;color:#274d7a}
.admission-grade-row-1 td:first-child,.admission-grade-row-2 td:first-child{font-weight:900}
.admission-university-choice-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;max-height:210px;overflow-y:auto;padding:2px 3px 4px 0}
.admission-university-choice-grid button{min-width:0}
.admission-rate-meter{height:5px;border-radius:99px;background:#ebe8e1;overflow:hidden;margin-top:4px}
.admission-rate-meter>span{display:block;height:100%;border-radius:99px}
.admission-case-ui [style*="bandLegend"]{}
.admission-case-ui .admission-band-legend-item{}
.admission-university-card:hover{transform:translateY(-2px);box-shadow:0 7px 18px rgba(44,59,81,.09);border-color:#c4cfdd}
.admission-mode-button{min-width:92px}

.admission-detail-filter{display:grid;gap:10px;padding:13px;border:1px solid #dfe5ed;border-radius:14px;background:linear-gradient(135deg,#fbfcff,#f8faff)}
.admission-detail-filter-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.admission-detail-filter-search{display:flex;align-items:center;gap:7px;min-width:min(100%,260px);padding:7px 9px;border:1px solid #d5deea;border-radius:9px;background:#fff}
.admission-detail-filter-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;font-size:11.5px}
.admission-detail-selected{display:flex;gap:6px;flex-wrap:wrap}
.admission-detail-selected button{border:1px solid #bfcde0;background:#edf3fb;color:#315a86;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:850;cursor:pointer}
.admission-detail-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;max-height:176px;overflow-y:auto;padding-right:3px}
.admission-detail-options button{display:flex;align-items:center;justify-content:flex-start;min-width:0;text-align:left;padding:7px 8px;border:1px solid #dbe2ec;border-radius:9px;background:#fff;color:#48576a;font-size:10.5px;font-weight:750;line-height:1.3;cursor:pointer;word-break:keep-all;overflow-wrap:anywhere}
.admission-detail-options button.is-active{background:#2f557f;border-color:#2f557f;color:#fff}
.admission-detail-options.is-grouped{grid-template-columns:repeat(4,minmax(0,1fr));max-height:none}
.admission-detail-options.is-grouped button{justify-content:space-between;gap:8px;text-align:left;padding:9px 10px}
.admission-detail-options.is-grouped button small{flex:0 0 auto;padding:2px 6px;border-radius:999px;background:#eef3f8;color:#596b80;font-size:9.5px;font-weight:900}
.admission-detail-options.is-grouped button.is-active small{background:rgba(255,255,255,.2);color:#fff}
.admission-range-panel{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:13px 15px;background:#fff;border:1px solid #e2ded3;border-radius:13px}
.admission-range-panel>div:first-child{display:grid;gap:3px}.admission-range-panel b{font-size:13px}.admission-range-panel span{font-size:10.5px;color:#747e8c}
.admission-section-aside{margin-left:auto;display:flex;align-items:center;justify-content:flex-end;min-width:0}
.admission-current-university{display:grid;gap:2px;justify-items:end;max-width:260px;padding:7px 10px;border-radius:10px;background:#f1f5fb;border:1px solid #d7e1ee;color:#2d4f79;text-align:right}
.admission-current-university small{font-size:9.5px;color:#74839a;font-weight:850}
.admission-current-university b{font-size:12.5px;line-height:1.3;word-break:keep-all;overflow-wrap:anywhere}
.admission-internal-nav{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;border:1px solid #d7e1ee;border-radius:11px;background:linear-gradient(135deg,#f7faff,#fbf9ff);color:#526177;font-size:11.5px}
.admission-internal-nav button{display:inline-flex;align-items:center;gap:5px;border:1px solid #cbd7e6;background:#fff;color:#2f537f;border-radius:8px;padding:7px 10px;font-weight:900;cursor:pointer}
.admission-case-search-root{display:grid;gap:12px;width:100%;max-width:100%;margin:0;justify-self:stretch;min-width:0}
.admission-case-search-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;min-width:0}
.admission-case-search-controls>*{min-width:0}
.admission-case-search-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0;flex-wrap:wrap}
.admission-case-student-benchmark{display:grid;grid-template-columns:auto auto;align-items:center;gap:4px 10px;min-width:218px;padding:9px 11px;border:2px solid #7e9fc6;border-radius:12px;background:linear-gradient(135deg,#edf5ff,#f8fbff);box-shadow:0 4px 12px rgba(49,95,149,.10)}
.admission-case-benchmark-head{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.admission-case-benchmark-head>span{font-size:10.5px;font-weight:950;color:#4d617d;letter-spacing:.01em;white-space:nowrap}
.admission-case-student-benchmark strong{font-size:21px;line-height:1;color:#203f66;font-weight:950;letter-spacing:-.035em}
.admission-case-student-benchmark small{font-size:10px;color:#5d6f86;font-weight:900;white-space:nowrap}
.admission-case-student-benchmark em{grid-column:1/-1;font-style:normal;font-size:9.8px;color:#315f95;font-weight:900;line-height:1.35}
.admission-grade-system-toggle{display:inline-flex;gap:2px;padding:2px;border:1px solid #c9d6e6;border-radius:8px;background:#fff;flex:0 0 auto}
.admission-grade-system-toggle button{border:0;border-radius:6px;padding:3px 6px;background:transparent;color:#66778d;font-size:9px;font-weight:900;line-height:1.2;cursor:pointer;white-space:nowrap}
.admission-grade-system-toggle button.is-active{background:#315f95;color:#fff}
.admission-case-range-filter{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 10px;border:1px solid #dce3ed;border-radius:12px;background:#f8faff}
.admission-case-range-filter>span{font-size:11px;font-weight:900;color:#5f7087;white-space:nowrap}
.admission-case-print-button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:38px;padding:8px 11px;border:1px solid #cbd7e6;border-radius:10px;background:#fff;color:#2f537f;font-size:11.5px;font-weight:900;white-space:nowrap;cursor:pointer}
.admission-case-print-button:hover{background:#edf3fb;border-color:#9eb3ce}
.admission-case-sort-select{min-height:38px;padding:7px 28px 7px 10px;border:1px solid #cbd7e6;border-radius:10px;background:#fff;color:#33465e;font-size:11.5px;font-weight:900;outline:none;cursor:pointer}
.admission-case-sort-select:focus{border-color:#7f9fc3;box-shadow:0 0 0 3px rgba(49,95,149,.10)}
.admission-case-compact-control{display:grid;gap:3px;min-width:0;padding:5px 7px;border:1px solid #d5dfeb;border-radius:11px;background:#fff}
.admission-case-compact-control>span,.admission-case-compact-control label>span{font-size:9px;color:#7a8798;font-weight:900;line-height:1}
.admission-case-sort-control .admission-case-sort-select{width:100%;min-height:27px;padding:3px 22px 3px 2px;border:0;border-radius:6px;background:transparent;font-size:11.5px!important;box-shadow:none!important}
.admission-case-print-control{grid-template-columns:minmax(74px,1fr) auto;align-items:end;gap:6px}
.admission-case-print-control label{display:grid;gap:3px;min-width:0}
.admission-case-print-control select{width:100%;min-height:27px;padding:3px 20px 3px 3px;border:0;background:transparent;color:#33465e;font-size:10.8px;font-weight:850;outline:none}
.admission-case-print-control .admission-case-print-button{min-height:32px;padding:6px 9px;font-size:10.8px!important}
.admission-case-search-context{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 10px;border-radius:10px;background:#f3f7fc;border:1px solid #dbe4f0;color:#425675;font-size:11.5px}
.admission-case-filter-status{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;font-weight:850}
.admission-case-filter-status b{padding:3px 7px;border-radius:999px;background:#fff;border:1px solid #cad8e9;color:#315a86}
.admission-case-search-table{font-size:10.5px!important}
.admission-case-search-table th,.admission-case-search-table td{padding:7px 4px!important;line-height:1.3}
.admission-case-grade-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
.admission-case-grade-grid span{display:grid;gap:3px;padding:5px 3px;border-radius:7px;background:#f7f9fc;border:1px solid #e1e6ed;text-align:center;min-width:0}
.admission-case-grade-grid small{font-size:8.7px;color:#6f7b8b;font-weight:850;white-space:nowrap}
.admission-case-grade-grid b{font-size:11.5px;color:#26364c;white-space:nowrap}


/* V27.15 filter and case-search refinements */
.admission-filter-group,.admission-filter-group *,.admission-method-filter,.admission-method-filter *,.admission-quick-filter,.admission-quick-filter *{font-family:inherit!important;letter-spacing:-.015em}
.admission-filter-group>b,.admission-filter-group>div>b{font-size:12.5px!important;font-weight:850!important}
.admission-filter-chip{font-size:12.4px;font-weight:850;line-height:1.2}
.admission-filter-group.is-field .admission-filter-chip{font-size:12.2px}
.admission-method-filter{display:grid;gap:12px;padding:14px;border:1px solid #dfe5ed;border-radius:15px;background:linear-gradient(135deg,#fbfdff,#f7f9fd)}
.admission-method-filter-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.admission-method-filter-head>div:first-child{display:grid;gap:3px}
.admission-method-filter-head b{font-size:14.5px;color:#26384f;font-weight:950}
.admission-method-filter-head span{font-size:11px;color:#748095;font-weight:700}
.admission-method-search{display:flex;align-items:center;gap:7px;min-width:min(100%,275px);padding:8px 10px;border:1px solid #d4deeb;border-radius:10px;background:#fff}
.admission-method-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:11.5px;color:#334155}
.admission-method-category-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:start}
.admission-method-card{display:grid;gap:8px;min-width:0;padding:10px;border:1px solid #dce4ef;border-radius:12px;background:#fff}
.admission-method-card.is-active{border-color:#7f9bc0;box-shadow:0 4px 12px rgba(49,95,149,.08)}
.admission-method-card.is-empty{opacity:.55}
.admission-method-head{display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;padding:9px 10px;border:0;border-radius:9px;background:#eef3f9;color:#294e79;cursor:pointer;font:inherit;font-size:13.2px;font-weight:950;text-align:left}
.admission-method-head.is-active{background:linear-gradient(135deg,#315f95,#5d6ea1);color:#fff}
.admission-method-head small{font-size:9.5px;font-weight:900;white-space:nowrap}
.admission-method-details{display:grid;gap:6px}
.admission-method-detail{display:flex;align-items:center;justify-content:space-between;gap:7px;min-width:0;padding:7px 8px;border:1px solid #e0e6ee;border-radius:8px;background:#fbfcfe;color:#46576c;cursor:pointer;font:inherit;font-size:10.5px;font-weight:800;text-align:left;line-height:1.25}
.admission-method-detail span{min-width:0;overflow-wrap:anywhere;word-break:keep-all}
.admission-method-detail small{flex:0 0 auto;padding:2px 5px;border-radius:999px;background:#edf2f7;color:#66778b;font-size:9px;font-weight:900}
.admission-method-detail.is-active{background:#e8f0fb;border-color:#89a4c8;color:#274f7d}
.admission-method-detail.is-active small{background:#315f95;color:#fff}
.admission-quick-filter{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px;border:1px solid #dfe5ed;border-radius:13px;background:#fff}
.admission-quick-filter-group{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;min-width:0}
.admission-quick-filter-label{display:grid;gap:2px;min-width:105px}
.admission-quick-filter-label b{font-size:15px;color:#22364f;font-weight:950;letter-spacing:-.025em}
.admission-quick-filter-label span{font-size:11px;color:#68788e;font-weight:800;line-height:1.35}
.admission-quick-filter-options{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.admission-quick-filter .admission-filter-chip{min-height:38px;padding:8px 14px;font-size:13px;font-weight:900}
.admission-case-search-table .grade-overall{background:#f2f6fd;color:#2d5482}
.admission-case-search-table .grade-university{background:#f1f8f2;color:#2f7048}
.admission-case-search-table .grade-csat{background:#f7f3fb;color:#654d87}
.admission-grade-cell{display:grid;gap:2px;justify-items:center;min-width:0}
.admission-grade-cell small{font-size:8.8px;color:inherit;opacity:.76;font-weight:850;white-space:nowrap}
.admission-grade-cell b{font-size:11.8px;color:inherit;white-space:nowrap}
.admission-row-band{display:inline-flex;align-items:center;justify-content:center;min-width:34px;padding:2px 5px;border:1px solid;border-radius:999px;font-size:8.7px;font-weight:950;line-height:1.15;white-space:nowrap}
.admission-favorite-scope{display:grid;gap:3px;justify-items:center}
.admission-favorite-mini{display:inline-flex;align-items:center;justify-content:center;gap:2px;min-width:30px;padding:3px 4px;border:1px solid #dce2eb;border-radius:6px;background:#fff;color:#8993a0;cursor:pointer;font:inherit;font-size:8.5px;font-weight:900}
.admission-favorite-mini.is-active{background:#0f1a2e;border-color:#0f1a2e;color:#ffd84d}
.admission-favorite-guide{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid #dce4ef;border-radius:11px;background:#f7f9fd;font-size:11px;color:#566171}
.admission-favorite-guide strong{color:#263448}
.admission-favorite-mode{display:inline-flex;gap:5px;padding:3px;border:1px solid #d7dfeb;border-radius:9px;background:#fff}
.admission-favorite-mode button{border:0;border-radius:7px;padding:6px 10px;background:transparent;color:#687386;font:inherit;font-size:10.5px;font-weight:900;cursor:pointer}
.admission-favorite-mode button.is-active{background:#0f1a2e;color:#ffd84d}
.admission-department-link{border:0;background:transparent;color:#244f7d;font:inherit;font-weight:900;cursor:pointer;text-decoration:underline;text-decoration-color:#b9c9dc;text-underline-offset:3px;text-align:center;white-space:normal;word-break:keep-all}
.admission-department-link:hover{color:#163d69;text-decoration-color:#315f95}
@media(max-width:1000px){.admission-method-category-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.admission-quick-filter{grid-template-columns:1fr}.admission-case-student-benchmark{min-width:150px}}
@media(max-width:640px){.admission-method-category-grid{grid-template-columns:1fr}.admission-quick-filter-group{grid-template-columns:1fr}.admission-quick-filter-label{min-width:0}}

@media(max-width:1000px){
  .admission-filter-group.is-region .admission-filter-options{grid-template-columns:repeat(6,minmax(0,1fr))}
  .admission-filter-group.is-field .admission-filter-options{grid-template-columns:repeat(4,minmax(0,1fr))}
}

.admission-stat-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.admission-stat-strip>div{display:grid;gap:4px;padding:10px 11px;border-radius:10px;background:#fbfcfe;border:1px solid #e2e7ef;min-width:0}
.admission-stat-strip small{display:block;font-size:10px;font-weight:850;color:#6f7c8d;line-height:1.25}
.admission-stat-strip b{display:block;font-size:15px;line-height:1.2;color:#26364c;white-space:normal}
.admission-case-search-table{table-layout:fixed;min-width:0!important;font-size:11px!important}
.admission-case-search-table th,.admission-case-search-table td{padding:7px 5px!important;overflow-wrap:anywhere;word-break:keep-all;vertical-align:middle}
.admission-case-print-header{display:none}
.admission-linked-focus{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;border:1px solid #d6e0ed;border-radius:10px;background:#f4f8fd;color:#315a86;font-size:11.5px}
@media(max-width:760px){.admission-stat-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:1080px){.admission-student-profile{grid-template-columns:minmax(125px,.42fr) minmax(0,1.58fr)!important}.admission-student-score-groups{grid-template-columns:minmax(200px,.9fr) minmax(230px,1.1fr)}}
@media(max-width:900px){
  .admission-student-score-groups{grid-template-columns:1fr}
  .admission-detail-options{grid-template-columns:repeat(2,minmax(0,1fr))}
  .admission-detail-options.is-grouped{grid-template-columns:repeat(2,minmax(0,1fr))}
  .admission-case-search-controls{grid-template-columns:1fr}
  .admission-case-summary{grid-template-columns:repeat(3,minmax(0,1fr))!important}
  .admission-case-two{grid-template-columns:1fr!important}
  .admission-case-student{grid-template-columns:1fr!important}
  .admission-student-profile{grid-template-columns:1fr!important}
  .admission-case-university{grid-template-columns:1fr!important}
  .admission-filter-primary,.admission-filter-secondary{grid-template-columns:1fr}
  .admission-case-comparison{grid-template-columns:1fr}
  .admission-university-choice-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .admission-university-picker{grid-template-columns:1fr}
}
/* Ver5: 홈페이지 글꼴에 맞춘 전형 선택과 의미가 보이는 빠른 필터 */
.admission-method-filter,
.admission-method-filter button,
.admission-method-filter input{
  font-family:Pretendard,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif!important;
  letter-spacing:-.025em!important;
  font-synthesis:none;
}
.admission-method-filter-head b{font-size:15px!important;font-weight:900!important;letter-spacing:-.035em!important}
.admission-method-filter-head span{font-weight:650!important;letter-spacing:-.018em!important}
.admission-method-head{font-size:13.5px!important;font-weight:850!important;letter-spacing:-.035em!important;border-radius:11px!important}
.admission-method-detail{font-size:10.8px!important;font-weight:750!important;letter-spacing:-.025em!important;border-radius:10px!important;line-height:1.35!important}
.admission-method-detail small,.admission-method-head small{letter-spacing:-.01em!important}

.admission-quick-filter{
  display:grid!important;
  grid-template-columns:minmax(285px,.72fr) minmax(600px,1.28fr);
  align-items:stretch;
  gap:12px;
  padding:13px;
  overflow:visible;
  border-color:#d9e1ec;
  background:linear-gradient(135deg,#fbfdff,#f7f9fd);
}
.admission-quick-filter-group{
  display:grid!important;
  grid-template-columns:auto minmax(0,1fr)!important;
  align-items:center;
  gap:12px;
  min-width:0;
  padding:9px 10px;
  border:1px solid #e0e6ef;
  border-radius:12px;
  background:#fff;
}
.admission-quick-filter-label{
  display:grid;
  gap:2px;
  min-width:94px;
}
.admission-quick-filter-label b{font-size:14px;line-height:1.2;font-weight:950;color:#23374f;letter-spacing:-.03em}
.admission-quick-filter-label span{font-size:10.2px;line-height:1.3;font-weight:750;color:#6b7a8f}
.admission-quick-filter-options{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:nowrap;min-width:0}
.admission-quick-filter .admission-filter-chip{min-height:36px;padding:7px 11px;font-size:12px;font-weight:900}
.admission-support-filter{
  display:grid;
  gap:1px;
  align-content:center;
  justify-items:center;
  min-width:78px;
  min-height:42px;
  padding:5px 8px;
  border:1px solid;
  border-radius:11px;
  cursor:pointer;
  font:inherit;
  line-height:1.15;
  transition:transform .15s,box-shadow .15s,filter .15s;
  white-space:nowrap;
}
.admission-support-filter:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 10px rgba(42,59,82,.10);filter:saturate(1.04)}
.admission-support-filter:disabled{opacity:.45;cursor:not-allowed}
.admission-support-filter b{font-size:11.5px;font-weight:950;letter-spacing:-.025em;line-height:1.2}
.admission-support-filter small{font-size:9px;font-weight:850;opacity:.9;letter-spacing:-.02em;line-height:1.2}
.admission-quick-filter-note{grid-column:1/-1;font-size:10.2px;color:#6f7c8d;font-weight:750;line-height:1.4;padding:0 2px}
@media(max-width:980px){
  .admission-quick-filter{grid-template-columns:1fr!important}
  .admission-quick-filter-group{grid-template-columns:130px minmax(0,1fr)!important}
}
@media(max-width:760px){
  .admission-quick-filter-group{grid-template-columns:1fr!important}
  .admission-quick-filter-options{justify-content:flex-start;overflow-x:auto;padding-bottom:2px}
}

.admission-case-search-controls{
  display:flex;
  align-items:stretch;
  gap:10px;
  flex-wrap:wrap;
  width:100%;
  min-width:0;
}
.admission-case-search-controls>.admission-search-shell{
  flex:1 1 240px;
  width:auto;
  min-width:240px;
  overflow:hidden;
}
.admission-case-search-actions{
  flex:1 1 790px;
  display:grid;
  grid-template-columns:minmax(250px,285px) minmax(310px,1fr) minmax(128px,142px) minmax(168px,184px);
  align-items:stretch;
  justify-content:end;
  gap:8px;
  min-width:0;
}
.admission-case-student-benchmark{
  min-width:0;
  width:100%;
  padding:8px 10px;
}
.admission-case-range-filter{
  flex-wrap:nowrap;
  min-width:0;
  padding:7px 8px;
  gap:5px;
}
.admission-case-range-filter>span{font-size:10.5px}
.admission-case-range-filter .admission-filter-chip{min-height:34px;padding:6px 10px;font-size:11.5px}
.admission-case-sort-select,.admission-case-print-button{width:100%;font-weight:850!important;letter-spacing:-.025em!important}
@media(max-width:1220px){
  .admission-case-search-controls>.admission-search-shell{flex-basis:100%}
  .admission-case-search-actions{flex-basis:100%;grid-template-columns:minmax(250px,1fr) minmax(300px,1.25fr) minmax(128px,142px) minmax(168px,184px)}
}
@media(max-width:760px){
  .admission-case-search-actions{grid-template-columns:1fr 1fr}
  .admission-case-range-filter{overflow-x:auto}
  .admission-case-print-button,.admission-case-sort-select{min-width:0}
  .admission-case-print-control{grid-template-columns:1fr}
}

.admission-case-benchmark-body{display:grid;grid-template-columns:minmax(76px,.78fr) minmax(94px,1.22fr);gap:8px;align-items:end;margin-top:3px}
.admission-case-benchmark-primary{display:grid;gap:1px;min-width:0}
.admission-case-benchmark-primary strong{font-size:21px!important;line-height:1!important;color:#173f70}
.admission-case-benchmark-primary small{font-size:9.5px!important;font-weight:850!important;color:#66788e!important}
.admission-case-benchmark-companion{display:grid;gap:2px;align-content:center;min-height:42px;padding:6px 8px;border-radius:9px;background:#f3f7fc;border:1px solid #dce6f1;min-width:0}
.admission-case-benchmark-companion span{font-size:9px;font-weight:850;color:#718196;white-space:nowrap}
.admission-case-benchmark-companion b{font-size:12px;color:#365878;white-space:nowrap}
.admission-case-student-benchmark em{display:block;margin-top:5px;font-size:9px!important;line-height:1.3!important;white-space:normal!important}
.admission-case-range-filter>span{font-weight:900!important;color:#3d5068!important;letter-spacing:-.025em}
@media print{
  body.print-admission-case-search{margin:0!important;background:#fff!important}
  body.print-admission-case-search *{visibility:hidden!important}
  body.print-admission-case-search .admission-case-print-root,
  body.print-admission-case-search .admission-case-print-root *{visibility:visible!important}
  body.print-admission-case-search .admission-case-print-root{position:absolute!important;left:0!important;top:0!important;width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;overflow:visible!important;box-sizing:border-box!important}
  body.print-admission-case-search .admission-case-print-root .no-print,
  body.print-admission-case-search .admission-case-print-root .screen-only{display:none!important}
  body.print-admission-case-search .admission-case-print-root .print-only{display:block!important;width:100%!important;max-width:100%!important;overflow:visible!important}
  body.print-admission-case-search .print-portrait-only,
  body.print-admission-case-search .print-landscape-only{display:none!important}
  body.print-admission-portrait .print-portrait-only{display:block!important}
  body.print-admission-landscape .print-landscape-only{display:block!important}
  body.print-admission-case-search .admission-case-print-header{display:flex!important;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:8px;padding-bottom:7px;border-bottom:2px solid #334f78;break-after:avoid-page}
  body.print-admission-case-search .admission-case-print-header>div{display:grid;gap:2px;min-width:0}
  body.print-admission-case-search .admission-case-print-header h2{font-size:15pt!important;line-height:1.2!important;color:#1f2c3c!important}
  body.print-admission-case-search .admission-case-print-header strong{font-size:8.6pt!important;color:#2e527f!important;line-height:1.3!important}
  body.print-admission-case-search .admission-case-print-header span{font-size:7.5pt!important;line-height:1.35!important;color:#5f6874!important}
  body.print-admission-case-search .admission-case-print-header>span{text-align:right}
  body.print-admission-case-search .admission-case-print-root [style*="overflow"]{overflow:visible!important}
  body.print-admission-case-search .admission-case-search-table{font-size:6.7pt!important;width:100%!important;max-width:100%!important;min-width:0!important;table-layout:fixed!important;border-collapse:collapse!important}
  body.print-admission-case-search .admission-case-search-table thead{display:table-header-group!important}
  body.print-admission-case-search .admission-case-search-table tr{break-inside:avoid-page;page-break-inside:avoid}
  body.print-admission-case-search .admission-case-search-table th,
  body.print-admission-case-search .admission-case-search-table td{padding:3.5px 2px!important;line-height:1.22!important;white-space:normal!important;word-break:keep-all!important;overflow-wrap:anywhere!important;vertical-align:middle!important}
  body.print-admission-case-search .admission-case-search-table th{font-size:6.5pt!important}
  body.print-admission-case-search .admission-case-search-table td b{font-size:inherit!important}
  body.print-admission-case-search .admission-case-search-table small{font-size:5.6pt!important;line-height:1.2!important}
  body.print-admission-case-search .admission-case-search-table a{color:inherit!important;text-decoration:none!important}
  body.print-admission-portrait .admission-case-search-table{font-size:7.4pt!important}
  body.print-admission-portrait .admission-case-search-table th{font-size:7.1pt!important}
  body.print-admission-portrait .admission-case-search-table th,
  body.print-admission-portrait .admission-case-search-table td{padding:4.2px 3px!important}
  body.print-admission-portrait .admission-case-portrait-table td>small{display:block;margin-top:2px}
  body.print-admission-portrait .admission-case-row-band{font-size:5.8pt!important;padding:1px 3px!important}
}
@media(max-width:640px){
  .admission-case-summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .admission-filter-group.is-region .admission-filter-options{grid-template-columns:repeat(3,minmax(0,1fr))}
  .admission-filter-group.is-field .admission-filter-options{grid-template-columns:repeat(2,minmax(0,1fr))}
  .admission-university-choice-grid{grid-template-columns:1fr}
  .admission-filter-priority{grid-template-columns:1fr}
  .admission-filter-secondary-options{grid-template-columns:repeat(2,minmax(0,1fr))}
  .admission-detail-options{grid-template-columns:1fr}
  .admission-detail-options.is-grouped{grid-template-columns:1fr}
  .admission-student-metrics small{white-space:normal}
}
`

function num(v){
  if(v==null||v===""||(typeof v==="string"&&v.trim()===""))return null;
  const x=Number(v);
  return Number.isFinite(x)?x:null;
}
function fmt(v,d=2){const x=num(v);return x==null?"-":Number(x.toFixed(d)).toString()}
function unique(values){return Array.from(new Set(values.filter(v=>v!=null&&String(v).trim()!=="")))}
function record(data,entryYear,key){return data?.[`${entryYear}:${key}`]||data?.[key]||null}
function entryYearForGrade(settings,grade){const year=Number(settings?.academicYear)||new Date().getFullYear();const hit=(settings?.cohorts||[]).find(x=>Number(x.currentGrade)===Number(grade)&&x.status!=="졸업");return Number(hit?.entryYear)||year-Number(grade)+1}
function median(values){const s=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!s.length)return null;const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}
function percentile(values,ratio){const s=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!s.length)return null;const i=(s.length-1)*ratio,l=Math.floor(i),u=Math.ceil(i);return l===u?s[l]:s[l]+(s[u]-s[l])*(i-l)}
function studentProfile(sid,roster,gdb,currentGrade){if(!sid)return null;const info=roster?.[sid]||{};const grade=Number(info.grade)||Number(String(sid).charAt(0))||Number(currentGrade)||1;const entryYear=Number(info.entryYear)||entryYearForGrade(gdb.cohortSettings,grade);const gradeSystem=entryYear>=2025?5:9;const subjectLists=SEMESTERS.map(k=>record(gdb.semesterData,entryYear,k)?.students?.[sid]?.subjects||null);const groups=computeAllGroupAverages(subjectLists,gradeSystem);const average=gradeSystem===5?groups?.전과목?.avg5:groups?.전과목?.avg9;const converted=average==null?null:(gradeSystem===5?grade5to9(average):average);const latestMock=MOCKS.slice().reverse().find(k=>record(gdb.mockData,entryYear,k)?.students?.[sid]);const mock=latestMock?record(gdb.mockData,entryYear,latestMock)?.students?.[sid]||{}:{};let name=info.name||"";if(!name){for(const k of SEMESTERS.slice().reverse()){name=record(gdb.semesterData,entryYear,k)?.students?.[sid]?.name||"";if(name)break}}return{sid:String(sid),name,grade,entryYear,gradeSystem,average,converted,sums:computeMockExamSums(mock)}}
function groupStats(rows,getter){const map=new Map();rows.forEach(row=>{const key=getter(row)||"미지정";if(!map.has(key))map.set(key,[]);map.get(key).push(row)});return Array.from(map,([label,items])=>{const accepted=items.filter(x=>x.finalResult==="합격");return{label,total:items.length,accepted:accepted.length,first:items.filter(x=>x.finalResultDetail==="최초합격").length,waitlist:items.filter(x=>x.finalResultDetail==="충원합격").length,rejected:items.filter(x=>x.finalResult==="불합격").length,rate:items.length?accepted.length/items.length*100:null,median:median(accepted.map(x=>x.universityGrade??x.overallGrade))}}).sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label,"ko"))}
function resultStyle(value){if(value==="최초합격")return{color:COLORS.blue,background:"#edf3ff",borderColor:"#cbd9ef"};if(value==="충원합격")return{color:COLORS.purple,background:"#f3effa",borderColor:"#d8cdea"};if(value==="불합격")return{color:COLORS.red,background:"#fff0f0",borderColor:"#efcaca"};return{color:COLORS.muted,background:"#f4f2ed",borderColor:"#ddd8cd"}}
function caseSufficiency(total){
  if(total>=20)return{label:"표본 충분",detail:"20건 이상"};
  if(total>=10)return{label:"표본 보통",detail:"10~19건"};
  if(total>=5)return{label:"표본 제한",detail:"5~9건"};
  return{label:"표본 주의",detail:"4건 이하"};
}
function signedGradeGap(studentGrade,cutGrade){
  const student=num(studentGrade),cut=num(cutGrade);
  if(student==null||cut==null)return null;
  return Math.round((student-cut)*100)/100;
}
function gradeDifference(studentGrade,cutGrade){
  const diff=signedGradeGap(studentGrade,cutGrade);
  if(diff==null)return{label:"-",detail:"비교 불가",color:"#777167",background:"#f3f1ed"};
  if(Math.abs(diff)<0.05)return{label:"±0.0",detail:"합격자 50%컷과 유사",color:"#315a9b",background:"#edf3ff"};
  const label=`${diff>0?"+":""}${fmt(diff)}`;
  return diff<0
    ?{label,detail:`50%컷보다 ${fmt(Math.abs(diff))}등급 앞`,color:"#2f7347",background:"#edf8f0"}
    :{label,detail:`50%컷보다 ${fmt(diff)}등급 뒤`,color:"#9a3f3f",background:"#fff0f0"};
}
const CASE_CAMPUS_ALIASES=["서울","세종","글로컬","글로벌","메디컬","ERICA","국제","죽전","천안","안성","수원","송도","미래","다빈치","용인"];
const CASE_MULTI_CAMPUS_BY_REGION={
  건국대:{서울:"서울",충북:"글로컬"},고려대:{서울:"서울",세종:"세종"},가천대:{경기:"글로벌",인천:"메디컬"},
  경희대:{서울:"서울",경기:"국제"},단국대:{경기:"죽전",충남:"천안"},한양대:{서울:"서울",경기:"ERICA"},
  홍익대:{서울:"서울",세종:"세종"},중앙대:{서울:"서울",경기:"다빈치"},한국외국어대:{서울:"서울",경기:"글로벌"},
  연세대:{서울:"서울",강원:"미래"},성균관대:{서울:"서울",경기:"수원"},명지대:{서울:"서울",경기:"용인"},경기대:{서울:"서울",경기:"수원"}
};
function caseUniversityBase(value){return String(value||"").normalize("NFKC").replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g,"").replace(/대학교/g,"대").replace(/(?:서울|세종|죽전|천안|글로컬|글로벌|메디컬|ERICA|국제|미래|다빈치|용인|수원)캠퍼스/gi,"").replace(/캠퍼스/g,"").replace(/\s+/g,"").replace(/[()\[\]{}·ㆍ.\-,_]/g,"").toLowerCase()}
function caseRegion(value){const text=String(value||"").normalize("NFKC").replace(/특별시|광역시|특별자치시|특별자치도|도$/g,"").trim();if(!text||text==="미지정"||text==="공통")return"";const aliases={경기도:"경기",충청남도:"충남",충청북도:"충북",전라남도:"전남",전라북도:"전북",경상남도:"경남",경상북도:"경북",제주도:"제주"};return aliases[text]||text}
function explicitCaseCampus(value){const source=String(value||"").normalize("NFKC");const bracket=source.match(/[（(\[]\s*([^）)\]]+)\s*[）)\]]/);const bracketValue=String(bracket?.[1]||"").replace(/캠퍼스/gi,"").trim();if(bracketValue&&(CASE_CAMPUS_ALIASES.some(name=>bracketValue.toUpperCase()===name.toUpperCase())||/캠퍼스/i.test(String(bracket?.[1]||""))))return bracketValue.toUpperCase()==="ERICA"?"ERICA":bracketValue;const suffix=CASE_CAMPUS_ALIASES.find(name=>new RegExp(`${name}\\s*캠퍼스`,"i").test(source));return suffix?(suffix.toUpperCase()==="ERICA"?"ERICA":suffix):""}
function caseCampusLabel(value,region=""){const explicit=explicitCaseCampus(value);if(explicit)return explicit;return CASE_MULTI_CAMPUS_BY_REGION[caseUniversityBase(value)]?.[caseRegion(region)]||""}
function caseCampusForRow(row){
  const raw=String(row?.university||"").trim();
  const normalized=String(row?.universityNormalized||"").trim();
  const rawExplicit=explicitCaseCampus(raw);
  if(rawExplicit)return rawExplicit;
  const base=caseUniversityBase(raw||normalized);
  const regionCampus=CASE_MULTI_CAMPUS_BY_REGION[base]?.[caseRegion(row?.region)]||"";
  if(regionCampus)return regionCampus;
  const normalizedExplicit=explicitCaseCampus(normalized);
  if(normalizedExplicit)return normalizedExplicit;
  return caseCampusLabel(normalized||raw,row?.region);
}
function normalizeUniversityLink(value,region=""){return `${caseUniversityBase(value)}|${caseCampusLabel(value,region)}`}
function prepareAdmissionCaseRows(rows=[]){
  const locations=new Map();
  rows.forEach(row=>{const source=row?.university||row?.universityNormalized;const base=caseUniversityBase(source);const campus=caseCampusForRow(row);if(!base)return;if(!locations.has(base))locations.set(base,new Set());if(campus)locations.get(base).add(campus)});
  return rows.map(row=>{
    const raw=String(row?.university||"").trim();
    const normalized=String(row?.universityNormalized||"").trim();
    const source=raw||normalized;
    const base=caseUniversityBase(source);
    const campus=caseCampusForRow(row);
    const baseDisplay=source.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g,"").trim();
    const display=campus?`${baseDisplay}(${campus})`:source;
    return{...row,_sourceUniversity:raw,_sourceUniversityNormalized:normalized,_universityBase:base,_universityCampus:campus,university:display,universityNormalized:display};
  })
}
function favoriteId(item){
  const caseScope=item?.favoriteKind==="개별사례"||item?.caseId?`case:${String(item?.caseId||"")}`:"group";
  return [item?.source||"case",normalizeUniversityLink(item?.university,item?.region),String(item?.department||"전체"),String(item?.admissionType||""),caseScope].join("|")
}
function isFavorite(items,item){const id=favoriteId(item);return (items||[]).some(value=>favoriteId(value)===id)}
function applicationBand(studentGrade,cutGrade){
  const student=num(studentGrade),cut=num(cutGrade);
  if(student==null||cut==null)return{label:"판단 보류",detail:"50%컷 자료 부족",color:"#656b75",background:"#f1f3f5",border:"#d9dde2"};
  const diff=student-cut;
  if(diff>0.5)return{label:"상향",detail:"50%컷보다 0.5등급 초과 뒤",color:"#9c3f45",background:"#fff0f1",border:"#efc8cb"};
  if(diff>0.2)return{label:"소신",detail:"50%컷보다 0.2~0.5등급 뒤",color:"#9a5f22",background:"#fff4e7",border:"#edcfaa"};
  if(diff>=-0.2)return{label:"적정",detail:"50%컷 ±0.2등급",color:"#6f5a17",background:"#fff8d9",border:"#eadb91"};
  if(diff>=-0.5)return{label:"안정",detail:"50%컷보다 0.2~0.5등급 앞",color:"#2f6d4b",background:"#edf8f1",border:"#c7e3d1"};
  return{label:"하향",detail:"50%컷보다 0.5등급 초과 앞",color:"#365a8a",background:"#edf3ff",border:"#cad8ef"};
}
function acceptanceRateMeta(rate){
  const value=Number(rate)||0;
  if(value>=50)return{color:"#2f7347",background:"#edf8f0",border:"#c7e4cf"};
  if(value>=30)return{color:"#8a641d",background:"#fff7e5",border:"#ecd7a6"};
  return{color:"#9a3f3f",background:"#fff0f0",border:"#efcaca"};
}
function registrationDisplay(row){if(row?.finalResult==="불합격")return{label:"-",color:"#8a857a",background:"transparent"};if(row?.registered==="등록")return{label:"등록",color:"#2f7347",background:"#edf8f0"};if(row?.registered==="미등록")return{label:"미등록",color:"#8a641d",background:"#fff6df"};return{label:"미입력",color:"#777167",background:"#f3f1ed"}}
function buildUniversityDetails(rows){const map=new Map();for(const row of rows){const department=row.department||"모집단위 미입력";const type=row.detailType&&row.detailType!=="미지정"?row.detailType:(row.admissionType||"전형 미입력");const key=`${department}|||${type}`;if(!map.has(key))map.set(key,{department,type,items:[]});map.get(key).items.push(row)}return Array.from(map.values()).map(group=>{const accepted=group.items.filter(x=>x.finalResult==="합격");return{department:group.department,type:group.type,total:group.items.length,accepted:accepted.length,first:group.items.filter(x=>x.finalResultDetail==="최초합격").length,waitlist:group.items.filter(x=>x.finalResultDetail==="충원합격").length,rejected:group.items.filter(x=>x.finalResult==="불합격").length,rate:group.items.length?accepted.length/group.items.length*100:null,median:median(accepted.map(x=>x.universityGrade??x.overallGrade))}}).sort((a,b)=>b.total-a.total||a.department.localeCompare(b.department,"ko"))}
function normalizeSearchText(value){return String(value||"").normalize("NFKC").toLowerCase().replace(/대학교/g,"대").replace(/[()\[\]{}·ㆍ.,_\-\/]/g," ").replace(/\s+/g,"").trim()}
function textMatch(row,query){
  const tokens=String(query||"").normalize("NFKC").trim().split(/\s+/).map(normalizeSearchText).filter(Boolean);
  if(!tokens.length)return true;
  const haystack=normalizeSearchText([row.university,row.universityNormalized,row.department,row.detailType,row.admissionType,row.region,row.field].filter(Boolean).join(" "));
  return tokens.every(token=>haystack.includes(token));
}
function detailTypeGroup(row){
  const type=String(row?.admissionType||"").normalize("NFKC").replace(/\s+/g,"");
  const raw=String(row?.detailType||"").normalize("NFKC").replace(/[\[\](){}]/g," ").replace(/\s+/g," ").trim();
  const text=`${type} ${raw}`;
  const opportunity=/기회|고른|사회|농어촌|저소득|보훈|특별|배려|기초생활|차상위/.test(text);
  const recommendation=/지역|균형|학교장|교장|고교추천|학교추천|추천전형|추천자/.test(text);
  if(/학생부종합|학종|서류위주/.test(text)){
    if(opportunity)return"종합·기회균형";
    if(/면접|단계|1단계|2단계/.test(text))return"종합·면접형";
    if(/서류/.test(text))return"종합·서류형";
    return"종합·일반";
  }
  if(/학생부교과|교과위주|학생부위주|교과100|교과전형/.test(text)){
    if(opportunity)return"교과·기회균형";
    if(recommendation)return"교과·지역균형/추천";
    if(/우수|성적|교과100/.test(text))return"교과·성적우수";
    return"교과·일반";
  }
  if(/논술/.test(text))return /교과/.test(text)?"논술·교과반영":"논술·일반";
  if(/실기|실적/.test(text))return /특기/.test(text)?"실기·특기자":"실기·실적";
  if(/면접/.test(text))return"면접 중심";
  if(/서류/.test(text))return"서류 중심";
  return type||raw||"기타";
}
function broadAdmissionGroup(row){
  const detail=detailTypeGroup(row);
  const raw=`${row?.admissionType||""} ${row?.detailType||""}`;
  if(detail.startsWith("교과·")||/학생부교과|교과위주|교과100/.test(raw))return"교과";
  if(detail.startsWith("종합·")||detail==="면접 중심"||detail==="서류 중심"||/학생부종합|학종|서류위주|면접/.test(raw))return"종합";
  if(detail.startsWith("논술·")||/논술/.test(raw))return"논술";
  if(detail.startsWith("실기·")||/실기|실적|특기/.test(raw))return"실기";
  return"기타";
}
function detailGroupCategory(label){
  const value=String(label||"");
  if(value.startsWith("교과·"))return"교과";
  if(value.startsWith("종합·")||value==="면접 중심"||value==="서류 중심")return"종합";
  if(value.startsWith("논술·"))return"논술";
  if(value.startsWith("실기·"))return"실기";
  return"기타";
}

function universityCutMap(rows){
  const groups=new Map();
  (rows||[]).forEach(row=>{if(row.finalResult!=="합격")return;const grade=row.overallGrade;if(grade==null)return;const key=row.universityNormalized||row.university;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(Number(grade))});
  return new Map(Array.from(groups.entries()).map(([key,grades])=>[key,median(grades)]));
}
function applyFilters(rows,filters,profile=null){
  const source=Array.isArray(rows)?rows:[];
  const min=num(filters?.minGrade);
  const max=num(filters?.maxGrade);
  const passesCore=row=>{
    if(!textMatch(row,filters?.query))return false;
    if(filters?.regions?.length&&!filters.regions.includes(row.region))return false;
    if(filters?.fields?.length&&!filters.fields.includes(row.field))return false;
    if(filters?.schoolTypes?.length&&!filters.schoolTypes.includes(row.schoolType))return false;
    const group=broadAdmissionGroup(row);
    if(filters?.admissionGroups?.length&&!filters.admissionGroups.includes(group))return false;
    const selectedForGroup=(filters?.detailTypes||[]).filter(label=>detailGroupCategory(label)===group);
    if(selectedForGroup.length&&!selectedForGroup.includes(detailTypeGroup(row)))return false;
    if(min!=null&&(row.overallGrade==null||Number(row.overallGrade)<min))return false;
    if(max!=null&&(row.overallGrade==null||Number(row.overallGrade)>max))return false;
    return true;
  };
  const cutSource=source.filter(passesCore);
  const basic=cutSource.filter(row=>!filters?.results?.length||filters.results.includes(row.finalResultDetail));
  if(!filters?.bands?.length||profile?.converted==null)return basic;
  return basic.filter(row=>row.overallGrade!=null&&filters.bands.includes(applicationBand(profile.converted,row.overallGrade).label));
}

function SummaryCards({rows}){const summary=useMemo(()=>summarizeAdmissionCases(rows),[rows]);const cards=[["지원 사례",summary.total,COLORS.blue],["합격 사례",summary.accepted,COLORS.green],["최초합격",summary.firstAccepted,COLORS.blue],["충원합격",summary.waitlistAccepted,COLORS.purple],["불합격",summary.rejected,COLORS.red],["등록 확인",summary.registered,COLORS.gold]];return <div className="admission-case-summary" style={styles.summary}>{cards.map(([label,value,color])=><div key={label} style={{...styles.summaryCard,borderTopColor:color}}><b style={{color}}>{value.toLocaleString()}</b><span>{label}</span></div>)}</div>}
function Section({title,description,aside=null,children}){return <section style={styles.section}><div style={styles.sectionTitle}><div><h3>{title}</h3>{description&&<p>{description}</p>}</div>{aside&&<div className="admission-section-aside">{aside}</div>}</div>{children}</section>}
function Table({children,minWidth=0,style=null,className="",wrapStyle=null,wrapClassName=""}){return <div className={wrapClassName} style={{...styles.tableWrap,...(wrapStyle||{})}}><table className={className} style={{minWidth,...(style||{})}}>{children}</table></div>}
function Empty({title,text,icon=<Database size={28}/>}){return <div style={styles.empty}>{icon}<b>{title}</b>{text&&<span>{text}</span>}</div>}
function SearchBox({value,onChange,placeholder,count}){return <div className="admission-search-shell"><Search size={17} color="#607087"/><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>{count&&<span className="admission-search-count">{count}</span>}</div>}
function RateBand({rate,total,compact=false}){
  const meta=acceptanceRateMeta(rate);
  return <div style={{display:"grid",gap:compact?2:4,justifyItems:"center"}} title={`지원 ${total||0}건 중 합격 사례 비율`}>
    <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",padding:compact?"4px 7px":"5px 9px",borderRadius:999,border:`1px solid ${meta.border}`,background:meta.background,color:meta.color,fontWeight:900,fontSize:compact?10:12,whiteSpace:"nowrap"}}>합격 {fmt(rate,1)}%</span>
    {!compact&&<div className="admission-rate-meter" style={{width:92}}><span style={{width:`${Math.max(0,Math.min(100,Number(rate)||0))}%`,background:meta.color}}/></div>}
  </div>;
}

function StudentConnector({profile,query,onQuery,onSelect,roster}){
  const hits=useMemo(()=>{const q=String(query||"").trim().toLowerCase();return q?Object.entries(roster||{}).filter(([sid,info])=>`${sid} ${info?.name||""}`.toLowerCase().includes(q)).slice(0,8):[]},[query,roster]);
  return <div className="admission-case-student" style={styles.studentConnector}>
    <div style={styles.studentSearchPanel}><label style={styles.label}>학생 성적 연동</label><div style={{position:"relative"}}><Search size={16} style={{position:"absolute",left:12,top:12,color:"#748094"}}/><input style={{...styles.input,paddingLeft:36,height:42}} value={query||""} onChange={e=>onQuery(e.target.value)} placeholder="학번 또는 이름 검색"/>{hits.length>0&&<div className="admission-case-search" style={styles.searchResults}>{hits.map(([sid,info])=><button key={sid} onClick={()=>{onSelect(sid);onQuery(sid)}}><b>{sid}</b> {info?.name}</button>)}</div>}</div></div>
    {profile?<div className="admission-student-profile" style={styles.studentProfile}>
      <div style={styles.studentProfileIdentity}><span style={styles.studentProfileEyebrow}>선택 학생</span><div style={styles.studentProfileTitle}><b>{profile.sid}</b><strong>{profile.name}</strong></div><div className="admission-student-profile-badges" style={styles.studentProfileBadges}><span>{profile.entryYear}학년도 입학생</span><span>{profile.grade}학년</span><span>{profile.gradeSystem}등급제</span></div></div>
      <div className="admission-student-score-groups">
        <div className="admission-student-score-group is-school-group"><div className="admission-score-group-head"><strong>학생 비교 기준 내신</strong><span>학기 누적 기준</span></div><div className="admission-student-metrics is-school"><div className="is-current-grade"><small>{profile.gradeSystem}등급제 현재 내신</small><b>{fmt(profile.average)}</b></div><div className="is-converted-grade"><small>사례 비교용 9등급 환산</small><b>{fmt(profile.converted)}</b></div></div></div>
        <div className="admission-student-score-group is-mock-group"><div className="admission-score-group-head"><strong>모의고사 최저</strong><span>최신 회차 기준</span></div><div className="admission-student-metrics is-mock"><div><small>2합</small><b>{profile.sums?.sum2??"-"}</b></div><div><small>3합</small><b>{profile.sums?.sum3??"-"}</b></div><div className="is-four-sum"><small>4합</small><b>{profile.sums?.sum4??"-"}</b></div></div></div>
      </div>
    </div>:<div style={styles.studentPlaceholder}>학생을 선택하면 현재 성적과 과거 사례를 연결합니다.</div>}
  </div>;
}


function toggleSelection(values,option){
  return values.includes(option)?values.filter(item=>item!==option):[...values,option];
}

function FilterChipGroup({label,options,value,onChange,compact=false,kind="default",priorityOptions=[]}){
  const className=`admission-filter-group ${kind==="region"?"is-region":""} ${kind==="field"?"is-field":""} ${kind==="admissionType"?"is-admission-type":""}`.trim();
  const priority=priorityOptions.filter(option=>options.includes(option));
  const secondary=options.filter(option=>!priority.includes(option));
  const optionButton=option=><button type="button" key={option} className={`admission-filter-chip ${value.includes(option)?"is-active":""}`} onClick={()=>onChange(toggleSelection(value,option))}>{option}</button>;
  return <div className={className} style={compact?{padding:11}:{}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
      <b className="admission-filter-group-title">{label}</b>
      <span className="admission-filter-group-count">{value.length?`${value.length}개 선택`:"전체"}</span>
    </div>
    {kind==="admissionType"?<>
      <div className="admission-filter-options admission-filter-priority">{priority.map(optionButton)}</div>
      <div className="admission-filter-options admission-filter-secondary-options"><button type="button" className={`admission-filter-chip ${value.length===0?"is-active":""}`} onClick={()=>onChange([])}>전체</button>{secondary.map(optionButton)}</div>
    </>:<div className="admission-filter-options"><button type="button" className={`admission-filter-chip ${value.length===0?"is-active":""}`} onClick={()=>onChange([])}>전체</button>{options.map(optionButton)}</div>}
  </div>;
}

function AdmissionMethodFilter({cases,groups=[],detailTypes=[],onGroupsChange,onDetailsChange}){
  const[query,setQuery]=useState("");
  const categories=["교과","종합","논술","실기"];
  const data=useMemo(()=>{
    const map=new Map(categories.map(category=>[category,{category,total:0,details:new Map()}]));
    (cases||[]).forEach(row=>{
      const category=broadAdmissionGroup(row);if(!map.has(category))return;
      const detail=detailTypeGroup(row);const item=map.get(category);item.total+=1;
      if(!item.details.has(detail))item.details.set(detail,{label:detail,count:0,examples:new Set()});
      const detailItem=item.details.get(detail);detailItem.count+=1;if(row.detailType&&detailItem.examples.size<3)detailItem.examples.add(row.detailType);
    });
    return categories.map(category=>{const item=map.get(category);return{...item,details:Array.from(item.details.values()).map(detail=>({...detail,examples:Array.from(detail.examples)})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,"ko"))}});
  },[cases]);
  const q=normalizeSearchText(query);
  const toggleGroup=category=>{
    const active=groups.includes(category);
    onGroupsChange(active?groups.filter(item=>item!==category):[...groups,category]);
    if(active)onDetailsChange(detailTypes.filter(item=>detailGroupCategory(item)!==category));
  };
  const toggleDetail=(category,label)=>{
    if(!groups.includes(category))onGroupsChange([...groups,category]);
    onDetailsChange(toggleSelection(detailTypes,label));
  };
  return <div className="admission-method-filter">
    <div className="admission-method-filter-head"><div><b>전형 선택</b><span>교과·종합·논술·실기 중 큰 유형을 고르고, 필요한 경우 안쪽 세부전형을 추가로 선택합니다. 면접·서류형은 종합에 포함됩니다.</span></div><div className="admission-method-search"><Search size={13} color="#728095"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="세부전형 검색"/>{query&&<button type="button" onClick={()=>setQuery("")} style={{border:0,background:"transparent",cursor:"pointer",color:"#718096"}}>×</button>}</div></div>
    <div className="admission-method-category-grid">{data.map(item=>{
      const visible=item.details.filter(detail=>!q||normalizeSearchText(`${detail.label} ${detail.examples.join(" ")}`).includes(q));
      const active=groups.includes(item.category);
      return <div key={item.category} className={`admission-method-card ${active?"is-active":""} ${item.total?"":"is-empty"}`}>
        <button type="button" className={`admission-method-head ${active?"is-active":""}`} disabled={!item.total} onClick={()=>toggleGroup(item.category)}><span>{item.category}</span><small>{item.total.toLocaleString()}건</small></button>
        <div className="admission-method-details">{visible.slice(0,8).map(detail=><button type="button" key={detail.label} title={detail.examples.join(" · ")} className={`admission-method-detail ${detailTypes.includes(detail.label)?"is-active":""}`} onClick={()=>toggleDetail(item.category,detail.label)}><span>{detail.label.replace(`${item.category}·`,"")}</span><small>{detail.count.toLocaleString()}</small></button>)}{!visible.length&&<span style={{padding:"8px 4px",fontSize:10,color:"#8a94a2",textAlign:"center"}}>검색 결과 없음</span>}</div>
      </div>})}</div>
    {(groups.length||detailTypes.length)?<div className="admission-detail-selected">{groups.map(item=><button type="button" key={`group-${item}`} onClick={()=>toggleGroup(item)}>{item} ×</button>)}{detailTypes.map(item=><button type="button" key={item} onClick={()=>onDetailsChange(detailTypes.filter(value=>value!==item))}>{item} ×</button>)}<button type="button" onClick={()=>{onGroupsChange([]);onDetailsChange([])}}>전형 전체 해제</button></div>:null}
  </div>;
}

function FilterPanel({cases,filters,setFilters,filteredCount}){
  const[advanced,setAdvanced]=useState(false);
  const regions=useMemo(()=>unique(cases.map(x=>x.region)).sort((a,b)=>a.localeCompare(b,"ko")),[cases]);
  const fields=useMemo(()=>unique(cases.map(x=>x.field)).sort((a,b)=>a.localeCompare(b,"ko")),[cases]);
  const schoolTypes=useMemo(()=>unique(cases.map(x=>x.schoolType)).sort((a,b)=>a.localeCompare(b,"ko")),[cases]);
  const reset=()=>setFilters({query:"",regions:[],fields:[],schoolTypes:[],admissionGroups:[],detailTypes:[],results:[],bands:[],minGrade:"",maxGrade:""});
  const selectedCount=(filters.regions?.length||0)+(filters.fields?.length||0)+(filters.schoolTypes?.length||0)+(filters.admissionGroups?.length||0)+(filters.detailTypes?.length||0)+(filters.results?.length||0)+(filters.bands?.length||0)+(filters.minGrade!==""?1:0)+(filters.maxGrade!==""?1:0);
  return <div style={{...styles.filters,padding:16}}>
    <div style={{...styles.filterHeader,marginBottom:14}}><div style={{display:"grid",gap:4}}><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><b style={{fontSize:18,fontWeight:950,color:"#24364d",letterSpacing:"-.025em"}}>분석 조건</b><span style={{padding:"4px 9px",borderRadius:999,background:"#e7f0fb",color:"#274f7d",fontSize:11,fontWeight:900}}>{filteredCount.toLocaleString()}건 조회</span></div><span style={{fontSize:12,color:"#677386",fontWeight:650}}>같은 항목 안에서는 OR, 서로 다른 항목끼리는 AND로 적용됩니다.</span></div><button type="button" onClick={reset} style={styles.smallButton}><RotateCcw size={14}/>전체 초기화</button></div>
    <FilterChipGroup label="계열" kind="field" options={fields} value={filters.fields} onChange={value=>setFilters(current=>({...current,fields:value}))}/>
    <div style={{marginTop:12}}><AdmissionMethodFilter cases={cases} groups={filters.admissionGroups||[]} detailTypes={filters.detailTypes||[]} onGroupsChange={value=>setFilters(current=>({...current,admissionGroups:value}))} onDetailsChange={value=>setFilters(current=>({...current,detailTypes:value}))}/></div>
    <button type="button" style={{...styles.advancedButton,width:"100%",marginTop:12,background:advanced?"#eef3f9":"#fff"}} onClick={()=>setAdvanced(value=>!value)}>{advanced?<ChevronUp size={15}/>:<ChevronDown size={15}/>} 지역·학교유형·등급 범위 {advanced?"접기":"펼치기"}{selectedCount>0&&<span style={{marginLeft:4,padding:"2px 7px",borderRadius:999,background:"#315a86",color:"#fff",fontSize:10.5}}>{selectedCount}</span>}</button>
    {advanced&&<div style={{display:"grid",gap:12,marginTop:12,paddingTop:12,borderTop:"1px solid #e7e9ed"}}><FilterChipGroup label="지역" kind="region" options={regions} value={filters.regions} onChange={value=>setFilters(current=>({...current,regions:value}))} compact/><FilterChipGroup label="학교유형" options={schoolTypes} value={filters.schoolTypes} onChange={value=>setFilters(current=>({...current,schoolTypes:value}))} compact/><div style={{display:"grid",gap:9,padding:13,border:"1px solid #e1e6ec",borderRadius:13,background:"#fafcfe"}}><b style={{fontSize:12.5,color:"#354052"}}>전교과 등급 범위</b><div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto minmax(0,1fr)",gap:9,alignItems:"center"}}><input style={styles.input} type="number" min="1" max="9" step="0.1" value={filters.minGrade} onChange={event=>setFilters(current=>({...current,minGrade:event.target.value}))} placeholder="최소 등급"/><span style={{color:"#8a929d",fontWeight:800}}>~</span><input style={styles.input} type="number" min="1" max="9" step="0.1" value={filters.maxGrade} onChange={event=>setFilters(current=>({...current,maxGrade:event.target.value}))} placeholder="최대 등급"/></div></div></div>}
  </div>;
}

function ResultQuickFilters({filters,setFilters,profile}){
  const bandOptions=[
    {label:"상향",range:"+0.5 초과",sample:3},
    {label:"소신",range:"+0.2~+0.5",sample:2.4},
    {label:"적정",range:"-0.2~+0.2",sample:2},
    {label:"안정",range:"-0.5~-0.2",sample:1.7},
    {label:"하향",range:"-0.5 미만",sample:1.3},
  ];
  return <div className="admission-quick-filter">
    <div className="admission-quick-filter-group"><div className="admission-quick-filter-label"><b>최종 결과</b><span>합격 형태로 사례 좁히기</span></div><div className="admission-quick-filter-options"><button type="button" className={`admission-filter-chip ${!(filters.results||[]).length?"is-active":""}`} onClick={()=>setFilters(current=>({...current,results:[]}))}>전체</button>{["최초합격","충원합격","불합격"].map(value=><button type="button" key={value} className={`admission-filter-chip ${(filters.results||[]).includes(value)?"is-active":""}`} onClick={()=>setFilters(current=>({...current,results:toggleSelection(current.results||[],value)}))}>{value}</button>)}</div></div>
    <div className="admission-quick-filter-group"><div className="admission-quick-filter-label"><b>지원 구간</b><span>{profile?.converted!=null?"학생과 각 사례 전교과 내신 차이":"학생 선택 후 사용"}</span></div><div className="admission-quick-filter-options"><button type="button" className={`admission-filter-chip ${!(filters.bands||[]).length?"is-active":""}`} onClick={()=>setFilters(current=>({...current,bands:[]}))}>전체</button>{bandOptions.map(option=>{const meta=applicationBand(option.sample,2),active=(filters.bands||[]).includes(option.label);return <button type="button" key={option.label} disabled={profile?.converted==null} className="admission-support-filter" aria-pressed={active} title={meta.detail} style={active?{background:meta.color,color:"#fff",borderColor:meta.color,boxShadow:`0 4px 10px ${meta.color}2b`}:{background:meta.background,color:meta.color,borderColor:meta.border}} onClick={()=>setFilters(current=>({...current,bands:toggleSelection(current.bands||[],option.label)}))}><b>{option.label}</b><small>{option.range}</small></button>})}</div></div>
    <div className="admission-quick-filter-note">사례검색의 지원 구간은 학생의 9등급 환산값과 각 사례의 전교과 내신 차이로 계산합니다. 대학별 분석 카드에서는 합격자 50%컷을 별도로 사용합니다.</div>
  </div>;
}

function StudentMatch({rows,profile,favorites=[],onToggleFavorite,onOpenAdmission,admissionRows=[],selectedUniversity="",onSelectUniversity,onBackUniversity,onOpenDepartmentCases,quickFilters=null}){
  const[range,setRange]=useState(0.5);
  const similar=useMemo(()=>{
    if(profile?.converted==null)return[];
    return rows.filter(row=>{
      const grade=row.overallGrade;
      return grade!=null&&Math.abs(grade-profile.converted)<=range;
    });
  },[rows,profile,range]);
  const stats=useMemo(()=>{
    const labels=unique(similar.map(row=>row.universityNormalized||row.university));
    return labels.map(label=>{
      const similarRows=similar.filter(row=>(row.universityNormalized||row.university)===label);
      const allRows=rows.filter(row=>(row.universityNormalized||row.university)===label);
      const acceptedAll=allRows.filter(row=>row.finalResult==="합격");
      return{label,total:similarRows.length,accepted:similarRows.filter(row=>row.finalResult==="합격").length,rejected:similarRows.filter(row=>row.finalResult==="불합격").length,median:median(acceptedAll.map(row=>row.universityGrade??row.overallGrade)),allTotal:allRows.length,allAccepted:acceptedAll.length};
    }).sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label,"ko")).slice(0,30);
  },[similar,rows]);
  const hasHolistic=useMemo(()=>similar.some(row=>String(row.admissionType||row.detailType||"").includes("종합")),[similar]);
  useEffect(()=>{if(selectedUniversity)onSelectUniversity?.("")},[range,profile?.sid]); // eslint-disable-line react-hooks/exhaustive-deps
  if(!profile)return <Empty title="학생을 먼저 선택하세요." text="학번을 연동하면 현재 성적과 가까운 과거 지원 사례를 보여줍니다." icon={<GraduationCap size={28}/>}/>;
  if(profile.converted==null)return <Empty title="비교할 내신 성적이 없습니다." text="학생의 학기 성적을 먼저 업로드하세요." icon={<AlertTriangle size={28}/>}/>;

  const accepted=similar.filter(x=>x.finalResult==="합격").length;
  if(selectedUniversity){
    const selectedSimilar=similar.filter(row=>(row.universityNormalized||row.university)===selectedUniversity);
    const selectedAll=rows.filter(row=>(row.universityNormalized||row.university)===selectedUniversity);
    const acceptedAll=selectedAll.filter(row=>row.finalResult==="합격");
    const detailRows=buildUniversityDetails(selectedAll);
    const cut50=median(acceptedAll.map(row=>row.universityGrade??row.overallGrade));
    const rate=selectedAll.length?acceptedAll.length/selectedAll.length*100:0;
    const sample=caseSufficiency(selectedAll.length);
    const difference=gradeDifference(profile.converted,cut50);
    const fit=applicationBand(profile.converted,cut50);
    const holistic=selectedAll.some(row=>String(row.admissionType||row.detailType||"").includes("종합"));
    return <div style={{display:"grid",gap:16}}>
      <button type="button" onClick={()=>onBackUniversity?.()} style={styles.backButton}><ArrowLeft size={15}/>대학 목록으로</button>
      <section style={styles.universityDetailPage}>
        <div style={styles.detailHero}>
          <div style={{display:"grid",gap:6}}>
            <span style={styles.detailEyebrow}>학생 맞춤 대학 상세</span>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><h3 style={{fontSize:22}}>{selectedUniversity}</h3>{onToggleFavorite&&<button type="button" className={`admission-favorite-button ${isFavorite(favorites,{source:"case",university:selectedUniversity})?"is-active":""}`} onClick={()=>onToggleFavorite({source:"case",favoriteKind:"대학",university:selectedUniversity,label:`${selectedUniversity} 광덕고 사례`})} title="관심 대학에 저장"><Star size={15} fill="currentColor"/></button>}{onOpenAdmission&&admissionRows.some(row=>normalizeUniversityLink(row.university,row.region)===normalizeUniversityLink(selectedUniversity))&&<button type="button" className="admission-link-button" onClick={()=>onOpenAdmission(selectedUniversity)}>대학 지원 진단 <ExternalLink size={12}/></button>}</div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}><span className="admission-sample-badge" title={sample.detail}>{sample.label}</span><span className="admission-band-badge" title={fit.detail} style={{color:fit.color,background:fit.background,borderColor:fit.border}}>{fit.label}</span><RateBand rate={rate} total={selectedAll.length}/></div>
          </div>
          <div className="admission-detail-compare" style={styles.detailStudentCompare}>
            <div><small>학생 환산 등급</small><b>{fmt(profile.converted)}</b></div>
            <div><small>합격자 50%컷</small><b>{fmt(cut50)}</b></div>
            <div><small>50%컷 대비</small><b className="admission-cut-arrow" title={difference.detail} style={{color:difference.color}}>{difference.label}</b></div>
          </div>
        </div>
        <div className="admission-detail-metrics" style={styles.detailMetricGrid}>
          <div><small>전체 지원</small><b style={{color:COLORS.blue}}>{selectedAll.length}</b></div>
          <div><small>학생 유사 지원</small><b style={{color:COLORS.blue}}>{selectedSimilar.length}</b></div>
          <div><small>최초합격</small><b style={{color:COLORS.blue}}>{selectedAll.filter(x=>x.finalResultDetail==="최초합격").length}</b></div>
          <div><small>충원합격</small><b style={{color:COLORS.purple}}>{selectedAll.filter(x=>x.finalResultDetail==="충원합격").length}</b></div>
          <div><small>불합격</small><b style={{color:COLORS.red}}>{selectedAll.filter(x=>x.finalResult==="불합격").length}</b></div>
        </div>
        {holistic&&<div className="admission-holistic-notice"><AlertTriangle size={15}/><span><b>학생부종합 참고</b> · 서류·활동·과목 선택 등이 함께 평가되므로 50%컷은 성적 위치를 확인하는 참고값으로만 활용하세요.</span></div>}
      </section>
      <Section title="모집단위·전형별 결과" description="해당 대학의 모집단위와 전형을 지원 사례 수와 합격자 50%컷으로 비교합니다.">
        <Table style={{tableLayout:"fixed"}} className="admission-detail-table"><colgroup><col style={{width:"24%"}}/><col style={{width:"25%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"11%"}}/><col style={{width:"8%"}}/></colgroup><thead><tr><th>모집단위</th><th>전형</th><th>지원</th><th>최초합</th><th>충원합</th><th>불합격</th><th>합격률</th><th>50%컷</th></tr></thead><tbody>{detailRows.map(row=><tr key={`${row.department}|${row.type}`}><td><button type="button" className="admission-department-link" onClick={()=>onOpenDepartmentCases?.(selectedUniversity,row.department,"")} title="이 모집단위의 전체 사례 조회">{row.department}</button></td><td style={{textAlign:"left",color:"#566171"}}>{row.type}</td><td><b style={{color:COLORS.blue}}>{row.total}</b></td><td style={{color:COLORS.blue,fontWeight:800}}>{row.first}</td><td style={{color:COLORS.purple,fontWeight:800}}>{row.waitlist}</td><td style={{color:COLORS.red,fontWeight:800}}>{row.rejected}</td><td><RateBand rate={row.rate} total={row.total} compact/></td><td>{fmt(row.median)}</td></tr>)}</tbody></Table>
      </Section>
      <Section title={`학생 유사 사례 ${selectedSimilar.length}건`} description={`현재 9등급 환산 ${fmt(profile.converted)}에서 ±${range.toFixed(1)} 범위의 사례입니다.`} aside={<div className="admission-current-university"><small>현재 조회 대학</small><b>{selectedUniversity}</b></div>}>
        {selectedSimilar.length?<Table style={{tableLayout:"fixed"}} className="admission-detail-table"><colgroup><col style={{width:"7%"}}/><col style={{width:"20%"}}/><col style={{width:"23%"}}/><col style={{width:"10%"}}/><col style={{width:"10%"}}/><col style={{width:"14%"}}/><col style={{width:"16%"}}/></colgroup><thead><tr><th>관심</th><th>모집단위</th><th>전형</th><th>전교과</th><th>대학 환산</th><th>최종 결과</th><th>등록 여부</th></tr></thead><tbody>{selectedSimilar.slice(0,40).map(row=>{const registration=registrationDisplay(row);const favoriteItem={source:"case",favoriteKind:"학과",university:selectedUniversity,department:row.department,admissionType:row.detailType||row.admissionType,label:`${selectedUniversity} ${row.department}`};return <tr key={row.caseId}><td>{onToggleFavorite&&<button type="button" className={`admission-favorite-button ${isFavorite(favorites,favoriteItem)?"is-active":""}`} onClick={()=>onToggleFavorite(favoriteItem)} title="이 유사 사례를 상담·관심 대학에 저장" aria-label="유사 사례 즐겨찾기"><Star size={13} fill="currentColor"/></button>}</td><td style={{textAlign:"left",fontWeight:800}}>{row.department}</td><td style={{textAlign:"left"}}>{row.detailType||row.admissionType}</td><td>{fmt(row.overallGrade)}</td><td>{fmt(row.universityGrade)}</td><td><span style={{...styles.badge,...resultStyle(row.finalResultDetail)}}>{row.finalResultDetail}</span></td><td><span style={{...styles.registrationBadge,color:registration.color,background:registration.background}}>{registration.label}</span></td></tr>})}</tbody></Table>:<Empty title="현재 범위의 유사 사례가 없습니다." text="대학 전체 지원 결과는 위 표에서 확인할 수 있습니다."/>}
      </Section>
    </div>;
  }

  return <div style={{display:"grid",gap:16}}>
    <div style={styles.notice}><AlertTriangle size={16}/><span>과거 사례는 9등급제 자료입니다. 5등급제 학생은 9등급 환산값으로 비교하며, 상향·소신·적정·안정·하향은 <b>합격자 50%컷과의 차이</b>를 기준으로 표시합니다.</span></div>
    <div className="admission-range-panel">
      <div><b>성적 비교 범위</b><span>계열·전형 조건은 위의 분석 조건을 그대로 사용합니다.</span></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{[0.3,0.5,1].map(value=><button type="button" key={value} className={`admission-range-button ${range===value?"is-active":""}`} onClick={()=>setRange(value)}>±{value.toFixed(1)}</button>)}</div>
    </div>
    <div className="admission-comparison-summary" style={styles.studentComparisonHeader}>
      <div><small>내신 평균 · {profile.gradeSystem}등급제</small><b>{fmt(profile.average)}</b></div>
      <div><small>환산 등급</small><b style={{color:COLORS.blue}}>{fmt(profile.converted)}</b></div>
      <div><small>비교 범위</small><b>±{range.toFixed(1)}등급</b></div>
      <div><small>유사 지원 · 합격</small><b><span style={{color:COLORS.blue}}>{similar.length}</span><span style={{color:"#98a1ad",padding:"0 5px"}}>/</span><span style={{color:COLORS.green}}>{accepted}</span></b></div>
    </div>
    <SummaryCards rows={similar}/>
    {quickFilters}
    <Section title="현재 성적 기준 대학별 지원 사례" description="지원 구간은 합격 사례 비율이 아니라 학생의 9등급 환산과 합격자 50%컷의 차이로 산출합니다.">
      {hasHolistic&&<div className="admission-holistic-notice" style={{marginBottom:12}}><AlertTriangle size={15}/><span><b>학생부종합 전형</b>은 서류·활동·과목 선택 등을 종합 평가하므로 50%컷과 지원 구간을 참고용으로만 활용하세요.</span></div>}
      {stats.length?<div style={styles.caseCards}>{stats.map(stat=>{
        const sample=caseSufficiency(stat.total),difference=gradeDifference(profile.converted,stat.median),rate=stat.total?stat.accepted/stat.total*100:0,fit=applicationBand(profile.converted,stat.median);
        return <button type="button" className="admission-university-card" key={stat.label} style={styles.caseCard} onClick={()=>onSelectUniversity?.(stat.label)}>
          <div style={styles.caseCardHead}><div style={{display:"grid",gap:4}}><b style={{fontSize:15.5,color:"#222b36"}}>{stat.label}</b><span style={{fontSize:10.5,color:"#7b8491"}}>클릭하여 상세 보기</span></div><div style={{display:"flex",gap:6,alignItems:"center"}}>{onToggleFavorite&&<span role="button" tabIndex={0} className={`admission-favorite-button ${isFavorite(favorites,{source:"case",university:stat.label})?"is-active":""}`} onClick={event=>{event.stopPropagation();onToggleFavorite({source:"case",favoriteKind:"대학",university:stat.label,label:`${stat.label} 광덕고 사례`})}} onKeyDown={event=>{if(event.key==="Enter"){event.stopPropagation();onToggleFavorite({source:"case",favoriteKind:"대학",university:stat.label,label:`${stat.label} 광덕고 사례`})}}} title="관심 대학에 저장"><Star size={14} fill="currentColor"/></span>}<span className="admission-sample-badge" title={sample.detail}>{sample.label}</span></div></div>
          <div className="admission-case-comparison"><div><small>학생 환산 등급</small><b style={{color:COLORS.blue}}>{fmt(profile.converted)}</b></div><div><small>합격자 50%컷</small><b style={{color:COLORS.green}}>{fmt(stat.median)}</b></div><div><small>50%컷 대비</small><b className="admission-cut-arrow" title={difference.detail} style={{fontSize:12.5,color:difference.color}}>{difference.label}</b></div></div>
          <div style={styles.caseCountRow}><span className="admission-case-count-pill support">지원 <b>{stat.total}</b></span><span className="admission-case-count-pill accept">합격 <b>{stat.accepted}</b></span><span className="admission-case-count-pill reject">불합격 <b>{stat.rejected}</b></span></div>
          <div style={styles.caseFooter}><div style={{display:"grid",gap:3}}><span style={{fontSize:10.5,color:"#777f8b"}}>합격 사례 비율 {fmt(rate,1)}%</span><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontWeight:800}}>50%컷 기준</span><span className="admission-band-badge" title={fit.detail} style={{color:fit.color,background:fit.background,borderColor:fit.border}}>{fit.label}</span></div></div><ChevronRight size={17} color="#7a8799"/></div>
        </button>;
      })}</div>:<Empty title="선택한 범위의 유사 사례가 없습니다." text="성적 범위를 넓히거나 위의 분석 조건을 완화해보세요."/>}
    </Section>
  </div>;
}
function Bars({rows}){
  const max=Math.max(1,...rows.map(x=>x.total));
  return <div style={{display:"grid",gap:12}}>{rows.map(row=><div key={row.label} style={styles.barRowNew}>
    <b style={{fontSize:13}}>{row.label}</b>
    <div style={styles.dualBarWrap}>
      <div style={styles.dualBarTrack}><div style={{...styles.supportBar,width:`${Math.max(2,row.total/max*100)}%`}}/></div>
      <div style={styles.dualBarTrack}><div style={{...styles.acceptBar,width:`${Math.max(row.accepted?2:0,row.accepted/max*100)}%`}}/></div>
    </div>
    <div style={styles.barCounts}>
      <span className="admission-case-count-pill support">지원 <b>{row.total}</b></span>
      <span className="admission-case-count-pill accept">합격 <b>{row.accepted}</b></span>
    </div>
  </div>)}</div>;
}
function Overview({rows}){
  const types=useMemo(()=>groupStats(rows,x=>x.admissionType).slice(0,10),[rows]);
  const regions=useMemo(()=>groupStats(rows,x=>x.region).slice(0,12),[rows]);
  const grades=useMemo(()=>groupStats(rows.filter(x=>x.gradeBand),x=>`${x.gradeBand}등급대`).sort((a,b)=>parseFloat(a.label)-parseFloat(b.label)),[rows]);
  return <div style={{display:"grid",gap:18}}>
    <SummaryCards rows={rows}/>
    <div className="admission-case-two" style={styles.twoColumns}><Section title="전형별 지원·합격 사례" description="파란색은 지원, 초록색은 합격 사례입니다."><Bars rows={types}/></Section><Section title="지역별 지원·합격 사례" description="사례 수와 합격 사례 수를 함께 비교합니다."><Bars rows={regions}/></Section></div>
    <Section title="등급대별 결과" description="1·2등급대는 별도 색으로 강조하고, 각 등급대의 합격 사례 비율과 합격자 50%컷을 표시합니다.">
      <Table style={{tableLayout:"fixed"}} className="admission-detail-table"><colgroup><col style={{width:"15%"}}/><col style={{width:"11%"}}/><col style={{width:"11%"}}/><col style={{width:"11%"}}/><col style={{width:"12%"}}/><col style={{width:"11%"}}/><col style={{width:"16%"}}/><col style={{width:"13%"}}/></colgroup><thead><tr><th>등급대</th><th>지원</th><th>최초합</th><th>충원합</th><th>합격 합계</th><th>불합격</th><th>합격률</th><th>합격자 50%컷</th></tr></thead><tbody>{grades.map(row=>{const level=parseInt(row.label,10);return <tr key={row.label} className={level===1?"admission-grade-row-1":level===2?"admission-grade-row-2":""}><td><b>{row.label}</b></td><td><b style={{color:COLORS.blue}}>{row.total}</b></td><td style={{color:COLORS.blue,fontWeight:800}}>{row.first}</td><td style={{color:COLORS.purple,fontWeight:800}}>{row.waitlist}</td><td><b style={{color:COLORS.green}}>{row.accepted}</b></td><td style={{color:COLORS.red,fontWeight:800}}>{row.rejected}</td><td><RateBand rate={row.rate} total={row.total} compact/></td><td><b>{fmt(row.median)}</b></td></tr>})}</tbody></Table>
    </Section>
  </div>;
}
function UniversityAnalysis({rows,focusUniversity="",selectedUniversity="",onSelectedUniversityChange,onOpenDepartmentCases}){
  const[query,setQuery]=useState("");
  const allUniversities=useMemo(()=>groupStats(rows,x=>x.universityNormalized||x.university),[rows]);
  const universities=useMemo(()=>{const q=query.trim().toLowerCase();return allUniversities.filter(x=>!q||x.label.toLowerCase().includes(q)).slice(0,100)},[allUniversities,query]);
  const selected=selectedUniversity;
  const setSelected=value=>onSelectedUniversityChange?.(value);
  useEffect(()=>{if(!focusUniversity)return;const base=String(focusUniversity).trim();setQuery(base);const match=allUniversities.find(item=>normalizeUniversityLink(item.label)===normalizeUniversityLink(focusUniversity))||allUniversities.find(item=>normalizeSearchText(item.label).includes(normalizeSearchText(base)));if(match)setSelected(match.label)},[focusUniversity,allUniversities]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(!universities.length){if(selected)setSelected("");return}if(!selected||!universities.some(item=>item.label===selected))setSelected(universities[0].label)},[query,universities.map(item=>item.label).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedRows=useMemo(()=>selected?rows.filter(x=>(x.universityNormalized||x.university)===selected):[],[rows,selected]);
  const details=useMemo(()=>buildUniversityDetails(selectedRows),[selectedRows]);
  const acceptedGrades=selectedRows.filter(x=>x.finalResult==="합격").map(x=>x.universityGrade??x.overallGrade);
  const selectedAccepted=selectedRows.filter(x=>x.finalResult==="합격").length;
  const selectedRate=selectedRows.length?selectedAccepted/selectedRows.length*100:0;
  const holistic=selectedRows.some(row=>String(row.admissionType||row.detailType||"").includes("종합"));
  return <div style={{display:"grid",gap:12}}>
    <div style={styles.universitySearchPanel}><div style={{display:"grid",gap:3}}><b style={{fontSize:15}}>대학별 상세 조회</b><span style={{fontSize:11.5,color:"#737b87"}}>검색어를 바꾸면 첫 번째 검색 결과로 즉시 최신화됩니다.</span></div><div className="admission-university-picker"><div style={{...styles.searchBox,minWidth:0}}><Search size={17} color="#59677a"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="대학명 검색"/>{query&&<button type="button" onClick={()=>setQuery("")} style={{border:0,background:"transparent",cursor:"pointer",color:"#637187",fontWeight:900}}>×</button>}<span>{universities.length}개</span></div><label style={{display:"grid",gap:5,fontSize:10.5,fontWeight:800,color:"#667180"}}>대학 선택<select value={selected} onChange={e=>setSelected(e.target.value)}>{universities.map(row=><option key={row.label} value={row.label}>{row.label} · 지원 {row.total} · 합격 {row.accepted}</option>)}</select></label></div></div>
    <div style={styles.universityDetail}>{!selected?<Empty title="검색 결과가 없습니다." text="대학명을 다시 입력하거나 검색어를 지워보세요."/>:<><div style={styles.universityHead}><div style={{display:"grid",gap:4}}><b style={{fontSize:20,color:"#202a35"}}>{selected}</b><span style={{fontSize:12,color:"#737b87"}}>광덕고 2024~2026 통합 지원 사례</span></div><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span className="admission-sample-badge">{caseSufficiency(selectedRows.length).label}</span><RateBand rate={selectedRate} total={selectedRows.length}/></div></div>
      <div className="admission-stat-strip"><div><small>지원 사례</small><b style={{color:COLORS.blue}}>{selectedRows.length}건</b></div><div><small>합격 사례</small><b style={{color:COLORS.green}}>{selectedAccepted}건</b></div><div><small>합격자 50%컷</small><b>{fmt(median(acceptedGrades))}</b></div><div><small>합격자 25~75%</small><b>{fmt(percentile(acceptedGrades,.25))} ~ {fmt(percentile(acceptedGrades,.75))}</b></div></div>
      {holistic&&<div className="admission-holistic-notice" style={{marginTop:12}}><AlertTriangle size={15}/><span><b>학생부종합 참고</b> · 학생부종합은 서류·활동·과목 선택 등을 종합 평가하므로 커트라인은 참고용으로만 활용하세요.</span></div>}
      <div style={{marginTop:12}}><Table style={{tableLayout:"fixed"}} className="admission-detail-table"><colgroup><col style={{width:"24%"}}/><col style={{width:"26%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"10%"}}/><col style={{width:"8%"}}/></colgroup><thead><tr><th>모집단위</th><th>전형</th><th>지원</th><th>최초합</th><th>충원합</th><th>불합격</th><th>합격률</th><th>50%컷</th></tr></thead><tbody>{details.map(row=><tr key={`${row.department}|${row.type}`}><td><button type="button" className="admission-department-link" onClick={()=>onOpenDepartmentCases?.(selected,row.department,"")} title="이 모집단위의 전체 사례 조회">{row.department}</button></td><td style={{textAlign:"left",color:"#566171"}}>{row.type}</td><td><b style={{color:COLORS.blue}}>{row.total}</b></td><td style={{color:COLORS.blue,fontWeight:800}}>{row.first}</td><td style={{color:COLORS.purple,fontWeight:800}}>{row.waitlist}</td><td style={{color:COLORS.red,fontWeight:800}}>{row.rejected}</td><td><RateBand rate={row.rate} total={row.total} compact/></td><td>{fmt(row.median)}</td></tr>)}</tbody></Table></div></>}</div>
  </div>;
}

function DimensionAnalysis({rows}){
  const[mode,setMode]=useState("등급별");
  const getter=mode==="지역별"?x=>x.region:mode==="계열별"?x=>x.field:mode==="전형별"?x=>x.admissionType:x=>x.gradeBand?`${x.gradeBand}등급대`:"등급 미입력";
  let stats=useMemo(()=>groupStats(rows,getter),[rows,mode]);
  if(mode==="등급별")stats=[...stats].sort((a,b)=>(parseFloat(a.label)||99)-(parseFloat(b.label)||99));
  return <div style={{display:"grid",gap:15}}>
    <div style={styles.modePanel}><div style={{display:"grid",gap:3}}><b style={{fontSize:15}}>분석 기준</b><span style={{fontSize:11.5,color:"#737b87"}}>원하는 기준으로 지원·합격 결과를 비교하세요.</span></div><div style={styles.modeTabs}>{["등급별","지역별","계열별","전형별"].map(value=><button className="admission-mode-button" key={value} onClick={()=>setMode(value)} style={{...styles.modeButton,...(mode===value?styles.modeButtonActive:{})}}>{value}</button>)}</div></div>
    <Table style={{tableLayout:"fixed"}} className="admission-detail-table"><colgroup><col style={{width:"16%"}}/><col style={{width:"11%"}}/><col style={{width:"11%"}}/><col style={{width:"11%"}}/><col style={{width:"12%"}}/><col style={{width:"11%"}}/><col style={{width:"20%"}}/><col style={{width:"8%"}}/></colgroup><thead><tr><th>{mode.replace("별","")}</th><th>지원 사례</th><th>최초합</th><th>충원합</th><th>합격 합계</th><th>불합격</th><th>합격률</th><th>50%컷</th></tr></thead><tbody>{stats.map(row=>{const level=mode==="등급별"?parseInt(row.label,10):null;return <tr key={row.label} className={level===1?"admission-grade-row-1":level===2?"admission-grade-row-2":""}><td><b>{row.label}</b></td><td><b style={{color:COLORS.blue}}>{row.total}</b></td><td style={{color:COLORS.blue,fontWeight:800}}>{row.first}</td><td style={{color:COLORS.purple,fontWeight:800}}>{row.waitlist}</td><td><b style={{color:COLORS.green}}>{row.accepted}</b></td><td style={{color:COLORS.red,fontWeight:800}}>{row.rejected}</td><td><RateBand rate={row.rate} total={row.total} compact/></td><td>{fmt(row.median)}</td></tr>})}</tbody></Table>
  </div>;
}
function caseBandKey(row){
  return [
    normalizeUniversityLink(row?.universityNormalized||row?.university,row?.region),
    normalizeSearchText(row?.department||""),
    normalizeSearchText(row?.detailType||row?.admissionType||""),
  ].join("|");
}
function buildCaseBandCutMaps(rows=[]){
  const groupGrades=new Map();
  const universityGrades=new Map();
  (rows||[]).forEach(row=>{
    if(row?.finalResult!=="합격")return;
    const grade=row.overallGrade;
    if(grade==null)return;
    const groupKey=caseBandKey(row);
    const universityKeyValue=normalizeUniversityLink(row?.universityNormalized||row?.university,row?.region);
    if(!groupGrades.has(groupKey))groupGrades.set(groupKey,[]);
    if(!universityGrades.has(universityKeyValue))universityGrades.set(universityKeyValue,[]);
    groupGrades.get(groupKey).push(Number(grade));
    universityGrades.get(universityKeyValue).push(Number(grade));
  });
  return{
    group:new Map(Array.from(groupGrades,([key,values])=>[key,median(values)])),
    university:new Map(Array.from(universityGrades,([key,values])=>[key,median(values)])),
  };
}
function gradeScopeLabel(minGrade,maxGrade){
  const min=num(minGrade),max=num(maxGrade);
  if(min!=null&&max!=null)return`전교과 ${fmt(min)}~${fmt(max)}`;
  if(min!=null)return`전교과 ${fmt(min)} 이상`;
  if(max!=null)return`전교과 ${fmt(max)} 이하`;
  return"";
}
function CaseSearch({rows,comparisonRows=[],profile,favorites=[],onToggleFavorite,focusUniversity="",focusDepartment="",focusAdmissionType="",onClearLinkedFocus,globalMinGrade="",globalMaxGrade=""}){
  const[query,setQuery]=useState("");
  const[range,setRange]=useState(null);
  const[gradeDisplayMode,setGradeDisplayMode]=useState("9");
  const[sortOrder,setSortOrder]=useState("default");
  const[printOrientation,setPrintOrientation]=useState("portrait");
  const[favoriteMode,setFavoriteMode]=useState("group");
  const[page,setPage]=useState(1);
  const linkedQuery=[focusUniversity,focusDepartment,focusAdmissionType].filter(Boolean).join(" ");
  useEffect(()=>{if(linkedQuery)setQuery(linkedQuery)},[linkedQuery]);
  useEffect(()=>setGradeDisplayMode("9"),[profile?.sid]);
  const filtered=useMemo(()=>rows.filter(row=>{
    if(focusUniversity&&normalizeUniversityLink(row.universityNormalized||row.university,row.region)!==normalizeUniversityLink(focusUniversity))return false;
    if(focusDepartment&&!normalizeSearchText(row.department).includes(normalizeSearchText(focusDepartment)))return false;
    if(focusAdmissionType&&!normalizeSearchText(`${row.admissionType} ${row.detailType}`).includes(normalizeSearchText(focusAdmissionType)))return false;
    if(!textMatch(row,query))return false;
    if(range!=null){if(profile?.converted==null)return false;const grade=row.overallGrade;if(grade==null||Math.abs(grade-profile.converted)>range)return false}
    return true;
  }),[rows,query,range,profile?.converted,focusUniversity,focusDepartment,focusAdmissionType]);
  const sorted=useMemo(()=>{
    if(sortOrder==="default")return filtered;
    const direction=sortOrder==="overallAsc"?1:-1;
    return [...filtered].sort((a,b)=>{
      const av=num(a.overallGrade),bv=num(b.overallGrade);
      if(av==null&&bv==null)return 0;
      if(av==null)return 1;
      if(bv==null)return-1;
      return(av-bv)*direction||String(a.university||"").localeCompare(String(b.university||""),"ko");
    });
  },[filtered,sortOrder]);
  useEffect(()=>setPage(1),[query,range,sortOrder,rows.length,focusUniversity,focusDepartment,focusAdmissionType]);
  const max=Math.max(1,Math.ceil(sorted.length/PAGE_SIZE));
  const visible=sorted.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
  const renderRows=(items,printMode=false)=>items.map(row=>{
    const registration=registrationDisplay(row);
    const groupFavorite={source:"case",favoriteKind:"학과",university:row.university,region:row.region,department:row.department,admissionType:row.detailType||row.admissionType,label:`${row.university} ${row.department}`};
    const individualFavorite={...groupFavorite,favoriteKind:"개별사례",caseId:row.caseId,label:`${row.university} ${row.department} 개별 사례`};
    const selectedFavorite=favoriteMode==="individual"?individualFavorite:groupFavorite;
    const caseGrade=num(row.overallGrade);
    const fit=applicationBand(profile?.converted,caseGrade);
    const showBand=profile?.converted!=null&&caseGrade!=null;
    return <tr key={`${printMode?"print":"screen"}-${row.caseId}`}>{!printMode&&<td><div className="admission-favorite-scope">{onToggleFavorite&&<button type="button" className={`admission-favorite-button ${isFavorite(favorites,selectedFavorite)?"is-active":""}`} onClick={()=>onToggleFavorite(selectedFavorite)} title={favoriteMode==="individual"?"이 지원 사례 한 건만 저장":"같은 대학·학과·전형 묶음 저장"} aria-label="사례 즐겨찾기"><Star size={13} fill="currentColor"/></button>}</div></td>}<td><b style={{fontSize:11.2}}>{row.university}</b></td><td style={{textAlign:"center",fontWeight:780,whiteSpace:"normal",wordBreak:"keep-all"}}>{row.department}</td><td>{row.region}<br/><small style={{color:"#727b86"}}>{row.field}</small></td><td style={{textAlign:"left"}}><b style={{fontSize:11.2}}>{row.admissionType}</b><br/><small style={{color:"#727b86"}}>{row.detailType}</small></td><td className="grade-overall"><div className="admission-grade-cell"><small>내신</small><b>{fmt(row.overallGrade)}</b>{showBand&&<span className="admission-row-band" title={`${fit.detail} · 이 사례 전교과 내신 ${fmt(caseGrade)}`} style={{color:fit.color,background:fit.background,borderColor:fit.border}}>{fit.label}</span>}</div></td><td className="grade-university"><div className="admission-grade-cell"><small>환산</small><b>{fmt(row.universityGrade)}</b></div></td><td className="grade-csat"><div className="admission-grade-cell"><small>수능</small><b>{fmt(row.csatAverage)}</b></div></td><td><span style={{...styles.badge,...resultStyle(row.finalResultDetail)}}>{row.finalResultDetail}</span></td><td><span style={{...styles.registrationBadge,color:registration.color,background:registration.background}}>{registration.label}</span></td></tr>;
  });
  const renderPortraitRows=items=>items.map(row=>{
    const registration=registrationDisplay(row);
    const caseGrade=num(row.overallGrade);
    const fit=applicationBand(profile?.converted,caseGrade);
    const showBand=profile?.converted!=null&&caseGrade!=null;
    return <tr key={`portrait-${row.caseId}`}>
      <td><b>{row.university}</b><small>{row.department}</small></td>
      <td>{row.region}<small>{row.field}</small></td>
      <td style={{textAlign:"left"}}><b>{row.admissionType}</b><small>{row.detailType}</small></td>
      <td><div className="admission-grade-cell"><small>내신</small><b>{fmt(row.overallGrade)}</b>{showBand&&<span className="admission-row-band" style={{color:fit.color,background:fit.background,borderColor:fit.border}}>{fit.label}</span>}</div></td>
      <td><small>대학 환산</small><b>{fmt(row.universityGrade)}</b><small>수능 {fmt(row.csatAverage)}</small></td>
      <td><span style={{...styles.badge,...resultStyle(row.finalResultDetail)}}>{row.finalResultDetail}</span><small style={{color:registration.color}}>{registration.label}</small></td>
    </tr>;
  });
  const printContext=focusUniversity?[focusUniversity,focusDepartment,focusAdmissionType].filter(Boolean).join(" › "):(query?`“${query}” 검색 결과`:"전체 대학·학과·전형");
  const globalScope=gradeScopeLabel(globalMinGrade,globalMaxGrade);
  const localScope=range!=null&&profile?.converted!=null?`9등급 환산 ${fmt(profile.converted)} ±${range.toFixed(1)}`:"";
  const scopeLabels=[globalScope,localScope].filter(Boolean);
  const sortLabel=sortOrder==="overallAsc"?"내신 오름차순":sortOrder==="overallDesc"?"내신 내림차순":"기본 정렬";
  const studentPrintLabel=profile?`${profile.sid} ${profile.name||"학생"} · ${profile.gradeSystem}등급제 원내신 ${fmt(profile.average)} · 9등급 환산 ${fmt(profile.converted)}`:"학생 미선택";
  const printFilterLabel=[printContext,...scopeLabels,sortLabel].filter(Boolean).join(" · ");
  const showOriginalGrade=profile?.gradeSystem===5&&gradeDisplayMode==="5";
  const benchmarkGrade=showOriginalGrade?profile?.average:profile?.converted;
  const benchmarkScale=showOriginalGrade?"5등급제 원내신":"9등급제 환산";
  return <div className="admission-case-search-root admission-case-print-root">
    <div className="admission-case-search-controls no-print"><SearchBox value={query} onChange={setQuery} placeholder="예: 건국대 경영 · 대학/학과/전형 통합 검색" count={`${sorted.length.toLocaleString()}건`}/><div className="admission-case-search-actions">{profile&&<div className="admission-case-student-benchmark" title="과거 사례와 지원 구간은 모두 9등급 기준으로 비교합니다. 5등급제 버튼은 원내신 확인용입니다."><div className="admission-case-benchmark-head"><span>현재 학생 내신</span>{profile.gradeSystem===5&&<div className="admission-grade-system-toggle" aria-label="현재 내신 표시 기준"><button type="button" className={gradeDisplayMode==="9"?"is-active":""} onClick={()=>setGradeDisplayMode("9")}>9등급</button><button type="button" className={gradeDisplayMode==="5"?"is-active":""} onClick={()=>setGradeDisplayMode("5")}>5등급</button></div>}</div><div className="admission-case-benchmark-body"><div className="admission-case-benchmark-primary"><strong>{fmt(benchmarkGrade)}</strong><small>{benchmarkScale}</small></div><div className="admission-case-benchmark-companion"><span>{showOriginalGrade?"9등급 비교값":"원내신 확인"}</span><b>{showOriginalGrade?fmt(profile.converted):`${profile.gradeSystem}등급 ${fmt(profile.average)}`}</b></div></div><em>{showOriginalGrade?`사례 비교는 9등급 환산 ${fmt(profile.converted)} 사용`:(profile.gradeSystem===9?"사례와 동일한 9등급 기준":`지원 구간은 9등급 환산 ${fmt(profile.converted)} 기준`)}</em></div>}<div className="admission-case-range-filter"><span>사례 내신 비교 범위</span><button type="button" className={`admission-filter-chip ${range==null?"is-active":""}`} onClick={()=>setRange(null)}>전체</button>{[0.3,0.5,1].map(value=><button type="button" key={value} className={`admission-filter-chip ${range===value?"is-active":""}`} disabled={profile?.converted==null} onClick={()=>setRange(value)}>±{value.toFixed(1)}</button>)}</div><label className="admission-case-compact-control admission-case-sort-control"><span>정렬</span><select className="admission-case-sort-select" value={sortOrder} onChange={event=>setSortOrder(event.target.value)} aria-label="사례 정렬"><option value="default">기본 정렬</option><option value="overallAsc">내신 오름차순</option><option value="overallDesc">내신 내림차순</option></select></label><div className="admission-case-compact-control admission-case-print-control"><label><span>용지</span><select value={printOrientation} onChange={event=>setPrintOrientation(event.target.value)} aria-label="인쇄 방향"><option value="portrait">A4 세로</option><option value="landscape">A4 가로</option></select></label><button type="button" className="admission-case-print-button" onClick={()=>printAdmissionCaseSearch(printOrientation)} title="브라우저 인쇄 창에서 PDF로 저장할 수 있습니다."><Printer size={13}/>인쇄·PDF</button></div></div></div>
    <div className="admission-case-search-context no-print"><span>{focusUniversity?<><b>연결 조회</b> · {[focusUniversity,focusDepartment,focusAdmissionType].filter(Boolean).join(" › ")}</>:<><b>현재 조회</b> · {query?`“${query}” 검색 결과`:"전체 대학·학과·전형"}</>}</span><span className="admission-case-filter-status">{scopeLabels.length?scopeLabels.map(label=><b key={label}>{label}</b>):"성적 범위 제한 없음"}{sortOrder!=="default"&&<b>{sortOrder==="overallAsc"?"내신 오름차순":"내신 내림차순"}</b>}{(focusUniversity||focusDepartment||focusAdmissionType)&&<button type="button" className="admission-link-button" onClick={()=>{setQuery("");onClearLinkedFocus?.()}}>연결 필터 해제</button>}</span></div>
    <div className="admission-favorite-guide no-print"><span><strong>지원 구간 뱃지</strong> · 전교과 칸의 상향·소신·적정·안정·하향은 현재 학생의 9등급 환산과 화면에 표시된 해당 사례의 전교과 내신을 직접 비교한 값입니다. 대학별 자체 환산점수는 사용하지 않습니다.</span><div className="admission-favorite-mode"><button type="button" className={favoriteMode==="group"?"is-active":""} onClick={()=>setFavoriteMode("group")}>묶음 저장</button><button type="button" className={favoriteMode==="individual"?"is-active":""} onClick={()=>setFavoriteMode("individual")}>개별 저장</button></div></div>
    <div className="admission-case-print-header print-only"><div><h2>대입 사례 세부 검색 결과</h2><strong>{studentPrintLabel}</strong><span>{printFilterLabel}</span></div><span>{sorted.length.toLocaleString()}건<br/>{new Date().toLocaleDateString("ko-KR")}</span></div>
    <div className="screen-only"><Table className="admission-case-search-table" wrapStyle={{overflowX:"auto",width:"100%",margin:0}}><colgroup><col style={{width:"6%"}}/><col style={{width:"14%"}}/><col style={{width:"13%"}}/><col style={{width:"9%"}}/><col style={{width:"19%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"9%"}}/><col style={{width:"6%"}}/></colgroup><thead><tr><th>관심</th><th>대학</th><th>모집단위</th><th>지역·계열</th><th>전형</th><th className="grade-overall">전교과·구간</th><th className="grade-university">대학 환산</th><th className="grade-csat">수능 평균</th><th>최종 결과</th><th>등록</th></tr></thead><tbody>{renderRows(visible)}</tbody></Table></div>
    <div className="print-only print-landscape-only"><Table className="admission-case-search-table" wrapStyle={{overflow:"visible",width:"100%",margin:0,borderRadius:0}}><colgroup><col style={{width:"15%"}}/><col style={{width:"14%"}}/><col style={{width:"10%"}}/><col style={{width:"20%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"10%"}}/><col style={{width:"7%"}}/></colgroup><thead><tr><th>대학</th><th>모집단위</th><th>지역·계열</th><th>전형</th><th className="grade-overall">전교과·구간</th><th className="grade-university">대학 환산</th><th className="grade-csat">수능 평균</th><th>최종 결과</th><th>등록</th></tr></thead><tbody>{renderRows(sorted,true)}</tbody></Table></div>
    <div className="print-only print-portrait-only"><Table className="admission-case-search-table admission-case-portrait-table" wrapStyle={{overflow:"visible",width:"100%",margin:0,borderRadius:0}}><colgroup><col style={{width:"24%"}}/><col style={{width:"11%"}}/><col style={{width:"25%"}}/><col style={{width:"13%"}}/><col style={{width:"13%"}}/><col style={{width:"14%"}}/></colgroup><thead><tr><th>대학·모집단위</th><th>지역·계열</th><th>전형</th><th>내신·구간</th><th>환산·수능</th><th>결과·등록</th></tr></thead><tbody>{renderPortraitRows(sorted)}</tbody></Table></div>
    <div className="no-print" style={styles.pagination}><button style={styles.pageButton} disabled={page<=1} onClick={()=>setPage(value=>value-1)}><ArrowLeft size={14}/>이전</button><span style={styles.pageStatus}><b>{page}</b><em>/</em>{max}</span><button style={styles.pageButton} disabled={page>=max} onClick={()=>setPage(value=>value+1)}>다음<ChevronRight size={14}/></button></div>
  </div>;
}

export function AdmissionCaseAnalytics({gdb,roster={},currentGrade="2",selectedStudentSid,onSelectedStudentSidChange,selectedStudentQuery,onSelectedStudentQueryChange,favorites=[],onToggleFavorite,onOpenAdmission,focusUniversity="",focusDepartment="",focusAdmissionType="",onBackToConsultation,onClearFocus}){
  const cases=useMemo(()=>prepareAdmissionCaseRows(gdb?.admissionCases||[]),[gdb?.admissionCases]);
  const[tab,setTab]=useState("student");
  const[studentUniversity,setStudentUniversity]=useState("");
  const[universitySelection,setUniversitySelection]=useState("");
  const[searchFocus,setSearchFocus]=useState({university:"",department:"",admissionType:""});
  const navStack=useRef([]);
  const currentView=useRef({tab:"student",studentUniversity:"",universitySelection:"",searchFocus:{university:"",department:"",admissionType:""}});
  const[navDepth,setNavDepth]=useState(0);
  const[localSid,setLocalSid]=useState("");
  const[localQuery,setLocalQuery]=useState("");
  const sid=selectedStudentSid!==undefined?selectedStudentSid:localSid;
  const query=selectedStudentQuery!==undefined?selectedStudentQuery:localQuery;
  const setSid=value=>selectedStudentSid!==undefined?onSelectedStudentSidChange?.(value):setLocalSid(value);
  const setQuery=value=>selectedStudentQuery!==undefined?onSelectedStudentQueryChange?.(value):setLocalQuery(value);
  const profile=useMemo(()=>studentProfile(sid,roster,gdb,currentGrade),[sid,roster,gdb,currentGrade]);
  const[filters,setFilters]=useState({query:"",regions:[],fields:[],schoolTypes:[],admissionGroups:[],detailTypes:[],results:[],bands:[],minGrade:"",maxGrade:""});
  const filtered=useMemo(()=>applyFilters(cases,filters,profile),[cases,filters,profile?.converted]);
  useEffect(()=>{currentView.current={tab,studentUniversity,universitySelection,searchFocus}},[tab,studentUniversity,universitySelection,searchFocus]);
  useEffect(()=>{navStack.current=[];setNavDepth(0);setStudentUniversity("");if(typeof window!=="undefined"&&window.history.state?.kdAdmissionCaseNav){const next={...(window.history.state||{})};delete next.kdAdmissionCaseNav;window.history.replaceState(next,"")}},[sid]);
  const applyView=view=>{setTab(view.tab||"student");setStudentUniversity(view.studentUniversity||"");setUniversitySelection(view.universitySelection||"");setSearchFocus(view.searchFocus||{university:"",department:"",admissionType:""})};
  const restorePrevious=()=>{const previous=navStack.current.pop();if(!previous)return;applyView(previous);setNavDepth(navStack.current.length)};
  const navigate=view=>{const next={...currentView.current,...view};if(JSON.stringify(next)===JSON.stringify(currentView.current))return;navStack.current.push({...currentView.current});setNavDepth(navStack.current.length);if(typeof window!=="undefined")window.history.pushState({...window.history.state,kdAdmissionCaseNav:true},"");applyView(next)};
  const goBack=()=>{if(typeof window!=="undefined"&&window.history.state?.kdAdmissionCaseNav)window.history.back();else restorePrevious()};
  useEffect(()=>{const handler=()=>{if(navStack.current.length)restorePrevious()};window.addEventListener("popstate",handler);return()=>window.removeEventListener("popstate",handler)},[]);
  useEffect(()=>{if(!focusUniversity)return;const base=String(focusUniversity).trim();setStudentUniversity("");if(focusDepartment||focusAdmissionType){setTab("search");setUniversitySelection("");setSearchFocus({university:base,department:focusDepartment||"",admissionType:focusAdmissionType||""})}else{setTab("university");setSearchFocus({university:"",department:"",admissionType:""});setUniversitySelection(base.replace(/\([^)]*\)|\[[^\]]*\]/g,"").trim())}},[focusUniversity,focusDepartment,focusAdmissionType]);
  if(!cases.length)return <Empty title="아직 저장된 대입 사례 데이터가 없습니다." text="관리자 → 성적 데이터 → 2024–2026 대입 사례 데이터에서 엑셀을 업로드하세요."/>;
  const tabLabel={student:"학생 맞춤 분석",overview:"전체 현황",university:"대학·전형별",dimension:"등급·지역별",search:"사례 검색"}[tab]||"대입 결과";
  const breadcrumb=["광덕고 대입 결과",tabLabel,studentUniversity||universitySelection||searchFocus.university,searchFocus.department].filter(Boolean).join("  ›  ");
  const selectTab=key=>navigate({tab:key,studentUniversity:"",universitySelection:key==="university"?universitySelection:"",searchFocus:key==="search"?searchFocus:{university:"",department:"",admissionType:""}});
  return <div className="admission-case-ui" style={styles.page}><style>{CSS}</style>
    <div style={styles.hero}><div><small>광덕고 상담 지원 자료</small><h2>2024–2026 광덕고 대입 결과</h2><p>과거 졸업생의 통합 지원 사례를 등급·지역·전형별로 분석합니다. 학생 수가 아니라 지원 사례 수입니다.</p></div><div style={styles.heroMeta}><b>{cases.length.toLocaleString()}</b><span>통합 지원 사례</span></div></div>
    {(navDepth>0||onBackToConsultation||focusUniversity)&&<div className="admission-internal-nav"><div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>{navDepth>0&&<button type="button" onClick={goBack}><ArrowLeft size={14}/>이전 화면</button>}{onBackToConsultation&&<button type="button" onClick={onBackToConsultation}><ArrowLeft size={14}/>상담·관심 대학으로</button>}<span>{breadcrumb}</span></div>{focusUniversity&&<span>연결 대학 <b>{focusUniversity}</b> <button type="button" style={{marginLeft:6}} onClick={()=>{setUniversitySelection("");onClearFocus?.()}}>연결 해제</button></span>}</div>}
    <StudentConnector profile={profile} query={query} onQuery={setQuery} onSelect={setSid} roster={roster}/>
    <div style={styles.tabs}>{[["student","학생 맞춤 분석"],["overview","전체 현황"],["university","대학·전형별"],["dimension","등급·지역별"],["search","사례 검색"]].map(([key,label])=><button key={key} onClick={()=>selectTab(key)} style={{...styles.tab,...(tab===key?styles.tabActive:{})}}>{label}</button>)}</div>
    <FilterPanel cases={cases} filters={filters} setFilters={setFilters} filteredCount={filtered.length}/><div style={styles.filteredCount}><Filter size={13}/>전체 {cases.length.toLocaleString()}건 중 현재 조건에 해당하는 사례 <b>{filtered.length.toLocaleString()}건</b></div>{filtered.length===0&&<div style={{display:"flex",alignItems:"center",gap:9,padding:"12px 14px",borderRadius:11,background:"#fff4ed",border:"1px solid #f1cfb7",color:"#8a4f25",fontSize:12}}><AlertTriangle size={16}/><span>조건에 해당하는 사례가 없습니다. 상단의 <b>전체 초기화</b>를 누르거나 선택 범위를 넓혀보세요.</span></div>}
    {tab!=="student"&&<ResultQuickFilters filters={filters} setFilters={setFilters} profile={profile}/>} 
    {tab==="student"&&<StudentMatch rows={filtered} profile={profile} favorites={favorites} onToggleFavorite={onToggleFavorite} onOpenAdmission={onOpenAdmission} admissionRows={gdb?.admissionRows||[]} selectedUniversity={studentUniversity} onSelectUniversity={value=>value?navigate({tab:"student",studentUniversity:value}):setStudentUniversity("")} onBackUniversity={goBack} onOpenDepartmentCases={(university,department,admissionType)=>{setFilters({query:"",regions:[],fields:[],schoolTypes:[],admissionGroups:[],detailTypes:[],results:[],bands:[],minGrade:"",maxGrade:""});navigate({tab:"search",studentUniversity:"",universitySelection:"",searchFocus:{university,department,admissionType}})}} quickFilters={<ResultQuickFilters filters={filters} setFilters={setFilters} profile={profile}/>}/>} {tab==="overview"&&<Overview rows={filtered}/>} {tab==="university"&&<UniversityAnalysis rows={filtered} focusUniversity={focusUniversity} selectedUniversity={universitySelection} onSelectedUniversityChange={setUniversitySelection} onOpenDepartmentCases={(university,department,admissionType)=>{setFilters({query:"",regions:[],fields:[],schoolTypes:[],admissionGroups:[],detailTypes:[],results:[],bands:[],minGrade:"",maxGrade:""});navigate({tab:"search",studentUniversity:"",universitySelection:"",searchFocus:{university,department,admissionType}})}}/>} {tab==="dimension"&&<DimensionAnalysis rows={filtered}/>} {tab==="search"&&<CaseSearch rows={filtered} comparisonRows={cases} profile={profile} favorites={favorites} onToggleFavorite={onToggleFavorite} focusUniversity={searchFocus.university||focusUniversity} focusDepartment={searchFocus.department||focusDepartment} focusAdmissionType={searchFocus.admissionType||focusAdmissionType} globalMinGrade={filters.minGrade} globalMaxGrade={filters.maxGrade} onClearLinkedFocus={()=>{setSearchFocus({university:"",department:"",admissionType:""});onClearFocus?.()}}/>} 
  </div>;
}

function QualityCards({cases}){const summary=summarizeAdmissionCases(cases);const rows=[["연도 미입력",cases.filter(x=>x.admissionYear==null).length],["등록 여부 미입력",summary.registrationUnknown],["대학 환산등급 미입력",summary.universityGradeMissing],["수능 평균 미입력",summary.csatMissing],["전교과 미입력",cases.filter(x=>x.overallGrade==null).length]];return <div style={styles.qualityGrid}>{rows.map(([label,value])=><div key={label}><b>{value.toLocaleString()}</b><span>{label}</span></div>)}</div>}
export function AdmissionCaseAdmin({gdb,persistGrades,showToast,roster={},currentGrade="2"}){const[subtab,setSubtab]=useState("upload");const[preview,setPreview]=useState(null);const[source,setSource]=useState(null);const[loading,setLoading]=useState(false);const[saving,setSaving]=useState(false);const readFile=async file=>{setLoading(true);try{const XLSX=await import("xlsx");const workbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});const sheetName=workbook.SheetNames.find(name=>String(name).trim()==="작업용")||workbook.SheetNames.find(name=>/작업|원본|data/i.test(name));if(!sheetName)throw new Error("'작업용' 원본 시트를 찾지 못했습니다.");const rows=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:null,raw:true});const meta={sourceId:`admission_${Date.now().toString(36)}`,label:"2024~2026 통합",periodLabel:"2024~2026 통합",fileName:file.name,importedAt:new Date().toISOString(),sheetName,hasYearColumn:false};const cases=parseAdmissionCaseRows(rows,meta);if(!cases.length)throw new Error("지원 사례를 인식하지 못했습니다.");setPreview(cases);setSource({...meta,rowCount:cases.length})}catch(error){showToast?.(`대입 사례 파일을 읽지 못했습니다. (${error?.message||error})`,"error")}finally{setLoading(false)}};const save=async()=>{if(!preview||!source)return;setSaving(true);const ok=await persistGrades({admissionCaseSources:[{...source,updatedAt:new Date().toISOString()}],admissionCases:preview});setSaving(false);if(ok){showToast?.(`${preview.length.toLocaleString()}건의 대입 지원 사례를 저장했습니다.`,"success");setPreview(null);setSource(null);setSubtab("analytics")}};const clear=async()=>{if(!window.confirm("저장된 대입 사례 데이터를 모두 삭제할까요?"))return;const ok=await persistGrades({admissionCaseSources:[],admissionCases:[]});if(ok)showToast?.("대입 사례 데이터를 삭제했습니다.","success")};const stored=gdb.admissionCases||[];const sources=gdb.admissionCaseSources||[];return <div className="admission-case-ui" style={{display:"grid",gap:14}}><style>{CSS}</style><div style={styles.adminTabs}>{[["upload","파일 업로드·반영"],["analytics","데이터 현황·사례 탐색"],["history","업로드 이력"]].map(([key,label])=><button key={key} onClick={()=>setSubtab(key)} style={{...styles.adminTab,...(subtab===key?styles.adminTabActive:{})}}>{label}</button>)}</div>{subtab==="upload"&&<div style={{display:"grid",gap:14}}><div style={styles.uploadBox}><FileSpreadsheet size={30}/><div><b>2024–2026 대입 통계 엑셀 업로드</b><span>XLSX·XLSM 파일의 숨김 ‘작업용’ 시트를 자동 인식합니다.</span></div><label style={styles.fileButton}>{loading?<Loader2 size={15} className="spin"/>:<Upload size={15}/>} {loading?"파일 분석 중":"엑셀 파일 선택"}<input hidden type="file" accept=".xlsx,.xlsm,.xls" disabled={loading} onChange={e=>e.target.files?.[0]&&readFile(e.target.files[0])}/></label></div>{preview&&<><div style={styles.previewHeader}><div><b>{source.fileName}</b><span>{source.sheetName} 시트 · {preview.length.toLocaleString()}건 인식</span></div><em>연도 열 없음 · 2024~2026 통합 저장</em></div><SummaryCards rows={preview}/><Section title="데이터 품질 검사" description="빈값을 임의로 합격·미등록으로 변환하지 않습니다."><QualityCards cases={preview}/></Section><div style={styles.actions}><button style={styles.primaryButton} disabled={saving} onClick={save}>{saving?<Loader2 size={15} className="spin"/>:<Save size={15}/>}최종 반영</button><button style={styles.secondaryButton} onClick={()=>{setPreview(null);setSource(null)}}>취소</button></div></>}{!preview&&stored.length>0&&<div style={styles.savedNotice}><CheckCircle2 size={18}/><div><b>현재 {stored.length.toLocaleString()}건이 저장되어 있습니다.</b><span>새 파일을 반영하면 기존 통합 자료를 교체합니다.</span></div><button style={styles.dangerButton} onClick={clear}><Trash2 size={13}/>전체 삭제</button></div>}</div>}{subtab==="analytics"&&<AdmissionCaseAnalytics gdb={gdb} roster={roster} currentGrade={currentGrade}/>} {subtab==="history"&&<Section title="업로드 이력">{sources.length?<Table><thead><tr><th>자료명</th><th>원본 파일</th><th>원본 시트</th><th>사례 수</th><th>업로드 시각</th></tr></thead><tbody>{sources.map(item=><tr key={item.sourceId}><td>{item.label}</td><td>{item.fileName}</td><td>{item.sheetName}</td><td>{Number(item.rowCount||0).toLocaleString()}</td><td>{item.importedAt?new Date(item.importedAt).toLocaleString("ko-KR"):"-"}</td></tr>)}</tbody></Table>:<Empty title="업로드 이력이 없습니다."/>}</Section>}</div>}

const styles={
page:{display:"grid",gap:18},
hero:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:18,padding:"22px 24px",borderRadius:18,color:"#fff",background:"linear-gradient(135deg,#405e87,#6079a5 48%,#796d9c)",boxShadow:"0 12px 28px rgba(53,72,103,.18)"},
heroMeta:{minWidth:126,padding:"14px 16px",borderRadius:14,background:"rgba(255,255,255,.14)",border:"1px solid rgba(255,255,255,.25)",textAlign:"center",display:"grid",gap:3},
studentConnector:{display:"grid",gridTemplateColumns:"minmax(220px,.55fr) minmax(0,1.45fr)",gap:14,padding:15,background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:15,alignItems:"stretch",minWidth:0,maxWidth:"100%",overflow:"hidden"},
studentSearchPanel:{position:"relative",display:"grid",gap:7,alignContent:"center",padding:"4px 2px"},
label:{fontSize:12,fontWeight:800,color:"#5f6874"},
input:{width:"100%",boxSizing:"border-box",border:"1px solid #d8dde5",borderRadius:10,padding:"10px 12px",fontSize:13,outline:"none",background:"#fff"},
searchResults:{position:"absolute",zIndex:20,top:43,left:0,right:0,background:"#fff",border:"1px solid #d9dfe7",borderRadius:10,boxShadow:"0 12px 28px rgba(45,55,72,.14)",overflow:"hidden"},
studentProfile:{display:"grid",gridTemplateColumns:"minmax(145px,.52fr) minmax(0,1.48fr)",alignItems:"center",gap:11,padding:"12px 13px",borderRadius:12,background:"linear-gradient(135deg,#f3f7fc,#faf8ff)",border:"1px solid #d9e2ef",minWidth:0,width:"100%",maxWidth:"100%",overflow:"hidden"},
studentProfileIdentity:{display:"grid",gap:6,minWidth:0},
studentProfileEyebrow:{fontSize:10.5,fontWeight:900,color:"#66758a",letterSpacing:".04em"},
studentProfileTitle:{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",fontSize:18,color:"#202a35"},
studentProfileBadges:{display:"flex",gap:6,flexWrap:"wrap"},
studentMetrics:{display:"grid",gap:7,minWidth:0},
studentPlaceholder:{display:"grid",placeItems:"center",border:"1px dashed #d8d1c3",borderRadius:11,color:COLORS.muted,fontSize:12.5},
tabs:{display:"flex",gap:7,flexWrap:"wrap",padding:7,background:"#f2f0eb",borderRadius:13},
tab:{border:0,background:"transparent",borderRadius:9,padding:"10px 14px",fontWeight:800,color:"#655f55",cursor:"pointer",fontSize:13},
tabActive:{background:"#fff",color:COLORS.blue,boxShadow:"0 2px 7px rgba(41,50,67,.12)"},
filters:{background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:15,padding:15},
filterHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:12},
filterGrid:{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10,alignItems:"end"},
filterSelect:{display:"grid",gridTemplateColumns:"70px minmax(0,1fr) 55px",gap:7,alignItems:"center",fontSize:11,fontWeight:800},
advancedButton:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,border:"1px solid #cfd7e2",borderRadius:10,background:"#fff",padding:"10px",fontWeight:800,cursor:"pointer",color:"#354052"},
gradeRange:{display:"flex",alignItems:"center",gap:7},
smallButton:{display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #d5dbe4",borderRadius:9,background:"#fff",padding:"8px 10px",fontWeight:800,cursor:"pointer",color:"#354052"},
filteredCount:{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#656e79"},
summary:{display:"grid",gridTemplateColumns:"repeat(6,minmax(0,1fr))",gap:10},
summaryCard:{display:"grid",gap:5,padding:"14px 15px",border:`1px solid ${COLORS.line}`,borderTop:"4px solid",borderRadius:12,background:"#fff",fontSize:13},
section:{background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:15,padding:17},
sectionTitle:{display:"flex",justifyContent:"space-between",marginBottom:15},
tableWrap:{width:"100%",overflowX:"auto",border:`1px solid ${COLORS.line}`,borderRadius:11},
empty:{minHeight:210,display:"grid",placeItems:"center",alignContent:"center",gap:8,padding:25,border:"1px dashed #d8d1c3",borderRadius:14,background:"#fbfaf7",color:COLORS.muted,textAlign:"center"},
notice:{display:"flex",gap:8,alignItems:"flex-start",padding:"12px 14px",borderRadius:10,background:"#fff8e8",border:"1px solid #efd89c",color:"#755b20",fontSize:12},
matchControls:{display:"flex",gap:14,flexWrap:"wrap",padding:"13px 15px",background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:12},
matchPanel:{display:"grid",gridTemplateColumns:"minmax(230px,.65fr) minmax(0,1.35fr)",gap:14,padding:15,background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:13},
studentComparisonHeader:{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:9,padding:12,borderRadius:13,background:"linear-gradient(135deg,#f4f7fb,#fbf9ff)",border:"1px solid #dce4ef",minWidth:0},
context:{padding:"12px 14px",borderRadius:11,background:"#f4f7fb",border:"1px solid #dce4ef",color:"#49566a",fontSize:12.5},
caseCards:{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:11},
caseCard:{border:`1px solid ${COLORS.line}`,borderRadius:12,padding:13,display:"grid",gap:11,background:"#fff",textAlign:"left"},
caseCardHead:{display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start"},
caseCounts:{display:"flex",gap:8,flexWrap:"wrap",fontSize:11},
caseCountRow:{display:"flex",gap:7,flexWrap:"wrap"},
caseFooter:{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:9,borderTop:"1px solid #ece8df",fontSize:12},
bandLegend:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12,padding:"9px 10px",borderRadius:10,background:"#fafbfc",border:"1px solid #e3e7ed"},
softBadge:{display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:999,padding:"4px 8px",fontSize:10.5,fontWeight:800,whiteSpace:"nowrap"},
backButton:{justifySelf:"start",display:"inline-flex",alignItems:"center",gap:6,border:"1px solid #d5dce6",borderRadius:9,background:"#fff",color:"#34445b",padding:"8px 11px",fontWeight:900,cursor:"pointer"},
universityDetailPage:{display:"grid",gap:14,padding:18,borderRadius:16,border:`1px solid ${COLORS.line}`,background:"#fff"},
detailHero:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap",paddingBottom:14,borderBottom:"1px solid #e8e4dc"},
detailEyebrow:{fontSize:10.5,fontWeight:900,color:"#65758a",letterSpacing:".05em"},
detailStudentCompare:{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,minWidth:0,width:"min(100%,430px)",maxWidth:"100%"},
detailMetricGrid:{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:8},
twoColumns:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:16},
barRow:{display:"grid",gridTemplateColumns:"100px minmax(100px,1fr) 40px 55px",alignItems:"center",gap:8},
barRowNew:{display:"grid",gridTemplateColumns:"95px minmax(120px,1fr) auto",alignItems:"center",gap:10},
dualBarWrap:{display:"grid",gap:5},
dualBarTrack:{height:8,borderRadius:999,background:"#ece9e2",overflow:"hidden"},
supportBar:{height:"100%",borderRadius:999,background:"linear-gradient(90deg,#4f79b2,#7897c2)"},
acceptBar:{height:"100%",borderRadius:999,background:"linear-gradient(90deg,#3d8656,#72a680)"},
barCounts:{display:"flex",gap:5,justifyContent:"flex-end",flexWrap:"wrap"},
barTrack:{height:9,borderRadius:999,background:"#ece9e2",overflow:"hidden"},
barFill:{height:"100%",borderRadius:999,background:"linear-gradient(90deg,#4e73a6,#8b79ad)"},
searchBox:{display:"flex",alignItems:"center",gap:10,border:"1px solid #cfd9e7",borderRadius:13,background:"#fff",padding:"10px 12px",boxShadow:"0 4px 14px rgba(48,65,88,.06)"},
universityGrid:{display:"grid",gridTemplateColumns:"1fr",gap:14},
universitySearchPanel:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap",padding:"14px 15px",border:"1px solid #dfe5ed",borderRadius:14,background:"linear-gradient(135deg,#f7faff,#fbf9ff)"},
universityList:{maxHeight:210,overflowY:"auto",display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8,alignContent:"start",paddingRight:3},
universityButton:{display:"grid",gap:7,textAlign:"left",padding:"10px 11px",border:`1px solid ${COLORS.line}`,background:"#fff",borderRadius:10,cursor:"pointer",minWidth:0},
universityButtonActive:{borderColor:COLORS.blue,background:"#edf3ff",boxShadow:"0 4px 12px rgba(49,90,155,.12)"},
universityDetail:{minWidth:0,background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:13,padding:16},
universityHead:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14,marginBottom:15,paddingBottom:14,borderBottom:"1px solid #ebe7de"},
universityMetrics:{display:"grid",gridTemplateColumns:"repeat(4,minmax(95px,1fr))",gap:8},
modePanel:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,padding:"14px 15px",border:"1px solid #dbe2ec",borderRadius:14,background:"linear-gradient(135deg,#f7f9fc,#ffffff)"},
modeTabs:{display:"flex",gap:8,flexWrap:"wrap"},
modeButton:{border:"1px solid #cfd7e2",background:"#fff",borderRadius:10,padding:"10px 17px",fontWeight:900,fontSize:13.5,cursor:"pointer",color:"#354052",letterSpacing:"-.01em"},
modeButtonActive:{background:"#233f68",borderColor:"#233f68",color:"#ffe06a",boxShadow:"0 4px 10px rgba(35,63,104,.20)"},
badge:{display:"inline-flex",alignItems:"center",justifyContent:"center",border:"1px solid",borderRadius:999,padding:"5px 9px",fontSize:11,fontWeight:800,whiteSpace:"nowrap"},
registrationBadge:{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:45,borderRadius:999,padding:"5px 8px",fontSize:11,fontWeight:800},
rateBadge:{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:52,padding:"4px 7px",borderRadius:999,background:"#f6f4ef",fontWeight:800},
pagination:{display:"flex",justifyContent:"center",alignItems:"center",gap:10,paddingTop:4},
pageButton:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,minWidth:84,padding:"9px 13px",border:"1px solid #ccd5e1",borderRadius:10,background:"#fff",color:"#33445b",fontWeight:900,cursor:"pointer",boxShadow:"0 2px 6px rgba(44,58,78,.06)"},
pageStatus:{display:"inline-flex",alignItems:"center",gap:7,minWidth:76,justifyContent:"center",padding:"8px 12px",borderRadius:10,background:"#eef3f9",color:"#5e6b7b",fontSize:12},
adminTabs:{display:"flex",gap:6,flexWrap:"wrap",padding:6,background:"#f2f0eb",borderRadius:12},
adminTab:{border:0,background:"transparent",padding:"9px 13px",borderRadius:8,fontWeight:800,cursor:"pointer"},
adminTabActive:{background:"#2f4630",color:"#fff"},
uploadBox:{minHeight:150,display:"flex",alignItems:"center",justifyContent:"center",gap:16,padding:20,border:"1px dashed #cfc7b8",borderRadius:14,background:"#fff"},
fileButton:{display:"inline-flex",alignItems:"center",gap:6,background:COLORS.blue,color:"#fff",borderRadius:9,padding:"10px 13px",fontWeight:800,cursor:"pointer"},
previewHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:"12px 14px",border:`1px solid ${COLORS.line}`,borderRadius:11,background:"#fff"},
qualityGrid:{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:8},
actions:{display:"flex",gap:8,justifyContent:"flex-end"},
primaryButton:{display:"inline-flex",alignItems:"center",gap:6,border:0,borderRadius:9,background:"#2f5b3a",color:"#fff",padding:"10px 14px",fontWeight:800,cursor:"pointer"},
secondaryButton:{border:"1px solid #d9d2c5",borderRadius:9,background:"#fff",padding:"10px 14px",fontWeight:800,cursor:"pointer"},
dangerButton:{display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #ebc5c0",background:"#fff4f2",color:COLORS.red,borderRadius:8,padding:"7px 9px",fontWeight:800,cursor:"pointer"},
savedNotice:{display:"flex",alignItems:"center",gap:10,padding:14,border:"1px solid #cce1d1",borderRadius:11,background:"#f1f8f2"}
};
