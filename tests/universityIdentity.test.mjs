// 대입 사례·NAVI·수능최저 자료의 대학명이 같은 대학으로 연결되는지 확인합니다(2026 전수조사 사례).
import test from "node:test";
import assert from "node:assert/strict";
import { universityIdentityKey } from "../src/universityIdentity.js";

const same = (a, aRegion, b, bRegion) => assert.equal(universityIdentityKey(a, aRegion), universityIdentityKey(b, bRegion), `${a}(${aRegion}) ≠ ${b}(${bRegion})`);
const differ = (a, aRegion, b, bRegion) => assert.notEqual(universityIdentityKey(a, aRegion), universityIdentityKey(b, bRegion));

test("캠퍼스가 하나인 대학은 괄호 속 소재지를 무시한다", () => {
  same("백석대학교(천안)", "충남", "백석대", "충남");
  same("수원대학교(수원)", "경기", "수원대", "경기");
  same("인하대학교(인천)", "인천", "인하대", "인천");
  same("성균관대학교(수원)", "경기", "성균관대", "서울");
  same("한경국립대학교(안성)", "경기", "한경국립대", "경기");
  same("국립공주대학교(천안)", "충남", "국립공주대", "충남");
});

test("하이픈 뒤 캠퍼스·학부 설명을 떼어낸다", () => {
  same("중부대학교(금산) - 충청캠퍼스", "충남", "중부대", "충남");
  same("한서대학교(태안) -항공학부", "충남", "한서대", "충남");
  same("한국외국어대학교(용인) - 글로벌캠퍼스", "경기", "한국외대", "경기");
});

test("정식 명칭·통합 전 이름을 NAVI 표기로 맞춘다", () => {
  same("부산외국어대학교(부산)", "부산", "부산외대", "부산");
  same("국립금오공과대학교(구미)", "경북", "국립금오공대", "경북");
  same("국립안동대학교(안동)", "경북", "국립경국대", "경북");
  same("차의과대", "", "차의과학대", "경기");
  same("KENTECH(한국에너지공과대)", "", "한국에너지공과대", "전남");
});

test("여러 캠퍼스를 따로 모집하는 대학은 구분한다", () => {
  differ("한양대학교(서울)", "서울", "한양대(ERICA)", "경기");
  differ("연세대학교(서울)", "서울", "연세대(미래)", "강원");
  same("연세대학교(서울)", "서울", "연세대", "인천");
  differ("고려대", "서울", "고려대(세종)", "세종");
  same("가천대학교(성남)", "경기", "가천대", "경기");
});
