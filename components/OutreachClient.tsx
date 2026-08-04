"use client";

import { useEffect, useMemo, useState } from "react";
import type { Opportunity, OpportunityStatus } from "@/lib/types";

export function OutreachClient() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [copied, setCopied] = useState("");
  const [mode, setMode] = useState<"ready" | "pipeline">("ready");
  const load = () => fetch("/api/opportunities", { cache: "no-store" }).then((response) => response.json()).then((data) => setItems(data.opportunities || []));
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => items.filter((item) => mode === "ready" ? ["new", "reviewed"].includes(item.status) : !["new", "reviewed"].includes(item.status)), [items, mode]);
  async function status(id: string, next: OpportunityStatus) {
    await fetch(`/api/opportunities/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) }); await load();
  }
  async function copy(id: string, text: string) { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(""), 1500); }
  return <>
    <div className="outreach-tabs"><button className={mode === "ready" ? "active" : ""} onClick={() => setMode("ready")}>Ready for review</button><button className={mode === "pipeline" ? "active" : ""} onClick={() => setMode("pipeline")}>Contact pipeline</button></div>
    <div className="outreach-list">{filtered.map((item) => <article className="panel outreach-card" key={item.id}>
      <div className="outreach-meta">{item.engagementMode === "dual" && <span className="badge hiring">Hiring · Job + Freelance</span>}<span className="badge">{item.serviceName}</span><span className="badge">{item.status.replaceAll("_", " ")}</span><span>{item.score}/100 opportunity</span></div>
      <h2>{item.organizationName}</h2>
      <h3>{item.subject}</h3>
      <p className="hook">{item.hook}</p>
      <pre>{item.shortMessage}</pre>
      <div className="outreach-person"><strong>{item.person?.name || item.buyerRole}</strong><span>{item.person?.role || "Recommended buyer role"} · {item.person?.verificationLevel.replaceAll("_", " ") || "not named publicly"}</span></div>
      <div className="toolbar"><button className="button" onClick={() => void copy(item.id, item.shortMessage)}>{copied === item.id ? "Copied" : "Copy outreach"}</button>{["new", "reviewed"].includes(item.status) && <button className="button secondary" onClick={() => void status(item.id, "contacted")}>Mark contacted</button>}<a className="button ghost" href={`/opportunities#opportunity-${item.id}`}>Open evidence</a></div>
    </article>)}</div>
    {!filtered.length && <div className="panel empty"><strong>Nothing in this outreach stage</strong>Opportunity messages only appear after passing the evidence gate.</div>}
  </>;
}
