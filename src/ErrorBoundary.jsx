import React from "react";
import { isChunkLoadError, reloadForNewVersion } from "./chunkReload.js";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    if (isChunkLoadError(error) && reloadForNewVersion()) { this.setState({ updating: true }); return; }
    console.error("App crashed:", error, info);
  }
  render() {
    if (this.state.updating) {
      return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "sans-serif", color: "#5d6574", fontSize: 15 }}>새 버전으로 업데이트하는 중입니다…</div>;
    }
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: 24,
          fontFamily: "sans-serif", background: "#faf8f3", color: "#2b2620",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
            {isChunkLoadError(this.state.error) ? "새 버전이 배포되었습니다" : "문제가 발생했습니다"}
          </div>
          <div style={{ fontSize: 13, color: "#8a8578", marginBottom: 16, maxWidth: 560 }}>
            {isChunkLoadError(this.state.error) ? "아래 새로고침을 누르면 최신 버전으로 열립니다." : "아래 오류 내용을 캡처해서 전달해주시면 원인을 확인할 수 있습니다."}
          </div>
          <pre style={{
            background: "#fff", border: "1px solid #e6e1d3", borderRadius: 8,
            padding: 16, fontSize: 12, maxWidth: 700, overflow: "auto",
            textAlign: "left", whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {String(this.state.error && (this.state.error.stack || this.state.error.message || this.state.error))}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              marginTop: 16, border: "none", background: "#3d5c3a", color: "#fff",
              padding: "9px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 700,
            }}
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
