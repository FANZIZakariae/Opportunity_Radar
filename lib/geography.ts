import type { Organization } from "@/lib/types";

export type ResolvedMarket = {
  country: string;
  city: string;
  verified: boolean;
};

const normalize = (value: string): string => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const marketDefinitions: Array<{
  country: string;
  countryPattern: RegExp;
  cities: Array<{ name: string; pattern: RegExp }>;
  domainSuffixes: string[];
}> = [
  {
    country: "Morocco",
    countryPattern: /\b(morocco|maroc|royaume du maroc)\b/i,
    domainSuffixes: [".ma"],
    cities: [
      { name: "Casablanca", pattern: /\b(casablanca|casa blanca|casablanca settat)\b/i },
      { name: "Rabat", pattern: /\b(rabat|rabat sale kenitra)\b/i },
      { name: "Tangier", pattern: /\b(tanger|tangier|tanger tetouan al hoceima)\b/i },
      { name: "Marrakesh", pattern: /\b(marrakech|marrakesh|marrakech safi)\b/i },
      { name: "Fez", pattern: /\b(fes|fez|fes meknes)\b/i },
      { name: "Agadir", pattern: /\b(agadir|souss massa)\b/i },
      { name: "Meknes", pattern: /\bmeknes\b/i },
      { name: "Oujda", pattern: /\boujda\b/i },
      { name: "Kenitra", pattern: /\bkenitra\b/i },
      { name: "Tetouan", pattern: /\btetouan\b/i },
      { name: "El Jadida", pattern: /\bel jadida\b/i },
      { name: "Laayoune", pattern: /\b(laayoune|el aaiun)\b/i },
      { name: "Bouskoura", pattern: /\bbouskoura\b/i },
      { name: "Nouaceur", pattern: /\bnouaceur\b/i },
    ],
  },
  {
    country: "France",
    countryPattern: /\b(france|ile de france)\b/i,
    domainSuffixes: [".fr"],
    cities: [
      { name: "Paris", pattern: /\b(paris|puteaux|courbevoie|neuilly sur seine|boulogne billancourt|saint denis)\b/i },
      { name: "Lyon", pattern: /\blyon\b/i },
      { name: "Toulouse", pattern: /\btoulouse\b/i },
      { name: "Bordeaux", pattern: /\bbordeaux\b/i },
      { name: "Marseille", pattern: /\bmarseille\b/i },
      { name: "Lille", pattern: /\blille\b/i },
      { name: "Nantes", pattern: /\bnantes\b/i },
      { name: "Grenoble", pattern: /\bgrenoble\b/i },
      { name: "Rennes", pattern: /\brennes\b/i },
      { name: "Montpellier", pattern: /\bmontpellier\b/i },
      { name: "Strasbourg", pattern: /\bstrasbourg\b/i },
    ],
  },
];

const knownLocationCountries: Array<{ country: string; pattern: RegExp }> = [
  { country: "Algeria", pattern: /\b(algeria|algerie|alger|oran)\b/i },
  { country: "United States", pattern: /\b(united states|usa|new york|california|san francisco|seattle|boston|texas|arlington virginia|chicago|des moines|iowa|mountain view|palo alto|san mateo|florida|washington dc)\b/i },
  { country: "United Kingdom", pattern: /\b(united kingdom|uk|london|england|scotland|wales|northern ireland|belfast)\b/i },
  { country: "Germany", pattern: /\b(germany|deutschland|berlin|munich|muenchen|hamburg|frankfurt)\b/i },
  { country: "Netherlands", pattern: /\b(netherlands|the netherlands|amsterdam|rotterdam|eindhoven)\b/i },
  { country: "Spain", pattern: /\b(spain|espana|madrid|barcelona|valencia)\b/i },
  { country: "Belgium", pattern: /\b(belgium|belgique|brussels|bruxelles|antwerp)\b/i },
  { country: "Canada", pattern: /\b(canada|toronto|montreal|vancouver|quebec)\b/i },
  { country: "India", pattern: /\b(india|bangalore|bengaluru|mumbai|delhi|hyderabad|pune)\b/i },
  { country: "Indonesia", pattern: /\b(indonesia|jakarta)\b/i },
  { country: "New Zealand", pattern: /\b(new zealand|auckland|wellington)\b/i },
  { country: "Sri Lanka", pattern: /\b(sri lanka|colombo)\b/i },
  { country: "Philippines", pattern: /\b(philippines|manila)\b/i },
  { country: "China", pattern: /\b(china|shenzhen|beijing|shanghai)\b/i },
  { country: "Poland", pattern: /\b(poland|wroclaw|warsaw|krakow)\b/i },
  { country: "Romania", pattern: /\b(romania|iasi|bucharest|cluj napoca)\b/i },
  { country: "Ireland", pattern: /\b(ireland|dublin|cork|galway)\b/i },
  { country: "Norway", pattern: /\b(norway|oslo|tromso)\b/i },
  { country: "Finland", pattern: /\b(finland|helsinki|espoo|tampere)\b/i },
  { country: "Denmark", pattern: /\b(denmark|copenhagen|aarhus)\b/i },
  { country: "Sweden", pattern: /\b(sweden|stockholm|gothenburg|malmo)\b/i },
  { country: "Italy", pattern: /\b(italy|italia|rome|milan|torino|turin)\b/i },
  { country: "Luxembourg", pattern: /\bluxembourg\b/i },
  { country: "Greece", pattern: /\b(greece|athens|thessaloniki)\b/i },
  { country: "North Macedonia", pattern: /\b(north macedonia|skopje)\b/i },
  { country: "Portugal", pattern: /\b(portugal|lisbon|porto)\b/i },
  { country: "Switzerland", pattern: /\b(switzerland|zurich|geneva|lausanne)\b/i },
  { country: "Austria", pattern: /\b(austria|vienna)\b/i },
  { country: "United Arab Emirates", pattern: /\b(united arab emirates|uae|dubai|abu dhabi)\b/i },
  { country: "Saudi Arabia", pattern: /\b(saudi arabia|riyadh|jeddah)\b/i },
  { country: "Tunisia", pattern: /\b(tunisia|tunis)\b/i },
  { country: "South Africa", pattern: /\b(south africa|johannesburg|cape town)\b/i },
];

const ISO_ALPHA_2 = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const ALPHA_3_TO_2: Record<string, string> = {
  ARE: "AE", AUT: "AT", BEL: "BE", CAN: "CA", CHE: "CH", CHN: "CN", DEU: "DE",
  DNK: "DK", DZA: "DZ", ESP: "ES", FIN: "FI", FRA: "FR", GBR: "GB", GRC: "GR",
  IND: "IN", IRL: "IE", ITA: "IT", LKA: "LK", LUX: "LU", MAR: "MA", MKD: "MK",
  NLD: "NL", NOR: "NO", NZL: "NZ", PHL: "PH", POL: "PL", PRT: "PT", ROU: "RO",
  SAU: "SA", SWE: "SE", TUN: "TN", USA: "US", ZAF: "ZA",
};
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const countryNames = new Map<string, string>();
for (const code of ISO_ALPHA_2) {
  const name = regionNames.of(code);
  if (name && name !== code) countryNames.set(normalize(name), name);
}
for (const [alias, country] of [
  ["uk", "United Kingdom"], ["usa", "United States"], ["u s", "United States"],
  ["uae", "United Arab Emirates"], ["south korea", "South Korea"], ["czech republic", "Czechia"],
  ["turkey", "Türkiye"], ["russia", "Russia"], ["vietnam", "Vietnam"],
] as Array<[string, string]>) countryNames.set(normalize(alias), country);

function hostname(value: string): string {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

export function canonicalCountryName(value: string): string {
  const raw = value.trim();
  if (!raw) return "Worldwide";
  const normalized = normalize(raw);
  for (const definition of marketDefinitions) {
    if (definition.countryPattern.test(normalized) || definition.cities.some((city) => city.pattern.test(normalized))) return definition.country;
  }
  for (const location of knownLocationCountries) if (location.pattern.test(normalized)) return location.country;
  const compactCode = raw.replace(/[^A-Za-z]/g, "").toUpperCase();
  if (compactCode.length === 3 && ALPHA_3_TO_2[compactCode]) return regionNames.of(ALPHA_3_TO_2[compactCode]) || "Worldwide";
  if (raw === raw.toUpperCase() && compactCode.length === 2 && ISO_ALPHA_2.includes(compactCode)) return regionNames.of(compactCode) || "Worldwide";
  for (const [countryKey, country] of [...countryNames.entries()].sort((a, b) => b[0].length - a[0].length)) {
    if (normalized === countryKey || normalized.endsWith(" " + countryKey)) return country;
  }
  return "Worldwide";
}

export function resolveMarket(input: {
  location?: string;
  country?: string;
  city?: string;
  website?: string;
  evidenceText?: string;
}): ResolvedMarket {
  const location = [input.location, input.country, input.city].filter(Boolean).join(" · ");
  const evidence = [location, input.evidenceText].filter(Boolean).join(" · ");
  const normalizedLocation = normalize(location);
  const normalizedEvidence = normalize(evidence);
  const host = hostname(input.website || "");

  for (const definition of marketDefinitions) {
    const city = definition.cities.find((candidate) => candidate.pattern.test(normalizedLocation));
    const countryFound = definition.countryPattern.test(normalizedEvidence);
    const domainFound = definition.domainSuffixes.some((suffix) => host.endsWith(suffix));
    if (city || countryFound || domainFound) {
      return { country: definition.country, city: city?.name || input.city?.trim() || "", verified: true };
    }
  }

  for (const foreign of knownLocationCountries) {
    if (foreign.pattern.test(normalizedLocation)) return { country: foreign.country, city: input.city?.trim() || "", verified: true };
  }

  const canonical = canonicalCountryName(location);
  const explicitCity = input.city?.trim() || "";
  return { country: canonical, city: explicitCity, verified: canonical !== "Worldwide" };
}

export function requestedMarketsAllowWorldwide(countries: string[]): boolean {
  return countries.some((country) => ["worldwide", "manual"].includes(normalize(country)));
}

export function marketMatchesRequestedCountries(input: {
  countries: string[];
  country?: string;
  city?: string;
  website?: string;
  evidenceText?: string;
  sourceType?: string;
}): boolean {
  if (!input.countries.length || requestedMarketsAllowWorldwide(input.countries)) return true;
  if (input.sourceType === "manual-url") return true;
  const resolved = resolveMarket(input);
  if (!resolved.verified) return false;
  const allowed = new Set(input.countries.map(normalize));
  return allowed.has(normalize(resolved.country));
}

export function organizationMatchesRequestedCountries(organization: Organization, countries: string[]): boolean {
  return marketMatchesRequestedCountries({
    countries,
    country: organization.country,
    city: organization.city,
    website: organization.website,
    sourceType: organization.sourceType,
  });
}

export function normalizeOrganizationMarket(input: {
  country?: string;
  city?: string;
  website?: string;
}): { country: string; city: string } {
  const resolved = resolveMarket(input);
  return {
    country: resolved.country || "Worldwide",
    city: resolved.city || input.city?.trim() || "",
  };
}

export const DISCOVERY_STRATEGIES = [
  {
    id: "buying-signals",
    label: "active AI buying and delivery signals",
    prompt: "Prioritize dated tenders, requests for proposals, partner searches, supplier needs, funded AI projects and explicit delivery requirements.",
  },
  {
    id: "hiring-capacity",
    label: "AI hiring and delivery-capacity signals",
    prompt: "Find organizations hiring in the same AI domain, announcing delivery backlogs, new AI teams or projects where specialist freelance support is plausible.",
  },
  {
    id: "integrators-partners",
    label: "integrators and implementation partners",
    prompt: "Find local ERP, cloud, data and digital-transformation integrators seeking AI partners, subcontractors or document-automation capability.",
  },
  {
    id: "growth-projects",
    label: "funded growth and transformation projects",
    prompt: "Find recent funding, expansion, product launches, digitisation programmes and operational transformations that create a concrete AI implementation need.",
  },
] as const;

export function discoveryStrategyPrompt(strategy: string): string {
  return DISCOVERY_STRATEGIES.find((candidate) => candidate.id === strategy)?.prompt || DISCOVERY_STRATEGIES[0].prompt;
}
