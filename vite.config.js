import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

// 배포 확인용 빌드 표시: Netlify가 주는 커밋(COMMIT_REF) 또는 로컬 git 커밋 + 빌드 시각.
// 사이트 <html data-build="…">와 index.html의 <meta name="kd-build">로 어느 버전이 올라갔는지 확인합니다.
const commit = (process.env.COMMIT_REF || (() => { try { return execSync('git rev-parse HEAD').toString().trim() } catch { return 'local' } })()).slice(0, 7)
const BUILD_ID = `${commit}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`

export default defineConfig({
  // JSX를 src/kdjsx의 런타임으로 컴파일해 화면 모드(기존/다크/라이트)별 색 변환을 한 곳에서 처리합니다.
  plugins: [
    react({ jsxImportSource: '@kdjsx' }),
    { name: 'kd-build-meta', transformIndexHtml: html => html.replace('</head>', `  <meta name="kd-build" content="${BUILD_ID}">\n</head>`) },
  ],
  define: { __KD_BUILD__: JSON.stringify(BUILD_ID) },
  resolve: {
    alias: {
      '@kdjsx/jsx-runtime': fileURLToPath(new URL('./src/kdjsx/jsx-runtime.js', import.meta.url)),
      '@kdjsx/jsx-dev-runtime': fileURLToPath(new URL('./src/kdjsx/jsx-dev-runtime.js', import.meta.url)),
    },
  },
})
