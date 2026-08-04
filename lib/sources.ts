import "server-only";
import { createHash } from "node:crypto";
import { saveOrganizationContacts, saveSourceDocument, updateOrganizationIdentity, upsertOrganization } from "@/lib/db";
import { extractOfficialContacts } from "@/lib/contacts";
import { companyNameFromSearchHit, searchHitIsUsable } from "@/lib/discovery-quality";
import { discoveryStrategyPrompt, marketMatchesRequestedCountries, requestedMarketsAllowWorldwide, resolveMarket } from "@/lib/geography";
import type { Organization } from "@/lib/types";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const FRANCE_NUM_JSON = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/activateurs-france-num/exports/json";
const blockedDomains = new Set([
  "linkedin.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "youtube.com",
  "google.com", "bing.com", "wikipedia.org", "github.com", "welcometothejungle.com",
]);

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

function cleanCompanyName(value: string, domain: string): string {
  const cleaned = value.replace(/\s*[|–—-]\s*(home|accueil|official|website|solutions?|services?).*$/i, "").replace(/\s+/g, " ").trim();
  if (cleaned && cleaned.length <= 100) return cleaned;
  return domain.split(".")[0].replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

function titleFromHtml(html: string): string {
  return stripHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").slice(0, 180);
}

function canonicalNameFromHtml(html: string, domain: string): string {
  const meta = html.match(/<meta\b[^>]*(?:property|name)=["'](?:og:site_name|application-name)["'][^>]*content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:site_name|application-name)["']/i)?.[1];
  const jsonName = html.match(/["'](?:@type)["']\s*:\s*["']Organization["'][\s\S]{0,1200}?["']name["']\s*:\s*["']([^"']+)["']/i)?.[1];
  const title = titleFromHtml(html);
  const domainToken = domain.split(".")[0].replace(/[-_]+/g, " ");
  for (const raw of [meta, jsonName, ...title.split(/\s+[|·–—]\s+|\s+-\s+/), domainToken]) {
    const value = stripHtml(raw || "").replace(/\s+/g, " ").trim();
    if (value.length >= 2 && value.length <= 80 && !/^(home|accueil|official website|services|solutions)$/i.test(value)) return value;
  }
  return "";
}

function linksFromHtml(html: string, base: URL): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi)) {
    try {
      const url = new URL(match[1], base);
      if (url.origin !== base.origin || !["http:", "https:"].includes(url.protocol)) continue;
      url.hash = ""; url.search = "";
      links.push(url.toString());
    } catch { /* malformed link */ }
  }
  return [...new Set(links)];
}

async function fetchText(url: string, timeoutMs = Number(process.env.OPPORTUNITY_RADAR_FETCH_TIMEOUT_MS || 15_000)): Promise<{ text: string; finalUrl: string; contentType: string }> {
  const safe = publicHttpUrl(url);
  if (!safe) throw new Error(`Blocked non-public URL: ${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(safe, {
      redirect: "follow", signal: controller.signal,
      headers: { "User-Agent": process.env.OPPORTUNITY_RADAR_USER_AGENT || "OpportunityRadar/0.1", Accept: "text/html,application/json,text/plain;q=0.8" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 12_000_000) throw new Error("Response exceeds the 12 MB safety limit.");
    return { text: await response.text(), finalUrl: response.url, contentType: response.headers.get("content-type") || "" };
  } finally { clearTimeout(timer); }
}

function relevantRecord(record: Record<string, unknown>): boolean {
  const value = JSON.stringify(record).toLowerCase();
  return /(intelligence artificielle|\bia\b|data|automatisation|automation|logiciel|erp|crm|odoo|document|digital|numerique|numérique|cloud|developpement|développement)/i.test(value);
}
function flattened(record: Record<string, unknown>): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  const walk = (value: unknown, prefix: string) => {
    if (typeof value === "string" || typeof value === "number") result.push([prefix.toLowerCase(), String(value)]);
    else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${prefix}.${index}`));
    else if (value && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([key, item]) => walk(item, `${prefix}.${key}`));
  };
  walk(record, "");
  return result;
}
function field(entries: Array<[string, string]>, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const found = entries.find(([key, value]) => pattern.test(key) && Boolean(value.trim()));
    if (found) return found[1].trim();
  }
  return "";
}

export async function discoverFranceNum(maxOrganizations: number, progress?: (message: string) => void): Promise<Organization[]> {
  progress?.("Downloading the reusable France Num open-data snapshot…");
  const response = await fetchText(FRANCE_NUM_JSON, 45_000);
  const raw = JSON.parse(response.text) as unknown;
  const records = Array.isArray(raw) ? raw : Array.isArray((raw as { results?: unknown[] })?.results) ? (raw as { results: unknown[] }).results : [];
  const organizations: Organization[] = [];
  let profilesInspected = 0;
  const maxProfiles = Math.max(25, maxOrganizations * 8);
  for (const item of records) {
    if (!item || typeof item !== "object" || !relevantRecord(item as Record<string, unknown>)) continue;
    const entries = flattened(item as Record<string, unknown>);
    const websiteRaw = field(entries, [/(lien_url_site_france_num|site.*(web|internet)|website|url)/i]);
    const profileUrl = publicHttpUrl(websiteRaw);
    if (!profileUrl) continue;
    profilesInspected++;
    if (profilesInspected > maxProfiles) break;
    let url: URL | null = profileUrl;
    if (profileUrl.hostname.replace(/^www\./, "") === "francenum.gouv.fr") {
      try {
        const profile = await fetchText(profileUrl.toString(), 12_000);
        url = null;
        for (const match of profile.text.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi)) {
          const candidate = publicHttpUrl(match[1].replace(/&amp;/g, "&"));
          if (!candidate) continue;
          const domain = candidate.hostname.replace(/^www\./, "");
          if (!domain.includes(".") || domain === "francenum.gouv.fr" || domain.endsWith(".gouv.fr") || blockedDomains.has(domain) || /hub-score|lettres-infos|service-public|legifrance|etalab/i.test(domain)) continue;
          url = candidate;
          break;
        }
      } catch { url = null; }
    }
    if (!url || blockedDomains.has(url.hostname.replace(/^www\./, ""))) continue;
    const name = field(entries, [/(raison.*sociale|nom.*structure|entreprise|denomination|dénomination|name)$/i]) || url.hostname;
    const city = field(entries, [/(commune|ville|city)$/i]);
    const description = field(entries, [/(description|competence|compétence|expertise|service|specialite|spécialité)/i]).slice(0, 700);
    try {
      const result = upsertOrganization({ name, website: url.origin, country: "France", city, description, sourceType: "france-num-open-data", sourceUrl: profileUrl.toString() });
      if (!organizations.some((org) => org.id === result.organization.id)) organizations.push(result.organization);
    } catch { /* invalid record */ }
    if (organizations.length >= maxOrganizations) break;
  }
  progress?.(`France Num produced ${organizations.length} relevant, website-backed organization(s).`);
  return organizations;
}

type ExaResult = { title?: string; url?: string; text?: string; publishedDate?: string };
export async function discoverWithExa(input: {
  query: string; country: string; services: string[]; strategy?: string; maxOrganizations: number;
}, progress?: (message: string) => void): Promise<Organization[]> {
  const key = process.env.EXA_API_KEY?.trim();
  if (!key || process.env.OPPORTUNITY_RADAR_EXA_ENABLED === "false") throw new Error("Exa is not configured. Add EXA_API_KEY to .env.local or disable this source.");
  const serviceTerms = input.services.join(", ") || "document AI, RAG, AI automation, LLM security";
  const strategy = discoveryStrategyPrompt(input.strategy || "");
  const query = input.query + ". Find official websites of agencies, integrators and companies operating in " + input.country
    + " showing recent business signals or probable delivery needs related to " + serviceTerms + ". " + strategy
    + " Results must explicitly prove the organization operates in " + input.country + ".";
  progress?.(`Exa search started for ${input.country}…`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(EXA_SEARCH_URL, {
      method: "POST", signal: controller.signal, cache: "no-store",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        query, type: "auto",
        numResults: Math.max(5, Math.min(30, Number(process.env.OPPORTUNITY_RADAR_EXA_RESULTS_PER_QUERY || 15))),
        contents: { text: { maxCharacters: 5000 }, livecrawl: "fallback" },
      }),
    });
    if (!response.ok) throw new Error(`Exa HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const payload = await response.json() as { results?: ExaResult[] };
    const organizations: Organization[] = [];
    for (const result of payload.results || []) {
      const url = publicHttpUrl(result.url || "");
      if (!url) continue;
      const domain = url.hostname.replace(/^www\./, "");
      const evidenceText = [result.title || "", result.text || ""].join(" ");
      if (blockedDomains.has(domain) || !searchHitIsUsable({ title: result.title || "", url: url.toString(), text: result.text || "" })) continue;
      const market = resolveMarket({ website: url.toString(), evidenceText });
      if (!marketMatchesRequestedCountries({
        countries: [input.country], country: market.country, city: market.city,
        website: url.toString(), evidenceText,
      })) continue;
      const storedCountry = market.country || (requestedMarketsAllowWorldwide([input.country]) ? "Worldwide" : "");
      const name = companyNameFromSearchHit(result.title || "", url.toString());
      const organization = upsertOrganization({
        name, website: url.origin, country: storedCountry, city: market.city,
        sourceType: "exa-search", sourceUrl: result.url || url.toString(),
        description: (result.text || "").slice(0, 700),
      }).organization;
      if (result.text?.trim()) saveSourceDocument({
        organizationId: organization.id, url: result.url || url.toString(), title: result.title || name, sourceType: "exa-search",
        publishedAt: result.publishedDate || null, contentHash: createHash("sha256").update(result.text).digest("hex"), text: result.text.slice(0, 9000),
      });
      if (!organizations.some((item) => item.id === organization.id)) organizations.push(organization);
      if (organizations.length >= input.maxOrganizations) break;
    }
    progress?.(`Exa returned ${organizations.length} unique company domain(s) with public evidence.`);
    return organizations;
  } finally { clearTimeout(timer); }
}

export function organizationFromManualUrl(value: string): Organization {
  const url = publicHttpUrl(value);
  if (!url) throw new Error("Enter a public HTTP or HTTPS company URL.");
  const domain = url.hostname.replace(/^www\./, "");
  return upsertOrganization({
    name: cleanCompanyName("", domain), website: url.origin, country: "", sourceType: "manual-url", sourceUrl: url.toString(),
  }).organization;
}

async function firecrawlPage(url: string): Promise<{ text: string; finalUrl: string; title: string }> {
  if (process.env.OPPORTUNITY_RADAR_FIRECRAWL_ENABLED === "false") throw new Error("Firecrawl fallback is disabled.");
  const safe = publicHttpUrl(url);
  if (!safe) throw new Error(`Blocked non-public URL: ${url}`);
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) throw new Error("Firecrawl requires FIRECRAWL_API_KEY on this network.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.OPPORTUNITY_RADAR_FIRECRAWL_TIMEOUT_MS || 25_000));
  try {
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST", signal: controller.signal, cache: "no-store",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ url: safe.toString(), formats: ["markdown"], onlyMainContent: true }),
    });
    if (!response.ok) throw new Error(`Firecrawl HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`);
    const payload = await response.json() as { success?: boolean; data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string } } };
    const markdown = payload.data?.markdown?.replace(/\s+/g, " ").trim() || "";
    if (!payload.success || markdown.length < 180) throw new Error("Firecrawl returned no substantive page content.");
    return {
      text: markdown.slice(0, 14_000), finalUrl: payload.data?.metadata?.sourceURL || safe.toString(),
      title: payload.data?.metadata?.title || "",
    };
  } finally { clearTimeout(timer); }
}
async function robotsAllows(origin: string, targetPath: string): Promise<boolean> {
  try {
    const response = await fetchText(`${origin}/robots.txt`, 7000);
    let applies = false;
    for (const raw of response.text.split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, "").trim();
      const agent = line.match(/^user-agent:\s*(.+)$/i)?.[1]?.trim();
      if (agent) { applies = agent === "*"; continue; }
      if (!applies) continue;
      const disallow = line.match(/^disallow:\s*(.*)$/i)?.[1]?.trim();
      if (disallow && disallow !== "/" && targetPath.startsWith(disallow)) return false;
      if (disallow === "/") return false;
    }
  } catch { /* Missing robots.txt is treated as no explicit crawl restriction. */ }
  return true;
}

const usefulPath = /(service|solution|expert|case|client|reference|project|news|actualit|blog|career|job|recruit|team|about|company|contact|partner|industrie|sector|secteur|offre)/i;

export async function crawlOrganization(organization: Organization, progress?: (message: string) => void): Promise<number> {
  const maxPages = Math.max(1, Math.min(10, Number(process.env.OPPORTUNITY_RADAR_MAX_PAGES_PER_COMPANY || 6)));
  const initial = new URL(organization.website).toString();
  const origin = new URL(initial).origin;
  const queue = [initial]; const seen = new Set<string>(); let saved = 0;
  while (queue.length && saved < maxPages) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const parsed = new URL(url);
    if (!await robotsAllows(origin, parsed.pathname)) continue;
    progress?.(`Reading ${organization.name}: ${parsed.pathname || "/"}…`);
    try {
      let result: { text: string; finalUrl: string; contentType: string } | null = null;
      let visibleText = "";
      try {
        result = await fetchText(url);
        if (/html|text\/plain/i.test(result.contentType)) visibleText = stripHtml(result.text).slice(0, 14_000);
      } catch { /* The bounded extraction fallback handles blocked or dynamic pages. */ }
      if (!result || visibleText.length < 180) {
        progress?.(`Direct reading was blocked or shallow; using Firecrawl once for ${parsed.pathname || "/"}…`);
        const fallback = await firecrawlPage(url);
        const final = publicHttpUrl(fallback.finalUrl) || parsed;
        saveSourceDocument({
          organizationId: organization.id, url: final.toString(), title: fallback.title || organization.name,
          sourceType: "firecrawl-fallback", contentHash: createHash("sha256").update(fallback.text).digest("hex"), text: fallback.text,
        });
        saved++;
        continue;
      }
      const final = new URL(result.finalUrl);
      if (final.origin !== origin) continue;
      saveSourceDocument({
        organizationId: organization.id, url: final.toString(), title: titleFromHtml(result.text) || organization.name,
        sourceType: "official-company-site", contentHash: createHash("sha256").update(visibleText).digest("hex"), text: visibleText,
      });
      saveOrganizationContacts(organization.id, extractOfficialContacts(result.text, final.toString()));
      if (final.pathname === "/" || final.toString() === origin || final.toString() === `${origin}/`) {
        const canonicalName = canonicalNameFromHtml(result.text, organization.domain);
        if (canonicalName) updateOrganizationIdentity(organization.id, canonicalName);
      }
      saved++;
      for (const link of linksFromHtml(result.text, final).filter((candidate) => usefulPath.test(new URL(candidate).pathname)).slice(0, 30)) {
        if (!seen.has(link) && !queue.includes(link)) queue.push(link);
      }
    } catch (error) {
      if (url === initial && saved === 0) throw new Error(`Could not read ${organization.website}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!saved) throw new Error("No substantive public page could be collected from the official company website.");
  return saved;
}
