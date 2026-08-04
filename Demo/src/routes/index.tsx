import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DASHBOARD, OPPORTUNITIES, RUNS, SERVICES, opportunityBand } from "@/demo/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Radar — Opportunity Radar demo" },
      {
        name: "description",
        content:
          "Radar dashboard demo: pipeline overview, market coverage, service demand and the most recent evidence-backed opportunities.",
      },
      { property: "og:title", content: "Radar — Opportunity Radar demo" },
      {
        property: "og:description",
        content: "Pipeline overview, market coverage and the most recent evidence-backed opportunity cards.",
      },
    ],
  }),
  component: RadarPage,
});

function Bars({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="bars">
      {items.slice(0, 7).map((item) => (
        <div className="bar-row" key={item.label}>
          <div>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
          <i>
            <b style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} />
          </i>
        </div>
      ))}
    </div>
  );
}

function Launcher() {
  const run = RUNS[0]!;

  const [query, setQuery] = useState(
    "Find agencies, ERP integrators and growing companies showing concrete needs for document AI, reliable RAG or workflow automation",
  );
  const [countries, setCountries] = useState<string[]>(["France", "Morocco"]);
  const [services, setServices] = useState<string[]>(SERVICES.map((service) => service.id));
  const [expanded, setExpanded] = useState(false);

  const toggle = (
    value: string,
    list: string[],
    set: (next: string[]) => void,
  ) => set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  return (
    <section className="launcher-wrap">
      <div className="panel launcher">
        <div className="launcher-main">
          <div className="launcher-icon">⌁</div>
          <label className="launcher-query">
            <span>What signal should we look for?</span>
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button className="button launch-button" disabled>
            Radar running <span>→</span>
          </button>
        </div>
        <div className="launcher-chips">
          {["France", "Morocco", "Worldwide"].map((country) => (
            <button
              key={country}
              className={`choice-chip ${countries.includes(country) ? "selected" : ""}`}
              onClick={() => toggle(country, countries, setCountries)}
            >
              {country}
            </button>
          ))}
          <span className="chip-divider" />
          {SERVICES.map((service) => (
            <button
              key={service.id}
              className={`choice-chip ${services.includes(service.id) ? "selected" : ""}`}
              onClick={() => toggle(service.id, services, setServices)}
            >
              {service.shortName}
            </button>
          ))}
          <button className="choice-chip options" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Less" : "More controls"} ··
          </button>
        </div>
        {expanded && (
          <div className="launcher-extra">
            <label className="field">
              <span>
                Company URLs to analyze immediately <small>(one per line)</small>
              </span>
              <textarea
                className="textarea"
                defaultValue={""}
                placeholder={"https://example-agency.com\nhttps://another-company.ma"}
              />
            </label>
            <label className="field">
              <span>New valid opportunity target</span>
              <input className="input" type="number" defaultValue={30} />
              <small>Rejected, failed, duplicate and previously known candidates do not count.</small>
            </label>
            <div className="notice">
              Discovery keeps refilling a larger candidate pool until the valid-card target is reached or every
              configured source is exhausted. Company pages are read conservatively; the LLM cannot invent contacts.
            </div>
          </div>
        )}
      </div>

      <section className="panel run-monitor compact-monitor">
        <div className="monitor-top">
          <div>
            <div className="toolbar">
              <span className="badge running">{run.status}</span>
              <span className="muted small">{run.stage}</span>
            </div>
            <h3>{run.label}</h3>
            <p>{run.message}</p>
          </div>
          <strong className="monitor-percent">{run.progress}%</strong>
        </div>
        <div className="progress">
          <span style={{ width: `${run.progress}%` }} />
        </div>
        <div className="monitor-metrics">
          <div>
            <strong>{run.organizationsFound}</strong>
            <span>Candidate companies</span>
          </div>
          <div>
            <strong>{run.organizationsAnalyzed}</strong>
            <span>Analyzed</span>
          </div>
          <div>
            <strong>
              {run.opportunitiesCreated}/{run.target}
            </strong>
            <span>New valid cards</span>
          </div>
          <div>
            <strong>{run.failures}</strong>
            <span>Failures</span>
          </div>
        </div>
        <div className="monitor-actions">
          <button className="button warning">Pause safely</button>
          <button className="button danger">Stop run</button>
          <Link className="button secondary" to="/monitor">
            Open full monitor
          </Link>
        </div>
      </section>
    </section>
  );
}

function PipelineOverview() {
  const pipeline = DASHBOARD.pipeline;
  const stages = [
    { label: "Waiting", value: pipeline.waiting, color: "#d5a637" },
    { label: "Contacted", value: pipeline.contacted, color: "#3979c8" },
    { label: "Replied", value: pipeline.replied, color: "#7357b5" },
    { label: "Interview", value: pipeline.interviews, color: "#13a47a" },
    { label: "Proposal", value: pipeline.proposals, color: "#e27c37" },
    { label: "Won", value: pipeline.won, color: "#08704f" },
    { label: "Rejected / lost", value: pipeline.rejected, color: "#c44d45" },
  ];
  const total = pipeline.total;
  let cursor = 0;
  const segments = stages.map((stage) => {
    const start = (cursor / total) * 100;
    cursor += stage.value;
    const end = (cursor / total) * 100;
    return `${stage.color} ${start}% ${end}%`;
  });
  const background = `conic-gradient(${segments.join(", ")})`;
  const headline = [
    { label: "Total", value: pipeline.total, tone: "total" },
    { label: "Waiting", value: pipeline.waiting, tone: "waiting" },
    { label: "Contacted", value: pipeline.contacted, tone: "contacted" },
    { label: "Interviews", value: pipeline.interviews, tone: "interview" },
    { label: "Rejected", value: pipeline.rejected, tone: "rejected" },
    { label: "Won", value: pipeline.won, tone: "won" },
  ];

  return (
    <section className="panel panel-pad pipeline-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Application pipeline</p>
          <h2>Where every opportunity stands</h2>
        </div>
        <Link className="button secondary" to="/outreach">
          Manage pipeline →
        </Link>
      </div>
      <div className="pipeline-metrics">
        {headline.map((item) => (
          <article className={`pipeline-metric ${item.tone}`} key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </article>
        ))}
      </div>
      <div className="pipeline-visual">
        <div className="pipeline-donut" style={{ background }}>
          <div>
            <strong>{total}</strong>
            <span>active total</span>
          </div>
        </div>
        <div className="pipeline-legend">
          {stages.map((stage) => {
            const percentage = Math.round((stage.value / total) * 100);
            return (
              <div className="pipeline-stage" key={stage.label}>
                <span className="pipeline-swatch" style={{ background: stage.color }} />
                <div>
                  <strong>{stage.label}</strong>
                  <i>
                    <b style={{ width: `${percentage}%`, background: stage.color }} />
                  </i>
                </div>
                <span>
                  {stage.value}
                  <small>{percentage}%</small>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RadarPage() {
  const stats: Array<[number, string]> = [
    [DASHBOARD.totals.organizations, "Companies mapped"],
    [DASHBOARD.totals.opportunities, "Evidence-backed cards"],
    [DASHBOARD.totals.hot, "Hot opportunities"],
    [DASHBOARD.totals.verifiedPeople, "Verified people"],
  ];
  const recent = OPPORTUNITIES.slice(0, 5);

  return (
    <>
      <header className="page-header split-header">
        <div>
          <p className="eyebrow">Evidence-grounded client acquisition</p>
          <h1>
            Find the signal.
            <br />
            <span>Reach the right person.</span>
          </h1>
        </div>
        <p className="header-copy">
          Monitor public business signals, turn them into defensible opportunity hypotheses, and prepare a hook tied to
          what the company is doing now.
        </p>
      </header>

      <Launcher />

      <div className="dashboard-stack">
        <section className="grid grid-4">
          {stats.map(([value, label]) => (
            <article className="panel stat-card" key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </article>
          ))}
        </section>

        <PipelineOverview />

        <section className="grid dashboard-grid">
          <article className="panel panel-pad">
            <div className="section-head">
              <div>
                <p className="eyebrow">Market coverage</p>
                <h2>Where signals are appearing</h2>
              </div>
            </div>
            <Bars items={DASHBOARD.byCountry} />
          </article>
          <article className="panel panel-pad">
            <div className="section-head">
              <div>
                <p className="eyebrow">Service demand</p>
                <h2>What you could sell</h2>
              </div>
            </div>
            <Bars items={DASHBOARD.byService} />
          </article>
        </section>

        <section className="panel panel-pad">
          <div className="section-head">
            <div>
              <p className="eyebrow">Most recent</p>
              <h2>Actionable opportunities</h2>
            </div>
            <Link className="button secondary" to="/opportunities">
              View all →
            </Link>
          </div>
          <div className="recent-list">
            {recent.map((opportunity) => {
              const band = opportunityBand(opportunity.score, opportunity.confidence);
              return (
                <Link
                  to="/opportunities"
                  hash={`opportunity-${opportunity.id}`}
                  className="recent-row"
                  key={opportunity.id}
                >
                  <div
                    className="score-ring"
                    style={{ "--score": opportunity.score } as React.CSSProperties}
                  >
                    <strong>{opportunity.score}</strong>
                  </div>
                  <div className="recent-main">
                    <div className="toolbar">
                      {opportunity.engagementMode === "dual" && <span className="badge hiring">Hiring</span>}
                      <span className={`badge ${band}`}>{band}</span>
                      <span className={`badge ${opportunity.needKind}`}>{opportunity.needKind}</span>
                    </div>
                    <strong>{opportunity.title}</strong>
                    <span>
                      {opportunity.organizationName} · {opportunity.country}
                    </span>
                  </div>
                  <div className="recent-service">
                    <span>{opportunity.serviceName}</span>
                    <strong>{opportunity.confidence}% confidence</strong>
                  </div>
                  <span className="recent-arrow">→</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
