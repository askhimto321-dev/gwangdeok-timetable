// 2027 반편성 '분리희망학생' 입력 (2학년 학급담임 전용).
// 담임: 자기 반 학생마다 함께 반이 되면 안 되는 학생(최대 10명)·분리 등급(4단계)·사유를 적고 저장합니다.
// 다른 반 담임이 우리 반 학생을 적은 경우도 그 학생 화면에 보여 줍니다(양쪽 확인).
// 관리자·2학년부: 전체 현황(등급별·반별·분리 관계)을 한눈에 보고, 학교 양식 그대로 엑셀로 받습니다.
import React from "react";
import { Download, Plus, Save, Trash2, Users, X, Loader2, Search, ArrowLeftRight, ArrowRight, Printer } from "lucide-react";
import { readStorage, updateStorage } from "./storage.js";
import { schoolYearOf } from "./curriculum.js";
import { MAX_TARGETS, SEPARATION_LEVELS, LEVEL_INFO, REASON_PRESETS, CUSTOM_REASON, SHEET_TITLE, SEPARATION_COL_WIDTHS, levelRank, separationKey, normalizeTargets, searchStudents, separationRows, separationHeader, separationPairs, reverseTargets } from "./classSeparation.js";

const GRADE = "2";
const emptyData = () => ({ entries: {} });
const classOf = student => Number(student?.class) || 0;
const nameOf = (sid, roster) => roster?.[sid]?.name || "";
const label = (sid, roster) => `${sid} ${nameOf(sid, roster)}`.trim();
// 성별 표시: 남 파랑 · 여 분홍 작은 배지(명단에서 한눈에 구분)
const genderTone = g => (/^(남|m|male)/i.test(String(g || "")) ? "m" : /^(여|f|female)/i.test(String(g || "")) ? "f" : "");
const GenderTag = ({ g }) => (g ? <small className={`kcs-g ${genderTone(g)}`}>{String(g).slice(0, 1)}</small> : null);
const toneOf = level => LEVEL_INFO[level]?.tone || "low";
const newTarget = () => ({ sid: "", level: SEPARATION_LEVELS[0], reason: "" });

const CSS = `
.kcs{display:grid;gap:16px;color:var(--kdn-ink,#1f2937);line-height:1.55}
.kcs-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;padding:16px 18px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kcs-head .t{display:grid;gap:3px;flex:1 1 260px}.kcs-head .t b{font-size:19px;font-weight:800}.kcs-head .t small{font-size:13.5px;color:var(--kdn-muted,#64748b);line-height:1.5}
.kcs-head .acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.kcs-seg{display:inline-flex;padding:4px;border-radius:12px;background:var(--kdn-surface-2,#f1f5f9);border:1px solid var(--kdn-line,#e2e8f0)}
.kcs-seg button{min-height:38px;padding:0 16px;border:0;border-radius:9px;background:transparent;font:inherit;font-size:14.5px;font-weight:700;color:var(--kdn-muted,#64748b);cursor:pointer}
.kcs-seg button.is-on{background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);box-shadow:0 1px 4px rgba(15,23,42,.14)}
.kcs-btn{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:0 14px;border-radius:10px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.kcs-btn.pri{background:var(--kdn-accent,#2563eb);border-color:var(--kdn-accent,#2563eb);color:#fff}.kcs-btn:disabled{opacity:.5;cursor:default}.kcs-btn.pri:disabled{opacity:1;background:var(--kdn-surface-2,#eef2f7);border-color:var(--kdn-line,#d5dbe3);color:var(--kdn-muted,#94a3b8)}.kcs-btn.ghost{background:transparent}.kcs-btn.sm{min-height:32px;padding:0 10px;font-size:13px}
.kcs-classbar{display:grid;gap:8px;padding:12px 14px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kcs-classbar>small{font-size:12.5px;font-weight:700;color:var(--kdn-muted,#64748b)}
.kcs-classes{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:10px}
.kcs-classes button{display:grid;gap:7px;min-height:76px;padding:11px 13px;border-radius:14px;border:1.5px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);font:inherit;color:var(--kdn-ink,#1f2937);cursor:pointer;text-align:left}
.kcs-classes button:hover{border-color:color-mix(in srgb,var(--kdn-accent,#2563eb) 45%,var(--kdn-line,#d5dbe3))}
.kcs-classes .top{display:flex;align-items:center;justify-content:space-between;gap:6px}
.kcs-classes .top b{font-size:17px;font-weight:800;line-height:1.1}
.kcs-classes .rel{padding:1px 8px;border-radius:999px;font-size:12px;font-weight:800;font-style:normal;background:color-mix(in srgb,#dc2626 13%,transparent);color:#b91c1c;white-space:nowrap}
[data-kd-ui="dark"] .kcs-classes .rel{color:#fca5a5}
.kcs-classes .prog{display:block;height:6px;border-radius:99px;background:var(--kdn-surface-2,#eef2f7);overflow:hidden}.kcs-classes .prog i{display:block;height:100%;border-radius:99px;background:#16a34a}
.kcs-classes .sub{font-size:12.5px;font-weight:600;color:var(--kdn-muted,#64748b);line-height:1.2}
.kcs-classes button.is-on{border-color:var(--kdn-accent,#2563eb);background:color-mix(in srgb,var(--kdn-accent,#2563eb) 9%,var(--kdn-surface,#fff));box-shadow:0 0 0 3px color-mix(in srgb,var(--kdn-accent,#2563eb) 15%,transparent)}
.kcs-classes button.is-on .top b{color:var(--kdn-accent,#1d4ed8)}
.kcs-split{display:grid;grid-template-columns:minmax(230px,300px) minmax(0,1fr);gap:14px;align-items:start}
.kcs-list{display:grid;gap:2px;max-height:680px;overflow:auto;padding:8px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kcs-list-find{position:sticky;top:-8px;z-index:2;margin:-8px -8px 4px;padding:8px;background:var(--kdn-surface,#fff);border-bottom:1px solid var(--kdn-line,#e2e8f0)}
.kcs-list-find input{width:100%;min-height:36px;padding:0 10px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface-2,#f8fafc);color:var(--kdn-ink,#1f2937);font:inherit;font-size:14px;box-sizing:border-box}
.kcs-list button{display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:48px;padding:0 10px;border-radius:10px;border:1.5px solid transparent;background:transparent;font:inherit;font-size:14.5px;color:var(--kdn-ink,#1f2937);text-align:left;cursor:pointer}
.kcs-list button:hover{background:var(--kdn-surface-2,#f1f5f9)}.kcs-list button.is-on{border-color:var(--kdn-accent,#2563eb);background:color-mix(in srgb,var(--kdn-accent,#2563eb) 10%,transparent)}
.kcs-list .no{font-size:13px;color:var(--kdn-muted,#64748b);font-variant-numeric:tabular-nums;text-align:center}.kcs-list .nm{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kcs-list .nm small{font-weight:600;color:var(--kdn-muted,#64748b);margin-left:5px}
.kcs-marks{display:flex;gap:4px;align-items:center}
.kcs-g{display:inline-grid!important;place-items:center;width:20px;height:20px;margin-left:6px!important;border-radius:6px;font-size:11.5px!important;font-weight:800!important;vertical-align:1px;background:var(--kdn-surface-2,#eef2f7);color:var(--kdn-muted,#64748b)!important}
.kcs-g.m{background:color-mix(in srgb,#2563eb 14%,transparent);color:#1d4ed8!important}.kcs-g.f{background:color-mix(in srgb,#db2777 14%,transparent);color:#be185d!important}
[data-kd-ui="dark"] .kcs-g.m{color:#93c5fd!important}[data-kd-ui="dark"] .kcs-g.f{color:#f9a8d4!important}
.kcs-pane-hd .meta em.g-m{background:color-mix(in srgb,#2563eb 14%,transparent);color:#1d4ed8}.kcs-pane-hd .meta em.g-f{background:color-mix(in srgb,#db2777 14%,transparent);color:#be185d}
[data-kd-ui="dark"] .kcs-pane-hd .meta em.g-m{color:#93c5fd}[data-kd-ui="dark"] .kcs-pane-hd .meta em.g-f{color:#f9a8d4}
.kcs-badge{display:inline-flex;align-items:center;justify-content:center;gap:2px;min-width:24px;height:23px;padding:0 8px;white-space:nowrap;border-radius:999px;font-size:12px;font-weight:800}
.kcs-badge.rev{background:transparent;border:1.5px dashed currentColor}
.t-must{background:color-mix(in srgb,#dc2626 16%,transparent);color:#b91c1c}.t-high{background:color-mix(in srgb,#ea580c 16%,transparent);color:#c2410c}
.t-mid{background:color-mix(in srgb,#ca8a04 18%,transparent);color:#a16207}.t-low{background:color-mix(in srgb,#64748b 16%,transparent);color:#475569}
[data-kd-ui="dark"] .t-must{color:#fca5a5}[data-kd-ui="dark"] .t-high{color:#fdba74}[data-kd-ui="dark"] .t-mid{color:#fde047}[data-kd-ui="dark"] .t-low{color:#cbd5e1}
.kcs-pane{display:grid;gap:18px;padding:20px 22px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kcs-pane-hd{display:grid;gap:8px}.kcs-pane-hd>b{font-size:22px;font-weight:800;line-height:1.2}
.kcs-pane-hd .meta{display:flex;flex-wrap:wrap;gap:6px}.kcs-pane-hd .meta em{font-style:normal;padding:3px 10px;border-radius:999px;background:var(--kdn-surface-2,#f1f5f9);font-size:13px;font-weight:700;color:var(--kdn-ink-soft,#334155)}.kcs-pane-hd .meta em.soft{font-weight:600;color:var(--kdn-muted,#64748b)}
.kcs-tabs{display:flex;gap:4px;border-bottom:1.5px solid var(--kdn-line,#e2e8f0)}
.kcs-tabs button{position:relative;flex:1 1 0;display:flex;align-items:center;justify-content:center;gap:10px;min-height:50px;padding:10px 14px;margin-bottom:-1.5px;border:0;border-bottom:3px solid transparent;border-radius:10px 10px 0 0;background:transparent;font:inherit;color:var(--kdn-muted,#64748b);cursor:pointer}
.kcs-tabs button:hover{background:var(--kdn-surface-2,#f8fafc)}
.kcs-tabs button b{font-size:15px;font-weight:800}
.kcs-tabs button span{min-width:28px;padding:1px 9px;border-radius:999px;background:var(--kdn-surface-2,#eef2f7);font-size:13.5px;font-weight:800;color:var(--kdn-ink-soft,#334155);text-align:center}
.kcs-tabs button.is-on{color:var(--kdn-ink,#111827);border-bottom-color:var(--kdn-accent,#2563eb)}
.kcs-tabs button.is-on span{background:var(--kdn-accent,#2563eb);color:#fff}
.kcs-tabs button.has span{background:#f59e0b;color:#fff}
.kcs-tabs .dot{position:absolute;top:8px;right:10px;width:9px;height:9px;border-radius:99px;background:#ef4444}
.kcs-recv{display:grid;gap:12px}.kcs-recv .kcs-note b{color:var(--kdn-ink,#111827)}
.kcs-recv-card{display:grid;grid-template-columns:minmax(150px,1fr) minmax(200px,2fr) auto;gap:10px 18px;align-items:center;padding:16px 18px;border-radius:14px;border:1px solid var(--kdn-line,#e2e8f0);border-left:5px solid var(--c,#94a3b8);background:var(--kdn-surface,#fff)}
.kcs-recv-card.tone-must{--c:#dc2626}.kcs-recv-card.tone-high{--c:#ea580c}.kcs-recv-card.tone-mid{--c:#ca8a04}.kcs-recv-card.tone-low{--c:#94a3b8}
.kcs-recv-card .who{display:grid;gap:2px}.kcs-recv-card .who b{font-size:16px;font-weight:800}.kcs-recv-card .who small{font-size:13px;color:var(--kdn-muted,#64748b)}
.kcs-recv-card .what{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;font-size:14.5px}
.kcs-recv-card .by{display:grid;gap:6px;justify-items:end;text-align:right}.kcs-recv-card .by small{font-size:12.5px;color:var(--kdn-muted,#64748b)}.kcs-recv-card .ok{font-size:13px;font-weight:700;color:#15803d}
.kcs-scale{display:grid;gap:8px;padding:12px 14px;border-radius:14px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface-2,#f8fafc)}
.kcs-scale-hd{display:flex;align-items:center;gap:8px}.kcs-scale-hd b{font-size:13.5px;font-weight:800}.kcs-scale-hd small{font-size:12px;color:var(--kdn-muted,#64748b)}.kcs-scale-hd .sp{flex:1}
.kcs-scale-hd button{min-height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);font:inherit;font-size:12.5px;font-weight:700;color:var(--kdn-ink-soft,#334155);cursor:pointer}
.kcs-scale ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0}
.kcs-scale li{display:grid;gap:3px;align-content:start;padding:9px 12px 2px;border-top:4px solid var(--c);position:relative}
.kcs-scale li+li{border-left:1px solid var(--kdn-line,#e2e8f0)}
.kcs-scale li:first-child{border-top-left-radius:4px}.kcs-scale li:last-child{border-top-right-radius:4px}
.kcs-scale li b{display:flex;align-items:center;gap:6px;font-size:13.5px;font-weight:800;color:var(--kdn-ink,#111827)}.kcs-scale li b i{width:9px;height:9px;border-radius:99px;background:var(--c)}
.kcs-scale li span{font-size:12.5px;color:var(--kdn-ink-soft,#334155)}.kcs-scale li small{font-size:12px;line-height:1.45;color:var(--kdn-muted,#64748b)}
.kcs-sec{display:grid;gap:8px}.kcs-sec>h4{margin:0;display:flex;align-items:center;gap:6px;font-size:14.5px;font-weight:800}.kcs-sec>h4 small{font-weight:600;color:var(--kdn-muted,#64748b)}
.kcs-rows{display:grid;gap:12px}
.kcs-row{display:grid;grid-template-columns:26px minmax(210px,1fr) auto;grid-template-areas:"i pick lv" "i rs del";gap:10px 12px;align-items:center;padding:14px 16px;border-radius:14px;background:var(--kdn-surface-2,#f8fafc);border:1px solid var(--kdn-line,#e2e8f0)}
.kcs-row .i{grid-area:i;align-self:start;margin-top:10px;font-size:13px;font-weight:800;color:var(--kdn-muted,#64748b);text-align:center}
.kcs-row .pick{grid-area:pick}.kcs-row .kcs-level{grid-area:lv}.kcs-row .rs{grid-area:rs;display:flex;flex-wrap:wrap;gap:8px}.kcs-row .kcs-del{grid-area:del;justify-self:end}
.kcs-pick{position:relative}.kcs-pick input,.kcs-row input.reason,.kcs-row select{min-height:38px;padding:0 10px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);font:inherit;font-size:14px;box-sizing:border-box}
.kcs-pick input{width:100%}.kcs-row select{flex:0 1 220px;min-width:170px}.kcs-row input.reason{flex:1 1 200px}
.kcs-chosen{display:flex;align-items:center;gap:6px;min-height:38px;padding:0 6px 0 10px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);font-size:14.5px;font-weight:700}
.kcs-chosen small{font-weight:600;color:var(--kdn-muted,#64748b)}.kcs-chosen button{margin-left:auto;display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:var(--kdn-muted,#64748b);cursor:pointer}
.kcs-results{position:absolute;z-index:20;top:calc(100% + 4px);left:0;right:0;display:grid;padding:4px;border-radius:10px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);box-shadow:0 10px 26px rgba(15,23,42,.16)}
.kcs-results button{display:flex;gap:8px;align-items:center;min-height:36px;padding:0 10px;border:0;border-radius:8px;background:transparent;font:inherit;font-size:14px;color:var(--kdn-ink,#1f2937);text-align:left;cursor:pointer}.kcs-results button:hover{background:var(--kdn-surface-2,#f1f5f9)}.kcs-results small{color:var(--kdn-muted,#64748b)}
.kcs-level{display:flex;flex-wrap:wrap;gap:4px}.kcs-level button{min-height:36px;padding:0 10px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);font:inherit;font-size:13px;font-weight:700;color:var(--kdn-ink-soft,#334155);cursor:pointer;white-space:nowrap}
.kcs-level button.is-on.must{background:#dc2626;border-color:#dc2626;color:#fff}.kcs-level button.is-on.high{background:#ea580c;border-color:#ea580c;color:#fff}.kcs-level button.is-on.mid{background:#ca8a04;border-color:#ca8a04;color:#fff}.kcs-level button.is-on.low{background:#64748b;border-color:#64748b;color:#fff}
.kcs-del{display:grid;place-items:center;width:36px;height:36px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:#b91c1c;cursor:pointer}
.kcs-rev-old{display:grid;grid-template-columns:minmax(150px,1fr) auto minmax(120px,1.4fr) auto;gap:8px 12px;align-items:center;padding:10px 12px;border-radius:12px;border:1.5px dashed var(--kdn-line,#cbd5e1);font-size:14px}
.kcs-rev b{font-weight:800}.kcs-rev small{color:var(--kdn-muted,#64748b)}
.kcs-foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.kcs-foot .sp{flex:1}
.kcs-note{margin:0;font-size:13px;line-height:1.55;color:var(--kdn-muted,#64748b)}
.kcs-guide{display:grid;gap:14px;justify-items:center;padding:22px 8px;text-align:center}.kcs-guide>b{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:800}.kcs-guide>small{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;font-size:12.5px;color:var(--kdn-muted,#64748b)}.kcs-guide .kcs-scale{width:100%;text-align:left}
.kcs-guide>ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;justify-content:center;gap:8px}.kcs-guide>ol>li{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:var(--kdn-surface-2,#f1f5f9);font-size:13.5px;font-weight:700}.kcs-guide>ol>li>i{display:grid;place-items:center;width:20px;height:20px;border-radius:99px;background:var(--kdn-accent,#2563eb);color:#fff;font-style:normal;font-size:12px}
.kcs-empty{padding:28px;text-align:center;color:var(--kdn-muted,#64748b);font-size:14px}
.kcs-kpis{display:grid;grid-template-columns:minmax(200px,1.25fr) repeat(4,minmax(150px,1fr));gap:12px}
.kcs-kpi{position:relative;display:grid;align-content:start;gap:6px;padding:16px 18px 14px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff);text-align:left;font:inherit;color:inherit;cursor:pointer;overflow:hidden;transition:box-shadow .15s,transform .15s}
.kcs-kpi:hover{box-shadow:0 6px 18px rgba(15,23,42,.08);transform:translateY(-1px)}
.kcs-kpi::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--c,transparent)}
.kcs-kpi small{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:800;color:var(--kdn-ink,#111827)}
.kcs-kpi small i{width:10px;height:10px;border-radius:99px;background:var(--c)}
.kcs-kpi b{display:flex;align-items:baseline;gap:3px;font-size:32px;font-weight:850;line-height:1;margin:2px 0;color:var(--kdn-ink,#111827);font-variant-numeric:tabular-nums}
.kcs-kpi b span{font-size:14px;font-weight:700;color:var(--kdn-muted,#64748b)}
.kcs-kpi b .pct{margin-left:auto;font-style:normal;font-size:13px;font-weight:800;color:var(--c,var(--kdn-muted,#64748b))}
.kcs-kpi>em{font-style:normal;font-size:12.5px;line-height:1.4;color:var(--kdn-muted,#64748b)}
.kcs-kpi-meter{display:block;height:6px;border-radius:99px;background:var(--kdn-surface-2,#eef2f7);overflow:hidden}.kcs-kpi-meter i{display:block;height:100%;border-radius:99px;background:var(--c)}
.kcs-kpi-mix{display:flex;gap:2px;height:6px;border-radius:99px;overflow:hidden;background:color-mix(in srgb,#fff 18%,transparent)}.kcs-kpi-mix i{display:block;height:100%}
.kcs-kpi.is-total{background:linear-gradient(135deg,#1f2937,#334155);border-color:transparent;color:#fff}
.kcs-kpi.is-total small,.kcs-kpi.is-total b{color:#fff}.kcs-kpi.is-total b span,.kcs-kpi.is-total>em{color:rgba(255,255,255,.75)}
[data-kd-ui="dark"] .kcs-kpi.is-total{background:linear-gradient(135deg,#334155,#475569)}
.kcs-kpi.is-zero{opacity:.62}
.kcs-kpi.is-on{border-color:var(--c,var(--kdn-accent,#2563eb));box-shadow:0 0 0 2.5px color-mix(in srgb,var(--c,var(--kdn-accent,#2563eb)) 45%,transparent)}
.kcs-kpi.is-total.is-on{box-shadow:0 0 0 2.5px color-mix(in srgb,#64748b 45%,transparent)}
@media (max-width:1100px){.kcs-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.kcs-kpi.is-total{grid-column:1/-1}}
.kcs-grid2{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(0,2fr);gap:14px;align-items:start}
.kcs-card{display:grid;gap:12px;padding:18px 20px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff);min-width:0}
.kcs-card>h4{margin:0;display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:15px;font-weight:800}.kcs-card>h4 small{font-weight:600;color:var(--kdn-muted,#64748b)}.kcs-card>h4 .sp{flex:1}.kcs-card>h4 .cnt{padding:1px 10px;border-radius:999px;background:var(--kdn-surface-2,#f1f5f9);font-size:13px}
.kcs-filter{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.kcs-filter input,.kcs-filter select{min-height:34px;padding:0 10px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);font:inherit;font-size:13.5px}
.kcs-table-wrap{overflow:auto;max-height:620px;border-radius:12px;border:1px solid var(--kdn-line,#e2e8f0)}
.kcs-table{width:100%;min-width:640px;border-collapse:collapse;font-size:13.5px}.kcs-table.narrow{min-width:0}.kcs-table th{position:sticky;top:0;z-index:1;background:var(--kdn-surface-2,#f1f5f9);padding:9px 10px;font-weight:800;color:var(--kdn-muted,#475569);text-align:center;white-space:nowrap}
.kcs-table td{padding:12px 12px;border-top:1px solid var(--kdn-line,#e2e8f0);vertical-align:middle}.kcs-table td.c{text-align:center;white-space:nowrap}.kcs-table td small{color:var(--kdn-muted,#64748b)}
.kcs-table tr.click{cursor:pointer}.kcs-table tr.click:hover td{background:var(--kdn-surface-2,#f8fafc)}.kcs-table tr.is-on td{background:color-mix(in srgb,var(--kdn-accent,#2563eb) 10%,transparent)}
.kcs-pill{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:800;white-space:nowrap}
.kcs-who{display:inline-grid;gap:1px;border:0;background:none;font:inherit;color:inherit;cursor:pointer;text-align:center}.kcs-who b{font-weight:800}.kcs-who small{font-size:12px;color:var(--kdn-muted,#64748b)}
.kcs-modal-bg{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.45)}
.kcs-modal{width:min(520px,100%);display:grid;gap:14px;padding:20px 22px;border-radius:18px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);box-shadow:0 24px 60px rgba(15,23,42,.3)}
.kcs-modal-hd{display:flex;gap:10px;align-items:flex-start}.kcs-modal-hd>div{display:grid;gap:3px;flex:1}.kcs-modal-hd b{font-size:17px;font-weight:800}.kcs-modal-hd small{font-size:13px;color:var(--kdn-muted,#64748b);line-height:1.5}
.kcs-modal-hd button{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:transparent;color:inherit;cursor:pointer}
.kcs-modal-row{display:flex;align-items:center;justify-content:space-between}.kcs-modal-row b{font-size:14px;font-weight:800}
.kcs-link{border:0;background:none;font:inherit;font-size:13px;font-weight:700;color:var(--kdn-accent,#2563eb);cursor:pointer}
.kcs-modal-classes{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:8px}
.kcs-modal-classes label{display:flex;align-items:center;gap:6px;min-height:40px;padding:0 10px;border-radius:10px;border:1.5px solid var(--kdn-line,#d5dbe3);font-size:14px;font-weight:700;cursor:pointer}
.kcs-modal-classes label.is-on{border-color:var(--kdn-accent,#2563eb);background:color-mix(in srgb,var(--kdn-accent,#2563eb) 9%,transparent)}
.kcs-modal-check{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:var(--kdn-surface-2,#f8fafc);cursor:pointer}.kcs-modal-check span{display:grid;gap:2px}.kcs-modal-check b{font-size:14px}.kcs-modal-check small{font-size:12.5px;color:var(--kdn-muted,#64748b)}
.kcs-modal-ft{display:flex;justify-content:flex-end;gap:8px}
.kcs-bar{display:flex;height:8px;border-radius:99px;overflow:hidden;background:var(--kdn-surface-2,#eef2f7)}.kcs-bar i{display:block;height:100%}
.kcs-back{display:none}
@media (max-width:640px){.kcs-list{max-height:none!important}.kcs-split:not(.has-sel) .kcs-pane,.kcs-split.has-sel .kcs-list{display:none}.kcs-back{display:inline-flex;align-items:center;min-height:40px;margin:0 0 6px;padding:0 4px;border:0;background:transparent;font:inherit;font-size:14px;font-weight:800;color:var(--kdn-accent-text,#c2410c);cursor:pointer}.kcs-list>button{min-height:52px}}
@media (max-width:900px){.kcs-split,.kcs-grid2{grid-template-columns:minmax(0,1fr)}.kcs-list{max-height:280px}.kcs-scale ol{grid-template-columns:repeat(2,minmax(0,1fr))}.kcs-scale-hd small{display:none}.kcs-scale li:nth-child(3){border-left:0}
  .kcs-row{grid-template-columns:24px minmax(0,1fr) 38px;grid-template-areas:"i pick del" "i lv lv" "i rs rs"}.kcs-recv-card{grid-template-columns:minmax(0,1fr)}.kcs-recv-card .by{justify-items:start;text-align:left}.kcs-tabs button{min-height:54px;padding:8px 8px;flex-direction:column;gap:4px}.kcs-tabs button b{font-size:13.5px}.kcs-classes{grid-template-columns:repeat(auto-fill,minmax(100px,1fr))}}
`;
const BAR_COLORS = { must: "#dc2626", high: "#ea580c", mid: "#ca8a04", low: "#94a3b8" };

function TargetPicker({ value, roster, exclude, onChange }) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const results = searchStudents(roster, query, { exclude });
  if (value) {
    const s = roster?.[value];
    return <div className="kcs-chosen pick"><span>{value} {s?.name || "(명단에 없음)"}</span>{s && <small>{classOf(s)}반</small>}{s && <GenderTag g={s.gender} />}<button type="button" data-kdn-bare aria-label="학생 다시 고르기" onClick={() => onChange("")}><X size={15} /></button></div>;
  }
  return <div className="kcs-pick pick">
    <input value={query} placeholder="분리할 학생: 학번 또는 이름" aria-label="분리희망학생 찾기" onChange={event => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
    {open && results.length > 0 && <div className="kcs-results">{results.map(item => <button key={item.sid} type="button" data-kdn-bare onMouseDown={event => event.preventDefault()} onClick={() => { onChange(item.sid); setQuery(""); setOpen(false); }}><b>{item.sid}</b>{item.name}<GenderTag g={item.gender} /><small>{item.class}반</small></button>)}</div>}
  </div>;
}

// 사유: 자주 쓰는 사유를 고르고, '직접 입력'을 고르면 글로 적습니다.
function ReasonPicker({ value, disabled, onChange }) {
  const isPreset = REASON_PRESETS.includes(value);
  const [custom, setCustom] = React.useState(!!value && !isPreset);
  const showInput = custom || (!!value && !isPreset);
  return <>
    <select aria-label="사유 고르기" disabled={disabled} value={showInput ? CUSTOM_REASON : (isPreset ? value : "")} onChange={event => { const next = event.target.value; if (next === CUSTOM_REASON) { setCustom(true); if (isPreset) onChange(""); } else { setCustom(false); onChange(next); } }}>
      <option value="">사유 고르기</option>
      {REASON_PRESETS.map(item => <option key={item} value={item}>{item}</option>)}
      <option value={CUSTOM_REASON}>직접 입력…</option>
    </select>
    {showInput && <input className="reason" value={isPreset ? "" : value} disabled={disabled} placeholder="사유를 직접 적어 주세요" aria-label="사유 직접 입력" maxLength={200} onChange={event => onChange(event.target.value)} />}
  </>;
}

// 분리 등급 기준: 강한 등급부터 색 띠로 이어 보여 주고, 예시는 필요할 때 펼칩니다(이 브라우저에 기억).
function LevelScale() {
  const [open, setOpen] = React.useState(() => { try { return localStorage.getItem("kd_sep_scale_open") === "1"; } catch { return false; } });
  const toggle = () => setOpen(value => { try { localStorage.setItem("kd_sep_scale_open", value ? "0" : "1"); } catch { /* ignore */ } return !value; });
  return <div className="kcs-scale" aria-label="분리 등급 기준">
    <div className="kcs-scale-hd"><b>분리 등급 기준</b><small>왼쪽일수록 강하게 분리</small><span className="sp" /><button type="button" data-kdn-bare onClick={toggle} aria-expanded={open}>{open ? "예시 접기" : "등급별 예시 보기"}</button></div>
    <ol>{SEPARATION_LEVELS.map(level => <li key={level} style={{ "--c": BAR_COLORS[toneOf(level)] }}><b><i />{level}</b><span>{LEVEL_INFO[level].hint}</span>{open && <small>예: {LEVEL_INFO[level].example}</small>}</li>)}</ol>
  </div>;
}

// ---- 인쇄·PDF: 고른 반마다 한 쪽씩(분리 관계 표), 맨 앞에 전체 요약 ----
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const PRINT_CSS = `@page{size:A4 portrait;margin:12mm 11mm}
*{box-sizing:border-box}body{margin:0;font-family:Pretendard,"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#1f2430;font-size:10pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
section{break-after:page;page-break-after:always}section:last-child{break-after:auto;page-break-after:auto}
header{display:flex;align-items:flex-end;justify-content:space-between;gap:6mm;padding-bottom:2.5mm;margin-bottom:4mm;border-bottom:.6mm solid #1f2430}
header small{display:block;font-size:8.5pt;font-weight:700;color:#6b7280}header h1{margin:.6mm 0 0;font-size:17pt;font-weight:900}header p{margin:0;font-size:8.5pt;color:#6b7280;text-align:right}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:2.5mm;margin-bottom:5mm}
.kpi{padding:3mm 3.5mm;border:.3mm solid #e3e6ec;border-left:1.4mm solid var(--c,#1f2430);border-radius:2mm}.kpi small{display:block;font-size:8.5pt;font-weight:800}.kpi b{font-size:18pt;font-weight:900}.kpi b span{font-size:9pt;color:#6b7280;margin-left:.6mm}
h2{margin:0 0 2mm;font-size:12pt;font-weight:900}
table{width:100%;border-collapse:collapse;font-size:9.5pt}th{padding:1.8mm 2mm;background:#f3f4f6;border-bottom:.4mm solid #cbd2db;font-size:8.5pt;color:#4b5563;text-align:center}
td{padding:2mm;border-bottom:.25mm solid #e3e6ec;vertical-align:middle}td.c{text-align:center;white-space:nowrap}tr{break-inside:avoid}
td .nm{font-weight:800}td .sid{display:block;font-size:8pt;color:#6b7280}td .mine{color:#c2410c}
.pill{display:inline-block;padding:.5mm 2.4mm;border-radius:99px;font-size:8.5pt;font-weight:900;color:#fff;background:var(--c)}
.bar{display:flex;height:3mm;border-radius:99px;overflow:hidden;background:#eef0f4}.bar i{display:block;height:100%}
.empty{padding:10mm;text-align:center;color:#6b7280;border:.3mm dashed #cbd2db;border-radius:2mm}
.note{margin:3mm 0 0;font-size:8pt;color:#6b7280;line-height:1.5}`;

function SeparationPrintDialog({ classes, defaultClasses, canOverview, onClose, onPrint }) {
  const [picked, setPicked] = React.useState(() => new Set(defaultClasses));
  const [overview, setOverview] = React.useState(canOverview);
  const toggle = c => setPicked(current => { const next = new Set(current); if (next.has(c)) next.delete(c); else next.add(c); return next; });
  const all = picked.size === classes.length;
  return <div className="kcs-modal-bg" role="dialog" aria-modal="true" aria-label="분리희망 현황 인쇄" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="kcs-modal">
      <div className="kcs-modal-hd"><div><b>분리희망 현황 인쇄·PDF</b><small>고른 반마다 한 쪽씩, 그 반 학생이 들어간 분리 관계를 표로 인쇄합니다.</small></div><button type="button" data-kdn-bare aria-label="닫기" onClick={onClose}><X size={16} /></button></div>
      {classes.length > 1 && <div className="kcs-modal-row"><b>반 고르기</b><button type="button" data-kdn-bare className="kcs-link" onClick={() => setPicked(all ? new Set() : new Set(classes))}>{all ? "모두 해제" : "전체 선택"}</button></div>}
      <div className="kcs-modal-classes">{classes.map(c => <label key={c} className={picked.has(c) ? "is-on" : ""}><input type="checkbox" checked={picked.has(c)} onChange={() => toggle(c)} />{c}반</label>)}</div>
      {canOverview && <label className="kcs-modal-check"><input type="checkbox" checked={overview} onChange={event => setOverview(event.target.checked)} /><span><b>맨 앞에 전체 요약</b><small>등급별 건수와 반별 입력 현황 표</small></span></label>}
      <div className="kcs-modal-ft"><button type="button" className="kcs-btn ghost" onClick={onClose}>취소</button><button type="button" className="kcs-btn pri" disabled={!picked.size && !overview} onClick={() => onPrint(classes.filter(c => picked.has(c)), overview)}><Printer size={15} />인쇄·PDF 저장</button></div>
    </div>
  </div>;
}

const LevelPill = ({ level }) => <span className={`kcs-pill t-${toneOf(level)}`}>{level}</span>;

export default function ClassSeparationTool({ roster = {}, homeroomClass = "", canViewAll = false, canEditAll = false, actor = null, showToast }) {
  const year = schoolYearOf();
  const ownClass = Number(homeroomClass) || 0;
  const classes = React.useMemo(() => Array.from(new Set(Object.values(roster || {}).map(classOf).filter(Boolean))).sort((a, b) => a - b), [roster]);
  // 반 탭은 담임이면 자기 반만, 자료는 양쪽 확인을 위해 모든 반을 불러옵니다.
  const tabs = canViewAll ? classes : classes.filter(c => c === ownClass);
  const [viewClass, setViewClass] = React.useState(() => ownClass || tabs[0] || 0);
  const [data, setData] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [mode, setMode] = React.useState("edit");
  const [sid, setSid] = React.useState("");
  const [draft, setDraft] = React.useState([]);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [findText, setFindText] = React.useState("");
  const [levelFilter, setLevelFilter] = React.useState("");
  const [classFilter, setClassFilter] = React.useState("");
  const [pairQuery, setPairQuery] = React.useState("");
  const [paneTab, setPaneTab] = React.useState("mine");
  const [printOpen, setPrintOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const pairs = await Promise.all(classes.map(async c => [c, await readStorage(separationKey(year, GRADE, c), emptyData())]));
    setData(Object.fromEntries(pairs.map(([c, value]) => [c, value && typeof value === "object" ? value : emptyData()])));
    setLoading(false);
  }, [classes.join(","), year]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { if (!viewClass && tabs[0]) setViewClass(tabs[0]); }, [tabs.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const editableClass = c => !!c && (canEditAll || c === ownClass);
  const canEdit = editableClass(viewClass);
  const students = Object.entries(roster || {}).filter(([, s]) => classOf(s) === viewClass).sort((a, b) => (Number(a[1]?.number) || 0) - (Number(b[1]?.number) || 0) || a[0].localeCompare(b[0]));
  const find = findText.trim();
  const shownStudents = find ? students.filter(([id, s]) => id.includes(find) || String(s?.name || "").includes(find)) : students;
  const entries = data[viewClass]?.entries || {};
  const ownTargets = id => normalizeTargets(entries[id]?.targets, id);
  const strongest = list => list.reduce((best, item) => (levelRank(item.level) < levelRank(best) ? item.level : best), SEPARATION_LEVELS[SEPARATION_LEVELS.length - 1]);
  const reverseMap = React.useMemo(() => {
    const map = {};
    Object.values(data).forEach(classData => Object.entries(classData?.entries || {}).forEach(([other, entry]) => normalizeTargets(entry?.targets, other).forEach(t => { (map[t.sid] = map[t.sid] || []).push({ sid: other, level: t.level }); })));
    return map;
  }, [data]);
  const pairs = React.useMemo(() => separationPairs(data), [data]);

  const loadDraft = (c, id) => {
    const saved = normalizeTargets(data[c]?.entries?.[id]?.targets, id);
    // 다른 학생 쪽에서만 등록돼 있으면 '이 학생을 지목한 학생' 탭부터 보여 줍니다.
    const received = reverseTargets(data, id).filter(r => !saved.some(t => t.sid === r.sid));
    setPaneTab(received.length && !saved.length ? "recv" : "mine");
    setDraft(saved.length ? saved : (editableClass(c) ? [newTarget()] : []));
    setDirty(false);
  };
  const confirmLeave = () => !dirty || window.confirm("저장하지 않은 내용이 있습니다. 버리고 이동할까요?");
  const pick = id => { if (!confirmLeave()) return; setSid(id); loadDraft(viewClass, id); };
  const changeClass = c => { if (!confirmLeave()) return; setViewClass(c); setSid(""); setDraft([]); setDirty(false); setFindText(""); };
  const openStudent = id => {
    const c = classOf(roster?.[id]);
    if (!tabs.includes(c) || !confirmLeave()) return;
    setViewClass(c); setFindText(""); setMode("edit"); setSid(id); loadDraft(c, id);
  };
  const edit = (index, patch) => { setDraft(list => list.map((item, i) => (i === index ? { ...item, ...patch } : item))); setDirty(true); };
  const reverse = sid ? reverseTargets(data, sid) : [];
  const draftIds = new Set(draft.map(t => t.sid).filter(Boolean));
  const addFromReverse = item => {
    setDraft(list => [...list.filter(t => t.sid), { sid: item.sid, level: item.level, reason: item.reason }].slice(0, MAX_TARGETS));
    setDirty(true);
  };

  const save = async () => {
    if (!sid || !canEdit) return;
    const targets = normalizeTargets(draft, sid);
    const unknown = targets.filter(t => !roster?.[t.sid]);
    if (unknown.length && !window.confirm(`명단에 없는 학번이 있습니다(${unknown.map(t => t.sid).join(", ")}). 그래도 저장할까요?`)) return;
    setBusy(true);
    const result = await updateStorage(separationKey(year, GRADE, viewClass), emptyData(), current => {
      const next = { ...(current || emptyData()), entries: { ...(current?.entries || {}) } };
      if (targets.length) next.entries[sid] = { targets, updatedAt: new Date().toISOString(), by: actor?.name || actor?.id || "" };
      else delete next.entries[sid];
      return { ...next, updatedAt: new Date().toISOString() };
    });
    setBusy(false);
    if (!result?.ok) { showToast?.(`저장하지 못했습니다: ${result?.error || "다시 시도해 주세요."}`, "error"); return; }
    setData(current => ({ ...current, [viewClass]: result.value }));
    setDraft(targets.length ? targets : [newTarget()]);
    setDirty(false);
    showToast?.(`${label(sid, roster)} 분리희망학생 ${targets.length}명을 저장했습니다.`, "success");
  };

  const exportXlsx = async scope => {
    const mod = await import("xlsx-js-style");
    const XLSX = mod.default?.utils ? mod.default : mod;
    const classList = scope === "all" ? tabs : [viewClass];
    const rows = separationRows(classList.map(c => data[c]), roster);
    const { top, sub, merges } = separationHeader();
    const ws = XLSX.utils.aoa_to_sheet([top, sub, ...rows]);
    ws["!merges"] = merges;
    ws["!cols"] = SEPARATION_COL_WIDTHS.map(wch => ({ wch }));
    ws["!rows"] = [{ hpt: 48 }, { hpt: 20 }];
    const border = { style: "thin", color: { rgb: "B8C2CF" } };
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let r = range.s.r; r <= range.e.r; r += 1) for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      const head = r < 2;
      ws[ref].s = {
        font: { name: "맑은 고딕", sz: 10, bold: head },
        alignment: { horizontal: head || (c - 4) % 4 !== 3 ? "center" : "left", vertical: "center", wrapText: true },
        border: { top: border, bottom: border, left: border, right: border },
        ...(head ? { fill: { patternType: "solid", fgColor: { rgb: "DCE6F1" } } } : {}),
      };
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, SHEET_TITLE);
    const rosterRows = Object.entries(roster || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([id, s]) => [id, s?.name || "", s?.gender || ""]);
    const ws2 = XLSX.utils.aoa_to_sheet([["학번", "이름", "성별"], ...rosterRows]);
    ws2["!cols"] = [{ wch: 9 }, { wch: 12 }, { wch: 6 }];
    XLSX.utils.book_append_sheet(wb, ws2, "학적");
    XLSX.writeFile(wb, `${year + 1} 3학년 반편성 분리희망학생(2학년부)${scope === "all" ? "" : `_${viewClass}반`}.xlsx`);
  };

  if (!tabs.length) return <div className="kcs"><style dangerouslySetInnerHTML={{ __html: CSS }} /><div className="kcs-empty">2학년 명단이 없거나, 담임 반 정보가 없습니다. 내 정보에서 담임 반을 확인해 주세요.</div></div>;

  // ---- 현황 계산 ----
  const inClass = (id, c) => classOf(roster?.[id]) === c;
  const scopePairs = canViewAll ? pairs : pairs.filter(p => inClass(p.a, ownClass) || inClass(p.b, ownClass));
  const levelCounts = Object.fromEntries(SEPARATION_LEVELS.map(level => [level, scopePairs.filter(p => p.level === level).length]));
  const q = pairQuery.trim();
  const shownPairs = scopePairs.filter(p => (!levelFilter || p.level === levelFilter)
    && (!classFilter || inClass(p.a, Number(classFilter)) || inClass(p.b, Number(classFilter)))
    && (!q || [p.a, p.b, nameOf(p.a, roster), nameOf(p.b, roster)].some(v => String(v).includes(q))));
  const classStats = tabs.map(c => {
    const related = pairs.filter(p => inClass(p.a, c) || inClass(p.b, c));
    const byLevel = Object.fromEntries(SEPARATION_LEVELS.map(level => [level, related.filter(p => p.level === level).length]));
    return { c, filled: Object.keys(data[c]?.entries || {}).length, total: related.length, byLevel, size: Object.values(roster || {}).filter(st => classOf(st) === c).length };
  });
  const maxTotal = Math.max(1, ...classStats.map(s => s.total));
  const totalFilled = classStats.reduce((sum, s) => sum + s.filled, 0);
  const startedClasses = classStats.filter(s => s.filled).length;
  const printStatus = (classList, overview) => {
    setPrintOpen(false);
    const tone = level => BAR_COLORS[toneOf(level)];
    const person = (id, c) => `<span class="nm${classOf(roster?.[id]) === c ? " mine" : ""}">${esc(nameOf(id, roster) || id)}</span><span class="sid">${esc(classOf(roster?.[id]) || "?")}반 · ${esc(id)}</span>`;
    const today = new Date().toLocaleDateString("ko-KR");
    const kpis = list => `<div class="kpis"><div class="kpi"><small>분리 관계</small><b>${list.length}<span>건</span></b></div>${SEPARATION_LEVELS.map(level => `<div class="kpi" style="--c:${tone(level)}"><small style="color:${tone(level)}">${esc(level)}</small><b>${list.filter(p => p.level === level).length}<span>건</span></b></div>`).join("")}</div>`;
    const sections = [];
    if (overview) {
      const rows = classStats.map(st => `<tr><td class="c"><b>${st.c}반</b></td><td class="c">${st.filled}/${st.size}명</td><td class="c">${st.total}</td>${SEPARATION_LEVELS.map(level => `<td class="c">${st.byLevel[level] || "-"}</td>`).join("")}<td>${st.total ? `<div class="bar">${SEPARATION_LEVELS.map(level => st.byLevel[level] ? `<i style="width:${(st.byLevel[level] / st.total) * 100}%;background:${tone(level)}"></i>` : "").join("")}</div>` : ""}</td></tr>`).join("");
      sections.push(`<section><header><div><small>${year + 1} 반편성</small><h1>분리희망학생 전체 요약</h1></div><p>2학년 ${tabs.length}개 반<br>${today} 출력</p></header>${kpis(scopePairs)}<h2>반별 입력 현황</h2><table><thead><tr><th>반</th><th>입력 학생</th><th>분리 관계</th>${SEPARATION_LEVELS.map(level => `<th>${esc(level)}</th>`).join("")}<th style="width:28%">등급 분포</th></tr></thead><tbody>${rows}</tbody></table><p class="note">분리 관계: 두 학생 중 한쪽이라도 등록하면 1건(양쪽 모두 등록하면 더 강한 등급으로 1건). 반별 수는 그 반 학생이 들어간 관계 수라 반끼리 겹칠 수 있습니다.</p></section>`);
    }
    classList.forEach(c => {
      const list = pairs.filter(p => inClass(p.a, c) || inClass(p.b, c)).sort((x, y) => levelRank(x.level) - levelRank(y.level) || String(x.a).localeCompare(String(y.a)));
      const body = list.map(p => {
        const from = p.mutual ? p.a : p.from[0];
        const to = p.mutual ? p.b : (p.from[0] === p.a ? p.b : p.a);
        return `<tr><td class="c"><span class="pill" style="--c:${tone(p.level)}">${esc(p.level)}</span></td><td class="c">${person(from, c)}</td><td class="c">${p.mutual ? "⇄" : "→"}</td><td class="c">${person(to, c)}</td><td>${esc(p.reasons.join(" / ") || "사유 없음")}</td><td class="c">${p.mutual ? "양쪽" : "-"}</td></tr>`;
      }).join("");
      const st = classStats.find(item => item.c === c);
      sections.push(`<section><header><div><small>${year + 1} 반편성 · 분리희망학생</small><h1>${c}반</h1></div><p>입력 학생 ${st?.filled || 0}/${st?.size || 0}명 · 분리 관계 ${list.length}건<br>${today} 출력</p></header>${kpis(list)}${list.length ? `<table><thead><tr><th style="width:13%">분리 등급</th><th>기준 학생</th><th style="width:5%"></th><th>분리 대상</th><th style="width:30%">사유</th><th style="width:8%">양쪽 등록</th></tr></thead><tbody>${body}</tbody></table>` : `<div class="empty">이 반 학생이 들어간 분리 관계가 없습니다.</div>`}<p class="note">주황 이름 = ${c}반 학생. 학생 개인정보가 들어 있으니 출력물 보관·폐기에 유의해 주세요.</p></section>`);
    });
    if (!sections.length) return;
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:-12000px;top:0;width:210mm;height:297mm;border:0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${year + 1} 반편성 분리희망학생</title><style>${PRINT_CSS}</style></head><body>${sections.join("")}</body></html>`);
    doc.close();
    window.setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* 인쇄 창 열기 실패 */ } window.setTimeout(() => frame.remove(), 60000); }, 300);
  };
  const Who = ({ id }) => <button type="button" data-kdn-bare className="kcs-who" onClick={() => openStudent(id)} title={tabs.includes(classOf(roster?.[id])) ? "이 학생 입력 화면으로" : ""}><b>{nameOf(id, roster) || id}<GenderTag g={roster?.[id]?.gender} /></b><small>{classOf(roster?.[id])}반 · {id}</small></button>;

  return <div className="kcs">
    <style dangerouslySetInnerHTML={{ __html: CSS }} />
    <section className="kcs-head">
      <div className="t"><b>{year + 1} 반편성 · 분리희망학생</b><small>{canViewAll ? `${ownClass && !canEditAll ? `${ownClass}반 담임(우리 반만 입력) · ` : ""}2학년 ${tabs.length}개 반 · 입력한 반 ${startedClasses}개 · 입력한 학생 ${totalFilled}명 · 분리 관계 ${pairs.length}건` : `${ownClass}반 담임 · 입력한 학생 ${classStats[0]?.filled || 0}명 · 우리 반 관련 분리 관계 ${scopePairs.length}건`}</small></div>
      <div className="kcs-seg" role="tablist" aria-label="화면 선택">
        <button type="button" data-kdn-bare role="tab" aria-selected={mode === "edit"} className={mode === "edit" ? "is-on" : ""} onClick={() => setMode("edit")}>학생별 입력</button>
        <button type="button" data-kdn-bare role="tab" aria-selected={mode === "summary"} className={mode === "summary" ? "is-on" : ""} onClick={() => setMode("summary")}>{canViewAll ? "전체 현황" : "우리 반 현황"}</button>
      </div>
      <div className="acts">
        <button type="button" className="kcs-btn" onClick={() => exportXlsx("class")} disabled={loading || !viewClass}><Download size={15} />{viewClass}반 엑셀</button>
        {canViewAll && <button type="button" className="kcs-btn" onClick={() => exportXlsx("all")} disabled={loading}><Download size={15} />전체 엑셀(학교 양식)</button>}
        <button type="button" className="kcs-btn" onClick={() => setPrintOpen(true)} disabled={loading}><Printer size={15} />현황 인쇄·PDF</button>
      </div>
    </section>
    {printOpen && <SeparationPrintDialog classes={tabs} defaultClasses={canViewAll ? tabs : [viewClass]} canOverview={canViewAll && tabs.length > 1} onClose={() => setPrintOpen(false)} onPrint={printStatus} />}

    {loading ? <div className="kcs-empty"><Loader2 size={16} className="spin" /> 불러오는 중입니다.</div> : mode === "edit" ? <>
      {tabs.length > 1 && <section className="kcs-classbar"><small>반 선택 · 초록 막대 = 입력한 학생 비율 · 빨간 표시 = 그 반 학생이 들어간 분리 관계 수</small><div className="kcs-classes" role="tablist" aria-label="반 선택">{classStats.map(s => <button key={s.c} type="button" data-kdn-bare role="tab" aria-selected={s.c === viewClass} className={s.c === viewClass ? "is-on" : ""} onClick={() => changeClass(s.c)}><span className="top"><b>{s.c}반</b>{s.total > 0 && <em className="rel" title="이 반 학생이 들어간 분리 관계">관계 {s.total}</em>}</span><span className="prog" aria-hidden="true"><i style={{ width: `${s.size ? Math.min(100, (s.filled / s.size) * 100) : 0}%` }} /></span><span className="sub">{s.filled ? `입력 ${s.filled} / ${s.size}명` : `입력 전 · ${s.size}명`}</span></button>)}</div></section>}
      <div className={`kcs-split${sid ? " has-sel" : ""}`}>
        <nav className="kcs-list" aria-label={`${viewClass}반 학생`}>
          <div className="kcs-list-find"><input value={findText} placeholder={`${viewClass}반에서 이름·학번 찾기`} aria-label="학생 찾기" onChange={event => setFindText(event.target.value)} /></div>
          {shownStudents.map(([id, s]) => { const own = ownTargets(id); const rev = (reverseMap[id] || []).filter(r => !own.some(t => t.sid === r.sid)); return <button key={id} type="button" data-kdn-bare className={id === sid ? "is-on" : ""} onClick={() => pick(id)}>
            <span className="no">{s?.number || id.slice(-2)}</span><span className="nm">{s?.name || id}<GenderTag g={s?.gender} /></span>
            <span className="kcs-marks">{own.length > 0 && <span className={`kcs-badge t-${toneOf(strongest(own))}`} title="이 학생 기준으로 등록한 분리 대상 수">분리 {own.length}</span>}{rev.length > 0 && <span className={`kcs-badge rev t-${toneOf(strongest(rev))}`} title="다른 학생 쪽에서 이 학생을 분리 대상으로 등록한 수(이 학생 쪽에는 아직 없음)">지목 {rev.length}</span>}</span>
          </button>; })}
          {!shownStudents.length && <div className="kcs-empty">{students.length ? "찾는 학생이 없습니다." : `${viewClass}반 명단이 없습니다.`}</div>}
        </nav>
        <section className="kcs-pane">
          {!sid ? <div className="kcs-guide">
            <b><Users size={18} /> 왼쪽 명단에서 학생을 고르세요</b>
            <ol><li><i>1</i>학생 고르기</li><li><i>2</i>분리할 학생 · 등급 · 사유 입력</li><li><i>3</i>저장</li></ol>
            <small><span className="kcs-badge t-must">분리 2</span> 이 학생의 분리 대상 수 <span className="kcs-badge rev t-high">지목 1</span> 다른 학생 쪽에서 이 학생을 분리 대상으로 등록한 수 · 색은 가장 강한 등급</small>
            <LevelScale />
          </div> : <>
            <button type="button" data-kdn-bare className="kcs-back" onClick={() => { if (!confirmLeave()) return; setSid(""); setDraft([]); setDirty(false); }}>← {viewClass}반 명단</button>
            <div className="kcs-pane-hd">
              <b>{nameOf(sid, roster) || sid}</b>
              <span className="meta"><em>{sid}</em><em>{viewClass}반</em>{roster?.[sid]?.gender && <em className={`g-${genderTone(roster[sid].gender)}`}>{roster[sid].gender}</em>}{entries[sid]?.updatedAt && <em className="soft">마지막 저장 {new Date(entries[sid].updatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}{entries[sid].by ? ` · ${entries[sid].by}` : ""}</em>}</span>
            </div>
            <div className="kcs-tabs" role="tablist" aria-label="이 학생의 분리희망">
              <button type="button" data-kdn-bare role="tab" aria-selected={paneTab === "mine"} className={paneTab === "mine" ? "is-on" : ""} onClick={() => setPaneTab("mine")}><b>이 학생의 분리 대상</b><span>{normalizeTargets(draft, sid).length}명</span></button>
              <button type="button" data-kdn-bare role="tab" aria-selected={paneTab === "recv"} className={`${paneTab === "recv" ? "is-on " : ""}${reverse.length ? "has" : ""}`} onClick={() => setPaneTab("recv")}><b>이 학생을 지목한 학생</b><span>{reverse.length}명</span>{reverse.length > 0 && <i className="dot" aria-hidden="true" />}</button>
            </div>
            {paneTab === "recv" ? <div className="kcs-recv">
              {reverse.length ? <>
                <p className="kcs-note">다른 학생 쪽(다른 반 담임 포함)에서 <b>{nameOf(sid, roster) || sid}</b> 학생을 분리 대상으로 등록했어요. 한쪽만 등록해도 반편성 자료에는 분리 관계로 들어갑니다.</p>
                {reverse.map(item => <article key={item.sid} className={`kcs-recv-card tone-${toneOf(item.level)}`}>
                  <div className="who"><b>{nameOf(item.sid, roster) || item.sid}</b><small>{classOf(roster?.[item.sid])}반 · {item.sid}</small></div>
                  <div className="what"><LevelPill level={item.level} /><span>{item.reason || "사유 없음"}</span></div>
                  <div className="by"><small>{item.by ? `${item.by} 입력` : ""}{item.updatedAt ? ` · ${new Date(item.updatedAt).toLocaleDateString("ko-KR")}` : ""}</small>
                    {canEdit && (draftIds.has(item.sid) ? <span className="ok">이 학생 쪽에도 등록됨</span> : <button type="button" className="kcs-btn sm" disabled={draft.filter(t => t.sid).length >= MAX_TARGETS} onClick={() => { addFromReverse(item); setPaneTab("mine"); }}><ArrowLeftRight size={14} />이 학생 쪽에도 등록</button>)}</div>
                </article>)}
              </> : <div className="kcs-empty">이 학생을 분리 대상으로 등록한 다른 학생은 없습니다.</div>}
            </div> : <>
            <div className="kcs-sec">
              <p className="kcs-note">같은 반이 되면 안 되는 학생을 최대 {MAX_TARGETS}명까지 적어 주세요. 등급과 사유를 고른 뒤 저장을 누르면 됩니다.</p>
              <div className="kcs-rows">{draft.map((item, index) => <div key={index} className="kcs-row">
                <span className="i">{index + 1}</span>
                {canEdit ? <TargetPicker value={item.sid} roster={roster} exclude={[sid, ...draft.map(t => t.sid).filter(Boolean)]} onChange={value => edit(index, { sid: value })} /> : <div className="kcs-chosen pick">{label(item.sid, roster)} <small>{classOf(roster?.[item.sid])}반</small></div>}
                <div className="kcs-level" role="group" aria-label="분리 등급">{SEPARATION_LEVELS.map(level => <button key={level} type="button" data-kdn-bare disabled={!canEdit} aria-pressed={item.level === level} title={`${LEVEL_INFO[level].hint} · 예: ${LEVEL_INFO[level].example}`} className={`${item.level === level ? "is-on " : ""}${toneOf(level)}`} onClick={() => edit(index, { level })}>{level}</button>)}</div>
                <div className="rs"><ReasonPicker key={`${sid}-${index}`} value={item.reason} disabled={!canEdit} onChange={reason => edit(index, { reason })} /></div>
                {canEdit ? <button type="button" className="kcs-del" aria-label={`${index + 1}번째 학생 지우기`} onClick={() => { setDraft(list => list.filter((_, i) => i !== index)); setDirty(true); }}><Trash2 size={15} /></button> : <span />}
              </div>)}</div>
              {!draft.length && <p className="kcs-note">등록된 분리희망학생이 없습니다.</p>}
            </div>
            {canEdit && <div className="kcs-foot">
              <button type="button" className="kcs-btn ghost" disabled={draft.length >= MAX_TARGETS} onClick={() => setDraft(list => [...list, newTarget()])}><Plus size={15} />학생 추가 ({draft.filter(t => t.sid).length}/{MAX_TARGETS})</button>
              <span className="sp" />
              {dirty && <small className="kcs-note">저장하지 않은 변경이 있어요</small>}
              <button type="button" className="kcs-btn pri" disabled={busy || !dirty} onClick={save}>{busy ? <Loader2 size={15} className="spin" /> : <Save size={15} />}저장</button>
            </div>}
            {!canEdit && <p className="kcs-note">이 반은 보기만 할 수 있습니다. 입력은 해당 반 담임 선생님이 합니다.</p>}
            <LevelScale />
            </>}
          </>}
        </section>
      </div>
    </> : <>
      <div className="kcs-kpis">
        <button type="button" data-kdn-bare className={`kcs-kpi is-total${!levelFilter ? " is-on" : ""}`} onClick={() => setLevelFilter("")}><small>분리 관계 전체</small><b>{scopePairs.length}<span>건</span></b><em>양쪽 모두 등록 {scopePairs.filter(p => p.mutual).length}건</em>
          <span className="kcs-kpi-mix" aria-hidden="true">{SEPARATION_LEVELS.map(level => levelCounts[level] ? <i key={level} style={{ flexGrow: levelCounts[level], background: BAR_COLORS[toneOf(level)] }} /> : null)}</span></button>
        {SEPARATION_LEVELS.map(level => { const share = scopePairs.length ? Math.round((levelCounts[level] / scopePairs.length) * 100) : 0; return <button key={level} type="button" data-kdn-bare style={{ "--c": BAR_COLORS[toneOf(level)] }} className={`kcs-kpi t-${toneOf(level)}${levelFilter === level ? " is-on" : ""}${levelCounts[level] ? "" : " is-zero"}`} onClick={() => setLevelFilter(levelFilter === level ? "" : level)}><small><i />{level}</small><b>{levelCounts[level]}<span>건</span><em className="pct">{share}%</em></b><span className="kcs-kpi-meter" aria-hidden="true"><i style={{ width: `${share}%` }} /></span><em>{LEVEL_INFO[level].hint}</em></button>; })}
      </div>
      <div className={canViewAll ? "kcs-grid2" : ""}>
        {canViewAll && <section className="kcs-card"><h4>반별 입력 현황<span className="sp" /><small>누르면 그 반만</small></h4>
          <div className="kcs-table-wrap"><table className="kcs-table narrow"><thead><tr><th>반</th><th>입력</th><th>분리 관계</th><th style={{ width: "40%" }}>등급 분포</th></tr></thead>
            <tbody>{classStats.map(s => <tr key={s.c} className={`click${classFilter === String(s.c) ? " is-on" : ""}`} onClick={() => setClassFilter(classFilter === String(s.c) ? "" : String(s.c))}>
              <td className="c"><b>{s.c}반</b></td><td className="c">{s.filled ? `${s.filled}명` : <small>미입력</small>}</td><td className="c">{s.total}</td>
              <td>{s.total ? <div className="kcs-bar" style={{ width: `${Math.max(14, (s.total / maxTotal) * 100)}%` }} title={SEPARATION_LEVELS.map(level => `${level} ${s.byLevel[level]}`).join(" · ")}>{SEPARATION_LEVELS.map(level => s.byLevel[level] ? <i key={level} style={{ width: `${(s.byLevel[level] / s.total) * 100}%`, background: BAR_COLORS[toneOf(level)] }} /> : null)}</div> : <small>-</small>}</td>
            </tr>)}</tbody></table></div>
        </section>}
        <section className="kcs-card"><h4>분리 관계 목록 <span className="cnt">{shownPairs.length}건</span></h4>
          <p className="kcs-note">기준 학생 쪽에서 분리 대상을 등록한 관계예요. 두 학생 모두 서로를 등록했으면 한 줄로 묶고 더 강한 등급을 보여 줍니다. 이름을 누르면 그 학생 입력 화면으로 갑니다.</p>
          <div className="kcs-filter">
            <Search size={15} /><input value={pairQuery} placeholder="이름·학번 찾기" aria-label="분리 관계 찾기" onChange={event => setPairQuery(event.target.value)} />
            {canViewAll && <select value={classFilter} aria-label="반으로 좁히기" onChange={event => setClassFilter(event.target.value)}><option value="">모든 반</option>{tabs.map(c => <option key={c} value={c}>{c}반 관련</option>)}</select>}
            <select value={levelFilter} aria-label="등급으로 좁히기" onChange={event => setLevelFilter(event.target.value)}><option value="">모든 등급</option>{SEPARATION_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}</select>
          </div>
          {shownPairs.length ? <div className="kcs-table-wrap"><table className="kcs-table"><thead><tr><th>분리 등급</th><th>기준 학생</th><th /><th>분리 대상</th><th>사유</th><th>양쪽 등록</th></tr></thead>
            <tbody>{shownPairs.map(p => <tr key={`${p.a}-${p.b}`}>
              <td className="c"><LevelPill level={p.level} /></td>
              <td className="c"><Who id={p.mutual ? p.a : p.from[0]} /></td>
              <td className="c">{p.mutual ? <ArrowLeftRight size={15} /> : <ArrowRight size={15} />}</td>
              <td className="c"><Who id={p.mutual ? p.b : (p.from[0] === p.a ? p.b : p.a)} /></td>
              <td>{p.reasons.length ? p.reasons.join(" / ") : <small>사유 없음</small>}</td>
              <td className="c">{p.mutual ? <span className="kcs-pill t-low">양쪽 등록</span> : <small>-</small>}</td>
            </tr>)}</tbody></table></div> : <div className="kcs-empty"><Search size={16} /> {scopePairs.length ? "조건에 맞는 분리 관계가 없습니다." : "아직 등록된 분리희망학생이 없습니다."}</div>}
        </section>
      </div>
    </>}
  </div>;
}
