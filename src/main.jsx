import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import './theme.css'
import { applyUiModeToDocument } from './uiMode.js'
import { installChunkReloadHandler } from './chunkReload.js'

applyUiModeToDocument()
// 배포 확인용: 개발자 도구에서 document.documentElement.dataset.build로 지금 올라간 버전을 봅니다.
try { document.documentElement.dataset.build = __KD_BUILD__ } catch { /* ignore */ }
installChunkReloadHandler()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
