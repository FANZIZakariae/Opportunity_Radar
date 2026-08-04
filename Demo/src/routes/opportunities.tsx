import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { OPPORTUNITIES, SERVICES, opportunityBand, type Opportunity } from "@/demo/data";

export const Route = createFileRoute("/opportunities")({
  head: () => ({
    meta: [
      { title: "Opportunities — Opportunity Radar demo" },
      {
        name: "description",
        content:
          "Evidence-backed opportunity cards with public signals, verified contacts and prepared outreach messages.",
      },
      { property: "og:title", content: "Opportunities — Opportunity Radar demo" },
      {
        property: "og:description",
        content: "Opportunity cards with supporting public evidence, contact verification and outreach drafts.",
      },
    ],
  }),
  component: OpportunitiesPage,
});

const statuses = [
  "new",
  "reviewed",
  "contacted",
  "replied",
  "discovery_call",
  "pilot",
  "proposal",
  "won",
  "lost",
  "snoozed",
];

function ContactTarget({ opportunity }: { opportunity: Opportunity }) {
  const person = opportunity.person;
  return (
    <div className="contact-target">
      <p className="eyebrow">Who to contact</p>
      <div className="contact-name">
        <div className="avatar">
          {person?.name
            ? person.name
                .split(/\s+/)
                .map((word) => word[0])
                .slice(0, 2)
                .join("")
            : "?"}
        </div>
        <div>
          <strong>{person?.name || opportunity.buyerRole}</strong>
          <span>{person?.name ? person.role : "Recommended buyer role"}</span>
        </div>
      </div>
      <span className="badge">{person?.verificationLevel.replaceAll("_", " ") || "target role"}</span>
      <div className="contact-score">
        <strong>{opportunity.contactability}%</strong>
        <span>contactability</span>
      </div>
      <div className="contact-links">
        {person?.professionalUrl && <a href={person.professionalUrl}>Professional page ↗</a>}
        {person?.email && <a href={`mailto:${person.email}`}>{person.email}</a>}
        {opportunity.contacts.map((contact) => (
          <div className="direct-contact" key={contact.id}>
            <a href="#contact">
              <span>{contact.label}</span>
              {contact.value}
            </a>
            <a className="contact-source" href="#source">
              verified source ↗
            </a>
          </div>
        ))}
        {!opportunity.contacts.length && !person?.email && (
          <span className="contact-missing">No direct public contact found yet.</span>
        )}
        <a href={opportunity.organizationWebsite}>Company website ↗</a>
      </div>
    </div>
  );
}

function OpportunitiesPage() {
  const [items, setItems] = useState(OPPORTUNITIES);
  const [query, setQuery] = useState("");
  const [service, setService] = useState("all");
  const [status, setStatus] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const hash = window.location.hash.replace("#opportunity-", "");
    if (hash) setExpanded(hash);
  }, []);

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const haystack = `${item.organizationName} ${item.title} ${item.needStatement} ${item.serviceName}`.toLowerCase();
        return (
          haystack.includes(query.toLowerCase()) &&
          (service === "all" || item.serviceId === service) &&
          (status === "all" || item.status === status)
        );
      }),
    [items, query, service, status],
  );

  function update(id: string, next: Opportunity["status"]) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, status: next } : item)));
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  }

  return (
    <>
      <header className="page-header">
        <p className="eyebrow">Qualified pipeline</p>
        <h2>Opportunity cards</h2>
        <p className="lede">
          Every card required public evidence before it was created. Facts stay facts, hypotheses stay labelled.
        </p>
      </header>

      <div className="panel panel-pad opportunity-toolbar">
        <input
          className="input"
          placeholder="Search companies, needs, services…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select className="select" value={service} onChange={(event) => setService(event.target.value)}>
          <option value="all">All services</option>
          {SERVICES.map((item) => (
            <option value={item.id} key={item.id}>
              {item.shortName}
            </option>
          ))}
        </select>
        <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((item) => (
            <option value={item} key={item}>
              {item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <strong>{filtered.length} cards</strong>
      </div>

      <div className="opportunity-list">
        {filtered.map((opportunity) => {
          const open = expanded === opportunity.id;
          const band = opportunityBand(opportunity.score, opportunity.confidence);
          return (
            <article
              id={`opportunity-${opportunity.id}`}
              className={`panel opportunity-card status-${opportunity.status} ${open ? "open" : ""}`}
              key={opportunity.id}
            >
              <button
                className="opportunity-summary"
                onClick={() => setExpanded(open ? null : opportunity.id)}
              >
                <div className="score-stack">
                  <div
                    className="score-ring large"
                    style={{ "--score": opportunity.score } as React.CSSProperties}
                  >
                    <strong>{opportunity.score}</strong>
                  </div>
                  <small>fit</small>
                </div>
                <div className="opportunity-title">
                  <div className="toolbar">
                    {opportunity.engagementMode === "dual" && <span className="badge hiring">Hiring</span>}
                    <span className={`badge ${band}`}>{band}</span>
                    <span className={`badge ${opportunity.needKind}`}>{opportunity.needKind}</span>
                    <span className="badge pipeline-status">{opportunity.status.replaceAll("_", " ")}</span>
                  </div>
                  <h2>{opportunity.title}</h2>
                  <p>
                    {opportunity.organizationName} · {opportunity.country} · {opportunity.serviceName}
                  </p>
                  <strong className="need-line">{opportunity.needStatement}</strong>
                </div>
                <div className="lead-metrics">
                  <span>
                    <strong>{opportunity.buyerIntent}%</strong>buyer intent
                  </span>
                  <span>
                    <strong>{opportunity.contactability}%</strong>contactability
                  </span>
                  <span>
                    <strong>{opportunity.confidence}%</strong>evidence
                  </span>
                </div>
                <span className="expand-mark">{open ? "−" : "+"}</span>
              </button>

              {open && (
                <div className="opportunity-detail">
                  <div className="detail-main">
                    {opportunity.engagementMode === "dual" && (
                      <section className="dual-opportunity">
                        <p className="eyebrow">Dual opportunity</p>
                        <strong>Hiring for {opportunity.hiringRole}</strong>
                        <p>
                          The outreach below expresses interest in joining the team and offers an immediate freelance
                          pilot as a second collaboration path.
                        </p>
                      </section>
                    )}
                    <section>
                      <p className="eyebrow">Why now</p>
                      <p className="detail-copy">{opportunity.whyNow}</p>
                    </section>
                    <section>
                      <div className="section-head">
                        <div>
                          <p className="eyebrow">Public evidence</p>
                          <h3>
                            {opportunity.evidence.length} supporting signal
                            {opportunity.evidence.length === 1 ? "" : "s"}
                          </h3>
                        </div>
                      </div>
                      <div className="evidence-list">
                        {opportunity.evidence.map((evidence) => (
                          <a href={evidence.sourceUrl} className="evidence" key={evidence.id}>
                            <span className={`evidence-kind ${evidence.claimKind}`}>{evidence.claimKind}</span>
                            <div>
                              <strong>{evidence.claim}</strong>
                              <p>“{evidence.excerpt}”</p>
                              <small>
                                {evidence.signalType.replaceAll("_", " ")} · source quality {evidence.sourceQuality}
                                /100
                              </small>
                            </div>
                            <span>↗</span>
                          </a>
                        ))}
                      </div>
                    </section>
                    <section className="message-preview">
                      <div className="section-head">
                        <div>
                          <p className="eyebrow">Suggested outreach</p>
                          <h3>{opportunity.subject}</h3>
                        </div>
                        <button
                          className="button secondary"
                          onClick={() => void copy(opportunity.id, opportunity.shortMessage)}
                        >
                          {copied === opportunity.id ? "Copied" : "Copy message"}
                        </button>
                      </div>
                      <p className="hook">
                        <span>Hook</span>
                        {opportunity.hook}
                      </p>
                      <pre>{opportunity.shortMessage}</pre>
                      <details>
                        <summary>Longer version and follow-up</summary>
                        <h4>Long version</h4>
                        <pre>{opportunity.longMessage}</pre>
                        <h4>Follow-up</h4>
                        <pre>{opportunity.followUp}</pre>
                      </details>
                    </section>
                  </div>
                  <aside>
                    <ContactTarget opportunity={opportunity} />
                    <div className="proof-box">
                      <p className="eyebrow">Best proof to show</p>
                      <strong>{opportunity.proofProject}</strong>
                      <p>{opportunity.openingQuestion}</p>
                    </div>
                    <div className="status-actions">
                      <label className="field">
                        <span>Pipeline status</span>
                        <select
                          className="select"
                          value={opportunity.status}
                          onChange={(event) => update(opportunity.id, event.target.value as Opportunity["status"])}
                        >
                          {statuses.map((item) => (
                            <option value={item} key={item}>
                              {item.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="button danger" onClick={() => setExpanded(null)}>
                        Eliminate
                      </button>
                    </div>
                  </aside>
                </div>
              )}
            </article>
          );
        })}
        {!filtered.length && (
          <div className="panel empty">
            <strong>No matching opportunity cards</strong>
            Change the filters or start a radar run. Research-only hypotheses are hidden from the actionable view.
          </div>
        )}
      </div>
    </>
  );
}
