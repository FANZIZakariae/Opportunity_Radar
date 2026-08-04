"use client";

import { useEffect, useMemo, useState } from "react";
import type { Organization } from "@/lib/types";

function sourceHost(value: string): string {
  try { return new URL(value).hostname.replace(/^www\./, ""); }
  catch { return "official source"; }
}

function uniqueLabels(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map((value) => value.trim()).filter((value) => {
    const key = value.normalize("NFKC").toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function CompaniesClient() {
  const [items, setItems] = useState<Organization[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  useEffect(() => { void fetch("/api/companies", { cache: "no-store" }).then((response) => response.json()).then((data) => {
    setItems(data.organizations || []);
    setCountries(data.countries || []);
  }); }, []);
  const filtered = useMemo(() => items.filter((item) => {
    const match = `${item.name} ${item.description} ${item.services.join(" ")} ${item.verticals.join(" ")}`.toLowerCase().includes(query.toLowerCase());
    return match && (country === "all" || item.country === country);
  }), [items, query, country]);
  return <>
    <div className="panel panel-pad opportunity-toolbar">
      <input className="input" placeholder="Search mapped companies…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select className="select" value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">All markets</option>{countries.map((item) => <option key={item}>{item}</option>)}</select>
      <strong>{filtered.length} companies</strong>
    </div>
    <div className="company-grid">{filtered.map((organization) => <article className="panel company-card" key={organization.id}>
      <div className="company-top"><div className="company-logo">{organization.name.slice(0, 2).toUpperCase()}</div><div><h2>{organization.name}</h2><a href={organization.website} target="_blank" rel="noreferrer">{sourceHost(organization.website)} ↗</a></div></div>
      <p>{organization.description || "Waiting for the first evidence analysis."}</p>
      <div className="tag-list">{uniqueLabels([...organization.services, ...organization.verticals]).slice(0, 8).map((item) => <span key={`${organization.id}:tag:${item.normalize("NFKC").toLocaleLowerCase()}`}>{item}</span>)}</div>
      <dl><div><dt>Market</dt><dd>{[organization.city, organization.country].filter(Boolean).join(", ") || "Worldwide"}</dd></div><div><dt>Source</dt><dd>{organization.sourceType.replaceAll("-", " ")}</dd></div><div><dt>Last analyzed</dt><dd>{organization.lastScannedAt ? new Date(organization.lastScannedAt).toLocaleDateString() : "Queued"}</dd></div></dl>
    </article>)}</div>
    {!filtered.length && <div className="panel empty"><strong>No mapped companies yet</strong>Use the Radar page to import official company sources.</div>}
  </>;
}

