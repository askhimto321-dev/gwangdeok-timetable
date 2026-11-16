// 반편성 현황 인쇄(PDF로 저장 가능)
// 1쪽: 요약 카드 · 반별 현황표(쏠림·부족 강조) · 이동 내역 / 다음 쪽부터 반마다 한 장(요약 · 반 점검·의견 · 학생 명단)
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const TONE = { good: ["#15803d", "#dcfce7"], warn: ["#b45309", "#fef3c7"], info: ["#1d4ed8", "#dbeafe"], bad: ["#b91c1c", "#fee2e2"], mv: ["#6d28d9", "#ede9fe"] };
const SHORT = { leader: "리더", combo: "조합", care: "배려", guide: "생활", move: "이동" };

// 반마다 표시 인원이 평균보다 크게 많으면 '쏠림'(리더 후보는 0명이면 '부족')
export function classAlerts(classRows, flags) {
  const avg = Object.fromEntries(flags.map(f => [f.key, classRows.reduce((t, r) => t + (r.flags[f.key] || 0), 0) / Math.max(1, classRows.length)]));
  const level = (key, v) => {
    if (key === "leader") return v === 0 ? "low" : "";
    return v >= 3 && v >= avg[key] * 1.6 ? "high" : "";
  };
  return { avg, level };
}

// data: { title, subtitle, flags: [{ key, label, tone }], classRows: [{ cls, n, m, f, inn, out, flags: {key: n}, miss, combo, group, checks: [] }],
//   moves: [[시각, 학생, 이동, 맞바꾼 학생, 옮긴 사람]], classes: [{ cls, notes: [], students: [{ no, old, name, gender, flags: [key], sep, alert, notes: [], memos: [] }] }] }
export function printPlacement(data, { overview = true, roster = true, memos = true } = {}) {
  const win = window.open("", "_blank");
  if (!win) return false;
  const printedAt = new Date().toLocaleString("ko-KR");
  const { flags, classRows } = data;
  const { level } = classAlerts(classRows, flags);
  const sum = key => classRows.reduce((t, r) => t + (Number(key(r)) || 0), 0);
  const total = sum(r => r.n);
  const tag = f => { const [fg, bg] = TONE[f.tone] || TONE.info; return `<span class="tg" style="color:${fg};background:${bg}">${esc(SHORT[f.key] || f.label)}</span>`; };
  const flagOf = Object.fromEntries(flags.map(f => [f.key, f]));
  const lowLeader = classRows.filter(r => level("leader", r.flags.leader || 0)).length;
  const highN = classRows.reduce((t, r) => t + flags.filter(f => level(f.key, r.flags[f.key] || 0) === "high").length, 0);
  const kpis = [
    ["학생", `${total}`, "명", ""], ["반", `${classRows.length}`, "개", ""], ["이동", `${data.moves.length}`, "건", ""],
    ["분리희망 미반영", `${sum(r => r.miss)}`, "명", sum(r => r.miss) ? "bad" : "ok"],
    ["조합 우려 같은 반", `${sum(r => r.combo)}`, "쌍", sum(r => r.combo) ? "bad" : "ok"],
    ["리더 후보 없는 반", `${lowLeader}`, "개", lowLeader ? "bad" : "ok"],
    ["표시 쏠림", `${highN}`, "곳", highN ? "warn" : "ok"],
  ];
  const genderBar = r => { const p = r.n ? Math.round((r.m / r.n) * 100) : 0; return `<span class="gb"><i style="width:${p}%"></i></span>`; };
  const cell = (v, lv = "", alert = false) => `<td class="c${lv ? ` ${lv}` : ""}${alert && v ? " bad" : ""}${!v && !lv ? " z" : ""}">${v || (lv ? "0" : "–")}</td>`;

  const cover = overview ? `<section class="page">
    <header class="top"><div><small>반편성 현황</small><h1>${esc(data.title)}</h1></div><span>${esc(data.subtitle)}<br>출력 ${esc(printedAt)}</span></header>
    <div class="kpis">${kpis.map(([l, v, u, t]) => `<div class="${t}"><small>${esc(l)}</small><b>${esc(v)}<em>${esc(u)}</em></b></div>`).join("")}</div>
    <h2>반별 현황</h2>
    <table class="ov"><thead>
      <tr class="g"><th rowspan="2" class="c">반</th><th colspan="4" class="c gl">인원</th><th colspan="2" class="c gl">이동</th><th colspan="${flags.length}" class="c gl">학생 표시</th><th colspan="3" class="c gl">배정 점검</th><th rowspan="2" class="gl">반 점검</th></tr>
      <tr><th class="c">계</th><th class="c">남</th><th class="c">여</th><th class="c">남녀</th><th class="c">받음</th><th class="c">보냄</th>${flags.map(f => `<th class="c">${tag(f)}</th>`).join("")}<th class="c">분리<br>미반영</th><th class="c">조합<br>같은 반</th><th class="c">그룹<br>같은 반</th></tr>
    </thead><tbody>
    ${classRows.map(r => `<tr><td class="c cls">${esc(r.cls)}반</td><td class="c b">${r.n}</td><td class="c">${r.m}</td><td class="c">${r.f}</td><td class="c">${genderBar(r)}</td>${cell(r.inn)}${cell(r.out)}${flags.map(f => cell(r.flags[f.key] || 0, level(f.key, r.flags[f.key] || 0))).join("")}${cell(r.miss, "", true)}${cell(r.combo, "", true)}${cell(r.group, "", true)}<td class="ck">${r.checks.map(c => `<span>${esc(c)}</span>`).join("") || '<i class="z">–</i>'}</td></tr>`).join("")}
    </tbody><tfoot><tr><td class="c">합계</td><td class="c">${total}</td><td class="c">${sum(r => r.m)}</td><td class="c">${sum(r => r.f)}</td><td></td><td class="c">${sum(r => r.inn) || "–"}</td><td class="c">${sum(r => r.out) || "–"}</td>${flags.map(f => `<td class="c">${sum(r => r.flags[f.key]) || "–"}</td>`).join("")}<td class="c">${sum(r => r.miss) || "–"}</td><td class="c">${sum(r => r.combo) || "–"}</td><td class="c">${sum(r => r.group) || "–"}</td><td></td></tr></tfoot></table>
    <p class="legend"><span class="sw high"></span> 쏠림: 다른 반 평균보다 많이 몰림(3명 이상) <span class="sw low"></span> 부족: 리더 후보 없음 <b class="r">빨강</b> 확인이 필요한 수 · 남녀 막대: 파랑 남 / 분홍 여</p>
    ${data.moves.length ? `<h2>이동 내역 <small>${data.moves.length}건</small></h2><table class="ov mv"><thead><tr><th>시각</th><th>학생</th><th>이동</th><th>맞바꾼 학생</th><th>옮긴 사람</th></tr></thead><tbody>${data.moves.map(m => `<tr>${m.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ""}
  </section>` : "";

  const pages = roster ? data.classes.map(c => {
    const r = classRows.find(x => x.cls === c.cls) || { n: 0, m: 0, f: 0, flags: {}, checks: [] };
    const stat = (label, v, lv = "") => `<div class="${lv}"><small>${esc(label)}</small><b>${v}</b></div>`;
    return `<section class="page">
    <header class="top sm"><span>${esc(data.title)}</span><span>${esc(printedAt)}</span></header>
    <div class="cls-hd">
      <div class="nm"><strong>${esc(c.cls)}<em>반</em></strong><span>${r.n}명 · 남 ${r.m} · 여 ${r.f}</span>${genderBar(r)}</div>
      <div class="stats">${flags.map(f => stat(f.label, r.flags[f.key] || 0, level(f.key, r.flags[f.key] || 0))).join("")}${stat("분리희망 미반영", r.miss || 0, r.miss ? "bad" : "")}${stat("조합 같은 반", r.combo || 0, r.combo ? "bad" : "")}${stat("받음 · 보냄", `${r.inn || 0} · ${r.out || 0}`)}</div>
    </div>
    ${r.checks.length || (memos && c.notes.length) ? `<div class="notes">${r.checks.length ? `<div class="row"><b>반 점검</b><div>${r.checks.map(x => `<span class="ckt">${esc(x)}</span>`).join("")}</div></div>` : ""}${memos && c.notes.length ? `<div class="row"><b>의견</b><ul>${c.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}</div>` : ""}
    <table class="st"><thead><tr><th class="c n">번호</th><th class="c o">구반-번호</th><th class="nm">이름</th><th class="c g">성별</th><th class="fl">표시</th><th class="c sp">분리희망</th><th>비고${memos ? " · 메모" : ""}</th><th class="c k">확인</th></tr></thead><tbody>
    ${c.students.map(s => `<tr class="${s.alert ? "alert" : ""}"><td class="c n">${esc(s.no)}</td><td class="c o">${esc(s.old)}</td><td class="nm">${esc(s.name)}</td><td class="c g ${s.gender === "남" ? "m" : "f"}">${esc(s.gender)}</td><td class="fl">${s.flags.map(k => flagOf[k] ? tag(flagOf[k]) : "").join("")}</td><td class="c sp">${s.sep === "미반영" ? '<b class="r">미반영</b>' : s.sep === "반영" ? '<span class="ok">✓ 반영</span>' : s.sep ? `<span>${esc(s.sep)}</span>` : ""}</td><td class="rm">${s.notes.map(n => `<span class="nt">${esc(n)}</span>`).join("")}${memos ? s.memos.map(m => `<span class="memo">${esc(m)}</span>`).join("") : ""}</td><td class="c k"><i class="box"></i></td></tr>`).join("")}
    </tbody></table>
    <p class="legend">표시: ${flags.map(f => `${tag(f)} ${esc(f.label)}`).join(" ")} · 분리희망 '✓ 반영'은 분리희망이 있는 학생이 다른 반으로 잘 나뉜 경우예요.</p>
  </section>`; }).join("") : "";

  win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(data.title)}</title><style>
  @page{size:A4;margin:11mm 11mm 12mm}*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{margin:0;font-family:"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif;color:#17181d;font-size:9.5pt;line-height:1.45}
  .bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;padding:10px 16px;background:#17181d;color:#fff;font-size:13px}.bar b{flex:1}.bar button{height:34px;padding:0 16px;border:0;border-radius:9px;background:#2563eb;color:#fff;font:inherit;font-weight:800;cursor:pointer}.bar small{color:#c9cdd4}
  .page{break-after:page;page-break-after:always;display:flex;flex-direction:column;gap:9px}.page:last-child{break-after:auto;page-break-after:auto}
  .top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding-bottom:7px;border-bottom:2.5px solid #17181d}.top small{font-size:8.5pt;font-weight:800;color:#2563eb;letter-spacing:.04em}.top h1{margin:0;font-size:17pt;line-height:1.2}.top>span{font-size:8pt;color:#5b606b;text-align:right}
  .top.sm{border-bottom:1px solid #d6d3cc;padding-bottom:4px}.top.sm span{font-size:7.5pt;color:#8a8f99}
  h2{margin:4px 0 0;font-size:11pt}h2 small{font-size:8.5pt;color:#6b7280;font-weight:600;margin-left:4px}
  .kpis{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}.kpis div{padding:6px 8px;border:1px solid #dfe3ea;border-radius:8px}.kpis small{display:block;font-size:7.5pt;color:#5b606b;white-space:nowrap}.kpis b{font-size:15pt;line-height:1.2}.kpis em{font-style:normal;font-size:8pt;font-weight:600;color:#6b7280;margin-left:1px}
  .kpis .bad{border-color:#f2b8b5;background:#fdf1f0}.kpis .bad b{color:#b91c1c}.kpis .warn{border-color:#f6d58e;background:#fffaeb}.kpis .warn b{color:#b45309}.kpis .ok b{color:#15803d}
  table{width:100%;border-collapse:collapse}th{padding:4px 3px;font-size:7.5pt;font-weight:800;color:#3d4048;text-align:left;vertical-align:bottom;line-height:1.25}td{padding:4px 3px;border-bottom:1px solid #e6e3dc;vertical-align:middle}.c{text-align:center}
  table.ov thead tr:last-child th{border-bottom:1.5px solid #17181d}table.ov thead tr.g th{border-top:1.5px solid #17181d}table.ov th.gl{border-left:1px solid #d6d3cc}table.ov td{font-size:9.5pt;font-variant-numeric:tabular-nums}
  table.ov td.cls{font-weight:800;white-space:nowrap}table.ov td.b{font-weight:800}table.ov td.z,.z{color:#c3c7ce}table.ov td.bad{color:#b91c1c;font-weight:800}
  td.high{background:#fde7c4;color:#9a3412;font-weight:800}td.low{background:#fde2e1;color:#b91c1c;font-weight:800}
  table.ov tfoot td{border-top:1.5px solid #17181d;border-bottom:0;font-weight:800;white-space:nowrap}table.ov td.ck span{display:inline-block;margin:1px 3px 1px 0;padding:0 5px;border-radius:4px;background:#fee2e2;color:#b91c1c;font-size:7pt;font-weight:700}
  table.mv th{border-top:1.5px solid #17181d;border-bottom:1px solid #17181d}table.mv td{font-size:8.5pt}
  .gb{display:inline-block;width:12mm;height:2.2mm;border-radius:2mm;background:#f9a8d4;overflow:hidden;vertical-align:middle}.gb i{display:block;height:100%;background:#60a5fa}
  .tg{display:inline-block;margin:0 2px 1px 0;padding:0 5px;border-radius:4px;font-size:7.5pt;font-weight:800;line-height:1.6;white-space:nowrap}
  .legend{margin:0;font-size:7.5pt;color:#6b7280;line-height:1.8}.legend .sw{display:inline-block;width:3mm;height:3mm;border-radius:1mm;vertical-align:-0.5mm;margin-left:6px}.sw.high{background:#fde7c4}.sw.low{background:#fde2e1}.r{color:#b91c1c}
  .cls-hd{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;padding:9px 12px;border-radius:10px;background:#f4f3f0}
  .cls-hd .nm{display:grid;gap:3px;padding-right:12px;border-right:1px solid #d6d3cc}.cls-hd strong{font-size:22pt;line-height:1}.cls-hd strong em{font-style:normal;font-size:12pt;margin-left:2px}.cls-hd .nm span{font-size:8.5pt;font-weight:700;color:#3d4048;white-space:nowrap}.cls-hd .gb{width:100%}
  .cls-hd .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.cls-hd .stats div{padding:3px 7px;border-radius:6px;background:#fff}.cls-hd .stats small{display:block;font-size:7pt;color:#6b7280;white-space:nowrap}.cls-hd .stats b{font-size:11pt}
  .cls-hd .stats .high{background:#fde7c4}.cls-hd .stats .high b{color:#9a3412}.cls-hd .stats .low,.cls-hd .stats .bad{background:#fde2e1}.cls-hd .stats .low b,.cls-hd .stats .bad b{color:#b91c1c}
  .notes{display:grid;gap:4px;padding:7px 10px;border:1px solid #dbe4f5;border-left:3px solid #2563eb;border-radius:6px;background:#f7f9fe;font-size:8.5pt}.notes .row{display:grid;grid-template-columns:13mm 1fr;gap:6px}.notes .row>b{color:#1d4ed8}.notes ul{margin:0;padding-left:14px}.notes li{margin:1px 0}
  .ckt{display:inline-block;margin:0 4px 2px 0;padding:0 6px;border-radius:4px;background:#fee2e2;color:#b91c1c;font-weight:700}
  table.st thead th{border-top:1.5px solid #17181d;border-bottom:1px solid #17181d}table.st td{font-size:9pt;padding:3.5px 3px}
  table.st .n{width:8mm}table.st .o{width:15mm}table.st .nm{width:19mm;font-weight:800;white-space:nowrap}table.st .g{width:8mm}table.st .fl{width:30mm}table.st .sp{width:15mm}table.st .k{width:9mm}
  table.st td.g.m{color:#2563eb}table.st td.g.f{color:#db2777}table.st td.sp{font-size:8pt}table.st td.sp .ok{color:#8a8f99}
  table.st tbody tr:nth-child(even) td{background:#fafaf8}table.st tr.alert td{background:#fdf1f0!important}
  table.st td.rm{font-size:8pt;line-height:1.4}td.rm .nt{display:inline-block;margin:0 5px 1px 0;color:#3d4048;font-weight:700}td.rm .memo{display:block;color:#3d4048}td.rm .memo::before{content:"✎ ";color:#9aa0ab}
  .box{display:inline-block;width:3.6mm;height:3.6mm;border:1px solid #5b606b;border-radius:1mm;vertical-align:middle}
  thead{display:table-header-group}tr{break-inside:avoid}
  @media screen{body{background:#e9e7e2}.pages{transform-origin:top left}.page{width:210mm;min-height:297mm;margin:8mm auto;padding:11mm;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.12)}}
  @media print{.bar{display:none}}
  </style></head><body><div class="bar"><b>${esc(data.title)}</b><small>인쇄 창에서 '대상'을 'PDF로 저장'으로 바꾸면 PDF로 받아요</small><button onclick="window.print()">인쇄 · PDF 저장</button></div><div class="pages">${cover}${pages}</div><script>
  function fit(){var w=document.documentElement.clientWidth,pw=document.querySelector('.page')?document.querySelector('.page').offsetWidth+24:0,el=document.querySelector('.pages');if(!pw)return;var s=Math.min(1,w/pw);el.style.zoom=s<1?s:'';}
  window.addEventListener('resize',fit);window.onload=function(){fit();setTimeout(function(){window.print()},400)};
  window.onbeforeprint=function(){document.querySelector('.pages').style.zoom=''};window.onafterprint=fit;
  <\/script></body></html>`);
  win.document.close();
  return true;
}
