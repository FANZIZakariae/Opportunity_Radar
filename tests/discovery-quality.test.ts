import { describe, expect, it } from "vitest";
import { companyNameFromSearchHit, searchHitIsUsable } from "@/lib/discovery-quality";

describe("search candidate quality", () => {
  it("uses the organization domain instead of an article headline as its name", () => {
    expect(companyNameFromSearchHit("Top 10 AI Document Processing Companies", "https://azati.com/blog/top-tools")).toBe("Azati");
    expect(companyNameFromSearchHit("AI services | Lab20T", "https://lab20t.ai/services")).toBe("Lab20T");
  });

  it("rejects generic rankings and directories before LLM analysis", () => {
    expect(searchHitIsUsable({
      title: "Top 10 AI Document Processing Companies",
      url: "https://vendor.example/blog/top-document-ai-companies",
      text: "A general comparison of document AI vendors.",
    })).toBe(false);
    expect(searchHitIsUsable({ title: "AI agencies", url: "https://clutch.co/ma/developers/artificial-intelligence", text: "Directory" })).toBe(false);
  });

  it("keeps editorial pages only when they contain a concrete business signal", () => {
    expect(searchHitIsUsable({
      title: "New AI delivery team",
      url: "https://example.ma/news/ai-expansion",
      text: "We are hiring AI engineers and seeking a partner for a funded project.",
    })).toBe(true);
  });
});
