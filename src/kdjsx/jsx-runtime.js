// JSX 자동 런타임 래퍼: 모든 요소가 그려지기 직전에 화면 모드(uiMode.js)에 맞게 색을 변환합니다.
// '기존 UI'에서는 props를 그대로 넘기므로 React 기본 동작과 같습니다.
import { Fragment, jsx as reactJsx, jsxs as reactJsxs } from "react/jsx-runtime";
import { mapElementProps } from "../uiMode.js";

export { Fragment };
export function jsx(type, props, key) { return reactJsx(type, mapElementProps(type, props), key); }
export function jsxs(type, props, key) { return reactJsxs(type, mapElementProps(type, props), key); }
