import { describe, expect, it } from "vitest";
import { isRelevantOpportunityText, localizedText, parseGreenhouseJobUrl, parseLeverJobUrl } from "@/lib/discovery-connectors";

describe("discovery connector parsing", () => {
  it("extracts exact Greenhouse identifiers", () => {
    expect(parseGreenhouseJobUrl("https://job-boards.greenhouse.io/mistral/jobs/1234567?gh_src=test")).toEqual({ token: "mistral", jobId: "1234567" });
    expect(parseGreenhouseJobUrl("https://example.com/jobs/1234567")).toBeNull();
  });

  it("extracts exact Lever identifiers", () => {
    expect(parseLeverJobUrl("https://jobs.lever.co/dataiku/abcdef12-1234-5678-abcd-abcdef123456")).toEqual({ site: "dataiku", postingId: "abcdef12-1234-5678-abcd-abcdef123456" });
    expect(parseLeverJobUrl("https://jobs.lever.co/dataiku")).toBeNull();
  });

  it("prefers English then French TED fields", () => {
    expect(localizedText({ deu: "Deutsch", fra: "Français", eng: "English" })).toBe("English");
    expect(localizedText({ fra: ["Titre", "Second"] })).toBe("Titre · Second");
  });

  it("keeps AI opportunities and rejects unrelated procurement", () => {
    expect(isRelevantOpportunityText("Assistant RAG avec OCR et automatisation documentaire")).toBe(true);
    expect(isRelevantOpportunityText("Supply of office chairs and cleaning products")).toBe(false);
  });
});
