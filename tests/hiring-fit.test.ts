import { describe, expect, it } from "vitest";
import { assessHiringFit } from "@/lib/hiring-fit";

describe("assessHiringFit", () => {
  it("accepts a directly aligned AI engineering opening", () => {
    expect(assessHiringFit({ role: "AI / Agent Engineer" }).aligned).toBe(true);
  });

  it("rejects an unrelated senior Java and .NET vacancy", () => {
    const result = assessHiringFit({ role: "Développeur Java et/ou .Net (séniors) H/F" });
    expect(result.aligned).toBe(false);
    expect(result.reason).toMatch(/career level|outside/i);
  });

  it("rejects senior AI roles even though the domain matches", () => {
    expect(assessHiringFit({ role: "Senior Machine Learning Engineer" }).aligned).toBe(false);
  });

  it("rejects a role whose evidence imposes a three-year floor", () => {
    expect(assessHiringFit({ role: "Data Scientist", evidenceTexts: ["Minimum 3 years of professional experience"] }).aligned).toBe(false);
  });

  it("rejects generic software hiring at an AI company", () => {
    expect(assessHiringFit({ role: "Full-stack Software Developer" }).aligned).toBe(false);
  });
});