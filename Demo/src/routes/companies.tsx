import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ORGANIZATIONS } from "@/demo/data";

export const Route = createFileRoute("/companies")({
  head: () => ({
    meta: [
      { title: "Companies — Opportunity Radar demo" },
      {
        name: "description",
        content: "Mapped companies discovered from public sources, with services, verticals and analysis dates.",
      },
      { property: "og:title", content: "Companies — Opportunity Radar demo" },
      {
        property: "og:description",
        content: "Companies mapped from tenders, ATS pages and official websites.",
      },
    ],
  }),
  component: CompaniesPage,
});

function host(value: string) {
  return value.replace(/^https?:\/\//, "").replace(/^www\./, "");
}

function CompaniesPage() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  const countries = Array.from(new Set(ORGANIZATIONS.map((item) => item.country))).sort();

  const filtered = useMemo(
    () =>
      ORGANIZATIONS.filter((item) => {
        const haystack = `${item.name} ${item.description} ${item.services.join(" ")} ${item.verticals.join(" ")}`;
        return (
          haystack.toLowerCase().includes(query.toLowerCase()) && (country === "all" || item.country === country)
        );
      }),
    [query, country],
  );

  return (
    <>
      <header className="page-header">
        <p className="eyebrow">Mapped market</p>
        <h2>Companies on the radar</h2>
        <p className="lede">
          Organizations collected from official websites, procurement feeds and public job pages, then deduplicated
          before analysis.
        </p>
      </header>

      <div className="panel panel-pad opportunity-toolbar">
        <input
          className="input"
          placeholder="Search mapped companies…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select className="select" value={country} onChange={(event) => setCountry(event.target.value)}>
          <option value="all">All markets</option>
          {countries.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <span />
        <strong>{filtered.length} companies</strong>
      </div>

      <div className="company-grid">
        {filtered.map((organization) => (
          <article className="panel company-card" key={organization.id}>
            <div className="company-top">
              <div className="company-logo">{organization.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <h2>{organization.name}</h2>
                <a href={organization.website}>{host(organization.website)} ↗</a>
              </div>
            </div>
            <p>{organization.description}</p>
            <div className="tag-list">
              {[...organization.services, ...organization.verticals].map((tag) => (
                <span key={`${organization.id}-${tag}`}>{tag}</span>
              ))}
            </div>
            <dl>
              <div>
                <dt>Market</dt>
                <dd>
                  {organization.city}, {organization.country}
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{organization.sourceType.replaceAll("-", " ")}</dd>
              </div>
              <div>
                <dt>Last analyzed</dt>
                <dd>{organization.lastScannedAt}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="panel empty">
          <strong>No mapped companies yet</strong>
          Use the Radar page to import official company sources.
        </div>
      )}
    </>
  );
}
