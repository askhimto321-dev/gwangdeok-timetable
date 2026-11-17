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
//   moves: [{ from, to, name, old, swap, swapOld, by, at }], classes: [{ cls, notes: [], students: [{ no, old, name, gender, flags: [key], sep, move: { from, partner } | null, alert, notes: [], memos: [] }] }] }
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
    ["학생", `${total}`, "명", ""], ["반", `${classRows.length}`, "개", ""], ["초기 엑셀과 달라진 학생", `${data.changed ?? sum(r => r.inn)}`, `명 · 기록 ${data.moves.length}건`, ""],
    ["분리희망 미반영", `${sum(r => r.miss)}`, "명", sum(r => r.miss) ? "bad" : "ok"],
    ["조합 우려 같은 반", `${sum(r => r.combo)}`, "쌍", sum(r => r.combo) ? "bad" : "ok"],
    ["리더 후보 없는 반", `${lowLeader}`, "개", lowLeader ? "bad" : "ok"],
    ["표시 쏠림", `${highN}`, "곳", highN ? "warn" : "ok"],
  ];
  const genderBar = r => { const p = r.n ? Math.round((r.m / r.n) * 100) : 0; return `<span class="gb"><i style="width:${p}%"></i></span>`; };
  const cell = (v, lv = "", alert = false, gs = false) => `<td class="c${gs ? " gs" : ""}${lv ? ` ${lv}` : ""}${alert && v ? " bad" : ""}${!v && !lv ? " z" : ""}">${v || (lv ? "0" : "–")}</td>`;

  // 이동 내역 표: 한 줄 = 한 번의 이동(맞바꿈이면 두 학생이 서로 반을 바꿈)
  const moveTable = (list, cls = 0) => `<table class="mvt"><thead><tr><th class="c n">#</th><th class="c kd">종류</th><th>학생</th><th class="c dir">이동</th><th>맞바꾼 학생</th><th class="c dir">이동</th><th class="c by">옮긴 사람 · 시각</th></tr></thead><tbody>
    ${list.map((m, i) => { const mark = n => cls ? (Number(n) === Number(cls) ? ' class="me"' : "") : ""; return `<tr class="${m.swap ? "sw" : "one"}"><td class="c n">${i + 1}</td><td class="c kd"><span class="${m.swap ? "ksw" : "kone"}">${m.swap ? "↔ 맞바꿈" : "→ 옮기기"}</span></td>
      <td><b>${esc(m.name)}</b> <small>${esc(m.old)}</small></td><td class="c dir"><span${mark(m.from)}>${m.from}반</span> → <span${mark(m.to)}>${m.to}반</span></td>
      <td>${m.swap ? `<b>${esc(m.swap)}</b> <small>${esc(m.swapOld)}</small>` : '<i class="z">–</i>'}</td><td class="c dir">${m.swap ? `<span${mark(m.to)}>${m.to}반</span> → <span${mark(m.from)}>${m.from}반</span>` : '<i class="z">–</i>'}</td>
      <td class="c by">${esc(m.by)}<br><small>${esc(m.at)}</small></td></tr>`; }).join("")}
  </tbody></table>`;
  const cover = overview ? `<section class="page">
    <header class="top"><div><small>반편성 현황</small><h1>${esc(data.title)}</h1></div><span>${esc(data.subtitle)}<br>출력 ${esc(printedAt)}</span></header>
    <div class="kpis">${kpis.map(([l, v, u, t]) => `<div class="${t}"><small>${esc(l)}</small><b>${esc(v)}<em>${esc(u)}</em></b></div>`).join("")}</div>
    <h2>반별 현황</h2>
    <table class="ov"><thead>
      <tr class="g"><th rowspan="2" class="c">반</th><th colspan="4" class="c gs">인원</th><th colspan="2" class="c gs">이동</th><th colspan="${flags.length}" class="c gs">학생 표시</th><th colspan="3" class="c gs">배정 점검</th></tr>
      <tr><th class="c gs">계</th><th class="c">남</th><th class="c">여</th><th class="c">남녀</th><th class="c gs">받음</th><th class="c">보냄</th>${flags.map((f, i) => `<th class="c${i ? "" : " gs"}">${tag(f)}</th>`).join("")}<th class="c gs">분리희망<br>미반영</th><th class="c">조합<br>같은 반</th><th class="c">그룹<br>같은 반</th></tr>
    </thead><tbody>
    ${classRows.map(r => `<tr><td class="c cls">${esc(r.cls)}반</td><td class="c b gs">${r.n}</td><td class="c">${r.m}</td><td class="c">${r.f}</td><td class="c">${genderBar(r)}</td>${cell(r.inn, "", false, true)}${cell(r.out)}${flags.map((f, i) => cell(r.flags[f.key] || 0, level(f.key, r.flags[f.key] || 0), false, !i)).join("")}${cell(r.miss, "", true, true)}${cell(r.combo, "", true)}${cell(r.group, "", true)}</tr>`).join("")}
    </tbody><tfoot><tr><td class="c">합계</td><td class="c gs">${total}</td><td class="c">${sum(r => r.m)}</td><td class="c">${sum(r => r.f)}</td><td></td><td class="c gs">${sum(r => r.inn) || "–"}</td><td class="c">${sum(r => r.out) || "–"}</td>${flags.map((f, i) => `<td class="c${i ? "" : " gs"}">${sum(r => r.flags[f.key]) || "–"}</td>`).join("")}<td class="c gs">${sum(r => r.miss) || "–"}</td><td class="c">${sum(r => r.combo) || "–"}</td><td class="c">${sum(r => r.group) || "–"}</td></tr></tfoot></table>
    <p class="legend"><span class="sw high"></span> 쏠림: 다른 반 평균보다 많이 몰림(3명 이상) <span class="sw low"></span> 부족: 리더 후보 없음 <b class="r">빨강</b> 확인이 필요한 수 · 남녀 막대: 파랑 남 / 분홍 여</p>
    ${classRows.some(r => r.checks.length) ? `<h2>반 점검 <small>선생님들이 체크한 반</small></h2><table class="ckl"><tbody>${classRows.filter(r => r.checks.length).map(r => `<tr><th class="c">${esc(r.cls)}반</th><td>${r.checks.map(c => `<span class="ckt">${esc(c)}</span>`).join("")}</td></tr>`).join("")}</tbody></table>` : ""}
  </section>` : "";

  // 이동 내역: 현황과 따로 한 장(많으면 다음 장으로 이어지고 머리글 반복)
  const movesPage = overview ? `<section class="page">
    <header class="top sm"><span>${esc(data.title)}</span><span>${esc(printedAt)}</span></header>
    <h2>이동 내역 <small>${data.moves.length ? `모두 ${data.moves.length}건 · 맞바꿈 ${data.moves.filter(m => m.swap).length}건 · 옮기기만 ${data.moves.filter(m => !m.swap).length}건 · 초기 엑셀과 달라진 학생 ${data.changed ?? sum(r => r.inn)}명` : ""}</small></h2>
    ${data.moves.length ? `<table class="ov mvsum"><thead><tr><th class="c">반</th>${classRows.map(r => `<th class="c">${esc(r.cls)}반</th>`).join("")}<th class="c gs">합계</th></tr></thead><tbody>
      <tr><td class="c cls">받음</td>${classRows.map(r => cell(r.inn)).join("")}<td class="c gs b">${sum(r => r.inn)}</td></tr>
      <tr><td class="c cls">보냄</td>${classRows.map(r => cell(r.out)).join("")}<td class="c gs b">${sum(r => r.out)}</td></tr></tbody></table>
      ${moveTable(data.moves)}` : `<p class="legend">아직 이동한 학생이 없어요.</p>`}
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
    ${(() => { const mv = data.moves.filter(m => Number(m.from) === Number(c.cls) || Number(m.to) === Number(c.cls)); return mv.length ? `<div class="mvbox"><div class="mvh"><b>이 반 이동</b><span>받음 ${r.inn || 0}명 · 보냄 ${r.out || 0}명</span><small>굵은 반 = ${esc(c.cls)}반</small></div>${moveTable(mv, c.cls)}</div>` : ""; })()}
    <table class="st"><thead><tr><th class="c n">번호</th><th class="c o">구반-번호</th><th class="nm">이름</th><th class="c g">성별</th><th class="fl">표시</th><th class="c sp">분리희망</th><th>비고${memos ? " · 메모" : ""}</th><th class="c k">확인</th></tr></thead><tbody>
    ${c.students.map(s => `<tr class="${s.alert ? "alert" : ""}${s.move ? " moved" : ""}"><td class="c n">${esc(s.no)}</td><td class="c o">${esc(s.old)}</td><td class="nm">${esc(s.name)}${s.move ? `<span class="mvb">${s.move.from}반에서 옴${s.move.partner ? ` · ↔ ${esc(s.move.partner)}` : ""}</span>` : ""}</td><td class="c g ${s.gender === "남" ? "m" : "f"}">${esc(s.gender)}</td><td class="fl">${s.flags.map(k => flagOf[k] ? tag(flagOf[k]) : "").join("")}</td><td class="c sp">${s.sep === "미반영" ? '<b class="r">미반영</b>' : s.sep === "반영" ? '<span class="ok">✓ 반영</span>' : s.sep ? `<span>${esc(s.sep)}</span>` : ""}</td><td class="rm">${s.notes.map(n => `<span class="nt">${esc(n)}</span>`).join("")}${memos ? s.memos.map(m => `<span class="memo">${esc(m)}</span>`).join("") : ""}</td><td class="c k"><i class="box"></i></td></tr>`).join("")}
    </tbody></table>
    <p class="legend">표시: ${flags.map(f => `${tag(f)} ${esc(f.label)}`).join(" ")} · <span style="background:#f1ecff;padding:0 1mm;border-left:1mm solid #7c3aed">보라 줄</span> = 이동으로 이 반에 온 학생(↔ 맞바꾼 학생) · 분리희망 '✓ 반영'은 분리희망이 있는 학생이 다른 반으로 잘 나뉜 경우예요.</p>
  </section>`; }).join("") : "";

  win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(data.title)}</title><style>
  @page{size:A4;margin:10mm 10mm 11mm}*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{margin:0;font-family:"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif;color:#111318;font-size:10pt;line-height:1.45}
  .bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;padding:10px 16px;background:#111318;color:#fff;font-size:13px}.bar b{flex:1}.bar button{height:34px;padding:0 16px;border:0;border-radius:8px;background:#2563eb;color:#fff;font:inherit;font-weight:800;cursor:pointer}.bar small{color:#c9cdd4}
  .page{break-after:page;page-break-after:always;display:flex;flex-direction:column;gap:2.8mm}.page:last-child{break-after:auto;page-break-after:auto}
  .top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding-bottom:2.5mm;border-bottom:2px solid #111318}.top small{font-size:9pt;font-weight:800;color:#1d4ed8}.top h1{margin:0;font-size:18pt;line-height:1.2}.top>span{font-size:8.5pt;color:#4b5060;text-align:right;line-height:1.5}
  .top.sm{border-bottom:1px solid #9aa0ab;padding-bottom:1.5mm}.top.sm span{font-size:8pt;color:#4b5060}
  h2{margin:1mm 0 -1mm;font-size:12pt;padding-left:2.5mm;border-left:4px solid #111318;line-height:1.2}h2 small{font-size:9pt;color:#4b5060;font-weight:600;margin-left:4px}
  .kpis{display:grid;grid-template-columns:repeat(7,1fr);border:1.5px solid #111318;border-radius:2mm;overflow:hidden}.kpis div{padding:2mm 2.5mm;border-left:1px solid #9aa0ab}.kpis div:first-child{border-left:0}
  .kpis small{display:block;font-size:8pt;font-weight:700;color:#4b5060;white-space:nowrap}.kpis b{font-size:16pt;line-height:1.25}.kpis em{font-style:normal;font-size:9pt;font-weight:600;color:#4b5060;margin-left:1px}
  .kpis .bad{background:#fdecea}.kpis .bad b{color:#b91c1c}.kpis .warn{background:#fff4dc}.kpis .warn b{color:#9a3412}.kpis .ok b{color:#15803d}
  table{width:100%;border-collapse:collapse;border:1.5px solid #111318}
  th,td{border:1px solid #a9aeb8;padding:1.6mm 1.4mm;vertical-align:middle}
  th{background:#e9ecf1;font-size:8.5pt;font-weight:800;color:#111318;text-align:left;line-height:1.25;white-space:nowrap}
  .c{text-align:center}
  thead tr:last-child th{border-bottom:1.5px solid #111318}
  .gs{border-left:1.5px solid #111318!important}
  table.ov th{text-align:center}table.ov tr.g th{background:#d9dee6;font-size:9pt}
  table.ov td{font-size:10.5pt;font-variant-numeric:tabular-nums}table.ov tbody tr:nth-child(even) td{background:#f6f7f9}
  table.ov td.cls{font-weight:800;white-space:nowrap;background:#f0f2f5!important}table.ov td.b{font-weight:800}
  table.ov td.z,.z{color:#b3b8c2}table.ov td.bad{color:#b91c1c;font-weight:800}
  td.high{background:#fbd9a5!important;color:#7c2d12;font-weight:800}td.low{background:#f9d0cd!important;color:#991b1b;font-weight:800}
  table.ov tfoot td{border-top:1.5px solid #111318;background:#e9ecf1;font-weight:800;white-space:nowrap}
  table.ckl th{width:16mm;font-size:10pt}table.ckl td{font-size:9.5pt}table.ov td.ck span{display:inline-block;margin:0.4mm 1mm 0.4mm 0;padding:0 1.4mm;border:1px solid #f1a9a3;border-radius:1mm;background:#fdecea;color:#991b1b;font-size:8pt;font-weight:700}
  table.mv td{font-size:9.5pt}
  .gb{display:inline-block;width:14mm;height:2.6mm;border-radius:1.3mm;background:#f472b6;overflow:hidden;vertical-align:middle;border:0.5px solid #9aa0ab}.gb i{display:block;height:100%;background:#3b82f6}
  .tg{display:inline-block;margin:0.2mm 1mm 0.2mm 0;padding:0 1.3mm;border:1px solid currentColor;border-radius:1mm;font-size:8pt;font-weight:800;line-height:1.45;white-space:nowrap}
  .legend{margin:0;padding:1.6mm 2.5mm;border:1px solid #c9cdd4;border-radius:1.5mm;background:#f6f7f9;font-size:8.5pt;color:#2f333b;line-height:1.9}.legend .sw{display:inline-block;width:3.4mm;height:3.4mm;border:1px solid #9aa0ab;border-radius:0.8mm;vertical-align:-0.6mm;margin-left:6px}.sw.high{background:#fbd9a5}.sw.low{background:#f9d0cd}.r{color:#b91c1c}
  .cls-hd{display:grid;grid-template-columns:42mm 1fr;border:1.5px solid #111318;border-radius:2mm;overflow:hidden}
  .cls-hd .nm{display:grid;align-content:center;gap:1.2mm;padding:2.5mm 3.5mm;background:#111318;color:#fff}.cls-hd strong{font-size:24pt;line-height:1}.cls-hd strong em{font-style:normal;font-size:13pt;margin-left:1mm}.cls-hd .nm span{font-size:9.5pt;font-weight:700;white-space:nowrap}.cls-hd .gb{width:100%;border-color:#fff}
  .cls-hd .stats{display:grid;grid-template-columns:repeat(4,1fr)}.cls-hd .stats div{padding:1.1mm 2.5mm;border-left:1px solid #a9aeb8;border-top:1px solid #a9aeb8}.cls-hd .stats div:nth-child(-n+4){border-top:0}
  .cls-hd .stats small{display:block;font-size:8pt;font-weight:700;color:#4b5060;white-space:nowrap}.cls-hd .stats b{font-size:13pt;line-height:1.25}
  .cls-hd .stats .high{background:#fbd9a5}.cls-hd .stats .high b{color:#7c2d12}.cls-hd .stats .low,.cls-hd .stats .bad{background:#f9d0cd}.cls-hd .stats .low b,.cls-hd .stats .bad b{color:#991b1b}
  .notes{display:grid;border:1.5px solid #1d4ed8;border-radius:2mm;overflow:hidden;font-size:9.5pt}.notes .row{display:grid;grid-template-columns:17mm 1fr;border-top:1px solid #bfd0f3}.notes .row:first-child{border-top:0}
  .notes .row>b{display:flex;align-items:center;justify-content:center;background:#e6eefc;color:#1d4ed8;border-right:1px solid #bfd0f3}.notes .row>div,.notes ul{padding:1.6mm 2.5mm}.notes ul{margin:0;padding-left:7mm}.notes li{margin:0.4mm 0}
  .ckt{display:inline-block;margin:0.3mm 1.2mm 0.3mm 0;padding:0 1.6mm;border:1px solid #f1a9a3;border-radius:1mm;background:#fdecea;color:#991b1b;font-weight:700}
  table.st td{font-size:9.5pt;padding:0.9mm 1.4mm;line-height:1.35}table.st tbody tr:nth-child(even) td{background:#f6f7f9}
  table.st .n{width:9mm}table.st .o{width:17mm}table.st .nm{width:21mm;font-weight:800;white-space:nowrap}table.st .g{width:9mm}table.st .fl{width:33mm}table.st .sp{width:16mm}table.st .k{width:10mm}
  table.st td.n{font-weight:700;color:#4b5060}table.st td.g.m{color:#1d4ed8;font-weight:700}table.st td.g.f{color:#be185d;font-weight:700}table.st td.sp{font-size:8.5pt}table.st td.sp .ok{color:#6b7280}table.st td.sp .r{font-size:9pt}
  table.st tr.alert td{background:#fdecea!important}
  table.st tr.moved td{background:#f1ecff!important}table.st tr.moved td.n{box-shadow:inset 1.2mm 0 0 #7c3aed}
  table.st .mvb{display:block;margin-top:0.3mm;font-size:7.5pt;font-weight:800;color:#6d28d9;white-space:nowrap}
  table.mvt{font-size:9pt}table.mvt th{background:#efeafe}table.mvt .n{width:7mm;color:#4b5060}table.mvt .kd{width:20mm}table.mvt .dir{width:24mm;white-space:nowrap}table.mvt .by{width:30mm;font-size:8.5pt;line-height:1.3}
  table.mvt small{color:#4b5060;font-weight:600}table.mvt tbody tr:nth-child(even) td{background:#faf8ff}
  .ksw,.kone{display:inline-block;padding:0 1.6mm;border-radius:1mm;font-size:8pt;font-weight:800;white-space:nowrap}.ksw{background:#ede9fe;color:#6d28d9;border:1px solid #c4b5fd}.kone{background:#e0f2fe;color:#0369a1;border:1px solid #7dd3fc}
  table.mvt .me{font-weight:900;color:#6d28d9;text-decoration:underline;text-underline-offset:0.6mm}
  .mvbox{display:grid;gap:1.5mm}.mvh{display:flex;align-items:baseline;gap:3mm}.mvh b{font-size:10.5pt;color:#6d28d9}.mvh span{font-size:9pt;font-weight:700}.mvh small{margin-left:auto;font-size:8pt;color:#4b5060}
  table.st td.rm{font-size:8pt;line-height:1.35}td.rm .nt{display:inline-block;margin:0 2mm 0.3mm 0;font-weight:700;color:#111318}td.rm .memo{display:block;color:#2f333b}td.rm .memo::before{content:"✎ ";color:#6b7280}
  .box{display:inline-block;width:3.6mm;height:3.6mm;border:1.2px solid #2f333b;border-radius:0.8mm;vertical-align:middle;background:#fff}
  thead{display:table-header-group}tr{break-inside:avoid}
  @media screen{body{background:#e4e2dd}.pages{transform-origin:top left}.page{width:210mm;min-height:297mm;margin:8mm auto;padding:10mm;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.14)}}
  @media print{.bar{display:none}}
  </style></head><body><div class="bar"><b>${esc(data.title)}</b><small>인쇄 창에서 '대상'을 'PDF로 저장'으로 바꾸면 PDF로 받아요</small><button onclick="window.print()">인쇄 · PDF 저장</button></div><div class="pages">${cover}${movesPage}${pages}</div><script>
  function fit(){var w=document.documentElement.clientWidth,pw=document.querySelector('.page')?document.querySelector('.page').offsetWidth+24:0,el=document.querySelector('.pages');if(!pw)return;var s=Math.min(1,w/pw);el.style.zoom=s<1?s:'';}
  window.addEventListener('resize',fit);window.onload=function(){fit();setTimeout(function(){window.print()},400)};
  window.onbeforeprint=function(){document.querySelector('.pages').style.zoom=''};window.onafterprint=fit;
  <\/script></body></html>`);
  win.document.close();
  return true;
}
