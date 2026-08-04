import { NextResponse } from "next/server";
import { checkCodexStatus, codexEnabled } from "@/lib/codex";
import { activeLlmProvider, llmProviderConfigurations, modelForProvider } from "@/lib/llm";

export const dynamic = "force-dynamic";
export async function GET() {
  const codex = codexEnabled()
    ? await checkCodexStatus()
    : { available: false, authenticated: false, executable: "disabled", message: "Codex is disabled." };
  const active = activeLlmProvider();
  const providers = llmProviderConfigurations().map((provider) => provider.provider === "codex" ? {
    ...provider,
    configured: codex.authenticated,
    message: codex.authenticated
      ? `${provider.active ? "Active provider" : "Available"} · ${provider.model}`
      : codex.message,
  } : provider);
const exaConfigured = Boolean(process.env.EXA_API_KEY?.trim());
  const tavilyConfigured = Boolean(process.env.TAVILY_API_KEY?.trim());
  const discoverySearchConfigured = exaConfigured || tavilyConfigured;
  const enabled = (name: string) => process.env[name] !== "false";
  return NextResponse.json({
    llm: {
      active,
      model: modelForProvider(active),
      providers,
      fallbacks: (process.env.OPPORTUNITY_RADAR_LLM_FALLBACKS || "").split(",").map((item) => item.trim()).filter(Boolean),
    },
    codex,
    exa: {
      configured: exaConfigured,
      enabled: exaConfigured && process.env.OPPORTUNITY_RADAR_EXA_ENABLED !== "false",
      message: exaConfigured ? "Exa semantic discovery is configured." : "Add EXA_API_KEY to .env.local for wider discovery.",
    },
    franceNum: { configured: true, enabled: true, message: "Public open-data seed connector is available." },
    connectors: [
      { id: "exa", label: "Exa discovery", configured: exaConfigured, enabled: exaConfigured && enabled("OPPORTUNITY_RADAR_EXA_ENABLED"), message: exaConfigured ? "Semantic company discovery and ATS URL search are configured." : "Optional: add EXA_API_KEY for semantic discovery." },
      { id: "tavily", label: "Tavily discovery", configured: tavilyConfigured, enabled: tavilyConfigured && enabled("OPPORTUNITY_RADAR_TAVILY_ENABLED"), message: tavilyConfigured ? "Search and exact ATS-page discovery are configured." : "Optional: add TAVILY_API_KEY for a second independent web index." },
      { id: "boamp", label: "BOAMP France", configured: true, enabled: enabled("OPPORTUNITY_RADAR_BOAMP_ENABLED"), message: "Official French public-tender API; no key required." },
      { id: "ted", label: "TED Europe", configured: true, enabled: enabled("OPPORTUNITY_RADAR_TED_ENABLED"), message: "Official active European tender API; no key required." },
      { id: "france-num", label: "France Num", configured: true, enabled: true, message: "Official French provider open-data seed; no key required." },
      { id: "greenhouse", label: "Greenhouse jobs", configured: discoverySearchConfigured, enabled: discoverySearchConfigured && enabled("OPPORTUNITY_RADAR_ATS_ENABLED"), message: discoverySearchConfigured ? "Exact postings are discovered, then verified through Greenhouse public JSON." : "Requires Exa or Tavily to discover exact public posting URLs." },
      { id: "lever", label: "Lever jobs", configured: discoverySearchConfigured, enabled: discoverySearchConfigured && enabled("OPPORTUNITY_RADAR_ATS_ENABLED"), message: discoverySearchConfigured ? "Exact postings are discovered, then verified through Lever public JSON." : "Requires Exa or Tavily to discover exact public posting URLs." },
      { id: "firecrawl", label: "Firecrawl fallback", configured: Boolean(process.env.FIRECRAWL_API_KEY?.trim()), enabled: Boolean(process.env.FIRECRAWL_API_KEY?.trim()) && enabled("OPPORTUNITY_RADAR_FIRECRAWL_ENABLED"), message: process.env.FIRECRAWL_API_KEY?.trim() ? "Bounded extraction fallback with API key configured." : "Add a free FIRECRAWL_API_KEY; keyless access is blocked on this network." },
    ],
    storage: "Local SQLite",
  }, { headers: { "Cache-Control": "no-store" } });
}
