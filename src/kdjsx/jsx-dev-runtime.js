// 개발 서버용 JSX 런타임 래퍼 (jsx-runtime.js와 같은 역할).
import { Fragment, jsxDEV as reactJsxDEV } from "react/jsx-dev-runtime";
import { mapElementProps } from "../uiMode.js";

export { Fragment };
export function jsxDEV(type, props, key, isStatic, source, self) {
  return reactJsxDEV(type, mapElementProps(type, props), key, isStatic, source, self);
}
