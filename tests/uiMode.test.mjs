import test from "node:test";
import assert from "node:assert/strict";
import { mapColor, mapStyleObject, mapCssText, mapElementProps } from "../src/uiMode.js";

const lightness = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) + ((n >> 8) & 255) + (n & 255)) / 3; };

test("기존 UI는 색을 전혀 바꾸지 않는다", () => {
  const style = { background: "#fff", color: "#2b2620" };
  assert.equal(mapStyleObject(style, "classic"), style);
  assert.equal(mapColor("#fff", "bg", "classic"), "#fff");
});

test("다크: 밝은 배경은 어둡게, 어두운 글자는 밝게", () => {
  assert.ok(lightness(mapColor("#ffffff", "bg", "dark")) < 70);
  assert.ok(lightness(mapColor("#2b2620", "text", "dark")) > 200);
  assert.equal(mapColor("#faf8f3", "bg", "dark"), "#111215");
  // 흰 글자(진한 버튼 위)는 그대로 둔다
  assert.equal(mapColor("#fff", "text", "dark"), "#ffffff");
});

test("다크: 흰 카드가 페이지 바탕보다 한 단계 밝다", () => {
  assert.ok(lightness(mapColor("#ffffff", "bg", "dark")) > lightness(mapColor("#faf8f3", "bg", "dark")));
});

test("새 UI는 기존 초록 강조색을 주황으로 바꾼다", () => {
  const light = mapColor("#3d5c3a", "bg", "light");
  const n = parseInt(light.slice(1), 16);
  assert.ok((n >> 16) > ((n >> 8) & 255) && (n >> 16) > (n & 255));
});

test("라이트: 흰색은 흰색, 알파 값은 유지", () => {
  assert.equal(mapColor("#ffffff", "bg", "light"), "#ffffff");
  assert.match(mapColor("rgba(255,255,255,.5)", "bg", "dark"), /^rgba\(.*0\.5\)$/);
});

test("CSS 문자열은 색 속성만 바꾸고 선택자는 건드리지 않는다", () => {
  const css = "a:hover{color:#2b2620;border:1px solid #e6e1d3;width:10px}";
  const out = mapCssText(css, "dark");
  assert.ok(out.startsWith("a:hover{color:#"));
  assert.ok(!out.includes("#2b2620") && !out.includes("#e6e1d3"));
  assert.ok(out.includes("width:10px"));
});

test("JSX props: style · SVG fill · 아이콘 color를 변환한다", () => {
  const props = mapElementProps("rect", { fill: "#ffffff", style: { color: "#2b2620" } }, "dark");
  assert.notEqual(props.fill, "#ffffff");
  assert.notEqual(props.style.color, "#2b2620");
  const icon = mapElementProps(function Icon() {}, { color: "#2b2620" }, "dark");
  assert.notEqual(icon.color, "#2b2620");
  const same = { style: { color: "#2b2620" } };
  assert.equal(mapElementProps("div", same, "classic"), same);
});

test("새 UI: 흰 글자 + 진한 파랑·갈색 채움(선택된 버튼)은 강조색으로 통일", () => {
  const blue = mapStyleObject({ background: "#3568a3", color: "#fff", border: "1px solid #3568a3" }, "dark");
  assert.equal(blue.background, "var(--kdn-accent)");
  assert.equal(blue.color, "var(--kdn-accent-ink)");
  assert.equal(blue.border, "1px solid var(--kdn-accent)");
  const brown = mapStyleObject({ background: "#8a5c4b", color: "#ffffff" }, "light");
  assert.equal(brown.background, "var(--kdn-accent)");
});

test("새 UI: 빨강(경고) · 초록(충족) 상태색은 강조색으로 바꾸지 않는다", () => {
  assert.notEqual(mapStyleObject({ background: "#b3413a", color: "#fff" }, "dark").background, "var(--kdn-accent)");
  assert.notEqual(mapStyleObject({ background: "#1f8a4c", color: "#fff" }, "dark").background, "var(--kdn-accent)");
});

test("새 UI: 진한 그라데이션 배너는 단색 패널로, 기존 UI는 그대로", () => {
  const banner = { background: "linear-gradient(135deg,#66558e,#7d6195)", color: "#fff" };
  assert.equal(mapStyleObject(banner, "dark").background, "var(--kdn-panel)");
  assert.equal(mapStyleObject(banner, "classic"), banner);
});

test("새 UI 가독성: 작은 글자만 한 단계 키운다", async () => {
  const { readableFontSize } = await import("../src/uiMode.js");
  assert.equal(readableFontSize(9), 11.5);
  assert.equal(readableFontSize(11), 12);
  assert.equal(readableFontSize(14), 14);
  assert.equal(readableFontSize("10px"), "11.5px");
  assert.equal(readableFontSize("1.2em"), "1.2em");
  assert.equal(mapStyleObject({ fontSize: 10 }, "dark").fontSize, 11.5);
  assert.equal(mapStyleObject({ fontSize: 10 }, "classic").fontSize, 10);
});

test("새 UI 해상도: 화면 너비 컨테이너만 넓히고 기존 UI는 그대로", async () => {
  const { wideMaxWidth } = await import("../src/uiMode.js");
  assert.equal(wideMaxWidth(1040), "min(1440px, calc(100vw - 48px))");
  assert.equal(wideMaxWidth(420), 420);
  assert.equal(mapStyleObject({ maxWidth: 1040 }, "dark").maxWidth, "min(1440px, calc(100vw - 48px))");
  assert.equal(mapStyleObject({ maxWidth: 1040 }, "classic").maxWidth, 1040);
});

test("buttons without a visible edge get a control border in the new UI", async () => {
  const { mapElementProps, withControlBorder } = await import("../src/uiMode.js");
  const seg = withControlBorder({ minHeight: 34, border: 0, background: "transparent" });
  assert.equal(seg.border, "1px solid var(--kdn-control-line)");
  assert.equal(withControlBorder({ minHeight: 40, border: "1px solid transparent" }).border, "1px solid var(--kdn-control-line)");
  assert.equal(withControlBorder({ minHeight: 40, borderWidth: 1, borderStyle: "solid", borderColor: "transparent" }).borderColor, "var(--kdn-control-line)");
  const link = { border: 0, background: "none", padding: "2px 0" };
  assert.equal(withControlBorder(link), link);
  const filled = { minHeight: 40, border: 0, background: "#cf4a12", color: "#fff" };
  assert.equal(withControlBorder(filled), filled);
  const bordered = { minHeight: 40, border: "1px solid #ccc" };
  assert.equal(withControlBorder(bordered), bordered);
  assert.equal(mapElementProps("button", { style: { minHeight: 34, border: 0 } }, "classic").style.border, 0);
  assert.equal(mapElementProps("div", { style: { minHeight: 34, border: 0 } }, "light").style.border, 0);
  assert.equal(mapElementProps("button", { "data-kdn-bare": true, style: { minHeight: 34, border: 0 } }, "light").style.border, 0);
});

test("type hierarchy: headings stay heavy, small labels lighter, gray secondary text regular", async () => {
  const { softenType } = await import("../src/uiMode.js");
  assert.equal(softenType({ fontSize: 26, fontWeight: 900 }).fontWeight, 900);
  assert.equal(softenType({ fontSize: 12, fontWeight: 950, color: "#1f2430" }).fontWeight, 750);
  assert.equal(softenType({ fontSize: 13, fontWeight: 800, color: "#657085" }).fontWeight, 500);
  assert.equal(softenType({ fontSize: 13, fontWeight: 800, color: "#1c4aa8" }).fontWeight, 800);
  const plain = { fontSize: 13, fontWeight: 400 };
  assert.equal(softenType(plain), plain);
});
