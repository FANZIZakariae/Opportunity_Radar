"use client";

import { useEffect, useState } from "react";
import type { ResearchRun, ServiceDefinition } from "@/lib/types";
import { RunMonitor } from "@/components/RunMonitor";

const defaultQuery = "Find agencies, ERP integrators and growing companies showing concrete needs for document AI, reliable RAG or workflow automation";

export function RadarLauncher({ services }: { services: ServiceDefinition[] }) {
  const [query, setQuery] = useState(defaultQuery);
  const [countries, setCountries] = useState(["France", "Morocco"]);
  const [selectedServices, setSelectedServices] = useState(services.map((service) => service.id));
  const [manualUrls, setManualUrls] = useState("");
  const [targetOpportunities, setTargetOpportunities] = useState(30);
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/runs", { cache: "no-store" }).then((response) => response.json()).then((data) => setRun(data.activeRun || null)).catch(() => undefined);
  }, []);
  const toggleCountry = (country: string) => setCountries((current) => current.includes(country) ? current.filter((item) => item !== country) : [...current, country]);
  const toggleService = (service: string) => setSelectedServices((current) => current.includes(service) ? current.filter((item) => item !== service) : [...current, service]);

  async function start() {
    setBusy(true); setError("");
    try {
      const urls = manualUrls.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean);
      if (!countries.length && !urls.length) throw new Error("Choose at least one market or paste a company URL.");
      const response = await fetch("/api/runs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, countries: countries.length ? countries : ["Manual"], services: selectedServices, manualUrls: urls, targetOpportunities }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start research.");
      setRun(data.run); setExpanded(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start research."); }
    finally { setBusy(false); }
  }

  return <section className="launcher-wrap">
    <div className="panel launcher">
      <div className="launcher-main">
        <div className="launcher-icon">⌁</div>
        <label className="launcher-query"><span>What signal should we look for?</span><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button className="button launch-button" onClick={() => void start()} disabled={busy || Boolean(run && ["queued", "running", "pausing", "paused", "stopping"].includes(run.status))}>
          {busy ? "Starting…" : "Start radar"} <span>→</span>
        </button>
      </div>
      <div className="launcher-chips">
        {["France", "Morocco", "Worldwide"].map((country) => <button key={country} className={`choice-chip ${countries.includes(country) ? "selected" : ""}`} onClick={() => toggleCountry(country)}>{country}</button>)}
        <span className="chip-divider" />
        {services.map((service) => <button key={service.id} className={`choice-chip ${selectedServices.includes(service.id) ? "selected" : ""}`} onClick={() => toggleService(service.id)}>{service.shortName}</button>)}
        <button className="choice-chip options" onClick={() => setExpanded((value) => !value)}>{expanded ? "Less" : "More controls"} ··</button>
      </div>
      {expanded && <div className="launcher-extra">
        <label className="field"><span>Company URLs to analyze immediately <small>(one per line)</small></span><textarea className="textarea" value={manualUrls} onChange={(event) => setManualUrls(event.target.value)} placeholder={"https://example-agency.com\nhttps://another-company.ma"} /></label>
        <label className="field"><span>New valid opportunity target</span><input className="input" type="number" min={1} max={200} value={targetOpportunities} onChange={(event) => setTargetOpportunities(Number(event.target.value))} /><small>Rejected, failed, duplicate and previously known candidates do not count.</small></label>
        <div className="notice">Discovery keeps refilling a larger candidate pool until the valid-card target is reached or every configured source is exhausted. Company pages are read conservatively; the LLM cannot invent contacts.</div>
      </div>}
      {error && <div className="error-box launcher-error">{error}</div>}
    </div>
    {run && <RunMonitor runId={run.id} compact onSettled={() => setRun(null)} />}
  </section>;
}
