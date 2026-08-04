const blockedDiscoveryDomains = new Set([
  "linkedin.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "youtube.com",
  "google.com", "bing.com", "wikipedia.org", "github.com", "welcometothejungle.com",
  "medium.com", "substack.com", "clutch.co", "goodfirms.co", "designrush.com",
  "techbehemoths.com", "builtin.com", "glassdoor.com", "indeed.com",
  "researchandmarkets.com", "marketsandmarkets.com",
]);

const strongSignalPattern = /\b(hiring|recruiting|recrutement|recrute|request for proposals?|request for tender|appel d offres?|tender|procurement|seeking (?:a )?partner|looking for (?:a )?partner|subcontract|sous trait|awarded contract|funded project|funding round|raises? \$|levee de fonds|lance un projet|launches? (?:an? )?(?:ai|automation|digital)|digital transformation programme)\b/i;
const editorialTitlePattern = /^(?:top|best|\d+\s+best|what is|how (?:to|does)|guide to|ultimate guide|market (?:size|report)|.+ market 20\d{2}|intelligent document automation software|document ai market|compare|comparison)\b/i;
const editorialPathPattern = /\/(?:blog|blogs|article|articles|insight|insights|resource|resources|report|reports|guide|guides|news)\/?/i;

function hostname(value: string): string {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

export function discoveryDomainIsBlocked(value: string): boolean {
  const host = hostname(value) || value.toLowerCase().replace(/^www\./, "");
  return [...blockedDiscoveryDomains].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function searchHitHasConcreteSignal(input: { title: string; text: string }): boolean {
  return strongSignalPattern.test(`${input.title} ${input.text}`);
}

export function searchHitIsUsable(input: { title: string; url: string; text: string }): boolean {
  if (discoveryDomainIsBlocked(input.url)) return false;
  let pathname = "";
  try { pathname = new URL(input.url).pathname; } catch { return false; }
  const editorial = editorialTitlePattern.test(input.title.trim()) || editorialPathPattern.test(pathname);
  return !editorial || searchHitHasConcreteSignal(input);
}

export function companyNameFromSearchHit(title: string, url: string): string {
  const host = hostname(url);
  const labels = host.split(".").filter(Boolean);
  const registrableIndex = labels.length > 2 && ["co", "com", "org", "net"].includes(labels.at(-2) || "") ? -3 : -2;
  const domainToken = labels.at(registrableIndex) || labels[0] || "Organization";
  const brand = domainToken.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const titleParts = title.split(/\s+[|·–—]\s+|\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const normalizedDomain = domainToken.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const matchingTitle = titleParts.find((part) => {
    const normalizedPart = part.replace(/[^a-z0-9]/gi, "").toLowerCase();
    return part.length <= 80 && normalizedPart.length >= 2
      && (normalizedPart.includes(normalizedDomain) || normalizedDomain.includes(normalizedPart));
  });
  return matchingTitle || brand;
}
