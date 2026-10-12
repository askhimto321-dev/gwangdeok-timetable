import test from "node:test";
import assert from "node:assert/strict";
import { featureAllowed, toggleFeature } from "../src/staffPermissions.js";

test("역할별 기본값: 반별 성적은 모든 역할 기본 켜짐, 최소성취수준은 교과담임만 꺼짐", () => {
  assert.equal(featureAllowed({ teacherRole: "homeroom", homeroomClass: "3" }, "classGrades"), true);
  assert.equal(featureAllowed({ teacherRole: "gradeHead" }, "classGrades"), true);
  assert.equal(featureAllowed({ teacherRole: "other" }, "classGrades"), true);
  assert.equal(featureAllowed({ teacherRole: "other" }, "minimum"), false);
  assert.equal(featureAllowed({ accountType: "department" }, "classGrades"), true);
  assert.equal(featureAllowed({ teacherRole: "other" }, "gradeCompare"), true);
  assert.equal(featureAllowed(null, "classGrades", { admin: true }), true);
  assert.equal(featureAllowed(null, "classGrades"), false);
});

test("관리자가 켜고 끄면 계정값이 우선, 기본값으로 돌아오면 저장값 지움", () => {
  let t = { id: "baek", teacherRole: "other" };
  t = toggleFeature(t, "classGrades");
  assert.equal(featureAllowed(t, "classGrades"), false);
  assert.deepEqual(t.featureAccess, { classGrades: false });
  t = toggleFeature(t, "classGrades");
  assert.equal(featureAllowed(t, "classGrades"), true);
  assert.deepEqual(t.featureAccess, {});
  const h = toggleFeature({ teacherRole: "homeroom", homeroomClass: "2" }, "minimum");
  assert.equal(featureAllowed(h, "minimum"), false);
});
