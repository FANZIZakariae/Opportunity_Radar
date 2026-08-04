import "server-only";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ensureWorkspace, workspacePath } from "@/lib/workspace";
import type {
  DashboardSnapshot, EvidenceItem, Opportunity, OpportunityStatus, Organization, OrganizationContact, Person,
  QueueItem, ResearchRun, RunStatus, VerificationLevel,
} from "@/lib/types";
import { assessLeadReadiness, buyerIntentScore, contactabilityScore, extractOfficialContacts, isPublishedEmail, normalizePublishedPhone, type ExtractedContact } from "@/lib/contacts";
import { DISCOVERY_STRATEGIES, normalizeOrganizationMarket, organizationMatchesRequestedCountries } from "@/lib/geography";
import { SERVICE_CATALOG, serviceById } from "@/lib/service-catalog";

declare global {
   
  var __opportunityRadarDb: DatabaseSync | undefined;
  var __opportunityRadarSchemaVersion: number | undefined;
}
const SCHEMA_VERSION = 10;

type Row = Record<string, unknown>;
const nowIso = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value);
function parseJson<T>(value: unknown, fallback: T): T {
  try { return typeof value === "string" ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}
function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function domainOf(value: string): string {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function insertContacts(db: DatabaseSync, organizationId: string, contacts: ExtractedContact[]): number {
  const statement = db.prepare(`INSERT INTO organization_contacts(id,organization_id,kind,value,label,source_url,observed_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(organization_id,kind,value) DO UPDATE SET
    label=excluded.label,source_url=excluded.source_url,observed_at=excluded.observed_at`);
  let saved = 0;
  for (const contact of contacts) {
    const value = contact.value.trim();
    if (!value) continue;
    statement.run(randomUUID(), organizationId, contact.kind, value, contact.label, contact.sourceUrl, nowIso());
    saved++;
  }
  return saved;
}

function backfillStoredContacts(db: DatabaseSync): void {
  const documents = db.prepare("SELECT organization_id AS organizationId,url,text_content AS text FROM source_documents").all() as Row[];
  for (const document of documents) {
    insertContacts(db, String(document.organizationId), extractOfficialContacts(String(document.text), String(document.url)));
  }
}

function pruneStoredContacts(db: DatabaseSync): void {
  const phones = db.prepare("SELECT id,organization_id AS organizationId,value FROM organization_contacts WHERE kind='phone' ORDER BY observed_at DESC").all() as Row[];
  const seen = new Set<string>();
  const remove = db.prepare("DELETE FROM organization_contacts WHERE id=?");
  for (const phone of phones) {
    const normalized = normalizePublishedPhone(String(phone.value));
    const digits = normalized.replace(/\D/g, "");
    const comparable = digits.startsWith("212") && digits.length === 12 ? digits.slice(-9)
      : digits.startsWith("33") && digits.length === 11 ? digits.slice(-9)
        : digits.startsWith("0") && digits.length === 10 ? digits.slice(-9) : digits;
    const key = `${phone.organizationId}:${comparable}`;
    if (!normalized || seen.has(key)) remove.run(String(phone.id));
    else seen.add(key);
  }
  const emails = db.prepare("SELECT id,value FROM organization_contacts WHERE kind='email'").all() as Row[];
  for (const email of emails) if (!isPublishedEmail(String(email.value))) remove.run(String(email.id));
}
function opportunityStatusRank(status: string): number {
  return ({ eliminated: 0, new: 1, lost: 1, reviewed: 2, snoozed: 2, contacted: 3, replied: 4, discovery_call: 5, pilot: 6, proposal: 7, won: 8 } as Record<string, number>)[status] || 0;
}

function enforceOneOpportunityPerOrganization(db: DatabaseSync): void {
  const rows = db.prepare("SELECT id,organization_id AS organizationId,status,score,confidence,updated_at AS updatedAt FROM opportunities ORDER BY organization_id").all() as Row[];
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const key = String(row.organizationId);
    const group = grouped.get(key) || [];
    group.push(row); grouped.set(key, group);
  }
  const removeEvidence = db.prepare("DELETE FROM opportunity_evidence WHERE opportunity_id=?");
  const removeInteractions = db.prepare("DELETE FROM interactions WHERE opportunity_id=?");
  const removeOpportunity = db.prepare("DELETE FROM opportunities WHERE id=?");
  for (const group of grouped.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => opportunityStatusRank(String(b.status)) - opportunityStatusRank(String(a.status))
      || Number(b.score) - Number(a.score) || Number(b.confidence) - Number(a.confidence)
      || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    for (const duplicate of group.slice(1)) {
      removeEvidence.run(String(duplicate.id));
      removeInteractions.run(String(duplicate.id));
      removeOpportunity.run(String(duplicate.id));
    }
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS opportunities_one_per_organization ON opportunities(organization_id)");
}

function normalizeStoredOrganizationMarkets(db: DatabaseSync): void {
  const rows = db.prepare("SELECT id,country,city,website FROM organizations").all() as Row[];
  const update = db.prepare("UPDATE organizations SET country=?,city=?,updated_at=? WHERE id=?");
  for (const row of rows) {
    const market = normalizeOrganizationMarket({
      country: String(row.country || ""),
      city: String(row.city || ""),
      website: String(row.website || ""),
    });
    if (market.country !== String(row.country || "") || market.city !== String(row.city || "")) {
      update.run(market.country, market.city, nowIso(), String(row.id));
    }
  }
}

function repairStoredRunMarketCounts(db: DatabaseSync): void {
  const runs = db.prepare("SELECT id,status,message FROM research_runs WHERE status IN ('completed','failed','stopped')").all() as Row[];
  const update = db.prepare("UPDATE research_runs SET opportunities_created=?,message=?,updated_at=? WHERE id=?");
  for (const row of runs) {
    const id = String(row.id);
    const refresh = isRefreshRun(db, id);
    const opportunities = countRunCards(db, id, !refresh);
    let message = String(row.message || "");
    if (!refresh && /target reached|sources exhausted/i.test(message)) {
      const payloads = db.prepare("SELECT payload_json AS payloadJson FROM queue_items WHERE run_id=? ORDER BY position").all(id) as Row[];
      const target = payloads.map((payload) => {
        const value = parseJson<Record<string, unknown>>(payload.payloadJson, {});
        return Number(value.targetOpportunities ?? value.maxOrganizations);
      }).find((value) => Number.isFinite(value) && value > 0) || 30;
      message = opportunities >= target
        ? `Target reached: ${opportunities}/${target} new valid opportunity cards created.`
        : `Sources exhausted after ${opportunities}/${target} new valid cards. Rejected, failed, duplicate and out-of-market candidates were not counted.`;
    }
    update.run(opportunities, message, nowIso(), id);
  }
}

function initialize(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      website TEXT NOT NULL,
      domain TEXT NOT NULL UNIQUE,
      country TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      size_band TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      services_json TEXT NOT NULL DEFAULT '[]',
      verticals_json TEXT NOT NULL DEFAULT '[]',
      source_type TEXT NOT NULL,
      source_url TEXT NOT NULL,
      last_scanned_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS organizations_country ON organizations(country);

    CREATE TABLE IF NOT EXISTS source_documents (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      published_at TEXT,
      content_hash TEXT NOT NULL,
      text_content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'fetched',
      UNIQUE(organization_id, url),
      FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS source_documents_org ON source_documents(organization_id);

    CREATE TABLE IF NOT EXISTS evidence_items (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      claim_kind TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      claim TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      source_url TEXT NOT NULL,
      event_date TEXT,
      source_quality INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY(document_id) REFERENCES source_documents(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS evidence_items_org ON evidence_items(organization_id);

    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL,
      professional_url TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      contact_url TEXT NOT NULL DEFAULT '',
      verification_level TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '',
      observed_at TEXT NOT NULL,
      UNIQUE(organization_id, name, role),
      FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS people_org ON people(organization_id);

    CREATE TABLE IF NOT EXISTS organization_contacts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      value TEXT NOT NULL,
      label TEXT NOT NULL,
      source_url TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      UNIQUE(organization_id, kind, value),
      FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS organization_contacts_org ON organization_contacts(organization_id, kind);

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      title TEXT NOT NULL,
      need_statement TEXT NOT NULL,
      need_kind TEXT NOT NULL,
      why_now TEXT NOT NULL,
      score INTEGER NOT NULL,
      confidence INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      engagement_mode TEXT NOT NULL DEFAULT 'freelance',
      hiring_role TEXT NOT NULL DEFAULT '',
      buyer_role TEXT NOT NULL,
      person_id TEXT,
      subject TEXT NOT NULL,
      hook TEXT NOT NULL,
      short_message TEXT NOT NULL,
      long_message TEXT NOT NULL,
      follow_up TEXT NOT NULL,
      opening_question TEXT NOT NULL,
      proof_project TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(organization_id, service_id, need_statement),
      FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS opportunities_status_score ON opportunities(status, score DESC, confidence DESC);

    CREATE TABLE IF NOT EXISTS opportunity_evidence (
      opportunity_id TEXT NOT NULL,
      evidence_id TEXT NOT NULL,
      PRIMARY KEY(opportunity_id, evidence_id),
      FOREIGN KEY(opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE,
      FOREIGN KEY(evidence_id) REFERENCES evidence_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS research_runs (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      query TEXT NOT NULL,
      countries_json TEXT NOT NULL,
      services_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      desired_state TEXT NOT NULL DEFAULT 'running',
      stage TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL,
      sources_total INTEGER NOT NULL DEFAULT 0,
      sources_completed INTEGER NOT NULL DEFAULT 0,
      organizations_found INTEGER NOT NULL DEFAULT 0,
      organizations_analyzed INTEGER NOT NULL DEFAULT 0,
      opportunities_created INTEGER NOT NULL DEFAULT 0,
      failures INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      heartbeat_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS queue_items (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      position INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      organization_id TEXT,
      dedupe_key TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(run_id, dedupe_key),
      FOREIGN KEY(run_id) REFERENCES research_runs(id) ON DELETE CASCADE,
      FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS queue_items_run_status_kind ON queue_items(run_id, status, kind, position);

    CREATE TABLE IF NOT EXISTS run_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      level TEXT NOT NULL,
      stage TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES research_runs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS run_events_run ON run_events(run_id, id DESC);

    CREATE TABLE IF NOT EXISTS interactions (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      occurred_at TEXT NOT NULL,
      FOREIGN KEY(opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS suppression_list (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      domain TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(domain),
      FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE SET NULL
    );
  `);
  const opportunityColumns = new Set((db.prepare("PRAGMA table_info(opportunities)").all() as Row[]).map((row) => String(row.name)));
  if (!opportunityColumns.has("engagement_mode")) db.exec("ALTER TABLE opportunities ADD COLUMN engagement_mode TEXT NOT NULL DEFAULT 'freelance'");
  if (!opportunityColumns.has("hiring_role")) db.exec("ALTER TABLE opportunities ADD COLUMN hiring_role TEXT NOT NULL DEFAULT ''");
  normalizeStoredOrganizationMarkets(db);
  repairStoredRunMarketCounts(db);
  enforceOneOpportunityPerOrganization(db);
  backfillStoredContacts(db);
  pruneStoredContacts(db);
}

export function getDb(): DatabaseSync {
  ensureWorkspace();
  if (!global.__opportunityRadarDb) {
    global.__opportunityRadarDb = new DatabaseSync(workspacePath("data", "opportunity_radar.db"));
  }
  if (global.__opportunityRadarSchemaVersion !== SCHEMA_VERSION) {
    initialize(global.__opportunityRadarDb);
    global.__opportunityRadarSchemaVersion = SCHEMA_VERSION;
  }
  return global.__opportunityRadarDb;
}

function mapOrganization(row: Row): Organization {
  return {
    id: String(row.id), name: String(row.name), website: String(row.website), domain: String(row.domain),
    country: String(row.country), city: String(row.city), sizeBand: String(row.sizeBand ?? ""),
    description: String(row.description ?? ""), services: parseJson(row.servicesJson, []),
    verticals: parseJson(row.verticalsJson, []), sourceType: String(row.sourceType), sourceUrl: String(row.sourceUrl),
    lastScannedAt: row.lastScannedAt ? String(row.lastScannedAt) : null,
    createdAt: String(row.createdAt), updatedAt: String(row.updatedAt),
  };
}
const organizationSelect = `SELECT id,name,website,domain,country,city,size_band AS sizeBand,description,
  services_json AS servicesJson,verticals_json AS verticalsJson,source_type AS sourceType,source_url AS sourceUrl,
  last_scanned_at AS lastScannedAt,created_at AS createdAt,updated_at AS updatedAt FROM organizations`;

export function upsertOrganization(input: {
  name: string; website: string; country?: string; city?: string; description?: string;
  sourceType: string; sourceUrl: string; identityKey?: string;
}): { organization: Organization; created: boolean } {
  const db = getDb();
  const domain = input.identityKey?.trim().toLowerCase() || domainOf(input.website);
  if (!domain) throw new Error(`A valid company website is required for ${input.name || "this organization"}.`);
  const market = normalizeOrganizationMarket({ country: input.country, city: input.city, website: input.website });
  const normalizedName = normalize(input.name || domain);
  const existing = db.prepare(`${organizationSelect} WHERE domain=? OR normalized_name=?
    ORDER BY CASE WHEN domain=? THEN 0 ELSE 1 END LIMIT 1`).get(domain, normalizedName, domain) as Row | undefined;
  const time = nowIso();
  if (existing) {
    db.prepare(`UPDATE organizations SET
      name=CASE WHEN length(?)>length(name) THEN ? ELSE name END,
      country=CASE WHEN country='' OR country='Worldwide' THEN ? ELSE country END,
      city=CASE WHEN city='' THEN ? ELSE city END,
      description=CASE WHEN description='' THEN ? ELSE description END,
      source_url=CASE WHEN source_url='' THEN ? ELSE source_url END,
      updated_at=? WHERE id=?`)
      .run(input.name, input.name, market.country, market.city, input.description || "", input.sourceUrl, time, String(existing.id));
    return { organization: mapOrganization(db.prepare(`${organizationSelect} WHERE id=?`).get(String(existing.id)) as Row), created: false };
  }
  const id = randomUUID();
  db.prepare(`INSERT INTO organizations(id,name,normalized_name,website,domain,country,city,description,source_type,source_url,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, input.name || domain, normalize(input.name || domain), input.website, domain, market.country, market.city, input.description || "", input.sourceType, input.sourceUrl, time, time);
  return { organization: mapOrganization(db.prepare(`${organizationSelect} WHERE id=?`).get(id) as Row), created: true };
}

export function listOrganizations(limit = 300): Organization[] {
  return (getDb().prepare(`${organizationSelect} ORDER BY updated_at DESC LIMIT ?`).all(limit) as Row[]).map(mapOrganization);
}
export function listActiveOpportunityCountries(): string[] {
  return (getDb().prepare(`SELECT DISTINCT COALESCE(NULLIF(org.country,''),'Worldwide') AS country
    FROM opportunities o JOIN organizations org ON org.id=o.organization_id
    WHERE o.status!='eliminated' ORDER BY country`).all() as Row[]).map((row) => String(row.country || "Worldwide"));
}
export function getOrganization(id: string): Organization | null {
  const row = getDb().prepare(`${organizationSelect} WHERE id=?`).get(id) as Row | undefined;
  return row ? mapOrganization(row) : null;
}
export function updateOrganizationIdentity(id: string, canonicalName: string): void {
  const name = canonicalName.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 100) return;
  getDb().prepare("UPDATE organizations SET name=?,normalized_name=?,updated_at=? WHERE id=?")
    .run(name, normalize(name), nowIso(), id);
}

export function saveOrganizationContacts(organizationId: string, contacts: ExtractedContact[]): number {
  const db = getDb();
  const saved = insertContacts(db, organizationId, contacts);
  pruneStoredContacts(db);
  return saved;
}

function mapOrganizationContact(row: Row): OrganizationContact {
  return {
    id: String(row.id), organizationId: String(row.organizationId), kind: String(row.kind) as OrganizationContact["kind"],
    value: String(row.value), label: String(row.label), sourceUrl: String(row.sourceUrl), observedAt: String(row.observedAt),
  };
}

export function listOrganizationContacts(organizationId: string, limit = 8): OrganizationContact[] {
  return (getDb().prepare(`SELECT id,organization_id AS organizationId,kind,value,label,source_url AS sourceUrl,observed_at AS observedAt
    FROM organization_contacts WHERE organization_id=? ORDER BY
    CASE kind WHEN 'email' THEN 0 WHEN 'phone' THEN 1 ELSE 2 END,
    CASE WHEN lower(label) LIKE '%commercial%' OR lower(label) LIKE '%management%' THEN 0 ELSE 1 END,value LIMIT ?`)
    .all(organizationId, limit) as Row[]).map(mapOrganizationContact);
}

export function updateOrganizationIntelligence(id: string, patch: { description: string; services: string[]; verticals: string[]; sizeBand: string }): void {
  getDb().prepare(`UPDATE organizations SET description=?,services_json=?,verticals_json=?,size_band=?,last_scanned_at=?,updated_at=? WHERE id=?`)
    .run(patch.description, json(patch.services), json(patch.verticals), patch.sizeBand, nowIso(), nowIso(), id);
}

export function saveSourceDocument(input: {
  organizationId: string; url: string; title: string; sourceType: string; publishedAt?: string | null; contentHash: string; text: string;
}): string {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM source_documents WHERE organization_id=? AND url=?").get(input.organizationId, input.url) as Row | undefined;
  const id = existing ? String(existing.id) : randomUUID();
  db.prepare(`INSERT INTO source_documents(id,organization_id,url,title,source_type,fetched_at,published_at,content_hash,text_content,status)
    VALUES(?,?,?,?,?,?,?,?,?,'fetched')
    ON CONFLICT(organization_id,url) DO UPDATE SET title=excluded.title,source_type=excluded.source_type,
    fetched_at=excluded.fetched_at,published_at=excluded.published_at,content_hash=excluded.content_hash,text_content=excluded.text_content,status='fetched'`)
    .run(id, input.organizationId, input.url, input.title, input.sourceType, nowIso(), input.publishedAt || null, input.contentHash, input.text);
  return id;
}
export function listSourceDocuments(organizationId: string): Array<{ id: string; url: string; title: string; sourceType: string; fetchedAt: string; text: string }> {
  return (getDb().prepare(`SELECT id,url,title,source_type AS sourceType,fetched_at AS fetchedAt,text_content AS text
    FROM source_documents WHERE organization_id=? ORDER BY fetched_at DESC`).all(organizationId) as Row[])
    .map((row) => ({ id: String(row.id), url: String(row.url), title: String(row.title), sourceType: String(row.sourceType), fetchedAt: String(row.fetchedAt), text: String(row.text) }));
}

function mapRun(row: Row): ResearchRun {
  return {
    id: String(row.id), label: String(row.label), query: String(row.query),
    countries: parseJson(row.countriesJson, []), services: parseJson(row.servicesJson, []),
    status: String(row.status) as ResearchRun["status"], desiredState: String(row.desiredState) as ResearchRun["desiredState"],
    stage: String(row.stage), progress: Number(row.progress), message: String(row.message),
    sourcesTotal: Number(row.sourcesTotal), sourcesCompleted: Number(row.sourcesCompleted),
    organizationsFound: Number(row.organizationsFound), organizationsAnalyzed: Number(row.organizationsAnalyzed),
    opportunitiesCreated: Number(row.opportunitiesCreated), failures: Number(row.failures),
    createdAt: String(row.createdAt), updatedAt: String(row.updatedAt), heartbeatAt: String(row.heartbeatAt),
    completedAt: row.completedAt ? String(row.completedAt) : null,
  };
}
const runSelect = `SELECT id,label,query,countries_json AS countriesJson,services_json AS servicesJson,status,
  desired_state AS desiredState,stage,progress,message,sources_total AS sourcesTotal,sources_completed AS sourcesCompleted,
  organizations_found AS organizationsFound,organizations_analyzed AS organizationsAnalyzed,
  opportunities_created AS opportunitiesCreated,failures,created_at AS createdAt,updated_at AS updatedAt,
  heartbeat_at AS heartbeatAt,completed_at AS completedAt FROM research_runs`;

export function createResearchRun(input: {
  query: string; countries: string[]; services: string[]; manualUrls: string[];
  targetOpportunities?: number; maxOrganizations?: number;
}): ResearchRun {
  const db = getDb();
  const requestedTarget = Number(input.targetOpportunities ?? input.maxOrganizations ?? 30);
  const targetOpportunities = Math.max(1, Math.min(200, Number.isFinite(requestedTarget) ? requestedTarget : 30));
  const id = randomUUID();
  const time = nowIso();
  const query = input.query.trim() || "Find agencies and companies with evidence-backed needs for Zakariae's AI services";
  db.prepare(`INSERT INTO research_runs(id,label,query,countries_json,services_json,status,desired_state,stage,progress,message,created_at,updated_at,heartbeat_at)
    VALUES(?,?,?,?,?,'queued','running','queued',0,?,?,?,?)`)
    .run(id, `Opportunity radar — ${query.slice(0, 52)}`, query, json(input.countries), json(input.services), "Preparing source queues…", time, time, time);
  let position = 0;
  const add = (kind: QueueItem["kind"], label: string, dedupe: string, payload: Record<string, unknown>) => {
    const itemTime = nowIso();
    db.prepare(`INSERT OR IGNORE INTO queue_items(id,run_id,kind,label,position,status,progress,dedupe_key,payload_json,created_at,updated_at)
      VALUES(?,?,?,?,?,'queued',0,?,?,?,?)`).run(randomUUID(), id, kind, label, position++, dedupe, json(payload), itemTime, itemTime);
  };
  const markets = input.countries.filter((country) => country !== "Manual");
  const includesFrance = markets.some((country) => /france/i.test(country));
  const includesEurope = markets.some((country) => /france|europe|worldwide/i.test(country));
  const atsSearchAvailable = Boolean(process.env.TAVILY_API_KEY?.trim() || process.env.EXA_API_KEY?.trim());
  // Explicit URLs and exact structured postings run first; broad indexes remain last so they can fill unused capacity.
  for (const value of input.manualUrls) add("manual_url", `Manual company — ${value}`, `manual:${domainOf(value) || value}`, { url: value, targetOpportunities });
  if (markets.length && atsSearchAvailable && process.env.OPPORTUNITY_RADAR_ATS_ENABLED !== "false") {
    add("greenhouse_discovery", "Greenhouse public AI openings", "source:greenhouse", { query, countries: markets, targetOpportunities });
    add("lever_discovery", "Lever public AI openings", "source:lever", { query, countries: markets, targetOpportunities });
  }
  if (includesFrance && process.env.OPPORTUNITY_RADAR_BOAMP_ENABLED !== "false") add("boamp", "BOAMP public tenders — France", "source:boamp", { query, targetOpportunities });
  if (includesEurope && process.env.OPPORTUNITY_RADAR_TED_ENABLED !== "false") add("ted", "TED public tenders — Europe", "source:ted", { query, countries: markets, targetOpportunities });
  if (includesFrance) add("france_num", "France Num open-data seed", "source:france-num", { targetOpportunities });
  const exaEnabled = Boolean(process.env.EXA_API_KEY?.trim() && process.env.OPPORTUNITY_RADAR_EXA_ENABLED !== "false");
  const tavilyEnabled = Boolean(process.env.TAVILY_API_KEY?.trim() && process.env.OPPORTUNITY_RADAR_TAVILY_ENABLED !== "false");
  for (const country of markets) {
    for (const strategy of DISCOVERY_STRATEGIES) {
      if (exaEnabled) add(
        "exa_discovery",
        `Exa — ${country} — ${strategy.label}`,
        `source:exa:${normalize(country)}:${strategy.id}`,
        { country, query, strategy: strategy.id, targetOpportunities },
      );
      if (tavilyEnabled) add(
        "tavily_discovery",
        `Tavily — ${country} — ${strategy.label}`,
        `source:tavily:${normalize(country)}:${strategy.id}`,
        { country, query, strategy: strategy.id, targetOpportunities },
      );
    }
  }
  const count = Number((db.prepare("SELECT count(*) AS count FROM queue_items WHERE run_id=?").get(id) as Row).count);
  db.prepare("UPDATE research_runs SET sources_total=?,message=?,updated_at=? WHERE id=?").run(
    count, `${count} discovery source(s) queued for a target of ${targetOpportunities} new valid cards.`, nowIso(), id,
  );
  addEvent(id, "info", "queued",
    `${count} discovery source(s) queued. Rejected, failed and previously known candidates do not count toward the ${targetOpportunities}-card target.`);
  return getResearchRun(id)!;
}

export function createOpportunityRefreshRun(limit = 200): ResearchRun {
  const db = getDb();
  const id = randomUUID();
  const time = nowIso();
  const organizations = db.prepare(`SELECT DISTINCT org.id,org.name,org.domain FROM organizations org
    JOIN opportunities o ON o.organization_id=org.id WHERE o.status!='eliminated' ORDER BY o.score DESC LIMIT ?`).all(Math.max(1, Math.min(200, limit))) as Row[];
  if (!organizations.length) throw new Error("There are no active opportunity cards to refresh.");
  const services = SERVICE_CATALOG.map((service) => service.id);
  db.prepare(`INSERT INTO research_runs(id,label,query,countries_json,services_json,status,desired_state,stage,progress,message,
    sources_total,sources_completed,organizations_found,created_at,updated_at,heartbeat_at)
    VALUES(?,?,?,?,?,'queued','running','queued',0,?,0,0,?,?,?,?)`)
    .run(id, "Refresh existing opportunity intelligence", "Refresh identities, official contacts, evidence and cards", json([]), json(services),
      `${organizations.length} existing organization(s) queued for refresh.`, organizations.length, time, time, time);
  const insert = db.prepare(`INSERT INTO queue_items(id,run_id,kind,label,position,status,progress,organization_id,dedupe_key,payload_json,created_at,updated_at)
    VALUES(?,?,'analyze_organization',?,?,'queued',0,?,?,?, ?,?)`);
  organizations.forEach((organization, index) => insert.run(
    randomUUID(), id, `Refresh ${String(organization.name)}`, 1000 + index, String(organization.id),
    `refresh:${String(organization.domain)}`, json({ organizationId: String(organization.id), refresh: true }), time, time,
  ));
  addEvent(id, "info", "queued", `${organizations.length} existing organization(s) queued for identity, contact and card refresh.`);
  return getResearchRun(id)!;
}
export function getResearchRun(id: string): ResearchRun | null {
  const row = getDb().prepare(`${runSelect} WHERE id=?`).get(id) as Row | undefined;
  return row ? mapRun(row) : null;
}
export function listResearchRuns(limit = 20): ResearchRun[] {
  return (getDb().prepare(`${runSelect} ORDER BY created_at DESC LIMIT ?`).all(limit) as Row[]).map(mapRun);
}
export function activeResearchRun(): ResearchRun | null {
  const row = getDb().prepare(`${runSelect} WHERE status IN ('queued','running','pausing','paused','stopping') ORDER BY created_at DESC LIMIT 1`).get() as Row | undefined;
  return row ? mapRun(row) : null;
}

export function setRunControl(id: string, desired: "running" | "paused" | "stopped"): ResearchRun {
  const db = getDb();
  const status: RunStatus = desired === "running" ? "queued" : desired === "paused" ? "pausing" : "stopping";
  db.prepare("UPDATE research_runs SET desired_state=?,status=?,stage=?,message=?,updated_at=?,heartbeat_at=? WHERE id=?")
    .run(desired, status, desired, desired === "running" ? "Resuming workers…" : `${desired === "paused" ? "Pausing" : "Stopping"} after the current safe checkpoint…`, nowIso(), nowIso(), id);
  addEvent(id, "info", desired, `User requested ${desired}.`);
  return getResearchRun(id)!;
}

function mapQueue(row: Row): QueueItem {
  return {
    id: String(row.id), runId: String(row.runId), kind: String(row.kind) as QueueItem["kind"], label: String(row.label),
    position: Number(row.position), status: String(row.status) as QueueItem["status"], progress: Number(row.progress),
    organizationId: row.organizationId ? String(row.organizationId) : null, payload: parseJson(row.payloadJson, {}),
    attempts: Number(row.attempts), error: row.error ? String(row.error) : null,
    createdAt: String(row.createdAt), updatedAt: String(row.updatedAt),
  };
}
const queueSelect = `SELECT id,run_id AS runId,kind,label,position,status,progress,organization_id AS organizationId,
  payload_json AS payloadJson,attempts,error,created_at AS createdAt,updated_at AS updatedAt FROM queue_items`;

export function claimQueueItem(runId: string, kinds: QueueItem["kind"][]): QueueItem | null {
  const db = getDb();
  const placeholders = kinds.map(() => "?").join(",");
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare(`${queueSelect} WHERE run_id=? AND status='queued' AND kind IN (${placeholders}) ORDER BY position,created_at LIMIT 1`)
      .get(runId, ...kinds) as Row | undefined;
    if (!row) { db.exec("COMMIT"); return null; }
    db.prepare("UPDATE queue_items SET status='running',progress=1,attempts=attempts+1,error=NULL,updated_at=? WHERE id=? AND status='queued'").run(nowIso(), String(row.id));
    db.exec("COMMIT");
    return mapQueue(db.prepare(`${queueSelect} WHERE id=?`).get(String(row.id)) as Row);
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function enqueueOrganizationAnalysis(runId: string, organization: Organization, candidateBudget: number): boolean {
  const db = getDb();
  const run = getResearchRun(runId);
  if (run && !organizationMatchesRequestedCountries(organization, run.countries)) {
    addEvent(runId, "warning", "market gate",
      `${organization.name} excluded before analysis: ${organization.country || organization.city || "location unverified"} is outside ${run.countries.join(", ")}.`);
    return false;
  }
  const alreadyHasCard = db.prepare("SELECT 1 AS found FROM opportunities WHERE organization_id=? LIMIT 1").get(organization.id) as Row | undefined;
  if (alreadyHasCard) return false;
  const current = Number((db.prepare("SELECT count(*) AS count FROM queue_items WHERE run_id=? AND kind='analyze_organization'").get(runId) as Row).count);
  if (current >= candidateBudget) return false;
  const time = nowIso();
  const result = db.prepare(`INSERT OR IGNORE INTO queue_items(id,run_id,kind,label,position,status,progress,organization_id,dedupe_key,payload_json,created_at,updated_at)
    VALUES(?,?, 'analyze_organization',?,1000,'queued',0,?,?,?, ?,?)`)
    .run(randomUUID(), runId, `Analyze ${organization.name}`, organization.id, `analyze:${organization.domain}`, json({ organizationId: organization.id }), time, time);
  if (Number(result.changes)) {
    db.prepare("UPDATE research_runs SET organizations_found=organizations_found+1,updated_at=? WHERE id=?").run(time, runId);
    addEvent(runId, "info", "candidate", `${organization.name} added to the evidence-analysis queue.`);
    return true;
  }
  return false;
}

export function updateQueueItem(id: string, patch: { status?: QueueItem["status"]; progress?: number; error?: string | null }): void {
  const current = getDb().prepare(`${queueSelect} WHERE id=?`).get(id) as Row | undefined;
  if (!current) return;
  const item = mapQueue(current);
  getDb().prepare("UPDATE queue_items SET status=?,progress=?,error=?,updated_at=? WHERE id=?")
    .run(patch.status || item.status, patch.progress ?? item.progress, patch.error === undefined ? item.error : patch.error, nowIso(), id);
}

function isRefreshRun(db: DatabaseSync, runId: string): boolean {
  return Boolean(db.prepare(`SELECT 1 AS found FROM queue_items
    WHERE run_id=? AND kind='analyze_organization' AND payload_json LIKE '%"refresh":true%' LIMIT 1`).get(runId));
}

function countRunCards(db: DatabaseSync, runId: string, newOnly: boolean): number {
  const createdFilter = newOnly
    ? "AND o.created_at >= r.created_at AND (r.completed_at IS NULL OR o.created_at <= r.completed_at)"
    : "";
  const run = db.prepare("SELECT countries_json AS countriesJson FROM research_runs WHERE id=?").get(runId) as Row | undefined;
  if (!run) return 0;
  const countries = parseJson<string[]>(run.countriesJson, []);
  const rows = db.prepare(`SELECT DISTINCT o.id,org.country,org.city,org.website,org.source_type AS sourceType FROM opportunities o
    JOIN organizations org ON org.id=o.organization_id
    JOIN queue_items q ON q.organization_id=o.organization_id AND q.run_id=?
    JOIN research_runs r ON r.id=q.run_id
    WHERE 1=1 ${createdFilter}`).all(runId) as Row[];
  return rows.filter((row) => organizationMatchesRequestedCountries({
    id: "", name: "", domain: "", description: "", sizeBand: "", services: [], verticals: [],
    lastScannedAt: null, createdAt: "", updatedAt: "", sourceUrl: "",
    website: String(row.website || ""), country: String(row.country || ""), city: String(row.city || ""),
    sourceType: String(row.sourceType || ""),
  }, countries)).length;
}

export function countNewRunOpportunities(runId: string): number {
  return countRunCards(getDb(), runId, true);
}

export function targetOpportunitiesForRun(runId: string): number {
  const rows = getDb().prepare("SELECT payload_json AS payloadJson FROM queue_items WHERE run_id=? ORDER BY position").all(runId) as Row[];
  for (const row of rows) {
    const payload = parseJson<Record<string, unknown>>(row.payloadJson, {});
    const value = Number(payload.targetOpportunities ?? payload.maxOrganizations);
    if (Number.isFinite(value) && value > 0) return Math.max(1, Math.min(200, value));
  }
  return 30;
}

export function skipQueuedRunWork(runId: string, reason: string): number {
  const result = getDb().prepare("UPDATE queue_items SET status='skipped',progress=100,error=?,updated_at=? WHERE run_id=? AND status='queued'")
    .run(reason, nowIso(), runId);
  return Number(result.changes);
}

export function heartbeatRun(id: string, stage: string, message: string): void {
  const db = getDb();
  const sourceStats = db.prepare(`SELECT
    sum(CASE WHEN kind!='analyze_organization' THEN 1 ELSE 0 END) AS total,
    sum(CASE WHEN kind!='analyze_organization' AND status IN ('completed','failed','rejected','skipped') THEN 1 ELSE 0 END) AS done,
    sum(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failures
    FROM queue_items WHERE run_id=?`).get(id) as Row;
  const analysisStats = db.prepare(`SELECT
    sum(CASE WHEN kind='analyze_organization' AND status IN ('completed','rejected') THEN 1 ELSE 0 END) AS analyzed,
    sum(CASE WHEN kind='analyze_organization' AND status='queued' THEN 1 ELSE 0 END) AS queued,
    sum(CASE WHEN kind='analyze_organization' AND status='running' THEN 1 ELSE 0 END) AS running
    FROM queue_items WHERE run_id=?`).get(id) as Row;
  const refresh = isRefreshRun(db, id);
  const opportunities = countRunCards(db, id, !refresh);
  const total = Number(sourceStats.total || 0) + Number(analysisStats.analyzed || 0) + Number(analysisStats.queued || 0) + Number(analysisStats.running || 0);
  const done = Number(sourceStats.done || 0) + Number(analysisStats.analyzed || 0);
  const workProgress = total ? Math.min(98, Math.round((done / total) * 100)) : 0;
  const target = targetOpportunitiesForRun(id);
  const progress = refresh ? workProgress : Math.min(98, Math.round((opportunities / target) * 100));
  db.prepare(`UPDATE research_runs SET status='running',stage=?,progress=?,message=?,sources_total=?,sources_completed=?,
    organizations_analyzed=?,opportunities_created=?,failures=?,updated_at=?,heartbeat_at=? WHERE id=?`)
    .run(stage, progress, message, Number(sourceStats.total || 0), Number(sourceStats.done || 0), Number(analysisStats.analyzed || 0),
      opportunities, Number(sourceStats.failures || 0), nowIso(), nowIso(), id);
}

export function finalizeRunIfDone(id: string): ResearchRun {
  const db = getDb();
  const run = getResearchRun(id);
  if (!run) throw new Error("Research run no longer exists.");
  if (run.desiredState === "paused") {
    db.prepare("UPDATE research_runs SET status='paused',stage='paused',message='Paused at a safe checkpoint.',updated_at=?,heartbeat_at=? WHERE id=?").run(nowIso(), nowIso(), id);
    return getResearchRun(id)!;
  }
  if (run.desiredState === "stopped") {
    db.prepare("UPDATE queue_items SET status='skipped',error='Stopped by user',updated_at=? WHERE run_id=? AND status='queued'").run(nowIso(), id);
    db.prepare("UPDATE research_runs SET status='stopped',stage='stopped',progress=100,message='Stopped by the user.',updated_at=?,heartbeat_at=?,completed_at=? WHERE id=?").run(nowIso(), nowIso(), nowIso(), id);
    return getResearchRun(id)!;
  }
  const open = Number((db.prepare("SELECT count(*) AS count FROM queue_items WHERE run_id=? AND status IN ('queued','running')").get(id) as Row).count);
  if (!open) {
    const failed = Number((db.prepare("SELECT count(*) AS count FROM queue_items WHERE run_id=? AND status='failed'").get(id) as Row).count);
    const refresh = isRefreshRun(db, id);
    const opportunities = countRunCards(db, id, !refresh);
    const target = targetOpportunitiesForRun(id);
    const status = opportunities || !failed ? "completed" : "failed";
    const message = refresh
      ? `${opportunities} existing opportunity card${opportunities === 1 ? "" : "s"} refreshed.`
      : opportunities >= target
        ? `Target reached: ${opportunities}/${target} new valid opportunity cards created.`
        : opportunities
          ? `Sources exhausted after ${opportunities}/${target} new valid cards. Rejected, failed and duplicate candidates were not counted.`
          : failed ? "No new valid opportunity was created; inspect source and analysis failures below." : "The scan completed without enough evidence for a new opportunity.";
    db.prepare("UPDATE research_runs SET status=?,stage=?,progress=100,message=?,updated_at=?,heartbeat_at=?,completed_at=? WHERE id=?")
      .run(status, status, message, nowIso(), nowIso(), nowIso(), id);
    addEvent(id, status === "completed" ? "success" : "error", status, message);
  }
  return getResearchRun(id)!;
}

export function addEvent(runId: string, level: "info" | "success" | "warning" | "error", stage: string, message: string): void {
  getDb().prepare("INSERT INTO run_events(run_id,level,stage,message,created_at) VALUES(?,?,?,?,?)").run(runId, level, stage, message, nowIso());
}
export function listRunEvents(runId: string, limit = 100): Array<{ id: number; level: string; stage: string; message: string; createdAt: string }> {
  return (getDb().prepare("SELECT id,level,stage,message,created_at AS createdAt FROM run_events WHERE run_id=? ORDER BY id DESC LIMIT ?").all(runId, limit) as Row[])
    .map((row) => ({ id: Number(row.id), level: String(row.level), stage: String(row.stage), message: String(row.message), createdAt: String(row.createdAt) }));
}
export function listRunQueue(runId: string): QueueItem[] {
  return (getDb().prepare(`${queueSelect} WHERE run_id=? ORDER BY position,created_at`).all(runId) as Row[]).map(mapQueue);
}

export type IntelligenceAnalysis = {
  organization: { canonicalName: string; identityConfidence: number; description: string; services: string[]; verticals: string[]; sizeBand: string };
  signals: Array<{
    claimKind: "fact" | "inference"; signalType: string; claim: string; excerpt: string;
    sourceUrl: string; eventDate: string | null; sourceQuality: number;
  }>;
  people: Array<{
    name: string; role: string; professionalUrl: string; email: string; contactUrl: string;
    verificationLevel: VerificationLevel; sourceUrl: string;
  }>;
  opportunities: Array<{
    serviceId: string; title: string; needStatement: string; needKind: "explicit" | "inferred" | "investigate";
    engagementMode: "freelance" | "dual"; hiringRole: string;
    whyNow: string; score: number; confidence: number; buyerRole: string; personName: string;
    subject: string; hook: string; shortMessage: string; longMessage: string; followUp: string;
    openingQuestion: string; evidenceClaims: string[];
  }>;
};

export function saveIntelligenceAnalysis(
  organizationId: string,
  analysis: IntelligenceAnalysis,
  options: { runId?: string; targetOpportunities?: number } = {},
): { opportunities: number; newOpportunities: number; evidence: number; people: number; targetReached: boolean; marketMismatch: boolean } {
  const db = getDb();
  const time = nowIso();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (options.runId) {
      const runRow = db.prepare("SELECT countries_json AS countriesJson FROM research_runs WHERE id=?").get(options.runId) as Row | undefined;
      const organizationRow = db.prepare(`${organizationSelect} WHERE id=?`).get(organizationId) as Row | undefined;
      const countries = runRow ? parseJson<string[]>(runRow.countriesJson, []) : [];
      if (organizationRow && !organizationMatchesRequestedCountries(mapOrganization(organizationRow), countries)) {
        db.exec("COMMIT");
        return { opportunities: 0, newOpportunities: 0, evidence: 0, people: 0, targetReached: false, marketMismatch: true };
      }
    }
    if (options.runId && options.targetOpportunities
      && countRunCards(db, options.runId, true) >= options.targetOpportunities) {
      db.exec("COMMIT");
      return { opportunities: 0, newOpportunities: 0, evidence: 0, people: 0, targetReached: true, marketMismatch: false };
    }
    if (analysis.organization.identityConfidence >= 80) updateOrganizationIdentity(organizationId, analysis.organization.canonicalName);
    updateOrganizationIntelligence(organizationId, analysis.organization);

    const documents = listSourceDocuments(organizationId);
    const documentByUrl = new Map(documents.map((document) => [document.url, document.id]));
    const validSignals: Array<{ signal: IntelligenceAnalysis["signals"][number]; documentId: string }> = [];
    for (const signal of analysis.signals) {
      const documentId = documentByUrl.get(signal.sourceUrl);
      if (documentId) validSignals.push({ signal, documentId });
    }
    const availableClaims = new Set(validSignals.map(({ signal }) => normalize(signal.claim)));
    const candidates: Array<{
      opportunity: IntelligenceAnalysis["opportunities"][number];
      service: NonNullable<ReturnType<typeof serviceById>>;
      linkedClaims: string[];
    }> = [];
    for (const opportunity of analysis.opportunities) {
      const service = serviceById(opportunity.serviceId);
      if (!service || opportunity.confidence < 50 || opportunity.score < 45) continue;
      const linkedClaims = [...new Set(opportunity.evidenceClaims.map(normalize).filter((claim) => availableClaims.has(claim)))];
      if (linkedClaims.length) candidates.push({ opportunity, service, linkedClaims });
    }
    candidates.sort((a, b) => b.opportunity.score - a.opportunity.score
      || b.opportunity.confidence - a.opportunity.confidence
      || b.linkedClaims.length - a.linkedClaims.length
      || Number(b.opportunity.engagementMode === "dual") - Number(a.opportunity.engagementMode === "dual"));

    const personIds = new Map<string, string>();
    for (const person of analysis.people) {
      if (!person.role.trim()) continue;
      const id = randomUUID();
      db.prepare(`INSERT INTO people(id,organization_id,name,role,professional_url,email,contact_url,verification_level,source_url,observed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(organization_id,name,role) DO UPDATE SET professional_url=excluded.professional_url,email=excluded.email,
        contact_url=excluded.contact_url,verification_level=excluded.verification_level,source_url=excluded.source_url,observed_at=excluded.observed_at`)
        .run(id, organizationId, person.name, person.role, person.professionalUrl, person.email, person.contactUrl, person.verificationLevel, person.sourceUrl, time);
      const stored = db.prepare("SELECT id FROM people WHERE organization_id=? AND name=? AND role=?").get(organizationId, person.name, person.role) as Row;
      personIds.set(normalize(person.name), String(stored.id));
    }

    const existing = db.prepare(`SELECT id,status FROM opportunities WHERE organization_id=?
      ORDER BY CASE status WHEN 'won' THEN 8 WHEN 'proposal' THEN 7 WHEN 'pilot' THEN 6 WHEN 'discovery_call' THEN 5
        WHEN 'replied' THEN 4 WHEN 'contacted' THEN 3 WHEN 'reviewed' THEN 2 WHEN 'snoozed' THEN 2 WHEN 'new' THEN 1 ELSE 0 END DESC,
        score DESC,confidence DESC,updated_at DESC LIMIT 1`).get(organizationId) as Row | undefined;
    const best = candidates[0];
    if (!best) {
      const evidence = Number((db.prepare("SELECT count(*) AS count FROM evidence_items WHERE organization_id=?").get(organizationId) as Row).count || 0);
      db.exec("COMMIT");
      return { opportunities: existing && String(existing.status) !== "eliminated" ? 1 : 0, newOpportunities: 0, evidence, people: personIds.size, targetReached: false, marketMismatch: false };
    }

    db.prepare("DELETE FROM opportunity_evidence WHERE opportunity_id IN (SELECT id FROM opportunities WHERE organization_id=?)").run(organizationId);
    db.prepare("DELETE FROM evidence_items WHERE organization_id=?").run(organizationId);
    const evidenceIds = new Map<string, string>();
    for (const { signal, documentId } of validSignals) {
      const id = randomUUID();
      db.prepare(`INSERT INTO evidence_items(id,organization_id,document_id,claim_kind,signal_type,claim,excerpt,source_url,event_date,source_quality,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, organizationId, documentId, signal.claimKind, signal.signalType, signal.claim, signal.excerpt, signal.sourceUrl, signal.eventDate,
          Math.max(0, Math.min(100, signal.sourceQuality)), time);
      evidenceIds.set(normalize(signal.claim), id);
    }

    const opportunity = best.opportunity;
    const personId = opportunity.personName ? personIds.get(normalize(opportunity.personName)) || null : null;
    let opportunityId: string;
    if (existing) {
      opportunityId = String(existing.id);
      db.prepare(`UPDATE opportunities SET service_id=?,title=?,need_statement=?,need_kind=?,why_now=?,score=?,confidence=?,
        engagement_mode=?,hiring_role=?,buyer_role=?,person_id=?,subject=?,hook=?,short_message=?,long_message=?,follow_up=?,
        opening_question=?,proof_project=?,updated_at=? WHERE id=?`)
        .run(opportunity.serviceId, opportunity.title, opportunity.needStatement, opportunity.needKind, opportunity.whyNow,
          Math.max(0, Math.min(100, opportunity.score)), Math.max(0, Math.min(100, opportunity.confidence)),
          opportunity.engagementMode, opportunity.hiringRole, opportunity.buyerRole, personId, opportunity.subject, opportunity.hook,
          opportunity.shortMessage, opportunity.longMessage, opportunity.followUp, opportunity.openingQuestion, best.service.proofProject,
          time, opportunityId);
    } else {
      opportunityId = randomUUID();
      db.prepare(`INSERT INTO opportunities(id,organization_id,service_id,title,need_statement,need_kind,why_now,score,confidence,status,
        engagement_mode,hiring_role,buyer_role,person_id,subject,hook,short_message,long_message,follow_up,opening_question,proof_project,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,'new',?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(opportunityId, organizationId, opportunity.serviceId, opportunity.title, opportunity.needStatement, opportunity.needKind, opportunity.whyNow,
          Math.max(0, Math.min(100, opportunity.score)), Math.max(0, Math.min(100, opportunity.confidence)), opportunity.engagementMode,
          opportunity.hiringRole, opportunity.buyerRole, personId, opportunity.subject, opportunity.hook, opportunity.shortMessage,
          opportunity.longMessage, opportunity.followUp, opportunity.openingQuestion, best.service.proofProject, time, time);
    }
    for (const claim of best.linkedClaims) {
      const evidenceId = evidenceIds.get(claim);
      if (evidenceId) db.prepare("INSERT OR IGNORE INTO opportunity_evidence(opportunity_id,evidence_id) VALUES(?,?)").run(opportunityId, evidenceId);
    }
    db.exec("COMMIT");
    return {
      opportunities: existing && String(existing.status) === "eliminated" ? 0 : 1,
      newOpportunities: existing ? 0 : 1,
      evidence: evidenceIds.size,
      people: personIds.size,
      targetReached: false,
      marketMismatch: false,
    };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
function mapEvidence(row: Row): EvidenceItem {
  return {
    id: String(row.id), organizationId: String(row.organizationId), documentId: String(row.documentId),
    claimKind: String(row.claimKind) as EvidenceItem["claimKind"], signalType: String(row.signalType),
    claim: String(row.claim), excerpt: String(row.excerpt), sourceUrl: String(row.sourceUrl),
    eventDate: row.eventDate ? String(row.eventDate) : null, sourceQuality: Number(row.sourceQuality), createdAt: String(row.createdAt),
  };
}
function mapPerson(row: Row): Person {
  return {
    id: String(row.id), organizationId: String(row.organizationId), name: String(row.name), role: String(row.role),
    professionalUrl: String(row.professionalUrl), email: String(row.email), contactUrl: String(row.contactUrl),
    verificationLevel: String(row.verificationLevel) as Person["verificationLevel"], sourceUrl: String(row.sourceUrl), observedAt: String(row.observedAt),
  };
}

export function listOpportunities(options: { status?: string; service?: string; country?: string; limit?: number } = {}): Opportunity[] {
  const db = getDb();
  const conditions = ["1=1"]; const params: Array<string | number | null> = [];
  if (options.status && options.status !== "all") { conditions.push("o.status=?"); params.push(options.status); }
  else conditions.push("o.status!='eliminated'");
  if (options.service && options.service !== "all") { conditions.push("o.service_id=?"); params.push(options.service); }
  if (options.country && options.country !== "all") { conditions.push("org.country=?"); params.push(options.country); }
  params.push(options.limit || 250);
  const rows = db.prepare(`SELECT o.*,org.name AS organizationName,org.website AS organizationWebsite,org.country,
    p.id AS personId,p.name AS personName,p.role AS personRole,p.professional_url AS personProfessionalUrl,
    p.email AS personEmail,p.contact_url AS personContactUrl,p.verification_level AS personVerificationLevel,
    p.source_url AS personSourceUrl,p.observed_at AS personObservedAt
    FROM opportunities o JOIN organizations org ON org.id=o.organization_id LEFT JOIN people p ON p.id=o.person_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY CASE o.status WHEN 'new' THEN 0 WHEN 'reviewed' THEN 1 WHEN 'contacted' THEN 2 ELSE 3 END,o.score DESC,o.confidence DESC,o.created_at DESC LIMIT ?`)
    .all(...params) as Row[];
  const evidenceStatement = db.prepare(`SELECT e.id,e.organization_id AS organizationId,e.document_id AS documentId,e.claim_kind AS claimKind,
    e.signal_type AS signalType,e.claim,e.excerpt,e.source_url AS sourceUrl,e.event_date AS eventDate,e.source_quality AS sourceQuality,e.created_at AS createdAt
    FROM evidence_items e JOIN opportunity_evidence oe ON oe.evidence_id=e.id WHERE oe.opportunity_id=? ORDER BY e.source_quality DESC`);
  return rows.map((row) => {
    const service = serviceById(String(row.service_id));
    const person = row.personId ? mapPerson({
      id: row.personId, organizationId: row.organization_id, name: row.personName, role: row.personRole,
      professionalUrl: row.personProfessionalUrl, email: row.personEmail, contactUrl: row.personContactUrl,
      verificationLevel: row.personVerificationLevel, sourceUrl: row.personSourceUrl, observedAt: row.personObservedAt,
    }) : null;
    const evidence = (evidenceStatement.all(String(row.id)) as Row[]).map(mapEvidence);
    const contacts = listOrganizationContacts(String(row.organization_id));
    const contactability = contactabilityScore({
      contacts,
      hasNamedPerson: Boolean(person?.name),
      hasProfessionalProfile: Boolean(person?.professionalUrl),
    });
    const buyerIntent = buyerIntentScore({
      needKind: String(row.need_kind) as Opportunity["needKind"],
      score: Number(row.score),
      datedEvidence: evidence.filter((item) => Boolean(item.eventDate)).length,
      text: `${row.title} ${row.need_statement} ${row.why_now} ${evidence.map((item) => item.claim).join(" ")}`,
    });
    const leadReadiness = assessLeadReadiness({ score: Number(row.score), confidence: Number(row.confidence), contactability, buyerIntent });
    return {
      id: String(row.id), organizationId: String(row.organization_id), organizationName: String(row.organizationName),
      organizationWebsite: String(row.organizationWebsite), country: String(row.country), serviceId: String(row.service_id),
      serviceName: service?.shortName || String(row.service_id), title: String(row.title), needStatement: String(row.need_statement),
      needKind: String(row.need_kind) as Opportunity["needKind"], whyNow: String(row.why_now), score: Number(row.score),
      confidence: Number(row.confidence), status: String(row.status) as OpportunityStatus, buyerRole: String(row.buyer_role), person,
      contacts, leadReadiness, engagementMode: String(row.engagement_mode) as Opportunity["engagementMode"],
      hiringRole: String(row.hiring_role || ""), buyerIntent, contactability,
      subject: String(row.subject), hook: String(row.hook), shortMessage: String(row.short_message), longMessage: String(row.long_message),
      followUp: String(row.follow_up), openingQuestion: String(row.opening_question), proofProject: String(row.proof_project), evidence,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  });
}
export function updateOpportunity(id: string, status: OpportunityStatus, note = ""): void {
  const db = getDb();
  const time = nowIso();
  db.prepare("UPDATE opportunities SET status=?,updated_at=? WHERE id=?").run(status, time, id);
  db.prepare("INSERT INTO interactions(id,opportunity_id,kind,note,occurred_at) VALUES(?,?,?,?,?)").run(randomUUID(), id, status, note, time);
  if (status === "eliminated") {
    const row = db.prepare(`SELECT org.id,org.domain FROM opportunities o JOIN organizations org ON org.id=o.organization_id WHERE o.id=?`).get(id) as Row | undefined;
    if (row) db.prepare("INSERT OR REPLACE INTO suppression_list(id,organization_id,domain,reason,created_at) VALUES(?,?,?,?,?)")
      .run(randomUUID(), String(row.id), String(row.domain), note || "Eliminated by user", time);
  }
}

export function dashboardSnapshot(): DashboardSnapshot {
  const db = getDb();
  const scalar = (sql: string, ...params: Array<string | number | null>) => Number((db.prepare(sql).get(...params) as Row).count || 0);
  const distribution = (sql: string) => (db.prepare(sql).all() as Row[]).map((row) => ({ label: String(row.label || "Worldwide"), value: Number(row.value) }));
  return {
    totals: {
      organizations: scalar("SELECT count(*) AS count FROM organizations"),
      opportunities: scalar("SELECT count(*) AS count FROM opportunities WHERE status!='eliminated'"),
      hot: scalar("SELECT count(*) AS count FROM opportunities WHERE score>=75 AND confidence>=70 AND status NOT IN ('eliminated','lost')"),
      verifiedPeople: scalar("SELECT count(*) AS count FROM people WHERE verification_level='verified_person'"),
      contacted: scalar("SELECT count(*) AS count FROM opportunities WHERE status IN ('contacted','replied','discovery_call','pilot','proposal','won')"),
      replied: scalar("SELECT count(*) AS count FROM opportunities WHERE status IN ('replied','discovery_call','pilot','proposal','won')"),
      won: scalar("SELECT count(*) AS count FROM opportunities WHERE status='won'"),
    },
    pipeline: {
      total: scalar("SELECT count(*) AS count FROM opportunities WHERE status!='eliminated'"),
      waiting: scalar("SELECT count(*) AS count FROM opportunities WHERE status IN ('new','reviewed','snoozed')"),
      contacted: scalar("SELECT count(*) AS count FROM opportunities WHERE status='contacted'"),
      replied: scalar("SELECT count(*) AS count FROM opportunities WHERE status='replied'"),
      interviews: scalar("SELECT count(*) AS count FROM opportunities WHERE status IN ('discovery_call','pilot')"),
      proposals: scalar("SELECT count(*) AS count FROM opportunities WHERE status='proposal'"),
      won: scalar("SELECT count(*) AS count FROM opportunities WHERE status='won'"),
      rejected: scalar("SELECT count(*) AS count FROM opportunities WHERE status='lost'"),
    },
    byCountry: distribution(`SELECT COALESCE(NULLIF(org.country,''),'Worldwide') AS label,count(*) AS value
      FROM opportunities o JOIN organizations org ON org.id=o.organization_id
      WHERE o.status!='eliminated' GROUP BY label ORDER BY value DESC,label`),
    byService: distribution(`SELECT CASE service_id
      ${SERVICE_CATALOG.map((service) => `WHEN '${service.id}' THEN '${service.shortName.replaceAll("'", "''")}'`).join(" ")}
      ELSE service_id END AS label,count(*) AS value FROM opportunities WHERE status!='eliminated' GROUP BY service_id ORDER BY value DESC`),
    byStatus: distribution("SELECT status AS label,count(*) AS value FROM opportunities WHERE status!='eliminated' GROUP BY status ORDER BY value DESC"),
    recentOpportunities: listOpportunities({ limit: 5 }),
    activeRun: activeResearchRun(),
  };
}

export function resetDatabaseForTests(filePath: string): DatabaseSync {
  if (global.__opportunityRadarDb) { global.__opportunityRadarDb.close(); global.__opportunityRadarDb = undefined; }
  global.__opportunityRadarSchemaVersion = undefined;
  const db = new DatabaseSync(path.resolve(filePath));
  initialize(db);
  global.__opportunityRadarSchemaVersion = SCHEMA_VERSION;
  global.__opportunityRadarDb = db;
  return db;
}
