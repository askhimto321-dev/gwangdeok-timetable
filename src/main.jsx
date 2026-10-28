import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import './theme.css'
import { applyUiModeToDocument } from './uiMode.js'
import { applyViewPrefs } from './viewPrefs.js'
import { installChunkReloadHandler } from './chunkReload.js'

applyUiModeToDocument()
applyViewPrefs()
// 배포 확인용: 개발자 도구에서 document.documentElement.dataset.build로 지금 올라간 버전을 봅니다.
try { document.documentElement.dataset.build = __KD_BUILD__ } catch { /* ignore */ }
installChunkReloadHandler()

// 앱(PWA): 배포된 사이트에서만 서비스 워커를 등록합니다(개발 서버에서는 캐시가 헷갈리게 해서 끔).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
// 설치 안내 버튼이 쓸 수 있게 브라우저의 설치 신호를 미리 받아 둡니다.
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); window.__kdInstallPrompt = event; window.dispatchEvent(new Event('kd:installable')) })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
