"use client";

import { useCallback, useEffect, useState } from "react";
import type { ResearchRun } from "@/lib/types";
import { RunMonitor } from "@/components/RunMonitor";

export function MonitorClient() {
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [selected, setSelected] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/runs?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    setRuns(data.runs || []);
    setSelected((current) => current || data.activeRun?.id || data.runs?.[0]?.id || "");
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 4000); return () => clearInterval(timer); }, [load]);
  return <div className="monitor-layout">
    <aside className="panel run-history">
      <div className="section-head"><div><p className="eyebrow">Research history</p><h3>{runs.length} runs</h3></div></div>
      {runs.map((run) => <button key={run.id} className={selected === run.id ? "active" : ""} onClick={() => setSelected(run.id)}>
        <span className={`queue-state ${run.status}`} /><div><strong>{run.label}</strong><small>{new Date(run.createdAt).toLocaleString()} · {run.opportunitiesCreated} cards</small></div><span>{run.progress}%</span>
      </button>)}
      {!runs.length && <div className="empty"><strong>No runs yet</strong>Start from the Radar page.</div>}
    </aside>
    <div>{selected ? <RunMonitor runId={selected} /> : <div className="panel empty"><strong>Select a research run</strong>Live activity, queue state and failures appear here.</div>}</div>
  </div>;
}
