// 빌드 때 로그인 서버 환경변수를 서버 함수 코드에 넣어 둡니다.
// Netlify에서 사용자 환경변수가 실행 중인 함수(Functions v2)에 안 들어오는 경우가 있어서입니다.
// 이 파일은 서버 함수 묶음에만 들어가고, 화면(dist)에는 들어가지 않습니다. git에도 올리지 않습니다.
import { writeFileSync } from "node:fs";

const NAMES = ["FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "KAKAO_REST_API_KEY", "KAKAO_CLIENT_SECRET", "SESSION_SECRET"];
const values = Object.fromEntries(NAMES.filter(name => process.env[name]).map(name => [name, process.env[name]]));
writeFileSync(new URL("../netlify/lib/buildEnv.generated.mjs", import.meta.url), `// 자동 생성(빌드 때) — 수정·커밋하지 마세요\nexport default ${JSON.stringify(values)};\n`);
console.log(`login server env at build: ${NAMES.map(name => `${name}=${values[name] ? "있음" : "없음"}`).join(", ")}`);
