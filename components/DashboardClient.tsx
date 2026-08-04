"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { DashboardSnapshot } from "@/lib/types";
import { opportunityBand } from "@/lib/scoring";

function Bars({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return <div className="bars">{items.slice(0, 7).map((item) => <div className="bar-row" key={item.label}>
    <div><span>{item.label || "Unknown"}</span><strong>{item.value}</strong></div>
    <i><b style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} /></i>
  </div>)}</div>;
}

function PipelineOverview({ snapshot }: { snapshot: DashboardSnapshot }) {
  const stages = [
    { label: "Waiting", value: snapshot.pipeline.waiting, color: "#d5a637" },
    { label: "Contacted", value: snapshot.pipeline.contacted, color: "#3979c8" },
    { label: "Replied", value: snapshot.pipeline.replied, color: "#7357b5" },
    { label: "Interview", value: snapshot.pipeline.interviews, color: "#13a47a" },
    { label: "Proposal", value: snapshot.pipeline.proposals, color: "#e27c37" },
    { label: "Won", value: snapshot.pipeline.won, color: "#08704f" },
    { label: "Rejected / lost", value: snapshot.pipeline.rejected, color: "#c44d45" },
  ];
  const total = Math.max(0, snapshot.pipeline.total);
  let cursor = 0;
  const segments = stages.map((stage) => {
    const start = total ? (cursor / total) * 100 : 0;
    cursor += stage.value;
    const end = total ? (cursor / total) * 100 : 0;
    return `${stage.color} ${start}% ${end}%`;
  });
  const background = total ? `conic-gradient(${segments.join(", ")})` : "#edf1ef";
  const headline = [
    { label: "Total", value: snapshot.pipeline.total, tone: "total" },
    { label: "Waiting", value: snapshot.pipeline.waiting, tone: "waiting" },
    { label: "Contacted", value: snapshot.pipeline.contacted, tone: "contacted" },
    { label: "Interviews", value: snapshot.pipeline.interviews, tone: "interview" },
    { label: "Rejected", value: snapshot.pipeline.rejected, tone: "rejected" },
    { label: "Won", value: snapshot.pipeline.won, tone: "won" },
  ];
  return <section className="panel panel-pad pipeline-panel">
    <div className="section-head"><div><p className="eyebrow">Application pipeline</p><h2>Where every opportunity stands</h2></div><Link className="button secondary" href="/opportunities">Manage pipeline →</Link></div>
    <div className="pipeline-metrics">{headline.map((item) => <article className={`pipeline-metric ${item.tone}`} key={item.label}>
      <strong>{item.value}</strong><span>{item.label}</span>
    </article>)}</div>
    <div className="pipeline-visual">
      <div className="pipeline-donut" style={{ background }}><div><strong>{total}</strong><span>active total</span></div></div>
      <div className="pipeline-legend">{stages.map((stage) => {
        const percentage = total ? Math.round((stage.value / total) * 100) : 0;
        return <div className="pipeline-stage" key={stage.label}>
          <span className="pipeline-swatch" style={{ background: stage.color }} />
          <div><strong>{stage.label}</strong><i><b style={{ width: `${percentage}%`, background: stage.color }} /></i></div>
          <span>{stage.value}<small>{percentage}%</small></span>
        </div>;
      })}</div>
    </div>
  </section>;
}

export function DashboardClient() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const load = useCallback(() => fetch(`/api/dashboard?t=${Date.now()}`, { cache: "no-store" }).then((response) => response.json()).then(setSnapshot).catch(() => undefined), []);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 5000); return () => window.clearInterval(timer); }, [load]);
  if (!snapshot) return <section className="dashboard-loading panel"><p>Loading radar intelligence…</p></section>;
  const stats = [
    [snapshot.totals.organizations, "Companies mapped"],
    [snapshot.totals.opportunities, "Evidence-backed cards"],
    [snapshot.totals.hot, "Hot opportunities"],
    [snapshot.totals.verifiedPeople, "Verified people"],
  ];
  return <div className="dashboard-stack">
    <section className="grid grid-4">{stats.map(([value, label]) => <article className="panel stat-card" key={label}><strong>{value}</strong><span>{label}</span></article>)}</section>
    <PipelineOverview snapshot={snapshot} />
    <section className="grid dashboard-grid">
      <article className="panel panel-pad">
        <div className="section-head"><div><p className="eyebrow">Market coverage</p><h2>Where signals are appearing</h2></div></div>
        {snapshot.byCountry.length ? <Bars items={snapshot.byCountry} /> : <div className="empty"><strong>No market data yet</strong>Start a radar run to map companies.</div>}
      </article>
      <article className="panel panel-pad">
        <div className="section-head"><div><p className="eyebrow">Service demand</p><h2>What you could sell</h2></div></div>
        {snapshot.byService.length ? <Bars items={snapshot.byService} /> : <div className="empty"><strong>No matched needs yet</strong>Only evidence-backed matches appear here.</div>}
      </article>
    </section>
    <section className="panel panel-pad">
      <div className="section-head"><div><p className="eyebrow">Most recent</p><h2>Actionable opportunities</h2></div><Link className="button secondary" href="/opportunities">View all →</Link></div>
      {snapshot.recentOpportunities.length ? <div className="recent-list">{snapshot.recentOpportunities.map((opportunity) => {
        const band = opportunityBand(opportunity.score, opportunity.confidence);
        return <Link href={`/opportunities#opportunity-${opportunity.id}`} className="recent-row" key={opportunity.id}>
          <div className="score-ring" style={{ "--score": opportunity.score } as React.CSSProperties}><strong>{opportunity.score}</strong></div>
          <div className="recent-main"><div className="toolbar">{opportunity.engagementMode === "dual" && <span className="badge hiring">Hiring</span>}<span className={`badge ${band}`}>{band}</span><span className={`badge ${opportunity.needKind}`}>{opportunity.needKind}</span></div><strong>{opportunity.title}</strong><span>{opportunity.organizationName} · {opportunity.country || "Worldwide"}</span></div>
          <div className="recent-service"><span>{opportunity.serviceName}</span><strong>{opportunity.confidence}% confidence</strong></div>
          <span className="recent-arrow">→</span>
        </Link>;
      })}</div> : <div className="empty"><strong>No opportunity cards yet</strong>The radar refuses to create cards without supporting public evidence.</div>}
    </section>
  </div>;
}
