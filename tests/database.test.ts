import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { countNewRunOpportunities, createResearchRun, dashboardSnapshot, enqueueOrganizationAnalysis, getResearchRun, listActiveOpportunityCountries, listOpportunities, listRunQueue, resetDatabaseForTests, saveIntelligenceAnalysis, saveSourceDocument, setRunControl, updateOpportunity, upsertOrganization, type IntelligenceAnalysis } from "@/lib/db";
import { DISCOVERY_STRATEGIES } from "@/lib/geography";

const files: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  const db = global.__opportunityRadarDb;
  if (db) { db.close(); global.__opportunityRadarDb = undefined; }
  for (const file of files.splice(0)) {
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.rmSync(`${file}${suffix}`, { force: true }); } catch { /* cleanup only */ }
    }
  }
});

function database() {
  const file = path.join(os.tmpdir(), `opportunity-radar-${crypto.randomUUID()}.db`);
  files.push(file);
  return resetDatabaseForTests(file);
}

describe("persistent research queue", () => {
  it("creates independent source work and preserves user controls", () => {
    database();
    const run = createResearchRun({
      query: "Odoo agencies needing document automation",
      countries: ["France", "Morocco"],
      services: ["document-intelligence"],
      manualUrls: ["https://example.com"],
      maxOrganizations: 20,
    });
    const queue = listRunQueue(run.id);
    expect(queue.map((item) => item.kind)).toEqual(["manual_url", "boamp", "ted", "france_num"]);
    expect(setRunControl(run.id, "paused").desiredState).toBe("paused");
    expect(setRunControl(run.id, "running").desiredState).toBe("running");
    expect(getResearchRun(run.id)?.query).toContain("Odoo");
  });

  it("queues monitored discovery strategies independently", () => {
    vi.stubEnv("EXA_API_KEY", "test-exa");
    vi.stubEnv("TAVILY_API_KEY", "test-tavily");
    database();
    const run = createResearchRun({
      query: "AI automation opportunities", countries: ["France", "Morocco"], services: ["document-intelligence"],
      manualUrls: ["https://example.com"], maxOrganizations: 30,
    });
    const queue = listRunQueue(run.id);
    expect(queue.slice(0, 6).map((item) => item.kind)).toEqual([
      "manual_url", "greenhouse_discovery", "lever_discovery", "boamp", "ted", "france_num",
    ]);
    expect(queue.filter((item) => item.kind === "exa_discovery")).toHaveLength(DISCOVERY_STRATEGIES.length * 2);
    expect(queue.filter((item) => item.kind === "tavily_discovery")).toHaveLength(DISCOVERY_STRATEGIES.length * 2);
    expect(new Set(queue.filter((item) => item.kind === "exa_discovery").map((item) => item.payload.strategy))).toEqual(
      new Set(DISCOVERY_STRATEGIES.map((strategy) => strategy.id)),
    );
  });
  it("allows the candidate pool to exceed the new-valid-card target", () => {
    database();
    const run = createResearchRun({
      query: "AI delivery signals", countries: ["France"], services: ["document-intelligence"],
      manualUrls: [], targetOpportunities: 30,
    });
    const source = listRunQueue(run.id).find((item) => item.kind !== "analyze_organization");
    expect(source?.payload.targetOpportunities).toBe(30);
    let queued = 0;
    for (let index = 0; index < 35; index++) {
      const organization = upsertOrganization({
        name: `Candidate ${index}`, website: `https://candidate-${index}.example`, country: "France",
        sourceType: "test", sourceUrl: `https://candidate-${index}.example/signal`,
      }).organization;
      if (enqueueOrganizationAnalysis(run.id, organization, 600)) queued++;
    }
    expect(queued).toBe(35);
    expect(listRunQueue(run.id).filter((item) => item.kind === "analyze_organization")).toHaveLength(35);
  });
it("keeps structured source identities separate even when they share an ATS domain", () => {
    database();
    const first = upsertOrganization({ name: "Alpha", website: "https://jobs.lever.co/alpha/12345678", identityKey: "lever:alpha", sourceType: "lever", sourceUrl: "https://jobs.lever.co/alpha/12345678" });
    const second = upsertOrganization({ name: "Beta", website: "https://jobs.lever.co/beta/87654321", identityKey: "lever:beta", sourceType: "lever", sourceUrl: "https://jobs.lever.co/beta/87654321" });
    expect(first.organization.id).not.toBe(second.organization.id);
  });
  it("normalizes Casablanca and blocks foreign cards from Morocco-only runs", () => {
    database();
    const run = createResearchRun({
      query: "Moroccan AI delivery signals", countries: ["Morocco"], services: ["document-intelligence"],
      manualUrls: [], targetOpportunities: 30,
    });
    const casablanca = upsertOrganization({
      name: "Casa AI", website: "https://casa-ai.example", country: "Casablanca-Settat",
      sourceType: "test", sourceUrl: "https://casa-ai.example/signal",
    }).organization;
    expect(casablanca).toMatchObject({ country: "Morocco", city: "Casablanca" });

    const foreign = upsertOrganization({
      name: "New York AI", website: "https://new-york-ai.example", country: "New York, NY",
      sourceType: "test", sourceUrl: "https://new-york-ai.example/signal",
    }).organization;
    const sourceUrl = "https://new-york-ai.example/signal";
    saveSourceDocument({
      organizationId: foreign.id, url: sourceUrl, title: "Verified signal", sourceType: "official",
      contentHash: "foreign-signal", text: "The company is hiring for a funded document AI delivery project.",
    });
    const analysis: IntelligenceAnalysis = {
      organization: { canonicalName: "New York AI", identityConfidence: 95, description: "AI company", services: ["AI"], verticals: ["Technology"], sizeBand: "SMB" },
      signals: [{ claimKind: "fact", signalType: "hiring", claim: "Verified AI signal", excerpt: "funded document AI delivery project", sourceUrl, eventDate: "2026-07-31", sourceQuality: 90 }],
      people: [],
      opportunities: [{
        serviceId: "document-intelligence", title: "Document AI delivery support", needStatement: "Delivery support needed",
        needKind: "explicit", engagementMode: "freelance", hiringRole: "", whyNow: "A current source confirms the need.",
        score: 85, confidence: 85, buyerRole: "CTO", personName: "", subject: "AI delivery", hook: "AI delivery",
        shortMessage: "AI delivery", longMessage: "AI delivery", followUp: "Follow up", openingQuestion: "Can we discuss it?",
        evidenceClaims: ["Verified AI signal"],
      }],
    };
    const saved = saveIntelligenceAnalysis(foreign.id, analysis, { runId: run.id, targetOpportunities: 30 });
    expect(saved).toMatchObject({ newOpportunities: 0, marketMismatch: true });
    expect(countNewRunOpportunities(run.id)).toBe(0);
    expect(listOpportunities()).toHaveLength(0);
  });
  it("keeps one card per company and refreshes it without resetting pipeline progress", () => {
    database();
    const organization = upsertOrganization({
      name: "One Company", website: "https://one-company.example", country: "France", sourceType: "manual", sourceUrl: "https://one-company.example",
    }).organization;
    const sourceUrl = "https://one-company.example/news";
    saveSourceDocument({ organizationId: organization.id, url: sourceUrl, title: "AI signal", sourceType: "official", contentHash: "signal-v1", text: "The company is deploying document AI." });
    const opportunity = (title: string, score: number, serviceId = "document-intelligence"): IntelligenceAnalysis["opportunities"][number] => ({
      serviceId, title, needStatement: `${title} need`, needKind: "explicit", engagementMode: "freelance", hiringRole: "",
      whyNow: "A current public source confirms the need.", score, confidence: 82, buyerRole: "CTO", personName: "",
      subject: title, hook: title, shortMessage: title, longMessage: title, followUp: title, openingQuestion: title,
      evidenceClaims: ["Verified AI signal"],
    });
    const analysis = (opportunities: IntelligenceAnalysis["opportunities"]): IntelligenceAnalysis => ({
      organization: { canonicalName: "One Company", identityConfidence: 95, description: "AI company", services: ["AI"], verticals: ["Technology"], sizeBand: "SMB" },
      signals: [{ claimKind: "fact", signalType: "hiring", claim: "Verified AI signal", excerpt: "deploying document AI", sourceUrl, eventDate: "2026-07-30", sourceQuality: 90 }],
      people: [], opportunities,
    });

    const firstSave = saveIntelligenceAnalysis(organization.id, analysis([
      opportunity("Weaker workflow offer", 61, "workflow-automation"), opportunity("Strongest document offer", 88),
    ]));
    upsertOrganization({
      name: "No-card company", website: "https://no-card.example", country: "LinkedIn",
      sourceType: "test", sourceUrl: "https://no-card.example",
    });
    expect(firstSave.newOpportunities).toBe(1);
    const first = listOpportunities()[0];
    expect(listOpportunities()).toHaveLength(1);
    expect(first.title).toBe("Strongest document offer");
    expect(listActiveOpportunityCountries()).toEqual(["France"]);
    expect(dashboardSnapshot().byCountry).toEqual([{ label: "France", value: 1 }]);
    updateOpportunity(first.id, "contacted");

    const refreshSave = saveIntelligenceAnalysis(organization.id, analysis([opportunity("Refreshed strongest offer", 91)]));
    expect(refreshSave.newOpportunities).toBe(0);
    expect(enqueueOrganizationAnalysis(
      createResearchRun({ query: "new scan", countries: ["France"], services: ["document-intelligence"], manualUrls: [], targetOpportunities: 30 }).id,
      organization,
      600,
    )).toBe(false);
    const refreshed = listOpportunities();
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0]).toMatchObject({ id: first.id, title: "Refreshed strongest offer", status: "contacted" });
  });
it("deduplicates organizations by their normalized domain", () => {
    database();
    const first = upsertOrganization({ name: "Example", website: "https://www.example.com", country: "France", sourceType: "manual", sourceUrl: "https://example.com" });
    const second = upsertOrganization({ name: "Example Agency", website: "https://example.com/about", country: "France", sourceType: "manual", sourceUrl: "https://example.com/about" });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.organization.id).toBe(first.organization.id);
  });
});

