import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // JSX를 src/kdjsx의 런타임으로 컴파일해 화면 모드(기존/다크/라이트)별 색 변환을 한 곳에서 처리합니다.
  plugins: [react({ jsxImportSource: '@kdjsx' })],
  resolve: {
    alias: {
      '@kdjsx/jsx-runtime': fileURLToPath(new URL('./src/kdjsx/jsx-runtime.js', import.meta.url)),
      '@kdjsx/jsx-dev-runtime': fileURLToPath(new URL('./src/kdjsx/jsx-dev-runtime.js', import.meta.url)),
    },
  },
})
