import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { OPPORTUNITIES, type Opportunity } from "@/demo/data";

export const Route = createFileRoute("/outreach")({
  head: () => ({
    meta: [
      { title: "Outreach — Opportunity Radar demo" },
      {
        name: "description",
        content: "Prepared outreach messages, hooks and follow-ups. Nothing is ever sent automatically.",
      },
      { property: "og:title", content: "Outreach — Opportunity Radar demo" },
      {
        property: "og:description",
        content: "Review-ready outreach drafts tied to public evidence, with a human decision at every step.",
      },
    ],
  }),
  component: OutreachPage,
});

function OutreachPage() {
  const [items, setItems] = useState(OPPORTUNITIES);
  const [mode, setMode] = useState<"ready" | "pipeline">("ready");
  const [copied, setCopied] = useState("");

  const filtered = useMemo(
    () =>
      items.filter((item) =>
        mode === "ready" ? ["new", "reviewed"].includes(item.status) : !["new", "reviewed"].includes(item.status),
      ),
    [items, mode],
  );

  function markContacted(id: string) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, status: "contacted" as Opportunity["status"] } : item)),
    );
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
        <p className="eyebrow">Human-in-the-loop</p>
        <h2>Outreach preparation</h2>
        <p className="lede">
          Messages are drafted from the evidence on each card. Every send remains a manual decision.
        </p>
      </header>

      <div className="outreach-tabs">
        <button className={mode === "ready" ? "active" : ""} onClick={() => setMode("ready")}>
          Ready for review
        </button>
        <button className={mode === "pipeline" ? "active" : ""} onClick={() => setMode("pipeline")}>
          Contact pipeline
        </button>
      </div>

      <div className="outreach-list">
        {filtered.map((item) => (
          <article className="panel outreach-card" key={item.id}>
            <div className="outreach-meta">
              {item.engagementMode === "dual" && <span className="badge hiring">Hiring · Job + Freelance</span>}
              <span className="badge">{item.serviceName}</span>
              <span className="badge">{item.status.replaceAll("_", " ")}</span>
              <span>{item.score}/100 opportunity</span>
            </div>
            <h2>{item.organizationName}</h2>
            <h3>{item.subject}</h3>
            <p className="hook">{item.hook}</p>
            <pre>{item.shortMessage}</pre>
            <div className="outreach-person">
              <strong>{item.person?.name || item.buyerRole}</strong>
              <span>
                {item.person?.role || "Recommended buyer role"} ·{" "}
                {item.person?.verificationLevel.replaceAll("_", " ") || "not named publicly"}
              </span>
            </div>
            <div className="toolbar">
              <button className="button" onClick={() => void copy(item.id, item.shortMessage)}>
                {copied === item.id ? "Copied" : "Copy outreach"}
              </button>
              {["new", "reviewed"].includes(item.status) && (
                <button className="button secondary" onClick={() => markContacted(item.id)}>
                  Mark contacted
                </button>
              )}
              <Link className="button ghost" to="/opportunities" hash={`opportunity-${item.id}`}>
                Open evidence
              </Link>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="panel empty">
          <strong>Nothing in this outreach stage</strong>
          Opportunity messages only appear after passing the evidence gate.
        </div>
      )}
    </>
  );
}
