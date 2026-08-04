"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LeadReadiness, Opportunity, OpportunityStatus, OrganizationContact, ServiceDefinition } from "@/lib/types";
import { opportunityBand } from "@/lib/scoring";

const statuses: OpportunityStatus[] = ["new", "reviewed", "contacted", "replied", "discovery_call", "pilot", "proposal", "won", "lost", "snoozed"];
const readinessRank: Record<LeadReadiness, number> = { ready_to_contact: 0, needs_enrichment: 1, research_only: 2 };

function contactHref(contact: OrganizationContact): string {
  if (contact.kind === "email") return `mailto:${contact.value}`;
  if (contact.kind === "phone") return `tel:${contact.value.replace(/[^+\d]/g, "")}`;
  return contact.value;
}

function ContactTarget({ opportunity }: { opportunity: Opportunity }) {
  const person = opportunity.person;
  return <div className="contact-target">
    <p className="eyebrow">Who to contact</p>
    <div className="contact-name">
      <div className="avatar">{person?.name ? person.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join("") : "?"}</div>
      <div><strong>{person?.name || opportunity.buyerRole}</strong><span>{person?.name ? person.role : "Recommended buyer role"}</span></div>
    </div>
    <span className="badge">{person?.verificationLevel.replaceAll("_", " ") || "target role"}</span>
    <div className="contact-score"><strong>{opportunity.contactability}%</strong><span>contactability</span></div>
    <div className="contact-links">
      {person?.professionalUrl && <a href={person.professionalUrl} target="_blank" rel="noreferrer">Professional page ↗</a>}
      {person?.email && <a href={`mailto:${person.email}`}>{person.email}</a>}
      {person?.contactUrl && <a href={person.contactUrl} target="_blank" rel="noreferrer">Official person/contact route ↗</a>}
      {opportunity.contacts.map((contact) => <div className="direct-contact" key={contact.id}>
        <a href={contactHref(contact)} target={contact.kind === "contact_form" ? "_blank" : undefined} rel={contact.kind === "contact_form" ? "noreferrer" : undefined}>
          <span>{contact.label}</span>{contact.value}{contact.kind === "contact_form" ? " ↗" : ""}
        </a>
        <a className="contact-source" href={contact.sourceUrl} target="_blank" rel="noreferrer" title="Verification source">verified source ↗</a>
      </div>)}
      {!opportunity.contacts.length && !person?.email && !person?.contactUrl && <span className="contact-missing">No direct public contact found yet.</span>}
      {!opportunity.contacts.length && <a href={opportunity.organizationWebsite} target="_blank" rel="noreferrer">Company website ↗</a>}
    </div>
  </div>;
}

export function OpportunitiesClient({ services }: { services: ServiceDefinition[] }) {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [query, setQuery] = useState("");
  const [service, setService] = useState("all");
  const [country, setCountry] = useState("all");
  const [status, setStatus] = useState("all");
  const [readiness, setReadiness] = useState("actionable");
  const [order, setOrder] = useState<"recommended" | "score" | "dual">("recommended");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/opportunities", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load opportunities.");
      setItems(data.opportunities); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load opportunities."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const hash = window.location.hash.replace("#opportunity-", "");
    if (hash) { setExpanded(hash); setReadiness("all"); }
  }, []);
  const countries = useMemo(() => Array.from(new Set(
    items.map((item) => item.country?.trim()).filter((value): value is string => Boolean(value)),
  )).sort((a, b) => a.localeCompare(b)), [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const haystack = `${item.title} ${item.organizationName} ${item.needStatement} ${item.country}`.toLowerCase();
    const readinessMatch = readiness === "all"
      || (readiness === "actionable" && item.leadReadiness !== "research_only")
      || item.leadReadiness === readiness;
    return (!query || haystack.includes(query.toLowerCase())) && (service === "all" || item.serviceId === service)
      && (country === "all" || item.country?.trim() === country)
      && (status === "all" || item.status === status) && readinessMatch;
  }).sort((a, b) => {
    if (order === "score") return b.score - a.score || b.confidence - a.confidence || b.buyerIntent - a.buyerIntent;
    if (order === "dual") return Number(b.engagementMode === "dual") - Number(a.engagementMode === "dual")
      || b.score - a.score || b.confidence - a.confidence;
    return readinessRank[a.leadReadiness] - readinessRank[b.leadReadiness]
      || b.buyerIntent - a.buyerIntent || b.score - a.score || b.confidence - a.confidence;
  }), [items, query, service, country, status, readiness, order]);

  async function update(id: string, nextStatus: OpportunityStatus) {
    const response = await fetch(`/api/opportunities/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not update opportunity."); return; }
    await load();
  }
  async function copy(id: string, value: string) {
    await navigator.clipboard.writeText(value); setCopied(id); window.setTimeout(() => setCopied(""), 1800);
  }
  async function refreshCards() {
    setRefreshing(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/opportunities/refresh", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start the refresh.");
      setNotice("Refresh queued. Open Monitor to follow, pause or stop it safely.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start the refresh."); }
    finally { setRefreshing(false); }
  }

  return <>
    <div className="panel panel-pad opportunity-toolbar">
      <input className="input" placeholder="Search a company, need or market…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select className="select" value={service} onChange={(event) => setService(event.target.value)}><option value="all">All services</option>{services.map((item) => <option value={item.id} key={item.id}>{item.shortName}</option>)}</select>
      <select className="select" aria-label="Filter opportunities by country" value={country} onChange={(event) => setCountry(event.target.value)}>
        <option value="all">All countries</option>
        {countries.map((item) => <option value={item} key={item}>{item}</option>)}
      </select>
      <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All active statuses</option>{statuses.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}</select>
      <select className="select" value={readiness} onChange={(event) => setReadiness(event.target.value)}>
        <option value="actionable">Actionable leads</option><option value="ready_to_contact">Ready to contact</option><option value="needs_enrichment">Needs enrichment</option><option value="research_only">Research only</option><option value="all">All readiness levels</option>
      </select>
      <select className="select" aria-label="Order opportunities" value={order} onChange={(event) => setOrder(event.target.value as "recommended" | "score" | "dual")}>
        <option value="recommended">Recommended order</option>
        <option value="score">Highest score first</option>
        <option value="dual">Dual offers first</option>
      </select>
      <button className="button secondary" disabled={refreshing} onClick={() => void refreshCards()}>{refreshing ? "Queuing…" : "Refresh cards"}</button>
      <strong>{filtered.length} card{filtered.length === 1 ? "" : "s"}</strong>
    </div>
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice} <a href="/monitor">Open Monitor →</a></div>}
    <div className="opportunity-list">
      {filtered.map((opportunity) => {
        const open = expanded === opportunity.id;
        const band = opportunityBand(opportunity.score, opportunity.confidence);
        return <article id={`opportunity-${opportunity.id}`} className={`panel opportunity-card status-${opportunity.status} ${open ? "open" : ""}`} key={opportunity.id}>
          <button className="opportunity-summary" onClick={() => setExpanded(open ? null : opportunity.id)}>
            <div className="score-stack"><div className="score-ring large" style={{ "--score": opportunity.score } as React.CSSProperties}><strong>{opportunity.score}</strong></div><small>fit score</small></div>
            <div className="opportunity-title">
              <div className="toolbar">{opportunity.engagementMode === "dual" && <span className="badge hiring">Hiring · Job + Freelance</span>}<span className={`badge readiness-${opportunity.leadReadiness}`}>{opportunity.leadReadiness.replaceAll("_", " ")}</span><span className={`badge ${band}`}>{band}</span><span className={`badge ${opportunity.needKind}`}>{opportunity.needKind} need</span><span className="badge pipeline-status">{opportunity.status.replaceAll("_", " ")}</span></div>
              <h2>{opportunity.title}</h2>
              <p><a href={opportunity.organizationWebsite} onClick={(event) => event.stopPropagation()} target="_blank" rel="noreferrer">{opportunity.organizationName} ↗</a> · {opportunity.country || "Worldwide"} · {opportunity.serviceName}</p>
              <strong className="need-line">{opportunity.needStatement}</strong>
            </div>
            <div className="lead-metrics"><span><strong>{opportunity.buyerIntent}%</strong>buyer intent</span><span><strong>{opportunity.contactability}%</strong>contactability</span><span><strong>{opportunity.confidence}%</strong>evidence</span></div>
            <span className="expand-mark">{open ? "−" : "+"}</span>
          </button>
          {open && <div className="opportunity-detail">
            <div className="detail-main">
              {opportunity.engagementMode === "dual" && <section className="dual-opportunity"><p className="eyebrow">Dual opportunity</p><strong>Hiring for {opportunity.hiringRole}</strong><p>The outreach below expresses interest in joining the team and offers an immediate freelance pilot as a second collaboration path.</p></section>}
              <section><p className="eyebrow">Why now</p><p className="detail-copy">{opportunity.whyNow}</p></section>
              <section><div className="section-head"><div><p className="eyebrow">Public evidence</p><h3>{opportunity.evidence.length} supporting signal{opportunity.evidence.length === 1 ? "" : "s"}</h3></div></div>
                <div className="evidence-list">{opportunity.evidence.map((evidence) => <a href={evidence.sourceUrl} target="_blank" rel="noreferrer" className="evidence" key={evidence.id}><span className={`evidence-kind ${evidence.claimKind}`}>{evidence.claimKind}</span><div><strong>{evidence.claim}</strong><p>“{evidence.excerpt}”</p><small>{evidence.signalType.replaceAll("_", " ")} · source quality {evidence.sourceQuality}/100</small></div><span>↗</span></a>)}</div>
              </section>
              <section className="message-preview"><div className="section-head"><div><p className="eyebrow">Suggested outreach</p><h3>{opportunity.subject}</h3></div><button className="button secondary" onClick={() => void copy(opportunity.id, opportunity.shortMessage)}>{copied === opportunity.id ? "Copied" : "Copy message"}</button></div><p className="hook"><span>Hook</span>{opportunity.hook}</p><pre>{opportunity.shortMessage}</pre><details><summary>Longer version and follow-up</summary><h4>Long version</h4><pre>{opportunity.longMessage}</pre><h4>Follow-up</h4><pre>{opportunity.followUp}</pre></details></section>
            </div>
            <aside><ContactTarget opportunity={opportunity} /><div className="proof-box"><p className="eyebrow">Best proof to show</p><strong>{opportunity.proofProject}</strong><p>{opportunity.openingQuestion}</p></div><div className="status-actions"><label className="field"><span>Pipeline status</span><select className="select" value={opportunity.status} onChange={(event) => void update(opportunity.id, event.target.value as OpportunityStatus)}>{statuses.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}</select></label><button className="button danger" onClick={() => void update(opportunity.id, "eliminated")}>Eliminate</button></div></aside>
          </div>}
        </article>;
      })}
      {!filtered.length && <div className="panel empty"><strong>No matching opportunity cards</strong>Change the readiness filter or start a radar run. Research-only hypotheses are hidden from the actionable view.</div>}
    </div>
  </>;
}
