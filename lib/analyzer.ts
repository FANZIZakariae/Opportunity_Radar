import "server-only";
import { z } from "zod";
import { runLlmJson, type LlmMetadata } from "@/lib/llm";
import { listSourceDocuments, type IntelligenceAnalysis } from "@/lib/db";
import { SERVICE_CATALOG } from "@/lib/service-catalog";
import type { Organization } from "@/lib/types";
import { calculateConfidence, calculateOpportunityScore } from "@/lib/scoring";
import { assessHiringFit } from "@/lib/hiring-fit";

const signalSchema = z.object({
  claimKind: z.enum(["fact", "inference"]),
  signalType: z.string().min(2).max(80),
  claim: z.string().min(12).max(500),
  excerpt: z.string().min(5).max(700),
  sourceUrl: z.string().url(),
  eventDate: z.string().nullable(),
  sourceQuality: z.number().min(0).max(100),
});
const personSchema = z.object({
  name: z.string().max(120),
  role: z.string().min(2).max(160),
  professionalUrl: z.string(),
  email: z.string(),
  contactUrl: z.string(),
  verificationLevel: z.enum(["verified_person", "likely_person", "target_role", "company_contact"]),
  sourceUrl: z.string(),
});
const outreachSchema = z.object({
  subject: z.string().min(5).max(160),
  hook: z.string().min(15).max(900),
  shortMessage: z.string().min(40).max(1800),
  longMessage: z.string().min(80).max(3500),
  followUp: z.string().min(20).max(1600),
});
const opportunitySchema = z.object({
  serviceId: z.string(),
  title: z.string().min(5).max(160),
  needStatement: z.string().min(15).max(600),
  needKind: z.enum(["explicit", "inferred", "investigate"]),
  engagementMode: z.enum(["freelance", "dual"]),
  hiringRole: z.string().max(180),
  whyNow: z.string().min(15).max(900),
  buyerRole: z.string().min(2).max(160),
  personName: z.string().max(120),
  subject: z.string().min(5).max(160),
  hook: z.string().min(15).max(900),
  shortMessage: z.string().min(40).max(1800),
  longMessage: z.string().min(80).max(3500),
  followUp: z.string().min(20).max(1600),
  freelanceOutreach: outreachSchema,
  openingQuestion: z.string().min(10).max(500),
  evidenceClaims: z.array(z.string()).min(1).max(5),
  opportunityFactors: z.object({
    needStrength: z.number(), serviceFit: z.number(), urgency: z.number(), reachability: z.number(),
    commercialCapacity: z.number(), strategicFit: z.number(), penalties: z.number(),
  }),
  confidenceFactors: z.object({
    sourceAuthority: z.number(), corroboration: z.number(), freshness: z.number(), completeness: z.number(),
  }),
});
const analysisSchema = z.object({
  organization: z.object({
    canonicalName: z.string().max(100), identityConfidence: z.number().min(0).max(100),
    description: z.string().max(1200), services: z.array(z.string()).max(15),
    verticals: z.array(z.string()).max(15), sizeBand: z.string().max(80),
  }),
  signals: z.array(signalSchema).max(15),
  people: z.array(personSchema).max(8),
  opportunities: z.array(opportunitySchema).max(4),
  refusalReason: z.string().max(1000),
});

function compactDocuments(organizationId: string): { text: string; urls: Set<string> } {
  const documents = listSourceDocuments(organizationId);
  let remaining = 32_000;
  const sections: string[] = []; const urls = new Set<string>();
  for (const document of documents) {
    if (remaining < 500) break;
    const excerpt = document.text.slice(0, Math.min(7000, remaining));
    sections.push(`SOURCE URL: ${document.url}\nTITLE: ${document.title}\nCONTENT:\n${excerpt}`);
    urls.add(document.url); remaining -= excerpt.length;
  }
  return { text: sections.join("\n\n--- NEXT SOURCE ---\n\n"), urls };
}

export async function analyzeOrganization(
  organization: Organization,
  selectedServices: string[],
  options: { signal?: AbortSignal; onActivity?: (message: string) => void } = {},
): Promise<{ analysis: IntelligenceAnalysis; metadata: LlmMetadata; refusalReason: string }> {
  const documents = compactDocuments(organization.id);
  if (!documents.text) throw new Error("No collected source evidence is available for analysis.");
  const services = SERVICE_CATALOG.filter((service) => !selectedServices.length || selectedServices.includes(service.id));
  const prompt = `You are the evidence analyst for a local B2B Client Opportunity Radar owned by Zakariae Fanzi.

Analyze ONLY the supplied public source documents for ${organization.name} (${organization.website}).
Do not use prior knowledge and do not browse. Never invent a company fact, need, person, job title, email, budget, customer, date or URL.

OBJECTIVE
Detect explicit commercial needs or evidence-backed likely needs that Zakariae could solve. Identify the most appropriate buyer. Produce a concise personalized outreach proposition.

STRICT EVIDENCE RULES
- A fact must be directly supported by one supplied source. Its excerpt must be a short exact supporting fragment.
- An inference must cite the public facts that make it plausible and must be worded as a hypothesis.
- Absence from a website is not proof that a capability or employee does not exist.
- sourceUrl must exactly equal one SOURCE URL supplied below.
- A named person may be verificationLevel "verified_person" only when an official company page explicitly shows their name and current role.
- Never construct an email from a guessed pattern. Include an email only if it appears in supplied official content.
- When no named person is verified, return an empty name and the best target role with "target_role", or an official generic route with "company_contact".
- LinkedIn is not an automated evidence source.
- An opportunity must cite 1–5 signal claim strings copied exactly from your signals array.
- A company merely offering a compatible technology is not proof of buying intent. Treat capability-only matches as low intent and low urgency.
- Hiring, public tenders, partner requests, delivery-capacity constraints, funded launches or explicitly announced projects are stronger intent signals.
- When an official supplied source explicitly shows that the organization is currently recruiting for a role relevant to Zakariae, create a signal with signalType "hiring" and quote the hiring evidence.
- Set engagementMode to "dual" ONLY when one cited hiring signal proves a current opening that directly matches Zakariae's own professional domain AND career level: AI engineering, machine learning, data science/engineering, LLM/RAG/agents, computer vision/NLP, MLOps, document intelligence or AI workflow automation.
- Generic Java/.NET/software/web/mobile/QA roles, sales roles, management roles, and unrelated vacancies are NEVER dual opportunities, even when the employer also works with AI. Senior, lead, principal, staff, manager, architect, expert, confirmed/confirmé, or roles requiring 3+ years are NEVER dual opportunities for Zakariae.
- Set hiringRole to the exact advertised role title, or a faithful concise title when the page states the function but not a formal title. Otherwise use "freelance" and an empty hiringRole.
- A careers page without a visible aligned opening is not enough for dual mode. A past job, stale vacancy, or third-party speculation is not enough either.
- For a dual opportunity, shortMessage and longMessage must clearly and naturally present two genuine collaboration paths: (1) Zakariae is interested in the advertised employment role and wants to be considered; (2) he can also contribute immediately through a bounded freelance pilot or short contract around the detected need if that better fits the company timeline. Do not make the job interest sound like a fallback, and do not make the freelance offer sound like an ultimatum.
- The dual message must name the hiring role and connect Zakariae's relevant proof to both paths. The subject should be suitable for a hiring manager while still opening the freelance option.
- For freelance mode, keep the outreach focused only on the evidence-backed client need; never mention employment.
- Always populate freelanceOutreach with a polished job-agnostic freelance proposition. It must never mention applying, employment, joining the team, a vacancy or a job title. This is the safe message used whenever the hiring role is not demonstrably aligned.
- canonicalName must be the organization represented by the official website, not a directory/provider label or a search-result title.
- If evidence is insufficient, return no opportunity and explain refusalReason.
- Write hooks in the language used by the relevant company page; default to French for France/Morocco and English otherwise.

ZAKARIAE'S SELLABLE SERVICES
${JSON.stringify(services)}

SCORING LIMITS
opportunityFactors: needStrength /25, serviceFit /25, urgency /15, reachability /15, commercialCapacity /10, strategicFit /10, penalties /60.
confidenceFactors: sourceAuthority /35, corroboration /25, freshness /20, completeness /20.
Do not inflate factors. Generic marketing deserves low needStrength. A recent explicit request deserves high needStrength.

Return:
{
  "organization":{"canonicalName":"","identityConfidence":0,"description":"","services":[],"verticals":[],"sizeBand":""},
  "signals":[{"claimKind":"fact","signalType":"","claim":"","excerpt":"","sourceUrl":"","eventDate":null,"sourceQuality":0}],
  "people":[{"name":"","role":"","professionalUrl":"","email":"","contactUrl":"","verificationLevel":"target_role","sourceUrl":""}],
  "opportunities":[{
    "serviceId":"one exact service id","title":"","needStatement":"","needKind":"inferred","engagementMode":"freelance","hiringRole":"","whyNow":"",
    "buyerRole":"","personName":"","subject":"","hook":"","shortMessage":"","longMessage":"","followUp":"",
    "freelanceOutreach":{"subject":"","hook":"","shortMessage":"","longMessage":"","followUp":""},"openingQuestion":"",
    "evidenceClaims":["exact claim from signals"],
    "opportunityFactors":{"needStrength":0,"serviceFit":0,"urgency":0,"reachability":0,"commercialCapacity":0,"strategicFit":0,"penalties":0},
    "confidenceFactors":{"sourceAuthority":0,"corroboration":0,"freshness":0,"completeness":0}
  }],
  "refusalReason":""
}

PUBLIC SOURCE DOCUMENTS
${documents.text}`;
  const run = await runLlmJson<unknown>(prompt, {
    jsonSchema: z.toJSONSchema(analysisSchema),
    schemaName: "opportunity_analysis",
    reasoningEffort: "medium",
    signal: options.signal,
    onActivity: (activity) => options.onActivity?.(`${activity.provider} · ${activity.model}: ${activity.message}`),
  });
  const parsed = analysisSchema.parse(run.data);
  const allowedServiceIds = new Set(services.map((service) => service.id));
  const sourceUrls = documents.urls;
  const signals = parsed.signals.filter((signal) => sourceUrls.has(signal.sourceUrl));
  const signalClaims = new Set(signals.map((signal) => signal.claim));
  const signalByClaim = new Map(signals.map((signal) => [signal.claim, signal]));
  const people = parsed.people.filter((person) => {
    if (person.sourceUrl && !sourceUrls.has(person.sourceUrl)) return false;
    if (person.verificationLevel === "verified_person" && (!person.name || !person.sourceUrl)) return false;
    if (person.email && !documents.text.toLowerCase().includes(person.email.toLowerCase())) return false;
    return true;
  });
  const analysis: IntelligenceAnalysis = {
    organization: {
      ...parsed.organization,
      canonicalName: parsed.organization.canonicalName.trim().length >= 2
        ? parsed.organization.canonicalName.trim()
        : organization.name,
      identityConfidence: parsed.organization.canonicalName.trim().length >= 2
        ? parsed.organization.identityConfidence
        : 0,
    },
    signals,
    people,
    opportunities: parsed.opportunities
      .filter((opportunity) => allowedServiceIds.has(opportunity.serviceId))
      .map((opportunity) => {
        const citedSignals = opportunity.evidenceClaims.map((claim) => signalByClaim.get(claim)).filter((signal) => Boolean(signal));
        const hiringSignals = citedSignals.filter((signal) => signal
          && /hiring|recruit|recrut|vacanc|job opening|open role|offre d.emploi|poste ouvert/i.test(`${signal.signalType} ${signal.claim} ${signal.excerpt}`));
        const hiringFit = assessHiringFit({
          role: opportunity.hiringRole,
          evidenceTexts: hiringSignals.flatMap((signal) => signal ? [signal.claim, signal.excerpt] : []),
        });
        const isDual = opportunity.engagementMode === "dual" && hiringSignals.length > 0 && hiringFit.aligned;
        const outreach = isDual ? opportunity : opportunity.freelanceOutreach;
        return {
          serviceId: opportunity.serviceId, title: opportunity.title, needStatement: opportunity.needStatement,
          needKind: opportunity.needKind, engagementMode: isDual ? "dual" as const : "freelance" as const,
          hiringRole: isDual ? opportunity.hiringRole.trim() : "", whyNow: opportunity.whyNow,
          score: calculateOpportunityScore(opportunity.opportunityFactors),
          confidence: calculateConfidence(opportunity.confidenceFactors),
          buyerRole: opportunity.buyerRole, personName: opportunity.personName, subject: outreach.subject,
          hook: outreach.hook, shortMessage: outreach.shortMessage, longMessage: outreach.longMessage,
          followUp: outreach.followUp, openingQuestion: opportunity.openingQuestion,
          evidenceClaims: opportunity.evidenceClaims.filter((claim) => signalClaims.has(claim)),
        };
      })
      .filter((opportunity) => opportunity.evidenceClaims.length > 0),
  };
  return { analysis, metadata: run.metadata, refusalReason: parsed.refusalReason };
}

