"use client";

import { useCallback, useEffect, useState } from "react";
import type { QueueItem, ResearchRun } from "@/lib/types";

type Detail = { run: ResearchRun; queue: QueueItem[]; events: Array<{ id: number; level: string; stage: string; message: string; createdAt: string }> };

export function RunMonitor({ runId, compact = false, onSettled }: { runId?: string; compact?: boolean; onSettled?: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!runId) { setDetail(null); return; }
    try {
      const response = await fetch(`/api/runs/${runId}?t=${Date.now()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load research run.");
      setDetail(data); setError("");
      if (["completed", "failed", "stopped"].includes(data.run.status)) onSettled?.();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load monitor."); }
  }, [runId, onSettled]);
  useEffect(() => {
    void load();
    if (!runId) return;
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [load, runId]);

  async function control(action: "pause" | "resume" | "stop") {
    if (!runId) return;
    const response = await fetch(`/api/runs/${runId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not control run."); return; }
    await load();
  }

  if (!runId) return null;
  if (!detail) return <div className="panel panel-pad"><p className="muted small">Loading live research monitor…</p>{error && <div className="error-box">{error}</div>}</div>;
  const { run, queue, events } = detail;
  const active = ["queued", "running", "pausing", "paused", "stopping"].includes(run.status);
  const refreshRun = queue.some((item) => item.payload.refresh === true);
  const targetPayload = queue.find((item) => item.kind !== "analyze_organization")?.payload || {};
  const target = refreshRun
    ? Math.max(1, queue.filter((item) => item.kind === "analyze_organization").length)
    : Math.max(1, Number(targetPayload.targetOpportunities ?? targetPayload.maxOrganizations ?? 30));
  return <section className={`panel run-monitor ${compact ? "compact-monitor" : ""}`}>
    <div className="monitor-top">
      <div>
        <div className="toolbar"><span className={`badge ${run.status === "running" ? "running" : run.status === "failed" ? "error" : ""}`}>{run.status}</span><span className="muted small">{run.stage}</span></div>
        <h3>{run.label}</h3>
        <p>{run.message}</p>
      </div>
      <strong className="monitor-percent">{run.progress}%</strong>
    </div>
    <div className="progress"><span style={{ width: `${run.progress}%` }} /></div>
    <div className="monitor-metrics">
      <div><strong>{run.organizationsFound}</strong><span>Candidate companies</span></div>
      <div><strong>{run.organizationsAnalyzed}</strong><span>Analyzed</span></div>
      <div><strong>{run.opportunitiesCreated}/{target}</strong><span>{refreshRun ? "Cards refreshed" : "New valid cards"}</span></div>
      <div><strong>{run.failures}</strong><span>Failures</span></div>
    </div>
    <div className="monitor-actions">
      {active && run.status !== "paused" && <button className="button warning" onClick={() => void control("pause")}>Pause safely</button>}
      {run.status === "paused" && <button className="button" onClick={() => void control("resume")}>Resume</button>}
      {active && <button className="button danger" onClick={() => void control("stop")}>Stop run</button>}
      <a className="button secondary" href="/monitor">Open full monitor</a>
    </div>
    {!compact && <>
      <div className="queue-list">
        {queue.map((item) => <div key={item.id} className="queue-row">
          <span className={`queue-state ${item.status}`} />
          <div><strong>{item.label}</strong><small>{item.kind.replaceAll("_", " ")} · attempt {item.attempts}</small>{item.error && <em>{item.error}</em>}</div>
          <span>{item.status}</span>
        </div>)}
      </div>
      <div className="event-list">
        {events.slice(0, 20).map((event) => <div key={event.id} className={`event ${event.level}`}>
          <time>{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
          <span>{event.message}</span>
        </div>)}
      </div>
    </>}
    {error && <div className="error-box">{error}</div>}
  </section>;
}

