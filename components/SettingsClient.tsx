"use client";

import { useEffect, useState } from "react";
import type { ServiceDefinition } from "@/lib/types";

type Provider = { provider: "codex" | "openai" | "anthropic"; label: string; configured: boolean; active: boolean; model: string; message: string };
type Status = {
  llm: { active: Provider["provider"]; model: string; providers: Provider[]; fallbacks: string[] };
  codex: { available: boolean; authenticated: boolean; executable: string; message: string };
  exa: { configured: boolean; enabled: boolean; message: string };
  franceNum: { configured: boolean; enabled: boolean; message: string };
  connectors: Array<{ id: string; label: string; configured: boolean; enabled: boolean; message: string }>;
  storage: string;
};

export function SettingsClient({ services }: { services: ServiceDefinition[] }) {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => { void fetch(`/api/status?t=${Date.now()}`, { cache: "no-store" }).then((response) => response.json()).then(setStatus); }, []);
  return <div className="settings-stack">
    <section className="panel panel-pad">
      <div className="section-head"><div><p className="eyebrow">Intelligence provider</p><h2>Choose one analysis engine</h2></div><span className="badge running">{status ? `${status.llm.active} active` : "Checking…"}</span></div>
      <div className="grid grid-3">
        {(status?.llm.providers || [
          { provider: "codex", label: "Codex CLI", configured: false, active: false, model: "", message: "Checking…" },
          { provider: "openai", label: "OpenAI API", configured: false, active: false, model: "", message: "Checking…" },
          { provider: "anthropic", label: "Anthropic Claude", configured: false, active: false, model: "", message: "Checking…" },
        ]).map((provider) => <article className={`connector-card provider-card ${provider.active ? "active-provider" : ""}`} key={provider.provider}>
          <span className={`connector-status ${provider.configured ? "ready" : ""}`} />
          <div><div className="provider-heading"><h3>{provider.label}</h3>{provider.active && <span>Active</span>}</div><strong>{provider.configured ? (provider.provider === "codex" ? "Ready" : "Key configured") : "Configuration needed"}</strong><p>{provider.message}</p>{provider.model && <code>{provider.model}</code>}</div>
        </article>)}
      </div>
      <p className="notice provider-notice">Provider selection is server-side: set <code>OPPORTUNITY_RADAR_LLM_PROVIDER</code> to <code>codex</code>, <code>openai</code>, or <code>anthropic</code> in <code>.env.local</code>, then restart the app. Keys are never returned to the browser.</p>
    </section>
    <section className="grid grid-2">
      {(status?.connectors || [
        { id: "loading", label: "Discovery connectors", configured: false, enabled: false, message: "Checking configuration…" },
      ]).map((connector) => <article className="panel connector-card" key={connector.id}>
        <span className={`connector-status ${connector.enabled ? "ready" : ""}`} />
        <div><h3>{connector.label}</h3><strong>{connector.enabled ? "Ready" : connector.configured ? "Disabled" : "Configuration needed"}</strong><p>{connector.message}</p></div>
      </article>)}
    </section>
    <section className="panel panel-pad">
      <div className="section-head"><div><p className="eyebrow">Commercial catalogue</p><h2>Your four sellable offers</h2></div></div>
      <div className="service-grid">{services.map((service) => <article key={service.id}><span>{service.shortName}</span><h3>{service.name}</h3><p>{service.promise}</p><strong>{service.proofProject}</strong><a href={service.proofUrl} target="_blank" rel="noreferrer">Open proof ↗</a></article>)}</div>
    </section>
    <section className="panel panel-pad privacy-panel">
      <div><p className="eyebrow">Evidence and privacy boundary</p><h2>Facts stay facts. Hypotheses stay labelled.</h2></div>
      <ul><li>Only public company pages and permitted APIs are collected.</li><li>Named people require a verifiable professional source.</li><li>Email addresses are never constructed from guessed patterns.</li><li>LinkedIn remains a manual click-out, never an automated source.</li><li>Nothing is sent automatically; every outreach message requires your decision.</li></ul>
    </section>
    <section className="panel panel-pad">
      <div className="section-head"><div><p className="eyebrow">Local configuration</p><h2>Runtime</h2></div></div>
      <dl className="settings-dl">
        <div><dt>Active intelligence</dt><dd><strong>{status?.llm.active || "Checking…"}</strong> · <code>{status?.llm.model || "Checking…"}</code></dd></div>
        <div><dt>Paid fallback chain</dt><dd>{status?.llm.fallbacks.length ? status.llm.fallbacks.join(" → ") : "Disabled (recommended default)"}</dd></div>
        <div><dt>Storage</dt><dd>{status?.storage || "Local SQLite"}</dd></div>
        <div><dt>Codex executable</dt><dd><code>{status?.codex.executable || "Checking…"}</code></dd></div>
        <div><dt>Environment</dt><dd><code>.env.local</code> in this project only</dd></div>
      </dl>
    </section>
  </div>;
}

