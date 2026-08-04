import { createFileRoute } from "@tanstack/react-router";
import { CONNECTORS, PROVIDERS, SERVICES } from "@/demo/data";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Opportunity Radar demo" },
      {
        name: "description",
        content:
          "Intelligence provider selection, discovery connectors, the commercial catalogue and the evidence boundary.",
      },
      { property: "og:title", content: "Settings — Opportunity Radar demo" },
      {
        property: "og:description",
        content: "Provider status, connector configuration and the evidence and privacy boundary.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <header className="page-header">
        <p className="eyebrow">Workspace configuration</p>
        <h2>Settings</h2>
        <p className="lede">
          One analysis engine at a time, explicit connectors, and rules the whole workspace obeys so anyone can
          understand the evidence rules.
        </p>
      </header>

      <div className="settings-stack">
        <section className="panel panel-pad">
          <div className="section-head">
            <div>
              <p className="eyebrow">Intelligence provider</p>
              <h2>Choose one analysis engine</h2>
            </div>
            <span className="badge running">codex active</span>
          </div>
          <div className="grid grid-3">
            {PROVIDERS.map((provider) => (
              <article
                className={`connector-card provider-card ${provider.active ? "active-provider" : ""}`}
                key={provider.provider}
              >
                <span className={`connector-status ${provider.configured ? "ready" : ""}`} />
                <div>
                  <div className="provider-heading">
                    <h3>{provider.label}</h3>
                    {provider.active && <span>Active</span>}
                  </div>
                  <strong>{provider.state}</strong>
                  <p>{provider.message}</p>
                  <code>{provider.model}</code>
                </div>
              </article>
            ))}
          </div>
          <p className="notice provider-notice">
            Provider selection is server-side: set <code>OPPORTUNITY_RADAR_LLM_PROVIDER</code> to <code>codex</code>,{" "}
            <code>openai</code>, or <code>anthropic</code> in <code>.env.local</code>, then restart the app. Keys are
            never returned to the browser.
          </p>
        </section>

        <section className="grid grid-2">
          {CONNECTORS.map((connector) => (
            <article className="panel connector-card" key={connector.id}>
              <span className={`connector-status ${connector.enabled ? "ready" : ""}`} />
              <div>
                <h3>{connector.label}</h3>
                <strong>{connector.enabled ? "Ready" : connector.configured ? "Disabled" : "Configuration needed"}</strong>
                <p>{connector.message}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="panel panel-pad">
          <div className="section-head">
            <div>
              <p className="eyebrow">Commercial catalogue</p>
              <h2>Your four sellable offers</h2>
            </div>
          </div>
          <div className="service-grid">
            {SERVICES.map((service) => (
              <article className="panel panel-pad" key={service.id}>
                <p className="eyebrow">{service.shortName}</p>
                <h3>{service.name}</h3>
                <p className="detail-copy">{service.promise}</p>
                <div className="tag-list">
                  {service.deliverables.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <p className="small muted" style={{ marginBottom: 0 }}>
                  Proof · {service.proofProject}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel panel-pad privacy-panel">
          <div>
            <p className="eyebrow">Evidence and privacy boundary</p>
            <h2>Facts stay facts. Hypotheses stay labelled.</h2>
          </div>
          <ul>
            <li>Only public company pages and permitted APIs are collected.</li>
            <li>Named people require a verifiable professional source.</li>
            <li>Email addresses are never constructed from guessed patterns.</li>
            <li>LinkedIn remains a manual click-out, never an automated source.</li>
            <li>Nothing is sent automatically; every outreach message requires your decision.</li>
          </ul>
        </section>

        <section className="panel panel-pad">
          <div className="section-head">
            <div>
              <p className="eyebrow">Local configuration</p>
              <h2>Runtime</h2>
            </div>
          </div>
          <dl className="settings-dl">
            <div>
              <dt>Active intelligence</dt>
              <dd>
                <strong>codex</strong> · <code>codex account default</code>
              </dd>
            </div>
            <div>
              <dt>Paid fallback chain</dt>
              <dd>Disabled (recommended default)</dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>Local SQLite</dd>
            </div>
            <div>
              <dt>Codex executable</dt>
              <dd>
                <code>codex</code>
              </dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>
                <code>.env.local</code> in this project only
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );
}
