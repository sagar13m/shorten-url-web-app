// pages/healthz.js
import { useEffect, useState } from "react";

export default function HealthPage() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/healthz")
      .then((r) => r.json())
      .then((data) => {
        if (mounted) setStatus(data);
      })
      .catch((err) => {
        if (mounted) setStatus({ ok: false, error: err?.message || String(err) });
      });
    return () => (mounted = false);
  }, []);

  if (!status) return <div style={{padding:20}}>Checking server health…</div>;

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h2>Health check</h2>
      <pre style={{ background: "#f3f4f6", padding: 12, borderRadius: 8 }}>
        {JSON.stringify(status, null, 2)}
      </pre>
      <p>
        If you see `{status.ok ? "ok: true" : "ok: false"}`, the server responded.
      </p>
    </div>
  );
}
