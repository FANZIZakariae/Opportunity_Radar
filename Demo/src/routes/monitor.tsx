import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RUNS } from "@/demo/data";

export const Route = createFileRoute("/monitor")({
  head: () => ({
    meta: [
      { title: "Monitor — Opportunity Radar demo" },
      {
        name: "description",
        content: "Live queue state, retries, failures and provider activity for every research run.",
      },
      { property: "og:title", content: "Monitor — Opportunity Radar demo" },
      {
        property: "og:description",
        content: "Queue progress, rejected candidates and run events exposed instead of hidden.",
      },
    ],
  }),
  component: MonitorPage,
});

function MonitorPage() {
  const [selected, setSelected] = useState(RUNS[0]!.id);
  const run = RUNS.find((item) => item.id === selected)!;

  return (
    <>
      <header className="page-header">
        <p className="eyebrow">Supervised execution</p>
        <h2>Research monitor</h2>
        <p className="lede">
          Queue work is inspectable: what ran, what was rejected, what failed and why.
        </p>
      </header>

      <div className="monitor-layout">
        <aside className="panel run-history">
          <div className="section-head">
            <div>
              <p className="eyebrow">Research history</p>
              <h3>{RUNS.length} runs</h3>
            </div>
          </div>
          {RUNS.map((item) => (
            <button
              key={item.id}
              className={selected === item.id ? "active" : ""}
              onClick={() => setSelected(item.id)}
            >
              <span className={`queue-state ${item.status}`} />
              <div>
                <strong>{item.label}</strong>
                <small>
                  {item.createdAt} · {item.opportunitiesCreated} cards
                </small>
              </div>
              <span>{item.progress}%</span>
            </button>
          ))}
        </aside>

        <div>
          <section className="panel run-monitor">
            <div className="monitor-top">
              <div>
                <div className="toolbar">
                  <span className={`badge ${run.status === "running" ? "running" : run.status === "failed" ? "error" : ""}`}>
                    {run.status}
                  </span>
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
              {run.status === "running" && <button className="button warning">Pause safely</button>}
              {run.status === "paused" && <button className="button">Resume</button>}
              {run.status !== "completed" && <button className="button danger">Stop run</button>}
            </div>

            <div className="queue-list">
              {run.queue.map((item) => (
                <div key={item.id} className="queue-row">
                  <span className={`queue-state ${item.status}`} />
                  <div>
                    <strong>{item.label}</strong>
                    <small>
                      {item.kind.replaceAll("_", " ")} · attempt {item.attempts}
                    </small>
                    {item.error && <em>{item.error}</em>}
                  </div>
                  <span>{item.status}</span>
                </div>
              ))}
            </div>

            <div className="event-list">
              {run.events.map((event) => (
                <div key={event.id} className={`event ${event.level}`}>
                  <time>{event.time}</time>
                  <span>{event.message}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
