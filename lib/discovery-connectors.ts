import "server-only";
import { createHash } from "node:crypto";
import { saveOrganizationContacts, saveSourceDocument, upsertOrganization } from "@/lib/db";
import { extractOfficialContacts } from "@/lib/contacts";
import { companyNameFromSearchHit, searchHitIsUsable } from "@/lib/discovery-quality";
import { discoveryStrategyPrompt, marketMatchesRequestedCountries, requestedMarketsAllowWorldwide, resolveMarket } from "@/lib/geography";
import type { Organization } from "@/lib/types";

const BOAMP_RECORDS_URL = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records";
const TED_SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search";
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const EXA_SEARCH_URL = "https://api.exa.ai/search";
const GREENHOUSE_DOMAINS = ["job-boards.greenhouse.io", "boards.greenhouse.io"];
const LEVER_DOMAINS = ["jobs.lever.co"];
export type DiscoveryInput = {
  query: string;
  countries?: string[];
  country?: string;
  services?: string[];
  strategy?: string;
  maxOrganizations: number;
};

type SearchHit = { title: string; url: string; text: string; publishedDate: string | null };
type Progress = (message: string) => void;

function publicHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "::1") return null;
    if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return null;
    return url;
  } catch { return null; }
}

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, " ").trim();
}

function identityToken(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "unknown";
}

function addUnique(list: Organization[], organization: Organization, maximum: number): void {
  if (list.length < maximum && !list.some((item) => item.id === organization.id)) list.push(organization);
}

function saveEvidence(organization: Organization, input: {
  url: string; title: string; sourceType: string; text: string; publishedAt?: string | null;
}): void {
  const text = stripHtml(input.text).slice(0, 18_000);
  if (text.length < 80) return;
  saveSourceDocument({
    organizationId: organization.id, url: input.url, title: input.title, sourceType: input.sourceType,
    publishedAt: input.publishedAt || null, contentHash: createHash("sha256").update(text).digest("hex"), text,
  });
  saveOrganizationContacts(organization.id, extractOfficialContacts(input.text, input.url));
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 40_000): Promise<T> {
  const safe = publicHttpUrl(url);
  if (!safe) throw new Error(`Blocked non-public connector URL: ${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(safe, { ...init, signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    return await response.json() as T;
  } finally { clearTimeout(timer); }
}

export function isRelevantOpportunityText(value: string): boolean {
  return /(artificial intelligence|intelligence artificielle|\bai\b|\bia\b|machine learning|deep learning|data science|data engineer|rag\b|\bllm|nlp\b|computer vision|vision par ordinateur|ocr\b|document intelligence|automati[sz]ation|automatisation|workflow|agentic|agents? ia|chatbot|generative ai|ia generative|ia générative|mlops)/i.test(value);
}

export function localizedText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(localizedText).filter(Boolean).join(" · ");
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["eng", "fra", "en", "fr"]) {
    const candidate = localizedText(record[key]);
    if (candidate) return candidate;
  }
  return Object.values(record).map(localizedText).filter(Boolean).join(" · ");
}

export function parseGreenhouseJobUrl(value: string): { token: string; jobId: string } | null {
  const url = publicHttpUrl(value);
  if (!url || !GREENHOUSE_DOMAINS.includes(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const jobsIndex = parts.findIndex((part) => part === "jobs");
  if (jobsIndex < 1 || !/^\d+$/.test(parts[jobsIndex + 1] || "")) return null;
  return { token: parts[jobsIndex - 1], jobId: parts[jobsIndex + 1] };
}

export function parseLeverJobUrl(value: string): { site: string; postingId: string } | null {
  const url = publicHttpUrl(value);
  if (!url || !LEVER_DOMAINS.includes(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || !/^[a-z0-9-]{8,}$/i.test(parts[1])) return null;
  return { site: parts[0], postingId: parts[1] };
}

function lookbackDate(days = Number(process.env.OPPORTUNITY_RADAR_PUBLIC_SOURCE_LOOKBACK_DAYS || 45)): Date {
  return new Date(Date.now() - Math.max(1, Math.min(180, days)) * 86_400_000);
}

function dateIsOpen(value: unknown): boolean {
  if (!value) return true;
  const timestamp = Date.parse(String(value));
  return !Number.isFinite(timestamp) || timestamp >= Date.now() - 86_400_000;
}

export async function discoverBoamp(input: DiscoveryInput, progress?: Progress): Promise<Organization[]> {
  if (process.env.OPPORTUNITY_RADAR_BOAMP_ENABLED === "false") return [];
  progress?.("BOAMP: querying recent official French public tenders…");
  const from = lookbackDate().toISOString().slice(0, 10);
  const where = `dateparution >= date'${from}' and (search(objet, 'intelligence artificielle') or search(objet, 'machine learning') or search(objet, 'automatisation') or search(objet, 'data') or search(objet, 'OCR') or search(objet, 'chatbot'))`;
  const query = new URLSearchParams({
    select: "idweb,objet,dateparution,datefindiffusion,datelimitereponse,nomacheteur,url_avis,type_procedure,procedure_libelle,nature_libelle,descripteur_libelle,type_marche",
    where, order_by: "dateparution desc", limit: String(Math.max(15, Math.min(100, input.maxOrganizations * 8))),
  });
  const payload = await fetchJson<{ results?: Array<Record<string, unknown>> }>(`${BOAMP_RECORDS_URL}?${query}`, undefined, 45_000);
  const organizations: Organization[] = [];
  for (const record of payload.results || []) {
    const title = localizedText(record.objet);
    const buyer = localizedText(record.nomacheteur);
    const url = publicHttpUrl(localizedText(record.url_avis));
    if (!buyer || !url || !isRelevantOpportunityText(`${title} ${localizedText(record.descripteur_libelle)}`) || !dateIsOpen(record.datelimitereponse)) continue;
    const text = [
      `Official BOAMP tender: ${title}`, `Buyer: ${buyer}`, `Publication date: ${localizedText(record.dateparution)}`,
      `Response deadline: ${localizedText(record.datelimitereponse) || "Not specified"}`,
      `Procedure: ${localizedText(record.procedure_libelle)}`, `Market: ${localizedText(record.nature_libelle)}`,
      `Descriptors: ${localizedText(record.descripteur_libelle)}`, `Research query: ${input.query}`,
    ].filter(Boolean).join("\n");
    const organization = upsertOrganization({
      name: buyer, website: url.toString(), identityKey: `boamp:${identityToken(buyer)}`, country: "France",
      description: title.slice(0, 700), sourceType: "boamp-api", sourceUrl: url.toString(),
    }).organization;
    saveEvidence(organization, { url: url.toString(), title, sourceType: "boamp-api", text, publishedAt: localizedText(record.dateparution) || null });
    addUnique(organizations, organization, input.maxOrganizations);
    if (organizations.length >= input.maxOrganizations) break;
  }
  progress?.(`BOAMP produced ${organizations.length} recent AI-relevant buyer(s) with exact notice links.`);
  return organizations;
}

function tedDirectUrl(notice: Record<string, unknown>): string {
  const links = notice.links as Record<string, unknown> | undefined;
  const direct = links?.htmlDirect as Record<string, unknown> | undefined;
  return localizedText(direct?.ENG) || localizedText(direct?.FRA) || localizedText(direct);
}

function countryDisplay(code: string): string {
  if (!code) return "Europe";
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) || code; } catch { return code; }
}

export async function discoverTed(input: DiscoveryInput, progress?: Progress): Promise<Organization[]> {
  if (process.env.OPPORTUNITY_RADAR_TED_ENABLED === "false") return [];
  progress?.("TED: querying active European public tenders…");
  const from = lookbackDate().toISOString().slice(0, 10).replaceAll("-", "");
  const body = {
    query: `PD >= ${from} AND (FT ~ "artificial intelligence" OR FT ~ "machine learning" OR FT ~ "document intelligence" OR FT ~ "workflow automation" OR FT ~ "computer vision")`,
    fields: ["publication-number", "notice-title", "buyer-name", "buyer-country", "buyer-internet-address", "publication-date", "deadline-receipt-tender-date-lot", "description-proc", "description-lot"],
    page: 1, limit: Math.max(15, Math.min(100, input.maxOrganizations * 6)), scope: "ACTIVE",
    checkQuerySyntax: false, paginationMode: "PAGE_NUMBER", onlyLatestVersions: true,
  };
  const payload = await fetchJson<{ notices?: Array<Record<string, unknown>> }>(TED_SEARCH_URL, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }, 50_000);
  const organizations: Organization[] = [];
  for (const notice of payload.notices || []) {
    const title = localizedText(notice["notice-title"]);
    const description = localizedText(notice["description-proc"]) || localizedText(notice["description-lot"]);
    if (!isRelevantOpportunityText(`${title} ${description}`)) continue;
    const buyer = localizedText(notice["buyer-name"]) || "European public buyer";
    const directUrl = publicHttpUrl(tedDirectUrl(notice));
    if (!directUrl) continue;
    const buyerWebsite = publicHttpUrl(localizedText(notice["buyer-internet-address"]));
    const countryCode = localizedText(notice["buyer-country"]).split(/\s|·/)[0];
    const deadline = localizedText(notice["deadline-receipt-tender-date-lot"]);
    if (!dateIsOpen(deadline)) continue;
    const text = [
      `Official TED tender: ${title}`, `Buyer: ${buyer}`, `Country: ${countryDisplay(countryCode)}`,
      `Publication date: ${localizedText(notice["publication-date"])}`, `Response deadline: ${deadline || "Not specified"}`,
      `Description: ${description}`, `Research query: ${input.query}`,
    ].join("\n");
    const organization = upsertOrganization({
      name: buyer, website: (buyerWebsite || directUrl).toString(),
      identityKey: buyerWebsite ? undefined : `ted:${identityToken(buyer)}`, country: countryDisplay(countryCode),
      description: `${title}. ${description}`.slice(0, 700), sourceType: "ted-api", sourceUrl: directUrl.toString(),
    }).organization;
    saveEvidence(organization, { url: directUrl.toString(), title, sourceType: "ted-api", text, publishedAt: localizedText(notice["publication-date"]) || null });
    addUnique(organizations, organization, input.maxOrganizations);
    if (organizations.length >= input.maxOrganizations) break;
  }
  progress?.(`TED produced ${organizations.length} active AI-relevant public buyer(s).`);
  return organizations;
}

async function tavilySearch(query: string, domains: string[] | undefined, maximum: number): Promise<SearchHit[]> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) throw new Error("Tavily is not configured. Add TAVILY_API_KEY to .env.local.");
  const payload = await fetchJson<{ results?: Array<{ title?: string; url?: string; content?: string; raw_content?: string; published_date?: string }> }>(TAVILY_SEARCH_URL, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ api_key: key, query, search_depth: "advanced", max_results: Math.max(5, Math.min(30, maximum)), include_raw_content: true, ...(domains?.length ? { include_domains: domains } : {}) }),
  });
  return (payload.results || []).map((result) => ({
    title: result.title || "", url: result.url || "", text: result.raw_content || result.content || "", publishedDate: result.published_date || null,
  }));
}

async function exaSearch(query: string, domains: string[] | undefined, maximum: number): Promise<SearchHit[]> {
  const key = process.env.EXA_API_KEY?.trim();
  if (!key) throw new Error("Neither Tavily nor Exa is configured for ATS URL discovery.");
  const payload = await fetchJson<{ results?: Array<{ title?: string; url?: string; text?: string; publishedDate?: string }> }>(EXA_SEARCH_URL, {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({ query, type: "auto", numResults: Math.max(5, Math.min(30, maximum)), ...(domains?.length ? { includeDomains: domains } : {}), contents: { text: { maxCharacters: 7000 }, livecrawl: "fallback" } }),
  });
  return (payload.results || []).map((result) => ({ title: result.title || "", url: result.url || "", text: result.text || "", publishedDate: result.publishedDate || null }));
}

async function webSearch(query: string, domains: string[] | undefined, maximum: number): Promise<SearchHit[]> {
  if (process.env.TAVILY_API_KEY?.trim() && process.env.OPPORTUNITY_RADAR_TAVILY_ENABLED !== "false") return tavilySearch(query, domains, maximum);
  return exaSearch(query, domains, maximum);
}

export async function discoverWithTavily(input: DiscoveryInput, progress?: Progress): Promise<Organization[]> {
  if (process.env.OPPORTUNITY_RADAR_TAVILY_ENABLED === "false") return [];
  const country = input.country || input.countries?.join(", ") || "Worldwide";
  const services = input.services?.join(", ") || "RAG, document AI, AI automation, LLM security";
  const strategy = discoveryStrategyPrompt(input.strategy || "");
  progress?.("Tavily discovery started for " + country + "…");
  const searchQuery = input.query + ". Find official websites of companies and agencies operating in " + country
    + " with recent, concrete demand or delivery signals for " + services + ". " + strategy
    + " Results must explicitly prove the organization operates in " + country + ".";
  const hits = await tavilySearch(searchQuery, undefined, Number(process.env.OPPORTUNITY_RADAR_TAVILY_RESULTS_PER_QUERY || 15));
  const organizations: Organization[] = [];
  for (const hit of hits) {
    const url = publicHttpUrl(hit.url);
    const evidenceText = [hit.title, hit.text].join(" ");
    if (!url || !searchHitIsUsable(hit) || !isRelevantOpportunityText(evidenceText)) continue;
    const market = resolveMarket({ website: url.toString(), evidenceText });
    if (!marketMatchesRequestedCountries({
      countries: input.countries?.length ? input.countries : [country],
      country: market.country, city: market.city, website: url.toString(), evidenceText,
    })) continue;
    const storedCountry = market.country || (requestedMarketsAllowWorldwide(input.countries || [country]) ? "Worldwide" : "");
    const name = companyNameFromSearchHit(hit.title, url.toString());
    const organization = upsertOrganization({
      name, website: url.origin, country: storedCountry, city: market.city, description: hit.text.slice(0, 700),
      sourceType: "tavily-search", sourceUrl: url.toString(),
    }).organization;
    saveEvidence(organization, { url: url.toString(), title: hit.title || name, sourceType: "tavily-search", text: hit.text, publishedAt: hit.publishedDate });
    addUnique(organizations, organization, input.maxOrganizations);
    if (organizations.length >= input.maxOrganizations) break;
  }
  progress?.(`Tavily returned ${organizations.length} unique company domain(s) with relevant evidence.`);
  return organizations;
}

function atsQuery(input: DiscoveryInput, provider: "Greenhouse" | "Lever"): string {
  const markets = input.countries?.join(", ") || input.country || "France, Morocco and Europe";
  return `${input.query}. Find currently open AI engineer, machine learning, LLM, RAG, computer vision, data science or AI automation roles and contract opportunities in ${markets}. Return exact ${provider} job pages only.`;
}

type GreenhouseJob = {
  id?: number; title?: string; absolute_url?: string; content?: string; company_name?: string;
  first_published?: string; updated_at?: string; location?: { name?: string };
};

export async function discoverGreenhouseJobs(input: DiscoveryInput, progress?: Progress): Promise<Organization[]> {
  if (process.env.OPPORTUNITY_RADAR_ATS_ENABLED === "false") return [];
  progress?.("Greenhouse: discovering exact public job pages…");
  const hits = await webSearch(atsQuery(input, "Greenhouse"), GREENHOUSE_DOMAINS, Math.min(30, input.maxOrganizations * 3));
  const parsed = new Map<string, { token: string; jobId: string; hit: SearchHit }>();
  for (const hit of hits) {
    const match = parseGreenhouseJobUrl(hit.url);
    if (match) parsed.set(`${match.token}:${match.jobId}`, { ...match, hit });
  }
  const organizations: Organization[] = [];
  for (const entry of parsed.values()) {
    let job: GreenhouseJob;
    try { job = await fetchJson<GreenhouseJob>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(entry.token)}/jobs/${encodeURIComponent(entry.jobId)}`); }
    catch { continue; }
    const sourceUrl = publicHttpUrl(job.absolute_url || entry.hit.url);
    const text = stripHtml([job.title, job.company_name, job.location?.name, job.content].filter(Boolean).join("\n"));
    if (!sourceUrl || !job.title || !isRelevantOpportunityText(text)) continue;
    const market = resolveMarket({ location: job.location?.name || "", website: sourceUrl.toString() });
    if (!marketMatchesRequestedCountries({
      countries: input.countries || (input.country ? [input.country] : []),
      country: market.country, city: market.city, website: sourceUrl.toString(), evidenceText: job.location?.name || "",
    })) continue;
    const company = job.company_name?.trim() || entry.token.replace(/[-_]+/g, " ").replace(/\b\w/g, (value) => value.toUpperCase());
    const organization = upsertOrganization({
      name: company, website: sourceUrl.toString(), identityKey: `greenhouse:${identityToken(entry.token)}`,
      country: market.country || job.location?.name || "", city: market.city, description: text.slice(0, 700),
      sourceType: "greenhouse-api", sourceUrl: sourceUrl.toString(),
    }).organization;
    saveEvidence(organization, { url: sourceUrl.toString(), title: job.title, sourceType: "greenhouse-api", text, publishedAt: job.first_published || job.updated_at || entry.hit.publishedDate });
    addUnique(organizations, organization, input.maxOrganizations);
    if (organizations.length >= input.maxOrganizations) break;
  }
  progress?.(`Greenhouse produced ${organizations.length} organization(s) backed by complete public job JSON.`);
  return organizations;
}

type LeverPosting = {
  id?: string; text?: string; descriptionPlain?: string; additionalPlain?: string; hostedUrl?: string; applyUrl?: string;
  createdAt?: number; categories?: { location?: string; commitment?: string; team?: string; department?: string; level?: string };
  lists?: Array<{ text?: string; content?: string }>;
};

export async function discoverLeverJobs(input: DiscoveryInput, progress?: Progress): Promise<Organization[]> {
  if (process.env.OPPORTUNITY_RADAR_ATS_ENABLED === "false") return [];
  progress?.("Lever: discovering exact public job pages…");
  const hits = await webSearch(atsQuery(input, "Lever"), LEVER_DOMAINS, Math.min(30, input.maxOrganizations * 3));
  const parsed = new Map<string, { site: string; postingId: string; hit: SearchHit }>();
  for (const hit of hits) {
    const match = parseLeverJobUrl(hit.url);
    if (match) parsed.set(`${match.site}:${match.postingId}`, { ...match, hit });
  }
  const siteCache = new Map<string, LeverPosting[]>();
  const organizations: Organization[] = [];
  for (const entry of parsed.values()) {
    let postings = siteCache.get(entry.site);
    if (!postings) {
      try { postings = await fetchJson<LeverPosting[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(entry.site)}?mode=json`); }
      catch { postings = []; }
      siteCache.set(entry.site, postings);
    }
    const job = postings.find((posting) => posting.id === entry.postingId);
    if (!job?.text) continue;
    const sourceUrl = publicHttpUrl(job.hostedUrl || entry.hit.url);
    const listText = (job.lists || []).map((list) => `${list.text || ""}: ${stripHtml(list.content || "")}`).join("\n");
    const text = [job.text, job.categories?.location, job.categories?.commitment, job.categories?.team, job.categories?.level, job.descriptionPlain, listText, job.additionalPlain].filter(Boolean).join("\n");
    if (!sourceUrl || !isRelevantOpportunityText(text)) continue;
    const market = resolveMarket({ location: job.categories?.location || "", website: sourceUrl.toString() });
    if (!marketMatchesRequestedCountries({
      countries: input.countries || (input.country ? [input.country] : []),
      country: market.country, city: market.city, website: sourceUrl.toString(), evidenceText: job.categories?.location || "",
    })) continue;
    const company = entry.site.replace(/[-_]+/g, " ").replace(/\b\w/g, (value) => value.toUpperCase());
    const organization = upsertOrganization({
      name: company, website: sourceUrl.toString(), identityKey: `lever:${identityToken(entry.site)}`,
      country: market.country || job.categories?.location || "", city: market.city, description: text.slice(0, 700),
      sourceType: "lever-api", sourceUrl: sourceUrl.toString(),
    }).organization;
    saveEvidence(organization, { url: sourceUrl.toString(), title: job.text, sourceType: "lever-api", text, publishedAt: job.createdAt ? new Date(job.createdAt).toISOString() : entry.hit.publishedDate });
    addUnique(organizations, organization, input.maxOrganizations);
    if (organizations.length >= input.maxOrganizations) break;
  }
  progress?.(`Lever produced ${organizations.length} organization(s) backed by complete public posting JSON.`);
  return organizations;
}
