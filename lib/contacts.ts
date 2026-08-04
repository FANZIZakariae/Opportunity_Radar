import type { ContactKind, LeadReadiness, NeedKind } from "@/lib/types";

export type ExtractedContact = {
  kind: ContactKind;
  value: string;
  label: string;
  sourceUrl: string;
};

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phonePattern = /(?:\+\d{1,3}[\s().-]*)?(?:\d[\s().-]*){7,14}\d/g;
const contactPathPattern = /(?:^|\/)(?:contact|contact-us|contactez-nous|nous-contacter|kontakt)(?:\/|$)/i;

function decode(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#64;", "@")
    .replaceAll("&#x40;", "@")
    .replaceAll("&#43;", "+")
    .replaceAll("&plus;", "+")
    .trim();
}

export function isPublishedEmail(value: string): boolean {
  const email = value.toLowerCase();
  return !/(example\.(com|org)|@(company|personal)\.com$|xxx@|yourname@|name@|email@|noreply@|no-reply@)/.test(email)
    && !/\.(png|jpg|jpeg|gif|svg|webp)$/.test(email);
}

export function normalizePublishedPhone(value: string): string {
  const trimmed = decode(value).replace(/\s+/g, " ").trim();
  const digits = trimmed.replace(/\D/g, "");
  const international = trimmed.startsWith("+");
  const parenthesizedCountry = !international && /\(\d{1,3}\)/.test(trimmed);
  if (international && (digits.length < 10 || digits.length > 13)) return "";
  if (!international && !parenthesizedCountry && (digits.length < 9 || digits.length > 10 || !digits.startsWith("0"))) return "";
  if (parenthesizedCountry && (digits.length < 10 || digits.length > 13)) return "";
  if (/\b(?:19|20)\d{2}\b/.test(trimmed) || /\d{4}\s*-\s*\d{4,}/.test(trimmed)) return "";
  if (/^(0123456789|0102030405|1234567890)/.test(digits)) return "";
  if (!international && !/[\s().-]/.test(trimmed)) return "";
  const groups = trimmed.split(/\D+/).filter(Boolean);
  if (!international && !parenthesizedCountry && (groups[0]?.length !== 2 || groups.slice(1).some((group) => group.length < 2 || group.length > 3))) return "";
  return trimmed;
}

function emailLabel(value: string): string {
  const local = value.split("@")[0].toLowerCase();
  if (/(sales|commercial|business|partnership|partner)/.test(local)) return "Commercial contact";
  if (/(direction|director|founder|ceo)/.test(local)) return "Management contact";
  if (/(career|recruit|jobs|talent|rh|hr)/.test(local)) return "Recruitment contact";
  if (/(support|help|hotline)/.test(local)) return "Support contact";
  return "Company email";
}

export function extractOfficialContacts(content: string, sourceUrl: string): ExtractedContact[] {
  const contacts = new Map<string, ExtractedContact>();
  const visibleContent = content
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ");
  const add = (contact: ExtractedContact) => {
    const comparable = contact.kind === "phone" ? contact.value.replace(/\D/g, "") : contact.value.toLowerCase();
    const key = `${contact.kind}:${comparable}`;
    if (!contacts.has(key)) contacts.set(key, contact);
  };

  for (const match of content.matchAll(/href\s*=\s*["']mailto:([^"'?]+)(?:\?[^"']*)?["']/gi)) {
    const email = decode(match[1]).toLowerCase();
    if (isPublishedEmail(email)) add({ kind: "email", value: email, label: emailLabel(email), sourceUrl });
  }
  for (const email of visibleContent.match(emailPattern) || []) {
    const normalized = decode(email).toLowerCase();
    if (isPublishedEmail(normalized)) add({ kind: "email", value: normalized, label: emailLabel(normalized), sourceUrl });
  }
  for (const match of content.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) {
    const phone = normalizePublishedPhone(match[1]);
    if (phone) add({ kind: "phone", value: phone, label: "Company telephone", sourceUrl });
  }
  for (const candidate of visibleContent.match(phonePattern) || []) {
    const phone = normalizePublishedPhone(candidate);
    if (phone) add({ kind: "phone", value: phone, label: "Company telephone", sourceUrl });
  }
  try {
    const url = new URL(sourceUrl);
    if (contactPathPattern.test(url.pathname)) {
      add({ kind: "contact_form", value: url.toString(), label: "Official contact page", sourceUrl });
    }
  } catch { /* invalid source URLs cannot become contact routes */ }
  return [...contacts.values()];
}

export function contactabilityScore(input: {
  contacts: Array<{ kind: ContactKind }>;
  hasNamedPerson: boolean;
  hasProfessionalProfile: boolean;
}): number {
  const kinds = new Set(input.contacts.map((contact) => contact.kind));
  let score = kinds.has("email") ? 70 : kinds.has("phone") ? 58 : kinds.has("contact_form") ? 42 : 0;
  if (input.hasNamedPerson) score += 20;
  if (input.hasProfessionalProfile) score += 10;
  return Math.min(100, score);
}

export function buyerIntentScore(input: { needKind: NeedKind; score: number; datedEvidence: number; text: string }): number {
  let intent = input.needKind === "explicit" ? 70 : input.needKind === "inferred" ? 30 : 15;
  intent += Math.min(12, input.datedEvidence * 4);
  if (/(hiring|recruit|recrut|appel d'offres|tender|rfp|partner|partenariat|seeking|looking for)/i.test(input.text)) intent += 14;
  intent += Math.max(0, Math.min(10, Math.round((input.score - 50) / 3)));
  return Math.max(0, Math.min(100, intent));
}

export function assessLeadReadiness(input: { score: number; confidence: number; contactability: number; buyerIntent: number }): LeadReadiness {
  if (input.score < 50 || input.confidence < 55 || input.buyerIntent < 40) return "research_only";
  if (input.contactability >= 40) return "ready_to_contact";
  return "needs_enrichment";
}