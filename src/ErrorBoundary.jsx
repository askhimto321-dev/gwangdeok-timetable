import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("App crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: 24,
          fontFamily: "sans-serif", background: "#faf8f3", color: "#2b2620",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
            문제가 발생했습니다
          </div>
          <div style={{ fontSize: 13, color: "#8a8578", marginBottom: 16, maxWidth: 560 }}>
            아래 오류 내용을 캡처해서 전달해주시면 원인을 확인할 수 있습니다.
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
