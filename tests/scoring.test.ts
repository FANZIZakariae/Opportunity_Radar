import { describe, expect, it } from "vitest";
import { calculateConfidence, calculateOpportunityScore, opportunityBand } from "@/lib/scoring";
import { assessLeadReadiness, buyerIntentScore, contactabilityScore, extractOfficialContacts } from "@/lib/contacts";

describe("evidence-aware opportunity scoring", () => {
  it("keeps a commercially attractive but weakly evidenced lead out of hot", () => {
    const score = calculateOpportunityScore({
      needStrength: 24, serviceFit: 24, urgency: 14, reachability: 13, commercialCapacity: 9, strategicFit: 9, penalties: 0,
    });
    const confidence = calculateConfidence({ sourceAuthority: 8, corroboration: 2, freshness: 5, completeness: 8 });
    expect(score).toBe(93);
    expect(confidence).toBe(23);
    expect(opportunityBand(score, confidence)).toBe("weak");
  });

  it("marks a strong, corroborated and fresh opportunity as hot", () => {
    const score = calculateOpportunityScore({
      needStrength: 23, serviceFit: 24, urgency: 13, reachability: 12, commercialCapacity: 8, strategicFit: 9, penalties: 2,
    });
    const confidence = calculateConfidence({ sourceAuthority: 32, corroboration: 21, freshness: 17, completeness: 18 });
    expect(score).toBe(87);
    expect(confidence).toBe(88);
    expect(opportunityBand(score, confidence)).toBe("hot");
  });

  it("applies explicit penalties without producing a negative score", () => {
    expect(calculateOpportunityScore({
      needStrength: 5, serviceFit: 5, urgency: 1, reachability: 1, commercialCapacity: 1, strategicFit: 1, penalties: 60,
    })).toBe(0);
  });
});

describe("contact enrichment and lead readiness", () => {
  it("extracts official contact routes without inventing details", () => {
    const contacts = extractOfficialContacts(
      `<a href="mailto:sales@example-ai.fr">Email us</a>
       <a href="tel:+33 6 12 34 56 78">Call</a>`,
      "https://example-ai.fr/contact",
    );
    expect(contacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "email", value: "sales@example-ai.fr", label: "Commercial contact" }),
      expect.objectContaining({ kind: "phone", value: "+33 6 12 34 56 78" }),
      expect.objectContaining({ kind: "contact_form", value: "https://example-ai.fr/contact" }),
    ]));
  });

  it("separates evidence confidence, intent and contactability", () => {
    const contactability = contactabilityScore({ contacts: [{ kind: "email" }], hasNamedPerson: true, hasProfessionalProfile: true });
    const buyerIntent = buyerIntentScore({ needKind: "inferred", score: 68, datedEvidence: 1, text: "The company is hiring an agent evaluation engineer." });
    expect(contactability).toBe(100);
    expect(buyerIntent).toBeGreaterThanOrEqual(50);
    expect(assessLeadReadiness({ score: 68, confidence: 80, contactability, buyerIntent })).toBe("ready_to_contact");
    expect(assessLeadReadiness({ score: 45, confidence: 90, contactability, buyerIntent })).toBe("research_only");
  });
});